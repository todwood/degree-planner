/**
 * Degree Planner Deterministic Core
 * Dual Database Adapter (dbAdapter.js)
 * 
 * Supports 100% offline-first execution via IndexedDB / localStorage persistence,
 * seeded from masterDatabase.json, with pluggable Supabase cloud sync readiness.
 * FERPA Non-Negotiable: Stores ONLY non-FERPA public curriculum and institutional metadata.
 */

import seedData from './masterDatabase.json' with { type: 'json' };

const DB_NAME = 'DegreePlannerDB';
const DB_VERSION = 1;
const STORE_COURSES = 'courses';
const STORE_PROGRAMS = 'programs';
const STORE_CATALOG_YEARS = 'catalog_years';
const STORE_POLICIES = 'degree_policies';
const STORE_GE_SCHEMA = 'ge_waterfall_schema';
const STORE_GE_STATS = 'ge_popularity_stats';
const STORE_FACULTY = 'faculty_profiles';

const LOCAL_STORAGE_KEY = 'lu_degree_planner_db_v1';

/**
 * Deterministic Placeholder Legacy Aliases Table
 * Maps legacy audit strings, program requirements, and Workflow B drawer codes
 * to canonical placeholder tokens defined in masterDatabase.json.
 */
export const PLACEHOLDER_LEGACY_ALIASES = {
  // Legacy Waterfall Audit codes -> Canonical Tokens
  'GE 1': 'ENGL 15000',
  'GE 2': 'REQ_GE_COMP2',
  'GE 3': 'REQ_GE_MATH',
  'GE 4': 'REQ_GE_US_HIST_GOV',
  'GE 5': 'REQ_GE_SOC_SCI',
  'GE 6': 'REQ_GE_NAT_SCI_LAB',
  'GE 7': 'REQ_GE_SCI_ELEC',
  'GE 8': 'REQ_GE_MATH',
  'GE 9': 'REQ_GE_ART',
  'GE 10': 'REQ_GE_LIT',
  'GE 11': 'REQ_GE_HC_NON_LIT_ART',
  'GE 12': 'REQ_GE_HC_ELEC',
  'GE 13': 'REQ_GE_ELEC1',
  'GE 14': 'REQ_GE_ELEC2',

  // Program math requirements & retired tokens
  'REQ_GE_MATH_ELEC': 'REQ_GE_MATH',
  'REQGEMATHELEC': 'REQ_GE_MATH',
  'GE-MATH-ELECTIVE': 'REQ_GE_MATH',
  'GEMATHELECTIVE': 'REQ_GE_MATH',
  'GE-MATH': 'REQ_GE_MATH',

  // Screen 1 Tray legacy strings
  'GE: FINE ARTS': 'REQ_GE_ART',
  'GE: LITERATURE': 'REQ_GE_LIT',
  'GE: NON-LIT/ARTS': 'REQ_GE_HC_NON_LIT_ART',
  'GE: HUMAN CULTURE': 'REQ_GE_HC_ELEC',
  'GE: U.S. HIST/GOV': 'REQ_GE_US_HIST_GOV',
  'GE: SOCIAL SCIENCE': 'REQ_GE_SOC_SCI',
  'GE: NAT SCIENCE W/ LAB': 'REQ_GE_NAT_SCI_LAB',
  'GE: ELECTIVE I': 'REQ_GE_ELEC1',
  'GE: ELECTIVE II': 'REQ_GE_ELEC2',

  // Compact tokens & aliases
  'GE_ARTS': 'REQ_GE_ART',
  'GE_LIT': 'REQ_GE_LIT',
  'GE_USHIS': 'REQ_GE_US_HIST_GOV',
  'GE_SOC': 'REQ_GE_SOC_SCI',
  'GE_SCI': 'REQ_GE_NAT_SCI_LAB',
  'GE_HC1': 'REQ_GE_HC_NON_LIT_ART',
  'GE_HC2': 'REQ_GE_HC_ELEC',
  'GE_ELEC1': 'REQ_GE_ELEC1',
  'GE_ELEC2': 'REQ_GE_ELEC2',
  'GE_COMP_1': 'ENGL 15000',
  'REQ_GE_COMP1': 'ENGL 15000',
  'REQGECOMP1': 'ENGL 15000',
  'GE_COMP_2': 'REQ_GE_COMP2',
  'GE_MATH': 'REQ_GE_MATH',
  'GE_US_HIST_GOV': 'REQ_GE_US_HIST_GOV',
  'GE_SOC_SCI': 'REQ_GE_SOC_SCI',
  'GE_NAT_SCI_LAB': 'REQ_GE_NAT_SCI_LAB',
  'GE_SCI_ELECTIVE': 'REQ_GE_SCI_ELEC',
  'GE_STEM_ELECTIVE': 'REQ_GE_MATH_ELEC',
  'GE_HUMAN_CULTURE_1': 'REQ_GE_HC_NON_LIT_ART',
  'GE_HUMAN_CULTURE_2': 'REQ_GE_HC_ELEC',
  'GE_GE_ELECTIVE_1': 'REQ_GE_ELEC1',
  'GE_GE_ELECTIVE_2': 'REQ_GE_ELEC2',

  // Elective gap wildcards / titles
  'ELECTIVE': 'REQ_ELEC_GEN',
  'GENERAL ELECTIVE': 'REQ_ELEC_GEN',
  'UPPER-LEVEL ELECTIVE': 'REQ_ELEC_UPPER',
  'UPPER-LEVEL ELECTIVE (30000+)': 'REQ_ELEC_UPPER'
};

class DatabaseAdapter {
  constructor() {
    this.idb = null;
    this.memoryCache = null;
    this.isInitialized = false;
  }

  /**
   * Initialize local database: IndexedDB -> localStorage -> in-memory fallback.
   */
  async initDatabase() {
    if (this.isInitialized && this.memoryCache) {
      return this.memoryCache;
    }

    try {
      if (typeof window !== 'undefined' && window.indexedDB) {
        this.idb = await this._openIndexedDB();
        const courses = await this._getAllFromStore(STORE_COURSES);
        if (!courses || courses.length === 0) {
          await this._seedIndexedDB();
        }
        this.memoryCache = await this._loadAllFromIndexedDB();
      } else {
        this._initLocalStorage();
      }
    } catch (err) {
      console.warn('IndexedDB unavailable or failed, falling back to localStorage/memory:', err);
      this._initLocalStorage();
    }

    this.isInitialized = true;
    return this.memoryCache;
  }

  _openIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_COURSES)) {
          db.createObjectStore(STORE_COURSES, { keyPath: 'code' });
        }
        if (!db.objectStoreNames.contains(STORE_PROGRAMS)) {
          db.createObjectStore(STORE_PROGRAMS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CATALOG_YEARS)) {
          db.createObjectStore(STORE_CATALOG_YEARS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_POLICIES)) {
          db.createObjectStore(STORE_POLICIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_GE_SCHEMA)) {
          db.createObjectStore(STORE_GE_SCHEMA, { keyPath: 'bucket_id' });
        }
        if (!db.objectStoreNames.contains(STORE_GE_STATS)) {
          db.createObjectStore(STORE_GE_STATS, { keyPath: 'course_code' });
        }
        if (!db.objectStoreNames.contains(STORE_FACULTY)) {
          db.createObjectStore(STORE_FACULTY, { keyPath: 'email' });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async _seedIndexedDB() {
    const tx = this.idb.transaction(
      [
        STORE_COURSES,
        STORE_PROGRAMS,
        STORE_CATALOG_YEARS,
        STORE_POLICIES,
        STORE_GE_SCHEMA,
        STORE_GE_STATS,
        STORE_FACULTY
      ],
      'readwrite'
    );

    const courseStore = tx.objectStore(STORE_COURSES);
    for (const course of seedData.courses) {
      courseStore.put(course);
    }

    const programStore = tx.objectStore(STORE_PROGRAMS);
    for (const program of seedData.programs) {
      programStore.put(program);
    }

    const yearStore = tx.objectStore(STORE_CATALOG_YEARS);
    for (const yr of seedData.catalog_years) {
      yearStore.put(yr);
    }

    const policyStore = tx.objectStore(STORE_POLICIES);
    policyStore.put({ id: 'current', ...seedData.degree_policies });

    const geStore = tx.objectStore(STORE_GE_SCHEMA);
    for (const bucket of seedData.ge_waterfall_schema) {
      geStore.put(bucket);
    }

    const statsStore = tx.objectStore(STORE_GE_STATS);
    for (const stat of seedData.ge_popularity_stats) {
      statsStore.put(stat);
    }

    const facultyStore = tx.objectStore(STORE_FACULTY);
    for (const fac of seedData.faculty_profiles) {
      facultyStore.put(fac);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async _loadAllFromIndexedDB() {
    const [courses, programs, catalog_years, policies, ge_waterfall_schema, ge_popularity_stats, faculty_profiles] =
      await Promise.all([
        this._getAllFromStore(STORE_COURSES),
        this._getAllFromStore(STORE_PROGRAMS),
        this._getAllFromStore(STORE_CATALOG_YEARS),
        this._getAllFromStore(STORE_POLICIES),
        this._getAllFromStore(STORE_GE_SCHEMA),
        this._getAllFromStore(STORE_GE_STATS),
        this._getAllFromStore(STORE_FACULTY)
      ]);

    return {
      version: seedData.version,
      courses,
      programs,
      catalog_years,
      degree_policies: policies && policies[0] ? policies[0] : seedData.degree_policies,
      ge_waterfall_schema,
      ge_popularity_stats,
      faculty_profiles
    };
  }

  _getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.idb.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _initLocalStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          this.memoryCache = JSON.parse(saved);
          return;
        } catch (e) {
          console.error('Failed to parse localStorage cache, resetting:', e);
        }
      }
    }
    // Deep clone from seedData
    this.memoryCache = JSON.parse(JSON.stringify(seedData));
    this._persistLocalStorage();
  }

  _persistLocalStorage() {
    if (typeof window !== 'undefined' && window.localStorage && this.memoryCache) {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.memoryCache));
      } catch (e) {
        console.warn('localStorage persist quota exceeded or failed:', e);
      }
    }
  }

  // ==========================================
  // PUBLIC READ APIS
  // ==========================================

  async getCatalogYears() {
    await this.initDatabase();
    return this.memoryCache.catalog_years || [];
  }

  async getPrograms(catalogYearId = null) {
    await this.initDatabase();
    if (!catalogYearId) return this.memoryCache.programs || [];
    return (this.memoryCache.programs || []).filter((p) => p.catalog_year_id === catalogYearId);
  }

  async getProgramById(programId) {
    await this.initDatabase();
    return (this.memoryCache.programs || []).find((p) => p.id === programId) || null;
  }

  async getCourses() {
    await this.initDatabase();
    return this.memoryCache.courses || [];
  }

  async getPlaceholders() {
    await this.initDatabase();
    return (this.memoryCache.courses || []).filter((c) => c.type === 'placeholder');
  }

  getPlaceholdersSync() {
    const list = this.memoryCache?.courses || seedData.courses || [];
    return list.filter((c) => c.type === 'placeholder');
  }

  async getConcreteCourses() {
    await this.initDatabase();
    return (this.memoryCache.courses || []).filter(
      (c) => c.type === 'concrete' || (!c.type && !c.code.startsWith('REQ_'))
    );
  }

  getConcreteCoursesSync() {
    const list = this.memoryCache?.courses || seedData.courses || [];
    return list.filter(
      (c) => c.type === 'concrete' || (!c.type && !c.code.startsWith('REQ_'))
    );
  }

  isPlaceholder(code) {
    if (!code) return false;
    const raw = String(code).trim().toUpperCase();
    if (
      raw.startsWith('REQ_') ||
      raw.startsWith('UL-ELEC') ||
      raw.startsWith('ULELEC') ||
      raw.startsWith('ELEC')
    ) {
      return true;
    }
    if (PLACEHOLDER_LEGACY_ALIASES[raw] || PLACEHOLDER_LEGACY_ALIASES[raw.replace(/\s+/g, '')]) return true;
    const list = this.memoryCache?.courses || seedData.courses || [];
    const found = list.find((c) => c.code.toUpperCase() === raw);
    if (found && found.type === 'placeholder') return true;
    return false;
  }

  getCourseSync(code) {
    if (!code) return null;
    const raw = String(code).trim().toUpperCase();
    const compact = raw.replace(/\s+/g, '');
    const list = this.memoryCache?.courses || seedData.courses || [];

    // 1. Resolve via legacy alias table if explicitly mapped to another canonical course (e.g. 'GE 1', 'GE_COMP_1', or 'REQ_GE_COMP1' -> 'ENGL 15000')
    const canonicalToken = PLACEHOLDER_LEGACY_ALIASES[raw] || PLACEHOLDER_LEGACY_ALIASES[compact];
    if (canonicalToken && canonicalToken.toUpperCase() !== raw && canonicalToken.toUpperCase() !== compact) {
      const aliasFound = list.find((c) => c.code.toUpperCase() === canonicalToken.toUpperCase());
      if (aliasFound) return aliasFound;
    }

    // 2. Direct match on code
    let found = list.find((c) => c.code.toUpperCase() === raw);
    if (found) return found;

    // 3. Direct match on compact code (e.g. 'ICS21300' or 'REQ_GE_ART')
    found = list.find(
      (c) => (c.compactCode || c.code.replace(/\s+/g, '')).toUpperCase() === compact
    );
    if (found) return found;

    // 4. Fallback resolve via legacy alias table
    if (canonicalToken) {
      found = list.find((c) => c.code.toUpperCase() === canonicalToken.toUpperCase());
      if (found) return found;
    }

    // 4. Wildcard prefix match for numbered elective instances (e.g., 'UL-ELEC 30001', 'ELEC 10002', 'REQ_ELEC_UPPER_1')
    if (raw.startsWith('UL-ELEC') || raw.startsWith('ULELEC') || raw.startsWith('REQ_ELEC_UPPER')) {
      return list.find((c) => c.code === 'REQ_ELEC_UPPER') || null;
    }
    if (raw.startsWith('ELEC') || raw.startsWith('REQ_ELEC_GEN')) {
      return list.find((c) => c.code === 'REQ_ELEC_GEN') || null;
    }

    return null;
  }

  async getCourse(code) {
    await this.initDatabase();
    return this.getCourseSync(code);
  }

  async resolveCourse(code) {
    return this.getCourse(code);
  }

  async getDegreePolicies() {
    await this.initDatabase();
    return this.memoryCache.degree_policies || seedData.degree_policies;
  }

  async getGEWaterfallSchema() {
    await this.initDatabase();
    return this.memoryCache.ge_waterfall_schema || seedData.ge_waterfall_schema;
  }

  async getGEPopularityStats() {
    await this.initDatabase();
    return this.memoryCache.ge_popularity_stats || [];
  }

  async getFacultyProfile(usernamePrefixOrEmail) {
    await this.initDatabase();
    const query = (usernamePrefixOrEmail || '').trim().toLowerCase();
    const list = this.memoryCache.faculty_profiles || [];
    return (
      list.find(
        (f) =>
          f.email.toLowerCase() === query ||
          f.username_prefix.toLowerCase() === query ||
          f.email.toLowerCase().startsWith(query + '@')
      ) || null
    );
  }

  // ==========================================
  // TWO-KEY PEER VERIFICATION & MUTATION APIS
  // ==========================================

  /**
   * Save or update course offerings/prerequisites with Two-Key Peer Verification:
   * - First submission by advisor: tagged as 'Tentative (*)', submitted_by = advisorEmail.
   * - Second submission by a distinct institutional advisor: promoted to 'Verified'.
   */
  async saveCourse(courseData, advisorEmail = 'system') {
    await this.initDatabase();
    const code = (courseData.code || '').trim().toUpperCase();
    const existingIndex = (this.memoryCache.courses || []).findIndex(
      (c) => c.code.toUpperCase() === code
    );

    let updatedCourse = { ...courseData, code };

    if (existingIndex >= 0) {
      const existing = this.memoryCache.courses[existingIndex];

      // Mutation Guard: Prevent modifying system-locked requirement placeholders unless by system
      if (existing.system_locked && advisorEmail !== 'system') {
        throw new Error(`Cannot modify system-locked requirement placeholder "${code}".`);
      }

      // Check Two-Key Peer Verification rule
      const isDistinctAdvisor =
        existing.verification_status === 'Tentative' &&
        existing.submitted_by &&
        existing.submitted_by.toLowerCase() !== advisorEmail.toLowerCase() &&
        (advisorEmail.toLowerCase().includes('@') || advisorEmail.toLowerCase().endsWith('.edu'));

      if (isDistinctAdvisor) {
        // Second distinct advisor confirms -> Promote to 'Verified'
        updatedCourse.verification_status = 'Verified';
        updatedCourse.verified_by = advisorEmail;
      } else if (existing.verification_status === 'Verified') {
        // Keep verified unless explicitly altered by single advisor without consensus
        updatedCourse.verification_status = existing.verification_status;
      } else {
        updatedCourse.verification_status = 'Tentative';
        updatedCourse.submitted_by = advisorEmail;
      }
      this.memoryCache.courses[existingIndex] = updatedCourse;
    } else {
      // New course
      updatedCourse.verification_status = advisorEmail === 'system' ? 'Verified' : 'Tentative';
      updatedCourse.submitted_by = advisorEmail;
      this.memoryCache.courses.push(updatedCourse);
    }

    // Persist to IDB if active
    if (this.idb) {
      const tx = this.idb.transaction(STORE_COURSES, 'readwrite');
      tx.objectStore(STORE_COURSES).put(updatedCourse);
    }
    this._persistLocalStorage();
    return updatedCourse;
  }

  /**
   * Add a Policy Exception (PE) note to a course.
   */
  async addPolicyException(courseCode, peNote, advisorEmail) {
    await this.initDatabase();
    const course = await this.getCourse(courseCode);
    if (!course) return null;

    if (!course.pe_notes) course.pe_notes = [];
    const noteEntry = {
      note: peNote,
      advisor_email: advisorEmail,
      timestamp: new Date().toISOString()
    };
    course.pe_notes.push(noteEntry);

    return this.saveCourse(course, advisorEmail);
  }

  /**
   * Delete a course with protection for system-locked requirement placeholders.
   */
  async deleteCourse(courseCode, advisorEmail = 'system') {
    await this.initDatabase();
    const norm = (courseCode || '').trim().toUpperCase();
    const existingIndex = (this.memoryCache.courses || []).findIndex(
      (c) => c.code.toUpperCase() === norm
    );

    if (existingIndex >= 0) {
      const existing = this.memoryCache.courses[existingIndex];
      if (existing.system_locked && advisorEmail !== 'system') {
        throw new Error(`Cannot delete system-locked requirement placeholder "${norm}".`);
      }
      this.memoryCache.courses.splice(existingIndex, 1);
      if (this.idb) {
        const tx = this.idb.transaction(STORE_COURSES, 'readwrite');
        tx.objectStore(STORE_COURSES).delete(norm);
      }
      this._persistLocalStorage();
      return true;
    }
    return false;
  }

  /**
   * Increment anonymous 2-year GE completion stats.
   */
  async incrementGEStat(courseCode, gradePoints = 4.0) {
    await this.initDatabase();
    const stats = this.memoryCache.ge_popularity_stats || [];
    const existing = stats.find((s) => s.course_code.toUpperCase() === courseCode.toUpperCase());

    if (existing) {
      const prevTotal = existing.completion_count_2yr * existing.average_grade_points;
      existing.completion_count_2yr += 1;
      existing.average_grade_points = Number(
        ((prevTotal + gradePoints) / existing.completion_count_2yr).toFixed(2)
      );
    }

    if (this.idb && existing) {
      const tx = this.idb.transaction(STORE_GE_STATS, 'readwrite');
      tx.objectStore(STORE_GE_STATS).put(existing);
    }
    this._persistLocalStorage();
  }

  /**
   * Save or update faculty profile.
   */
  async saveFacultyProfile(profile) {
    await this.initDatabase();
    const list = this.memoryCache.faculty_profiles || [];
    const index = list.findIndex((f) => f.email.toLowerCase() === profile.email.toLowerCase());
    if (index >= 0) {
      list[index] = { ...list[index], ...profile };
    } else {
      list.push(profile);
    }

    if (this.idb) {
      const tx = this.idb.transaction(STORE_FACULTY, 'readwrite');
      tx.objectStore(STORE_FACULTY).put(profile);
    }
    this._persistLocalStorage();
    return profile;
  }

  /**
   * Save or update degree program checklist.
   */
  async saveProgram(programData) {
    await this.initDatabase();
    if (!this.memoryCache.programs) {
      this.memoryCache.programs = JSON.parse(JSON.stringify(seedData.programs || []));
    }
    const idx = this.memoryCache.programs.findIndex((p) => p.id === programData.id);
    if (idx >= 0) {
      this.memoryCache.programs[idx] = { ...this.memoryCache.programs[idx], ...programData };
    } else {
      this.memoryCache.programs.push(programData);
    }
    this._persistLocalStorage();
    return programData;
  }

  /**
   * Reset database back to factory seed defaults.
   */
  async resetDatabase() {
    this.memoryCache = JSON.parse(JSON.stringify(seedData));
    if (this.idb) {
      await this._seedIndexedDB();
    }
    this._persistLocalStorage();
    return this.memoryCache;
  }
}

// Export singleton adapter instance
export const dbAdapter = new DatabaseAdapter();
export default dbAdapter;
