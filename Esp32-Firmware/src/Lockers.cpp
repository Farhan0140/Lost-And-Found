#include "Lockers.h"

#include <Adafruit_PWMServoDriver.h>
#include <Wire.h>

#include "Log.h"
#include "Shared.h"

Lockers lockers;

static Adafruit_PWMServoDriver servoDriver(PCA9685_ADDRESS, Wire);

const char *lockerStateName(LockerState state) {
	switch (state) {
		case LockerState::Locked:
			return "LOCKED";
		case LockerState::Unlocked:
			return "UNLOCKED";
		case LockerState::Open:
			return "OPEN";
		case LockerState::Closing:
			return "CLOSING";
		case LockerState::Settling:
			return "SETTLING";
	}

	return "?";
}

// ─────────────────────────────────────────────────────────────
//  Debounced input
// ─────────────────────────────────────────────────────────────

bool Lockers::Input::readRaw() const {
	return digitalRead(pin) == activeLevel;
}

bool Lockers::Input::update(uint32_t now) {
	const bool raw = readRaw();

	if (raw != lastRaw) {
		lastRaw = raw;
		rawChangedAt = now;
	}

	if (raw != stable && now - rawChangedAt >= debounceMs) {
		stable = raw;

		return true;
	}

	return false;
}

// ─────────────────────────────────────────────────────────────
//  Setup
// ─────────────────────────────────────────────────────────────

void Lockers::begin() {
	Wire.beginTransmission(PCA9685_ADDRESS);
	driverFound = Wire.endTransmission() == 0;

	if (driverFound) {
		servoDriver.begin();
		servoDriver.setOscillatorFrequency(27000000);
		servoDriver.setPWMFreq(50);

		LOG("LOCKER", "PCA9685 servo driver found at 0x%02X", PCA9685_ADDRESS);
	} else {
		LOG("LOCKER", "PCA9685 NOT found at 0x%02X — servos will not move", PCA9685_ADDRESS);
	}

	const uint32_t now = millis();

	for (uint8_t index = 0; index < LOCKER_COUNT; index++) {
		Locker &locker = lockers[index];

		locker.slot = index + 1;
		locker.servoChannel = SERVO_CHANNELS[index];

		// Door switch to GND → internal pull-up.
		// IR: plain input, the module drives the pin (GPIO 34–39 have no pull-ups anyway).
		pinMode(DOOR_PINS[index], INPUT_PULLUP);
		pinMode(IR_PINS[index], INPUT);

		locker.door.pin = DOOR_PINS[index];
		locker.door.activeLevel = DOOR_CLOSED_LEVEL;
		locker.door.debounceMs = DOOR_DEBOUNCE_MS;

		locker.ir.pin = IR_PINS[index];
		locker.ir.activeLevel = IR_ITEM_PRESENT_LEVEL;
		locker.ir.debounceMs = IR_DEBOUNCE_MS;
	}

	// Let the pull-ups settle, then take the starting readings without debouncing.
	delay(20);

	for (Locker &locker : lockers) {
		locker.door.stable = locker.door.lastRaw = locker.door.readRaw();
		locker.ir.stable = locker.ir.lastRaw = locker.ir.readRaw();
		locker.door.rawChangedAt = locker.ir.rawChangedAt = now;
		locker.irStableSince = now;

		if (locker.door.stable) {
			// Door closed → safe state is LOCKED.
			moveServo(locker, true);
			enter(locker, LockerState::Locked);
		} else {
			// Door open (power cut while open?) → keep the bolt out of the way so the door
			// can be closed; it locks as soon as it is.
			moveServo(locker, false);
			locker.openedAt = now;
			enter(locker, LockerState::Open);
		}

		publishSnapshot(locker);

		LOG("LOCKER", "slot %u: door %s, %s → %s", locker.slot,
			locker.door.stable ? "closed" : "OPEN",
			locker.ir.stable ? "item present" : "empty",
			lockerStateName(locker.state));
	}

	// Tell the server what we see after a (re)boot — it reconciles any session left open.
	char data[256];
	size_t used = snprintf(data, sizeof(data), "{\"firmware\":\"%s\",\"lockers\":[", FIRMWARE_VERSION);

	for (uint8_t index = 0; index < LOCKER_COUNT; index++) {
		const Locker &locker = lockers[index];

		used += snprintf(data + used, sizeof(data) - used,
			"%s{\"slot\":%u,\"doorClosed\":%s,\"itemPresent\":%s}",
			index > 0 ? "," : "",
			locker.slot,
			locker.door.stable ? "true" : "false",
			locker.ir.stable ? "true" : "false");
	}

	snprintf(data + used, sizeof(data) - used, "]}");

	shared::events.push("boot", 0, nullptr, data);

	if (!driverFound) {
		shared::events.push("error", 0, nullptr, "{\"message\":\"PCA9685 servo driver not found\"}");
	}
}

// ─────────────────────────────────────────────────────────────
//  Loop
// ─────────────────────────────────────────────────────────────

void Lockers::update() {
	const uint32_t now = millis();

	for (Locker &locker : lockers) {
		updateLocker(locker, now);

		// Switch the servo signal off once it has had time to move (SG90s buzz otherwise).
		if (SERVO_RELEASE_AFTER_MOVE && locker.servoPowered && now - locker.servoMovedAt >= SERVO_MOVE_MS) {
			if (driverFound) {
				servoDriver.setPWM(locker.servoChannel, 0, 4096);   // 4096 = fully off
			}

			locker.servoPowered = false;
		}
	}
}

void Lockers::updateLocker(Locker &locker, uint32_t now) {
	const Timings timings = shared::status.timings();

	// ── raw sensor events ────────────────────────────────────

	if (locker.door.update(now)) {
		shared::events.push(locker.door.stable ? "door_closed" : "door_opened", locker.slot, locker.sessionId);
		publishSnapshot(locker);
	}

	if (locker.ir.update(now)) {
		shared::events.push(locker.ir.stable ? "item_detected" : "item_removed", locker.slot, locker.sessionId);
		locker.irStableSince = now;
		publishSnapshot(locker);
	}

	const bool doorClosed = locker.door.stable;
	const uint32_t inState = now - locker.stateSince;

	// ── state machine ────────────────────────────────────────

	switch (locker.state) {
		case LockerState::Locked:
			// Door opened although the bolt is locked (forced, or bolt not engaged).
			// Treat it like any open door so it is warned about and re-locked.
			if (!doorClosed) {
				LOG("LOCKER", "slot %u: door opened while LOCKED", locker.slot);

				locker.openedAt = now;
				enter(locker, LockerState::Open);
			}
			break;

		case LockerState::Unlocked:
			if (!doorClosed) {
				locker.openedAt = now;
				enter(locker, LockerState::Open);
			} else if (inState >= UNLOCK_WINDOW_MS) {
				LOG("LOCKER", "slot %u: door was not opened within %lu s — locking again",
					locker.slot, static_cast<unsigned long>(UNLOCK_WINDOW_MS / 1000));

				lockAndSettle(locker);
			}
			break;

		case LockerState::Open: {
			const uint32_t openFor = now - locker.openedAt;

			if (!locker.warned && openFor >= timings.doorWarningMs) {
				locker.warned = true;

				LOG("LOCKER", "slot %u: door open for %lu s — warning", locker.slot,
					static_cast<unsigned long>(openFor / 1000));
			}

			if (!locker.reportedTooLong && openFor >= timings.doorUnresolvedMs) {
				locker.reportedTooLong = true;

				char data[32];
				snprintf(data, sizeof(data), "{\"seconds\":%lu}", static_cast<unsigned long>(openFor / 1000));

				shared::events.push("door_open_too_long", locker.slot, locker.sessionId, data);
			}

			if (doorClosed) {
				locker.closedAt = now;
				enter(locker, LockerState::Closing);
			}
			break;
		}

		case LockerState::Closing:
			if (!doorClosed) {
				// Bounced open again: back to OPEN, the open timer keeps running.
				enter(locker, LockerState::Open);
			} else if (inState >= CLOSE_BEFORE_LOCK_MS) {
				lockAndSettle(locker);
			}
			break;

		case LockerState::Settling:
			if (!doorClosed) {
				// Should not happen with the bolt locked — treat as an open door.
				locker.openedAt = now;
				enter(locker, LockerState::Open);
			} else if (now - locker.closedAt >= timings.settleMs && now - locker.irStableSince >= timings.settleMs) {
				// Door shut for settleMs and the IR has not changed meanwhile → report it.
				// Counting from the close (not from the bolt) saves ~0.8 s per deposit.
				reportSettled(locker);
			}
			break;
	}
}

// ─────────────────────────────────────────────────────────────
//  Actions
// ─────────────────────────────────────────────────────────────

bool Lockers::unlock(uint8_t slot, const char *sessionId, char *message, size_t messageSize) {
	Locker *locker = find(slot);

	if (!locker) {
		snprintf(message, messageSize, "slot %u does not exist on this kiosk", slot);

		return false;
	}

	switch (locker->state) {
		case LockerState::Settling:
			// Door is closed and locked; finish the old cycle first so the server sees it.
			reportSettled(*locker);
			break;

		case LockerState::Locked:
			break;

		case LockerState::Unlocked:
		case LockerState::Open:
		case LockerState::Closing:
			// Already open — nothing to do, but the new session takes over.
			strlcpy(locker->sessionId, sessionId ? sessionId : "", sizeof(locker->sessionId));
			snprintf(message, messageSize, "already open");

			return true;
	}

	if (!driverFound) {
		snprintf(message, messageSize, "servo driver not found");
		shared::events.push("error", slot, sessionId, "{\"message\":\"unlock failed: servo driver not found\"}");

		return false;
	}

	strlcpy(locker->sessionId, sessionId ? sessionId : "", sizeof(locker->sessionId));

	moveServo(*locker, false);
	enter(*locker, LockerState::Unlocked);

	shared::events.push("unlocked", slot, locker->sessionId);
	publishSnapshot(*locker);

	snprintf(message, messageSize, "unlocked");

	return true;
}

void Lockers::testServo(uint8_t slot, bool unlocked) {
	Locker *locker = find(slot);

	if (!locker) {
		return;
	}

	LOG("LOCKER", "slot %u: servo test → %s", slot, unlocked ? "unlocked" : "locked");

	moveServo(*locker, !unlocked);
	publishSnapshot(*locker);
}

void Lockers::lockAndSettle(Locker &locker) {
	moveServo(locker, true);

	shared::events.push("locked", locker.slot, locker.sessionId);

	// Coming from UNLOCKED (door never opened): there was no close, so start the settle time now.
	// Coming from CLOSING: closedAt is already set, the settle time is partly over.
	if (locker.state != LockerState::Closing) {
		locker.closedAt = millis();
	}

	enter(locker, LockerState::Settling);
	publishSnapshot(locker);
}

void Lockers::reportSettled(Locker &locker) {
	char data[32];
	snprintf(data, sizeof(data), "{\"itemPresent\":%s}", locker.ir.stable ? "true" : "false");

	shared::events.push("door_closed_settled", locker.slot, locker.sessionId, data);

	locker.sessionId[0] = '\0';
	enter(locker, LockerState::Locked);
}

void Lockers::enter(Locker &locker, LockerState next) {
	if (locker.state != next) {
		LOG("LOCKER", "slot %u: %s → %s", locker.slot, lockerStateName(locker.state), lockerStateName(next));
	}

	// Leaving the open phase for good: reset the open-door warnings.
	if (next == LockerState::Locked || next == LockerState::Unlocked) {
		locker.warned = false;
		locker.reportedTooLong = false;
	}

	locker.state = next;
	locker.stateSince = millis();
}

void Lockers::moveServo(Locker &locker, bool locked) {
	const uint8_t angle = locked ? SERVO_LOCKED_ANGLE : SERVO_UNLOCKED_ANGLE;
	const uint16_t pulse = SERVO_MIN_US + (static_cast<uint32_t>(SERVO_MAX_US - SERVO_MIN_US) * angle) / 180;

	if (driverFound) {
		servoDriver.writeMicroseconds(locker.servoChannel, pulse);
	}

	locker.servoLocked = locked;
	locker.servoPowered = true;
	locker.servoMovedAt = millis();
}

void Lockers::publishSnapshot(const Locker &locker) {
	LockerSnapshot snapshot;

	snapshot.doorClosed = locker.door.stable;
	snapshot.itemPresent = locker.ir.stable;
	snapshot.servoLocked = locker.servoLocked;

	shared::status.setSnapshot(locker.slot, snapshot);
}

// ─────────────────────────────────────────────────────────────
//  Queries
// ─────────────────────────────────────────────────────────────

Lockers::Locker *Lockers::find(uint8_t slot) {
	if (slot < 1 || slot > LOCKER_COUNT) {
		return nullptr;
	}

	return &lockers[slot - 1];
}

const Lockers::Locker *Lockers::find(uint8_t slot) const {
	if (slot < 1 || slot > LOCKER_COUNT) {
		return nullptr;
	}

	return &lockers[slot - 1];
}

LockerState Lockers::state(uint8_t slot) const {
	const Locker *locker = find(slot);

	return locker ? locker->state : LockerState::Locked;
}

bool Lockers::doorClosed(uint8_t slot) const {
	const Locker *locker = find(slot);

	return locker ? locker->door.stable : true;
}

bool Lockers::itemPresent(uint8_t slot) const {
	const Locker *locker = find(slot);

	return locker ? locker->ir.stable : false;
}

bool Lockers::servoLocked(uint8_t slot) const {
	const Locker *locker = find(slot);

	return locker ? locker->servoLocked : true;
}

bool Lockers::anyDoorWarning() const {
	for (const Locker &locker : lockers) {
		if (locker.warned && (locker.state == LockerState::Open || locker.state == LockerState::Closing)) {
			return true;
		}
	}

	return false;
}

void Lockers::openDoorLabels(char *out, size_t size) const {
	out[0] = '\0';

	size_t used = 0;

	for (const Locker &locker : lockers) {
		if (locker.door.stable) {
			continue;
		}

		char label[8];
		shared::status.label(locker.slot, label, sizeof(label));

		used += snprintf(out + used, size > used ? size - used : 0, "%s%s", used > 0 ? " " : "", label);

		if (used >= size) {
			break;
		}
	}
}
