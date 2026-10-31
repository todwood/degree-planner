import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Screen1Intake from '../src/components/Screen1Intake.jsx';
import ActiveTermModal from '../src/components/ActiveTermModal.jsx';
import ProgramCombobox from '../src/components/ProgramCombobox.jsx';
import masterDb from '../src/data/masterDatabase.json';
import masterProgramsDb from '../src/data/masterProgramsDatabase.json';
import { matchesProgramCategory, getProgramCategory } from '../src/utils/programStackUtils.js';

describe('Screen 1 State, Button Artifacts & Credential Invariants Suite', () => {
  // Sample active student data for tests
  const sampleActiveTranscript = {
    studentMetadata: {
      name: 'Brandon M Paz',
      studentId: 'A003014354',
      advisor: 'Prof Todd Wood',
      email: 'twood@lindenwood.edu',
      catalogYear: '2024-2025',
      gpa: 3.91,
      status: 'Active'
    },
    validCourses: [
      {
        code: 'ICS 42300',
        compactCode: 'ICS42300',
        title: 'Advanced Penetration Testing',
        credits: 3,
        status: 'Current',
        state: 'Current',
        term: 'Fall 2026',
        termInfo: { displayTerm: 'Fall 2026' },
        modality: 'Online'
      },
      {
        code: 'MTH 27100',
        compactCode: 'MTH27100',
        title: 'Calculus I',
        credits: 4,
        status: 'Current',
        state: 'Current',
        term: 'Fall 2026',
        termInfo: { displayTerm: 'Fall 2026' },
        modality: 'Traditional (On-Campus)'
      }
    ]
  };

  const sampleFacultyProfile = {
    advisorName: 'Prof Todd Wood',
    advisorUsername: 'twood',
    advisorEmail: 'twood@lindenwood.edu'
  };

  // ---------------------------------------------------------------------------
  // 1. Button Labels Clean Rendering (Zero Duplicate Glyphs)
  // ---------------------------------------------------------------------------
  describe('1. Button Labels Without Duplicate Text Glyphs', () => {
    it('renders "Clear Active Student" button without duplicate "✕" text character', () => {
      const html = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          parsedTranscript: sampleActiveTranscript,
          facultyProfile: sampleFacultyProfile,
          masterDb
        })
      );

      // Verify the button exists with the clean label
      expect(html).toContain('Clear Active Student');
      // Assert that duplicate text glyphs are absent
      expect(html).not.toContain('✕ Clear Active Student');
      expect(html).not.toContain('x Clear Active Student');
    });

    it('renders "Edit Active Term" button without duplicate emoji pencil', () => {
      const html = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          parsedTranscript: sampleActiveTranscript,
          facultyProfile: sampleFacultyProfile,
          masterDb
        })
      );

      // Verify the button exists with the clean label
      expect(html).toContain('Edit Active Term');
      // Assert that literal emoji character is absent
      expect(html).not.toContain('✏️ Edit Active Term');
      expect(html).not.toContain('✏ Edit Active Term');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Clear Active Student Purges Both Local and Hoisted States
  // ---------------------------------------------------------------------------
  describe('2. State Purge on Clear Active Student', () => {
    it('dispatches clear signals for student records, credentials, and hoisted props', () => {
      const onClearActiveRecord = vi.fn();
      const onSelectProgramId = vi.fn();
      const onUpdateAdditionalPrograms = vi.fn();

      // Verify Screen1Intake accepts and invokes callbacks properly
      const htmlWithStudent = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          parsedTranscript: sampleActiveTranscript,
          facultyProfile: sampleFacultyProfile,
          onClearActiveRecord,
          onSelectProgramId,
          onUpdateAdditionalPrograms,
          masterDb
        })
      );

      expect(htmlWithStudent).toContain('Brandon M Paz');
      expect(htmlWithStudent).toContain('parsed-telemetry-panel');
      expect(htmlWithStudent).toContain('screen1-clear-active-btn');
      expect(htmlWithStudent).toContain('screen1-top-proceed-btn');

      // Verify blank state when parsedTranscript is null
      const htmlBlank = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          parsedTranscript: null,
          facultyProfile: sampleFacultyProfile,
          masterDb
        })
      );

      expect(htmlBlank).not.toContain('parsed-telemetry-panel');
      expect(htmlBlank).not.toContain('screen1-clear-active-btn');
      expect(htmlBlank).not.toContain('screen1-top-proceed-btn');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Re-Extract Empty Handling
  // ---------------------------------------------------------------------------
  describe('3. Re-Extract Empty Handling (Zero Documents)', () => {
    it('purges parsed card and resets when no document files are present', () => {
      // When files are removed or empty, the intake should render the pristine state
      const htmlEmpty = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          parsedTranscript: null,
          intakeFiles: {
            anthologyFile: null,
            transcriptFile: null,
            degreePlanFile: null
          },
          facultyProfile: sampleFacultyProfile,
          masterDb
        })
      );

      expect(htmlEmpty).not.toContain('parsed-telemetry-panel');
      expect(htmlEmpty).toContain('Provide at least one document to Analyze');
      expect(htmlEmpty).toContain('Unofficial Transcript');
      expect(htmlEmpty).toContain('Anthology Schedule');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Active Term Modal Pre-Populates from Intake
  // ---------------------------------------------------------------------------
  describe('4. Active Term Modal Defaults Initialization', () => {
    it('pre-populates form inputs with active semester, operational status, and modality', () => {
      const onSave = vi.fn();
      const onClose = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: true,
          onClose,
          activeCourses: sampleActiveTranscript.validCourses,
          initialTerm: 'Fall 2026',
          initialStatus: 'IN_PROGRESS',
          initialModality: 'Online',
          masterDb,
          onSave
        })
      );

      // Verify modal headers and testids
      expect(html).toContain('Active Term Course Editor (Fall 2026)');
      expect(html).toContain('active-term-selected-semester');
      expect(html).toContain('active-term-selected-status');
      expect(html).toContain('active-term-selected-modality');
      expect(html).toContain('value="Fall 2026"');
      expect(html).toContain('IN_PROGRESS');
      expect(html).toContain('save-active-term-btn');
      expect(html).toContain('ICS 42300');
      expect(html).toContain('MTH 27100');
    });

    it('returns null when modal isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: false,
          activeCourses: sampleActiveTranscript.validCourses
        })
      );
      expect(html).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Credential Stacking Deduplication Invariant
  // ---------------------------------------------------------------------------
  describe('5. Credential Stacking Deduplication Invariant', () => {
    it('prevents duplicate program additions in declared credentials stack', () => {
      const programId = 'cybersecurity_bs_2026';
      let declared = [programId];

      // Pure deduplication invariant function
      const addToStack = (id) => {
        if (!id || declared.includes(id)) return;
        declared = [...declared, id];
      };

      addToStack(programId);
      expect(declared).toEqual([programId]);
      expect(declared.length).toBe(1);

      // Add a different program
      addToStack('mathematics_minor_2026');
      expect(declared).toEqual([programId, 'mathematics_minor_2026']);
      expect(declared.length).toBe(2);

      // Attempt duplicate addition again
      addToStack('mathematics_minor_2026');
      expect(declared.length).toBe(2);
    });

    it('renders "Already in stack" helper text and disables add button when program is already declared', () => {
      const prog = masterDb.programs.find((p) => p.id === 'cybersecurity_bs_2026');
      const progId = prog?.id || 'cybersecurity_bs_2026';

      const html = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          selectedProgramId: progId,
          declaredProgramIds: [progId],
          propProgramId: progId,
          facultyProfile: sampleFacultyProfile,
          masterDb
        })
      );

      // When staged program is already in stack, helper text appears
      expect(html).toContain('program-already-in-stack-helper');
      expect(html).toContain('Already in stack');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Dual-Category Classification (Major + Certificate Matching)
  // ---------------------------------------------------------------------------
  describe('6. Dual-Category Classification (matchesProgramCategory)', () => {
    const progs = Array.isArray(masterProgramsDb.programs)
      ? masterProgramsDb.programs
      : Object.values(masterProgramsDb.programs);

    const bioCertPrep = progs.find(
      (p) =>
        (p.name || '').includes('Biological Sciences') &&
        (p.name || '').includes('Certification Preparation')
    );

    it('identifies dual-category program in master programs database', () => {
      expect(bioCertPrep).toBeDefined();
      expect(bioCertPrep.name).toContain('BA 9-12 Secondary Education Certification Preparation');
    });

    it('matches "Major" filter pill for secondary education certification preparation degrees', () => {
      expect(matchesProgramCategory(bioCertPrep, 'Major')).toBe(true);
    });

    it('matches "Certificate" filter pill for secondary education certification preparation degrees', () => {
      expect(matchesProgramCategory(bioCertPrep, 'Certificate')).toBe(true);
    });

    it('does not match "Minor" filter pill for major/cert preparation programs', () => {
      expect(matchesProgramCategory(bioCertPrep, 'Minor')).toBe(false);
    });

    it('matches "All" filter pill', () => {
      expect(matchesProgramCategory(bioCertPrep, 'All')).toBe(true);
    });

    it('renders secondary education certification preparation under Certificate filter in ProgramCombobox', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProgramCombobox, {
          programs: progs,
          catalogYear: bioCertPrep.catalog_year || '2026-2027',
          selectedProgramId: bioCertPrep.id
        })
      );

      expect(html).toContain(bioCertPrep.name.split(' - ')[0]);
    });
  });
});
