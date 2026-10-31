import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateIntakeEligibility } from '../src/utils/intakeHelpers.js';
import HeaderNav from '../src/components/HeaderNav.jsx';

describe('Screen 1 Intake Validation Audit & Progression Gates Suite', () => {
  const sampleDatabase = [
    {
      id: 'cybersecurity_bs_2026',
      name: 'Cybersecurity, BS',
      credentialType: 'MAJOR',
      program_type: 'Major'
    },
    {
      id: 'mathematics_minor_2026',
      name: 'Mathematics Minor',
      credentialType: 'MINOR',
      program_type: 'Minor'
    },
    {
      id: 'web_development_cert_2026',
      name: 'Web Development Certificate',
      credentialType: 'CERTIFICATE',
      program_type: 'Certificate'
    }
  ];

  // ---------------------------------------------------------------------------
  // 1. Empty Credential Stack Check
  // ---------------------------------------------------------------------------
  it('1. validateIntakeEligibility returns isEligible: false with NO_PROGRAMS_DECLARED when stack is empty', () => {
    const result = validateIntakeEligibility({
      studentProfile: { studentName: 'Brandon Paz', studentId: 'A00123456' },
      validCourses: [{ code: 'ICS 10000', credits: 3.0, grade: 'A' }],
      declaredProgramIds: [],
      programsDatabase: sampleDatabase
    });

    expect(result.isEligible).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('NO_PROGRAMS_DECLARED');
    expect(result.errors[0].message).toContain('Declare at least one primary Major');
  });

  // ---------------------------------------------------------------------------
  // 2. Minor Only Stack Check
  // ---------------------------------------------------------------------------
  it('2. validateIntakeEligibility returns isEligible: false with MISSING_PRIMARY_MAJOR when stack contains only Mathematics Minor', () => {
    const result = validateIntakeEligibility({
      studentProfile: { studentName: 'Brandon Paz', studentId: 'A00123456' },
      validCourses: [{ code: 'MTH 15100', credits: 3.0, grade: 'B' }],
      declaredProgramIds: ['mathematics_minor_2026'],
      programsDatabase: sampleDatabase
    });

    expect(result.isEligible).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MISSING_PRIMARY_MAJOR');
    expect(result.errors[0].message).toContain('At least one Major is required');
  });

  // ---------------------------------------------------------------------------
  // 3. Certificate Only Stack Check
  // ---------------------------------------------------------------------------
  it('3. validateIntakeEligibility returns isEligible: false with MISSING_PRIMARY_MAJOR when stack contains only a Certificate', () => {
    const result = validateIntakeEligibility({
      studentProfile: { studentName: 'Brandon Paz', studentId: 'A00123456' },
      validCourses: [{ code: 'ICS 10000', credits: 3.0, grade: 'A' }],
      declaredProgramIds: ['web_development_cert_2026'],
      programsDatabase: sampleDatabase
    });

    expect(result.isEligible).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MISSING_PRIMARY_MAJOR');
    expect(result.errors[0].message).toContain('At least one Major is required');
  });

  // ---------------------------------------------------------------------------
  // 4. Major + Minor Stack Check
  // ---------------------------------------------------------------------------
  it('4. validateIntakeEligibility returns isEligible: true when stack contains Cybersecurity, BS (MAJOR) + Mathematics Minor + student record', () => {
    const result = validateIntakeEligibility({
      studentProfile: { studentName: 'Brandon Paz', studentId: 'A00123456' },
      validCourses: [{ code: 'ICS 10000', credits: 3.0, grade: 'A' }],
      declaredProgramIds: ['cybersecurity_bs_2026', 'mathematics_minor_2026'],
      programsDatabase: sampleDatabase
    });

    expect(result.isEligible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Zero Active-Term Enrollment Flexibility Invariant
  // ---------------------------------------------------------------------------
  it('5. validateIntakeEligibility returns isEligible: true for incoming student with 0 active-term enrollments but declared major and profile', () => {
    const result = validateIntakeEligibility({
      studentProfile: { studentName: 'Incoming Student Alex', studentId: 'A00998877' },
      validCourses: [], // 0 active courses
      declaredProgramIds: ['cybersecurity_bs_2026'],
      programsDatabase: sampleDatabase
    });

    expect(result.isEligible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Navigation Guard in HeaderNav & App Stepper
  // ---------------------------------------------------------------------------
  it('6. HeaderNav disables direct navigation to Step 2 and Step 3 with lock icon when isEligibleForAudit is false', () => {
    const setCurrentScreen = vi.fn();

    const htmlBlocked = renderToStaticMarkup(
      React.createElement(HeaderNav, {
        facultyProfile: { advisorName: 'Prof Wood' },
        currentScreen: 1,
        setCurrentScreen,
        isEligibleForAudit: false
      })
    );

    // Step 2 & 3 must be disabled and have lock/tooltip
    expect(htmlBlocked).toContain('id="nav-step-2-btn"');
    expect(htmlBlocked).toContain('id="nav-step-3-btn"');
    expect(htmlBlocked).toContain('disabled=""');
    expect(htmlBlocked).toContain('Complete intake requirements and declare a major to unlock');
    expect(htmlBlocked).toContain('opacity-40 cursor-not-allowed');

    // Enabled state
    const htmlEnabled = renderToStaticMarkup(
      React.createElement(HeaderNav, {
        facultyProfile: { advisorName: 'Prof Wood' },
        currentScreen: 1,
        setCurrentScreen,
        isEligibleForAudit: true
      })
    );

    expect(htmlEnabled).not.toContain('Complete intake requirements and declare a major to unlock');
    expect(htmlEnabled).not.toContain('opacity-40 cursor-not-allowed');
  });

  // ---------------------------------------------------------------------------
  // 7. Missing Records Check
  // ---------------------------------------------------------------------------
  it('7. validateIntakeEligibility returns isEligible: false with MISSING_RECORDS when no coursework and no manual name/id', () => {
    const result = validateIntakeEligibility({
      studentProfile: null,
      validCourses: [],
      declaredProgramIds: ['cybersecurity_bs_2026'],
      programsDatabase: sampleDatabase
    });

    expect(result.isEligible).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_RECORDS')).toBe(true);
    expect(result.errors.find((e) => e.code === 'MISSING_RECORDS').message).toContain(
      'Upload a transcript or enter student information'
    );
  });
});
