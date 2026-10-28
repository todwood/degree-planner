import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import { runDegreeAudit } from '../src/engine/waterfallAudit.js';
import {
  initializeTrackPlans,
  evaluateSemesterPlateau,
  getTuitionPlateauBadge,
  detectRotationalPacingDelay,
  generateOptimalSchedule
} from '../src/engine/scheduler.js';

describe('Track-Driven Dual Plans, Tuition Plateau & Pacing Opportunity Suite', () => {
  describe('1. Track-Driven Dual Plans Initialization (Data Science BS)', () => {
    it('initializes dual plans (Plan A for Option A, Plan B for Option B) with separate elective targets (27 cr vs. 30 cr)', () => {
      const auditDS = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['data_science_bs_2026'],
        catalogDb: masterDb
      });

      const trackInfo = initializeTrackPlans({
        auditResult: auditDS,
        parsedTranscript: { validCourses: [] },
        masterDb
      });

      expect(trackInfo.hasMultipleTracks).toBe(true);
      expect(trackInfo.tracks).toHaveLength(2);

      const trackA = trackInfo.tracks[0];
      const trackB = trackInfo.tracks[1];

      expect(trackA.id).toBe('option_a');
      expect(trackA.totalElectiveCredits).toBe(27);

      expect(trackB.id).toBe('option_b');
      expect(trackB.totalElectiveCredits).toBe(30);

      expect(trackInfo.plans).toBeDefined();
      expect(trackInfo.plans.option_a).toBeDefined();
      expect(trackInfo.plans.option_b).toBeDefined();

      expect(trackInfo.plans.option_a.electiveCreditsRequired).toBe(27);
      expect(trackInfo.plans.option_b.electiveCreditsRequired).toBe(30);

      expect(trackInfo.plans.option_a.schedule.semesters.length).toBeGreaterThan(0);
      expect(trackInfo.plans.option_b.schedule.semesters.length).toBeGreaterThan(0);
    });

    it('maintains independent schedule state and elective configurations across both tracks', () => {
      const auditDS = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['data_science_bs_2026'],
        catalogDb: masterDb
      });

      const trackInfo = initializeTrackPlans({
        auditResult: auditDS,
        parsedTranscript: { validCourses: [] },
        constraints: { pacingMode: 'Full-Time' },
        masterDb
      });

      const planA = trackInfo.plans.option_a;
      const planB = trackInfo.plans.option_b;

      expect(planA.trackName).toMatch(/Option A/i);
      expect(planB.trackName).toMatch(/Option B/i);
      expect(planA.electiveCreditsRequired).not.toBe(planB.electiveCreditsRequired);
      expect(planA.projectedGraduationTerm).toBeTruthy();
      expect(planB.projectedGraduationTerm).toBeTruthy();
    });
  });

  describe('2. Single-Track Programs (Computer Science BS & Cybersecurity BS)', () => {
    it('initializes a single plan state with hasMultipleTracks: false for Computer Science BS', () => {
      const auditCS = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['computer_science_bs_2026'],
        catalogDb: masterDb
      });

      const trackInfo = initializeTrackPlans({
        auditResult: auditCS,
        parsedTranscript: { validCourses: [] },
        masterDb
      });

      expect(trackInfo.hasMultipleTracks).toBe(false);
      expect(trackInfo.tracks).toEqual([]);
      expect(trackInfo.activeTrackId).toBeNull();
      expect(trackInfo.plans).toBeNull();
    });

    it('initializes a single plan state with hasMultipleTracks: false for Cybersecurity BS', () => {
      const auditCyber = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['cybersecurity_bs_2026'],
        catalogDb: masterDb
      });

      const trackInfo = initializeTrackPlans({
        auditResult: auditCyber,
        parsedTranscript: { validCourses: [] },
        masterDb
      });

      expect(trackInfo.hasMultipleTracks).toBe(false);
      expect(trackInfo.tracks).toEqual([]);
      expect(trackInfo.plans).toBeNull();
    });
  });

  describe('3. Lindenwood 12–18 Credit Tuition Plateau Policy Evaluator', () => {
    it('accurately tags < 12 credits as Part-Time with institutional aid tooltip', () => {
      const underloads = [0, 3, 6, 9, 11, 11.5];
      for (const cr of underloads) {
        const res = evaluateSemesterPlateau(cr);
        expect(res.status).toBe('PART_TIME');
        expect(res.label).toBe('⚠️ Part-Time (<12 cr)');
        expect(res.tooltip).toContain('Below 12-credit full-time plateau');
        expect(res.tooltip).toContain('aid');
      }
    });

    it('accurately tags 12–18 credits as Flat Tuition Plateau', () => {
      const plateaus = [12, 13, 15, 16, 17, 18];
      for (const cr of plateaus) {
        const res = evaluateSemesterPlateau(cr);
        expect(res.status).toBe('PLATEAU');
        expect(res.label).toBe('✓ Flat Tuition Plateau (12–18 cr)');
        expect(res.tooltip).toContain('flat tuition plateau');
      }
    });

    it('accurately tags > 18 credits as Overload Form Required with surcharge tooltip', () => {
      const overloads = [18.5, 19, 21, 24];
      for (const cr of overloads) {
        const res = evaluateSemesterPlateau(cr);
        expect(res.status).toBe('OVERLOAD');
        expect(res.label).toBe('⚠️ Overload Form Required (>18 cr)');
        expect(res.tooltip).toContain('Exceeds 18-credit plateau');
        expect(res.tooltip).toContain('Overload Form');
      }
    });

    it('confirms getTuitionPlateauBadge is byte-compatible alias of evaluateSemesterPlateau', () => {
      expect(getTuitionPlateauBadge).toBe(evaluateSemesterPlateau);
      expect(getTuitionPlateauBadge(15)).toEqual(evaluateSemesterPlateau(15));
    });
  });

  describe('4. Rotational Delay Detector & Integrated Pacing Opportunities', () => {
    it('flags multi-semester rotational delays caused by 12-credit semester caps in Cybersecurity BS', () => {
      const audit = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['cybersecurity_bs_2026'],
        catalogDb: masterDb
      });

      const delayResult = detectRotationalPacingDelay(
        audit,
        { validCourses: [] },
        { maxCreditsPerSemester: 12, max16wkCredits: 12, max8wkCredits: 6 }
      );

      expect(delayResult.hasOpportunity).toBe(true);
      expect(delayResult.semestersAdvanced).toBeGreaterThanOrEqual(1);
      expect(delayResult.earlierGraduationTerm).toBeTruthy();
      expect(delayResult.message).toContain('Taking 15 credits in');
      expect(delayResult.message).toContain('unlocks');
      expect(delayResult.message).toContain('advances graduation by');
    });

    it('flags rotational delay in Computer Science BS when constrained to 12 credits', () => {
      const audit = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['computer_science_bs_2026'],
        catalogDb: masterDb
      });

      const delayResult = detectRotationalPacingDelay(
        audit,
        { validCourses: [] },
        { maxCreditsPerSemester: 12, max16wkCredits: 12, max8wkCredits: 6 }
      );

      expect(delayResult.hasOpportunity).toBe(true);
      expect(delayResult.semestersAdvanced).toBeGreaterThanOrEqual(1);
      expect(delayResult.message).toMatch(/Taking 15 credits in/);
    });

    it('does not flag rotational delay when student pace is already >= 15 credits', () => {
      const audit = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['cybersecurity_bs_2026'],
        catalogDb: masterDb
      });

      const delayResult = detectRotationalPacingDelay(
        audit,
        { validCourses: [] },
        { maxCreditsPerSemester: 15, max16wkCredits: 15, max8wkCredits: 9 }
      );

      expect(delayResult.hasOpportunity).toBe(false);
      expect(delayResult.message).toBeNull();
    });

    it('attaches pacingOpportunity object directly to generateOptimalSchedule return value', () => {
      const audit = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['cybersecurity_bs_2026'],
        catalogDb: masterDb
      });

      const sched12 = generateOptimalSchedule(
        audit,
        { validCourses: [] },
        { maxCreditsPerSemester: 12, max16wkCredits: 12, max8wkCredits: 6 }
      );

      expect(sched12.pacingOpportunity).toBeDefined();
      expect(sched12.pacingOpportunity.hasOpportunity).toBe(true);
      expect(sched12.pacingOpportunity.message).toBeTruthy();
    });
  });

  describe('5. Intake Preference Enforcement (maxCreditsPerSemester & maxCoursesPer8Week)', () => {
    it('enforces maxCoursesPer8Week cap on 8-week session lanes', () => {
      const audit = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['cybersecurity_bs_2026'],
        catalogDb: masterDb
      });

      const sched = generateOptimalSchedule(
        audit,
        { validCourses: [] },
        { maxCoursesPer8Week: 2, max8wkCredits: 9, max16wkCredits: 18 }
      );

      // Verify that every 8-week lane (FA-I, FA-II, SP-I, SP-II) has <= 2 courses
      for (const sem of sched.semesters) {
        if (sem.lanes['FA-I']) expect(sem.lanes['FA-I'].length).toBeLessThanOrEqual(2);
        if (sem.lanes['FA-II']) expect(sem.lanes['FA-II'].length).toBeLessThanOrEqual(2);
        if (sem.lanes['SP-I']) expect(sem.lanes['SP-I'].length).toBeLessThanOrEqual(2);
        if (sem.lanes['SP-II']) expect(sem.lanes['SP-II'].length).toBeLessThanOrEqual(2);
      }
    });

    it('enforces maxCreditsPerSemester cap', () => {
      const audit = runDegreeAudit({
        studentRecord: { validCourses: [] },
        declaredPrograms: ['cybersecurity_bs_2026'],
        catalogDb: masterDb
      });

      const sched12 = generateOptimalSchedule(
        audit,
        { validCourses: [] },
        { maxCreditsPerSemester: 12 }
      );

      for (const sem of sched12.semesters) {
        if (sem.season !== 'Summer') {
          expect(sem.totalCredits).toBeLessThanOrEqual(12);
        }
      }
    });
  });
});
