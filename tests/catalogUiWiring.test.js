import { describe, it, expect } from 'vitest';
import masterProgramsDb from '../src/data/masterProgramsDatabase.json' with { type: 'json' };
import masterDb from '../src/data/masterDatabase.json' with { type: 'json' };
import {
  runDegreeAudit,
  getAllCatalogPrograms,
  resolveGeMatrixForYear,
  GE_MATRICES_BY_YEAR
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

describe('Master 1,008-Program Database UI Wiring & Dynamic Finish Line Suite', () => {
  describe('1. Program Corpus Exposure Across Catalog Years', () => {
    const allHarvestedPrograms = Object.values(masterProgramsDb.programs || {});

    it('contains exactly 1,008 total harvested programs in masterProgramsDatabase.json', () => {
      expect(allHarvestedPrograms).toHaveLength(1008);
      expect(masterProgramsDb.total_programs).toBe(1008);
    });

    it('exposes exactly 264 programs for catalog year 2026-2027', () => {
      const progs2026 = allHarvestedPrograms.filter(
        (p) => p.catalogYear === '2026-2027' || p.catalog_year_id === '2026-2027'
      );
      expect(progs2026).toHaveLength(264);

      // Verify emphasis tracks and sub-credentials are preserved
      const actingEmphasis = progs2026.find((p) => p.id === 'theatre_bfa_acting_emphasis_2026');
      expect(actingEmphasis).toBeDefined();
      expect(actingEmphasis.name).toBe('Theatre, BFA Acting Emphasis');

      const appDevEmphasis = progs2026.find(
        (p) => p.id === 'information_technology_bs_applications_development_emphasis_2026'
      );
      expect(appDevEmphasis).toBeDefined();
      expect(appDevEmphasis.name).toContain('Applications Development Emphasis');
    });

    it('exposes exactly 251 programs for catalog year 2025-2026', () => {
      const progs2025 = allHarvestedPrograms.filter(
        (p) => p.catalogYear === '2025-2026' || p.catalog_year_id === '2025-2026'
      );
      expect(progs2025).toHaveLength(251);
    });

    it('exposes exactly 249 programs for catalog year 2024-2025', () => {
      const progs2024 = allHarvestedPrograms.filter(
        (p) => p.catalogYear === '2024-2025' || p.catalog_year_id === '2024-2025'
      );
      expect(progs2024).toHaveLength(249);
    });

    it('exposes exactly 244 programs for catalog year 2023-2024', () => {
      const progs2023 = allHarvestedPrograms.filter(
        (p) => p.catalogYear === '2023-2024' || p.catalog_year_id === '2023-2024'
      );
      expect(progs2023).toHaveLength(244);
    });

    it('getAllCatalogPrograms exposes full 1,008 program corpus with seamless fallback', () => {
      const allCatalog = getAllCatalogPrograms(masterDb);
      expect(allCatalog.length).toBeGreaterThanOrEqual(1008);
      const cyber = allCatalog.find((p) => p.id === 'cybersecurity_bs_2026');
      expect(cyber).toBeDefined();
    });
  });

  describe('2. Dynamic Graduation Finish Line Math', () => {
    it('Single 120-credit program targets 120 credits', () => {
      const singleProgram = {
        id: 'standard_degree_bs_2026',
        name: 'Standard Degree, BS',
        credentialType: 'MAJOR',
        catalogYear: '2026-2027',
        totalRequiredCredits: 120,
        total_degree_credits: 120,
        total_program_credits: 54,
        requirements: {
          major_core_courses: ['CIS 10000', 'CIS 20000']
        }
      };

      const audit = runDegreeAudit({
        studentRecord: { validCourses: [], excludedCourses: [], studentMetadata: {} },
        declaredPrograms: [singleProgram],
        catalogDb: masterDb,
        auditOptions: { catalogYear: '2026-2027' }
      });

      expect(audit.targetGraduationCredits).toBe(120);
      expect(audit.policyChecklist.totalCredits.target).toBe(120);
      expect(audit.policyChecklist.totalCredits.minThreshold).toBe(120);
    });

    it('90-credit degree targets 90 credits', () => {
      const accelerated90 = {
        id: 'accelerated_degree_90cr',
        name: 'Accelerated Degree, BAS',
        credentialType: 'MAJOR',
        catalogYear: '2026-2027',
        totalRequiredCredits: 90,
        total_degree_credits: 90,
        total_program_credits: 36,
        requirements: {
          major_core_courses: ['BAS 10000', 'BAS 20000']
        }
      };

      const audit = runDegreeAudit({
        studentRecord: { validCourses: [], excludedCourses: [], studentMetadata: {} },
        declaredPrograms: [accelerated90],
        catalogDb: masterDb,
        auditOptions: { catalogYear: '2026-2027' }
      });

      expect(audit.targetGraduationCredits).toBe(90);
      expect(audit.policyChecklist.totalCredits.target).toBe(90);
      expect(audit.policyChecklist.totalCredits.minThreshold).toBe(90);
    });

    it('Multi-program stack requiring 135 net unique credits dynamically sets graduation target to 135 credits, and does NOT report 100% complete at 120 credits', () => {
      // Primary Major: 70 credits
      const primaryMajor = {
        id: 'primary_major_135',
        name: 'Primary Major, BS',
        credentialType: 'MAJOR',
        totalRequiredCredits: 70,
        total_degree_credits: 120,
        requirements: {
          major_core_credits: 70,
          major_core_courses: ['CS 10100', 'MTH 27100', 'CS 20100']
        }
      };

      // Secondary Major: 50 credits
      const secondaryMajor = {
        id: 'secondary_major_135',
        name: 'Secondary Major, BS',
        credentialType: 'MAJOR',
        totalRequiredCredits: 50,
        requirements: {
          major_core_credits: 50,
          major_core_courses: ['DS 10100', 'DS 20100', 'CS 20100'] // CS 20100 (3cr) overlaps
        }
      };

      // Minor: 23 credits, 5 credits overlap with Primary Major
      const minorProg = {
        id: 'minor_prog_135',
        name: 'Mathematics Minor',
        credentialType: 'MINOR',
        totalRequiredCredits: 23,
        requirements: {
          major_core_credits: 23,
          major_core_courses: ['MTH 10100', 'MTH 27100'] // MTH 27100 (5cr) overlaps
        }
      };

      // Gross program credits: 70 + 50 + 23 = 143
      // Overlap: CS 20100 (3cr) + MTH 27100 (5cr) = 8cr overlap
      // Net program unique credits = 143 - 8 = 135 credits
      // Student completes 120 credits
      const validCourses = [];
      for (let i = 1; i <= 40; i++) {
        validCourses.push(makeCourse(`ELEC ${10000 + i}`, 3, 'A', 'Completed'));
      }
      expect(validCourses.reduce((sum, c) => sum + c.credits, 0)).toBe(120);

      const audit = runDegreeAudit({
        studentRecord: { validCourses, excludedCourses: [], studentMetadata: {} },
        declaredPrograms: [primaryMajor, secondaryMajor, minorProg],
        catalogDb: masterDb,
        auditOptions: {
          core42Completed: true, // GE requires 0 credits
          catalogYear: '2026-2027'
        }
      });

      // Target must dynamically scale to 135 credits
      expect(audit.netRequiredStackCredits).toBe(135);
      expect(audit.targetGraduationCredits).toBe(135);
      expect(audit.policyChecklist.totalCredits.target).toBe(135);

      // Student has completed 120 credits out of 135 required:
      expect(audit.totalCompletedCredits).toBe(120);
      expect(audit.policyChecklist.totalCredits.completed).toBe(120);

      // Must NOT report 100% complete at 120 credits
      expect(audit.totalCompletedCredits >= audit.targetGraduationCredits).toBe(false);
      expect(audit.totalCompletedCredits / audit.targetGraduationCredits).toBeLessThan(1.0);
      expect(audit.totalCompletedCredits / audit.targetGraduationCredits).toBeCloseTo(120 / 135, 3);
    });
  });

  describe('3. Multi-Year General Education Matrix Resolution', () => {
    const catalogYears = ['2026-2027', '2025-2026', '2024-2025', '2023-2024'];

    catalogYears.forEach((year) => {
      it(`resolves distinct GE distribution matrix for ${year} without errors`, () => {
        const matrix = resolveGeMatrixForYear(year, masterDb);
        expect(matrix).toBeDefined();
        expect(matrix.total_credits_required).toBe(42);
        expect(Object.keys(matrix.categories).length).toBe(8);

        // Required 8 CORE 42 categories
        const catKeys = Object.keys(matrix.categories);
        expect(catKeys).toContain('written_communication');
        expect(catKeys).toContain('oral_communication');
        expect(catKeys).toContain('mathematics');
        expect(catKeys).toContain('civics');
        expect(catKeys).toContain('social_behavioral_sciences');
        expect(catKeys).toContain('humanities_fine_arts');
        expect(catKeys).toContain('natural_sciences');
        expect(catKeys).toContain('additional_ge_electives');
      });

      it(`runs runDegreeAudit for a program in catalog year ${year} with complete success`, () => {
        const allHarvested = Object.values(masterProgramsDb.programs || {});
        const programForYear = allHarvested.find(
          (p) => p.catalogYear === year && p.credentialType === 'MAJOR'
        );
        expect(programForYear).toBeDefined();

        const audit = runDegreeAudit({
          studentRecord: { validCourses: [], excludedCourses: [], studentMetadata: {} },
          declaredPrograms: [programForYear],
          catalogDb: masterDb,
          auditOptions: {
            catalogYear: year,
            core42Completed: false
          }
        });

        expect(audit).toBeDefined();
        expect(audit.generalEducationAudit.catalogYear).toBe(year);
        expect(audit.generalEducationAudit.categories).toHaveLength(8);
        expect(audit.targetGraduationCredits).toBeGreaterThanOrEqual(90);
      });

      it(`preserves Missouri CORE 42 full lower-division waiver across ${year}`, () => {
        const allHarvested = Object.values(masterProgramsDb.programs || {});
        const programForYear = allHarvested.find(
          (p) => p.catalogYear === year && p.credentialType === 'MAJOR'
        );

        const audit = runDegreeAudit({
          studentRecord: { validCourses: [], excludedCourses: [], studentMetadata: {} },
          declaredPrograms: [programForYear],
          catalogDb: masterDb,
          auditOptions: {
            catalogYear: year,
            core42Completed: true
          }
        });

        expect(audit.generalEducationAudit.core42Active).toBe(true);
        expect(audit.generalEducationAudit.remainingCredits).toBe(0);
        for (const cat of audit.generalEducationAudit.categories) {
          expect(cat.satisfied).toBe(true);
          expect(cat.remainingCredits).toBe(0);
          expect(cat.waived).toBe(true);
        }
      });
    });
  });
});
