#!/usr/bin/env node

/**
 * execution/merge_staged_courses.js
 *
 * Deterministic Offline Course Merge Pipeline.
 * Merges staged course definitions and schedule_telemetry into masterDatabase.json
 * while guaranteeing program integrity and backward compatibility.
 *
 * Usage:
 *   node execution/merge_staged_courses.js --staging=.tmp/courses_staging_all_2026.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalize course code for collision-free comparison.
 * e.g. "MTH 14100" -> "MTH14100"
 */
export function normalizeCode(code) {
  return (code || '').toUpperCase().replace(/\s+/g, '');
}

/**
 * Map an offering string to a standard offered_sessions format.
 */
export function mapOfferingToSession(offering) {
  if (!offering || typeof offering !== 'string') return null;
  const o = offering.trim();
  if (o === 'FA-16wk' || o === 'Fall-16wk' || o === '16wk-FA' || o === 'FA_16wk') return 'Fall-16wk';
  if (o === 'SP-16wk' || o === 'Spring-16wk' || o === '16wk-SP' || o === 'SP_16wk') return 'Spring-16wk';
  if (o === 'FA-I' || o === 'FA_I' || o === 'FA-I-8wk') return 'FA-I';
  if (o === 'FA-II' || o === 'FA_II' || o === 'FA-II-8wk') return 'FA-II';
  if (o === 'SP-I' || o === 'SP_I' || o === 'SP-I-8wk') return 'SP-I';
  if (o === 'SP-II' || o === 'SP_II' || o === 'SP-II-8wk') return 'SP-II';
  if (o === 'SU' || o === 'SU_8wk' || o.startsWith('SU-') || o.startsWith('SU_')) return 'SU';
  return o;
}

/**
 * Derive session booleans from offerings and offered_sessions.
 */
export function deriveSessionBooleans(offerings = [], offeredSessions = []) {
  const all = [...(offerings || []), ...(offeredSessions || [])];
  const FA_I_8wk = all.some((s) => s === 'FA-I' || s === 'FA_I' || s === 'FA-I-8wk');
  const FA_II_8wk = all.some((s) => s === 'FA-II' || s === 'FA_II' || s === 'FA-II-8wk');
  const FA_16wk = all.some((s) => s === 'Fall-16wk' || s === 'FA-16wk' || s === '16wk');
  const SP_I_8wk = all.some((s) => s === 'SP-I' || s === 'SP_I' || s === 'SP-I-8wk');
  const SP_II_8wk = all.some((s) => s === 'SP-II' || s === 'SP_II' || s === 'SP-II-8wk');
  const SP_16wk = all.some((s) => s === 'Spring-16wk' || s === 'SP-16wk');
  const SU_8wk = all.some(
    (s) => s === 'SU' || s === 'SU_8wk' || (typeof s === 'string' && s.startsWith('SU'))
  );
  return { FA_I_8wk, FA_II_8wk, FA_16wk, SP_I_8wk, SP_II_8wk, SP_16wk, SU_8wk };
}

/**
 * Derive clean offered_sessions array from offerings.
 */
export function deriveOfferedSessions(offerings = [], existingSessions = []) {
  const set = new Set();
  for (const s of existingSessions || []) {
    set.add(s);
  }
  for (const off of offerings || []) {
    const mapped = mapOfferingToSession(off);
    if (mapped) set.add(mapped);
  }
  if (set.size === 0) {
    set.add('Fall-16wk');
    set.add('Spring-16wk');
  }
  return Array.from(set);
}

/**
 * Core deterministic merge pipeline function.
 */
export function mergeStagedCourses({
  stagingPath,
  masterDbPath = path.resolve(__dirname, '../src/data/masterDatabase.json'),
  dryRun = false
}) {
  // Step 1: Safety Checks
  if (!stagingPath) {
    throw new Error('Missing required argument: stagingPath');
  }

  const resolvedStaging = path.resolve(stagingPath);
  if (!fs.existsSync(resolvedStaging)) {
    throw new Error(`Staging file not found: ${resolvedStaging}`);
  }

  let stagingRaw;
  try {
    stagingRaw = fs.readFileSync(resolvedStaging, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read staging file: ${err.message}`);
  }

  let stagedData;
  try {
    stagedData = JSON.parse(stagingRaw);
  } catch (err) {
    throw new Error(`Staging file is not valid JSON: ${err.message}`);
  }

  const resolvedMaster = path.resolve(masterDbPath);
  if (!fs.existsSync(resolvedMaster)) {
    throw new Error(`Master database file not found: ${resolvedMaster}`);
  }

  let masterDb;
  try {
    masterDb = JSON.parse(fs.readFileSync(resolvedMaster, 'utf8'));
  } catch (err) {
    throw new Error(`Master database is not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(masterDb.courses)) {
    throw new Error('Master database "courses" property must be an array.');
  }
  if (!Array.isArray(masterDb.programs)) {
    throw new Error('Master database "programs" property must be an array.');
  }

  // Convert staging data (array or key-value object) to array
  const stagedList = Array.isArray(stagedData) ? stagedData : Object.values(stagedData);
  const validStagedCourses = stagedList.filter((c) => c && (c.code || c.course_code));

  const totalBefore = masterDb.courses.length;
  let totalUpdated = 0;
  let totalAdded = 0;

  // Build lookup index of existing courses by normalized code
  const existingMap = new Map();
  masterDb.courses.forEach((c, idx) => {
    existingMap.set(normalizeCode(c.code), { course: c, index: idx });
  });

  // Step 2: Deterministic Merge Rules
  for (const staged of validStagedCourses) {
    const rawCode = staged.code || staged.course_code;
    const norm = normalizeCode(rawCode);

    if (existingMap.has(norm)) {
      // Existing course: Update description, credits, prerequisites, offerings, and append schedule_telemetry
      const existing = existingMap.get(norm).course;

      if (staged.description && typeof staged.description === 'string' && staged.description.trim()) {
        existing.description = staged.description.trim();
      }

      // Title reconciliation with GE markers
      if (staged.title && typeof staged.title === 'string' && staged.title.trim()) {
        if (!/\(GE[-:][^)]+\)/i.test(existing.title) && /\(GE[-:][^)]+\)/i.test(staged.title)) {
          existing.title = staged.title.trim();
        } else if (!/\(GE[-:][^)]+\)/i.test(existing.title) && !/\(GE[-:][^)]+\)/i.test(staged.title)) {
          existing.title = staged.title.trim();
        }
      }

      if (staged.credits !== undefined && staged.credits !== null && !isNaN(Number(staged.credits))) {
        existing.credits = Number(staged.credits);
      }

      // Variable Credits & Repeatability
      if (staged.is_variable_credit !== undefined) {
        existing.is_variable_credit = Boolean(staged.is_variable_credit);
        existing.min_credits = staged.min_credits !== undefined ? staged.min_credits : null;
        existing.max_credits = staged.max_credits !== undefined ? staged.max_credits : null;
      }
      if (staged.variable_credits) {
        existing.variable_credits = staged.variable_credits;
      }
      if (staged.repeatable !== undefined) {
        existing.repeatable = Boolean(staged.repeatable);
        existing.max_repeat_credits = staged.max_repeat_credits !== undefined ? staged.max_repeat_credits : null;
      }

      // Discrete Corequisite & Prerequisite Schema
      if (Array.isArray(staged.strict_concurrent_coreqs)) {
        existing.strict_concurrent_coreqs = staged.strict_concurrent_coreqs;
      }
      if (Array.isArray(staged.prereq_or_coreqs)) {
        existing.prereq_or_coreqs = staged.prereq_or_coreqs;
      }
      if (Array.isArray(staged.prereqs) && staged.prereqs.length > 0) {
        existing.prereqs = staged.prereqs;
      }
      if (staged.prereq_display && typeof staged.prereq_display === 'string' && staged.prereq_display.trim()) {
        existing.prereq_display = staged.prereq_display.trim();
      }
      if (staged.prereq_logic) {
        existing.prereq_logic = staged.prereq_logic;
      }

      // Corequisite codes: preserve existing verified or union with discrete coreqs
      const mergedCoreqs = new Set(existing.coreq_codes || []);
      if (Array.isArray(staged.strict_concurrent_coreqs)) {
        staged.strict_concurrent_coreqs.forEach(c => mergedCoreqs.add(c));
      }
      if (Array.isArray(staged.prereq_or_coreqs)) {
        staged.prereq_or_coreqs.forEach(c => mergedCoreqs.add(c));
      }
      if (Array.isArray(staged.coreqs)) {
        staged.coreqs.forEach(c => mergedCoreqs.add(c));
      }
      existing.coreq_codes = Array.from(mergedCoreqs);

      if (Array.isArray(staged.grade_prereq_rules) && staged.grade_prereq_rules.length > 0) {
        existing.grade_prereq_rules = staged.grade_prereq_rules;
      }
      if (Array.isArray(staged.cross_listed_codes) && staged.cross_listed_codes.length > 0) {
        existing.cross_listed_codes = staged.cross_listed_codes;
      }

      // Offerings and session booleans
      if (Array.isArray(staged.offerings) && staged.offerings.length > 0) {
        existing.offerings = staged.offerings;
        existing.offered_sessions = deriveOfferedSessions(staged.offerings, existing.offered_sessions);
        const bools = deriveSessionBooleans(staged.offerings, existing.offered_sessions);
        Object.assign(existing, bools);
      } else if (staged.schedule_telemetry?.total_sections_observed === 0) {
        existing.offerings = [];
        existing.annual_session_availability = null;
      }

      // Modalities and Zero Section Handling
      if (staged.schedule_telemetry?.total_sections_observed === 0) {
        existing.modalities = ['On-Ground'];
        existing.annual_session_availability = null;
      } else if (Array.isArray(staged.modalities) && staged.modalities.length > 0) {
        existing.modalities = staged.modalities;
      } else if (staged.schedule_telemetry?.modalities?.length > 0) {
        existing.modalities = staged.schedule_telemetry.modalities;
      }

      // Append schedule_telemetry
      if (staged.schedule_telemetry) {
        existing.schedule_telemetry = staged.schedule_telemetry;
        if (staged.schedule_telemetry.total_sections_observed === 0) {
          existing.schedule_telemetry.modalities = ['On-Ground'];
        }
      }

      totalUpdated++;
    } else {
      // New course: Append to courses catalog
      const dept = staged.department || rawCode.split(' ')[0] || 'GEN';
      const num = staged.number || rawCode.split(' ')[1] || '';
      const offerings = Array.isArray(staged.offerings) ? staged.offerings : [];
      const offeredSessions = deriveOfferedSessions(offerings, staged.offered_sessions);
      const sessionBools = deriveSessionBooleans(offerings, offeredSessions);

      const newCourse = {
        code: rawCode,
        department: dept,
        number: num,
        title: staged.title || rawCode,
        credits: !isNaN(Number(staged.credits)) ? Number(staged.credits) : 3,
        level: Number(staged.level) || parseInt(num, 10) || 10000,
        description: staged.description || '',
        is_variable_credit: Boolean(staged.is_variable_credit),
        min_credits: staged.min_credits !== undefined ? staged.min_credits : null,
        max_credits: staged.max_credits !== undefined ? staged.max_credits : null,
        variable_credits: staged.variable_credits || null,
        repeatable: Boolean(staged.repeatable),
        max_repeat_credits: staged.max_repeat_credits !== undefined ? staged.max_repeat_credits : null,
        annual_session_availability: staged.annual_session_availability ?? null,
        fee_info: staged.fee_info || '$0',
        offered_sessions: offeredSessions,
        ...sessionBools,
        offerings: offerings,
        modalities: staged.schedule_telemetry?.total_sections_observed === 0
          ? ['On-Ground']
          : Array.isArray(staged.modalities)
          ? staged.modalities
          : staged.schedule_telemetry?.modalities || ['On-Ground', 'Online'],
        prereq_logic: staged.prereq_logic || null,
        prereq_display:
          staged.prereq_display ||
          (Array.isArray(staged.prereqs) && staged.prereqs.length > 0
            ? staged.prereqs.map(p => typeof p === 'string' ? p : p.code + (p.min_grade ? ` (${p.min_grade})` : '')).join(', ')
            : 'None'),
        strict_concurrent_coreqs: Array.isArray(staged.strict_concurrent_coreqs)
          ? staged.strict_concurrent_coreqs
          : [],
        prereq_or_coreqs: Array.isArray(staged.prereq_or_coreqs)
          ? staged.prereq_or_coreqs
          : [],
        prereqs: Array.isArray(staged.prereqs) ? staged.prereqs : [],
        coreq_codes: Array.from(new Set([
          ...(Array.isArray(staged.coreqs) ? staged.coreqs : staged.coreq_codes || []),
          ...(Array.isArray(staged.strict_concurrent_coreqs) ? staged.strict_concurrent_coreqs : []),
          ...(Array.isArray(staged.prereq_or_coreqs) ? staged.prereq_or_coreqs : [])
        ])),
        grade_prereq_rules: Array.isArray(staged.grade_prereq_rules)
          ? staged.grade_prereq_rules
          : [],
        cross_listed_codes: Array.isArray(staged.cross_listed_codes)
          ? staged.cross_listed_codes
          : [],
        legacy_substitutions: Array.isArray(staged.legacy_substitutions)
          ? staged.legacy_substitutions
          : [],
        math_placement_eligible: Boolean(staged.math_placement_eligible),
        verification_status: staged.verification_status || 'Verified',
        submitted_by: staged.submitted_by || 'system',
        pe_notes: Array.isArray(staged.pe_notes) ? staged.pe_notes : [],
        type: staged.type || 'concrete',
        schedule_telemetry: staged.schedule_telemetry || null
      };

      masterDb.courses.push(newCourse);
      existingMap.set(norm, { course: newCourse, index: masterDb.courses.length - 1 });
      totalAdded++;
    }
  }

  // Step 3: Integrity Validation
  // Verify every course referenced in verified degree programs exists in the merged catalog
  const missingByProgram = [];

  for (const prog of masterDb.programs) {
    const req = prog.requirements || {};
    const referenced = [];

    if (Array.isArray(req.major_core_courses)) {
      referenced.push(...req.major_core_courses);
    }
    if (Array.isArray(req.emphasis_courses)) {
      referenced.push(...req.emphasis_courses);
    }
    if (Array.isArray(req.math_courses)) {
      for (const m of req.math_courses) {
        if (typeof m === 'string') referenced.push(m);
        else if (m && m.code) referenced.push(m.code);
      }
    }
    if (Array.isArray(req.ge_courses)) {
      for (const g of req.ge_courses) {
        if (typeof g === 'string') referenced.push(g);
        else if (g && g.code) referenced.push(g.code);
      }
    }

    for (const refCode of referenced) {
      const normRef = normalizeCode(refCode);
      if (!existingMap.has(normRef)) {
        missingByProgram.push({ programId: prog.id, programName: prog.name, code: refCode });
      }
    }
  }

  if (missingByProgram.length > 0) {
    const errDetails = missingByProgram
      .map((m) => `[${m.programName}] missing ${m.code}`)
      .join('; ');
    throw new Error(`Integrity Validation Failed! Missing program courses: ${errDetails}`);
  }

  // Format masterDatabase.json with standard 2-space indentation
  if (!dryRun) {
    fs.writeFileSync(resolvedMaster, JSON.stringify(masterDb, null, 2) + '\n', 'utf8');
  }

  const finalSize = masterDb.courses.length;

  return {
    stagingFile: path.basename(resolvedStaging),
    totalBefore,
    totalUpdated,
    totalAdded,
    finalSize,
    dryRun,
    verifiedProgramsCount: masterDb.programs.length
  };
}

// CLI Execution Entry Point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  let stagingArg = null;
  let targetArg = null;
  let dryRunArg = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--staging=')) {
      stagingArg = arg.split('=')[1];
    } else if (arg === '--staging' && args[i + 1]) {
      stagingArg = args[++i];
    } else if (arg.startsWith('--target=')) {
      targetArg = arg.split('=')[1];
    } else if (arg === '--target' && args[i + 1]) {
      targetArg = args[++i];
    } else if (arg === '--dry-run') {
      dryRunArg = true;
    }
  }

  if (!stagingArg) {
    // Default fallback checks
    const candidatePrimary = path.resolve(__dirname, '../.tmp/courses_staging_all.json');
    const candidateA = path.resolve(__dirname, '../.tmp/courses_staging_all_2026.json');
    const candidateB = path.resolve(__dirname, '../.tmp/courses_staging_mth.json');
    if (fs.existsSync(candidatePrimary)) {
      stagingArg = candidatePrimary;
    } else if (fs.existsSync(candidateA)) {
      stagingArg = candidateA;
    } else if (fs.existsSync(candidateB)) {
      stagingArg = candidateB;
    } else {
      console.error('[ERROR] Please specify staging file via --staging=<path>');
      console.error('Example: node execution/merge_staged_courses.js --staging=.tmp/courses_staging_all_2026.json');
      process.exit(1);
    }
  }

  try {
    console.log('===============================================================');
    console.log(' Lindenwood Degree Planner — Deterministic Course Merge Pipeline');
    console.log('===============================================================');
    console.log(`Staging Source:  ${stagingArg}`);
    if (targetArg) console.log(`Target Database: ${targetArg}`);
    if (dryRunArg) console.log('Mode:            DRY RUN (no files modified)');
    console.log('');

    const summary = mergeStagedCourses({
      stagingPath: stagingArg,
      masterDbPath: targetArg || path.resolve(__dirname, '../src/data/masterDatabase.json'),
      dryRun: dryRunArg
    });

    console.log('[PASS] Staging file verified and successfully parsed.');
    console.log(`[PASS] Total courses before merge: ${summary.totalBefore}`);
    console.log(`[PASS] Total courses updated:      ${summary.totalUpdated}`);
    console.log(`[PASS] Total courses newly added:  ${summary.totalAdded}`);
    console.log(`[PASS] Final catalog size:         ${summary.finalSize}`);
    console.log(`[PASS] Integrity validation passed across all ${summary.verifiedProgramsCount} verified degree programs.`);
    console.log('');
    console.log(dryRunArg ? 'DRY RUN COMPLETE — Zero files modified.' : 'MERGE COMPLETE — masterDatabase.json updated with 2-space indentation.');
    console.log('===============================================================');
  } catch (err) {
    console.error('');
    console.error('[FATAL ERROR]', err.message);
    process.exit(1);
  }
}
