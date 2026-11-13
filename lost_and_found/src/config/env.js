/**
 * Loads `.env`, validates every variable, and exports one frozen `config` object.
 *
 * If something is wrong, the server refuses to start and prints a readable list:
 *     ✖ JWT_SECRET  must be at least 32 characters (currently 12)
 *
 * Nothing else in the code reads `process.env` directly — always import `config`.
 */

import 'dotenv/config';
import { z } from 'zod';

const GEMINI_KEY_SLOTS = 10;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** "a, b ,c" → ["a", "b", "c"] (empty items removed). */
function splitList(value) {
	return String(value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

/** Collects GEMINI_API_KEY1..10, skipping empty slots, keeping the slot number. */
function readGeminiKeys(env) {
	const keys = [];

	for (let slot = 1; slot <= GEMINI_KEY_SLOTS; slot++) {
		const value = (env[`GEMINI_API_KEY${slot}`] ?? '').trim();

		if (value.length > 0) {
			keys.push({ slot, key: value });
		}
	}

	return keys;
}

// ─────────────────────────────────────────────────────────────
//  Schema
// ─────────────────────────────────────────────────────────────

const envSchema = z.object({
	PORT: z.coerce.number().int().positive().default(4000),

	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

	DATABASE_URL: z
		.string({ error: 'is missing — paste your Neon connection string' })
		.min(1, 'is empty — paste your Neon connection string')
		.refine(
			(value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
			'must start with postgres:// or postgresql://',
		),

	JWT_SECRET: z
		.string({ error: 'is missing' })
		.min(32, 'must be at least 32 characters')
		.refine((value) => !value.startsWith('replace-with'), 'still has the example value'),

	NID_HMAC_KEY: z
		.string({ error: 'is missing' })
		.min(32, 'must be at least 32 characters')
		.refine((value) => !value.startsWith('replace-with'), 'still has the example value'),

	DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

	ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

	// Only changed by tests (a fake Gemini server). Leave unset.
	GEMINI_BASE_URL: z.url().default('https://generativelanguage.googleapis.com/v1beta'),

	AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
	AI_STEP_DEADLINE_MS: z.coerce.number().int().min(1000).default(45000),

	GEMINI_MODEL_FOLLOWUPS: z.string().min(1).default('gemini-3.1-flash-lite'),
	GEMINI_MODEL_EXTRACTION: z.string().min(1).default('gemini-3.1-flash-lite'),
	GEMINI_MODEL_QUESTIONS: z.string().min(1).default('gemini-2.5-pro'),
	GEMINI_MODEL_EMBEDDING: z
		.string()
		.min(1)
		.default('gemini-embedding-001')
		.refine(
			(value) => !value.includes(','),
			'must be ONE model (embeddings from different models cannot be compared)',
		),

	ADMIN_STUDENT_ID: z.string().min(1).default('ADMIN001'),
	ADMIN_EMAIL: z.string().default('admin@smartfind.local'),
	ADMIN_PASSWORD: z.string().optional().default(''),

	APP_TIMEZONE: z.string().default('Asia/Dhaka'),

	LOG_DEVICE_POLLS: z
		.string()
		.optional()
		.transform((value) => value === 'true' || value === '1'),

	// Swagger UI at /api/docs — on unless explicitly turned off.
	API_DOCS_ENABLED: z
		.string()
		.optional()
		.transform((value) => value !== 'false' && value !== '0'),

	DEVICE_SEED_SECRET: z.string().optional().default(''),
});

// ─────────────────────────────────────────────────────────────
//  Validate
// ─────────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error('\n\x1b[31m✖ The server cannot start: .env has problems\x1b[0m\n');

	for (const issue of parsed.error.issues) {
		const name = issue.path.join('.') || '(root)';

		console.error(`   \x1b[31m✖\x1b[0m \x1b[1m${name}\x1b[0m  ${issue.message}`);
	}

	console.error('\n   Fix them in lost_and_found/.env (see .env.example), then restart.\n');
	process.exit(1);
}

const env = parsed.data;

if (env.JWT_SECRET === env.NID_HMAC_KEY) {
	console.error('\n\x1b[31m✖ JWT_SECRET and NID_HMAC_KEY must be different secrets.\x1b[0m\n');
	process.exit(1);
}

// ─────────────────────────────────────────────────────────────
//  Export
// ─────────────────────────────────────────────────────────────

export const config = Object.freeze({
	port: env.PORT,
	nodeEnv: env.NODE_ENV,
	isProduction: env.NODE_ENV === 'production',

	databaseUrl: env.DATABASE_URL,
	dbPoolMax: env.DB_POOL_MAX,

	jwtSecret: env.JWT_SECRET,
	nidHmacKey: env.NID_HMAC_KEY,

	allowedOrigins: splitList(env.ALLOWED_ORIGINS).map((origin) => origin.replace(/\/+$/, '')),

	timezone: env.APP_TIMEZONE,
	logDevicePolls: env.LOG_DEVICE_POLLS,
	apiDocsEnabled: env.API_DOCS_ENABLED,

	ai: Object.freeze({
		keys: readGeminiKeys(process.env),
		baseUrl: env.GEMINI_BASE_URL.replace(/\/+$/, ''),
		callTimeoutMs: env.AI_TIMEOUT_MS,
		stepDeadlineMs: env.AI_STEP_DEADLINE_MS,
	}),

	// Never hardcode a model name anywhere else: always use config.models.X
	models: Object.freeze({
		FOLLOWUPS: splitList(env.GEMINI_MODEL_FOLLOWUPS),
		EXTRACTION: splitList(env.GEMINI_MODEL_EXTRACTION),
		QUESTIONS: splitList(env.GEMINI_MODEL_QUESTIONS),
		EMBEDDING: env.GEMINI_MODEL_EMBEDDING.trim(),
	}),

	admin: Object.freeze({
		studentId: env.ADMIN_STUDENT_ID,
		email: env.ADMIN_EMAIL,
		password: env.ADMIN_PASSWORD,
	}),

	deviceSeedSecret: env.DEVICE_SEED_SECRET,
});
