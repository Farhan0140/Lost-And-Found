/**
 * People and places.
 *
 *   /admin/university   the dummy university record students register against
 *                       (national IDs are stored only as a keyed hash — never shown)
 *   /admin/users        SmartFind accounts: role, active, password reset
 *   /admin/zones        campus zones used for "where was it found / lost"
 */

import clsx from 'clsx';
import {
	BadgeCheck,
	EyeOff,
	KeyRound,
	MapPinned,
	Pencil,
	Plus,
	Power,
	ShieldCheck,
	Trash2,
	UserCog,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, SkeletonRows } from '../../components/ui/Feedback.jsx';
import {
	Field,
	Input,
	PasswordInput,
	SearchInput,
	Select,
	Switch,
} from '../../components/ui/Form.jsx';
import { PageHeader, Pagination, Table, Tabs } from '../../components/ui/Layout.jsx';
import { Modal, ReasonDialog } from '../../components/ui/Modal.jsx';
import { fieldErrors } from '../../lib/api.js';
import { formatDay, timeAgo } from '../../lib/format.js';
import { useDebounced, usePageTitle } from '../../lib/hooks.js';
import { useAdmin, useZones } from '../../lib/queries.js';
import { Cell, EmptyRow, PAGE_SIZE, Toolbar, useAdminAction } from './shared.jsx';

// ─────────────────────────────────────────────────────────────
//  University record
// ─────────────────────────────────────────────────────────────

const EMPTY_STUDENT = {
	studentId: '',
	nationalId: '',
	fullName: '',
	department: '',
	campusZoneId: '',
};

function StudentModal({ open, student, onClose }) {
	const zones = useZones();
	const editing = Boolean(student);
	const [form, setForm] = useState(EMPTY_STUDENT);

	useEffect(() => {
		if (open) {
			setForm(
				student
					? {
							studentId: student.studentId,
							nationalId: '',
							fullName: student.fullName,
							department: student.department,
							campusZoneId: student.campusZoneId ?? '',
						}
					: EMPTY_STUDENT,
			);
		}
	}, [open, student]);

	const save = useAdminAction({
		success: editing ? 'Student updated' : 'Student added',
		onDone: onClose,
	});

	const errors = fieldErrors(save.error);

	const submit = () => {
		const body = {
			fullName: form.fullName,
			department: form.department,
			campusZoneId: form.campusZoneId ? Number(form.campusZoneId) : null,
			...(form.nationalId ? { nationalId: form.nationalId } : {}),
		};

		if (editing) {
			save.mutate({
				method: 'put',
				path: `/admin/university-students/${encodeURIComponent(student.studentId)}`,
				body,
			});
		} else {
			save.mutate({
				path: '/admin/university-students',
				body: { ...body, studentId: form.studentId, nationalId: form.nationalId },
			});
		}
	};

	const set = (key) => (event) =>
		setForm((current) => ({ ...current, [key]: event.target.value }));

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={editing ? `Edit ${student.studentId}` : 'Add a student'}
			description="Students register with this student ID + national ID."
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button loading={save.isPending} onClick={submit}>
						{editing ? 'Save' : 'Add student'}
					</Button>
				</>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Student ID" required error={errors.studentId}>
					<Input
						value={form.studentId}
						onChange={set('studentId')}
						disabled={editing}
						placeholder="2125051001"
					/>
				</Field>
				<Field
					label="National ID"
					required={!editing}
					hint={
						editing
							? 'Leave empty to keep the current one.'
							: '10, 13 or 17 digits — stored only as a hash.'
					}
					error={errors.nationalId}
				>
					<Input
						value={form.nationalId}
						onChange={set('nationalId')}
						inputMode="numeric"
						autoComplete="off"
					/>
				</Field>
				<Field label="Full name" required error={errors.fullName} className="sm:col-span-2">
					<Input value={form.fullName} onChange={set('fullName')} />
				</Field>
				<Field label="Department" required error={errors.department}>
					<Input value={form.department} onChange={set('department')} placeholder="CSE" />
				</Field>
				<Field label="Home zone" error={errors.campusZoneId}>
					<Select value={form.campusZoneId} onChange={set('campusZoneId')}>
						<option value="">None</option>
						{(zones.data ?? []).map((zone) => (
							<option key={zone.id} value={zone.id}>
								{zone.name}
							</option>
						))}
					</Select>
				</Field>
			</div>
		</Modal>
	);
}

export function AdminUniversity() {
	usePageTitle('University record');

	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const debounced = useDebounced(search, 350);

	const [editing, setEditing] = useState(null); // null = closed, {} = new, student = edit
	const [removing, setRemoving] = useState(null);

	useEffect(() => setPage(1), [debounced]);

	const students = useAdmin('/admin/university-students', {
		search: debounced || undefined,
		page,
		pageSize: PAGE_SIZE,
	});

	const remove = useAdminAction({
		method: 'delete',
		success: 'Student removed from the record',
		onDone: () => setRemoving(null),
	});

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="University record"
				description="The (dummy) university table that registrations are checked against."
				actions={
					<Button icon={Plus} onClick={() => setEditing({})}>
						Add student
					</Button>
				}
			/>

			<Toolbar>
				<div className="w-full sm:w-72">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Student ID or name…"
					/>
				</div>
			</Toolbar>

			{students.isError ? (
				<ErrorState error={students.error} onRetry={students.refetch} />
			) : (
				<Table
					head={[
						'Student ID',
						'Name',
						'Department',
						'Home zone',
						'National ID',
						'Account',
						'',
					]}
					footer={
						students.data && (
							<Pagination
								page={page}
								pageSize={PAGE_SIZE}
								total={students.data.total}
								onChange={setPage}
							/>
						)
					}
				>
					{students.isPending ? (
						<SkeletonRows columns={7} />
					) : students.data.students.length === 0 ? (
						<EmptyRow columns={7} text="No students found." />
					) : (
						students.data.students.map((student) => (
							<tr key={student.studentId}>
								<Cell mono className="text-ink">
									{student.studentId}
								</Cell>
								<Cell className="font-medium text-ink">{student.fullName}</Cell>
								<Cell className="text-muted">{student.department}</Cell>
								<Cell className="text-muted">{student.zoneName ?? '—'}</Cell>
								<Cell>
									{student.hasNationalId ? (
										<Badge tone="neutral" icon={EyeOff}>
											Hashed
										</Badge>
									) : (
										<Badge tone="warn">Missing</Badge>
									)}
								</Cell>
								<Cell>
									{student.registered ? (
										<Badge tone="ok" icon={BadgeCheck}>
											Registered
										</Badge>
									) : (
										<span className="text-xs text-subtle">Not yet</span>
									)}
								</Cell>
								<Cell className="whitespace-nowrap text-right">
									<Button
										size="sm"
										variant="ghost"
										icon={Pencil}
										aria-label="Edit"
										onClick={() => setEditing(student)}
									/>
									<Button
										size="sm"
										variant="ghost"
										icon={Trash2}
										aria-label="Remove"
										onClick={() => setRemoving(student)}
									/>
								</Cell>
							</tr>
						))
					)}
				</Table>
			)}

			<StudentModal
				open={editing !== null}
				student={editing?.studentId ? editing : null}
				onClose={() => setEditing(null)}
			/>

			<ReasonDialog
				open={Boolean(removing)}
				onClose={() => setRemoving(null)}
				loading={remove.isPending}
				variant="danger"
				title={`Remove ${removing?.studentId}?`}
				description="They can no longer register. An existing SmartFind account is not deleted."
				confirmLabel="Remove"
				onConfirm={(reason) =>
					remove.mutate({
						path: `/admin/university-students/${encodeURIComponent(removing.studentId)}`,
						body: { reason },
					})
				}
			/>
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  Users
// ─────────────────────────────────────────────────────────────

export function AdminUsers() {
	usePageTitle('Users');

	const [page, setPage] = useState(1);
	const [role, setRole] = useState('all');
	const [search, setSearch] = useState('');
	const debounced = useDebounced(search, 350);

	const [pending, setPending] = useState(null);
	const [resetFor, setResetFor] = useState(null);
	const [newPassword, setNewPassword] = useState('');

	useEffect(() => setPage(1), [debounced, role]);

	const users = useAdmin('/admin/users', {
		search: debounced || undefined,
		role: role === 'all' ? undefined : role,
		page,
		pageSize: PAGE_SIZE,
	});

	const run = useAdminAction({
		success: () => pending?.success,
		onDone: () => setPending(null),
	});

	const reset = useAdminAction({
		success: 'Password reset',
		onDone: () => {
			setResetFor(null);
			setNewPassword('');
		},
	});

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Users"
				description="Accounts created through registration. Every change needs a reason."
			/>

			<Toolbar>
				<Tabs
					id="user-role"
					value={role}
					onChange={setRole}
					items={[
						{ value: 'all', label: 'All' },
						{ value: 'student', label: 'Students' },
						{ value: 'admin', label: 'Admins' },
					]}
				/>
				<div className="w-full sm:w-72">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Student ID, name or email…"
					/>
				</div>
			</Toolbar>

			{users.isError ? (
				<ErrorState error={users.error} onRetry={users.refetch} />
			) : (
				<Table
					head={['User', 'Role', 'Status', 'Reports', 'Last login', 'Joined', '']}
					footer={
						users.data && (
							<Pagination
								page={page}
								pageSize={PAGE_SIZE}
								total={users.data.total}
								onChange={setPage}
							/>
						)
					}
				>
					{users.isPending ? (
						<SkeletonRows columns={7} />
					) : users.data.users.length === 0 ? (
						<EmptyRow columns={7} text="No users found." />
					) : (
						users.data.users.map((user) => (
							<tr key={user.id} className={clsx(!user.isActive && 'opacity-60')}>
								<Cell>
									<p className="font-medium text-ink">{user.fullName}</p>
									<p className="text-xs text-subtle">
										<span className="font-mono">{user.studentId}</span> ·{' '}
										{user.email}
									</p>
								</Cell>
								<Cell>
									<Badge
										tone={user.role === 'admin' ? 'accent' : 'neutral'}
										icon={user.role === 'admin' ? ShieldCheck : undefined}
									>
										{user.role}
									</Badge>
								</Cell>
								<Cell>
									<Badge tone={user.isActive ? 'ok' : 'bad'} dot>
										{user.isActive ? 'Active' : 'Disabled'}
									</Badge>
								</Cell>
								<Cell className="tabular-nums text-muted">
									{user.reportCount ?? 0}
								</Cell>
								<Cell className="text-muted">
									{user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'}
								</Cell>
								<Cell className="text-muted">{formatDay(user.createdAt)}</Cell>
								<Cell className="whitespace-nowrap text-right">
									<Button
										size="sm"
										variant="ghost"
										icon={UserCog}
										aria-label={
											user.role === 'admin' ? 'Make student' : 'Make admin'
										}
										title={
											user.role === 'admin' ? 'Make student' : 'Make admin'
										}
										onClick={() =>
											setPending({
												path: `/admin/users/${user.id}/role`,
												extra: {
													role:
														user.role === 'admin' ? 'student' : 'admin',
												},
												title:
													user.role === 'admin'
														? `Remove admin rights from ${user.fullName}?`
														: `Make ${user.fullName} an admin?`,
												description:
													'Admins can see every report, follow-up answers and the audit log.',
												label:
													user.role === 'admin'
														? 'Make student'
														: 'Make admin',
												variant: 'primary',
												success: 'Role changed',
											})
										}
									/>
									<Button
										size="sm"
										variant="ghost"
										icon={Power}
										aria-label={
											user.isActive ? 'Disable account' : 'Enable account'
										}
										title={user.isActive ? 'Disable account' : 'Enable account'}
										onClick={() =>
											setPending({
												path: `/admin/users/${user.id}/status`,
												extra: { isActive: !user.isActive },
												title: user.isActive
													? `Disable ${user.fullName}?`
													: `Enable ${user.fullName}?`,
												description: user.isActive
													? 'They are signed out and cannot log in.'
													: 'They can log in again.',
												label: user.isActive ? 'Disable' : 'Enable',
												variant: user.isActive ? 'danger' : 'primary',
												success: user.isActive
													? 'Account disabled'
													: 'Account enabled',
											})
										}
									/>
									<Button
										size="sm"
										variant="ghost"
										icon={KeyRound}
										aria-label="Reset password"
										title="Reset password"
										onClick={() => setResetFor(user)}
									/>
								</Cell>
							</tr>
						))
					)}
				</Table>
			)}

			<ReasonDialog
				open={Boolean(pending)}
				onClose={() => setPending(null)}
				loading={run.isPending}
				variant={pending?.variant}
				title={pending?.title}
				description={pending?.description}
				confirmLabel={pending?.label}
				onConfirm={(reason) =>
					run.mutate({ path: pending.path, body: { ...pending.extra, reason } })
				}
			/>

			<ReasonDialog
				open={Boolean(resetFor)}
				onClose={() => {
					setResetFor(null);
					setNewPassword('');
				}}
				loading={reset.isPending}
				title={`Reset the password of ${resetFor?.fullName}?`}
				description="Tell the student the new password in person. They are signed out everywhere."
				confirmLabel="Reset password"
				onConfirm={(reason) => {
					if (newPassword.length < 8) {
						return;
					}

					reset.mutate({
						path: `/admin/users/${resetFor.id}/reset-password`,
						body: { newPassword, reason },
					});
				}}
			>
				<Field
					label="New password"
					required
					error={newPassword && newPassword.length < 8 ? 'At least 8 characters.' : null}
				>
					<PasswordInput
						value={newPassword}
						onChange={(event) => setNewPassword(event.target.value)}
						autoComplete="new-password"
					/>
				</Field>
			</ReasonDialog>
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  Zones
// ─────────────────────────────────────────────────────────────

const EMPTY_ZONE = { name: '', department: '', building: '', sortOrder: 0 };

function ZoneModal({ open, zone, onClose }) {
	const editing = Boolean(zone?.id);
	const [form, setForm] = useState(EMPTY_ZONE);

	useEffect(() => {
		if (open) {
			setForm(
				editing
					? {
							name: zone.name,
							department: zone.department,
							building: zone.building ?? '',
							sortOrder: zone.sort_order ?? 0,
						}
					: EMPTY_ZONE,
			);
		}
	}, [open, zone, editing]);

	const save = useAdminAction({
		success: editing ? 'Zone updated' : 'Zone added',
		onDone: onClose,
	});
	const errors = fieldErrors(save.error);

	const set = (key) => (event) =>
		setForm((current) => ({ ...current, [key]: event.target.value }));

	const submit = () => {
		const body = {
			name: form.name,
			department: form.department,
			building: form.building || null,
			sortOrder: Number(form.sortOrder) || 0,
		};

		save.mutate(
			editing
				? { method: 'put', path: `/admin/zones/${zone.id}`, body }
				: { path: '/admin/zones', body },
		);
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={editing ? `Edit ${zone.name}` : 'Add a zone'}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button loading={save.isPending} onClick={submit}>
						Save
					</Button>
				</>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Name" required error={errors.name} className="sm:col-span-2">
					<Input value={form.name} onChange={set('name')} placeholder="CSE lab floor" />
				</Field>
				<Field label="Department" required error={errors.department}>
					<Input value={form.department} onChange={set('department')} placeholder="CSE" />
				</Field>
				<Field label="Building" error={errors.building}>
					<Input value={form.building} onChange={set('building')} />
				</Field>
				<Field
					label="Sort order"
					hint="Lower comes first in the list."
					error={errors.sortOrder}
				>
					<Input
						type="number"
						min={0}
						max={1000}
						value={form.sortOrder}
						onChange={set('sortOrder')}
					/>
				</Field>
			</div>
		</Modal>
	);
}

export function AdminZones() {
	usePageTitle('Zones');

	const zones = useAdmin('/admin/zones');
	const [editing, setEditing] = useState(null);
	const [removing, setRemoving] = useState(null);

	const toggle = useAdminAction({ method: 'put', success: 'Zone updated' });
	const remove = useAdminAction({
		method: 'delete',
		success: (result) => result?.message ?? 'Zone removed',
		onDone: () => setRemoving(null),
	});

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Campus zones"
				description="Where items are found or lost. Zones used by reports are hidden instead of deleted."
				actions={
					<Button icon={Plus} onClick={() => setEditing({})}>
						Add zone
					</Button>
				}
			/>

			{zones.isError ? (
				<ErrorState error={zones.error} onRetry={zones.refetch} />
			) : (
				<Table head={['Zone', 'Department', 'Building', 'Reports', 'Visible', '']}>
					{zones.isPending ? (
						<SkeletonRows columns={6} />
					) : zones.data.zones.length === 0 ? (
						<EmptyRow columns={6} text="No zones yet." />
					) : (
						zones.data.zones.map((zone) => (
							<tr key={zone.id} className={clsx(!zone.is_active && 'opacity-60')}>
								<Cell>
									<span className="inline-flex items-center gap-2 font-medium text-ink">
										<MapPinned className="size-4 text-brand" /> {zone.name}
									</span>
								</Cell>
								<Cell className="text-muted">{zone.department}</Cell>
								<Cell className="text-muted">{zone.building ?? '—'}</Cell>
								<Cell className="tabular-nums text-muted">
									{zone.report_count ?? 0}
								</Cell>
								<Cell>
									<Switch
										label={`Show ${zone.name}`}
										checked={zone.is_active}
										disabled={toggle.isPending}
										onChange={(value) =>
											toggle.mutate({
												path: `/admin/zones/${zone.id}`,
												body: { isActive: value },
											})
										}
									/>
								</Cell>
								<Cell className="whitespace-nowrap text-right">
									<Button
										size="sm"
										variant="ghost"
										icon={Pencil}
										aria-label="Edit"
										onClick={() => setEditing(zone)}
									/>
									<Button
										size="sm"
										variant="ghost"
										icon={Trash2}
										aria-label="Delete"
										onClick={() => setRemoving(zone)}
									/>
								</Cell>
							</tr>
						))
					)}
				</Table>
			)}

			<ZoneModal open={editing !== null} zone={editing} onClose={() => setEditing(null)} />

			<ReasonDialog
				open={Boolean(removing)}
				onClose={() => setRemoving(null)}
				loading={remove.isPending}
				variant="danger"
				title={`Delete ${removing?.name}?`}
				description={
					removing?.report_count > 0
						? 'Reports use this zone, so it will be hidden instead of deleted.'
						: 'The zone is removed from the list.'
				}
				confirmLabel="Delete"
				onConfirm={(reason) =>
					remove.mutate({ path: `/admin/zones/${removing.id}`, body: { reason } })
				}
			/>
		</>
	);
}
