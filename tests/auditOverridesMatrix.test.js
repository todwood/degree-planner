import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cheerio from 'cheerio';
import Screen2Audit from '../src/components/Screen2Audit.jsx';
import ManualAssignmentModal from '../src/components/audit/ManualAssignmentModal.jsx';
import CourseRecommenderModal from '../src/components/audit/CourseRecommenderModal.jsx';
import masterDb from '../src/data/masterDatabase.json' with { type: 'json' };
import masterProgramsDb from '../src/data/masterProgramsDatabase.json' with { type: 'json' };
import {
  getPrescribedGeForCategory,
  getPrescribedGeExplanation,
  calculateFreeElectivesNeeded,
  itemizeFreeElectives,
  buildCourseMatchedMap,
  isCourseEligibleForGeBucket
} from '../src/utils/auditOverrideHelpers.js';

function createMockAuditResult(overrides = {}) {
  return {
    primaryProgram: {
      id: 'cybersecurity_bs_2026',
      name: 'Cybersecurity, BS',
      catalog_year_id: '2026-2027',
      target_credits: 120
    },
    targetGraduationCredits: 120,
    totalCompletedCredits: 74,
    allStudentCourses: [
      { code: 'MTH 15100', compactCode: 'MTH15100', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'CSC 14400', compactCode: 'CSC14400', credits: 4, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'ICS 32300', compactCode: 'ICS32300', credits: 5, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'CSC 30500', compactCode: 'CSC30500', credits: 3, state: 'In-Progress', operationalStatus: 'IN_PROGRESS' },
      { code: 'ICS 48900', compactCode: 'ICS48900', credits: 3, state: 'Scheduled', operationalStatus: 'SCHEDULED' }
    ],
    upperDivisionGate: {
      required: 42,
      completed: 30,
      remaining: 12,
      isSatisfied: false,
      courses: ['ICS 32300']
    },
    compositionGatekeeper: {
      writtenCommunicationSatisfied: true,
      slots: [
        { id: 'comp_1', satisfied: true, satisfyingCourse: 'ENGL 15000' },
        { id: 'comp_2', satisfied: true, satisfyingCourse: 'ENGL 17000' }
      ],
      warnings: []
    },
    policyChecklist: {
      totalCredits: {
        completed: 74,
        enrolled: 6,
        EarnedPlusEnrolled: 80,
        target: 120,
        satisfied: false
      },
      residency: {
        currentInstitutionalCredits: 74,
        minInstitutionalCredits: 30,
        final24ResidencyMet: true,
        satisfied: true
      },
      humanDiversity: {
        completedOrEnrolledCount: 2,
        satisfied: true
      }
    },
    excludedCoursesLedger: [],
    programAudits: [
      {
        programId: 'cybersecurity_bs_2026',
        name: 'Cybersecurity, BS',
        role: 'Primary Major',
        satisfiedCredits: 12,
        requiredCredits: 58,
        requirements: [
          {
            code: 'CSC 14400',
            compactCode: 'CSC14400',
            title: 'Computer Science I',
            credits: 4,
            satisfied: true,
            matchedCourse: { code: 'CSC 14400', credits: 4, state: 'Completed', operationalStatus: 'COMPLETED' }
          },
          {
            code: 'ICS 32300',
            compactCode: 'ICS32300',
            title: 'Computer Architecture and Operating Systems',
            credits: 5,
            satisfied: true,
            matchedCourse: { code: 'ICS 32300', credits: 5, state: 'Completed', operationalStatus: 'COMPLETED' }
          },
          {
            code: 'CSC 30500',
            compactCode: 'CSC30500',
            title: 'Principles of Database Systems',
            credits: 3,
            satisfied: true,
            matchedCourse: { code: 'CSC 30500', credits: 3, state: 'In-Progress', operationalStatus: 'IN_PROGRESS' }
          },
          {
            code: 'ICS 48900',
            compactCode: 'ICS48900',
            title: 'Cybersecurity Capstone',
            credits: 3,
            satisfied: true,
            matchedCourse: { code: 'ICS 48900', credits: 3, state: 'Scheduled', operationalStatus: 'SCHEDULED' }
          },
          {
            code: 'MTH 14100',
            compactCode: 'MTH14100',
            title: 'Basic Statistics',
            credits: 3,
            satisfied: false,
            matchedCourse: null
          }
        ]
      }
    ],
    generalEducationAudit: {
      core42Active: false,
      earnedCredits: 30,
      totalRequired: 42,
      categories: [
        {
          id: 'mathematical_sciences',
          name: 'Mathematical Sciences',
          credits: 3,
          satisfied: true,
          remainingCredits: 0
        },
        {
          id: 'written_communication',
          name: 'Written Communication',
          credits: 6,
          satisfied: true,
          remainingCredits: 0
        },
        {
          id: 'social_behavioral_sciences',
          name: 'Social and Behavioral Sciences',
          credits: 9,
          satisfied: false,
          remainingCredits: 3
        }
      ]
    },
    geBuckets: [
      {
        bucket_id: 'GE-MATH',
        name: 'Mathematical Sciences (MOTR MATH)',
        required_credits: 3,
        satisfied: true,
        matchedCourse: { code: 'MTH 15100', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' }
      },
      {
        bucket_id: 'GE-SOCSCI',
        name: 'Social Sciences',
        required_credits: 3,
        satisfied: false,
        matchedCourse: null
      }
    ],
    freeElectives: [],
    ...overrides
  };
}

describe('Phase 3 — Screen 2 Degree Audit Override Matrix, Course Recommender & GE Locking Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. General Education Bucket Freezing / Locking
  // ---------------------------------------------------------------------------
  describe('1. GE Bucket Freezing / Locking (Directive A)', () => {
    it('verifies getPrescribedGeForCategory correctly identifies prescribed GE for Cybersecurity BS', () => {
      const cyberProg = masterProgramsDb.programs.cybersecurity_bs_2026;
      expect(cyberProg).toBeDefined();

      const prescribed = getPrescribedGeForCategory(cyberProg, 'mathematical_sciences');
      expect(prescribed).not.toBeNull();
      expect(prescribed.isPrescribed).toBe(true);
      expect(prescribed.courses).toContain('MTH 14100');
      expect(prescribed.programName).toBe('Cybersecurity, BS');
      expect(prescribed.tooltip).toBe(
        'This distribution requirement is fulfilled directly within the Cybersecurity, BS major coursework to avoid redundant credits.'
      );
    });

    it('renders locked card with subtle styling, 🔒 icon, info pill and tooltip in Screen 2', () => {
      const auditResult = createMockAuditResult();
      const html = renderToStaticMarkup(
        React.createElement(Screen2Audit, {
          auditResult,
          masterDb,
          selectedProgramId: 'cybersecurity_bs_2026'
        })
      );
      const $ = cheerio.load(html);

      // Mathematical Sciences card is locked
      const mathCard = $('[data-testid="ge-category-mathematical_sciences"]');
      expect(mathCard.length).toBe(1);

      // Renders locked pill
      const lockedPill = mathCard.find('[data-testid="ge-locked-pill"]');
      expect(lockedPill.length).toBe(1);
      expect(lockedPill.text()).toContain('Satisfied via Cybersecurity, BS');

      // Renders tooltip explanation
      const tooltip = mathCard.find('[data-testid="ge-locked-tooltip"]');
      expect(tooltip.length).toBe(1);
      expect(tooltip.text()).toContain('fulfilled directly within the Cybersecurity, BS major coursework to avoid redundant credits');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Unmatch Action ([ ✕ ]) on Matched Requirements
  // ---------------------------------------------------------------------------
  describe('2. Unmatch Action ([ ✕ ]) on Matched Requirements (Directive B)', () => {
    it('renders subtle unmatch button [ ✕ ] on all satisfied requirement rows', () => {
      const auditResult = createMockAuditResult();
      const html = renderToStaticMarkup(
        React.createElement(Screen2Audit, { auditResult, masterDb })
      );
      const $ = cheerio.load(html);

      // Completed course in Major: CSC 14400
      const unmatchCsc = $('[data-testid="unmatch-course-CSC 14400"]');
      expect(unmatchCsc.length).toBeGreaterThanOrEqual(1);
      expect(unmatchCsc.text().trim()).toContain('✕');

      // Completed course in GE: MTH 15100
      const unmatchMth = $('[data-testid="unmatch-course-MTH 15100"]');
      expect(unmatchMth.length).toBeGreaterThanOrEqual(1);

      // In-Progress course in Major: CSC 30500
      const unmatchInProgress = $('[data-testid="unmatch-course-CSC 30500"]');
      expect(unmatchInProgress.length).toBeGreaterThanOrEqual(1);

      // Scheduled course in Major: ICS 48900
      const unmatchScheduled = $('[data-testid="unmatch-course-ICS 48900"]');
      expect(unmatchScheduled.length).toBeGreaterThanOrEqual(1);
    });

    it('unmatching course flips row to ○ Unfulfilled and deducts completed credits from meter', () => {
      // Base audit has completedCr = 74
      const baseResult = createMockAuditResult();

      // Render with CSC 14400 (4 cr) unmatched
      const auditOverrides = {
        unmatched: {
          'MAJOR:CSC14400': {
            detachedCourse: { code: 'CSC 14400', credits: 4, state: 'Completed' },
            detachedCode: 'CSC 14400',
            credits: 4,
            isCompleted: true
          }
        },
        manualMatches: {},
        targetRecommendations: {}
      };

      const html = renderToStaticMarkup(
        React.createElement(Screen2Audit, {
          auditResult: baseResult,
          auditOptions: { auditOverrides },
          masterDb
        })
      );
      const $ = cheerio.load(html);

      // Completed credits meter drops from 74 to 70
      const completedCrEl = $('[data-testid="audit-completed-cr"]');
      expect(completedCrEl.length).toBe(1);
      expect(completedCrEl.text().trim()).toBe('70');

      const lionPawContainer = $('[data-testid="lion-paw-marker-container"]');
      expect(lionPawContainer.length).toBe(1);
      expect(lionPawContainer.text()).toContain('70 cr');

      // CSC 14400 row flips to Unfulfilled and shows Action Buttons
      const setCompleteBtn = $('[data-testid="set-complete-CSC14400"]');
      expect(setCompleteBtn.length).toBe(1);
      expect(setCompleteBtn.text()).toContain('Set to Complete');

      const suggestCourseBtn = $('[data-testid="suggest-course-CSC14400"]');
      expect(suggestCourseBtn.length).toBe(1);
      expect(suggestCourseBtn.text()).toContain('Suggest Recommended Course');

      // Detached course appears in Free Electives as available elective
      const htmlText = html;
      expect(htmlText).toContain('Unassigned / Detached Elective');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. "Set to Complete" Manual Assignment Modal & Exemption
  // ---------------------------------------------------------------------------
  describe('3. "Set to Complete" Manual Assignment & Exemption (Directive C)', () => {
    it('renders Special Exemption option in ManualAssignmentModal and assigns ✓ Exempted (0 cr)', () => {
      let assignedData = null;
      const html = renderToStaticMarkup(
        React.createElement(ManualAssignmentModal, {
          isOpen: true,
          reqKey: 'MAJOR:MTH14100',
          reqCode: 'MTH 14100',
          reqTitle: 'Basic Statistics',
          isGEPanel: false,
          studentCourses: [
            { code: 'MTH 15100', title: 'College Algebra', credits: 3, grade: 'A', state: 'Completed' }
          ],
          courseMatchedMap: {},
          onAssign: (data) => { assignedData = data; }
        })
      );
      const $ = cheerio.load(html);

      // Special Exemption option rendered at the top
      const exemptionOption = $('[data-testid="exemption-option"]');
      expect(exemptionOption.length).toBe(1);
      expect(exemptionOption.text()).toContain('🛡️ Student is Exempted (Policy Exemption Form Filed)');
      expect(exemptionOption.text()).toContain('0 earned credits, satisfies requirement via Dean/Chair waiver');

      // Confirm button is present
      const submitBtn = $('[data-testid="submit-assignment-btn"]');
      expect(submitBtn.length).toBe(1);
    });

    it('renders ✓ Exempted badge and [ ✕ ] button on requirement row when override is applied', () => {
      const baseResult = createMockAuditResult();
      const auditOverrides = {
        unmatched: {},
        manualMatches: {
          'MAJOR:MTH14100': {
            type: 'EXEMPTION',
            note: 'Policy Exemption Form Filed',
            credits: 0,
            requirementTitle: 'Basic Statistics'
          }
        },
        targetRecommendations: {}
      };

      const html = renderToStaticMarkup(
        React.createElement(Screen2Audit, {
          auditResult: baseResult,
          auditOptions: { auditOverrides },
          masterDb
        })
      );
      const $ = cheerio.load(html);

      // Row displays ✓ Exempted
      expect(html).toContain('✓ Exempted');

      // Row displays unmatch button for the exemption
      const unmatchExempt = $('[data-testid="unmatch-course-MTH14100"]');
      expect(unmatchExempt.length).toBe(1);
      expect(unmatchExempt.text().trim()).toContain('✕');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. "Set to Complete" Displays Double-Dip Warning in GE Panel
  // ---------------------------------------------------------------------------
  describe('4. General Education Double-Dip Policy Warning (Directive C.2)', () => {
    it('surfaces double-dip warning when an already-matched course is selected in GE panel', () => {
      const studentCourses = [
        { code: 'MTH 15100', title: 'College Algebra', credits: 3, grade: 'A', state: 'Completed' }
      ];
      // MTH 15100 is already matched to Major Core
      const courseMatchedMap = {
        'MTH 15100': 'Major Core: College Algebra',
        'MTH15100': 'Major Core: College Algebra'
      };

      const html = renderToStaticMarkup(
        React.createElement(ManualAssignmentModal, {
          isOpen: true,
          reqKey: 'GE:GE-MATH',
          reqCode: 'GE-MATH',
          reqTitle: 'Mathematical Sciences',
          isGEPanel: true, // Inside GE Panel
          studentCourses,
          courseMatchedMap
        })
      );
      const $ = cheerio.load(html);

      // Student roster displays already-matched tag
      const courseOption = $('[data-testid="course-option-MTH 15100"]');
      expect(courseOption.length).toBe(1);
      expect(courseOption.text()).toContain('(already matched to Major Core: College Algebra)');
    });

    it('buildCourseMatchedMap accurately identifies all matched requirements across GE and programs', () => {
      const geBuckets = [
        { bucket_id: 'GE-MATH', name: 'Mathematical Sciences', matchedCourse: { code: 'MTH 15100' } }
      ];
      const programLedgers = [
        {
          name: 'Cybersecurity, BS',
          requirements: [
            { code: 'CSC 14400', matchedCourse: { code: 'CSC 14400' } }
          ]
        }
      ];

      const map = buildCourseMatchedMap({ geBuckets, programLedgers });
      expect(map['MTH 15100']).toBe('Mathematical Sciences');
      expect(map['CSC 14400']).toBe('CSC 14400');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. "Suggest Recommended Course" Modal & History Badges
  // ---------------------------------------------------------------------------
  describe('5. Course Recommender Modal & History Badges (Directive D)', () => {
    it('renders CourseRecommenderModal with search input and category filter pills', () => {
      const html = renderToStaticMarkup(
        React.createElement(CourseRecommenderModal, {
          isOpen: true,
          reqKey: 'MAJOR:MTH14100',
          reqCode: 'MTH 14100',
          reqTitle: 'Basic Statistics',
          catalogCourses: [
            { code: 'CSC 14400', title: 'Computer Science I', credits: 4 },
            { code: 'CSC 30500', title: 'Principles of Database Systems', credits: 3 },
            { code: 'ICS 48900', title: 'Cybersecurity Capstone', credits: 3 }
          ],
          studentCourses: []
        })
      );
      const $ = cheerio.load(html);

      expect($('[data-testid="course-recommender-modal"]').length).toBe(1);
      expect($('[data-testid="recommender-search-input"]').length).toBe(1);
      expect($('[data-testid="filter-pill-all"]').length).toBe(1);
      expect($('[data-testid="filter-pill-lower"]').length).toBe(1);
      expect($('[data-testid="filter-pill-upper"]').length).toBe(1);
    });

    it('displays prior history badges: (Completed already), (In-Progress already), (Scheduled already)', () => {
      const studentCourses = [
        { code: 'CSC 14400', state: 'Completed', operationalStatus: 'COMPLETED' },
        { code: 'CSC 30500', state: 'In-Progress', operationalStatus: 'IN_PROGRESS' },
        { code: 'ICS 48900', state: 'Scheduled', operationalStatus: 'SCHEDULED' }
      ];

      const html = renderToStaticMarkup(
        React.createElement(CourseRecommenderModal, {
          isOpen: true,
          reqKey: 'FREE_ELEC:slot-1',
          reqCode: '',
          reqTitle: 'Free Elective (3 credits)',
          isFreeElective: true,
          catalogCourses: [
            { code: 'CSC 14400', title: 'Computer Science I', credits: 4 },
            { code: 'CSC 30500', title: 'Principles of Database Systems', credits: 3 },
            { code: 'ICS 48900', title: 'Cybersecurity Capstone', credits: 3 }
          ],
          studentCourses
        })
      );
      const $ = cheerio.load(html);

      // Completed badge
      const completedBadge = $('[data-testid="history-badge-completed-CSC 14400"]');
      expect(completedBadge.length).toBe(1);
      expect(completedBadge.text().trim()).toBe('(Completed already)');

      // In-Progress badge
      const inProgressBadge = $('[data-testid="history-badge-inprogress-CSC 30500"]');
      expect(inProgressBadge.length).toBe(1);
      expect(inProgressBadge.text().trim()).toBe('(In-Progress already)');

      // Scheduled badge
      const scheduledBadge = $('[data-testid="history-badge-scheduled-ICS 48900"]');
      expect(scheduledBadge.length).toBe(1);
      expect(scheduledBadge.text().trim()).toBe('(Scheduled already)');
    });

    it('filters courses correctly by MOTR GE bucket ID via isCourseEligibleForGeBucket', () => {
      const mathCourse = { code: 'MTH 15100', motr_bucket: 'mathematical_sciences', ge_category: 'GE-MATH' };
      const engCourse = { code: 'ENGL 15000', motr_bucket: 'written_communication', ge_category: 'GE-COMM' };

      expect(isCourseEligibleForGeBucket(mathCourse, 'GE-MATH')).toBe(true);
      expect(isCourseEligibleForGeBucket(engCourse, 'GE-MATH')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Free Electives Itemized Bucket
  // ---------------------------------------------------------------------------
  describe('6. Free Electives Itemized Bucket (Directive E)', () => {
    it('dynamically calculates free electives needed and itemizes into discrete rows', () => {
      // 120 target - 80 earned/active - 28 remaining major = 12 needed
      const needed12 = calculateFreeElectivesNeeded({
        targetGraduationCredits: 120,
        totalEarnedAndActiveCredits: 80,
        remainingMajorCredits: 28
      });
      expect(needed12).toBe(12);

      const items12 = itemizeFreeElectives(needed12);
      expect(items12.length).toBe(4);
      expect(items12.every((item) => item.title === 'Free Elective (3 credits)' && item.credits === 3)).toBe(true);

      // 120 target - 78 earned/active - 28 remaining major = 14 needed
      const needed14 = calculateFreeElectivesNeeded({
        targetGraduationCredits: 120,
        totalEarnedAndActiveCredits: 78,
        remainingMajorCredits: 28
      });
      expect(needed14).toBe(14);

      const items14 = itemizeFreeElectives(needed14);
      expect(items14.length).toBe(5); // four 3-cr + one 2-cr remainder
      expect(items14[0].title).toBe('Free Elective (3 credits)');
      expect(items14[4].title).toBe('Free Elective (at least 2 credits)');
      expect(items14[4].credits).toBe(2);
      expect(items14[4].isRemainder).toBe(true);
    });

    it('renders discrete rows with [ Set to Complete ] and [ 🔍 Suggest Recommended Course ] in Free Electives accordion', () => {
      const baseResult = createMockAuditResult();
      const html = renderToStaticMarkup(
        React.createElement(Screen2Audit, { auditResult: baseResult, masterDb })
      );
      const $ = cheerio.load(html);

      // Finish line accordion renders itemized rows
      const slot1Row = $('[data-testid="free-elective-row-free-elec-slot-1"]');
      expect(slot1Row.length).toBe(1);
      expect(slot1Row.text()).toContain('Free Elective (3 credits)');

      // Slot 1 has Set to Complete button
      const setComplete = $('[data-testid="set-complete-free-elec-slot-1"]');
      expect(setComplete.length).toBe(1);
      expect(setComplete.text()).toContain('Set to Complete');

      // Slot 1 has Suggest Recommended Course button
      const suggestCourse = $('[data-testid="suggest-course-free-elec-slot-1"]');
      expect(suggestCourse.length).toBe(1);
      expect(suggestCourse.text()).toContain('Suggest Recommended Course');
    });
  });
});
