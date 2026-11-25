/**
 * Lockers + kiosk devices.
 *
 *   /admin/lockers   live 3D cabinet; click a locker → sensors + actions
 *                    (force open · confirm emptied · clear "door left open" · maintenance)
 *   /admin/devices   ESP32 kiosks: online state, health, events, create / rotate secret
 *
 * Every action asks for a reason (saved in the audit log).
 */

import clsx from 'clsx';
import {
	Activity,
	Cpu,
	DoorOpen,
	Eraser,
	KeyRound,
	Lock,
	LockOpen,
	Package,
	PackageOpen,
	Plus,
	Power,
	ShieldAlert,
	Wifi,
	WifiOff,
	Wrench,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';

import { LockerLegend, LockerScene } from '../../components/LockerScene.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Detail } from '../../components/ui/Card.jsx';
import {
	Callout,
	EmptyState,
	ErrorState,
	PageLoader,
	SkeletonRows,
} from '../../components/ui/Feedback.jsx';
import { Field, Input } from '../../components/ui/Form.jsx';
import { CopyButton, PageHeader, Table } from '../../components/ui/Layout.jsx';
import { Modal, ReasonDialog } from '../../components/ui/Modal.jsx';
import { formatDateTime, humanize, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { useAdmin } from '../../lib/queries.js';
import { lockerStatus } from '../../lib/statuses.js';
import { toSceneLockers } from './Overview.jsx';
import { Cell, EmptyRow, useAdminAction } from './shared.jsx';

// ─────────────────────────────────────────────────────────────
//  Lockers
// ─────────────────────────────────────────────────────────────

function Sensor({ label, on, onText, offText, icon: Icon }) {
	return (
		<div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3 py-2">
			<Icon
				className={clsx(
					'size-4',
					on === null || on === undefined ? 'text-subtle' : on ? 'text-ok' : 'text-warn',
				)}
				aria-hidden
			/>
			<div>
				<p className="text-xs text-subtle">{label}</p>
				<p className="text-sm font-semibold text-ink">
					{on === null || on === undefined ? '—' : on ? onText : offText}
				</p>
			</div>
		</div>
	);
}

/** Actions available for a locker in its current state. */
function actionsFor(locker) {
	const list = [
		{
			key: 'force-open',
			label: 'Force open',
			icon: DoorOpen,
			variant: 'danger',
			title: `Open locker ${locker.label} now?`,
			description:
				'The kiosk opens the door on its next poll (about a second). Use for stuck doors or desk returns.',
			success: (result) => result?.message ?? 'Open command sent',
		},
	];

	if (locker.status === 'needs_emptying') {
		list.push({
			key: 'confirm-emptied',
			label: 'Confirm emptied',
			icon: Eraser,
			variant: 'primary',
			title: `Locker ${locker.label} is empty?`,
			description: 'Marks the locker free again after you took the item out.',
			success: 'Locker is free again',
		});
	}

	if (locker.status === 'open_unresolved') {
		list.push({
			key: 'clear-unresolved',
			label: 'Clear "door left open"',
			icon: ShieldAlert,
			variant: 'primary',
			title: `Clear the alert on ${locker.label}?`,
			description: 'Use after you checked the locker and closed the door.',
			success: 'Alert cleared',
		});
	}

	if (locker.status === 'available') {
		list.push({
			key: 'maintenance',
			body: { on: true },
			label: 'Start maintenance',
			icon: Wrench,
			variant: 'outline',
			title: `Put ${locker.label} into maintenance?`,
			description: 'The locker is no longer handed out to finders until maintenance ends.',
			success: 'Maintenance started',
		});
	}

	if (locker.status === 'maintenance') {
		list.push({
			key: 'maintenance',
			body: { on: false },
			label: 'End maintenance',
			icon: Wrench,
			variant: 'primary',
			title: `End maintenance on ${locker.label}?`,
			description: 'The locker becomes available again.',
			success: 'Maintenance ended',
		});
	}

	return list;
}

function LockerDetail({ locker, onAction }) {
	const status = lockerStatus(locker.status, locker.deviceOnline);

	return (
		<motion.div
			key={locker.id}
			initial={{ opacity: 0, x: 16 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: -16 }}
			className="space-y-4"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span
						className="grid size-12 place-items-center rounded-2xl font-mono text-lg font-bold text-white shadow-lg"
						style={{ background: status.color }}
					>
						{locker.label}
					</span>
					<div>
						<p className="font-bold text-ink">Locker {locker.label}</p>
						<p className="text-xs text-subtle">
							{locker.deviceName} · slot {locker.slot}
						</p>
					</div>
				</div>
				<Badge tone={status.tone} dot>
					{status.label}
				</Badge>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Sensor
					label="Door"
					on={locker.doorClosed}
					onText="Closed"
					offText="Open"
					icon={locker.doorClosed ? Lock : LockOpen}
				/>
				<Sensor
					label="Servo"
					on={locker.servoLocked}
					onText="Locked"
					offText="Unlocked"
					icon={KeyRound}
				/>
				<Sensor
					label="Item sensor"
					on={locker.itemPresent === null ? null : !locker.itemPresent}
					onText="Empty"
					offText="Item inside"
					icon={locker.itemPresent ? Package : PackageOpen}
				/>
				<Sensor
					label="Kiosk"
					on={locker.deviceOnline}
					onText="Online"
					offText="Offline"
					icon={locker.deviceOnline ? Wifi : WifiOff}
				/>
			</div>

			<p className="text-xs text-subtle">
				Sensors updated {timeAgo(locker.sensorsUpdatedAt)}
			</p>

			{locker.doorOpenedAt && (
				<Callout tone="warn" icon={DoorOpen}>
					Door open since {formatDateTime(locker.doorOpenedAt)}
				</Callout>
			)}

			{locker.currentReport && (
				<Link
					to={`/admin/reports/${locker.currentReport.id}`}
					className="block rounded-xl border border-line bg-surface-2/40 p-3 transition-colors hover:border-brand/50"
				>
					<p className="text-xs text-subtle">Current item</p>
					<p className="font-semibold text-ink">
						{locker.currentReport.category ?? 'Item'}{' '}
						<span className="text-sm font-normal text-muted">
							· {humanize(locker.currentReport.status)}
						</span>
					</p>
					{locker.currentReport.storedAt && (
						<p className="text-xs text-subtle">
							Stored {timeAgo(locker.currentReport.storedAt)}
						</p>
					)}
				</Link>
			)}

			<div className="flex flex-wrap gap-2 border-t border-line pt-4">
				{actionsFor(locker).map((action) => (
					<Button
						key={action.label}
						size="sm"
						variant={action.variant}
						icon={action.icon}
						onClick={() => onAction(action)}
					>
						{action.label}
					</Button>
				))}
			</div>
		</motion.div>
	);
}

export function AdminLockers() {
	usePageTitle('Lockers');

	const lockers = useAdmin('/admin/lockers', undefined, { refetchInterval: 4000 });
	const [selectedLabel, setSelectedLabel] = useState(null);
	const [pending, setPending] = useState(null);

	const run = useAdminAction({
		success: (result) =>
			typeof pending?.success === 'function' ? pending.success(result) : pending?.success,
		onDone: () => setPending(null),
	});

	if (lockers.isPending) {
		return <PageLoader label="Loading lockers…" />;
	}

	if (lockers.isError) {
		return <ErrorState error={lockers.error} onRetry={lockers.refetch} />;
	}

	const list = lockers.data.lockers;
	const selected = list.find((locker) => locker.label === selectedLabel);

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Lockers"
				description="Live state from the kiosks, updated the moment a door or item changes. Click a locker to manage it."
			/>

			<div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
				<Card padded={false} className="overflow-hidden">
					<LockerScene
						lockers={toSceneLockers(list)}
						highlight={selectedLabel}
						onSelect={(label) =>
							setSelectedLabel((current) => (current === label ? null : label))
						}
						className="h-[420px]"
					/>
					<LockerLegend className="border-t border-line px-5 py-3" />
				</Card>

				<Card>
					<AnimatePresence mode="wait">
						{selected ? (
							<LockerDetail
								key={selected.id}
								locker={selected}
								onAction={setPending}
							/>
						) : (
							<EmptyState
								key="none"
								icon={Lock}
								title="Pick a locker"
								description="Click a door in the 3D view or a row below."
								className="border-none"
							/>
						)}
					</AnimatePresence>
				</Card>
			</div>

			<Table
				className="mt-6"
				head={['Locker', 'Status', 'Door', 'Item', 'Current report', 'Kiosk']}
			>
				{list.length === 0 ? (
					<EmptyRow columns={6} text="No lockers yet — add a kiosk under Devices." />
				) : (
					list.map((locker) => {
						const status = lockerStatus(locker.status, locker.deviceOnline);

						return (
							<tr
								key={locker.id}
								onClick={() => setSelectedLabel(locker.label)}
								className={clsx(
									'cursor-pointer',
									locker.label === selectedLabel && 'bg-brand/6',
								)}
							>
								<Cell mono className="font-bold text-ink">
									{locker.label}
								</Cell>
								<Cell>
									<Badge tone={status.tone} dot>
										{status.label}
									</Badge>
								</Cell>
								<Cell className="text-muted">
									{locker.doorClosed === null
										? '—'
										: locker.doorClosed
											? 'Closed'
											: 'Open'}
								</Cell>
								<Cell className="text-muted">
									{locker.itemPresent === null
										? '—'
										: locker.itemPresent
											? 'Yes'
											: 'No'}
								</Cell>
								<Cell className="text-muted">
									{locker.currentReport?.category ?? '—'}
								</Cell>
								<Cell className="text-muted">{locker.deviceId}</Cell>
							</tr>
						);
					})
				)}
			</Table>

			<ReasonDialog
				open={Boolean(pending)}
				onClose={() => setPending(null)}
				loading={run.isPending}
				variant={pending?.variant === 'danger' ? 'danger' : 'primary'}
				title={pending?.title}
				description={pending?.description}
				confirmLabel={pending?.label}
				onConfirm={(reason) =>
					run.mutate({
						path: `/admin/lockers/${selected.id}/${pending.key}`,
						body: { ...(pending.body ?? {}), reason },
					})
				}
			/>
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  Devices
// ─────────────────────────────────────────────────────────────

function SecretModal({ secret, onClose }) {
	return (
		<Modal
			open={Boolean(secret)}
			onClose={onClose}
			title={`Secret for ${secret?.deviceId}`}
			description={secret?.warning}
			footer={<Button onClick={onClose}>I saved it</Button>}
		>
			<div className="space-y-3">
				<div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
					<code className="min-w-0 flex-1 break-all font-mono text-sm text-ink">
						{secret?.secret}
					</code>
					<CopyButton value={secret?.secret ?? ''} />
				</div>
				<p className="text-xs text-subtle">
					On the ESP32: hold the setup button while powering on, join the
					“SmartFind-Setup” Wi-Fi and paste the device ID and this secret.
				</p>
			</div>
		</Modal>
	);
}

function CreateDeviceModal({ open, onClose, onCreated }) {
	const [form, setForm] = useState({ id: '', name: '', lockerCount: 4, labelPrefix: 'L' });

	const create = useAdminAction({
		success: 'Kiosk added',
		onDone: (result) => {
			onCreated(result);
			setForm({ id: '', name: '', lockerCount: 4, labelPrefix: 'L' });
		},
	});

	const set =
		(key, transform = (value) => value) =>
		(event) =>
			setForm((current) => ({ ...current, [key]: transform(event.target.value) }));

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Add a kiosk"
			description="Creates the device and its lockers. The secret is shown once."
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						loading={create.isPending}
						onClick={() =>
							create.mutate({
								path: '/admin/devices',
								body: { ...form, lockerCount: Number(form.lockerCount) },
							})
						}
					>
						Create kiosk
					</Button>
				</>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Device ID" hint="e.g. KIOSK-02" required>
					<Input
						value={form.id}
						onChange={set('id', (value) => value.toUpperCase())}
						placeholder="KIOSK-02"
					/>
				</Field>
				<Field label="Name" required>
					<Input value={form.name} onChange={set('name')} placeholder="Library kiosk" />
				</Field>
				<Field label="Number of lockers" hint="1–16">
					<Input
						type="number"
						min={1}
						max={16}
						value={form.lockerCount}
						onChange={set('lockerCount')}
					/>
				</Field>
				<Field label="Label prefix" hint="Lockers become L1, L2, … (1–3 letters)">
					<Input
						value={form.labelPrefix}
						maxLength={3}
						onChange={set('labelPrefix', (value) => value.toUpperCase())}
					/>
				</Field>
			</div>
		</Modal>
	);
}

function EventsModal({ deviceId, onClose }) {
	const events = useAdmin(`/admin/devices/${deviceId}/events`, undefined, {
		enabled: Boolean(deviceId),
		refetchInterval: 5000,
	});

	return (
		<Modal
			open={Boolean(deviceId)}
			onClose={onClose}
			title={`Events · ${deviceId}`}
			description="Latest events reported by the kiosk."
			size="xl"
		>
			<div className="max-h-[60vh] overflow-auto rounded-xl border border-line">
				<table className="w-full text-left text-sm">
					<thead className="sticky top-0 border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-subtle">
						<tr>
							<th className="px-3 py-2">#</th>
							<th className="px-3 py-2">Type</th>
							<th className="px-3 py-2">Slot</th>
							<th className="px-3 py-2">Data</th>
							<th className="px-3 py-2">Received</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{events.isPending ? (
							<SkeletonRows rows={6} columns={5} />
						) : (events.data?.events ?? []).length === 0 ? (
							<EmptyRow columns={5} text="No events yet." />
						) : (
							events.data.events.map((event) => (
								<tr key={event.id}>
									<td className="px-3 py-2 font-mono text-xs text-subtle">
										{event.seq}
									</td>
									<td className="px-3 py-2 font-mono text-xs text-brand">
										{event.type}
									</td>
									<td className="px-3 py-2 text-muted">{event.slot ?? '—'}</td>
									<td className="px-3 py-2 font-mono text-xs text-muted">
										{event.data ? JSON.stringify(event.data) : '—'}
									</td>
									<td className="px-3 py-2 text-xs text-muted">
										{timeAgo(event.received_at)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</Modal>
	);
}

export function AdminDevices() {
	usePageTitle('Devices');

	const devices = useAdmin('/admin/devices', undefined, { refetchInterval: 10_000 });

	const [creating, setCreating] = useState(false);
	const [secret, setSecret] = useState(null);
	const [eventsFor, setEventsFor] = useState(null);
	const [pending, setPending] = useState(null);

	const run = useAdminAction({
		success: (result) => (pending?.kind === 'rotate' ? null : pending?.success),
		onDone: (result) => {
			if (pending?.kind === 'rotate') {
				setSecret(result);
			}

			setPending(null);
		},
	});

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Kiosk devices"
				description="ESP32 locker kiosks. A kiosk is offline when it missed three heartbeats (≈ 90 s)."
				actions={
					<Button icon={Plus} onClick={() => setCreating(true)}>
						Add kiosk
					</Button>
				}
			/>

			{devices.isError ? (
				<ErrorState error={devices.error} onRetry={devices.refetch} />
			) : devices.isPending ? (
				<div className="grid gap-4 md:grid-cols-2">
					<div className="skeleton h-56 rounded-2xl" />
					<div className="skeleton h-56 rounded-2xl" />
				</div>
			) : devices.data.devices.length === 0 ? (
				<EmptyState
					icon={Cpu}
					title="No kiosks yet"
					description="Add the first ESP32 kiosk to create its lockers."
				/>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{devices.data.devices.map((device, index) => (
						<motion.div
							key={device.id}
							initial={{ opacity: 0, y: 14 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: index * 0.06 }}
						>
							<Card
								title={device.name}
								description={device.id}
								icon={Cpu}
								action={
									<Badge
										tone={
											!device.isActive
												? 'neutral'
												: device.online
													? 'ok'
													: 'bad'
										}
										dot
										pulse={device.online}
									>
										{!device.isActive
											? 'Disabled'
											: device.online
												? 'Online'
												: 'Offline'}
									</Badge>
								}
							>
								<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
									<Detail label="Lockers">{device.lockerCount}</Detail>
									<Detail label="Firmware">{device.firmware ?? '—'}</Detail>
									<Detail label="Wi-Fi">
										{device.rssi ? `${device.rssi} dBm` : '—'}
									</Detail>
									<Detail label="Free memory">
										{device.freeHeap
											? `${Math.round(device.freeHeap / 1024)} KB`
											: '—'}
									</Detail>
									<Detail label="Uptime">
										{device.uptimeMs
											? `${Math.round(device.uptimeMs / 60000)} min`
											: '—'}
									</Detail>
									<Detail label="Last seen">
										{device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'Never'}
									</Detail>
									<Detail label="IP">{device.ip ?? '—'}</Detail>
									<Detail label="Pending commands">
										{device.pendingCommands ?? 0}
									</Detail>
									{device.kioskLockedUntil && (
										<Detail label="Keypad locked until">
											{formatDateTime(device.kioskLockedUntil)}
										</Detail>
									)}
								</dl>

								<div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
									<Button
										size="sm"
										variant="outline"
										icon={Activity}
										onClick={() => setEventsFor(device.id)}
									>
										Events
									</Button>
									<Button
										size="sm"
										variant="outline"
										icon={KeyRound}
										onClick={() =>
											setPending({
												kind: 'rotate',
												device,
												path: `/admin/devices/${device.id}/rotate-secret`,
												method: 'post',
												title: `New secret for ${device.id}?`,
												description:
													'The old secret stops working immediately — the kiosk goes offline until you enter the new one.',
												label: 'Rotate secret',
												variant: 'danger',
											})
										}
									>
										Rotate secret
									</Button>
									<Button
										size="sm"
										variant={device.isActive ? 'ghost' : 'primary'}
										icon={Power}
										onClick={() =>
											setPending({
												kind: 'toggle',
												device,
												path: `/admin/devices/${device.id}`,
												method: 'patch',
												extra: { isActive: !device.isActive },
												title: device.isActive
													? `Disable ${device.id}?`
													: `Enable ${device.id}?`,
												description: device.isActive
													? 'The kiosk is refused by the server and its lockers are not handed out.'
													: 'The kiosk can connect again.',
												label: device.isActive ? 'Disable' : 'Enable',
												variant: device.isActive ? 'danger' : 'primary',
												success: device.isActive
													? 'Kiosk disabled'
													: 'Kiosk enabled',
											})
										}
									>
										{device.isActive ? 'Disable' : 'Enable'}
									</Button>
								</div>
							</Card>
						</motion.div>
					))}
				</div>
			)}

			<CreateDeviceModal
				open={creating}
				onClose={() => setCreating(false)}
				onCreated={(result) => {
					setCreating(false);
					setSecret(result);
				}}
			/>

			<SecretModal secret={secret} onClose={() => setSecret(null)} />
			<EventsModal deviceId={eventsFor} onClose={() => setEventsFor(null)} />

			<ReasonDialog
				open={Boolean(pending)}
				onClose={() => setPending(null)}
				loading={run.isPending}
				variant={pending?.variant}
				title={pending?.title}
				description={pending?.description}
				confirmLabel={pending?.label}
				onConfirm={(reason) =>
					run.mutate({
						path: pending.path,
						method: pending.method,
						body: { ...(pending.extra ?? {}), reason },
					})
				}
			/>
		</>
	);
}
