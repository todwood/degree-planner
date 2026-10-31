import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdvisorAccessModal from '../src/components/AdvisorAccessModal.jsx';
import {
  validatePassphrase,
  saveAdvisorSession,
  buildFacultyProfile,
  getSavedAdvisorPersona,
  createRateLimiter,
  DEFAULT_ADVISOR_PERSONA
} from '../src/utils/authHelpers.js';

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

describe('Access Gate Polish, FERPA Copy & 30s Rate Limiter Suite', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('1. Access Gate Branding & FERPA Assurance Markup', () => {
    it('renders title "Degree Planner Access" and updated subtitle', () => {
      const html = renderToStaticMarkup(React.createElement(AdvisorAccessModal));
      expect(html).toContain('Degree Planner Access');
      expect(html).toContain('Automatic &amp; Custom Degree Audit and Planning Tool');
      expect(html).not.toContain('Advisor Workspace Access');
    });

    it('renders updated FERPA card heading and zero-cloud student data copy', () => {
      const html = renderToStaticMarkup(React.createElement(AdvisorAccessModal));
      expect(html).toContain('Built to Support FERPA-Compliant Advising');
      expect(html).toContain(
        'Zero-Cloud Student Data: Student transcripts, grades, and degree audits are parsed and stored strictly inside your browser memory. No student Personal Identifiable Information (PII) leaves this device.'
      );
      expect(html).not.toContain('100% FERPA &amp; Client-Side Privacy Guarantee');
    });

    it('displays muted placeholders "Prof. Name" and "username" on cold load without hardcoded demo persona', () => {
      const html = renderToStaticMarkup(React.createElement(AdvisorAccessModal));
      expect(html).toContain('placeholder="Prof. Name"');
      expect(html).toContain('placeholder="username"');
      expect(html).toContain('Advisor Name');
      expect(html).toContain('Advisor Email');
      // Instant Demo button is completely absent
      expect(html).not.toContain('login-demo-bypass-btn');
      expect(html).not.toContain('Instant Demo / Local Dev Bypass');
    });

    it('verifies cold load default persona initializes to empty strings', () => {
      expect(DEFAULT_ADVISOR_PERSONA.advisorName).toBe('');
      expect(DEFAULT_ADVISOR_PERSONA.advisorUsername).toBe('');
      expect(DEFAULT_ADVISOR_PERSONA.advisorEmail).toBe('');

      const persona = getSavedAdvisorPersona(mockStorage);
      expect(persona.advisorName).toBe('');
      expect(persona.advisorUsername).toBe('');
      expect(persona.advisorEmail).toBe('');
    });
  });

  describe('2. Optional Persona & Blank Name Submission Handling', () => {
    it('accepts valid passphrase with blank name/username and launches workspace with empty persona', () => {
      expect(validatePassphrase('lionsplanahead')).toBe(true);

      const profile = saveAdvisorSession({
        advisorName: '',
        advisorUsername: '',
        advisorEmail: ''
      }, mockStorage);

      expect(profile.advisorName).toBe('');
      expect(profile.advisorUsername).toBe('');
      expect(profile.advisorEmail).toBe('');
      expect(mockStorage.getItem('lu_device_authorized')).toBe('true');
    });

    it('resolves fallback display name to "Advisor" when faculty persona name is blank', () => {
      const profile = buildFacultyProfile({
        advisorName: '',
        advisorUsername: ''
      });

      const displayAdvisorName =
        profile?.advisorName?.trim() ||
        (profile?.first_name && profile?.last_name
          ? `${profile.first_name} ${profile.last_name}`.trim()
          : '') ||
        'Advisor';

      expect(displayAdvisorName).toBe('Advisor');
    });

    it('preserves custom advisor name and username when provided', () => {
      const profile = saveAdvisorSession({
        advisorName: 'Dr. Jane Smith',
        advisorUsername: 'jsmith'
      }, mockStorage);

      expect(profile.advisorName).toBe('Dr. Jane Smith');
      expect(profile.advisorUsername).toBe('jsmith');
      expect(profile.advisorEmail).toBe('jsmith@lindenwood.edu');
      expect(profile.first_name).toBe('Dr.');
      expect(profile.last_name).toBe('Jane Smith');
    });
  });

  describe('3. 5-Attempt Rate Limiter & 30-Second Lockout Logic', () => {
    it('tracks failed attempts sequentially before reaching lockout threshold', () => {
      const limiter = createRateLimiter({ maxAttempts: 5, lockoutDuration: 30, storage: mockStorage });

      expect(limiter.failedAttempts).toBe(0);
      expect(limiter.isLocked).toBe(false);

      // Attempts 1 to 4
      for (let i = 1; i <= 4; i++) {
        const res = limiter.recordFailedAttempt();
        expect(res.isLocked).toBe(false);
        expect(res.attemptsRemaining).toBe(5 - i);
        expect(limiter.failedAttempts).toBe(i);
        expect(limiter.isLocked).toBe(false);
      }
    });

    it('submitting 5 consecutive wrong passphrases locks submissions and initializes 30-second countdown', () => {
      const limiter = createRateLimiter({ maxAttempts: 5, lockoutDuration: 30, storage: mockStorage });

      // 4 failures
      for (let i = 1; i <= 4; i++) {
        limiter.recordFailedAttempt();
      }

      // 5th failure triggers lockout
      const res5 = limiter.recordFailedAttempt();
      expect(res5.isLocked).toBe(true);
      expect(res5.lockoutSecondsRemaining).toBe(30);
      expect(res5.attemptsRemaining).toBe(0);

      expect(limiter.isLocked).toBe(true);
      expect(limiter.lockoutSecondsRemaining).toBe(30);
    });

    it('prevents additional attempts while locked out and ticks down sequentially', () => {
      const limiter = createRateLimiter({ maxAttempts: 5, lockoutDuration: 30, storage: mockStorage });

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        limiter.recordFailedAttempt();
      }
      expect(limiter.isLocked).toBe(true);

      // Attempt while locked out should reject
      const rejectRes = limiter.recordFailedAttempt();
      expect(rejectRes.isLocked).toBe(true);

      // Tick down 3 seconds
      limiter.tick(); // 29
      expect(limiter.lockoutSecondsRemaining).toBe(29);
      expect(limiter.isLocked).toBe(true);

      limiter.tick(); // 28
      expect(limiter.lockoutSecondsRemaining).toBe(28);

      limiter.tick(); // 27
      expect(limiter.lockoutSecondsRemaining).toBe(27);
    });

    it('lockout expires after countdown and allows subsequent attempt', () => {
      const limiter = createRateLimiter({ maxAttempts: 5, lockoutDuration: 3, storage: mockStorage });

      for (let i = 0; i < 5; i++) {
        limiter.recordFailedAttempt();
      }
      expect(limiter.isLocked).toBe(true);
      expect(limiter.lockoutSecondsRemaining).toBe(3);

      // Tick 1
      limiter.tick();
      expect(limiter.lockoutSecondsRemaining).toBe(2);
      expect(limiter.isLocked).toBe(true);

      // Tick 2
      limiter.tick();
      expect(limiter.lockoutSecondsRemaining).toBe(1);
      expect(limiter.isLocked).toBe(true);

      // Tick 3 (Expires!)
      limiter.tick();
      expect(limiter.lockoutSecondsRemaining).toBe(0);
      expect(limiter.isLocked).toBe(false);
      expect(limiter.failedAttempts).toBe(0);

      // Subsequent attempt now allowed
      const nextAttempt = limiter.recordFailedAttempt();
      expect(nextAttempt.isLocked).toBe(false);
      expect(nextAttempt.attemptsRemaining).toBe(4);
      expect(limiter.failedAttempts).toBe(1);
    });

    it('resets cleanly when reset() is invoked upon successful authentication', () => {
      const limiter = createRateLimiter({ maxAttempts: 5, lockoutDuration: 30, storage: mockStorage });

      limiter.recordFailedAttempt();
      limiter.recordFailedAttempt();
      expect(limiter.failedAttempts).toBe(2);

      limiter.reset();
      expect(limiter.failedAttempts).toBe(0);
      expect(limiter.lockoutSecondsRemaining).toBe(0);
      expect(limiter.isLocked).toBe(false);
    });
  });
});
