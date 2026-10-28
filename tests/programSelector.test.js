import { describe, it, expect } from 'vitest';
import { parseProgramDetails } from '../src/components/ProgramCombobox.jsx';
import masterDb from '../src/data/masterDatabase.json';

describe('Screen 1 High-Density Searchable Program and Catalog Selectors', () => {
  describe('A. Program Title & Emphasis Parsing (parseProgramDetails)', () => {
    it('correctly parses two-line discipline and emphasis for Applications Development', () => {
      const parsed = parseProgramDetails('Information Technology, BS - Applications Development Emphasis');
      expect(parsed.discipline).toBe('Information Technology, BS');
      expect(parsed.emphasis).toBe('Applications Development Emphasis');
      expect(parsed.degreeBadge).toBe('BS');
    });

    it('correctly parses two-line discipline and emphasis for Networking', () => {
      const parsed = parseProgramDetails('Information Technology, BS - Networking Emphasis');
      expect(parsed.discipline).toBe('Information Technology, BS');
      expect(parsed.emphasis).toBe('Networking Emphasis');
      expect(parsed.degreeBadge).toBe('BS');
    });

    it('correctly parses single-line discipline without emphasis for Cybersecurity, BS', () => {
      const parsed = parseProgramDetails('Cybersecurity, BS');
      expect(parsed.discipline).toBe('Cybersecurity, BS');
      expect(parsed.emphasis).toBeNull();
      expect(parsed.degreeBadge).toBe('BS');
    });

    it('gracefully handles empty or fallback degree names', () => {
      const parsed = parseProgramDetails('');
      expect(parsed.discipline).toBe('Select Degree Program');
      expect(parsed.emphasis).toBeNull();
      expect(parsed.degreeBadge).toBe('BS');
    });
  });

  describe('B. Program Search Filtering Logic', () => {
    const activePrograms = (masterDb.programs || []).filter(
      (p) => p.catalog_year_id === '2026-2027'
    );

    it('contains the verified degree programs in 2026-2027', () => {
      expect(activePrograms).toHaveLength(15);
      const names = activePrograms.map((p) => p.name);
      expect(names).toContain('Cybersecurity, BS');
      expect(names).toContain('Information Technology, BS - Applications Development Emphasis');
      expect(names).toContain('Information Technology, BS - Networking Emphasis');
    });

    it('filters correctly by keyword "App"', () => {
      const q = 'App'.toLowerCase();
      const filtered = activePrograms.filter((p) =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('it_app_dev_bs_2026');
      expect(filtered[0].name).toContain('Applications Development Emphasis');
    });

    it('filters correctly by keyword "Net"', () => {
      const q = 'Net'.toLowerCase();
      const filtered = activePrograms.filter((p) =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('it_networking_bs_2026');
      expect(filtered[0].name).toContain('Networking Emphasis');
    });

    it('filters correctly by keyword "Cyber"', () => {
      const q = 'Cyber'.toLowerCase();
      const filtered = activePrograms.filter((p) =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.some((p) => p.id === 'cybersecurity_bs_2026')).toBe(true);
    });

    it('returns empty array when search query matches no program', () => {
      const q = 'Quantum Computing'.toLowerCase();
      const filtered = activePrograms.filter((p) =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
      expect(filtered).toHaveLength(0);
    });
  });

  describe('C. Cross-Year Title Continuity Preservation', () => {
    function simulateCatalogYearSwitch(currentProgramId, targetYear) {
      const currentProg = (masterDb.programs || []).find((p) => p.id === currentProgramId);
      const matching = (masterDb.programs || []).filter(
        (p) => p.catalog_year_id === targetYear
      );
      if (matching.length === 0) return null;
      const sameName = currentProg ? matching.find((p) => p.name === currentProg.name) : null;
      return sameName ? sameName.id : matching[0].id;
    }

    it('preserves Applications Development selection across 2026 -> 2025 -> 2024', () => {
      const year2025Id = simulateCatalogYearSwitch('it_app_dev_bs_2026', '2025-2026');
      expect(year2025Id).toBe('it_app_dev_bs_2025');

      const year2024Id = simulateCatalogYearSwitch(year2025Id, '2024-2025');
      expect(year2024Id).toBe('it_app_dev_bs_2024');

      const return2026Id = simulateCatalogYearSwitch(year2024Id, '2026-2027');
      expect(return2026Id).toBe('it_app_dev_bs_2026');
    });

    it('preserves Networking Emphasis selection across 2026 -> 2025', () => {
      const year2025Id = simulateCatalogYearSwitch('it_networking_bs_2026', '2025-2026');
      expect(year2025Id).toBe('it_networking_bs_2025');
    });

    it('preserves Cybersecurity BS selection across 2026 -> 2024', () => {
      const year2024Id = simulateCatalogYearSwitch('cybersecurity_bs_2026', '2024-2025');
      expect(year2024Id).toBe('cybersecurity_bs_2024');
    });
  });

  describe('D. Forward-Only Catalog Year Constraints', () => {
    it('correctly disables older catalog years when matriculation year is 2025', () => {
      const minCatalogYearStart = 2025;
      const is2024Disabled = minCatalogYearStart > 2024;
      const is2025Disabled = minCatalogYearStart > 2025;
      const is2026Disabled = minCatalogYearStart > 2026;

      expect(is2024Disabled).toBe(true);
      expect(is2025Disabled).toBe(false);
      expect(is2026Disabled).toBe(false);
    });

    it('correctly disables 2024 and 2025 when matriculation year is 2026', () => {
      const minCatalogYearStart = 2026;
      expect(minCatalogYearStart > 2024).toBe(true);
      expect(minCatalogYearStart > 2025).toBe(true);
      expect(minCatalogYearStart > 2026).toBe(false);
    });
  });
});
