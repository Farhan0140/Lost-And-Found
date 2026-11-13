/**
 * SmartFind locker kiosk — ESP32 firmware.
 *
 *   setup()   pins, LCD, lockers into a safe state, decide: setup portal or normal mode
 *   loop()    (core 1) keypad, LCD, buzzer, sensors, servos, setup button, status LED
 *   network   (core 0) Wi-Fi + server, see NetworkTask.cpp
 *
 * Start reading at Lockers.h (the locker state machine) and Kiosk.h (the keypad screens).
 */

#include <Arduino.h>
#include <Wire.h>

#include "Buzzer.h"
#include "Display.h"
#include "Kiosk.h"
#include "Lockers.h"
#include "Log.h"
#include "NetworkTask.h"
#include "Settings.h"
#include "SetupPortal.h"
#include "Shared.h"
#include "config.h"

// The setup portal checks the server with HTTPS from the loop task, and a TLS
// handshake needs more than the default 8 KB of stack.
SET_LOOP_TASK_STACK_SIZE(16 * 1024);

static Settings settings;

static uint32_t setupButtonDownSince = 0;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

static bool setupButtonPressed() {
	return digitalRead(SETUP_BUTTON_PIN) == LOW;
}

/** Holding the setup button for 3 s restarts the kiosk into the setup portal. */
static void checkSetupButton() {
	if (!setupButtonPressed()) {
		setupButtonDownSince = 0;
		return;
	}

	if (setupButtonDownSince == 0) {
		setupButtonDownSince = millis();
		return;
	}

	if (millis() - setupButtonDownSince >= SETUP_HOLD_MS) {
		LOG("BOOT", "setup button held — restarting into the setup portal");

		display.show("** SETUP MODE **", "", "Restarting into", "setup...");
		buzzer.play(Buzzer::Success);

		Settings::requestPortalOnNextBoot();

		delay(800);
		ESP.restart();
	}
}

/**
 * Status LED:
 *   on ............ online
 *   slow blink .... connecting / no Wi-Fi
 *   double blink .. server offline or kiosk not allowed
 */
static void updateStatusLed() {
	const uint32_t now = millis();
	bool on = false;

	switch (shared::status.link()) {
		case Link::Online:
			on = true;
			break;

		case Link::NoWifi:
		case Link::Connecting:
		case Link::NotConfigured:
			on = (now / 500) % 2 == 0;
			break;

		case Link::ServerDown:
		case Link::NotAuthorized: {
			const uint32_t phase = now % 1200;
			on = phase < 100 || (phase >= 250 && phase < 350);
			break;
		}
	}

	digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
}

// ─────────────────────────────────────────────────────────────
//  Arduino
// ─────────────────────────────────────────────────────────────

void setup() {
	Serial.begin(115200);
	delay(200);

	Serial.println();
	LOG("BOOT", "SmartFind kiosk firmware %s", FIRMWARE_VERSION);

	pinMode(STATUS_LED_PIN, OUTPUT);
	pinMode(SETUP_BUTTON_PIN, INPUT_PULLUP);

	buzzer.begin(BUZZER_PIN);

	shared::begin();

	Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
	Wire.setClock(100000);

	display.begin();
	display.show("SmartFind Lockers", "", "Starting...", FIRMWARE_VERSION);

	// Bolts into a safe position BEFORE anything else (power may have been cut mid-deposit).
	lockers.begin();

	settings = Settings::load();

	// Setup portal: nothing configured, button held at power-on, or asked for by a long press.
	delay(50);
	const bool buttonHeld = setupButtonPressed();
	const bool requested = Settings::takePortalRequest();

	if (!settings.isComplete() || buttonHeld || requested) {
		LOG("BOOT", "opening the setup portal (%s)",
			!settings.isComplete() ? "not configured yet" : buttonHeld ? "setup button held" : "requested");

		shared::status.setLink(Link::NotConfigured);
		setupPortal::run(settings);   // never returns
	}

	buzzer.play(Buzzer::Startup);

	kiosk.begin();
	network::start(settings);

	LOG("BOOT", "running — hardware loop on core %d", xPortGetCoreID());
}

void loop() {
	lockers.update();
	kiosk.update();
	buzzer.update();

	checkSetupButton();
	updateStatusLed();

	// ~200 loops a second is plenty for a keypad and door switches.
	delay(5);
}
