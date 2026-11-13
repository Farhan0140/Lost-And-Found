#include "Shared.h"

#include <esp_random.h>
#include <esp_timer.h>

#include "Log.h"

namespace shared {
	QueueHandle_t verifyRequests = nullptr;
	QueueHandle_t verifyResults = nullptr;
	QueueHandle_t commands = nullptr;
	QueueHandle_t commandAcks = nullptr;

	EventQueue events;
	SharedStatus status;

	char bootId[12] = "";

	void begin() {
		verifyRequests = xQueueCreate(2, sizeof(VerifyRequest));
		verifyResults = xQueueCreate(2, sizeof(VerifyResult));
		commands = xQueueCreate(4, sizeof(DeviceCommand));
		commandAcks = xQueueCreate(4, sizeof(CommandAck));

		events.begin();
		status.begin();

		// A new id every boot: together with `seq` it makes every event unique on the server.
		snprintf(bootId, sizeof(bootId), "%08lx", static_cast<unsigned long>(esp_random()));

		LOG("BOOT", "boot id %s", bootId);
	}
}

// ─────────────────────────────────────────────────────────────
//  EventQueue
// ─────────────────────────────────────────────────────────────

void EventQueue::begin() {
	lock = xSemaphoreCreateMutex();
}

void EventQueue::push(const char *type, uint8_t slot, const char *sessionId, const char *dataJson) {
	xSemaphoreTake(lock, portMAX_DELAY);

	if (count == EVENT_QUEUE_SIZE) {
		// Full (server unreachable for a long time): drop the oldest event.
		memmove(&items[0], &items[1], sizeof(DeviceEvent) * (EVENT_QUEUE_SIZE - 1));
		count--;
		droppedCount++;
	}

	DeviceEvent &event = items[count++];

	event.seq = nextSeq++;
	strlcpy(event.type, type, sizeof(event.type));
	event.slot = slot;
	strlcpy(event.sessionId, sessionId ? sessionId : "", sizeof(event.sessionId));
	event.uptimeMs = esp_timer_get_time() / 1000;
	strlcpy(event.data, dataJson ? dataJson : "", sizeof(event.data));

	const uint32_t seq = event.seq;

	xSemaphoreGive(lock);

	if (slot > 0) {
		LOG("EVENT", "#%lu %s (slot %u)%s%s", static_cast<unsigned long>(seq), type, slot,
			dataJson ? " " : "", dataJson ? dataJson : "");
	} else {
		LOG("EVENT", "#%lu %s", static_cast<unsigned long>(seq), type);
	}
}

uint8_t EventQueue::peek(DeviceEvent *out, uint8_t max) {
	xSemaphoreTake(lock, portMAX_DELAY);

	const uint8_t taken = count < max ? count : max;

	memcpy(out, items, sizeof(DeviceEvent) * taken);

	xSemaphoreGive(lock);

	return taken;
}

void EventQueue::remove(const uint32_t *seqs, uint8_t seqCount) {
	xSemaphoreTake(lock, portMAX_DELAY);

	uint8_t kept = 0;

	for (uint8_t index = 0; index < count; index++) {
		bool acked = false;

		for (uint8_t ack = 0; ack < seqCount; ack++) {
			if (items[index].seq == seqs[ack]) {
				acked = true;
				break;
			}
		}

		if (!acked) {
			if (kept != index) {
				items[kept] = items[index];
			}

			kept++;
		}
	}

	count = kept;

	xSemaphoreGive(lock);
}

uint8_t EventQueue::size() {
	xSemaphoreTake(lock, portMAX_DELAY);

	const uint8_t value = count;

	xSemaphoreGive(lock);

	return value;
}

// ─────────────────────────────────────────────────────────────
//  SharedStatus
// ─────────────────────────────────────────────────────────────

const char *linkName(Link link) {
	switch (link) {
		case Link::NotConfigured:
			return "not configured";
		case Link::NoWifi:
			return "no Wi-Fi";
		case Link::Connecting:
			return "connecting";
		case Link::Online:
			return "online";
		case Link::ServerDown:
			return "server offline";
		case Link::NotAuthorized:
			return "not authorized";
	}

	return "?";
}

void SharedStatus::begin() {
	lock = xSemaphoreCreateMutex();

	for (uint8_t index = 0; index < LOCKER_COUNT; index++) {
		snprintf(labels[index], sizeof(labels[index]), "L%u", index + 1);
	}
}

void SharedStatus::setLink(Link value) {
	xSemaphoreTake(lock, portMAX_DELAY);

	const Link previous = currentLink;
	currentLink = value;

	xSemaphoreGive(lock);

	if (previous != value) {
		LOG("NET", "link: %s → %s", linkName(previous), linkName(value));
	}
}

Link SharedStatus::link() {
	xSemaphoreTake(lock, portMAX_DELAY);

	const Link value = currentLink;

	xSemaphoreGive(lock);

	return value;
}

void SharedStatus::setTimings(const Timings &value) {
	xSemaphoreTake(lock, portMAX_DELAY);
	currentTimings = value;
	xSemaphoreGive(lock);
}

Timings SharedStatus::timings() {
	xSemaphoreTake(lock, portMAX_DELAY);

	const Timings value = currentTimings;

	xSemaphoreGive(lock);

	return value;
}

void SharedStatus::setKioskLockedFor(uint32_t seconds) {
	xSemaphoreTake(lock, portMAX_DELAY);
	kioskLockedUntil = seconds > 0 ? millis() + seconds * 1000 : 0;
	xSemaphoreGive(lock);
}

uint32_t SharedStatus::kioskLockedForSeconds() {
	xSemaphoreTake(lock, portMAX_DELAY);

	const uint32_t until = kioskLockedUntil;

	xSemaphoreGive(lock);

	if (until == 0) {
		return 0;
	}

	const int32_t left = static_cast<int32_t>(until - millis());

	return left > 0 ? (left + 999) / 1000 : 0;
}

void SharedStatus::setLabel(uint8_t slot, const char *value) {
	if (slot < 1 || slot > LOCKER_COUNT) {
		return;
	}

	xSemaphoreTake(lock, portMAX_DELAY);
	strlcpy(labels[slot - 1], value, sizeof(labels[0]));
	xSemaphoreGive(lock);
}

void SharedStatus::label(uint8_t slot, char *out, size_t size) {
	if (slot < 1 || slot > LOCKER_COUNT) {
		strlcpy(out, "?", size);
		return;
	}

	xSemaphoreTake(lock, portMAX_DELAY);
	strlcpy(out, labels[slot - 1], size);
	xSemaphoreGive(lock);
}

void SharedStatus::setSnapshot(uint8_t slot, const LockerSnapshot &value) {
	if (slot < 1 || slot > LOCKER_COUNT) {
		return;
	}

	xSemaphoreTake(lock, portMAX_DELAY);
	snapshots[slot - 1] = value;
	xSemaphoreGive(lock);
}

LockerSnapshot SharedStatus::snapshot(uint8_t slot) {
	LockerSnapshot value;

	if (slot < 1 || slot > LOCKER_COUNT) {
		return value;
	}

	xSemaphoreTake(lock, portMAX_DELAY);
	value = snapshots[slot - 1];
	xSemaphoreGive(lock);

	return value;
}

void SharedStatus::setDeviceName(const char *value) {
	xSemaphoreTake(lock, portMAX_DELAY);
	strlcpy(name, value, sizeof(name));
	xSemaphoreGive(lock);
}

void SharedStatus::deviceName(char *out, size_t size) {
	xSemaphoreTake(lock, portMAX_DELAY);
	strlcpy(out, name, size);
	xSemaphoreGive(lock);
}
