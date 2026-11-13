/**
 * Every prompt sent to Gemini, in one file, so they can be reviewed and printed.
 * `promptHash()` is stored with each generation (provider, model, prompt hash).
 */

import { sha256Hex } from '../../lib/crypto.js';

export function promptHash(...parts) {
	return sha256Hex(
		parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n'),
	);
}

// ─────────────────────────────────────────────────────────────
//  1. Photo extraction — decides the category + prefills the frozen answers
// ─────────────────────────────────────────────────────────────

export const EXTRACTION_SYSTEM = `
You help a university lost-and-found service describe an item from photos.

Your job:
1. Decide which CATEGORY the item belongs to (pick exactly one slug from the list).
2. Answer that category's questions using ONLY what is visible in the photos.
   - Use ONLY the option codes listed for each question.
   - single_select: give exactly one code. multi_select: give every code that applies.
   - If something is not visible or you are unsure, give ["dont_know"].
3. brand_text: the brand/logo you can read, or "" if none is visible.
4. distinctive_marks: one short neutral sentence about visible unique marks
   (stickers, scratches, keychains). Do NOT include any text, names or numbers
   written on the item, and never describe cards or ID documents.
5. confidence: 0..1, how sure you are about the category.

Never transcribe card numbers, ID numbers, names, phone numbers or addresses.
`.trim();

/** Compact listing of categories → questions → allowed codes. */
export function describeCategoriesForExtraction(categories) {
	return categories
		.map((category) => {
			const questions = category.questions
				.filter((question) => question.type !== 'text')
				.map((question) => {
					if (question.type === 'brand') {
						return `  - ${question.key} (brand): use brand_text instead`;
					}

					const codes = question.options.map((option) => option.code).join(', ');

					return `  - ${question.key} (${question.type}): "${question.text}" codes: ${codes}`;
				})
				.join('\n');

			return `CATEGORY ${category.slug} — ${category.name}\n${questions}`;
		})
		.join('\n\n');
}

export function extractionUserPrompt(categories, imageRoles) {
	return [
		`There are ${imageRoles.length} photo(s). Their roles, in order: ${imageRoles.join(', ')}.`,
		'(overview = whole item, detail = close-up, brand_label = logo/label,',
		' damage = marks or damage, contents = what is inside)',
		'',
		describeCategoriesForExtraction(categories),
	].join('\n');
}

// ─────────────────────────────────────────────────────────────
//  2. Follow-up questions — aspect-tagged, per report, private
// ─────────────────────────────────────────────────────────────

export const FOLLOWUPS_SYSTEM = `
You write short follow-up questions for a university lost-and-found report.
They capture item-specific details so a FINDER's report and an OWNER's report can
be compared later.

Rules:
- Write 3 or 4 questions, each about a DIFFERENT aspect from the given aspect list.
- Each question's "aspect" must be one of the aspect keys given.
- Each option's "code" must be one of the value codes listed for that aspect.
  Give 2 to 6 options per question; the label may be reworded naturally.
- Do NOT add "none", "other" or "don't remember" options — the app adds them.
- At least ONE question must be about an aspect the item probably does NOT have,
  so that "none" is a normal answer.
- Neutral wording. Never ask for or mention names, ID numbers, phone numbers,
  addresses, card numbers, passwords or anything written on the item.
- Questions must be answerable from memory by the owner AND by the finder looking at it.
`.trim();

export function followupsUserPrompt({
	kind,
	categoryName,
	aspects,
	answerSummary,
	distinctiveMarks,
	hasPhotos,
}) {
	const aspectLines = aspects
		.map((aspect) => {
			const codes = aspect.values.map((value) => value.code).join(', ');

			return `- ${aspect.key} (${aspect.label}): ${codes}`;
		})
		.join('\n');

	const who =
		kind === 'found'
			? 'The FINDER is holding the item now.'
			: 'The OWNER is describing it from memory (they do not have it).';

	return [
		`Category: ${categoryName}`,
		who,
		hasPhotos
			? 'Photos of the item are attached.'
			: 'There are no photos; rely on the answers.',
		'',
		'Answers already given:',
		answerSummary || '(none)',
		'',
		`Distinctive marks: ${distinctiveMarks || '(none given)'}`,
		'',
		'Aspect list (key: allowed value codes):',
		aspectLines,
	].join('\n');
}

// ─────────────────────────────────────────────────────────────
//  3. Question-set generation — ADMIN TIME ONLY (D1)
// ─────────────────────────────────────────────────────────────

export const QUESTION_SET_SYSTEM = `
You draft a FROZEN question set for one category of a university lost-and-found system.
A finder (holding the item) and an owner (remembering it) both answer the SAME questions,
and their answers are compared by exact option codes.

Rules:
- 8 to 11 questions, mostly single_select / multi_select with 3–8 options each.
- Include one "brand" question (type "brand", no options) if the category has brands.
- Include one "text" question with key "distinctive_marks" and match_weight 0.
- Every question must be answerable by BOTH sides. Reject anything that needs the item
  in hand or powered on (serial numbers, IMEI, screen contents, passwords).
- match_weight is INVERSE to how common the answer is: rare, discriminating details
  (damage, attachments) get higher weight; colour gets low weight.
  Weights of all non-text questions must sum to about 1.0.
- canon: "colour" for colour questions, "size" for size, "material" for material,
  "damage" for damage/marks, otherwise null.
- Keys and option codes: lowercase snake_case.
- Also write about 8 ASPECTS (key, label, 4–7 value codes each) for item-specific
  follow-up questions (e.g. case, sticker, crack, engraving, accessories, wear).
- Never ask for names, ID numbers or any personal data.
`.trim();

export function questionSetUserPrompt(categoryName) {
	return `Category: ${categoryName}\nDraft the question set and the aspect list.`;
}
