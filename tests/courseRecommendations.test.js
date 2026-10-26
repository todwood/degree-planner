import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json' with { type: 'json' };
import baseHistoricalFulfillments from '../src/data/historicalFulfillments.json' with { type: 'json' };
import {
  getCourseRecommendations,
  formatGpaWithLetter,
  formatPeerPopularity,
  formatTypicalOffering,
  buildHistoricalLookup,
  matchesBucket
} from '../src/utils/courseRecommendations.js';

describe('Tiered, Institutional-Only Course Recommendations Engine', () => {
  describe('1. Concrete Catalog Course Guard', () => {
    it('returns null for standard concrete catalog courses (e.g. MTH 27100, CSC 10100, ENG 17000)', () => {
      const concreteCourses = [
        { code: 'MTH 27100', title: 'Calculus I (GE-Math)', credits: 5 },
        { code: 'CSC 10100', title: 'Computer Science I', credits: 4 },
        { code: 'ENGL 17000', title: 'Composition II (GE-Comm)', credits: 3 },
        { code: 'ICS 31000', title: 'IT Hardware and Software', credits: 3 },
        { code: 'ART 18100', title: 'Art Appreciation (GE-Human Culture: Art)', credits: 3 }
      ];

      concreteCourses.forEach((c) => {
        const recs = getCourseRecommendations(c, 'it_app_dev_bs_2026', masterDb.courses);
        expect(recs).toBeNull();
      });
    });

    it('returns null when selectedCourse is null, undefined, or empty', () => {
      expect(getCourseRecommendations(null)).toBeNull();
      expect(getCourseRecommendations(undefined)).toBeNull();
    });
  });

  describe('2. Strict Institutional Integrity & Transfer Exclusion', () => {
    it('never recommends ELECT 10000, GE 10000, or transfer artifacts in any recommendation tier', () => {
      const mockCatalogWithTransfers = [
        ...masterDb.courses,
        {
          code: 'ELECT 10000',
          title: 'Free Elective 10000 Level',
          credits: 3,
          isTransfer: true,
          type: 'placeholder'
        },
        {
          code: 'GE 10000',
          title: 'GE-Humanities Transfer',
          credits: 3,
          isTransfer: true,
          type: 'placeholder'
        },
        {
          code: 'ELECT 20000',
          title: 'Technical Credit',
          credits: 3,
          isTransfer: true
        },
        {
          code: 'PSY 10000',
          title: 'Principles of Psychology',
          credits: 3,
          isTransfer: true,
          grade: 'TR-A'
        }
      ];

      // Test across Tier 1, Tier 2, and Tier 3 placeholders
      const testPlaceholders = [
        { code: 'REQ_GE_MATH', title: 'GE: Mathematics (3cr)' },
        { code: 'REQ_GE_ART', title: 'General Education: Fine Arts' },
        { code: 'REQ_GE_ELEC1', title: 'General Education: Elective I' },
        { code: 'REQ_ELEC_GEN', title: 'General Elective' },
        { code: 'REQ_ELEC_UPPER', title: 'Upper-Level Elective (30000+)' }
      ];

      testPlaceholders.forEach((ph) => {
        const recs = getCourseRecommendations(
          ph,
          'it_app_dev_bs_2026',
          mockCatalogWithTransfers,
          baseHistoricalFulfillments
        );

        expect(recs).not.toBeNull();
        expect(Array.isArray(recs)).toBe(true);

        recs.forEach((rec) => {
          // Assert: ELECT 10000 and GE 10000 transfer artifacts are never recommended
          expect(rec.code).not.toBe('ELECT 10000');
          expect(rec.code).not.toBe('GE 10000');
          expect(rec.code.startsWith('ELECT')).toBe(false);
          expect(rec.code.startsWith('GE ')).toBe(false);
          expect(rec.isTransfer).not.toBe(true);
          expect(rec.isInstitutional).toBe(true);
        });
      });
    });
  });

  describe('3. Tier 1: Categorized GE Placeholders & Zero-Completion Invariant', () => {
    it('recommends qualifying catalog courses for REQ_GE_MATH, sorting popular courses first and zero-completion courses at bottom', () => {
      const mathPlaceholder = {
        code: 'REQ_GE_MATH',
        title: 'GE: Mathematics (3cr)',
        ge_bucket_id: 'math'
      };

      const recs = getCourseRecommendations(
        mathPlaceholder,
        'it_app_dev_bs_2026',
        masterDb.courses,
        baseHistoricalFulfillments
      );

      expect(recs).not.toBeNull();
      expect(recs.tier).toBe(1);
      expect(recs.tierLabel).toBe('Categorized General Education');
      expect(recs.length).toBeGreaterThanOrEqual(4);

      // Verify MTH 14100 is present and at the top with peer completions
      const mth14100 = recs.find((c) => c.code === 'MTH 14100');
      expect(mth14100).toBeDefined();
      expect(mth14100.completionCount).toBeGreaterThan(0);
      expect(mth14100.gradeBadge).toMatch(/GPA/);

      // Verify zero-completion qualifying courses (e.g. MTH 15200, MTH 27100) are included at the bottom
      const zeroCompCourses = recs.filter((c) => c.completionCount === 0);
      expect(zeroCompCourses.length).toBeGreaterThan(0);
      zeroCompCourses.forEach((zc) => {
        expect(zc.popularityBadge).toBe('0 peers recorded');
        expect(zc.gradeBadge).toBe('N/A');
        expect(zc.averageGpa).toBeNull();
      });

      // Verify sorting: every course with count > 0 precedes any course with count === 0
      let seenZero = false;
      for (const c of recs) {
        if (c.completionCount === 0) seenZero = true;
        if (seenZero) {
          expect(c.completionCount).toBe(0);
        }
      }
    });

    it('correctly categorizes Fine Arts placeholder (REQ_GE_ART)', () => {
      const artPlaceholder = {
        code: 'REQ_GE_ART',
        title: 'General Education: Fine Arts',
        ge_bucket_id: 'arts'
      };

      const recs = getCourseRecommendations(artPlaceholder);
      expect(recs).not.toBeNull();
      expect(recs.tier).toBe(1);

      const codes = recs.map((c) => c.code);
      expect(codes).toContain('ART 18100');
      expect(codes).toContain('TA 11700');
    });
  });

  describe('4. Tier 2: Open / Breadth GE Placeholders & Mandatory Core Subtraction', () => {
    it('pools GE courses and subtracts mandatory core courses and math requirements of activeProgram', () => {
      const prog = masterDb.programs.find((p) => p.id === 'it_app_dev_bs_2026');
      const majorCoreCourses = prog.requirements.major_core_courses || [];
      const mathCourses = prog.requirements.math_courses || [];
      const emphasisCourses = prog.requirements.emphasis_courses || [];
      const toCode = (c) => (typeof c === 'string' ? c : c?.code || '').toUpperCase();
      const allRequired = new Set([
        ...majorCoreCourses.map(toCode),
        ...mathCourses.map(toCode),
        ...emphasisCourses.map(toCode)
      ]);

      const openGePlaceholder = {
        code: 'REQ_GE_ELEC1',
        title: 'General Education: Elective I',
        ge_bucket_id: 'ge_elective_1'
      };

      const recs = getCourseRecommendations(
        openGePlaceholder,
        prog,
        masterDb.courses,
        baseHistoricalFulfillments
      );

      expect(recs).not.toBeNull();
      expect(recs.tier).toBe(2);
      expect(recs.tierLabel).toBe('Open General Education Breadth');

      // Assert none of the program's mandatory major core courses are in recommendations
      recs.forEach((rec) => {
        expect(allRequired.has(rec.code.toUpperCase())).toBe(false);
      });
    });
  });

  describe('5. Tier 3: Free Electives & Upper-Division Constraints', () => {
    it('strictly excludes courses below 30000 level for upper-division free electives', () => {
      const upperPlaceholder = {
        code: 'REQ_ELEC_UPPER',
        canonicalCode: 'REQ_ELEC_UPPER',
        title: 'Upper-Level Elective (30000+)'
      };

      const recs = getCourseRecommendations(
        upperPlaceholder,
        'it_app_dev_bs_2026',
        masterDb.courses,
        baseHistoricalFulfillments
      );

      expect(recs).not.toBeNull();
      expect(recs.tier).toBe(3);
      expect(recs.isUpperDivision).toBe(true);
      expect(recs.length).toBeGreaterThan(0);

      // Assert: Upper-division free electives exclude courses below 30000 level
      recs.forEach((rec) => {
        expect(rec.number).toBeGreaterThanOrEqual(30000);
      });
    });

    it('detects upper-division level restrictions via title regex patterns', () => {
      const titleUpperPlaceholder = {
        code: 'ELEC 30001',
        title: 'Free Elective (Upper-Division 30000+)',
        isPlaceholder: true
      };

      const recs = getCourseRecommendations(
        titleUpperPlaceholder,
        'it_app_dev_bs_2026',
        masterDb.courses,
        baseHistoricalFulfillments
      );

      expect(recs).not.toBeNull();
      expect(recs.isUpperDivision).toBe(true);
      recs.forEach((rec) => {
        expect(rec.number).toBeGreaterThanOrEqual(30000);
      });
    });

    it('allows lower-division courses for general free electives (REQ_ELEC_GEN)', () => {
      const genPlaceholder = {
        code: 'REQ_ELEC_GEN',
        title: 'General Elective'
      };

      const recs = getCourseRecommendations(genPlaceholder, 'it_app_dev_bs_2026');
      expect(recs).not.toBeNull();
      expect(recs.tier).toBe(3);
      expect(recs.isUpperDivision).toBe(false);

      const hasLower = recs.some((c) => c.number < 30000);
      expect(hasLower).toBe(true);
    });
  });

  describe('6. Formatting Helpers & Hybrid Data Merging', () => {
    it('formats GPA and letter grade badges accurately', () => {
      expect(formatGpaWithLetter(4.0)).toBe('4.00 GPA / A');
      expect(formatGpaWithLetter(3.65)).toBe('3.65 GPA / A-');
      expect(formatGpaWithLetter(3.42)).toBe('3.42 GPA / B+');
      expect(formatGpaWithLetter(3.0)).toBe('3.00 GPA / B');
      expect(formatGpaWithLetter(2.6)).toBe('2.60 GPA / B-');
      expect(formatGpaWithLetter(2.2)).toBe('2.20 GPA / C+');
      expect(formatGpaWithLetter(2.0)).toBe('2.00 GPA / C');
      expect(formatGpaWithLetter(null)).toBe('N/A');
      expect(formatGpaWithLetter(0)).toBe('N/A');
    });

    it('formats peer popularity badges accurately', () => {
      expect(formatPeerPopularity(0)).toBe('0 peers recorded');
      expect(formatPeerPopularity(1)).toBe('1 student completed');
      expect(formatPeerPopularity(15)).toBe('15 students completed');
    });

    it('formats typical offerings accurately', () => {
      expect(formatTypicalOffering(['Fall-16wk', 'Spring-16wk'])).toBe('Fall, Spring');
      expect(formatTypicalOffering(['FA-I', 'SP-I'])).toBe('Fall, Spring');
      expect(formatTypicalOffering(['SU-I'])).toBe('Summer');
      expect(formatTypicalOffering(['All Sessions'])).toBe('All Sessions');
      expect(formatTypicalOffering([])).toBe('Fall, Spring');
    });

    it('dynamically incorporates active session completions in buildHistoricalLookup', () => {
      const activeStudentCourses = [
        {
          code: 'MTH 15200',
          title: 'Precalculus: Elementary Functions (GE-Math)',
          state: 'Completed',
          grade: 'A',
          isTransfer: false
        }
      ];

      const lookup = buildHistoricalLookup(baseHistoricalFulfillments, activeStudentCourses);
      const mth15200 = lookup.get('MTH 15200');
      expect(mth15200).toBeDefined();
      expect(mth15200.completionCount).toBeGreaterThan(0);
    });
  });
});
