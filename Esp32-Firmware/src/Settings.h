/**
 * Settings entered in the setup portal, kept in flash (ESP32 Preferences / NVS).
 *
 *     Settings settings = Settings::load();
 *     if (!settings.isComplete()) { … open the setup portal … }
 */

#pragma once

#include <Arduino.h>

struct Settings {
	String wifiSsid;
	String wifiPassword;

	// Backend base URL INCLUDING /api/v1, e.g. https://smartfind-api.onrender.com/api/v1
	String serverUrl;

	String deviceId;       // e.g. KIOSK-01
	String deviceSecret;   // sfd_… (shown once when the device was created)

	// Skip certificate checks / allow plain http:// — for local testing only.
	bool allowInsecure = false;

	static Settings load();
	void save() const;

	bool isComplete() const;

	/** Problem with the values, or "" when they are fine. */
	String validate() const;

	/** serverUrl without trailing "/". */
	static String normalizeUrl(String url);

	/** One-time flag: open the portal on the next boot (set by holding the setup button). */
	static void requestPortalOnNextBoot();
	static bool takePortalRequest();
};
