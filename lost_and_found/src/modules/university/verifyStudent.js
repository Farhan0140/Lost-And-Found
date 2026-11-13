/**
 * The university check (§5.1), behind ONE function so a real university API can
 * replace the dummy table later without touching any caller:
 *
 *     verifyStudent({ studentId, nationalIdHash })
 *         → { verified: true, fullName, department, campusZoneId }   on a match
 *         → null                                                      otherwise
 *
 * ASSUMPTION (stated in the report): the university database is SIMULATED by the
 * `university_students` table, which only admins can edit.
 */

import { query } from '../../db/pool.js';
import { safeEqualHex } from '../../lib/crypto.js';

export async function verifyStudent({ studentId, nationalIdHash }) {
	const { rows } = await query(
		`
		select student_id, national_id_hash, full_name, department, campus_zone_id
		from university_students
		where lower(student_id) = lower($1)
		`,
		[studentId],
	);

	const record = rows[0];

	if (!record || !safeEqualHex(record.national_id_hash, nationalIdHash)) {
		return null;
	}

	return {
		verified: true,
		studentId: record.student_id,
		fullName: record.full_name,
		department: record.department,
		campusZoneId: record.campus_zone_id,
	};
}
