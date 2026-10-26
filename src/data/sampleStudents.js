/**
 * Real & Curated Sample Student Records for Instant Advisor Testing
 * Includes 14 real student profiles extracted from Anthology (.xlsx) exports and student info records.
 */

import realStudentsCatalog from './realStudentsCatalog.json' with { type: 'json' };

// Format list of all real students for UI pickers
export const REAL_STUDENT_LIST = Object.values(realStudentsCatalog).map((s) => ({
  id: s.id,
  name: s.studentMetadata.name,
  studentId: s.studentMetadata.studentId,
  gpa: s.studentMetadata.gpa,
  majorName: s.majorName,
  majorId: s.majorId,
  catalogYear: s.studentMetadata.catalogYear,
  creditsEarned: s.studentMetadata.creditsEarned,
  expectedGradDate: s.studentMetadata.expectedGradDate,
  pacingMode: s.studentMetadata.pacingMode,
  enrollmentStatus: s.studentMetadata.enrollmentStatus
}));

export const SAMPLE_STUDENTS = {
  // Aliases for initial 3 buttons
  cybersecurity_bs_2026: {
    ...realStudentsCatalog.brandon_paz,
    records: realStudentsCatalog.brandon_paz.rawRows
  },
  it_app_dev_bs_2026: {
    ...realStudentsCatalog.aidan_kelley,
    records: realStudentsCatalog.aidan_kelley.rawRows
  },
  it_networking_bs_2026: {
    ...realStudentsCatalog.connor_brown,
    records: realStudentsCatalog.connor_brown.rawRows
  },
  // All 14 individual real students
  ...Object.fromEntries(
    Object.entries(realStudentsCatalog).map(([k, v]) => [
      k,
      {
        ...v,
        records: v.rawRows
      }
    ])
  )
};

export function getSampleStudentRecord(keyOrMajorId) {
  if (SAMPLE_STUDENTS[keyOrMajorId]) {
    return SAMPLE_STUDENTS[keyOrMajorId];
  }
  // Try case-insensitive name or ID match
  const found = Object.values(SAMPLE_STUDENTS).find(
    (s) =>
      s.studentMetadata?.studentId?.toLowerCase() === String(keyOrMajorId).toLowerCase() ||
      s.studentMetadata?.name?.toLowerCase().includes(String(keyOrMajorId).toLowerCase())
  );
  return found || SAMPLE_STUDENTS.cybersecurity_bs_2026;
}
