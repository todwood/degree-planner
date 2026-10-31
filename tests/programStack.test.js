import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import {
  getProgramCategory,
  formatDeclaredStackHeader,
  calculateStackOverlap,
  remapStackForCatalogYear
} from '../src/utils/programStackUtils.js';

describe('Multi-Program Declared Credentials Stack Suite', () => {
  describe('A. Program Categorization (getProgramCategory)', () => {
    it('categorizes Majors, Tracks, Minors, and Certificates correctly', () => {
      const cs = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');
      expect(getProgramCategory(cs)).toBe('Major');

      const nursing = masterDb.programs.find((p) => p.id === 'nursing_bs_2026');
      expect(getProgramCategory(nursing)).toBe('Major');

      const itNet = masterDb.programs.find((p) => p.id === 'it_networking_bs_2026');
      expect(getProgramCategory(itNet)).toBe('Major - Track');

      const comms = masterDb.programs.find((p) => p.id === 'communications_ba_journalism_2026');
      expect(getProgramCategory(comms)).toBe('Major - Track');

      const mathMinor = masterDb.programs.find((p) => p.id === 'mathematics_minor_2026');
      expect(getProgramCategory(mathMinor)).toBe('Minor');

      const dataCert = masterDb.programs.find((p) => p.id === 'data_analysis_certificate_2026');
      expect(getProgramCategory(dataCert)).toBe('Certificate');
    });
  });

  describe('B. Dynamic Header Pluralization (formatDeclaredStackHeader)', () => {
    const cs = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');
    const dsci = masterDb.programs.find((p) => p.id === 'data_science_bs_2026');
    const mathMinor = masterDb.programs.find((p) => p.id === 'mathematics_minor_2026');
    const dataCert = masterDb.programs.find((p) => p.id === 'data_analysis_certificate_2026');

    it('formats single major correctly: "Seeking to Confer Credential Stack (1 Major)"', () => {
      const header = formatDeclaredStackHeader([cs]);
      expect(header).toBe('Seeking to Confer Credential Stack (1 Major)');
    });

    it('formats 1 Major + 1 Minor correctly: "Seeking to Confer Credential Stack (1 Major, 1 Minor)"', () => {
      const header = formatDeclaredStackHeader([cs, mathMinor]);
      expect(header).toBe('Seeking to Confer Credential Stack (1 Major, 1 Minor)');
    });

    it('formats 2 Majors (Double Major) correctly: "Seeking to Confer Credential Stack (2 Majors — Double Major)"', () => {
      const header = formatDeclaredStackHeader([cs, dsci]);
      expect(header).toBe('Seeking to Confer Credential Stack (2 Majors — Double Major)');
    });

    it('formats 1 Major, 1 Minor, 1 Cert correctly: "Seeking to Confer Credential Stack (1 Major, 1 Minor, 1 Certificate)"', () => {
      const header = formatDeclaredStackHeader([cs, mathMinor, dataCert]);
      expect(header).toBe('Seeking to Confer Credential Stack (1 Major, 1 Minor, 1 Certificate)');
    });

    it('handles empty credentials stack gracefully', () => {
      const header = formatDeclaredStackHeader([]);
      expect(header).toBe('Seeking to Confer Credential Stack (0 Credentials)');
    });
  });

  describe('C. Shared Overlap Calculation (calculateStackOverlap)', () => {
    it('calculates Calculus I and II overlap between Computer Science BS and Math Minor', () => {
      const cs = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');
      const mathMinor = masterDb.programs.find((p) => p.id === 'mathematics_minor_2026');

      const overlap = calculateStackOverlap([cs, mathMinor], masterDb);
      expect(overlap.totalDeclaredCredits).toBe(97); // 73 + 24
      expect(overlap.sharedOverlapCredits).toBe(10); // MTH 27100 (5cr) + MTH 27200 (5cr)
      expect(overlap.netProgramLoad).toBe(87); // 97 - 10
      expect(overlap.overlappingCourses).toHaveLength(2);
      expect(overlap.overlappingCourses.map((c) => c.code)).toContain('MTH 27100');
      expect(overlap.overlappingCourses.map((c) => c.code)).toContain('MTH 27200');
    });

    it('returns zero overlap for standalone major without shared courses', () => {
      const cs = masterDb.programs.find((p) => p.id === 'computer_science_bs_2026');
      const overlap = calculateStackOverlap([cs], masterDb);
      expect(overlap.totalDeclaredCredits).toBe(73);
      expect(overlap.sharedOverlapCredits).toBe(0);
      expect(overlap.netProgramLoad).toBe(73);
      expect(overlap.overlappingCourses).toHaveLength(0);
    });
  });

  describe('D. Catalog Year Switching and Stack Continuity (remapStackForCatalogYear)', () => {
    it('remaps declared stack cleanly from 2026-2027 to 2025-2026 without losing selections', () => {
      const initial2026 = ['computer_science_bs_2026', 'mathematics_minor_2026', 'data_analysis_certificate_2026'];
      const remapped2025 = remapStackForCatalogYear(initial2026, '2025-2026', masterDb);

      expect(remapped2025).toEqual([
        'computer_science_bs_2025',
        'mathematics_minor_2025',
        'data_analysis_certificate_2025'
      ]);

      // Remap back to 2026-2027
      const return2026 = remapStackForCatalogYear(remapped2025, '2026-2027', masterDb);
      expect(return2026).toEqual(initial2026);
    });

    it('preserves existing program selections when target year lacks matching program', () => {
      const mixed = ['computer_science_bs_2026', 'non_existent_program_2026'];
      const remapped = remapStackForCatalogYear(mixed, '2025-2026', masterDb);
      expect(remapped).toContain('computer_science_bs_2025');
      expect(remapped).toContain('non_existent_program_2026');
    });
  });

  describe('E. Stack Mutation Invariants (Add / Remove)', () => {
    it('adds credential to stack without duplicates', () => {
      let stack = ['computer_science_bs_2026'];
      const addId = 'mathematics_minor_2026';

      if (!stack.includes(addId)) {
        stack = [...stack, addId];
      }
      expect(stack).toHaveLength(2);
      expect(stack).toContain('mathematics_minor_2026');

      // Attempt duplicate add
      if (!stack.includes(addId)) {
        stack = [...stack, addId];
      }
      expect(stack).toHaveLength(2);
    });

    it('removes secondary credential while retaining primary major', () => {
      let stack = ['computer_science_bs_2026', 'mathematics_minor_2026', 'data_analysis_certificate_2026'];
      const removeId = 'mathematics_minor_2026';

      stack = stack.filter((id) => id !== removeId);
      expect(stack).toHaveLength(2);
      expect(stack).not.toContain('mathematics_minor_2026');
      expect(stack).toContain('computer_science_bs_2026');
      expect(stack).toContain('data_analysis_certificate_2026');
    });
  });
});
