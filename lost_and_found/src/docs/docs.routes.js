/**
 * Swagger UI for the SmartFind API.
 *
 *   GET /api/docs                 interactive docs ("Try it out" calls this same server)
 *   GET /api/docs/openapi.json    the raw OpenAPI 3.1 document (import into Postman / Insomnia)
 *
 * Turned off with API_DOCS_ENABLED=false in .env.
 */

import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { buildOpenApiSpec } from './openapi.js';

export const DOCS_PATH = '/api/docs';

export const docsRouter = Router();

const spec = buildOpenApiSpec();

// ─────────────────────────────────────────────────────────────
//  Security headers for the docs page
// ─────────────────────────────────────────────────────────────

/**
 * Same as the API's helmet() defaults, except "upgrade-insecure-requests":
 * on http://localhost that header makes the browser fetch the Swagger
 * scripts over https, which fails and leaves a blank page.
 */
export const docsHelmet = helmet({
	contentSecurityPolicy: {
		directives: {
			upgradeInsecureRequests: null,
		},
	},
});

// ─────────────────────────────────────────────────────────────
//  Swagger UI options
// ─────────────────────────────────────────────────────────────

/**
 * Runs IN THE BROWSER after every "Try it out" response (swagger-ui-express
 * copies the function's source into the page — it cannot use outside variables).
 *
 * After a successful login / register / refresh it fills in "Authorize"
 * automatically, so the next request is already logged in.
 */
function autoAuthorize(response) {
	try {
		const isAuthCall = /\/auth\/(login|register|refresh)$/.test(response.url);
		const token = response.body && response.body.accessToken;

		if (isAuthCall && response.ok && token && window.ui) {
			window.ui.preauthorizeApiKey('bearerAuth', token);
		}
	} catch {
		// never break the docs page because of this convenience
	}

	return response;
}

const uiOptions = {
	customSiteTitle: 'SmartFind API docs',
	customCss: '.swagger-ui .topbar { display: none } .swagger-ui .info { margin: 24px 0 }',
	swaggerOptions: {
		persistAuthorization: true, // keep the token after a page reload
		displayRequestDuration: true,
		docExpansion: 'none', // start with every section collapsed
		filter: true, // search box for tags
		tryItOutEnabled: true,
		defaultModelsExpandDepth: 0,
		validatorUrl: null, // no call to validator.swagger.io
		responseInterceptor: autoAuthorize,
	},
};

// ─────────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────────

docsRouter.get('/openapi.json', (req, res) => {
	res.json(spec);
});

// "/api/docs" → "/api/docs/" so the page's relative asset URLs (./swagger-ui.css) resolve.
docsRouter.get('/', (req, res, next) => {
	const path = req.originalUrl.split('?')[0];

	if (!path.endsWith('/')) {
		return res.redirect(301, `${DOCS_PATH}/`);
	}

	next();
});

docsRouter.use('/', swaggerUi.serveFiles(spec, uiOptions), swaggerUi.setup(spec, uiOptions));
