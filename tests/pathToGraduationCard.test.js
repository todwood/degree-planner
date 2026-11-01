import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cheerio from 'cheerio';
import Screen2Audit from '../src/components/Screen2Audit.jsx';
import masterDb from '../src/data/masterDatabase.json';

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
      { code: 'MTH 15100', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'CSC 14400', credits: 4, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'ICS 32300', credits: 5, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'ICS 32301', credits: 1, state: 'Completed', operationalStatus: 'COMPLETED' },
      { code: 'CSC 30500', credits: 3, state: 'In-Progress', operationalStatus: 'IN_PROGRESS' },
      { code: 'MTH 27100', credits: 5, state: 'In-Progress', operationalStatus: 'IN_PROGRESS' },
      { code: 'ICS 48900', credits: 3, state: 'Scheduled', operationalStatus: 'SCHEDULED' }
    ],
    upperDivisionGate: {
      required: 42,
      completed: 30,
      remaining: 12,
      isSatisfied: false,
      courses: ['ICS 32300', 'ICS 32301']
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
        enrolled: 11,
        EarnedPlusEnrolled: 85,
        target: 120,
        satisfied: false
      },
      residency: {
        currentInstitutionalCredits: 68,
        minInstitutionalCredits: 30,
        final24ResidencyMet: true,
        satisfied: true
      },
      humanDiversity: {
        completedOrEnrolledCount: 2,
        satisfied: true
      }
    },
    excludedCoursesLedger: [
      { code: 'MTH 09000', title: 'Intermediate Algebra', credits: 3, term: 'Fall 2023', grade: 'P', reason: 'DEVELOPMENTAL' },
      { code: 'CSC 10000', title: 'Intro to Computers', credits: 3, term: 'Spring 2024', grade: 'D', reason: 'REPEATED_ATTEMPT' },
      { code: 'ENG 11000', title: 'Basic Writing', credits: 3, term: 'Fall 2023', grade: 'F', reason: 'BELOW_MIN_GRADE' }
    ],
    programAudits: [],
    generalEducationAudit: {
      core42Active: false,
      earnedCredits: 33,
      categories: []
    },
    ...overrides
  };
}

describe('Path to Graduation Infographic & Policy Drawer Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Header & Dynamic Target Badge
  // ---------------------------------------------------------------------------
  it('1. Card header renders "PATH TO GRADUATION" and dynamic target badge', () => {
    const auditResult = createMockAuditResult();
    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult, masterDb })
    );
    const $ = cheerio.load(html);

    const titleEl = $('[data-testid="path-to-graduation-title"]');
    expect(titleEl.length).toBe(1);
    expect(titleEl.text().trim()).toBe('PATH TO GRADUATION');

    const targetBadge = $('[data-testid="dynamic-target-badge"]');
    expect(targetBadge.length).toBe(1);
    expect(targetBadge.text().trim()).toContain('Dynamic Target: 120 cr');

    // Verify "RACE TO GRADUATION" is completely absent
    expect(html).not.toContain('RACE TO GRADUATION');
  });

  // ---------------------------------------------------------------------------
  // 2. Infographic SVGs: Lion Paw Marker & Diploma Finish Line
  // ---------------------------------------------------------------------------
  it('2. Infographic renders Lion Paw marker and Diploma finish line SVG elements', () => {
    const auditResult = createMockAuditResult();
    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult, masterDb })
    );
    const $ = cheerio.load(html);

    const lionPaw = $('[data-testid="lion-paw-marker"]');
    expect(lionPaw.length).toBe(1);
    expect(lionPaw.attr('aria-label')).toBe('Lion Paw Progress Marker');

    const diplomaIcon = $('[data-testid="diploma-finish-icon"]');
    expect(diplomaIcon.length).toBeGreaterThanOrEqual(1);

    // Verify 3 distinct path segments
    expect($('[data-testid="path-segment-completed"]').length).toBe(1);
    expect($('[data-testid="path-segment-active"]').length).toBe(1);
    expect($('[data-testid="path-segment-remaining"]').length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Credit Metrics Line Text
  // ---------------------------------------------------------------------------
  it('3. Credit metrics line renders completed, in-progress, scheduled, and remaining breakdown', () => {
    const auditResult = createMockAuditResult();
    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult, masterDb })
    );
    const $ = cheerio.load(html);

    const metricsLine = $('[data-testid="credit-metrics-line"]');
    expect(metricsLine.length).toBe(1);
    const text = metricsLine.text().replace(/\s+/g, ' ');

    expect(text).toContain('74 Completed');
    expect(text).toContain('8 In-Progress');
    expect(text).toContain('3 Scheduled');
    expect(text).toContain('35 Remaining to Graduation');
    expect(text).toContain('Earned + Active: 85 Credits');
  });

  // ---------------------------------------------------------------------------
  // 4. Drawer Defaults to Collapsed and Expands Cleanly
  // ---------------------------------------------------------------------------
  it('4. Drawer defaults to collapsed state and expands when open', () => {
    const auditResult = createMockAuditResult();

    // Default collapsed render
    const collapsedHtml = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult, masterDb, initialDrawerOpen: false })
    );
    const $collapsed = cheerio.load(collapsedHtml);

    const toggleBtnCollapsed = $collapsed('#audit-details-drawer-toggle');
    expect(toggleBtnCollapsed.length).toBe(1);
    expect(toggleBtnCollapsed.text()).toContain('▼ View Institutional Policy Checks & Excluded Courses Ledger (3 Excluded)');
    expect($collapsed('[data-testid="policy-and-ledger-drawer"]').length).toBe(0);

    // Expanded render
    const expandedHtml = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult, masterDb, initialDrawerOpen: true })
    );
    const $expanded = cheerio.load(expandedHtml);

    const toggleBtnExpanded = $expanded('#audit-details-drawer-toggle');
    expect(toggleBtnExpanded.text()).toContain('▲ Hide Institutional Policy Checks & Excluded Courses Ledger (3 Excluded)');
    expect($expanded('[data-testid="policy-and-ledger-drawer"]').length).toBe(1);

    // Excluded courses table present in expanded view
    const table = $expanded('[data-testid="excluded-courses-table"]');
    expect(table.length).toBe(1);

    // Check concise reason badges
    const tableText = table.text();
    expect(tableText).toContain('[ Developmental ]');
    expect(tableText).toContain('[ Retake Attempt ]');
    expect(tableText).toContain('[ Below Minimum Grade ]');
  });

  // ---------------------------------------------------------------------------
  // 5. Institutional Cards: Clean Text, Status Badges & Zero Progress Bars
  // ---------------------------------------------------------------------------
  it('5. Institutional cards display clean text and status badges (Met, In-Progress, Not Yet Met) without internal progress bars', () => {
    const auditResult = createMockAuditResult();
    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult, masterDb, initialDrawerOpen: true })
    );
    const $ = cheerio.load(html);

    const grid = $('[data-testid="policy-checks-grid"]');
    expect(grid.length).toBe(1);

    // Card 1: 42 Upper-Division Hours
    const card1 = $('[data-testid="policy-card-upper-division"]');
    expect(card1.length).toBe(1);
    expect(card1.text()).toContain('42 Upper-Division Credits');
    expect(card1.text()).toContain('30 of 42 credits (30000+ level) completed.');
    expect(card1.text()).toContain('⚠️ 12 credits remaining');
    expect(card1.text()).toContain('[ In-Progress ]');

    // Card 2: Composition Courses
    const card2 = $('[data-testid="policy-card-composition"]');
    expect(card2.length).toBe(1);
    expect(card2.text()).toContain('Composition Courses (ENGL 15000 & ENGL 17000)');
    expect(card2.text()).toContain('Both courses require a grade of C or higher.');
    expect(card2.text()).toContain('[ Met ]');

    // Card 3: Human Diversity (HD)
    const card3 = $('[data-testid="policy-card-human-diversity"]');
    expect(card3.length).toBe(1);
    expect(card3.text()).toContain('Human Diversity (HD) Courses');
    expect(card3.text()).toContain('2 General Education courses tagged with /HD.');

    // Card 4: Institutional Residency
    const card4 = $('[data-testid="policy-card-residency"]');
    expect(card4.length).toBe(1);
    expect(card4.text()).toContain('Lindenwood Residency');
    expect(card4.text()).toContain('Minimum 30 institutional credits, with 24 of the final 30 credits taken at Lindenwood.');
    expect(card4.text()).toContain('[ Met ]');

    // INVARIANT: Do NOT render internal progress bars or mini-graphs
    const progressBars = grid.find('div.h-2, div.h-1, progress, [role="progressbar"]');
    expect(progressBars.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Human Diversity Gate: Evaluates 2 /HD Courses
  // ---------------------------------------------------------------------------
  it('6. Human Diversity gate verifies 2 /HD courses across Met, In-Progress, and Not Yet Met states', () => {
    // Scenario A: 2 HD courses completed -> [ Met ]
    const auditA = createMockAuditResult({
      allStudentCourses: [
        { code: 'HIS 10500', title: 'World History /HD', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' },
        { code: 'ART 11000', title: 'Art Appreciation /HD', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' }
      ]
    });
    const htmlA = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult: auditA, masterDb, initialDrawerOpen: true })
    );
    const $A = cheerio.load(htmlA);
    const cardA = $A('[data-testid="policy-card-human-diversity"]');
    expect(cardA.text()).toContain('[ Met ]');
    expect(cardA.text()).toContain('2 of 2 /HD courses completed');

    // Scenario B: 1 HD course in-progress -> [ In-Progress ]
    const auditB = createMockAuditResult({
      allStudentCourses: [
        { code: 'HIS 10500', title: 'World History /HD', credits: 3, state: 'In-Progress', operationalStatus: 'IN_PROGRESS' }
      ]
    });
    const htmlB = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult: auditB, masterDb, initialDrawerOpen: true })
    );
    const $B = cheerio.load(htmlB);
    const cardB = $B('[data-testid="policy-card-human-diversity"]');
    expect(cardB.text()).toContain('[ In-Progress ]');
    expect(cardB.text()).toContain('0 of 2 /HD courses completed • 1 in-progress');

    // Scenario C: 0 HD courses -> [ Not Yet Met ]
    const auditC = createMockAuditResult({
      allStudentCourses: [
        { code: 'MTH 15100', title: 'College Algebra', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' }
      ]
    });
    const htmlC = renderToStaticMarkup(
      React.createElement(Screen2Audit, { auditResult: auditC, masterDb, initialDrawerOpen: true })
    );
    const $C = cheerio.load(htmlC);
    const cardC = $C('[data-testid="policy-card-human-diversity"]');
    expect(cardC.text()).toContain('[ Not Yet Met ]');
    expect(cardC.text()).toContain('0 of 2 /HD courses completed');
  });
});
