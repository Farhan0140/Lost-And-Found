/**
 * PLACEHOLDER campus zones (Q8). Admins can rename, add or remove them from the
 * dashboard (Admin → Campus zones). Replace with the real UITS buildings later.
 *
 * Location affinity: same zone 1.0 · same department (different zone) 0.6 · else 0.3
 */

export const ZONES = [
	{ name: 'Main gate & reception', department: 'Administration', building: 'Main building' },
	{ name: 'Admin office floor', department: 'Administration', building: 'Main building' },
	{ name: 'Auditorium', department: 'Administration', building: 'Main building' },

	{ name: 'Central library', department: 'Library', building: 'Main building' },
	{ name: 'Library reading room', department: 'Library', building: 'Main building' },

	{ name: 'CSE lab floor', department: 'CSE', building: 'Academic building A' },
	{ name: 'CSE classrooms', department: 'CSE', building: 'Academic building A' },

	{ name: 'EEE lab floor', department: 'EEE', building: 'Academic building A' },
	{ name: 'EEE classrooms', department: 'EEE', building: 'Academic building A' },

	{ name: 'Business classrooms', department: 'Business', building: 'Academic building B' },
	{ name: 'English & law classrooms', department: 'Arts', building: 'Academic building B' },

	{ name: 'Cafeteria', department: 'Student services', building: 'Ground floor' },
	{ name: 'Prayer room', department: 'Student services', building: 'Ground floor' },
	{ name: 'Common room', department: 'Student services', building: 'Ground floor' },

	{ name: 'Parking & outside area', department: 'Outdoor', building: null },
];
