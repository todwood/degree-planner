/**
 * Degree Planner Deterministic Core — Screen 1 Intake Pure Logic & Validators
 * (src/utils/intakeHelpers.js)
 *
 * Implements:
 * A. Whole-Number Credit Telemetry & Active-Term Audit
 * B. Advisor Email & Identity Normalization
 * C. Registration Start Term Auto-Calculation & 1-Week Cutoff Window
 * D. Scheduling Constraints & Pacing Options Validator
 * E. Smart PDF Plan State Serializer (LINDENWOOD_PLAN_PAYLOAD_V1)
 *
 * Strict Invariants:
 * - 100% pure deterministic functions (zero runtime LLM calls, zero side effects).
 * - Accepts optional referenceDate (defaulting to '2026-10-29') for deterministic testing.
 */

import { parseTermInfo } from '../engine/transcriptParser.js';

export const DEFAULT_REFERENCE_DATE = '2026-10-29';
export const DEFAULT_ACTIVE_TERM_ID = 'Fall 2026';

export const REGISTRATION_TERM_WINDOWS = [
  {
    id: 'Fall 2026 16wk',
    label: 'Fall 2026 16wk',
    semester: 'Fall 2026',
    startDate: '2026-08-24',
    cutoffDate: '2026-08-28',
    cutoffRule: '1 week after start of classes'
  },
  {
    id: 'Fall 2026 II 8wk',
    label: 'Fall 2026 II 8wk',
    semester: 'Fall 2026',
    startDate: '2026-10-19',
    cutoffDate: '2026-10-23',
    cutoffRule: '1 week after start of classes'
  },
  {
    id: 'Spring 2027 16wk',
    label: 'Spring 2027 16wk',
    semester: 'Spring 2027',
    startDate: '2027-01-11',
    cutoffDate: '2027-01-15',
    cutoffRule: '1 week after start of classes'
  },
  {
    id: 'Spring 2027 II 8wk',
    label: 'Spring 2027 II 8wk',
    semester: 'Spring 2027',
    startDate: '2027-03-15',
    cutoffDate: '2027-03-19',
    cutoffRule: '1 week after start of classes'
  },
  {
    id: 'Summer 2027',
    label: 'Summer 2027',
    semester: 'Summer 2027',
    startDate: '2027-05-17',
    cutoffDate: '2027-05-21',
    cutoffRule: '1 week after start of classes'
  },
  {
    id: 'Fall 2027 16wk',
    label: 'Fall 2027 16wk',
    semester: 'Fall 2027',
    startDate: '2027-08-23',
    cutoffDate: '2027-08-27',
    cutoffRule: '1 week after start of classes'
  },
  {
    id: 'Fall 2027 II 8wk',
    label: 'Fall 2027 II 8wk',
    semester: 'Fall 2027',
    startDate: '2027-10-18',
    cutoffDate: '2027-10-22',
    cutoffRule: '1 week after start of classes'
  }
];

export const SUMMER_TUITION_NOTICE_TEXT =
  'Flat-rate full-time tuition covers Fall and Spring semesters only. Summer coursework is billed at the standard per-credit-hour rate.';

export const OVERLOAD_NOTICE_TEXT =
  'Students with a cumulative GPA of 3.5 or above are eligible to take up to 24 credits. If cumulative GPA is below 3.5, a Petition for Academic Course Overload must be submitted and approved. Additional per-credit-hour tuition charges apply for all undergraduate credits taken over 18 in a semester.';

export const PLAN_PAYLOAD_PREFIX = 'LINDENWOOD_PLAN_PAYLOAD_V1:';
export const PLAN_PAYLOAD_SUFFIX = ':END_LINDENWOOD_PLAN_PAYLOAD_V1';

/**
 * Normalize input courses list whether passed as an array or a parsedTranscript object.
 */
function extractCourseArray(coursesInput) {
  if (!coursesInput) return [];
  if (Array.isArray(coursesInput)) return coursesInput;
  if (Array.isArray(coursesInput.validCourses)) return coursesInput.validCourses;
  if (Array.isArray(coursesInput.courses)) return coursesInput.courses;
  return [];
}

/**
 * Determine whether a course row should be excluded from active/completed telemetry.
 */
function isExcludedCourse(course) {
  if (!course || typeof course !== 'object') return true;
  const state = String(course.state || '').trim().toUpperCase();
  const status = String(course.status || '').trim().toUpperCase();
  const grade = String(course.grade || '').trim().toUpperCase();

  if (state === 'EXCLUDED' || state === 'DROPPED' || state === 'WITHDRAWN') return true;
  if (status === 'DROPPED' || status === 'WITHDRAWN' || status === 'CANCELLED') return true;
  if (grade === 'W' || grade === 'WX' || grade === 'WD') return true;
  return false;
}

/**
 * Classify a non-excluded course into 'TRANSFER' | 'CURRENT' | 'INSTITUTIONAL'.
 */
function classifyTelemetryBucket(course, activeTermId = DEFAULT_ACTIVE_TERM_ID) {
  const state = String(course.state || '').trim().toUpperCase();
  const status = String(course.status || '').trim().toUpperCase();
  const rawTerm = String(course.term || course.semester || course.termId || '').trim();

  if (
    course.isTransfer === true ||
    state === 'TR' ||
    state === 'TRANSFER' ||
    status === 'TRANSFER' ||
    /^(TR|TRANSFER|EXT)\b/i.test(rawTerm)
  ) {
    return 'TRANSFER';
  }

  if (
    state === 'CURRENT' ||
    state === 'SCHEDULED' ||
    state === 'IN PROGRESS' ||
    state === 'IN_PROGRESS' ||
    state === 'ENROLLED' ||
    status === 'CURRENT' ||
    status === 'SCHEDULED' ||
    status === 'IN PROGRESS' ||
    status === 'ENROLLED' ||
    course.isCurrent === true ||
    course.isScheduled === true
  ) {
    return 'CURRENT';
  }

  if (
    state === 'COMPLETED' ||
    state === 'COMPLETE' ||
    status === 'COMPLETED' ||
    status === 'COMPLETE'
  ) {
    return 'INSTITUTIONAL';
  }

  // Fallback inference when state is omitted
  const grade = String(course.grade || '').trim().toUpperCase();
  if (!grade || grade === 'IP' || grade === 'NG') {
    if (doesCourseMatchSemester(course, activeTermId)) {
      return 'CURRENT';
    }
  }

  return 'INSTITUTIONAL';
}

/**
 * Determine whether a course belongs to a target semester (e.g., 'Fall 2026'),
 * matching 16-Week, Session I, or Session II within that semester.
 */
export function doesCourseMatchSemester(course, activeTermId = DEFAULT_ACTIVE_TERM_ID) {
  if (!course || isExcludedCourse(course)) return false;
  if (
    course.isTransfer === true ||
    /^(TR|TRANSFER)$/i.test(String(course.state || '').trim())
  ) {
    return false;
  }

  const targetInfo = parseTermInfo(activeTermId || DEFAULT_ACTIVE_TERM_ID);
  const rawTerm = String(
    course.term || course.semester || course.termId || course.displayTerm || ''
  ).trim();

  if (!rawTerm) {
    // If no term string is specified, check if course is explicitly flagged as active-term or current
    return Boolean(course.isActiveTerm);
  }

  // Check if rawTerm is just a session label like '16-Week', 'Session I', 'Session II'
  if (/^(16-?WEEK|16-?WK|SESSION\s*(I|II|1|2)|8-?WK\s*(I|II|1|2))$/i.test(rawTerm)) {
    return true;
  }

  const courseTermInfo = parseTermInfo(rawTerm);
  if (courseTermInfo.isTransfer || courseTermInfo.isBlank) return false;

  // Check if rawTerm omitted an explicit year (e.g. "Fall Session I")
  const hasExplicitYear = /\b20\d{2}\b|(?:_|SEM_|^|[A-Z])(1\d|2\d|3\d)(?:_|$|[A-Z])/i.test(rawTerm);
  const effectiveYear = hasExplicitYear ? courseTermInfo.year : targetInfo.year;

  return courseTermInfo.season === targetInfo.season && effectiveYear === targetInfo.year;
}

/* ==========================================================================
   A. Whole-Number Credit Telemetry & Active-Term Audit
   ========================================================================== */

/**
 * Compute structured whole-number credit telemetry totals and formatted banner string.
 */
export function computeParsedTelemetryTotals(courses, activeTermId = DEFAULT_ACTIVE_TERM_ID) {
  const list = extractCourseArray(courses);
  const valid = list.filter((c) => !isExcludedCourse(c));

  let rawTransfer = 0;
  let rawInstitutional = 0;
  let rawCurrent = 0;

  for (const course of valid) {
    const credits = Number(course.credits) || 0;
    const bucket = classifyTelemetryBucket(course, activeTermId);
    if (bucket === 'TRANSFER') {
      rawTransfer += credits;
    } else if (bucket === 'CURRENT') {
      rawCurrent += credits;
    } else {
      rawInstitutional += credits;
    }
  }

  const totalCourses = valid.length;
  const transferCredits = Math.round(rawTransfer);
  const institutionalCredits = Math.round(rawInstitutional);
  const currentCredits = Math.round(rawCurrent);
  const totalCredits = transferCredits + institutionalCredits + currentCredits;

  const bannerText = `Parsed ${totalCourses} Courses (${transferCredits} Transfer + ${institutionalCredits} Institutional + ${currentCredits} Current = ${totalCredits} Total Credits)`;

  return {
    totalCourses,
    transferCredits,
    institutionalCredits,
    currentCredits,
    totalCredits,
    bannerText
  };
}

/**
 * Format the whole-number telemetry summary banner string:
 * "Parsed {totalCourses} Courses ({transferCredits} Transfer + {institutionalCredits} Institutional + {currentCredits} Current = {totalCredits} Total Credits)"
 */
export function formatParsedTelemetrySummary(courses, activeTermId = DEFAULT_ACTIVE_TERM_ID) {
  const { bannerText } = computeParsedTelemetryTotals(courses, activeTermId);
  return bannerText;
}

/**
 * Normalize enrollment status string into 'FULL_TIME' or 'PART_TIME'.
 */
export function normalizeEnrollmentStatus(enrollmentStatus = 'FULL_TIME') {
  const norm = String(enrollmentStatus || 'FULL_TIME')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (norm === 'PART_TIME' || norm === 'PT' || norm === '3/4_TIME') {
    return 'PART_TIME';
  }
  return 'FULL_TIME';
}

/**
 * Evaluate active-term enrollment load (including in-progress/scheduled courses in
 * 16-Week, Session I, or Session II AND completed courses from that same active semester,
 * such as completed Fall Session I courses).
 */
export function evaluateActiveTermEnrollment(
  courses,
  activeTermId = DEFAULT_ACTIVE_TERM_ID,
  enrollmentStatus = 'FULL_TIME'
) {
  const list = extractCourseArray(courses);
  const normalizedStatus = normalizeEnrollmentStatus(enrollmentStatus);

  const activeCourses = list.filter((course) => {
    if (!doesCourseMatchSemester(course, activeTermId)) return false;
    const bucket = classifyTelemetryBucket(course, activeTermId);
    return bucket === 'CURRENT' || bucket === 'INSTITUTIONAL';
  });

  let rawCurrentCredits = 0;
  let rawCompletedCredits = 0;

  for (const course of activeCourses) {
    const credits = Number(course.credits) || 0;
    const bucket = classifyTelemetryBucket(course, activeTermId);
    if (bucket === 'CURRENT') {
      rawCurrentCredits += credits;
    } else if (bucket === 'INSTITUTIONAL') {
      rawCompletedCredits += credits;
    }
  }

  const activeCurrentCredits = Math.round(rawCurrentCredits);
  const activeCompletedCredits = Math.round(rawCompletedCredits);
  const activeTermTotalCredits = Math.round(rawCurrentCredits + rawCompletedCredits);
  const showLowCreditWarning =
    normalizedStatus === 'FULL_TIME' && activeTermTotalCredits < 12;

  return {
    activeTermId: activeTermId || DEFAULT_ACTIVE_TERM_ID,
    activeCourses,
    activeCurrentCredits,
    activeCompletedCredits,
    activeTermTotalCredits,
    enrollmentStatus: normalizedStatus,
    showLowCreditWarning,
    lowCreditWarningMessage: showLowCreditWarning
      ? `Active ${activeTermId || DEFAULT_ACTIVE_TERM_ID} enrollment is ${activeTermTotalCredits} credits, which is below the 12-credit Full-Time threshold.`
      : null,
    canEditActiveTerm: true
  };
}

/* ==========================================================================
   B. Advisor Email & Identity Normalization
   ========================================================================== */

/**
 * Strip @lindenwood.edu (case-insensitive) from parsed transcript advisor emails
 * to populate the username input cleanly.
 */
export function parseAdvisorEmailUsername(rawEmail) {
  if (rawEmail === null || rawEmail === undefined) return '';
  const trimmed = String(rawEmail).trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s*@lindenwood\.edu\s*$/i, '').trim();
}

/**
 * Format an advisor username into a full @lindenwood.edu email address.
 */
export function formatFullAdvisorEmail(username) {
  const cleanUser = parseAdvisorEmailUsername(username);
  if (!cleanUser) return '';
  return `${cleanUser}@lindenwood.edu`;
}

/* ==========================================================================
   C. Registration Start Term Auto-Calculation & 1-Week Cutoff Window
   ========================================================================== */

/**
 * Normalize a date input (Date or string) into YYYY-MM-DD format.
 */
function normalizeIsoDateString(dateInput = DEFAULT_REFERENCE_DATE) {
  if (!dateInput) return DEFAULT_REFERENCE_DATE;
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    return dateInput.toISOString().slice(0, 10);
  }
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return DEFAULT_REFERENCE_DATE;
}

/**
 * Compute credit-tiered priority registration window metadata from earned credits.
 * - >= 90: Senior Priority Week 1
 * - 60-89: Junior Week 2
 * - 30-59: Sophomore Week 3
 * - 0-29:  Freshman Week 4
 */
export function computePriorityRegistrationWindow(earnedCredits = 0, targetTerm = null) {
  const credits = Math.max(0, Math.round(Number(earnedCredits) || 0));

  let standing = 'Freshman';
  let priorityWeek = 4;
  let windowLabel = 'Freshman Week 4';
  let creditBand = '0-29';

  if (credits >= 90) {
    standing = 'Senior';
    priorityWeek = 1;
    windowLabel = 'Senior Priority Week 1';
    creditBand = '>=90';
  } else if (credits >= 60) {
    standing = 'Junior';
    priorityWeek = 2;
    windowLabel = 'Junior Week 2';
    creditBand = '60-89';
  } else if (credits >= 30) {
    standing = 'Sophomore';
    priorityWeek = 3;
    windowLabel = 'Sophomore Week 3';
    creditBand = '30-59';
  }

  const termMeta =
    REGISTRATION_TERM_WINDOWS.find((t) => t.id === targetTerm) ||
    REGISTRATION_TERM_WINDOWS.find((t) => t.id === 'Spring 2027 16wk') ||
    REGISTRATION_TERM_WINDOWS[0];

  return {
    earnedCredits: credits,
    standing,
    priorityWeek,
    windowLabel,
    creditBand,
    startDate: termMeta.startDate,
    cutoffDate: termMeta.cutoffDate,
    cutoffRule: '1 week after start of classes',
    cutoffDisplay: `${termMeta.cutoffDate} (1 week after start of classes)`
  };
}

/**
 * Resolve registration start term, fallback manual selection prompt state,
 * eligible terms based on the 1-week registration cutoff window, and priority window metadata.
 */
export function resolveRegistrationStartTerm(options = {}) {
  const opts = Array.isArray(options) ? { courses: options } : options || {};
  const courses = extractCourseArray(opts.courses);
  const referenceDate = normalizeIsoDateString(opts.referenceDate || DEFAULT_REFERENCE_DATE);

  const eligibleTermWindows = REGISTRATION_TERM_WINDOWS.filter(
    (term) => term.cutoffDate >= referenceDate
  );
  const eligibleTerms = eligibleTermWindows.map((term) => term.id);

  // Check whether student has active courses in Fall 2026
  const fall2026Audit = evaluateActiveTermEnrollment(courses, 'Fall 2026');
  const hasActiveFall2026Courses = fall2026Audit.activeCourses.length > 0;

  let startTerm = eligibleTerms[0] || 'Spring 2027 16wk';
  let requiresManualSelection = true;

  if (hasActiveFall2026Courses) {
    startTerm = 'Spring 2027 16wk';
    requiresManualSelection = false;
  }

  // Determine earned credits (transfer + institutional completed) if not explicitly provided
  let earnedCredits = opts.earnedCredits;
  if (earnedCredits === undefined || earnedCredits === null) {
    const telemetry = computeParsedTelemetryTotals(courses, 'Fall 2026');
    earnedCredits = telemetry.transferCredits + telemetry.institutionalCredits;
  }

  const priorityWindow = computePriorityRegistrationWindow(earnedCredits, startTerm);
  const activeTermMeta =
    REGISTRATION_TERM_WINDOWS.find((t) => t.id === startTerm) ||
    eligibleTermWindows[0] ||
    REGISTRATION_TERM_WINDOWS[2];

  return {
    startTerm,
    requiresManualSelection,
    hasActiveFall2026Courses,
    referenceDate,
    eligibleTerms,
    eligibleTermWindows,
    startDate: activeTermMeta.startDate,
    cutoffDate: activeTermMeta.cutoffDate,
    cutoffRule: '1 week after start of classes',
    priorityWindow
  };
}

/* ==========================================================================
   D. Scheduling Constraints & Pacing Options Validator
   ========================================================================== */

const FULL_TIME_MIN_16WK_BASE = [
  { value: 12, label: '12 Credits (Default)' },
  { value: 15, label: '15 Credits' },
  { value: 18, label: '18 Credits' }
];

const FULL_TIME_CAP_16WK_BASE = [
  { value: 12, label: '12 Credits' },
  { value: 15, label: '15 Credits (Default)' },
  { value: 16, label: '16 Credits' },
  { value: 17, label: '17 Credits' },
  { value: 18, label: '18 Credits (Plateau Cap)' },
  { value: 21, label: '21 Credits (Not Recommended)' },
  { value: 24, label: '24 Credits (Not Recommended)' }
];

const PART_TIME_MIN_16WK_BASE = [
  { value: 3, label: '3 Credits' },
  { value: 6, label: '6 Credits (Default)' },
  { value: 9, label: '9 Credits' }
];

const PART_TIME_CAP_16WK_BASE = [
  { value: 3, label: '3 Credits' },
  { value: 6, label: '6 Credits' },
  { value: 9, label: '9 Credits' },
  { value: 11, label: '11 Credits (Part-Time Cap)' }
];

const CAP_8WK_OPTIONS_BASE = [
  { value: 0, label: '0 Credits (No 8-Week)' },
  { value: 3, label: '3 Credits' },
  { value: 6, label: '6 Credits' },
  { value: 9, label: '9 Credits (Default)' },
  { value: 12, label: '12 Credits (Not Recommended)' }
];

const SUMMER_CAP_OPTIONS_BASE = [
  { value: 3, label: '3 Credits' },
  { value: 6, label: '6 Credits (Default)' },
  { value: 9, label: '9 Credits' },
  { value: 12, label: '12 Credits (Not Recommended)' }
];

export const MODALITY_PREFERENCE_OPTIONS = [
  'No Preference (Default)',
  'Online-Only',
  'Prefer OnGround',
  'Prefer Online'
];

export const SUMMER_AVAILABILITY_OPTIONS = [
  'No Summer (Default)',
  'Yes Summer'
];

/**
 * Validate and return scheduling constraint & pacing options based on enrollment status,
 * minimum 16-week credit floor, 16-week credit cap, and summer availability.
 */
export function getPacingConstraintOptions(
  enrollmentStatus = 'FULL_TIME',
  selectedMin16Wk,
  selectedCap16Wk,
  summerAvailability = 'No Summer (Default)'
) {
  // Support single object parameter as well as positional parameters
  if (
    enrollmentStatus &&
    typeof enrollmentStatus === 'object' &&
    !Array.isArray(enrollmentStatus)
  ) {
    const cfg = enrollmentStatus;
    return getPacingConstraintOptions(
      cfg.enrollmentStatus,
      cfg.selectedMin16Wk,
      cfg.selectedCap16Wk,
      cfg.summerAvailability
    );
  }

  const normalizedStatus = normalizeEnrollmentStatus(enrollmentStatus);
  const isFullTime = normalizedStatus === 'FULL_TIME';

  const baseMinOptions = isFullTime ? FULL_TIME_MIN_16WK_BASE : PART_TIME_MIN_16WK_BASE;
  const baseCapOptions = isFullTime ? FULL_TIME_CAP_16WK_BASE : PART_TIME_CAP_16WK_BASE;

  const defaultMin = isFullTime ? 12 : 6;
  const defaultCap = isFullTime ? 15 : 11;

  const effectiveMin =
    selectedMin16Wk !== undefined && selectedMin16Wk !== null
      ? Number(selectedMin16Wk)
      : defaultMin;

  const filteredCapOptions = baseCapOptions.filter((opt) => opt.value >= effectiveMin);

  const rawSelectedCap =
    selectedCap16Wk !== undefined && selectedCap16Wk !== null
      ? Number(selectedCap16Wk)
      : Math.max(defaultCap, effectiveMin);

  const effectiveCap =
    rawSelectedCap < effectiveMin
      ? filteredCapOptions[0]?.value ?? effectiveMin
      : rawSelectedCap;

  const isSummerEnabled =
    summerAvailability === true ||
    /^yes\b/i.test(String(summerAvailability || '').trim());

  const summerCapOptions = isSummerEnabled ? SUMMER_CAP_OPTIONS_BASE.map((o) => ({ ...o })) : [];
  const showSummerTuitionNotice = isSummerEnabled;
  const showOverloadNotice = effectiveCap > 18;

  return {
    enrollmentStatus: normalizedStatus,
    selectedMin16Wk: effectiveMin,
    selectedCap16Wk: effectiveCap,
    min16WkOptions: baseMinOptions.map((o) => ({ ...o })),
    min16WkValues: baseMinOptions.map((o) => o.value),
    cap16WkOptions: filteredCapOptions.map((o) => ({ ...o })),
    cap16WkValues: filteredCapOptions.map((o) => o.value),
    cap8WkOptions: CAP_8WK_OPTIONS_BASE.map((o) => ({ ...o })),
    cap8WkValues: CAP_8WK_OPTIONS_BASE.map((o) => o.value),
    modalityOptions: [...MODALITY_PREFERENCE_OPTIONS],
    summerOptions: [...SUMMER_AVAILABILITY_OPTIONS],
    summerCapOptions,
    summerCapValues: summerCapOptions.map((o) => o.value),
    showSummerTuitionNotice,
    summerTuitionNoticeText: showSummerTuitionNotice ? SUMMER_TUITION_NOTICE_TEXT : '',
    showOverloadNotice,
    overloadNoticeText: showOverloadNotice ? OVERLOAD_NOTICE_TEXT : ''
  };
}

/* ==========================================================================
   E. Smart PDF Plan State Serializer (LINDENWOOD_PLAN_PAYLOAD_V1)
   ========================================================================== */

function encodeUtf8ToBase64(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64ToUtf8(b64) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(b64)));
}

/**
 * Encode student intake configuration, declared credential IDs, advisor info,
 * and pacing rules inside a deterministic delimiter block:
 * LINDENWOOD_PLAN_PAYLOAD_V1:<base64>:END_LINDENWOOD_PLAN_PAYLOAD_V1
 */
export function serializePlanPayloadForPdf(state = {}) {
  if (!state || typeof state !== 'object') {
    throw new Error('serializePlanPayloadForPdf requires a valid state object.');
  }

  const normalizedPayload = {
    schemaVersion: 1,
    ...state,
    intakeConfig: state.intakeConfig || state.constraints || {},
    declaredCredentialIds: Array.isArray(state.declaredCredentialIds)
      ? state.declaredCredentialIds
      : Array.isArray(state.programStack)
      ? state.programStack.map((p) => (typeof p === 'string' ? p : p.id || p.programId)).filter(Boolean)
      : state.selectedProgramId
      ? [state.selectedProgramId]
      : [],
    advisorInfo: {
      ...(state.advisorInfo || {}),
      username: parseAdvisorEmailUsername(
        state.advisorInfo?.username || state.advisorInfo?.email || state.advisorEmail || ''
      ),
      email: formatFullAdvisorEmail(
        state.advisorInfo?.email || state.advisorInfo?.username || state.advisorEmail || ''
      )
    },
    pacingRules: state.pacingRules || state.constraints || {}
  };

  const jsonStr = JSON.stringify(normalizedPayload);
  const encoded = encodeUtf8ToBase64(jsonStr);
  return `${PLAN_PAYLOAD_PREFIX}${encoded}${PLAN_PAYLOAD_SUFFIX}`;
}

/**
 * Extract and decode the deterministic LINDENWOOD_PLAN_PAYLOAD_V1 block from PDF raw text.
 * Returns null if no valid delimiter block is present.
 */
export function extractPlanPayloadFromPdfText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const prefixIdx = rawText.indexOf(PLAN_PAYLOAD_PREFIX);
  if (prefixIdx === -1) return null;

  const startOffset = prefixIdx + PLAN_PAYLOAD_PREFIX.length;
  const suffixIdx = rawText.indexOf(PLAN_PAYLOAD_SUFFIX, startOffset);

  let rawEncoded = '';
  if (suffixIdx !== -1) {
    rawEncoded = rawText.slice(startOffset, suffixIdx);
  } else {
    // Fallback if suffix was truncated: read up to whitespace or end of string
    const rest = rawText.slice(startOffset).trim();
    const match = rest.match(/^([A-Za-z0-9+/=_-]+)/);
    rawEncoded = match ? match[1] : '';
  }

  const cleanEncoded = rawEncoded.replace(/\s+/g, '');
  if (!cleanEncoded) return null;

  try {
    // Support raw JSON if unencoded, otherwise Base64 decode
    if (cleanEncoded.startsWith('{') && cleanEncoded.endsWith('}')) {
      return JSON.parse(cleanEncoded);
    }
    const decodedJson = decodeBase64ToUtf8(cleanEncoded);
    return JSON.parse(decodedJson);
  } catch {
    return null;
  }
}
