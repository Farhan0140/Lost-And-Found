/**
 * Who is logged in.
 *
 *     const { user, isAdmin, login, logout } = useAuth();
 *
 * On start-up, if a token is stored, the user is loaded from /auth/me.
 * When a refresh fails (session gone) the user is logged out everywhere.
 */

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, onSessionExpired, tokens } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const queryClient = useQueryClient();

	const [user, setUser] = useState(null);

	// 'loading' until we know whether the stored token is still valid
	const [status, setStatus] = useState(tokens.access ? 'loading' : 'ready');

	// ── load the user once at start-up ──
	useEffect(() => {
		if (!tokens.access) {
			return;
		}

		api.get('/auth/me')
			.then((result) => setUser(result.user))
			.catch(() => tokens.clear())
			.finally(() => setStatus('ready'));
	}, []);

	// ── refresh failed somewhere → log out ──
	useEffect(() => {
		return onSessionExpired((error) => {
			setUser(null);
			queryClient.clear();

			if (error?.code === 'REFRESH_TOKEN_REUSED') {
				toast.error(error.message);
			} else {
				toast.info('Your session ended. Please log in again.');
			}
		});
	}, [queryClient]);

	const acceptSession = useCallback((result) => {
		tokens.set(result);
		setUser(result.user);

		return result.user;
	}, []);

	const login = useCallback(
		async (studentId, password) => {
			return acceptSession(
				await api.post('/auth/login', { studentId, password }, { auth: false }),
			);
		},
		[acceptSession],
	);

	const register = useCallback(
		async (form) => {
			return acceptSession(await api.post('/auth/register', form, { auth: false }));
		},
		[acceptSession],
	);

	const logout = useCallback(async () => {
		const refreshToken = tokens.refresh;

		tokens.clear();
		setUser(null);
		queryClient.clear();

		if (refreshToken) {
			// best effort: the token is already gone from this browser
			api.post('/auth/logout', { refreshToken }, { auth: false }).catch(() => {});
		}
	}, [queryClient]);

	const reloadUser = useCallback(async () => {
		const result = await api.get('/auth/me');

		setUser(result.user);

		return result;
	}, []);

	const value = useMemo(
		() => ({
			user,
			status,
			isLoggedIn: Boolean(user),
			isAdmin: user?.role === 'admin',
			login,
			register,
			logout,
			reloadUser,
		}),
		[user, status, login, register, logout, reloadUser],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);

	if (!context) {
		throw new Error('useAuth() must be used inside <AuthProvider>');
	}

	return context;
}
