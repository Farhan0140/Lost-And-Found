#include "SetupPortal.h"

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>

#include "ApiClient.h"
#include "Buzzer.h"
#include "Display.h"
#include "Lockers.h"
#include "Log.h"
#include "NetworkTask.h"
#include "Shared.h"
#include "config.h"

namespace setupPortal {

	static WebServer server(80);
	static DNSServer dns;

	static Settings *settings = nullptr;
	static char apPassword[9] = "";

	// Result of the last "Save & check connection". When the kiosk joins the Wi-Fi, its
	// access point moves to the router's channel and the phone may drop off for a moment —
	// then the result is still shown after reconnecting to SmartFind-Setup and reloading.
	static String lastReport;
	static String lastReportKind;
	static char lcdTitle[21] = "** SETUP MODE **";

	// ─────────────────────────────────────────────────────────
	//  The page
	// ─────────────────────────────────────────────────────────

	// Placeholders like {{SSID}} are replaced in sendPage().
	static const char PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SmartFind kiosk setup</title>
<style>
	:root { color-scheme: light dark; --accent: #4f46e5; --muted: #6b7280; --line: #d1d5db; --ok: #15803d; --bad: #b91c1c; }
	* { box-sizing: border-box; }
	body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: Canvas; color: CanvasText; }
	main { max-width: 560px; margin: 0 auto; padding: 16px; }
	h1 { font-size: 1.4rem; margin: 8px 0 4px; }
	h2 { font-size: 1.1rem; margin: 28px 0 8px; }
	p.lead { color: var(--muted); margin-top: 0; }
	label { display: block; font-weight: 600; margin: 14px 0 4px; }
	small { display: block; color: var(--muted); font-weight: 400; }
	input[type=text], input[type=password], input[type=url] { width: 100%; padding: 10px 12px; font: inherit; border: 1px solid var(--line); border-radius: 8px; background: Field; color: FieldText; }
	.check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; }
	.check input { margin-top: 5px; }
	button { font: inherit; font-weight: 600; padding: 10px 16px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: white; cursor: pointer; }
	button.secondary { background: transparent; color: var(--accent); }
	.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
	.notice { padding: 12px 14px; border-radius: 8px; border: 1px solid var(--line); margin: 16px 0; white-space: pre-line; }
	.notice.ok { border-color: var(--ok); color: var(--ok); }
	.notice.bad { border-color: var(--bad); color: var(--bad); }
	table { width: 100%; border-collapse: collapse; font-size: .95rem; }
	th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); }
	.pill { font-size: .8rem; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); }

	/* Wi-Fi list: real buttons, because phones ignore <datalist> */
	.networks { list-style: none; margin: 8px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
	.networks:empty { display: none; }
	.networks li + li { border-top: 1px solid var(--line); }
	.networks button { width: 100%; display: flex; justify-content: space-between; gap: 12px; align-items: center; text-align: left; border: 0; border-radius: 0; background: transparent; color: CanvasText; font-weight: 400; padding: 12px 14px; min-height: 48px; }
	.networks button.selected { background: color-mix(in srgb, var(--accent) 15%, transparent); font-weight: 600; }
	.networks .name { overflow-wrap: anywhere; }
	.networks .meta { color: var(--muted); font-size: .85rem; white-space: nowrap; }
	.chosen { margin-top: 6px; color: var(--muted); font-size: .9rem; overflow-wrap: anywhere; }
	.chosen code { font: inherit; color: CanvasText; background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 0 4px; border-radius: 4px; white-space: pre; }
</style>
</head>
<body>
<main>
	<h1>SmartFind kiosk setup</h1>
	<p class="lead">Firmware {{FIRMWARE}} · device {{DEVID_TEXT}}</p>

	{{MESSAGE}}

	<form method="post" action="/save">
		<label for="ssid">Wi-Fi network</label>
		<input type="text" id="ssid" name="ssid" value="{{SSID}}" required autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
		<div class="chosen" id="chosen"></div>
		<div class="row" style="margin-top:6px">
			<button type="button" class="secondary" onclick="scan()">Scan for networks</button>
			<span id="scanStatus"></span>
		</div>
		<ul class="networks" id="networks"></ul>

		<label for="wifipass">Wi-Fi password
			<small>{{WIFIPASS_HINT}}</small>
		</label>
		<input type="password" id="wifipass" name="wifipass" autocomplete="off">

		<label for="url">Server URL
			<small>Ends with /api/v1, e.g. https://smartfind-api.onrender.com/api/v1</small>
		</label>
		<input type="url" id="url" name="url" value="{{URL}}" required>

		<label for="devid">Device ID
			<small>As created in the admin panel → Lockers → Devices, e.g. KIOSK-01</small>
		</label>
		<input type="text" id="devid" name="devid" value="{{DEVID}}" required autocomplete="off">

		<label for="secret">Device secret
			<small>{{SECRET_HINT}}</small>
		</label>
		<input type="password" id="secret" name="secret" autocomplete="off">

		<label class="check">
			<input type="checkbox" name="insecure" value="1" {{INSECURE}}>
			<span>Allow insecure connection
				<small>Skips the HTTPS certificate check and allows plain http://. Only for testing on a local network — never on the real campus kiosk.</small>
			</span>
		</label>

		<p class="row" style="margin-top:20px">
			<button type="submit">Save &amp; check connection</button>
		</p>
	</form>

	<h2>Lockers</h2>
	<p class="lead">Live sensor view. Use the buttons to check the bolt angles (set in include/config.h).</p>
	<table>
		<thead><tr><th>Slot</th><th>Door</th><th>Item</th><th>Bolt</th><th>Test</th></tr></thead>
		<tbody id="lockers"><tr><td colspan="5">Loading…</td></tr></tbody>
	</table>
	<p class="lead" id="driver"></p>

	<h2>Finish</h2>
	<form method="post" action="/restart" class="row">
		<button type="submit">Restart kiosk</button>
		<span class="lead">Leaves setup and starts normally.</span>
	</form>
</main>

<script>
	const ssidInput = document.getElementById('ssid');

	/** Makes spaces visible: a name like " " would otherwise look empty. */
	function visibleName(name) {
		if (name.trim() === name && name !== '') {
			return name;
		}

		return name.replace(/ /g, '␣');   // ␣
	}

	/** Under the field: exactly which name will be saved, if it has spaces at the ends. */
	function showChosen() {
		const chosen = document.getElementById('chosen');
		const name = ssidInput.value;

		chosen.textContent = '';

		if (name !== '' && name.trim() !== name) {
			const code = document.createElement('code');
			code.textContent = visibleName(name);

			chosen.append('Selected: ', code, ' (' + name.length + ' character' + (name.length === 1 ? '' : 's') + ', ␣ = space)');
		}

		for (const button of document.querySelectorAll('#networks button')) {
			button.classList.toggle('selected', button.dataset.ssid === name);
		}
	}

	function pick(name) {
		ssidInput.value = name;
		showChosen();

		// Next step is the password.
		document.getElementById('wifipass').focus();
	}

	async function scan() {
		const status = document.getElementById('scanStatus');
		status.textContent = 'Scanning…';

		try {
			const response = await fetch('/scan');
			const found = await response.json();

			// The same name from several access points: keep the strongest.
			const strongest = new Map();

			for (const network of found) {
				const known = strongest.get(network.ssid);

				if (!known || network.rssi > known.rssi) {
					strongest.set(network.ssid, network);
				}
			}

			const networks = [...strongest.values()].sort((a, b) => b.rssi - a.rssi);
			const list = document.getElementById('networks');

			list.innerHTML = '';

			for (const network of networks) {
				const item = document.createElement('li');
				const button = document.createElement('button');
				const name = document.createElement('span');
				const meta = document.createElement('span');

				button.type = 'button';
				button.dataset.ssid = network.ssid;
				button.onclick = () => pick(network.ssid);

				name.className = 'name';
				name.textContent = network.ssid.trim() === ''
					? visibleName(network.ssid) + '  (name is ' + network.ssid.length + ' space' + (network.ssid.length === 1 ? '' : 's') + ')'
					: visibleName(network.ssid);

				meta.className = 'meta';
				meta.textContent = network.rssi + ' dBm' + (network.open ? ' · open' : ' · 🔒');

				button.append(name, meta);
				item.append(button);
				list.append(item);
			}

			status.textContent = networks.length
				? networks.length + ' network(s) found. Tap one to choose it.'
				: 'No networks found. Try again, or type the name.';

			showChosen();
		} catch (error) {
			status.textContent = 'Scan failed. Try again, or type the name.';
		}
	}

	ssidInput.addEventListener('input', showChosen);
	showChosen();

	async function servo(slot, position) {
		await fetch('/servo?slot=' + slot + '&position=' + position, { method: 'POST' });
		refresh();
	}

	function cell(text) {
		const td = document.createElement('td');
		td.textContent = text;
		return td;
	}

	async function refresh() {
		try {
			const response = await fetch('/sensors');
			const data = await response.json();
			const body = document.getElementById('lockers');

			body.innerHTML = '';

			for (const locker of data.lockers) {
				const row = document.createElement('tr');

				row.appendChild(cell(locker.slot + ' (' + locker.label + ')'));
				row.appendChild(cell(locker.doorClosed ? 'closed' : 'OPEN'));
				row.appendChild(cell(locker.itemPresent ? 'item' : 'empty'));
				row.appendChild(cell(locker.servoLocked ? 'locked' : 'unlocked'));

				const actions = document.createElement('td');
				actions.className = 'row';

				for (const [position, text] of [['open', 'Open'], ['lock', 'Lock']]) {
					const button = document.createElement('button');
					button.type = 'button';
					button.className = 'secondary';
					button.textContent = text;
					button.onclick = () => servo(locker.slot, position);
					actions.appendChild(button);
				}

				row.appendChild(actions);
				body.appendChild(row);
			}

			document.getElementById('driver').textContent = data.servoDriver
				? 'Servo driver (PCA9685) found.'
				: 'Servo driver (PCA9685) NOT found — check its wiring (SDA 21, SCL 22, address 0x40).';
		} catch (error) {
			// The kiosk is probably restarting.
		}
	}

	refresh();
	setInterval(refresh, 1000);
	scan();
</script>
</body>
</html>
)HTML";

	// ─────────────────────────────────────────────────────────
	//  Helpers
	// ─────────────────────────────────────────────────────────

	static String escapeHtml(const String &text) {
		String out;
		out.reserve(text.length() + 8);

		for (size_t index = 0; index < text.length(); index++) {
			const char character = text[index];

			switch (character) {
				case '&':
					out += "&amp;";
					break;
				case '<':
					out += "&lt;";
					break;
				case '>':
					out += "&gt;";
					break;
				case '"':
					out += "&quot;";
					break;
				case '\'':
					out += "&#39;";
					break;
				default:
					out += character;
			}
		}

		return out;
	}

	static String escapeJson(const String &text) {
		String out;

		for (size_t index = 0; index < text.length(); index++) {
			const char character = text[index];

			if (character == '"' || character == '\\') {
				out += '\\';
				out += character;
			} else if (static_cast<unsigned char>(character) < 0x20) {
				out += ' ';
			} else {
				out += character;
			}
		}

		return out;
	}

	/** `kind` is "ok", "bad" or "" (neutral). */
	static void sendPage(const String &message = "", const char *kind = "") {
		String page = FPSTR(PAGE);

		String notice;

		if (!message.isEmpty()) {
			notice = String("<div class=\"notice ") + kind + "\">" + escapeHtml(message) + "</div>";
		}

		page.replace("{{MESSAGE}}", notice);
		page.replace("{{FIRMWARE}}", FIRMWARE_VERSION);
		page.replace("{{DEVID_TEXT}}", settings->deviceId.isEmpty() ? String("not set") : escapeHtml(settings->deviceId));
		page.replace("{{SSID}}", escapeHtml(settings->wifiSsid));
		page.replace("{{URL}}", escapeHtml(settings->serverUrl));
		page.replace("{{DEVID}}", escapeHtml(settings->deviceId));
		page.replace("{{INSECURE}}", settings->allowInsecure ? "checked" : "");

		page.replace("{{WIFIPASS_HINT}}", settings->wifiPassword.isEmpty()
			? "Leave empty for an open network."
			: "Leave empty to keep the saved password.");

		page.replace("{{SECRET_HINT}}", settings->deviceSecret.isEmpty()
			? "Starts with sfd_. Shown once when the device was created (or after \"Rotate secret\")."
			: "A secret is saved. Leave empty to keep it.");

		server.sendHeader("Cache-Control", "no-store");
		server.send(200, "text/html; charset=utf-8", page);
	}

	static void showCredentialsOnLcd() {
		char line1[21];
		char line2[21];

		snprintf(line1, sizeof(line1), "WiFi:%s", SETUP_AP_NAME);
		snprintf(line2, sizeof(line2), "Pass: %s", apPassword);

		display.show(lcdTitle, line1, line2, "Open 192.168.4.1");
	}

	// ─────────────────────────────────────────────────────────
	//  "Save & check connection"
	// ─────────────────────────────────────────────────────────

	/** Joins the Wi-Fi (the access point stays up) and asks the server who we are. */
	static String checkConnection(bool &ok) {
		ok = false;

		display.show("** SETUP MODE **", "Checking Wi-Fi...", "", "");

		LOG("SETUP", "joining \"%s\" to check the connection", settings->wifiSsid.c_str());

		WiFi.disconnect();
		WiFi.begin(settings->wifiSsid.c_str(), settings->wifiPassword.c_str());

		const uint32_t startedAt = millis();

		while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 20000) {
			dns.processNextRequest();
			lockers.update();
			delay(100);
		}

		if (WiFi.status() != WL_CONNECTED) {
			showCredentialsOnLcd();

			return "Could not join the Wi-Fi network \"" + settings->wifiSsid +
				"\". Check the name and password (2.4 GHz networks only).";
		}

		String report = "Wi-Fi OK: " + WiFi.localIP().toString() + ", signal " + String(WiFi.RSSI()) + " dBm\n";

		const bool secure = settings->serverUrl.startsWith("https://") && !settings->allowInsecure;

		if (secure) {
			display.show("** SETUP MODE **", "Setting the clock..", "", "");

			if (!network::syncClock(15000)) {
				showCredentialsOnLcd();

				return report + "Could not get the time from the internet (NTP). "
					"HTTPS certificates cannot be checked without it — does this network reach the internet?";
			}
		}

		display.show("** SETUP MODE **", "Asking the server..", "", "");

		ApiClient api;
		api.configure(*settings);

		JsonDocument answer;
		const ApiResult result = network::hello(api, answer);

		showCredentialsOnLcd();

		switch (result) {
			case ApiResult::Ok: {
				ok = true;

				report += "Server OK: this is \"" + String(answer["name"] | "") + "\" with " +
					String(answer["lockers"].as<JsonArray>().size()) + " locker(s):";

				for (JsonObject locker : answer["lockers"].as<JsonArray>()) {
					report += String("\n  slot ") + (locker["slot"] | 0) + " = " + (locker["label"] | "") +
						" (" + (locker["status"] | "") + ")";
				}

				if (answer["lockers"].as<JsonArray>().size() != LOCKER_COUNT) {
					report += String("\nNote: this firmware drives ") + LOCKER_COUNT +
						" lockers (slots 1-" + LOCKER_COUNT + ").";
				}

				report += "\n\nPress \"Restart kiosk\" to start.";

				return report;
			}

			case ApiResult::NotAuthorized:
				return report + "The server refused this kiosk: " + api.lastError() +
					"\nCheck the device ID and secret (Admin → Lockers → Devices; \"Rotate secret\" makes a new one).";

			case ApiResult::ServerError:
				return report + "The server answered with an error (" + String(api.lastStatus()) + "): " + api.lastError() +
					"\nIs the URL right? It must end with /api/v1.";

			case ApiResult::NetworkError:
			default:
				return report + "Could not reach the server: " + api.lastError() +
					(secure ? "\nIf the certificate is the problem, regenerate include/root_ca.h (see README)." : "");
		}
	}

	// ─────────────────────────────────────────────────────────
	//  Routes
	// ─────────────────────────────────────────────────────────

	static void handleSave() {
		Settings next = *settings;

		// NOT trimmed: spaces are legal in a Wi-Fi name, and a name can even be just " ".
		next.wifiSsid = server.arg("ssid");

		next.serverUrl = Settings::normalizeUrl(server.arg("url"));

		next.deviceId = server.arg("devid");
		next.deviceId.trim();

		next.allowInsecure = server.hasArg("insecure");

		// Password fields are never pre-filled: empty means "keep the saved one".
		// A different network with an empty password means an open network.
		if (!server.arg("wifipass").isEmpty() || next.wifiSsid != settings->wifiSsid) {
			next.wifiPassword = server.arg("wifipass");
		}

		if (!server.arg("secret").isEmpty()) {
			next.deviceSecret = server.arg("secret");
			next.deviceSecret.trim();
		}

		const String problem = next.validate();

		if (!problem.isEmpty()) {
			// Keep what was typed so it does not have to be entered again (passwords excepted).
			const Settings saved = *settings;
			*settings = next;
			sendPage(problem, "bad");
			*settings = saved;

			return;
		}

		*settings = next;
		settings->save();

		bool ok = false;
		const String report = checkConnection(ok);

		buzzer.play(ok ? Buzzer::Success : Buzzer::Error);

		lastReport = String("Saved.\n") + report;
		lastReportKind = ok ? "ok" : "bad";

		strlcpy(lcdTitle, ok ? "Check OK: restart" : "Check FAILED", sizeof(lcdTitle));
		showCredentialsOnLcd();

		sendPage(lastReport, lastReportKind.c_str());
	}

	static void handleScan() {
		LOG("SETUP", "scanning Wi-Fi networks");

		const int found = WiFi.scanNetworks();

		String json = "[";

		for (int index = 0; index < found; index++) {
			const String ssid = WiFi.SSID(index);

			if (ssid.isEmpty()) {
				continue;   // hidden network
			}

			if (json.length() > 1) {
				json += ",";
			}

			json += "{\"ssid\":\"" + escapeJson(ssid) + "\",\"rssi\":" + String(WiFi.RSSI(index)) +
				",\"open\":" + (WiFi.encryptionType(index) == WIFI_AUTH_OPEN ? "true" : "false") + "}";
		}

		json += "]";

		WiFi.scanDelete();

		server.send(200, "application/json", json);
	}

	static void handleSensors() {
		String json = "{\"servoDriver\":";
		json += lockers.servoDriverFound() ? "true" : "false";
		json += ",\"lockers\":[";

		for (uint8_t slot = 1; slot <= LOCKER_COUNT; slot++) {
			char label[8];
			shared::status.label(slot, label, sizeof(label));

			if (slot > 1) {
				json += ",";
			}

			json += "{\"slot\":" + String(slot) +
				",\"label\":\"" + escapeJson(label) + "\"" +
				",\"doorClosed\":" + (lockers.doorClosed(slot) ? "true" : "false") +
				",\"itemPresent\":" + (lockers.itemPresent(slot) ? "true" : "false") +
				",\"servoLocked\":" + (lockers.servoLocked(slot) ? "true" : "false") + "}";
		}

		json += "]}";

		server.sendHeader("Cache-Control", "no-store");
		server.send(200, "application/json", json);
	}

	static void handleServo() {
		const int slot = server.arg("slot").toInt();
		const String position = server.arg("position");

		if (slot < 1 || slot > LOCKER_COUNT || (position != "open" && position != "lock")) {
			server.send(400, "text/plain", "slot 1-4 and position open|lock");

			return;
		}

		lockers.testServo(slot, position == "open");
		buzzer.play(Buzzer::Key);

		server.send(200, "text/plain", "ok");
	}

	static void handleRestart() {
		server.send(200, "text/html; charset=utf-8",
			"<!doctype html><meta name=viewport content='width=device-width'>"
			"<body style='font:16px system-ui;padding:16px'>"
			"<h1>Restarting…</h1><p>The kiosk starts normally in a few seconds. You can close this page.</p>");

		LOG("SETUP", "restart requested from the portal");

		display.show("** SETUP MODE **", "", "Restarting...", "");

		delay(500);
		ESP.restart();
	}

	/** Phones check a known URL to detect a captive portal → send everything to our page. */
	static void handleNotFound() {
		server.sendHeader("Location", "http://192.168.4.1/", true);
		server.send(302, "text/plain", "");
	}

	// ─────────────────────────────────────────────────────────
	//  Run
	// ─────────────────────────────────────────────────────────

	void run(Settings &value) {
		settings = &value;

		// Fixed password, set in include/config.h.
		strlcpy(apPassword, SETUP_AP_PASSWORD, sizeof(apPassword));

		WiFi.mode(WIFI_AP_STA);
		WiFi.softAP(SETUP_AP_NAME, apPassword);

		delay(200);

		const IPAddress ip = WiFi.softAPIP();

		dns.start(53, "*", ip);

		server.on("/", HTTP_GET, []() { sendPage(lastReport, lastReportKind.c_str()); });
		server.on("/save", HTTP_POST, handleSave);
		server.on("/scan", HTTP_GET, handleScan);
		server.on("/sensors", HTTP_GET, handleSensors);
		server.on("/servo", HTTP_POST, handleServo);
		server.on("/restart", HTTP_POST, handleRestart);
		server.onNotFound(handleNotFound);

		server.begin();

		LOG("SETUP", "setup portal open — Wi-Fi \"%s\", password %s, http://%s",
			SETUP_AP_NAME, apPassword, ip.toString().c_str());

		showCredentialsOnLcd();
		buzzer.play(Buzzer::Startup);

		for (;;) {
			dns.processNextRequest();
			server.handleClient();

			lockers.update();
			buzzer.update();

			// Blink the status LED fast while in setup mode.
			digitalWrite(STATUS_LED_PIN, (millis() / 150) % 2);

			delay(2);
		}
	}
}
