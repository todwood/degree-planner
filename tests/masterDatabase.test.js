import { describe, it, expect, beforeEach } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import { dbAdapter } from '../src/data/dbAdapter.js';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';
import { processRawCourseRecords } from '../src/engine/transcriptParser.js';
import {
  resolveCourseAvailability,
  classifyTactileWeight,
  generateOptimalSchedule,
  validateScheduleMove
} from '../src/engine/scheduler.js';

describe('Phase 1: Master Database Integrity Verification', () => {
  it('should load masterDatabase.json with valid structure and version', () => {
    expect(masterDb).toBeDefined();
    expect(masterDb.version).toBe('1.0.0');
    expect(Array.isArray(masterDb.catalog_years)).toBe(true);
    expect(Array.isArray(masterDb.programs)).toBe(true);
    expect(Array.isArray(masterDb.courses)).toBe(true);
    expect(Array.isArray(masterDb.ge_waterfall_schema)).toBe(true);
    expect(masterDb.degree_policies).toBeDefined();
  });

  describe('Curriculum Checklists for all 3 Majors', () => {
    it('1. Cybersecurity, BS (66 credits: 60cr Core + 6cr Math)', () => {
      const cyber = masterDb.programs.find((p) => p.acalog_poid === 2148);
      expect(cyber).toBeDefined();
      expect(cyber.name).toBe('Cybersecurity, BS');
      expect(cyber.total_program_credits).toBe(66);
      expect(cyber.requirements.major_core_credits).toBe(60);
      expect(cyber.requirements.major_core_courses.length).toBe(20);

      // Verify each course is in master database and 3 credits each
      let totalCoreCr = 0;
      for (const code of cyber.requirements.major_core_courses) {
        const course = masterDb.courses.find((c) => c.code === code);
        expect(course, `Course ${code} must exist in catalog`).toBeDefined();
        expect(course.credits).toBe(3);
        totalCoreCr += course.credits;
      }
      expect(totalCoreCr).toBe(60);

      // Check Math
      expect(cyber.requirements.math_credits).toBe(6);
      const mathCodes = cyber.requirements.math_courses.map((m) => m.code);
      expect(mathCodes).toContain('MTH 14100');
    });

    it('2. IT, BS - Applications Development Emphasis (66 credits: 24cr Core + 36cr Emphasis + 6cr Math)', () => {
      const itAppDev = masterDb.programs.find((p) => p.acalog_poid === 2151);
      expect(itAppDev).toBeDefined();
      expect(itAppDev.name).toContain('Applications Development');
      expect(itAppDev.total_program_credits).toBe(66);
      expect(itAppDev.requirements.major_core_credits).toBe(24);
      expect(itAppDev.requirements.major_core_courses.length).toBe(8);
      expect(itAppDev.requirements.emphasis_credits).toBe(36);
      expect(itAppDev.requirements.emphasis_courses.length).toBe(12);

      // Core credits sum
      const coreSum = itAppDev.requirements.major_core_courses.reduce((acc, code) => {
        const c = masterDb.courses.find((x) => x.code === code);
        return acc + (c ? c.credits : 0);
      }, 0);
      expect(coreSum).toBe(24);

      // Emphasis credits sum
      const emphasisSum = itAppDev.requirements.emphasis_courses.reduce((acc, code) => {
        const c = masterDb.courses.find((x) => x.code === code);
        return acc + (c ? c.credits : 0);
      }, 0);
      expect(emphasisSum).toBe(36);

      // Verify IIT 45200 is forced summer
      const iit45200 = masterDb.courses.find((c) => c.code === 'IIT 45200');
      expect(iit45200).toBeDefined();
      expect(iit45200.SU_8wk).toBe(true);
      expect(iit45200.FA_I_8wk).toBe(false);
      expect(iit45200.FA_II_8wk).toBe(false);
      expect(iit45200.SP_I_8wk).toBe(false);
      expect(iit45200.SP_II_8wk).toBe(false);
    });

    it('3. IT, BS - Networking Emphasis (60 credits: 24cr Core + 30cr Emphasis with Cisco lecture/lab + 6cr Math)', () => {
      const itNet = masterDb.programs.find((p) => p.acalog_poid === 2152);
      expect(itNet).toBeDefined();
      expect(itNet.name).toContain('Networking');
      expect(itNet.total_program_credits).toBe(60);
      expect(itNet.requirements.major_core_credits).toBe(24);
      expect(itNet.requirements.emphasis_credits).toBe(30);

      // Verify Cisco lecture (5cr) + lab (1cr) combinations
      const ciscoI = masterDb.courses.find((c) => c.code === 'ICS 32300');
      const ciscoILab = masterDb.courses.find((c) => c.code === 'ICS 32301');
      expect(ciscoI.credits).toBe(5);
      expect(ciscoILab.credits).toBe(1);
      expect(ciscoI.coreq_codes).toContain('ICS 32301');
      expect(ciscoILab.coreq_codes).toContain('ICS 32300');

      const ciscoII = masterDb.courses.find((c) => c.code === 'ICS 32400');
      const ciscoIILab = masterDb.courses.find((c) => c.code === 'ICS 32401');
      expect(ciscoII.credits).toBe(5);
      expect(ciscoIILab.credits).toBe(1);

      const ciscoIII = masterDb.courses.find((c) => c.code === 'ICS 32500');
      const ciscoIIILab = masterDb.courses.find((c) => c.code === 'ICS 32501');
      expect(ciscoIII.credits).toBe(5);
      expect(ciscoIIILab.credits).toBe(1);

      // Verify emphasis course credit sum
      const emphasisSum = itNet.requirements.emphasis_courses.reduce((acc, code) => {
        const c = masterDb.courses.find((x) => x.code === code);
        return acc + (c ? c.credits : 0);
      }, 0);
      expect(emphasisSum).toBe(30);

      // Check Cisco concurrent exemption rule presence
      expect(itNet.requirements.cisco_concurrent_lab_exemption_rules).toBeDefined();
    });
  });

  describe('The 14-Bucket (42-Credit) General Education Waterfall Schema', () => {
    it('has exactly 14 sequential buckets totaling 42 credits', () => {
      const schema = masterDb.ge_waterfall_schema;
      expect(schema.length).toBe(14);
      const totalCr = schema.reduce((sum, b) => sum + b.required_credits, 0);
      expect(totalCr).toBe(42);
    });

    it('enforces Grade >= C for Composition I and II', () => {
      const comp1 = masterDb.ge_waterfall_schema.find((b) => b.bucket_id === 'comp_1');
      const comp2 = masterDb.ge_waterfall_schema.find((b) => b.bucket_id === 'comp_2');
      expect(comp1.min_grade).toBe('C');
      expect(comp2.min_grade).toBe('C');
    });

    it('specifies MTH 14100 in math bucket for dual-satisfaction', () => {
      const mathBucket = masterDb.ge_waterfall_schema.find((b) => b.bucket_id === 'math');
      expect(mathBucket.eligible_courses).toContain('MTH 14100');
      expect(mathBucket.matcher_type).toBe('MAJOR_OVERLAP');
    });
  });

  describe('Degree Policy Thresholds & Edge Cases', () => {
    it('verifies 120 credit total, 42 upper-level (30000+), and residency minimums', () => {
      const p = masterDb.degree_policies;
      expect(p.min_total_credits).toBe(120);
      expect(p.min_upper_level_credits).toBe(42);
      expect(p.upper_level_min_number).toBe(30000);
      expect(p.min_lindenwood_residency_credits).toBe(30);
      expect(p.final_residency_credits).toBe(24);
      expect(p.major_residency_min_credits).toBe(18);
      expect(p.major_residency_min_percent).toBe(0.40);
    });

    it('verifies 2 Human Diversity (/HD) courses requirement', () => {
      const hd = masterDb.degree_policies.human_diversity_requirement;
      expect(hd.required_courses).toBe(2);
      expect(hd.required_credits).toBe(6);
      expect(hd.attribute_tag).toBe('/HD');
    });

    it('verifies legacy course substitutions', () => {
      const ics41500 = masterDb.courses.find((c) => c.code === 'ICS 41500');
      expect(ics41500.legacy_substitutions).toContain('ICS 41100');

      const ics41700 = masterDb.courses.find((c) => c.code === 'ICS 41700');
      expect(ics41700.legacy_substitutions).toContain('ICS 41400');

      const ics32600 = masterDb.courses.find((c) => c.code === 'ICS 32600');
      expect(ics32600.pe_notes.length).toBeGreaterThan(0);
    });

    it('verifies IIT 21500 Math Placement eligibility', () => {
      const iit21500 = masterDb.courses.find((c) => c.code === 'IIT 21500');
      expect(iit21500.math_placement_eligible).toBe(true);
    });
  });

  describe('dbAdapter Offline Execution & Two-Key Peer Verification', () => {
    beforeEach(async () => {
      await dbAdapter.resetDatabase();
    });

    it('retrieves courses, programs, and catalog years offline', async () => {
      const years = await dbAdapter.getCatalogYears();
      expect(years.length).toBeGreaterThanOrEqual(3);

      const programs = await dbAdapter.getPrograms('2026-2027');
      expect(programs.length).toBeGreaterThanOrEqual(3);

      const course = await dbAdapter.getCourse('ICS 21300');
      expect(course).toBeDefined();
      expect(course.title).toBe('Foundations of Information Technology');
      expect(course.verification_status).toBe('Verified');
    });

    it('applies Two-Key Peer Verification rule on course edits', async () => {
      const testCourse = {
        code: 'TEST 10100',
        title: 'Experimental Testing Course',
        credits: 3,
        FA_I_8wk: true,
        FA_II_8wk: false,
        verification_status: 'Blank_Unverified'
      };

      // Advisor 1 submits -> tagged 'Tentative (*)'
      const saved1 = await dbAdapter.saveCourse(testCourse, 'advisor1@lindenwood.edu');
      expect(saved1.verification_status).toBe('Tentative');
      expect(saved1.submitted_by).toBe('advisor1@lindenwood.edu');

      // Advisor 2 confirms -> promoted to 'Verified'
      const saved2 = await dbAdapter.saveCourse(saved1, 'advisor2@lindenwood.edu');
      expect(saved2.verification_status).toBe('Verified');
      expect(saved2.verified_by).toBe('advisor2@lindenwood.edu');
    });

    it('manages canonical placeholders, legacy aliases, and protects system-locked tokens', async () => {
      // 1. Check placeholders count and concrete count
      const placeholders = await dbAdapter.getPlaceholders();
      expect(placeholders.length).toBe(15);

      const concreteCourses = await dbAdapter.getConcreteCourses();
      expect(concreteCourses.length).toBe(71);

      // 2. Query placeholder by canonical token
      const art = await dbAdapter.getCourse('REQ_GE_ART');
      expect(art).toBeDefined();
      expect(art.type).toBe('placeholder');
      expect(art.system_locked).toBe(true);
      expect(art.ge_bucket_id).toBe('arts');
      expect(art.flexibility_tier).toBe('sky_blue');
      expect(art.FA_I_8wk).toBe(true);
      expect(art.SU_8wk).toBe(true);

      // Verify legacy REQ_GE_COMP1 alias resolves to concrete ENGL 15000
      const comp1Req = await dbAdapter.getCourse('REQ_GE_COMP1');
      expect(comp1Req).toBeDefined();
      expect(comp1Req.code).toBe('ENGL 15000');
      expect(comp1Req.title).toBe('Composition I (GE-Comm)');

      const legacyGe1 = await dbAdapter.getCourse('GE 1');
      expect(legacyGe1).toBeDefined();
      expect(legacyGe1.code).toBe('ENGL 15000');

      // Verify underlying placeholder entry preserved in catalog
      const comp1Placeholder = (await dbAdapter.getPlaceholders()).find((p) => p.code === 'REQ_GE_COMP1');
      expect(comp1Placeholder).toBeDefined();
      expect(comp1Placeholder.eligible_courses).toContain('ENGL 15000');
      expect(comp1Placeholder.eligible_courses).toContain('EPP 15000');
      expect(comp1Placeholder.default_course).toBe('ENGL 15000');

      // 3. Natural Science with Lab carries 4 credits
      const natSci = await dbAdapter.getCourse('REQ_GE_NAT_SCI_LAB');
      expect(natSci).toBeDefined();
      expect(natSci.credits).toBe(4);

      // 4. Check isPlaceholder helper
      expect(dbAdapter.isPlaceholder('REQ_GE_ART')).toBe(true);
      expect(dbAdapter.isPlaceholder('GE 9')).toBe(true);
      expect(dbAdapter.isPlaceholder('GE: Fine Arts')).toBe(true);
      expect(dbAdapter.isPlaceholder('UL-ELEC 30001')).toBe(true);
      expect(dbAdapter.isPlaceholder('ELEC 10001')).toBe(true);
      expect(dbAdapter.isPlaceholder('ICS 21300')).toBe(false);

      // 5. Query via legacy aliases
      const legacyArt = await dbAdapter.getCourse('GE 9');
      expect(legacyArt).toBeDefined();
      expect(legacyArt.code).toBe('REQ_GE_ART');

      const legacyTrayArt = await dbAdapter.getCourse('GE: Fine Arts');
      expect(legacyTrayArt).toBeDefined();
      expect(legacyTrayArt.code).toBe('REQ_GE_ART');

      const legacyMathElec = await dbAdapter.getCourse('GE-MATH-ELECTIVE');
      expect(legacyMathElec).toBeDefined();
      expect(legacyMathElec.code).toBe('REQ_GE_MATH');

      const upperGap = await dbAdapter.getCourse('UL-ELEC 30001');
      expect(upperGap).toBeDefined();
      expect(upperGap.code).toBe('REQ_ELEC_UPPER');

      const genGap = await dbAdapter.getCourse('ELEC 10002');
      expect(genGap).toBeDefined();
      expect(genGap.code).toBe('REQ_ELEC_GEN');

      // 6. Verify ENGL course title cleanup & prerequisite safety
      const engl15 = await dbAdapter.getCourse('ENGL 15000');
      expect(engl15.title).toBe('Composition I (GE-Comm)');

      const engl17 = await dbAdapter.getCourse('ENGL 17000');
      expect(engl17.title).toBe('Composition II (GE-Comm)');
      const prereqCodes = engl17.prereq_logic.items.map((i) => i.code);
      expect(prereqCodes).toContain('ENGL 15000');
      expect(prereqCodes).toContain('EPP 15000');
      expect(prereqCodes).not.toContain('REQ_GE_COMP1');

      const epp15 = await dbAdapter.getCourse('EPP 15000');
      expect(epp15.title).toBe('Composition I - English for Academic Purposes (GE-Comm)');

      // 6. Protect system-locked requirement placeholders from mutation/deletion by non-system
      await expect(
        dbAdapter.saveCourse({ code: 'REQ_GE_ART', title: 'Hacked Title' }, 'advisor@lindenwood.edu')
      ).rejects.toThrow(/Cannot modify system-locked/);

      await expect(
        dbAdapter.deleteCourse('REQ_GE_ART', 'advisor@lindenwood.edu')
      ).rejects.toThrow(/Cannot delete system-locked/);

      // System can update if needed
      const systemUpdated = await dbAdapter.saveCourse(
        { ...art, description: 'Updated by system' },
        'system'
      );
      expect(systemUpdated.description).toBe('Updated by system');
    });

    it('7. Phase C: Compound Science Lab matching (Paths A, B, C)', () => {
      // Path A: Single 4cr Combined Science course
      const parsedA = processRawCourseRecords([
        { code: 'BSC 10000', title: 'Concepts in Biology with Lab', credits: 4, grade: 'A', term: '2025FA-I' }
      ]);
      const auditA = runWaterfallAudit(parsedA, 'cybersecurity_bs_2026', masterDb);
      const bA = auditA.geBuckets.find((b) => b.bucket_id === 'nat_sci_lab');
      expect(bA.fulfilled).toBe(true);
      expect(bA.status).toBe('MET');
      expect(bA.claimed_courses.length).toBe(1);
      expect(bA.claimed_courses[0].compactCode).toBe('BSC10000');

      // Path B: Compound Split (3cr Lecture + 1cr Lab)
      const parsedB = processRawCourseRecords([
        { code: 'CHM 10000', title: 'Concepts in Chemistry', credits: 3, grade: 'A', term: '2025FA-I' },
        { code: 'CHM 10001', title: 'Concepts in Chemistry Lab', credits: 1, grade: 'A', term: '2025FA-I' }
      ]);
      const auditB = runWaterfallAudit(parsedB, 'cybersecurity_bs_2026', masterDb);
      const bB = auditB.geBuckets.find((b) => b.bucket_id === 'nat_sci_lab');
      expect(bB.fulfilled).toBe(true);
      expect(bB.status).toBe('MET');
      expect(bB.claimed_courses.length).toBe(2);
      expect(bB.claimed_courses.map((c) => c.compactCode)).toContain('CHM10000');
      expect(bB.claimed_courses.map((c) => c.compactCode)).toContain('CHM10001');

      // Path C: Orphaned 3cr lecture without lab leaves nat_sci_lab UNMET, cascades to sci_elective
      const parsedC = processRawCourseRecords([
        { code: 'BSC 10100', title: 'Introduction to Biology', credits: 3, grade: 'A', term: '2025FA-I' }
      ]);
      const auditC = runWaterfallAudit(parsedC, 'cybersecurity_bs_2026', masterDb);
      const bC = auditC.geBuckets.find((b) => b.bucket_id === 'nat_sci_lab');
      expect(bC.fulfilled).toBe(false);
      expect(bC.status).toBe('UNMET');
      expect(bC.claimed_courses.length).toBe(0);

      // Orphaned lecture cascades to sci_elective
      const sciElec = auditC.geBuckets.find((b) => b.bucket_id === 'sci_elective');
      expect(sciElec.fulfilled).toBe(true);
      expect(sciElec.status).toBe('MET');
      expect(sciElec.matchedCourse.compactCode).toBe('BSC10100');

      // Emitted remaining course has canonical REQ_GE_NAT_SCI_LAB with credits: 4
      const remainingNatSci = auditC.remainingCourseItems.find((c) => c.code === 'REQ_GE_NAT_SCI_LAB');
      expect(remainingNatSci).toBeDefined();
      expect(remainingNatSci.credits).toBe(4);
      expect(remainingNatSci.type).toBe('placeholder');
    });

    it('8. Phase C: Composition I & II architecture & prerequisite safety', () => {
      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);

      // Unmet Composition I emits concrete ENGL 15000 course
      const comp1Item = audit.remainingCourseItems.find((c) => c.code === 'ENGL 15000');
      expect(comp1Item).toBeDefined();
      expect(comp1Item.type).toBe('concrete');
      expect(comp1Item.isPlaceholder).toBe(false);
      expect(comp1Item.title).toBe('Composition I (GE-Comm)');

      // Unmet Composition II emits concrete ENGL 17000
      const comp2Item = audit.remainingCourseItems.find((c) => c.code === 'ENGL 17000');
      expect(comp2Item).toBeDefined();
      expect(comp2Item.type).toBe('concrete');
      expect(comp2Item.title).toBe('Composition II (GE-Comm)');
    });

    it('9. Phase C: Mathematics placeholder consolidation & major math requirements', () => {
      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);

      // Major math requirements lists REQ_GE_MATH
      expect(audit.majorMathRequirements[1].code).toBe('REQ_GE_MATH');
      expect(audit.majorMathRequirements[1].title).toBe('Mathematics Elective (GE-Math)');

      // Unmet STEM elective placeholder is REQ_GE_MATH
      const stemMathItem = audit.remainingCourseItems.find((c) => c.geBucketId === 'stem_elective');
      expect(stemMathItem).toBeDefined();
      expect(stemMathItem.code).toBe('REQ_GE_MATH');
      expect(stemMathItem.type).toBe('placeholder');
    });

    it('10. Phase C: Token stability for Human Diversity (/HD) overlay and Electives', async () => {
      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);

      // Verify that placeholders needing HD keep canonical code stable
      const hdItems = audit.remainingCourseItems.filter((c) => c.needs_hd || c.requiresHD);
      expect(hdItems.length).toBeGreaterThanOrEqual(1);

      for (const item of hdItems) {
        // Code must NOT have /HD appended to it
        expect(item.code).not.toContain('/HD');
        expect(item.code).not.toContain('(HD)');
        expect(item.code.startsWith('REQ_')).toBe(true);

        // Display title MUST include (HD)
        expect(item.title).toContain('(HD)');

        // dbAdapter can resolve code directly without failing
        const lookup = await dbAdapter.getCourse(item.code);
        expect(lookup).toBeDefined();
      }

      // Verify General Elective placeholder emissions in Cybersecurity BS
      const genItems = audit.remainingCourseItems.filter((c) => c.code.startsWith('REQ_ELEC_GEN_'));
      expect(genItems.length).toBeGreaterThan(0);
      expect(genItems[0].type).toBe('placeholder');
      expect(genItems[0].canonicalCode).toBe('REQ_ELEC_GEN');
      const genLookup = await dbAdapter.getCourse(genItems[0].code);
      expect(genLookup).toBeDefined();
      expect(genLookup.code).toBe('REQ_ELEC_GEN');

      // Verify Upper-Level Elective placeholder emissions in CS BS (which has an upper-level deficit)
      const auditCS = runWaterfallAudit(parsedEmpty, 'cs_bs_2026', masterDb);
      const ulItems = auditCS.remainingCourseItems.filter((c) => c.code.startsWith('REQ_ELEC_UPPER_'));
      expect(ulItems.length).toBeGreaterThan(0);
      expect(ulItems[0].type).toBe('placeholder');
      expect(ulItems[0].canonicalCode).toBe('REQ_ELEC_UPPER');
      const ulLookup = await dbAdapter.getCourse(ulItems[0].code);
      expect(ulLookup).toBeDefined();
      expect(ulLookup.code).toBe('REQ_ELEC_UPPER');
    });

    it('11. Phase D: Scheduler Availability, Placeholder Tactile Weight (Sky Blue), and Prerequisite Sequencing', async () => {
      // 1. resolveCourseAvailability returns 7 annual sessions and all boolean flags for placeholders
      const placeholder = await dbAdapter.getCourse('REQ_GE_ART');
      const avail = resolveCourseAvailability(placeholder);
      expect(avail.annualSessionCount).toBe(7);
      expect(avail.usedBlankFallback).toBe(false);
      expect(avail.FA_I_8wk).toBe(true);
      expect(avail.FA_II_8wk).toBe(true);
      expect(avail.FA_16wk).toBe(true);
      expect(avail.SP_I_8wk).toBe(true);
      expect(avail.SP_II_8wk).toBe(true);
      expect(avail.SP_16wk).toBe(true);
      expect(avail.SU_8wk).toBe(true);

      const genElecAvail = resolveCourseAvailability({ code: 'REQ_ELEC_GEN_1', type: 'placeholder' });
      expect(genElecAvail.annualSessionCount).toBe(7);
      expect(genElecAvail.usedBlankFallback).toBe(false);

      // 2. classifyTactileWeight assigns Tier 1 (Blue / Sky Blue) for all unlocked placeholders
      const tactileArt = classifyTactileWeight(placeholder);
      expect(tactileArt.tier).toBe(1);
      expect(tactileArt.colorName).toBe('Blue');

      const tactileComp1 = classifyTactileWeight({ code: 'REQ_GE_COMP1', type: 'placeholder' });
      expect(tactileComp1.tier).toBe(1);
      expect(tactileComp1.colorName).toBe('Blue');

      const tactileUpper = classifyTactileWeight({ code: 'REQ_ELEC_UPPER_1', type: 'placeholder' });
      expect(tactileUpper.tier).toBe(1);
      expect(tactileUpper.colorName).toBe('Blue');

      // Locked placeholder respects advisor lock (Tier 3)
      const lockedPlaceholder = classifyTactileWeight({ code: 'REQ_GE_ART', type: 'placeholder', locked: true });
      expect(lockedPlaceholder.tier).toBe(3);
      expect(lockedPlaceholder.colorName).toBe('Slate');

      // 3. Optimal schedule generation ignores placeholders in missingAvailabilityCourses
      const parsedEmpty = processRawCourseRecords([]);
      const audit = runWaterfallAudit(parsedEmpty, 'cybersecurity_bs_2026', masterDb);
      const schedule = generateOptimalSchedule(audit, parsedEmpty, {
        startSemester: 'Fall 2026',
        pacingMode: 'Full-Time'
      });
      for (const missingCode of schedule.missingAvailabilityCourses) {
        expect(missingCode.startsWith('REQ_')).toBe(false);
      }

      // 4. Prerequisite sequencing: ENGL 17000 cannot be scheduled before ENGL 15000
      const engl17000 = await dbAdapter.getCourse('ENGL 17000');
      const firstSem = schedule.semesters[0]; // Fall 2026

      // Try moving ENGL 17000 to FA-I with empty completed set (ENGL 15000 not completed)
      const moveConflict = validateScheduleMove(
        { ...engl17000, compactCode: 'ENGL17000' },
        firstSem,
        'FA-I',
        schedule.semesters,
        new Set()
      );
      expect(moveConflict.hasConflict).toBe(true);
      expect(moveConflict.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(true);

      // When ENGL 15000 is completed prior (or in FA-I when scheduling into FA-II), prereq is satisfied!
      const chainedMove = validateScheduleMove(
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
      expect(chainedMove.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(false);
    });

    it('5. Phase E: UI & Component Integration Verification Suite', async () => {
      // 1. dbAdapter.getPlaceholders() & getPlaceholdersSync()
      const asyncPlaceholders = await dbAdapter.getPlaceholders();
      const syncPlaceholders = dbAdapter.getPlaceholdersSync();
      expect(asyncPlaceholders.length).toBe(15);
      expect(syncPlaceholders.length).toBe(15);

      for (const p of syncPlaceholders) {
        expect(p.type).toBe('placeholder');
        expect(p.system_locked).toBe(true);
        expect(p.code.startsWith('REQ_')).toBe(true);
        expect(dbAdapter.isPlaceholder(p.code)).toBe(true);
        expect(dbAdapter.isPlaceholder(p.code.replace(/\s+/g, ''))).toBe(true);
      }

      // 2. Workflow B Currently Enrolled Tray loading uses canonical tokens and dynamic credits
      const natSciPlaceholder = syncPlaceholders.find((p) => p.code === 'REQ_GE_NAT_SCI_LAB');
      expect(natSciPlaceholder).toBeDefined();
      expect(natSciPlaceholder.credits).toBe(4);

      const mathPlaceholder = syncPlaceholders.find((p) => p.code === 'REQ_GE_MATH');
      expect(mathPlaceholder).toBeDefined();
      expect(mathPlaceholder.credits).toBe(3);

      // Verify legacy string mappings in isPlaceholder
      expect(dbAdapter.isPlaceholder('GE: Fine Arts')).toBe(true);
      expect(dbAdapter.isPlaceholder('GE: Literature')).toBe(true);
      expect(dbAdapter.isPlaceholder('REQ_ELEC_GEN_1')).toBe(true);
      expect(dbAdapter.isPlaceholder('REQ_ELEC_UPPER_2')).toBe(true);
      expect(dbAdapter.isPlaceholder('ICS 21300')).toBe(false);

      // 3. Course Inspector Drawer: ge_popularity_stats filtering by ge_bucket_id
      const allStats = masterDb.ge_popularity_stats || [];
      const filterByBucket = (bucketId) => allStats.filter((st) => st.ge_bucket_id === bucketId);

      const artStats = filterByBucket('arts');
      expect(artStats.map((s) => s.course_code)).toEqual(['ART 18100', 'TA 11700']);

      const natSciStats = filterByBucket('nat_sci_lab');
      expect(natSciStats.map((s) => s.course_code)).toEqual(['BSC 10000', 'ESC 10000']);

      const histStats = filterByBucket('us_hist_gov');
      expect(histStats.map((s) => s.course_code)).toEqual(['HIST 10500', 'PS 15500']);

      const socStats = filterByBucket('soc_sci');
      expect(socStats.map((s) => s.course_code)).toEqual(['PSY 10000', 'SOC 10200']);

      const litStats = filterByBucket('lit');
      expect(litStats.map((s) => s.course_code)).toEqual(['ENGL 20100', 'ENGL 21600']);

      const hcStats = filterByBucket('human_culture_1');
      expect(hcStats.map((s) => s.course_code)).toEqual(['REL 20000', 'PHL 10000', 'ANT 11200']);

      // 4. Schedule Board: Category Badges & Tier 1 (Sky Blue) Styling
      const formatCategoryBadge = (c, isEnr = false) => {
        if (isEnr) return 'ENR';
        if (c.category === 'GE' || c.category === 'General Education') return 'GE';
        if (c.category === 'E' || c.category === 'Elective' || c.category === 'Free Elective') return 'E';
        if (c.category === 'M' || c.category === 'Major Core') return 'M';
        if (c.category === 'Em' || c.category === 'Emphasis') return 'Em';
        if (c.category === 'M/GE') return 'M/GE';
        if (c.placeholder_category === 'ge_bucket' || c.code?.startsWith('REQ_GE')) return 'GE';
        if (c.placeholder_category === 'elective_gap' || c.code?.startsWith('REQ_ELEC')) return 'E';
        return c.category || 'M';
      };

      const artBadge = formatCategoryBadge({ code: 'REQ_GE_ART', category: 'GE' });
      expect(artBadge).toBe('GE');

      const elecGenBadge = formatCategoryBadge({ code: 'REQ_ELEC_GEN_1', category: 'E' });
      expect(elecGenBadge).toBe('E');

      const elecUpperBadge = formatCategoryBadge({ code: 'REQ_ELEC_UPPER_1', category: 'E' });
      expect(elecUpperBadge).toBe('E');

      const majorBadge = formatCategoryBadge({ code: 'ICS 21300', category: 'Major Core' });
      expect(majorBadge).toBe('M');

      const enrolledBadge = formatCategoryBadge({ code: 'ICS 21300', category: 'Major Core' }, true);
      expect(enrolledBadge).toBe('ENR');

      // 5. Enrolled placeholder claims waterfall GE bucket
      const parsedWithEnrolledArt = {
        validCourses: [
          {
            code: 'REQ_GE_ART',
            compactCode: 'REQ_GE_ART',
            title: 'General Education: Fine Arts',
            credits: 3,
            grade: 'Current',
            state: 'Current',
            term: 'FALL_26_16W',
            type: 'placeholder'
          }
        ]
      };
      const auditArt = runWaterfallAudit(parsedWithEnrolledArt, 'cybersecurity_bs_2026', masterDb);
      const artBucket = auditArt.geBuckets.find((b) => b.bucket_id === 'arts');
      expect(artBucket).toBeDefined();
      expect(artBucket.status).toBe('MET');
      expect(artBucket.claimed_courses.length).toBe(1);
      expect(artBucket.claimed_courses[0].code).toBe('REQ_GE_ART');
    });
  });
});
