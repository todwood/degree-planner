#!/usr/bin/env node
/**
 * Single Student Calibration & Verification Test Script (execution/test_single_student.js)
 * Target: Fabiana Labrador (.tmp/samples/Fabiana Labrador/ & .tmp/samples/student info.txt)
 *
 * Requirements per task instructions:
 * 1. Both PDF layouts (Variant A: Enrollment-Based 792x612 pt landscape vs. Variant B: Student-Based 612x792 pt 2-column portrait)
 *    extract identical active course codes, grades, and credits.
 * 2. PDF Completed Credits equal Anthology Completed Credits.
 * 3. Student Name, Student ID, GPA, and Earned Credits match the values in .tmp/samples/student info.txt.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAnthologySpreadsheet,
  parseTranscriptPdf,
  parseStudentInfoFile,
  verifyAnthologySpreadsheet,
  verifyTranscriptText,
  extractTextFromPdf
} from '../src/engine/transcriptParser.js';

// Load Master Database for credit inference & course metadata
const masterDb = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'masterDatabase.json'), 'utf8')
);

// File paths
const sampleDir = path.join(process.cwd(), '.tmp', 'samples', 'Fabiana Labrador');
const studentInfoPath = path.join(process.cwd(), '.tmp', 'samples', 'student info.txt');

const varAPath = path.join(sampleDir, 'sub_Transcript - UnOfficial_landscape.pdf');
const varBPath = path.join(sampleDir, 'sub_UnofficialTranscript - Student Based_landscape.pdf');
const xlsxPath = path.join(sampleDir, 'StudentCourseSchedules (All Results).xlsx');

async function testSingleStudent() {
  console.log('========================================================================');
  console.log(' SINGLE STUDENT CALIBRATION TEST: FABIANA LABRADOR');
  console.log('========================================================================\n');

  // 1. Read and parse student info.txt
  console.log('--> Loading ground truth from .tmp/samples/student info.txt...');
  assert.ok(fs.existsSync(studentInfoPath), 'student info.txt must exist');
  const studentInfoRaw = fs.readFileSync(studentInfoPath, 'utf8');
  const targetStudentId = 'A003006937';
  const groundTruth = parseStudentInfoFile(studentInfoRaw, targetStudentId);

  assert.ok(groundTruth, `Must find student with ID ${targetStudentId} in student info.txt`);
  console.log('    Ground Truth Student Info:');
  console.log(`      Full Name:      ${groundTruth.name}`);
  console.log(`      Student ID:     ${groundTruth.studentId}`);
  console.log(`      Status:         ${groundTruth.status}`);
  console.log(`      Catalog Year:   ${groundTruth.catalogYear}`);
  console.log(`      Cumulative GPA: ${groundTruth.gpa}`);
  console.log(`      Credits Earned: ${groundTruth.creditsEarned.toFixed(2)} cr`);
  console.log(`      Program:        ${groundTruth.programVersion} (${groundTruth.programCode})`);
  console.log(`      Advisor:        ${groundTruth.advisor}`);
  console.log(`      Email:          ${groundTruth.email}\n`);

  // 2. Read student sample files
  console.log('--> Reading Fabiana Labrador sample files...');
  assert.ok(fs.existsSync(varAPath), 'Variant A PDF must exist');
  assert.ok(fs.existsSync(varBPath), 'Variant B PDF must exist');
  assert.ok(fs.existsSync(xlsxPath), 'Anthology XLSX must exist');

  const varABuf = fs.readFileSync(varAPath);
  const varBBuf = fs.readFileSync(varBPath);
  const xlsxBuf = fs.readFileSync(xlsxPath);

  // Verification checks for file formats
  const verifyA = verifyTranscriptText(await extractTextFromPdf(varABuf));
  const verifyB = verifyTranscriptText(await extractTextFromPdf(varBBuf));
  const verifyXlsx = verifyAnthologySpreadsheet(xlsxBuf);

  assert.equal(verifyA.isValid, true, 'Variant A PDF text must be valid transcript format');
  assert.equal(verifyB.isValid, true, 'Variant B PDF text must be valid transcript format');
  assert.equal(verifyXlsx.isValid, true, 'Anthology XLSX must be valid format');

  // 3. Parse all 3 records deterministically
  console.log('--> Parsing Variant A (Enrollment-Based PDF: 792x612 pt landscape)...');
  const parsedPdfA = await parseTranscriptPdf(varABuf, { masterDb });

  console.log('--> Parsing Variant B (Student-Based PDF: 612x792 pt portrait)...');
  const parsedPdfB = await parseTranscriptPdf(varBBuf, { masterDb });

  console.log('--> Parsing Anthology Course Schedules (.xlsx)...');
  const parsedXlsx = parseAnthologySpreadsheet(xlsxBuf, 'xlsx', { masterDb });

  // 4. Detailed extracted numbers report
  console.log('\n========================================================================');
  console.log(' EXTRACTION RESULTS SUMMARY');
  console.log('========================================================================');

  const results = [
    { label: 'Variant A (Enrollment-Based PDF)', data: parsedPdfA },
    { label: 'Variant B (Student-Based PDF)   ', data: parsedPdfB },
    { label: 'Anthology Schedule (.xlsx)      ', data: parsedXlsx }
  ];

  for (const r of results) {
    const s = r.data.summary;
    const m = r.data.studentMetadata;
    const currCodes = r.data.currentCourses.map((c) => c.compactCode).sort().join(', ');
    const hdCodes = [...s.hdCodes].sort().join(', ');
    const concStr = (m.concentrations || []).join('; ') || '(Inferred)';

    console.log(`\n[${r.label}]`);
    console.log(`  Student Name & ID:         ${m.student_name || '(N/A in XLSX)'} (${m.student_id || 'N/A'})`);
    console.log(`  DOB & Original Start Date: ${m.dob || 'N/A'} | Start: ${m.original_start_date || 'N/A'}`);
    console.log(`  Inferred Catalog Year:     ${m.catalogYear}`);
    console.log(`  Primary Major:             ${m.program}`);
    console.log(`  Concentrations / Minors:   ${concStr}`);
    console.log(`  Active Unique Courses:     ${s.activeUniqueCourseCount} (${r.data.completedCourses.length} Complete + ${r.data.currentCourses.length} Current)`);
    console.log(`  Completed Credits:         ${s.totalCompletedCredits.toFixed(1)} cr`);
    console.log(`  Current (In-Progress) Cr:  ${s.totalCurrentCredits.toFixed(1)} cr (${currCodes})`);
    console.log(`  Total Earned + Enrolled:   ${s.totalEarnedAndEnrolledCredits.toFixed(1)} cr`);
    console.log(`  Institutional Residency:   ${s.lindenwoodResidencyCredits.toFixed(1)} cr`);
    console.log(`  Upper-Level (30000+) Cr:   ${s.upperLevelEarnedCredits.toFixed(1)} cr Earned + ${s.upperLevelCurrentCredits.toFixed(1)} cr Current = ${s.upperLevelCredits.toFixed(1)} cr (${s.upperLevelCourseCount} courses)`);
    console.log(`  Human Diversity (/HD):     ${s.hdCourseCount} courses / ${s.hdCredits.toFixed(1)} cr (${hdCodes})`);
    console.log(`  Cumulative GPA:            ${s.cumulativeGpa.toFixed(2)} (${s.totalQualityPoints.toFixed(2)} Quality Points)`);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT 1: Both PDF layouts extract identical active course codes, grades, and credits
  // ---------------------------------------------------------------------------
  console.log('\n--> Verifying Requirement 1: Variant A vs Variant B PDF equivalence...');
  const codesA = parsedPdfA.validCourses.map((c) => c.compactCode).sort();
  const codesB = parsedPdfB.validCourses.map((c) => c.compactCode).sort();

  assert.equal(codesA.length, 40, 'Variant A must extract exactly 40 active courses');
  assert.equal(codesB.length, 40, 'Variant B must extract exactly 40 active courses');
  assert.deepEqual(codesA, codesB, 'Variant A and Variant B must extract the exact same 40 active course codes');

  const mapA = new Map(parsedPdfA.validCourses.map((c) => [c.compactCode, c]));
  const mapB = new Map(parsedPdfB.validCourses.map((c) => [c.compactCode, c]));

  for (const code of codesA) {
    const courseA = mapA.get(code);
    const courseB = mapB.get(code);

    assert.equal(
      courseA.grade,
      courseB.grade,
      `Course ${code} grade mismatch: Variant A has '${courseA.grade}', Variant B has '${courseB.grade}'`
    );
    assert.equal(
      courseA.credits,
      courseB.credits,
      `Course ${code} credit mismatch: Variant A has ${courseA.credits}, Variant B has ${courseB.credits}`
    );
    assert.equal(
      courseA.state,
      courseB.state,
      `Course ${code} state mismatch: Variant A has ${courseA.state}, Variant B has ${courseB.state}`
    );
  }
  console.log('    [PASS] Both PDF layouts extract 100% identical active course codes, grades, and credits.');

  // ---------------------------------------------------------------------------
  // REQUIREMENT 2: PDF Completed Credits equal Anthology Completed Credits
  // ---------------------------------------------------------------------------
  console.log('\n--> Verifying Requirement 2: PDF Completed Credits == Anthology Completed Credits...');
  const pdfACompletedCr = parsedPdfA.summary.totalCompletedCredits;
  const pdfBCompletedCr = parsedPdfB.summary.totalCompletedCredits;
  const xlsxCompletedCr = parsedXlsx.summary.totalCompletedCredits;

  assert.equal(pdfACompletedCr, xlsxCompletedCr, `Variant A (${pdfACompletedCr}) must equal Anthology XLSX (${xlsxCompletedCr})`);
  assert.equal(pdfBCompletedCr, xlsxCompletedCr, `Variant B (${pdfBCompletedCr}) must equal Anthology XLSX (${xlsxCompletedCr})`);
  assert.equal(pdfACompletedCr, 110.0, 'Completed Credits must equal 110.0');

  // Current credits check
  assert.equal(parsedPdfA.summary.totalCurrentCredits, parsedXlsx.summary.totalCurrentCredits);
  assert.equal(parsedPdfB.summary.totalCurrentCredits, parsedXlsx.summary.totalCurrentCredits);
  assert.equal(parsedPdfA.summary.totalCurrentCredits, 12.0);

  // Active courses check
  assert.equal(parsedPdfA.summary.activeUniqueCourseCount, parsedXlsx.summary.activeUniqueCourseCount);
  assert.equal(parsedPdfA.summary.activeUniqueCourseCount, 40);

  const xlsxCodes = parsedXlsx.validCourses.map((c) => c.compactCode).sort();
  assert.deepEqual(codesA, xlsxCodes, 'All 3 sources must have the exact same 40 active course codes');
  console.log('    [PASS] PDF Completed Credits (110.0 cr) equal Anthology Completed Credits (110.0 cr) exactly.');

  // ---------------------------------------------------------------------------
  // REQUIREMENT 3: Student Name, Student ID, GPA, and Earned Credits match student info.txt
  // ---------------------------------------------------------------------------
  console.log('\n--> Verifying Requirement 3: Matching student info.txt ground truth...');
  const expectedName = groundTruth.name; // "Fabiana Labrador"
  const expectedId = groundTruth.studentId; // "A003006937"
  const expectedGpa = parseFloat(groundTruth.gpa); // 3.75
  const expectedCredits = groundTruth.creditsEarned; // 110.00

  // Check Variant A PDF
  assert.equal(parsedPdfA.studentMetadata.student_name, expectedName, `Variant A name '${parsedPdfA.studentMetadata.student_name}' must match '${expectedName}'`);
  assert.equal(parsedPdfA.studentMetadata.student_id, expectedId, `Variant A ID '${parsedPdfA.studentMetadata.student_id}' must match '${expectedId}'`);
  assert.equal(parsedPdfA.summary.cumulativeGpa, expectedGpa, `Variant A GPA ${parsedPdfA.summary.cumulativeGpa} must match ${expectedGpa}`);
  assert.equal(parsedPdfA.summary.totalCompletedCredits, expectedCredits, `Variant A completed credits ${parsedPdfA.summary.totalCompletedCredits} must match ${expectedCredits}`);

  // Check Variant B PDF
  assert.equal(parsedPdfB.studentMetadata.student_name, expectedName, `Variant B name '${parsedPdfB.studentMetadata.student_name}' must match '${expectedName}'`);
  assert.equal(parsedPdfB.studentMetadata.student_id, expectedId, `Variant B ID '${parsedPdfB.studentMetadata.student_id}' must match '${expectedId}'`);
  assert.equal(parsedPdfB.summary.cumulativeGpa, expectedGpa, `Variant B GPA ${parsedPdfB.summary.cumulativeGpa} must match ${expectedGpa}`);
  assert.equal(parsedPdfB.summary.totalCompletedCredits, expectedCredits, `Variant B completed credits ${parsedPdfB.summary.totalCompletedCredits} must match ${expectedCredits}`);

  // Check Anthology XLSX GPA & Credits
  assert.equal(parsedXlsx.summary.cumulativeGpa, expectedGpa, `Anthology GPA ${parsedXlsx.summary.cumulativeGpa} must match ${expectedGpa}`);
  assert.equal(parsedXlsx.summary.totalCompletedCredits, expectedCredits, `Anthology completed credits ${parsedXlsx.summary.totalCompletedCredits} must match ${expectedCredits}`);

  console.log('    [PASS] Student Name (Fabiana Labrador), ID (A003006937), GPA (3.75), and Earned Credits (110.00 cr) match student info.txt with 100% precision.');

  console.log('\n========================================================================');
  console.log(' ALL VERIFICATION CHECKS PASSED FOR FABIANA LABRADOR (100% ACCURACY)');
  console.log('========================================================================\n');
}

testSingleStudent().catch((err) => {
  console.error('\n[FATAL ERROR] Single student calibration test failed:', err);
  process.exit(1);
});
