import { describe, it, expect, beforeEach } from 'vitest';
import masterDb from '../src/data/masterDatabase.json' with { type: 'json' };
import { dbAdapter } from '../src/data/dbAdapter.js';
import { runWaterfallAudit, BUCKET_TO_CANONICAL_TOKEN as AUDIT_CANONICAL_TOKENS } from '../src/engine/waterfallAudit.js';
import { processRawCourseRecords } from '../src/engine/transcriptParser.js';
import { generateOptimalSchedule, validateScheduleMove } from '../src/engine/scheduler.js';
import { isPlaceholderRequirement, getCourseRecommendations, BUCKET_TO_CANONICAL_TOKEN as REC_CANONICAL_TOKENS } from '../src/utils/courseRecommendations.js';

describe('Composition I (ENGL 15000) & EPP 15000 Equivalence Verification Suite', () => {
  beforeEach(async () => {
    await dbAdapter.initDatabase();
  });

  describe('1. Canonical Token & Database Adapter Invariants', () => {
    it('sets BUCKET_TO_CANONICAL_TOKEN.comp_1 to concrete ENGL 15000 in both audit and recommendation utilities', () => {
      expect(AUDIT_CANONICAL_TOKENS.comp_1).toBe('ENGL 15000');
      expect(REC_CANONICAL_TOKENS.comp_1).toBe('ENGL 15000');
    });

    it('resolves legacy aliases (GE 1, GE_COMP_1, and retired REQ_GE_COMP1) to concrete ENGL 15000', async () => {
      const fromComp1Token = await dbAdapter.getCourse('REQ_GE_COMP1');
      expect(fromComp1Token).toBeDefined();
      expect(fromComp1Token.code).toBe('ENGL 15000');
      expect(fromComp1Token.title).toBe('Composition I (GE-Comm)');
      expect(fromComp1Token.type).toBe('concrete');

      const fromGe1 = await dbAdapter.getCourse('GE 1');
      expect(fromGe1).toBeDefined();
      expect(fromGe1.code).toBe('ENGL 15000');

      const fromGeComp1 = await dbAdapter.getCourse('GE_COMP_1');
      expect(fromGeComp1).toBeDefined();
      expect(fromGeComp1.code).toBe('ENGL 15000');
    });

    it('preserves underlying catalog entry for ENGL 15000 and EPP 15000 as concrete institutional courses', async () => {
      const engl15 = await dbAdapter.getCourse('ENGL 15000');
      expect(engl15).toBeDefined();
      expect(engl15.credits).toBe(3);
      expect(engl15.type).toBe('concrete');

      const epp15 = await dbAdapter.getCourse('EPP 15000');
      expect(epp15).toBeDefined();
      expect(epp15.credits).toBe(3);
      expect(epp15.type).toBe('concrete');
      expect(epp15.title).toContain('English for Academic Purposes');
    });
  });

  describe('2. Unfulfilled Composition I Audit & Concrete Emission', () => {
    it('emits concrete ENGL 15000 in remainingCourseItems when Composition I is unfulfilled', () => {
      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);

      const comp1Bucket = audit.geBuckets.find((b) => b.bucket_id === 'comp_1');
      expect(comp1Bucket).toBeDefined();
      expect(comp1Bucket.fulfilled).toBe(false);
      expect(comp1Bucket.status).toBe('UNMET');

      // Must emit concrete ENGL 15000, NOT placeholder REQ_GE_COMP1
      const comp1Remaining = audit.remainingCourseItems.find((c) => c.code === 'ENGL 15000');
      expect(comp1Remaining).toBeDefined();
      expect(comp1Remaining.compactCode).toBe('ENGL15000');
      expect(comp1Remaining.department).toBe('ENGL');
      expect(comp1Remaining.number).toBe(15000);
      expect(comp1Remaining.credits).toBe(3);
      expect(comp1Remaining.type).toBe('concrete');
      expect(comp1Remaining.isPlaceholder).toBe(false);

      const legacyPlaceholder = audit.remainingCourseItems.find((c) => c.code === 'REQ_GE_COMP1');
      expect(legacyPlaceholder).toBeUndefined();
    });

    it('strictly guards concrete ENGL 15000 from displaying placeholder recommendations', () => {
      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);

      const comp1Remaining = audit.remainingCourseItems.find((c) => c.code === 'ENGL 15000');
      expect(comp1Remaining).toBeDefined();

      // isPlaceholderRequirement must return false for concrete ENGL 15000
      expect(isPlaceholderRequirement(comp1Remaining)).toBe(false);

      // getCourseRecommendations must return null
      const recommendations = getCourseRecommendations(comp1Remaining, 'cybersecurity_bs_2026', masterDb.courses);
      expect(recommendations).toBeNull();
    });
  });

  describe('3. Audit Fulfillment & Equivalence (ENGL 15000 vs. EPP 15000)', () => {
    it('fulfills Composition I with ENGL 15000 (grade >= C) and 0 unfulfilled core warnings', () => {
      const parsed = processRawCourseRecords([
        { code: 'ENGL 15000', title: 'Composition I', credits: 3, grade: 'B', term: '2025FA-I' }
      ]);
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      const comp1Bucket = audit.geBuckets.find((b) => b.bucket_id === 'comp_1');
      expect(comp1Bucket.fulfilled).toBe(true);
      expect(comp1Bucket.status).toBe('MET');
      expect(comp1Bucket.claimed_courses[0].compactCode).toBe('ENGL15000');
      expect(audit.warnings.compositionGatekeeperWarnings).toHaveLength(0);

      // ENGL 15000 must NOT be in remaining courses
      const remainingComp1 = audit.remainingCourseItems.find((c) => c.compactCode === 'ENGL15000');
      expect(remainingComp1).toBeUndefined();
    });

    it('fulfills Composition I with EPP 15000 (grade >= C) and 0 unfulfilled core warnings', () => {
      const parsed = processRawCourseRecords([
        { code: 'EPP 15000', title: 'Composition I - English for Academic Purposes', credits: 3, grade: 'A', term: '2025SP-I' }
      ]);
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      const comp1Bucket = audit.geBuckets.find((b) => b.bucket_id === 'comp_1');
      expect(comp1Bucket.fulfilled).toBe(true);
      expect(comp1Bucket.status).toBe('MET');
      expect(comp1Bucket.claimed_courses[0].compactCode).toBe('EPP15000');
      expect(audit.warnings.compositionGatekeeperWarnings).toHaveLength(0);

      // ENGL 15000 must NOT be in remaining courses
      const remainingComp1 = audit.remainingCourseItems.find((c) => c.compactCode === 'ENGL15000');
      expect(remainingComp1).toBeUndefined();
    });

    it('rejects grade D in ENGL 15000 from fulfilling Composition I, emitting gatekeeper warning and leaving bucket unfulfilled', () => {
      const parsed = processRawCourseRecords([
        { code: 'ENGL 15000', title: 'Composition I', credits: 3, grade: 'D', term: '2025FA-I' }
      ]);
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      const comp1Bucket = audit.geBuckets.find((b) => b.bucket_id === 'comp_1');
      expect(comp1Bucket.fulfilled).toBe(false);
      expect(comp1Bucket.status).toBe('UNMET');
      expect(audit.warnings.compositionGatekeeperWarnings).toHaveLength(1);
      expect(audit.warnings.compositionGatekeeperWarnings[0].courseCode).toBe('ENGL 15000');
      expect(audit.warnings.compositionGatekeeperWarnings[0].grade).toBe('D');

      // The 3 credits still count toward total credits (free electives)
      expect(audit.claimedFreeElectives.some((c) => c.compactCode === 'ENGL15000')).toBe(true);

      // Remaining courses requires ENGL 15000 to be taken
      expect(audit.remainingCourseItems.some((c) => c.compactCode === 'ENGL15000')).toBe(true);
    });

    it('clears gatekeeper warning when student with D in ENGL 15000 subsequently passes EPP 15000 with grade C or higher', () => {
      const parsed = processRawCourseRecords([
        { code: 'ENGL 15000', title: 'Composition I', credits: 3, grade: 'D', term: '2024FA-I' },
        { code: 'EPP 15000', title: 'Composition I - English for Academic Purposes', credits: 3, grade: 'B', term: '2025SP-I' }
      ]);
      const audit = runWaterfallAudit(parsed, 'cybersecurity_bs_2026', masterDb);

      const comp1Bucket = audit.geBuckets.find((b) => b.bucket_id === 'comp_1');
      expect(comp1Bucket.fulfilled).toBe(true);
      expect(comp1Bucket.status).toBe('MET');
      expect(comp1Bucket.claimed_courses[0].compactCode).toBe('EPP15000');
      expect(audit.warnings.compositionGatekeeperWarnings).toHaveLength(0);
      expect(audit.policyChecklist.compositionGatekeeper.comp1Fulfilled).toBe(true);
    });
  });

  describe('4. Prerequisite Chaining with ENGL 17000 (Composition II)', () => {
    it('requires ENGL 15000 or EPP 15000 before ENGL 17000 can be scheduled', async () => {
      const engl17000 = await dbAdapter.getCourse('ENGL 17000');
      expect(engl17000).toBeDefined();

      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);
      const schedule = generateOptimalSchedule(audit, parsedEmpty, {
        startSemester: 'Fall 2026',
        pacingMode: 'Full-Time'
      });
      const firstSem = schedule.semesters[0];

      // Moving ENGL 17000 to FA-I with no prior courses triggers PREREQUISITE_UNMET
      const moveConflict = validateScheduleMove(
        { ...engl17000, compactCode: 'ENGL17000' },
        firstSem,
        'FA-I',
        schedule.semesters,
        new Set()
      );
      expect(moveConflict.hasConflict).toBe(true);
      expect(moveConflict.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(true);

      // When ENGL 15000 is completed, ENGL 17000 is valid
      const moveWithEngl15 = validateScheduleMove(
        { ...engl17000, compactCode: 'ENGL17000' },
        firstSem,
        'FA-II',
        [
          {
            ...firstSem,
            lanes: {
              ...firstSem.lanes,
              'FA-I': [{ code: 'ENGL 15000', compactCode: 'ENGL15000', type: 'concrete' }]
            }
          }
        ],
        new Set()
      );
      expect(moveWithEngl15.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(false);

      // When EPP 15000 is completed, ENGL 17000 is also valid
      const moveWithEpp15 = validateScheduleMove(
        { ...engl17000, compactCode: 'ENGL17000' },
        firstSem,
        'FA-II',
        [
          {
            ...firstSem,
            lanes: {
              ...firstSem.lanes,
              'FA-I': [{ code: 'EPP 15000', compactCode: 'EPP15000', type: 'concrete' }]
            }
          }
        ],
        new Set()
      );
      expect(moveWithEpp15.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(false);
    });
  });
});
