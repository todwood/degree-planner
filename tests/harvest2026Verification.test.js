import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Skill 1 Recalibrated: 2026–2027 Complete Catalog Harvest & Schema Verification', () => {
  const masterProgramsPath = path.resolve(process.cwd(), 'src', 'data', 'masterProgramsDatabase.json');
  const db = JSON.parse(fs.readFileSync(masterProgramsPath, 'utf-8'));
  const allPrograms = Object.values(db.programs || {});
  const progs2026 = allPrograms.filter(p => p.catalogYear === '2026-2027');

  it('1. Total 2026–2027 Count (~264 programs harvested)', () => {
    expect(progs2026.length).toBeGreaterThanOrEqual(260);
    expect(progs2026.length).toBeLessThanOrEqual(268);
    expect(progs2026.length).toBe(264);
  });

  it('2. Accounting, BS (accounting_bs_2026) reflects full curriculum (~82 cr) and inlined PCB&E categories', () => {
    const acct = db.programs['accounting_bs_2026'];
    expect(acct).toBeDefined();
    expect(acct.totalRequiredCredits).toBeGreaterThanOrEqual(80);
    expect(acct.totalRequiredCredits).toBeLessThanOrEqual(85);
    expect(acct.totalRequiredCredits).toBe(82);

    const categories = acct.requirement_categories || [];
    const pcbeCore = categories.find(c => c.title === 'PCB&E Core Coursework');
    expect(pcbeCore).toBeDefined();
    expect(pcbeCore.credits_required).toBe(36);

    const acctMajor = categories.find(c => c.title === 'Accounting Major Coursework' || c.title === 'Major Coursework');
    expect(acctMajor).toBeDefined();
    expect(acctMajor.credits_required).toBe(21);

    const geString = JSON.stringify(acct.prescribed_ge_requirements || []) + JSON.stringify(acct.prescribed_ge_satisfactions || {});
    expect(geString).toContain('ECON 23020');
    expect(geString).toContain('ECON 23030');
    expect(geString).toMatch(/MTH/);
  });

  it('3. Cybersecurity, BS (cybersecurity_bs_2026) isolates prescribed GE math and retains 60cr major core', () => {
    const cyber = db.programs['cybersecurity_bs_2026'];
    expect(cyber).toBeDefined();
    expect(cyber.totalRequiredCredits).toBe(66);

    const cyberGeString = JSON.stringify(cyber.prescribed_ge_requirements || []) + JSON.stringify(cyber.prescribed_ge_satisfactions || {});
    expect(cyberGeString).toContain('MTH 14100');

    const majorCat = (cyber.requirement_categories || []).find(c => c.title === 'Major Coursework');
    expect(majorCat).toBeDefined();
    expect(majorCat.credits_required).toBe(60);
  });

  it('4. Theatre, BFA Acting Emphasis (theatre_bfa_acting_emphasis_2026) contains Production Coursework repeat distribution and zero false tracks', () => {
    const theatre = db.programs['theatre_bfa_acting_emphasis_2026'];
    expect(theatre).toBeDefined();

    const prodCat = (theatre.requirement_categories || []).find(c => c.title === 'Production Coursework');
    expect(prodCat).toBeDefined();
    expect(prodCat.category_type).toBe('REPEAT_DISTRIBUTION');
    expect(prodCat.per_course_credit_requirement).toBe(6);
    expect(theatre.flexible_elective_configurations).toBeNull();
  });

  it('5. Data Science, BS (data_science_bs_2026) retains valid Option A & Option B tracks', () => {
    const ds = db.programs['data_science_bs_2026'];
    expect(ds).toBeDefined();
    expect(ds.flexible_elective_configurations).not.toBeNull();
    const tracks = ds.flexible_elective_configurations.tracks;
    expect(tracks).toHaveLength(2);
    expect(tracks[0].name).toContain('Option A');
    expect(tracks[1].name).toContain('Option B');
  });

  it('6. Non-2026 Years Untouched (2025-2026, 2024-2025, 2023-2024 programs preserved)', () => {
    const progs2025 = allPrograms.filter(p => p.catalogYear === '2025-2026');
    const progs2024 = allPrograms.filter(p => p.catalogYear === '2024-2025');
    const progs2023 = allPrograms.filter(p => p.catalogYear === '2023-2024');

    expect(progs2025).toHaveLength(251);
    expect(progs2024).toHaveLength(249);
    expect(progs2023).toHaveLength(244);
  });
});
