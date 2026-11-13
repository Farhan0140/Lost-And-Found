/**
 * Page layouts + route guards.
 *
 *   <PublicLayout>   landing, login, register, public lockers
 *   <AppLayout>      everything a logged-in student sees
 *   <AdminLayout>    admin dashboard (sidebar)
 *   <RequireAuth> / <RequireAdmin>   redirect when not allowed
 */

import clsx from 'clsx';
import {
	Archive,
	Boxes,
	ChevronDown,
	ClipboardList,
	Cpu,
	Database,
	FileText,
	GraduationCap,
	LayoutDashboard,
	ListChecks,
	LogOut,
	MapPin,
	Menu,
	PackageOpen,
	Plus,
	ScrollText,
	Shield,
	User,
	Users,
	X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../../lib/auth.jsx';
import { useAdmin } from '../../lib/queries.js';
import { Button } from '../ui/Button.jsx';
import { PageLoader } from '../ui/Feedback.jsx';
import { Logo, ThemeToggle } from './Brand.jsx';
import { NotificationBell } from './NotificationBell.jsx';

// ─────────────────────────────────────────────────────────────
//  Guards
// ─────────────────────────────────────────────────────────────

export function RequireAuth({ children }) {
	const { isLoggedIn, status } = useAuth();
	const location = useLocation();

	if (status === 'loading') {
		return <PageLoader label="Signing you in…" />;
	}

	if (!isLoggedIn) {
		const next = encodeURIComponent(location.pathname + location.search);

		return <Navigate to={`/login?next=${next}`} replace />;
	}

	return children;
}

export function RequireAdmin({ children }) {
	const { isAdmin, status, isLoggedIn } = useAuth();

	if (status === 'loading') {
		return <PageLoader label="Checking access…" />;
	}

	if (!isLoggedIn) {
		return <Navigate to="/login?next=%2Fadmin" replace />;
	}

	if (!isAdmin) {
		return <Navigate to="/dashboard" replace />;
	}

	return children;
}

/** Fades + slides each page in when the route changes. */
function PageTransition({ children }) {
	const location = useLocation();

	useEffect(() => {
		window.scrollTo({ top: 0 });
	}, [location.pathname]);

	return (
		<motion.div
			key={location.pathname}
			initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
			animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
			transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
		>
			{children}
		</motion.div>
	);
}

// ─────────────────────────────────────────────────────────────
//  User menu
// ─────────────────────────────────────────────────────────────

function UserMenu() {
	const { user, isAdmin, logout } = useAuth();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const ref = useRef(null);

	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const onClick = (event) => !ref.current?.contains(event.target) && setOpen(false);

		document.addEventListener('mousedown', onClick);

		return () => document.removeEventListener('mousedown', onClick);
	}, [open]);

	const initials = (user?.fullName ?? '?')
		.split(' ')
		.map((part) => part[0])
		.slice(0, 2)
		.join('')
		.toUpperCase();

	const item =
		'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2';

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-surface-2"
				aria-expanded={open}
				aria-label="Account menu"
			>
				<span className="grid size-8 place-items-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
					{initials}
				</span>
				<ChevronDown
					className={clsx(
						'size-4 text-subtle transition-transform',
						open && 'rotate-180',
					)}
				/>
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -6, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.15 }}
						className="absolute right-0 top-12 z-40 w-64 origin-top-right rounded-2xl border border-line bg-surface p-2 shadow-2xl"
					>
						<div className="border-b border-line px-3 pb-3 pt-1">
							<p className="truncate font-semibold text-ink">{user?.fullName}</p>
							<p className="truncate text-xs text-muted">
								{user?.studentId} · {user?.department}
							</p>
						</div>

						<div className="pt-2" onClick={() => setOpen(false)}>
							<Link to="/profile" className={item}>
								<User className="size-4 text-subtle" /> Profile & password
							</Link>
							{isAdmin && (
								<Link to="/admin" className={item}>
									<Shield className="size-4 text-subtle" /> Admin dashboard
								</Link>
							)}
							<button
								type="button"
								className={clsx(item, 'text-bad')}
								onClick={async () => {
									await logout();
									navigate('/');
								}}
							>
								<LogOut className="size-4" /> Log out
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Top bar (public + student)
// ─────────────────────────────────────────────────────────────

const STUDENT_LINKS = [
	{ to: '/dashboard', label: 'My reports', icon: ClipboardList },
	{ to: '/lockers', label: 'Lockers', icon: Boxes },
];

function TopBar({ links, right }) {
	const [menuOpen, setMenuOpen] = useState(false);
	const location = useLocation();

	useEffect(() => setMenuOpen(false), [location.pathname]);

	return (
		<header className="glass sticky top-0 z-30 border-b border-line">
			<div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
				<Logo />

				<nav className="ml-4 hidden items-center gap-1 md:flex">
					{links.map((link) => (
						<NavLink
							key={link.to}
							to={link.to}
							className={({ isActive }) =>
								clsx(
									'relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
									isActive ? 'text-ink' : 'text-muted hover:text-ink',
								)
							}
						>
							{({ isActive }) => (
								<>
									{link.label}
									{isActive && (
										<motion.span
											layoutId="topbar-active"
											className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gradient-brand"
										/>
									)}
								</>
							)}
						</NavLink>
					))}
				</nav>

				<div className="ml-auto flex items-center gap-1">
					<ThemeToggle />
					{right}
					<button
						type="button"
						className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 md:hidden"
						onClick={() => setMenuOpen((value) => !value)}
						aria-label="Menu"
						aria-expanded={menuOpen}
					>
						{menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
					</button>
				</div>
			</div>

			<AnimatePresence>
				{menuOpen && (
					<motion.nav
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						className="overflow-hidden border-t border-line md:hidden"
					>
						<div className="space-y-1 px-4 py-3">
							{links.map((link) => (
								<NavLink
									key={link.to}
									to={link.to}
									className={({ isActive }) =>
										clsx(
											'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold',
											isActive
												? 'bg-brand/10 text-brand'
												: 'text-ink hover:bg-surface-2',
										)
									}
								>
									{link.icon && <link.icon className="size-4" />}
									{link.label}
								</NavLink>
							))}
						</div>
					</motion.nav>
				)}
			</AnimatePresence>
		</header>
	);
}

// ─────────────────────────────────────────────────────────────
//  Layouts
// ─────────────────────────────────────────────────────────────

export function PublicLayout() {
	const { isLoggedIn } = useAuth();

	return (
		<div className="flex min-h-screen flex-col">
			<TopBar
				links={[{ to: '/lockers', label: 'Live lockers', icon: Boxes }]}
				right={
					isLoggedIn ? (
						<Button as={Link} to="/dashboard" size="sm" className="ml-1">
							My reports
						</Button>
					) : (
						<>
							<Button
								as={Link}
								to="/login"
								variant="ghost"
								size="sm"
								className="hidden sm:inline-flex"
							>
								Log in
							</Button>
							<Button as={Link} to="/register" size="sm" className="ml-1">
								Get started
							</Button>
						</>
					)
				}
			/>

			<main className="flex-1">
				<PageTransition>
					<Outlet />
				</PageTransition>
			</main>

			<Footer />
		</div>
	);
}

export function AppLayout() {
	const { isAdmin } = useAuth();

	const links = isAdmin
		? [...STUDENT_LINKS, { to: '/admin', label: 'Admin', icon: Shield }]
		: STUDENT_LINKS;

	return (
		<RequireAuth>
			<div className="flex min-h-screen flex-col">
				<TopBar
					links={links}
					right={
						<>
							<Button
								as={Link}
								to="/reports/new"
								size="sm"
								icon={Plus}
								className="mx-1 hidden sm:inline-flex"
							>
								New report
							</Button>
							<NotificationBell />
							<UserMenu />
						</>
					}
				/>

				<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
					<PageTransition>
						<Outlet />
					</PageTransition>
				</main>

				{/* floating "new report" button on phones */}
				<Link
					to="/reports/new"
					className="fixed bottom-5 right-5 z-20 grid size-14 place-items-center rounded-2xl bg-gradient-brand text-white shadow-[0_12px_30px_-8px_var(--glow)] sm:hidden"
					aria-label="New report"
				>
					<Plus className="size-6" />
				</Link>
			</div>
		</RequireAuth>
	);
}

const ADMIN_SECTIONS = [
	{
		title: 'Overview',
		links: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }],
	},
	{
		title: 'Matching',
		links: [
			{ to: '/admin/review', label: 'Review queue', icon: ListChecks, badge: 'review' },
			{ to: '/admin/reports', label: 'Reports', icon: FileText },
			{ to: '/admin/overflow', label: 'Oversize items', icon: PackageOpen },
		],
	},
	{
		title: 'Hardware',
		links: [
			{ to: '/admin/lockers', label: 'Lockers', icon: Boxes },
			{ to: '/admin/devices', label: 'Kiosks (ESP32)', icon: Cpu },
		],
	},
	{
		title: 'Data',
		links: [
			{ to: '/admin/university', label: 'University DB', icon: GraduationCap },
			{ to: '/admin/users', label: 'Users', icon: Users },
			{ to: '/admin/zones', label: 'Campus zones', icon: MapPin },
			{ to: '/admin/question-sets', label: 'Question sets', icon: Database },
			{ to: '/admin/audit', label: 'Audit log', icon: ScrollText },
		],
	},
];

function AdminSidebar({ onNavigate }) {
	// small badge with the number of matches waiting for review
	const { data } = useAdmin(
		'/admin/matches',
		{ status: 'review', pageSize: 1 },
		{ refetchInterval: 30_000 },
	);

	const badges = { review: data?.total ?? 0 };

	return (
		<nav className="space-y-6 p-4" onClick={onNavigate}>
			{ADMIN_SECTIONS.map((section) => (
				<div key={section.title}>
					<p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
						{section.title}
					</p>
					<div className="space-y-0.5">
						{section.links.map((link) => (
							<NavLink
								key={link.to}
								to={link.to}
								end={link.end}
								className={({ isActive }) =>
									clsx(
										'relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
										isActive
											? 'text-ink'
											: 'text-muted hover:bg-surface-2 hover:text-ink',
									)
								}
							>
								{({ isActive }) => (
									<>
										{isActive && (
											<motion.span
												layoutId="admin-active"
												className="absolute inset-0 rounded-xl border border-brand/30 bg-brand/10"
												transition={{
													type: 'spring',
													stiffness: 400,
													damping: 34,
												}}
											/>
										)}
										<link.icon
											className={clsx(
												'relative size-4',
												isActive && 'text-brand',
											)}
										/>
										<span className="relative flex-1">{link.label}</span>
										{link.badge && badges[link.badge] > 0 && (
											<span className="relative rounded-md bg-warn/15 px-1.5 text-xs text-warn">
												{badges[link.badge]}
											</span>
										)}
									</>
								)}
							</NavLink>
						))}
					</div>
				</div>
			))}

			<Link
				to="/dashboard"
				className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink"
			>
				<Archive className="size-4" /> Student view
			</Link>
		</nav>
	);
}

export function AdminLayout() {
	const [open, setOpen] = useState(false);

	return (
		<RequireAdmin>
			<div className="flex min-h-screen">
				{/* sidebar (desktop) */}
				<aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
					<div className="flex h-16 items-center gap-2 border-b border-line px-5">
						<Logo to="/admin" />
						<span className="rounded-md bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
							Admin
						</span>
					</div>
					<AdminSidebar />
				</aside>

				{/* sidebar (mobile drawer) */}
				<AnimatePresence>
					{open && (
						<>
							<motion.div
								className="fixed inset-0 z-40 bg-black/50 lg:hidden"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								onClick={() => setOpen(false)}
							/>
							<motion.aside
								className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-line bg-surface lg:hidden"
								initial={{ x: -300 }}
								animate={{ x: 0 }}
								exit={{ x: -300 }}
								transition={{ type: 'spring', stiffness: 380, damping: 36 }}
							>
								<div className="flex h-16 items-center border-b border-line px-5">
									<Logo to="/admin" />
								</div>
								<AdminSidebar onNavigate={() => setOpen(false)} />
							</motion.aside>
						</>
					)}
				</AnimatePresence>

				<div className="flex min-w-0 flex-1 flex-col">
					<header className="glass sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line px-4 sm:px-6">
						<button
							type="button"
							className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 lg:hidden"
							onClick={() => setOpen(true)}
							aria-label="Open menu"
						>
							<Menu className="size-5" />
						</button>

						<div className="ml-auto flex items-center gap-1">
							<ThemeToggle />
							<NotificationBell />
							<UserMenu />
						</div>
					</header>

					<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
						<PageTransition>
							<Outlet />
						</PageTransition>
					</main>
				</div>
			</div>
		</RequireAdmin>
	);
}

function Footer() {
	return (
		<footer className="border-t border-line">
			<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-subtle sm:flex-row">
				<p>SmartFind · Team TwoByFour · UITS CSE capstone</p>
				<p>
					Photos are never stored on our server. National IDs are kept only as a one-way
					hash.
				</p>
			</div>
		</footer>
	);
}
