/**
 * Registers a new ESP32 kiosk with its lockers and prints its secret ONCE.
 * (Admins can do the same from the dashboard: Admin → Lockers → Devices.)
 *
 *     npm run create-device -- KIOSK-02 "Library kiosk" 4 B
 *                              ^id      ^name           ^lockers ^label prefix (B1..B4)
 */

import { pool, withTransaction } from '../src/db/pool.js';
import { randomToken, sha256Hex } from '../src/lib/crypto.js';
import { auditSystem } from '../src/modules/audit/audit.service.js';

const [id, name = 'Locker kiosk', count = '4', prefix = 'L'] = process.argv.slice(2);

if (!id || !/^[A-Z0-9-]{3,24}$/.test(id)) {
	console.log(
		'\nUsage: npm run create-device -- <ID like KIOSK-02> "<name>" <locker count> <label prefix>\n',
	);
	process.exit(1);
}

const lockerCount = Number(count);
const secret = `sfd_${randomToken(24)}`;

try {
	await withTransaction(async (client) => {
		await client.query('insert into devices (id, name, secret_hash) values ($1, $2, $3)', [
			id,
			name,
			sha256Hex(secret),
		]);

		for (let slot = 1; slot <= lockerCount; slot++) {
			await client.query('insert into lockers (device_id, slot, label) values ($1, $2, $3)', [
				id,
				slot,
				`${prefix}${slot}`,
			]);
		}

		await auditSystem(client, 'device.created', 'device', id, { lockerCount, prefix });
	});

	console.log(`\n✔ Device ${id} created with lockers ${prefix}1–${prefix}${lockerCount}`);
	console.log(`  Device secret: ${secret}`);
	console.log('  Enter both in the ESP32 setup portal. The secret is shown ONCE.\n');
} catch (error) {
	console.log(
		`\n✖ ${error.code === '23505' ? 'That device ID or a locker label already exists.' : error.message}\n`,
	);
	process.exitCode = 1;
} finally {
	await pool.end();
}
