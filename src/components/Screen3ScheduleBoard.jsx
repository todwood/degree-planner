import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Lock,
  Unlock,
  AlertCircle,
  AlertTriangle,
  FileDown,
  Calendar,
  Sparkles,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  X
} from 'lucide-react';
import { exportDegreePlanPdf } from '../engine/pdfExporter.js';
import { validateScheduleMove } from '../engine/scheduler.js';
import { isTransferPlaceholder } from '../engine/transcriptParser.js';
import dbAdapter from '../data/dbAdapter.js';
import CourseDetailModal from './modals/CourseDetailModal.jsx';

/**
 * Helper to compute concise offering availability text and status from the database.
 */
function getCourseOfferingLabel(course, masterDb, currentSlotKey) {
  // If course is a placeholder (GE, Elective, Transfer placeholder):
  if (
    course.type === 'placeholder' ||
    course.isPlaceholder ||
    (course.code && dbAdapter.isPlaceholder(course.code)) ||
    course.code?.startsWith('REQ_') ||
    course.code?.startsWith('GE-') ||
    course.code?.startsWith('Upper-Level Elective') ||
    course.code === 'Elective'
  ) {
    return {
      text: 'Offered: All Sessions',
      type: 'placeholder',
      isOffSession: false,
      formatted: 'All Sessions'
    };
  }

  // Look up full course from masterDb if available
  const fullCourse =
    masterDb?.courses?.find(
      (c) => c.code.toUpperCase() === course.code?.toUpperCase()
    ) || course;

  const sessions = fullCourse.offered_sessions || [];
  const status = fullCourse.verification_status;

  if (
    status === 'Blank_Unverified' ||
    (!sessions.length &&
      !fullCourse.FA_I_8wk &&
      !fullCourse.FA_II_8wk &&
      !fullCourse.SP_I_8wk &&
      !fullCourse.SP_II_8wk &&
      !fullCourse.FA_16wk &&
      !fullCourse.SP_16wk &&
      !fullCourse.SU_8wk)
  ) {
    return {
      text: 'Offered: Needs insight',
      type: 'unknown'
    };
  }

  // Check off-session if currentSlotKey provided
  let isOffSession = false;
  if (currentSlotKey && sessions.length > 0) {
    const normKey = currentSlotKey === 'SU' ? 'SU-8wk' : currentSlotKey;
    const matches = sessions.some(
      (s) => s === normKey || s.replace('-8wk', '') === currentSlotKey.replace('-8wk', '')
    );
    if (!matches) {
      isOffSession = true;
    }
  }

  // Build concise session summary
  const formatted = sessions.length > 0 ? sessions.join(', ') : '16-Week';
  return {
    text: `Offered: ${formatted}`,
    type: isOffSession ? 'off-session' : 'known',
    isOffSession,
    formatted
  };
}

/**
 * Helper to get the exact session title used in the interactive graduation grid.
 */
function getHistoricalSessionTitle(c, season) {
  const sessionVal = c.termInfo?.session || '';
  const termStr = String(c.term || '');

  if (season === 'Fall') {
    if (sessionVal === 'FA-I' || /_I_|-I\b|OL11/i.test(termStr)) {
      return 'FA-I • 1st 8-Week Session';
    }
    if (sessionVal === 'FA-II' || /_II_|-II\b|OL21/i.test(termStr)) {
      return 'FA-II • 2nd 8-Week Session';
    }
    return 'Fall 16-Week • Full Semester';
  }

  if (season === 'Spring') {
    if (sessionVal === 'SP-I' || /_I_|-I\b|OL11/i.test(termStr)) {
      return 'SP-I • 1st 8-Week Session';
    }
    if (sessionVal === 'SP-II' || /_II_|-II\b|OL21/i.test(termStr)) {
      return 'SP-II • 2nd 8-Week Session';
    }
    return 'Spring 16-Week • Full Semester';
  }

  if (season === 'Summer') {
    return 'Summer Session (8-Week)';
  }

  return '16-Week Full Term';
}

/**
 * Determine the chronologically next semester and appropriate session band for course moves.
 */
export function getDefaultNextSemesterAndSlot(semesters, sourceSemId, sourceSlotKey) {
  if (!Array.isArray(semesters) || semesters.length === 0) {
    return { targetSemId: sourceSemId, targetSlotKey: sourceSlotKey };
  }

  const sourceIdx = semesters.findIndex((s) => s.id === sourceSemId);
  const nextSem =
    sourceIdx >= 0 && sourceIdx + 1 < semesters.length
      ? semesters[sourceIdx + 1]
      : semesters.find((s) => s.id !== sourceSemId) || semesters[0];

  let defaultSlot = 'FA-I';
  if (nextSem?.season === 'Summer') {
    defaultSlot = 'SU';
  } else if (nextSem?.season === 'Spring') {
    defaultSlot = sourceSlotKey?.includes('16wk')
      ? 'Spring-16wk'
      : sourceSlotKey?.endsWith('-II')
      ? 'SP-II'
      : 'SP-I';
  } else {
    defaultSlot = sourceSlotKey?.includes('16wk')
      ? 'Fall-16wk'
      : sourceSlotKey?.endsWith('-II')
      ? 'FA-II'
      : 'FA-I';
  }

  return {
    targetSemId: nextSem?.id || sourceSemId,
    targetSlotKey: defaultSlot
  };
}

/**
 * Pure deterministic executor for course moves across semesters and session lanes.
 */
export function executeCourseMove(
  schedule,
  courseCode,
  sourceSemId,
  sourceSlotKey,
  targetSemId,
  targetSlotKey,
  allPastCourses = [],
  auditResultFlags = {}
) {
  if (!schedule || !Array.isArray(schedule.semesters)) {
    return { success: false, reason: 'INVALID_SCHEDULE', schedule };
  }

  const normSourceSlot = (sourceSlotKey || '').trim();
  const normTargetSlot = (targetSlotKey || '').trim();

  if (sourceSemId === targetSemId && normSourceSlot === normTargetSlot) {
    return { success: false, reason: 'SAME_SLOT', schedule };
  }

  const sourceSem = schedule.semesters.find((s) => s.id === sourceSemId);
  if (!sourceSem) {
    return { success: false, reason: 'SOURCE_SEMESTER_NOT_FOUND', schedule };
  }

  const course = (sourceSem.lanes[normSourceSlot] || []).find(
    (c) => c.code === courseCode || c.compactCode === courseCode
  );
  if (!course) {
    return { success: false, reason: 'COURSE_NOT_FOUND', schedule };
  }

  if (course.locked) {
    return { success: false, reason: 'COURSE_LOCKED', schedule };
  }

  const targetSem = schedule.semesters.find((s) => s.id === targetSemId);
  if (!targetSem) {
    return { success: false, reason: 'TARGET_SEMESTER_NOT_FOUND', schedule };
  }

  // Validate move against deterministic rules using completed courses set
  const completedSet = new Set(
    allPastCourses.map((c) => c.compactCode || (c.code || '').replace(/\s+/g, ''))
  );

  const validation = validateScheduleMove(
    course,
    targetSem,
    normTargetSlot,
    schedule.semesters,
    completedSet,
    auditResultFlags
  );

  let conflictDot = null;
  if (validation.hasConflict) {
    conflictDot = {
      message: validation.conflicts.map((c) => c.message).join(' | '),
      conflicts: validation.conflicts
    };
  }

  const is16 = normTargetSlot.includes('16wk');
  const isTargetEnrolled = Boolean(targetSem.isEnrolledSemester);
  const updatedCourse = {
    ...course,
    assignedSemesterId: targetSem.id,
    assignedSlot: normTargetSlot,
    sessionFormat: is16 ? '16-Week Full Term' : '8-Week Accelerated Session',
    conflict: conflictDot,
    isCurrentEnrolled: isTargetEnrolled,
    isEnrolled: isTargetEnrolled,
    state: isTargetEnrolled ? (course.state || 'Current') : 'Planned'
  };

  const nextSemesters = schedule.semesters.map((sem) => {
    // Case 1: Intra-semester move
    if (sem.id === sourceSemId && sem.id === targetSemId) {
      const filteredSource = (sem.lanes[normSourceSlot] || []).filter(
        (c) => c.code !== course.code && c.compactCode !== course.compactCode
      );
      const filteredTarget = (sem.lanes[normTargetSlot] || []).filter(
        (c) => c.code !== course.code && c.compactCode !== course.compactCode
      );
      const nextTargetLane = [...filteredTarget, updatedCourse];
      const newLanes = {
        ...sem.lanes,
        [normSourceSlot]: filteredSource,
        [normTargetSlot]: nextTargetLane
      };
      const newTotal = Object.values(newLanes).reduce(
        (sum, lane) => sum + (lane || []).reduce((s, c) => s + (c.credits || 0), 0),
        0
      );
      return { ...sem, totalCredits: newTotal, lanes: newLanes };
    }

    // Case 2: Source semester (remove course)
    if (sem.id === sourceSemId) {
      const filtered = (sem.lanes[normSourceSlot] || []).filter(
        (c) => c.code !== course.code && c.compactCode !== course.compactCode
      );
      const newLanes = { ...sem.lanes, [normSourceSlot]: filtered };
      const newTotal = Object.values(newLanes).reduce(
        (sum, lane) => sum + (lane || []).reduce((s, c) => s + (c.credits || 0), 0),
        0
      );
      return { ...sem, totalCredits: newTotal, lanes: newLanes };
    }

    // Case 3: Target semester (add course)
    if (sem.id === targetSemId) {
      const currentLane = (sem.lanes[normTargetSlot] || []).filter(
        (c) => c.code !== course.code && c.compactCode !== course.compactCode
      );
      const nextTargetLane = [...currentLane, updatedCourse];
      const newLanes = { ...sem.lanes, [normTargetSlot]: nextTargetLane };
      const newTotal = Object.values(newLanes).reduce(
        (sum, lane) => sum + (lane || []).reduce((s, c) => s + (c.credits || 0), 0),
        0
      );
      return { ...sem, totalCredits: newTotal, lanes: newLanes };
    }

    return sem;
  });

  return {
    success: true,
    validation,
    conflictDot,
    updatedCourse,
    nextSchedule: { ...schedule, semesters: nextSemesters }
  };
}

/**
 * Format credit counter in semester header based on active vs. future term state.
 * - Future/Inactive or Active with 0 complete: "## Pending Credits"
 * - Active with complete sub-session credits: "## Pending • ## Complete Credits (## Total)"
 */
export function formatSemesterCreditMetric(sem, activeCompletedCredits = 0) {
  const isEnrolledSem = Boolean(sem?.isEnrolledSemester || sem?.hasEnrolledCourses);
  const pendingCredits = sem?.lanes
    ? Object.values(sem.lanes).flat().reduce((sum, c) => sum + (Number(c.credits) || 0), 0)
    : Number(sem?.totalCredits) || 0;

  const compCredits = Number(activeCompletedCredits) || 0;

  if (!isEnrolledSem || compCredits === 0) {
    return `${pendingCredits} Pending Credits`;
  }

  const totalCredits = pendingCredits + compCredits;
  return `${pendingCredits} Pending • ${compCredits} Complete Credits (${totalCredits} Total)`;
}

/**
 * Compute the chronological rank of an academic season/year.
 * Academic year begins with Fall (rank 0), followed by Spring (rank 1), and Summer (rank 2).
 */
export function getTermChronologicalRank(season, year) {
  const numYear = Number(year) || 2026;
  const startYr = season === 'Fall' ? numYear : numYear - 1;
  const seasonRank = season === 'Fall' ? 0 : season === 'Spring' ? 1 : 2;
  return startYr * 3 + seasonRank;
}

/**
 * Check if a term is chronologically strictly in the past relative to the active semester.
 */
export function isTermInPast(season, year, activeSemesterOrRank) {
  const targetRank = getTermChronologicalRank(season, year);
  const refRank =
    typeof activeSemesterOrRank === 'number'
      ? activeSemesterOrRank
      : activeSemesterOrRank
      ? getTermChronologicalRank(activeSemesterOrRank.season, activeSemesterOrRank.year)
      : getTermChronologicalRank('Fall', 2026);
  return targetRank < refRank;
}

/**
 * Pure deterministic executor for planning a retake of an active in-progress course.
 */
export function executePlanRetake(schedule, courseCode, sourceSemId, sourceSlotKey) {
  if (!schedule || !Array.isArray(schedule.semesters)) {
    return { success: false, reason: 'INVALID_SCHEDULE', schedule };
  }

  const sourceSem = schedule.semesters.find((s) => s.id === sourceSemId);
  if (!sourceSem) {
    return { success: false, reason: 'SOURCE_SEMESTER_NOT_FOUND', schedule };
  }

  const sourceLane = sourceSem.lanes[sourceSlotKey] || [];
  const course = sourceLane.find((c) => c.code === courseCode || c.compactCode === courseCode);
  if (!course) {
    return { success: false, reason: 'COURSE_NOT_FOUND', schedule };
  }

  const { targetSemId, targetSlotKey } = getDefaultNextSemesterAndSlot(
    schedule.semesters,
    sourceSemId,
    sourceSlotKey
  );

  const targetSem = schedule.semesters.find((s) => s.id === targetSemId);
  if (!targetSem) {
    return { success: false, reason: 'TARGET_SEMESTER_NOT_FOUND', schedule };
  }

  const is16 = targetSlotKey.includes('16wk');
  const retakeCourse = {
    ...course,
    assignedSemesterId: targetSem.id,
    assignedSlot: targetSlotKey,
    sessionFormat: is16 ? '16-Week Full Term' : '8-Week Accelerated Session',
    locked: false,
    isEnrolled: false,
    isCurrentEnrolled: false,
    state: 'Scheduled',
    isPlannedRetake: true,
    retakeOfTerm: sourceSemId,
    credits: Number(course.credits) || 3
  };

  const nextSemesters = schedule.semesters.map((sem) => {
    // 1. Mark active course in source semester
    if (sem.id === sourceSemId) {
      const nextLane = (sem.lanes[sourceSlotKey] || []).map((c) =>
        c.code === courseCode || c.compactCode === courseCode
          ? { ...c, hasPlannedRetake: true, retakeTargetSemId: targetSemId }
          : c
      );
      return {
        ...sem,
        lanes: { ...sem.lanes, [sourceSlotKey]: nextLane }
      };
    }

    // 2. Add planned retake course into target semester
    if (sem.id === targetSemId) {
      const targetLane = sem.lanes[targetSlotKey] || [];
      if (targetLane.some((c) => (c.code === courseCode || c.compactCode === courseCode) && c.isPlannedRetake)) {
        return sem;
      }
      const newLane = [...targetLane, retakeCourse];
      const updatedLanes = { ...sem.lanes, [targetSlotKey]: newLane };
      const newTotal = Object.values(updatedLanes).flat().reduce((s, c) => s + (Number(c.credits) || 0), 0);
      return {
        ...sem,
        lanes: updatedLanes,
        totalCredits: newTotal
      };
    }

    return sem;
  });

  return {
    success: true,
    targetSemId,
    targetSlotKey,
    schedule: { ...schedule, semesters: nextSemesters }
  };
}

/**
 * Pure deterministic executor for cancelling a planned retake of an active in-progress course.
 */
export function executeCancelRetake(schedule, courseCode, sourceSemId, sourceSlotKey) {
  if (!schedule || !Array.isArray(schedule.semesters)) {
    return { success: false, reason: 'INVALID_SCHEDULE', schedule };
  }

  const nextSemesters = schedule.semesters.map((sem) => {
    // 1. Unmark active course in source semester
    if (sem.id === sourceSemId) {
      const nextLane = (sem.lanes[sourceSlotKey] || []).map((c) =>
        c.code === courseCode || c.compactCode === courseCode
          ? { ...c, hasPlannedRetake: false, retakeTargetSemId: null }
          : c
      );
      return {
        ...sem,
        lanes: { ...sem.lanes, [sourceSlotKey]: nextLane }
      };
    }

    // 2. Remove planned retake instance from any semester
    const updatedLanes = {};
    let modified = false;
    for (const [slot, courses] of Object.entries(sem.lanes || {})) {
      const filtered = courses.filter(
        (c) => !((c.code === courseCode || c.compactCode === courseCode) && c.isPlannedRetake)
      );
      if (filtered.length !== courses.length) modified = true;
      updatedLanes[slot] = filtered;
    }

    if (modified) {
      const newTotal = Object.values(updatedLanes).flat().reduce((s, c) => s + (Number(c.credits) || 0), 0);
      return {
        ...sem,
        lanes: updatedLanes,
        totalCredits: newTotal
      };
    }

    return sem;
  });

  return {
    success: true,
    schedule: { ...schedule, semesters: nextSemesters }
  };
}

export default function Screen3ScheduleBoard({
  schedule,
  setSchedule,
  auditResult,
  parsedTranscript,
  facultyProfile,
  constraints,
  onUpdateConstraints,
  onBackToAudit,
  masterDb,
  selectedProgramId: propSelectedProgramId,
  additionalPrograms: propAdditionalPrograms,
  catalogYear: propCatalogYear
}) {
  const [selectedCourseForDrawer, setSelectedCourseForDrawer] = useState(null);
  const [expandedSummerIds, setExpandedSummerIds] = useState(new Set());
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [addingNoteSemId, setAddingNoteSemId] = useState(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteInfo, setEditingNoteInfo] = useState(null); // { semId, noteId, text }
  const [movingCourseInfo, setMovingCourseInfo] = useState(null); // { course, sourceSemId, sourceSlotKey, targetSemId, targetSlotKey }
  const [moveFeedback, setMoveFeedback] = useState(null); // { message, type: 'success' | 'warning' }
  const moveFeedbackTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (moveFeedbackTimeoutRef.current) {
        clearTimeout(moveFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const planCreationDate = React.useMemo(() => {
    const d = new Date();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} (${days[d.getDay()]})`;
  }, []);

  const drawerCourse = React.useMemo(() => {
    if (!selectedCourseForDrawer) return null;
    const code = selectedCourseForDrawer.code;
    const fullFromDb =
      (masterDb?.courses || []).find((c) => c.code === code) ||
      (masterDb?.courses || []).find(
        (c) =>
          (c.compactCode || c.code.replace(/\s+/g, '')).toUpperCase() ===
          String(code).replace(/\s+/g, '').toUpperCase()
      ) ||
      dbAdapter.getCourseSync(code);

    return {
      ...fullFromDb,
      ...selectedCourseForDrawer,
      title: selectedCourseForDrawer.title || fullFromDb?.title || code,
      description:
        selectedCourseForDrawer.description ||
        fullFromDb?.description ||
        'Verbatim description pulled from Academic Course Catalog.',
      department:
        selectedCourseForDrawer.department ||
        selectedCourseForDrawer.subject ||
        fullFromDb?.department ||
        (code || '').split(/\s+/)[0] ||
        'General',
      credits:
        selectedCourseForDrawer.credits !== undefined
          ? selectedCourseForDrawer.credits
          : fullFromDb?.credits !== undefined
          ? fullFromDb.credits
          : 3,
      ge_bucket_id:
        selectedCourseForDrawer.ge_bucket_id ||
        selectedCourseForDrawer.geBucketId ||
        fullFromDb?.ge_bucket_id ||
        null,
      prereq_display:
        selectedCourseForDrawer.prereq_display ||
        fullFromDb?.prereq_display ||
        'None',
      coreq_codes:
        selectedCourseForDrawer.coreq_codes ||
        fullFromDb?.coreq_codes ||
        [],
      offered_sessions:
        selectedCourseForDrawer.offered_sessions ||
        fullFromDb?.offered_sessions ||
        (fullFromDb?.type === 'placeholder' || selectedCourseForDrawer.isPlaceholder
          ? ['All Sessions']
          : ['Fall-16wk', 'Spring-16wk']),
      fee_info: selectedCourseForDrawer.fee_info || fullFromDb?.fee_info || '$0'
    };
  }, [selectedCourseForDrawer, masterDb]);

  const drawerPopularityStats = React.useMemo(() => {
    if (!drawerCourse) return [];
    const allStats = masterDb?.ge_popularity_stats || [];
    const bucketId = drawerCourse.ge_bucket_id;
    if (bucketId) {
      return allStats.filter((st) => st.ge_bucket_id === bucketId);
    }
    if (
      drawerCourse.type === 'placeholder' &&
      (drawerCourse.code?.startsWith('REQ_GE') || drawerCourse.category === 'GE')
    ) {
      return allStats.slice(0, 3);
    }
    return [];
  }, [drawerCourse, masterDb]);

  // Completed Historical Courses & Transfers (Zone 1)
  const rawTransferCourses = parsedTranscript?.transferCourses || [];
  const rawCompletedCourses = parsedTranscript?.completedCourses || [];

  // Separate transfer courses from institutional courses
  const pastTransfersMap = new Map();
  for (let i = 0; i < rawTransferCourses.length; i++) {
    const c = rawTransferCourses[i];
    const isPlaceholder = isTransferPlaceholder(c);
    const key = isPlaceholder
      ? `${c.code || c.rawCourseCode}_${c.term || 'TR'}_${c.grade || ''}_${c.credits || ''}_${i}`
      : `${c.code || c.rawCourseCode}_${c.term || 'TR'}`;
    pastTransfersMap.set(key, { ...c, isTransfer: true });
  }
  for (let i = 0; i < rawCompletedCourses.length; i++) {
    const c = rawCompletedCourses[i];
    const isTr =
      c.isTransfer ||
      c.state === 'TR' ||
      c.state === 'Transfer' ||
      c.grade?.startsWith('TR') ||
      c.term === 'TRANSFER_TERM' ||
      c.termInfo?.isTransfer;
    if (isTr) {
      const isPlaceholder = isTransferPlaceholder(c);
      const key = isPlaceholder
        ? `${c.code || c.rawCourseCode}_${c.term || 'TR'}_${c.grade || ''}_${c.credits || ''}_${i}`
        : `${c.code || c.rawCourseCode}_${c.term || 'TR'}`;
      if (!pastTransfersMap.has(key)) {
        pastTransfersMap.set(key, { ...c, isTransfer: true });
      }
    }
  }
  const pastTransfers = Array.from(pastTransfersMap.values());

  // Institutional completed courses (excluding transfers)
  const institutionalCompletedMap = new Map();
  for (const c of rawCompletedCourses) {
    const isTr =
      c.isTransfer ||
      c.state === 'TR' ||
      c.state === 'Transfer' ||
      c.grade?.startsWith('TR') ||
      c.term === 'TRANSFER_TERM' ||
      c.termInfo?.isTransfer;
    if (!isTr) {
      const key = `${c.code || c.rawCourseCode}_${c.term || 'COMP'}`;
      institutionalCompletedMap.set(key, c);
    }
  }
  const pastInstitutionalCourses = Array.from(institutionalCompletedMap.values());
  const allPastCourses = [...pastTransfers, ...pastInstitutionalCourses];

  // Group institutional courses into Academic Years (Fall Left, Spring Right, Summer Centered Below)
  const academicYearsHistory = useMemo(() => {
    const ayMap = new Map();

    for (const c of pastInstitutionalCourses) {
      let year = c.termInfo?.year;
      let season = c.termInfo?.season;
      const termStr = String(c.term || '');

      if (!year || !season) {
        const yrMatch = termStr.match(/20(\d{2})/) || termStr.match(/[_\s](\d{2})(?:[_\s]|$)/);
        if (yrMatch) {
          year = parseInt(yrMatch[1], 10) + 2000;
        }
        if (/fall|fa/i.test(termStr)) season = 'Fall';
        else if (/spring|sp/i.test(termStr)) season = 'Spring';
        else if (/summer|su/i.test(termStr)) season = 'Summer';
      }
      year = year || 2024;
      season = season || 'Fall';

      const ayStartYear = season === 'Fall' ? year : year - 1;
      const ayKey = `AY-${ayStartYear}`;

      if (!ayMap.has(ayKey)) {
        ayMap.set(ayKey, {
          key: ayKey,
          startYear: ayStartYear,
          label: `ACADEMIC YEAR ${ayStartYear}–${ayStartYear + 1}`,
          fall: null,
          spring: null,
          summer: null,
          totalCredits: 0
        });
      }

      const ay = ayMap.get(ayKey);
      ay.totalCredits += Number(c.credits) || 0;

      const semProp = season.toLowerCase(); // 'fall', 'spring', 'summer'
      if (!ay[semProp]) {
        ay[semProp] = {
          termName: `${season} ${year}`,
          season,
          year,
          totalCredits: 0,
          courses: [],
          sessions: new Map()
        };
      }

      const sem = ay[semProp];
      sem.totalCredits += Number(c.credits) || 0;
      const sessionTitle = getHistoricalSessionTitle(c, season);
      if (!sem.sessions.has(sessionTitle)) {
        sem.sessions.set(sessionTitle, []);
      }
      sem.sessions.get(sessionTitle).push(c);
      sem.courses.push(c);
    }

    const sortedAys = Array.from(ayMap.values()).sort((a, b) => a.startYear - b.startYear);

    const SESSION_ORDER = [
      'Fall 16-Week • Full Semester',
      'Spring 16-Week • Full Semester',
      'FA-I • 1st 8-Week Session',
      'SP-I • 1st 8-Week Session',
      'FA-II • 2nd 8-Week Session',
      'SP-II • 2nd 8-Week Session',
      'Summer Session (8-Week)'
    ];

    sortedAys.forEach((ay) => {
      ['fall', 'spring', 'summer'].forEach((s) => {
        const sem = ay[s];
        if (sem) {
          sem.sessionGroups = Array.from(sem.sessions.entries())
            .sort(([sessA], [sessB]) => {
              const idxA = SESSION_ORDER.indexOf(sessA);
              const idxB = SESSION_ORDER.indexOf(sessB);
              return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
            })
            .map(([sessionName, courses]) => ({
              sessionName,
              courses
            }));
        }
      });
    });

    return sortedAys;
  }, [pastInstitutionalCourses]);

  // Derived Historical Coursework Metrics (Audit Health Ribbon)
  const totalTransferCredits = pastTransfers.reduce((sum, c) => sum + (c.credits || 0), 0);
  const totalCompletedCredits =
    parsedTranscript?.summary?.totalCompletedCredits ??
    allPastCourses.reduce((sum, c) => sum + (c.credits || 0), 0);
  const transferCredits =
    parsedTranscript?.summary?.totalTransferCredits ?? totalTransferCredits;
  const institutionalCompletedCredits = Math.max(0, totalCompletedCredits - transferCredits);
  const completedCourseCount = allPastCourses.length;

  // Current In-Progress & Incoming Transfers (Zone 2)
  const currentCourses = parsedTranscript?.currentCourses || [];
  const incomingTransfers = (auditResult?.incomingTransfers || []).concat(
    (parsedTranscript?.validCourses || []).filter((c) => c.isIncomingPlaceholder)
  );

  // Identify the active semester (enrolled) or reference start rank
  const activeSem = useMemo(() => {
    return schedule?.semesters?.find((s) => s.isEnrolledSemester || s.hasEnrolledCourses) || null;
  }, [schedule?.semesters]);

  // Identify completed institutional courses belonging to the active semester
  const activeSemCompletedCourses = useMemo(() => {
    if (!activeSem) return [];
    return pastInstitutionalCourses.filter((c) => {
      const tInfo = c.termInfo || {};
      const season = tInfo.season || '';
      const year = Number(tInfo.year);
      if (season.toLowerCase() === activeSem.season?.toLowerCase() && year === Number(activeSem.year)) {
        return true;
      }
      const termStr = String(c.term || '').toLowerCase();
      return (
        termStr.includes(activeSem.season?.toLowerCase()) &&
        termStr.includes(String(activeSem.year))
      );
    });
  }, [activeSem, pastInstitutionalCourses]);

  const activeCompletedCredits = useMemo(() => {
    return activeSemCompletedCourses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
  }, [activeSemCompletedCourses]);

  const activeOrStartRank = useMemo(() => {
    if (activeSem) {
      return getTermChronologicalRank(activeSem.season, activeSem.year);
    }
    if (schedule?.semesters?.length > 0) {
      const firstSem = schedule.semesters[0];
      return getTermChronologicalRank(firstSem.season, firstSem.year);
    }
    return getTermChronologicalRank('Fall', 2026);
  }, [activeSem, schedule?.semesters]);

  // Group semesters by Academic Year: Fall Y, Spring Y+1, Summer Y+1
  const academicYearsMap = new Map();
  for (const sem of schedule?.semesters || []) {
    const ayStartYear = sem.season === 'Fall' ? sem.year : sem.year - 1;
    const ayKey = `AY-${ayStartYear}`;
    if (!academicYearsMap.has(ayKey)) {
      academicYearsMap.set(ayKey, {
        key: ayKey,
        label: `Academic Year ${ayStartYear}–${ayStartYear + 1}`,
        startYear: ayStartYear,
        fall: null,
        spring: null,
        summer: null,
        semesters: []
      });
    }
    const group = academicYearsMap.get(ayKey);
    group.semesters.push(sem);
    if (sem.season === 'Fall') group.fall = sem;
    else if (sem.season === 'Spring') group.spring = sem;
    else if (sem.season === 'Summer') group.summer = sem;
  }
  const academicYears = Array.from(academicYearsMap.values());

  // Toggle Lock on a course card
  const toggleCourseLock = (semId, slotKey, courseCode) => {
    setSchedule((prev) => {
      const nextSemesters = prev.semesters.map((sem) => {
        if (sem.id !== semId) return sem;
        const nextLane = (sem.lanes[slotKey] || []).map((c) => {
          if (c.code === courseCode) {
            return { ...c, locked: !c.locked };
          }
          return c;
        });
        return {
          ...sem,
          lanes: { ...sem.lanes, [slotKey]: nextLane }
        };
      });
      return { ...prev, semesters: nextSemesters };
    });
  };

  // Start adding a custom note to a semester (inline)
  const handleAddSemesterNote = (semId, directText = null) => {
    if (typeof directText === 'string' && directText.trim()) {
      setSchedule((prev) => {
        const nextSemesters = prev.semesters.map((sem) => {
          if (sem.id !== semId) return sem;
          const newNote = {
            id: `custom-note-${Date.now()}`,
            type: 'custom',
            category: 'Advisor Note',
            text: directText.trim()
          };
          return {
            ...sem,
            notes: [...(sem.notes || []), newNote]
          };
        });
        return { ...prev, semesters: nextSemesters };
      });
      setAddingNoteSemId(null);
      setNewNoteText('');
      return;
    }
    setAddingNoteSemId(semId);
    setNewNoteText('');
  };

  // Edit an existing note in a semester
  const handleSaveEditedNote = (semId, noteId, updatedText) => {
    if (!updatedText || !updatedText.trim()) return;
    setSchedule((prev) => {
      const nextSemesters = prev.semesters.map((sem) => {
        if (sem.id !== semId) return sem;
        return {
          ...sem,
          notes: (sem.notes || []).map((n) =>
            n.id === noteId ? { ...n, text: updatedText.trim() } : n
          )
        };
      });
      return { ...prev, semesters: nextSemesters };
    });
    setEditingNoteInfo(null);
  };

  // Reorder a note up or down within a semester
  const handleReorderNote = (semId, noteId, direction) => {
    setSchedule((prev) => {
      const nextSemesters = prev.semesters.map((sem) => {
        if (sem.id !== semId) return sem;
        const list = [...(sem.notes || [])];
        const idx = list.findIndex((n) => n.id === noteId);
        if (idx === -1) return sem;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= list.length) return sem;
        const temp = list[idx];
        list[idx] = list[targetIdx];
        list[targetIdx] = temp;
        return { ...sem, notes: list };
      });
      return { ...prev, semesters: nextSemesters };
    });
  };

  // Delete a note from a semester
  const handleDeleteNote = (semId, noteId) => {
    setSchedule((prev) => {
      const nextSemesters = prev.semesters.map((sem) => {
        if (sem.id !== semId) return sem;
        return {
          ...sem,
          notes: (sem.notes || []).filter((n) => n.id !== noteId)
        };
      });
      return { ...prev, semesters: nextSemesters };
    });
  };

  // Resolve a card conflict via "* Tentative" DB update or "Policy Exception (PE)"
  const handleResolveConflict = (semId, slotKey, courseCode, actionType) => {
    setSchedule((prev) => {
      const nextSemesters = prev.semesters.map((sem) => {
        if (sem.id !== semId) return sem;
        const nextLane = (sem.lanes[slotKey] || []).map((c) => {
          if (c.code === courseCode) {
            return {
              ...c,
              conflict: null,
              conflictResolution:
                actionType === 'TENTATIVE'
                  ? '* Tentative Shared DB Offering'
                  : 'Policy Exception (PE)'
            };
          }
          return c;
        });
        const extraNotes =
          actionType === 'PE'
            ? [
                ...(sem.notes || []),
                {
                  id: `pe-note-${Date.now()}`,
                  type: 'custom',
                  category: 'Policy Exception',
                  text: `Needs PE for ${courseCode} (${slotKey})`
                }
              ]
            : sem.notes || [];
        return {
          ...sem,
          lanes: { ...sem.lanes, [slotKey]: nextLane },
          notes: extraNotes
        };
      });
      return { ...prev, semesters: nextSemesters };
    });
  };

  // Deterministic Course Move handler across semesters and session bands
  const moveCourse = (courseCode, sourceSemId, sourceSlotKey, targetSemId, targetSlotKey) => {
    const result = executeCourseMove(
      schedule,
      courseCode,
      sourceSemId,
      sourceSlotKey,
      targetSemId,
      targetSlotKey,
      allPastCourses,
      auditResult?.flags
    );

    if (!result.success) {
      return;
    }

    setSchedule(result.nextSchedule);

    const targetSem = schedule.semesters.find((s) => s.id === targetSemId);
    const normTargetSlot = (targetSlotKey || '').trim();
    const conflictMsg = result.validation?.hasConflict
      ? ` (Note: ${result.validation.conflicts[0]?.message || 'Prerequisite conflict'})`
      : '';
    setMoveFeedback({
      message: `Moved ${courseCode} to ${targetSem?.title || targetSemId} (${normTargetSlot})${conflictMsg}`,
      type: result.validation?.hasConflict ? 'warning' : 'success'
    });
    if (moveFeedbackTimeoutRef.current) {
      clearTimeout(moveFeedbackTimeoutRef.current);
    }
    moveFeedbackTimeoutRef.current = setTimeout(() => {
      setMoveFeedback(null);
    }, 4000);
  };

  // Open non-blocking inline modal to move a course card
  const handleMoveCoursePrompt = (course, sourceSemId, sourceSlotKey) => {
    if (course.locked) return;
    const { targetSemId, targetSlotKey } = getDefaultNextSemesterAndSlot(
      schedule.semesters,
      sourceSemId,
      sourceSlotKey
    );
    setMovingCourseInfo({
      course,
      sourceSemId,
      sourceSlotKey,
      targetSemId,
      targetSlotKey
    });
  };

  // Plan a retake for an active in-progress course
  const handlePlanRetake = (course, sourceSemId, sourceSlotKey) => {
    const res = executePlanRetake(schedule, course.code, sourceSemId, sourceSlotKey);
    if (!res.success) {
      console.warn('Plan retake warning:', res.reason);
      return;
    }
    setSchedule(res.schedule);
    const targetSem = res.schedule.semesters.find((s) => s.id === res.targetSemId);
    setMoveFeedback({
      courseCode: course.code,
      message: `Retake planned for ${course.code} in ${targetSem?.title || res.targetSemId}.`,
      type: 'success'
    });
    if (moveFeedbackTimeoutRef.current) clearTimeout(moveFeedbackTimeoutRef.current);
    moveFeedbackTimeoutRef.current = setTimeout(() => {
      setMoveFeedback(null);
    }, 4000);
  };

  // Cancel a planned retake for an active in-progress course
  const handleCancelRetake = (course, sourceSemId, sourceSlotKey) => {
    const res = executeCancelRetake(schedule, course.code, sourceSemId, sourceSlotKey);
    if (!res.success) {
      console.warn('Cancel retake warning:', res.reason);
      return;
    }
    setSchedule(res.schedule);
    setMoveFeedback({
      courseCode: course.code,
      message: `Planned retake for ${course.code} cancelled.`,
      type: 'success'
    });
    if (moveFeedbackTimeoutRef.current) clearTimeout(moveFeedbackTimeoutRef.current);
    moveFeedbackTimeoutRef.current = setTimeout(() => {
      setMoveFeedback(null);
    }, 4000);
  };

  const handleSemesterCardDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleSemesterCardDrop = (e, sem) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.courseCode || !data.sourceSemId || !data.sourceSlotKey) return;

      let targetSlot = 'FA-I';
      if (sem.season === 'Summer') {
        targetSlot = 'SU';
      } else if (sem.season === 'Spring') {
        targetSlot = data.sourceSlotKey?.includes('16wk')
          ? 'Spring-16wk'
          : data.sourceSlotKey?.endsWith('-II')
          ? 'SP-II'
          : 'SP-I';
      } else {
        targetSlot = data.sourceSlotKey?.includes('16wk')
          ? 'Fall-16wk'
          : data.sourceSlotKey?.endsWith('-II')
          ? 'FA-II'
          : 'FA-I';
      }

      moveCourse(data.courseCode, data.sourceSemId, data.sourceSlotKey, sem.id, targetSlot);
    } catch (err) {
      console.warn('Semester drop error:', err);
    }
  };

  // Export Stateful PDF
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const pdfBytes = await exportDegreePlanPdf({
        studentMetadata: parsedTranscript?.studentMetadata,
        facultyProfile,
        primaryProgram: auditResult?.primaryProgram,
        constraints: constraints || auditResult?.constraints,
        auditResult,
        schedule
      });

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const studentNameClean = (parsedTranscript?.studentMetadata?.name || 'Student').replace(/\s+/g, '_');
      link.href = url;
      link.download = `Degree_Plan_${studentNameClean}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Render a concluded past semester card (Blank body, registration closed)
  const renderPastConcludedSemesterCard = (termTitle) => {
    return (
      <div
        key={`past-concluded-${termTitle}`}
        data-testid={`concluded-past-semester-${termTitle.replace(/\s+/g, '-')}`}
        className="w-full bg-neutral-50/70 rounded-xl border border-neutral-200 p-3.5 shadow-2xs space-y-3"
      >
        {/* Semester Header: Term identifier only, no + Note button */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
          <div className="flex items-center space-x-1.5 truncate">
            <h3 className="text-sm font-bold text-neutral-600 truncate">{termTitle}</h3>
            <span className="text-[10px] font-mono font-semibold text-neutral-500 bg-neutral-200/60 px-1.5 py-0.5 rounded border border-neutral-300">
              Concluded
            </span>
          </div>
        </div>

        {/* Card Body: Blank body with subtle muted placeholder label, no drag targets */}
        <div className="min-h-[140px] flex flex-col items-center justify-center p-4 text-center">
          <span className="text-xs text-neutral-500 font-medium select-none">
            Term Concluded • Recorded in Past Coursework History
          </span>
        </div>
      </div>
    );
  };

  // Render a full semester column card (Fall, Spring, or Summer)
  const renderSemesterCard = (sem) => {
    const isSummer = sem.season === 'Summer';
    const isCollapsed = sem.isCollapsed && !expandedSummerIds.has(sem.id);
    const hasEnrolled = Boolean(sem.isEnrolledSemester || sem.hasEnrolledCourses);
    const isThisSemActive = hasEnrolled;
    const semCompletedCredits = isThisSemActive ? activeCompletedCredits : 0;
    const semCreditLabel = formatSemesterCreditMetric(sem, semCompletedCredits);

    if (isSummer) {
      return (
        <div
          key={sem.id}
          onDragOver={handleSemesterCardDragOver}
          onDrop={(e) => handleSemesterCardDrop(e, sem)}
          className={`w-full bg-white rounded-xl border p-3.5 shadow-xs space-y-3 ${
            hasEnrolled ? 'border-neutral-400 bg-neutral-50/40' : 'border-neutral-300'
          }`}
        >
          {isCollapsed ? (
            <div
              onClick={() => {
                const next = new Set(expandedSummerIds);
                next.add(sem.id);
                setExpandedSummerIds(next);
              }}
              className="h-24 bg-neutral-50 hover:bg-neutral-100 border-2 border-dashed border-neutral-300 rounded-lg flex flex-col items-center justify-center p-3 cursor-pointer text-xs transition text-center"
            >
              <span className="font-bold text-neutral-700 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                <span>{sem.title} (0cr Scheduled)</span>
              </span>
              <span className="text-[10px] text-[#857542] font-semibold mt-1">
                + Expand Summer Session
              </span>
            </div>
          ) : (
            <>
              {/* Summer Header */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <div className="flex items-center space-x-1.5 truncate">
                  <h3 className="text-sm font-bold text-neutral-900 truncate">{sem.title}</h3>
                  {hasEnrolled && (
                    <span className="text-[9px] font-bold bg-neutral-200 text-neutral-700 px-1 py-0.2 rounded">
                      Enrolled
                    </span>
                  )}
                  <span className="text-[10px] font-mono font-bold text-[#857542] bg-[#F7F5EE] px-1.5 py-0.5 rounded border border-[#B5A36A]">
                    {semCreditLabel}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleAddSemesterNote(sem.id)}
                    className="text-[11px] font-bold text-[#857542] hover:text-[#6E6035]"
                    title="Add Note"
                  >
                    + Note
                  </button>
                  {sem.isCollapsed && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(expandedSummerIds);
                        next.delete(sem.id);
                        setExpandedSummerIds(next);
                      }}
                      className="text-[10px] text-neutral-400 hover:text-black"
                      title="Collapse"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {sem.isForcedSummer && (
                <div className="p-2 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-900 font-semibold flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                  <span>Forced Summer: IIT 45200 is offered strictly in Summer.</span>
                </div>
              )}

              {/* Stacked Summer Band */}
              <SemesterBand
                semId={sem.id}
                slotKey="SU"
                slotLabel="SU • Summer 8-Week Session"
                courses={sem.lanes.SU || []}
                totalCredits={(sem.lanes.SU || []).reduce((s, c) => s + c.credits, 0)}
                onOpenDrawer={(c) => setSelectedCourseForDrawer(c)}
                onToggleLock={(sId, sKey, cCode) => toggleCourseLock(sId, sKey, cCode)}
                onMoveCourse={(c, sId, sKey) => handleMoveCoursePrompt(c, sId, sKey)}
                onPlanRetake={(c, sId, sKey) => handlePlanRetake(c, sId, sKey)}
                onCancelRetake={(c, sId, sKey) => handleCancelRetake(c, sId, sKey)}
                onDropCourse={moveCourse}
                onResolveConflict={handleResolveConflict}
                masterDb={masterDb}
              />

              <SemesterFooter
                sem={sem}
                addingNoteSemId={addingNoteSemId}
                newNoteText={newNoteText}
                setNewNoteText={setNewNoteText}
                setAddingNoteSemId={setAddingNoteSemId}
                editingNoteInfo={editingNoteInfo}
                setEditingNoteInfo={setEditingNoteInfo}
                onAddNote={(txt) => handleAddSemesterNote(sem.id, txt)}
                onSaveEditedNote={handleSaveEditedNote}
                onReorderNote={handleReorderNote}
                onDeleteNote={(nId) => handleDeleteNote(sem.id, nId)}
              />
            </>
          )}
        </div>
      );
    }

    // Fall / Spring Semesters
    const slot1Key = sem.season === 'Fall' ? 'FA-I' : 'SP-I';
    const slot2Key = sem.season === 'Fall' ? 'FA-II' : 'SP-II';
    const slot16Key = sem.season === 'Fall' ? 'Fall-16wk' : 'Spring-16wk';

    const slot1Label = sem.season === 'Fall' ? 'FA-I • 1st 8-Week Session' : 'SP-I • 1st 8-Week Session';
    const slot2Label = sem.season === 'Fall' ? 'FA-II • 2nd 8-Week Session' : 'SP-II • 2nd 8-Week Session';
    const slot16Label = sem.season === 'Fall' ? 'Fall 16-Week • Full Semester' : 'Spring 16-Week • Full Semester';

    return (
      <div
        key={sem.id}
        onDragOver={handleSemesterCardDragOver}
        onDrop={(e) => handleSemesterCardDrop(e, sem)}
        className={`w-full bg-white rounded-xl border p-3.5 shadow-xs space-y-3 ${
          hasEnrolled ? 'border-neutral-400 bg-neutral-50/30' : 'border-neutral-300'
        }`}
      >
        {/* Semester Header */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
          <div className="flex items-center space-x-1.5 truncate">
            <h3 className="text-sm font-bold text-neutral-900 truncate">{sem.title}</h3>
            {hasEnrolled && (
              <span className="text-[9px] font-bold bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded">
                Active Enrolled
              </span>
            )}
            <span className="text-[10px] font-mono font-bold text-[#857542] bg-[#F7F5EE] px-1.5 py-0.5 rounded border border-[#B5A36A]">
              {semCreditLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleAddSemesterNote(sem.id)}
            className="text-[11px] font-bold text-[#857542] hover:text-[#6E6035]"
          >
            + Note
          </button>
        </div>

        {/* 3 Stacked Horizontal Bands: 16-Week, Session I, Session II */}
        <div className="space-y-2.5">
          {/* Sub-Session Active Course Ingestion (Completed 1st 8-Week Session) */}
          {isThisSemActive && activeSemCompletedCourses.length > 0 && (
            <div
              data-testid="active-semester-completed-subsession"
              className="rounded-lg border border-neutral-200/90 bg-neutral-50/70 p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600 px-0.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-neutral-200/80 text-neutral-800 border-neutral-300">
                  1st 8-Week Session • Completed
                </span>
                <span className="font-mono text-[10px] text-neutral-600 font-bold">
                  {activeCompletedCredits} cr Complete
                </span>
              </div>
              <div className="space-y-1">
                {activeSemCompletedCourses.map((c, i) => (
                  <div
                    key={`${c.code || c.rawCourseCode}_completed_${i}`}
                    data-testid={`active-completed-course-${c.code || c.rawCourseCode}`}
                    className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-white border border-neutral-200 text-xs shadow-2xs"
                  >
                    <div className="flex items-center space-x-1.5 min-w-0 truncate">
                      <span className="font-mono font-bold text-neutral-800 flex-shrink-0 text-[11px]">
                        {c.code || c.rawCourseCode}
                      </span>
                      <span className="text-[11px] text-neutral-600 truncate" title={c.title || c.name || ''}>
                        {c.title || c.name || ''}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0 text-[11px]">
                      <span className="font-mono font-bold text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded text-[10px] border border-neutral-200">
                        {c.grade || 'A'}
                      </span>
                      <span className="font-mono text-neutral-500 text-[10px]">
                        {Math.round(c.credits || 3)}cr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Band 1: 16-Week Full Term */}
          <SemesterBand
            semId={sem.id}
            slotKey={slot16Key}
            slotLabel={slot16Label}
            courses={sem.lanes[slot16Key] || []}
            totalCredits={(sem.lanes[slot16Key] || []).reduce((s, c) => s + c.credits, 0)}
            onOpenDrawer={(c) => setSelectedCourseForDrawer(c)}
            onToggleLock={(sId, sKey, cCode) => toggleCourseLock(sId, sKey, cCode)}
            onMoveCourse={(c, sId, sKey) => handleMoveCoursePrompt(c, sId, sKey)}
            onPlanRetake={(c, sId, sKey) => handlePlanRetake(c, sId, sKey)}
            onCancelRetake={(c, sId, sKey) => handleCancelRetake(c, sId, sKey)}
            onDropCourse={moveCourse}
            onResolveConflict={handleResolveConflict}
            masterDb={masterDb}
          />

          {/* Band 2: Session I (First 8-Week) */}
          <SemesterBand
            semId={sem.id}
            slotKey={slot1Key}
            slotLabel={slot1Label}
            courses={sem.lanes[slot1Key] || []}
            totalCredits={(sem.lanes[slot1Key] || []).reduce((s, c) => s + c.credits, 0)}
            onOpenDrawer={(c) => setSelectedCourseForDrawer(c)}
            onToggleLock={(sId, sKey, cCode) => toggleCourseLock(sId, sKey, cCode)}
            onMoveCourse={(c, sId, sKey) => handleMoveCoursePrompt(c, sId, sKey)}
            onPlanRetake={(c, sId, sKey) => handlePlanRetake(c, sId, sKey)}
            onCancelRetake={(c, sId, sKey) => handleCancelRetake(c, sId, sKey)}
            onDropCourse={moveCourse}
            onResolveConflict={handleResolveConflict}
            masterDb={masterDb}
          />

          {/* Band 3: Session II (Second 8-Week) */}
          <SemesterBand
            semId={sem.id}
            slotKey={slot2Key}
            slotLabel={slot2Label}
            courses={sem.lanes[slot2Key] || []}
            totalCredits={(sem.lanes[slot2Key] || []).reduce((s, c) => s + c.credits, 0)}
            onOpenDrawer={(c) => setSelectedCourseForDrawer(c)}
            onToggleLock={(sId, sKey, cCode) => toggleCourseLock(sId, sKey, cCode)}
            onMoveCourse={(c, sId, sKey) => handleMoveCoursePrompt(c, sId, sKey)}
            onPlanRetake={(c, sId, sKey) => handlePlanRetake(c, sId, sKey)}
            onCancelRetake={(c, sId, sKey) => handleCancelRetake(c, sId, sKey)}
            onDropCourse={moveCourse}
            onResolveConflict={handleResolveConflict}
            masterDb={masterDb}
          />
        </div>

        {/* Registration notice, graduation deadline, and notes */}
        <SemesterFooter
          sem={sem}
          addingNoteSemId={addingNoteSemId}
          newNoteText={newNoteText}
          setNewNoteText={setNewNoteText}
          setAddingNoteSemId={setAddingNoteSemId}
          editingNoteInfo={editingNoteInfo}
          setEditingNoteInfo={setEditingNoteInfo}
          onAddNote={(txt) => handleAddSemesterNote(sem.id, txt)}
          onSaveEditedNote={handleSaveEditedNote}
          onReorderNote={handleReorderNote}
          onDeleteNote={(nId) => handleDeleteNote(sem.id, nId)}
        />
      </div>
    );
  };

  // Render a historical completed semester card (Fall, Spring, or Summer)
  const renderHistoricalSemesterCard = (sem) => {
    if (!sem) return null;
    return (
      <div
        key={sem.termName}
        className="bg-white rounded-xl border border-neutral-200/90 shadow-2xs overflow-hidden flex flex-col"
      >
        {/* Semester Card Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-50/80 border-b border-neutral-200 text-xs">
          <span className="font-bold text-neutral-800">{sem.termName}</span>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-neutral-600">
            <span className="font-bold text-[#857542]">{Math.round(sem.totalCredits)}cr</span>
            <span className="text-neutral-300">•</span>
            <span>
              {sem.courses.length} {sem.courses.length === 1 ? 'Course' : 'Courses'}
            </span>
          </div>
        </div>

        {/* Internal Conditional Session Sub-Sections */}
        <div className="p-2 space-y-2">
          {sem.sessionGroups?.map((group) => (
            <div key={group.sessionName} className="space-y-0.5">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-0.5 mt-1.5 mb-1 border-b border-neutral-100 bg-neutral-50/50">
                {group.sessionName}
              </div>
              <div className="space-y-0.5">
                {group.courses.map((c, i) => (
                  <div
                    key={`${c.code || c.rawCourseCode}_${i}`}
                    className="flex items-center justify-between gap-2 py-0.5 px-2 rounded hover:bg-neutral-50 text-xs transition"
                  >
                    {/* Left: Course Code + Truncated Title */}
                    <div className="flex items-center space-x-1.5 min-w-0 truncate">
                      <span className="font-mono font-bold text-neutral-800 flex-shrink-0">
                        {c.code || c.rawCourseCode}
                      </span>
                      <span
                        className="text-[11px] text-neutral-500 truncate"
                        title={`${c.title || c.name || ''}${c.geTag && !(c.title || c.name || '').includes(c.geTag) ? ` (${c.geTag})` : ''}`}
                      >
                        {c.title || c.name || ''}
                        {c.geTag && !(c.title || c.name || '').includes(c.geTag) ? ` (${c.geTag})` : ''}
                      </span>
                    </div>

                    {/* Right: Grade + Credits */}
                    <div className="flex items-center space-x-2 flex-shrink-0 text-[11px]">
                      <span className="font-mono font-bold text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">
                        {c.grade || 'TR'}
                      </span>
                      <span className="font-mono text-neutral-500 text-[11px]">
                        {Math.round(c.credits || 3)}cr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Top Header & Export Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#857542] uppercase tracking-wider">
            Step 3: Visual Degree Plan & Tactile Weights
          </span>
          <h1 className="text-3xl font-display font-extrabold text-neutral-900 tracking-tight">
            Interactive Graduation Road Map
          </h1>
          <p className="text-xs text-neutral-600 mt-0.5">
            Projected Conferral: <strong className="text-neutral-900 font-bold">{schedule.projectedGraduationTerm}</strong> |{' '}
            {auditResult.primaryProgram?.name}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToAudit}
            className="px-3.5 py-2 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition"
          >
            ← Back to Audit
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center space-x-2"
          >
            <FileDown className="w-4 h-4" />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export Official Degree Plan (.pdf)'}</span>
          </button>
        </div>
      </div>

      {/* Student Advising Profile & Graduation Benchmark Banner */}
      {(parsedTranscript?.studentMetadata?.name || schedule?.studentMetadata?.name) && (() => {
        const student = parsedTranscript?.studentMetadata || schedule?.studentMetadata || {};
        const effectiveConstraints = constraints || schedule?.constraints || auditResult?.constraints || {};
        const max8 = effectiveConstraints.max8wkCredits !== undefined ? effectiveConstraints.max8wkCredits : (effectiveConstraints.pacingMode === 'Part-Time' ? 6 : 9);
        const max16 = effectiveConstraints.max16wkCredits !== undefined ? effectiveConstraints.max16wkCredits : (effectiveConstraints.pacingMode === 'Part-Time' ? 11 : 18);
        const pacingCapText = `${effectiveConstraints.pacingMode || 'Full-Time'} (Max ${max8}cr 8-wk / ${max16}cr 16-wk)`;
        const modalityText = effectiveConstraints.modalityPreference || 'No Preference (Flexible)';
        const isSummerEnabled = effectiveConstraints.summerAvailability && effectiveConstraints.summerAvailability !== 'No Summer' && Number(effectiveConstraints.maxSummerCredits) !== 0;
        const maxSummer = Number(effectiveConstraints.maxSummerCredits) || 6;
        const summerText = isSummerEnabled ? `Summer: Available (Max ${maxSummer}cr)` : 'Summer: Not Available';

        const advisorDisplayName = student.advisor || (facultyProfile ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim() : 'Matthias Wood');
        const advisorDisplayEmail = student.email || facultyProfile?.email || 'mwood@lindenwood.edu';

        const catalogYearValue =
          propCatalogYear ||
          student.catalogYear ||
          auditResult?.primaryProgram?.catalog_year_id ||
          '2026-2027';

        const primaryProgramName =
          auditResult?.primaryProgram?.name ||
          student.programVersion ||
          (masterDb?.programs || []).find((p) => p.id === propSelectedProgramId)?.name ||
          'Undergraduate Degree';

        let degreeTitle = primaryProgramName;
        let emphasis = '';
        if (primaryProgramName.includes(' - ')) {
          const parts = primaryProgramName.split(' - ');
          degreeTitle = parts[0].trim();
          emphasis = parts.slice(1).join(' - ').trim();
        } else if (primaryProgramName.includes(' — ')) {
          const parts = primaryProgramName.split(' — ');
          degreeTitle = parts[0].trim();
          emphasis = parts.slice(1).join(' — ').trim();
        }

        const rawAdditionalList = [
          ...(propAdditionalPrograms || []),
          ...(student.declaredMinors || []),
          ...(student.concentrations || []),
          ...(student.additionalPrograms || []),
          ...(auditResult?.additionalPrograms || [])
        ];

        const allAdditionalPrograms = Array.from(
          new Set(
            rawAdditionalList
              .map((p) => (typeof p === 'string' ? p.trim() : p?.name?.trim() || ''))
              .filter(Boolean)
          )
        ).filter((prog) => {
          const lower = prog.toLowerCase();
          if (degreeTitle.toLowerCase().includes(lower)) return false;
          if (emphasis && emphasis.toLowerCase().includes(lower)) return false;
          return true;
        });

        return (
          <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              {/* Left Column (Student Identity & Academic Programs) */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Row 1 (Badges & Dates) */}
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FDFBF7] border border-[#B5A36A] text-xs font-bold text-neutral-900 shadow-2xs">
                    <span>🎓 Projected Graduation Date:</span>
                    <span className="font-mono text-neutral-900 font-extrabold">
                      {schedule.projectedGraduationTerm || 'May 2027'}
                    </span>
                  </div>
                  <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#857542]/10 text-[#857542] border border-[#857542]/20 text-xs font-semibold font-mono">
                    Catalog Year: {catalogYearValue}
                  </div>
                </div>

                {/* Row 2 (Student Name & ID) */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#857542]/10 border border-[#857542]/30 flex items-center justify-center font-bold text-[#857542] text-xs shrink-0">
                    {(student.name || 'Student')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h2 className="text-base font-bold text-neutral-900 tracking-tight truncate">
                      {student.name}
                    </h2>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono text-[11px] font-semibold">
                      ID: {student.studentId || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Row 3 (Degree Programs - Major & Minor) */}
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-neutral-800">
                    <span className="text-neutral-500 uppercase text-[10px] tracking-wider font-bold mr-1.5">
                      Major:
                    </span>
                    {degreeTitle}
                    {emphasis ? ` • ${emphasis}` : ''}
                  </p>
                  {allAdditionalPrograms.map((prog, idx) => {
                    const isCert = /cert/i.test(prog);
                    const label = isCert ? 'Certificate' : 'Minor';
                    return (
                      <p key={idx} className="text-xs font-semibold text-neutral-800">
                        <span className="text-neutral-500 uppercase text-[10px] tracking-wider font-bold mr-1.5">
                          {label}:
                        </span>
                        {prog}
                      </p>
                    );
                  })}
                </div>

                {/* Row 4 (Advising Metadata) */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 pt-1">
                  {advisorDisplayName && (
                    <span>
                      <strong className="text-neutral-700">Advisor Name:</strong> {advisorDisplayName}
                    </span>
                  )}
                  {advisorDisplayName && advisorDisplayEmail && <span className="text-neutral-300">•</span>}
                  {advisorDisplayEmail && (
                    <span>
                      <strong className="text-neutral-700">Advisor Email:</strong> {advisorDisplayEmail}
                    </span>
                  )}
                  {student.phone && <span className="text-neutral-300">•</span>}
                  {student.phone && (
                    <span>
                      <strong className="text-neutral-700">Phone:</strong> {student.phone}
                    </span>
                  )}
                  {(advisorDisplayName || advisorDisplayEmail || student.phone) && (
                    <span className="text-neutral-300">•</span>
                  )}
                  <span>
                    <strong className="text-neutral-700">Created On:</strong> {planCreationDate}
                  </span>
                </div>
              </div>

              {/* Right Column: Schedule Constraints Sub-Card */}
              <div className="w-full lg:w-80 flex-shrink-0 bg-neutral-50/90 border border-neutral-200/80 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                  <span>SCHEDULE CONSTRAINTS</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-mono text-[9px] font-bold lowercase">
                    active
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-0.5 text-neutral-600">
                    <span>Pacing Mode:</span>
                    <strong className="text-neutral-800 text-right truncate">{pacingCapText}</strong>
                  </div>
                  <div className="flex justify-between items-center py-0.5 text-neutral-600">
                    <span>Modality Preference:</span>
                    <strong className="text-neutral-800 text-right">{modalityText}</strong>
                  </div>
                  <div className="flex justify-between items-center py-0.5 text-neutral-600">
                    <span>Summer Availability:</span>
                    <strong className="text-neutral-800 text-right">{summerText}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tactile Flexibility Legend Bar */}
      <div className="bg-white p-3 rounded-lg border border-neutral-200 flex flex-wrap items-center justify-between text-xs gap-3 shadow-2xs">
        <span className="font-bold text-neutral-900">Tactile Course Flexibility Scale:</span>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-[#F0F9FF] border-l-4 border-[#0284C7] shadow-2xs" />
            <span className="font-bold text-[#0369A1]">1. Easily Movable (Blue)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-[#FFFBEB] border-l-4 border-[#D97706] shadow-2xs" />
            <span className="font-bold text-[#92400E]">2. Movable with Effort (Amber)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-sm bg-[#1E293B] border-l-4 border-[#0F172A] shadow-2xs" />
            <span className="font-bold text-[#0F172A]">3. Unmovable (Slate)</span>
          </div>
          <div className="flex items-center space-x-2 border-l border-neutral-200 pl-3">
            <span className="w-3.5 h-3.5 rounded-sm bg-neutral-100 border-l-4 border-neutral-400 shadow-2xs" />
            <span className="font-bold text-neutral-600">4. Enrolled / Locked (Grey)</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          AUDIT HEALTH RIBBON (Collapsible Historical Coursework & Transfers)
      ========================================================================= */}
      <div className="bg-[#F8F7F4] rounded-xl border border-neutral-200/90 shadow-2xs overflow-hidden transition">
        {/* Interactive Ribbon Header Bar */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isHistoryExpanded}
          aria-controls="historical-coursework-accordion"
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsHistoryExpanded(!isHistoryExpanded);
            }
          }}
          className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4 cursor-pointer hover:bg-neutral-100/70 select-none transition"
        >
          {/* Left: Verified Audit Health Metrics */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-1 rounded-md text-xs font-bold shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span>✓ {totalCompletedCredits.toFixed(1)} Completed Credits</span>
            </div>

            <span className="text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 px-2.5 py-1 rounded-md shadow-2xs">
              {completedCourseCount} Completed Courses
            </span>

            {transferCredits > 0 && (
              <span className="text-[11px] font-mono text-[#857542] bg-[#F7F5EE] border border-[#B5A36A]/40 px-2 py-0.5 rounded hidden md:inline-flex">
                {Math.round(transferCredits)}cr Transfer • {Math.round(institutionalCompletedCredits)}cr Institutional
              </span>
            )}

            <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 bg-neutral-200/70 px-2 py-0.5 rounded hidden lg:inline-block">
              Verified Academic Record
            </span>
          </div>

          {/* Right: Expand / Collapse Accordion Toggle */}
          <div className="flex items-center space-x-2 text-xs font-bold text-[#857542] hover:text-[#6E6035]">
            <span className="text-[11px]">
              {isHistoryExpanded ? 'Hide Past Coursework' : 'Show Past Coursework & Transfers'}
            </span>
            <div className="p-1 rounded bg-white border border-neutral-200 text-neutral-600 shadow-2xs transition-transform duration-200">
              {isHistoryExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Accordion Body */}
        <div
          id="historical-coursework-accordion"
          className={`px-4 pb-4 ${
            isHistoryExpanded || isExportingPdf
              ? 'block pt-3 border-t border-neutral-200/80 space-y-4'
              : 'hidden print:block print:pt-3 print:border-t print:border-neutral-200 print:space-y-4'
          }`}
        >
          {/* Top Full-Width Transfer & Equivalency Card */}
          {pastTransfers.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200/90 shadow-2xs overflow-hidden">
              {/* Transfer Card Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-neutral-50/80 border-b border-neutral-200 text-xs">
                <span className="font-bold text-neutral-800">
                  Transfers & Equivalencies • {Math.round(totalTransferCredits)}cr Total ({pastTransfers.length} {pastTransfers.length === 1 ? 'Course' : 'Courses'})
                </span>
                <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded">
                  External Transfer
                </span>
              </div>

              {/* Multi-Column Grid */}
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {pastTransfers.map((c, i) => (
                  <div
                    key={`${c.code || c.rawCourseCode}_${i}`}
                    className="flex items-center justify-between gap-2 py-1 px-2.5 rounded bg-neutral-50/60 hover:bg-neutral-100/70 border border-neutral-200/60 text-xs transition"
                  >
                    {/* Left: [TR] badge + Course Code + Truncated Title */}
                    <div className="flex items-center space-x-1.5 min-w-0 truncate">
                      <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex-shrink-0">
                        TR
                      </span>
                      <span className="font-mono font-bold text-neutral-800 flex-shrink-0">
                        {c.code || c.rawCourseCode}
                      </span>
                      <span
                        className="text-[11px] text-neutral-500 truncate"
                        title={`${c.title || c.name || ''}${c.geTag && !(c.title || c.name || '').includes(c.geTag) ? ` (${c.geTag})` : ''}`}
                      >
                        {c.title || c.name || ''}
                        {c.geTag && !(c.title || c.name || '').includes(c.geTag) ? ` (${c.geTag})` : ''}
                      </span>
                    </div>

                    {/* Right: Grade + Credits */}
                    <div className="flex items-center space-x-2 flex-shrink-0 text-[11px]">
                      <span className="font-mono font-bold text-neutral-700 bg-white border border-neutral-200 px-1.5 py-0.5 rounded text-[10px]">
                        {c.grade || 'TR'}
                      </span>
                      <span className="font-mono text-neutral-600 text-[11px] font-semibold">
                        {Math.round(c.credits || 3)}cr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Institutional Academic Year Blocks */}
          {academicYearsHistory.length > 0 ? (
            academicYearsHistory.map((ay) => (
              <div
                key={ay.key}
                className="bg-neutral-50/70 rounded-2xl border border-neutral-200/90 p-4 space-y-3.5 shadow-2xs"
              >
                {/* Academic Year Header Banner */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#857542]" />
                    <h3 className="text-sm font-bold text-neutral-900 tracking-wide uppercase">
                      {ay.label}
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#857542] bg-[#F7F5EE] px-2 py-0.5 rounded border border-[#B5A36A]">
                    {Math.round(ay.totalCredits)} cr Total
                  </span>
                </div>

                {/* Top 2-Column Grid: Left Column = Fall, Right Column = Spring */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
                  {ay.fall ? (
                    renderHistoricalSemesterCard(ay.fall)
                  ) : (
                    <div className="hidden md:block" />
                  )}
                  {ay.spring && renderHistoricalSemesterCard(ay.spring)}
                </div>

                {/* Below & Centered: Summer (Omitted entirely if 0 summer courses) */}
                {ay.summer && (
                  <div className="w-full md:w-3/5 mx-auto pt-1">
                    {renderHistoricalSemesterCard(ay.summer)}
                  </div>
                )}
              </div>
            ))
          ) : pastTransfers.length === 0 ? (
            <p className="text-xs text-neutral-500 italic p-3">No historical transcript records detected.</p>
          ) : null}
        </div>
      </div>

      {/* =========================================================================
          CONDITIONAL PENDING TRANSFERS ALERT BANNER (Screen 3 Top of Grid)
      ========================================================================= */}
      {incomingTransfers.length > 0 && (
        <div
          id="pending-transfers-alert-banner"
          className="bg-[#FFFBEB] border-l-4 border-amber-500 border-y border-r border-amber-200 rounded-xl p-4 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Pending External Transfers ({incomingTransfers.length}{' '}
                {incomingTransfers.length === 1 ? 'Course' : 'Courses'} •{' '}
                {incomingTransfers
                  .reduce((s, tr) => s + (Number(tr.credits) || 3), 0)
                  .toFixed(1)}{' '}
                Credits)
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold bg-white text-amber-900 px-2.5 py-0.5 rounded border border-amber-300">
              Articulation Pending
            </span>
          </div>

          <p className="text-xs text-amber-900/90 leading-relaxed mb-3">
            <strong>Advising Notice:</strong> The projected graduation schedule below assumes official receipt, transfer evaluation, and departmental articulation of these placeholder credits. Delays or adjustments in articulated credit may alter prerequisite eligibility and degree completion timing.
          </p>

          <div className="flex flex-wrap gap-2">
            {incomingTransfers.map((tr, i) => (
              <div
                key={`pending-tr-${i}`}
                className="bg-white px-3 py-2 rounded-lg border border-amber-300 text-xs shadow-2xs flex items-center space-x-2.5"
              >
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono font-bold text-neutral-900 text-[11px]">{tr.code}</span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                    {Number(tr.credits) || 3} cr
                  </span>
                </div>
                <span className="text-neutral-300">|</span>
                <span
                  className="text-[11px] text-neutral-700 font-medium truncate max-w-[200px]"
                  title={tr.title}
                >
                  {tr.title}
                </span>
                <span className="text-neutral-300">|</span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {tr.institution || 'External Institution'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          Interactive Active Grid (Fall Left, Spring Right, Summer Below & Centered)
      ========================================================================= */}
      <div className="space-y-6">
        <div>
          <span className="text-sm font-bold text-neutral-900 uppercase tracking-wide flex items-center space-x-1.5">
            <Calendar className="w-4 h-4 text-[#857542]" />
            <span>Interactive Academic Year Graduation Grid</span>
          </span>
          <p className="text-xs text-neutral-500 mt-0.5">
            Left Column: <strong>Fall</strong> (Fall-16wk, FA-I, FA-II) • Right Column: <strong>Spring</strong> (Spring-16wk, SP-I, SP-II) • Below & Centered: <strong>Summer</strong> (SU). Drag unlocked courses across sessions or click a course title to open the Course Inspector.
          </p>
        </div>

        {/* Academic Year Stack */}
        <div className="space-y-6 select-none">
          {academicYears.map((ay) => {
            const ayTotalCredits = ay.semesters.reduce((sum, s) => sum + s.totalCredits, 0);

            return (
              <div
                key={ay.key}
                className="bg-neutral-50/70 rounded-2xl border border-neutral-200/90 p-4 space-y-4 shadow-2xs"
              >
                {/* Academic Year Header Banner */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#857542]" />
                    <h3 className="text-sm font-bold text-neutral-900 tracking-wide uppercase">
                      {ay.label}
                    </h3>
                    <span className="text-xs text-neutral-500 font-semibold hidden sm:inline">
                      ({ay.fall ? ay.fall.title : `Fall ${ay.startYear}`}, {ay.spring ? ay.spring.title : `Spring ${ay.startYear + 1}`}, {ay.summer ? ay.summer.title : `Summer ${ay.startYear + 1}`})
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#857542] bg-[#F7F5EE] px-2 py-0.5 rounded border border-[#B5A36A]">
                    {ayTotalCredits} cr Total
                  </span>
                </div>

                {/* Top 2-Column Grid: Left Column = Fall, Right Column = Spring */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  {/* Left Column: Fall */}
                  {isTermInPast('Fall', ay.startYear, activeOrStartRank) ? (
                    renderPastConcludedSemesterCard(`Fall ${ay.startYear}`)
                  ) : ay.fall ? (
                    renderSemesterCard(ay.fall)
                  ) : (
                    <div className="bg-white/50 rounded-xl border border-dashed border-neutral-300 p-4 min-h-[160px] flex flex-col items-center justify-center text-center text-xs text-neutral-400">
                      <span className="font-bold text-neutral-600">Fall {ay.startYear}</span>
                      <span className="text-[11px] mt-0.5">Prior to Program Start</span>
                    </div>
                  )}

                  {/* Right Column: Spring */}
                  {isTermInPast('Spring', ay.startYear + 1, activeOrStartRank) ? (
                    renderPastConcludedSemesterCard(`Spring ${ay.startYear + 1}`)
                  ) : ay.spring ? (
                    renderSemesterCard(ay.spring)
                  ) : (
                    <div className="bg-white/50 rounded-xl border border-dashed border-neutral-300 p-4 min-h-[160px] flex flex-col items-center justify-center text-center text-xs text-neutral-400">
                      <span className="font-bold text-neutral-600">Spring {ay.startYear + 1}</span>
                      <span className="text-[11px] mt-0.5">No Courses Scheduled</span>
                    </div>
                  )}
                </div>

                {/* Below & Centered: Summer */}
                <div className="w-full lg:w-3/5 mx-auto pt-1">
                  {isTermInPast('Summer', ay.startYear + 1, activeOrStartRank) ? (
                    renderPastConcludedSemesterCard(`Summer ${ay.startYear + 1}`)
                  ) : ay.summer ? (
                    renderSemesterCard(ay.summer)
                  ) : (
                    <div className="bg-white/50 rounded-xl border border-dashed border-neutral-300 p-3 flex items-center justify-center text-center text-xs text-neutral-400">
                      <span className="font-bold text-neutral-600">Summer {ay.startYear + 1}: 0cr</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          WHAT-IF GRADUATION ACCELERATOR BANNER
      ========================================================================= */}
      <div className="bg-white rounded-xl border-2 border-[#857542] p-5 shadow-sm space-y-3" data-testid="what-if-accelerator-banner">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-neutral-900 font-bold text-sm">
            <Sparkles className="w-5 h-5 text-[#857542]" />
            <span>"What-If" Graduation Accelerator Banner</span>
          </div>
          <span className="text-[11px] font-semibold text-[#857542] bg-[#F7F5EE] px-2.5 py-0.5 rounded border border-[#B5A36A]">
            Baseline Conferral: {schedule.projectedGraduationTerm}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(schedule.whatIfSuggestions?.length > 0
            ? schedule.whatIfSuggestions.slice(0, 2)
            : [
                {
                  type: 'ENABLE_SUMMER',
                  title: 'Simulated Option 1: Enable Summer Session (6cr Cap)',
                  description: `Enabling Summer sessions distributes 8-week coursework across Summer terms. Current trajectory is already optimized for ${schedule.projectedGraduationTerm}.`,
                  projectedGraduationTerm: schedule.projectedGraduationTerm
                },
                {
                  type: 'INCREASE_LOAD',
                  title: 'Simulated Option 2: Accelerated 18cr / 16wk Pacing',
                  description: `Maximizing 16-week load to 18 credits (9 credits per 8-week session) maintains the earliest conferral date (${schedule.projectedGraduationTerm}).`,
                  projectedGraduationTerm: schedule.projectedGraduationTerm
                }
              ]
          ).map((sug, i) => (
            <div key={i} className="p-3.5 rounded-lg bg-[#F7F5EE] border border-[#B5A36A] text-xs flex flex-col justify-between">
              <div>
                <span className="font-bold text-neutral-950 block text-xs mb-1">{sug.title}</span>
                <p className="text-neutral-700 leading-relaxed">{sug.description}</p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#B5A36A]/40 flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#857542]">
                  Simulated Conferral: {sug.projectedGraduationTerm}
                </span>
                {onUpdateConstraints && (
                  <button
                    type="button"
                    onClick={() => {
                      if (sug.type === 'ENABLE_SUMMER') {
                        onUpdateConstraints({ includeSummer: true, maxCreditsSummer: 6 });
                      } else if (sug.type === 'INCREASE_LOAD') {
                        onUpdateConstraints({
                          pacingType: 'Full-Time',
                          maxCredits8Week: 9,
                          maxCredits16Week: 18
                        });
                      }
                    }}
                    className="px-2.5 py-1 bg-[#857542] hover:bg-[#6E6035] text-white text-[10px] font-bold rounded shadow-2xs transition"
                  >
                    Apply Simulation
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* =========================================================================
          NON-BLOCKING MOVE COURSE MODAL (Triggered by ⇄ button on card)
      ========================================================================= */}
      {movingCourseInfo && (
        <div
          data-testid="move-course-modal"
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-2xs"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
              <h3 className="text-sm font-bold text-neutral-900">
                Move Course: <span className="font-mono text-[#857542]">{movingCourseInfo.course.code}</span>
              </h3>
              <button
                type="button"
                onClick={() => setMovingCourseInfo(null)}
                className="text-neutral-400 hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">Target Semester</label>
                <select
                  value={movingCourseInfo.targetSemId}
                  onChange={(e) => {
                    const newTargetSemId = e.target.value;
                    const nextSem = schedule.semesters.find((s) => s.id === newTargetSemId);
                    let nextSlot = 'FA-I';
                    if (nextSem?.season === 'Summer') {
                      nextSlot = 'SU';
                    } else if (nextSem?.season === 'Spring') {
                      nextSlot = movingCourseInfo.sourceSlotKey?.includes('16wk')
                        ? 'Spring-16wk'
                        : movingCourseInfo.sourceSlotKey?.endsWith('-II')
                        ? 'SP-II'
                        : 'SP-I';
                    } else {
                      nextSlot = movingCourseInfo.sourceSlotKey?.includes('16wk')
                        ? 'Fall-16wk'
                        : movingCourseInfo.sourceSlotKey?.endsWith('-II')
                        ? 'FA-II'
                        : 'FA-I';
                    }
                    setMovingCourseInfo({
                      ...movingCourseInfo,
                      targetSemId: newTargetSemId,
                      targetSlotKey: nextSlot
                    });
                  }}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded bg-white font-semibold cursor-pointer"
                >
                  {schedule.semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.totalCredits}cr)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-neutral-700 mb-1">Target Session</label>
                <select
                  value={movingCourseInfo.targetSlotKey}
                  onChange={(e) =>
                    setMovingCourseInfo({ ...movingCourseInfo, targetSlotKey: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded bg-white font-semibold cursor-pointer"
                >
                  {(() => {
                    const sem = schedule.semesters.find((s) => s.id === movingCourseInfo.targetSemId);
                    if (sem?.season === 'Summer') {
                      return <option value="SU">SU • Summer 8-Week Session</option>;
                    }
                    if (sem?.season === 'Spring') {
                      return (
                        <>
                          <option value="Spring-16wk">Spring-16wk • Full Semester</option>
                          <option value="SP-I">SP-I • 1st 8-Week Session</option>
                          <option value="SP-II">SP-II • 2nd 8-Week Session</option>
                        </>
                      );
                    }
                    return (
                      <>
                        <option value="Fall-16wk">Fall-16wk • Full Semester</option>
                        <option value="FA-I">FA-I • 1st 8-Week Session</option>
                        <option value="FA-II">FA-II • 2nd 8-Week Session</option>
                      </>
                    );
                  })()}
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setMovingCourseInfo(null)}
                className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { course, sourceSemId, sourceSlotKey, targetSemId, targetSlotKey } = movingCourseInfo;
                  setMovingCourseInfo(null);
                  moveCourse(
                    course.code,
                    sourceSemId,
                    sourceSlotKey,
                    targetSemId,
                    targetSlotKey
                  );
                }}
                className="px-4 py-1.5 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition cursor-pointer"
              >
                Confirm Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          COURSE INSPECTOR MODAL / SLIDE-OVER DRAWER
      ========================================================================= */}
      <CourseDetailModal
        isOpen={Boolean(drawerCourse)}
        course={drawerCourse}
        onClose={() => setSelectedCourseForDrawer(null)}
        activeProgram={propSelectedProgramId || schedule?.programId || 'cybersecurity_bs_2026'}
        masterDb={masterDb}
        activeStudentCourses={rawCompletedCourses}
      />

      {/* Toast Feedback for Course Moves */}
      {moveFeedback && (
        <div
          data-testid="move-feedback-toast"
          className={`fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-lg shadow-lg border text-xs font-semibold backdrop-blur-md transition-all ${
            moveFeedback.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-300/50'
              : 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-emerald-300/50'
          }`}
        >
          {moveFeedback.type === 'warning' ? (
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          )}
          <span>{moveFeedback.message}</span>
          <button
            type="button"
            onClick={() => setMoveFeedback(null)}
            className="ml-2 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Sub-component: Stacked Semester Band
function SemesterBand({
  semId,
  slotKey,
  slotLabel,
  courses = [],
  totalCredits = 0,
  onOpenDrawer,
  onToggleLock,
  onMoveCourse,
  onPlanRetake,
  onCancelRetake,
  onDropCourse,
  onResolveConflict,
  masterDb
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.courseCode && data.sourceSemId && data.sourceSlotKey) {
          onDropCourse(data.courseCode, data.sourceSemId, data.sourceSlotKey, semId, slotKey);
        }
      }
    } catch (err) {
      console.warn('Drop error:', err);
    }
  };

  const is16Wk = slotKey.includes('16wk');
  const bandBadgeColor = is16Wk
    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
    : 'bg-[#F7F5EE] text-[#857542] border-[#B5A36A]';

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`semester-band-${semId}-${slotKey}`}
      className={`rounded-lg border p-2 transition space-y-1.5 ${
        isDragOver
          ? 'bg-amber-50/80 border-[var(--lu-gold-standard,#B5A36A)] ring-2 ring-[var(--lu-gold-standard,#B5A36A)]/40 shadow-xs'
          : 'bg-neutral-50/60 border-neutral-200 hover:border-neutral-300'
      }`}
    >
      {/* Band Header: Session name + credit total */}
      <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600 px-0.5">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${bandBadgeColor}`}>
          {slotLabel}
        </span>
        <span className="font-mono text-[10px] text-neutral-500 font-semibold">
          {totalCredits} cr
        </span>
      </div>

      {/* Course list */}
      <div className="space-y-1.5">
        {courses.map((course) => (
          <CourseCard
            key={course.code + (course.isPlannedRetake ? '_retake' : '')}
            course={course}
            semId={semId}
            slotKey={slotKey}
            masterDb={masterDb}
            onOpenDrawer={() => onOpenDrawer(course)}
            onToggleLock={() => onToggleLock(semId, slotKey, course.code)}
            onMoveCourse={() => onMoveCourse(course, semId, slotKey)}
            onPlanRetake={() => onPlanRetake && onPlanRetake(course, semId, slotKey)}
            onCancelRetake={() => onCancelRetake && onCancelRetake(course, semId, slotKey)}
            onResolveConflict={(actionType) =>
              onResolveConflict && onResolveConflict(semId, slotKey, course.code, actionType)
            }
          />
        ))}

        {/* Empty Drop Target Placeholder */}
        {courses.length === 0 && (
          <div
            className={`border border-dashed rounded-md p-2 text-center text-[10px] font-medium transition select-none flex items-center justify-center min-h-[36px] ${
              isDragOver
                ? 'border-[#857542] text-[#857542] bg-white font-bold'
                : 'border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-500'
            }`}
          >
            + Drag course here
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component: Compact 3-Row Course Card
function CourseCard({
  course,
  semId,
  slotKey,
  masterDb,
  onOpenDrawer,
  onToggleLock,
  onMoveCourse,
  onPlanRetake,
  onCancelRetake,
  onResolveConflict
}) {
  const [conflictMenuOpen, setConflictMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isEnrolled = Boolean(course.isCurrentEnrolled || course.state === 'Current' || course.state === 'Scheduled');
  const isPlaceholder = Boolean(
    course.type === 'placeholder' ||
    course.isPlaceholder ||
    course.code?.startsWith('REQ_') ||
    dbAdapter.isPlaceholder(course.code)
  );
  const tier = course.tactileWeight?.tier || (isPlaceholder ? 1 : 1);
  const isTier3 = tier === 3;
  const isTier2 = tier === 2;

  const bgStyle = isEnrolled
    ? 'bg-neutral-100 text-neutral-800 border-l-[4px] border-neutral-400'
    : isTier3
    ? 'bg-[#1E293B] text-white border-l-[4px] border-[#0F172A]'
    : isTier2
    ? 'bg-[#FFFBEB] text-[#92400E] border-l-[4px] border-[#D97706]'
    : 'bg-[#F0F9FF] text-[#0369A1] border-l-[4px] border-[#0284C7]';

  const categoryBadge = (() => {
    if (isEnrolled) return 'ENR';
    if (course.category === 'GE' || course.category === 'General Education') return 'GE';
    if (course.category === 'E' || course.category === 'Elective' || course.category === 'Free Elective') return 'E';
    if (course.category === 'M' || course.category === 'Major Core') return 'M';
    if (course.category === 'Em' || course.category === 'Emphasis') return 'Em';
    if (course.category === 'M/GE') return 'M/GE';
    if (course.placeholder_category === 'ge_bucket' || course.code?.startsWith('REQ_GE')) return 'GE';
    if (course.placeholder_category === 'elective_gap' || course.code?.startsWith('REQ_ELEC')) return 'E';
    return course.category || 'M';
  })();

  const offering = getCourseOfferingLabel(course, masterDb, slotKey);

  const handleDragStart = (e) => {
    if (course.locked) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', course.code);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        courseCode: course.code,
        sourceSemId: semId,
        sourceSlotKey: slotKey
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      draggable={!course.locked}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-testid={`course-card-${course.code}`}
      className={`p-2 rounded-md border border-neutral-200 ${bgStyle} shadow-2xs relative select-none group transition ${
        course.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing hover:shadow-xs'
      } ${isDragging ? 'opacity-50 ring-2 ring-[var(--lu-gold-standard,#B5A36A)]/50 scale-[0.98]' : 'opacity-100'}`}
    >
      {/* Row 1: Category badge + Code + Credits + Lock Toggle + Move */}
      <div className="flex items-center justify-between text-xs font-bold leading-tight">
        <div className="flex items-center space-x-1 truncate">
          <span
            className={`px-1 py-0.2 rounded text-[9px] font-bold ${
              isEnrolled
                ? 'bg-neutral-200 text-neutral-700'
                : isTier3
                ? 'bg-neutral-800 text-white'
                : 'bg-white/80 text-black'
            }`}
          >
            [{categoryBadge}]
          </span>
          {course.isPlannedRetake && (
            <span
              data-testid={`retake-badge-${course.code}`}
              className="px-1 py-0.2 rounded text-[8.5px] font-bold bg-slate-200 text-slate-800 border border-slate-300 tracking-tight select-none"
              title={`Planned retake of active course from ${course.retakeOfTerm || 'previous term'}`}
            >
              Retake
            </span>
          )}
          <span className="font-mono text-[11px] font-bold tracking-tight truncate">
            {course.code}
          </span>
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className="font-mono text-[10px]">{course.credits}cr</span>

          {/* Plan Retake Context Action for Active In-Progress Courses */}
          {isEnrolled && (
            course.hasPlannedRetake ? (
              <div className="flex items-center space-x-1">
                <span
                  data-testid={`retake-planned-badge-${course.code}`}
                  className="px-1 py-0.5 rounded text-[8.5px] font-bold bg-neutral-200 text-neutral-800 border border-neutral-300 select-none"
                  title={`Planned retake in ${course.retakeTargetSemId || 'future term'}`}
                >
                  Retake Planned
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onCancelRetake) onCancelRetake();
                  }}
                  data-testid={`cancel-retake-btn-${course.code}`}
                  className="text-[9px] font-bold text-neutral-400 hover:text-red-600 px-0.5 rounded hover:bg-black/5 transition cursor-pointer"
                  title="Cancel planned retake"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPlanRetake) onPlanRetake();
                }}
                data-testid={`plan-retake-btn-${course.code}`}
                className="px-1.5 py-0.5 rounded text-[8.5px] font-bold text-neutral-700 bg-neutral-200/90 hover:bg-neutral-300 border border-neutral-300 transition cursor-pointer"
                title="Plan a retake of this in-progress course in a future term"
              >
                Plan Retake
              </button>
            )
          )}

          <button
            type="button"
            onClick={onToggleLock}
            data-testid={`lock-btn-${course.code}`}
            className="p-0.5 rounded hover:bg-black/10 transition"
            title={
              course.locked
                ? isEnrolled
                  ? 'Currently Enrolled (Locked). Click to unlock.'
                  : 'Course Locked (Click to Unlock)'
                : 'Course Unlocked (Click to Lock)'
            }
          >
            {course.locked ? (
              <Lock className={`w-3 h-3 ${isEnrolled ? 'text-neutral-500' : 'text-amber-500'}`} />
            ) : (
              <Unlock className="w-3 h-3 opacity-40 group-hover:opacity-100" />
            )}
          </button>
          <button
            type="button"
            onClick={onMoveCourse}
            data-testid={`move-btn-${course.code}`}
            className="p-0.5 rounded text-[10px] hover:bg-black/10 font-bold transition opacity-60 group-hover:opacity-100"
            title="Move course to another term/session"
          >
            ⇄
          </button>
        </div>
      </div>

      {/* Row 2: Course Title (Clickable to open Drawer) */}
      <div
        onClick={onOpenDrawer}
        className="font-bold text-[11px] truncate cursor-pointer hover:underline mt-1 leading-snug"
        title={course.title}
      >
        {course.title}
      </div>

      {/* Row 3: Pre-reqs (Left) + Offering Status (Right) */}
      <div className="text-[9px] opacity-85 mt-1 flex items-center justify-between gap-1 leading-none">
        <span className="truncate max-w-[120px]" title={course.prereq_display || 'None'}>
          Pre: {course.prereq_display || 'None'}
        </span>

        {/* Database Offering / Enrolled Badge */}
        {course.conflictResolution ? (
          <span className="px-1 py-0.5 rounded text-[8.5px] font-bold bg-[#F7F5EE] text-[#857542] border border-[#B5A36A]">
            {course.conflictResolution}
          </span>
        ) : isEnrolled ? (
          <span
            className="px-1 py-0.5 rounded text-[8.5px] font-semibold bg-neutral-200 text-neutral-700 border border-neutral-300"
            title="Currently Enrolled in active academic term"
          >
            {course.enrolledStatus || (course.state === 'Scheduled' ? 'Enrolled (Scheduled)' : 'Enrolled (In Progress)')}
          </span>
        ) : (
          <span
            className={`px-1 py-0.5 rounded text-[8.5px] font-semibold truncate max-w-[155px] ${
              offering.type === 'placeholder'
                ? 'bg-neutral-200/70 text-neutral-700'
                : offering.type === 'unknown'
                ? 'bg-amber-200/80 text-amber-900 border border-amber-300'
                : offering.isOffSession
                ? 'bg-red-200 text-red-900 font-bold border border-red-300'
                : 'bg-emerald-100 text-emerald-800'
            }`}
            title={offering.text}
          >
            {offering.isOffSession ? `Off-Session (${offering.formatted})` : offering.text}
          </span>
        )}
      </div>

      {/* Conflict Notification Dot if move conflict */}
      {course.conflict && (
        <>
          <button
            type="button"
            onClick={() => setConflictMenuOpen(!conflictMenuOpen)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#DC2626] text-white flex items-center justify-center font-bold text-[10px] shadow-md cursor-pointer animate-pulse"
            title={`Conflict: ${course.conflict.message} (Click to resolve via * Tentative DB or Policy Exception)`}
          >
            !
          </button>
          {conflictMenuOpen && (
            <div className="mt-2 p-2 rounded bg-white text-neutral-900 border border-red-300 shadow-lg text-[10px] space-y-1.5 z-20 relative">
              <p className="font-bold text-red-700 leading-snug">{course.conflict.message}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setConflictMenuOpen(false);
                    onResolveConflict && onResolveConflict('TENTATIVE');
                  }}
                  className="px-2 py-0.5 bg-[#F7F5EE] border border-[#B5A36A] text-[#857542] font-bold rounded hover:bg-[#B5A36A]/20"
                >
                  Save DB (* Tentative)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConflictMenuOpen(false);
                    onResolveConflict && onResolveConflict('PE');
                  }}
                  className="px-2 py-0.5 bg-red-600 text-white font-bold rounded hover:bg-red-700"
                >
                  Log Policy Exception (PE)
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Sub-component: Semester Footer (Registration date banner, dynamic overload/grad badges & ordered notes)
function SemesterFooter({
  sem,
  addingNoteSemId,
  newNoteText,
  setNewNoteText,
  setAddingNoteSemId,
  editingNoteInfo,
  setEditingNoteInfo,
  onAddNote,
  onSaveEditedNote,
  onReorderNote,
  onDeleteNote
}) {
  const isOverload = (sem.totalCredits || 0) > 18;
  const hasOverloadNoteInArray = (sem.notes || []).some((n) =>
    (n.text || '').toLowerCase().includes('overload')
  );

  return (
    <div className="pt-2 border-t border-neutral-100 space-y-1.5 text-xs">
      {/* Priority Registration Opening Date Callout */}
      {sem.registrationNotice?.bannerText && (
        <div className="p-2 rounded bg-neutral-100 text-neutral-800 text-[11px] font-bold flex items-center space-x-2">
          <Calendar className="w-3.5 h-3.5 text-[#857542]" />
          <span>📅 {sem.registrationNotice.bannerText}</span>
        </div>
      )}

      {/* Graduation Deadline Notice if present */}
      {sem.graduationDeadlineNotice && (
        <div className="p-2 rounded bg-amber-50 text-amber-950 border border-amber-200 text-[11px] font-bold">
          🎓 {sem.graduationDeadlineNotice}
        </div>
      )}

      {/* Dynamic Petition for Academic Course Overload if semester > 18 credits */}
      {isOverload && !hasOverloadNoteInArray && (
        <div className="p-2 rounded bg-red-50 text-red-900 border border-red-200 text-[11px] font-bold">
          ⚠️ Petition for Academic Course Overload Required ({sem.totalCredits}cr exceeds 18cr standard maximum)
        </div>
      )}

      {/* Inline Add Note Form */}
      {addingNoteSemId === sem.id && (
        <div className="p-2 rounded bg-[#F7F5EE] border border-[#B5A36A] space-y-1.5">
          <input
            type="text"
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Enter advisor or registration note..."
            className="w-full px-2 py-1 text-[11px] bg-white border border-neutral-300 rounded"
          />
          <div className="flex justify-end space-x-1.5">
            <button
              type="button"
              onClick={() => setAddingNoteSemId(null)}
              className="px-2 py-0.5 text-[10px] font-bold text-neutral-600 border border-neutral-300 rounded bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onAddNote(newNoteText)}
              className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-[#857542] rounded"
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      {/* Reorderable (⠿), Editable (✏️), and Deletable (🗑️) Notes List */}
      {(sem.notes || []).length > 0 && (
        <div className="space-y-1 pt-1">
          {sem.notes.map((note, idx) => {
            const isEditing =
              editingNoteInfo &&
              editingNoteInfo.semId === sem.id &&
              editingNoteInfo.noteId === note.id;

            return (
              <div
                key={note.id}
                className={`p-1.5 rounded flex items-start justify-between text-[11px] ${
                  note.type === 'auto'
                    ? 'bg-red-50 text-red-900 border border-red-200'
                    : 'bg-neutral-50 text-neutral-700 border border-neutral-200'
                }`}
              >
                <div className="flex items-start space-x-1.5 flex-1 pr-1 leading-snug">
                  <button
                    type="button"
                    onClick={() =>
                      onReorderNote &&
                      onReorderNote(sem.id, note.id, idx > 0 ? 'up' : 'down')
                    }
                    className="text-neutral-400 hover:text-neutral-700 font-mono text-xs cursor-grab select-none mt-0.5"
                    title="Reorder Note (⠿)"
                  >
                    ⠿
                  </button>
                  <div className="flex-1">
                    <span className="font-bold uppercase text-[9px] text-[#857542] block">
                      [{note.category || 'Note'}]
                    </span>
                    {isEditing ? (
                      <div className="flex items-center space-x-1 mt-1">
                        <input
                          type="text"
                          value={editingNoteInfo.text}
                          onChange={(e) =>
                            setEditingNoteInfo({ ...editingNoteInfo, text: e.target.value })
                          }
                          className="flex-1 px-1.5 py-0.5 text-[11px] bg-white border border-[#857542] rounded"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onSaveEditedNote(sem.id, note.id, editingNoteInfo.text)
                          }
                          className="px-1.5 py-0.5 bg-[#857542] text-white text-[10px] font-bold rounded"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <span>{note.text}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingNoteInfo({ semId: sem.id, noteId: note.id, text: note.text })
                    }
                    className="text-neutral-400 hover:text-[#857542] text-[10px]"
                    title="Edit Note (✏️)"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(note.id)}
                    className="text-neutral-400 hover:text-red-600 text-[10px]"
                    title="Delete Note (🗑️)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
