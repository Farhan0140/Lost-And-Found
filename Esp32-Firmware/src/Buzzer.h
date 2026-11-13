/**
 * Active buzzer with non-blocking patterns (never uses delay()).
 *
 *     buzzer.play(Buzzer::Key);     // short click for a key press
 *     buzzer.play(Buzzer::Success); // two short beeps
 *     buzzer.play(Buzzer::Error);   // one long beep
 *     buzzer.update();              // call every loop
 */

#pragma once

#include <Arduino.h>

class Buzzer {
public:
	enum Pattern : uint8_t {
		Key,
		Success,
		Error,
		Warning,   // door open too long
		Startup,
	};

	void begin(uint8_t pin);
	void play(Pattern pattern);
	void update();

private:
	uint8_t pin = 0;

	// on/off durations in ms, ending with 0
	const uint16_t *steps = nullptr;
	uint8_t step = 0;
	uint32_t stepStartedAt = 0;

	void apply(bool on);
};

extern Buzzer buzzer;
