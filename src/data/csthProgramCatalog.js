/**
 * CSTH Program Catalog Presets (src/data/csthProgramCatalog.js)
 * Multi-Year Catalog Curricula for College of Science, Technology, and Health (CSTH).
 * Organized by academic department clusters for dynamic discovery and 1-click importing.
 */

export const CSTH_DEPARTMENTS = [
  { id: 'computing', name: 'Computing & Cybersecurity' },
  { id: 'math', name: 'Mathematics & Actuarial Science' },
  { id: 'natural_sciences', name: 'Natural Sciences & Health' }
];

export const PRESET_PROGRAMS = [
  // --- Computing & Cybersecurity ---
  {
    id: 'cybersecurity_bs_2026',
    name: 'Cybersecurity, BS',
    catalog_year_id: '2026-2027',
    department: 'computing',
    program_type: 'Major',
    total_program_credits: 66,
    requirements: {
      major_core_credits: 60,
      major_core_courses: [
        'ICS 21300', 'ICS 32300', 'ICS 32301', 'ICS 33100', 'ICS 34100',
        'ICS 34300', 'ICS 34400', 'ICS 34500', 'ICS 34600', 'ICS 34700',
        'ICS 41500', 'ICS 41700', 'ICS 44300', 'ICS 44400', 'ICS 44500',
        'ICS 44600', 'ICS 44700', 'ICS 44800', 'ICS 48900'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
        { code: 'GE-MATH-ELECTIVE', title: 'Any GE-Math course (MTH 15100+)', credits: 3, required: true }
      ]
    }
  },
  {
    id: 'it_app_dev_bs_2026',
    name: 'Information Technology, BS - Applications Development Emphasis',
    catalog_year_id: '2026-2027',
    department: 'computing',
    program_type: 'Major',
    total_program_credits: 66,
    requirements: {
      major_core_credits: 24,
      major_core_courses: [
        'ICS 21300', 'ICS 32300', 'ICS 32301', 'ICS 33100', 'ICS 34100',
        'ICS 41500', 'ICS 41700', 'IIT 48900'
      ],
      emphasis_credits: 36,
      emphasis_courses: [
        'CSC 10100', 'CSC 14400', 'CSC 20100', 'CSC 20200', 'CSC 24400',
        'CSC 30500', 'CSC 40500', 'CSC 40800', 'CSC 44700', 'IIT 45200'
      ],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
        { code: 'GE-MATH-ELECTIVE', title: 'Any GE-Math course (MTH 15100+)', credits: 3, required: true }
      ]
    }
  },
  {
    id: 'it_networking_bs_2026',
    name: 'Information Technology, BS - Networking Emphasis',
    catalog_year_id: '2026-2027',
    department: 'computing',
    program_type: 'Major',
    total_program_credits: 60,
    requirements: {
      major_core_credits: 24,
      major_core_courses: [
        'ICS 21300', 'ICS 32300', 'ICS 32301', 'ICS 33100', 'ICS 34100',
        'ICS 41500', 'ICS 41700', 'IIT 48900'
      ],
      emphasis_credits: 30,
      emphasis_courses: [
        'ICS 32400', 'ICS 32401', 'ICS 34300', 'ICS 34400', 'ICS 34700',
        'ICS 42300', 'ICS 42301', 'ICS 42400', 'ICS 42401', 'IIT 45200'
      ],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
        { code: 'GE-MATH-ELECTIVE', title: 'Any GE-Math course (MTH 15100+)', credits: 3, required: true }
      ]
    }
  },
  {
    id: 'computer_science_bs_2026',
    name: 'Computer Science, BS',
    catalog_year_id: '2026-2027',
    department: 'computing',
    program_type: 'Major',
    total_program_credits: 66,
    requirements: {
      major_core_credits: 54,
      major_core_courses: [
        'CSC 10100', 'CSC 14400', 'CSC 20100', 'CSC 20200', 'CSC 24400',
        'CSC 30500', 'CSC 31000', 'CSC 32000', 'CSC 40500', 'CSC 40800',
        'CSC 44700', 'CSC 48000', 'CSC 48900'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 12,
      math_courses: [
        { code: 'MTH 15100', title: 'College Algebra', credits: 3, required: true },
        { code: 'MTH 27100', title: 'Calculus I', credits: 4, required: true },
        { code: 'MTH 31100', title: 'Discrete Mathematics', credits: 3, required: true }
      ]
    }
  },
  {
    id: 'data_science_bs_2026',
    name: 'Data Science, BS',
    catalog_year_id: '2026-2027',
    department: 'computing',
    program_type: 'Major',
    total_program_credits: 63,
    requirements: {
      major_core_credits: 48,
      major_core_courses: [
        'CSC 10100', 'CSC 20100', 'CSC 30500', 'ICS 33100', 'ICS 34100',
        'MTH 14100', 'MTH 27100', 'MTH 27200', 'MTH 31500', 'MTH 34100',
        'CSC 40800', 'CSC 48900'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
        { code: 'MTH 27100', title: 'Calculus I', credits: 4, required: true }
      ]
    }
  },
  {
    id: 'web_and_ux_bs_2026',
    name: 'Web and User Experience, BS',
    catalog_year_id: '2026-2027',
    department: 'computing',
    program_type: 'Major',
    total_program_credits: 60,
    requirements: {
      major_core_credits: 48,
      major_core_courses: [
        'CSC 10100', 'CSC 14400', 'CSC 20100', 'CSC 24400', 'ICS 21300',
        'ICS 33100', 'CSC 30500', 'CSC 40500', 'IIT 48900'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
        { code: 'GE-MATH-ELECTIVE', title: 'Any GE-Math course', credits: 3, required: true }
      ]
    }
  },

  // --- Mathematics & Actuarial Science ---
  {
    id: 'mathematics_bs_2026',
    name: 'Mathematics, BS',
    catalog_year_id: '2026-2027',
    department: 'math',
    program_type: 'Major',
    total_program_credits: 54,
    requirements: {
      major_core_credits: 48,
      major_core_courses: [
        'MTH 27100', 'MTH 27200', 'MTH 30300', 'MTH 31100', 'MTH 31500',
        'MTH 32100', 'MTH 34100', 'MTH 49000'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 15100', title: 'College Algebra', credits: 3, required: true },
        { code: 'MTH 15200', title: 'Precalculus', credits: 3, required: true }
      ]
    }
  },
  {
    id: 'actuarial_science_bs_2026',
    name: 'Actuarial Science, BS',
    catalog_year_id: '2026-2027',
    department: 'math',
    program_type: 'Major',
    total_program_credits: 60,
    requirements: {
      major_core_credits: 54,
      major_core_courses: [
        'MTH 27100', 'MTH 27200', 'MTH 30300', 'MTH 31100', 'MTH 31500',
        'MTH 34100', 'MTH 34200', 'MTH 44100', 'MTH 49000'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 15100', title: 'College Algebra', credits: 3, required: true },
        { code: 'MTH 15200', title: 'Precalculus', credits: 3, required: true }
      ]
    }
  },

  // --- Natural Sciences & Health ---
  {
    id: 'biological_sciences_bs_2026',
    name: 'Biological Sciences, BS',
    catalog_year_id: '2026-2027',
    department: 'natural_sciences',
    program_type: 'Major',
    total_program_credits: 64,
    requirements: {
      major_core_credits: 52,
      major_core_courses: [
        'BIO 12100', 'BIO 12200', 'BIO 24200', 'BIO 24400', 'BIO 30100',
        'CHM 10000', 'CHM 23100', 'CHM 23200', 'BIO 49000'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 6,
      math_courses: [
        { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
        { code: 'MTH 15100', title: 'College Algebra', credits: 3, required: true }
      ]
    }
  },
  {
    id: 'chemistry_bs_2026',
    name: 'Chemistry, BS',
    catalog_year_id: '2026-2027',
    department: 'natural_sciences',
    program_type: 'Major',
    total_program_credits: 68,
    requirements: {
      major_core_credits: 56,
      major_core_courses: [
        'CHM 10000', 'CHM 23100', 'CHM 23200', 'CHM 33100', 'CHM 33200',
        'CHM 40100', 'CHM 40200', 'CHM 49000'
      ],
      emphasis_credits: 0,
      emphasis_courses: [],
      math_credits: 8,
      math_courses: [
        { code: 'MTH 27100', title: 'Calculus I', credits: 4, required: true },
        { code: 'MTH 27200', title: 'Calculus II', credits: 4, required: true }
      ]
    }
  }
];
