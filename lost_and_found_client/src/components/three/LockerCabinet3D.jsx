/**
 * The smart-locker kiosk in 3D (react-three-fiber).
 *
 *     <LockerCabinet3D lockers={[{ label: 'L1', slot: 1, status: 'available', online: true }]}
 *         highlight="L1" demo onSelect={(label) => …} />
 *
 * - One door per locker, hinged on the left; it swings open smoothly.
 * - A status LED strip on each door uses the locker status colour.
 * - The highlighted locker pulses and its door opens (e.g. "your item is in L1").
 * - `demo` opens random doors now and then (landing page).
 * - Drag to rotate (snaps back). Everything is built from primitives and canvas
 *   textures — no model or font files are downloaded.
 *
 * Loaded lazily through components/LockerScene.jsx (three.js is a big chunk).
 */

import {
	ContactShadows,
	Float,
	PresentationControls,
	RoundedBox,
	Sparkles,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { lockerStatus } from '../../lib/statuses.js';

// ─────────────────────────────────────────────────────────────
//  Sizes (metres-ish; the camera is set up for these)
// ─────────────────────────────────────────────────────────────

const CELL_W = 1;
const CELL_H = 0.82;
const DEPTH = 0.9;
const WALL = 0.05;

// ─────────────────────────────────────────────────────────────
//  Palette per theme
// ─────────────────────────────────────────────────────────────

function palette(dark) {
	return dark
		? {
				body: '#1d1a30',
				inside: '#0f0d1c',
				door: '#2c2848',
				handle: '#b8b2d6',
				label: '#f1effa',
				kiosk: '#16142a',
				key: '#3a3560',
				shadow: '#000000',
			}
		: {
				body: '#d8d4ea',
				inside: '#bdb7d6',
				door: '#f7f6fc',
				handle: '#5b5772',
				label: '#2a2640',
				kiosk: '#e8e5f4',
				key: '#c9c3e2',
				shadow: '#3a3550',
			};
}

// ─────────────────────────────────────────────────────────────
//  Canvas textures (labels + LCD), no font files needed
// ─────────────────────────────────────────────────────────────

function useTextTexture(
	text,
	{ color, background = null, width = 256, height = 128, size = 64, mono = false },
) {
	// accepts ['LINE 1', 'LINE 2'] or a plain string ("ENTER CODE", or with \n for two lines)
	const lines = Array.isArray(text) ? text : String(text ?? '').split('\n');
	const key = lines.join('\n');

	return useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d');

		if (background) {
			context.fillStyle = background;
			context.fillRect(0, 0, width, height);
		}

		context.fillStyle = color;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.font = `700 ${size}px ${mono ? '"JetBrains Mono", monospace' : '"Plus Jakarta Sans", system-ui, sans-serif'}`;

		const lineHeight = size * 1.15;
		const top = height / 2 - ((lines.length - 1) * lineHeight) / 2;

		lines.forEach((line, index) => context.fillText(line, width / 2, top + index * lineHeight));

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;

		return texture;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, color, background, width, height, size, mono]);
}

// ─────────────────────────────────────────────────────────────
//  One locker (compartment + hinged door)
// ─────────────────────────────────────────────────────────────

function Locker({ locker, position, colors, open, highlight, interactive, onSelect }) {
	const hinge = useRef(null);
	const led = useRef(null);
	const item = useRef(null);

	const [hovered, setHovered] = useState(false);

	const status = lockerStatus(locker.status, locker.online);
	const labelTexture = useTextTexture([locker.label], { color: colors.label, size: 72 });

	const hasItem = ['occupied', 'needs_emptying'].includes(locker.status);

	// open = 100°, hover peeks 18°
	const target = open ? -1.75 : hovered && interactive ? -0.32 : 0;

	useFrame((state, delta) => {
		if (hinge.current) {
			hinge.current.rotation.y = THREE.MathUtils.damp(
				hinge.current.rotation.y,
				target,
				5,
				delta,
			);
		}

		if (led.current) {
			const pulse = highlight ? 1.6 + Math.sin(state.clock.elapsedTime * 5) * 0.9 : 1.1;

			led.current.emissiveIntensity = pulse;
		}

		if (item.current) {
			item.current.rotation.y += delta * 0.4;
		}
	});

	const width = CELL_W - WALL;
	const height = CELL_H - WALL;

	return (
		<group position={position}>
			{/* inside of the compartment */}
			<mesh position={[0, 0, -DEPTH / 2 + 0.03]}>
				<planeGeometry args={[width, height]} />
				<meshStandardMaterial color={colors.inside} roughness={0.9} />
			</mesh>

			{/* the stored item (a small glowing parcel) */}
			{hasItem && (
				<group ref={item} position={[0, -height / 2 + 0.17, -0.05]}>
					<RoundedBox args={[0.38, 0.28, 0.3]} radius={0.04}>
						<meshStandardMaterial
							color={status.color}
							roughness={0.4}
							metalness={0.1}
						/>
					</RoundedBox>
				</group>
			)}

			{/* inner light so an open locker glows in its status colour */}
			<pointLight
				position={[0, height / 2 - 0.1, 0]}
				color={status.color}
				intensity={open ? 1.8 : 0.0}
				distance={1.4}
			/>

			{/* door, hinged on the left edge */}
			<group ref={hinge} position={[-width / 2, 0, DEPTH / 2]}>
				<group position={[width / 2, 0, 0]}>
					<RoundedBox
						args={[width - 0.02, height - 0.02, 0.045]}
						radius={0.025}
						smoothness={3}
						onPointerOver={(event) => {
							if (!interactive) {
								return;
							}

							event.stopPropagation();
							setHovered(true);
							document.body.style.cursor = 'pointer';
						}}
						onPointerOut={() => {
							setHovered(false);
							document.body.style.cursor = '';
						}}
						onClick={(event) => {
							if (!interactive) {
								return;
							}

							event.stopPropagation();
							onSelect?.(locker.label);
						}}
					>
						<meshStandardMaterial
							color={colors.door}
							metalness={0.55}
							roughness={0.32}
							emissive={highlight ? status.color : '#000000'}
							emissiveIntensity={highlight ? 0.12 : 0}
						/>
					</RoundedBox>

					{/* label */}
					<mesh position={[-0.05, 0.02, 0.026]}>
						<planeGeometry args={[0.42, 0.21]} />
						<meshBasicMaterial map={labelTexture} transparent toneMapped={false} />
					</mesh>

					{/* status LED strip */}
					<mesh position={[-0.05, height / 2 - 0.1, 0.026]}>
						<boxGeometry args={[0.5, 0.035, 0.01]} />
						<meshStandardMaterial
							ref={led}
							color={status.color}
							emissive={status.color}
							emissiveIntensity={1.1}
							toneMapped={false}
						/>
					</mesh>

					{/* handle */}
					<mesh position={[width / 2 - 0.12, 0, 0.05]}>
						<boxGeometry args={[0.035, 0.26, 0.04]} />
						<meshStandardMaterial
							color={colors.handle}
							metalness={0.9}
							roughness={0.2}
						/>
					</mesh>

					{/* keyhole / sensor dot */}
					<mesh position={[width / 2 - 0.12, -0.2, 0.03]}>
						<circleGeometry args={[0.022, 20]} />
						<meshStandardMaterial
							color={status.color}
							emissive={status.color}
							emissiveIntensity={0.8}
							toneMapped={false}
						/>
					</mesh>
				</group>
			</group>
		</group>
	);
}

// ─────────────────────────────────────────────────────────────
//  The kiosk panel (LCD + keypad) next to the lockers
// ─────────────────────────────────────────────────────────────

function KioskPanel({ position, height, colors, message }) {
	const lcd = useTextTexture(message, {
		color: '#22d3ee',
		background: '#06121a',
		width: 320,
		height: 160,
		size: 30,
		mono: true,
	});

	const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

	return (
		<group position={position}>
			<RoundedBox
				args={[0.62, height, DEPTH * 0.7]}
				radius={0.04}
				position={[0, 0, -DEPTH * 0.15]}
			>
				<meshStandardMaterial color={colors.kiosk} metalness={0.4} roughness={0.45} />
			</RoundedBox>

			{/* LCD */}
			<mesh position={[0, height / 2 - 0.28, DEPTH * 0.2 + 0.005]}>
				<planeGeometry args={[0.48, 0.24]} />
				<meshBasicMaterial map={lcd} toneMapped={false} />
			</mesh>

			{/* keypad 4 × 3 */}
			{keys.map((key, index) => {
				const column = index % 3;
				const row = Math.floor(index / 3);

				return (
					<RoundedBox
						key={key}
						args={[0.12, 0.09, 0.03]}
						radius={0.015}
						position={[
							(column - 1) * 0.15,
							height / 2 - 0.58 - row * 0.12,
							DEPTH * 0.2 + 0.015,
						]}
					>
						<meshStandardMaterial
							color={key === '#' ? '#8b5cf6' : colors.key}
							emissive={key === '#' ? '#8b5cf6' : '#000000'}
							emissiveIntensity={key === '#' ? 0.6 : 0}
							metalness={0.3}
							roughness={0.5}
						/>
					</RoundedBox>
				);
			})}
		</group>
	);
}

// ─────────────────────────────────────────────────────────────
//  Cabinet (walls + lockers + kiosk)
// ─────────────────────────────────────────────────────────────

function Cabinet({ lockers, dark, highlight, demo, interactive, onSelect, kioskMessage }) {
	const colors = palette(dark);

	const columns = lockers.length <= 4 ? 2 : 4;
	const rows = Math.max(1, Math.ceil(lockers.length / columns));

	const width = columns * CELL_W;
	const height = rows * CELL_H;

	// ── demo: open a random door every few seconds ──
	const [demoOpen, setDemoOpen] = useState(null);

	useEffect(() => {
		if (!demo || lockers.length === 0) {
			return undefined;
		}

		const timer = setInterval(() => {
			setDemoOpen((current) => {
				if (current) {
					return null;
				}

				return lockers[Math.floor(Math.random() * lockers.length)].label;
			});
		}, 2200);

		return () => clearInterval(timer);
	}, [demo, lockers]);

	const walls = useMemo(() => {
		const list = [];

		// outer walls
		list.push({
			args: [width + WALL * 2, WALL, DEPTH],
			position: [0, height / 2 + WALL / 2, 0],
		});
		list.push({
			args: [width + WALL * 2, WALL, DEPTH],
			position: [0, -height / 2 - WALL / 2, 0],
		});
		list.push({ args: [WALL, height, DEPTH], position: [-width / 2 - WALL / 2, 0, 0] });
		list.push({ args: [WALL, height, DEPTH], position: [width / 2 + WALL / 2, 0, 0] });
		list.push({ args: [width, height, WALL], position: [0, 0, -DEPTH / 2] });

		// dividers
		for (let column = 1; column < columns; column++) {
			list.push({
				args: [WALL, height, DEPTH],
				position: [-width / 2 + column * CELL_W, 0, 0],
			});
		}

		for (let row = 1; row < rows; row++) {
			list.push({ args: [width, WALL, DEPTH], position: [0, height / 2 - row * CELL_H, 0] });
		}

		return list;
	}, [width, height, columns, rows]);

	return (
		<group position={[-0.36, 0, 0]}>
			{walls.map((wall, index) => (
				<mesh key={index} position={wall.position}>
					<boxGeometry args={wall.args} />
					<meshStandardMaterial color={colors.body} metalness={0.5} roughness={0.4} />
				</mesh>
			))}

			{/* plinth */}
			<RoundedBox
				args={[width + 0.3, 0.14, DEPTH + 0.1]}
				radius={0.04}
				position={[0, -height / 2 - 0.14, 0]}
			>
				<meshStandardMaterial color={colors.body} metalness={0.6} roughness={0.35} />
			</RoundedBox>

			{lockers.map((locker, index) => {
				const column = index % columns;
				const row = Math.floor(index / columns);

				return (
					<Locker
						key={locker.label}
						locker={locker}
						colors={colors}
						position={[
							-width / 2 + CELL_W / 2 + column * CELL_W,
							height / 2 - CELL_H / 2 - row * CELL_H,
							0,
						]}
						open={
							locker.label === highlight ||
							locker.label === demoOpen ||
							locker.status === 'open_unresolved'
						}
						highlight={locker.label === highlight}
						interactive={interactive}
						onSelect={onSelect}
					/>
				);
			})}

			<KioskPanel
				position={[width / 2 + 0.45, -0.03, 0]}
				height={Math.max(height, 1.5)}
				colors={colors}
				message={kioskMessage}
			/>
		</group>
	);
}

// ─────────────────────────────────────────────────────────────
//  Canvas
// ─────────────────────────────────────────────────────────────

export default function LockerCabinet3D({
	lockers,
	dark = true,
	highlight = null,
	demo = false,
	interactive = true,
	floating = true,
	sparkles = false,
	onSelect,
	kioskMessage = ['SMARTFIND', 'ENTER CODE'],
	reduceMotion = false,
}) {
	const columns = lockers.length <= 4 ? 2 : 4;
	const rows = Math.max(1, Math.ceil(lockers.length / columns));

	// pull the camera back for bigger cabinets
	const distance = 4.6 + Math.max(columns - 2, rows - 2) * 0.9;

	const scene = (
		<Cabinet
			lockers={lockers}
			dark={dark}
			highlight={highlight}
			demo={demo && !reduceMotion}
			interactive={interactive}
			onSelect={onSelect}
			kioskMessage={kioskMessage}
		/>
	);

	return (
		<Canvas
			dpr={[1, 2]}
			camera={{ position: [0.4, 0.5, distance], fov: 35 }}
			gl={{ antialias: true, alpha: true }}
			aria-label="3D view of the smart lockers"
		>
			<ambientLight intensity={dark ? 0.55 : 0.9} />
			<directionalLight position={[3, 5, 4]} intensity={dark ? 1.3 : 1.6} />
			<pointLight
				position={[-4, 1, 3]}
				intensity={dark ? 14 : 6}
				color="#8b5cf6"
				distance={12}
			/>
			<pointLight
				position={[4, -1, 3]}
				intensity={dark ? 10 : 4}
				color="#22d3ee"
				distance={12}
			/>

			<PresentationControls
				global={false}
				cursor={interactive}
				snap
				speed={1.4}
				zoom={1}
				rotation={[0.08, -0.32, 0]}
				polar={[-0.25, 0.25]}
				azimuth={[-0.75, 0.75]}
			>
				{floating && !reduceMotion ? (
					<Float speed={1.6} rotationIntensity={0.15} floatIntensity={0.35}>
						{scene}
					</Float>
				) : (
					scene
				)}
			</PresentationControls>

			{sparkles && !reduceMotion && (
				<Sparkles count={40} scale={[6, 4, 3]} size={2.2} speed={0.35} color="#a78bfa" />
			)}

			<ContactShadows
				position={[0, -(rows * CELL_H) / 2 - 0.3, 0]}
				opacity={dark ? 0.55 : 0.3}
				scale={8}
				blur={2.6}
				far={3}
				color={palette(dark).shadow}
			/>
		</Canvas>
	);
}
