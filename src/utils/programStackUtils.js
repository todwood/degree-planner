/**
 * Multi-Program Stack Builder Utilities
 * File: src/utils/programStackUtils.js
 * 
 * Deterministic helper functions for Screen 1 Declared Credentials Stack:
 * - Credential category categorization (Major, Major - Track, Minor, Certificate)
 * - Dynamic header pluralization
 * - Course overlap calculation across declared programs
 * - Cross-year credential remapping
 */

/**
 * Determines credential category badge.
 * @param {object} prog - Program object
 * @returns {'Major' | 'Major - Track' | 'Minor' | 'Certificate'}
 */
export function getProgramCategory(prog) {
  if (!prog) return 'Major';
  const progType = prog.program_type || '';
  const name = prog.name || prog.program_name || '';
  if (progType === 'Minor' || name.toLowerCase().includes('minor')) return 'Minor';
  if (progType === 'Certificate' || name.toLowerCase().includes('certificate')) return 'Certificate';
  if (name.includes('Emphasis') || name.includes(' - ')) return 'Major - Track';
  return 'Major';
}

/**
 * Generates dynamic stack header text with strict pluralization.
 * Examples:
 * - 1 Major -> "DECLARED CREDENTIALS STACK (1 Major)"
 * - 1 Major + 1 Minor -> "DECLARED CREDENTIALS STACK (1 Major, 1 Minor)"
 * - 2 Majors -> "DECLARED CREDENTIALS STACK (2 Majors — Double Major)"
 * - 1 Major, 1 Minor, 1 Cert -> "DECLARED CREDENTIALS STACK (1 Major, 1 Minor, 1 Certificate)"
 * 
 * @param {Array<object>} programs - List of declared program objects
 * @returns {string} Formatted header title
 */
export function formatDeclaredStackHeader(programs = []) {
  if (!programs || programs.length === 0) {
    return 'DECLARED CREDENTIALS STACK (0 Credentials)';
  }

  let majorsCount = 0;
  let minorsCount = 0;
  let certsCount = 0;

  for (const prog of programs) {
    const cat = getProgramCategory(prog);
    if (cat === 'Minor') {
      minorsCount++;
    } else if (cat === 'Certificate') {
      certsCount++;
    } else {
      majorsCount++;
    }
  }

  const parts = [];

  if (majorsCount === 1) {
    parts.push('1 Major');
  } else if (majorsCount === 2) {
    if (minorsCount === 0 && certsCount === 0) {
      parts.push('2 Majors — Double Major');
    } else {
      parts.push('2 Majors');
    }
  } else if (majorsCount > 2) {
    parts.push(`${majorsCount} Majors`);
  }

  if (minorsCount === 1) {
    parts.push('1 Minor');
  } else if (minorsCount > 1) {
    parts.push(`${minorsCount} Minors`);
  }

  if (certsCount === 1) {
    parts.push('1 Certificate');
  } else if (certsCount > 1) {
    parts.push(`${certsCount} Certificates`);
  }

  if (parts.length === 0) {
    return 'DECLARED CREDENTIALS STACK (0 Credentials)';
  }

  return `DECLARED CREDENTIALS STACK (${parts.join(', ')})`;
}

/**
 * Calculates total credits, shared course overlap, and net load across programs.
 * @param {Array<object>} programs - List of declared program objects
 * @param {object} masterDb - Master database reference containing catalog courses
 * @returns {{ totalDeclaredCredits: number, sharedOverlapCredits: number, netProgramLoad: number, overlappingCourses: Array<object> }}
 */
export function calculateStackOverlap(programs = [], masterDb = null) {
  if (!programs || programs.length === 0) {
    return {
      totalDeclaredCredits: 0,
      sharedOverlapCredits: 0,
      netProgramLoad: 0,
      overlappingCourses: []
    };
  }

  const catalogCourseMap = new Map();
  if (masterDb && Array.isArray(masterDb.courses)) {
    for (const c of masterDb.courses) {
      catalogCourseMap.set(c.code.toUpperCase(), c);
    }
  }

  let totalDeclaredCredits = 0;
  const courseCountMap = new Map(); // code -> { count, credits, code }

  for (const prog of programs) {
    const credits = Number(prog.total_program_credits || prog.total_major_credits || 0);
    totalDeclaredCredits += credits;

    const coreCourses = prog.requirements?.major_core_courses || [];
    for (const rawCode of coreCourses) {
      const code = String(rawCode).trim().toUpperCase();
      if (!courseCountMap.has(code)) {
        const catCourse = catalogCourseMap.get(code);
        const cr = catCourse ? Number(catCourse.credits) || 3 : 3;
        courseCountMap.set(code, { count: 1, credits: cr, code: rawCode });
      } else {
        const item = courseCountMap.get(code);
        item.count++;
      }
    }
  }

  let sharedOverlapCredits = 0;
  const overlappingCourses = [];

  for (const [code, info] of courseCountMap.entries()) {
    if (info.count > 1) {
      const savedCredits = (info.count - 1) * info.credits;
      sharedOverlapCredits += savedCredits;
      overlappingCourses.push({
        code: info.code,
        occurrences: info.count,
        savedCredits
      });
    }
  }

  const netProgramLoad = Math.max(0, totalDeclaredCredits - sharedOverlapCredits);

  return {
    totalDeclaredCredits,
    sharedOverlapCredits,
    netProgramLoad,
    overlappingCourses
  };
}

/**
 * Remaps declared program IDs across catalog year transitions.
 * @param {Array<string>} declaredIds - List of program IDs
 * @param {string} targetYear - Target catalog year (e.g. '2025-2026')
 * @param {object} masterDb - Master database reference
 * @returns {Array<string>} Remapped program IDs
 */
export function remapStackForCatalogYear(declaredIds = [], targetYear, masterDb) {
  if (!masterDb || !Array.isArray(masterDb.programs)) return declaredIds;
  const allProgs = masterDb.programs;
  const targetYearProgs = allProgs.filter((p) => p.catalog_year_id === targetYear);
  if (targetYearProgs.length === 0) return declaredIds;

  const remapped = [];
  for (const id of declaredIds) {
    const currProg = allProgs.find((p) => p.id === id);
    if (!currProg) {
      remapped.push(id);
      continue;
    }

    const baseId = id.replace(/_20\d\d$/, '');
    const match =
      targetYearProgs.find((p) => p.name === currProg.name) ||
      targetYearProgs.find((p) => p.id.replace(/_20\d\d$/, '') === baseId);

    if (match) {
      remapped.push(match.id);
    } else {
      remapped.push(id);
    }
  }

  return [...new Set(remapped)];
}
