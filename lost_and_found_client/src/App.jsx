/**
 * All routes.
 *
 *   /                       landing (3D lockers, how it works)
 *   /login  /register       auth
 *   /lockers                live locker view (public)
 *
 *   /dashboard              my reports (drafts · active · closed)
 *   /reports/new            choose "I found" / "I lost"
 *   /reports/:id            report page (drafts open the step-by-step editor)
 *   /matches/:id            owner's match page + collection code
 *   /notifications          all notifications
 *   /profile                account + password
 *
 *   /admin/…                admin dashboard (lazy-loaded)
 *
 * Notification links from the server use /reports/:id, /admin/review,
 * /admin/lockers and /admin/overflow — keep those paths stable.
 */

import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';

import { AdminLayout, AppLayout, PublicLayout } from './components/layout/Layouts.jsx';
import { PageLoader } from './components/ui/Feedback.jsx';
import { Dashboard } from './pages/student/Dashboard.jsx';
import { MatchPage } from './pages/student/MatchPage.jsx';
import { NewReport } from './pages/student/NewReport.jsx';
import { NotificationsPage } from './pages/student/NotificationsPage.jsx';
import { Profile } from './pages/student/Profile.jsx';
import { ReportPage } from './pages/student/ReportPage.jsx';
import { Landing } from './pages/public/Landing.jsx';
import { LockersPage } from './pages/public/LockersPage.jsx';
import { Login, Register } from './pages/public/Auth.jsx';
import { NotFound, RouteError } from './pages/public/NotFound.jsx';

// ── admin pages: separate chunk, loaded only by admins ──
const admin = (name) =>
	lazy(() => import('./pages/admin/index.js').then((module) => ({ default: module[name] })));

const AdminOverview = admin('AdminOverview');
const AdminReview = admin('AdminReview');
const AdminMatch = admin('AdminMatch');
const AdminReports = admin('AdminReports');
const AdminReport = admin('AdminReport');
const AdminOverflow = admin('AdminOverflow');
const AdminLockers = admin('AdminLockers');
const AdminDevices = admin('AdminDevices');
const AdminUniversity = admin('AdminUniversity');
const AdminUsers = admin('AdminUsers');
const AdminZones = admin('AdminZones');
const AdminQuestionSets = admin('AdminQuestionSets');
const AdminQuestionSet = admin('AdminQuestionSet');
const AdminAudit = admin('AdminAudit');

function lazyPage(Component) {
	return (
		<Suspense fallback={<PageLoader />}>
			<Component />
		</Suspense>
	);
}

export const router = createBrowserRouter([
	{
		errorElement: <RouteError />,
		children: [
			{
				element: <PublicLayout />,
				children: [
					{ path: '/', element: <Landing /> },
					{ path: '/login', element: <Login /> },
					{ path: '/register', element: <Register /> },
					{ path: '/lockers', element: <LockersPage /> },
				],
			},
			{
				element: <AppLayout />,
				children: [
					{ path: '/dashboard', element: <Dashboard /> },
					{ path: '/reports/new', element: <NewReport /> },
					{ path: '/reports/:id', element: <ReportPage /> },
					{ path: '/matches/:id', element: <MatchPage /> },
					{ path: '/notifications', element: <NotificationsPage /> },
					{ path: '/profile', element: <Profile /> },
				],
			},
			{
				path: '/admin',
				element: <AdminLayout />,
				children: [
					{ index: true, element: lazyPage(AdminOverview) },
					{ path: 'review', element: lazyPage(AdminReview) },
					{ path: 'matches/:id', element: lazyPage(AdminMatch) },
					{ path: 'reports', element: lazyPage(AdminReports) },
					{ path: 'reports/:id', element: lazyPage(AdminReport) },
					{ path: 'overflow', element: lazyPage(AdminOverflow) },
					{ path: 'lockers', element: lazyPage(AdminLockers) },
					{ path: 'devices', element: lazyPage(AdminDevices) },
					{ path: 'university', element: lazyPage(AdminUniversity) },
					{ path: 'users', element: lazyPage(AdminUsers) },
					{ path: 'zones', element: lazyPage(AdminZones) },
					{ path: 'question-sets', element: lazyPage(AdminQuestionSets) },
					{ path: 'question-sets/:id', element: lazyPage(AdminQuestionSet) },
					{ path: 'audit', element: lazyPage(AdminAudit) },
				],
			},
			{ path: '*', element: <NotFound /> },
		],
	},
]);
