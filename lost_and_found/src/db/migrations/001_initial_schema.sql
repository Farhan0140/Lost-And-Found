-- ═══════════════════════════════════════════════════════════════════════
--  SmartFind — initial schema
--
--  Sections:
--    0. Extensions and helpers
--    1. Campus zones and the (dummy) university student database
--    2. Users and refresh tokens
--    3. Categories and frozen question sets
--    4. Devices and lockers
--    5. Reports (found + lost), follow-ups, embeddings, extraction cache
--    6. Matches
--    7. OTPs, locker sessions, device commands and events
--    8. Notifications and overflow reports
--    9. Audit log (append-only, hash-chained)
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
--  0. Extensions and helpers
-- ───────────────────────────────────────────────────────────────────────

create extension if not exists vector;

-- Keeps every `updated_at` column current without remembering it in code.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────
--  1. Campus zones and university students
-- ───────────────────────────────────────────────────────────────────────

-- A zone is a place on campus. Location affinity (§8.3):
--   same zone = 1.0, same department = 0.6, otherwise 0.3
create table campus_zones (
	id           serial primary key,
	name         text not null unique,
	department   text not null,
	building     text,
	is_active    boolean not null default true,
	sort_order   int not null default 0,
	created_at   timestamptz not null default now(),
	updated_at   timestamptz not null default now()
);

create trigger campus_zones_updated_at
	before update on campus_zones
	for each row execute function set_updated_at();


-- Simulated university database. Only admins can change it.
-- The national ID is stored ONLY as HMAC-SHA256(NID_HMAC_KEY, nid).
create table university_students (
	student_id         text primary key,
	national_id_hash   text not null,
	full_name          text not null,
	department         text not null,
	campus_zone_id     int references campus_zones (id) on delete set null,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now()
);

create trigger university_students_updated_at
	before update on university_students
	for each row execute function set_updated_at();


-- ───────────────────────────────────────────────────────────────────────
--  2. Users and refresh tokens
-- ───────────────────────────────────────────────────────────────────────

create table users (
	id               uuid primary key default gen_random_uuid(),
	student_id       text not null unique,
	email            text not null,
	password_hash    text not null,

	-- null only for admin accounts created from .env (they are not students)
	nid_hash         text,

	full_name        text not null,
	department       text,
	campus_zone_id   int references campus_zones (id) on delete set null,

	role             text not null default 'student'
	                 check (role in ('student', 'admin')),

	is_active        boolean not null default true,
	last_login_at    timestamptz,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now()
);

create unique index users_email_unique on users (lower(email));

create trigger users_updated_at
	before update on users
	for each row execute function set_updated_at();


-- Refresh tokens rotate on every use. Re-using a revoked token revokes the whole family.
create table refresh_tokens (
	id               uuid primary key default gen_random_uuid(),
	user_id          uuid not null references users (id) on delete cascade,
	family_id        uuid not null,
	token_hash       text not null unique,
	expires_at       timestamptz not null,
	revoked_at       timestamptz,
	revoked_reason   text,
	replaced_by      uuid references refresh_tokens (id),
	ip               text,
	user_agent       text,
	created_at       timestamptz not null default now()
);

create index refresh_tokens_user on refresh_tokens (user_id);
create index refresh_tokens_family on refresh_tokens (family_id);


-- ───────────────────────────────────────────────────────────────────────
--  3. Categories and frozen question sets (D1)
-- ───────────────────────────────────────────────────────────────────────

create table categories (
	id                 serial primary key,
	slug               text not null unique,
	name               text not null,
	icon               text,
	is_fully_written   boolean not null default false,
	sort_order         int not null default 0
);


-- `questions` and `aspects` are frozen JSON once the set is active.
-- Descriptions are only ever compared when both use the SAME question_set id.
create table question_sets (
	id             serial primary key,
	category_id    int not null references categories (id),
	version        int not null,

	status         text not null default 'draft'
	               check (status in ('draft', 'active', 'retired')),

	questions      jsonb not null,
	aspects        jsonb not null,

	source         text not null default 'manual'
	               check (source in ('manual', 'ai')),

	ai_model       text,
	notes          text,

	created_by     uuid references users (id),
	activated_by   uuid references users (id),
	activated_at   timestamptz,
	created_at     timestamptz not null default now(),

	unique (category_id, version)
);

-- At most ONE active set per category.
create unique index question_sets_one_active
	on question_sets (category_id)
	where status = 'active';


-- ───────────────────────────────────────────────────────────────────────
--  4. Devices and lockers
-- ───────────────────────────────────────────────────────────────────────

-- One ESP32 = keypad/LCD kiosk + its lockers. The secret is stored as SHA-256 only.
create table devices (
	id                 text primary key,
	name               text not null,
	secret_hash        text not null,
	is_active          boolean not null default true,
	last_seen_at       timestamptz,
	last_ip            text,
	firmware_version   text,
	created_at         timestamptz not null default now()
);


create table lockers (
	id                    serial primary key,
	device_id             text not null references devices (id) on delete cascade,
	slot                  int not null check (slot between 1 and 16),
	label                 text not null unique,
	size_class            text not null default 'standard',

	status                text not null default 'available'
	                      check (status in (
	                          'available',
	                          'reserved',
	                          'occupied',
	                          'needs_emptying',
	                          'open_unresolved',
	                          'maintenance'
	                      )),

	-- foreign key added after `reports` exists
	current_report_id     uuid,

	-- last physical state reported by the device
	door_closed           boolean,
	item_present          boolean,
	servo_locked          boolean,
	door_opened_at        timestamptz,
	sensors_updated_at    timestamptz,

	updated_at            timestamptz not null default now(),

	unique (device_id, slot)
);

create trigger lockers_updated_at
	before update on lockers
	for each row execute function set_updated_at();


-- ───────────────────────────────────────────────────────────────────────
--  5. Reports
-- ───────────────────────────────────────────────────────────────────────

-- One row per report from the FIRST step (status 'draft'). The row id is also the
-- idempotency key: submitting the same draft twice returns the same result.
create table reports (
	id                         uuid primary key default gen_random_uuid(),
	user_id                    uuid not null references users (id),

	kind                       text not null check (kind in ('found', 'lost')),

	status                     text not null default 'draft'
	                           check (status in (
	                               -- drafts
	                               'draft', 'abandoned', 'discarded',
	                               -- found item lifecycle
	                               'awaiting_deposit', 'awaiting_locker', 'stored',
	                               'unclaimed_expired', 'overflow',
	                               -- lost report lifecycle
	                               'open', 'cancelled',
	                               -- shared
	                               'matched', 'awaiting_collection', 'collected'
	                           )),

	-- ── what the user described ──
	path                       text check (path in ('photo', 'manual')),
	draft_step                 text not null default 'start',
	category_id                int references categories (id),
	question_set_id            int references question_sets (id),
	answers                    jsonb not null default '{}'::jsonb,
	canonical                  jsonb,
	extraction                 jsonb,
	image_hashes               text[] not null default '{}',
	occurred_on                date,
	zone_id                    int references campus_zones (id),
	place_note                 text,
	fits_in_locker             boolean,

	-- ── AI progress for drafts ──
	ai_status                  text not null default 'idle'
	                           check (ai_status in ('idle', 'working', 'waiting', 'ok')),
	ai_waiting_step            text,
	ai_error                   text,
	ai_failed_at               timestamptz,

	embedding_status           text not null default 'pending'
	                           check (embedding_status in ('pending', 'ready', 'failed', 'skipped')),
	embedding_attempts         int not null default 0,

	-- optimistic concurrency for autosave (client sends the version it edited)
	version                    int not null default 1,

	expiry_warned_at           timestamptz,
	last_activity_at           timestamptz not null default now(),
	submitted_at               timestamptz,

	-- ── found-item custody ──
	locker_id                  int references lockers (id),
	deposit_generations        int not null default 0,
	deposit_generation_limit   int not null default 5,
	queued_at                  timestamptz,
	first_stored_at            timestamptz,
	collected_at               timestamptz,

	closed_reason              text,

	created_at                 timestamptz not null default now(),
	updated_at                 timestamptz not null default now()
);

create index reports_user_status on reports (user_id, status);
create index reports_kind_status on reports (kind, status);
create index reports_matchable on reports (question_set_id, kind, status);

create trigger reports_updated_at
	before update on reports
	for each row execute function set_updated_at();

alter table lockers
	add constraint lockers_current_report_fk
	foreign key (current_report_id) references reports (id) on delete set null;


-- AI-generated, aspect-tagged follow-up questions (D1b). Private to the reporter + admins.
create table report_followups (
	id              uuid primary key default gen_random_uuid(),
	report_id       uuid not null references reports (id) on delete cascade,
	position        int not null,
	aspect          text not null,
	question_text   text not null,

	-- [{ "code": "clear_silicone", "label": "Clear silicone case" }, …]
	options         jsonb not null,

	answer_kind     text check (answer_kind in ('option', 'other', 'none', 'dont_remember')),
	answer_code     text,
	answer_text     text,
	answered_at     timestamptz,

	ai_model        text not null,
	ai_key_slot     int,
	prompt_hash     text not null,
	created_at      timestamptz not null default now(),

	unique (report_id, position)
);


-- 768-dimension vectors. `model` is stored so vectors from different models are never compared.
create table report_embeddings (
	report_id     uuid not null references reports (id) on delete cascade,
	field         text not null,
	source_text   text not null,
	model         text not null,
	embedding     vector(768) not null,
	created_at    timestamptz not null default now(),

	primary key (report_id, field)
);


-- Extraction cache keyed by (user, images). Stops back-and-resubmit from re-billing AI.
-- Holds ONLY the extracted fields, never image bytes (D6).
create table image_extractions (
	user_id       uuid not null references users (id) on delete cascade,
	images_key    text not null,
	result        jsonb not null,
	created_at    timestamptz not null default now(),

	primary key (user_id, images_key)
);


-- ───────────────────────────────────────────────────────────────────────
--  6. Matches
-- ───────────────────────────────────────────────────────────────────────

create table matches (
	id                          uuid primary key default gen_random_uuid(),
	found_report_id             uuid not null references reports (id),
	lost_report_id              uuid not null references reports (id),
	question_set_id             int not null references question_sets (id),

	score                       numeric(6, 4) not null,
	breakdown                   jsonb not null,
	weights_version             text not null,
	scored_without_embedding    boolean not null default false,
	release_rule_met            boolean not null default false,
	review_reason               text,

	status                      text not null
	                            check (status in (
	                                'auto_matched',
	                                'review',
	                                'approved',
	                                'rejected',
	                                'otp_issued',
	                                'collected',
	                                'expired',
	                                'superseded'
	                            )),

	collect_generations         int not null default 0,
	collect_generation_limit    int not null default 5,
	hold_expires_at             timestamptz,

	decided_by                  uuid references users (id),
	decision_reason             text,
	decided_at                  timestamptz,

	created_at                  timestamptz not null default now(),
	updated_at                  timestamptz not null default now(),

	unique (found_report_id, lost_report_id)
);

-- A found item / lost report can be in at most ONE live (released) match.
create unique index matches_one_live_per_found
	on matches (found_report_id)
	where status in ('auto_matched', 'approved', 'otp_issued');

create unique index matches_one_live_per_lost
	on matches (lost_report_id)
	where status in ('auto_matched', 'approved', 'otp_issued');

create index matches_status on matches (status, score desc);

create trigger matches_updated_at
	before update on matches
	for each row execute function set_updated_at();


-- ───────────────────────────────────────────────────────────────────────
--  7. OTPs, locker sessions, device commands and events
-- ───────────────────────────────────────────────────────────────────────

-- A single-use bearer code for ONE action on ONE locker.
--   code_hash       HMAC-SHA256 — used for verification at the kiosk
--   code_encrypted  AES-256-GCM — only so the SAME user can view it again (Q6)
create table otps (
	id               uuid primary key default gen_random_uuid(),
	code_hash        text not null,
	code_encrypted   text not null,

	action           text not null check (action in ('deposit', 'collect')),

	user_id          uuid not null references users (id),
	report_id        uuid not null references reports (id),
	match_id         uuid references matches (id),
	locker_id        int not null references lockers (id),
	generation       int not null,

	status           text not null default 'active'
	                 check (status in ('active', 'used', 'revoked', 'expired')),

	expires_at       timestamptz not null,
	used_at          timestamptz,
	created_at       timestamptz not null default now()
);

-- No two ACTIVE codes may be equal: the kiosk finds the locker from the code alone.
create unique index otps_active_code on otps (code_hash) where status = 'active';
create index otps_expiry on otps (status, expires_at);


-- One physical open → close cycle of a locker door.
create table locker_sessions (
	id            uuid primary key default gen_random_uuid(),
	locker_id     int not null references lockers (id),
	device_id     text not null references devices (id),

	action        text not null check (action in ('deposit', 'collect', 'force_open')),

	otp_id        uuid references otps (id),
	command_id    uuid,
	report_id     uuid references reports (id),
	match_id      uuid references matches (id),

	status        text not null default 'open'
	              check (status in ('open', 'completed', 'failed', 'cancelled')),

	result        text,
	opened_at     timestamptz not null default now(),
	finished_at   timestamptz
);

create unique index locker_sessions_one_open
	on locker_sessions (locker_id)
	where status = 'open';


-- Commands waiting for the device (it polls; the backend never pushes — D7).
create table device_commands (
	id            uuid primary key default gen_random_uuid(),
	device_id     text not null references devices (id) on delete cascade,
	locker_id     int references lockers (id),
	slot          int,

	type          text not null check (type in ('force_open')),
	reason        text not null,
	issued_by     uuid references users (id),

	status        text not null default 'pending'
	              check (status in ('pending', 'sent', 'done', 'failed', 'expired')),

	result        jsonb,
	created_at    timestamptz not null default now(),
	sent_at       timestamptz,
	acked_at      timestamptz
);

create index device_commands_pending on device_commands (device_id, status);


-- Raw event stream from devices. (device, boot, seq) makes re-sent events harmless.
create table device_events (
	id                 bigserial primary key,
	device_id          text not null references devices (id) on delete cascade,
	boot_id            text not null,
	seq                int not null,
	type               text not null,
	slot               int,
	session_id         uuid,
	data               jsonb not null default '{}'::jsonb,
	device_uptime_ms   bigint,
	received_at        timestamptz not null default now(),

	unique (device_id, boot_id, seq)
);

create index device_events_recent on device_events (device_id, received_at desc);


-- ───────────────────────────────────────────────────────────────────────
--  8. Notifications and overflow reports
-- ───────────────────────────────────────────────────────────────────────

-- In-app notifications only (D3): no push, email or SMS.
create table notifications (
	id           uuid primary key default gen_random_uuid(),
	user_id      uuid not null references users (id) on delete cascade,
	type         text not null,
	title        text not null,
	body         text not null,
	link         text,
	read_at      timestamptz,
	created_at   timestamptz not null default now()
);

create index notifications_user_recent on notifications (user_id, created_at desc);


-- Found items that do not fit a locker (ITEM_TOO_LARGE): handed to the admin desk.
create table overflow_reports (
	id                uuid primary key default gen_random_uuid(),
	report_id         uuid not null references reports (id),
	user_id           uuid not null references users (id),
	note              text,

	status            text not null default 'open'
	                  check (status in ('open', 'resolved')),

	resolved_by       uuid references users (id),
	resolution_note   text,
	resolved_at       timestamptz,
	created_at        timestamptz not null default now()
);


-- ───────────────────────────────────────────────────────────────────────
--  9. Audit log — append-only and hash-chained
-- ───────────────────────────────────────────────────────────────────────
--
--  hash = SHA-256( prev_hash | id | at | actor | action | entity | reason | details )
--
--  * The trigger takes an advisory lock, THEN draws the id, so ids and the
--    chain order always agree even when two requests log at the same time.
--  * UPDATE, DELETE and TRUNCATE are blocked by triggers.
--  * Someone with owner-level DB access could rebuild the whole chain, so the
--    head hash is also exported daily outside the database (jobs/auditHead.js).

create sequence audit_log_id_seq;

create table audit_log (
	id            bigint primary key,
	at            timestamptz not null default now(),

	actor_type    text not null check (actor_type in ('user', 'admin', 'device', 'system')),
	actor_id      text,

	action        text not null,
	entity_type   text,
	entity_id     text,
	reason        text,
	details       jsonb not null default '{}'::jsonb,

	prev_hash     text not null,
	hash          text not null
);

create index audit_log_action on audit_log (action);
create index audit_log_entity on audit_log (entity_type, entity_id);
create index audit_log_at on audit_log (at desc);


create or replace function audit_row_hash(
	p_prev_hash     text,
	p_id            bigint,
	p_at            timestamptz,
	p_actor_type    text,
	p_actor_id      text,
	p_action        text,
	p_entity_type   text,
	p_entity_id     text,
	p_reason        text,
	p_details       jsonb
)
returns text
language sql
stable
as $$
	select encode(
		sha256(
			convert_to(
				concat_ws(
					'|',
					p_prev_hash,
					p_id::text,
					(extract(epoch from p_at) * 1000000)::bigint::text,
					p_actor_type,
					coalesce(p_actor_id, ''),
					p_action,
					coalesce(p_entity_type, ''),
					coalesce(p_entity_id, ''),
					coalesce(p_reason, ''),
					p_details::text
				),
				'UTF8'
			)
		),
		'hex'
	);
$$;


create or replace function audit_log_before_insert()
returns trigger
language plpgsql
as $$
declare
	v_prev_hash text;
begin
	-- Only one audit insert at a time, until this transaction ends.
	perform pg_advisory_xact_lock(7431001);

	new.id := nextval('audit_log_id_seq');
	new.at := coalesce(new.at, now());
	new.details := coalesce(new.details, '{}'::jsonb);

	select hash
	into v_prev_hash
	from audit_log
	order by id desc
	limit 1;

	new.prev_hash := coalesce(v_prev_hash, repeat('0', 64));

	new.hash := audit_row_hash(
		new.prev_hash,
		new.id,
		new.at,
		new.actor_type,
		new.actor_id,
		new.action,
		new.entity_type,
		new.entity_id,
		new.reason,
		new.details
	);

	return new;
end;
$$;

create trigger audit_log_chain
	before insert on audit_log
	for each row execute function audit_log_before_insert();


create or replace function audit_log_block_changes()
returns trigger
language plpgsql
as $$
begin
	raise exception 'audit_log is append-only: % is not allowed', tg_op;
end;
$$;

create trigger audit_log_no_update_delete
	before update or delete on audit_log
	for each row execute function audit_log_block_changes();

create trigger audit_log_no_truncate
	before truncate on audit_log
	for each statement execute function audit_log_block_changes();
