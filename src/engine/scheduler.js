/**
 * Degree Planner Deterministic Core
 * Deterministic 8-Week Critical-Path Scheduler, Tactile Weight Classifier,
 * Priority Registration Calculator, & "What-If" Accelerator (src/engine/scheduler.js)
 */

import masterDbDefault from '../data/masterDatabase.json' with { type: 'json' };
import { normalizeCourseCode, parseTermInfo } from './transcriptParser.js';

/**
 * Official Tactile Weight Flexibility Palette (Style.md Section 2)
 */
export const TACTILE_WEIGHT_TIERS = {
  EASILY_MOVABLE: {
    tier: 1,
    label: 'Easily Movable',
    colorName: 'Blue',
    cardBg: '#F0F9FF',
    borderColor: '#0284C7',
    textColor: '#0369A1'
  },
  MOVABLE_WITH_EFFORT: {
    tier: 2,
    label: 'Movable with Effort',
    colorName: 'Amber',
    cardBg: '#FFFBEB',
    borderColor: '#D97706',
    textColor: '#92400E'
  },
  NOT_REALLY_MOVABLE: {
    tier: 3,
    label: 'Not Really Movable',
    colorName: 'Slate',
    cardBg: '#1E293B',
    borderColor: '#0F172A',
    textColor: '#0F172A',
    pillBg: '#1E293B',
    pillText: '#FFFFFF'
  }
};

/**
 * Normalize session availability flags on a course object.
 * Applies the sitewide fallback (Fall-16wk & Spring-16wk) if availability is blank/unverified.
 */
export function resolveCourseAvailability(course) {
  const isPlaceholder =
    course.type === 'placeholder' ||
    Boolean(course.isPlaceholder) ||
    Boolean(
      course.code &&
        (course.code.startsWith('REQ_') ||
          course.code.startsWith('GE ') ||
          course.code.startsWith('UL-ELEC') ||
          course.code.startsWith('ELEC '))
    );

  if (isPlaceholder) {
    return {
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      offered_sessions: ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      hasOddEvenFlags: false,
      usedBlankFallback: false,
      annualSessionCount: 7
    };
  }

  const hasExplicitFlags =
    Boolean(course.FA_I_8wk) ||
    Boolean(course.FA_II_8wk) ||
    Boolean(course.FA_16wk) ||
    Boolean(course.SP_I_8wk) ||
    Boolean(course.SP_II_8wk) ||
    Boolean(course.SP_16wk) ||
    Boolean(course.SU_8wk);

  const sessionsArr = Array.isArray(course.offered_sessions) ? course.offered_sessions : [];
  const hasOddEvenFlags = sessionsArr.some((s) =>
    ['FA-Odd', 'FA-Even', 'SP-Odd', 'SP-Even'].includes(s)
  );

  if (!hasExplicitFlags && !hasOddEvenFlags && sessionsArr.length === 0) {
    // Sitewide Blank Availability Fallback: Fall-16wk and Spring-16wk
    return {
      FA_I_8wk: false,
      FA_II_8wk: false,
      FA_16wk: true,
      SP_I_8wk: false,
      SP_II_8wk: false,
      SP_16wk: true,
      SU_8wk: false,
      offered_sessions: ['Fall-16wk', 'Spring-16wk'],
      usedBlankFallback: true,
      annualSessionCount: 2
    };
  }

  const FA_I_8wk = Boolean(course.FA_I_8wk || sessionsArr.includes('FA-I'));
  const FA_II_8wk = Boolean(course.FA_II_8wk || sessionsArr.includes('FA-II'));
  const FA_16wk = Boolean(course.FA_16wk || sessionsArr.includes('Fall-16wk'));
  const SP_I_8wk = Boolean(course.SP_I_8wk || sessionsArr.includes('SP-I'));
  const SP_II_8wk = Boolean(course.SP_II_8wk || sessionsArr.includes('SP-II'));
  const SP_16wk = Boolean(course.SP_16wk || sessionsArr.includes('Spring-16wk'));
  const SU_8wk = Boolean(course.SU_8wk || sessionsArr.includes('SU'));

  const annualSessionCount =
    [FA_I_8wk, FA_II_8wk, FA_16wk, SP_I_8wk, SP_II_8wk, SP_16wk, SU_8wk].filter(Boolean).length ||
    (hasOddEvenFlags ? 1 : 2);

  return {
    FA_I_8wk,
    FA_II_8wk,
    FA_16wk,
    SP_I_8wk,
    SP_II_8wk,
    SP_16wk,
    SU_8wk,
    offered_sessions: sessionsArr,
    hasOddEvenFlags,
    usedBlankFallback: false,
    annualSessionCount
  };
}

/**
 * Check if a course is offered in a specific session slot and calendar year.
 * Enforces FA-Odd / FA-Even / SP-Odd / SP-Even against the exact calendar year.
 */
export function isCourseOfferedInSlot(course, slotType, calendarYear) {
  const avail = resolveCourseAvailability(course);
  const isEvenYear = calendarYear % 2 === 0;
  const sessions = avail.offered_sessions || [];

  // Check Odd/Even year restrictions if present
  if (sessions.includes('FA-Odd') && slotType.startsWith('FA') && isEvenYear) return false;
  if (sessions.includes('FA-Even') && slotType.startsWith('FA') && !isEvenYear) return false;
  if (sessions.includes('SP-Odd') && slotType.startsWith('SP') && isEvenYear) return false;
  if (sessions.includes('SP-Even') && slotType.startsWith('SP') && !isEvenYear) return false;

  switch (slotType) {
    case 'FA-I':
      return avail.FA_I_8wk || sessions.includes('FA-Odd') || sessions.includes('FA-Even');
    case 'FA-II':
      return avail.FA_II_8wk;
    case 'Fall-16wk':
      return avail.FA_16wk;
    case 'SP-I':
      return avail.SP_I_8wk || sessions.includes('SP-Odd') || sessions.includes('SP-Even');
    case 'SP-II':
      return avail.SP_II_8wk;
    case 'Spring-16wk':
      return avail.SP_16wk;
    case 'SU':
      return avail.SU_8wk;
    default:
      return false;
  }
}

/**
 * Evaluate boolean prerequisite AST (`prereq_logic`) against:
 * - `completedBeforeSlot`: Set of compact course codes strictly completed prior to this slot
 * - `sameSlotScheduled`: Set of compact course codes scheduled in the exact same slot (for COREQ)
 * - `context`: { mathPlacementSatisfied, cumulativeCreditsBeforeSemester, isFinalMajorSemester }
 */
export function evaluatePrereqTree(
  prereqLogic,
  completedBeforeSlot,
  sameSlotScheduled = new Set(),
  context = {}
) {
  if (!prereqLogic) return { satisfied: true, missing: [] };

  const toCompact = (rawCode) => {
    if (!rawCode) return '';
    const norm = normalizeCourseCode(rawCode);
    if (norm) return norm.compact;
    return String(rawCode).replace(/\s+/g, '').toUpperCase();
  };

  const hasCourse = (rawCode) => {
    const compact = toCompact(rawCode);
    if (!compact) return false;
    if (completedBeforeSlot.has(compact)) return true;
    // Legacy substitution check
    if (compact === 'ICS41500' && completedBeforeSlot.has('ICS41100')) return true;
    if (compact === 'ICS41700' && completedBeforeSlot.has('ICS41400')) return true;
    // Any higher MTH course satisfies MTH 11000
    if (compact === 'MTH11000' && context.mathPlacementSatisfied) return true;
    return false;
  };

  const evalNode = (node) => {
    if (!node) return { satisfied: true, missing: [] };

    if (node.op === 'MATH_PLACEMENT') {
      const ok = Boolean(
        context.mathPlacementSatisfied ||
          completedBeforeSlot.has('MTH11000') ||
          completedBeforeSlot.has('MTH14100') ||
          completedBeforeSlot.has('MTH15100')
      );
      return { satisfied: ok, missing: ok ? [] : ['Math Placement or MTH 11000+'] };
    }

    if (node.op === 'LAST_FULL_SEMESTER') {
      const minCr = node.min_credits || 90;
      const ok =
        (context.cumulativeCreditsBeforeSemester || 0) >= minCr ||
        Boolean(context.isFinalMajorSemester);
      return {
        satisfied: ok,
        missing: ok ? [] : [`Senior Status (${minCr}+ credits) & Last Full Semester`]
      };
    }

    if (node.op === 'COREQ') {
      const compact = toCompact(node.code);
      const ok =
        Boolean(compact) && (completedBeforeSlot.has(compact) || sameSlotScheduled.has(compact));
      return { satisfied: ok, missing: ok ? [] : [`Corequisite ${node.code}`] };
    }

    if (node.op === 'COURSE' || (!node.op && node.code)) {
      const ok = hasCourse(node.code);
      return { satisfied: ok, missing: ok ? [] : [node.code] };
    }

    if (node.op === 'AND' && Array.isArray(node.items)) {
      const missing = [];
      for (const child of node.items) {
        const res = evalNode(child);
        if (!res.satisfied) missing.push(...res.missing);
      }
      return { satisfied: missing.length === 0, missing };
    }

    if ((node.op === 'OR' || node.op === 'ONE_OF') && Array.isArray(node.items)) {
      const childResults = node.items.map((child) => evalNode(child));
      const anyOk = childResults.some((r) => r.satisfied);
      if (anyOk) return { satisfied: true, missing: [] };
      return {
        satisfied: false,
        missing: [`One of (${node.items.map((i) => i.code || i.op).join(' OR ')})`]
      };
    }

    return { satisfied: true, missing: [] };
  };

  return evalNode(prereqLogic);
}

/**
 * Extract all compact course codes referenced inside a prereq_logic AST.
 */
export function extractReferencedPrereqCodes(prereqLogic) {
  const codes = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.code) {
      const norm = normalizeCourseCode(node.code);
      if (norm) {
        codes.add(norm.compact);
      } else {
        codes.add(String(node.code).replace(/\s+/g, '').toUpperCase());
      }
    }
    if (Array.isArray(node.items)) {
      node.items.forEach(walk);
    }
  };
  walk(prereqLogic);
  return Array.from(codes);
}

/**
 * Compute Critical-Path Depth and Dependent Count for every course in the remaining pool.
 */
export function computeDependencyMetrics(courses) {
  const byCompact = new Map();
  const dependentsMap = new Map(); // compactCode -> Set of compactCodes that require it

  for (const c of courses) {
    byCompact.set(c.compactCode, c);
    dependentsMap.set(c.compactCode, new Set());
  }

  for (const c of courses) {
    const prereqs = extractReferencedPrereqCodes(c.prereq_logic);
    for (const pCompact of prereqs) {
      if (dependentsMap.has(pCompact) && pCompact !== c.compactCode) {
        dependentsMap.get(pCompact).add(c.compactCode);
      }
    }
  }

  const depthMemo = new Map();
  const getDepth = (compact, visited = new Set()) => {
    if (depthMemo.has(compact)) return depthMemo.get(compact);
    if (visited.has(compact)) return 0;
    visited.add(compact);

    const directDeps = dependentsMap.get(compact) || new Set();
    let maxChildDepth = 0;
    for (const dep of directDeps) {
      maxChildDepth = Math.max(maxChildDepth, 1 + getDepth(dep, new Set(visited)));
    }
    depthMemo.set(compact, maxChildDepth);
    return maxChildDepth;
  };

  const getTransitiveDependentsCount = (compact) => {
    const seen = new Set();
    const queue = [...(dependentsMap.get(compact) || [])];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!seen.has(curr)) {
        seen.add(curr);
        for (const nxt of dependentsMap.get(curr) || []) {
          if (!seen.has(nxt)) queue.push(nxt);
        }
      }
    }
    return seen.size;
  };

  const metrics = new Map();
  for (const c of courses) {
    const avail = resolveCourseAvailability(c);
    const depth = getDepth(c.compactCode);
    const dependentCount = getTransitiveDependentsCount(c.compactCode);
    const isCapstone =
      c.compactCode === 'ICS48900' ||
      c.compactCode === 'IIT48900' ||
      c.prereq_logic?.op === 'LAST_FULL_SEMESTER';

    metrics.set(c.compactCode, {
      criticalPathDepth: depth,
      dependentCount,
      annualSessionCount: avail.annualSessionCount,
      isCapstone,
      usedBlankFallback: avail.usedBlankFallback
    });
  }

  return metrics;
}

/**
 * Classify a course into one of the 3 Tactile Weight Flexibility Tiers (Style.md Section 2).
 */
export function classifyTactileWeight(course, metric = {}, isFinalSemesterCourse = false) {
  const isPlaceholder =
    course.type === 'placeholder' ||
    Boolean(course.isPlaceholder) ||
    course.flexibility_tier === 'sky_blue' ||
    Boolean(
      course.code &&
        (course.code.startsWith('REQ_') ||
          course.code.startsWith('GE ') ||
          course.code.startsWith('UL-ELEC') ||
          course.code.startsWith('ELEC '))
    );

  // Locked placeholders or courses always respect advisor lock (Tier 3)
  if (course.locked) {
    return {
      ...TACTILE_WEIGHT_TIERS.NOT_REALLY_MOVABLE,
      reason: 'Locked by advisor/student'
    };
  }

  // Requirement Placeholders are deterministically Tier 1 (Sky Blue / Blue)
  if (isPlaceholder) {
    return {
      ...TACTILE_WEIGHT_TIERS.EASILY_MOVABLE,
      reason: 'Requirement placeholder with universal session availability'
    };
  }

  const isCapstone =
    course.compactCode === 'ICS48900' ||
    course.compactCode === 'IIT48900' ||
    course.prereq_logic?.op === 'LAST_FULL_SEMESTER';

  const avail = resolveCourseAvailability(course);
  const annualSessions = metric.annualSessionCount ?? avail.annualSessionCount;
  const dependentCount = metric.dependentCount ?? 0;

  // Tier 3: Not Really Movable (Slate)
  // Triggered if: Capstone, offered only 1 time per year (or Odd/Even only), or critical chain bottleneck in final semester
  if (
    isCapstone ||
    annualSessions <= 1 ||
    avail.hasOddEvenFlags ||
    (isFinalSemesterCourse && !isPlaceholder && course.category !== 'E')
  ) {
    return {
      ...TACTILE_WEIGHT_TIERS.NOT_REALLY_MOVABLE,
      reason: isCapstone
        ? 'Degree Capstone (Final Full Semester)'
        : annualSessions <= 1
        ? `Offered only once per year (${(avail.offered_sessions || []).join(', ')})`
        : 'Moving this course delays graduation'
    };
  }

  // Tier 2: Movable with Effort (Amber)
  // Triggered if: prerequisite for another remaining course OR offered only 2-3 sessions per year
  if (dependentCount > 0 || annualSessions <= 3) {
    return {
      ...TACTILE_WEIGHT_TIERS.MOVABLE_WITH_EFFORT,
      reason:
        dependentCount > 0
          ? `Prerequisite for ${dependentCount} downstream course(s)`
          : `Limited session availability (${(avail.offered_sessions || []).join(', ')})`
    };
  }

  // Tier 1: Easily Movable (Blue)
  return {
    ...TACTILE_WEIGHT_TIERS.EASILY_MOVABLE,
    reason: 'Offered in almost every session and has no downstream prerequisite dependents'
  };
}

/**
 * Calculate Priority Registration Class Standing and Opening Date Banner (Style.md Section 5.5 & 6).
 * Strictly uses credits COMPLETED PRIOR to that semester's registration opening window:
 * - For Spring registration (late October / early November): includes prior completed + FA-I (8wk) credits!
 * - For Fall/Summer registration (late March / early April): includes prior completed + SP-I (8wk) credits!
 * Never abbreviates month names; never uses ordinal suffixes (st/nd/rd/th).
 */
export function calculateRegistrationOpeningNotice(
  targetSeason,
  targetYear,
  creditsCompletedBeforePrecedingSemester,
  precedingSession1Credits = 0
) {
  const creditsAtRegistrationWindow =
    creditsCompletedBeforePrecedingSemester + precedingSession1Credits;

  let standing = 'Freshmen';
  let dayOffset = 9; // Monday=Senior(0), Wednesday=Junior(+2), Friday=Sophomore(+4), Next Monday=Freshman(+7)

  if (creditsAtRegistrationWindow >= 90) {
    standing = 'Seniors';
    dayOffset = 0;
  } else if (creditsAtRegistrationWindow >= 60) {
    standing = 'Juniors';
    dayOffset = 2;
  } else if (creditsAtRegistrationWindow >= 30) {
    standing = 'Sophomores';
    dayOffset = 4;
  } else {
    standing = 'Freshmen';
    dayOffset = 7;
  }

  // Spring registration opens in October of (targetYear - 1)
  // Fall & Summer registration opens in March/April of targetYear
  let weekday = 'Monday';
  let fullMonth = 'October';
  let dayNum = 24 + dayOffset;

  if (targetSeason === 'Spring') {
    fullMonth = 'October';
    const baseDay = 24; // e.g., Monday, October 24 / Wednesday, October 26
    dayNum = baseDay + dayOffset;
    if (dayNum > 31) {
      fullMonth = 'November';
      dayNum -= 31;
    }
  } else {
    fullMonth = 'March';
    const baseDay = 23; // e.g., Monday, March 23 / Wednesday, March 25
    dayNum = baseDay + dayOffset;
    if (dayNum > 31) {
      fullMonth = 'April';
      dayNum -= 31;
    }
  }

  if (dayOffset === 0 || dayOffset === 7) weekday = 'Monday';
  else if (dayOffset === 2) weekday = 'Wednesday';
  else if (dayOffset === 4) weekday = 'Friday';

  const dateFormatted = `${weekday}, ${fullMonth} ${dayNum}`;
  const bannerText = `Registration opens ${dateFormatted}, for ${standing} (based on ${creditsAtRegistrationWindow} completed credits prior to registration).`;

  return {
    standing,
    creditsAtRegistrationWindow,
    dateFormatted,
    bannerText
  };
}

/**
 * Determine the official Graduation Application Deadline per Academic Calendar:
 * - March Graduation (SP-I): January 15 of the same year
 * - May Graduation (SP-II / Spring): February 1 of the same year
 * - August Graduation (SU / Summer): June 1 of the same year
 * - October Graduation (FA-I): September 15 of the same year
 * - December Graduation (FA-II / Fall): September 15 of the same year
 */
export function getGraduationApplicationDeadline(semesterSeason, year, lastActiveSlot = '') {
  if (semesterSeason === 'Spring') {
    if (lastActiveSlot === 'SP-I') {
      return {
        conferralMonth: 'March',
        deadlineDate: `January 15, ${year}`,
        noteText: `Application for Degree Form Required: File by January 15, ${year}, for March ${year} graduation.`
      };
    }
    return {
      conferralMonth: 'May',
      deadlineDate: `February 1, ${year}`,
      noteText: `Application for Degree Form Required: File by February 1, ${year}, for May ${year} graduation.`
    };
  }

  if (semesterSeason === 'Summer') {
    return {
      conferralMonth: 'August',
      deadlineDate: `June 1, ${year}`,
      noteText: `Application for Degree Form Required: File by June 1, ${year}, for August ${year} graduation.`
    };
  }

  // Fall
  if (lastActiveSlot === 'FA-I') {
    return {
      conferralMonth: 'October',
      deadlineDate: `September 15, ${year}`,
      noteText: `Application for Degree Form Required: File by September 15, ${year}, for October ${year} graduation.`
    };
  }
  return {
    conferralMonth: 'December',
    deadlineDate: `September 15, ${year}`,
    noteText: `Application for Degree Form Required: File by September 15, ${year}, for December ${year} graduation.`
  };
}

/**
 * Parse a starting semester string (e.g., 'Fall 2026', 'Spring 2027') into { season, year }.
 */
function parseStartSemester(startSemesterStr = 'Fall 2026') {
  const m = String(startSemesterStr).match(/(Fall|Spring|Summer)\s+(20\d{2})/i);
  if (m) {
    const season = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return { season, year: parseInt(m[2], 10) };
  }
  return { season: 'Fall', year: 2026 };
}

/**
 * Advance to the next chronological semester: Fall Y -> Spring Y+1 -> Summer Y+1 -> Fall Y+1
 */
function getNextSemester(season, year) {
  if (season === 'Fall') return { season: 'Spring', year: year + 1 };
  if (season === 'Spring') return { season: 'Summer', year };
  return { season: 'Fall', year };
}

/**
 * Calculate the starting semester deterministically from student records (Anthology / Transcript).
 * Evaluates active enrollments ('Current', 'Scheduled') and completed coursework terms.
 */
export function calculateStartingSemester(parsedTranscript) {
  if (!parsedTranscript || !parsedTranscript.validCourses || parsedTranscript.validCourses.length === 0) {
    return 'Fall 2026';
  }

  const activeCourses = (parsedTranscript.validCourses || []).filter(
    (c) => c.state === 'Current' || c.state === 'Scheduled'
  );

  let latestTermInfo = null;
  const candidates = activeCourses.length > 0 ? activeCourses : parsedTranscript.validCourses;

  for (const c of candidates) {
    const t = c.termInfo || parseTermInfo(c.term);
    if (!t || t.isTransfer || !t.year) continue;
    if (!latestTermInfo || (t.sortKey && t.sortKey > (latestTermInfo.sortKey || 0))) {
      latestTermInfo = t;
    }
  }

  if (!latestTermInfo) {
    return 'Fall 2026';
  }

  // If student has active enrollments (e.g. Fall 2026),
  // future unscheduled courses start in the next chronological semester.
  if (activeCourses.length > 0) {
    if (latestTermInfo.season === 'Fall') {
      return `Spring ${latestTermInfo.year + 1}`;
    } else if (latestTermInfo.season === 'Spring') {
      return `Summer ${latestTermInfo.year}`;
    } else {
      return `Fall ${latestTermInfo.year}`;
    }
  } else {
    // If only prior completed courses exist, advance to next term
    if (latestTermInfo.season === 'Fall') {
      return `Spring ${latestTermInfo.year + 1}`;
    } else if (latestTermInfo.season === 'Spring') {
      return `Fall ${latestTermInfo.year}`;
    } else {
      return `Fall ${latestTermInfo.year}`;
    }
  }
}

/**
 * Core Critical-Path Scheduling Engine (single pass without What-If recursion).
 */
function generateBaseSchedule(auditResult, parsedTranscript, constraints = {}) {
  const effectiveStartSemester =
    constraints.startSemester || calculateStartingSemester(parsedTranscript);
  const startInfo = parseStartSemester(effectiveStartSemester);
  const pacingMode = constraints.pacingMode || 'Full-Time';
  const max8wkCredits =
    constraints.max8wkCredits !== undefined
      ? Number(constraints.max8wkCredits)
      : pacingMode === 'Part-Time'
      ? 6
      : 9;
  const max16wkCredits =
    constraints.max16wkCredits !== undefined
      ? Number(constraints.max16wkCredits)
      : pacingMode === 'Part-Time'
      ? 11
      : 18;
  const allowSummer =
    constraints.summerAvailability === 'Yes Summer' || Boolean(constraints.allowSummer);
  const maxSummerCredits =
    constraints.maxSummerCredits !== undefined ? Number(constraints.maxSummerCredits) : 6;

  // Track completed course compact codes prior to future schedule
  const completedCompactSet = new Set();
  for (const c of parsedTranscript?.validCourses || []) {
    if (c.state === 'TR' || c.state === 'Completed' || c.state === 'Current') {
      completedCompactSet.add(c.compactCode);
    }
  }

  let runningCompletedCredits =
    (parsedTranscript?.summary?.totalCompletedCredits || 0) +
    (parsedTranscript?.summary?.totalCurrentCredits || 0);

  // Clone remaining items from auditResult
  const unscheduled = new Map();
  const missingAvailabilityCourses = [];

  for (const item of auditResult.remainingCourseItems || []) {
    const isPlaceholder =
      item.type === 'placeholder' ||
      Boolean(item.isPlaceholder) ||
      Boolean(
        item.code &&
          (item.code.startsWith('REQ_') ||
            item.code.startsWith('GE ') ||
            item.code.startsWith('UL-ELEC') ||
            item.code.startsWith('ELEC '))
      );

    const avail = resolveCourseAvailability(item);
    if (!isPlaceholder && (avail.usedBlankFallback || item.verification_status === 'Blank_Unverified')) {
      missingAvailabilityCourses.push(item.code);
    }
    unscheduled.set(item.compactCode, { ...item, availability: avail });
  }

  const metrics = computeDependencyMetrics(Array.from(unscheduled.values()));
  const forcedSummerAlerts = [];
  const scheduledSemesters = [];

  // Cisco lecture -> lab pair lookup
  const ciscoLectureToLab = {
    ICS32300: 'ICS32301',
    ICS32400: 'ICS32401',
    ICS32500: 'ICS32501'
  };
  const ciscoLabs = new Set(['ICS32301', 'ICS32401', 'ICS32501']);

  let currSeason = startInfo.season;
  let currYear = startInfo.year;
  let safetyCounter = 0;
  let prevSession1Credits = 0;
  let creditsBeforePrevSemester = runningCompletedCredits;

  while (unscheduled.size > 0 && safetyCounter < 30) {
    safetyCounter += 1;

    // Check if Summer semester should be skipped or forced
    if (currSeason === 'Summer') {
      // Check if any unscheduled course is a Forced Summer Exception (e.g. IIT 45200) whose prereqs are met!
      const forcedSummerCandidates = Array.from(unscheduled.values()).filter((c) => {
        const av = c.availability;
        const isSummerOnly =
          av.SU_8wk &&
          !av.FA_I_8wk &&
          !av.FA_II_8wk &&
          !av.FA_16wk &&
          !av.SP_I_8wk &&
          !av.SP_II_8wk &&
          !av.SP_16wk;
        if (!isSummerOnly) return false;
        const prereqCheck = evaluatePrereqTree(c.prereq_logic, completedCompactSet, new Set(), {
          mathPlacementSatisfied: auditResult.flags?.mathPlacementSatisfied,
          cumulativeCreditsBeforeSemester: runningCompletedCredits
        });
        return prereqCheck.satisfied;
      });

      // Also check if only 1-2 electives remain after Spring Capstone (Spring Capstone + Summer elective early finish)
      const allMajorDone = Array.from(unscheduled.values()).every(
        (c) => c.isPlaceholder || c.type === 'placeholder' || c.category === 'E' || c.category === 'GE'
      );
      const canFinishInSummer =
        allMajorDone &&
        Array.from(unscheduled.values()).reduce((s, c) => s + c.credits, 0) <= maxSummerCredits;

      if (!allowSummer && forcedSummerCandidates.length === 0 && !canFinishInSummer) {
        // Render collapsed empty Summer bar and advance to Fall
        scheduledSemesters.push({
          id: `Summer-${currYear}`,
          season: 'Summer',
          year: currYear,
          title: `Summer ${currYear}`,
          isCollapsed: true,
          isForcedSummer: false,
          totalCredits: 0,
          lanes: {
            SU: []
          },
          registrationNotice: calculateRegistrationOpeningNotice(
            'Summer',
            currYear,
            creditsBeforePrevSemester,
            prevSession1Credits
          ),
          notes: []
        });
        const nxt = getNextSemester(currSeason, currYear);
        currSeason = nxt.season;
        currYear = nxt.year;
        continue;
      }

      // Schedule Summer (either allowed, forced by IIT 45200, or early elective finish)
      const isForced = !allowSummer && forcedSummerCandidates.length > 0;
      const suLane = [];
      let suCredits = 0;
      const effectiveSuCap = isForced ? Math.max(3, maxSummerCredits) : maxSummerCredits;

      const suPool = isForced
        ? forcedSummerCandidates
        : Array.from(unscheduled.values()).filter((c) => isCourseOfferedInSlot(c, 'SU', currYear));

      // Sort by critical path depth + non-placeholder priority
      suPool.sort((a, b) => {
        const ma = metrics.get(a.compactCode) || {};
        const mb = metrics.get(b.compactCode) || {};
        const aIsPlaceholder = a.isPlaceholder || a.type === 'placeholder' ? 1 : 0;
        const bIsPlaceholder = b.isPlaceholder || b.type === 'placeholder' ? 1 : 0;
        if (aIsPlaceholder !== bIsPlaceholder) {
          return aIsPlaceholder - bIsPlaceholder;
        }
        return (mb.criticalPathDepth || 0) - (ma.criticalPathDepth || 0);
      });

      const suScheduledCompacts = new Set();
      for (const candidate of suPool) {
        if (!unscheduled.has(candidate.compactCode)) continue;
        if (suCredits + candidate.credits > effectiveSuCap) continue;

        const prereqRes = evaluatePrereqTree(
          candidate.prereq_logic,
          completedCompactSet,
          suScheduledCompacts,
          {
            mathPlacementSatisfied: auditResult.flags?.mathPlacementSatisfied,
            cumulativeCreditsBeforeSemester: runningCompletedCredits
          }
        );

        if (prereqRes.satisfied) {
          suLane.push(candidate);
          suCredits += candidate.credits;
          suScheduledCompacts.add(candidate.compactCode);
          unscheduled.delete(candidate.compactCode);

          if (isForced && candidate.compactCode === 'IIT45200') {
            forcedSummerAlerts.push({
              courseCode: candidate.code,
              courseTitle: candidate.title,
              semester: `Summer ${currYear}`,
              message: `${candidate.code} (${candidate.title}) is offered strictly in the Summer 8-week session (SU). Forced Summer enrollment was automatically enabled in Summer ${currYear} despite the 'No Summer' preference.`
            });
          }
        }
      }

      for (const cCode of suScheduledCompacts) {
        completedCompactSet.add(cCode);
      }
      runningCompletedCredits += suCredits;

      scheduledSemesters.push({
        id: `Summer-${currYear}`,
        season: 'Summer',
        year: currYear,
        title: `Summer ${currYear}`,
        isCollapsed: suCredits === 0,
        isForcedSummer: isForced && suCredits > 0,
        totalCredits: suCredits,
        lanes: {
          SU: suLane
        },
        registrationNotice: calculateRegistrationOpeningNotice(
          'Summer',
          currYear,
          creditsBeforePrevSemester,
          prevSession1Credits
        ),
        notes: []
      });

      const nxt = getNextSemester(currSeason, currYear);
      currSeason = nxt.season;
      currYear = nxt.year;
      continue;
    }

    // =========================================================================
    // FALL OR SPRING SEMESTER SCHEDULING (Session I 8wk -> Session II 8wk + 16wk)
    // =========================================================================
    const slot1Key = currSeason === 'Fall' ? 'FA-I' : 'SP-I';
    const slot2Key = currSeason === 'Fall' ? 'FA-II' : 'SP-II';
    const slot16Key = currSeason === 'Fall' ? 'Fall-16wk' : 'Spring-16wk';

    const registrationNotice = calculateRegistrationOpeningNotice(
      currSeason,
      currYear,
      creditsBeforePrevSemester,
      prevSession1Credits
    );

    const creditsAtStartOfSemester = runningCompletedCredits;
    const lane1 = [];
    const lane2 = [];
    const lane16 = [];
    let lane1Credits = 0;
    let lane2Credits = 0;
    let lane16Credits = 0;

    const totalSemCredits = () => lane1Credits + lane2Credits + lane16Credits;

    // Helper to score & sort candidate courses for a given slot
    const getSortedCandidatesForSlot = (slotKey, completedSet, sameSlotSet) => {
      const remainingNonCapstoneMajor = Array.from(unscheduled.values()).filter(
        (c) =>
          (c.category === 'M' || c.category === 'Em') &&
          c.compactCode !== 'ICS48900' &&
          c.compactCode !== 'IIT48900'
      );

      const candidates = Array.from(unscheduled.values()).filter((c) => {
        // Cisco 1cr labs are scheduled atomically with their 5cr lecture
        if (ciscoLabs.has(c.compactCode)) return false;

        if (!isCourseOfferedInSlot(c, slotKey, currYear)) return false;

        const isCap = c.compactCode === 'ICS48900' || c.compactCode === 'IIT48900';
        if (isCap) {
          // Hold Capstone until final major semester (<= 2 non-capstone major courses left) and >= 84 credits
          const projectedCreditsWithThisSem = runningCompletedCredits + totalSemCredits() + 9;
          if (remainingNonCapstoneMajor.length > 3 || projectedCreditsWithThisSem < 87) {
            return false;
          }
        }

        const prereqCheck = evaluatePrereqTree(c.prereq_logic, completedSet, sameSlotSet, {
          mathPlacementSatisfied: auditResult.flags?.mathPlacementSatisfied,
          cumulativeCreditsBeforeSemester: runningCompletedCredits + totalSemCredits(),
          isFinalMajorSemester: remainingNonCapstoneMajor.length <= 2
        });

        return prereqCheck.satisfied;
      });

      // Deterministic Priority Sort:
      // 1. Specific Major/Emphasis/Math courses with downstream dependents (criticalPathDepth > 0)
      // 2. Scarcity (offered in 1 session/yr before 2 sessions/yr before any-session courses)
      // 3. Major/Emphasis courses before generic GE / Elective placeholders
      candidates.sort((a, b) => {
        const ma = metrics.get(a.compactCode) || {};
        const mb = metrics.get(b.compactCode) || {};

        const aIsPlaceholder = a.isPlaceholder || a.type === 'placeholder' ? 1 : 0;
        const bIsPlaceholder = b.isPlaceholder || b.type === 'placeholder' ? 1 : 0;
        if (aIsPlaceholder !== bIsPlaceholder) return aIsPlaceholder - bIsPlaceholder;

        // Prioritize corequisite unlockers and deep prerequisite chains
        if ((mb.criticalPathDepth || 0) !== (ma.criticalPathDepth || 0)) {
          return (mb.criticalPathDepth || 0) - (ma.criticalPathDepth || 0);
        }

        if ((mb.dependentCount || 0) !== (ma.dependentCount || 0)) {
          return (mb.dependentCount || 0) - (ma.dependentCount || 0);
        }

        if ((ma.annualSessionCount || 7) !== (mb.annualSessionCount || 7)) {
          return (ma.annualSessionCount || 7) - (mb.annualSessionCount || 7);
        }

        return a.code.localeCompare(b.code);
      });

      return candidates;
    };

    // -------------------------------------------------------------------------
    // STEP A: Fill Session I (8wk) (FA-I or SP-I)
    // -------------------------------------------------------------------------
    const slot1ScheduledSet = new Set();
    let madeProgress1 = true;
    while (madeProgress1 && lane1Credits < max8wkCredits && totalSemCredits() < max16wkCredits) {
      madeProgress1 = false;
      const candidates = getSortedCandidatesForSlot(
        slot1Key,
        completedCompactSet,
        slot1ScheduledSet
      );

      for (const cand of candidates) {
        if (!unscheduled.has(cand.compactCode)) continue;

        // Check if this is a Cisco 5cr lecture that needs its 1cr concurrent lab
        const pairedLabCompact = ciscoLectureToLab[cand.compactCode];
        const pairedLab = pairedLabCompact ? unscheduled.get(pairedLabCompact) : null;
        const neededCredits = cand.credits + (pairedLab ? pairedLab.credits : 0);

        if (
          lane1Credits + neededCredits <= max8wkCredits &&
          totalSemCredits() + neededCredits <= max16wkCredits
        ) {
          lane1.push(cand);
          lane1Credits += cand.credits;
          slot1ScheduledSet.add(cand.compactCode);
          unscheduled.delete(cand.compactCode);

          if (pairedLab) {
            lane1.push(pairedLab);
            lane1Credits += pairedLab.credits;
            slot1ScheduledSet.add(pairedLab.compactCode);
            unscheduled.delete(pairedLab.compactCode);
          }

          madeProgress1 = true;
          break; // Re-evaluate candidates so same-slot coreqs (e.g. ICS 21400 or IIT 47900) unlock immediately!
        }
      }
    }

    // CRITICAL FEATURE: Same-Semester Session I -> Session II Prerequisite Chaining!
    // Courses completed in Session I (FA-I or SP-I) are immediately added to completedCompactSet
    // so Session II (FA-II or SP-II) of the EXACT SAME SEMESTER can take their downstream dependents!
    for (const cCode of slot1ScheduledSet) {
      completedCompactSet.add(cCode);
    }

    // -------------------------------------------------------------------------
    // STEP B: Fill Session II (8wk) (FA-II or SP-II)
    // -------------------------------------------------------------------------
    const slot2ScheduledSet = new Set();
    let madeProgress2 = true;
    while (madeProgress2 && lane2Credits < max8wkCredits && totalSemCredits() < max16wkCredits) {
      madeProgress2 = false;
      const candidates = getSortedCandidatesForSlot(
        slot2Key,
        completedCompactSet,
        slot2ScheduledSet
      );

      for (const cand of candidates) {
        if (!unscheduled.has(cand.compactCode)) continue;

        const pairedLabCompact = ciscoLectureToLab[cand.compactCode];
        const pairedLab = pairedLabCompact ? unscheduled.get(pairedLabCompact) : null;
        const neededCredits = cand.credits + (pairedLab ? pairedLab.credits : 0);

        if (
          lane2Credits + neededCredits <= max8wkCredits &&
          totalSemCredits() + neededCredits <= max16wkCredits
        ) {
          lane2.push(cand);
          lane2Credits += cand.credits;
          slot2ScheduledSet.add(cand.compactCode);
          unscheduled.delete(cand.compactCode);

          if (pairedLab) {
            lane2.push(pairedLab);
            lane2Credits += pairedLab.credits;
            slot2ScheduledSet.add(pairedLab.compactCode);
            unscheduled.delete(pairedLab.compactCode);
          }

          madeProgress2 = true;
          break;
        }
      }
    }

    // -------------------------------------------------------------------------
    // STEP C: Check 16-week fallback courses (if any course is 16wk-only)
    // -------------------------------------------------------------------------
    const slot16ScheduledSet = new Set();
    const candidates16 = getSortedCandidatesForSlot(
      slot16Key,
      completedCompactSet,
      slot16ScheduledSet
    ).filter((c) => !c.availability.FA_I_8wk && !c.availability.FA_II_8wk && !c.availability.SP_I_8wk && !c.availability.SP_II_8wk);

    for (const cand of candidates16) {
      if (!unscheduled.has(cand.compactCode)) continue;
      if (totalSemCredits() + cand.credits <= max16wkCredits) {
        lane16.push(cand);
        lane16Credits += cand.credits;
        slot16ScheduledSet.add(cand.compactCode);
        unscheduled.delete(cand.compactCode);
      }
    }

    for (const cCode of slot2ScheduledSet) {
      completedCompactSet.add(cCode);
    }
    for (const cCode of slot16ScheduledSet) {
      completedCompactSet.add(cCode);
    }

    const semTotal = totalSemCredits();
    creditsBeforePrevSemester = creditsAtStartOfSemester;
    prevSession1Credits = lane1Credits;
    runningCompletedCredits += semTotal;

    if (semTotal > 0) {
      scheduledSemesters.push({
        id: `${currSeason}-${currYear}`,
        season: currSeason,
        year: currYear,
        title: `${currSeason} ${currYear}`,
        isCollapsed: false,
        isForcedSummer: false,
        totalCredits: semTotal,
        lanes: {
          [slot1Key]: lane1,
          [slot2Key]: lane2,
          [slot16Key]: lane16
        },
        registrationNotice,
        notes: []
      });
    }

    const nxt = getNextSemester(currSeason, currYear);
    currSeason = nxt.season;
    currYear = nxt.year;
  }

  // Filter out trailing empty collapsed summers at the very end of the plan
  while (
    scheduledSemesters.length > 0 &&
    scheduledSemesters[scheduledSemesters.length - 1].totalCredits === 0
  ) {
    scheduledSemesters.pop();
  }

  // =========================================================================
  // POST-PASS: Tactile Weight Classification & Auto-Generated Semester Notes
  // =========================================================================
  const activeSemesters = scheduledSemesters.filter((s) => s.totalCredits > 0);
  const lastActiveSem = activeSemesters[activeSemesters.length - 1] || null;
  const secondToLastActiveSem =
    activeSemesters.length >= 2 ? activeSemesters[activeSemesters.length - 2] : null;

  let projectedGraduationTerm = 'May 2027';
  let lastActiveSlot = '';

  if (lastActiveSem) {
    const laneKeys = Object.keys(lastActiveSem.lanes);
    for (const k of laneKeys) {
      if ((lastActiveSem.lanes[k] || []).length > 0) {
        lastActiveSlot = k;
      }
    }
    const gradInfo = getGraduationApplicationDeadline(
      lastActiveSem.season,
      lastActiveSem.year,
      lastActiveSlot
    );
    projectedGraduationTerm = `${gradInfo.conferralMonth} ${lastActiveSem.year}`;

    // Add Application for Degree Form note to 2nd-to-last and last active semesters
    if (secondToLastActiveSem) {
      secondToLastActiveSem.notes.push({
        id: `auto-deg-app-prep-${secondToLastActiveSem.id}`,
        type: 'auto',
        category: 'Degree Application',
        text: `Upcoming Graduation Reminder — ${gradInfo.noteText}`
      });
    }
    lastActiveSem.notes.push({
      id: `auto-deg-app-final-${lastActiveSem.id}`,
      type: 'auto',
      category: 'Degree Application',
      text: gradInfo.noteText
    });
  }

  // Classify every scheduled card with Tactile Weight Flexibility Colors & add Overload/Summer notes
  for (const sem of scheduledSemesters) {
    const isFinalSem = lastActiveSem && sem.id === lastActiveSem.id;

    // Auto-note: Summer per-credit tuition notice
    if (sem.season === 'Summer' && sem.totalCredits > 0) {
      sem.notes.push({
        id: `auto-summer-tuition-${sem.id}`,
        type: 'auto',
        category: 'Summer Tuition',
        text: 'Summer Tuition Notice: Summer courses are billed per credit hour separately from standard fall/spring flat-rate tuition and may incur additional charges.'
      });
    }

    // Auto-note: Course Overload (>18 credits)
    if (sem.totalCredits > 18) {
      sem.notes.push({
        id: `auto-overload-${sem.id}`,
        type: 'auto',
        category: 'Overload Petition',
        text: 'Course Overload Notice: Enrolling in more than 18 credits requires a signed Petition for Academic Course Overload and incurs an additional per-credit hour charge above 18 credits.'
      });
    }

    for (const [laneKey, courseList] of Object.entries(sem.lanes)) {
      sem.lanes[laneKey] = courseList.map((course) => {
        const m = metrics.get(course.compactCode) || {};
        const tactile = classifyTactileWeight(course, m, isFinalSem);
        return {
          ...course,
          assignedSemesterId: sem.id,
          assignedSlot: laneKey,
          tactileWeight: tactile,
          locked: Boolean(course.locked)
        };
      });
    }
  }

  // Integrate currently enrolled (in-progress and scheduled) courses from parsedTranscript
  const currentCourses = parsedTranscript?.currentCourses || [];
  const scheduledCourses = parsedTranscript?.scheduledCourses || [];
  const enrolledCourses = [...currentCourses, ...scheduledCourses];

  if (enrolledCourses.length > 0) {
    const enrolledByTerm = new Map();
    for (const c of enrolledCourses) {
      const tInfo = parseTermInfo(c.term);
      const season = tInfo.season || startInfo.season;
      const year = tInfo.year || startInfo.year;
      const termKey = `${season}-${year}`;
      if (!enrolledByTerm.has(termKey)) {
        enrolledByTerm.set(termKey, {
          season,
          year,
          courses: []
        });
      }
      enrolledByTerm.get(termKey).courses.push({
        course: c,
        session: tInfo.session
      });
    }

    for (const [termKey, group] of enrolledByTerm.entries()) {
      const { season, year, courses } = group;
      let targetSem = scheduledSemesters.find((s) => s.id === termKey);
      if (!targetSem) {
        const isSummer = season === 'Summer';
        targetSem = {
          id: termKey,
          season,
          year,
          title: `${season} ${year}`,
          isCollapsed: false,
          isEnrolledSemester: true,
          hasEnrolledCourses: true,
          totalCredits: 0,
          lanes: {
            [isSummer ? 'SU' : season === 'Fall' ? 'Fall-16wk' : 'Spring-16wk']: [],
            [isSummer ? 'SU' : season === 'Fall' ? 'FA-I' : 'SP-I']: [],
            [isSummer ? 'SU' : season === 'Fall' ? 'FA-II' : 'SP-II']: []
          },
          registrationNotice: calculateRegistrationOpeningNotice(season, year, runningCompletedCredits, 0),
          notes: [{
            id: `enrolled-note-${termKey}`,
            type: 'system',
            category: 'Enrolled',
            text: 'Currently enrolled academic term. Courses are locked to reflect active registration.'
          }]
        };

        let insertIdx = 0;
        const targetYearVal = year * 10 + (season === 'Fall' ? 3 : season === 'Summer' ? 2 : 1);
        while (insertIdx < scheduledSemesters.length) {
          const s = scheduledSemesters[insertIdx];
          const sYearVal = s.year * 10 + (s.season === 'Fall' ? 3 : s.season === 'Summer' ? 2 : 1);
          if (targetYearVal < sYearVal) break;
          insertIdx++;
        }
        scheduledSemesters.splice(insertIdx, 0, targetSem);
      } else {
        targetSem.hasEnrolledCourses = true;
      }

      for (const { course, session } of courses) {
        let laneKey = session;
        if (!targetSem.lanes[laneKey]) {
          laneKey = season === 'Summer' ? 'SU' : season === 'Fall' ? 'FA-I' : 'SP-I';
        }
        if (!targetSem.lanes[laneKey]) {
          targetSem.lanes[laneKey] = [];
        }

        const m = metrics.get(course.compactCode) || {};
        const tactile = classifyTactileWeight(course, m, false);

        const enrolledCourseObj = {
          ...course,
          isCurrentEnrolled: true,
          isEnrolled: true,
          enrolledStatus: course.state === 'Scheduled' ? 'Scheduled' : 'In Progress',
          locked: true,
          assignedSemesterId: targetSem.id,
          assignedSlot: laneKey,
          tactileWeight: tactile
        };

        targetSem.lanes[laneKey].push(enrolledCourseObj);
        targetSem.totalCredits += course.credits;
      }
    }
  }

  return {
    studentMetadata: parsedTranscript?.studentMetadata || auditResult?.studentMetadata || null,
    semesters: scheduledSemesters,
    activeSemesterCount: activeSemesters.length,
    projectedGraduationTerm,
    lastActiveSemesterId: lastActiveSem?.id || null,
    forcedSummerAlerts,
    missingAvailabilityCourses
  };
}

/**
 * Convert a conferral term string (e.g. "May 2028", "October 2028", "December 2028")
 * into a chronological numeric sort key (YYYYMM).
 */
export function getConferralSortKey(termStr) {
  const monthMap = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12
  };
  const m = String(termStr || '').match(/([A-Za-z]+)\s+(20\d{2})/);
  if (!m) return 999999;
  const monthNum = monthMap[m[1]] || 12;
  const yearNum = parseInt(m[2], 10);
  return yearNum * 100 + monthNum;
}

/**
 * Full Critical-Path Scheduler with Background "What-If" Graduation Accelerator.
 * Surfaces up to 2 concise acceleration suggestions when enabling Summer or +3cr load
 * yields an earlier conferral date.
 */
export function generateOptimalSchedule(auditResult, parsedTranscript, constraints = {}) {
  const basePlan = generateBaseSchedule(auditResult, parsedTranscript, constraints);
  const whatIfSuggestions = [];

  const baseSortKey = getConferralSortKey(basePlan.projectedGraduationTerm);

  // Simulation 1: Enable Summer Sessions (6 credits max) if currently 'No Summer'
  if (constraints.summerAvailability !== 'Yes Summer' && !constraints.allowSummer) {
    const summerSim = generateBaseSchedule(auditResult, parsedTranscript, {
      ...constraints,
      summerAvailability: 'Yes Summer',
      allowSummer: true,
      maxSummerCredits: 6
    });

    if (getConferralSortKey(summerSim.projectedGraduationTerm) < baseSortKey) {
      whatIfSuggestions.push({
        id: 'whatif-enable-summer',
        title: 'Enable Summer Sessions (Up to 6 Credits)',
        projectedGraduationTerm: summerSim.projectedGraduationTerm,
        description: `Taking up to 6 credits in Summer accelerates graduation from ${basePlan.projectedGraduationTerm} to ${summerSim.projectedGraduationTerm}.`
      });
    }
  }

  // Simulation 2: Increase 8-Week Session Load by +3 Credits (e.g., 6cr -> 9cr or 9cr -> 12cr)
  const curr8wk =
    constraints.max8wkCredits !== undefined
      ? Number(constraints.max8wkCredits)
      : constraints.pacingMode === 'Part-Time'
      ? 6
      : 9;
  const curr16wk =
    constraints.max16wkCredits !== undefined
      ? Number(constraints.max16wkCredits)
      : constraints.pacingMode === 'Part-Time'
      ? 11
      : 18;

  if (curr8wk < 12) {
    const next8wk = curr8wk + 3;
    const next16wk = Math.min(24, curr16wk + 6);
    const loadSim = generateBaseSchedule(auditResult, parsedTranscript, {
      ...constraints,
      max8wkCredits: next8wk,
      max16wkCredits: next16wk
    });

    if (getConferralSortKey(loadSim.projectedGraduationTerm) < baseSortKey) {
      whatIfSuggestions.push({
        id: 'whatif-increase-pacing',
        title: `Increase Session Load to ${next8wk} Credits / 8-Week Session`,
        projectedGraduationTerm: loadSim.projectedGraduationTerm,
        description: `Increasing pacing by +3 credits per 8-week session accelerates graduation from ${basePlan.projectedGraduationTerm} to ${loadSim.projectedGraduationTerm}.`
      });
    }
  }

  return {
    ...basePlan,
    whatIfSuggestions: whatIfSuggestions.slice(0, 2)
  };
}

/**
 * Deterministic Drag-and-Drop Conflict Validator (for Screen 3 Interactive Board).
 * Checks if moving `course` into `(targetSemester, targetSlot)` violates:
 * 1. Session availability (including Odd/Even year rules)
 * 2. Prerequisites (must be completed in a strictly prior slot, where Session I < Session II)
 * 3. Corequisites (must be completed prior or in the exact same slot)
 */
export function validateScheduleMove(
  course,
  targetSemester,
  targetSlot,
  allSemesters,
  initiallyCompletedCompacts = new Set(),
  flags = {}
) {
  const conflicts = [];

  // 1. Check Session Offering Availability
  if (!isCourseOfferedInSlot(course, targetSlot, targetSemester.year)) {
    const offeredStr = (course.offered_sessions || []).join(', ') || 'None';
    conflicts.push({
      type: 'SESSION_UNAVAILABLE',
      message: `${course.code} is not offered in ${targetSlot} (${targetSemester.title}). Official offerings: ${offeredStr}.`,
      allowTentativeOverride: true,
      allowPolicyException: true
    });
  }

  // 2. Collect all courses completed strictly before (targetSemester, targetSlot)
  const completedBeforeTarget = new Set(initiallyCompletedCompacts);
  const sameSlotSet = new Set();
  let cumulativeCreditsBeforeSem = 0;

  for (const sem of allSemesters) {
    if (sem.id === targetSemester.id) {
      // If targetSlot is Session II (FA-II or SP-II), courses in Session I (FA-I or SP-I) count as completed prior!
      if (targetSlot === 'FA-II' && sem.lanes['FA-I']) {
        for (const c of sem.lanes['FA-I']) completedBeforeTarget.add(c.compactCode);
      }
      if (targetSlot === 'SP-II' && sem.lanes['SP-I']) {
        for (const c of sem.lanes['SP-I']) completedBeforeTarget.add(c.compactCode);
      }
      for (const c of sem.lanes[targetSlot] || []) {
        if (c.compactCode !== course.compactCode) {
          sameSlotSet.add(c.compactCode);
        }
      }
      break;
    } else {
      for (const laneList of Object.values(sem.lanes)) {
        for (const c of laneList) {
          if (c.compactCode !== course.compactCode) {
            completedBeforeTarget.add(c.compactCode);
            cumulativeCreditsBeforeSem += c.credits || 3;
          }
        }
      }
    }
  }

  // 3. Evaluate Prerequisite AST
  const prereqRes = evaluatePrereqTree(course.prereq_logic, completedBeforeTarget, sameSlotSet, {
    mathPlacementSatisfied: flags.mathPlacementSatisfied,
    cumulativeCreditsBeforeSemester: cumulativeCreditsBeforeSem
  });

  if (!prereqRes.satisfied) {
    conflicts.push({
      type: 'PREREQUISITE_UNMET',
      message: `Prerequisite(s) not completed prior to ${targetSlot} (${targetSemester.title}): ${prereqRes.missing.join(', ')}.`,
      missingPrereqs: prereqRes.missing,
      allowTentativeOverride: true,
      allowPolicyException: true
    });
  }

  // 4. Evaluate Corequisites
  for (const coreqCode of course.coreq_codes || []) {
    const norm = normalizeCourseCode(coreqCode);
    if (norm && !completedBeforeTarget.has(norm.compact) && !sameSlotSet.has(norm.compact)) {
      conflicts.push({
        type: 'COREQUISITE_UNMET',
        message: `Corequisite ${coreqCode} must be taken concurrently in ${targetSlot} or completed prior.`,
        allowTentativeOverride: true,
        allowPolicyException: true
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts
  };
}
