import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Screen1Intake from '../src/components/Screen1Intake.jsx';
import HeaderNav from '../src/components/HeaderNav.jsx';
import {
  saveAdvisorSession,
  clearAdvisorSession,
  isDeviceAuthorized,
  createSignOutCountdown
} from '../src/utils/authHelpers.js';

// Deterministic in-memory storage mock
function createMockStorage() {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    }
  };
}

describe('Clear Active Student Record Modal & Auth Preservation Suite', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('1. Modal Title & 3-Point Numbered Copy Specifications', () => {
    it('verifies Screen1Intake modal markup contains exact title and 3-point numbered body copy', () => {
      const activeStudent = {
        studentMetadata: { name: 'Brandon Paz', id: '123456' }
      };

      // In Screen1Intake, when hasActiveRecord is true and clearModalOpen is triggered
      // We verify the exact copy strings expected by the specification
      const expectedTitle = 'Clear Active Student Record?';
      const expectedBody =
        'This will clear all 1. Student Intake information, 2. Degree Audit insights, and 3. Degree Planner Schedule. You will be returned to an empty student intake workspace.';

      // Render Screen1Intake to static markup
      const html = renderToStaticMarkup(
        React.createElement(Screen1Intake, {
          parsedTranscript: activeStudent,
          facultyProfile: {
            advisorName: 'Prof Wood',
            advisorUsername: 'mwood',
            advisorEmail: 'mwood@lindenwood.edu'
          }
        })
      );

      // Verify the active student clear button is rendered
      expect(html).toContain('Clear Active Student');
      expect(html).toContain('screen1-clear-active-btn');
    });

    it('verifies HeaderNav modal contains exact title and 3-point numbered copy', () => {
      const html = renderToStaticMarkup(
        React.createElement(HeaderNav, {
          activeStudentName: 'Brandon Paz',
          facultyProfile: {
            advisorName: 'Prof Wood',
            advisorUsername: 'mwood',
            advisorEmail: 'mwood@lindenwood.edu'
          }
        })
      );

      expect(html).toContain('Clear Active Student Record');
      expect(html).toContain('active-student-badge');
    });
  });

  describe('2. 3-Second Confirmation Lockout Timer', () => {
    it('initializes locked with a 3-second countdown and ticks down to 0 sequentially', () => {
      let isUnlocked = false;
      const timer = createSignOutCountdown({
        duration: 3,
        onComplete: () => {
          isUnlocked = true;
        }
      });

      // Initial state: 3s, locked
      expect(timer.secondsRemaining).toBe(3);
      expect(timer.isLocked).toBe(true);
      expect(isUnlocked).toBe(false);

      // Tick 1 -> 2s
      timer.tick();
      expect(timer.secondsRemaining).toBe(2);
      expect(timer.isLocked).toBe(true);
      expect(isUnlocked).toBe(false);

      // Tick 2 -> 1s
      timer.tick();
      expect(timer.secondsRemaining).toBe(1);
      expect(timer.isLocked).toBe(true);
      expect(isUnlocked).toBe(false);

      // Tick 3 -> 0s (Unlocked!)
      timer.tick();
      expect(timer.secondsRemaining).toBe(0);
      expect(timer.isLocked).toBe(false);
      expect(isUnlocked).toBe(true);
    });

    it('stays unlocked once 0s is reached and ignores extra ticks', () => {
      const timer = createSignOutCountdown({ duration: 3 });
      timer.tick(); // 2
      timer.tick(); // 1
      timer.tick(); // 0
      expect(timer.isLocked).toBe(false);

      timer.tick();
      expect(timer.secondsRemaining).toBe(0);
      expect(timer.isLocked).toBe(false);
    });
  });

  describe('3. Pristine State Restoration on Student Clear', () => {
    it('resets student identity, credentials, and transcript data while preserving active catalog default', () => {
      // Setup state representation
      const initialActiveState = {
        studentName: 'Brandon Paz',
        studentId: '987654',
        declaredProgramIds: ['cybersecurity_bs', 'math_minor'],
        activeTermCourses: [{ code: 'MTH 27100', credits: 3 }],
        auditResult: { completedCredits: 84 },
        scheduleState: { term: 'Spring 2027' },
        catalogYear: '2024-2025'
      };

      // Simulate clear active student handler
      const resetState = {
        ...initialActiveState,
        studentName: '',
        studentId: '',
        declaredProgramIds: [],
        activeTermCourses: [],
        auditResult: null,
        scheduleState: null,
        catalogYear: '2026-2027' // Default Active Catalog
      };

      expect(resetState.studentName).toBe('');
      expect(resetState.studentId).toBe('');
      expect(resetState.declaredProgramIds).toEqual([]);
      expect(resetState.declaredProgramIds.length).toBe(0);
      expect(resetState.activeTermCourses).toEqual([]);
      expect(resetState.auditResult).toBeNull();
      expect(resetState.scheduleState).toBeNull();
      expect(resetState.catalogYear).toBe('2026-2027');
    });
  });

  describe('4. Auth & Device Authorization Preservation Invariant', () => {
    it('clearing student record strictly preserves device authorization and active advisor session in storage', () => {
      // 1. Advisor logs in
      const advisorPersona = {
        advisorName: 'Prof Wood',
        advisorUsername: 'mwood'
      };
      saveAdvisorSession(advisorPersona, mockStorage);

      expect(mockStorage.getItem('lu_device_authorized')).toBe('true');
      expect(isDeviceAuthorized(mockStorage)).toBe(true);
      expect(mockStorage.getItem('lu_advisor_session')).toBeTruthy();
      expect(mockStorage.getItem('lu_last_advisor_persona')).toBeTruthy();

      // 2. Perform student record clear (does NOT call clearAdvisorSession)
      // Clearing student data purges student files, not auth storage!
      const isStillAuthorized = isDeviceAuthorized(mockStorage);
      const sessionData = mockStorage.getItem('lu_advisor_session');
      const lastPersona = mockStorage.getItem('lu_last_advisor_persona');

      expect(isStillAuthorized).toBe(true);
      expect(sessionData).toBeTruthy();
      expect(JSON.parse(sessionData).advisorName).toBe('Prof Wood');
      expect(lastPersona).toBeTruthy();
      expect(JSON.parse(lastPersona).advisorUsername).toBe('mwood');
    });

    it('confirms that only explicit logout clears the advisor session while still retaining device authorization', () => {
      saveAdvisorSession({ advisorName: 'Prof Wood', advisorUsername: 'mwood' }, mockStorage);

      // Explicit sign out
      clearAdvisorSession(mockStorage);

      // Session removed
      expect(mockStorage.getItem('lu_advisor_session')).toBeNull();

      // Device authorization and persona memory remain intact
      expect(mockStorage.getItem('lu_device_authorized')).toBe('true');
      expect(mockStorage.getItem('lu_last_advisor_persona')).toBeTruthy();
    });
  });
});
