import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import Screen3ScheduleDefault, * as Screen3ScheduleNamed from '../src/components/Screen3Schedule.jsx';
import Screen3ScheduleBoardDefault from '../src/components/Screen3ScheduleBoard.jsx';
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

describe('UI Audit & Schedule Engine Integration Suite', () => {
  describe('1. Screen 3 Schedule Board Upgrades', () => {
    it('verifies Screen3Schedule.jsx re-exports Screen3ScheduleBoard correctly', () => {
      expect(Screen3ScheduleDefault).toBe(Screen3ScheduleBoardDefault);
      expect(typeof Screen3ScheduleNamed.getDefaultNextSemesterAndSlot).toBe('function');
      expect(typeof Screen3ScheduleNamed.executeCourseMove).toBe('function');
      expect(typeof Screen3ScheduleNamed.formatSemesterCreditMetric).toBe('function');
    });

    it('computes retake card badge label and 0 net credits when prior grade was D', () => {
      const historicalCourses = [makeCourse('ENGL 15000', 3, 'D', 'Completed')];
      const plannedCourse = {
        code: 'ENGL 15000',
        compactCode: 'ENGL15000',
        credits: 3,
        isPlannedRetake: true
      };

      const retakeInfo = computeRetakeNetCredits(plannedCourse, historicalCourses);
      expect(retakeInfo.isRetake).toBe(true);
      expect(retakeInfo.priorGrade).toBe('D');
      expect(retakeInfo.enrolledCredits).toBe(3);
      expect(retakeInfo.netCredits).toBe(0);
      expect(retakeInfo.badgeLabel).toBe('🔁 Retake (0 Net Cr / 3 Enrolled Cr)');
    });

    it('computes semester summary metrics distinguishing enrolled credits from net degree credits', () => {
      const historicalCourses = [makeCourse('ENGL 15000', 3, 'D', 'Completed')];
      const semesterCourses = [
        { code: 'CSC 14400', credits: 4 },
        { code: 'MTH 27100', credits: 5 },
        { code: 'ENGL 15000', credits: 3, isPlannedRetake: true }
      ];

      const enrolledCredits = semesterCourses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
      const netCredits = semesterCourses.reduce((sum, c) => {
        const info = computeRetakeNetCredits(c, historicalCourses);
        const net = info.isRetake ? info.netCredits : (Number(c.credits) || 0);
        return sum + Number(net);
      }, 0);

      expect(enrolledCredits).toBe(12); // 4 + 5 + 3 = 12 enrolled
      expect(netCredits).toBe(9);       // 4 + 5 + 0 = 9 net (retake of D gives 0 net)

      const formatted = `Enrolled: ${enrolledCredits} cr | Net Toward Degree: ${netCredits} cr`;
      expect(formatted).toBe('Enrolled: 12 cr | Net Toward Degree: 9 cr');
    });
  });

  describe('2. Screen 2 Audit Upgrades', () => {
    it('generates multi-program ledgers with distinct role classifications and cross-counting badges', () => {
      const studentRecord = {
        validCourses: [
          makeCourse('MTH 27100', 5, 'A', 'Completed'),
          makeCourse('MTH 27200', 5, 'B', 'Completed')
        ],
        excludedCourses: [],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: [
          'computer_science_bs_2026',
          'data_science_bs_2026',
          'mathematics_minor_2026',
          'data_analysis_certificate_2026'
        ],
        catalogDb: masterDb,
        auditOptions: { primaryProgramId: 'computer_science_bs_2026' }
      });

      expect(audit.programAudits).toHaveLength(4);
      const [primary, secondary, minor, cert] = audit.programAudits;

      expect(primary.role).toBe('Primary Major');
      expect(secondary.role).toBe('Secondary Major');
      expect(minor.role).toBe('Minor');
      expect(cert.role).toBe('Certificate');

      // Shared course MTH 27100 in math minor displays cross-counting badge with CS
      const minorMth271 = minor.requirements.find((r) => r.compactCode === 'MTH27100');
      expect(minorMth271.isCrossCounted).toBe(true);
      expect(minorMth271.sharedWithProgramName).toBe('Computer Science, BS');
    });

    it('verifies Missouri CORE 42 banner and 8 cleared category markers when core42Completed is active', () => {
      const geAudit = auditGeneralEducationCategories({
        courses: [],
        catalogDb: masterDb,
        catalogYear: '2026-2027',
        programs: ['cybersecurity_bs_2026'],
        core42Completed: true
      });

      expect(geAudit.core42Active).toBe(true);
      expect(geAudit.bannerText).toBe('Missouri CORE 42 / AA Transfer Block Active');
      expect(geAudit.categories).toHaveLength(8);

      for (const cat of geAudit.categories) {
        expect(cat.satisfied).toBe(true);
        expect(cat.waived).toBe(true);
        expect(cat.reason).toBe(CORE42_CLEARANCE_REASON);
      }
    });

    it('verifies Institutional 42 Upper-Division meter calculation and deficiency pill flag', () => {
      const fewUpperCourses = [
        makeCourse('CSC 30500', 3, 'A', 'Completed'),
        makeCourse('CSC 35500', 4, 'B', 'Completed')
      ];

      const gate = computeUpperDivisionGate(fewUpperCourses);
      expect(gate.completed).toBe(7);
      expect(gate.remaining).toBe(35);
      expect(gate.isSatisfied).toBe(false);

      const deficiencyBadgeText = `⚠️ Deficient by ${gate.remaining} cr`;
      expect(deficiencyBadgeText).toBe('⚠️ Deficient by 35 cr');
    });

    it('verifies Composition Gatekeeper warning message for D grade in Composition', () => {
      const compCourses = [
        makeCourse('ENGL 15000', 3, 'D', 'Completed'),
        makeCourse('ENGL 17000', 3, 'B', 'Completed')
      ];

      const gate = evaluateCompositionGatekeeper(compCourses);
      const hasWarning = Boolean(gate.hasWarning ?? gate.warnings?.length > 0);
      expect(hasWarning).toBe(true);
      expect(gate.writtenCommunicationSatisfied).toBe(false);
      expect(gate.warnings).toHaveLength(1);
      expect(gate.warnings[0].message).toBe(COMPOSITION_RETAKE_WARNING);
      expect(gate.warnings[0].message).toContain('Grade of C or higher required to satisfy Composition GE. Course eligible for retake.');
    });

    it('verifies Curricular Track Bifurcation Option A (9/18) vs Option B (15/15) in Data Science BS', () => {
      const dsProgram = masterDb.programs.find((p) => p.id === 'data_science_bs_2026');
      expect(dsProgram).toBeDefined();

      const trackA = resolveTrackConfiguration(dsProgram, 'option_a');
      expect(trackA.activeTrack.name).toBe('Option A: Domain Depth');
      expect(trackA.activeTrack.group1Credits).toBe(9);
      expect(trackA.activeTrack.group2Credits).toBe(18);

      const trackB = resolveTrackConfiguration(dsProgram, 'option_b');
      expect(trackB.activeTrack.name).toBe('Option B: Balanced Applied Science');
      expect(trackB.activeTrack.group1Credits).toBe(15);
      expect(trackB.activeTrack.group2Credits).toBe(15);
    });
  });
});
