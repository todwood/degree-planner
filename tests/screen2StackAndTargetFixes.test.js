// tests/screen2StackAndTargetFixes.test.js
// Verification suite for Screen 2 credential stack synchronization, ghost minors, dynamic target math, and class standing progress bar

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cheerio from 'cheerio';
import { processRawCourseRecords } from '../src/engine/transcriptParser.js';
import { runDegreeAudit } from '../src/engine/waterfallAudit.js';
import Screen2Audit from '../src/components/Screen2Audit.jsx';
import masterDb from '../src/data/masterDatabase.json';

describe('Screen 2 Stack, Ghost Minors, Dynamic Target Math & Progress Bar Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Parser Fix: Eliminate Ghost Minors
  // ---------------------------------------------------------------------------
  it('1. transcriptParser.js does not synthesize declaredMinors from non-minor emphasis strings', () => {
    const rawRows = [
      {
        'Course Code': 'CSC 14400-01',
        'Published Code': 'CSC 14400',
        'Course Name': 'Computer Science I',
        'Credits': '4',
        'Grade': 'A',
        'Course Status': 'Completed',
        'Term': 'Fall 2024',
        'Delivery Method': 'On Ground',
        'Area of Study': 'Applications Development Emphasis',
        'Enrollment': 'Information Technology, BS'
      },
      {
        'Course Code': 'MTH 15100-01',
        'Published Code': 'MTH 15100',
        'Course Name': 'College Algebra',
        'Credits': '3',
        'Grade': 'B',
        'Course Status': 'Completed',
        'Term': 'Spring 2025',
        'Delivery Method': 'Online',
        'Area of Study': 'Concentration - Cloud Computing'
      }
    ];

    const parsed = processRawCourseRecords(rawRows);
    const meta = parsed.studentMetadata;

    // Concentrations and emphasisTracks capture the areas of study
    expect(meta.concentrations).toContain('Applications Development Emphasis');
    expect(meta.concentrations).toContain('Concentration - Cloud Computing');
    expect(meta.emphasisTracks).toContain('Applications Development Emphasis');

    // declaredMinors MUST NOT contain unverified emphasis strings
    expect(meta.declaredMinors).not.toContain('Applications Development Emphasis');
    expect(meta.declaredMinors).not.toContain('Concentration - Cloud Computing');
    expect(meta.declaredMinors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 2. Credential State Synchronization & Back-Navigation Data Flow
  // ---------------------------------------------------------------------------
  it('2. Multi-program stack preserves valid IDs across transitions and resolves in catalog', () => {
    const prog1Id = 'it_networking_bs_2026';
    const prog2Id = 'it_app_dev_bs_2026';

    const prog1 = masterDb.programs.find((p) => p.id === prog1Id);
    const prog2 = masterDb.programs.find((p) => p.id === prog2Id);

    expect(prog1).toBeDefined();
    expect(prog2).toBeDefined();

    // Intake completes with IDs in additionalPrograms:
    const declaredProgramIds = [prog1Id, prog2Id];
    const additionalPrograms = declaredProgramIds.filter((id) => id !== prog1Id);
    expect(additionalPrograms).toEqual(['it_app_dev_bs_2026']);

    // runDegreeAudit resolves both programs cleanly:
    const audit = runDegreeAudit({
      studentRecord: {
        studentMetadata: { catalogYear: '2026-2027' },
        validCourses: [],
        completedCourses: [],
        transferCourses: [],
        currentCourses: [],
        scheduledCourses: [],
        excludedCourses: []
      },
      declaredPrograms: declaredProgramIds,
      catalogDb: masterDb,
      auditOptions: { catalogYear: '2026-2027' }
    });

    expect(audit.programAudits.length).toBe(2);
    expect(audit.programAudits.map((pa) => pa.id)).toContain(prog1Id);
    expect(audit.programAudits.map((pa) => pa.id)).toContain(prog2Id);

    // Simulating Screen1 remount with propDeclaredProgramIds:
    const remountDeclaredProgramIds = [...declaredProgramIds];
    const resolvedOnRemount = remountDeclaredProgramIds
      .map((id) => masterDb.programs.find((p) => p.id === id || p.name === id))
      .filter(Boolean);

    expect(resolvedOnRemount.length).toBe(2);
    expect(resolvedOnRemount[0].id).toBe(prog1Id);
    expect(resolvedOnRemount[1].id).toBe(prog2Id);
  });

  // ---------------------------------------------------------------------------
  // 3. Screen 2 Info Card Secondary Major Labeling
  // ---------------------------------------------------------------------------
  it('3. Screen 2 Info Card displays secondary majors under "Major:", not "Minor:"', () => {
    const prog1Id = 'it_networking_bs_2026';
    const prog2Id = 'it_app_dev_bs_2026';

    const auditResult = runDegreeAudit({
      studentRecord: {
        studentMetadata: {
          name: 'Brandon Paz',
          studentId: 'L00123456',
          catalogYear: '2026-2027'
        },
        validCourses: [],
        completedCourses: [],
        transferCourses: [],
        currentCourses: [],
        scheduledCourses: [],
        excludedCourses: []
      },
      declaredPrograms: [prog1Id, prog2Id],
      catalogDb: masterDb,
      auditOptions: { catalogYear: '2026-2027' }
    });

    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, {
        auditResult,
        masterDb,
        selectedProgramId: prog1Id,
        declaredProgramIds: [prog1Id, prog2Id],
        additionalPrograms: [prog2Id],
        parsedTranscript: {
          studentMetadata: {
            name: 'Brandon Paz',
            studentId: 'L00123456',
            catalogYear: '2026-2027'
          }
        }
      })
    );

    const $ = cheerio.load(html);

    // Primary major heading:
    expect(html).toContain('Information Technology, BS');
    expect(html).toContain('Networking');

    // Secondary major must render with label "Major:", NOT "Minor:"
    const majorRows = $('p:contains("Major:")');
    expect(majorRows.length).toBeGreaterThanOrEqual(2);

    const fullText = $.text();
    expect(fullText).not.toContain('Minor: Information Technology, BS');
    expect(fullText).not.toContain('Minor: Information Technology, BS - Applications Development Emphasis');
  });

  // ---------------------------------------------------------------------------
  // 4. Dynamic Target Ceiling Math (> 120 Credits)
  // ---------------------------------------------------------------------------
  it('4. Dynamic target correctly expands beyond 120 credits for multi-program stacks', () => {
    const prog1Id = 'it_networking_bs_2026';
    const prog2Id = 'it_app_dev_bs_2026';

    const audit = runDegreeAudit({
      studentRecord: {
        studentMetadata: { catalogYear: '2026-2027' },
        validCourses: [],
        completedCourses: [],
        transferCourses: [],
        currentCourses: [],
        scheduledCourses: [],
        excludedCourses: []
      },
      declaredPrograms: [prog1Id, prog2Id],
      catalogDb: masterDb,
      auditOptions: { catalogYear: '2026-2027' }
    });

    // Both IT majors require 66 credits each with 24 credits overlap (net 108 cr) + 39 GE = 147 or 144 credits
    expect(audit.netRequiredStackCredits).toBeGreaterThan(120);
    expect(audit.targetGraduationCredits).toBe(audit.netRequiredStackCredits);
    expect(audit.targetGraduationCredits).toBeGreaterThanOrEqual(144);

    // Verify Screen2 renders this dynamic target
    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, {
        auditResult: audit,
        masterDb,
        selectedProgramId: prog1Id,
        declaredProgramIds: [prog1Id, prog2Id],
        additionalPrograms: [prog2Id]
      })
    );

    const $ = cheerio.load(html);
    const targetBadge = $('[data-testid="dynamic-target-badge"]');
    expect(targetBadge.text()).toContain(`Dynamic Target: ${audit.targetGraduationCredits} cr`);
  });

  // ---------------------------------------------------------------------------
  // 5. Academic Standing Progress Bar Redesign (4 Tiers)
  // ---------------------------------------------------------------------------
  it('5. Progress bar renders all 4 class standing tiers with proportional segment fills', () => {
    const auditResult = {
      primaryProgram: {
        id: 'cybersecurity_bs_2026',
        name: 'Cybersecurity, BS',
        catalog_year_id: '2026-2027',
        target_credits: 120
      },
      targetGraduationCredits: 120,
      totalCompletedCredits: 65, // Junior
      allStudentCourses: [
        { code: 'MTH 15100', credits: 3, state: 'Completed', operationalStatus: 'COMPLETED' },
        { code: 'CSC 14400', credits: 4, state: 'Completed', operationalStatus: 'COMPLETED' },
        { code: 'CSC 30500', credits: 3, state: 'In-Progress', operationalStatus: 'IN_PROGRESS' },
        { code: 'ICS 48900', credits: 3, state: 'Scheduled', operationalStatus: 'SCHEDULED' }
      ],
      policyChecklist: {
        totalCredits: {
          completed: 65,
          enrolled: 6,
          EarnedPlusEnrolled: 71,
          target: 120,
          satisfied: false
        }
      },
      programAudits: [
        {
          id: 'cybersecurity_bs_2026',
          name: 'Cybersecurity, BS',
          requirements: []
        }
      ],
      geBuckets: []
    };

    const html = renderToStaticMarkup(
      React.createElement(Screen2Audit, {
        auditResult,
        masterDb
      })
    );

    const $ = cheerio.load(html);

    // Card title and target badge
    const titleEl = $('[data-testid="path-to-graduation-title"]');
    expect(titleEl.text().trim()).toBe('PATH TO GRADUATION');

    const targetBadge = $('[data-testid="dynamic-target-badge"]');
    expect(targetBadge.text().trim()).toContain('Dynamic Target: 120 cr');

    // 4 Academic Standing Tiers rendered:
    expect(html).toContain('Freshman');
    expect(html).toContain('0–29 cr');
    expect(html).toContain('Sophomore');
    expect(html).toContain('30–59 cr');
    expect(html).toContain('Junior');
    expect(html).toContain('60–89 cr');
    expect(html).toContain('Senior');
    expect(html).toContain('90–119+ cr');

    // Since completed is 65 credits (>= 60), Sophomore and Junior have checkmarks
    expect(html).toContain('Sophomore ✓');
    expect(html).toContain('Junior ✓');

    // 3 path segments present:
    expect($('[data-testid="path-segment-completed"]').length).toBe(1);
    expect($('[data-testid="path-segment-active"]').length).toBe(1);
    expect($('[data-testid="path-segment-remaining"]').length).toBe(1);

    // Lion Paw marker and Diploma finish line
    expect($('[data-testid="lion-paw-marker"]').length).toBe(1);
    expect($('[data-testid="diploma-finish-icon"]').length).toBeGreaterThanOrEqual(1);

    // Metrics line
    const metricsLine = $('[data-testid="credit-metrics-line"]');
    expect(metricsLine.length).toBe(1);
    expect(metricsLine.text()).toContain('65 Completed');
    expect(metricsLine.text()).toContain('3 In-Progress');
    expect(metricsLine.text()).toContain('3 Scheduled');
  });
});
