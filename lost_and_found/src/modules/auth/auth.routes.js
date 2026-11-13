/**
 * /api/v1/auth
 *
 *   POST /register          studentId, nationalId, email, password
 *   POST /login             studentId, password
 *   POST /refresh           refreshToken           → new access + refresh token
 *   POST /logout            refreshToken
 *   GET  /me                                       → current user + unread notifications
 *   POST /change-password   currentPassword, newPassword
 */

import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { changePassword, getMe, login, register } from './auth.service.js';
import { revokeRefreshToken, rotateRefreshToken } from './tokens.js';

export const authRouter = Router();

const password = z
	.string()
	.min(8, 'must be at least 8 characters')
	.max(128, 'must be at most 128 characters');

export const registerSchema = z.object({
	studentId: z.string().trim().min(3).max(30),
	nationalId: z
		.string()
		.trim()
		.transform((value) => value.replace(/[\s-]/g, ''))
		.refine((value) => /^\d{10}$|^\d{13}$|^\d{17}$/.test(value), 'must be 10, 13 or 17 digits'),
	email: z.email('must be a valid email address').max(120),
	password,
});

export const loginSchema = z.object({
	studentId: z.string().trim().min(1).max(30),
	password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
	refreshToken: z.string().min(10).max(200),
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1).max(128),
	newPassword: password,
});

function clientInfo(req) {
	return {
		ip: req.ip,
		userAgent: req.headers['user-agent'] ?? '',
	};
}

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
	const result = await register(req.body, clientInfo(req));

	res.status(201).json(result);
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
	res.json(await login(req.body, clientInfo(req)));
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res) => {
	res.json(await rotateRefreshToken(req.body.refreshToken, clientInfo(req)));
});

authRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
	await revokeRefreshToken(req.body.refreshToken);

	res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
	res.json(await getMe(req.user.id));
});

authRouter.post(
	'/change-password',
	requireAuth,
	validateBody(changePasswordSchema),
	async (req, res) => {
		await changePassword(req.user.id, req.body);

		res.json({ ok: true });
	},
);
