import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import {
  runDegreeAudit,
  buildProgramAuditLedgers,
  auditGeneralEducationCategories,
  computeUpperDivisionGate,
  evaluateCompositionGatekeeper,
  computeRetakeNetCredits,
  resolveTrackConfiguration,
  orderDeclaredPrograms,
  CORE42_CLEARANCE_REASON,
  COMPOSITION_RETAKE_WARNING
} from '../src/engine/waterfallAudit.js';

function makeCourse(code, credits, grade = 'A', state = 'Completed') {
  const compactCode = code.replace(/\s+/g, '').toUpperCase();
  const match = compactCode.match(/^([A-Z]+)(\d+)$/);
  return {
    code,
    compactCode,
    department: match ? match[1] : 'GEN',
    number: match ? Number(match[2]) : 10000,
    level: match ? Number(match[2]) : 10000,
    credits,
    grade,
    state
  };
}

describe('Core Audit Engine Upgrades Suite (Multi-Program, CORE 42, Policy Gates, Retake Math, Track Bifurcation)', () => {
  describe('1. Multi-Program Waterfall & Cross-Counting Ledger', () => {
    it('orders credentials deterministically: Primary Major -> Secondary Major -> Minor -> Certificate', () => {
      const ordered = orderDeclaredPrograms(
        ['cybersecurity_minor_2026', 'data_analysis_certificate_2026', 'data_science_bs_2026', 'computer_science_bs_2026'],
        masterDb,
        'computer_science_bs_2026'
      );

      expect(ordered.map((p) => p.id)).toEqual([
        'computer_science_bs_2026',
        'data_science_bs_2026',
        'cybersecurity_minor_2026',
        'data_analysis_certificate_2026'
      ]);
    });

    it('marks MTH 27100 (5cr) and MTH 27200 (5cr) satisfied in both CS Major and Math Minor, tags cross-counted items, and counts only 10 unique credits', () => {
      const studentRecord = {
        validCourses: [
          makeCourse('MTH 27100', 5, 'A', 'Completed'),
          makeCourse('MTH 27200', 5, 'B', 'Completed')
        ],
        excludedCourses: [],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      const csMajor = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');
      const mathMinor = masterDb.programs.find((p) => p.id === 'mathematics_minor_2026');

      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: [csMajor, mathMinor],
        catalogDb: masterDb,
        auditOptions: { core42Completed: false }
      });

      expect(audit.programAudits).toHaveLength(2);
      const [csAudit, mathAudit] = audit.programAudits;

      expect(csAudit.programId).toBe('computer_science_bs_2026');
      expect(csAudit.role).toBe('Primary Major');
      expect(mathAudit.programId).toBe('mathematics_minor_2026');
      expect(mathAudit.role).toBe('Minor');

      // Both MTH 27100 and MTH 27200 must be satisfied in CS Major (primary, not cross-counted there)
      const csMth271 = csAudit.requirements.find((r) => r.compactCode === 'MTH27100');
      const csMth272 = csAudit.requirements.find((r) => r.compactCode === 'MTH27200');
      expect(csMth271?.satisfied).toBe(true);
      expect(csMth271?.isCrossCounted).toBe(false);
      expect(csMth272?.satisfied).toBe(true);
      expect(csMth272?.isCrossCounted).toBe(false);

      // Both MTH 27100 and MTH 27200 must be satisfied in Math Minor AND tagged as cross-counted with CS Major
      const minorMth271 = mathAudit.requirements.find((r) => r.compactCode === 'MTH27100');
      const minorMth272 = mathAudit.requirements.find((r) => r.compactCode === 'MTH27200');
      expect(minorMth271?.satisfied).toBe(true);
      expect(minorMth271?.isCrossCounted).toBe(true);
      expect(minorMth271?.sharedWithProgramId).toBe('computer_science_bs_2026');
      expect(minorMth272?.satisfied).toBe(true);
      expect(minorMth272?.isCrossCounted).toBe(true);
      expect(minorMth272?.sharedWithProgramId).toBe('computer_science_bs_2026');

      // Each program ledger reflects 10 satisfied credits locally, while cumulative unique applied credits is strictly 10
      expect(csAudit.satisfiedCredits).toBe(10);
      expect(mathAudit.satisfiedCredits).toBe(10);
      expect(audit.crossCountingLedger.uniqueAppliedCredits).toBe(10);
      expect(audit.totalEarnedAndEnrolledCredits).toBe(10);

      // Gross required credits (73 + 24 = 97) reduced by 13 shared credits (MTH 27100 5cr + MTH 27200 5cr = 10cr in core)
      expect(audit.crossCountingLedger.grossRequiredCredits).toBe(97);
      expect(audit.crossCountingLedger.crossCountedCredits).toBe(10);
      expect(audit.crossCountingLedger.netRequiredCredits).toBe(87);
    });
  });

  describe('2. Missouri CORE 42 / AA Transfer Block Override', () => {
    it('marks all 8 GE categories satisfied with 0 remaining credits when core42Completed === true while keeping major prerequisites strictly required', () => {
      const studentRecord = {
        validCourses: [],
        excludedCourses: [],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      // Verify with CS Major (MTH 27100) and Nursing Major (BSC 22700)
      const csAudit = runDegreeAudit({
        studentRecord,
        declaredPrograms: ['computer_science_bs_2026'],
        catalogDb: masterDb,
        auditOptions: { core42Completed: true }
      });

      const expectedCategories = [
        'written_communication',
        'oral_communication',
        'mathematics',
        'civics',
        'social_behavioral_sciences',
        'humanities_fine_arts',
        'natural_sciences',
        'additional_ge_electives'
      ];

      expect(csAudit.generalEducationAudit.core42Active).toBe(true);
      expect(csAudit.generalEducationAudit.remainingCredits).toBe(0);
      expect(csAudit.generalEducationAudit.categories.map((c) => c.id)).toEqual(expectedCategories);

      for (const cat of csAudit.generalEducationAudit.categories) {
        expect(cat.satisfied).toBe(true);
        expect(cat.remainingCredits).toBe(0);
        expect(cat.reason).toBe(CORE42_CLEARANCE_REASON);
      }

      // Major prerequisite MTH 27100 in CS remains strictly required (unsatisfied)
      const csLedger = csAudit.programAudits[0];
      const mth271Req = csLedger.requirements.find((r) => r.compactCode === 'MTH27100');
      expect(mth271Req).toBeDefined();
      expect(mth271Req.satisfied).toBe(false);
      expect(mth271Req.state).toBe('Remaining');

      // Major foundation BSC 22700 in Nursing remains strictly required (unsatisfied)
      const nursingAudit = runDegreeAudit({
        studentRecord,
        declaredPrograms: ['nursing_bs_2026'],
        catalogDb: masterDb,
        auditOptions: { core42Completed: true }
      });
      const nursingLedger = nursingAudit.programAudits[0];
      const bsc227Req = nursingLedger.requirements.find((r) => r.compactCode === 'BSC22700');
      expect(bsc227Req).toBeDefined();
      expect(bsc227Req.satisfied).toBe(false);
      expect(bsc227Req.state).toBe('Remaining');
    });

    it('performs the 42-credit category audit and auto-applies prescribed_ge_satisfactions when core42Completed === false', () => {
      const courses = [
        makeCourse('ENGL 15000', 3, 'A', 'Completed'),
        makeCourse('ENGL 17000', 3, 'B', 'Completed'),
        makeCourse('MTH 27100', 5, 'A', 'Completed'),
        makeCourse('COM 11000', 3, 'A', 'Completed')
      ];
      const csMajor = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');

      const geAudit = auditGeneralEducationCategories({
        courses,
        catalogDb: masterDb,
        catalogYear: '2026-2027',
        programs: [csMajor],
        core42Completed: false
      });

      expect(geAudit.core42Active).toBe(false);
      expect(geAudit.totalRequired).toBe(42);

      const mathCat = geAudit.categories.find((c) => c.id === 'mathematics');
      const oralCat = geAudit.categories.find((c) => c.id === 'oral_communication');
      const writtenCat = geAudit.categories.find((c) => c.id === 'written_communication');
      const civicsCat = geAudit.categories.find((c) => c.id === 'civics');

      // Prescribed MTH 27100 and COM 11000 automatically satisfy Mathematics and Oral Communication
      expect(mathCat.prescribedCourses).toContain('MTH 27100');
      expect(mathCat.satisfied).toBe(true);
      expect(mathCat.appliedCourses).toContain('MTH 27100');

      expect(oralCat.prescribedCourses).toContain('COM 11000');
      expect(oralCat.satisfied).toBe(true);
      expect(oralCat.appliedCourses).toContain('COM 11000');

      expect(writtenCat.satisfied).toBe(true);
      expect(civicsCat.satisfied).toBe(false);
      expect(civicsCat.remainingCredits).toBe(3);
    });
  });

  describe('3. Institutional Policy Gates (42 Upper-Division Gate)', () => {
    it('flags remaining 30000+ level credits when upper-division hours < 42 and marks satisfied when >= 42', () => {
      const partialUpperCourses = [
        makeCourse('CSC 14400', 4, 'A', 'Completed'), // lower-division (ignored)
        makeCourse('CSC 30500', 3, 'A', 'Completed'), // 3cr upper
        makeCourse('CSC 35500', 4, 'B', 'Completed'), // 4cr upper
        makeCourse('CSC 36000', 3, 'A', 'Current'),   // 3cr upper (in-progress counts as applied)
        makeCourse('CSC 43000', 3, 'F', 'Completed')  // failing grade (does not count)
      ];

      const gateUnder = computeUpperDivisionGate(partialUpperCourses);
      expect(gateUnder).toEqual({
        required: 42,
        completed: 10,
        remaining: 32,
        isSatisfied: false,
        courses: ['CSC 30500', 'CSC 35500', 'CSC 36000']
      });

      // 14 upper-division 3-credit courses = 42 credits
      const fullUpperCourses = Array.from({ length: 14 }, (_, idx) =>
        makeCourse(`CSC ${30100 + idx * 100}`, 3, 'A', 'Completed')
      );
      const gateMet = computeUpperDivisionGate(fullUpperCourses);
      expect(gateMet.required).toBe(42);
      expect(gateMet.completed).toBe(42);
      expect(gateMet.remaining).toBe(0);
      expect(gateMet.isSatisfied).toBe(true);
    });
  });

  describe('4. Composition C-Grade Gatekeeper & Retake Net Credit Accounting', () => {
    it('retains 3 elective credits for a D in ENGL 15000, leaves Written Communication unsatisfied, flags retake warning, and computes 0 net credits / 3 enrolled credits on retake', () => {
      const studentRecord = {
        validCourses: [
          makeCourse('ENGL 15000', 3, 'D', 'Completed'),
          makeCourse('ENGL 17000', 3, 'B', 'Completed')
        ],
        excludedCourses: [],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: ['computer_science_bs_2026'],
        catalogDb: masterDb,
        auditOptions: { core42Completed: false }
      });

      // 1. Both courses (6 credits) are retained toward cumulative 120 graduation hours
      expect(audit.totalEarnedAndEnrolledCredits).toBe(6);
      expect(audit.claimedFreeElectives.some((c) => c.compactCode === 'ENGL15000')).toBe(true);

      // 2. Written Communication GE category remains unsatisfied
      const writtenCat = audit.generalEducationAudit.categories.find((c) => c.id === 'written_communication');
      expect(writtenCat.satisfied).toBe(false);
      expect(writtenCat.earnedCredits).toBe(3); // only ENGL 17000 (B) counts toward GE
      expect(writtenCat.remainingCredits).toBe(3);

      // 3. Advising warning matches specification
      expect(audit.compositionGatekeeperAudit.writtenCommunicationSatisfied).toBe(false);
      expect(audit.compositionGatekeeperAudit.warnings).toHaveLength(1);
      expect(audit.compositionGatekeeperAudit.warnings[0].courseCode).toBe('ENGL 15000');
      expect(audit.compositionGatekeeperAudit.warnings[0].message).toBe(COMPOSITION_RETAKE_WARNING);

      // 4. Retake Net Credit Accounting:
      // Retaking ENGL 15000 after earning a D (3 credits already in graduation pool) -> 0 net / 3 enrolled
      const plannedRetakeAfterD = makeCourse('ENGL 15000', 3, null, 'Scheduled');
      const retakeD = computeRetakeNetCredits(plannedRetakeAfterD, studentRecord.validCourses);
      expect(retakeD.isRetake).toBe(true);
      expect(retakeD.priorGrade).toBe('D');
      expect(retakeD.enrolledCredits).toBe(3);
      expect(retakeD.netCredits).toBe(0);
      expect(retakeD.badgeLabel).toBe('🔁 Retake (0 Net Cr / 3 Enrolled Cr)');

      // Retaking a course after prior F or W (0 earned credits) -> 3 net / 3 enrolled
      const failedHistory = [makeCourse('CSC 14400', 4, 'F', 'Completed')];
      const plannedRetakeAfterF = makeCourse('CSC 14400', 4, null, 'Scheduled');
      const retakeF = computeRetakeNetCredits(plannedRetakeAfterF, failedHistory);
      expect(retakeF.isRetake).toBe(true);
      expect(retakeF.priorGrade).toBe('F');
      expect(retakeF.enrolledCredits).toBe(4);
      expect(retakeF.netCredits).toBe(4);
      expect(retakeF.badgeLabel).toBe('🔁 Retake (4 Net Cr / 4 Enrolled Cr)');
    });
  });

  describe('5. Curricular Track Bifurcation (Data Science BS)', () => {
    it('configures Option A (9cr Group 1 + 18cr Group 2 = 27cr) and Option B (15cr Group 1 + 15cr Group 2 = 30cr)', () => {
      const dsProgram = masterDb.programs.find((p) => p.id === 'data_science_bs_2026');
      expect(dsProgram).toBeDefined();

      const trackA = resolveTrackConfiguration(dsProgram, 'option_a');
      expect(trackA.hasTracks).toBe(true);
      expect(trackA.activeTrackId).toBe('option_a');
      expect(trackA.activeTrack.name).toBe('Option A: Domain Depth');
      expect(trackA.activeTrack.group1Credits).toBe(9);
      expect(trackA.activeTrack.group2Credits).toBe(18);
      expect(trackA.totalElectiveCredits).toBe(27);
      expect(trackA.electivePoolTargets).toEqual([
        { poolId: 'DSCI_GROUP_1', title: 'Group 1 Electives (Domain Foundations)', creditsRequired: 9 },
        { poolId: 'DSCI_GROUP_2', title: 'Group 2 Electives (Advanced Computational Analytics)', creditsRequired: 18 }
      ]);

      const trackB = resolveTrackConfiguration(dsProgram, 'option_b');
      expect(trackB.hasTracks).toBe(true);
      expect(trackB.activeTrackId).toBe('option_b');
      expect(trackB.activeTrack.name).toBe('Option B: Balanced Applied Science');
      expect(trackB.activeTrack.group1Credits).toBe(15);
      expect(trackB.activeTrack.group2Credits).toBe(15);
      expect(trackB.totalElectiveCredits).toBe(30);
      expect(trackB.electivePoolTargets).toEqual([
        { poolId: 'DSCI_GROUP_1', title: 'Group 1 Electives (Domain Foundations)', creditsRequired: 15 },
        { poolId: 'DSCI_GROUP_2', title: 'Group 2 Electives (Advanced Computational Analytics)', creditsRequired: 15 }
      ]);

      // Verify runDegreeAudit propagates activeTrackId to programAudits
      const auditA = runDegreeAudit({
        studentRecord: { validCourses: [], excludedCourses: [] },
        declaredPrograms: [dsProgram],
        catalogDb: masterDb,
        auditOptions: { activeTrackId: 'option_a' }
      });
      const auditB = runDegreeAudit({
        studentRecord: { validCourses: [], excludedCourses: [] },
        declaredPrograms: [dsProgram],
        catalogDb: masterDb,
        auditOptions: { activeTrackId: 'option_b' }
      });

      expect(auditA.activeTrackId).toBe('option_a');
      expect(auditA.programAudits[0].electivePools.map((p) => p.creditsRequired)).toEqual([9, 18]);
      expect(auditB.activeTrackId).toBe('option_b');
      expect(auditB.programAudits[0].electivePools.map((p) => p.creditsRequired)).toEqual([15, 15]);
    });

    it('preserves pure function immutability on all inputs', () => {
      const studentRecord = Object.freeze({
        validCourses: Object.freeze([Object.freeze(makeCourse('MTH 27100', 5, 'A', 'Completed'))]),
        excludedCourses: Object.freeze([])
      });
      const declaredPrograms = Object.freeze(['computer_science_bs_2026', 'mathematics_minor_2026']);
      const auditOptions = Object.freeze({ core42Completed: true, activeTrackId: 'option_a' });

      expect(() =>
        runDegreeAudit({
          studentRecord,
          declaredPrograms,
          catalogDb: masterDb,
          auditOptions
        })
      ).not.toThrow();
    });
  });
});
