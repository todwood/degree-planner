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

const BUCKET_TO_CANONICAL_TOKEN = {
  comp_1: 'REQ_GE_COMP1',
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
 * Format a numeric GPA into a readable GPA + letter grade badge string.
 * Example: 3.42 -> "3.42 GPA / B+"
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

  return `${num.toFixed(2)} GPA / ${letter}`;
}

/**
 * Format peer count into an accessible badge string.
 * Example: 14 -> "14 students completed", 0 -> "0 peers recorded"
 */
export function formatPeerPopularity(count) {
  const c = parseInt(count, 10) || 0;
  if (c <= 0) {
    return '0 peers recorded';
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
 * Check if a candidate course matches a specific GE bucket.
 */
export function matchesBucket(bucketId, course) {
  if (!bucketId || !course) return false;
  const compact = (course.compactCode || course.code || '').replace(/\s+/g, '').toUpperCase();
  const dept = (course.department || (course.code || '').split(/\s+/)[0] || '').toUpperCase();
  const title = (course.title || '').toUpperCase();
  const credits = course.credits !== undefined ? course.credits : 3;

  // Strict institutional guard
  if (course.isTransfer || /^(?:ELECT|GE)\b/i.test(course.code)) return false;

  switch (bucketId) {
    case 'comp_1':
      return compact === 'ENGL15000' || compact === 'EPP15000';
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
 * Merge baseline historical fulfillments with loaded active student records.
 */
export function buildHistoricalLookup(baseline = baseHistoricalFulfillments, activeStudentCourses = null) {
  const map = new Map();

  // Load baseline
  (baseline || []).forEach((item) => {
    const compact = (item.courseCode || '').replace(/\s+/g, '').toUpperCase();
    map.set(item.courseCode, { ...item });
    map.set(compact, { ...item });
  });

  // Dynamically incorporate valid institutional completions from active student records
  if (activeStudentCourses && Array.isArray(activeStudentCourses)) {
    activeStudentCourses.forEach((c) => {
      // Exclude transfers and placeholders
      if (c.isTransfer || c.fromTranscriptPdf || c.isTransferPlaceholder || /^(?:ELECT|GE)\b/i.test(c.code)) {
        return;
      }
      if (c.state !== 'Completed' && c.state !== 'Complete') {
        return;
      }
      const code = c.code;
      const compact = (c.compactCode || c.code || '').replace(/\s+/g, '').toUpperCase();
      const existing = map.get(code) || map.get(compact);

      if (existing) {
        existing.completionCount = (existing.completionCount || 0) + 1;
        if (GRADE_POINTS[c.grade] !== undefined) {
          const prevGpa = existing.averageGpa || 3.5;
          const newGpa = Number(((prevGpa * (existing.completionCount - 1) + GRADE_POINTS[c.grade]) / existing.completionCount).toFixed(2));
          existing.averageGpa = newGpa;
        }
      } else {
        const gradeVal = GRADE_POINTS[c.grade] !== undefined ? GRADE_POINTS[c.grade] : 3.5;
        const entry = {
          courseCode: c.code,
          courseTitle: c.title,
          category: c.geCategory || 'ELECTIVE',
          completionCount: 1,
          averageGpa: gradeVal,
          isInstitutional: true
        };
        map.set(c.code, entry);
        map.set(compact, entry);
      }
    });
  }

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

  // 1. Concrete Catalog Course Guard:
  // Standard concrete courses (e.g., MTH 27100, CSC 10100, ENG 17000) MUST NOT display recommendations.
  const isPlaceholder = Boolean(
    selectedCourse.isPlaceholder ||
    selectedCourse.isCustomPlaceholder ||
    selectedCourse.type === 'placeholder' ||
    selectedCourse.code?.startsWith('GE') ||
    selectedCourse.code?.startsWith('ELECT') ||
    selectedCourse.code?.startsWith('REQ_') ||
    selectedCourse.canonicalCode?.startsWith('REQ_') ||
    selectedCourse.title?.toLowerCase().includes('placeholder') ||
    selectedCourse.title?.toLowerCase().includes('elective') ||
    selectedCourse.ge_bucket_id ||
    selectedCourse.geBucketId
  );

  if (!isPlaceholder) {
    return null;
  }

  // Resolve catalogs and historical data
  const catalog = catalogCourses && Array.isArray(catalogCourses)
    ? catalogCourses
    : masterDb.courses || [];

  const historicalMap = buildHistoricalLookup(
    historicalData && Array.isArray(historicalData) ? historicalData : baseHistoricalFulfillments,
    activeStudentCourses
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

  // Filter concrete institutional catalog courses strictly
  // Drop any course where isTransfer === true, starts with ELECT or GE, or is a placeholder
  const institutionalCandidates = catalog.filter((c) => {
    if (c.type === 'placeholder') return false;
    if (c.isPlaceholder || c.isCustomPlaceholder) return false;
    if (c.isTransfer || c.fromTranscriptPdf) return false;
    if (c.department === 'ELECT' || c.department === 'GE') return false;
    if (/^(?:ELECT|GE)\b/i.test(c.code)) return false;
    if (/^REQ_/i.test(c.code)) return false;
    return true;
  });

  const bucketId = getBucketIdFromCourse(selectedCourse);
  const mandatoryCodes = getMandatoryProgramCourseCodes(activeProgram, catalog);

  let tier = 1;
  let tierLabel = 'Categorized General Education';
  let matchedCourses = [];

  // 3. Three-Tier Placeholder Recommendation Pipeline
  if (bucketId && bucketId !== 'ge_elective') {
    // TIER 1: Categorized GE Placeholders (e.g. GE-MATH, GE-LIT, GE-SOCSCI, GE-HUM, REQ_GE_*)
    tier = 1;
    tierLabel = 'Categorized General Education';

    matchedCourses = institutionalCandidates.filter((cand) => {
      // Check if candidate matches this bucket
      if (matchesBucket(bucketId, cand)) return true;
      // Also support explicit eligible_courses listed on placeholder
      if (selectedCourse.eligible_courses && Array.isArray(selectedCourse.eligible_courses)) {
        return selectedCourse.eligible_courses.includes(cand.code);
      }
      return false;
    });
  } else if (
    bucketId === 'ge_elective' ||
    /GE-Any|General Education Breadth|GE Elective|REQ_GE_ELEC/i.test(combinedMetaStr)
  ) {
    // TIER 2: Open / Breadth GE Placeholders (e.g. GE-Any, General Education Breadth)
    tier = 2;
    tierLabel = 'Open General Education Breadth';

    matchedCourses = institutionalCandidates.filter((cand) => {
      // Pool all institutional courses carrying any GE attribute
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
      gradeBadge: formatGpaWithLetter(averageGpa),
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

  // Attach metadata properties to array for caller convenience
  formattedRecommendations.tier = tier;
  formattedRecommendations.tierLabel = tierLabel;
  formattedRecommendations.isUpperDivision = isUpperDivision;
  formattedRecommendations.placeholderCode = selectedCourse.code;
  formattedRecommendations.placeholderTitle = selectedCourse.title;

  return formattedRecommendations;
}
