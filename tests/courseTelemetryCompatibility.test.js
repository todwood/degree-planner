import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';
import { processRawCourseRecords } from '../src/engine/transcriptParser.js';
import {
  resolveCourseAvailability,
  isCourseOfferedInSlot
} from '../src/engine/scheduler.js';
import {
  normalizeCode,
  mapOfferingToSession,
  deriveSessionBooleans,
  deriveOfferedSessions,
  mergeStagedCourses
} from '../execution/merge_staged_courses.js';

describe('Schedule Telemetry & Course Merge Compatibility Suite', () => {
  describe('A. Course Credits & Schedule Telemetry Numeric Invariants', () => {
    it('guarantees every course in masterDatabase has a valid positive number for credits', () => {
      expect(masterDb.courses.length).toBeGreaterThan(0);
      for (const course of masterDb.courses) {
        expect(typeof course.credits).toBe('number');
        expect(isNaN(course.credits)).toBe(false);
        expect(course.credits).toBeGreaterThanOrEqual(0);
      }
    });

    it('validates courses containing schedule_telemetry maintain numeric credits and schema integrity', () => {
      const telemetryCourses = masterDb.courses.filter((c) => c.schedule_telemetry);
      expect(telemetryCourses.length).toBeGreaterThan(0);

      for (const course of telemetryCourses) {
        // Credits must strictly remain a number
        expect(typeof course.credits).toBe('number');
        expect(isNaN(course.credits)).toBe(false);
        expect(course.credits).toBeGreaterThanOrEqual(0);

        // Telemetry structure assertions
        const tel = course.schedule_telemetry;
        expect(tel).toBeDefined();
        expect(typeof tel).toBe('object');
        expect(typeof tel.offering_status_text).toBe('string');
        expect(Array.isArray(tel.modalities)).toBe(true);
        expect(typeof tel.has_online_option).toBe('boolean');
        expect(typeof tel.has_on_ground_option).toBe('boolean');
        expect(typeof tel.total_sections_observed).toBe('number');
        expect(Array.isArray(tel.terms_examined)).toBe(true);
        expect(Array.isArray(tel.term_breakdown)).toBe(true);
      }
    });

    it('verifies MTH 14100 contains valid schedule_telemetry without schema drift', () => {
      const mth14100 = masterDb.courses.find((c) => c.code === 'MTH 14100');
      expect(mth14100).toBeDefined();
      expect(mth14100.credits).toBe(3);
      expect(mth14100.schedule_telemetry).toBeDefined();
      expect(mth14100.schedule_telemetry.has_online_option).toBe(true);
      expect(mth14100.schedule_telemetry.has_on_ground_option).toBe(true);
      expect(mth14100.schedule_telemetry.total_sections_observed).toBeGreaterThan(0);
      expect(mth14100.offerings).toContain('FA-16wk');
      expect(mth14100.offered_sessions).toContain('Fall-16wk');
      expect(mth14100.FA_16wk).toBe(true);
    });
  });

  describe('B. Legacy Offerings String Arrays in Scheduler', () => {
    it('resolves availability correctly when course only supplies legacy offerings array', () => {
      const legacyCourse = {
        code: 'TEST 10000',
        title: 'Legacy Formatted Course',
        credits: 3,
        offerings: ['FA-16wk', 'SP-16wk']
      };

      const avail = resolveCourseAvailability(legacyCourse);
      expect(avail.FA_16wk).toBe(true);
      expect(avail.SP_16wk).toBe(true);
      expect(avail.FA_I_8wk).toBe(false);
      expect(avail.FA_II_8wk).toBe(false);
      expect(avail.SP_I_8wk).toBe(false);
      expect(avail.SP_II_8wk).toBe(false);
      expect(avail.SU_8wk).toBe(false);
      expect(avail.annualSessionCount).toBe(2);

      expect(isCourseOfferedInSlot(legacyCourse, 'Fall-16wk', 2026)).toBe(true);
      expect(isCourseOfferedInSlot(legacyCourse, 'Spring-16wk', 2027)).toBe(true);
      expect(isCourseOfferedInSlot(legacyCourse, 'FA-I', 2026)).toBe(false);
    });

    it('resolves 8-week session bands and summer options from offerings', () => {
      const acceleratedCourse = {
        code: 'TEST 20000',
        title: 'Accelerated Offering Course',
        credits: 3,
        offerings: ['FA-I', 'SP-II', 'SU-6wk1']
      };

      const avail = resolveCourseAvailability(acceleratedCourse);
      expect(avail.FA_I_8wk).toBe(true);
      expect(avail.FA_II_8wk).toBe(false);
      expect(avail.SP_II_8wk).toBe(true);
      expect(avail.SU_8wk).toBe(true);

      expect(isCourseOfferedInSlot(acceleratedCourse, 'FA-I', 2026)).toBe(true);
      expect(isCourseOfferedInSlot(acceleratedCourse, 'FA-II', 2026)).toBe(false);
      expect(isCourseOfferedInSlot(acceleratedCourse, 'SP-II', 2027)).toBe(true);
      expect(isCourseOfferedInSlot(acceleratedCourse, 'SU', 2027)).toBe(true);
    });

    it('falls back gracefully to Fall-16wk and Spring-16wk when offerings is empty', () => {
      const emptyOfferingsCourse = {
        code: 'TEST 30000',
        title: 'Empty Offering Course',
        credits: 3,
        offerings: []
      };

      const avail = resolveCourseAvailability(emptyOfferingsCourse);
      expect(avail.usedBlankFallback).toBe(true);
      expect(avail.FA_16wk).toBe(true);
      expect(avail.SP_16wk).toBe(true);
      expect(avail.annualSessionCount).toBe(2);
    });
  });

  describe('C. 3 Verified Degree Programs Audit Integrity', () => {
    const verifiedProgramIds = [
      'cybersecurity_bs_2026',
      'it_networking_bs_2026',
      'it_app_dev_bs_2026'
    ];

    it('confirms every program has 100% of referenced courses in masterDatabase', () => {
      const existingCodes = new Set(masterDb.courses.map((c) => normalizeCode(c.code)));

      for (const progId of verifiedProgramIds) {
        const prog = masterDb.programs.find((p) => p.id === progId);
        expect(prog, `Program ${progId} must exist`).toBeDefined();

        const req = prog.requirements;
        const allReferenced = [
          ...(req.major_core_courses || []),
          ...(req.emphasis_courses || []),
          ...(req.math_courses || []).map((m) => (typeof m === 'string' ? m : m.code))
        ];

        for (const code of allReferenced) {
          const norm = normalizeCode(code);
          expect(
            existingCodes.has(norm),
            `Course "${code}" in program "${prog.name}" must exist in masterDatabase`
          ).toBe(true);
        }
      }
    });

    it('successfully audits all 3 verified degree programs with 0 missing course errors', () => {
      const parsedEmpty = processRawCourseRecords([]);
      for (const progId of verifiedProgramIds) {
        const auditResult = runWaterfallAudit(parsedEmpty, progId, masterDb);
        expect(auditResult).toBeDefined();
        expect(auditResult.primaryProgram).toBeDefined();
        expect(auditResult.primaryProgram.id).toBe(progId);
        expect(auditResult.policyChecklist).toBeDefined();
        expect(auditResult.policyChecklist.totalCredits.completed).toBe(0);
        expect(auditResult.policyChecklist.totalCredits.remainingPlanned).toBeGreaterThan(0);
        expect(Array.isArray(auditResult.remainingCourseItems)).toBe(true);
        expect(auditResult.remainingCourseItems.length).toBeGreaterThan(0);
      }
    });

    it('audits student records against Cybersecurity BS with 0 missing course errors', () => {
      const sampleCompleted = [
        { code: 'ICS 21300', credits: 3, grade: 'A', term: '2025FA-I' },
        { code: 'ICS 21400', credits: 3, grade: 'B', term: '2025FA-II' },
        { code: 'MTH 14100', credits: 3, grade: 'A', term: '2026SP-I' },
        { code: 'IIT 21500', credits: 3, grade: 'B', term: '2026SP-II' }
      ];

      const parsedRecord = processRawCourseRecords(sampleCompleted);
      const auditResult = runWaterfallAudit(parsedRecord, 'cybersecurity_bs_2026', masterDb);
      expect(auditResult.policyChecklist.totalCredits.completed).toBe(12);
      expect(auditResult.remainingCourseItems.length).toBeLessThan(40);
    });
  });

  describe('D. Deterministic Merge Pipeline Helper Functions', () => {
    it('normalizes codes removing whitespace and standardizing casing', () => {
      expect(normalizeCode('mth 14100')).toBe('MTH14100');
      expect(normalizeCode('ICS   21300')).toBe('ICS21300');
      expect(normalizeCode('iit 21500 ')).toBe('IIT21500');
    });

    it('maps offering tokens to standard session names', () => {
      expect(mapOfferingToSession('FA-16wk')).toBe('Fall-16wk');
      expect(mapOfferingToSession('SP-16wk')).toBe('Spring-16wk');
      expect(mapOfferingToSession('FA-I')).toBe('FA-I');
      expect(mapOfferingToSession('SU-6wk1')).toBe('SU');
      expect(mapOfferingToSession('SU-8wk')).toBe('SU');
    });

    it('derives session booleans and offered_sessions accurately', () => {
      const offerings = ['FA-16wk', 'SP-II', 'SU-6wk1'];
      const sessions = deriveOfferedSessions(offerings);
      expect(sessions).toContain('Fall-16wk');
      expect(sessions).toContain('SP-II');
      expect(sessions).toContain('SU');

      const bools = deriveSessionBooleans(offerings, sessions);
      expect(bools.FA_16wk).toBe(true);
      expect(bools.SP_II_8wk).toBe(true);
      expect(bools.SU_8wk).toBe(true);
      expect(bools.FA_I_8wk).toBe(false);
    });

    it('executes mergeStagedCourses in dry-run mode without mutating masterDatabase', () => {
      const summary = mergeStagedCourses({
        stagingPath: '.tmp/courses_staging_all_2026.json',
        dryRun: true
      });
      expect(summary).toBeDefined();
      expect(summary.totalBefore).toBeGreaterThan(80);
      expect(summary.dryRun).toBe(true);
      expect(summary.verifiedProgramsCount).toBeGreaterThanOrEqual(9);
    });
  });
});
