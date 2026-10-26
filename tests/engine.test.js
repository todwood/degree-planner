import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import masterDb from '../src/data/masterDatabase.json';
import {
  normalizeCourseCode,
  processRawCourseRecords,
  parseAnthologySpreadsheet,
  verifyAnthologySpreadsheet,
  STANDARD_ANTHOLOGY_HEADERS,
  verifyTranscriptText,
  parseTranscriptText,
  parseTranscriptPdf,
  verifyDocumentCurrency,
  parseCombinedStudentRecords
} from '../src/engine/transcriptParser.js';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';
import {
  generateOptimalSchedule,
  validateScheduleMove,
  calculateRegistrationOpeningNotice
} from '../src/engine/scheduler.js';

describe('Phase 2 & Phase 3: Deterministic Engine Verification Suite', () => {
  describe('1. Transcript & Anthology File Parser (transcriptParser.js)', () => {
    it('normalizes canonical and compact course codes accurately', () => {
      const n1 = normalizeCourseCode('ics-21300-01');
      expect(n1.canonical).toBe('ICS 21300');
      expect(n1.compact).toBe('ICS21300');
      expect(n1.number).toBe(21300);

      const n2 = normalizeCourseCode('TR: ENGL15000');
      expect(n2.canonical).toBe('ENGL 15000');
      expect(n2.compact).toBe('ENGL15000');
    });

    it('filters excluded grades (F, W, AF), sub-10000 courses, deduplicates retakes, and waives UNIV/LUL when TR > 0', () => {
      const sampleRows = [
        // Transfer course -> triggers UNIV/LUL waiver
        { 'Course Code': 'HIST 10500', 'Course Title': 'U.S. History to 1877 (GE-HC: USHisGov)', Credits: 3, Grade: 'TR', Term: 'Transfer' },
        // Sub-10000 preparatory course -> Excluded
        { 'Course Code': 'MTH 09500', 'Course Title': 'Basic Math Skills', Credits: 3, Grade: 'A', Term: '2024FA-I' },
        // Excluded grades F, W, AF -> Excluded
        { 'Course Code': 'ICS 21300', 'Course Title': 'Foundations of IT', Credits: 3, Grade: 'F', Term: '2024FA-I' },
        { 'Course Code': 'PSY 10000', 'Course Title': 'Principles of Psychology', Credits: 3, Grade: 'W', Term: '2024FA-II' },
        { 'Course Code': 'ART 18100', 'Course Title': 'Art Appreciation', Credits: 3, Grade: 'AF', Term: '2024FA-II' },
        // Retake deduplication: D in Fall 2024 vs A in Spring 2025 -> Keeps single A (3cr), puts D in excluded ledger
        { 'Course Code': 'ICS 21400', 'Course Title': 'Foundations of Networking', Credits: 3, Grade: 'D', Term: '2024FA-II' },
        { 'Course Code': 'ICS 21400', 'Course Title': 'Foundations of Networking', Credits: 3, Grade: 'A', Term: '2025SP-I' },
        // Valid Completed course
        { 'Course Code': 'ICS 21300', 'Course Title': 'Foundations of IT', Credits: 3, Grade: 'B', Term: '2025SP-I' },
        // Current In-Progress course
        { 'Course Code': 'MTH 14100', 'Course Title': 'Basic Statistics', Credits: 3, Grade: 'IP', Status: 'In Progress', Term: '2026SP-I' },
        // Scheduled Future course
        { 'Course Code': 'ICS 31000', 'Course Title': 'Foundations of Cybersecurity', Credits: 3, Status: 'Scheduled', Term: '2026SP-II' }
      ];

      const parsed = processRawCourseRecords(sampleRows, { referenceYear: 2026 });

      expect(parsed.summary.totalTransferCredits).toBe(3);
      expect(parsed.summary.univLulWaived).toBe(true);
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(6); // ICS 21400 (A) + ICS 21300 (B)
      expect(parsed.summary.totalCurrentCredits).toBe(3); // MTH 14100
      expect(parsed.summary.totalScheduledCredits).toBe(3); // ICS 31000
      expect(parsed.summary.totalEarnedAndEnrolledCredits).toBe(15);

      // Verify ICS 21400 kept grade 'A'
      const ics214 = parsed.validCourses.find((c) => c.compactCode === 'ICS21400');
      expect(ics214.grade).toBe('A');

      // Verify Excluded Ledger contains 5 items: MTH 09500, ICS 21300 (F), PSY 10000 (W), ART 18100 (AF), ICS 21400 (D retake)
      expect(parsed.excludedCourses.length).toBe(5);
      expect(parsed.harvestedOfferings.length).toBeGreaterThanOrEqual(3);
    });

    it('parses CSV string via SheetJS and raw transcript text accurately', () => {
      const csvData = `Course Code,Course Title,Credits,Grade,Term\nENGL 15000,Beyond the Blank Page,3,A,2025FA-I\nENGL 17000,Research and Argumentation,3,B,2025FA-II`;
      const csvParsed = parseAnthologySpreadsheet(csvData);
      expect(csvParsed.validCourses.length).toBe(2);

      const textData = `
        Student Name: Alex Roar
        Student ID: LU9001234
        Fall 2025
        ICS 21300 Foundations of Information Technology 3.00 A
        MTH 14100 Basic Statistics 3.00 B
      `;
      const textParsed = parseTranscriptText(textData);
      expect(textParsed.studentMetadata.name).toBe('Alex Roar');
      expect(textParsed.validCourses.length).toBe(2);
    });

    it('parses combined records when both Anthology and Transcript are provided without duplicate inflation', () => {
      const csvData = `Course Code,Course Title,Credits,Grade,Term
ICS 21300,Foundations of IT,3,A,2025FA-I
MTH 14100,Basic Statistics,3,B,2025FA-I`;

      const textData = `Student Name: Jordan Lion
ICS 21300 Foundations of Information Technology 3.00 A
ICS 21400 Foundations of Networking 3.00 A`;

      const combined = parseCombinedStudentRecords({
        anthologyBufferOrString: csvData,
        transcriptText: textData,
        options: { referenceYear: 2026 }
      });

      // ICS 21300 was in both -> deduplicated once!
      // Total courses should be 3: ICS 21300, MTH 14100, ICS 21400
      expect(combined.validCourses.length).toBe(3);
      expect(combined.summary.totalEarnedAndEnrolledCredits).toBe(9);
      expect(combined.studentMetadata.name).toBe('Jordan Lion');
    });

    it('verifies Anthology spreadsheet headers and rejects wrong documents', () => {
      const wrongCsv = `Student Name,Major,GPA\nJane Doe,Cybersecurity,3.9`;
      const badCheck = verifyAnthologySpreadsheet(wrongCsv);
      expect(badCheck.isValid).toBe(false);
      expect(badCheck.errorCode).toBe('INVALID_ANTHOLOGY_HEADERS');
      expect(badCheck.missingColumns).toContain('Published Code');

      const validCsv = `${STANDARD_ANTHOLOGY_HEADERS.join(',')}\nICS42100-23,Ethical Hacking,ICS42100,OL1,FALL_I_26_8W,Complete,A,2026-08-24,Faculty,3.0,0.0,MAIN Campus,3.0,0.0,,Online,4.0,,CYBSCBS/Cybersecurity BS/ATT`;
      const goodCheck = verifyAnthologySpreadsheet(validCsv);
      expect(goodCheck.isValid).toBe(true);
      expect(goodCheck.exact20ColumnMatch).toBe(true);
      expect(goodCheck.validCourseRows).toBe(1);
    });

    it('verifies Unofficial Transcript text and rejects non-transcript documents', () => {
      // 1. Rejects empty text
      const emptyCheck = verifyTranscriptText('');
      expect(emptyCheck.isValid).toBe(false);
      expect(emptyCheck.errorCode).toBe('EMPTY_TRANSCRIPT_TEXT');

      // 2. Rejects random non-transcript document (e.g. course syllabus or memo)
      const syllabusText = `Lindenwood University - Course Syllabus\nFall 2026\nInstructor: Dr. Smith\nOffice Hours: Mon/Wed 2pm\nRequired Textbook: Intro to CS`;
      const badCheck = verifyTranscriptText(syllabusText);
      expect(badCheck.isValid).toBe(false);
      expect(['MISSING_TRANSCRIPT_SIGNATURE', 'NO_COURSE_RECORDS_FOUND']).toContain(badCheck.errorCode);

      // 3. Validates Enrollment-Based Transcript text (Format A)
      const validEnrollmentBasedText = `
Lindenwood University
Program: Cybersecurity BS
Enrollment #: 202410012
Status: Active
Term: FALL_24_16W Fall 2024 - 16 Week Session 8/26/2024 - 12/13/2024
Course Description Attempt Earned Pts Grade
ICS 21300 Foundations of Information Technology 3.00 3.00 12.00 A
MTH 14100 Basic Statistics (GE-Math) 3.00 3.00 9.00 B
      `;
      const goodCheckA = verifyTranscriptText(validEnrollmentBasedText);
      expect(goodCheckA.isValid).toBe(true);
      expect(goodCheckA.courseMatchCount).toBe(2);

      // 4. Validates Student-Based Transcript text (Format B)
      const validStudentBasedText = `
***Undergraduate***
Student ID: 1234567
Term: Fall 2024
Course Description Attempt Earned Pts Grade
CSC 10011 Introduction to Coding 3.00 3.00 12.00 A
      `;
      const goodCheckB = verifyTranscriptText(validStudentBasedText);
      expect(goodCheckB.isValid).toBe(true);
      expect(goodCheckB.courseMatchCount).toBe(1);
    });

    it('matches Section 6 Calibration Benchmark on Brandon Paz Anthology export', () => {
      const samplePath = path.join(
        process.cwd(),
        '.tmp',
        'samples',
        'Brandon Paz',
        'StudentCourseSchedules (All Results).xlsx'
      );
      if (!fs.existsSync(samplePath)) {
        return;
      }
      const buf = fs.readFileSync(samplePath);
      const vCheck = verifyAnthologySpreadsheet(buf);
      expect(vCheck.isValid).toBe(true);
      expect(vCheck.exact20ColumnMatch).toBe(true);

      const parsed = parseAnthologySpreadsheet(buf);
      const s = parsed.summary;

      expect(s.totalRawRows).toBe(78);
      expect(s.droppedNoiseRows).toBe(34);
      expect(s.validCourseRows).toBe(44);
      expect(s.ignoredUnscheduledFutureRows).toBe(15);
      expect(s.ignoredUnscheduledFutureCredits).toBe(46);
      expect(s.activeUniqueCourseCount).toBe(29);
      expect(s.totalTransferCredits).toBe(6);
      expect(s.univLulWaived).toBe(true);
      expect(s.totalCompletedLindenwoodCredits).toBe(68);
      expect(s.totalCompletedCredits).toBe(74);
      expect(s.totalCurrentCredits).toBe(10);
      expect(s.totalEarnedAndEnrolledCredits).toBe(84);
      expect(s.lindenwoodResidencyCredits).toBe(78);
      expect(s.upperLevelCourseCount).toBe(10);
      expect(s.upperLevelCredits).toBe(30);
      expect(s.upperLevelCreditsNeeded).toBe(12);
      expect(s.hdCourseCount).toBe(2);
      expect(s.hdCredits).toBe(6);
      expect(s.hdSatisfied).toBe(true);

      // Verify Minor Tag Preservation on CINE11000
      const cine11 = parsed.validCourses.find((c) => c.compactCode === 'CINE11000');
      expect(cine11.areaOfStudy).toContain('Minor - Cinema Arts Minor');
      expect(parsed.studentMetadata.major).toBe('Cybersecurity BS');
      expect(parsed.studentMetadata.catalogYear).toBe('2024-2025');
    });

    it('successfully verifies and parses Brandon Paz Unofficial Transcripts (Variant A and B)', async () => {
      const sampleDir = path.join(process.cwd(), '.tmp', 'samples', 'Brandon Paz');
      if (!fs.existsSync(sampleDir)) return;

      const pdfAPath = path.join(sampleDir, 'sub_Transcript - UnOfficial_landscape.pdf');
      const pdfBPath = path.join(sampleDir, 'sub_UnofficialTranscript - Student Based_landscape.pdf');

      // Test Variant A (Enrollment-Based)
      const bufA = fs.readFileSync(pdfAPath);
      const parsedA = await parseTranscriptPdf(bufA, { masterDb });
      expect(parsedA.reconstructedText).toBeDefined();
      const verifyA = verifyTranscriptText(parsedA.reconstructedText);
      expect(verifyA.isValid).toBe(true);

      const currencyA = verifyDocumentCurrency(parsedA, 'Transcript', { referenceDate: '2026-10-23' });
      expect(currencyA.isCurrent).toBe(true);
      expect(parsedA.summary.activeUniqueCourseCount).toBe(29);
      expect(parsedA.summary.totalCompletedCredits).toBe(74);
      expect(parsedA.summary.totalCurrentCredits).toBe(10);
      expect(parsedA.summary.totalEarnedAndEnrolledCredits).toBe(84);
      expect(parsedA.studentMetadata.student_name).toBe('Brandon M Paz');
      expect(parsedA.studentMetadata.student_id).toBe('A003014354');
      expect(parsedA.studentMetadata.program).toBe('Cybersecurity');

      // Test Variant B (Student-Based)
      const bufB = fs.readFileSync(pdfBPath);
      const parsedB = await parseTranscriptPdf(bufB, { masterDb });
      expect(parsedB.reconstructedText).toBeDefined();
      const verifyB = verifyTranscriptText(parsedB.reconstructedText);
      expect(verifyB.isValid).toBe(true);

      const currencyB = verifyDocumentCurrency(parsedB, 'Transcript', { referenceDate: '2026-10-23' });
      expect(currencyB.isCurrent).toBe(true);
      expect(parsedB.summary.activeUniqueCourseCount).toBe(29);
      expect(parsedB.summary.totalCompletedCredits).toBe(74);
      expect(parsedB.summary.totalCurrentCredits).toBe(10);
      expect(parsedB.summary.totalEarnedAndEnrolledCredits).toBe(84);
      expect(parsedB.studentMetadata.student_name).toBe('Brandon M Paz');
      expect(parsedB.studentMetadata.student_id).toBe('A003014354');
      expect(parsedB.studentMetadata.program).toBe('Cybersecurity');
    });
  });

  describe('2. 5-Layer Waterfall Audit Engine (waterfallAudit.js)', () => {
    it('enforces C-or-higher on ENGL 15000 / ENGL 17000, MTH 14100 dual-satisfaction, and legacy substitutions', () => {
      const parsed = processRawCourseRecords([
        // Grade of D in ENGL 15000 -> Must NOT satisfy Comp I, but counts toward 120 total credits!
        { code: 'ENGL 15000', title: 'Beyond the Blank Page', credits: 3, grade: 'D', term: '2025FA-I' },
        // Grade of B in ENGL 17000 -> Satisfies Comp II
        { code: 'ENGL 17000', title: 'Research and Argumentation', credits: 3, grade: 'B', term: '2025FA-II' },
        // MTH 14100 -> Dual-satisfies GE Math (Bucket 3) and Major Math (summed once!)
        { code: 'MTH 14100', title: 'Basic Statistics (GE-Math)', credits: 3, grade: 'A', term: '2025FA-I' },
        // Legacy course ICS 41100 -> Satisfies ICS 41500!
        { code: 'ICS 41100', title: 'Cloud Computing Concepts', credits: 3, grade: 'A', term: '2024FA-I' },
        // Legacy course ICS 41400 -> Satisfies ICS 41700!
        { code: 'ICS 41400', title: 'Cloud Architecture', credits: 3, grade: 'B', term: '2024FA-II' },
        // 1 HD course (SOC 10200) -> leaves 1 HD deficit to be tagged onto a remaining GE placeholder
        { code: 'SOC 10200', title: 'Basic Concepts of Sociology (GE-SocSci / HD)', credits: 3, grade: 'A', term: '2025SP-I' }
      ]);

      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      // Comp I must be UNFULFILLED because grade was D
      const comp1 = audit.geBuckets.find((b) => b.bucket_id === 'comp_1');
      expect(comp1.fulfilled).toBe(false);
      expect(audit.warnings.compositionGatekeeperWarnings.length).toBe(1);

      // Comp II must be FULFILLED
      const comp2 = audit.geBuckets.find((b) => b.bucket_id === 'comp_2');
      expect(comp2.fulfilled).toBe(true);

      // ENGL 15000 (D) must be in claimedFreeElectives and counted toward completed credits (18cr total)
      expect(audit.claimedFreeElectives.some((c) => c.compactCode === 'ENGL15000')).toBe(true);
      expect(audit.policyChecklist.totalCredits.completed).toBe(18);

      // MTH 14100 dual-satisfies GE Math AND Major Math
      const geMath = audit.geBuckets.find((b) => b.bucket_id === 'math');
      expect(geMath.fulfilled).toBe(true);
      expect(audit.majorMathRequirements[0].fulfilled).toBe(true);

      // ICS 41500 and ICS 41700 satisfied via legacy substitutions ICS 41100 & ICS 41400
      const req415 = audit.majorRequirements.find((r) => r.compactCode === 'ICS41500');
      const req417 = audit.majorRequirements.find((r) => r.compactCode === 'ICS41700');
      expect(req415.fulfilled).toBe(true);
      expect(req417.fulfilled).toBe(true);

      // Human Diversity: 1 completed (SOC 10200), 1 remaining tagged on an unfulfilled GE bucket
      expect(audit.policyChecklist.humanDiversity.completedOrEnrolledCount).toBe(1);
      expect(audit.policyChecklist.humanDiversity.remainingTaggedInGE).toBe(1);
      expect(audit.policyChecklist.humanDiversity.satisfied).toBe(true);

      // Projected total credits must reach >= 120 and Upper-Level >= 42
      expect(audit.policyChecklist.totalCredits.projectedTotal).toBeGreaterThanOrEqual(120);
      expect(audit.policyChecklist.upperLevelCredits.projectedTotal).toBeGreaterThanOrEqual(42);
    });
  });

  describe('3. End-to-End Audit & Schedule Verification Across All 3 Majors', () => {
    const commonSampleRecords = [
      { code: 'ENGL 15000', title: 'Beyond the Blank Page', credits: 3, grade: 'A', term: 'Transfer' },
      { code: 'ENGL 17000', title: 'Research and Argumentation', credits: 3, grade: 'B', term: 'Transfer' },
      { code: 'MTH 14100', title: 'Basic Statistics (GE-Math)', credits: 3, grade: 'A', term: '2025FA-I' },
      { code: 'ICS 21300', title: 'Foundations of Information Technology', credits: 3, grade: 'A', term: '2025FA-I' },
      { code: 'ICS 21400', title: 'Foundations of Networking', credits: 3, grade: 'A', term: '2025FA-I' },
      { code: 'ICS 31000', title: 'Foundations of Cybersecurity', credits: 3, grade: 'A', term: '2025FA-II' },
      { code: 'IIT 21500', title: 'Programming Logic and Design', credits: 3, grade: 'B', term: '2025FA-II' },
      { code: 'IIT 22000', title: 'Hardware and Operating Systems', credits: 3, grade: 'A', term: '2026SP-I' },
      { code: 'SOC 10200', title: 'Basic Concepts of Sociology (GE-SocSci / HD)', credits: 3, grade: 'A', term: '2026SP-I' },
      { code: 'REL 20000', title: 'World Religions (GE-HC / HD)', credits: 3, grade: 'A', term: '2026SP-II' }
    ];

    it('Major 1: Cybersecurity, BS — Full Audit, Same-Semester Chaining, & Capstone Placement', () => {
      const parsed = processRawCourseRecords(commonSampleRecords);
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);
      const schedule = generateOptimalSchedule(audit, parsed, {
        startSemester: 'Fall 2026',
        pacingMode: 'Full-Time',
        summerAvailability: 'No Summer'
      });

      expect(audit.primaryProgram.name).toBe('Cybersecurity, BS');
      // 121 credits: 4cr Natural Science with Lab + 3cr electives reaches >= 120 graduation threshold
      expect(audit.policyChecklist.totalCredits.projectedTotal).toBe(121);
      expect(audit.policyChecklist.upperLevelCredits.projectedTotal).toBeGreaterThanOrEqual(42);
      expect(schedule.semesters.length).toBeGreaterThan(0);

      // Verify all remaining courses were scheduled
      const totalScheduledFutureCredits = schedule.semesters.reduce(
        (sum, s) => sum + s.totalCredits,
        0
      );
      expect(
        parsed.summary.totalEarnedAndEnrolledCredits + totalScheduledFutureCredits
      ).toBe(121);

      // Verify ICS 48900 Capstone is placed and classified as Tier 3 (Not Really Movable / Deep Slate)
      let foundCapstone = null;
      for (const sem of schedule.semesters) {
        for (const lane of Object.values(sem.lanes)) {
          for (const c of lane) {
            if (c.compactCode === 'ICS48900') {
              foundCapstone = { course: c, sem };
            }
          }
        }
      }
      expect(foundCapstone).toBeDefined();
      expect(foundCapstone.course.tactileWeight.tier).toBe(3);
      expect(foundCapstone.course.tactileWeight.colorName).toBe('Slate');
    });

    it('Major 2: IT, BS - Applications Development Emphasis — Enforces Forced Summer Exception (IIT 45200)', () => {
      const parsed = processRawCourseRecords(commonSampleRecords);
      const audit = runWaterfallAudit(parsed, 'it_app_dev_bs_2026', masterDb);
      const schedule = generateOptimalSchedule(audit, parsed, {
        startSemester: 'Fall 2026',
        pacingMode: 'Full-Time',
        summerAvailability: 'No Summer' // Explicitly test Forced Summer override for IIT 45200!
      });

      expect(audit.primaryProgram.name).toContain('Applications Development');
      expect(audit.policyChecklist.totalCredits.projectedTotal).toBe(121);

      // Verify IIT 45200 triggered a Forced Summer Alert and was scheduled in a Summer (SU) lane!
      expect(schedule.forcedSummerAlerts.length).toBeGreaterThanOrEqual(1);
      expect(schedule.forcedSummerAlerts[0].courseCode).toBe('IIT 45200');

      const forcedSummerSem = schedule.semesters.find((s) => s.isForcedSummer);
      expect(forcedSummerSem).toBeDefined();
      expect(
        forcedSummerSem.lanes.SU.some((c) => c.compactCode === 'IIT45200')
      ).toBe(true);
    });

    it('Major 3: IT, BS - Networking Emphasis — Enforces Cisco 5cr Lecture + 1cr Concurrent Lab & Session I -> II Chaining', () => {
      const parsed = processRawCourseRecords(commonSampleRecords);
      const audit = runWaterfallAudit(parsed, 'it_networking_bs_2026', masterDb);
      const schedule = generateOptimalSchedule(audit, parsed, {
        startSemester: 'Fall 2026',
        pacingMode: 'Full-Time',
        summerAvailability: 'No Summer'
      });

      expect(audit.primaryProgram.name).toContain('Networking');
      expect(audit.policyChecklist.totalCredits.projectedTotal).toBe(121);

      // Find where ICS 32300 (5cr) and ICS 32301 (1cr) are scheduled -> Must be in the exact same FA-I lane!
      // And ICS 32400 (5cr) + ICS 32401 (1cr) must chain into FA-II of that same Fall semester!
      let ciscoFallSem = null;
      for (const sem of schedule.semesters) {
        if (sem.season === 'Fall' && sem.lanes['FA-I']?.some((c) => c.compactCode === 'ICS32300')) {
          ciscoFallSem = sem;
          break;
        }
      }

      expect(ciscoFallSem).toBeDefined();
      const fa1Codes = ciscoFallSem.lanes['FA-I'].map((c) => c.compactCode);
      const fa2Codes = ciscoFallSem.lanes['FA-II'].map((c) => c.compactCode);

      // Concurrent 5cr lecture + 1cr lab in FA-I
      expect(fa1Codes).toContain('ICS32300');
      expect(fa1Codes).toContain('ICS32301');

      // Same-semester Session I -> Session II chaining into FA-II!
      expect(fa2Codes).toContain('ICS32400');
      expect(fa2Codes).toContain('ICS32401');
    });

    it('verifies Priority Registration Standing uses only credits completed prior to registration window (FA-I counts for Spring)', () => {
      // Student has 54 credits before Fall 2026, and takes 9 credits in FA-I (total 63 prior to late October Spring registration)
      const notice = calculateRegistrationOpeningNotice('Spring', 2027, 54, 9);
      expect(notice.creditsAtRegistrationWindow).toBe(63);
      expect(notice.standing).toBe('Juniors');
      expect(notice.bannerText).toContain('October');
      expect(notice.bannerText).not.toMatch(/Oct\.|\d+(st|nd|rd|th)\b/);
    });

    it('detects conflicts when dragging a course to an invalid session or before its prerequisites', () => {
      const parsed = processRawCourseRecords(commonSampleRecords);
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);
      const schedule = generateOptimalSchedule(audit, parsed, {
        startSemester: 'Fall 2026',
        pacingMode: 'Full-Time',
        summerAvailability: 'No Summer'
      });

      const ics42300 = masterDb.courses.find((c) => c.code === 'ICS 42300'); // Offered FA-II only, Prereq: ICS 42100
      const firstFall = schedule.semesters[0];

      // Moving ICS 42300 to FA-I of first Fall violates both Session Offering (FA-II only) and Prereq (ICS 42100)
      const validation = validateScheduleMove(
        { ...ics42300, compactCode: 'ICS42300' },
        firstFall,
        'FA-I',
        schedule.semesters,
        new Set(['ICS21300', 'ICS21400', 'ICS31000', 'IIT21500', 'IIT22000', 'MTH14100'])
      );

      expect(validation.hasConflict).toBe(true);
      expect(validation.conflicts.some((c) => c.type === 'SESSION_UNAVAILABLE')).toBe(true);
      expect(validation.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(true);
    });
  });
});
