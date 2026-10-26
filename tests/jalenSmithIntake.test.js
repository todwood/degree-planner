import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import masterDb from '../src/data/masterDatabase.json';
import {
  parseAnthologySpreadsheet,
  parseTranscriptPdf,
  parseCombinedStudentRecords,
  extractTextFromPdf,
  isTransferPlaceholder
} from '../src/engine/transcriptParser.js';
import { runWaterfallAudit } from '../src/engine/waterfallAudit.js';

const JALEN_FOLDER = path.resolve('.tmp/samples/Jalen Smith');
const XLSX_PATH = path.join(JALEN_FOLDER, 'StudentCourseSchedules (All Results).xlsx');
const LANDSCAPE_PDF_PATH = path.join(JALEN_FOLDER, 'sub_Transcript - UnOfficial_landscape.pdf');
const STUDENT_BASED_PDF_PATH = path.join(
  JALEN_FOLDER,
  'sub_UnofficialTranscript - Student Based_landscape.pdf'
);

describe('Jalen Smith Real File Intake & Transfer Invariant Suite', () => {
  describe('A. File Presence & Path Verification', () => {
    it('confirms the existence of Jalen Smith sample directory and disk assets', () => {
      expect(fs.existsSync(JALEN_FOLDER)).toBe(true);
      expect(fs.existsSync(XLSX_PATH)).toBe(true);
      expect(fs.existsSync(LANDSCAPE_PDF_PATH)).toBe(true);
      expect(fs.existsSync(STUDENT_BASED_PDF_PATH)).toBe(true);
    });
  });

  describe('B. Single-File Ingestion Verification', () => {
    it('ingests StudentCourseSchedules.xlsx directly and preserves both ELECT 10000 instances', () => {
      const xlsxBuffer = fs.readFileSync(XLSX_PATH);
      const parsedXlsx = parseAnthologySpreadsheet(xlsxBuffer, '.xlsx', { masterDb });

      const electCourses = parsedXlsx.transferCourses.filter(
        (c) => c.compactCode === 'ELECT10000'
      );
      expect(electCourses.length).toBe(2);

      const grades = electCourses.map((c) => c.grade).sort();
      expect(grades).toEqual(['TR-B', 'TR-C']);

      const credits = electCourses.map((c) => c.credits).sort();
      expect(credits).toEqual([2, 3]);

      // Confirm neither is excluded
      const excludedElect = parsedXlsx.excludedCourses.filter(
        (c) => c.compactCode === 'ELECT10000'
      );
      expect(excludedElect.length).toBe(0);

      // Total transfer credits should sum all 4 transfer courses: COM11000 (3) + ELECT10000 (2) + ELECT10000 (3) + PSY10000 (3) = 11.0
      expect(parsedXlsx.summary.totalTransferCredits).toBe(11);
    });

    it('ingests sub_Transcript - UnOfficial_landscape.pdf directly and preserves both ELECT 10000 instances', async () => {
      const pdfBuffer = fs.readFileSync(LANDSCAPE_PDF_PATH);
      const parsedPdf = await parseTranscriptPdf(pdfBuffer, { masterDb });

      const electCourses = parsedPdf.transferCourses.filter(
        (c) => c.compactCode === 'ELECT10000'
      );
      expect(electCourses.length).toBe(2);

      const grades = electCourses.map((c) => c.grade).sort();
      expect(grades).toEqual(['TR-B', 'TR-C']);

      const credits = electCourses.map((c) => c.credits).sort();
      expect(credits).toEqual([2, 3]);

      const excludedElect = parsedPdf.excludedCourses.filter(
        (c) => c.compactCode === 'ELECT10000'
      );
      expect(excludedElect.length).toBe(0);

      expect(parsedPdf.summary.totalTransferCredits).toBe(11);
    });
  });

  describe('C. Combined File Ingestion & Cross-Document Merging Invariants', () => {
    it('merges XLSX and PDF records without duplicate inflation, ensuring exactly 2 distinct ELECT 10000 instances', async () => {
      const xlsxBuffer = fs.readFileSync(XLSX_PATH);
      const pdfBuffer = fs.readFileSync(LANDSCAPE_PDF_PATH);
      const pdfText = await extractTextFromPdf(pdfBuffer);

      const combined = parseCombinedStudentRecords({
        anthologyBufferOrString: xlsxBuffer,
        transcriptText: pdfText,
        options: {
          masterDb,
          referenceYear: 2026
        }
      });

      // Assert exactly 4 transfer courses exist total
      expect(combined.transferCourses.length).toBe(4);

      // Query all parsed transfer courses for ELECT 10000
      const electCourses = combined.transferCourses.filter(
        (c) => c.compactCode === 'ELECT10000'
      );

      // Assert: Exactly 2 distinct ELECT 10000 entries exist in the parsed record
      expect(electCourses.length).toBe(2);

      // Assert: Both instances have independent, non-colliding internal identifiers/keys
      const [instance1, instance2] = electCourses;
      expect(instance1).not.toBe(instance2);
      expect(instance1.grade).not.toEqual(instance2.grade);
      expect(instance1.credits).not.toEqual(instance2.credits);

      // Verify classification utility flags both as transfer placeholders
      expect(isTransferPlaceholder(instance1).allowMultipleInstances).toBe(true);
      expect(isTransferPlaceholder(instance2).allowMultipleInstances).toBe(true);

      // Assert: Neither instance is flagged as excluded in parsed output
      expect(instance1.excludeReason).toBeNull();
      expect(instance2.excludeReason).toBeNull();
      const excludedElect = combined.excludedCourses.filter(
        (c) => c.compactCode === 'ELECT10000'
      );
      expect(excludedElect.length).toBe(0);

      // Assert: Total transfer credits claimed/earned sum to 11.0 (not 9.0)
      expect(combined.summary.totalTransferCredits).toBe(11);
      const sumTransferCredits = combined.transferCourses.reduce((s, c) => s + c.credits, 0);
      expect(sumTransferCredits).toBe(11);
    });
  });

  describe('D. Waterfall Audit Invariant Checks', () => {
    it('evaluates Jalen Smith record against Information Technology, BS without repeat exclusions for placeholders', async () => {
      const xlsxBuffer = fs.readFileSync(XLSX_PATH);
      const pdfBuffer = fs.readFileSync(LANDSCAPE_PDF_PATH);
      const pdfText = await extractTextFromPdf(pdfBuffer);

      const studentData = parseCombinedStudentRecords({
        anthologyBufferOrString: xlsxBuffer,
        transcriptText: pdfText,
        options: {
          masterDb,
          referenceYear: 2026
        }
      });

      const audit = runWaterfallAudit(studentData, 'it_app_dev_bs_2026', masterDb);

      // Assert: Neither ELECT 10000 instance is flagged as Excluded: Repeat / Retake
      const auditExcludedElect = audit.excludedCourses.filter(
        (c) => c.compactCode === 'ELECT10000' || c.code?.includes('ELECT')
      );
      expect(auditExcludedElect.length).toBe(0);

      // Assert: Both ELECT 10000 rows are correctly categorized under Free Electives rather than General Education buckets
      const freeElectiveCourses = audit.freeElectives || [];
      const electInFreeElectives = freeElectiveCourses.filter(
        (c) => c.compactCode === 'ELECT10000' || c.code === 'ELECT 10000'
      );
      expect(electInFreeElectives.length).toBe(2);

      const feGrades = electInFreeElectives.map((c) => c.grade).sort();
      expect(feGrades).toEqual(['TR-B', 'TR-C']);

      const feCredits = electInFreeElectives.map((c) => c.credits).sort();
      expect(feCredits).toEqual([2, 3]);

      // Confirm zero ELECT 10000 rows in GE buckets
      let electInGeCount = 0;
      Object.values(audit.geBuckets || {}).forEach((bucket) => {
        (bucket.appliedCourses || []).forEach((c) => {
          if (c.compactCode === 'ELECT10000' || c.code?.includes('ELECT')) {
            electInGeCount += 1;
          }
        });
      });
      expect(electInGeCount).toBe(0);

      // Assert: Total transfer credits earned remain 11.0
      expect(studentData.summary.totalTransferCredits).toBe(11);
    });
  });

  describe('E. Demographic Extraction Telemetry', () => {
    it('extracts and logs a clean diagnostic table to console for manual verification', async () => {
      const xlsxBuffer = fs.readFileSync(XLSX_PATH);
      const pdfBuffer = fs.readFileSync(LANDSCAPE_PDF_PATH);
      const pdfText = await extractTextFromPdf(pdfBuffer);

      const parsed = parseCombinedStudentRecords({
        anthologyBufferOrString: xlsxBuffer,
        transcriptText: pdfText,
        options: {
          masterDb,
          referenceYear: 2026
        }
      });

      const meta = parsed.studentMetadata || {};
      const summary = parsed.summary || {};

      const telemetry = {
        'Student ID': meta.studentId || meta.student_id || 'N/A',
        'Full Name': meta.name || meta.student_name || 'N/A',
        'Program / Major': meta.program || meta.major || 'N/A',
        'Catalog Year': meta.catalogYear || meta.catalog_year || 'N/A',
        'Cumulative GPA': meta.gpa ?? meta.student_gpa ?? 'N/A',
        'Total Transfer Credits': summary.totalTransferCredits ?? 'N/A',
        'Total Institutional Credits': summary.totalCompletedInstitutionalCredits ?? 'N/A',
        'Advisor': meta.advisor || 'N/A',
        'Email / Phone': `${meta.email || 'N/A'} / ${meta.phone || 'N/A'}`
      };

      console.log('\n--- JALEN SMITH DEMOGRAPHIC EXTRACTION TELEMETRY ---');
      console.table(telemetry);
      console.log('-----------------------------------------------------\n');

      // Assert essential fields are extracted without being unverified strings
      expect(telemetry['Student ID']).toBe('A003000130');
      expect(telemetry['Full Name']).toBe('Jalen A Smith');
      expect(telemetry['Total Transfer Credits']).toBe(11);
      expect(telemetry['Total Institutional Credits']).toBe(99);
      expect(telemetry['Cumulative GPA']).toBe(3.19);
    });
  });
});
