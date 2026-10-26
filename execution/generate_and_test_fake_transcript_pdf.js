import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import {
  parseTranscriptPdf,
  verifyTranscriptText,
  verifyDocumentCurrency,
  parseCombinedStudentRecords
} from '../src/engine/transcriptParser.js';

const masterDb = JSON.parse(fs.readFileSync('src/data/masterDatabase.json', 'utf8'));

async function generateAndTest() {
  console.log('Generating Enrollment-Based Transcript PDF for Ariyeona Jones-Hadley...');
  const pdfDoc = await PDFDocument.create();
  // Landscape 792 x 612 pt
  const page = pdfDoc.addPage([792, 612]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text, x, y, size = 9, isBold = false) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? fontBold : font,
      color: rgb(0, 0, 0)
    });
  };

  // Header
  draw('Date: 10/22/2026', 40, 580, 8);
  draw('Lindenwood University', 320, 580, 14, true);
  draw('Page 1 of 1', 720, 580, 8);
  draw('Unofficial Transcript', 340, 565, 10, true);
  draw('209 S. Kingshighway', 345, 552, 8);
  draw('St Charles, MO 63301', 345, 542, 8);
  draw('https://www.lindenwood.edu', 338, 532, 8);

  // Student info bar
  draw('Student: Ariyeona Jones-Hadley', 40, 510, 9, true);
  draw('Student ID: A003050742', 230, 510, 9, true);
  draw('DOB: 10/1995', 400, 510, 9);
  draw('Original Start Date: 8/24/2026', 500, 510, 9);
  draw('Student GPA: 4.000000', 670, 510, 9, true);

  draw('Program: Information Technology', 40, 495, 9, true);
  draw('Enrollment #: JO26083172', 40, 482, 8);
  draw('Status: Active', 230, 482, 8);
  draw('Start Date: 8/24/2026', 40, 470, 8);

  // Term 1: Transfer Term
  draw('Term: TRANSFER_TERM   Transfer Term 1/02/1900 - 1/02/1900', 40, 450, 9, true);
  draw('Course Code   Course Description                                 Credits Attempted   Credits Earned   Quality Points   Grade', 40, 438, 7, true);
  draw('Transferred from LINCOLN UNIVERSITY - 820 CHESTNUT STREET JEFFERSON CITY MO 65101 United States', 40, 428, 7);

  const trCourses = [
    ['MTH11000', 'Intermediate Algebra', '3.00', '3.00', '0.00', 'TR-A'],
    ['UNIV10100', 'First-Year Seminar', '1.00', '1.00', '0.00', 'TR-B'],
    ['SOC10200', 'Basic Concepts of Sociology (GE-SocSci/HD)', '3.00', '3.00', '0.00', 'TR-C'],
    ['ENGL15000', 'Composition I (GE-Comm)', '3.00', '3.00', '0.00', 'TR-B'],
    ['GE11013', 'GE-Natural Science (GE-NatSciLec)', '3.00', '3.00', '0.00', 'TR-D'],
    ['ENGL17000', 'Composition II (GE-Comm)', '3.00', '3.00', '0.00', 'TR-C'],
    ['ELECT10000', 'Free Elective 10000 Level', '3.00', '3.00', '0.00', 'TR-B'],
    ['CCJ30000', 'Policing in America', '3.00', '3.00', '0.00', 'TR-B']
  ];

  let y = 416;
  for (const c of trCourses) {
    draw(`${c[0]}  ${c[1]}`, 40, y, 7.5);
    draw(`${c[2]}       ${c[3]}       ${c[4]}       ${c[5]}`, 280, y, 7.5);
    y -= 11;
  }
  draw('Term GPA: 0.00   Cum GPA: 0.00', 40, y, 8, true);
  y -= 18;

  // Term 2: Fall 2026
  draw('Term: FALL_26   Fall 26 8/24/2026 - 12/11/2026', 40, y, 9, true);
  y -= 12;
  draw('Course Code   Course Description                                 Credits Attempted   Credits Earned   Quality Points   Grade', 40, y, 7, true);
  y -= 12;

  const fallCourses = [
    ['ICS21300', 'Foundations of Information Technology', '3.00', '3.00', '12.00', 'A'],
    ['HIST11200', 'US History: New Republic to World Power (GE-HC:USHisGov)', '3.00', '3.00', '12.00', 'A'],
    ['SOC22000', 'Social Problems (GE-SocSci/HD)', '0.00', '0.00', '0.00', '']
  ];

  for (const c of fallCourses) {
    draw(`${c[0]}  ${c[1]}`, 40, y, 7.5);
    draw(`${c[2]}       ${c[3]}       ${c[4]}       ${c[5]}`, 280, y, 7.5);
    y -= 11;
  }
  draw('Term GPA: 4.00   Cum GPA: 4.00', 40, y, 8, true);
  y -= 14;
  draw('Information Technology GPA: 4.00  28.00  28.00', 40, y, 8, true);
  y -= 12;
  draw('Concentration(s): Applications Development Emphasis', 40, y, 8);

  const pdfBytes = await pdfDoc.save();
  const pdfPath = path.resolve('.tmp', 'Ariyeona_Jones-Hadley_Transcript.pdf');
  fs.writeFileSync(pdfPath, pdfBytes);
  console.log(`Saved PDF to ${pdfPath} (${pdfBytes.length} bytes)`);

  // Test parseTranscriptPdf
  console.log('\nTesting parseTranscriptPdf on generated PDF...');
  const parsed = await parseTranscriptPdf(pdfBytes, { masterDb });
  console.log('parseTranscriptPdf result:');
  console.log('  Student Name & ID:', parsed.studentMetadata.student_name, '|', parsed.studentMetadata.student_id);
  console.log('  Program & Concentrations:', parsed.studentMetadata.program, '|', (parsed.studentMetadata.concentrations || []).join('; '));
  console.log('  Active Courses Count:', parsed.summary.activeUniqueCourseCount);
  console.log('  Completed Credits:', parsed.summary.totalCompletedCredits);
  console.log('  Current Credits:', parsed.summary.totalCurrentCredits);
  console.log('  Total Earned + Enrolled:', parsed.summary.totalEarnedAndEnrolledCredits);
  console.log('  Current courses:', parsed.currentCourses.map(c => c.compactCode).join(', '));

  console.log('\nTesting verifyTranscriptText...');
  const vCheck = verifyTranscriptText(parsed.reconstructedText);
  console.log('verifyTranscriptText:', vCheck);

  console.log('\nTesting verifyDocumentCurrency...');
  const cCheck = verifyDocumentCurrency(parsed, 'Transcript', { referenceDate: '2026-10-23' });
  console.log('verifyDocumentCurrency:', cCheck);
}

generateAndTest().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
