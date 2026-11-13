/**
 * Log in + register.
 *
 * Registration is checked against the (dummy) university database:
 * the student ID and national ID must match a record there.
 */

import clsx from 'clsx';
import {
	ArrowRight,
	BadgeCheck,
	Fingerprint,
	GraduationCap,
	LockKeyhole,
	Mail,
	ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { Logo } from '../../components/layout/Brand.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Callout } from '../../components/ui/Feedback.jsx';
import { Field, Input, PasswordInput } from '../../components/ui/Form.jsx';
import { ApiError } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { usePageTitle } from '../../lib/hooks.js';

/** Only follow "next" links inside this app (never to another site). */
function safeNext(value) {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

/** Server validation errors → { field: message } */
function fieldErrors(error) {
	if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') {
		return {};
	}

	return Object.fromEntries(
		(error.details.fields ?? []).map((item) => [item.field, item.message]),
	);
}

// ─────────────────────────────────────────────────────────────
//  Shared split layout
// ─────────────────────────────────────────────────────────────

function AuthShell({ title, subtitle, children, footer }) {
	return (
		<div className="relative grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
			{/* decorative side */}
			<div className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
				<div className="aurora" aria-hidden />
				<div className="bg-grid absolute inset-0 opacity-70" aria-hidden />

				<div className="relative flex h-full flex-col justify-between p-12">
					<Logo />

					<div className="[perspective:1200px]">
						{[
							{
								icon: Fingerprint,
								title: 'University-verified',
								text: 'Student ID + national ID check',
								x: 0,
								rotate: -6,
							},
							{
								icon: LockKeyhole,
								title: 'OTP-locked lockers',
								text: 'Single-use codes, 30 / 5 minutes',
								x: 60,
								rotate: 4,
							},
							{
								icon: ShieldCheck,
								title: 'Private by design',
								text: 'No photos stored, hashed IDs',
								x: 20,
								rotate: -2,
							},
						].map((card, index) => (
							<motion.div
								key={card.title}
								initial={{ opacity: 0, x: -40, rotateY: 30 }}
								animate={{ opacity: 1, x: card.x, rotateY: 0, rotate: card.rotate }}
								transition={{
									delay: 0.2 + index * 0.15,
									type: 'spring',
									stiffness: 120,
									damping: 16,
								}}
								whileHover={{ rotate: 0, scale: 1.03, z: 40 }}
								className="glass mb-4 flex w-80 items-center gap-4 rounded-2xl border border-line p-4 shadow-card"
							>
								<span className="grid size-11 place-items-center rounded-xl bg-gradient-brand text-white">
									<card.icon className="size-5" aria-hidden />
								</span>
								<div>
									<p className="font-semibold text-ink">{card.title}</p>
									<p className="text-sm text-muted">{card.text}</p>
								</div>
							</motion.div>
						))}
					</div>

					<p className="text-sm text-subtle">SmartFind · campus lost & found</p>
				</div>
			</div>

			{/* form side */}
			<div className="flex items-center justify-center px-4 py-12 sm:px-8">
				<motion.div
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
					className="w-full max-w-md"
				>
					<h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
					<p className="mt-2 text-muted">{subtitle}</p>

					<div className="mt-8">{children}</div>

					<p className="mt-6 text-center text-sm text-muted">{footer}</p>
				</motion.div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Login
// ─────────────────────────────────────────────────────────────

export function Login() {
	usePageTitle('Log in');

	const { login, isLoggedIn } = useAuth();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const next = safeNext(params.get('next'));

	const [form, setForm] = useState({ studentId: '', password: '' });
	const [error, setError] = useState(null);
	const [busy, setBusy] = useState(false);
	const [shake, setShake] = useState(0);

	if (isLoggedIn) {
		return <Navigate to={next} replace />;
	}

	const submit = async (event) => {
		event.preventDefault();
		setBusy(true);
		setError(null);

		try {
			const user = await login(form.studentId.trim(), form.password);

			toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
			navigate(next, { replace: true });
		} catch (caught) {
			setError(caught);
			setShake((value) => value + 1);
		} finally {
			setBusy(false);
		}
	};

	const errors = fieldErrors(error);

	return (
		<AuthShell
			title="Welcome back"
			subtitle="Log in with your student ID."
			footer={
				<>
					New here?{' '}
					<Link
						to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
						className="font-semibold text-brand hover:underline"
					>
						Create an account
					</Link>
				</>
			}
		>
			<motion.form
				key={shake}
				animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}}
				transition={{ duration: 0.4 }}
				onSubmit={submit}
				className="space-y-4"
			>
				{error && !Object.keys(errors).length && (
					<Callout tone="bad" title={error.message} />
				)}

				<Field label="Student ID" error={errors.studentId}>
					<Input
						icon={GraduationCap}
						autoComplete="username"
						value={form.studentId}
						onChange={(event) => setForm({ ...form, studentId: event.target.value })}
						placeholder="e.g. 2125051001"
						required
					/>
				</Field>

				<Field label="Password" error={errors.password}>
					<PasswordInput
						autoComplete="current-password"
						value={form.password}
						onChange={(event) => setForm({ ...form, password: event.target.value })}
						required
					/>
				</Field>

				<Button
					type="submit"
					size="lg"
					className="w-full"
					loading={busy}
					iconRight={ArrowRight}
				>
					Log in
				</Button>

				<p className="text-center text-xs text-subtle">
					Forgot your password? Ask the admin desk to reset it.
				</p>
			</motion.form>
		</AuthShell>
	);
}

// ─────────────────────────────────────────────────────────────
//  Register
// ─────────────────────────────────────────────────────────────

function passwordStrength(password) {
	let score = 0;

	if (password.length >= 8) score++;
	if (password.length >= 12) score++;
	if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
	if (/\d/.test(password)) score++;
	if (/[^A-Za-z0-9]/.test(password)) score++;

	return Math.min(4, score);
}

export function Register() {
	usePageTitle('Create account');

	const { register, isLoggedIn } = useAuth();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const next = safeNext(params.get('next'));

	const [form, setForm] = useState({
		studentId: '',
		nationalId: '',
		email: '',
		password: '',
		confirm: '',
	});
	const [error, setError] = useState(null);
	const [busy, setBusy] = useState(false);

	if (isLoggedIn) {
		return <Navigate to={next} replace />;
	}

	const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

	const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
	const strength = passwordStrength(form.password);

	const submit = async (event) => {
		event.preventDefault();

		if (form.password !== form.confirm) {
			setError(
				new ApiError(400, 'VALIDATION_FAILED', 'Passwords do not match.', {
					fields: [{ field: 'confirm', message: 'The passwords do not match.' }],
				}),
			);

			return;
		}

		setBusy(true);
		setError(null);

		try {
			const user = await register({
				studentId: form.studentId.trim(),
				nationalId: form.nationalId.trim(),
				email: form.email.trim(),
				password: form.password,
			});

			toast.success(`Welcome to SmartFind, ${user.fullName.split(' ')[0]}! 🎉`);
			navigate(next, { replace: true });
		} catch (caught) {
			setError(caught);
		} finally {
			setBusy(false);
		}
	};

	const errors = fieldErrors(error);

	return (
		<AuthShell
			title="Create your account"
			subtitle="We check your student ID and national ID against the university records."
			footer={
				<>
					Already registered?{' '}
					<Link to="/login" className="font-semibold text-brand hover:underline">
						Log in
					</Link>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-4">
				{error && !Object.keys(errors).length && (
					<Callout tone="bad" title={error.message} />
				)}

				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Student ID" error={errors.studentId} required>
						<Input
							icon={GraduationCap}
							value={form.studentId}
							onChange={update('studentId')}
							autoComplete="username"
							required
						/>
					</Field>

					<Field
						label="National ID"
						error={errors.nationalId}
						hint="10, 13 or 17 digits"
						required
					>
						<Input
							icon={Fingerprint}
							inputMode="numeric"
							value={form.nationalId}
							onChange={update('nationalId')}
							autoComplete="off"
							required
						/>
					</Field>
				</div>

				<Field label="Email" error={errors.email} required>
					<Input
						icon={Mail}
						type="email"
						value={form.email}
						onChange={update('email')}
						autoComplete="email"
						required
					/>
				</Field>

				<Field label="Password" error={errors.password} required>
					<PasswordInput
						value={form.password}
						onChange={update('password')}
						autoComplete="new-password"
						minLength={8}
						required
					/>
				</Field>

				{/* strength meter */}
				{form.password && (
					<div className="-mt-2 flex items-center gap-2">
						<div className="flex flex-1 gap-1">
							{[0, 1, 2, 3].map((index) => (
								<motion.span
									key={index}
									initial={false}
									animate={{ opacity: index < strength ? 1 : 0.25 }}
									className={clsx(
										'h-1.5 flex-1 rounded-full',
										strength <= 1
											? 'bg-bad'
											: strength === 2
												? 'bg-warn'
												: 'bg-ok',
									)}
								/>
							))}
						</div>
						<span className="w-16 text-right text-xs text-muted">
							{['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][strength]}
						</span>
					</div>
				)}

				<Field
					label="Confirm password"
					error={errors.confirm ?? (mismatch ? 'The passwords do not match.' : null)}
					required
				>
					<PasswordInput
						value={form.confirm}
						onChange={update('confirm')}
						autoComplete="new-password"
						required
					/>
				</Field>

				<Button type="submit" size="lg" className="w-full" loading={busy} icon={BadgeCheck}>
					Verify & create account
				</Button>

				<p className="flex items-start gap-2 text-xs text-subtle">
					<ShieldCheck className="mt-px size-4 shrink-0 text-ok" aria-hidden />
					Your national ID is only used for this check and stored as a one-way hash —
					nobody can read it back.
				</p>
			</form>
		</AuthShell>
	);
}
