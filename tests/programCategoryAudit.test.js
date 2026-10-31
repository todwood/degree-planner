import { describe, it, expect } from 'vitest';
import masterProgramsData from '../src/data/masterProgramsDatabase.json';
import masterDb from '../src/data/masterDatabase.json';
import { runDegreeAudit, runWaterfallAudit } from '../src/engine/waterfallAudit.js';

describe('Skill 1 Program Category Headers, Per-Course Repeat Rules & False Track Purge Suite', () => {
  describe('1. False Track Cleansing Invariants', () => {
    it('asserts falsely stamped programs in masterProgramsDatabase.json have flexible_elective_configurations: null', () => {
      const programs = masterProgramsData.programs || {};

      // Test Spanish Minor, Chemistry BA, and Biological Sciences BS
      const spanishMinor = programs['spanish_minor_2026'];
      expect(spanishMinor).toBeDefined();
      expect(spanishMinor.flexible_elective_configurations).toBeNull();

      const chemistryBa = programs['chemistry_ba_2026'];
      expect(chemistryBa).toBeDefined();
      expect(chemistryBa.flexible_elective_configurations).toBeNull();

      const bioSciBs = programs['biological_sciences_bs_2026'];
      expect(bioSciBs).toBeDefined();
      expect(bioSciBs.flexible_elective_configurations).toBeNull();

      // Additional sample of cleansed false tracks across other years
      const spanishCert = programs['spanish_certificate_2026'];
      if (spanishCert) expect(spanishCert.flexible_elective_configurations).toBeNull();

      const bioChemBs = programs['biochemistry_bs_2026'];
      if (bioChemBs) expect(bioChemBs.flexible_elective_configurations).toBeNull();
    });

    it('asserts data_science_bs_2026 retains its verified multi-track configuration', () => {
      const programs = masterProgramsData.programs || {};
      const ds2026 = programs['data_science_bs_2026'];
      expect(ds2026).toBeDefined();
      expect(ds2026.flexible_elective_configurations).toBeDefined();
      expect(ds2026.flexible_elective_configurations).not.toBeNull();

      const tracks = ds2026.flexible_elective_configurations.tracks;
      expect(Array.isArray(tracks)).toBe(true);
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toContain('Option A');
      expect(tracks[1].name).toContain('Option B');
    });
  });

  describe('2. Category Schema Integrity', () => {
    it('asserts theatre_bfa_acting_emphasis_2026 has requirement_categories containing major headers', () => {
      const programs = masterProgramsData.programs || {};
      const theatreActing = programs['theatre_bfa_acting_emphasis_2026'];
      expect(theatreActing).toBeDefined();

      const categories = theatreActing.requirement_categories || theatreActing.requirements?.requirement_categories;
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThanOrEqual(3);

      const categoryTitles = categories.map((c) => c.title);
      expect(categoryTitles).toContain('Major Coursework');
      expect(categoryTitles).toContain('Production Coursework');
      expect(categoryTitles).toContain('Acting Emphasis Coursework');
    });

    it('asserts Production Coursework has per_course_credit_requirement === 6 and credits_required === 24', () => {
      const programs = masterProgramsData.programs || {};
      const theatreActing = programs['theatre_bfa_acting_emphasis_2026'];
      const categories = theatreActing.requirement_categories || theatreActing.requirements?.requirement_categories;

      const prodCategory = categories.find((c) => c.category_id === 'PRODUCTION_COURSEWORK' || c.title === 'Production Coursework');
      expect(prodCategory).toBeDefined();
      expect(prodCategory.category_type).toBe('REPEAT_DISTRIBUTION');
      expect(prodCategory.credits_required).toBe(24);
      expect(prodCategory.per_course_credit_requirement).toBe(6);
      expect(prodCategory.courses).toEqual(
        expect.arrayContaining(['TA 10011', 'TA 20011', 'TA 30011', 'TA 40011'])
      );
    });
  });

  describe('3. Category Audit Repeat Math', () => {
    it('evaluates student with repeated attempts of TA 10011 and TA 20011 without repeat exclusion and computes 12/24 credits progress', () => {
      const studentRecord = {
        studentMetadata: { id: 'STU_THEATRE_ACTING_01', name: 'Stage Performer' },
        validCourses: [
          {
            code: 'TA 10011',
            title: 'Production I',
            credits: 3,
            grade: 'A',
            state: 'Completed',
            term: 'Fall 2024',
            termInfo: { year: 2024, semester: 'Fall' },
            isRetake: false
          },
          {
            code: 'TA 10011',
            title: 'Production I',
            credits: 3,
            grade: 'A',
            state: 'Completed',
            term: 'Spring 2025',
            termInfo: { year: 2025, semester: 'Spring' },
            isRetake: false
          },
          {
            code: 'TA 20011',
            title: 'Production II',
            credits: 3,
            grade: 'B',
            state: 'Completed',
            term: 'Fall 2025',
            termInfo: { year: 2025, semester: 'Fall' },
            isRetake: false
          },
          {
            code: 'TA 20011',
            title: 'Production II',
            credits: 3,
            grade: 'A',
            state: 'Completed',
            term: 'Spring 2026',
            termInfo: { year: 2026, semester: 'Spring' },
            isRetake: false
          }
        ],
        excludedCourses: []
      };

      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: ['theatre_bfa_acting_emphasis_2026'],
        catalogDb: masterDb
      });

      // 1. Assert neither attempt of TA 10011 or TA 20011 is excluded
      const excludedCodes = (audit.excludedCoursesLedger || audit.excludedCourses || []).map((c) => c.code);
      expect(excludedCodes).not.toContain('TA 10011');
      expect(excludedCodes).not.toContain('TA 20011');

      // 2. Locate Production Coursework category in audit
      const primaryAudit = audit.programAudits?.[0] || audit;
      const categories = primaryAudit.categories || audit.categories || [];
      const prodCategory = categories.find(
        (c) => c.category_id === 'PRODUCTION_COURSEWORK' || c.title === 'Production Coursework'
      );
      expect(prodCategory).toBeDefined();

      // Assert Production Coursework credit progress is 12 / 24 credits
      expect(prodCategory.credits_satisfied).toBe(12);
      expect(prodCategory.credits_required).toBe(24);
      expect(prodCategory.credits_remaining).toBe(12);
      expect(prodCategory.fulfilled).toBe(false);

      // Verify course-level details in Production Coursework:
      // TA 10011 satisfied at 6/6 cr
      const ta10011 = prodCategory.courses.find((c) => c.code === 'TA 10011');
      expect(ta10011).toBeDefined();
      expect(ta10011.creditsRequired).toBe(6);
      expect(ta10011.creditsSatisfied).toBe(6);
      expect(ta10011.satisfied).toBe(true);

      // TA 20011 satisfied at 6/6 cr
      const ta20011 = prodCategory.courses.find((c) => c.code === 'TA 20011');
      expect(ta20011).toBeDefined();
      expect(ta20011.creditsRequired).toBe(6);
      expect(ta20011.creditsSatisfied).toBe(6);
      expect(ta20011.satisfied).toBe(true);

      // TA 30011 and TA 40011 remaining at 0/6 cr
      const ta30011 = prodCategory.courses.find((c) => c.code === 'TA 30011');
      expect(ta30011).toBeDefined();
      expect(ta30011.creditsSatisfied).toBe(0);
      expect(ta30011.satisfied).toBe(false);
      expect(ta30011.remainingCredits).toBe(6);

      const ta40011 = prodCategory.courses.find((c) => c.code === 'TA 40011');
      expect(ta40011).toBeDefined();
      expect(ta40011.creditsSatisfied).toBe(0);
      expect(ta40011.satisfied).toBe(false);
      expect(ta40011.remainingCredits).toBe(6);

      // 3. Assert remaining requirements reflect 6 credits of TA 30011 and 6 credits of TA 40011
      const remainingProd = prodCategory.remainingRequirements || [];
      const remainingCodes = remainingProd.map((r) => r.code);
      expect(remainingCodes).toContain('TA 30011');
      expect(remainingCodes).toContain('TA 40011');

      const remainingTa30011 = remainingProd.find((r) => r.code === 'TA 30011');
      expect(remainingTa30011.credits || remainingTa30011.remainingCredits).toBe(6);

      const remainingTa40011 = remainingProd.find((r) => r.code === 'TA 40011');
      expect(remainingTa40011.credits || remainingTa40011.remainingCredits).toBe(6);
    });
  });
});
