/**
 * Synthetic Multi-Program Student Generator Dataset
 * File: src/data/mockMultiProgramStudents.js
 * 
 * 20 Diverse student intake profiles for stress-testing:
 * - Double Majors (Students 01–05)
 * - Major + 2 Minors (Students 06–10)
 * - Major + 3 Minors / Mixed Triple Stacks (Students 11–15)
 * - Double Major + Minor / Edge Cases (Students 16–20)
 */

export const mockMultiProgramStudents = [
  // 1. Students 01–05: Double Majors
  {
    id: 'student_01',
    name: 'Alex Mercer',
    studentId: 'A00918201',
    catalogYear: '2026-2027',
    primaryProgramId: 'computer_science_bs_2026',
    declaredProgramIds: ['computer_science_bs_2026', 'data_science_bs_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors — Double Major)',
    category: 'Double Major',
    core42TransferBlock: false
  },
  {
    id: 'student_02',
    name: 'Jordan Hayes',
    studentId: 'A00918202',
    catalogYear: '2026-2027',
    primaryProgramId: 'biological_sciences_bs_2026',
    declaredProgramIds: ['biological_sciences_bs_2026', 'psychology_bs_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors — Double Major)',
    category: 'Double Major',
    core42TransferBlock: false
  },
  {
    id: 'student_03',
    name: 'Taylor Reed',
    studentId: 'A00918203',
    catalogYear: '2026-2027',
    primaryProgramId: 'business_administration_bs_2026',
    declaredProgramIds: ['business_administration_bs_2026', 'communications_ba_journalism_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors — Double Major)',
    category: 'Double Major',
    core42TransferBlock: true
  },
  {
    id: 'student_04',
    name: 'Morgan Vance',
    studentId: 'A00918204',
    catalogYear: '2026-2027',
    primaryProgramId: 'cybersecurity_bs_2026',
    declaredProgramIds: ['cybersecurity_bs_2026', 'it_networking_bs_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors — Double Major)',
    category: 'Double Major',
    core42TransferBlock: false
  },
  {
    id: 'student_05',
    name: 'Casey Brooks',
    studentId: 'A00918205',
    catalogYear: '2026-2027',
    primaryProgramId: 'english_ba_2026',
    declaredProgramIds: ['english_ba_2026', 'communications_ba_journalism_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors — Double Major)',
    category: 'Double Major',
    core42TransferBlock: false
  },

  // 2. Students 06–10: Major + 2 Minors / Credentials
  {
    id: 'student_06',
    name: 'Riley Chen',
    studentId: 'A00918206',
    catalogYear: '2026-2027',
    primaryProgramId: 'computer_science_bs_2026',
    declaredProgramIds: ['computer_science_bs_2026', 'mathematics_minor_2026', 'cybersecurity_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors)',
    category: 'Major + 2 Minors',
    core42TransferBlock: false
  },
  {
    id: 'student_07',
    name: 'Sydney Patel',
    studentId: 'A00918207',
    catalogYear: '2026-2027',
    primaryProgramId: 'data_science_bs_2026',
    declaredProgramIds: ['data_science_bs_2026', 'mathematics_minor_2026', 'cybersecurity_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors)',
    category: 'Major + 2 Minors',
    core42TransferBlock: false
  },
  {
    id: 'student_08',
    name: 'Avery Davis',
    studentId: 'A00918208',
    catalogYear: '2026-2027',
    primaryProgramId: 'business_administration_bs_2026',
    declaredProgramIds: ['business_administration_bs_2026', 'mathematics_minor_2026', 'project_management_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 1 Minor, 1 Certificate)',
    category: 'Major + Minor + Cert',
    core42TransferBlock: true
  },
  {
    id: 'student_09',
    name: 'Cameron Diaz',
    studentId: 'A00918209',
    catalogYear: '2026-2027',
    primaryProgramId: 'psychology_bs_2026',
    declaredProgramIds: ['psychology_bs_2026', 'cybersecurity_minor_2026', 'mathematics_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors)',
    category: 'Major + 2 Minors',
    core42TransferBlock: false
  },
  {
    id: 'student_10',
    name: 'Quinn Washington',
    studentId: 'A00918210',
    catalogYear: '2026-2027',
    primaryProgramId: 'communications_ba_journalism_2026',
    declaredProgramIds: ['communications_ba_journalism_2026', 'cybersecurity_minor_2026', 'mathematics_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors)',
    category: 'Major + 2 Minors',
    core42TransferBlock: false
  },

  // 3. Students 11–15: Major + 3 Minors / Mixed Triple Stacks
  {
    id: 'student_11',
    name: 'Dakota Morris',
    studentId: 'A00918211',
    catalogYear: '2026-2027',
    primaryProgramId: 'computer_science_bs_2026',
    declaredProgramIds: ['computer_science_bs_2026', 'mathematics_minor_2026', 'cybersecurity_minor_2026', 'data_analysis_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors, 1 Certificate)',
    category: 'Major + 3 Credentials',
    core42TransferBlock: false
  },
  {
    id: 'student_12',
    name: 'Skyler Green',
    studentId: 'A00918212',
    catalogYear: '2026-2027',
    primaryProgramId: 'data_science_bs_2026',
    declaredProgramIds: ['data_science_bs_2026', 'mathematics_minor_2026', 'cybersecurity_minor_2026', 'project_management_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors, 1 Certificate)',
    category: 'Major + 3 Credentials',
    core42TransferBlock: false
  },
  {
    id: 'student_13',
    name: 'Harper Lee',
    studentId: 'A00918213',
    catalogYear: '2026-2027',
    primaryProgramId: 'biological_sciences_bs_2026',
    declaredProgramIds: ['biological_sciences_bs_2026', 'mathematics_minor_2026', 'cybersecurity_minor_2026', 'data_analysis_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors, 1 Certificate)',
    category: 'Major + 3 Credentials',
    core42TransferBlock: false
  },
  {
    id: 'student_14',
    name: 'Finley Scott',
    studentId: 'A00918214',
    catalogYear: '2026-2027',
    primaryProgramId: 'business_administration_bs_2026',
    declaredProgramIds: ['business_administration_bs_2026', 'cybersecurity_minor_2026', 'mathematics_minor_2026', 'project_management_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 2 Minors, 1 Certificate)',
    category: 'Major + 3 Credentials',
    core42TransferBlock: false
  },
  {
    id: 'student_15',
    name: 'Reese Alvarez',
    studentId: 'A00918215',
    catalogYear: '2026-2027',
    primaryProgramId: 'cybersecurity_bs_2026',
    declaredProgramIds: ['cybersecurity_bs_2026', 'mathematics_minor_2026', 'data_analysis_certificate_2026', 'project_management_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (1 Major, 1 Minor, 2 Certificates)',
    category: 'Major + 3 Credentials',
    core42TransferBlock: false
  },

  // 4. Students 16–20: Double Major + Minor / Edge Cases
  {
    id: 'student_16',
    name: 'Logan Wright',
    studentId: 'A00918216',
    catalogYear: '2026-2027',
    primaryProgramId: 'computer_science_bs_2026',
    declaredProgramIds: ['computer_science_bs_2026', 'data_science_bs_2026', 'cybersecurity_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors, 1 Minor)',
    category: 'Double Major + Minor',
    core42TransferBlock: false
  },
  {
    id: 'student_17',
    name: 'Kendall Foster',
    studentId: 'A00918217',
    catalogYear: '2026-2027',
    primaryProgramId: 'data_science_bs_2026',
    declaredProgramIds: ['data_science_bs_2026', 'business_administration_bs_2026', 'mathematics_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors, 1 Minor)',
    category: 'Double Major + Minor',
    core42TransferBlock: false
  },
  {
    id: 'student_18',
    name: 'Peyton Butler',
    studentId: 'A00918218',
    catalogYear: '2026-2027',
    primaryProgramId: 'nursing_bs_2026',
    declaredProgramIds: ['nursing_bs_2026', 'psychology_bs_2026', 'data_analysis_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors, 1 Certificate)',
    category: 'Double Major + Cert',
    core42TransferBlock: false
  },
  {
    id: 'student_19',
    name: 'Emerson Bell',
    studentId: 'A00918219',
    catalogYear: '2026-2027',
    primaryProgramId: 'it_app_dev_bs_2026',
    declaredProgramIds: ['it_app_dev_bs_2026', 'cybersecurity_bs_2026', 'mathematics_minor_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors, 1 Minor)',
    category: 'Double Major + Minor',
    core42TransferBlock: false
  },
  {
    id: 'student_20',
    name: 'Rowan Adams',
    studentId: 'A00918220',
    catalogYear: '2026-2027',
    primaryProgramId: 'english_ba_2026',
    declaredProgramIds: ['english_ba_2026', 'communications_ba_journalism_2026', 'project_management_certificate_2026'],
    expectedHeader: 'Seeking to Confer Credential Stack (2 Majors, 1 Certificate)',
    category: 'Double Major + Cert',
    core42TransferBlock: false
  }
];

export default mockMultiProgramStudents;
