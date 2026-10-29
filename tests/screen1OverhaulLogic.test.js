import { describe, it, expect } from 'vitest';
import {
  formatParsedTelemetrySummary,
  computeParsedTelemetryTotals,
  evaluateActiveTermEnrollment,
  parseAdvisorEmailUsername,
  formatFullAdvisorEmail,
  resolveRegistrationStartTerm,
  computePriorityRegistrationWindow,
  REGISTRATION_TERM_WINDOWS,
  getPacingConstraintOptions,
  SUMMER_TUITION_NOTICE_TEXT,
  OVERLOAD_NOTICE_TEXT,
  serializePlanPayloadForPdf,
  extractPlanPayloadFromPdfText
} from '../src/utils/intakeHelpers.js';

describe('Screen 1 Overhaul — Step 1 Pure Intake Logic Suite', () => {
  describe('A. Whole-Number Credit Telemetry & Active-Term Audit', () => {
    it('computes integer-rounded credit totals and formats the telemetry summary string', () => {
      const sampleCourses = [
        { code: 'ENGL 15000', credits: 3.0, state: 'TR', term: 'TR' },
        { code: 'MTH 14100', credits: 3.4, state: 'Transfer', term: 'TR' },
        { code: 'CSC 10000', credits: 3.2, state: 'Completed', term: 'Fall 2025' },
        { code: 'CSC 14400', credits: 4.4, state: 'Completed', term: 'Spring 2026' },
        { code: 'CSC 24400', credits: 3.0, state: 'Current', term: 'Fall 2026' },
        { code: 'PHRL 10000', credits: 2.8, state: 'Scheduled', term: 'Fall 2026 Session II' },
        { code: 'HIST 10000', credits: 3.0, state: 'Excluded', status: 'Dropped', term: 'Fall 2026' }
      ];

      const totals = computeParsedTelemetryTotals(sampleCourses, 'Fall 2026');
      // Transfer: Math.round(3.0 + 3.4) = Math.round(6.4) = 6
      // Institutional: Math.round(3.2 + 4.4) = Math.round(7.6) = 8
      // Current: Math.round(3.0 + 2.8) = Math.round(5.8) = 6
      // Total: 6 + 8 + 6 = 20 across 6 non-excluded courses
      expect(totals.totalCourses).toBe(6);
      expect(totals.transferCredits).toBe(6);
      expect(totals.institutionalCredits).toBe(8);
      expect(totals.currentCredits).toBe(6);
      expect(totals.totalCredits).toBe(20);

      const banner = formatParsedTelemetrySummary(sampleCourses, 'Fall 2026');
      expect(banner).toBe(
        'Parsed 6 Courses (6 Transfer + 8 Institutional + 6 Current = 20 Total Credits)'
      );
    });

    it('evaluates active-term enrollment by combining completed Session I and current/scheduled courses in the same active semester', () => {
      const courses = [
        // Prior term course (should not count in Fall 2026 active term)
        { code: 'ENGL 15000', credits: 3, state: 'Completed', term: 'Spring 2026' },
        // Transfer course (should not count in Fall 2026 active term)
        { code: 'HIST 10500', credits: 3, state: 'TR', term: 'TR' },
        // Completed Fall 2026 Session I course (MUST count toward Fall 2026 active term!)
        { code: 'COM 11000', credits: 3, state: 'Completed', term: '2026FA-I' },
        // Current 16-week Fall 2026 course
        { code: 'CSC 14400', credits: 6, state: 'Current', term: 'Fall 2026' },
        // Scheduled Fall 2026 Session II course
        { code: 'ART 10000', credits: 3, state: 'Scheduled', term: 'Fall 2026 Session II' }
      ];

      const result = evaluateActiveTermEnrollment(courses, 'Fall 2026', 'FULL_TIME');
      expect(result.activeCompletedCredits).toBe(3);
      expect(result.activeCurrentCredits).toBe(9);
      expect(result.activeTermTotalCredits).toBe(12);
      expect(result.showLowCreditWarning).toBe(false);
      expect(result.canEditActiveTerm).toBe(true);
    });

    it('flags showLowCreditWarning when Full-Time student has fewer than 12 active-term credits, and suppresses warning for Part-Time', () => {
      const underEnrolledCourses = [
        { code: 'COM 11000', credits: 3, state: 'Completed', term: 'Fall 2026 Session I' },
        { code: 'CSC 14400', credits: 6, state: 'Current', term: 'Fall 2026 16-Week' }
      ];

      const fullTimeEval = evaluateActiveTermEnrollment(
        underEnrolledCourses,
        'Fall 2026',
        'FULL_TIME'
      );
      expect(fullTimeEval.activeTermTotalCredits).toBe(9);
      expect(fullTimeEval.showLowCreditWarning).toBe(true);
      expect(fullTimeEval.canEditActiveTerm).toBe(true);

      const partTimeEval = evaluateActiveTermEnrollment(
        underEnrolledCourses,
        'Fall 2026',
        'PART_TIME'
      );
      expect(partTimeEval.activeTermTotalCredits).toBe(9);
      expect(partTimeEval.showLowCreditWarning).toBe(false);
      expect(partTimeEval.canEditActiveTerm).toBe(true);
    });
  });

  describe('B. Advisor Email & Identity Normalization', () => {
    it('strips @lindenwood.edu case-insensitively and formats full advisor email cleanly', () => {
      expect(parseAdvisorEmailUsername('MWood@lindenwood.edu')).toBe('MWood');
      expect(parseAdvisorEmailUsername('  jsmith@LINDENWOOD.EDU  ')).toBe('jsmith');
      expect(parseAdvisorEmailUsername('todwood')).toBe('todwood');
      expect(parseAdvisorEmailUsername('')).toBe('');
      expect(parseAdvisorEmailUsername(null)).toBe('');

      expect(formatFullAdvisorEmail('mwood')).toBe('mwood@lindenwood.edu');
      expect(formatFullAdvisorEmail('  mwood  ')).toBe('mwood@lindenwood.edu');
      expect(formatFullAdvisorEmail('mwood@lindenwood.edu')).toBe('mwood@lindenwood.edu');
      expect(formatFullAdvisorEmail('')).toBe('');
    });
  });

  describe('C. Registration Start Term Auto-Calculation & 1-Week Cutoff Window', () => {
    it('auto-computes Spring 2027 16wk without manual prompt when student has active Fall 2026 courses', () => {
      const coursesWithActiveFall = [
        { code: 'CSC 14400', credits: 3, state: 'Current', term: 'Fall 2026' },
        { code: 'ENGL 15000', credits: 90, state: 'Completed', term: 'Spring 2026' }
      ];

      const resolved = resolveRegistrationStartTerm({
        courses: coursesWithActiveFall,
        referenceDate: '2026-10-29'
      });

      expect(resolved.startTerm).toBe('Spring 2027 16wk');
      expect(resolved.requiresManualSelection).toBe(false);
      expect(resolved.priorityWindow.standing).toBe('Senior');
      expect(resolved.priorityWindow.windowLabel).toBe('Senior Priority Week 1');
      expect(resolved.cutoffRule).toBe('1 week after start of classes');
    });

    it('triggers manual selection prompt when no active Fall 2026 courses exist and excludes Fall 2026 II 8wk on Oct 29, 2026', () => {
      const resolved = resolveRegistrationStartTerm({
        courses: [],
        referenceDate: '2026-10-29'
      });

      expect(resolved.requiresManualSelection).toBe(true);
      expect(resolved.eligibleTerms).not.toContain('Fall 2026 16wk');
      expect(resolved.eligibleTerms).not.toContain('Fall 2026 II 8wk');
      expect(resolved.eligibleTerms[0]).toBe('Spring 2027 16wk');
      expect(resolved.eligibleTerms).toEqual([
        'Spring 2027 16wk',
        'Spring 2027 II 8wk',
        'Summer 2027',
        'Fall 2027 16wk',
        'Fall 2027 II 8wk'
      ]);
      // Standalone Fall I 8wk and Spring I 8wk are never present
      expect(REGISTRATION_TERM_WINDOWS.map((t) => t.id)).not.toContain('Fall 2026 I 8wk');
      expect(REGISTRATION_TERM_WINDOWS.map((t) => t.id)).not.toContain('Spring 2027 I 8wk');
    });

    it('includes Fall 2026 II 8wk when referenceDate is on or before the Oct 23, 2026 Friday Week 1 cutoff', () => {
      const beforeCutoff = resolveRegistrationStartTerm({
        courses: [],
        referenceDate: '2026-10-23'
      });
      expect(beforeCutoff.requiresManualSelection).toBe(true);
      expect(beforeCutoff.eligibleTerms[0]).toBe('Fall 2026 II 8wk');
    });

    it('computes credit-tiered priority registration windows across all 4 standing tiers', () => {
      expect(computePriorityRegistrationWindow(95).windowLabel).toBe('Senior Priority Week 1');
      expect(computePriorityRegistrationWindow(75).windowLabel).toBe('Junior Week 2');
      expect(computePriorityRegistrationWindow(45).windowLabel).toBe('Sophomore Week 3');
      expect(computePriorityRegistrationWindow(15).windowLabel).toBe('Freshman Week 4');
      expect(computePriorityRegistrationWindow(15).cutoffRule).toBe(
        '1 week after start of classes'
      );
    });
  });

  describe('D. Scheduling Constraints & Pacing Options Validator', () => {
    it('returns Full-Time min/cap options and filters cap16WkOptions >= selectedMin16Wk', () => {
      const ftDefault = getPacingConstraintOptions('FULL_TIME', 12, 15, 'No Summer (Default)');
      expect(ftDefault.min16WkValues).toEqual([12, 15, 18]);
      expect(ftDefault.min16WkOptions[0].label).toBe('12 Credits (Default)');
      expect(ftDefault.cap16WkValues).toEqual([12, 15, 16, 17, 18, 21, 24]);
      expect(ftDefault.cap16WkOptions.find((o) => o.value === 15).label).toBe(
        '15 Credits (Default)'
      );
      expect(ftDefault.cap16WkOptions.find((o) => o.value === 18).label).toBe(
        '18 Credits (Plateau Cap)'
      );
      expect(ftDefault.cap16WkOptions.find((o) => o.value === 21).label).toBe(
        '21 Credits (Not Recommended)'
      );
      expect(ftDefault.cap16WkOptions.find((o) => o.value === 24).label).toBe(
        '24 Credits (Not Recommended)'
      );
      expect(ftDefault.showOverloadNotice).toBe(false);
      expect(ftDefault.showSummerTuitionNotice).toBe(false);

      // When min is 18, caps below 18 (12, 15, 16, 17) are filtered out
      const ftMin18 = getPacingConstraintOptions('FULL_TIME', 18, 18, 'No Summer (Default)');
      expect(ftMin18.cap16WkValues).toEqual([18, 21, 24]);
    });

    it('returns Part-Time min/cap options and filters cap16WkOptions >= selectedMin16Wk', () => {
      const pt = getPacingConstraintOptions('PART_TIME', 6, 11, 'No Summer (Default)');
      expect(pt.min16WkValues).toEqual([3, 6, 9]);
      expect(pt.min16WkOptions.find((o) => o.value === 6).label).toBe('6 Credits (Default)');
      expect(pt.cap16WkValues).toEqual([6, 9, 11]);
      expect(pt.cap16WkOptions.find((o) => o.value === 11).label).toBe(
        '11 Credits (Part-Time Cap)'
      );
    });

    it('validates 8-week session caps, modality options, summer tuition notice, and >18 credit overload notice', () => {
      const overloadAndSummer = getPacingConstraintOptions('FULL_TIME', 15, 21, 'Yes Summer');

      expect(overloadAndSummer.cap8WkValues).toEqual([0, 3, 6, 9, 12]);
      expect(overloadAndSummer.cap8WkOptions.find((o) => o.value === 0).label).toBe(
        '0 Credits (No 8-Week)'
      );
      expect(overloadAndSummer.cap8WkOptions.find((o) => o.value === 9).label).toBe(
        '9 Credits (Default)'
      );
      expect(overloadAndSummer.cap8WkOptions.find((o) => o.value === 12).label).toBe(
        '12 Credits (Not Recommended)'
      );

      expect(overloadAndSummer.modalityOptions).toEqual([
        'No Preference (Default)',
        'Online-Only',
        'Prefer OnGround',
        'Prefer Online'
      ]);

      expect(overloadAndSummer.summerOptions).toEqual(['No Summer (Default)', 'Yes Summer']);
      expect(overloadAndSummer.summerCapValues).toEqual([3, 6, 9, 12]);
      expect(overloadAndSummer.summerCapOptions.find((o) => o.value === 6).label).toBe(
        '6 Credits (Default)'
      );
      expect(overloadAndSummer.summerCapOptions.find((o) => o.value === 12).label).toBe(
        '12 Credits (Not Recommended)'
      );
      expect(overloadAndSummer.showSummerTuitionNotice).toBe(true);
      expect(overloadAndSummer.summerTuitionNoticeText).toBe(SUMMER_TUITION_NOTICE_TEXT);

      expect(overloadAndSummer.showOverloadNotice).toBe(true);
      expect(overloadAndSummer.overloadNoticeText).toBe(OVERLOAD_NOTICE_TEXT);
    });
  });

  describe('E. Smart PDF Plan State Serializer', () => {
    it('round-trips student intake state, declared credentials, advisor identity, and pacing rules via LINDENWOOD_PLAN_PAYLOAD_V1', () => {
      const originalState = {
        studentInfo: {
          name: 'Alex Rivera',
          studentId: 'L00987654'
        },
        advisorInfo: {
          name: 'Matthias Wood',
          email: 'MWood@lindenwood.edu'
        },
        declaredCredentialIds: ['data_science_bs_2026', 'math_minor_2026'],
        intakeConfig: {
          enrollmentStatus: 'FULL_TIME',
          selectedMin16Wk: 12,
          selectedCap16Wk: 15,
          selectedCap8Wk: 9,
          modalityPreference: 'Prefer OnGround',
          summerAvailability: 'Yes Summer',
          selectedSummerCap: 6,
          startTerm: 'Spring 2027 16wk',
          core42Completed: true,
          activeTrackId: 'option_a'
        }
      };

      const serializedBlock = serializePlanPayloadForPdf(originalState);
      expect(serializedBlock).toContain('LINDENWOOD_PLAN_PAYLOAD_V1:');

      // Simulate embedding inside extracted multi-line PDF page text
      const simulatedPdfText = `
        Lindenwood University — Official Advising Degree Plan
        Student: Alex Rivera (L00987654)
        Generated on October 29, 2026
        ${serializedBlock}
        Page 1 of 2
      `;

      const extracted = extractPlanPayloadFromPdfText(simulatedPdfText);
      expect(extracted).not.toBeNull();
      expect(extracted.studentInfo).toEqual(originalState.studentInfo);
      expect(extracted.declaredCredentialIds).toEqual([
        'data_science_bs_2026',
        'math_minor_2026'
      ]);
      expect(extracted.advisorInfo.username).toBe('MWood');
      expect(extracted.advisorInfo.email).toBe('MWood@lindenwood.edu');
      expect(extracted.intakeConfig).toEqual(originalState.intakeConfig);
    });

    it('returns null safely when PDF text has no LINDENWOOD_PLAN_PAYLOAD_V1 block', () => {
      expect(extractPlanPayloadFromPdfText('Random PDF text without payload')).toBeNull();
      expect(extractPlanPayloadFromPdfText('')).toBeNull();
      expect(extractPlanPayloadFromPdfText(null)).toBeNull();
    });
  });
});
