/**
 * ADMIN-TIME script (D1): asks the capable model (GEMINI_MODEL_QUESTIONS) to draft a
 * question set + aspect list for categories, and saves each one as a DRAFT.
 * Drafts are NEVER auto-activated — review them in Admin → Question sets, then activate.
 *
 *     npm run generate-question-sets -- laptop tablet       (specific category slugs)
 *     npm run generate-question-sets -- --generic           (every category still on the generic set)
 */

import { pool } from '../src/db/pool.js';
import { draftQuestionSet } from '../src/modules/ai/questionSetGenerator.js';
import { auditSystem } from '../src/modules/audit/audit.service.js';

const args = process.argv.slice(2);

let slugs = args.filter((arg) => !arg.startsWith('--'));

if (args.includes('--generic')) {
	const { rows } = await pool.query(
		'select slug from categories where not is_fully_written order by sort_order',
	);

	slugs = rows.map((row) => row.slug);
}

if (slugs.length === 0) {
	console.log('\nUsage: npm run generate-question-sets -- <slug> [slug …]   or   -- --generic\n');
	await pool.end();
	process.exit(1);
}

for (const slug of slugs) {
	const { rows } = await pool.query('select id, name from categories where slug = $1', [slug]);
	const category = rows[0];

	if (!category) {
		console.log(`✖ ${slug}: unknown category`);
		continue;
	}

	process.stdout.write(`… ${category.name}: drafting with AI `);

	try {
		const draft = await draftQuestionSet(category.name);

		const version = await pool.query(
			'select coalesce(max(version), 0) + 1 as version from question_sets where category_id = $1',
			[category.id],
		);

		const inserted = await pool.query(
			`
			insert into question_sets (category_id, version, status, questions, aspects, source, ai_model, notes)
			values ($1, $2, 'draft', $3, $4, 'ai', $5, 'AI draft from generate-question-sets — review before activating')
			returning id
			`,
			[
				category.id,
				version.rows[0].version,
				JSON.stringify(draft.questions),
				JSON.stringify(draft.aspects),
				draft.model,
			],
		);

		await auditSystem(
			null,
			'question_set.ai_draft_created',
			'question_set',
			inserted.rows[0].id,
			{
				category: slug,
				model: draft.model,
			},
		);

		console.log(
			`✔ draft v${version.rows[0].version} saved (${draft.questions.length} questions, ${draft.aspects.length} aspects)`,
		);
	} catch (error) {
		console.log(`✖ failed: ${error.reason ?? error.message}`);
	}
}

await pool.end();
