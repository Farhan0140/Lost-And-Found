/**
 * Shows which Gemini models each configured key can reach, and checks the model names
 * in .env against that list. Model names change and get retired; a wrong name is a
 * 404 at demo time.
 *
 *     npm run list-models
 */

import { config } from '../src/config/env.js';
import { listModels } from '../src/modules/ai/geminiClient.js';

const wanted = [
	...config.models.EXTRACTION.map((model) => ['GEMINI_MODEL_EXTRACTION', model]),
	...config.models.FOLLOWUPS.map((model) => ['GEMINI_MODEL_FOLLOWUPS', model]),
	...config.models.QUESTIONS.map((model) => ['GEMINI_MODEL_QUESTIONS', model]),
	['GEMINI_MODEL_EMBEDDING', config.models.EMBEDDING],
];

if (config.ai.keys.length === 0) {
	console.log('\nNo GEMINI_API_KEY1..10 set in .env.\n');
	process.exit(1);
}

for (const { slot, key } of config.ai.keys) {
	console.log(`\n── Key #${slot} ─────────────────────────────────────────────`);

	try {
		const models = await listModels({ key });

		const names = new Set(models.map((model) => model.name.replace(/^models\//, '')));

		const usable = models
			.filter((model) =>
				(model.supportedGenerationMethods ?? []).some((method) =>
					['generateContent', 'embedContent', 'batchEmbedContents'].includes(method),
				),
			)
			.map((model) => model.name.replace(/^models\//, ''))
			.sort();

		console.log(`  ${usable.length} usable models:`);
		console.log(`  ${usable.join(', ')}`);

		console.log('\n  Your .env models:');

		for (const [variable, model] of wanted) {
			const ok = names.has(model);

			console.log(
				`    ${ok ? '✔' : '✖'} ${variable.padEnd(26)} ${model}${ok ? '' : '   ← NOT available for this key'}`,
			);
		}
	} catch (error) {
		console.log(`  ✖ Failed: ${error.kind ?? ''} ${error.message}`);
	}
}

console.log('');
