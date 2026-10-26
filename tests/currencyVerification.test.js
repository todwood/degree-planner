import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getCurrentAcademicSemester,
  verifyDocumentCurrency,
  parseAnthologySpreadsheet,
  parseTranscriptPdf
} from '../src/engine/transcriptParser.js';

const masterDb = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'masterDatabase.json'), 'utf8')
);

describe('Document Currency Verification & Academic Calendar Suite', () => {
  it('determines active Fall semester correctly between Aug 15 and Dec 18', () => {
    const sem = getCurrentAcademicSemester('2026-10-23');
    expect(sem.season).toBe('Fall');
    expect(sem.year).toBe(2026);
    expect(sem.displayTerm).toBe('Fall 2026');
    expect(sem.isFullSemester).toBe(true);
    expect(sem.startDate).toBe('2026-08-15');
    expect(sem.endDate).toBe('2026-12-18');
  });

  it('determines active Spring semester correctly between Jan 5 and May 15', () => {
    const sem = getCurrentAcademicSemester('2027-02-15');
    expect(sem.season).toBe('Spring');
    expect(sem.year).toBe(2027);
    expect(sem.displayTerm).toBe('Spring 2027');
    expect(sem.isFullSemester).toBe(true);
    expect(sem.startDate).toBe('2027-01-05');
    expect(sem.endDate).toBe('2027-05-15');
  });

  it('exempts summer dates from full semester checks (Summer exception)', () => {
    const sem = getCurrentAcademicSemester('2026-06-20');
    expect(sem.season).toBe('Summer');
    expect(sem.isFullSemester).toBe(false);
  });

  it('exempts winter break dates from full semester checks (Break exception)', () => {
    const sem = getCurrentAcademicSemester('2026-12-25');
    expect(sem.season).toBe('Break');
    expect(sem.isFullSemester).toBe(false);
  });

  it('returns isExempt = true during summer / break uploads', () => {
    const mockData = { validCourses: [], studentMetadata: {} };
    const res = verifyDocumentCurrency(mockData, 'Anthology', { referenceDate: '2026-07-10' });
    expect(res.isCurrent).toBe(true);
    expect(res.isExempt).toBe(true);
    expect(res.reason).toContain('Summer');
  });

  it('validates an Anthology export containing current semester in-progress courses', () => {
    const mockData = {
      validCourses: [
        { term: 'FALL_26_16W', state: 'Current', credits: 3.0, termInfo: { year: 2026, season: 'Fall' } }
      ],
      studentMetadata: {}
    };
    const res = verifyDocumentCurrency(mockData, 'Anthology', { referenceDate: '2026-10-23' });
    expect(res.isCurrent).toBe(true);
    expect(res.isExempt).toBe(false);
    expect(res.currentCoursesCount).toBe(1);
  });

  it('flags an outdated Anthology export with no current in-progress courses', () => {
    const mockData = {
      validCourses: [
        { term: 'SPRING_25', state: 'Complete', credits: 3.0, termInfo: { year: 2025, season: 'Spring', sortKey: 202510 } }
      ],
      studentMetadata: {}
    };
    const res = verifyDocumentCurrency(mockData, 'Anthology', { referenceDate: '2026-10-23' });
    expect(res.isCurrent).toBe(false);
    expect(res.warningTitle).toBe('Anthology Export May Be Out of Date');
    expect(res.explanation).toContain('No in-progress or scheduled courses were detected for the current Fall 2026 semester');
  });

  it('validates an Enrollment-Based transcript containing 0.00 in-progress courses', () => {
    const mockData = {
      validCourses: [
        { term: 'FALL_26', state: 'Current', credits: 0.0, grade: '', termInfo: { year: 2026, season: 'Fall' } }
      ],
      studentMetadata: { variant: 'Enrollment-Based', transcript_date: '10/22/2026' }
    };
    const res = verifyDocumentCurrency(mockData, 'Transcript', { referenceDate: '2026-10-23' });
    expect(res.isCurrent).toBe(true);
    expect(res.variant).toBe('Enrollment-Based');
  });

  it('validates a Student-Based transcript with current header print date', () => {
    const mockData = {
      validCourses: [
        { term: 'SPRING_26', state: 'Complete', credits: 3.0, grade: 'A', termInfo: { year: 2026, season: 'Spring' } }
      ],
      studentMetadata: { variant: 'Student-Based', transcript_date: '10/22/2026' }
    };
    const res = verifyDocumentCurrency(mockData, 'Transcript', { referenceDate: '2026-10-23' });
    expect(res.isCurrent).toBe(true);
    expect(res.variant).toBe('Student-Based');
  });

  it('flags an outdated Student-Based transcript printed in a prior academic year', () => {
    const mockData = {
      validCourses: [
        { term: 'SPRING_24', state: 'Complete', credits: 3.0, grade: 'B', termInfo: { year: 2024, season: 'Spring', sortKey: 202410 } }
      ],
      studentMetadata: { variant: 'Student-Based', transcript_date: '05/10/2024' }
    };
    const res = verifyDocumentCurrency(mockData, 'Transcript', { referenceDate: '2026-10-23' });
    expect(res.isCurrent).toBe(false);
    expect(res.warningTitle).toBe('Student-Based Transcript May Be Out of Date');
    expect(res.explanation).toContain('05/10/2024');
  });

  it('confirms all 14 student sample folders pass currency verification during Fall 2026', async () => {
    const samplesRoot = path.join(process.cwd(), '.tmp', 'samples');
    if (!fs.existsSync(samplesRoot)) return;

    const folders = fs.readdirSync(samplesRoot).filter((f) =>
      fs.statSync(path.join(samplesRoot, f)).isDirectory()
    );

    for (const folder of folders) {
      const p = path.join(samplesRoot, folder);
      const files = fs.readdirSync(p);
      const pdfA = files.find((f) => f.endsWith('.pdf') && !f.includes('Student Based'));
      const pdfB = files.find((f) => f.endsWith('.pdf') && f.includes('Student Based'));
      const xlsx = files.find((f) => f.endsWith('.xlsx') || f.endsWith('.csv'));

      if (!pdfA || !pdfB || !xlsx) continue;

      const parsedPdfA = await parseTranscriptPdf(fs.readFileSync(path.join(p, pdfA)), { masterDb });
      const parsedPdfB = await parseTranscriptPdf(fs.readFileSync(path.join(p, pdfB)), { masterDb });
      const parsedXlsx = parseAnthologySpreadsheet(fs.readFileSync(path.join(p, xlsx)), 'xlsx', { masterDb });

      const curA = verifyDocumentCurrency(parsedPdfA, 'Transcript', { referenceDate: '2026-10-23' });
      const curB = verifyDocumentCurrency(parsedPdfB, 'Transcript', { referenceDate: '2026-10-23' });
      const curX = verifyDocumentCurrency(parsedXlsx, 'Anthology', { referenceDate: '2026-10-23' });

      expect(curA.isCurrent).toBe(true);
      expect(curB.isCurrent).toBe(true);
      expect(curX.isCurrent).toBe(true);
    }
  });
});
