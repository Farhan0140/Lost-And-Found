#include "Buzzer.h"

Buzzer buzzer;

// Alternating ON, OFF, ON, OFF … durations in milliseconds; 0 ends the pattern.
static const uint16_t KEY_STEPS[] = {25, 0};
static const uint16_t SUCCESS_STEPS[] = {80, 80, 80, 0};
static const uint16_t ERROR_STEPS[] = {450, 0};
static const uint16_t WARNING_STEPS[] = {120, 120, 120, 120, 120, 0};
static const uint16_t STARTUP_STEPS[] = {60, 60, 160, 0};

void Buzzer::begin(uint8_t buzzerPin) {
	pin = buzzerPin;

	pinMode(pin, OUTPUT);
	apply(false);
}

void Buzzer::play(Pattern pattern) {
	switch (pattern) {
		case Key:
			steps = KEY_STEPS;
			break;
		case Success:
			steps = SUCCESS_STEPS;
			break;
		case Error:
			steps = ERROR_STEPS;
			break;
		case Warning:
			steps = WARNING_STEPS;
			break;
		case Startup:
			steps = STARTUP_STEPS;
			break;
	}

	step = 0;
	stepStartedAt = millis();
	apply(true);
}

void Buzzer::update() {
	if (!steps) {
		return;
	}

	if (millis() - stepStartedAt < steps[step]) {
		return;
	}

	step++;
	stepStartedAt = millis();

	if (steps[step] == 0) {
		steps = nullptr;
		apply(false);

		return;
	}

	// even steps are ON, odd steps are OFF
	apply(step % 2 == 0);
}

void Buzzer::apply(bool on) {
	digitalWrite(pin, on ? HIGH : LOW);
}
