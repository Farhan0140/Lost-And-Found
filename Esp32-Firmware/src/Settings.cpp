#include "Settings.h"

#include <Preferences.h>

#include "Log.h"

static const char *NAMESPACE = "smartfind";

Settings Settings::load() {
	Preferences preferences;
	Settings settings;

	// Read-write: on a brand-new board this creates the namespace instead of
	// printing an "nvs_open failed: NOT_FOUND" error.
	preferences.begin(NAMESPACE, false);

	settings.wifiSsid = preferences.getString("ssid", "");
	settings.wifiPassword = preferences.getString("wifipass", "");
	settings.serverUrl = preferences.getString("url", "");
	settings.deviceId = preferences.getString("devid", "");
	settings.deviceSecret = preferences.getString("secret", "");
	settings.allowInsecure = preferences.getBool("insecure", false);

	preferences.end();

	LOG("CONFIG", "Wi-Fi \"%s\", server %s, device %s, secret %s, insecure %s",
		settings.wifiSsid.c_str(),
		settings.serverUrl.isEmpty() ? "(none)" : settings.serverUrl.c_str(),
		settings.deviceId.isEmpty() ? "(none)" : settings.deviceId.c_str(),
		settings.deviceSecret.isEmpty() ? "(none)" : "(set)",
		settings.allowInsecure ? "yes" : "no");

	return settings;
}

void Settings::save() const {
	Preferences preferences;

	preferences.begin(NAMESPACE, false);

	preferences.putString("ssid", wifiSsid);
	preferences.putString("wifipass", wifiPassword);
	preferences.putString("url", normalizeUrl(serverUrl));
	preferences.putString("devid", deviceId);
	preferences.putString("secret", deviceSecret);
	preferences.putBool("insecure", allowInsecure);

	preferences.end();

	LOG("CONFIG", "settings saved");
}

bool Settings::isComplete() const {
	return !wifiSsid.isEmpty() && !serverUrl.isEmpty() && !deviceId.isEmpty() && !deviceSecret.isEmpty();
}

String Settings::validate() const {
	if (wifiSsid.isEmpty()) {
		return "Choose the Wi-Fi network.";
	}

	const String url = normalizeUrl(serverUrl);

	if (!url.startsWith("https://") && !url.startsWith("http://")) {
		return "The server URL must start with https:// (or http:// for local testing).";
	}

	if (url.startsWith("http://") && !allowInsecure) {
		return "Plain http:// is only allowed with \"Allow insecure connection\" ticked (local testing).";
	}

	if (!url.endsWith("/api/v1")) {
		return "The server URL must end with /api/v1, e.g. https://example.onrender.com/api/v1";
	}

	if (deviceId.isEmpty()) {
		return "Enter the device ID (e.g. KIOSK-01).";
	}

	if (deviceSecret.isEmpty()) {
		return "Enter the device secret (starts with sfd_).";
	}

	return "";
}

String Settings::normalizeUrl(String url) {
	url.trim();

	while (url.endsWith("/")) {
		url.remove(url.length() - 1);
	}

	return url;
}

void Settings::requestPortalOnNextBoot() {
	Preferences preferences;

	preferences.begin(NAMESPACE, false);
	preferences.putBool("portal", true);
	preferences.end();
}

bool Settings::takePortalRequest() {
	Preferences preferences;

	preferences.begin(NAMESPACE, false);

	const bool requested = preferences.getBool("portal", false);

	if (requested) {
		preferences.putBool("portal", false);
	}

	preferences.end();

	return requested;
}
