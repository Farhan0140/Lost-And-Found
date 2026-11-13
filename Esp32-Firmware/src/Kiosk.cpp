#include "Kiosk.h"

#include <Keypad.h>

#include "Buzzer.h"
#include "Display.h"
#include "Lockers.h"
#include "Log.h"
#include "Shared.h"
#include "config.h"

Kiosk kiosk;

// ─────────────────────────────────────────────────────────────
//  Keypad (3 columns × 4 rows)
// ─────────────────────────────────────────────────────────────

static char KEYS[4][3] = {
	{'1', '2', '3'},
	{'4', '5', '6'},
	{'7', '8', '9'},
	{'*', '0', '#'},
};

// The Keypad library wants non-const byte arrays.
static byte rowPins[4] = {KEYPAD_ROW_PINS[0], KEYPAD_ROW_PINS[1], KEYPAD_ROW_PINS[2], KEYPAD_ROW_PINS[3]};
static byte columnPins[3] = {KEYPAD_COLUMN_PINS[0], KEYPAD_COLUMN_PINS[1], KEYPAD_COLUMN_PINS[2]};

static Keypad keypad(makeKeymap(KEYS), rowPins, columnPins, 4, 3);

// How long to wait for the network task before giving up on a code.
static const uint32_t CHECK_TIMEOUT_MS = HTTP_TIMEOUT_MS * 2 + 2000;

// Success messages stay a little longer — people are reading where to put the item.
static const uint32_t SUCCESS_SHOW_MS = MESSAGE_SHOW_MS * 2;

// While a door is past the warning time, beep this often.
static const uint32_t WARNING_REPEAT_MS = 5000;

void Kiosk::begin() {
	keypad.setDebounceTime(20);

	screen = Screen::Idle;
	draw();
}

// ─────────────────────────────────────────────────────────────
//  Loop
// ─────────────────────────────────────────────────────────────

void Kiosk::update() {
	const char key = keypad.getKey();

	if (key) {
		handleKey(key);
	}

	handleVerifyResult();
	handleCommands();

	const uint32_t now = millis();

	// Typed digits are forgotten after a while (someone walked away).
	if (screen == Screen::Typing && now - lastKeyAt >= KEYPAD_IDLE_CLEAR_MS) {
		LOG("KIOSK", "code cleared after %lu s without a key", static_cast<unsigned long>(KEYPAD_IDLE_CLEAR_MS / 1000));

		codeLength = 0;
		code[0] = '\0';
		screen = Screen::Idle;
	}

	// The network task never answered (it should always answer, even on errors).
	if (screen == Screen::Checking && now - checkingSince >= CHECK_TIMEOUT_MS) {
		LOG("KIOSK", "no answer for the code — giving up");

		buzzer.play(Buzzer::Error);
		showMessage(MESSAGE_SHOW_MS, "Server unreachable", "Please try again", "in a minute.", "");
	}

	if (screen == Screen::Message && static_cast<int32_t>(now - messageUntil) >= 0) {
		screen = Screen::Idle;
	}

	beepForOpenDoors();
	draw();
}

void Kiosk::handleKey(char key) {
	lastKeyAt = millis();

	// Waiting for the server: ignore keys so a code is not sent twice.
	if (screen == Screen::Checking) {
		return;
	}

	if (shared::status.kioskLockedForSeconds() > 0) {
		buzzer.play(Buzzer::Error);
		return;
	}

	if (key >= '0' && key <= '9') {
		if (screen != Screen::Typing) {
			// A new code starts (also dismisses a message screen).
			codeLength = 0;
			screen = Screen::Typing;
		}

		if (codeLength < 6) {
			code[codeLength++] = key;
			code[codeLength] = '\0';
			buzzer.play(Buzzer::Key);
		} else {
			// Already 6 digits: tell them to press #.
			buzzer.play(Buzzer::Error);
		}

		return;
	}

	if (key == '*') {
		if (screen == Screen::Typing && codeLength > 0) {
			code[--codeLength] = '\0';
			buzzer.play(Buzzer::Key);

			if (codeLength == 0) {
				screen = Screen::Idle;
			}
		} else if (screen == Screen::Message) {
			screen = Screen::Idle;
			buzzer.play(Buzzer::Key);
		}

		return;
	}

	if (key == '#') {
		if (screen == Screen::Typing && codeLength == 6) {
			submitCode();
		} else if (screen == Screen::Typing) {
			buzzer.play(Buzzer::Error);
			showMessage(MESSAGE_SHOW_MS / 2, "The code has", "6 digits.", "", "");
		}

		return;
	}
}

void Kiosk::submitCode() {
	if (shared::status.link() != Link::Online) {
		LOG("KIOSK", "code typed but the kiosk is %s", linkName(shared::status.link()));

		buzzer.play(Buzzer::Error);
		showMessage(MESSAGE_SHOW_MS, "Kiosk is offline", "Codes can't be", "checked right now.", "Please try later.");

		codeLength = 0;
		code[0] = '\0';

		return;
	}

	VerifyRequest request;
	strlcpy(request.code, code, sizeof(request.code));

	// Hand the code to the network task. (Old answers are never thrown away here:
	// a late "ok" must still open its locker, see handleVerifyResult.)
	if (xQueueSend(shared::verifyRequests, &request, 0) != pdTRUE) {
		buzzer.play(Buzzer::Error);
		showMessage(MESSAGE_SHOW_MS, "Busy, please", "try again.", "", "");

		return;
	}

	LOG("KIOSK", "checking code ******");   // never log the code itself

	codeLength = 0;
	code[0] = '\0';

	checkingSince = millis();
	screen = Screen::Checking;
}

// ─────────────────────────────────────────────────────────────
//  Server answers
// ─────────────────────────────────────────────────────────────

void Kiosk::handleVerifyResult() {
	VerifyResult result;

	if (xQueueReceive(shared::verifyResults, &result, 0) != pdTRUE) {
		return;
	}

	if (screen != Screen::Checking) {
		// Arrived after we gave up. If it opened a locker, still open it — the server
		// already started the session.
		if (!result.ok) {
			return;
		}
	}

	char line0[32];
	char line1[32];

	if (result.networkError) {
		buzzer.play(Buzzer::Error);
		showMessage(MESSAGE_SHOW_MS, "Server unreachable", "Please try again", "in a minute.", "");

		return;
	}

	if (result.ok) {
		char problem[64];

		if (!lockers.unlock(result.slot, result.sessionId, problem, sizeof(problem))) {
			LOG("KIOSK", "server said open slot %u, but: %s", result.slot, problem);

			buzzer.play(Buzzer::Error);
			showMessage(MESSAGE_SHOW_MS, "Locker problem", "Please ask staff", "for help.", "");

			return;
		}

		buzzer.play(Buzzer::Success);

		const char *label = result.lockerLabel[0] ? result.lockerLabel : "?";

		snprintf(line0, sizeof(line0), "Locker %s is open", label);

		if (strcmp(result.action, "collect") == 0) {
			showMessage(SUCCESS_SHOW_MS, line0, "Take your item and", "close the door.", "Thank you!");
		} else {
			showMessage(SUCCESS_SHOW_MS, line0, "Put the item inside", "and close the door.", "Thank you!");
		}

		return;
	}

	buzzer.play(Buzzer::Error);

	if (strcmp(result.reason, "LOCKED") == 0) {
		shared::status.setKioskLockedFor(result.lockedForSeconds > 0 ? result.lockedForSeconds : 60);
		screen = Screen::Idle;   // the locked screen is drawn from the countdown

		return;
	}

	if (strcmp(result.reason, "EXPIRED") == 0) {
		showMessage(MESSAGE_SHOW_MS, "This code expired", "Get a new code in", "the SmartFind app.", "");
		return;
	}

	if (strcmp(result.reason, "LOCKER_BUSY") == 0) {
		showMessage(MESSAGE_SHOW_MS, "Locker is busy", "Please try again", "later or ask staff.", "");
		return;
	}

	// INVALID (or anything unknown)
	if (result.attemptsLeft >= 0) {
		snprintf(line1, sizeof(line1), "Tries left: %d", result.attemptsLeft);
	} else {
		line1[0] = '\0';
	}

	showMessage(MESSAGE_SHOW_MS, "Wrong code", line1, "Check the code and", "try again.");
}

void Kiosk::handleCommands() {
	DeviceCommand command;

	if (xQueueReceive(shared::commands, &command, 0) != pdTRUE) {
		return;
	}

	CommandAck ack;
	strlcpy(ack.id, command.id, sizeof(ack.id));

	if (strcmp(command.type, "force_open") == 0) {
		LOG("KIOSK", "staff command: force open slot %u", command.slot);

		ack.ok = lockers.unlock(command.slot, nullptr, ack.message, sizeof(ack.message));

		if (ack.ok) {
			char label[8];
			char line0[32];

			shared::status.label(command.slot, label, sizeof(label));
			snprintf(line0, sizeof(line0), "Locker %s opened", label);

			buzzer.play(Buzzer::Success);
			showMessage(MESSAGE_SHOW_MS, line0, "by staff.", "", "");
		}
	} else {
		LOG("KIOSK", "unknown command type \"%s\"", command.type);

		ack.ok = false;
		snprintf(ack.message, sizeof(ack.message), "unknown command type");
	}

	if (xQueueSend(shared::commandAcks, &ack, pdMS_TO_TICKS(50)) != pdTRUE) {
		// The server resends unacknowledged commands; a repeated force_open is harmless.
		LOG("KIOSK", "ack queue full — the server will resend the command");
	}
}

// ─────────────────────────────────────────────────────────────
//  Drawing
// ─────────────────────────────────────────────────────────────

void Kiosk::showMessage(uint32_t forMs, const char *line0, const char *line1, const char *line2, const char *line3) {
	strlcpy(message[0], line0 ? line0 : "", sizeof(message[0]));
	strlcpy(message[1], line1 ? line1 : "", sizeof(message[1]));
	strlcpy(message[2], line2 ? line2 : "", sizeof(message[2]));
	strlcpy(message[3], line3 ? line3 : "", sizeof(message[3]));

	messageUntil = millis() + forMs;
	screen = Screen::Message;
}

void Kiosk::draw() {
	char status[21];
	statusLine(status, sizeof(status));

	// Keypad locked after too many wrong codes: countdown, over everything else
	// (except a success message that is still showing).
	const uint32_t lockedFor = shared::status.kioskLockedForSeconds();

	if (lockedFor > 0 && screen != Screen::Message && screen != Screen::Checking) {
		char countdown[32];
		snprintf(countdown, sizeof(countdown), "Try again in %lu:%02lu",
			static_cast<unsigned long>(lockedFor / 60),
			static_cast<unsigned long>(lockedFor % 60));

		display.show("Too many wrong codes", "Keypad locked.", countdown, status);

		return;
	}

	switch (screen) {
		case Screen::Idle: {
			char title[21];
			Display::center(title, "SmartFind Lockers");

			display.show(title, "Enter your 6-digit", "code, then press #", status);
			break;
		}

		case Screen::Typing: {
			// "Code:  1 2 3 _ _ _"
			char digits[21] = "Code: ";
			size_t used = strlen(digits);

			for (uint8_t index = 0; index < 6; index++) {
				digits[used++] = ' ';
				digits[used++] = index < codeLength ? code[index] : '_';
			}

			digits[used] = '\0';

			display.show("", digits, "* delete    # enter", status);
			break;
		}

		case Screen::Checking: {
			static const char SPINNER[] = "|/-\\";
			char line[21];

			snprintf(line, sizeof(line), "Checking code... %c", SPINNER[(millis() / 200) % 4]);

			display.show("", line, "Please wait", status);
			break;
		}

		case Screen::Message:
			display.show(message[0], message[1], message[2], message[3]);
			break;
	}
}

void Kiosk::statusLine(char *out, size_t size) {
	const Link link = shared::status.link();

	if (link != Link::Online) {
		switch (link) {
			case Link::NotConfigured:
				snprintf(out, size, "! Not set up");
				break;
			case Link::NoWifi:
				snprintf(out, size, "! No Wi-Fi");
				break;
			case Link::Connecting:
				snprintf(out, size, "Connecting...");
				break;
			case Link::ServerDown:
				snprintf(out, size, "! Server offline");
				break;
			case Link::NotAuthorized:
				snprintf(out, size, "! Kiosk not allowed");
				break;
			default:
				snprintf(out, size, "!");
				break;
		}

		return;
	}

	char open[16];
	lockers.openDoorLabels(open, sizeof(open));

	if (open[0]) {
		snprintf(out, size, "Open: %s", open);
	} else {
		snprintf(out, size, "Online");
	}
}

void Kiosk::beepForOpenDoors() {
	if (!lockers.anyDoorWarning()) {
		return;
	}

	const uint32_t now = millis();

	if (now - lastWarningBeepAt >= WARNING_REPEAT_MS) {
		lastWarningBeepAt = now;
		buzzer.play(Buzzer::Warning);

		// Show the warning too, unless someone is typing a code right now.
		if (screen == Screen::Idle) {
			char open[16];
			char line1[32];

			lockers.openDoorLabels(open, sizeof(open));
			snprintf(line1, sizeof(line1), "Door open: %s", open);

			showMessage(WARNING_REPEAT_MS - 500, "Please close the", line1, "door completely.", "");
		}
	}
}
