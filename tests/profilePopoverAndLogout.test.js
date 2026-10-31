import { describe, it, expect, beforeEach } from 'vitest';
import {
  validatePassphrase,
  isDeviceAuthorized,
  authorizeDevice,
  getSavedAdvisorPersona,
  buildFacultyProfile,
  saveAdvisorSession,
  clearAdvisorSession,
  createSignOutCountdown,
  createPopoverManager,
  AUTHORIZED_PASSPHRASE,
  MASKED_PASSPHRASE,
  DEFAULT_ADVISOR_PERSONA
} from '../src/utils/authHelpers.js';

// Deterministic in-memory Storage mock for Vitest
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

describe('Profile Popover, Master Catalog Launcher & 3-Second Sign-Out Suite', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('1. Popover Menu State Invariants', () => {
    it('initializes closed and toggles open on avatar click', () => {
      let opened = false;
      let closed = false;
      const popover = createPopoverManager({
        onOpen: () => { opened = true; },
        onClose: () => { closed = true; }
      });

      expect(popover.isOpen).toBe(false);

      // Open on click
      popover.toggle();
      expect(popover.isOpen).toBe(true);
      expect(opened).toBe(true);

      // Close on backdrop/second click
      popover.close();
      expect(popover.isOpen).toBe(false);
      expect(closed).toBe(true);
    });

    it('closes popover immediately upon selecting an action item', () => {
      const popover = createPopoverManager();
      popover.open();
      expect(popover.isOpen).toBe(true);

      // Select Catalog action
      let catalogOpened = false;
      const handleCatalogClick = () => {
        popover.close();
        catalogOpened = true;
      };

      handleCatalogClick();
      expect(popover.isOpen).toBe(false);
      expect(catalogOpened).toBe(true);
    });
  });

  describe('2. 3-Second Sign-Out Lockout Timer', () => {
    it('initializes locked with a 3-second countdown', () => {
      const countdown = createSignOutCountdown({ duration: 3 });
      expect(countdown.secondsRemaining).toBe(3);
      expect(countdown.isLocked).toBe(true);
    });

    it('locks confirmation button for exactly 3 seconds, ticking down sequentially', () => {
      let completed = false;
      const countdown = createSignOutCountdown({
        duration: 3,
        onComplete: () => { completed = true; }
      });

      // At start (3s)
      expect(countdown.isLocked).toBe(true);
      expect(countdown.secondsRemaining).toBe(3);

      // After 1 second (2s)
      countdown.tick();
      expect(countdown.isLocked).toBe(true);
      expect(countdown.secondsRemaining).toBe(2);
      expect(completed).toBe(false);

      // After 2 seconds (1s)
      countdown.tick();
      expect(countdown.isLocked).toBe(true);
      expect(countdown.secondsRemaining).toBe(1);
      expect(completed).toBe(false);

      // After 3 seconds (0s - Enabled!)
      countdown.tick();
      expect(countdown.isLocked).toBe(false);
      expect(countdown.secondsRemaining).toBe(0);
      expect(completed).toBe(true);
    });

    it('does not tick past 0 seconds and stays enabled once unlocked', () => {
      const countdown = createSignOutCountdown({ duration: 3 });
      countdown.tick(); // 2
      countdown.tick(); // 1
      countdown.tick(); // 0
      expect(countdown.isLocked).toBe(false);

      countdown.tick(); // Extra tick
      expect(countdown.secondsRemaining).toBe(0);
      expect(countdown.isLocked).toBe(false);
    });
  });

  describe('3. Local Storage State Separation & Sign-Out Invariants', () => {
    it('identifies un-authorized first-time devices', () => {
      expect(isDeviceAuthorized(mockStorage)).toBe(false);
      expect(mockStorage.getItem('lu_device_authorized')).toBeNull();
    });

    it('validates department passphrase case-insensitively with whitespace trimming', () => {
      expect(validatePassphrase('lionsplanahead')).toBe(true);
      expect(validatePassphrase('LionsPlanAhead')).toBe(true);
      expect(validatePassphrase('  LIONSPLANAHEAD  ')).toBe(true);
      expect(validatePassphrase('wrongpass')).toBe(false);
      expect(validatePassphrase('')).toBe(false);
      expect(validatePassphrase(null)).toBe(false);
    });

    it('saves session, marks device authorized, and persists persona', () => {
      const persona = {
        advisorName: 'Prof Wood',
        advisorUsername: 'mwood'
      };

      const profile = saveAdvisorSession(persona, mockStorage);

      expect(mockStorage.getItem('lu_device_authorized')).toBe('true');
      expect(isDeviceAuthorized(mockStorage)).toBe(true);
      expect(mockStorage.getItem('lu_advisor_session')).toBeTruthy();
      expect(mockStorage.getItem('lu_last_advisor_persona')).toBeTruthy();

      expect(profile.advisorName).toBe('Prof Wood');
      expect(profile.advisorUsername).toBe('mwood');
      expect(profile.email).toBe('mwood@lindenwood.edu');
    });

    it('confirming sign-out clears active session while strictly retaining device authorization', () => {
      // 1. Log in
      saveAdvisorSession({ advisorName: 'Prof Wood', advisorUsername: 'mwood' }, mockStorage);
      expect(mockStorage.getItem('lu_advisor_session')).toBeTruthy();
      expect(mockStorage.getItem('lu_device_authorized')).toBe('true');

      // 2. Sign out
      clearAdvisorSession(mockStorage);

      // Session must be purged
      expect(mockStorage.getItem('lu_advisor_session')).toBeNull();

      // Device authorization MUST remain true
      expect(mockStorage.getItem('lu_device_authorized')).toBe('true');
      expect(isDeviceAuthorized(mockStorage)).toBe(true);

      // Last persona MUST remain stored
      const savedPersona = getSavedAdvisorPersona(mockStorage);
      expect(savedPersona.advisorName).toBe('Prof Wood');
      expect(savedPersona.advisorUsername).toBe('mwood');
    });
  });

  describe('4. Pre-filled Login Screen and Masked Passphrase Invariants', () => {
    it('displays pre-filled persona fields and masked passphrase on authorized device', () => {
      // Setup authorized device with previous persona
      authorizeDevice(mockStorage);
      mockStorage.setItem('lu_last_advisor_persona', JSON.stringify({
        advisorName: 'Dr. Jane Smith',
        advisorUsername: 'jsmith',
        advisorEmail: 'jsmith@lindenwood.edu'
      }));

      // Invariants for authorized device:
      expect(isDeviceAuthorized(mockStorage)).toBe(true);
      const persona = getSavedAdvisorPersona(mockStorage);
      expect(persona.advisorName).toBe('Dr. Jane Smith');
      expect(persona.advisorUsername).toBe('jsmith');
      expect(MASKED_PASSPHRASE).toBe('••••••••••••');
    });

    it('allows colleague to edit pre-filled persona on an authorized device without re-entering passphrase', () => {
      authorizeDevice(mockStorage);

      // Colleague logs in on same authorized device
      const colleagueProfile = saveAdvisorSession({
        advisorName: 'Prof Miller',
        advisorUsername: 'kmiller'
      }, mockStorage);

      expect(colleagueProfile.advisorName).toBe('Prof Miller');
      expect(colleagueProfile.advisorUsername).toBe('kmiller');
      expect(colleagueProfile.email).toBe('kmiller@lindenwood.edu');

      // Updated last persona stored
      const updatedPersona = getSavedAdvisorPersona(mockStorage);
      expect(updatedPersona.advisorName).toBe('Prof Miller');
      expect(updatedPersona.advisorUsername).toBe('kmiller');
      expect(isDeviceAuthorized(mockStorage)).toBe(true);
    });

    it('falls back to empty default persona if stored persona is missing or corrupted', () => {
      authorizeDevice(mockStorage);
      mockStorage.setItem('lu_last_advisor_persona', 'invalid-json');

      const persona = getSavedAdvisorPersona(mockStorage);
      expect(persona.advisorName).toBe('');
      expect(persona.advisorUsername).toBe('');
      expect(persona.advisorEmail).toBe('');
    });
  });
});
