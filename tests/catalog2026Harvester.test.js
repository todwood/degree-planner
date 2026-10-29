import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Skill 1 Harvester: Full 2026–2027 Undergraduate Catalog Verification', () => {
  const masterProgramsPath = path.resolve(process.cwd(), 'src', 'data', 'masterProgramsDatabase.json');
  const geMatrixPath = path.resolve(process.cwd(), 'src', 'data', 'ge_2026_2027.json');
  const stagingPath = path.resolve(process.cwd(), '.tmp', 'programs_staging_2026_2027.json');
  const masterDbPath = path.resolve(process.cwd(), 'src', 'data', 'masterDatabase.json');

  it('1. Artifact Existence & Non-Empty Staging Validation', () => {
    expect(fs.existsSync(stagingPath), 'Staging file must exist in .tmp/').toBe(true);
    expect(fs.existsSync(masterProgramsPath), 'masterProgramsDatabase.json must exist in src/data/').toBe(true);
    expect(fs.existsSync(geMatrixPath), 'ge_2026_2027.json must exist in src/data/').toBe(true);

    const stagingStat = fs.statSync(stagingPath);
    expect(stagingStat.size).toBeGreaterThan(10000); // Greater than 10KB
  });

  it('2. Harvested Program Corpus Size (At least 80+ programs, expected ~200+)', () => {
    const raw = fs.readFileSync(masterProgramsPath, 'utf-8');
    const db = JSON.parse(raw);

    expect(db.catalog_year).toBe('2026-2027');
    expect(db.programs).toBeDefined();

    const programList = Object.values(db.programs);
    expect(programList.length).toBeGreaterThanOrEqual(80);

    const majors = programList.filter(p => p.credentialType === 'MAJOR');
    const minors = programList.filter(p => p.credentialType === 'MINOR');
    const certs = programList.filter(p => p.credentialType === 'CERTIFICATE');

    expect(majors.length).toBeGreaterThanOrEqual(50);
    expect(minors.length).toBeGreaterThanOrEqual(20);
    expect(certs.length).toBeGreaterThanOrEqual(5);
  });

  it('3. Program Schema Conformance & Primitives Integrity', () => {
    const db = JSON.parse(fs.readFileSync(masterProgramsPath, 'utf-8'));
    const programList = Object.values(db.programs);

    const idSet = new Set();

    programList.forEach((prog) => {
      // Required core fields
      expect(prog.id, `Program must have id: ${prog.name}`).toBeDefined();
      expect(typeof prog.id).toBe('string');
      expect(prog.name, `Program must have name: ${prog.id}`).toBeDefined();
      expect(['MAJOR', 'MINOR', 'CERTIFICATE']).toContain(prog.credentialType);
      expect(prog.catalogYear).toBe('2026-2027');
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

  it('4. CORE 42 General Education Matrix Resolution (2026–2027)', () => {
    const ge = JSON.parse(fs.readFileSync(geMatrixPath, 'utf-8'));

    expect(ge.catalog_year).toBe('2026-2027');
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

  it('5. Safe Master Database Merging & Fixture Preservation', () => {
    const masterDb = JSON.parse(fs.readFileSync(masterDbPath, 'utf-8'));

    // Master database must retain original hand-calibrated fixtures
    const cyber = masterDb.programs.find(p => p.acalog_poid === 2148);
    expect(cyber, 'Cybersecurity BS fixture must be preserved').toBeDefined();
    expect(cyber.name).toBe('Cybersecurity, BS');
    expect(cyber.total_program_credits).toBe(66);

    const itApp = masterDb.programs.find(p => p.acalog_poid === 2151);
    expect(itApp, 'IT App Dev fixture must be preserved').toBeDefined();

    // Verify masterDatabase maintains all original hand-verified fixtures
    expect(masterDb.programs.length).toBeGreaterThanOrEqual(33);
  });
});
