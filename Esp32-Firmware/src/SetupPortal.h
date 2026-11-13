/**
 * Setup portal: the kiosk becomes a Wi-Fi access point with a small web page.
 *
 *   Wi-Fi network ... SmartFind-Setup
 *   Password ........ 12345678 (SETUP_AP_PASSWORD in config.h), also shown on the LCD
 *   Page ............ http://192.168.4.1  (most phones open it by themselves)
 *
 * On the page:
 *   - Wi-Fi network + password, server URL (…/api/v1), device ID + secret,
 *     "allow insecure connection" (local testing with http:// only)
 *   - "Save & check connection" → joins the Wi-Fi and calls POST /device/hello
 *   - servo test (open / lock each bolt) and a live view of the door + IR sensors
 *   - "Restart kiosk" to leave the portal
 *
 * Opens when: nothing is configured yet, the setup button is held while powering on,
 * or the setup button is held for 3 s while the kiosk is running.
 */

#pragma once

#include "Settings.h"

namespace setupPortal {
	/** Runs the portal forever (until the kiosk is restarted from the page). */
	[[noreturn]] void run(Settings &settings);
}
