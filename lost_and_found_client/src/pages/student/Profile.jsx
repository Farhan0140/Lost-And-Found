/**
 * Profile: who you are (from the university record) + change password.
 */

import { useMutation } from '@tanstack/react-query';
import {
	BadgeCheck,
	Building2,
	IdCard,
	KeyRound,
	Mail,
	MapPin,
	ShieldCheck,
	UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Detail } from '../../components/ui/Card.jsx';
import { Field, PasswordInput } from '../../components/ui/Form.jsx';
import { PageHeader, TiltCard } from '../../components/ui/Layout.jsx';
import { api, ApiError, fieldErrors, tokens } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { formatDay } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { useZones } from '../../lib/queries.js';

const MIN_PASSWORD = 8;

function ChangePassword() {
	const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
	const [errors, setErrors] = useState({});

	const change = useMutation({
		mutationFn: () =>
			api.post('/auth/change-password', {
				currentPassword: form.currentPassword,
				newPassword: form.newPassword,
			}),
		onSuccess: (result) => {
			// the server may hand out fresh tokens (other sessions are signed out)
			if (result?.accessToken) {
				tokens.set(result);
			}

			setForm({ currentPassword: '', newPassword: '', confirm: '' });
			toast.success('Password changed');
		},
		onError: (error) => {
			const fields = fieldErrors(error);

			if (Object.keys(fields).length > 0) {
				setErrors(fields);
			} else if (error instanceof ApiError && /PASSWORD/.test(error.code)) {
				setErrors({ currentPassword: error.message });
			} else {
				toast.error(error.message);
			}
		},
	});

	const submit = (event) => {
		event.preventDefault();

		const found = {};

		if (!form.currentPassword) found.currentPassword = 'Enter your current password.';
		if (form.newPassword.length < MIN_PASSWORD)
			found.newPassword = `At least ${MIN_PASSWORD} characters.`;
		if (form.newPassword === form.currentPassword && form.newPassword)
			found.newPassword = 'Choose a different password.';
		if (form.confirm !== form.newPassword) found.confirm = 'The passwords do not match.';

		setErrors(found);

		if (Object.keys(found).length === 0) {
			change.mutate();
		}
	};

	const set = (key) => (event) => {
		setForm((current) => ({ ...current, [key]: event.target.value }));
		setErrors((current) => ({ ...current, [key]: undefined }));
	};

	return (
		<Card title="Change password" icon={KeyRound}>
			<form onSubmit={submit} className="space-y-4" noValidate>
				<Field label="Current password" error={errors.currentPassword}>
					<PasswordInput
						value={form.currentPassword}
						onChange={set('currentPassword')}
						autoComplete="current-password"
					/>
				</Field>
				<Field
					label="New password"
					hint={`At least ${MIN_PASSWORD} characters.`}
					error={errors.newPassword}
				>
					<PasswordInput
						value={form.newPassword}
						onChange={set('newPassword')}
						autoComplete="new-password"
					/>
				</Field>
				<Field label="Repeat new password" error={errors.confirm}>
					<PasswordInput
						value={form.confirm}
						onChange={set('confirm')}
						autoComplete="new-password"
					/>
				</Field>
				<div className="flex justify-end">
					<Button type="submit" loading={change.isPending}>
						Update password
					</Button>
				</div>
			</form>
		</Card>
	);
}

export function Profile() {
	usePageTitle('Profile');

	const { user } = useAuth();
	const zones = useZones();

	const zone = zones.data?.find((item) => item.id === user?.campusZoneId);

	const initials = (user?.fullName ?? '?')
		.split(' ')
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join('')
		.toUpperCase();

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader
				title="Profile"
				description="Your details come from the university record and cannot be edited here."
			/>

			<div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
				<TiltCard className="rounded-3xl" max={6}>
					<div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card">
						<div className="absolute inset-0 aurora opacity-60" aria-hidden />

						<div className="relative flex items-center gap-4 [transform:translateZ(30px)]">
							<motion.span
								initial={{ scale: 0.6, rotate: -20 }}
								animate={{ scale: 1, rotate: 0 }}
								transition={{ type: 'spring', stiffness: 200, damping: 14 }}
								className="grid size-16 place-items-center rounded-2xl bg-gradient-brand text-xl font-extrabold text-white shadow-[0_12px_30px_-10px_var(--glow)]"
							>
								{initials}
							</motion.span>
							<div className="min-w-0">
								<p className="truncate text-xl font-extrabold text-ink">
									{user?.fullName}
								</p>
								<div className="mt-1 flex flex-wrap gap-2">
									<Badge tone="ok" icon={BadgeCheck}>
										Verified student
									</Badge>
									{user?.role === 'admin' && (
										<Badge tone="accent" icon={ShieldCheck}>
											Admin
										</Badge>
									)}
								</div>
							</div>
						</div>

						<dl className="relative mt-6 grid gap-4 sm:grid-cols-2">
							<Detail label="Student ID">
								<span className="inline-flex items-center gap-1.5 font-mono">
									<IdCard className="size-4 text-subtle" /> {user?.studentId}
								</span>
							</Detail>
							<Detail label="Department">
								<span className="inline-flex items-center gap-1.5">
									<Building2 className="size-4 text-subtle" />{' '}
									{user?.department ?? '—'}
								</span>
							</Detail>
							<Detail label="Email">
								<span className="inline-flex items-center gap-1.5 break-all">
									<Mail className="size-4 shrink-0 text-subtle" />{' '}
									{user?.email ?? '—'}
								</span>
							</Detail>
							<Detail label="Home zone">
								<span className="inline-flex items-center gap-1.5">
									<MapPin className="size-4 text-subtle" /> {zone?.name ?? '—'}
								</span>
							</Detail>
							<Detail label="Member since">
								<span className="inline-flex items-center gap-1.5">
									<UserRound className="size-4 text-subtle" />{' '}
									{formatDay(user?.createdAt)}
								</span>
							</Detail>
						</dl>
					</div>
				</TiltCard>

				<ChangePassword />
			</div>
		</div>
	);
}
