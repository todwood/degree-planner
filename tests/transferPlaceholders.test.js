import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import {
  isTransferPlaceholder,
  processRawCourseRecords
} from '../src/engine/transcriptParser.js';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';

describe('Transfer Placeholders (ELECT & GE) Deduplication & Audit Exemption Suite', () => {
  describe('1. isTransferPlaceholder classification utility', () => {
    it('correctly identifies transfer placeholders for ELECT generic tiers and titles', () => {
      const electCourse1 = {
        code: 'ELECT 10000',
        compactCode: 'ELECT10000',
        department: 'ELECT',
        number: 10000,
        title: 'Free Elective 10000 Level',
        grade: 'TR-B',
        state: 'TR'
      };
      const res1 = isTransferPlaceholder(electCourse1);
      expect(res1).not.toBeNull();
      expect(res1.isPlaceholder).toBe(true);
      expect(res1.placeholderType).toBe('FREE_ELECTIVE');
      expect(res1.allowMultipleInstances).toBe(true);

      const electCourse2 = {
        code: 'ELECT 20000',
        compactCode: 'ELECT20000',
        department: 'ELECT',
        number: 20000,
        title: 'Technical Credit',
        grade: 'TR-C',
        state: 'TR'
      };
      const res2 = isTransferPlaceholder(electCourse2);
      expect(res2).not.toBeNull();
      expect(res2.isPlaceholder).toBe(true);
      expect(res2.placeholderType).toBe('FREE_ELECTIVE');
      expect(res2.allowMultipleInstances).toBe(true);
    });

    it('correctly identifies transfer placeholders for GE generic tiers and titles', () => {
      const geCourse = {
        code: 'GE 10000',
        compactCode: 'GE10000',
        department: 'GE',
        number: 10000,
        title: 'GE-Humanities',
        grade: 'TR-C',
        state: 'TR'
      };
      const res = isTransferPlaceholder(geCourse);
      expect(res).not.toBeNull();
      expect(res.isPlaceholder).toBe(true);
      expect(res.placeholderType).toBe('GENERAL_EDUCATION');
      expect(res.allowMultipleInstances).toBe(true);
    });

    it('strictly rejects standard institutional courses and non-transfer courses', () => {
      // Standard institutional course retake attempt
      const icsCourse = {
        code: 'ICS 21300',
        compactCode: 'ICS21300',
        department: 'ICS',
        number: 21300,
        title: 'Foundations of Information Technology',
        grade: 'A',
        state: 'Completed'
      };
      expect(isTransferPlaceholder(icsCourse)).toBeNull();

      // Standard math course
      const mthCourse = {
        code: 'MTH 14100',
        compactCode: 'MTH14100',
        department: 'MTH',
        number: 14100,
        title: 'Basic Statistics',
        grade: 'TR',
        state: 'TR'
      };
      expect(isTransferPlaceholder(mthCourse)).toBeNull();

      // Standard English course
      const englCourse = {
        code: 'ENGL 17000',
        compactCode: 'ENGL17000',
        department: 'ENGL',
        number: 17000,
        title: 'Composition II',
        grade: 'A',
        state: 'Completed'
      };
      expect(isTransferPlaceholder(englCourse)).toBeNull();
    });
  });

  describe('2. Deduplication Engine Exemption for Multiple ELECT Placeholders', () => {
    it('exempts multiple ELECT 10000 instances from repeat deduplication (recovering missing credits from 9cr to 11cr)', () => {
      // Baseline student with 6cr standard transfer courses + two ELECT 10000 courses:
      // - One ELECT 10000 with TR-B (3cr)
      // - One ELECT 10000 with TR-C (2cr)
      // Previously: TR-C was excluded as "Excluded: Repeat / Retake (Superseded by TR-B)", giving 6 + 3 = 9cr transfer.
      // Expected with fix: Both instances applied, total transfer credits = 6 + 3 + 2 = 11cr!
      const rawRecords = [
        { 'Course Code': 'HIST 10500', 'Course Title': 'U.S. History to 1877 (GE-HC: USHisGov)', Credits: 3, Grade: 'TR-A', Term: 'Transfer' },
        { 'Course Code': 'SOC 10200', 'Course Title': 'Basic Concepts of Sociology (GE-SocSci/HD)', Credits: 3, Grade: 'TR-B', Term: 'Transfer' },
        { 'Course Code': 'ELECT 10000', 'Course Title': 'Free Elective 10000 Level', Credits: 3, Grade: 'TR-B', Term: 'Transfer' },
        { 'Course Code': 'ELECT 10000', 'Course Title': 'Free Elective 10000 Level', Credits: 2, Grade: 'TR-C', Term: 'Transfer' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { referenceYear: 2026 });

      // 1. Neither ELECT course is in excludedCourses
      const excludedElect = parsed.excludedCourses.filter((c) => c.compactCode === 'ELECT10000');
      expect(excludedElect.length).toBe(0);

      // 2. Both ELECT courses are in validCourses and transferCourses
      const validElect = parsed.validCourses.filter((c) => c.compactCode === 'ELECT10000');
      expect(validElect.length).toBe(2);

      const grades = validElect.map((c) => c.grade).sort();
      expect(grades).toEqual(['TR-B', 'TR-C']);

      // 3. Total transfer credits equals 11 (6 + 3 + 2), recovering the missing 2 credits from 9 to 11
      expect(parsed.summary.totalTransferCredits).toBe(11);
      expect(parsed.summary.totalCompletedCredits).toBe(11);
    });

    it('evaluates multiple ELECT 10000 instances in Waterfall Audit as applied free electives without repeat flags', () => {
      const rawRecords = [
        { 'Course Code': 'HIST 10500', 'Course Title': 'U.S. History to 1877 (GE-HC: USHisGov)', Credits: 3, Grade: 'TR-A', Term: 'Transfer' },
        { 'Course Code': 'SOC 10200', 'Course Title': 'Basic Concepts of Sociology (GE-SocSci/HD)', Credits: 3, Grade: 'TR-B', Term: 'Transfer' },
        { 'Course Code': 'ELECT 10000', 'Course Title': 'Free Elective 10000 Level', Credits: 3, Grade: 'TR-B', Term: 'Transfer' },
        { 'Course Code': 'ELECT 10000', 'Course Title': 'Free Elective 10000 Level', Credits: 2, Grade: 'TR-C', Term: 'Transfer' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { referenceYear: 2026 });
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      // Verify Screen 2 audit ledger inputs:
      // Neither course displays Excluded: Repeat / Retake
      expect(audit.excludedCourses.some((c) => c.compactCode === 'ELECT10000')).toBe(false);

      // Both courses are in freeElectives / claimedFreeElectives
      const auditElectives = audit.freeElectives.filter((c) => c.compactCode === 'ELECT10000');
      expect(auditElectives.length).toBe(2);
      expect(auditElectives.map((c) => c.grade).sort()).toEqual(['TR-B', 'TR-C']);
      expect(auditElectives.map((c) => c.credits).sort()).toEqual([2, 3]);

      // Total completed credits reflects 11 credits
      expect(audit.policyChecklist.totalCredits.completed).toBe(11);
    });
  });

  describe('3. Standard Retake Policy Invariant Preservation', () => {
    it('preserves institutional retake replacement rules for standard courses (e.g. ENGL 17000 D retaken as A)', () => {
      const rawRecords = [
        { 'Course Code': 'ENGL 17000', 'Course Title': 'Composition II', Credits: 3, Grade: 'D', Term: '2024FA-II' },
        { 'Course Code': 'ENGL 17000', 'Course Title': 'Composition II', Credits: 3, Grade: 'A', Term: '2025SP-I' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { referenceYear: 2026 });

      // Exactly 1 course in validCourses (grade 'A')
      expect(parsed.validCourses.length).toBe(1);
      expect(parsed.validCourses[0].compactCode).toBe('ENGL17000');
      expect(parsed.validCourses[0].grade).toBe('A');
      expect(parsed.validCourses[0].credits).toBe(3);

      // Earlier attempt 'D' is correctly in excludedCourses with repeat reason
      expect(parsed.excludedCourses.length).toBe(1);
      expect(parsed.excludedCourses[0].compactCode).toBe('ENGL17000');
      expect(parsed.excludedCourses[0].grade).toBe('D');
      expect(parsed.excludedCourses[0].reason).toContain('Excluded: Repeat / Retake (Superseded by A)');

      // Credits are not double-counted (exactly 3 credits completed)
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(3);
    });

    it('preserves institutional retake replacement rules for math courses (e.g. MTH 14100 D retaken as B)', () => {
      const rawRecords = [
        { 'Course Code': 'MTH 14100', 'Course Title': 'Basic Statistics', Credits: 3, Grade: 'D', Term: '2024FA-I' },
        { 'Course Code': 'MTH 14100', 'Course Title': 'Basic Statistics', Credits: 3, Grade: 'B', Term: '2025SP-I' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { referenceYear: 2026 });

      expect(parsed.validCourses.length).toBe(1);
      expect(parsed.validCourses[0].compactCode).toBe('MTH14100');
      expect(parsed.validCourses[0].grade).toBe('B');

      expect(parsed.excludedCourses.length).toBe(1);
      expect(parsed.excludedCourses[0].compactCode).toBe('MTH14100');
      expect(parsed.excludedCourses[0].reason).toContain('Excluded: Repeat / Retake (Superseded by B)');

      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(3);
    });
  });

  describe('4. Category Routing Distinction (ELECT vs. GE)', () => {
    it('routes GE transfer placeholders into GE buckets while ELECT flows into free electives', () => {
      const rawRecords = [
        // GE transfer placeholder
        { 'Course Code': 'GE 10000', 'Course Title': 'GE-Art Appreciation', Credits: 3, Grade: 'TR-B', Term: 'Transfer' },
        // ELECT transfer placeholder
        { 'Course Code': 'ELECT 10000', 'Course Title': 'Free Elective 10000 Level', Credits: 3, Grade: 'TR-A', Term: 'Transfer' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { referenceYear: 2026 });
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      // GE 10000 fulfills the arts bucket
      const artsBucket = audit.geBuckets.find((b) => b.bucket_id === 'arts');
      expect(artsBucket.fulfilled).toBe(true);
      expect(artsBucket.matchedCourse.compactCode).toBe('GE10000');

      // ELECT 10000 is never claimed by a GE bucket and flows directly into freeElectives
      expect(audit.freeElectives.some((c) => c.compactCode === 'ELECT10000')).toBe(true);
      const isElectInGe = audit.geBuckets.some((b) => b.matchedCourse?.compactCode === 'ELECT10000');
      expect(isElectInGe).toBe(false);
    });
  });
});
