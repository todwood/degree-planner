/**
 * Degree Planner Deterministic Core
 * Retake Deduplication & Course Repeatability Engine (src/engine/retakeDeduplication.js)
 *
 * Enforces Lindenwood institutional retake policies and catalog repeatability ceilings:
 * - Repeatable courses (e.g. ensembles, practicums, topics) earn credit across multiple distinct
 *   attempts up to max_repeat_credits.
 * - Non-repeatable courses allow at most one credit-earning attempt, keeping the highest/best attempt
 *   and superseding inferior attempts.
 * - Cross-file duplicate rows (Anthology spreadsheet + Unofficial Transcript PDF) for the same attempt
 *   are collapsed deterministically without consuming repeat credit capacity.
 */

export const GRADE_RANK = {
  'A+': 12.2,
  'AH': 12.1,
  'A': 12,
  'TR-A': 12,
  'TA': 12,
  'A-': 11,
  'B+': 10,
  'BH': 9.1,
  'B': 9,
  'TR-B': 9,
  'TB': 9,
  'B-': 8,
  'C+': 7,
  'CH': 6.1,
  'C': 6,
  'TR-C': 6,
  'TC': 6,
  'TR-P': 5,
  'P': 5,
  'CR': 5,
  'S': 5,
  'TR': 5,
  'C-': 4,
  'D+': 3,
  'DH': 2.1,
  'D': 2,
  'TR-D': 2,
  'TD': 2,
  'D-': 1,
  'IP': 0.5,
  'CURRENT': 0.5,
  'SCHEDULED': 0.2
};

export const GRADE_POINTS = {
  'A+': 4.0,
  'AH': 4.0,
  'A': 4.0,
  'A-': 3.7,
  'B+': 3.3,
  'BH': 3.0,
  'B': 3.0,
  'B-': 2.7,
  'C+': 2.3,
  'CH': 2.0,
  'C': 2.0,
  'C-': 1.7,
  'D+': 1.3,
  'DH': 1.0,
  'D': 1.0,
  'D-': 0.7,
  'F': 0.0,
  'AF': 0.0,
  'WF': 0.0
};

/**
 * Parses repeatability flag and optional credit ceiling from catalog description text.
 * Captures standard Lindenwood Acalog phrasing:
 * - "Repeatable: May be repeated for a maximum of 6 credit hours."
 * - "Repeatable for a maximum of 4 credit hours."
 * - "May be repeated for credit for up to 12 credit hours."
 * - "Repeatable: May be repeated for credit."
 */
export function parseRepeatability(descText) {
  if (!descText) return { repeatable: false, max_repeat_credits: null };

  let repeatable = false;
  let max_repeat_credits = null;

  // 1. Detect credit ceiling from standard catalog variations:
  const ceilingMatch = descText.match(
    /(?:may be repeated|repeatable)(?:[^\.\n]*?)(?:for a maximum of|up to|maximum of)\s*(\d+)\s*(?:credit\s*hours?|hours?|credits?)/i
  );

  if (ceilingMatch) {
    repeatable = true;
    max_repeat_credits = parseInt(ceilingMatch[1], 10);
    return { repeatable, max_repeat_credits };
  }

  // 2. Detect boolean repeatability without an explicit credit ceiling:
  if (/(?:repeatable:\s*may be repeated|may be repeated for credit|repeatable for credit|repeatable)/i.test(descText)) {
    repeatable = true;
  }

  return { repeatable, max_repeat_credits };
}

/**
 * Standard comparator for course row priority:
 * State (Completed/TR > Current > Scheduled > Excluded) -> Grade quality -> Lindenwood residency tiebreak -> Latest start date.
 */
export function defaultCompareRows(a, b) {
  const getRowPriorityTuple = (item) => {
    const statePrio =
      item.state === 'Completed' || item.state === 'TR'
        ? 400
        : item.state === 'Current'
        ? 300
        : item.state === 'Scheduled'
        ? 200
        : 100;
    const gradePrio =
      GRADE_RANK[item.grade] ??
      (item.state === 'Current' ? 0.5 : item.state === 'Scheduled' ? 0.2 : 0);
    const luTiebreak = item.state === 'Completed' ? 1 : 0;
    const dateStr = item.startDate || '';
    return { statePrio, gradePrio, luTiebreak, dateStr };
  };

  const ka = getRowPriorityTuple(a);
  const kb = getRowPriorityTuple(b);
  if (kb.statePrio !== ka.statePrio) return kb.statePrio - ka.statePrio;
  if (kb.gradePrio !== ka.gradePrio) return kb.gradePrio - ka.gradePrio;
  if (kb.luTiebreak !== ka.luTiebreak) return kb.luTiebreak - ka.luTiebreak;
  return kb.dateStr.localeCompare(ka.dateStr);
}

/**
 * Chronological attempt comparator for repeatable course enrollments:
 * Earliest term sortKey first -> Earliest start date -> Higher grade/rank tiebreak.
 */
export function compareAttemptsChronological(a, b) {
  const skA = a.termInfo?.sortKey ?? 999999;
  const skB = b.termInfo?.sortKey ?? 999999;
  if (skA !== skB) {
    return skA - skB;
  }
  const dateA = a.startDate || '';
  const dateB = b.startDate || '';
  if (dateA && dateB && dateA !== dateB) {
    return dateA.localeCompare(dateB);
  }
  const rankA = GRADE_RANK[a.grade] ?? 0;
  const rankB = GRADE_RANK[b.grade] ?? 0;
  return rankB - rankA;
}

/**
 * Derives a term/enrollment signature to distinguish discrete attempt sessions.
 */
export function getAttemptSignature(r) {
  if (r.termInfo && !r.termInfo.isBlank) {
    if (r.termInfo.year && r.termInfo.season) {
      const session = r.termInfo.session ? `_${r.termInfo.session}` : '';
      return `${r.termInfo.year}_${r.termInfo.season}${session}`;
    }
    if (r.termInfo.isTransfer) {
      return `TRANSFER_${r.grade || ''}_${r.credits || ''}`;
    }
  }
  if (r.startDate) {
    return r.startDate;
  }
  if (r.term) {
    return String(r.term).trim().toUpperCase();
  }
  return 'ATTEMPT_UNKNOWN';
}

/**
 * Deduplicates course attempts for a single course group (same compactCode).
 *
 * @param {Array} group - Array of parsed course record objects sharing the same compact code
 * @param {Object|null} catalogCourse - Course definition from master curriculum database
 * @param {Object} options - Configuration options (compareRows, referenceYear, isTransferPlaceholder)
 * @returns {Object} { validCourses, excludedCourses, harvestedOfferings }
 */
export function deduplicateCourseAttempts(group, catalogCourse = null, options = {}) {
  if (!group || group.length === 0) {
    return { validCourses: [], excludedCourses: [], harvestedOfferings: [] };
  }

  const compareRows = options.compareRows || defaultCompareRows;
  const isTransferPlaceholder = options.isTransferPlaceholder || (() => false);
  const referenceYear = options.referenceYear || 2026;

  // Determine repeatability & credit cap
  const isRepeatable = Boolean(
    catalogCourse?.repeatable ||
    group.some((r) => r.repeatable)
  );

  const maxRepeatCredits =
    catalogCourse?.max_repeat_credits !== undefined && catalogCourse?.max_repeat_credits !== null
      ? catalogCourse.max_repeat_credits
      : (group.find((r) => r.max_repeat_credits !== undefined && r.max_repeat_credits !== null)?.max_repeat_credits ?? null);

  const validCourses = [];
  const excludedCourses = [];
  const harvestedOfferings = [];

  // ==========================================
  // CASE 1: NON-REPEATABLE COURSE
  // Standard single-winner deduplication
  // ==========================================
  if (!isRepeatable) {
    const mergedAreas = [];
    for (const g of group) {
      if (g.areaOfStudy && !mergedAreas.includes(g.areaOfStudy)) {
        mergedAreas.push(g.areaOfStudy);
      }
    }
    const mergedAreaStr = mergedAreas.join('; ');

    const sortedGroup = [...group].sort(compareRows);
    const winner = {
      ...sortedGroup[0],
      areaOfStudy: mergedAreaStr || sortedGroup[0].areaOfStudy || '',
      isRetake: false
    };

    if (winner.state !== 'Excluded') {
      validCourses.push(winner);

      // Passive 2-year harvester check (restricted to Anthology exports per Section 2.3)
      if (
        !winner.fromTranscriptPdf &&
        (winner.state === 'Completed' || winner.state === 'Current') &&
        !winner.termInfo?.isTransfer &&
        winner.termInfo?.year &&
        winner.termInfo.year >= referenceYear - 2
      ) {
        harvestedOfferings.push({
          code: winner.code,
          compactCode: winner.compactCode,
          title: winner.title,
          session: winner.termInfo.session,
          modality: winner.modality,
          grade: winner.grade,
          gradePoints: GRADE_POINTS[winner.grade] ?? null,
          year: winner.termInfo.year
        });
      }

      for (let i = 1; i < sortedGroup.length; i++) {
        const other = sortedGroup[i];
        if (other.isUnscheduledFuture) continue;
        if (isTransferPlaceholder(other)) continue;

        const reason =
          other.state !== 'Excluded'
            ? `Excluded: Repeat / Retake (Superseded by ${winner.grade || winner.state})`
            : other.excludeReason || 'Excluded: Repeat / Retake';

        excludedCourses.push({
          ...other,
          isRetake: true,
          excludeReason: other.excludeReason || 'REPEATED_ATTEMPT',
          reason
        });
      }
    } else {
      for (const item of sortedGroup) {
        if (item.isUnscheduledFuture) continue;
        excludedCourses.push({
          ...item,
          isRetake: item.isRetake ?? false,
          reason: item.excludeReason || 'Excluded Course'
        });
      }
    }

    return { validCourses, excludedCourses, harvestedOfferings };
  }

  // ==========================================
  // CASE 2: REPEATABLE COURSE
  // Multi-attempt accumulation up to ceiling
  // ==========================================

  // Step 1: Sub-group rows by discrete attempt signature
  // Duplicate rows across Anthology and PDF for the same enrollment merge into 1 attempt
  const attemptBuckets = new Map();
  const srcOccurrences = { anth: {}, pdf: {} };

  for (const r of group) {
    const src = r.fromTranscriptPdf ? 'pdf' : 'anth';
    const sig = getAttemptSignature(r);
    const occ = (srcOccurrences[src][sig] = (srcOccurrences[src][sig] || 0) + 1);
    const key = `${sig}_#${occ}`;
    if (!attemptBuckets.has(key)) {
      attemptBuckets.set(key, []);
    }
    attemptBuckets.get(key).push(r);
  }

  const distinctAttempts = [];
  for (const bucket of attemptBuckets.values()) {
    const mergedAreas = [];
    for (const g of bucket) {
      if (g.areaOfStudy && !mergedAreas.includes(g.areaOfStudy)) {
        mergedAreas.push(g.areaOfStudy);
      }
    }
    const sortedBucket = [...bucket].sort(compareRows);
    distinctAttempts.push({
      ...sortedBucket[0],
      areaOfStudy: mergedAreas.join('; ') || sortedBucket[0].areaOfStudy || ''
    });
  }

  // Step 2: Sort attempts chronologically
  distinctAttempts.sort(compareAttemptsChronological);

  // Step 3: Track cumulative earned credits
  let cumulativeEarnedCredits = 0;

  for (const attempt of distinctAttempts) {
    if (attempt.isUnscheduledFuture) {
      continue;
    }

    if (attempt.state === 'Excluded') {
      excludedCourses.push({
        ...attempt,
        isRetake: false,
        reason: attempt.excludeReason || 'Excluded Course'
      });
      continue;
    }

    const attemptCredits = Number(attempt.credits) || 0;
    const hasCap = maxRepeatCredits !== null && maxRepeatCredits !== undefined;
    const wouldExceed = hasCap && cumulativeEarnedCredits + attemptCredits > maxRepeatCredits;

    if (!wouldExceed) {
      const validItem = {
        ...attempt,
        isRetake: false,
        excluded: false,
        excludeReason: null
      };
      validCourses.push(validItem);
      cumulativeEarnedCredits += attemptCredits;

      if (
        !validItem.fromTranscriptPdf &&
        (validItem.state === 'Completed' || validItem.state === 'Current') &&
        !validItem.termInfo?.isTransfer &&
        validItem.termInfo?.year &&
        validItem.termInfo.year >= referenceYear - 2
      ) {
        harvestedOfferings.push({
          code: validItem.code,
          compactCode: validItem.compactCode,
          title: validItem.title,
          session: validItem.termInfo.session,
          modality: validItem.modality,
          grade: validItem.grade,
          gradePoints: GRADE_POINTS[validItem.grade] ?? null,
          year: validItem.termInfo.year
        });
      }
    } else {
      excludedCourses.push({
        ...attempt,
        isRetake: true,
        state: 'Excluded',
        excludeReason: 'REPEATED_ATTEMPT',
        reason: 'Excluded: Repeat / Retake - REPEATED_ATTEMPT'
      });
    }
  }

  return { validCourses, excludedCourses, harvestedOfferings };
}

/**
 * Groups and deduplicates all parsed course rows across the entire student record.
 *
 * @param {Array} parsedRows - Array of normalized course record objects
 * @param {Object} options - Master database, reference year, and placeholder helper
 * @returns {Object} { validCourses, excludedCourses, harvestedOfferings }
 */
export function processRetakeDeduplication(parsedRows, options = {}) {
  const masterDb = options.masterDb || options.catalogDb || null;
  const referenceYear = options.referenceYear || 2026;
  const isTransferPlaceholder = options.isTransferPlaceholder || (() => null);

  const courseMap = new Map();
  if (masterDb && Array.isArray(masterDb.courses)) {
    for (const c of masterDb.courses) {
      const compact = (c.compactCode || c.code || '').replace(/[\s\-]+/g, '').toUpperCase();
      if (compact) courseMap.set(compact, c);
    }
  }

  const sourceOccurrences = { anth: {}, pdf: {} };
  const groupedByCompact = new Map();

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const placeholderMeta = isTransferPlaceholder(r);

    let groupKey = r.compactCode;
    if (placeholderMeta?.allowMultipleInstances) {
      const src = r.fromTranscriptPdf ? 'pdf' : 'anth';
      const sig = `${r.compactCode}_${r.term || 'TR'}_${r.grade || ''}_${r.credits || ''}`;
      const occ = (sourceOccurrences[src][sig] = (sourceOccurrences[src][sig] || 0) + 1);
      groupKey = `${sig}_${occ}`;
    }

    if (!groupedByCompact.has(groupKey)) {
      groupedByCompact.set(groupKey, []);
    }
    groupedByCompact.get(groupKey).push(r);
  }

  const validCourses = [];
  const excludedCourses = [];
  const harvestedOfferings = [];

  for (const [key, group] of groupedByCompact.entries()) {
    const catalogCourse = courseMap.get(group[0]?.compactCode || key);
    const result = deduplicateCourseAttempts(group, catalogCourse, {
      ...options,
      referenceYear,
      isTransferPlaceholder
    });
    validCourses.push(...result.validCourses);
    excludedCourses.push(...result.excludedCourses);
    harvestedOfferings.push(...result.harvestedOfferings);
  }

  return { validCourses, excludedCourses, harvestedOfferings };
}
