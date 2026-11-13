/**
 * DUMMY university student database (§1, §5.1).
 *
 * These national IDs are FAKE test values, listed here in plain text ONLY so the team
 * can register test accounts. The seed stores them as HMAC-SHA256 — the raw value is
 * never written to the database.
 *
 * To register in the web app, use a Student ID + its National ID from this list.
 */

export const UNIVERSITY_STUDENTS = [
	// ── CSE ──
	{
		studentId: '2125051001',
		nationalId: '1990000001',
		fullName: 'Farhan Nadim',
		department: 'CSE',
	},
	{
		studentId: '2125051002',
		nationalId: '1990000002',
		fullName: 'Md Hasnine Kabir',
		department: 'CSE',
	},
	{
		studentId: '2125051003',
		nationalId: '1990000003',
		fullName: 'Sanjid Ahmed',
		department: 'CSE',
	},
	{
		studentId: '2125051004',
		nationalId: '1990000004',
		fullName: 'Adibul Asam',
		department: 'CSE',
	},
	{
		studentId: '2125051005',
		nationalId: '1990000005',
		fullName: 'Nusrat Jahan',
		department: 'CSE',
	},
	{
		studentId: '2125051006',
		nationalId: '1990000006',
		fullName: 'Tanvir Hasan',
		department: 'CSE',
	},
	{
		studentId: '2125051007',
		nationalId: '1990000007',
		fullName: 'Sadia Islam',
		department: 'CSE',
	},
	{
		studentId: '2125051008',
		nationalId: '1990000008',
		fullName: 'Rafiul Karim',
		department: 'CSE',
	},
	{
		studentId: '2125051009',
		nationalId: '1990000009',
		fullName: 'Mehjabin Akter',
		department: 'CSE',
	},
	{
		studentId: '2125051010',
		nationalId: '1990000010',
		fullName: 'Arif Chowdhury',
		department: 'CSE',
	},

	// ── EEE ──
	{
		studentId: '2125061001',
		nationalId: '1990000011',
		fullName: 'Shahriar Alam',
		department: 'EEE',
	},
	{
		studentId: '2125061002',
		nationalId: '1990000012',
		fullName: 'Farzana Rahman',
		department: 'EEE',
	},
	{
		studentId: '2125061003',
		nationalId: '1990000013',
		fullName: 'Imran Hossain',
		department: 'EEE',
	},
	{
		studentId: '2125061004',
		nationalId: '1990000014',
		fullName: 'Tasnim Sultana',
		department: 'EEE',
	},
	{
		studentId: '2125061005',
		nationalId: '1990000015',
		fullName: 'Rakib Uddin',
		department: 'EEE',
	},

	// ── Business ──
	{
		studentId: '2125071001',
		nationalId: '1990000016',
		fullName: 'Nabila Haque',
		department: 'Business',
	},
	{
		studentId: '2125071002',
		nationalId: '1990000017',
		fullName: 'Mahmudul Hasan',
		department: 'Business',
	},
	{
		studentId: '2125071003',
		nationalId: '1990000018',
		fullName: 'Jannatul Ferdous',
		department: 'Business',
	},
	{
		studentId: '2125071004',
		nationalId: '1990000019',
		fullName: 'Sakib Rahman',
		department: 'Business',
	},
	{
		studentId: '2125071005',
		nationalId: '1990000020',
		fullName: 'Ayesha Siddika',
		department: 'Business',
	},

	// ── Arts ──
	{
		studentId: '2125081001',
		nationalId: '1990000021',
		fullName: 'Zarif Ahmed',
		department: 'Arts',
	},
	{
		studentId: '2125081002',
		nationalId: '1990000022',
		fullName: 'Lamia Khan',
		department: 'Arts',
	},
	{
		studentId: '2125081003',
		nationalId: '1990000023',
		fullName: 'Fahim Shahriar',
		department: 'Arts',
	},
	{
		studentId: '2125081004',
		nationalId: '1990000024',
		fullName: 'Sumaiya Noor',
		department: 'Arts',
	},
	{
		studentId: '2125081005',
		nationalId: '1990000025',
		fullName: 'Rifat Jamil',
		department: 'Arts',
	},

	// ── extra test accounts ──
	{ studentId: 'TEST0001', nationalId: '1234567890', fullName: 'Test Finder', department: 'CSE' },
	{ studentId: 'TEST0002', nationalId: '1234567891', fullName: 'Test Owner', department: 'CSE' },
	{
		studentId: 'TEST0003',
		nationalId: '1234567892',
		fullName: 'Test Student Three',
		department: 'EEE',
	},
	{
		studentId: 'TEST0004',
		nationalId: '1234567893',
		fullName: 'Test Student Four',
		department: 'Business',
	},
	{
		studentId: 'TEST0005',
		nationalId: '1234567894',
		fullName: 'Test Student Five',
		department: 'Arts',
	},
];
