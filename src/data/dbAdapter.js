/**
 * Degree Planner Deterministic Core
 * Read-Only Database Adapter (dbAdapter.js)
 * 
 * Supports 100% deterministic, offline-first execution directly from masterDatabase.json.
 * Architecture Invariant: Immutable client-side catalog. All data reads directly from
 * static, pre-compiled institutional JSON assets. No local database mutations or browser storage writes.
 * FERPA Invariant: Zero student PII storage; stores and queries only non-FERPA public curriculum metadata.
 */

import seedData from './masterDatabase.json' with { type: 'json' };

const DB_NAME = 'DegreePlannerDB';
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
    this.memoryCache = seedData;
    this.isInitialized = true;
  }

  /**
   * Initialize adapter: performs one-time cleanup of any legacy browser database artifacts
   * and sets in-memory cache directly from the immutable seedData bundle.
   */
  async initDatabase() {
    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
        if (window.indexedDB && window.indexedDB.deleteDatabase) {
          window.indexedDB.deleteDatabase(DB_NAME);
        }
      } catch (err) {
        // Ignore storage isolation errors in constrained testing environments
      }
    }
    this.memoryCache = seedData;
    this.isInitialized = true;
    return this.memoryCache;
  }

  /**
   * Reset in-memory database back to factory seed defaults.
   */
  async resetDatabase() {
    this.memoryCache = seedData;
    return this.memoryCache;
  }

  // ==========================================
  // DETERMINISTIC READ-ONLY APIS
  // ==========================================

  async getCatalogYears() {
    return this.memoryCache.catalog_years || seedData.catalog_years || [];
  }

  async getPrograms(catalogYearId = null) {
    const list = this.memoryCache.programs || seedData.programs || [];
    if (!catalogYearId) return list;
    return list.filter((p) => p.catalog_year_id === catalogYearId);
  }

  async getProgramById(programId) {
    const list = this.memoryCache.programs || seedData.programs || [];
    return list.find((p) => p.id === programId) || null;
  }

  async getCourses() {
    return this.memoryCache.courses || seedData.courses || [];
  }

  async getPlaceholders() {
    const list = this.memoryCache.courses || seedData.courses || [];
    return list.filter((c) => c.type === 'placeholder');
  }

  getPlaceholdersSync() {
    const list = this.memoryCache?.courses || seedData.courses || [];
    return list.filter((c) => c.type === 'placeholder');
  }

  async getConcreteCourses() {
    const list = this.memoryCache.courses || seedData.courses || [];
    return list.filter(
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

    // 5. Wildcard prefix match for numbered elective instances (e.g., 'UL-ELEC 30001', 'ELEC 10002', 'REQ_ELEC_UPPER_1')
    if (raw.startsWith('UL-ELEC') || raw.startsWith('ULELEC') || raw.startsWith('REQ_ELEC_UPPER')) {
      return list.find((c) => c.code === 'REQ_ELEC_UPPER') || null;
    }
    if (raw.startsWith('ELEC') || raw.startsWith('REQ_ELEC_GEN')) {
      return list.find((c) => c.code === 'REQ_ELEC_GEN') || null;
    }

    return null;
  }

  async getCourse(code) {
    return this.getCourseSync(code);
  }

  async resolveCourse(code) {
    return this.getCourse(code);
  }

  async getDegreePolicies() {
    return this.memoryCache.degree_policies || seedData.degree_policies;
  }

  async getGEWaterfallSchema() {
    return this.memoryCache.ge_waterfall_schema || seedData.ge_waterfall_schema || [];
  }

  async getGEPopularityStats() {
    return this.memoryCache.ge_popularity_stats || seedData.ge_popularity_stats || [];
  }

  async getFacultyProfile(usernamePrefixOrEmail) {
    const query = (usernamePrefixOrEmail || '').trim().toLowerCase();
    const list = this.memoryCache.faculty_profiles || seedData.faculty_profiles || [];
    return (
      list.find(
        (f) =>
          f.email.toLowerCase() === query ||
          f.username_prefix.toLowerCase() === query ||
          f.email.toLowerCase().startsWith(query + '@')
      ) || null
    );
  }
}

// Export singleton adapter instance
export const dbAdapter = new DatabaseAdapter();
export default dbAdapter;
