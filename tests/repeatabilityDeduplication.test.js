import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json' with { type: 'json' };
import {
  parseRepeatability,
  deduplicateCourseAttempts,
  processRetakeDeduplication
} from '../src/engine/retakeDeduplication.js';
import { processRawCourseRecords } from '../src/engine/transcriptParser.js';

describe('Repeatability & Retake Deduplication Engine (Skill 2)', () => {
  describe('1. Catalog Regex Extraction (parseRepeatability)', () => {
    it('accurately parses standard catalog phrases with explicit credit ceilings', () => {
      const p1 = parseRepeatability('Repeatable: May be repeated for a maximum of 6 credit hours.');
      expect(p1.repeatable).toBe(true);
      expect(p1.max_repeat_credits).toBe(6);

      const p2 = parseRepeatability('Repeatable for a maximum of 4 credit hours.');
      expect(p2.repeatable).toBe(true);
      expect(p2.max_repeat_credits).toBe(4);

      const p3 = parseRepeatability('May be repeated for credit for up to 12 credit hours.');
      expect(p3.repeatable).toBe(true);
      expect(p3.max_repeat_credits).toBe(12);

      const p4 = parseRepeatability('Repeatable: May be repeated for a maximum of 3 credit hours.');
      expect(p4.repeatable).toBe(true);
      expect(p4.max_repeat_credits).toBe(3);
    });

    it('accurately parses boolean repeatability without an explicit credit ceiling', () => {
      const p1 = parseRepeatability('Repeatable: May be repeated for credit.');
      expect(p1.repeatable).toBe(true);
      expect(p1.max_repeat_credits).toBeNull();

      const p2 = parseRepeatability('May be repeated for credit.');
      expect(p2.repeatable).toBe(true);
      expect(p2.max_repeat_credits).toBeNull();

      const p3 = parseRepeatability('Repeatable for credit.');
      expect(p3.repeatable).toBe(true);
      expect(p3.max_repeat_credits).toBeNull();

      const p4 = parseRepeatability('Repeatable.');
      expect(p4.repeatable).toBe(true);
      expect(p4.max_repeat_credits).toBeNull();
    });

    it('returns repeatable: false and null ceiling for non-repeatable courses', () => {
      const p1 = parseRepeatability('An introduction to basic statistical concepts and methods.');
      expect(p1.repeatable).toBe(false);
      expect(p1.max_repeat_credits).toBeNull();

      const p2 = parseRepeatability('');
      expect(p2.repeatable).toBe(false);
      expect(p2.max_repeat_credits).toBeNull();

      const p3 = parseRepeatability(null);
      expect(p3.repeatable).toBe(false);
      expect(p3.max_repeat_credits).toBeNull();
    });
  });

  describe('2. Master Curriculum Database Enrichment Validation', () => {
    const expectedSampleCourses = [
      { code: 'TA 10011', repeatable: true, max_repeat_credits: 6 },
      { code: 'TA 20011', repeatable: true, max_repeat_credits: 6 },
      { code: 'TA 30011', repeatable: true, max_repeat_credits: 6 },
      { code: 'TA 40011', repeatable: true, max_repeat_credits: 6 },
      { code: 'TA 48001', repeatable: true, max_repeat_credits: 3 },
      { code: 'TA 32200', repeatable: true, max_repeat_credits: 4 },
      { code: 'MUS 30200', repeatable: true, max_repeat_credits: 12 },
      { code: 'CAH 44444', repeatable: true, max_repeat_credits: 12 },
      { code: 'DAN 10010', repeatable: true, max_repeat_credits: null }
    ];

    for (const sample of expectedSampleCourses) {
      it(`confirms ${sample.code} carries repeatable: ${sample.repeatable} and max_repeat_credits: ${sample.max_repeat_credits}`, () => {
        const course = masterDb.courses.find((c) => c.code === sample.code);
        expect(course).toBeDefined();
        expect(course.repeatable).toBe(sample.repeatable);
        expect(course.max_repeat_credits).toBe(sample.max_repeat_credits);
      });
    }

    it('preserves exactly 33 degree program objects in masterDatabase.json', () => {
      expect(masterDb.programs).toHaveLength(33);
    });
  });

  describe('3. Multi-Attempt Repeatable Course Deduplication (TA 10011 Cap = 6 Cr)', () => {
    it('allows 2 passing attempts of TA 10011 (3 cr each = 6 cr) with neither attempt excluded as a retake', () => {
      const rawRecords = [
        { 'Course Code': 'TA 10011', 'Course Title': 'Theatre Practicum: Crew', Credits: 3, Grade: 'A', Term: '2024FA' },
        { 'Course Code': 'TA 10011', 'Course Title': 'Theatre Practicum: Crew', Credits: 3, Grade: 'A', Term: '2025SP' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { masterDb, referenceYear: 2026 });

      expect(parsed.validCourses).toHaveLength(2);
      expect(parsed.excludedCourses).toHaveLength(0);
      expect(parsed.validCourses[0].isRetake).toBe(false);
      expect(parsed.validCourses[1].isRetake).toBe(false);
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(6);
      expect(parsed.summary.totalCompletedCredits).toBe(6);
    });

    it('excludes 3rd passing attempt of TA 10011 when cumulative credits (9 cr) exceed max_repeat_credits (6 cr)', () => {
      const rawRecords = [
        { 'Course Code': 'TA 10011', 'Course Title': 'Theatre Practicum: Crew', Credits: 3, Grade: 'A', Term: '2024FA' },
        { 'Course Code': 'TA 10011', 'Course Title': 'Theatre Practicum: Crew', Credits: 3, Grade: 'A', Term: '2025SP' },
        { 'Course Code': 'TA 10011', 'Course Title': 'Theatre Practicum: Crew', Credits: 3, Grade: 'B', Term: '2025FA' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { masterDb, referenceYear: 2026 });

      // First 2 attempts earn credit (3 + 3 = 6 cr)
      expect(parsed.validCourses).toHaveLength(2);
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(6);

      // 3rd attempt is excluded with REPEATED_ATTEMPT reason
      expect(parsed.excludedCourses).toHaveLength(1);
      const excluded = parsed.excludedCourses[0];
      expect(excluded.compactCode).toBe('TA10011');
      expect(excluded.isRetake).toBe(true);
      expect(excluded.excludeReason).toBe('REPEATED_ATTEMPT');
      expect(excluded.reason).toContain('REPEATED_ATTEMPT');
    });

    it('collapses cross-file duplicate rows (Anthology + PDF) for the same attempt without double-counting', () => {
      const rawRecords = [
        // Attempt 1: 2024FA from Anthology
        { 'Course Code': 'TA 10011', 'Course Title': 'Practicum', Credits: 3, Grade: 'A', Term: '2024 Fall', fromTranscriptPdf: false },
        // Attempt 1: 2024FA mirror from PDF
        { 'Course Code': 'TA 10011', 'Course Title': 'Practicum', Credits: 3, Grade: 'A', Term: '2024FA', fromTranscriptPdf: true },
        // Attempt 2: 2025SP from Anthology
        { 'Course Code': 'TA 10011', 'Course Title': 'Practicum', Credits: 3, Grade: 'A', Term: '2025 Spring', fromTranscriptPdf: false }
      ];

      const parsed = processRawCourseRecords(rawRecords, { masterDb, referenceYear: 2026 });

      // Exactly 2 distinct attempts should be valid (6 credits earned)
      expect(parsed.validCourses).toHaveLength(2);
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(6);
      expect(parsed.excludedCourses).toHaveLength(0);
    });

    it('allows repeatable courses without ceiling (e.g. DAN 10010) to earn credits across multiple attempts', () => {
      const rawRecords = [
        { 'Course Code': 'DAN 10010', 'Course Title': 'Ballet I', Credits: 2, Grade: 'A', Term: '2024FA' },
        { 'Course Code': 'DAN 10010', 'Course Title': 'Ballet I', Credits: 2, Grade: 'A', Term: '2025SP' },
        { 'Course Code': 'DAN 10010', 'Course Title': 'Ballet I', Credits: 2, Grade: 'A', Term: '2025FA' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { masterDb, referenceYear: 2026 });

      expect(parsed.validCourses).toHaveLength(3);
      expect(parsed.excludedCourses).toHaveLength(0);
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(6);
    });
  });

  describe('4. Non-Repeatable Course Deduplication Regression Check', () => {
    it('properly excludes inferior attempts for non-repeatable courses (e.g. CSC 14400)', () => {
      const rawRecords = [
        { 'Course Code': 'CSC 14400', 'Course Title': 'Computer Science I', Credits: 4, Grade: 'D', Term: '2024FA' },
        { 'Course Code': 'CSC 14400', 'Course Title': 'Computer Science I', Credits: 4, Grade: 'A', Term: '2025SP' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { masterDb, referenceYear: 2026 });

      expect(parsed.validCourses).toHaveLength(1);
      expect(parsed.validCourses[0].compactCode).toBe('CSC14400');
      expect(parsed.validCourses[0].grade).toBe('A');
      expect(parsed.validCourses[0].isRetake).toBe(false);

      expect(parsed.excludedCourses).toHaveLength(1);
      expect(parsed.excludedCourses[0].compactCode).toBe('CSC14400');
      expect(parsed.excludedCourses[0].grade).toBe('D');
      expect(parsed.excludedCourses[0].isRetake).toBe(true);
      expect(parsed.excludedCourses[0].reason).toContain('Excluded: Repeat / Retake (Superseded by A)');

      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(4);
    });

    it('handles failing attempts (F) followed by passing attempt (A)', () => {
      const rawRecords = [
        { 'Course Code': 'CSC 14400', 'Course Title': 'Computer Science I', Credits: 4, Grade: 'F', Term: '2024FA' },
        { 'Course Code': 'CSC 14400', 'Course Title': 'Computer Science I', Credits: 4, Grade: 'A', Term: '2025SP' }
      ];

      const parsed = processRawCourseRecords(rawRecords, { masterDb, referenceYear: 2026 });

      expect(parsed.validCourses).toHaveLength(1);
      expect(parsed.validCourses[0].grade).toBe('A');

      expect(parsed.excludedCourses).toHaveLength(1);
      expect(parsed.excludedCourses[0].grade).toBe('F');
      expect(parsed.summary.totalCompletedLindenwoodCredits).toBe(4);
    });
  });
});
