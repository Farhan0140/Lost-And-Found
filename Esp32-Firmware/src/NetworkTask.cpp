#include "NetworkTask.h"

#include <WiFi.h>
#include <esp_timer.h>
#include <time.h>

#include "Log.h"
#include "Shared.h"
#include "config.h"

namespace network {

	// ─────────────────────────────────────────────────────────
	//  State (only touched by the network task)
	// ─────────────────────────────────────────────────────────

	static const Settings *settings = nullptr;
	static ApiClient *api = nullptr;

	static bool clockSet = false;
	static bool helloDone = false;
	static uint32_t nextHelloAt = 0;

	static uint32_t lastWifiAttemptAt = 0;
	static bool wifiWasConnected = false;

	static uint32_t lastPollAt = 0;
	static uint32_t lastHeartbeatAt = 0;
	static uint32_t lastEventsAttemptAt = 0;

	static uint8_t failuresInARow = 0;

	// Commands already handed to the kiosk. The server repeats a command in every
	// /poll until it is acknowledged, so the same id must not be executed twice.
	static const uint8_t SEEN_COMMANDS = 16;
	static char seenCommandIds[SEEN_COMMANDS][40] = {};
	static uint8_t seenCommandNext = 0;

	// Acks that could not be sent yet (server unreachable).
	static const uint8_t PENDING_ACKS = 4;
	static CommandAck pendingAcks[PENDING_ACKS];
	static uint8_t pendingAckCount = 0;

	// How long to wait after a failed hello before trying again.
	static const uint32_t HELLO_RETRY_MS = 5000;
	static const uint32_t HELLO_RETRY_UNAUTHORIZED_MS = 30000;

	// After events failed to send, wait this long before the next try.
	static const uint32_t EVENTS_RETRY_MS = 3000;

	// ─────────────────────────────────────────────────────────
	//  Helpers
	// ─────────────────────────────────────────────────────────

	static bool due(uint32_t lastAt, uint32_t interval) {
		return millis() - lastAt >= interval;
	}

	/** Records the result of a request and updates the link state shown on the LCD. */
	static void noteResult(ApiResult result) {
		switch (result) {
			case ApiResult::Ok:
				failuresInARow = 0;

				if (helloDone) {
					shared::status.setLink(Link::Online);
				}
				break;

			case ApiResult::NotAuthorized:
				// Wrong ID / secret, or the device was disabled → say hello again later.
				helloDone = false;
				nextHelloAt = millis() + HELLO_RETRY_UNAUTHORIZED_MS;
				shared::status.setLink(Link::NotAuthorized);
				break;

			case ApiResult::NetworkError:
			case ApiResult::ServerError:
				if (failuresInARow < 255) {
					failuresInARow++;
				}

				if (failuresInARow >= OFFLINE_AFTER_FAILURES) {
					shared::status.setLink(Link::ServerDown);
				}
				break;
		}
	}

	bool syncClock(uint32_t timeoutMs) {
		// UTC is fine: only certificate dates depend on it.
		configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");

		const uint32_t startedAt = millis();

		while (millis() - startedAt < timeoutMs) {
			// Anything after 2024 means NTP answered.
			if (time(nullptr) > 1704067200) {
				LOG("NET", "clock set by NTP");

				return true;
			}

			vTaskDelay(pdMS_TO_TICKS(200));
		}

		LOG("NET", "NTP did not answer within %lu s", static_cast<unsigned long>(timeoutMs / 1000));

		return false;
	}

	ApiResult hello(ApiClient &client, JsonDocument &answer) {
		JsonDocument body;

		body["firmware"] = FIRMWARE_VERSION;
		body["bootId"] = shared::bootId;

		return client.post("/device/hello", body, answer);
	}

	// ─────────────────────────────────────────────────────────
	//  Steps
	// ─────────────────────────────────────────────────────────

	static bool ensureWifi() {
		if (WiFi.status() == WL_CONNECTED) {
			if (!wifiWasConnected) {
				wifiWasConnected = true;

				LOG("WIFI", "connected to \"%s\", IP %s, signal %d dBm",
					settings->wifiSsid.c_str(),
					WiFi.localIP().toString().c_str(),
					WiFi.RSSI());

				shared::status.setLink(helloDone ? Link::Online : Link::Connecting);
			}

			return true;
		}

		if (wifiWasConnected) {
			wifiWasConnected = false;

			LOG("WIFI", "connection lost");

			// The kept-alive TLS connection is dead now.
			api->disconnect();
		}

		shared::status.setLink(Link::NoWifi);

		if (lastWifiAttemptAt == 0 || due(lastWifiAttemptAt, WIFI_RETRY_MS)) {
			lastWifiAttemptAt = millis();

			LOG("WIFI", "connecting to \"%s\"…", settings->wifiSsid.c_str());

			WiFi.disconnect();
			WiFi.begin(settings->wifiSsid.c_str(), settings->wifiPassword.c_str());
		}

		return false;
	}

	static void sayHello() {
		if (static_cast<int32_t>(millis() - nextHelloAt) < 0) {
			return;
		}

		shared::status.setLink(shared::status.link() == Link::NotAuthorized ? Link::NotAuthorized : Link::Connecting);

		JsonDocument answer;
		const ApiResult result = hello(*api, answer);

		if (result != ApiResult::Ok) {
			LOG("NET", "hello failed: %s (%s)", apiResultName(result), api->lastError().c_str());

			if (result == ApiResult::NotAuthorized) {
				noteResult(result);
			} else {
				nextHelloAt = millis() + HELLO_RETRY_MS;
				noteResult(result);
			}

			return;
		}

		// Timings chosen by the server.
		Timings timings;

		timings.pollMs = answer["pollIntervalMs"] | DEFAULT_POLL_INTERVAL_MS;
		timings.heartbeatMs = answer["heartbeatIntervalMs"] | DEFAULT_HEARTBEAT_INTERVAL_MS;
		timings.doorWarningMs = answer["doorOpenWarningMs"] | DEFAULT_DOOR_WARNING_MS;
		timings.doorUnresolvedMs = answer["doorOpenUnresolvedMs"] | DEFAULT_DOOR_UNRESOLVED_MS;
		timings.settleMs = answer["settleMs"] | DEFAULT_SETTLE_MS;

		// Never poll faster than 4× a second, whatever the server says.
		if (timings.pollMs < 250) {
			timings.pollMs = 250;
		}

		shared::status.setTimings(timings);
		shared::status.setDeviceName(answer["name"] | "");

		// Locker labels for the LCD ("Locker A2 is open").
		for (JsonObject locker : answer["lockers"].as<JsonArray>()) {
			const uint8_t slot = locker["slot"] | 0;
			const char *label = locker["label"] | "";

			if (slot >= 1 && slot <= LOCKER_COUNT && label[0]) {
				shared::status.setLabel(slot, label);
			}

			LOG("NET", "  locker slot %u = %s (%s)", slot, label, locker["status"] | "?");
		}

		const size_t serverLockers = answer["lockers"].as<JsonArray>().size();

		if (serverLockers != LOCKER_COUNT) {
			LOG("NET", "the server has %u locker(s) for this device, the firmware drives %u",
				static_cast<unsigned>(serverLockers), LOCKER_COUNT);
		}

		LOG("NET", "hello ok — \"%s\", poll every %lu ms, heartbeat every %lu s",
			answer["name"] | "",
			static_cast<unsigned long>(timings.pollMs),
			static_cast<unsigned long>(timings.heartbeatMs / 1000));

		helloDone = true;
		failuresInARow = 0;
		lastHeartbeatAt = millis() - timings.heartbeatMs;   // send one straight away

		shared::status.setLink(Link::Online);
	}

	static void verifyCode(const VerifyRequest &request) {
		JsonDocument body;
		body["code"] = request.code;

		JsonDocument answer;
		const ApiResult result = api->post("/device/otp/verify", body, answer);

		VerifyResult verify;

		if (result != ApiResult::Ok) {
			LOG("NET", "verify failed: %s (%s)", apiResultName(result), api->lastError().c_str());

			verify.networkError = true;
		} else {
			verify.ok = answer["ok"] | false;
			strlcpy(verify.reason, answer["reason"] | "", sizeof(verify.reason));
			verify.slot = answer["slot"] | 0;
			strlcpy(verify.lockerLabel, answer["lockerLabel"] | "", sizeof(verify.lockerLabel));
			strlcpy(verify.action, answer["action"] | "", sizeof(verify.action));
			strlcpy(verify.sessionId, answer["sessionId"] | "", sizeof(verify.sessionId));
			verify.attemptsLeft = answer["attemptsLeft"] | -1;
			verify.lockedForSeconds = answer["lockedForSeconds"] | 0;

			if (verify.ok) {
				LOG("NET", "code ok → %s, slot %u (%s)", verify.action, verify.slot, verify.lockerLabel);
			} else {
				LOG("NET", "code refused: %s", verify.reason);
			}
		}

		noteResult(result);

		xQueueSend(shared::verifyResults, &verify, pdMS_TO_TICKS(100));
	}

	static void sendAcks() {
		// New acks from the kiosk go to the end of the pending list.
		CommandAck ack;

		while (pendingAckCount < PENDING_ACKS && xQueueReceive(shared::commandAcks, &ack, 0) == pdTRUE) {
			pendingAcks[pendingAckCount++] = ack;
		}

		while (pendingAckCount > 0) {
			const CommandAck &next = pendingAcks[0];

			JsonDocument body;
			body["ok"] = next.ok;
			body["message"] = next.message;

			char path[80];
			snprintf(path, sizeof(path), "/device/commands/%s/ack", next.id);

			JsonDocument answer;
			const ApiResult result = api->post(path, body, answer);

			noteResult(result);

			if (result == ApiResult::NetworkError) {
				return;   // keep it, try again next round
			}

			LOG("NET", "command %.8s… acknowledged (%s)", next.id, next.ok ? "done" : next.message);

			memmove(&pendingAcks[0], &pendingAcks[1], sizeof(CommandAck) * (pendingAckCount - 1));
			pendingAckCount--;
		}
	}

	static void sendEvents() {
		if (shared::events.size() == 0) {
			return;
		}

		if (lastEventsAttemptAt != 0 && !due(lastEventsAttemptAt, EVENTS_RETRY_MS) && failuresInARow > 0) {
			return;
		}

		lastEventsAttemptAt = millis();

		static DeviceEvent batch[EVENTS_PER_REQUEST];
		const uint8_t count = shared::events.peek(batch, EVENTS_PER_REQUEST);

		JsonDocument body;
		body["bootId"] = shared::bootId;

		JsonArray list = body["events"].to<JsonArray>();

		for (uint8_t index = 0; index < count; index++) {
			const DeviceEvent &event = batch[index];
			JsonObject item = list.add<JsonObject>();

			item["seq"] = event.seq;
			item["type"] = event.type;
			item["uptimeMs"] = event.uptimeMs;

			// The server rejects empty strings here — leave the fields out instead.
			if (event.slot > 0) {
				item["slot"] = event.slot;
			}

			if (event.sessionId[0]) {
				item["sessionId"] = event.sessionId;
			}

			if (event.data[0]) {
				item["data"] = serialized(event.data);
			}
		}

		JsonDocument answer;
		const ApiResult result = api->post("/device/events", body, answer);

		noteResult(result);

		if (result != ApiResult::Ok) {
			LOG("NET", "%u event(s) not sent: %s (%s)", count, apiResultName(result), api->lastError().c_str());

			return;
		}

		uint32_t acked[EVENTS_PER_REQUEST];
		uint8_t ackedCount = 0;

		for (JsonVariant seq : answer["acked"].as<JsonArray>()) {
			if (ackedCount < EVENTS_PER_REQUEST) {
				acked[ackedCount++] = seq.as<uint32_t>();
			}
		}

		shared::events.remove(acked, ackedCount);

		LOG("NET", "sent %u event(s), %u acknowledged, %u waiting", count, ackedCount, shared::events.size());
	}

	static bool alreadySeen(const char *id) {
		for (const auto &seen : seenCommandIds) {
			if (strcmp(seen, id) == 0) {
				return true;
			}
		}

		return false;
	}

	static void poll() {
		JsonDocument answer;
		const ApiResult result = api->get("/device/poll", answer);

		noteResult(result);

		if (result != ApiResult::Ok) {
			return;
		}

		shared::status.setKioskLockedFor(answer["kioskLockedForSeconds"] | 0);

		for (JsonObject command : answer["commands"].as<JsonArray>()) {
			const char *id = command["id"] | "";

			if (!id[0] || alreadySeen(id)) {
				continue;
			}

			DeviceCommand next;

			strlcpy(next.id, id, sizeof(next.id));
			strlcpy(next.type, command["type"] | "", sizeof(next.type));
			next.slot = command["slot"] | 0;

			if (xQueueSend(shared::commands, &next, 0) != pdTRUE) {
				// Kiosk busy — the server sends it again with the next poll.
				break;
			}

			LOG("NET", "command %s for slot %u (%.8s…)", next.type, next.slot, next.id);

			strlcpy(seenCommandIds[seenCommandNext], id, sizeof(seenCommandIds[0]));
			seenCommandNext = (seenCommandNext + 1) % SEEN_COMMANDS;
		}
	}

	static void heartbeat() {
		JsonDocument body;

		body["bootId"] = shared::bootId;
		body["uptimeMs"] = esp_timer_get_time() / 1000;
		body["rssi"] = WiFi.RSSI();
		body["freeHeap"] = ESP.getFreeHeap();
		body["firmware"] = FIRMWARE_VERSION;

		JsonArray list = body["lockers"].to<JsonArray>();

		for (uint8_t slot = 1; slot <= LOCKER_COUNT; slot++) {
			const LockerSnapshot snapshot = shared::status.snapshot(slot);
			JsonObject item = list.add<JsonObject>();

			item["slot"] = slot;
			item["doorClosed"] = snapshot.doorClosed;
			item["itemPresent"] = snapshot.itemPresent;
			item["servoLocked"] = snapshot.servoLocked;
		}

		JsonDocument answer;
		const ApiResult result = api->post("/device/heartbeat", body, answer);

		noteResult(result);

		if (result == ApiResult::Ok) {
			LOG("NET", "heartbeat ok (signal %d dBm, free heap %lu bytes, %u event(s) waiting)",
				WiFi.RSSI(),
				static_cast<unsigned long>(ESP.getFreeHeap()),
				shared::events.size());
		}
	}

	// ─────────────────────────────────────────────────────────
	//  Task
	// ─────────────────────────────────────────────────────────

	static void run(void *) {
		LOG("NET", "network task running on core %d", xPortGetCoreID());

		api = new ApiClient();
		api->configure(*settings);

		// The hostname has to be set before the Wi-Fi mode, or it is ignored.
		WiFi.setHostname(settings->deviceId.c_str());
		WiFi.mode(WIFI_STA);
		WiFi.setAutoReconnect(true);

		shared::status.setLink(Link::NoWifi);

		for (;;) {
			if (!ensureWifi()) {
				// Still answer typed codes, so the kiosk does not wait for nothing.
				VerifyRequest request;

				if (xQueueReceive(shared::verifyRequests, &request, pdMS_TO_TICKS(200)) == pdTRUE) {
					VerifyResult verify;
					verify.networkError = true;
					xQueueSend(shared::verifyResults, &verify, pdMS_TO_TICKS(100));
				}

				continue;
			}

			// HTTPS certificate checks need the real date.
			if (!clockSet && settings->serverUrl.startsWith("https://") && !settings->allowInsecure) {
				clockSet = syncClock(10000);

				if (!clockSet) {
					continue;
				}
			}

			if (!helloDone) {
				sayHello();

				if (!helloDone) {
					VerifyRequest request;

					if (xQueueReceive(shared::verifyRequests, &request, pdMS_TO_TICKS(200)) == pdTRUE) {
						VerifyResult verify;
						verify.networkError = true;
						xQueueSend(shared::verifyResults, &verify, pdMS_TO_TICKS(100));
					}

					continue;
				}
			}

			const Timings timings = shared::status.timings();

			// 1. A person is waiting at the keypad — always first.
			VerifyRequest request;

			if (xQueueReceive(shared::verifyRequests, &request, 0) == pdTRUE) {
				verifyCode(request);
			}

			// 2. Results of staff commands.
			sendAcks();

			// 3. Door / sensor events (the server needs these to finish deposits / collections).
			sendEvents();

			// 4. Commands + keypad lock.
			if (due(lastPollAt, timings.pollMs)) {
				lastPollAt = millis();
				poll();
			}

			// 5. "Still alive" + sensor readings.
			if (helloDone && due(lastHeartbeatAt, timings.heartbeatMs)) {
				lastHeartbeatAt = millis();
				heartbeat();
			}

			// Sleep until a code is typed (or 50 ms pass), so the keypad feels instant.
			if (xQueueReceive(shared::verifyRequests, &request, pdMS_TO_TICKS(50)) == pdTRUE) {
				verifyCode(request);
			}
		}
	}

	void start(const Settings &value) {
		settings = &value;

		// TLS handshakes need a big stack.
		xTaskCreatePinnedToCore(run, "network", 20 * 1024, nullptr, 1, nullptr, 0);
	}
}
