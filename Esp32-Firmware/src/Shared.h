/**
 * What the two halves of the firmware share.
 *
 *   Core 1 — hardware loop (main.cpp loop):  keypad, LCD, buzzer, door + IR sensors, servos
 *   Core 0 — network task (NetworkTask.cpp): Wi-Fi, /device/... requests
 *
 * They never call each other directly. They talk through:
 *
 *   verifyRequests   hardware → network   a 6-digit code typed on the keypad
 *   verifyResults    network → hardware   what the server said about that code
 *   commands         network → hardware   admin commands from /poll (force_open)
 *   commandAcks      hardware → network   "done" / "failed" for a command
 *   events           hardware → network   door / servo / sensor events to report
 *   status           both                 link state, timings, locker labels, sensor snapshot
 *
 * So a slow server request never freezes the keypad or a door.
 */

#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>

#include "config.h"

// ─────────────────────────────────────────────────────────────
//  Messages
// ─────────────────────────────────────────────────────────────

struct VerifyRequest {
	char code[8];
};

struct VerifyResult {
	bool ok = false;
	bool networkError = false;      // the server could not be reached
	char reason[16] = "";           // INVALID · EXPIRED · LOCKED · LOCKER_BUSY
	uint8_t slot = 0;               // 1-based
	char lockerLabel[8] = "";
	char action[12] = "";           // deposit · collect
	char sessionId[40] = "";
	int attemptsLeft = -1;          // -1 = unknown
	int lockedForSeconds = 0;
};

struct DeviceCommand {
	char id[40];
	char type[20];                  // force_open
	uint8_t slot;
};

struct CommandAck {
	char id[40];
	bool ok;
	char message[64];
};

// ─────────────────────────────────────────────────────────────
//  Event queue (hardware → server), re-sendable
// ─────────────────────────────────────────────────────────────

struct DeviceEvent {
	uint32_t seq;                   // unique per boot; the server ignores repeats
	char type[24];                  // door_opened, locked, door_closed_settled, …
	uint8_t slot;                   // 0 = not about one locker
	char sessionId[40];
	uint64_t uptimeMs;
	char data[256];                 // a JSON object, e.g. {"itemPresent":true}; "" = none
};

class EventQueue {
public:
	void begin();

	/** Adds an event (drops the oldest one if the queue is full). Thread-safe. */
	void push(const char *type, uint8_t slot, const char *sessionId = nullptr, const char *dataJson = nullptr);

	/** Copies up to `max` of the oldest events into `out`. Returns how many. */
	uint8_t peek(DeviceEvent *out, uint8_t max);

	/** Removes the events the server acknowledged. */
	void remove(const uint32_t *seqs, uint8_t count);

	uint8_t size();
	uint32_t dropped() const { return droppedCount; }

private:
	DeviceEvent items[EVENT_QUEUE_SIZE];
	uint8_t count = 0;
	uint32_t nextSeq = 1;
	uint32_t droppedCount = 0;
	SemaphoreHandle_t lock = nullptr;
};

// ─────────────────────────────────────────────────────────────
//  Status
// ─────────────────────────────────────────────────────────────

enum class Link : uint8_t {
	NotConfigured,
	NoWifi,
	Connecting,      // Wi-Fi up, waiting for /device/hello
	Online,
	ServerDown,      // several requests in a row failed
	NotAuthorized,   // wrong ID / secret, unknown or disabled device
};

const char *linkName(Link link);

struct Timings {
	uint32_t pollMs = DEFAULT_POLL_INTERVAL_MS;
	uint32_t heartbeatMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
	uint32_t doorWarningMs = DEFAULT_DOOR_WARNING_MS;
	uint32_t doorUnresolvedMs = DEFAULT_DOOR_UNRESOLVED_MS;
	uint32_t settleMs = DEFAULT_SETTLE_MS;
};

struct LockerSnapshot {
	bool doorClosed = true;
	bool itemPresent = false;
	bool servoLocked = true;
};

class SharedStatus {
public:
	void begin();

	void setLink(Link value);
	Link link();

	void setTimings(const Timings &value);
	Timings timings();

	/** Kiosk keypad lock (too many wrong codes), in seconds from now. */
	void setKioskLockedFor(uint32_t seconds);
	uint32_t kioskLockedForSeconds();

	void setLabel(uint8_t slot, const char *label);
	void label(uint8_t slot, char *out, size_t size);

	void setSnapshot(uint8_t slot, const LockerSnapshot &value);
	LockerSnapshot snapshot(uint8_t slot);

	void setDeviceName(const char *name);
	void deviceName(char *out, size_t size);

private:
	SemaphoreHandle_t lock = nullptr;

	Link currentLink = Link::NotConfigured;
	Timings currentTimings;
	uint32_t kioskLockedUntil = 0;   // millis()
	char labels[LOCKER_COUNT][8] = {};
	LockerSnapshot snapshots[LOCKER_COUNT];
	char name[48] = "";
};

// ─────────────────────────────────────────────────────────────
//  The shared objects (defined in Shared.cpp)
// ─────────────────────────────────────────────────────────────

namespace shared {
	extern QueueHandle_t verifyRequests;   // VerifyRequest
	extern QueueHandle_t verifyResults;    // VerifyResult
	extern QueueHandle_t commands;         // DeviceCommand
	extern QueueHandle_t commandAcks;      // CommandAck

	extern EventQueue events;
	extern SharedStatus status;

	extern char bootId[12];

	void begin();
}
