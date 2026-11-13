/**
 * Re-computes every audit-log hash and checks every link of the chain.
 *
 *     npm run verify-audit
 *
 * Compare the printed head hash with the copies exported daily to logs/audit-head.log
 * (and your hosting log stream): a full-chain rewrite by someone with database owner
 * access would change the head.
 */

import { pool } from '../src/db/pool.js';
import { getAuditHead, verifyAuditChain } from '../src/modules/audit/audit.service.js';

const result = await verifyAuditChain();
const head = await getAuditHead();

if (result.ok) {
	console.log(`\n✔ Audit chain intact — ${result.checked} entries checked`);
} else {
	console.log(`\n✖ Audit chain BROKEN at entry ${result.firstBrokenId}: ${result.problem}`);
	process.exitCode = 1;
}

if (head) {
	console.log(`  Head: id=${head.id}  hash=${head.hash}  at=${head.at.toISOString()}\n`);
}

await pool.end();
