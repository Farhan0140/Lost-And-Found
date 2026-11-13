/**
 * Generates include/root_ca.h — the root certificates the kiosk trusts for HTTPS.
 *
 *     node tools/make_root_ca.mjs
 *
 * The certificates come from Node's built-in Mozilla root store (the same list browsers
 * use), so nothing is typed by hand. The default list covers:
 *
 *   - ISRG Root X1 / X2      Let's Encrypt   (Render, most free hosts)
 *   - GTS Root R1 – R4       Google Trust Services (Render, Google Cloud)
 *   - DigiCert Global Root G2 (Azure, many others)
 *
 * Hosting the backend somewhere else? Add the name of its root CA to ROOTS and re-run.
 * You can see a site's root CA in the browser: padlock → certificate → top of the chain.
 */

import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const ROOTS = [
	'ISRG Root X1',
	'ISRG Root X2',
	'GTS Root R1',
	'GTS Root R2',
	'GTS Root R3',
	'GTS Root R4',
	'DigiCert Global Root G2',
];

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, '..', 'include', 'root_ca.h');

const found = [];

for (const pem of tls.rootCertificates) {
	const certificate = new X509Certificate(pem);
	const commonName = certificate.subject.match(/CN=([^\n]*)/)?.[1];

	if (ROOTS.includes(commonName)) {
		found.push({ name: commonName, validTo: certificate.validTo, pem: pem.trim() });
	}
}

const missing = ROOTS.filter((name) => !found.some((item) => item.name === name));

if (missing.length > 0) {
	console.error(`Not in this Node version's root store: ${missing.join(', ')}`);
	process.exit(1);
}

found.sort((a, b) => ROOTS.indexOf(a.name) - ROOTS.indexOf(b.name));

const lines = [
	'/**',
	' * Root certificates trusted for HTTPS (GENERATED — do not edit by hand).',
	' *',
	' *     node tools/make_root_ca.mjs',
	' *',
	...found.map((item) => ` *   - ${item.name.padEnd(26)} valid until ${item.validTo}`),
	' */',
	'',
	'#pragma once',
	'',
	'// mbedTLS reads several PEM certificates from one string.',
	'static const char ROOT_CA_BUNDLE[] =',
];

for (const item of found) {
	lines.push(`\t// ${item.name}`);

	for (const line of item.pem.split('\n')) {
		lines.push(`\t"${line}\\n"`);
	}
}

lines.push('\t;', '');

fs.writeFileSync(output, lines.join('\n'));

console.log(`Wrote ${path.relative(process.cwd(), output)} with ${found.length} certificates.`);
