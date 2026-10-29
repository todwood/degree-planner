import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Skill 1 Harvester: Full 2025–2026 Undergraduate Catalog Verification', () => {
  const masterProgramsPath = path.resolve(process.cwd(), 'src', 'data', 'masterProgramsDatabase.json');
  const geMatrixPath = path.resolve(process.cwd(), 'src', 'data', 'ge_2025_2026.json');
  const stagingPath = path.resolve(process.cwd(), '.tmp', 'programs_staging_2025_2026.json');
  const masterDbPath = path.resolve(process.cwd(), 'src', 'data', 'masterDatabase.json');

  it('1. Artifact Existence & Non-Empty Staging Validation (2025–2026)', () => {
    expect(fs.existsSync(stagingPath), 'Staging file must exist in .tmp/').toBe(true);
    expect(fs.existsSync(masterProgramsPath), 'masterProgramsDatabase.json must exist in src/data/').toBe(true);
    expect(fs.existsSync(geMatrixPath), 'ge_2025_2026.json must exist in src/data/').toBe(true);

    const stagingStat = fs.statSync(stagingPath);
    expect(stagingStat.size).toBeGreaterThan(10000); // Greater than 10KB
  });

  it('2. 2025–2026 Harvested Program Corpus Size (At least 80+ programs, expected ~200+)', () => {
    const raw = fs.readFileSync(masterProgramsPath, 'utf-8');
    const db = JSON.parse(raw);

    expect(db.programs).toBeDefined();

    const programList2025 = Object.values(db.programs).filter(p => p.catalogYear === '2025-2026');
    expect(programList2025.length).toBeGreaterThanOrEqual(80);

    const majors = programList2025.filter(p => p.credentialType === 'MAJOR');
    const minors = programList2025.filter(p => p.credentialType === 'MINOR');
    const certs = programList2025.filter(p => p.credentialType === 'CERTIFICATE');

    expect(majors.length).toBeGreaterThanOrEqual(50);
    expect(minors.length).toBeGreaterThanOrEqual(20);
    expect(certs.length).toBeGreaterThanOrEqual(5);
  });

  it('3. Program Schema Conformance & Slugs Ending in _2025', () => {
    const db = JSON.parse(fs.readFileSync(masterProgramsPath, 'utf-8'));
    const programList2025 = Object.values(db.programs).filter(p => p.catalogYear === '2025-2026');

    const idSet = new Set();

    programList2025.forEach((prog) => {
      // Required core fields
      expect(prog.id, `Program must have id: ${prog.name}`).toBeDefined();
      expect(typeof prog.id).toBe('string');
      expect(prog.id.endsWith('_2025'), `ID must end with _2025: ${prog.id}`).toBe(true);
      expect(prog.name, `Program must have name: ${prog.id}`).toBeDefined();
      expect(['MAJOR', 'MINOR', 'CERTIFICATE']).toContain(prog.credentialType);
      expect(prog.catalogYear).toBe('2025-2026');
      expect(typeof prog.totalRequiredCredits).toBe('number');
      expect(Number.isInteger(prog.totalRequiredCredits)).toBe(true);

      // Requirements block
      expect(prog.requirements).toBeDefined();
      expect(Array.isArray(prog.requirements.major_core_courses)).toBe(true);
      expect(Array.isArray(prog.requirements.elective_courses)).toBe(true);
      expect(Array.isArray(prog.requirements.choice_groups)).toBe(true);
      expect(Array.isArray(prog.requirements.paired_sequences)).toBe(true);
      expect(Array.isArray(prog.requirements.elective_pools)).toBe(true);

      // Assert uniqueness of program id
      expect(idSet.has(prog.id), `Duplicate ID detected: ${prog.id}`).toBe(false);
      idSet.add(prog.id);
    });
  });

  it('4. CORE 42 General Education Matrix Resolution (2025–2026)', () => {
    const ge = JSON.parse(fs.readFileSync(geMatrixPath, 'utf-8'));

    expect(ge.catalog_year).toBe('2025-2026');
    expect(ge.total_credits_required).toBe(42);

    // AA Transfer Block Override
    expect(ge.aa_transfer_block_override).toBeDefined();
    expect(ge.aa_transfer_block_override.status).toBe('OFFICIALLY_RECOGNIZED');
    expect(ge.aa_transfer_block_override.credits_satisfied).toBe(42);
    expect(ge.aa_transfer_block_override.bypasses_category_audits).toBe(true);
    expect(ge.aa_transfer_block_override.preserves_major_prerequisites).toBe(true);

    // Required 8 CORE 42 Distribution Categories
    const cats = ge.distribution_categories;
    expect(cats.written_communication).toBeDefined();
    expect(cats.written_communication.credits_required).toBe(6);
    expect(cats.written_communication.minimum_grade).toBe('C');

    expect(cats.oral_communication).toBeDefined();
    expect(cats.oral_communication.credits_required).toBe(3);

    expect(cats.mathematics).toBeDefined();
    expect(cats.mathematics.credits_required).toBe(3);

    expect(cats.civics).toBeDefined();
    expect(cats.civics.credits_required).toBe(3);

    expect(cats.social_behavioral_sciences).toBeDefined();
    expect(cats.social_behavioral_sciences.credits_required).toBe(9);

    expect(cats.humanities_fine_arts).toBeDefined();
    expect(cats.humanities_fine_arts.credits_required).toBe(9);

    expect(cats.natural_sciences).toBeDefined();
    expect(cats.natural_sciences.credits_required).toBe(7);
    expect(cats.natural_sciences.approved_lab_courses.length).toBeGreaterThan(0);

    expect(cats.additional_ge_electives).toBeDefined();
    expect(cats.additional_ge_electives.credits_required).toBe(2);
  });

  it('5. Dual Catalog Coexistence (2026–2027 and 2025–2026)', () => {
    const raw = fs.readFileSync(masterProgramsPath, 'utf-8');
    const db = JSON.parse(raw);

    const programList = Object.values(db.programs);
    const count2026 = programList.filter(p => p.catalogYear === '2026-2027').length;
    const count2025 = programList.filter(p => p.catalogYear === '2025-2026').length;

    expect(count2026).toBeGreaterThanOrEqual(80);
    expect(count2025).toBeGreaterThanOrEqual(80);
    expect(programList.length).toBeGreaterThanOrEqual(count2026 + count2025);

    // Both catalog years are registered
    expect(db.catalog_years).toContain('2026-2027');
    expect(db.catalog_years).toContain('2025-2026');

    // Confirm masterDatabase fixtures remain untouched
    const masterDb = JSON.parse(fs.readFileSync(masterDbPath, 'utf-8'));
    expect(masterDb.programs.length).toBeGreaterThanOrEqual(33);
    const cyber = masterDb.programs.find(p => p.acalog_poid === 2148);
    expect(cyber).toBeDefined();
  });
});
