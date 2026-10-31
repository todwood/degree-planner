/**
 * Deterministic Authentication & Advisor Persona Helpers
 * File: src/utils/authHelpers.js
 * 
 * Separates device authorization memory ('lu_device_authorized') from active
 * session state ('lu_advisor_session') while preserving the last-used persona
 * ('lu_last_advisor_persona') for zero-passphrase friction on verified devices.
 */

export const AUTHORIZED_PASSPHRASE = 'lionsplanahead';
export const MASKED_PASSPHRASE = '••••••••••••';

export const DEFAULT_ADVISOR_PERSONA = {
  advisorName: '',
  advisorUsername: '',
  advisorEmail: ''
};

/**
 * Validates department passphrase (case-insensitive, trimmed).
 * @param {string} input 
 * @returns {boolean}
 */
export function validatePassphrase(input) {
  if (typeof input !== 'string') return false;
  return input.trim().toLowerCase() === AUTHORIZED_PASSPHRASE;
}

/**
 * Checks if the current browser environment/device has been previously unlocked.
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function isDeviceAuthorized(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return false;
  return storage.getItem('lu_device_authorized') === 'true';
}

/**
 * Marks device as authorized permanently in localStorage.
 * @param {Storage} [storage]
 */
export function authorizeDevice(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return;
  storage.setItem('lu_device_authorized', 'true');
}

/**
 * Retrieves the last-used advisor persona or falls back to default.
 * @param {Storage} [storage]
 * @returns {{ advisorName: string, advisorUsername: string, advisorEmail: string }}
 */
export function getSavedAdvisorPersona(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return { ...DEFAULT_ADVISOR_PERSONA };
  try {
    const raw = storage.getItem('lu_last_advisor_persona');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        advisorName: parsed.advisorName || '',
        advisorUsername: parsed.advisorUsername || '',
        advisorEmail: parsed.advisorEmail || (parsed.advisorUsername ? `${parsed.advisorUsername}@lindenwood.edu` : '')
      };
    }
  } catch (e) {
    // Graceful fallback on corrupt storage
  }
  return { ...DEFAULT_ADVISOR_PERSONA };
}

/**
 * Resolves full faculty profile from advisor persona fields.
 * Optional persona fields: if blank, maintains clean empty strings.
 * @param {object} persona
 * @returns {object} Full faculty profile compatible with HeaderNav and audits
 */
export function buildFacultyProfile(persona = {}) {
  const cleanName = (persona.advisorName || '').trim();
  const cleanUsername = (persona.advisorUsername || '').trim().toLowerCase();
  const email = cleanUsername ? `${cleanUsername}@lindenwood.edu` : (persona.advisorEmail || '');

  const nameParts = cleanName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  return {
    advisorName: cleanName,
    advisorUsername: cleanUsername,
    advisorEmail: email,
    first_name: firstName,
    last_name: lastName,
    email,
    username_prefix: cleanUsername,
    position_title: 'Faculty Advisor',
    department: 'College of Science, Technology, and Health',
    photo_url: ''
  };
}

/**
 * Saves persona to session and updates device authorization and last-used persona.
 * @param {object} persona 
 * @param {Storage} [storage] 
 * @returns {object} The full faculty profile
 */
export function saveAdvisorSession(persona, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const profile = buildFacultyProfile(persona);
  if (storage) {
    storage.setItem('lu_device_authorized', 'true');
    storage.setItem('lu_last_advisor_persona', JSON.stringify({
      advisorName: profile.advisorName,
      advisorUsername: profile.advisorUsername,
      advisorEmail: profile.advisorEmail
    }));
    storage.setItem('lu_advisor_session', JSON.stringify(profile));
  }
  return profile;
}

/**
 * Signs out advisor: resets active session while strictly preserving device authorization
 * and the last-used persona fields for frictionless re-entry.
 * @param {Storage} [storage]
 */
export function clearAdvisorSession(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return;
  storage.removeItem('lu_advisor_session');
}

/**
 * Sign-Out 3-Second Lockout Manager.
 * Ensures the confirm button cannot be executed prematurely.
 */
export function createSignOutCountdown({ duration = 3, onComplete } = {}) {
  let secondsRemaining = duration;
  let isComplete = false;

  return {
    get secondsRemaining() {
      return secondsRemaining;
    },
    get isLocked() {
      return secondsRemaining > 0;
    },
    tick() {
      if (secondsRemaining > 0) {
        secondsRemaining -= 1;
        if (secondsRemaining === 0) {
          isComplete = true;
          onComplete?.();
        }
      }
      return secondsRemaining;
    },
    reset(newDuration = duration) {
      secondsRemaining = newDuration;
      isComplete = false;
    }
  };
}

/**
 * Profile Popover State Manager.
 */
export function createPopoverManager({ onOpen, onClose } = {}) {
  let isOpen = false;

  return {
    get isOpen() {
      return isOpen;
    },
    open() {
      isOpen = true;
      onOpen?.();
    },
    close() {
      isOpen = false;
      onClose?.();
    },
    toggle() {
      isOpen = !isOpen;
      if (isOpen) onOpen?.();
      else onClose?.();
      return isOpen;
    }
  };
}

/**
 * 5-Attempt Client-Side Rate Limiter.
 * Tracks failed attempts; triggers a 30s lockout after 5 consecutive failures.
 * Storage defaults to sessionStorage if present, or custom Storage instance.
 */
export function createRateLimiter({
  maxAttempts = 5,
  lockoutDuration = 30,
  storage = (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
} = {}) {
  let failedAttempts = 0;
  let lockoutSecondsRemaining = 0;

  if (storage) {
    try {
      const storedAttempts = parseInt(storage.getItem('lu_failed_attempts') || '0', 10);
      const storedLockoutUntil = parseInt(storage.getItem('lu_lockout_until') || '0', 10);
      const now = Math.floor(Date.now() / 1000);

      if (storedLockoutUntil > now) {
        failedAttempts = maxAttempts;
        lockoutSecondsRemaining = storedLockoutUntil - now;
      } else if (!isNaN(storedAttempts)) {
        failedAttempts = storedAttempts;
      }
    } catch (e) {
      // Ignore storage read errors
    }
  }

  return {
    get failedAttempts() {
      return failedAttempts;
    },
    get lockoutSecondsRemaining() {
      return lockoutSecondsRemaining;
    },
    get isLocked() {
      return lockoutSecondsRemaining > 0;
    },
    recordFailedAttempt() {
      if (lockoutSecondsRemaining > 0) {
        return { isLocked: true, lockoutSecondsRemaining, attemptsRemaining: 0 };
      }
      failedAttempts += 1;
      if (failedAttempts >= maxAttempts) {
        lockoutSecondsRemaining = lockoutDuration;
        if (storage) {
          try {
            storage.setItem('lu_failed_attempts', String(failedAttempts));
            storage.setItem('lu_lockout_until', String(Math.floor(Date.now() / 1000) + lockoutDuration));
          } catch (e) {}
        }
        return { isLocked: true, lockoutSecondsRemaining, attemptsRemaining: 0 };
      }
      if (storage) {
        try {
          storage.setItem('lu_failed_attempts', String(failedAttempts));
        } catch (e) {}
      }
      return { isLocked: false, lockoutSecondsRemaining: 0, attemptsRemaining: maxAttempts - failedAttempts };
    },
    tick() {
      if (lockoutSecondsRemaining > 0) {
        lockoutSecondsRemaining -= 1;
        if (lockoutSecondsRemaining === 0) {
          failedAttempts = 0;
          if (storage) {
            try {
              storage.removeItem('lu_failed_attempts');
              storage.removeItem('lu_lockout_until');
            } catch (e) {}
          }
        }
      }
      return lockoutSecondsRemaining;
    },
    reset() {
      failedAttempts = 0;
      lockoutSecondsRemaining = 0;
      if (storage) {
        try {
          storage.removeItem('lu_failed_attempts');
          storage.removeItem('lu_lockout_until');
        } catch (e) {}
      }
    }
  };
}
