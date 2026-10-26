import fs from 'fs';
import path from 'path';
import {
  verifyAnthologySpreadsheet,
  parseAnthologySpreadsheet,
  verifyTranscriptText,
  parseTranscriptText,
  verifyDocumentCurrency,
  parseCombinedStudentRecords,
  extractSpatialTranscriptFromPdf,
  parseTranscriptPdf
} from '../src/engine/transcriptParser.js';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';
import { generateOptimalSchedule } from '../src/engine/scheduler.js';

const masterDb = JSON.parse(fs.readFileSync('src/data/masterDatabase.json', 'utf8'));

// 1. User provided Anthology CSV
const fakeAnthologyCsv = `Course Code,Course Name,Published Code,Section,Term,Course Status,Letter Grade,Start Date,Instructor,Credits,Hours,Campus,Enroll Status Credits,Enroll Status Hours,Area of Study,Payment Period,Delivery Method,Points,SPE Progression,Enrollment
IIT22000-23,Hardware and Operating Systems,IIT22000,OL21,FALL_II_26_8W,Scheduled,,2026-10-19,Leonard Tocco,3,0,MAIN Campus,3,0,,,Online,0,,INTECHBS/Information Technology BS/ATT
SOC22000,Social Problems (GE-SocSci/HD),SOC22000,OL22,FALL_II_26_8W,Current,,2026-10-19,Sarah Foley,3,0,MAIN Campus,3,0,,,Online,0,,INTECHBS/Information Technology BS/ATT
HIST11200,US History: New Republic to World Power (GE-HC:USHisGov),HIST11200,OL11,FALL_I_26_8W,Complete,A,2026-08-24,Joshua Koenig,3,0,MAIN Campus,3,0,,,Online,4,,INTECHBS/Information Technology BS/ATT
ICS21300,Foundations of Information Technology,ICS21300,OL11,FALL_I_26_8W,Complete,A,2026-08-24,David Hood,3,0,MAIN Campus,3,0,,,Online,4,,INTECHBS/Information Technology BS/ATT
CCJ30000,Policing in America,CCJ30000,,TRANSFER_TERM,Complete,TR-B,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ELECT10000,Free Elective 10000 Level,ELECT10000,,TRANSFER_TERM,Complete,TR-B,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ENGL15000,Composition I (GE-Comm),ENGL15000,,TRANSFER_TERM,Complete,TR-B,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ENGL17000,Composition II (GE-Comm),ENGL17000,,TRANSFER_TERM,Complete,TR-C,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
GE11013,GE-Natural Science (GE-NatSciLec)                                          ,GE11013,,TRANSFER_TERM,Complete,TR-D,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ICS21400,Foundations of Networking,ICS21400,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ICS31000-23,Foundations of Cybersecurity,ICS31000,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT21500-23,Programming Logic and Design,IIT21500,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT33500-23,Blockchain Technology for Business,IIT33500,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT35100-23,Database Analysis and Design Concepts,IIT35100,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT48100-23,Project Management in Information Technology,IIT48100,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
MTH11000,Intermediate Algebra,MTH11000,,TRANSFER_TERM,Complete,TR-A,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
SOC10200,Basic Concepts of Sociology (GE-SocSci/HD),SOC10200,,TRANSFER_TERM,Complete,TR-C,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
UNIV10100,First-Year Seminar,UNIV10100,,TRANSFER_TERM,Complete,TR-B,,,1,0,,1,0,,,,0,,INTECHBS/Information Technology BS/ATT`;

// 2. User provided Transcript OCR/Text
const fakeTranscriptText = `Date: 10/22/2026 Lindenwood University Page 1 of 1
Unofficial Transcript
209 S. Kingshighway
St Charles, MO 63301
https://www.lindenwood.edu

Student: Ariyeona Jones-Hadley Student ID: A003050742 DOB:10/1995 Original Start Date: 8/24/2026 Student GPA: 4.000000
Program: Information Technology
Enrollment #: JO26083172 Status: Active
Start Date: 8/24/2026
Term: TRANSFER_TERM Transfer Term 1/02/1900 - 1/02/1900
Course Code Course Description Credits Attempted Credits Earned Quality Points Grade
Transferred from LINCOLN UNIVERSITY - 820 CHESTNUT STREET JEFFERSON CITY MO 65101 United States
MTH11000 Intermediate Algebra 3.00 3.00 0.00 TR-A
UNIV10100 First-Year Seminar 1.00 1.00 0.00 TR-B
SOC10200 Basic Concepts of Sociology (GE-SocSci/HD) 3.00 3.00 0.00 TR-C
ENGL15000 Composition I (GE-Comm) 3.00 3.00 0.00 TR-B
GE11013 GE-Natural Science (GE-NatSciLec) 3.00 3.00 0.00 TR-D
ENGL17000 Composition II (GE-Comm) 3.00 3.00 0.00 TR-C
ELECT10000 Free Elective 10000 Level 3.00 3.00 0.00 TR-B
CCJ30000 Policing in America 3.00 3.00 0.00 TR-B
22.00 22.00 0.00
Term GPA: 0.00 Cum GPA: 0.00
Term: FALL_26 Fall 26 8/24/2026 - 12/11/2026
Course Code Course Description Credits Attempted Credits Earned Quality Points Grade
ICS21300 Foundations of Information Technology 3.00 3.00 12.00 A
HIST11200 US History: New Republic to World Power (GE-HC:USHisGov) 3.00 3.00 12.00 A
SOC22000 Social Problems (GE-SocSci/HD) 0.00 0.00 0.00
6.00 6.00 24.00
Term GPA: 4.00 Cum GPA: 4.00
Information Technology GPA: 4.00 28.00 28.00
Concentration(s): Applications Development Emphasis
Additional GPAs
Undergraduate Cumulative GPA: 4.00 Quality Points: 24.00 Quality Units: 6.00 Units Attempted: 6.00 Units Earned: 6.00
*** End of Transcript ***`;

async function runTests() {
  console.log('========================================================================');
  console.log(' TESTING VERIFICATION & PARSING PROCESS ON ATTACHED STUDENT DATA');
  console.log(' Student: Ariyeona Jones-Hadley (A003050742) — Information Technology');
  console.log('========================================================================\n');

  // --- PART 1: TEST ANTHOLOGY CSV VERIFICATION & PARSING ---
  console.log('--- 1. Testing Anthology CSV Verification & Parser ---');
  const csvBuffer = Buffer.from(fakeAnthologyCsv, 'utf8');
  const vCsv = verifyAnthologySpreadsheet(csvBuffer);
  console.log('verifyAnthologySpreadsheet result:');
  console.log('  isValid:', vCsv.isValid);
  console.log('  exact20ColumnMatch:', vCsv.exact20ColumnMatch);
  console.log('  detectedHeaders count:', vCsv.detectedHeaders?.length);
  console.log('  missingEssentialColumns:', vCsv.missingEssentialColumns);

  const parsedCsv = parseAnthologySpreadsheet(csvBuffer, 'csv', { masterDb });
  const sCsv = parsedCsv.summary;
  const mCsv = parsedCsv.studentMetadata;
  console.log('\nparseAnthologySpreadsheet result:');
  console.log('  Active Unique Courses:', sCsv.activeUniqueCourseCount);
  console.log('  Completed Courses:', parsedCsv.completedCourses.length);
  console.log('  Transfer Courses:', parsedCsv.transferCourses.length);
  console.log('  Current Courses:', parsedCsv.currentCourses.length, `(${parsedCsv.currentCourses.map(c => c.compactCode + ' ' + c.state).join(', ')})`);
  console.log('  Ignored Unscheduled Future Rows:', sCsv.ignoredUnscheduledFutureRows);
  console.log('  Transfer Credits:', sCsv.totalTransferCredits);
  console.log('  Completed Credits:', sCsv.totalCompletedCredits);
  console.log('  Current Credits:', sCsv.totalCurrentCredits);
  console.log('  Total Earned + Enrolled Credits:', sCsv.totalEarnedAndEnrolledCredits);
  console.log('  Cumulative GPA:', sCsv.cumulativeGpa);
  console.log('  Detected Major:', mCsv.major);

  const currCsv = verifyDocumentCurrency(parsedCsv, 'Anthology', { referenceDate: '2026-10-23' });
  console.log('\nverifyDocumentCurrency (Anthology):');
  console.log('  isCurrent:', currCsv.isCurrent);
  console.log('  isExempt:', currCsv.isExempt);
  console.log('  currentSemester:', currCsv.currentSemester);
  console.log('  currentCoursesCount:', currCsv.currentCoursesCount);

  // --- PART 2: TEST TRANSCRIPT TEXT VERIFICATION & PARSING ---
  console.log('\n--- 2. Testing Unofficial Transcript Text Verification & Parser ---');
  const vTranscript = verifyTranscriptText(fakeTranscriptText);
  console.log('verifyTranscriptText result:');
  console.log('  isValid:', vTranscript.isValid);
  console.log('  courseMatchCount:', vTranscript.courseMatchCount);
  console.log('  errorCode:', vTranscript.errorCode);
  console.log('  errorMessage:', vTranscript.errorMessage);

  const parsedTranscript = parseTranscriptText(fakeTranscriptText, { masterDb });
  const sTrans = parsedTranscript.summary;
  const mTrans = parsedTranscript.studentMetadata;
  console.log('\nparseTranscriptText result:');
  console.log('  Student Name & ID:', mTrans.student_name, '|', mTrans.student_id);
  console.log('  Program & Concentrations:', mTrans.program, '|', (mTrans.concentrations || []).join('; '));
  console.log('  Transcript Date:', mTrans.transcript_date);
  console.log('  Active Unique Courses:', sTrans.activeUniqueCourseCount);
  console.log('  Completed Courses:', parsedTranscript.completedCourses.length);
  console.log('  Transfer Courses:', parsedTranscript.transferCourses.length);
  console.log('  Current Courses:', parsedTranscript.currentCourses.length, `(${parsedTranscript.currentCourses.map(c => c.compactCode + ' ' + c.state).join(', ')})`);
  console.log('  Transfer Credits:', sTrans.totalTransferCredits);
  console.log('  Completed Credits:', sTrans.totalCompletedCredits);
  console.log('  Current Credits:', sTrans.totalCurrentCredits);
  console.log('  Total Earned + Enrolled Credits:', sTrans.totalEarnedAndEnrolledCredits);
  console.log('  Cumulative GPA:', sTrans.cumulativeGpa);

  const currTrans = verifyDocumentCurrency(parsedTranscript, 'Transcript', { referenceDate: '2026-10-23' });
  console.log('\nverifyDocumentCurrency (Transcript):');
  console.log('  isCurrent:', currTrans.isCurrent);
  console.log('  variant:', currTrans.variant);
  console.log('  inProgressCount:', currTrans.inProgressCount);
  console.log('  currentSemester:', currTrans.currentSemester);

  // --- PART 3: TEST COMBINED INGESTION (DUAL UPLOAD) ---
  console.log('\n--- 3. Testing Combined Ingestion (Anthology CSV + Transcript Text) ---');
  const parsedCombined = parseCombinedStudentRecords({
    anthologyBufferOrString: fakeAnthologyCsv,
    transcriptText: fakeTranscriptText,
    options: {
      referenceYear: 2026,
      masterDb
    }
  });

  const sComb = parsedCombined.summary;
  const mComb = parsedCombined.studentMetadata;
  console.log('parseCombinedStudentRecords result:');
  console.log('  Student Name & ID:', mComb.student_name, '|', mComb.student_id);
  console.log('  Program & Concentrations:', mComb.program, '|', (mComb.concentrations || []).join('; '));
  console.log('  Active Unique Courses:', sComb.activeUniqueCourseCount);
  console.log('  Completed Credits:', sComb.totalCompletedCredits);
  console.log('  Current Credits:', sComb.totalCurrentCredits);
  console.log('  Total Earned + Enrolled Credits:', sComb.totalEarnedAndEnrolledCredits);
  console.log('  All Active Courses:', parsedCombined.validCourses.map(c => `${c.compactCode} (${c.state}, ${c.credits}cr)`).join(', '));

  // --- PART 4: WATERFALL AUDIT EVALUATION ---
  console.log('\n--- 4. Testing Waterfall Degree Audit (IT - Applications Development) ---');
  const audit = runWaterfallAudit(parsedCombined, 'it_app_dev_bs_2026', masterDb);
  console.log('Audit Summary:');
  console.log('  Completed Credits:', audit.policyChecklist.totalCredits.completed);
  console.log('  Enrolled Credits:', audit.policyChecklist.totalCredits.enrolled);
  console.log('  Earned + Enrolled:', audit.policyChecklist.totalCredits.EarnedPlusEnrolled);
  console.log('  Remaining Planned Credits:', audit.policyChecklist.totalCredits.remainingPlanned);
  console.log('  Projected Total Credits:', audit.policyChecklist.totalCredits.projectedTotal);
  console.log('  General Education Satisfied:', audit.geBuckets.filter(b => b.fulfilled).length, '/ 14 buckets');
  console.log('  Major Core Satisfied:', audit.majorRequirements.filter(r => r.fulfilled).length, '/', audit.majorRequirements.length);
  console.log('  Emphasis Requirements Satisfied:', audit.emphasisRequirements.filter(r => r.fulfilled).length, '/', audit.emphasisRequirements.length);
  console.log('  Human Diversity (/HD):', audit.policyChecklist.humanDiversity.completedOrEnrolledCount, '/ 2 courses (Satisfied:', audit.policyChecklist.humanDiversity.satisfied, ')');
  console.log('  Residency Status:', audit.policyChecklist.residency.currentInstitutionalCredits, 'cr completed');

  // --- PART 5: 8-WEEK SCHEDULER EXECUTION ---
  console.log('\n--- 5. Testing Critical-Path 8-Week Scheduler ---');
  const schedule = generateOptimalSchedule({
    auditResult: audit,
    programChecklist: masterDb.programs.find(p => p.id === 'it_app_dev_bs_2026'),
    masterDb,
    startSemester: 'Spring 2027',
    pacingMode: 'Full-Time',
    summerOption: 'No Summer'
  });

  console.log('Schedule generated successfully:');
  console.log('  Semesters Planned:', schedule.semesters?.length);
  console.log('  Total Courses Scheduled:', schedule.totalCoursesScheduled);
  console.log('  Projected Graduation Term:', schedule.projectedGraduationTerm);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
