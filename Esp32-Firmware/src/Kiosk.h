/**
 * The keypad + LCD + buzzer side of the kiosk.
 *
 *   IDLE ──digit──▶ TYPING ──#──▶ CHECKING ──server answer──▶ MESSAGE ──5 s──▶ IDLE
 *                     │  * deletes a digit, 30 s without a key clears the code
 *
 * Keys:  0–9 type the code,  * deletes the last digit,  # sends the 6-digit code.
 *
 * Also executes staff commands from the server (force_open) and acknowledges them.
 * Runs in the hardware loop (core 1); network requests go through the shared queues.
 */

#pragma once

#include <Arduino.h>

class Kiosk {
public:
	void begin();
	void update();

private:
	enum class Screen : uint8_t {
		Idle,
		Typing,
		Checking,
		Message,
	};

	Screen screen = Screen::Idle;

	char code[7] = "";
	uint8_t codeLength = 0;
	uint32_t lastKeyAt = 0;

	uint32_t checkingSince = 0;

	// A message screen (result of a code, or a staff command)
	char message[4][21] = {};
	uint32_t messageUntil = 0;

	uint32_t lastWarningBeepAt = 0;

	void handleKey(char key);
	void submitCode();
	void handleVerifyResult();
	void handleCommands();

	void showMessage(uint32_t forMs, const char *line0, const char *line1, const char *line2, const char *line3);
	void draw();
	void statusLine(char *out, size_t size);
	void beepForOpenDoors();
};

extern Kiosk kiosk;
