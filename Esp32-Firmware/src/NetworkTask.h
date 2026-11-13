/**
 * Everything that talks to Wi-Fi and the server. Runs as its own FreeRTOS task on core 0.
 *
 * Loop, roughly every 50 ms:
 *
 *   1. Wi-Fi down?           → reconnect every 10 s (link "No Wi-Fi")
 *   2. clock not set?        → NTP (HTTPS certificates need the date)
 *   3. not said hello yet?   → POST /device/hello (timings, locker labels)
 *   4. a code was typed?     → POST /device/otp/verify, answer to the kiosk   (first: a person waits)
 *   5. command finished?     → POST /device/commands/:id/ack
 *   6. events waiting?       → POST /device/events (batches of 12, removed once acknowledged)
 *   7. every 1 s             → GET  /device/poll (staff commands, keypad lock)
 *   8. every 30 s            → POST /device/heartbeat (uptime, Wi-Fi signal, sensors)
 */

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "ApiClient.h"
#include "Settings.h"

namespace network {
	/** Starts the task (pinned to core 0). `settings` must stay valid. */
	void start(const Settings &settings);

	/** Waits until the clock is set by NTP. Returns false after `timeoutMs`. */
	bool syncClock(uint32_t timeoutMs);

	/** POST /device/hello. Used by the task and by the setup portal's "check connection". */
	ApiResult hello(ApiClient &api, JsonDocument &answer);
}
