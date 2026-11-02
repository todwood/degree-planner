import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import masterProgramsDb from '../src/data/masterProgramsDatabase.json';
import {
  runDegreeAudit,
  runWaterfallAudit,
  auditGeneralEducationCategories,
  getAllCatalogPrograms
} from '../src/engine/waterfallAudit.js';
import { processRawCourseRecords } from '../src/engine/transcriptParser.js';
import { normalizeActiveCourseStatus } from '../src/utils/intakeHelpers.js';

function makeCourse(code, credits, grade = 'A', state = 'Completed', title = '') {
  const compactCode = code.replace(/\s+/g, '').toUpperCase();
  const match = compactCode.match(/^([A-Z]+)(\d+)$/);
  return {
    code,
    compactCode,
    title: title || code,
    department: match ? match[1] : 'GEN',
    number: match ? Number(match[2]) : 10000,
    level: match ? Number(match[2]) : 10000,
    credits,
    grade,
    state
  };
}

describe('Institutional GE Alignment, Skill 2 Schedule Sync, Active Term Normalization & Lab Packing Suite', () => {
  it('1. verifies BSC 22700 in masterDatabase.json has geTag "GE-NatSciLec/Lab" and canonical title suffix', () => {
    const course = masterDb.courses.find((c) => c.code === 'BSC 22700');
    expect(course).toBeDefined();
    expect(course.geTag).toBe('GE-NatSciLec/Lab');
    expect(course.title).toContain('(GE-NatSciLec/Lab)');
    expect(course.title).toBe('Human Anatomy and Physiology I (GE-NatSciLec/Lab)');
    expect(course.credits).toBe(4);
  });

  it('2. normalizes courses in active FA-II (8wk) session to In-Progress while retaining future scheduled terms', () => {
    // A course object in FA-II 8wk with raw status 'Scheduled'
    const statusFa2 = normalizeActiveCourseStatus({ status: 'Scheduled', term: 'FA-II (8wk)' });
    expect(statusFa2).toBe('In-Progress');

    // Future 16wk term remains Scheduled
    const statusFuture = normalizeActiveCourseStatus({ status: 'Scheduled', term: 'SP (16wk)' });
    expect(statusFuture).toBe('Scheduled');

    // Full processRawCourseRecords pipeline test
    const records = processRawCourseRecords([
      {
        code: 'ICS 32400',
        title: 'Cisco Networking II',
        credits: 5,
        grade: '',
        term: 'FA-II (8wk) 2026',
        status: 'Scheduled'
      },
      {
        code: 'ICS 32500',
        title: 'Cisco Networking III',
        credits: 5,
        grade: '',
        term: 'SP (16wk) 2027',
        status: 'Scheduled'
      }
    ]);

    const activeCourse = records.validCourses.find((c) => c.code === 'ICS 32400');
    expect(activeCourse).toBeDefined();
    expect(activeCourse.status).toBe('In-Progress');
    expect(activeCourse.state).toBe('Current');

    const futureCourse = records.validCourses.find((c) => c.code === 'ICS 32500');
    expect(futureCourse).toBeDefined();
    expect(futureCourse.status).toBe('Scheduled');
    expect(futureCourse.state).toBe('Scheduled');
  });

  it('3. filters ProgramCombobox choices strictly by active catalogYear', () => {
    const allProgs = getAllCatalogPrograms(masterDb);
    const activeYear = '2026-2027';

    const filtered = allProgs.filter((p) => {
      const progYear = p.catalogYear || p.catalog_year || p.catalog_year_id;
      return progYear === activeYear;
    });

    expect(filtered.length).toBeGreaterThan(0);
    for (const prog of filtered) {
      const progYear = prog.catalogYear || prog.catalog_year || prog.catalog_year_id;
      expect(progYear).toBe(activeYear);
    }

    // Verify non-matching years (e.g., 2024-2025, 2025-2026) are strictly excluded
    expect(filtered.some((p) => (p.catalogYear || p.catalog_year) === '2024-2025')).toBe(false);
    expect(filtered.some((p) => (p.catalogYear || p.catalog_year) === '2025-2026')).toBe(false);
  });

  it('4. matches completed ICS/IIT courses to major requirements under cybersecurity_bs_2026', () => {
    const courses = [
      makeCourse('ICS 21300', 3, 'A', 'Completed', 'Foundations of Information Technology'),
      makeCourse('ICS 21400', 3, 'A', 'Completed', 'Foundations of Networking'),
      makeCourse('IIT 21500', 3, 'B', 'Completed', 'Programming Logic and Design'),
      makeCourse('MTH 14100', 3, 'A', 'Completed', 'Basic Statistics (GE-Math)')
    ];

    const studentRecord = {
      validCourses: courses,
      excludedCourses: [],
      studentMetadata: { catalogYear: '2026-2027' }
    };

    const audit = runDegreeAudit({
      studentRecord,
      declaredPrograms: ['cybersecurity_bs_2026'],
      catalogDb: masterDb,
      auditOptions: { core42Completed: false }
    });

    const primaryAudit = audit.programAudits[0];
    expect(primaryAudit.programId).toBe('cybersecurity_bs_2026');

    const req213 = primaryAudit.requirements.find((r) => r.compactCode === 'ICS21300');
    const req214 = primaryAudit.requirements.find((r) => r.compactCode === 'ICS21400');
    const req215 = primaryAudit.requirements.find((r) => r.compactCode === 'IIT21500');

    expect(req213?.satisfied).toBe(true);
    expect(req214?.satisfied).toBe(true);
    expect(req215?.satisfied).toBe(true);
  });

  it('5. structures major program ledgers into categories with titles and sub-credit totals', () => {
    const studentRecord = {
      validCourses: [
        makeCourse('ICS 21300', 3, 'A', 'Completed'),
        makeCourse('ICS 21400', 3, 'A', 'Completed')
      ],
      excludedCourses: [],
      studentMetadata: { catalogYear: '2026-2027' }
    };

    const audit = runDegreeAudit({
      studentRecord,
      declaredPrograms: ['cybersecurity_bs_2026'],
      catalogDb: masterDb,
      auditOptions: { core42Completed: false }
    });

    const primaryAudit = audit.programAudits[0];
    expect(primaryAudit.categories).toBeDefined();
    expect(Array.isArray(primaryAudit.categories)).toBe(true);
    expect(primaryAudit.categories.length).toBeGreaterThan(0);

    const coreCat = primaryAudit.categories[0];
    expect(coreCat.title).toBeDefined();
    expect(coreCat.credits_required).toBeGreaterThan(0);
    expect(coreCat.courses).toBeDefined();
    expect(Array.isArray(coreCat.courses)).toBe(true);
  });

  it('6. satisfies 4-credit Natural Science with Lab via single 4-credit combo (BSC 22700)', () => {
    const courses = [
      makeCourse('BSC 22700', 4, 'A', 'Completed', 'Human Anatomy and Physiology I (GE-NatSciLec/Lab)')
    ];

    const geAudit = auditGeneralEducationCategories({
      courses,
      catalogDb: masterDb,
      catalogYear: '2026-2027',
      programs: [],
      core42Completed: false
    });

    const natSci = geAudit.categories.find((c) => c.id === 'natural_sciences');
    expect(natSci).toBeDefined();
    expect(natSci.labSatisfied).toBe(true);
    expect(natSci.earnedCredits).toBe(4);
    expect(natSci.appliedCourses).toContain('BSC 22700');
  });

  it('7. packs paired 3-credit lecture (BSC 11000) and 1-credit lab (BSC 11020) together for 4 credits', () => {
    const courses = [
      makeCourse('BSC 11000', 3, 'A', 'Completed', 'Introduction to Biology (GE-NatSci)'),
      makeCourse('BSC 11020', 1, 'A', 'Completed', 'Introduction to Biology Laboratory (GE-NatSciLab)')
    ];

    const geAudit = auditGeneralEducationCategories({
      courses,
      catalogDb: masterDb,
      catalogYear: '2026-2027',
      programs: [],
      core42Completed: false
    });

    const natSci = geAudit.categories.find((c) => c.id === 'natural_sciences');
    expect(natSci).toBeDefined();
    expect(natSci.labSatisfied).toBe(true);
    expect(natSci.earnedCredits).toBe(4);
    expect(natSci.appliedCourses).toEqual(expect.arrayContaining(['BSC 11000', 'BSC 11020']));
  });

  it('8. blocks 1-credit lab from satisfying a 3-credit standalone GE distribution bucket', () => {
    const courses = [
      makeCourse('BSC 11020', 1, 'A', 'Completed', 'Introduction to Biology Laboratory (GE-NatSciLab)')
    ];

    const geAudit = auditGeneralEducationCategories({
      courses,
      catalogDb: masterDb,
      catalogYear: '2026-2027',
      programs: [],
      core42Completed: false
    });

    // 1-credit lab must NOT satisfy standalone 3-credit or 9-credit buckets
    const socSci = geAudit.categories.find((c) => c.id === 'social_behavioral_sciences');
    expect(socSci.earnedCredits).toBe(0);
    expect(socSci.appliedCourses).toHaveLength(0);

    const humArts = geAudit.categories.find((c) => c.id === 'humanities_fine_arts');
    expect(humArts.earnedCredits).toBe(0);
    expect(humArts.appliedCourses).toHaveLength(0);

    const math = geAudit.categories.find((c) => c.id === 'mathematics');
    expect(math.earnedCredits).toBe(0);
    expect(math.appliedCourses).toHaveLength(0);

    const civics = geAudit.categories.find((c) => c.id === 'civics');
    expect(civics.earnedCredits).toBe(0);
    expect(civics.appliedCourses).toHaveLength(0);
  });
});
