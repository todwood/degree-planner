#!/usr/bin/env node
/**
 * Deterministic Client-Side Parser Verification Suite (execution/test_parsers.js)
 *
 * Verifies:
 * 1. Benchmark 1 (Brandon Paz — StudentCourseSchedules (All Results).xlsx):
 *    - 78 total raw rows, 34 dropped noise rows, 44 valid rows after noise filter
 *    - 15 ignored unscheduled Future rows (46.0 cr)
 *    - 29 active unique courses (23 Complete + 2 TR + 4 Current)
 *    - 74.0 Completed Credits (68.0 LU + 6.0 TR), 10.0 Current Credits, 84.0 Total Earned+Enrolled Credits
 *    - 78.0 Lindenwood Residency Credits, 30.0 Upper-Level Credits (10 courses), 2 /HD Courses (6.0 cr)
 *
 * 2. Benchmark 2 (Fabiana Labrador — Three-Way Reconciliation):
 *    - Variant A: sub_Transcript - UnOfficial_landscape.pdf (792x612 Enrollment-Based)
 *    - Variant B: sub_UnofficialTranscript - Student Based_landscape.pdf (612x792 Student-Based)
 *    - Anthology XLSX: StudentCourseSchedules (All Results).xlsx
 *    - Asserts all 3 parsers yield the exact same 40 active courses (36 Complete + 4 Current),
 *      110.0 Completed Credits, 12.0 Current Credits, 122.0 Total Earned+Enrolled Credits,
 *      45.0 Upper-Level Credits (36.0 Earned + 9.0 Current across 15 courses),
 *      2 /HD Courses (6.0 cr: SOC10200, ENGL20101), and 3.75 Cumulative GPA (413.00 Quality Points).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAnthologySpreadsheet,
  parseTranscriptPdf,
  verifyAnthologySpreadsheet,
  verifyTranscriptText,
  extractTextFromPdf
} from '../src/engine/transcriptParser.js';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';

const masterDb = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'masterDatabase.json'), 'utf8')
);

function resolveSampleFile(candidates) {
  for (const rel of candidates) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) return abs;
  }
  throw new Error(`Could not locate sample file among candidates: ${candidates.join(', ')}`);
}

async function runVerificationSuite() {
  console.log('========================================================================');
  console.log(' DETERMINISTIC PARSER ENGINE VERIFICATION SUITE (execution/test_parsers.js)');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // BENCHMARK 1: Brandon Paz — StudentCourseSchedules (All Results).xlsx
  // ---------------------------------------------------------------------------
  const brandonXlsxPath = resolveSampleFile([
    '.tmp/samples/Brandon Paz/StudentCourseSchedules (All Results).xlsx',
    'StudentCourseSchedules (All Results).xlsx'
  ]);
  const brandonBuffer = fs.readFileSync(brandonXlsxPath);

  const brandonVerify = verifyAnthologySpreadsheet(brandonBuffer);
  assert.equal(brandonVerify.isValid, true, 'Brandon Paz XLSX must pass verification');
  assert.equal(brandonVerify.exact20ColumnMatch, true, 'Brandon Paz XLSX must match 20 Anthology headers');

  const b1 = parseAnthologySpreadsheet(brandonBuffer, 'xlsx');
  const s1 = b1.summary;

  console.log('[BENCHMARK 1] Brandon Paz — StudentCourseSchedules (All Results).xlsx');
  console.log(`  Total Raw Rows Scanned:             ${s1.totalRawRows}`);
  console.log(`  Dropped Meeting Sub-Table Rows:     ${s1.droppedNoiseRows}`);
  console.log(`  Valid Course Rows After Filter:     ${s1.validCourseRows}`);
  console.log(`  Ignored Unscheduled Future Rows:    ${s1.ignoredUnscheduledFutureRows} (${s1.ignoredUnscheduledFutureCredits.toFixed(1)} cr)`);
  console.log(`  Active Unique Courses:              ${s1.activeUniqueCourseCount} (${b1.completedCourses.length} Complete + ${b1.transferCourses.length} TR + ${b1.currentCourses.length} Current)`);
  console.log(`  Transfer Credits:                   ${s1.totalTransferCredits.toFixed(1)} cr (UNIV/LUL Waived: ${s1.univLulWaived})`);
  console.log(`  Completed Lindenwood Credits:       ${s1.totalCompletedLindenwoodCredits.toFixed(1)} cr`);
  console.log(`  Total Completed Credits:            ${s1.totalCompletedCredits.toFixed(1)} cr`);
  console.log(`  Total Current Credits:              ${s1.totalCurrentCredits.toFixed(1)} cr`);
  console.log(`  Total Earned + Enrolled Credits:    ${s1.totalEarnedAndEnrolledCredits.toFixed(1)} cr`);
  console.log(`  Lindenwood Residency Credits:       ${s1.lindenwoodResidencyCredits.toFixed(1)} cr`);
  console.log(`  Upper-Level (30000+) Credits:       ${s1.upperLevelCredits.toFixed(1)} cr (${s1.upperLevelCourseCount} courses: ${s1.upperLevelCodes.sort().join(', ')})`);
  console.log(`  Human Diversity (/HD) Courses:      ${s1.hdCourseCount} courses / ${s1.hdCredits.toFixed(1)} cr (${s1.hdCodes.sort().join(', ')})`);
  console.log(`  Cumulative GPA:                     ${s1.cumulativeGpa.toFixed(2)} (${s1.totalQualityPoints.toFixed(2)} Quality Points)`);
  console.log(`  Detected Primary Major:             ${b1.studentMetadata.major} (Catalog Year: ${b1.studentMetadata.catalogYear})`);
  console.log(`  Declared Minors (Area of Study):    ${b1.studentMetadata.declaredMinors.join('; ')}`);

  assert.equal(s1.totalRawRows, 78);
  assert.equal(s1.droppedNoiseRows, 34);
  assert.equal(s1.validCourseRows, 44);
  assert.equal(s1.ignoredUnscheduledFutureRows, 15);
  assert.equal(s1.ignoredUnscheduledFutureCredits, 46.0);
  assert.equal(s1.activeUniqueCourseCount, 29);
  assert.equal(b1.completedCourses.length, 23);
  assert.equal(b1.transferCourses.length, 2);
  assert.equal(b1.currentCourses.length, 4);
  assert.equal(s1.totalTransferCredits, 6.0);
  assert.equal(s1.univLulWaived, true);
  assert.equal(s1.totalCompletedLindenwoodCredits, 68.0);
  assert.equal(s1.totalCompletedCredits, 74.0);
  assert.equal(s1.totalCurrentCredits, 10.0);
  assert.equal(s1.totalEarnedAndEnrolledCredits, 84.0);
  assert.equal(s1.lindenwoodResidencyCredits, 78.0);
  assert.equal(s1.upperLevelCourseCount, 10);
  assert.equal(s1.upperLevelCredits, 30.0);
  assert.equal(s1.upperLevelCreditsNeeded, 12.0);
  assert.equal(s1.hdCourseCount, 2);
  assert.equal(s1.hdCredits, 6.0);
  assert.equal(s1.hdSatisfied, true);
  assert.equal(s1.cumulativeGpa, 3.91);
  console.log('  --> [PASS] Benchmark 1 assertions verified 100%.\n');

  // ---------------------------------------------------------------------------
  // BENCHMARK 2: Fabiana Labrador — Three-Way Verification (Variant A PDF vs Variant B PDF vs XLSX)
  // ---------------------------------------------------------------------------
  const fabPdfAPath = resolveSampleFile([
    '.tmp/samples/Fabiana Labrador/sub_Transcript - UnOfficial_landscape.pdf',
    'sub_Transcript - UnOfficial_landscape.pdf'
  ]);
  const fabPdfBPath = resolveSampleFile([
    '.tmp/samples/Fabiana Labrador/sub_UnofficialTranscript - Student Based_landscape.pdf',
    'sub_UnofficialTranscript - Student Based_landscape.pdf'
  ]);
  const fabXlsxPath = resolveSampleFile([
    '.tmp/samples/Fabiana Labrador/StudentCourseSchedules (All Results).xlsx',
    '.tmp/samples/Fabiana Labrador/StudentCourseSchedules (All Results)_2.xlsx',
    'StudentCourseSchedules (All Results)_2.xlsx'
  ]);

  const fabPdfABuf = fs.readFileSync(fabPdfAPath);
  const fabPdfBBuf = fs.readFileSync(fabPdfBPath);
  const fabXlsxBuf = fs.readFileSync(fabXlsxPath);

  const pdfAVerify = verifyTranscriptText(await extractTextFromPdf(fabPdfABuf));
  const pdfBVerify = verifyTranscriptText(await extractTextFromPdf(fabPdfBBuf));
  const fabXlsxVerify = verifyAnthologySpreadsheet(fabXlsxBuf);
  assert.equal(pdfAVerify.isValid, true, 'Fabiana Variant A PDF must pass verification');
  assert.equal(pdfBVerify.isValid, true, 'Fabiana Variant B PDF must pass verification');
  assert.equal(fabXlsxVerify.isValid, true, 'Fabiana XLSX must pass verification');

  const parsedPdfA = await parseTranscriptPdf(fabPdfABuf, { masterDb });
  const parsedPdfB = await parseTranscriptPdf(fabPdfBBuf, { masterDb });
  const parsedXlsx = parseAnthologySpreadsheet(fabXlsxBuf, 'xlsx', { masterDb });

  console.log('[BENCHMARK 2] Fabiana Labrador — Three-Way Reconciliation (Variant A PDF vs Variant B PDF vs XLSX)');

  const sources = [
    { label: 'Variant A (Enrollment-Based PDF)', data: parsedPdfA },
    { label: 'Variant B (Student-Based PDF)   ', data: parsedPdfB },
    { label: 'Anthology Schedule (.xlsx)      ', data: parsedXlsx }
  ];

  for (const src of sources) {
    const s = src.data.summary;
    const m = src.data.studentMetadata;
    const currCodes = src.data.currentCourses.map((c) => c.compactCode).sort().join(', ');
    const hdCodes = [...s.hdCodes].sort().join(', ');
    console.log(`  * ${src.label}:`);
    console.log(`      Student Name & ID:         ${m.student_name || '(N/A in XLSX)'} (${m.student_id || 'N/A'}) | DOB: ${m.dob || 'N/A'} | Catalog Year: ${m.catalogYear}`);
    console.log(`      Primary Program:           ${m.program} | Concentrations: ${(m.concentrations || []).join('; ') || '(Inferred)'}`);
    console.log(`      Active Courses:            ${s.activeUniqueCourseCount} (${src.data.completedCourses.length} Complete + ${src.data.currentCourses.length} Current)`);
    console.log(`      Completed Credits:         ${s.totalCompletedCredits.toFixed(1)} cr`);
    console.log(`      Current Credits:           ${s.totalCurrentCredits.toFixed(1)} cr (${currCodes})`);
    console.log(`      Total Earned + Enrolled:   ${s.totalEarnedAndEnrolledCredits.toFixed(1)} cr (Residency: ${s.lindenwoodResidencyCredits.toFixed(1)} cr)`);
    console.log(`      Upper-Level (30000+) Cr:   ${s.upperLevelEarnedCredits.toFixed(1)} cr Earned + ${s.upperLevelCurrentCredits.toFixed(1)} cr Current = ${s.upperLevelCredits.toFixed(1)} cr (${s.upperLevelCourseCount} courses)`);
    console.log(`      Human Diversity (/HD):     ${s.hdCourseCount} courses / ${s.hdCredits.toFixed(1)} cr (${hdCodes})`);
    console.log(`      Cumulative GPA:            ${s.cumulativeGpa.toFixed(2)} (${s.totalQualityPoints.toFixed(2)} Quality Points)`);
  }

  // Assert exact reconciliation across all 3 sources
  for (const src of sources) {
    const s = src.data.summary;
    assert.equal(s.activeUniqueCourseCount, 40, `${src.label}: activeUniqueCourseCount must be 40`);
    assert.equal(src.data.completedCourses.length, 36, `${src.label}: completedCourses count must be 36`);
    assert.equal(src.data.currentCourses.length, 4, `${src.label}: currentCourses count must be 4`);
    assert.equal(s.totalCompletedCredits, 110.0, `${src.label}: totalCompletedCredits must be 110.0`);
    assert.equal(s.totalCurrentCredits, 12.0, `${src.label}: totalCurrentCredits must be 12.0`);
    assert.equal(s.totalEarnedAndEnrolledCredits, 122.0, `${src.label}: totalEarnedAndEnrolledCredits must be 122.0`);
    assert.equal(s.lindenwoodResidencyCredits, 122.0, `${src.label}: lindenwoodResidencyCredits must be 122.0`);
    assert.equal(s.upperLevelCourseCount, 15, `${src.label}: upperLevelCourseCount must be 15`);
    assert.equal(s.upperLevelEarnedCredits, 36.0, `${src.label}: upperLevelEarnedCredits must be 36.0`);
    assert.equal(s.upperLevelCurrentCredits, 9.0, `${src.label}: upperLevelCurrentCredits must be 9.0`);
    assert.equal(s.upperLevelCredits, 45.0, `${src.label}: upperLevelCredits must be 45.0`);
    assert.equal(s.hdCourseCount, 2, `${src.label}: hdCourseCount must be 2`);
    assert.equal(s.hdCredits, 6.0, `${src.label}: hdCredits must be 6.0`);
    assert.deepEqual([...s.hdCodes].sort(), ['ENGL20101', 'SOC10200']);
    assert.deepEqual(
      src.data.currentCourses.map((c) => c.compactCode).sort(),
      ['IIT34020', 'PHRL21001', 'SPMGT37040', 'SPMGT37060']
    );
    assert.equal(s.cumulativeGpa, 3.75, `${src.label}: cumulativeGpa must be 3.75`);
    assert.equal(s.totalQualityPoints, 413.0, `${src.label}: totalQualityPoints must be 413.00`);
    assert.equal(src.data.studentMetadata.catalogYear, '2023-2024');
  }

  // Assert XLSX noise filter metrics for Fabiana Labrador (73 noise rows & 22 unscheduled Future rows)
  assert.equal(parsedXlsx.summary.droppedNoiseRows, 73);
  assert.equal(parsedXlsx.summary.ignoredUnscheduledFutureRows, 22);

  // Assert PDF metadata extraction on Variant A & Variant B
  assert.equal(parsedPdfA.studentMetadata.student_name, 'Fabiana Labrador');
  assert.equal(parsedPdfA.studentMetadata.student_id, 'A003006937');
  assert.equal(parsedPdfA.studentMetadata.dob, '08/2006');
  assert.equal(parsedPdfA.studentMetadata.original_start_date, '8/21/2023');
  assert.equal(parsedPdfA.studentMetadata.transcript_date, '10/22/2026');
  assert.equal(parsedPdfA.studentMetadata.program, 'Information Technology');
  assert.equal(parsedPdfA.studentMetadata.enrollment_number, 'LA23063168');
  assert.equal(parsedPdfA.studentMetadata.status, 'Active');
  assert.deepEqual(parsedPdfA.studentMetadata.concentrations, [
    'Applications Development Emphasis',
    'Sport Management Minor'
  ]);

  assert.equal(parsedPdfB.studentMetadata.student_name, 'Fabiana Labrador');
  assert.equal(parsedPdfB.studentMetadata.student_id, 'A003006937');
  assert.equal(parsedPdfB.studentMetadata.dob, '08/2006');
  assert.equal(parsedPdfB.studentMetadata.transcript_date, '10/22/2026');
  assert.equal(parsedPdfB.studentMetadata.program, 'Information Technology');

  // Assert 100% identical course sets, credits, grades, and states across Variant A, Variant B, and XLSX
  const getCanonicalCourseMap = (parsed) =>
    new Map(
      parsed.validCourses
        .slice()
        .sort((a, b) => a.compactCode.localeCompare(b.compactCode))
        .map((c) => [
          c.compactCode,
          {
            credits: c.credits,
            grade: c.grade,
            state: c.state,
            hasHDAttribute: c.hasHDAttribute,
            geCategory: c.geCategory
          }
        ])
    );

  const mapA = getCanonicalCourseMap(parsedPdfA);
  const mapB = getCanonicalCourseMap(parsedPdfB);
  const mapX = getCanonicalCourseMap(parsedXlsx);

  assert.deepEqual([...mapA.keys()], [...mapB.keys()], 'Variant A and Variant B course keys must be 100% identical');
  assert.deepEqual([...mapA.keys()], [...mapX.keys()], 'Variant A and XLSX course keys must be 100% identical');
  assert.deepEqual([...mapA.entries()], [...mapB.entries()], 'Variant A and Variant B course records must be 100% identical');
  assert.deepEqual([...mapA.entries()], [...mapX.entries()], 'Variant A and XLSX course records must be 100% identical');

  // Verify remaining IT-Applications Development Major courses across all 3 files
  for (const src of sources) {
    const audit = runWaterfallAudit(src.data, 'it_app_dev_bs_2026', masterDb);
    const unfulfilledMajor = [
      ...audit.majorRequirements.filter((r) => !r.fulfilled),
      ...audit.emphasisRequirements.filter((r) => !r.fulfilled)
    ]
      .map((r) => r.compactCode)
      .sort();
    assert.deepEqual(unfulfilledMajor, ['ICS43200', 'IIT37800', 'IIT47800', 'IIT48900']);
  }

  console.log('  --> [PASS] Benchmark 2 Three-Way Reconciliation assertions verified 100%.\n');
  console.log('========================================================================');
  console.log(' ALL BENCHMARK ASSERTIONS PASSED (100% DETERMINISTIC RECONCILIATION)');
  console.log('========================================================================');
}

runVerificationSuite().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
