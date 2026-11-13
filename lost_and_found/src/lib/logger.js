/**
 * A small, readable console logger.
 *
 *     14:05:12  INFO   SERVER   Listening on http://localhost:4000
 *     14:05:12  HTTP   POST /api/v1/auth/login  200  84ms  user=STU1023  req=a81c
 *     14:05:13  AI     followups  key #3  gemini-3.1-flash-lite  1.84s  OK
 *     14:05:40  ERROR  DATABASE  Could not connect to Neon — check DATABASE_URL
 *
 * Rules:
 *   - Never log secrets, raw national IDs, passwords, OTP codes or Gemini keys.
 *   - Gemini keys are only ever referred to by their slot number (#1 … #10).
 */

const COLORS = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	bold: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function paint(color, text) {
	if (!useColor) {
		return String(text);
	}

	return `${COLORS[color]}${text}${COLORS.reset}`;
}

function timestamp() {
	const now = new Date();

	const hh = String(now.getHours()).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	const ss = String(now.getSeconds()).padStart(2, '0');

	return paint('gray', `${hh}:${mm}:${ss}`);
}

const LEVEL_STYLE = {
	debug: { label: 'DEBUG', color: 'gray' },
	info: { label: 'INFO ', color: 'cyan' },
	warn: { label: 'WARN ', color: 'yellow' },
	error: { label: 'ERROR', color: 'red' },
	http: { label: 'HTTP ', color: 'blue' },
	ai: { label: 'AI   ', color: 'magenta' },
	device: { label: 'DEVIC', color: 'green' },
};

/** Turns an extra-details object into "key=value key=value". */
function formatDetails(details) {
	if (!details || typeof details !== 'object') {
		return '';
	}

	const parts = Object.entries(details)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.map(([key, value]) => {
			const text = typeof value === 'object' ? JSON.stringify(value) : String(value);

			return `${key}=${text}`;
		});

	if (parts.length === 0) {
		return '';
	}

	return '  ' + paint('dim', parts.join('  '));
}

function write(level, scope, message, details) {
	const style = LEVEL_STYLE[level];

	const line = [
		timestamp(),
		paint(style.color, style.label),
		paint('bold', String(scope).toUpperCase().padEnd(9)),
		message,
	].join('  ');

	const output = line + formatDetails(details);

	if (level === 'error') {
		console.error(output);
	} else if (level === 'warn') {
		console.warn(output);
	} else {
		console.log(output);
	}
}

// ─────────────────────────────────────────────────────────────
//  HTTP lines
// ─────────────────────────────────────────────────────────────

function colorStatus(status) {
	if (status >= 500) {
		return paint('red', status);
	}

	if (status >= 400) {
		return paint('yellow', status);
	}

	if (status >= 300) {
		return paint('cyan', status);
	}

	return paint('green', status);
}

function formatDuration(ms) {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(2)}s`;
	}

	return `${Math.round(ms)}ms`;
}

// ─────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────

export const logger = {
	debug(scope, message, details) {
		if (process.env.LOG_LEVEL === 'debug') {
			write('debug', scope, message, details);
		}
	},

	info(scope, message, details) {
		write('info', scope, message, details);
	},

	warn(scope, message, details) {
		write('warn', scope, message, details);
	},

	error(scope, message, details) {
		write('error', scope, paint('red', message), details);
	},

	/** One line per finished API request. */
	http({ method, path, status, durationMs, user, requestId, errorCode }) {
		const line = [
			paint('bold', method.padEnd(6)),
			path,
			colorStatus(status),
			formatDuration(durationMs),
		].join('  ');

		write('http', 'api', line, {
			user,
			req: requestId,
			error: errorCode,
		});
	},

	/** One line per Gemini attempt. `outcome` is "OK" or a short error label. */
	ai({ job, slot, model, durationMs, outcome, note }) {
		const ok = outcome === 'OK';

		const line = [
			paint('bold', job.padEnd(10)),
			`key #${slot}`,
			model,
			formatDuration(durationMs),
			ok ? paint('green', 'OK') : paint('yellow', outcome),
		].join('  ');

		write('ai', 'gemini', note ? `${line}  ${paint('dim', `(${note})`)}` : line);
	},

	device(message, details) {
		write('device', 'device', message, details);
	},

	formatDuration,
	paint,
};
