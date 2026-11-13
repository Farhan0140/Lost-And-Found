/**
 * The four lockers: door switch, IR sensor and bolt servo, each with its own state machine.
 *
 *   LOCKED ──unlock()──▶ UNLOCKED ──door opens──▶ OPEN ──door closes──▶ CLOSING
 *     ▲                     │                       ▲                       │
 *     │          (20 s, door never opened)           └────door opens again───┤
 *     │                     ▼                                               │ closed 0.8 s
 *     └───── settled ── SETTLING ◀────────────── bolt slides back ◀─────────┘
 *
 *   SETTLING waits until the IR reading has been stable for `settleMs` (3 s) and then
 *   reports `door_closed_settled { itemPresent }`. The SERVER decides from that whether
 *   a deposit worked or an item was collected — the firmware only reports what it sees.
 *
 *   While OPEN: after `doorWarningMs` (45 s) the kiosk beeps; after `doorUnresolvedMs`
 *   (60 s) `door_open_too_long` is reported and staff have to look at it.
 *
 * Every sensor change is also reported as a raw event (door_opened, item_detected, …).
 * Only the hardware loop (core 1) calls these methods.
 */

#pragma once

#include <Arduino.h>

#include "config.h"

enum class LockerState : uint8_t {
	Locked,
	Unlocked,   // bolt open, waiting for the door to be opened
	Open,       // door open
	Closing,    // door closed, waiting a moment before the bolt slides back
	Settling,   // bolt locked, waiting for a stable IR reading
};

const char *lockerStateName(LockerState state);

class Lockers {
public:
	/** Sets up pins + servo driver, puts every locker in a safe state, reports a `boot` event. */
	void begin();

	/** Call every loop: reads sensors, runs the state machines, switches servos off. */
	void update();

	/**
	 * Opens the bolt of `slot` (1-based).
	 * `sessionId` is the server's session (may be null for staff commands).
	 * Returns false (with `message`) when the locker cannot be opened right now.
	 */
	bool unlock(uint8_t slot, const char *sessionId, char *message, size_t messageSize);

	/** Setup portal: move a servo without touching the state machine. */
	void testServo(uint8_t slot, bool unlocked);

	bool servoDriverFound() const { return driverFound; }

	// ── what the kiosk shows ─────────────────────────────────

	LockerState state(uint8_t slot) const;
	bool doorClosed(uint8_t slot) const;
	bool itemPresent(uint8_t slot) const;
	bool servoLocked(uint8_t slot) const;

	/** True while a door has been open longer than the warning time. */
	bool anyDoorWarning() const;

	/** Writes e.g. "L1 L3" (server labels) of the lockers whose door is open. "" = none. */
	void openDoorLabels(char *out, size_t size) const;

private:
	struct Input {
		uint8_t pin = 0;
		int activeLevel = LOW;
		uint32_t debounceMs = 0;

		bool stable = false;        // debounced value (true = active)
		bool lastRaw = false;
		uint32_t rawChangedAt = 0;

		/** Returns true when the debounced value changed. */
		bool update(uint32_t now);
		bool readRaw() const;
	};

	struct Locker {
		uint8_t slot = 0;           // 1-based
		uint8_t servoChannel = 0;

		Input door;                 // active = door CLOSED
		Input ir;                   // active = item PRESENT

		LockerState state = LockerState::Locked;
		uint32_t stateSince = 0;

		bool servoLocked = true;
		uint32_t servoMovedAt = 0;
		bool servoPowered = false;

		char sessionId[40] = "";

		uint32_t openedAt = 0;      // when the door opened (keeps counting across CLOSING bounces)
		bool warned = false;
		bool reportedTooLong = false;

		uint32_t irStableSince = 0;
	};

	Locker lockers[LOCKER_COUNT];
	bool driverFound = false;

	Locker *find(uint8_t slot);
	const Locker *find(uint8_t slot) const;

	void enter(Locker &locker, LockerState next);
	void moveServo(Locker &locker, bool locked);
	void lockAndSettle(Locker &locker);
	void reportSettled(Locker &locker);
	void publishSnapshot(const Locker &locker);

	void updateLocker(Locker &locker, uint32_t now);
};

extern Lockers lockers;
