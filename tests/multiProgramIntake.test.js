import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import {
  getProgramCategory,
  formatDeclaredStackHeader,
  calculateStackOverlap,
  remapStackForCatalogYear
} from '../src/utils/programStackUtils.js';
import { mockMultiProgramStudents } from '../src/data/mockMultiProgramStudents.js';

describe('Multi-Major, Multi-Minor & 20-Student Intake Test Suite', () => {
  // Helper simulating the Screen 1 state manager
  function createIntakeStackManager(initialPrograms = []) {
    let stack = [...initialPrograms];
    let primaryId = stack.find((id) => {
      const p = masterDb.programs.find((x) => x.id === id);
      return p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track');
    }) || stack[0] || null;

    return {
      getStack: () => stack,
      getPrimaryId: () => primaryId,
      getEffectivePrimaryMajorId: () => {
        const majors = stack
          .map((id) => masterDb.programs.find((p) => p.id === id))
          .filter((p) => p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track'));
        if (majors.length === 0) return null;
        const match = majors.find((m) => m.id === primaryId);
        return match ? match.id : majors[0].id;
      },
      addProgram: (id) => {
        if (!id) return { success: false, reason: 'Empty ID' };
        if (stack.includes(id)) {
          return { success: false, reason: 'Duplicate program ID already in stack' };
        }
        stack.push(id);
        const p = masterDb.programs.find((x) => x.id === id);
        const isMajor = p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track');
        if (isMajor && !primaryId) {
          primaryId = id;
        }
        return { success: true };
      },
      removeProgram: (id) => {
        stack = stack.filter((x) => x !== id);
        if (id === primaryId) {
          const nextMajor = stack.find((xId) => {
            const p = masterDb.programs.find((x) => x.id === xId);
            return p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track');
          });
          primaryId = nextMajor || stack[0] || null;
        }
      },
      makePrimary: (id) => {
        const p = masterDb.programs.find((x) => x.id === id);
        if (p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track')) {
          primaryId = id;
          return true;
        }
        return false;
      },
      getDecoratedPrograms: () => {
        const effectivePrimary = primaryId;
        return stack.map((id) => {
          const prog = masterDb.programs.find((p) => p.id === id);
          const cat = getProgramCategory(prog);
          const isMajor = cat === 'Major' || cat === 'Major - Track';
          const isPrimary = isMajor && id === effectivePrimary;
          return {
            ...prog,
            category: cat,
            isMajor,
            isPrimary,
            isSecondaryMajor: isMajor && !isPrimary
          };
        });
      }
    };
  }

  describe('1. Double Major Primary vs. Secondary Flag Assignment', () => {
    it('correctly marks first major as primary and second major as secondary', () => {
      const manager = createIntakeStackManager();
      const add1 = manager.addProgram('computer_science_bs_2026');
      expect(add1.success).toBe(true);

      const add2 = manager.addProgram('data_science_bs_2026');
      expect(add2.success).toBe(true);

      const decorated = manager.getDecoratedPrograms();
      expect(decorated).toHaveLength(2);

      const cs = decorated.find((p) => p.id === 'computer_science_bs_2026');
      const dsci = decorated.find((p) => p.id === 'data_science_bs_2026');

      expect(cs.isPrimary).toBe(true);
      expect(cs.isSecondaryMajor).toBe(false);

      expect(dsci.isPrimary).toBe(false);
      expect(dsci.isSecondaryMajor).toBe(true);
    });
  });

  describe('2. Primary Major Swapping & Promotion Invariants', () => {
    it('swaps primary major cleanly with makePrimary', () => {
      const manager = createIntakeStackManager(['computer_science_bs_2026', 'data_science_bs_2026']);
      expect(manager.getEffectivePrimaryMajorId()).toBe('computer_science_bs_2026');

      const swapped = manager.makePrimary('data_science_bs_2026');
      expect(swapped).toBe(true);
      expect(manager.getEffectivePrimaryMajorId()).toBe('data_science_bs_2026');

      const decorated = manager.getDecoratedPrograms();
      const cs = decorated.find((p) => p.id === 'computer_science_bs_2026');
      const dsci = decorated.find((p) => p.id === 'data_science_bs_2026');

      expect(dsci.isPrimary).toBe(true);
      expect(dsci.isSecondaryMajor).toBe(false);

      expect(cs.isPrimary).toBe(false);
      expect(cs.isSecondaryMajor).toBe(true);
    });

    it('promotes secondary major to primary when primary major is removed', () => {
      const manager = createIntakeStackManager(['computer_science_bs_2026', 'data_science_bs_2026']);
      expect(manager.getEffectivePrimaryMajorId()).toBe('computer_science_bs_2026');

      manager.removeProgram('computer_science_bs_2026');
      expect(manager.getEffectivePrimaryMajorId()).toBe('data_science_bs_2026');

      const decorated = manager.getDecoratedPrograms();
      expect(decorated).toHaveLength(1);
      expect(decorated[0].id).toBe('data_science_bs_2026');
      expect(decorated[0].isPrimary).toBe(true);
    });
  });

  describe('3. Multi-Minor & Multi-Credential Additions', () => {
    it('adds 3 distinct credentials and updates stack count to 4 total credentials', () => {
      const manager = createIntakeStackManager(['computer_science_bs_2026']);
      expect(manager.getStack()).toHaveLength(1);

      manager.addProgram('mathematics_minor_2026');
      manager.addProgram('cybersecurity_minor_2026');
      manager.addProgram('data_analysis_certificate_2026');

      expect(manager.getStack()).toHaveLength(4);
      expect(manager.getStack()).toEqual([
        'computer_science_bs_2026',
        'mathematics_minor_2026',
        'cybersecurity_minor_2026',
        'data_analysis_certificate_2026'
      ]);

      const progs = manager.getStack().map((id) => masterDb.programs.find((p) => p.id === id));
      const header = formatDeclaredStackHeader(progs);
      expect(header).toBe('Seeking to Confer Credential Stack (1 Major, 2 Minors, 1 Certificate)');
    });
  });

  describe('4. Duplicate Guardrail Rejection', () => {
    it('rejects adding duplicate program ID with informative error', () => {
      const manager = createIntakeStackManager(['computer_science_bs_2026', 'mathematics_minor_2026']);

      const duplicateAdd = manager.addProgram('mathematics_minor_2026');
      expect(duplicateAdd.success).toBe(false);
      expect(duplicateAdd.reason).toContain('Duplicate program ID');
      expect(manager.getStack()).toHaveLength(2);
    });
  });

  describe('5. N-Way Course Deduplication across Multi-Credential Stack', () => {
    it('correctly calculates overlap across a 3-credential stack (CS BS + Data Science BS + Math Minor)', () => {
      const cs = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');
      const dsci = masterDb.programs.find((p) => p.id === 'data_science_bs_2026');
      const math = masterDb.programs.find((p) => p.id === 'mathematics_minor_2026');

      expect(cs).toBeDefined();
      expect(dsci).toBeDefined();
      expect(math).toBeDefined();

      const overlap = calculateStackOverlap([cs, dsci, math], masterDb);
      expect(overlap.totalDeclaredCredits).toBe(73 + 75 + 24); // 172 cr gross

      // Calculus I (MTH 27100, 5cr) and Calculus II (MTH 27200, 5cr) appear in all 3
      // In 3 credentials, occurrences = 3, saved = (3 - 1) * 5 = 10cr each -> 20cr saved
      expect(overlap.sharedOverlapCredits).toBeGreaterThanOrEqual(20);
      expect(overlap.netProgramLoad).toBe(overlap.totalDeclaredCredits - overlap.sharedOverlapCredits);
      expect(overlap.overlappingCourses.some((c) => c.code === 'MTH 27100' && c.occurrences === 3)).toBe(true);
      expect(overlap.overlappingCourses.some((c) => c.code === 'MTH 27200' && c.occurrences === 3)).toBe(true);
    });
  });

  describe('6. Schema Validation for All 20 Synthetic Student Records', () => {
    it('validates that all 20 synthetic student records parse and calculate without errors', () => {
      expect(mockMultiProgramStudents).toHaveLength(20);

      mockMultiProgramStudents.forEach((student, index) => {
        expect(student.id).toBe(`student_${String(index + 1).padStart(2, '0')}`);
        expect(student.name).toBeTruthy();
        expect(student.catalogYear).toBe('2026-2027');
        expect(Array.isArray(student.declaredProgramIds)).toBe(true);
        expect(student.declaredProgramIds.length).toBeGreaterThanOrEqual(2);

        // All declared program IDs must exist in master database
        const progs = student.declaredProgramIds.map((id) => {
          const match = masterDb.programs.find((p) => p.id === id);
          expect(match).toBeDefined();
          return match;
        });

        // Dynamic stack header matches expected header
        const calculatedHeader = formatDeclaredStackHeader(progs);
        expect(calculatedHeader).toBe(student.expectedHeader);

        // Stack overlap computes valid numbers
        const overlap = calculateStackOverlap(progs, masterDb);
        expect(overlap.totalDeclaredCredits).toBeGreaterThan(0);
        expect(overlap.sharedOverlapCredits).toBeGreaterThanOrEqual(0);
        expect(overlap.netProgramLoad).toBe(overlap.totalDeclaredCredits - overlap.sharedOverlapCredits);
        expect(overlap.netProgramLoad).toBeGreaterThan(0);
      });
    });
  });
});
