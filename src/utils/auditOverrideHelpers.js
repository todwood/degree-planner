import masterProgramsDb from '../data/masterProgramsDatabase.json' with { type: 'json' };
import { toCompact } from '../engine/waterfallAudit.js';

/**
 * Maps MOTR / GE bucket IDs to state-aligned distribution category keys
 */
export const CATEGORY_BUCKET_MAP = {
  mathematical_sciences: ['mathematical_sciences', 'mathematics', 'math', 'mth', 'GE-MATH', 'REQ_GE_MATH'],
  mathematics: ['mathematical_sciences', 'mathematics', 'math', 'mth', 'GE-MATH', 'REQ_GE_MATH'],
  social_behavioral_sciences: ['social_behavioral_sciences', 'social_science', 'soc_sci', 'GE-SOCSCI'],
  oral_communication: ['oral_communication', 'oral_comm', 'comm', 'GE-COMM'],
  natural_sciences: ['natural_sciences', 'nat_sci', 'nat_sci_lab', 'sci_elective', 'GE-NATSCI'],
  written_communication: ['written_communication', 'comp_1', 'comp_2', 'GE-COMM'],
  humanities_fine_arts: ['humanities_fine_arts', 'humanities', 'arts', 'lit', 'human_culture_1', 'human_culture_2'],
  civics: ['civics', 'us_hist_gov', 'GE-CIVICS'],
  general_education_elective: ['general_education_elective', 'additional_ge_electives', 'ge_elective_1', 'ge_elective_2'],
  additional_ge_electives: ['general_education_elective', 'additional_ge_electives', 'ge_elective_1', 'ge_elective_2']
};

/**
 * Returns formatted tooltip explanation for a prescribed GE requirement.
 */
export function getPrescribedGeExplanation(programName = 'Major') {
  return `This distribution requirement is fulfilled directly within the ${programName} major coursework to avoid redundant credits.`;
}

/**
 * Checks if a program defines prescribed GE requirements for a given category.
 * Sourced from masterProgramsDatabase.json (or local program object).
 */
export function getPrescribedGeForCategory(program, catId) {
  if (!program) return null;

  // Resolve enriched program from masterProgramsDb if available
  const progId = program.id || program.slug;
  const enriched =
    masterProgramsDb?.programs?.[progId] ||
    Object.values(masterProgramsDb?.programs || {}).find(
      (p) => p.id === progId || p.slug === progId || (p.name && p.name === program.name)
    ) ||
    program;

  const progName = enriched.name || enriched.program_name || program.name || 'Major';

  // 1. Check prescribed_ge_requirements array
  const prescribedList =
    enriched.prescribed_ge_requirements ||
    enriched.requirements?.prescribed_ge_requirements ||
    program.prescribed_ge_requirements ||
    [];

  for (const item of prescribedList) {
    const bucket = item.motr_bucket || item.bucket || '';
    const aliases = CATEGORY_BUCKET_MAP[catId] || [catId];
    if (aliases.includes(bucket) || bucket === catId) {
      return {
        isPrescribed: true,
        programName: progName,
        courses: item.courses || [],
        title: item.title || 'Prescribed Requirement',
        tooltip: getPrescribedGeExplanation(progName),
        item
      };
    }
  }

  // 2. Check prescribed_ge_satisfactions map
  const satisfactions =
    enriched.prescribed_ge_satisfactions ||
    enriched.requirements?.prescribed_ge_satisfactions ||
    program.prescribed_ge_satisfactions ||
    {};

  for (const [key, val] of Object.entries(satisfactions)) {
    const aliases = CATEGORY_BUCKET_MAP[catId] || [catId];
    if (aliases.includes(key) || key === catId) {
      return {
        isPrescribed: true,
        programName: progName,
        courses: Array.isArray(val) ? val : [val],
        title: 'Prescribed Requirement',
        tooltip: getPrescribedGeExplanation(progName),
        item: { motr_bucket: catId, courses: Array.isArray(val) ? val : [val] }
      };
    }
  }

  return null;
}

/**
 * Dynamically calculate remaining credits needed to hit the graduation target.
 * Formula: freeElectivesNeeded = Math.max(0, targetGraduationCredits - totalEarnedAndActiveCredits - remainingMajorCredits)
 */
export function calculateFreeElectivesNeeded({
  targetGraduationCredits = 120,
  totalEarnedAndActiveCredits = 0,
  remainingMajorCredits = 0
}) {
  return Math.max(0, targetGraduationCredits - totalEarnedAndActiveCredits - remainingMajorCredits);
}

/**
 * Itemizes free electives balance into discrete rows:
 * - Multiple of 3: Free Elective (3 credits)
 * - Remainder (1 or 2): Free Elective (at least {remainder} credits)
 */
export function itemizeFreeElectives(freeElectivesNeeded) {
  const needed = Math.max(0, Number(freeElectivesNeeded) || 0);
  if (needed <= 0) return [];

  const rows = [];
  const countOf3 = Math.floor(needed / 3);
  const remainder = needed % 3;

  for (let i = 0; i < countOf3; i++) {
    rows.push({
      id: `free-elec-slot-${i + 1}`,
      slotIndex: i + 1,
      title: 'Free Elective (3 credits)',
      credits: 3,
      isRemainder: false
    });
  }

  if (remainder > 0) {
    rows.push({
      id: 'free-elec-slot-remainder',
      slotIndex: countOf3 + 1,
      title: `Free Elective (at least ${remainder} credit${remainder > 1 ? 's' : ''})`,
      credits: remainder,
      isRemainder: true
    });
  }

  return rows;
}

/**
 * Builds a course-to-requirement map from audit state to identify
 * courses that are already matched to another requirement.
 */
export function buildCourseMatchedMap({
  geBuckets = [],
  programLedgers = [],
  auditOverrides = {}
}) {
  const map = {};
  const unmatchedKeys = new Set(Object.keys(auditOverrides?.unmatched || {}));

  // GE Buckets
  for (const b of geBuckets) {
    const reqKey = `GE:${b.bucket_id}`;
    if (unmatchedKeys.has(reqKey)) continue;

    const mc = b.matchedCourse;
    if (mc && mc.code) {
      const title = b.displayPlaceholderTitle || b.name || 'General Education';
      map[mc.code] = title;
      map[toCompact(mc.code)] = title;
    }
  }

  // Program Ledgers
  for (const ledger of programLedgers) {
    for (const req of ledger.requirements || []) {
      const reqKey = `${ledger.role === 'Primary Major' ? 'MAJOR' : 'SEC'}:${req.compactCode}`;
      if (unmatchedKeys.has(reqKey)) continue;

      const mc = req.matchedCourse;
      if (mc && mc.code) {
        const title = req.title || req.code || ledger.name;
        map[mc.code] = title;
        map[toCompact(mc.code)] = title;
      }
    }
  }

  // Manual Matches in auditOverrides
  for (const [key, mm] of Object.entries(auditOverrides?.manualMatches || {})) {
    if (mm?.type === 'MANUAL_MATCH' && mm.course?.code) {
      map[mm.course.code] = mm.requirementTitle || 'Manually Assigned Requirement';
      map[toCompact(mm.course.code)] = mm.requirementTitle || 'Manually Assigned Requirement';
    }
  }

  return map;
}

/**
 * Evaluates whether a course matches a GE bucket filter.
 */
export function isCourseEligibleForGeBucket(course, bucketId) {
  if (!course || !bucketId) return false;
  const b = String(bucketId).toLowerCase().replace(/^(req_)?ge[-_]?/, '');
  const dept = (course.department || course.subject || course.code?.split(' ')[0] || '').toUpperCase();
  const title = (course.title || '').toLowerCase();
  const num = Number(course.number || course.code?.match(/\d+/)?.[0]) || 0;

  switch (b) {
    case 'math':
    case 'mathematical_sciences':
      return dept === 'MTH' || title.includes('ge-math') || title.includes('math');
    case 'arts':
      return ['ART', 'TA', 'MUS', 'DAN', 'CINE'].includes(dept) || title.includes('art') || title.includes('theatre');
    case 'lit':
      return dept === 'ENGL' && num >= 20000 && num < 30000;
    case 'soc_sci':
    case 'socsci':
    case 'social_behavioral_sciences':
      return ['PSY', 'SOC', 'ECON', 'ANT', 'POL', 'SW'].includes(dept);
    case 'us_hist_gov':
    case 'civics':
      return (dept === 'HIST' && (num === 10500 || num === 10600)) || (dept === 'PS' && num === 15500);
    case 'nat_sci':
    case 'natsci':
    case 'nat_sci_lab':
    case 'natural_sciences':
      return ['BSC', 'ESC', 'CHM', 'PHY'].includes(dept);
    case 'human_culture_1':
    case 'human_culture_2':
    case 'humanities':
    case 'humanities_fine_arts':
      return ['PHL', 'REL', 'HIST', 'SPA', 'FRN'].includes(dept) || title.includes('culture');
    case 'comm':
    case 'written_communication':
    case 'oral_communication':
      return ['ENGL', 'EPP', 'COM'].includes(dept);
    default:
      return false;
  }
}
