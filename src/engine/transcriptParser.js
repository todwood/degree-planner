/**
 * Degree Planner Deterministic Core
 * Client-Side File Parser & Passive 2-Year Harvester (src/engine/transcriptParser.js)
 *
 * FERPA Non-Negotiable:
 * - Processes 100% of student files (Anthology .csv/.xlsx, Unofficial Transcript .pdf,
 *   Returning Student Plan .pdf) locally in browser memory.
 * - Zero student PII or course history is ever sent to any external server.
 */

import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';

/**
 * Standard 20 Anthology "Student Course Schedules (All Results)" column headers
 * (per directives/ExtractAnthologyFile.md Section 1.1).
 */
export const STANDARD_ANTHOLOGY_HEADERS = [
  'Course Code',
  'Course Name',
  'Published Code',
  'Section',
  'Term',
  'Course Status',
  'Letter Grade',
  'Start Date',
  'Instructor',
  'Credits',
  'Hours',
  'Campus',
  'Enroll Status Credits',
  'Enroll Status Hours',
  'Area of Study',
  'Payment Period',
  'Delivery Method',
  'Points',
  'SPE Progression',
  'Enrollment'
];

/**
 * Essential Anthology columns required for deterministic degree auditing & scheduling
 * (per directives/ExtractAnthologyFile.md Section 2.1).
 */
export const ESSENTIAL_ANTHOLOGY_HEADERS = [
  'Course Code',
  'Course Name',
  'Published Code',
  'Term',
  'Course Status',
  'Letter Grade',
  'Start Date',
  'Credits',
  'Area of Study',
  'Delivery Method',
  'Enrollment'
];

const WEEKDAY_NAMES = new Set([
  'day',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
]);

const PUBLISHED_CODE_PATTERN = /^([A-Z]{2,5})\s*(\d{4,5}[A-Z]?)$/i;
const INLINE_GE_TAG_REGEX = /\((GE-[^)]+)\)/gi;

const KNOWN_NON_STANDARD_CREDITS = {
  ICS32300: 5.0,
  ICS32301: 1.0,
  ICS32400: 5.0,
  ICS32401: 1.0,
  ICS32500: 5.0,
  ICS32501: 1.0,
  ICS32600: 5.0,
  ICS32601: 1.0,
  MTH27100: 5.0,
  MTH27200: 5.0,
  BSC10000: 4.0,
  ESC10000: 4.0,
  CHM10000: 4.0,
  EPP10500: 6.0,
  UNIV10100: 1.0,
  UNIV10101: 1.0,
  UNIV10102: 1.0,
  UNIV18205: 1.0
};

/**
 * Deterministic Credit Inference for Current (0.00 / No Grade) Transcript Rows
 * per directives/ExtractTranscriptFile.md Section 3.1.
 */
export function inferCurrentCourseCredits(publishedCode, courseName = '', masterDb = null) {
  const cleanCode = String(publishedCode || '')
    .toUpperCase()
    .replace(/[\s\-]+/g, '');
  if (masterDb && Array.isArray(masterDb.courses)) {
    const found = masterDb.courses.find(
      (c) =>
        String(c.code || '')
          .toUpperCase()
          .replace(/[\s\-]+/g, '') === cleanCode
    );
    if (found && typeof found.credits === 'number') {
      return found.credits;
    }
  }
  if (Object.prototype.hasOwnProperty.call(KNOWN_NON_STANDARD_CREDITS, cleanCode)) {
    return KNOWN_NON_STANDARD_CREDITS[cleanCode];
  }
  if (/^UNIV1/i.test(cleanCode) || /(?:32301|32401|32501|32601)$/.test(cleanCode)) {
    return 1.0;
  }
  if (/^ICS(?:32300|32400|32500|32600)$/i.test(cleanCode)) {
    return 5.0;
  }
  if (/NatSciLec\/Lab/i.test(courseName || '')) {
    return 4.0;
  }
  return 3.0;
}

/**
 * Normalize minor catalog punctuation typos in parenthetical GE tags
 * per directives/ExtractTranscriptFile.md Section 2.2.2:
 * e.g. GE(-HC:Phl), (GE-HC: Phi), (GE-HC: Phl) -> (GE-HC:Phl)
 */
export function normalizeGeTagTypos(title) {
  return String(title || '')
    .replace(/\bGE\(-HC:/gi, '(GE-HC:')
    .replace(/\(GE-HC:\s*Phi\)/gi, '(GE-HC:Phl)')
    .replace(/\(GE-HC:\s*Phl\)/gi, '(GE-HC:Phl)')
    .replace(/\(GE-HC:\s+/gi, '(GE-HC:');
}

/**
 * Strip transcript retake/footnote markers (**, R*, *, #, +) from a letter grade
 * per directives/ExtractTranscriptFile.md Section 3.2 & Section 4.
 */
export function normalizeTranscriptGrade(rawGrade) {
  if (rawGrade === null || rawGrade === undefined) {
    return { cleanGrade: '', isRetakeFlagged: false, rawGrade: '' };
  }
  const raw = String(rawGrade).trim().toUpperCase();
  if (!raw) {
    return { cleanGrade: '', isRetakeFlagged: false, rawGrade: '' };
  }
  const isRetakeFlagged = /\*\*|R\*/i.test(raw);
  const cleaned = raw.replace(/(?:R\*|\*{1,2}|#|\+)+$/g, '').trim();
  return {
    cleanGrade: cleaned || raw,
    isRetakeFlagged,
    rawGrade: raw
  };
}

/**
 * Normalize transcript Term header into canonical uppercase SEASON_YY or TRANSFER_TERM
 * per directives/ExtractTranscriptFile.md Section 2.3.
 */
export function normalizeTranscriptTerm(rawTermStr) {
  const str = String(rawTermStr || '').trim();
  if (/TRANSFER/i.test(str)) {
    return 'TRANSFER_TERM';
  }
  const m = str.match(/([A-Za-z]+)\s*_?\s*(\d{2})\b/);
  if (m) {
    return `${m[1].toUpperCase()}_${m[2]}`;
  }
  return str.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Grade quality point hierarchy for retake deduplication and C-or-higher checks.
 * Priority: A > B > C > TR-P/P/CR > D > Current > Scheduled
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

export const EXCLUDED_GRADES = new Set([
  'F',
  'W',
  'AF',
  'WF',
  'INC',
  'I',
  'NP',
  'NC',
  'U',
  'DROPPED',
  'DROPPED-W',
  'DROP',
  'WITHDRAWN',
  'AUDIT',
  'AU',
  'NG',
  'TR-F',
  'TR-W',
  'TR-WF',
  'TR-NC'
]);

/**
 * Extract inline General Education (GE-...) and Human Diversity (/HD) tags
 * from Course Name (Section 5.3 of directives/ExtractAnthologyFile.md).
 */
export function extractInlineGeTags(courseName) {
  const str = normalizeGeTagTypos(String(courseName || '').trim());
  if (!str) {
    return { rawTag: null, isHd: false, geCategory: null };
  }
  const matches = Array.from(str.matchAll(INLINE_GE_TAG_REGEX));
  if (matches.length === 0) {
    return {
      rawTag: null,
      isHd: /\/HD\b|\(HD\)|HUMAN DIVERSITY/i.test(str),
      geCategory: null
    };
  }
  const rawTag = matches[matches.length - 1][1].trim();
  const upperTag = rawTag.toUpperCase();
  const isHd = upperTag.includes('/HD') || /\/HD\b|\(HD\)|HUMAN DIVERSITY/i.test(str);

  let geCategory = null;
  if (upperTag.includes('MATH')) {
    geCategory = 'GE-Math';
  } else if (upperTag.includes('USHISGOV') || upperTag.includes('GE-CIV')) {
    geCategory = 'U.S. Hist/Gov';
  } else if (upperTag.includes('SOCSCI')) {
    geCategory = 'Social Science';
  } else if (
    upperTag.includes('NATSCILEC/LAB') ||
    upperTag.includes('NATSCILEC') ||
    upperTag.includes('NATSCILAB')
  ) {
    geCategory = 'Natural Science with Lab';
  } else if (upperTag.includes('NATSCI')) {
    geCategory = 'Natural Science';
  } else if (upperTag.includes(':ARTS') || upperTag.includes(':ART')) {
    geCategory = 'Fine Arts';
  } else if (upperTag.includes(':LIT')) {
    geCategory = 'Literature';
  } else if (upperTag.includes('GE-HC')) {
    geCategory = 'Human Culture Elective (Non-Lit/Non-Arts)';
  } else if (upperTag.startsWith('GE-')) {
    geCategory = 'GE Elective';
  }

  return { rawTag, isHd, geCategory };
}

/**
 * Normalize Excel date or ISO string into YYYY-MM-DD.
 */
export function normalizeStartDate(rawDate) {
  if (rawDate === null || rawDate === undefined || rawDate === '') return '';
  if (typeof rawDate === 'number' && rawDate >= 30000 && rawDate <= 60000) {
    const utcDays = Math.floor(rawDate - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    return dt.toISOString().slice(0, 10);
  }
  const str = String(rawDate).trim();
  if (!str || /^(nan|none|null)$/i.test(str)) return '';
  if (/^\d{5}(?:\.\d+)?$/.test(str)) {
    const serial = Math.floor(parseFloat(str));
    if (serial >= 30000 && serial <= 60000) {
      const utcDays = serial - 25569;
      const dt = new Date(utcDays * 86400 * 1000);
      return dt.toISOString().slice(0, 10);
    }
  }
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const mm = String(usMatch[1]).padStart(2, '0');
    const dd = String(usMatch[2]).padStart(2, '0');
    return `${usMatch[3]}-${mm}-${dd}`;
  }
  return str;
}

/**
 * Deterministic File Upload Verification Check for Anthology Course Schedule Exports (.xlsx and .csv)
 * per directives/ExtractAnthologyFile.md Section 1.1 & 1.3.
 */
export function verifyAnthologySpreadsheet(inputBufferOrString) {
  if (!inputBufferOrString) {
    return {
      isValid: false,
      exact20ColumnMatch: false,
      columnCount: 0,
      detectedHeaders: [],
      missingColumns: ESSENTIAL_ANTHOLOGY_HEADERS,
      errorCode: 'EMPTY_FILE',
      errorMessage: 'The uploaded file is empty or unreadable.'
    };
  }

  let workbook;
  try {
    if (typeof inputBufferOrString === 'string') {
      workbook = XLSX.read(inputBufferOrString, { type: 'string' });
    } else {
      workbook = XLSX.read(inputBufferOrString, { type: 'array' });
    }
  } catch (err) {
    return {
      isValid: false,
      exact20ColumnMatch: false,
      columnCount: 0,
      detectedHeaders: [],
      missingColumns: ESSENTIAL_ANTHOLOGY_HEADERS,
      errorCode: 'FILE_READ_ERROR',
      errorMessage: `Unable to parse spreadsheet file: ${err.message}`
    };
  }

  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    return {
      isValid: false,
      exact20ColumnMatch: false,
      columnCount: 0,
      detectedHeaders: [],
      missingColumns: ESSENTIAL_ANTHOLOGY_HEADERS,
      errorCode: 'NO_WORKSHEET',
      errorMessage: 'The uploaded file does not contain any worksheet.'
    };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!matrix || matrix.length === 0) {
    return {
      isValid: false,
      exact20ColumnMatch: false,
      columnCount: 0,
      detectedHeaders: [],
      missingColumns: ESSENTIAL_ANTHOLOGY_HEADERS,
      errorCode: 'EMPTY_WORKSHEET',
      errorMessage: 'The uploaded spreadsheet contains no header row or data.'
    };
  }

  const rawHeaders = (matrix[0] || []).map((h) => String(h ?? '').trim());
  const headerLowerSet = new Set(rawHeaders.filter(Boolean).map((h) => h.toLowerCase()));

  const missingEssential = ESSENTIAL_ANTHOLOGY_HEADERS.filter(
    (col) => !headerLowerSet.has(col.toLowerCase())
  );

  const exact20ColumnMatch =
    rawHeaders.length >= 20 &&
    STANDARD_ANTHOLOGY_HEADERS.every((col, idx) => rawHeaders[idx] === col);

  if (missingEssential.length > 0) {
    return {
      isValid: false,
      exact20ColumnMatch: false,
      columnCount: rawHeaders.filter(Boolean).length,
      detectedHeaders: rawHeaders.filter(Boolean),
      missingColumns: missingEssential,
      errorCode: 'INVALID_ANTHOLOGY_HEADERS',
      errorMessage: `The uploaded document does not match the Anthology "Student Course Schedules (All Results)" export format. Missing required columns: ${missingEssential.join(', ')}.`
    };
  }

  // Verify at least 1 valid course row remains after applying the Section 1.3 noise filter
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  let validCourseRows = 0;
  for (const row of rows) {
    const courseCode = String(row['Course Code'] ?? '').trim();
    const courseName = String(row['Course Name'] ?? '').trim();
    const publishedCode = String(row['Published Code'] ?? '').trim();
    if (!courseCode) continue;
    if (
      WEEKDAY_NAMES.has(courseName.toLowerCase()) ||
      publishedCode.toLowerCase() === 'room'
    ) {
      continue;
    }
    const cleanPub = publishedCode.replace(/[\s\-]+/g, '');
    if (PUBLISHED_CODE_PATTERN.test(cleanPub)) {
      validCourseRows += 1;
    }
  }

  if (validCourseRows === 0) {
    return {
      isValid: false,
      exact20ColumnMatch,
      columnCount: rawHeaders.filter(Boolean).length,
      detectedHeaders: rawHeaders.filter(Boolean),
      missingColumns: [],
      errorCode: 'NO_VALID_COURSE_ROWS',
      errorMessage:
        'The uploaded spreadsheet contains Anthology headers, but no valid student course records were found.'
    };
  }

  return {
    isValid: true,
    exact20ColumnMatch,
    columnCount: rawHeaders.filter(Boolean).length,
    detectedHeaders: rawHeaders.filter(Boolean),
    missingColumns: [],
    validCourseRows,
    errorCode: null,
    errorMessage: null
  };
}

/**
 * Academic Calendar active term determination per Lindenwood calendar:
 * - Fall Full Semester: August 15 - December 18
 * - Spring Full Semester: January 5 - May 15
 * - Summer / Break Exception: Mid-May to Mid-August and late December to early January
 *   (disregarded per institutional rule; currency check exempted).
 */
export function getCurrentAcademicSemester(referenceDate = new Date()) {
  const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const month = validDate.getMonth() + 1; // 1-12
  const day = validDate.getDate();
  const year = validDate.getFullYear();

  // Fall Full Semester: Aug 15 - Dec 18
  if ((month === 8 && day >= 15) || (month > 8 && month < 12) || (month === 12 && day <= 18)) {
    return {
      season: 'Fall',
      year,
      displayTerm: `Fall ${year}`,
      termCodePattern: new RegExp(`(?:FALL|FA).*(?:${String(year).slice(-2)}|${year})`, 'i'),
      isFullSemester: true,
      startDate: `${year}-08-15`,
      endDate: `${year}-12-18`
    };
  }

  // Spring Full Semester: Jan 5 - May 15
  if ((month === 1 && day >= 5) || (month > 1 && month < 5) || (month === 5 && day <= 15)) {
    return {
      season: 'Spring',
      year,
      displayTerm: `Spring ${year}`,
      termCodePattern: new RegExp(`(?:SPRING|SP).*(?:${String(year).slice(-2)}|${year})`, 'i'),
      isFullSemester: true,
      startDate: `${year}-01-05`,
      endDate: `${year}-05-15`
    };
  }

  // Summer or Winter break exception (Disregarded / Exempt per institutional rule)
  const isSummer = (month === 5 && day > 15) || (month > 5 && month < 8) || (month === 8 && day < 15);
  return {
    season: isSummer ? 'Summer' : 'Break',
    year,
    displayTerm: isSummer ? `Summer ${year}` : `Winter Break ${year}`,
    isFullSemester: false,
    startDate: null,
    endDate: null
  };
}

/**
 * Verify whether an uploaded Anthology spreadsheet or Transcript PDF is current
 * against the active academic semester window.
 * 
 * Rules:
 * 1. Summer / Break Exception: If upload occurs outside full Fall/Spring semester, currency check is exempted (isCurrent: true, isExempt: true).
 * 2. Anthology (.xlsx/.csv): Must contain courses from the active semester in-progress (Current) or scheduled (Scheduled).
 * 3. Enrollment-Based Transcript (.pdf): Must contain current in-progress courses (0.00 credit / no grade) or printed in active semester.
 * 4. Student-Based Transcript (.pdf): Verified by checking the transcript's printed header export date against the active semester window.
 */
export function verifyDocumentCurrency(parsedData, docType = 'Anthology', options = {}) {
  const referenceDate = options.referenceDate || new Date();
  const currentSem = getCurrentAcademicSemester(referenceDate);

  // Rule Exception: Date of upload is not in full Fall or Spring semester (e.g. summer or break)
  if (!currentSem.isFullSemester) {
    return {
      isCurrent: true,
      isExempt: true,
      currentSemester: currentSem.displayTerm,
      docType,
      reason: `Upload occurred during ${currentSem.displayTerm}. Currency check is exempted during summer and term breaks.`
    };
  }

  const validCourses = parsedData?.validCourses || [];
  const metadata = parsedData?.studentMetadata || {};

  // Find latest non-transfer term found in the document
  let latestTermFound = null;
  let maxSortKey = -1;
  for (const c of validCourses) {
    if (c.termInfo && !c.termInfo.isTransfer && !c.termInfo.isBlank && c.termInfo.sortKey > maxSortKey) {
      maxSortKey = c.termInfo.sortKey;
      latestTermFound = c.termInfo.displayTerm || c.term;
    }
  }

  const isAnthology = docType === 'Anthology' || !parsedData?.studentMetadata?.variant;

  if (isAnthology) {
    // Anthology: Must contain courses from current semester that are in-progress or scheduled
    const currentCourses = validCourses.filter((c) => {
      const termStr = String(c.term || '').toUpperCase();
      const termInfo = c.termInfo || {};
      const isTermMatch =
        (termInfo.year === currentSem.year && termInfo.season?.toLowerCase() === currentSem.season.toLowerCase()) ||
        currentSem.termCodePattern.test(termStr);
      return isTermMatch && (c.state === 'Current' || c.state === 'Scheduled');
    });

    if (currentCourses.length > 0) {
      return {
        isCurrent: true,
        isExempt: false,
        currentSemester: currentSem.displayTerm,
        currentCoursesCount: currentCourses.length,
        docType: 'Anthology'
      };
    }

    return {
      isCurrent: false,
      isExempt: false,
      currentSemester: currentSem.displayTerm,
      latestTermFound: latestTermFound || 'None detected',
      docType: 'Anthology',
      warningTitle: 'Anthology Export May Be Out of Date',
      explanation: `No in-progress or scheduled courses were detected for the current ${currentSem.displayTerm} semester in this Anthology export. The most recent term found is "${latestTermFound || 'earlier'}". If the student is actively enrolled, please export a fresh course schedule.`
    };
  }

  // Transcripts: Check format
  const variant = metadata.variant || (parsedData?.studentMetadata?.enrollment_number ? 'Enrollment-Based' : 'Student-Based');

  if (variant === 'Student-Based') {
    // User Decision: Check printed header date (Date: MM/DD/YYYY)
    const printedDateStr = metadata.transcript_date || '';
    let isDateInCurrentSem = false;

    if (printedDateStr) {
      const parts = printedDateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (parts) {
        const pYear = parseInt(parts[3], 10);
        const pMonth = parseInt(parts[1], 10);
        const pDay = parseInt(parts[2], 10);
        const printDateObj = new Date(pYear, pMonth - 1, pDay);
        const semStart = new Date(`${currentSem.year}-${currentSem.season === 'Fall' ? '08-15' : '01-05'}`);
        const semEnd = new Date(`${currentSem.year}-${currentSem.season === 'Fall' ? '12-18' : '05-15'}`);
        // Allow within current semester window or within 45 days prior to semester start
        const earlyWindow = new Date(semStart.getTime() - 45 * 24 * 60 * 60 * 1000);
        if (printDateObj >= earlyWindow && printDateObj <= semEnd) {
          isDateInCurrentSem = true;
        }
      }
    }

    // Also check if any in-progress courses were extracted
    const currentCourses = validCourses.filter((c) => c.state === 'Current' || c.state === 'Scheduled');

    if (isDateInCurrentSem || currentCourses.length > 0) {
      return {
        isCurrent: true,
        isExempt: false,
        currentSemester: currentSem.displayTerm,
        printedDate: printedDateStr,
        variant: 'Student-Based',
        docType: 'Transcript'
      };
    }

    return {
      isCurrent: false,
      isExempt: false,
      currentSemester: currentSem.displayTerm,
      printedDate: printedDateStr || 'Unknown',
      latestTermFound: latestTermFound || 'None detected',
      variant: 'Student-Based',
      docType: 'Transcript',
      warningTitle: 'Student-Based Transcript May Be Out of Date',
      explanation: `This Student-Based transcript was printed on "${printedDateStr || 'an earlier date'}", which precedes the current ${currentSem.displayTerm} semester. Student-Based exports often do not reflect active courses; an updated export or Enrollment-Based transcript is recommended.`
    };
  }

  // Enrollment-Based Transcript
  const inProgressCourses = validCourses.filter((c) => {
    const termStr = String(c.term || '').toUpperCase();
    const termInfo = c.termInfo || {};
    const isTermMatch =
      (termInfo.year === currentSem.year && termInfo.season?.toLowerCase() === currentSem.season.toLowerCase()) ||
      currentSem.termCodePattern.test(termStr);
    return isTermMatch && (c.state === 'Current' || c.credits === 0 || !c.grade);
  });

  const printedDateStr = metadata.transcript_date || '';
  let isDateInCurrentSem = false;
  if (printedDateStr) {
    const parts = printedDateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (parts) {
      const pYear = parseInt(parts[3], 10);
      const semStart = new Date(`${currentSem.year}-${currentSem.season === 'Fall' ? '08-15' : '01-05'}`);
      const semEnd = new Date(`${currentSem.year}-${currentSem.season === 'Fall' ? '12-18' : '05-15'}`);
      const printDateObj = new Date(pYear, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (printDateObj >= semStart && printDateObj <= semEnd) {
        isDateInCurrentSem = true;
      }
    }
  }

  if (inProgressCourses.length > 0 || isDateInCurrentSem) {
    return {
      isCurrent: true,
      isExempt: false,
      currentSemester: currentSem.displayTerm,
      inProgressCount: inProgressCourses.length,
      variant: 'Enrollment-Based',
      docType: 'Transcript'
    };
  }

  return {
    isCurrent: false,
    isExempt: false,
    currentSemester: currentSem.displayTerm,
    latestTermFound: latestTermFound || 'None detected',
    printedDate: printedDateStr || 'Unknown',
    variant: 'Enrollment-Based',
    docType: 'Transcript',
    warningTitle: 'Enrollment-Based Transcript May Be Out of Date',
    explanation: `The uploaded Enrollment-Based transcript contains no in-progress courses (0.00 credit) for the current ${currentSem.displayTerm} semester. The most recent term found is "${latestTermFound || 'earlier'}".`
  };
}

/**
 * Canonical course code normalizer.
 * Converts "ICS21300", "ics-21300-01", "ICS 21300 OL" -> { canonical: "ICS 21300", compact: "ICS21300", dept: "ICS", number: 21300 }
 */
export function normalizeCourseCode(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return null;
  }
  const cleaned = rawInput
    .toUpperCase()
    .trim()
    .replace(/^(TR|TRANSFER)\s*[:\-]?\s*/i, '');

  // Match 2-5 letters followed by 4-5 digits (and optional 1 letter suffix)
  const match = cleaned.match(/\b([A-Z]{2,5})\s*[-\s]?\s*(\d{4,5}[A-Z]?)\b/);
  if (!match) {
    return null;
  }

  const dept = match[1];
  const numStr = match[2];
  const numericVal = parseInt(numStr.replace(/\D/g, ''), 10);

  return {
    canonical: `${dept} ${numStr}`,
    compact: `${dept}${numStr}`,
    department: dept,
    numberStr: numStr,
    number: isNaN(numericVal) ? 0 : numericVal
  };
}

/**
 * Check if a grade satisfies the C-or-higher gatekeeper rule (ENGL 15000 / EPP 15000 / ENGL 17000).
 * Note: Per institutional catalog, C, C+, B-, B, B+, A-, A, TA, TB, TC, and TR/P/CR satisfy C-or-higher,
 * whereas C-, D+, D, D-, TD do NOT satisfy C-or-higher.
 */
export function isGradeCOrHigher(grade) {
  if (!grade) return false;
  const g = String(grade).trim().toUpperCase();
  const rank = GRADE_RANK[g];
  return typeof rank === 'number' && rank >= 5;
}

/**
 * Deterministic classification utility to identify transfer placeholder courses (ELECT & GE)
 * that represent multiple non-equivalent transfer credits and are exempt from repeat deduplication.
 *
 * Criteria to match:
 * 1. subject: Matches "ELECT" or "GE" (case-insensitive)
 * 2. courseNumber: Generic placeholder tiers ("10000", "19000", "20000", "29000", "39000") or ends with "000"
 * 3. title: Contains "Free Elective", "Technical Credit", "Special Topics", or begins with "GE-"
 * 4. origin: Tagged as transfer coursework (isTransfer, state === 'TR', status === 'Transfer', grade 'TR-*'/'T*', or term === 'TRANSFER_TERM')
 *
 * Return:
 * {
 *   isPlaceholder: true,
 *   placeholderType: subject === "GE" ? "GENERAL_EDUCATION" : "FREE_ELECTIVE",
 *   allowMultipleInstances: true
 * }
 */
export function isTransferPlaceholder(course) {
  if (!course || typeof course !== 'object') {
    return null;
  }

  // If already tagged, return existing metadata
  if (course.isTransferPlaceholder || (course.isPlaceholder && course.allowMultipleInstances)) {
    return {
      isPlaceholder: true,
      placeholderType:
        course.placeholderType ||
        (String(course.department || course.subject || '').toUpperCase() === 'GE'
          ? 'GENERAL_EDUCATION'
          : 'FREE_ELECTIVE'),
      allowMultipleInstances: true
    };
  }

  // 1. Subject / Department
  let subject = course.department || course.subject;
  const codeStr = String(
    course.code || course.compactCode || course.publishedCode || course.rawCourseCode || ''
  );
  if (!subject && codeStr) {
    const norm = normalizeCourseCode(codeStr);
    if (norm) subject = norm.department;
  }
  subject = String(subject || '').toUpperCase().trim();
  const isSubjectMatch = subject === 'ELECT' || subject === 'GE';
  if (!isSubjectMatch) {
    return null;
  }

  // 2. Course Number
  let numStr = String(
    course.courseNumber ||
    course.numberStr ||
    (course.number !== undefined && course.number !== null ? course.number : '')
  ).trim();
  if (!numStr && codeStr) {
    const norm = normalizeCourseCode(codeStr);
    if (norm) numStr = norm.numberStr;
  }
  const isGenericTier = ['10000', '19000', '20000', '29000', '39000'].includes(numStr);
  const isEndsWith000 = numStr.endsWith('000');
  const isNumberMatch = isGenericTier || isEndsWith000;

  // 3. Title
  const title = String(course.title || course.courseName || course.name || '').trim();
  const isTitleMatch =
    /Free Elective|Technical Credit|Special Topics/i.test(title) ||
    /^GE-/i.test(title);

  // Must match either generic number tier or placeholder title pattern
  if (!isNumberMatch && !isTitleMatch) {
    return null;
  }

  // 4. Origin: Must be transfer coursework
  const gradeStr = String(course.grade || course.rawGrade || '').toUpperCase().trim();
  const stateStr = String(course.state || '').toUpperCase();
  const statusStr = String(course.status || '').toUpperCase();
  const termStr = String(course.term || '').toUpperCase();

  const isOriginTransfer =
    Boolean(course.isTransfer || course.fromTransfer || course.isIncomingPlaceholder) ||
    stateStr === 'TR' ||
    stateStr === 'TRANSFER' ||
    statusStr === 'TRANSFER' ||
    statusStr === 'TR' ||
    termStr === 'TRANSFER_TERM' ||
    Boolean(course.termInfo?.isTransfer) ||
    gradeStr.startsWith('TR-') ||
    gradeStr.startsWith('TR') ||
    gradeStr.startsWith('T');

  if (!isOriginTransfer) {
    return null;
  }

  return {
    isPlaceholder: true,
    placeholderType: subject === 'GE' ? 'GENERAL_EDUCATION' : 'FREE_ELECTIVE',
    allowMultipleInstances: true
  };
}

/**
 * Parse term string into structured metadata:
 * Handles modern Anthology formats (FALL_II_26_8W, SPRING_I_25_8W, SUMMER_26_8W, FALL_24_16W),
 * standard format (2025FA-I, Fall 2025, FA-II 2025, Spring 2026, 2026SU), and Transfer (TRANSFER_TERM, TR).
 */
export function parseTermInfo(rawTerm) {
  const str = String(rawTerm || '').trim();
  if (!str) {
    return {
      raw: '',
      isBlank: true,
      isTransfer: false,
      year: null,
      season: null,
      session: null,
      sortKey: 999999
    };
  }
  if (/^(TR|TRANSFER|EXT)/i.test(str)) {
    return {
      raw: str || 'TR',
      isBlank: false,
      isTransfer: true,
      year: null,
      season: 'TR',
      session: 'TR',
      sortKey: 0
    };
  }

  const upper = str.toUpperCase();

  // Extract year:
  // 1. Check 4-digit year: 2024, 2025, 2026
  // 2. Check 2-digit year in tokens like _24_, _24, 24_, SEM_19, etc.
  let year = 2026;
  const fourDigitMatch = upper.match(/\b(20\d{2})\b/);
  if (fourDigitMatch) {
    year = parseInt(fourDigitMatch[1], 10);
  } else {
    const twoDigitMatch = upper.match(/(?:_|SEM_|^|[A-Z])(1\d|2\d|3\d)(?:_|$|[A-Z])/);
    if (twoDigitMatch) {
      year = 2000 + parseInt(twoDigitMatch[1], 10);
    }
  }

  let season = 'Fall';
  let session = 'Fall-16wk';
  let seasonOrder = 3; // Spring=1, Summer=2, Fall=3 within a calendar year

  if (upper.includes('SP') || upper.includes('SPRING')) {
    season = 'Spring';
    seasonOrder = 1;
    if (/_II(?:_|$)|-II\b|\bII\b|\bSESSION\s*2\b|\b8WK2\b|_8WII\b/.test(upper)) {
      session = 'SP-II';
    } else if (/_I(?:_|$)|-I\b|\bI\b|\bSESSION\s*1\b|\b8WK1\b|_8WI\b/.test(upper)) {
      session = 'SP-I';
    } else {
      session = 'Spring-16wk';
    }
  } else if (upper.includes('SU') || upper.includes('SUMMER')) {
    season = 'Summer';
    seasonOrder = 2;
    session = 'SU';
  } else {
    season = 'Fall';
    seasonOrder = 3;
    if (/_II(?:_|$)|-II\b|\bII\b|\bSESSION\s*2\b|\b8WK2\b|_8WII\b/.test(upper)) {
      session = 'FA-II';
    } else if (/_I(?:_|$)|-I\b|\bI\b|\bSESSION\s*1\b|\b8WK1\b|_8WI\b/.test(upper)) {
      session = 'FA-I';
    } else {
      session = 'Fall-16wk';
    }
  }

  const subOrder = session.endsWith('-I') ? 1 : session.endsWith('-II') ? 2 : 3;
  const sortKey = year * 100 + seasonOrder * 10 + subOrder;

  return {
    raw: str,
    isBlank: false,
    isTransfer: false,
    year,
    season,
    session,
    displayTerm: `${season} ${year}`,
    sortKey
  };
}

/**
 * Determine the 5-state classification of a course row per directives/ExtractAnthologyFile.md Section 3:
 * 'TR' | 'Completed' | 'Current' | 'Scheduled' | 'Excluded'
 */
export function classifyCourseRow(row, referenceTermSortKey = 202631) {
  const grade = String(row.grade || '').trim().toUpperCase();
  const status = String(row.status || '').trim().toUpperCase();
  const rawTermStr = String(row.term || '').trim();
  const termInfo = parseTermInfo(rawTermStr);

  // 1. Section 3.5.1: Unscheduled Anthology Audit Rows (Course Status == "Future" AND Term is NaN/blank)
  if (status === 'FUTURE' && !rawTermStr) {
    return {
      state: 'Excluded',
      excludeReason: 'Unscheduled Future Audit Row',
      isUnscheduledFuture: true
    };
  }

  // 2. Section 3.5.2: Failing / Non-Passing / Withdrawn / Unearned Repeat Grades or Statuses
  if (
    EXCLUDED_GRADES.has(grade) ||
    status.includes('DROP') ||
    status.includes('WITHDRAW') ||
    status === 'EXCLUDED' ||
    status === 'REPEAT' ||
    status === 'W' ||
    status === 'F' ||
    status === 'INC' ||
    row.isUnearnedAttempt
  ) {
    return {
      state: 'Excluded',
      excludeReason:
        row.excludeReason || (grade ? `Excluded Grade (${grade})` : `Excluded Status (${status})`),
      isUnscheduledFuture: false
    };
  }

  // 3. Section 3.5.3: Sub-10000 preparatory course exclusion
  if (row.number > 0 && row.number < 10000) {
    return {
      state: 'Excluded',
      excludeReason: 'Sub-10000 Preparatory Course',
      isUnscheduledFuture: false
    };
  }

  // 4. Section 3.2: Transfer (TR) (Term == TRANSFER_TERM OR Letter Grade starts with TR OR Status == TR)
  if (
    termInfo.isTransfer ||
    status.includes('TRANSFER') ||
    status === 'TR' ||
    grade === 'TR' ||
    /^TR-[A-Z]+$/.test(grade) ||
    /^T[ABCD]$/.test(grade)
  ) {
    return {
      state: 'TR',
      excludeReason: null,
      isUnscheduledFuture: false
    };
  }

  // 5. Section 3.4: Scheduled (Registered Future Anchor Credits — Future ONLY IF Term is non-empty)
  if (
    status.includes('SCHED') ||
    (status.includes('FUTURE') && Boolean(rawTermStr)) ||
    status.includes('PREREG') ||
    status.includes('REGISTERED') ||
    grade === 'SCHED' ||
    grade === 'SCHEDULED'
  ) {
    return {
      state: 'Scheduled',
      excludeReason: null,
      isUnscheduledFuture: false
    };
  }

  // 6. Section 3.3: Current (In-Progress Active Term Credits)
  if (
    status.includes('CURRENT') ||
    status.includes('IN PROGRESS') ||
    status.includes('IN-PROGRESS') ||
    status === 'IP' ||
    status === 'ACTIVE' ||
    status === 'ENROLLED' ||
    grade === 'IP' ||
    grade === 'CURRENT' ||
    (!grade && !status.includes('COMP') && !status.includes('HIST'))
  ) {
    // Distinguish Scheduled vs Current if term sortKey is strictly after reference active term
    if (!termInfo.isBlank && termInfo.sortKey > referenceTermSortKey + 5) {
      return {
        state: 'Scheduled',
        excludeReason: null,
        isUnscheduledFuture: false
      };
    }
    return {
      state: 'Current',
      excludeReason: null,
      isUnscheduledFuture: false
    };
  }

  // 7. Section 3.1: Completed (Lindenwood Earned Credits)
  return {
    state: 'Completed',
    excludeReason: null,
    isUnscheduledFuture: false
  };
}

/**
 * Infer default Catalog Year from earliest chronological non-transfer Start Date or Term
 * (Section 1.2 of directives/ExtractAnthologyFile.md & Section 1.3.2 of directives/ExtractTranscriptFile.md).
 */
export function inferCatalogYearFromRecords(records, fallbackStartDate = '') {
  let earliestDate = fallbackStartDate ? normalizeStartDate(fallbackStartDate) : null;
  if (earliestDate && !/^\d{4}-\d{2}-\d{2}$/.test(earliestDate)) {
    earliestDate = null;
  }
  let earliestTermInfo = null;

  for (const r of records) {
    if (r.state === 'TR' || r.termInfo?.isTransfer || r.isUnscheduledFuture) continue;
    if (r.startDate && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate)) {
      if (!earliestDate || r.startDate < earliestDate) {
        earliestDate = r.startDate;
      }
    }
    if (r.termInfo && !r.termInfo.isBlank && r.termInfo.year) {
      if (!earliestTermInfo || r.termInfo.sortKey < earliestTermInfo.sortKey) {
        earliestTermInfo = r.termInfo;
      }
    }
  }

  if (earliestDate) {
    const yyyy = parseInt(earliestDate.slice(0, 4), 10);
    const mm = parseInt(earliestDate.slice(5, 7), 10);
    const startYr = mm >= 8 ? yyyy : yyyy - 1;
    return `${startYr}-${startYr + 1}`;
  }

  if (earliestTermInfo && earliestTermInfo.year) {
    const yr = earliestTermInfo.year;
    const startYr = earliestTermInfo.season === 'Fall' ? yr : yr - 1;
    return `${startYr}-${startYr + 1}`;
  }

  return '2026-2027';
}

/**
 * Core deterministic normalization, filtering, retake deduplication, and 5-state classifier
 * operating on an array of raw course record objects.
 */
export function processRawCourseRecords(rawRecords, options = {}) {
  const referenceYear = options.referenceYear || 2026;
  const referenceTermSortKey = options.referenceTermSortKey || 202633;
  const isTranscriptPdf = Boolean(options.isTranscriptPdf);

  const totalRawRows = Array.isArray(rawRecords) ? rawRecords.length : 0;
  let droppedNoiseRows = 0;
  const parsedRows = [];
  const detectedEnrollments = [];
  const detectedAreasOfStudy = [];
  const templateSuffixes = [];

  for (const raw of rawRecords || []) {
    if (!raw || typeof raw !== 'object') {
      droppedNoiseRows += 1;
      continue;
    }

    const hasAnthologyColumns =
      Object.prototype.hasOwnProperty.call(raw, 'Published Code') &&
      Object.prototype.hasOwnProperty.call(raw, 'Course Code');

    if (hasAnthologyColumns) {
      const rawCourseCodeCol = String(raw['Course Code'] ?? '').trim();
      const rawCourseNameCol = String(raw['Course Name'] ?? '').trim();
      const rawPublishedCodeCol = String(raw['Published Code'] ?? '').trim();

      // Section 1.3 Mandatory Row-Level Noise Filter (Execute First):
      // 1. DROP any row where Course Code is null, empty, or whitespace (NaN)
      if (!rawCourseCodeCol || /^(nan|none|null)$/i.test(rawCourseCodeCol)) {
        droppedNoiseRows += 1;
        continue;
      }
      // 2. DROP any row where Course Name equals "Day" or a weekday name, or Published Code equals "Room"
      if (
        WEEKDAY_NAMES.has(rawCourseNameCol.toLowerCase()) ||
        rawPublishedCodeCol.toLowerCase() === 'room'
      ) {
        droppedNoiseRows += 1;
        continue;
      }
      // 3. Only rows where Published Code matches ^[A-Z]{2,5}\s*\d{4,5}[A-Z]?$ proceed
      const cleanPublished = rawPublishedCodeCol.replace(/[\s\-]+/g, '');
      if (!PUBLISHED_CODE_PATTERN.test(cleanPublished)) {
        droppedNoiseRows += 1;
        continue;
      }

      const suffixMatch = rawCourseCodeCol.match(/^[A-Z]{2,5}\s*\d{4,5}[A-Z]?-(\d{2})$/i);
      if (suffixMatch) {
        const suf = `-${suffixMatch[1]}`;
        if (!templateSuffixes.includes(suf)) templateSuffixes.push(suf);
      }
    }

    // Primary course code extraction: prioritize Published Code (Section 2.1 Col 2)
    const rawCode =
      (raw['Published Code'] && String(raw['Published Code']).trim()) ||
      raw.publishedCode ||
      raw.code ||
      raw.courseCode ||
      raw['Course Code'] ||
      raw['Course'] ||
      raw['CourseID'] ||
      raw['Subj/Crse'] ||
      (raw.department && raw.number ? `${raw.department} ${raw.number}` : null) ||
      (raw['Subject'] && raw['Course Number'] ? `${raw['Subject']} ${raw['Course Number']}` : null);

    const norm = normalizeCourseCode(rawCode);
    if (!norm) {
      droppedNoiseRows += 1;
      continue;
    }

    const rawTitle = String(
      raw.title ||
        raw.courseTitle ||
        raw['Course Name'] ||
        raw['Course Title'] ||
        raw['Title'] ||
        raw['Description'] ||
        ''
    ).trim();
    const title = normalizeGeTagTypos(rawTitle);

    if (WEEKDAY_NAMES.has(title.toLowerCase())) {
      droppedNoiseRows += 1;
      continue;
    }

    // Section 2.1 Col 9: Credits is the single source of credit truth (do not confuse with Clock Hours Col 10)
    const rawCredits =
      raw.credits !== undefined
        ? raw.credits
        : raw['Credits'] !== undefined && String(raw['Credits']).trim() !== ''
        ? raw['Credits']
        : raw['Credit Hours'] !== undefined
        ? raw['Credit Hours']
        : raw['Cr'] !== undefined
        ? raw['Cr']
        : raw['Hours'] !== undefined && !hasAnthologyColumns
        ? raw['Hours']
        : 3;

    const credits = parseFloat(rawCredits);
    const validCredits = isNaN(credits) ? 0 : credits;

    const rawGradeInput = String(
      raw.grade || raw['Letter Grade'] || raw['Grade'] || raw['Final Grade'] || ''
    ).trim();
    const { cleanGrade: grade, isRetakeFlagged } = normalizeTranscriptGrade(rawGradeInput);

    const status = String(
      raw.status || raw['Course Status'] || raw['Status'] || raw['Enrollment Status'] || ''
    ).trim();

    const term = String(
      raw.term || raw['Term'] || raw['Semester'] || raw['Session'] || raw['Academic Term'] || ''
    ).trim();

    const startDate = normalizeStartDate(raw.startDate ?? raw['Start Date']);

    // Section 2.1 Col 16: Delivery Method (Online, On Ground, Hybrid)
    const modality = String(
      raw.modality || raw['Delivery Method'] || raw['Modality'] || 'Online'
    ).trim();

    const areaOfStudy = String(raw.areaOfStudy || raw['Area of Study'] || '').trim();
    const enrollment = String(raw.enrollment || raw['Enrollment'] || '').trim();

    if (enrollment && !detectedEnrollments.includes(enrollment)) {
      detectedEnrollments.push(enrollment);
    }
    if (areaOfStudy && !detectedAreasOfStudy.includes(areaOfStudy)) {
      detectedAreasOfStudy.push(areaOfStudy);
    }

    const termInfo = parseTermInfo(term);
    const geInfo = extractInlineGeTags(title);

    // Quality Points computation (from transcript Pts column or calculated from grade points * credits)
    let qualityPoints = null;
    if (typeof raw.qualityPoints === 'number' && !isNaN(raw.qualityPoints)) {
      qualityPoints = raw.qualityPoints;
    } else if (GRADE_POINTS[grade] !== undefined) {
      qualityPoints = Number((validCredits * GRADE_POINTS[grade]).toFixed(2));
    }

    const record = {
      code: norm.canonical,
      compactCode: norm.compact,
      publishedCode: norm.compact,
      rawCourseCode: String(raw['Course Code'] || raw.code || norm.compact).trim(),
      department: norm.department,
      number: norm.number,
      title,
      credits: validCredits,
      grade,
      rawGrade: rawGradeInput.toUpperCase(),
      isRetakeFlagged: Boolean(raw.isRetakeFlagged || isRetakeFlagged),
      isUnearnedAttempt: Boolean(raw.isUnearnedAttempt),
      qualityPoints,
      status,
      term: termInfo.raw,
      termInfo,
      startDate,
      modality,
      areaOfStudy,
      enrollment,
      fromTranscriptPdf: Boolean(raw.fromTranscriptPdf || isTranscriptPdf),
      geTag: geInfo.rawTag,
      geCategory: geInfo.geCategory,
      hasHDAttribute: geInfo.isHd || Boolean(raw.hasHDAttribute),
      excludeReason: raw.excludeReason || null
    };

    const classification = classifyCourseRow(record, referenceTermSortKey);
    record.state = classification.state;
    record.excludeReason = classification.excludeReason;
    record.isUnscheduledFuture = Boolean(classification.isUnscheduledFuture);

    // Tag transfer placeholders (ELECT & GE)
    const placeholderMeta = isTransferPlaceholder(record);
    if (placeholderMeta) {
      record.isPlaceholder = true;
      record.placeholderType = placeholderMeta.placeholderType;
      record.allowMultipleInstances = true;
      record.isTransferPlaceholder = true;
    }

    parsedRows.push(record);
  }

  // Count unscheduled Future (Term == NaN) audit rows before deduplication (Section 6 benchmark)
  const unscheduledFutureRows = parsedRows.filter((r) => r.isUnscheduledFuture);
  const ignoredUnscheduledFutureRows = unscheduledFutureRows.length;
  const ignoredUnscheduledFutureCredits = Number(
    unscheduledFutureRows.reduce((sum, r) => sum + r.credits, 0).toFixed(2)
  );

  // Section 4: Retake & Deduplication Rules
  // Group all valid course rows by canonical Published Code (compactCode),
  // exempting transfer placeholders (ELECT & GE) from repeat deduplication
  const sourceOccurrences = { anth: {}, pdf: {} };
  const groupedByCompact = new Map();
  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    const placeholderMeta = isTransferPlaceholder(r);

    let groupKey = r.compactCode;
    if (placeholderMeta?.allowMultipleInstances) {
      // Differentiating key for transfer placeholders:
      // Rows with distinct grades, credits, terms, or multiple entries within the same source document
      // remain distinct. Duplicate rows across Anthology and Transcript PDF with identical attributes merge.
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

  const compareRows = (a, b) => {
    const ka = getRowPriorityTuple(a);
    const kb = getRowPriorityTuple(b);
    if (kb.statePrio !== ka.statePrio) return kb.statePrio - ka.statePrio;
    if (kb.gradePrio !== ka.gradePrio) return kb.gradePrio - ka.gradePrio;
    if (kb.luTiebreak !== ka.luTiebreak) return kb.luTiebreak - ka.luTiebreak;
    return kb.dateStr.localeCompare(ka.dateStr);
  };

  const validCourses = [];
  const excludedCourses = [];
  const harvestedOfferings = [];

  for (const [, group] of groupedByCompact.entries()) {
    // Section 4.2 Minor Tag Preservation: merge non-empty Area of Study values onto surviving row
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
      areaOfStudy: mergedAreaStr || sortedGroup[0].areaOfStudy || ''
    };

    if (winner.state !== 'Excluded') {
      validCourses.push(winner);

      // Passive 2-Year Institutional Course Harvester check (restricted to Anthology exports per Section 2.3)
      if (
        !winner.fromTranscriptPdf &&
        (winner.state === 'Completed' || winner.state === 'Current') &&
        !winner.termInfo.isTransfer &&
        winner.termInfo.year &&
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

      // Log remaining rows in group into Excluded Courses Ledger (ignoring unscheduled Future rows)
      for (let i = 1; i < sortedGroup.length; i++) {
        const other = sortedGroup[i];
        if (other.isUnscheduledFuture) continue;
        // Do not flag cross-file duplicates of transfer placeholders as repeat/retake
        if (isTransferPlaceholder(other)) {
          continue;
        }
        const reason =
          other.state !== 'Excluded'
            ? `Excluded: Repeat / Retake (Superseded by ${winner.grade || winner.state})`
            : other.excludeReason || 'Excluded: Repeat / Retake';
        excludedCourses.push({
          ...other,
          reason
        });
      }
    } else {
      for (const item of sortedGroup) {
        if (item.isUnscheduledFuture) continue;
        excludedCourses.push({
          ...item,
          reason: item.excludeReason || 'Excluded Course'
        });
      }
    }
  }

  const transferCourses = validCourses.filter((c) => c.state === 'TR');
  const completedCourses = validCourses.filter((c) => c.state === 'Completed');
  const currentCourses = validCourses.filter((c) => c.state === 'Current');
  const scheduledCourses = validCourses.filter((c) => c.state === 'Scheduled');

  const totalTransferCredits = transferCourses.reduce((sum, c) => sum + c.credits, 0);
  const totalCompletedLindenwoodCredits = completedCourses.reduce((sum, c) => sum + c.credits, 0);
  const totalCompletedCredits = totalTransferCredits + totalCompletedLindenwoodCredits;
  const totalCurrentCredits = currentCourses.reduce((sum, c) => sum + c.credits, 0);
  const totalScheduledCredits = scheduledCourses.reduce((sum, c) => sum + c.credits, 0);
  const totalEnrolledCredits = totalCurrentCredits + totalScheduledCredits;
  const totalEarnedAndEnrolledCredits = totalCompletedCredits + totalEnrolledCredits;
  const lindenwoodResidencyCredits = totalCompletedLindenwoodCredits + totalEnrolledCredits;

  const upperLevelCourses = validCourses.filter((c) => c.number >= 30000);
  const upperLevelEarnedCredits = upperLevelCourses
    .filter((c) => c.state === 'Completed' || c.state === 'TR')
    .reduce((sum, c) => sum + c.credits, 0);
  const upperLevelCurrentCredits = upperLevelCourses
    .filter((c) => c.state === 'Current' || c.state === 'Scheduled')
    .reduce((sum, c) => sum + c.credits, 0);
  const upperLevelCredits = upperLevelCourses.reduce((sum, c) => sum + c.credits, 0);

  const hdCourses = validCourses.filter((c) => c.hasHDAttribute);
  const hdCredits = hdCourses.reduce((sum, c) => sum + c.credits, 0);

  // Cumulative GPA & Quality Points calculation across completed letter-graded courses
  let totalQualityPoints = 0;
  let totalGpaCredits = 0;
  for (const c of completedCourses) {
    if (GRADE_POINTS[c.grade] !== undefined) {
      const pts =
        typeof c.qualityPoints === 'number' && !isNaN(c.qualityPoints)
          ? c.qualityPoints
          : c.credits * GRADE_POINTS[c.grade];
      totalQualityPoints += pts;
      totalGpaCredits += c.credits;
    }
  }
  totalQualityPoints = Number(totalQualityPoints.toFixed(2));
  const computedGpa =
    totalGpaCredits > 0 ? Number((totalQualityPoints / totalGpaCredits).toFixed(2)) : 0.0;
  const metaGpa = options.studentMetadata?.student_gpa ?? options.studentMetadata?.gpa;
  const cumulativeGpa =
    typeof metaGpa === 'number' && !isNaN(metaGpa) ? Number(metaGpa.toFixed(2)) : computedGpa;

  // UNIV / LUL First-Year Seminar Waiver Rule: waived when Total Transfer (TR) Credits > 0
  const univLulWaived = totalTransferCredits > 0;

  // Section 1.2: Primary Degree / Major from Enrollment column (<ProgramCode>/<Program Title>/<Status>)
  let detectedPrimaryMajor = '';
  let detectedProgramCode = '';
  if (detectedEnrollments.length > 0) {
    const parts = detectedEnrollments[0].split('/').map((p) => p.trim());
    if (parts.length >= 2) {
      detectedProgramCode = parts[0];
      detectedPrimaryMajor = parts[1];
    } else {
      detectedPrimaryMajor = detectedEnrollments[0];
    }
  }

  const fallbackStartDate =
    options.studentMetadata?.original_start_date || options.studentMetadata?.startDate || '';
  const inferredCatalogYear = inferCatalogYearFromRecords(parsedRows, fallbackStartDate);

  const inMeta = options.studentMetadata || {};
  const resolvedName = inMeta.student_name || inMeta.name || '';
  const resolvedId = inMeta.student_id || inMeta.studentId || '';
  const resolvedMajor = inMeta.program || inMeta.major || detectedPrimaryMajor;
  const resolvedConcentrations =
    Array.isArray(inMeta.concentrations) && inMeta.concentrations.length > 0
      ? inMeta.concentrations
      : detectedAreasOfStudy;
  const resolvedCatalogYear = inMeta.catalog_year || inMeta.catalogYear || inferredCatalogYear;

  return {
    studentMetadata: {
      name: resolvedName,
      student_name: resolvedName,
      studentId: resolvedId,
      student_id: resolvedId,
      dob: inMeta.dob || '',
      original_start_date: inMeta.original_start_date || '',
      transcript_date: inMeta.transcript_date || '',
      student_gpa: cumulativeGpa,
      gpa: cumulativeGpa,
      email: inMeta.email || '',
      catalogYear: resolvedCatalogYear,
      catalog_year: resolvedCatalogYear,
      major: resolvedMajor,
      program: resolvedMajor,
      programCode: inMeta.programCode || detectedProgramCode,
      enrollment_number: inMeta.enrollment_number || '',
      status: inMeta.status || '',
      concentrations: resolvedConcentrations,
      declaredMinors: resolvedConcentrations,
      templateSuffixes,
      ...inMeta
    },
    validCourses,
    transferCourses,
    completedCourses,
    currentCourses,
    scheduledCourses,
    excludedCourses,
    harvestedOfferings,
    summary: {
      totalRawRows,
      droppedNoiseRows,
      validCourseRows: parsedRows.length,
      ignoredUnscheduledFutureRows,
      ignoredUnscheduledFutureCredits,
      activeUniqueCourseCount: validCourses.length,
      completedCourseCount: completedCourses.length + transferCourses.length,
      currentCourseCount: currentCourses.length,
      scheduledCourseCount: scheduledCourses.length,
      totalTransferCredits,
      totalCompletedLindenwoodCredits,
      totalCompletedInstitutionalCredits: totalCompletedLindenwoodCredits,
      totalCompletedCredits,
      totalEarnedCredits: totalCompletedCredits,
      totalCurrentCredits,
      totalScheduledCredits,
      totalEnrolledCredits,
      totalEarnedAndEnrolledCredits,
      lindenwoodResidencyCredits,
      upperLevelCourseCount: upperLevelCourses.length,
      upperLevelEarnedCredits,
      upperLevelCurrentCredits,
      upperLevelCredits,
      upperLevelCodes: upperLevelCourses.map((c) => c.compactCode),
      upperLevelCreditsNeeded: Math.max(0, 42 - upperLevelCredits),
      hdCourseCount: hdCourses.length,
      hdCredits,
      hdCodes: hdCourses.map((c) => c.compactCode),
      hdSatisfied: hdCourses.length >= 2 && hdCredits >= 6,
      totalQualityPoints,
      totalGpaCredits,
      cumulativeGpa,
      univLulWaived
    }
  };
}

/**
 * Parse Anthology Course Export (.csv or .xlsx ArrayBuffer / Uint8Array / Buffer / string) via SheetJS
 * per directives/ExtractAnthologyFile.md.
 */
export function parseAnthologySpreadsheet(fileBuffer, fileTypeOrOptions = {}, maybeOptions = {}) {
  const options =
    typeof fileTypeOrOptions === 'string'
      ? { ...maybeOptions, fileType: fileTypeOrOptions }
      : fileTypeOrOptions || {};

  let workbook;
  if (typeof fileBuffer === 'string') {
    workbook = XLSX.read(fileBuffer, { type: 'string' });
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(fileBuffer)) {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } else {
    workbook = XLSX.read(fileBuffer, { type: 'array' });
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  return processRawCourseRecords(rows, options);
}

/**
 * Spatial Two-Column Newspaper PDF Extractor for Lindenwood Unofficial Transcripts
 * per directives/ExtractTranscriptFile.md Sections 1, 2, 3, 4, 5.
 * Auto-detects Variant A (Enrollment-Based 792x612 landscape) and Variant B (Student-Based 612x792 portrait).
 */
export async function extractSpatialTranscriptFromPdf(pdfArrayBuffer, options = {}) {
  const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsModule.default || pdfjsModule;

  // Defensive clone to prevent pdfjs-dist web worker from detaching caller's ArrayBuffer
  let data;
  if (pdfArrayBuffer instanceof Uint8Array) {
    data = new Uint8Array(
      pdfArrayBuffer.buffer.slice(
        pdfArrayBuffer.byteOffset,
        pdfArrayBuffer.byteOffset + pdfArrayBuffer.byteLength
      )
    );
  } else if (pdfArrayBuffer && typeof pdfArrayBuffer.slice === 'function') {
    data = new Uint8Array(pdfArrayBuffer.slice(0));
  } else if (pdfArrayBuffer && pdfArrayBuffer.buffer && typeof pdfArrayBuffer.buffer.slice === 'function') {
    data = new Uint8Array(pdfArrayBuffer.buffer.slice(0));
  } else {
    data = new Uint8Array(pdfArrayBuffer);
  }
  const doc = await pdfjs.getDocument({ data }).promise;

  const metadata = {
    variant: '',
    student_name: '',
    student_id: '',
    dob: '',
    original_start_date: '',
    transcript_date: '',
    student_gpa: null,
    program: '',
    enrollment_number: '',
    status: '',
    concentrations: [],
    catalog_year: ''
  };

  const rawExtractedCourses = [];
  const reconstructedLines = [];
  let currentTerm = 'FALL_26';
  let awaitingStudentBasedProgram = false;
  let synthTrCounter = 1;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();

    // Section 1.1: Format Auto-Detection by page bounding box (width x height)
    const isEnrollmentBased = vp.width > vp.height; // 792x612 vs 612x792
    if (p === 1) {
      metadata.variant = isEnrollmentBased ? 'Enrollment-Based' : 'Student-Based';
    }

    const midX = isEnrollmentBased ? 395.0 : 300.0;
    const headerY0Cutoff = isEnrollmentBased ? 500.0 : 665.0;
    const pageHeaderY0Cutoff = p === 1 ? headerY0Cutoff : isEnrollmentBased ? 570.0 : 740.0;
    const footerY1Cutoff = isEnrollmentBased ? 55.0 : 40.0;

    // Section 1.2 Step 1 & 2: Extract text spans and deduplicate overlaid spans (|dx0| < 1.0, |dy1| < 1.0, text1 == text2)
    const rawSpans = [];
    for (const it of tc.items) {
      const text = (it.str || '').trim();
      if (!text) continue;
      const x0 = it.transform ? it.transform[4] : 0;
      const y0 = it.transform ? it.transform[5] : 0;
      const h = it.height || (it.transform ? Math.abs(it.transform[3]) : 0) || 0;
      const y1 = y0 + h;

      const isDup = rawSpans.some(
        (s) => Math.abs(s.x0 - x0) < 1.0 && Math.abs(s.y1 - y1) < 1.0 && s.text === text
      );
      if (!isDup) {
        rawSpans.push({ x0, y0, y1, text });
      }
    }

    // Group spans into horizontal rows using vertical tolerance |dy1| <= 3.0 pt, sorted left-to-right by x0
    const groupRows = (spans) => {
      const sorted = [...spans].sort((a, b) => b.y1 - a.y1 || a.x0 - b.x0);
      const rows = [];
      for (const sp of sorted) {
        let matchedRow = null;
        for (const r of rows) {
          if (Math.abs(r.y1 - sp.y1) <= 3.0) {
            matchedRow = r;
            break;
          }
        }
        if (matchedRow) {
          matchedRow.spans.push(sp);
        } else {
          rows.push({ y1: sp.y1, y0: sp.y0, spans: [sp] });
        }
      }
      for (const r of rows) {
        r.spans.sort((a, b) => a.x0 - b.x0);
        r.firstX0 = r.spans[0].x0;
        r.text = r.spans.map((s) => s.text).join(' ');
      }
      return rows;
    };

    // Section 1.3.1: Extract Header Metadata on Page 1
    const headerSpans = rawSpans.filter((s) => s.y0 >= headerY0Cutoff);
    const headerRows = groupRows(headerSpans);
    if (p === 1) {
      for (const hRow of headerRows) {
        const line = hRow.text;
        reconstructedLines.push(line);

        const nameMatch = line.match(/Student:\s*([A-Za-z\s\-'.]+?)(?=\s+Student ID:|\s+DOB:|$)/i);
        if (nameMatch && !metadata.student_name) {
          metadata.student_name = nameMatch[1].trim();
        }
        const idMatch = line.match(/Student ID:\s*(A\d{8,10}|\S+)/i);
        if (idMatch && !metadata.student_id) {
          metadata.student_id = idMatch[1].trim();
        }
        const dobMatch = line.match(/DOB:\s*(\d{2}\/\d{4})/i);
        if (dobMatch && !metadata.dob) {
          metadata.dob = dobMatch[1].trim();
        }
        const origStartMatch = line.match(/Original Start Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (origStartMatch && !metadata.original_start_date) {
          metadata.original_start_date = origStartMatch[1].trim();
        }
        const dateMatch = line.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (dateMatch && !metadata.transcript_date) {
          metadata.transcript_date = dateMatch[1].trim();
        }
        const gpaMatch = line.match(/Student GPA:\s*([\d.]+)/i);
        if (gpaMatch && metadata.student_gpa === null) {
          metadata.student_gpa = Number(parseFloat(gpaMatch[1]).toFixed(2));
        }
      }
    }

    // Section 1.2 Step 3 & 4: Partition body spans by mid_x into Left Column and Right Column
    const leftSpans = rawSpans.filter(
      (s) => s.y1 > footerY1Cutoff && s.y0 < pageHeaderY0Cutoff && s.x0 < midX
    );
    const rightSpans = rawSpans.filter(
      (s) => s.y1 > footerY1Cutoff && s.y0 < pageHeaderY0Cutoff && s.x0 >= midX
    );

    const columns = [
      {
        rows: groupRows(leftSpans),
        descMinX: isEnrollmentBased ? 50.0 : 70.0,
        descMaxX: isEnrollmentBased ? 200.0 : 180.0
      },
      {
        rows: groupRows(rightSpans),
        descMinX: isEnrollmentBased ? 435.0 : 335.0,
        descMaxX: isEnrollmentBased ? 590.0 : 440.0
      }
    ];

    // Process Left Column top-to-bottom -> Right Column top-to-bottom
    for (const col of columns) {
      let lastCourse = null;
      const flushLastCourse = () => {
        if (!lastCourse) return;
        const cleanTitle = normalizeGeTagTypos(lastCourse.courseName);
        const { cleanGrade } = normalizeTranscriptGrade(lastCourse.rawGrade);
        const gradeStr = cleanGrade ? ` ${cleanGrade}` : ' CURRENT';
        reconstructedLines.push(
          `${lastCourse.publishedCode} ${cleanTitle} ${lastCourse.att.toFixed(2)} ${lastCourse.earn.toFixed(2)} ${lastCourse.pts.toFixed(2)}${gradeStr}`
        );
        lastCourse = null;
      };

      for (const row of col.rows) {
        const line = row.text.trim();
        const firstX0 = row.firstX0;
        if (!line) continue;

        // Enrollment-Based Program line
        if (/^Program:\s*(.+)$/i.test(line)) {
          const m = line.match(/^Program:\s*(.+)$/i);
          if (m && !metadata.program) metadata.program = m[1].trim();
          flushLastCourse();
          reconstructedLines.push(line);
          continue;
        }

        // Enrollment-Based Enrollment # & Status
        if (/^Enrollment #:\s*(\S+)\s+Status:\s*(\S+)/i.test(line)) {
          const m = line.match(/^Enrollment #:\s*(\S+)\s+Status:\s*(\S+)/i);
          if (m) {
            metadata.enrollment_number = m[1].trim();
            metadata.status = m[2].trim();
          }
          flushLastCourse();
          reconstructedLines.push(line);
          continue;
        }

        // Enrollment-Based Start Date
        if (/^Start Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.test(line)) {
          const m = line.match(/^Start Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
          if (m && !metadata.original_start_date) {
            metadata.original_start_date = m[1].trim();
          }
          flushLastCourse();
          reconstructedLines.push(line);
          continue;
        }

        // Enrollment-Based Concentration(s)
        if (/^Concentration\(s\):\s*(.+)$/i.test(line)) {
          const m = line.match(/^Concentration\(s\):\s*(.+)$/i);
          if (m) {
            const parts = m[1]
              .split(';')
              .map((s) => s.trim())
              .filter(Boolean);
            for (const pt of parts) {
              if (!metadata.concentrations.includes(pt)) {
                metadata.concentrations.push(pt);
              }
            }
          }
          flushLastCourse();
          reconstructedLines.push(line);
          continue;
        }

        // End-of-transcript Cumulative GPA summary row
        if (/^Undergraduat(?:e)?\s+([\d.]+)\s+([\d.]+)/i.test(line)) {
          const m = line.match(/^Undergraduat(?:e)?\s+([\d.]+)\s+([\d.]+)/i);
          if (m) {
            metadata.student_gpa = Number(parseFloat(m[1]).toFixed(2));
          }
          flushLastCourse();
          reconstructedLines.push(line);
          continue;
        }

        if (/Cum GPA:\s*([\d.]+)/i.test(line)) {
          const m = line.match(/Cum GPA:\s*([\d.]+)/i);
          if (m) {
            const gpaVal = Number(parseFloat(m[1]).toFixed(2));
            if (gpaVal > 0 && (!isEnrollmentBased || metadata.student_gpa === null)) {
              metadata.student_gpa = gpaVal;
            }
          }
          flushLastCourse();
          reconstructedLines.push(line);
          continue;
        }

        // Term Header (Section 2.3)
        if (/^Term:\s*(.+)$/i.test(line)) {
          const m = line.match(/^Term:\s*(.+)$/i);
          if (m) {
            currentTerm = normalizeTranscriptTerm(m[1]);
            awaitingStudentBasedProgram = !isEnrollmentBased && currentTerm !== 'TRANSFER_TERM';
          }
          flushLastCourse();
          reconstructedLines.push(`Term: ${currentTerm}`);
          continue;
        }

        // Student-Based Program sub-header immediately below Term: <Season Year> (x0 < descMinX)
        if (
          awaitingStudentBasedProgram &&
          firstX0 < col.descMinX &&
          !/^Course\s+Description/i.test(line) &&
          !/^Transferred from/i.test(line)
        ) {
          if (!metadata.program) {
            metadata.program = line;
          }
          flushLastCourse();
          reconstructedLines.push(`Program: ${line}`);
          awaitingStudentBasedProgram = false;
          continue;
        }

        // Structural non-course lines that terminate any wrapped title continuation
        if (
          /^(?:Course\s+Course|Course\s+Description|Code\s+Description|Attempted\/Earned|Term GPA:|Cum GPA:|Dean's Honor Roll|President's|Honor Roll|Transferred from|Additional|GPAs|GPA\s+Cumulative|GPA\s+Points|\*{3}|e$|Page\s*\d+|Date:\s*\d{1,2}\/\d{1,2}\/\d{4})/i.test(
            line
          ) ||
          /^\d+\.\d{2}\s+\d+\.\d{2}\s+\d+\.\d{2}$/.test(line) ||
          /\bGPA:\s*[\d.]+\s+\d+\.\d{2}/i.test(line)
        ) {
          flushLastCourse();
          reconstructedLines.push(line);
          awaitingStudentBasedProgram = false;
          continue;
        }

        // Section 2.2.1 Primary Course Row Pattern:
        // ^([A-Z]{2,5}\s*\d{4,5})\b\s*(.*?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?:\s+([A-Z\+\-\*#]+))?$
        const courseMatch = line.match(
          /^([A-Z]{2,5}\s*\d{4,5}[A-Z]?)\b\s*(.*?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?:\s+([A-Z+\-*#]+))?$/i
        );
        if (courseMatch) {
          flushLastCourse();
          awaitingStudentBasedProgram = false;
          const rawPubCode = courseMatch[1].toUpperCase().replace(/\s+/g, '');
          const firstLineDesc = courseMatch[2].trim();
          const att = parseFloat(courseMatch[3]);
          const earn = parseFloat(courseMatch[4]);
          const pts = parseFloat(courseMatch[5]);
          const rawGrade = courseMatch[6] ? courseMatch[6].trim().toUpperCase() : null;

          const courseObj = {
            publishedCode: rawPubCode,
            courseName: firstLineDesc,
            att,
            earn,
            pts,
            rawGrade,
            term: currentTerm
          };
          rawExtractedCourses.push(courseObj);
          lastCourse = courseObj;
          continue;
        }

        // Student-Based Transfer Course Row with "TR" code column (e.g. "TR ENGLISH LITERATURE & 3.00 3.00 0.00 TR-P")
        const trMatch = line.match(
          /^TR\b\s+(.+?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?:\s+([A-Z+\-*#]+))?$/i
        );
        if (trMatch) {
          flushLastCourse();
          awaitingStudentBasedProgram = false;
          const firstLineDesc = trMatch[1].trim();
          const att = parseFloat(trMatch[2]);
          const earn = parseFloat(trMatch[3]);
          const pts = parseFloat(trMatch[4]);
          const rawGrade = trMatch[5] ? trMatch[5].trim().toUpperCase() : 'TR-P';
          const synthCode = `GE${String(11005 + synthTrCounter++)}`;

          const courseObj = {
            publishedCode: synthCode,
            courseName: firstLineDesc,
            att,
            earn,
            pts,
            rawGrade,
            term: 'TRANSFER_TERM'
          };
          rawExtractedCourses.push(courseObj);
          lastCourse = courseObj;
          continue;
        }

        // Section 2.2.2 Wrapped Course Description Continuation Rule (CRITICAL):
        // Append to lastCourse["courseName"] if and only if descMinX <= firstX0 <= descMaxX
        if (lastCourse && firstX0 >= col.descMinX && firstX0 <= col.descMaxX) {
          if (lastCourse.courseName.endsWith('-')) {
            lastCourse.courseName += line;
          } else {
            lastCourse.courseName += ` ${line}`;
          }
          continue;
        }

        flushLastCourse();
      }
      flushLastCourse();
    }
  }

  // Convert rawExtractedCourses into standardized records for processRawCourseRecords
  const convertedRecords = [];
  for (const item of rawExtractedCourses) {
    const cleanTitle = normalizeGeTagTypos(item.courseName);
    const { cleanGrade, isRetakeFlagged, rawGrade } = normalizeTranscriptGrade(item.rawGrade);

    let status = 'Complete';
    let credits = item.earn > 0 ? item.earn : item.att;
    let grade = cleanGrade;
    let isUnearnedAttempt = false;
    let excludeReason = null;

    // Section 3.1: Resolving 0.00 Attempted / 0.00 Earned In-Progress Courses
    if (
      item.att === 0 &&
      item.earn === 0 &&
      (!cleanGrade || cleanGrade === 'IP' || cleanGrade === 'PR')
    ) {
      status = 'Current';
      grade = '';
      credits = inferCurrentCourseCredits(item.publishedCode, cleanTitle, options.masterDb);
    } else if (cleanGrade && item.earn === 0 && !cleanGrade.startsWith('TR')) {
      // Section 3.2.5 & Section 4: Unearned attempt or superseded retake (Earn == 0.00 when Letter Grade is present)
      status = 'Excluded';
      isUnearnedAttempt = true;
      credits =
        item.att > 0
          ? item.att
          : inferCurrentCourseCredits(item.publishedCode, cleanTitle, options.masterDb);
      excludeReason = isRetakeFlagged
        ? 'Excluded: Repeat / Retake'
        : `Excluded Grade (${cleanGrade})`;
    } else if (item.term === 'TRANSFER_TERM' || cleanGrade.startsWith('TR')) {
      status = 'Transfer';
      grade = cleanGrade || 'TR-P';
      credits = item.earn > 0 ? item.earn : item.att;
    }

    convertedRecords.push({
      publishedCode: item.publishedCode,
      code: item.publishedCode,
      title: cleanTitle,
      credits,
      grade,
      rawGrade,
      isRetakeFlagged,
      isUnearnedAttempt,
      excludeReason,
      qualityPoints: item.pts,
      status,
      term: item.term,
      fromTranscriptPdf: true
    });
  }

  return {
    metadata,
    convertedRecords,
    reconstructedText: reconstructedLines.join('\n')
  };
}

/**
 * Deterministic Client-Side PDF Transcript Parser (parseTranscriptPdf)
 * per directives/ExtractTranscriptFile.md.
 */
export async function parseTranscriptPdf(pdfArrayBuffer, options = {}) {
  const { metadata, convertedRecords, reconstructedText } = await extractSpatialTranscriptFromPdf(
    pdfArrayBuffer,
    options
  );

  const processed = processRawCourseRecords(convertedRecords, {
    ...options,
    isTranscriptPdf: true,
    studentMetadata: {
      ...metadata,
      ...(options.studentMetadata || {})
    }
  });

  processed.reconstructedText = reconstructedText;
  return processed;
}

/**
 * Deterministic Verification Check for Unofficial Student Transcript text extracted from PDF
 * per directives/ExtractTranscriptFile.md.
 */
export function verifyTranscriptText(rawText) {
  const str = String(rawText || '').trim();
  if (!str || str.length < 25) {
    return {
      isValid: false,
      errorCode: 'EMPTY_TRANSCRIPT_TEXT',
      errorMessage:
        'The uploaded PDF contains no readable text. Scanned document images without text layers cannot be parsed locally.'
    };
  }

  // Check 1: Academic Term signature
  const hasTermKeyword =
    /Term\s*:|Semester\s*:|TRANSFER_TERM|Transfer Term|\b(?:Fall|Spring|Summer)(?:_|\s+)(?:20)?\d{2}\b/i.test(
      str
    );

  // Check 2: Academic Record identifier
  const hasRecordIdentifier =
    /Program\s*:|Enrollment\s*#|Student\s*ID|\*{3}Undergraduate\*{3}|Student\s*Name|Student\s*:|Academic\s*Advisor/i.test(
      str
    );

  // Check 3: At least 1 valid course code line (including 0.00 / CURRENT in-progress rows)
  const lines = str.split(/\r?\n/);
  let courseMatchCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      /^[A-Z]{2,5}\s*[-\s]?\s*\d{3,5}[A-Z]?\s+.+?\s+\d+(?:\.\d{1,2})?\s+(?:\d+(?:\.\d{1,2})?\s+\d+(?:\.\d{1,2})?\s+)?(?:A\+|A-|A|AH|B\+|B-|B|BH|C\+|C-|C|CH|D\+|D-|D|DH|F|W|AF|WF|IP|TR(?:-[A-Z]+)?|CR|P|INC|SCHED|SCHEDULED|CURRENT)\b/i.test(
        trimmed
      ) ||
      /^[A-Z]{2,5}\s*\d{4,5}[A-Z]?\b\s+.*?\s+\d+\.\d{2}\s+\d+\.\d{2}\s+\d+\.\d{2}/i.test(trimmed)
    ) {
      courseMatchCount += 1;
    }
  }

  if (!hasTermKeyword && !hasRecordIdentifier) {
    return {
      isValid: false,
      errorCode: 'MISSING_TRANSCRIPT_SIGNATURE',
      errorMessage:
        'The uploaded PDF is missing required academic transcript headers (e.g. Program, Enrollment #, or Academic Terms).'
    };
  }

  if (courseMatchCount === 0) {
    return {
      isValid: false,
      errorCode: 'NO_COURSE_RECORDS_FOUND',
      errorMessage:
        'No academic course records were found in the uploaded PDF. Please ensure you uploaded an official or unofficial course transcript.'
    };
  }

  return {
    isValid: true,
    errorCode: null,
    errorMessage: null,
    courseMatchCount
  };
}

/**
 * Helper to parse reconstructed or raw transcript text lines into course row objects and metadata.
 */
function parseTranscriptLinesInternal(rawText, options = {}) {
  const lines = String(rawText || '').split(/\r?\n/);
  const extractedRows = [];
  const studentMetadata = {
    name: '',
    student_name: '',
    studentId: '',
    student_id: '',
    dob: '',
    original_start_date: '',
    transcript_date: '',
    student_gpa: null,
    email: '',
    catalogYear: '2026-2027',
    major: '',
    program: '',
    concentrations: []
  };

  let currentTerm = 'Fall 2025';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Extract metadata headers if present
    const studentHeaderMatch = line.match(
      /Student:\s*([A-Za-z\s\-'.]+?)(?=\s+Student ID:|\s+DOB:|$)/i
    );
    if (studentHeaderMatch && !studentMetadata.name) {
      studentMetadata.name = studentHeaderMatch[1].trim();
      studentMetadata.student_name = studentMetadata.name;
    }

    const nameMatch = line.match(/Student Name\s*:\s*(.+)/i);
    if (nameMatch && !studentMetadata.name) {
      studentMetadata.name = nameMatch[1].trim();
      studentMetadata.student_name = studentMetadata.name;
    }

    const idMatch = line.match(/(?:Student ID|Enrollment\s*#)\s*:\s*(A\d{8,10}|[A-Za-z0-9\-]+)/i);
    if (idMatch && !studentMetadata.studentId) {
      studentMetadata.studentId = idMatch[1].trim();
      studentMetadata.student_id = studentMetadata.studentId;
    }

    const dobMatch = line.match(/DOB:\s*(\d{2}\/\d{4})/i);
    if (dobMatch && !studentMetadata.dob) studentMetadata.dob = dobMatch[1].trim();

    const origStartMatch = line.match(
      /(?:Original Start Date|Start Date):\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
    );
    if (origStartMatch && !studentMetadata.original_start_date) {
      studentMetadata.original_start_date = origStartMatch[1].trim();
    }

    const gpaMatch = line.match(/Student GPA:\s*([\d.]+)/i);
    if (gpaMatch && studentMetadata.student_gpa === null) {
      studentMetadata.student_gpa = Number(parseFloat(gpaMatch[1]).toFixed(2));
    }

    const progMatch = line.match(/^Program\s*:\s*(.+)/i);
    if (progMatch && !studentMetadata.program) {
      studentMetadata.program = progMatch[1].trim();
      studentMetadata.major = studentMetadata.program;
    }

    const concMatch = line.match(/^Concentration\(s\):\s*(.+)$/i);
    if (concMatch) {
      const parts = concMatch[1]
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const pt of parts) {
        if (!studentMetadata.concentrations.includes(pt)) {
          studentMetadata.concentrations.push(pt);
        }
      }
      continue;
    }

    // Detect Term headers (e.g., "Term: FALL_23", "Term: TRANSFER_TERM", "Fall 2024", "Spring 2025")
    const termMatch = line.match(/Term\s*:\s*([A-Za-z0-9_\s]+?)(?:\s+\d{1,2}\/\d{1,2}\/\d{4}|$)/i);
    if (termMatch) {
      currentTerm = normalizeTranscriptTerm(termMatch[1].trim());
      continue;
    }

    const termHeaderMatch = line.match(
      /^(?:Term|Semester)?\s*:?\s*((?:Fall|Spring|Summer)\s+20\d{2}|20\d{2}\s*(?:FA|SP|SU)(?:-[I]{1,2})?|Transfer Credit(?:s)?)$/i
    );
    if (termHeaderMatch) {
      currentTerm = termHeaderMatch[1].trim();
      continue;
    }

    // Match 6-column Anthology PDF format (including 0.00 / no-grade or CURRENT rows):
    // [Code] [Title] [Attempted] [Earned] [QualityPts] [Optional Grade]
    const m6 = line.match(
      /^([A-Z]{2,5}\s*[-\s]?\s*\d{3,5}[A-Z]?)\s+(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)(?:\s+([A-Z+\-*#]+))?$/i
    );
    if (m6) {
      const pubCode = m6[1].toUpperCase().replace(/[\s\-]+/g, '');
      const cleanTitle = normalizeGeTagTypos(m6[2].trim());
      const attempted = parseFloat(m6[3]);
      const earned = parseFloat(m6[4]);
      const pts = parseFloat(m6[5]);
      const rawGradeToken = m6[6] ? m6[6].trim().toUpperCase() : '';
      const isCurrentToken =
        !rawGradeToken || rawGradeToken === 'CURRENT' || rawGradeToken === 'IP';
      const { cleanGrade, isRetakeFlagged } = normalizeTranscriptGrade(
        isCurrentToken ? '' : rawGradeToken
      );

      let status = 'Complete';
      let credits = earned > 0 ? earned : attempted;
      let grade = cleanGrade;
      let isUnearnedAttempt = false;
      let excludeReason = null;

      if (attempted === 0 && earned === 0 && isCurrentToken) {
        status = 'Current';
        grade = '';
        credits = inferCurrentCourseCredits(pubCode, cleanTitle, options.masterDb);
      } else if (cleanGrade && earned === 0 && !cleanGrade.startsWith('TR')) {
        status = 'Excluded';
        isUnearnedAttempt = true;
        credits =
          attempted > 0
            ? attempted
            : inferCurrentCourseCredits(pubCode, cleanTitle, options.masterDb);
        excludeReason = isRetakeFlagged
          ? 'Excluded: Repeat / Retake'
          : `Excluded Grade (${cleanGrade})`;
      } else if (currentTerm === 'TRANSFER_TERM' || cleanGrade.startsWith('TR')) {
        status = 'Transfer';
        grade = cleanGrade || 'TR-P';
      }

      extractedRows.push({
        code: m6[1],
        publishedCode: pubCode,
        title: cleanTitle,
        credits,
        grade,
        isRetakeFlagged,
        isUnearnedAttempt,
        excludeReason,
        qualityPoints: pts,
        status,
        term: currentTerm,
        fromTranscriptPdf: true
      });
      continue;
    }

    // Match standard 4-column format: DEPT NUMBER Title Credits Grade
    const courseLineMatch = line.match(
      /^([A-Z]{2,5}\s*[-\s]?\s*\d{3,5}[A-Z]?)\s+(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(A\+|A-|A|AH|B\+|B-|B|BH|C\+|C-|C|CH|D\+|D-|D|DH|F|W|AF|WF|IP|TR(?:-[A-Z]+)?|CR|P|INC|SCHED|SCHEDULED|CURRENT)\b/i
    );
    if (courseLineMatch) {
      const rawToken = courseLineMatch[4].toUpperCase();
      const isCurrent = rawToken === 'CURRENT' || rawToken === 'IP';
      extractedRows.push({
        code: courseLineMatch[1],
        title: normalizeGeTagTypos(courseLineMatch[2].trim()),
        credits: parseFloat(courseLineMatch[3]),
        grade: isCurrent ? '' : rawToken,
        status: isCurrent ? 'Current' : 'Complete',
        term: currentTerm,
        fromTranscriptPdf: true
      });
    }
  }

  return { extractedRows, studentMetadata };
}

/**
 * Parse Unofficial Transcript text lines (extracted from PDF via pdfjs-dist or raw text).
 */
export function parseTranscriptText(rawText, options = {}) {
  const { extractedRows, studentMetadata } = parseTranscriptLinesInternal(rawText, options);
  return processRawCourseRecords(extractedRows, {
    ...options,
    isTranscriptPdf: true,
    studentMetadata: { ...studentMetadata, ...(options.studentMetadata || {}) }
  });
}

/**
 * Parse combined Anthology Spreadsheet (.xlsx/.csv) and/or Unofficial Transcript text.
 * When both are provided, all course records are merged and deduplicated via processRawCourseRecords.
 */
export function parseCombinedStudentRecords({
  anthologyBufferOrString,
  transcriptText,
  options = {}
}) {
  const combinedRows = [];
  let detectedMetadata = {};

  if (anthologyBufferOrString) {
    let workbook;
    if (typeof anthologyBufferOrString === 'string') {
      workbook = XLSX.read(anthologyBufferOrString, { type: 'string' });
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(anthologyBufferOrString)) {
      workbook = XLSX.read(anthologyBufferOrString, { type: 'buffer' });
    } else {
      workbook = XLSX.read(anthologyBufferOrString, { type: 'array' });
    }
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    combinedRows.push(...rows);
  }

  if (transcriptText) {
    const { extractedRows, studentMetadata } = parseTranscriptLinesInternal(
      transcriptText,
      options
    );
    combinedRows.push(...extractedRows);
    detectedMetadata = { ...studentMetadata };
  }

  return processRawCourseRecords(combinedRows, {
    ...options,
    isTranscriptPdf: Boolean(transcriptText && !anthologyBufferOrString),
    studentMetadata: {
      ...detectedMetadata,
      ...(options.studentMetadata || {})
    }
  });
}

/**
 * Extract plain text from an Unofficial Transcript PDF client-side in browser memory.
 * Uses the spatial two-column newspaper order and wrapped line stitcher from extractSpatialTranscriptFromPdf.
 */
export async function extractTextFromPdf(pdfBytesOrBuffer) {
  try {
    const { reconstructedText } = await extractSpatialTranscriptFromPdf(pdfBytesOrBuffer);
    return reconstructedText;
  } catch (err) {
    console.warn('PDF text extraction error:', err);
    return '';
  }
}

/**
 * Parse student info text or CSV format (e.g. student info.txt) client-side.
 */
export function parseStudentInfoFile(rawText, matchIdentifier = null) {
  if (!rawText) return null;
  const lines = String(rawText).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;

  // Format B: CSV (first line has commas and StudentID/FullName)
  if (lines[0].includes(',') && lines[0].toLowerCase().includes('studentid')) {
    const headers = lines[0].split(',').map((h) => h.trim());
    const students = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (parts.length < 2) continue;
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] || '';
      });
      students.push({
        studentId: row.StudentID || '',
        name: row.FullName || '',
        status: row.Status || '',
        enrollmentStatus: row.EnrollmentStatus || 'Full Time',
        pacingMode:
          row.EnrollmentStatus === 'Part-Time' || row.EnrollmentStatus === '3/4 Time'
            ? 'Part-Time'
            : 'Full-Time',
        programVersion: row.ProgramVersion || '',
        programCode: row.ProgramCode || '',
        catalogYear: row.CatalogYear || '2026-2027',
        gpa: row.GPA || '',
        creditsEarned: parseFloat(row.CreditsEarned) || 0,
        expectedGradDate: row.ExpectedGradDate || '',
        advisor: row.Advisor || '',
        email: row.Email || '',
        phone: row.Phone || ''
      });
    }

    if (matchIdentifier) {
      const cleanMatch = String(matchIdentifier).toLowerCase().trim();
      const found = students.find(
        (s) =>
          s.studentId.toLowerCase() === cleanMatch ||
          s.name.toLowerCase().includes(cleanMatch)
      );
      if (found) return found;
    }
    return students;
  }

  // Format A: Key-Value pairs
  const info = {};
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      info[match[1].trim()] = match[2].trim();
    }
  }

  return {
    studentId: info.StudentID || info.studentId || '',
    name: info.FullName || info.name || '',
    status: info.Status || '',
    enrollmentStatus: info.EnrollmentStatus || 'Full Time',
    pacingMode:
      info.EnrollmentStatus === 'Part-Time' || info.EnrollmentStatus === '3/4 Time'
        ? 'Part-Time'
        : 'Full-Time',
    programVersion: info.ProgramVersion || info.major || '',
    programCode: info.ProgramCode || '',
    catalogYear: info.CatalogYear || '2026-2027',
    gpa: info.GPA || info.gpa || '',
    creditsEarned: parseFloat(info.CreditsEarned) || 0,
    expectedGradDate: info.ExpectedGradDate || '',
    advisor: info.Advisor || '',
    email: info.Email || '',
    phone: info.Phone || ''
  };
}

/**
 * Extract embedded DegreePlanState JSON from a Returning Student Degree Plan PDF (.pdf).
 */
export async function extractStateFromDegreePlanPdf(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const keywords = pdfDoc.getKeywords();
  const subject = pdfDoc.getSubject();

  // Check custom subject/keywords JSON payload (supporting both DegreePlanState and legacy prefix)
  for (const candidate of [subject, keywords]) {
    if (!candidate) continue;
    let b64 = null;
    if (candidate.includes('DegreePlanState:')) {
      b64 = candidate.split('DegreePlanState:')[1].trim();
    } else if (candidate.includes('LindenwoodDegreePlanState:')) {
      b64 = candidate.split('LindenwoodDegreePlanState:')[1].trim();
    }

    if (b64) {
      const jsonStr =
        typeof atob === 'function'
          ? decodeURIComponent(escape(atob(b64)))
          : Buffer.from(b64, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    }
  }
  return null;
}
