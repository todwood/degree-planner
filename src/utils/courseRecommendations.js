/**
 * Course Recommendations Engine
 * Tiered, Institutional-Only Course Recommendations for Screen 3 Placeholders.
 *
 * Invariants:
 * 1. Concrete Catalog Courses: Return null. No recommendations shown for concrete courses.
 * 2. Institutional Integrity: Transfer credits (ELECT/GE 10000, TR-* grades) NEVER recommended.
 * 3. FERPA Privacy: In-memory aggregated peer completion counts and average GPAs only.
 */

import masterDb from '../data/masterDatabase.json' with { type: 'json' };
import baseHistoricalFulfillments from '../data/historicalFulfillments.json' with { type: 'json' };

export const BUCKET_TO_CANONICAL_TOKEN = {
  comp_1: 'ENGL 15000',
  comp_2: 'REQ_GE_COMP2',
  math: 'REQ_GE_MATH',
  us_hist_gov: 'REQ_GE_US_HIST_GOV',
  soc_sci: 'REQ_GE_SOC_SCI',
  nat_sci_lab: 'REQ_GE_NAT_SCI_LAB',
  sci_elective: 'REQ_GE_SCI_ELEC',
  stem_elective: 'REQ_GE_MATH',
  arts: 'REQ_GE_ART',
  lit: 'REQ_GE_LIT',
  human_culture_1: 'REQ_GE_HC_NON_LIT_ART',
  human_culture_2: 'REQ_GE_HC_ELEC',
  ge_elective_1: 'REQ_GE_ELEC1',
  ge_elective_2: 'REQ_GE_ELEC2'
};

const GRADE_POINTS = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'D-': 0.7,
  'F': 0.0
};

/**
 * Format a numeric GPA into an average letter grade badge string.
 * Example: 3.42 -> "B+ Avg", 4.0 -> "A Avg"
 */
export function formatGpaWithLetter(gpa) {
  if (gpa === null || gpa === undefined || isNaN(gpa) || gpa === 0) {
    return 'N/A';
  }
  const num = typeof gpa === 'number' ? gpa : parseFloat(gpa);
  let letter = 'C';
  if (num >= 3.85) letter = 'A';
  else if (num >= 3.50) letter = 'A-';
  else if (num >= 3.15) letter = 'B+';
  else if (num >= 2.85) letter = 'B';
  else if (num >= 2.50) letter = 'B-';
  else if (num >= 2.15) letter = 'C+';
  else if (num >= 1.85) letter = 'C';
  else if (num >= 1.50) letter = 'C-';
  else if (num >= 1.00) letter = 'D';
  else letter = 'F';

  return `${letter} Avg`;
}

/**
 * Format peer count into an accessible badge string.
 * Example: 14 -> "14 students completed", 0 -> "0 peers recorded"
 */
export function formatPeerPopularity(count) {
  const c = parseInt(count, 10) || 0;
  if (c <= 0) {
    return 'New / Unranked';
  }
  if (c === 1) {
    return '1 student completed';
  }
  return `${c} students completed`;
}

/**
 * Format typical offerings from offered_sessions array into a clean label.
 */
export function formatTypicalOffering(sessions) {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return 'Fall, Spring';
  }
  if (sessions.includes('All Sessions')) {
    return 'All Sessions';
  }
  const hasFall = sessions.some((s) => s.toLowerCase().includes('fall') || s.startsWith('FA'));
  const hasSpring = sessions.some((s) => s.toLowerCase().includes('spring') || s.startsWith('SP'));
  const hasSummer = sessions.some((s) => s.toLowerCase().includes('summer') || s.startsWith('SU'));

  const parts = [];
  if (hasFall) parts.push('Fall');
  if (hasSpring) parts.push('Spring');
  if (hasSummer) parts.push('Summer');

  return parts.length > 0 ? parts.join(', ') : sessions.slice(0, 2).join(', ');
}

/**
 * Extract bucket identifier from a course or placeholder.
 */
export function getBucketIdFromCourse(course) {
  if (!course) return null;
  const rawBucket = course.ge_bucket_id || course.geBucketId;
  if (rawBucket) {
    if (rawBucket === 'ge_elective_1' || rawBucket === 'ge_elective_2') {
      return 'ge_elective';
    }
    return rawBucket;
  }

  const code = (course.code || '').toUpperCase();
  const canon = (course.canonicalCode || '').toUpperCase();
  const title = (course.title || '').toUpperCase();
  const combined = `${code} ${canon} ${title}`;

  if (combined.includes('COMP1') || title.includes('COMPOSITION I')) return 'comp_1';
  if (combined.includes('COMP2') || title.includes('COMPOSITION II')) return 'comp_2';
  if (combined.includes('MATH') || title.includes('GE-MATH') || title.includes('MATHEMATICS')) return 'math';
  if (combined.includes('US_HIST') || title.includes('USHISGOV') || title.includes('CIVICS') || title.includes('HISTORY / GOV')) return 'us_hist_gov';
  if (combined.includes('SOC_SCI') || title.includes('GE-SOCSCI') || title.includes('SOCIAL SCIENCE')) return 'soc_sci';
  if (combined.includes('NAT_SCI') || title.includes('NATSCILAB') || title.includes('WITH LAB') || title.includes('NATURAL SCIENCE')) return 'nat_sci_lab';
  if (combined.includes('SCI_ELEC') || title.includes('SCIENCE ELECTIVE')) return 'sci_elective';
  if (combined.includes('ART') || title.includes('GE-ART') || title.includes('FINE ARTS')) return 'arts';
  if (combined.includes('LIT') || title.includes('GE-LIT') || title.includes('LITERATURE')) return 'lit';
  if (combined.includes('HC_NON_LIT') || title.includes('HUMAN CULTURE I')) return 'human_culture_1';
  if (combined.includes('HC_ELEC') || title.includes('HUMAN CULTURE II')) return 'human_culture_2';
  if (combined.includes('ELEC1') || combined.includes('ELEC2') || title.includes('GE-ANY') || title.includes('GENERAL EDUCATION BREADTH')) return 'ge_elective';

  return null;
}

/**
 * Determine if a course carries a recognized General Education attribute.
 */
export function hasValidGeAttribute(course) {
  if (!course) return false;
  const title = String(course.title || course.courseTitle || '');
  const geCat = String(course.geCategory || '');
  const geBucket = String(course.ge_bucket_id || course.geBucketId || '');

  // 1. Direct title tag (e.g. (GE-Math), (GE-SocSci), (GE-Comm), (GE-HC), etc.)
  if (/\(GE-[^)]+\)|GE-|:GE\b|\bGE\b/i.test(title)) return true;

  // 2. Direct database bucket or category
  if (geBucket && geBucket !== 'elective' && geBucket !== 'free_elective') return true;
  if (geCat && geCat.toUpperCase().startsWith('GE')) return true;

  return false;
}

/**
 * Filter out placement-only, remedial, or special-admit courses from all recommendation pools:
 * - Exclude EPP 15000 (English for Academic Purposes / ESL Composition).
 * - Exclude developmental/remedial math or English courses below 10000 level.
 * - Exclude courses with special-enrollment restrictions (independent studies, internships, practicums, thesis).
 */
export function isRestrictedCourse(course) {
  if (!course) return true;
  const code = String(course.code || course.courseCode || '').toUpperCase();
  const title = String(course.title || course.courseTitle || '').toLowerCase();
  const num = typeof course.number === 'number'
    ? course.number
    : parseInt((code.match(/\b\d{3,5}\b/) || [])[0], 10) || 0;

  // 1. Exclude EPP 15000 (English for Academic Purposes / ESL Composition)
  if (code.includes('EPP 15000') || code.replace(/\s+/g, '') === 'EPP15000') {
    return true;
  }

  // 2. Exclude developmental/remedial math or English courses below 10000 level
  if (num > 0 && num < 10000) {
    return true;
  }

  // 3. Exclude courses with special-enrollment restrictions
  if (
    /\bindependent study\b|\binternship\b|\bpracticum\b|\bdirected study\b|\bfield experience\b|\bco-op\b|\bcooperative education\b|\bthesis\b|\bspecial topics\b/i.test(title)
  ) {
    return true;
  }

  return false;
}

/**
 * Strict Concrete Course Guard:
 * A course is CONCRETE (returns false) if it has a standard, specific institutional course number
 * (e.g., MTH 14100, ENGL 17000, IIT 21500, or matches ^[A-Z]{2,4}\s*\d{5}$ with an existing catalog description).
 * Even if a course satisfies a General Education requirement (e.g., MTH 14100 satisfying GE-Math),
 * it is a REQUIRED concrete course, NOT a placeholder slot.
 *
 * Recommendations must ONLY generate for genuine placeholder requirement tokens:
 * - course.isPlaceholder === true or course.isCustomPlaceholder === true or course.type === 'placeholder'
 * - codes matching ^REQ_, ^GE-, ^ELECT-
 * - titles containing General Education, Free Elective, or Requirement
 */
export function isPlaceholderRequirement(course) {
  if (!course) return false;

  const rawCode = String(course.code || '').trim();
  const canonCode = String(course.canonicalCode || '').trim();
  const rawTitle = String(course.title || '').trim();

  // 1. Explicit placeholder signals
  if (course.isPlaceholder === true || course.isCustomPlaceholder === true || course.type === 'placeholder') {
    return true;
  }

  // 2. Placeholder code prefixes
  if (/^REQ_/i.test(rawCode) || /^REQ_/i.test(canonCode) || /^GE-/i.test(rawCode) || /^ELECT-/i.test(rawCode)) {
    return true;
  }

  // 3. Generic department placeholder codes like ELECT 10000 or GE 10000
  if (/^(?:ELECT|GE)\s*\d{4,5}$/i.test(rawCode)) {
    return true;
  }

  // 4. Strict Concrete Course Guard:
  // If course code matches standard institutional department + course number (e.g., MTH 14100, ENGL 17000, IIT 21500, or matches ^[A-Z]{2,4}\s*\d{5}$)
  // and is not explicitly marked as a placeholder, it is concrete.
  const isStandardCoursePattern = /^[A-Z]{2,4}\s*\d{5}$/i.test(rawCode);
  if (isStandardCoursePattern && course.type !== 'placeholder' && !course.isPlaceholder) {
    const isGenericTitle = /^(?:General Education|Free Elective|General Elective|Upper-Level Elective|Requirement)\b/i.test(rawTitle);
    if (!isGenericTitle) {
      return false;
    }
  }

  // 5. Placeholder title indicators (only if not a concrete catalog course)
  if (
    /placeholder/i.test(rawTitle) ||
    /^(?:General Education|Free Elective|General Elective|Upper-Level Elective|Degree Requirement)\b/i.test(rawTitle) ||
    /\b(?:GE Elective|Elective I\b|Elective II\b|Elective III\b)\b/i.test(rawTitle)
  ) {
    return true;
  }

  return false;
}

/**
 * Check if a candidate course matches a specific GE bucket.
 */
export function matchesBucket(bucketId, course) {
  if (!bucketId || !course) return false;
  if (isRestrictedCourse(course)) return false;
  const compact = (course.compactCode || course.code || '').replace(/\s+/g, '').toUpperCase();
  const dept = (course.department || (course.code || '').split(/\s+/)[0] || '').toUpperCase();
  const title = (course.title || '').toUpperCase();
  const credits = course.credits !== undefined ? course.credits : 3;

  // Strict institutional guard
  if (course.isTransfer || /^(?:ELECT|GE)\b/i.test(course.code)) return false;

  switch (bucketId) {
    case 'comp_1':
      return compact === 'ENGL15000';
    case 'comp_2':
      return compact === 'ENGL17000';
    case 'math':
      return (
        /GE-MATH/i.test(title) ||
        ['MTH14100', 'MTH15100', 'MTH15200', 'MTH27100'].includes(compact) ||
        (dept === 'MTH' && course.number >= 14100)
      );
    case 'us_hist_gov':
      return (
        /USHISGOV|GE-CIV|GE-HISTGOV|GE-HISTORY/i.test(title) ||
        ['HIST10500', 'HIST10600', 'HIST11200', 'PS15500', 'PS15600'].includes(compact)
      );
    case 'soc_sci':
      return (
        /SOCSCI|GE-SOCSCI|GE-SOCIALSCIENCE/i.test(title) ||
        ['PSY10000', 'SOC10200', 'ECON23010', 'ECON23020'].includes(compact) ||
        ['PSY', 'SOC', 'ECON'].includes(dept)
      );
    case 'nat_sci_lab':
      return (
        /NATSCILEC\/LAB|NATSCILAB|WITH LAB/i.test(title) ||
        ['BSC10000', 'ESC10000', 'CHM10000', 'PHY10000'].includes(compact) ||
        (['BSC', 'ESC', 'CHM', 'PHY'].includes(dept) && credits >= 4)
      );
    case 'sci_elective':
      return (
        /SOCSCI|NATSCI/i.test(title) ||
        ['PSY', 'SOC', 'ECON', 'ANT', 'BSC', 'ESC', 'CHM', 'PHY', 'SCI'].includes(dept)
      );
    case 'stem_elective':
      if (dept === 'MTH' && course.number >= 14100 && compact !== 'MTH14100') return true;
      return /GE-MATH|SOCSCI|NATSCI/i.test(title);
    case 'arts':
      return (
        /:ART|HUMAN CULTURE:\s*ART|\bGE-ART|\bGE-ARTS|\bGE-FINEARTS\b/i.test(title) ||
        ['ART18100', 'TA11700', 'MUS10000', 'DAN10100'].includes(compact) ||
        ['ART', 'TA', 'MUS', 'DAN'].includes(dept)
      );
    case 'lit':
      return (
        /:LIT|HUMAN CULTURE:\s*LITERATURE|\bGE-LIT|\bGE-LITERATURE\b/i.test(title) ||
        ['ENGL20100', 'ENGL20200', 'ENGL21600'].includes(compact) ||
        (dept === 'ENGL' && course.number >= 20000 && course.number < 30000)
      );
    case 'human_culture_1':
      if (/:ART|:LIT|HUMAN CULTURE:\s*(ART|LITERATURE)|\bGE-(?:ART|ARTS|FINEARTS|LIT|LITERATURE)\b/i.test(title)) {
        return false;
      }
      return (
        /GE-HC|HUMAN CULTURE|GE-HUMANITIES/i.test(title) ||
        ['REL20000', 'PHL10000', 'ANT11200', 'PHS24100', 'PHRL11400'].includes(compact) ||
        ['REL', 'PHL', 'HIST', 'FRN', 'SPA'].includes(dept)
      );
    case 'human_culture_2':
      return (
        /GE-HC|HUMAN CULTURE|GE-HUMANITIES|:ART|:LIT|\bGE-(?:ART|ARTS|FINEARTS|LIT|LITERATURE)\b/i.test(title) ||
        ['REL', 'PHL', 'HIST', 'ART', 'TA', 'MUS', 'FRN', 'SPA'].includes(dept) ||
        (dept === 'ENGL' && course.number >= 20000 && course.number < 30000)
      );
    case 'ge_elective':
    case 'ge_elective_1':
    case 'ge_elective_2':
      return (
        /GE-|GE\b/i.test(title) ||
        course.ge_bucket_id ||
        course.geCategory ||
        ['comp_1', 'comp_2', 'math', 'us_hist_gov', 'soc_sci', 'nat_sci_lab', 'sci_elective', 'arts', 'lit', 'human_culture_1', 'human_culture_2'].some(
          (b) => matchesBucket(b, course)
        )
      );
    default:
      return false;
  }
}

/**
 * Build historical lookup strictly from baseline institutional peer fulfillments.
 * Excludes active student records from peer counts and GPA metrics to prevent self-contamination.
 */
export function buildHistoricalLookup(baseline = baseHistoricalFulfillments, _activeStudentCourses = null) {
  const map = new Map();

  // Load baseline institutional fulfillments only
  (baseline || []).forEach((item) => {
    const compact = (item.courseCode || '').replace(/\s+/g, '').toUpperCase();
    const entry = {
      courseCode: item.courseCode,
      courseTitle: item.courseTitle,
      category: item.category,
      completionCount: item.completionCount || 0,
      averageGpa: item.averageGpa !== undefined ? item.averageGpa : null,
      isInstitutional: true
    };
    map.set(item.courseCode, entry);
    map.set(compact, entry);
  });

  return map;
}

/**
 * Helper to determine course numeric level (e.g., "MTH 14100" -> 14100).
 */
function getCourseNumber(course) {
  if (typeof course.number === 'number') return course.number;
  const match = (course.code || '').match(/\b(\d{3,5})\b/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract mandatory core and major course codes from active program to subtract from electives.
 */
function getMandatoryProgramCourseCodes(activeProgram, catalogCourses) {
  const mandatoryCodes = new Set();
  if (!activeProgram) return mandatoryCodes;

  const prog = typeof activeProgram === 'string'
    ? (masterDb.programs || []).find((p) => p.id === activeProgram)
    : activeProgram;

  if (!prog || !prog.requirements) return mandatoryCodes;

  const reqs = prog.requirements;
  const courseList = [
    ...(reqs.major_core_courses || reqs.core_courses || []),
    ...(reqs.math_courses || []),
    ...(reqs.emphasis_courses || [])
  ];

  courseList.forEach((c) => {
    if (typeof c === 'string') {
      mandatoryCodes.add(c.toUpperCase());
      mandatoryCodes.add(c.replace(/\s+/g, '').toUpperCase());
    } else if (c?.code) {
      mandatoryCodes.add(c.code.toUpperCase());
      mandatoryCodes.add(c.code.replace(/\s+/g, '').toUpperCase());
    }
  });

  // Also include direct prerequisites of required courses
  if (catalogCourses && Array.isArray(catalogCourses)) {
    catalogCourses.forEach((cat) => {
      const catCode = (cat.code || '').toUpperCase();
      const catCompact = (cat.compactCode || cat.code || '').replace(/\s+/g, '').toUpperCase();
      if (mandatoryCodes.has(catCode) || mandatoryCodes.has(catCompact)) {
        (cat.prereqs || []).forEach((pr) => {
          if (typeof pr === 'string') {
            mandatoryCodes.add(pr.toUpperCase());
            mandatoryCodes.add(pr.replace(/\s+/g, '').toUpperCase());
          }
        });
      }
    });
  }

  return mandatoryCodes;
}

/**
 * Core Recommendation & Classification Engine
 *
 * @param {Object} selectedCourse - The clicked course or placeholder object.
 * @param {Object|string} activeProgram - The active student degree program or program ID.
 * @param {Array} catalogCourses - The list of catalog courses from masterDatabase.json.
 * @param {Array} historicalData - The baseline historical fulfillment entries.
 * @param {Array} activeStudentCourses - Optional loaded session student courses for hybrid metrics.
 * @returns {Array|null} Array of recommendations, or null if selectedCourse is a concrete course.
 */
export function getCourseRecommendations(
  selectedCourse,
  activeProgram = null,
  catalogCourses = null,
  historicalData = null,
  activeStudentCourses = null
) {
  if (!selectedCourse) return null;

  // 1. Strict Concrete Catalog Course Guard:
  // Standard concrete courses (e.g., MTH 14100, ENGL 17000, MTH 27100, CSC 10100) MUST NOT display recommendations.
  if (!isPlaceholderRequirement(selectedCourse)) {
    return null;
  }

  // Resolve catalogs and historical data
  const catalog = catalogCourses && Array.isArray(catalogCourses)
    ? catalogCourses
    : masterDb.courses || [];

  // Exclude active student courses from peer metrics to guarantee zero self-contamination
  const historicalMap = buildHistoricalLookup(
    historicalData && Array.isArray(historicalData) ? historicalData : baseHistoricalFulfillments
  );

  // 2. Placeholder Level Detection:
  const codeStr = String(selectedCourse.code || '');
  const canonStr = String(selectedCourse.canonicalCode || '');
  const titleStr = String(selectedCourse.title || '');
  const combinedMetaStr = `${codeStr} ${canonStr} ${titleStr}`;

  const isUpperDivision = Boolean(
    selectedCourse.minLevel >= 30000 ||
    selectedCourse.level === 'Upper' ||
    selectedCourse.level === 'upper' ||
    /30000|40000|\b300\b|Upper|Upper-Division/i.test(combinedMetaStr)
  );

  // Filter concrete institutional catalog courses strictly:
  // Drop transfers, placeholders, departmental dummy courses, and blacklisted/restricted courses
  const institutionalCandidates = catalog.filter((c) => {
    if (c.type === 'placeholder') return false;
    if (c.isPlaceholder || c.isCustomPlaceholder) return false;
    if (c.isTransfer || c.fromTranscriptPdf) return false;
    if (c.department === 'ELECT' || c.department === 'GE') return false;
    if (/^(?:ELECT|GE)\b/i.test(c.code)) return false;
    if (/^REQ_/i.test(c.code)) return false;
    if (isRestrictedCourse(c)) return false;
    return true;
  });

  const bucketId = getBucketIdFromCourse(selectedCourse);
  const mandatoryCodes = getMandatoryProgramCourseCodes(activeProgram, catalog);

  const isGePlaceholder = Boolean(
    bucketId ||
    selectedCourse.ge_bucket_id ||
    selectedCourse.geBucketId ||
    selectedCourse.placeholder_category === 'ge_bucket' ||
    selectedCourse.category === 'GE' ||
    selectedCourse.category === 'General Education' ||
    /^REQ_GE/i.test(codeStr) ||
    /^REQ_GE/i.test(canonStr) ||
    /General Education|GE Elective|\bGE\b/i.test(titleStr)
  );

  let tier = 1;
  let tierLabel = 'Categorized General Education';
  let matchedCourses = [];

  // 3. Three-Tier Placeholder Recommendation Pipeline
  if (isGePlaceholder) {
    if (bucketId && bucketId !== 'ge_elective') {
      // TIER 1: Categorized GE Placeholders (e.g. GE-MATH, GE-LIT, GE-SOCSCI, GE-HUM, REQ_GE_*)
      tier = 1;
      tierLabel = 'Categorized General Education';

      matchedCourses = institutionalCandidates.filter((cand) => {
        // Every candidate course MUST possess a valid General Education attribute tag
        if (!hasValidGeAttribute(cand)) return false;
        // Check if candidate matches this bucket
        if (matchesBucket(bucketId, cand)) return true;
        // Also support explicit eligible_courses listed on placeholder
        if (selectedCourse.eligible_courses && Array.isArray(selectedCourse.eligible_courses)) {
          return selectedCourse.eligible_courses.includes(cand.code);
        }
        return false;
      });
    } else {
      // TIER 2: Open / Breadth GE Placeholders (e.g. GE-Any, General Education Breadth, REQ_GE_ELEC)
      tier = 2;
      tierLabel = 'Open General Education Breadth';

      matchedCourses = institutionalCandidates.filter((cand) => {
        // Every candidate course MUST possess a valid General Education attribute tag
        // Strictly exclude non-GE departmental courses (e.g., CSC 35500, CSC 45500)
        if (!hasValidGeAttribute(cand)) return false;
        const hasGe = matchesBucket('ge_elective', cand);
        if (!hasGe) return false;
        // Subtract Mandatory Core: filter out required major/core courses
        const compact = (cand.compactCode || cand.code || '').replace(/\s+/g, '').toUpperCase();
        const code = (cand.code || '').toUpperCase();
        if (mandatoryCodes.has(code) || mandatoryCodes.has(compact)) {
          return false;
        }
        return true;
      });
    }
  } else {
    // TIER 3: Free Electives (e.g. Free Elective, General Elective, REQ_ELEC_GEN, REQ_ELEC_UPPER)
    tier = 3;
    tierLabel = isUpperDivision ? 'Upper-Division Free Electives (30000+)' : 'General Free Electives';

    matchedCourses = institutionalCandidates.filter((cand) => {
      // Subtract mandatory core courses
      const compact = (cand.compactCode || cand.code || '').replace(/\s+/g, '').toUpperCase();
      const code = (cand.code || '').toUpperCase();
      if (mandatoryCodes.has(code) || mandatoryCodes.has(compact)) {
        return false;
      }
      // Apply level filter if upper division
      if (isUpperDivision) {
        const num = getCourseNumber(cand);
        if (num < 30000 && !/\b[3-5]\d{4}\b/.test(cand.code)) {
          return false;
        }
      }
      return true;
    });
  }

  // Attach historical peer metrics to each qualifying candidate
  const formattedRecommendations = matchedCourses.map((cand) => {
    const compact = (cand.compactCode || cand.code || '').replace(/\s+/g, '').toUpperCase();
    const stats = historicalMap.get(cand.code) || historicalMap.get(compact) || {};
    const completionCount = stats.completionCount || 0;
    const averageGpa = stats.averageGpa !== undefined && stats.averageGpa !== null ? stats.averageGpa : null;

    return {
      code: cand.code,
      title: cand.title,
      department: cand.department || (cand.code || '').split(/\s+/)[0] || 'General',
      number: getCourseNumber(cand),
      credits: cand.credits !== undefined ? cand.credits : 3,
      typicalOffering: formatTypicalOffering(cand.offered_sessions),
      completionCount,
      averageGpa,
      gradeBadge: completionCount > 0 && averageGpa !== null ? formatGpaWithLetter(averageGpa) : 'N/A',
      popularityBadge: formatPeerPopularity(completionCount),
      description: cand.description || 'Verbatim description pulled from Academic Course Catalog.',
      prereqDisplay: cand.prereq_display || cand.prereqs || 'None',
      coreqDisplay: (cand.coreq_codes || []).join(', ') || 'None',
      offeredSessions: cand.offered_sessions || ['Fall-16wk', 'Spring-16wk'],
      feeInfo: cand.fee_info || '$0',
      isInstitutional: true
    };
  });

  // Ranking:
  // Qualifying courses with completions: sorted by peer completion count descending.
  // Qualifying courses with 0 peer completions: placed at the bottom, sorted by course code ascending.
  formattedRecommendations.sort((a, b) => {
    if (b.completionCount !== a.completionCount) {
      return b.completionCount - a.completionCount;
    }
    return a.code.localeCompare(b.code);
  });

  // Cap recommendations at top 30
  const cappedRecommendations = formattedRecommendations.slice(0, 30);

  // Attach metadata properties to array for caller convenience
  cappedRecommendations.tier = tier;
  cappedRecommendations.tierLabel = tierLabel;
  cappedRecommendations.isUpperDivision = isUpperDivision;
  cappedRecommendations.placeholderCode = selectedCourse.code;
  cappedRecommendations.placeholderTitle = selectedCourse.title;

  return cappedRecommendations;
}
