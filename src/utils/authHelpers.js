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
  advisorName: 'Prof Wood',
  advisorUsername: 'mwood',
  advisorEmail: 'mwood@lindenwood.edu'
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
        advisorName: parsed.advisorName || DEFAULT_ADVISOR_PERSONA.advisorName,
        advisorUsername: parsed.advisorUsername || DEFAULT_ADVISOR_PERSONA.advisorUsername,
        advisorEmail: parsed.advisorEmail || `${parsed.advisorUsername || DEFAULT_ADVISOR_PERSONA.advisorUsername}@lindenwood.edu`
      };
    }
  } catch (e) {
    // Graceful fallback on corrupt storage
  }
  return { ...DEFAULT_ADVISOR_PERSONA };
}

/**
 * Resolves full faculty profile from advisor persona fields.
 * @param {object} persona
 * @returns {object} Full faculty profile compatible with HeaderNav and audits
 */
export function buildFacultyProfile(persona = {}) {
  const cleanName = (persona.advisorName || DEFAULT_ADVISOR_PERSONA.advisorName).trim();
  const cleanUsername = (persona.advisorUsername || DEFAULT_ADVISOR_PERSONA.advisorUsername).trim().toLowerCase();
  const email = `${cleanUsername}@lindenwood.edu`;

  const nameParts = cleanName.split(' ');
  const firstName = nameParts[0] || 'Prof';
  const lastName = nameParts.slice(1).join(' ') || 'Wood';

  return {
    advisorName: cleanName,
    advisorUsername: cleanUsername,
    advisorEmail: email,
    first_name: firstName,
    last_name: lastName,
    email,
    username_prefix: cleanUsername,
    position_title: 'Senior Instructor, Mathematics',
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
