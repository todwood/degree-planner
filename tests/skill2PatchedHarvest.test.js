import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Skill 2 Course Harvester & Schema Patch Verification Suite', () => {
  const masterDbPath = path.resolve(process.cwd(), 'src/data/masterDatabase.json');
  const masterDb = JSON.parse(fs.readFileSync(masterDbPath, 'utf8'));

  it('1. Verifies PSY 30600 modality, title, and strict concurrent corequisite pairing', () => {
    const psy306 = masterDb.courses.find(c => c.code === 'PSY 30600');
    expect(psy306, 'PSY 30600 must exist in masterDatabase').toBeDefined();
    expect(psy306.modalities).toEqual(['On-Ground']);
    expect(psy306.title).toBe('Behavioral Science Statistics');
    expect(Array.isArray(psy306.strict_concurrent_coreqs)).toBe(true);
    expect(psy306.strict_concurrent_coreqs).toContain('PSY 30400');
  });

  it('2. Verifies PSY 30400 strict concurrent corequisite pairing with PSY 30600', () => {
    const psy304 = masterDb.courses.find(c => c.code === 'PSY 30400');
    expect(psy304, 'PSY 30400 must exist in masterDatabase').toBeDefined();
    expect(Array.isArray(psy304.strict_concurrent_coreqs)).toBe(true);
    expect(psy304.strict_concurrent_coreqs).toContain('PSY 30600');
  });

  it('3. Verifies MTH 27200 title contains (GE-Math) alignment', () => {
    const mth272 = masterDb.courses.find(c => c.code === 'MTH 27200');
    expect(mth272, 'MTH 27200 must exist in masterDatabase').toBeDefined();
    expect(mth272.title).toContain('(GE-Math)');
  });

  it('4. Verifies MTH 33000 prereq_or_coreqs includes MTH 28500 and strict_concurrent_coreqs is empty', () => {
    const mth330 = masterDb.courses.find(c => c.code === 'MTH 33000');
    expect(mth330, 'MTH 33000 must exist in masterDatabase').toBeDefined();
    expect(Array.isArray(mth330.prereq_or_coreqs)).toBe(true);
    expect(mth330.prereq_or_coreqs).toContain('MTH 28500');
    expect(mth330.strict_concurrent_coreqs || []).toEqual([]);
  });

  it('5. Verifies zero active sections handling (e.g. MTH 49000-49999 rotational shell)', () => {
    const mth490 = masterDb.courses.find(c => c.code === 'MTH 49000-49999');
    expect(mth490, 'MTH 49000-49999 must exist in masterDatabase').toBeDefined();
    expect(mth490.schedule_telemetry?.total_sections_observed).toBe(0);
    expect(mth490.modalities).toEqual(['On-Ground']);
  });

  it('6. Strict Invariant: Preserves all 33 hand-curated degree test fixtures in masterDatabase.json', () => {
    expect(masterDb.programs).toBeDefined();
    expect(Array.isArray(masterDb.programs)).toBe(true);
    expect(masterDb.programs.length).toBe(33);
  });
});
