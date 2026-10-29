/**
 * Degree Planner Deterministic Core
 * Stateful 5-Layer Claim-and-Remove Waterfall Audit Engine (src/engine/waterfallAudit.js)
 *
 * Implements:
 * - Layer 1: Specific GE Buckets (Buckets 1-12) with Composition C-or-higher gatekeepers
 * - Layer 2: Major Core, Emphasis, Dual-Counted Math (MTH 14100 + Any GE-Math), Legacy Substitutions,
 *            Advisor Overrides/PEs, and Cisco Concurrent Lab Exemption Rules
 * - Layer 3: Human Diversity (/HD) 2-Course (6cr) Attribute Overlay & Missouri CORE 42 Waiver
 * - Layer 4: GE Elective I & II Overflow (Buckets 13-14)
 * - Layer 5: Degree Policy Thresholds (120 Total Credits, 42 Upper-Level 30000+ Safeguard,
 *            30 LU Residency, Final 24 LU Residency, Major MAX(18cr, 40%) Residency, UNIV/LUL Waiver)
 */

import masterDbDefault from '../data/masterDatabase.json' with { type: 'json' };
import masterProgramsDefault from '../data/masterProgramsDatabase.json' with { type: 'json' };
import ge2026 from '../data/ge_2026_2027.json' with { type: 'json' };
import ge2025 from '../data/ge_2025_2026.json' with { type: 'json' };
import ge2024 from '../data/ge_2024_2025.json' with { type: 'json' };
import ge2023 from '../data/ge_2023_2024.json' with { type: 'json' };
import {
  normalizeCourseCode,
  isGradeCOrHigher,
  isTransferPlaceholder
} from './transcriptParser.js';

export const GE_MATRICES_BY_YEAR = {
  '2026-2027': ge2026,
  '2025-2026': ge2025,
  '2024-2025': ge2024,
  '2023-2024': ge2023
};

/**
 * Returns all catalog programs combined from masterProgramsDatabase (1,008 harvested programs)
 * and catalogDb/masterDbDefault with duplicate ID preservation.
 */
export function getAllCatalogPrograms(db = masterDbDefault) {
  const map = new Map();

  const masterList = masterProgramsDefault?.programs
    ? (Array.isArray(masterProgramsDefault.programs)
        ? masterProgramsDefault.programs
        : Object.values(masterProgramsDefault.programs))
    : [];
  for (const p of masterList) {
    if (p && p.id) map.set(p.id, p);
  }

  const dbList = db?.programs
    ? (Array.isArray(db.programs)
        ? db.programs
        : Object.values(db.programs))
    : [];
  for (const p of dbList) {
    if (p && p.id) map.set(p.id, p);
  }

  return Array.from(map.values());
}

/**
 * Resolves General Education catalog distribution rules for any specified catalog year.
 */
export function resolveGeMatrixForYear(catalogYear = '2026-2027', db = null) {
  if (db?.general_education && db.general_education[catalogYear]) {
    const raw = db.general_education[catalogYear];
    return {
      catalog_year: catalogYear,
      total_credits_required: Number(raw.total_credits_required) || 42,
      categories: raw.categories || raw.distribution_categories || {}
    };
  }

  const fileMatrix = GE_MATRICES_BY_YEAR[catalogYear] || GE_MATRICES_BY_YEAR['2026-2027'];
  if (fileMatrix) {
    return {
      catalog_year: fileMatrix.catalog_year || catalogYear,
      total_credits_required: Number(fileMatrix.total_credits_required) || 42,
      categories: fileMatrix.distribution_categories || fileMatrix.categories || {}
    };
  }

  if (db?.general_education && db.general_education['2026-2027']) {
    const raw = db.general_education['2026-2027'];
    return {
      catalog_year: '2026-2027',
      total_credits_required: Number(raw.total_credits_required) || 42,
      categories: raw.categories || raw.distribution_categories || {}
    };
  }

  return null;
}

const GE_DEPARTMENTS = new Set([
  'ENGL',
  'EPP',
  'MTH',
  'HIST',
  'PS',
  'PSY',
  'SOC',
  'ANT',
  'ECON',
  'BSC',
  'ESC',
  'CHM',
  'PHY',
  'SCI',
  'ART',
  'TA',
  'MUS',
  'DAN',
  'REL',
  'PHL',
  'FRN',
  'SPA',
  'COM'
]);

const KNOWN_HD_COMPACT_CODES = new Set([
  'SOC10200',
  'ENGL21600',
  'REL20000',
  'ANT11200'
]);

export const BUCKET_TO_CANONICAL_TOKEN = {
  comp_1: 'ENGL 15000',
  comp_2: 'ENGL 17000',
  math: 'REQ_GE_MATH',
  us_hist_gov: 'REQ_GE_US_HIST_GOV',
  soc_sci: 'REQ_GE_SOC_SCI',
  nat_sci_lab: 'REQ_GE_NAT_SCI_LAB',
  sci_elective: 'REQ_GE_SCI_ELEC',
  stem_elective: 'REQ_GE_MATH',
  arts: 'REQ_GE_ART',
  lit: 'REQ_GE_LIT',
  human_culture_1: 'REQ_GE_HC_NON_LIT_ART',
  human_culture_2: 'REQ_GE_HC_ELEC',
  ge_elective_1: 'REQ_GE_ELEC1',
  ge_elective_2: 'REQ_GE_ELEC2'
};

/**
 * Determine if a course carries the Human Diversity (/HD) attribute.
 */
export function hasHumanDiversityAttribute(courseRecord, catalogCourse = null) {
  if (!courseRecord) return false;
  if (courseRecord.hasHDAttribute) return true;
  const title = `${courseRecord.title || ''} ${catalogCourse?.title || ''}`;
  if (/\/HD\b|\(HD\)|\bGE-[A-Z]+\/HD\b|HUMAN DIVERSITY/i.test(title)) {
    return true;
  }
  const notes = (catalogCourse?.pe_notes || []).join(' ');
  if (/\/HD|Human Diversity/i.test(notes)) {
    return true;
  }
  const compact = courseRecord.compactCode || normalizeCourseCode(courseRecord.code)?.compact;
  return KNOWN_HD_COMPACT_CODES.has(compact);
}

/**
 * Helper to check if a course matches a specific GE bucket (1..14).
 */
function matchesGEBucket(bucketId, course, catalogCourse = null) {
  const code = course.code;
  const compact = course.compactCode;
  const dept = course.department;
  const title = `${course.title || ''} ${catalogCourse?.title || ''}`;

  // ELECT placeholders flow directly into free elective pools, never claimed by GE buckets
  if (
    course.department === 'ELECT' ||
    course.subject === 'ELECT' ||
    course.placeholderType === 'FREE_ELECTIVE' ||
    /^ELECT/i.test(code || '') ||
    /^ELECT/i.test(compact || '')
  ) {
    return false;
  }

  if (
    catalogCourse?.ge_bucket_id === bucketId ||
    course.ge_bucket_id === bucketId ||
    code === BUCKET_TO_CANONICAL_TOKEN[bucketId] ||
    compact === (BUCKET_TO_CANONICAL_TOKEN[bucketId] || '').replace(/\s+/g, '')
  ) {
    return true;
  }

  switch (bucketId) {
    case 'comp_1':
      return compact === 'ENGL15000' || compact === 'EPP15000';

    case 'comp_2':
      return compact === 'ENGL17000';

    case 'math':
      return compact === 'MTH14100';

    case 'us_hist_gov':
      return (
        /USHisGov|GE-Civ|GE-HistGov|GE-History/i.test(title) ||
        ['HIST10500', 'HIST10600', 'PS15500', 'PS15600'].includes(compact)
      );

    case 'soc_sci':
      return (
        /SocSci|GE-SocSci|GE-SocialScience/i.test(title) ||
        ['PSY10000', 'SOC10200', 'ECON23010', 'ECON23020'].includes(compact) ||
        ['PSY', 'SOC', 'ECON'].includes(dept)
      );

    case 'nat_sci_lab':
      return (
        /NatSciLec\/Lab|NatSciLab|with Lab/i.test(title) ||
        ['BSC10000', 'ESC10000', 'CHM10000', 'PHY10000'].includes(compact) ||
        (['BSC', 'ESC', 'CHM', 'PHY'].includes(dept) && course.credits >= 4)
      );

    case 'sci_elective':
      return (
        /SocSci|NatSci/i.test(title) ||
        ['PSY', 'SOC', 'ECON', 'ANT', 'BSC', 'ESC', 'CHM', 'PHY', 'SCI'].includes(dept)
      );

    case 'stem_elective':
      // Satisfied by second Major Math course (any GE-Math >= 14100, excluding MTH 11000) or SocSci/NatSci
      if (dept === 'MTH' && course.number >= 14100 && compact !== 'MTH14100') {
        return true;
      }
      return /GE-Math|SocSci|NatSci/i.test(title);

    case 'arts':
      return (
        /:Art|Human Culture:\s*Art|\bGE-Art|\bGE-Arts|\bGE-FineArts\b/i.test(title) ||
        ['ART18100', 'TA11700', 'MUS10000', 'DAN10100'].includes(compact) ||
        ['ART', 'TA', 'MUS', 'DAN'].includes(dept)
      );

    case 'lit':
      return (
        /:Lit|Human Culture:\s*Literature|\bGE-Lit|\bGE-Literature\b/i.test(title) ||
        ['ENGL20100', 'ENGL20200', 'ENGL21600'].includes(compact) ||
        (dept === 'ENGL' && course.number >= 20000 && course.number < 30000)
      );

    case 'human_culture_1':
      // Non-Literature, Non-Arts Human Culture
      if (/:Art|:Lit|Human Culture:\s*(Art|Literature)|\bGE-(?:Art|Arts|FineArts|Lit|Literature)\b/i.test(title)) {
        return false;
      }
      return (
        /GE-HC|Human Culture|GE-Humanities/i.test(title) ||
        ['REL20000', 'PHL10000', 'ANT11200'].includes(compact) ||
        ['REL', 'PHL', 'HIST', 'FRN', 'SPA'].includes(dept)
      );

    case 'human_culture_2':
      return (
        /GE-HC|Human Culture|GE-Humanities|:Art|:Lit|\bGE-(?:Art|Arts|FineArts|Lit|Literature)\b/i.test(title) ||
        ['REL', 'PHL', 'HIST', 'ART', 'TA', 'MUS', 'FRN', 'SPA'].includes(dept) ||
        (dept === 'ENGL' && course.number >= 20000 && course.number < 30000)
      );

    case 'ge_elective_1':
    case 'ge_elective_2':
      // Any remaining unclaimed GE course (excluding sub-GE MTH 11000, UNIV 10100, and D-grade Composition I/II)
      if (
        compact === 'MTH11000' ||
        compact === 'ENGL15000' ||
        compact === 'EPP15000' ||
        compact === 'ENGL17000' ||
        dept === 'UNIV' ||
        dept === 'LUL'
      ) {
        return false;
      }
      return (
        /\(GE|GE-/i.test(title) ||
        (GE_DEPARTMENTS.has(dept) && course.number >= 10000 && course.number < 30000)
      );

    default:
      return false;
  }
}

/**
 * Execute the 5-Layer Deterministic Waterfall Audit.
 *
 * @param {Object} parsedTranscript - Output from transcriptParser.js
 * @param {string|string[]} programIdOrIds - Program ID(s) or name(s) (e.g. 'cybersecurity_bs_2026')
 * @param {Object} masterDb - Master database JSON object
 * @param {Object} options - Optional advisor settings:
 *   - core42Completed {boolean}
 *   - mathPlacementMet {boolean}
 *   - ciscoCertExempt {boolean}
 *   - incomingTransfers {Array<{code, title, credits, institution}>}
 *   - advisorOverrides {Object} map of requirementKey -> { courseCode, note, type: 'PE' | 'Tentative' }
 */
export function runWaterfallAudit(
  parsedTranscript,
  programIdOrIds = 'cybersecurity_bs_2026',
  masterDb = masterDbDefault,
  options = {}
) {
  const db = masterDb || masterDbDefault;
  const catalogByCompact = new Map();
  for (const c of db.courses || []) {
    const norm = normalizeCourseCode(c.code);
    if (norm) catalogByCompact.set(norm.compact, c);
    catalogByCompact.set(c.code.replace(/\s+/g, '').toUpperCase(), c);
    catalogByCompact.set(c.code.toUpperCase(), c);
  }

  // Resolve selected program(s)
  const requestedIds = Array.isArray(programIdOrIds) ? programIdOrIds : [programIdOrIds];
  const allProgs = getAllCatalogPrograms(db);
  const selectedPrograms = requestedIds
    .map((idOrName) => {
      if (!idOrName) return null;
      if (typeof idOrName === 'object' && idOrName.id) return idOrName;
      const q = String(idOrName || '').trim().toLowerCase();
      return (
        allProgs.find(
          (p) =>
            p.id.toLowerCase() === q ||
            p.name.toLowerCase() === q ||
            String(p.acalog_poid) === q
        ) ||
        (db.programs || []).find(
          (p) =>
            p.id.toLowerCase() === q ||
            p.name.toLowerCase() === q ||
            String(p.acalog_poid) === q
        )
      );
    })
    .filter(Boolean);

  if (selectedPrograms.length === 0 && allProgs.length > 0) {
    selectedPrograms.push(allProgs[0]);
  } else if (selectedPrograms.length === 0 && db.programs?.length > 0) {
    selectedPrograms.push(db.programs[0]);
  }

  const primaryProgram = selectedPrograms[0];

  // Combine valid student courses + any pending incoming transfer placeholders
  const incomingList = (options.incomingTransfers || []).map((tr) => {
    const norm = normalizeCourseCode(tr.code) || {
      canonical: tr.code,
      compact: String(tr.code).replace(/\s+/g, '').toUpperCase(),
      department: 'TR',
      number: 10000
    };
    return {
      code: norm.canonical,
      compactCode: norm.compact,
      department: norm.department,
      number: norm.number,
      title: tr.title || `Incoming Transfer (${tr.institution || 'Pending'})`,
      credits: Number(tr.credits) || 3,
      grade: 'TR',
      state: 'TR',
      isIncomingPlaceholder: true,
      institution: tr.institution || 'External',
      hasHDAttribute: Boolean(tr.hasHDAttribute || /\/HD\b/i.test(tr.title || ''))
    };
  });

  const allStudentCourses = [...(parsedTranscript?.validCourses || []), ...incomingList].map(
    (c) => {
      const cat = catalogByCompact.get(c.compactCode);
      return {
        ...c,
        title: c.title || cat?.title || c.code,
        hasHDAttribute: hasHumanDiversityAttribute(c, cat)
      };
    }
  );

  // Pool of unclaimed student courses (preserving multiple instances for transfer placeholders)
  const unclaimedPool = new Map();
  for (let i = 0; i < allStudentCourses.length; i++) {
    const c = allStudentCourses[i];
    const placeholderMeta = isTransferPlaceholder(c);
    const key = placeholderMeta?.allowMultipleInstances
      ? `${c.compactCode}_${c.term || 'TR'}_${c.grade || ''}_${c.credits || ''}_${i}`
      : c.compactCode;
    c._unclaimedKey = key;
    unclaimedPool.set(key, c);
  }

  function findAndClaimUnclaimed(compactCode) {
    if (unclaimedPool.has(compactCode)) {
      const match = unclaimedPool.get(compactCode);
      unclaimedPool.delete(compactCode);
      return match;
    }
    for (const [key, candidate] of unclaimedPool.entries()) {
      if (candidate.compactCode === compactCode) {
        unclaimedPool.delete(key);
        return candidate;
      }
    }
    return null;
  }

  const compositionGatekeeperWarnings = [];
  const advisorRecommendations = [];

  // Detect retired legacy courses ICS 32600 / ICS 32601 on transcript
  if (unclaimedPool.has('ICS32600') || unclaimedPool.has('ICS32601')) {
    advisorRecommendations.push(
      'Student record contains retired course ICS 32600/32601. Recommend rolling forward to the 2024-2025+ catalog or filing a Policy Exception (PE).'
    );
  }

  // =========================================================================
  // PRE-PASS: Math Placement & Human Diversity (/HD) Attribute Overlay Scan
  // =========================================================================
  const hasMathCourseOnTranscript = allStudentCourses.some(
    (c) => c.department === 'MTH' && c.number >= 11000
  );
  const mathPlacementSatisfied = Boolean(hasMathCourseOnTranscript || options.mathPlacementMet);

  const hdCoursesSatisfied = allStudentCourses.filter((c) => c.hasHDAttribute);
  const hdCount = hdCoursesSatisfied.length;
  const hdDeficit = Math.max(0, 2 - hdCount);

  // =========================================================================
  // LAYER 2 PRE-LOCK: Reserve Major Core & Emphasis Courses First
  // (So no Major/Emphasis course is ever swallowed by a generic GE bucket,
  //  except MTH 14100 and the second GE-Math course which dual-satisfy!)
  // =========================================================================
  const majorCoreCodes = [];
  const emphasisCodes = [];
  for (const prog of selectedPrograms) {
    for (const code of prog.requirements?.major_core_courses || []) {
      if (!majorCoreCodes.includes(code)) majorCoreCodes.push(code);
    }
    for (const code of prog.requirements?.emphasis_courses || []) {
      if (!emphasisCodes.includes(code)) emphasisCodes.push(code);
    }
    for (const rawPrescribed of Object.values(prog.requirements?.prescribed_ge_satisfactions || {})) {
      const norm = normalizeCourseCode(rawPrescribed);
      if (
        norm &&
        catalogByCompact.has(norm.compact) &&
        !majorCoreCodes.some((c) => normalizeCourseCode(c)?.compact === norm.compact) &&
        !emphasisCodes.some((c) => normalizeCourseCode(c)?.compact === norm.compact)
      ) {
        majorCoreCodes.push(catalogByCompact.get(norm.compact)?.code || rawPrescribed);
      }
    }
  }

  // Build Legacy Substitution Map: e.g. ICS 41500 <- ICS 41100, ICS 41700 <- ICS 41400
  const legacySubMap = {
    ICS41500: ['ICS41100'],
    ICS41700: ['ICS41400']
  };
  for (const c of db.courses || []) {
    const norm = normalizeCourseCode(c.code);
    if (norm && Array.isArray(c.legacy_substitutions) && c.legacy_substitutions.length > 0) {
      legacySubMap[norm.compact] = c.legacy_substitutions
        .map((s) => normalizeCourseCode(s)?.compact)
        .filter(Boolean);
    }
  }

  // Evaluate Cisco Concurrent Lab Exemption Rule for IT Networking (poid=2152)
  const isNetworkingMajor = selectedPrograms.some((p) => p.acalog_poid === 2152);
  const ciscoLectureCodes = ['ICS32300', 'ICS32400', 'ICS32500'];
  const hasTransferredOrPriorCisco = allStudentCourses.some(
    (c) =>
      ciscoLectureCodes.includes(c.compactCode) &&
      ((c.state === 'TR' && isGradeCOrHigher(c.grade)) ||
        (c.termInfo?.year && c.termInfo.year < 2024))
  );
  const ciscoLabExemptionApplied = Boolean(
    isNetworkingMajor && (hasTransferredOrPriorCisco || options.ciscoCertExempt)
  );

  // Claim Major Core & Emphasis courses from unclaimedPool
  const majorRequirements = [];
  const emphasisRequirements = [];
  const advisorOverrides = options.advisorOverrides || {};

  function claimProgramCourseList(codeList, targetArray, categoryTag) {
    for (const reqCode of codeList) {
      const norm = normalizeCourseCode(reqCode);
      const compact = norm.compact;
      const catCourse = catalogByCompact.get(compact);

      // 1. Check direct match in unclaimedPool
      let matchedStudentCourse = findAndClaimUnclaimed(compact);
      let matchNote = null;

      // 2. Check Legacy Substitution (e.g., ICS 41100 -> ICS 41500, ICS 41400 -> ICS 41700)
      if (!matchedStudentCourse && legacySubMap[compact]) {
        for (const subCompact of legacySubMap[compact]) {
          matchedStudentCourse = findAndClaimUnclaimed(subCompact);
          if (matchedStudentCourse) {
            matchNote = `Satisfied via legacy substitution (${matchedStudentCourse.code})`;
            break;
          }
        }
      }

      // 3. Check Advisor Override / Policy Exception (PE)
      if (!matchedStudentCourse && advisorOverrides[reqCode]) {
        const overrideNorm = normalizeCourseCode(advisorOverrides[reqCode].courseCode);
        if (overrideNorm) {
          matchedStudentCourse = findAndClaimUnclaimed(overrideNorm.compact);
          if (matchedStudentCourse) {
            matchNote = `Satisfied via Advisor ${advisorOverrides[reqCode].type || 'Override'} (${matchedStudentCourse.code})`;
          }
        }
      }

      // 4. Special check for Cisco 1cr Lab Exemption if corresponding 5cr lecture was completed/transferred under exemption
      const ciscoLabToLecture = {
        ICS32301: 'ICS32300',
        ICS32401: 'ICS32400',
        ICS32501: 'ICS32500'
      };
      let waivedByCiscoRule = false;
      if (
        !matchedStudentCourse &&
        ciscoLabExemptionApplied &&
        ciscoLabToLecture[compact] &&
        allStudentCourses.some((c) => c.compactCode === ciscoLabToLecture[compact])
      ) {
        waivedByCiscoRule = true;
        matchNote = 'Cisco Concurrent Lab Exempt (Prior Catalog / Transfer >= C / Certification)';
      }

      targetArray.push({
        code: reqCode,
        compactCode: compact,
        title: catCourse?.title || reqCode,
        credits: catCourse?.credits || 3,
        category: categoryTag,
        fulfilled: Boolean(matchedStudentCourse || waivedByCiscoRule),
        waived: waivedByCiscoRule,
        matchedCourse: matchedStudentCourse,
        state: matchedStudentCourse ? matchedStudentCourse.state : waivedByCiscoRule ? 'Waived' : 'Remaining',
        note: matchNote
      });
    }
  }

  claimProgramCourseList(majorCoreCodes, majorRequirements, 'M');
  claimProgramCourseList(emphasisCodes, emphasisRequirements, 'Em');

  // =========================================================================
  // LAYER 1 & LAYER 4: 14-Bucket (42-Credit) General Education Waterfall
  // =========================================================================
  const geBucketsResult = [];
  const schemaBuckets = [...(db.ge_waterfall_schema || [])].sort((a, b) => a.order - b.order);

  // Track dual-counted Major Math requirements
  let mth14100MatchedCourse = null;
  let secondGeMathMatchedCourse = null;

  for (const bucket of schemaBuckets) {
    const bucketId = bucket.bucket_id;

    // Check Composition I & II Gatekeeper (Grade >= C required)
    if (bucketId === 'comp_1' || bucketId === 'comp_2') {
      const candidateCodes = bucketId === 'comp_1' ? ['ENGL15000', 'EPP15000'] : ['ENGL17000'];
      let matched = null;
      const bucketWarnings = [];

      for (const cCode of candidateCodes) {
        const candidate = unclaimedPool.get(cCode);
        if (candidate) {
          if (
            candidate.state === 'Current' ||
            candidate.state === 'Scheduled' ||
            isGradeCOrHigher(candidate.grade)
          ) {
            matched = candidate;
            unclaimedPool.delete(cCode);
            break;
          } else {
            // Grade is D (or C-): counts toward 120 total credits, but leaves Composition bucket UNFULFILLED!
            bucketWarnings.push({
              bucketId,
              courseCode: candidate.code,
              grade: candidate.grade,
              message: `${candidate.code} earned grade '${candidate.grade}'. A grade of C or higher is required to satisfy ${bucket.name}; credits count toward general electives only.`
            });
          }
        }
      }

      if (!matched && bucketWarnings.length > 0) {
        compositionGatekeeperWarnings.push(...bucketWarnings);
      }

      // Missouri CORE 42 / AA Transfer Block clears the Composition buckets in their entirety
      const compWaivedByCore42 = !matched && Boolean(options.core42Completed);

      geBucketsResult.push({
        ...bucket,
        fulfilled: Boolean(matched || compWaivedByCore42),
        status: matched ? 'MET' : compWaivedByCore42 ? 'WAIVED' : 'UNMET',
        waived: compWaivedByCore42,
        matchedCourse: matched,
        claimed_courses: matched ? [matched] : [],
        state: matched ? matched.state : compWaivedByCore42 ? 'Waived (CORE 42)' : 'Remaining'
      });
      continue;
    }

    // Check Bucket 3: MTH 14100 (Dual-satisfies GE Math and Major Math)
    if (bucketId === 'math') {
      const mth141 = findAndClaimUnclaimed('MTH14100');
      if (mth141) {
        mth14100MatchedCourse = mth141;
      }
      geBucketsResult.push({
        ...bucket,
        fulfilled: Boolean(mth141),
        status: mth141 ? 'MET' : 'UNMET',
        waived: false,
        matchedCourse: mth141,
        claimed_courses: mth141 ? [mth141] : [],
        dualSatisfiesMajor: true,
        state: mth141 ? mth141.state : 'Remaining'
      });
      continue;
    }

    // Compound Bucket Matching for nat_sci_lab:
    // Path A: Single combined course >= 4cr (e.g. BSC 10000, ESC 10000, CHM 10000)
    // Path B: Compound split (3cr lecture + 1cr lab claimed together)
    // Path C: Orphaned lecture without lab remains UNMET, cascading to sci_elective
    if (bucketId === 'nat_sci_lab') {
      let matchedSingle = null;
      let matchedSingleKey = null;
      let matchedLecture = null;
      let matchedLectureKey = null;
      let matchedLab = null;
      let matchedLabKey = null;

      // Path A: Single Combined 4cr Course
      for (const [poolKey, candidate] of unclaimedPool.entries()) {
        const catCourse = catalogByCompact.get(candidate.compactCode);
        const title = `${candidate.title || ''} ${catCourse?.title || ''}`;
        const dept = candidate.department || catCourse?.department || '';
        const credits = candidate.credits || 0;

        const isCombined =
          credits >= 4 &&
          (/NatSciLec\/Lab|with Lab/i.test(title) ||
            ['BSC10000', 'ESC10000', 'CHM10000', 'PHY10000'].includes(candidate.compactCode) ||
            ['BSC', 'ESC', 'CHM', 'PHY'].includes(dept));

        if (isCombined) {
          matchedSingle = candidate;
          matchedSingleKey = poolKey;
          break;
        }
      }

      if (matchedSingle) {
        unclaimedPool.delete(matchedSingleKey);
        geBucketsResult.push({
          ...bucket,
          fulfilled: true,
          status: 'MET',
          waived: false,
          matchedCourse: matchedSingle,
          claimed_courses: [matchedSingle],
          state: matchedSingle.state || 'Completed'
        });
        continue;
      }

      // Path B: Compound Split (3cr Lecture + 1cr Lab)
      for (const [poolKey, candidate] of unclaimedPool.entries()) {
        const catCourse = catalogByCompact.get(candidate.compactCode);
        const title = `${candidate.title || ''} ${catCourse?.title || ''}`;
        const dept = candidate.department || catCourse?.department || '';
        const credits = candidate.credits || 0;
        const numStr = String(candidate.number || '');

        const isLab =
          /NatSciLab|Lab\b/i.test(title) ||
          numStr.endsWith('01') ||
          numStr.endsWith('L') ||
          (credits <= 2 && ['BSC', 'CHM', 'ESC', 'PHY'].includes(dept));

        const isLec =
          credits >= 3 &&
          !isLab &&
          (/NatSciLec/i.test(title) || ['BSC', 'CHM', 'ESC', 'PHY'].includes(dept));

        if (!matchedLecture && isLec) {
          matchedLecture = candidate;
          matchedLectureKey = poolKey;
        } else if (!matchedLab && isLab) {
          matchedLab = candidate;
          matchedLabKey = poolKey;
        }

        if (matchedLecture && matchedLab) break;
      }

      if (matchedLecture && matchedLab) {
        unclaimedPool.delete(matchedLectureKey);
        unclaimedPool.delete(matchedLabKey);
        geBucketsResult.push({
          ...bucket,
          fulfilled: true,
          status: 'MET',
          waived: false,
          matchedCourse: matchedLecture,
          claimed_courses: [matchedLecture, matchedLab],
          state: matchedLecture.state || 'Completed'
        });
        continue;
      }

      // Path C: Orphaned lecture without lab, or no science courses
      const waivedByCore42 = Boolean(options.core42Completed);
      geBucketsResult.push({
        ...bucket,
        fulfilled: waivedByCore42,
        status: waivedByCore42 ? 'WAIVED' : 'UNMET',
        waived: waivedByCore42,
        matchedCourse: null,
        claimed_courses: [],
        state: waivedByCore42 ? 'Waived (CORE 42)' : 'Remaining'
      });
      continue;
    }

    // Check Missouri CORE 42 Waiver for remaining non-MTH14100 GE buckets
    let matched = null;
    for (const [poolKey, candidate] of unclaimedPool.entries()) {
      const catCourse = catalogByCompact.get(candidate.compactCode);
      if (matchesGEBucket(bucketId, candidate, catCourse)) {
        matched = candidate;
        unclaimedPool.delete(poolKey);
        break;
      }
    }

    if (bucketId === 'stem_elective' && matched && matched.department === 'MTH') {
      secondGeMathMatchedCourse = matched;
    }

    const waivedByCore42 = !matched && Boolean(options.core42Completed);

    geBucketsResult.push({
      ...bucket,
      fulfilled: Boolean(matched || waivedByCore42),
      status: matched ? 'MET' : (waivedByCore42 ? 'WAIVED' : 'UNMET'),
      waived: waivedByCore42,
      matchedCourse: matched,
      claimed_courses: matched ? [matched] : [],
      dualSatisfiesMajor: bucketId === 'stem_elective',
      state: matched ? matched.state : waivedByCore42 ? 'Waived (CORE 42)' : 'Remaining'
    });
  }

  // Record Dual-Satisfied Major Math status inside majorRequirements
  const majorMathRequirements = [
    {
      code: 'MTH 14100',
      compactCode: 'MTH14100',
      title: 'Basic Statistics (Dual-Counted in GE Math)',
      credits: 3,
      category: 'M/GE',
      dualCountedWithGEBucket: 'math',
      fulfilled: Boolean(mth14100MatchedCourse),
      matchedCourse: mth14100MatchedCourse,
      state: mth14100MatchedCourse ? mth14100MatchedCourse.state : 'Remaining'
    },
    {
      code: 'REQ_GE_MATH',
      compactCode: 'REQ_GE_MATH',
      title: 'Mathematics Elective (GE-Math)',
      credits: 3,
      category: 'M/GE',
      dualCountedWithGEBucket: 'stem_elective',
      fulfilled: Boolean(secondGeMathMatchedCourse),
      matchedCourse: secondGeMathMatchedCourse,
      state: secondGeMathMatchedCourse ? secondGeMathMatchedCourse.state : 'Remaining'
    }
  ];

  // =========================================================================
  // LAYER 3: Human Diversity (/HD) Overlay on Remaining GE Placeholders
  // =========================================================================
  let remainingHdToTag = hdDeficit;
  // Prefer tagging Human Culture or Social Science or GE Elective buckets first
  const hdEligibleBucketIds = new Set([
    'human_culture_1',
    'human_culture_2',
    'soc_sci',
    'lit',
    'arts',
    'ge_elective_1',
    'ge_elective_2'
  ]);

  for (const b of geBucketsResult) {
    if (remainingHdToTag > 0 && !b.fulfilled && hdEligibleBucketIds.has(b.bucket_id)) {
      b.requiresHD = true;
      b.needs_hd = true;
      b.displayPlaceholderTitle = `${b.name} (HD)`;
      remainingHdToTag -= 1;
    } else {
      b.requiresHD = false;
      b.needs_hd = false;
      b.displayPlaceholderTitle = b.name;
    }
  }

  // =========================================================================
  // LAYER 5: Free Electives, Upper-Level (30000+) Safeguard, & 120-Credit Gap
  // =========================================================================
  const claimedFreeElectives = Array.from(unclaimedPool.values());
  unclaimedPool.clear();

  // Unique Credit Summations (Every student course summed strictly once)
  const completedCredits = allStudentCourses
    .filter((c) => c.state === 'TR' || c.state === 'Completed')
    .reduce((sum, c) => sum + c.credits, 0);

  const enrolledCredits = allStudentCourses
    .filter((c) => c.state === 'Current' || c.state === 'Scheduled')
    .reduce((sum, c) => sum + c.credits, 0);

  const totalEarnedAndEnrolledCredits = completedCredits + enrolledCredits;
  const totalTransferCredits = allStudentCourses
    .filter((c) => c.state === 'TR')
    .reduce((sum, c) => sum + c.credits, 0);

  const univLulWaived = totalTransferCredits > 0;

  // Build Remaining Required Courses for the Scheduler (Zero Duplicate Math!)
  const remainingCourseItems = [];

  // 1. Remaining GE Buckets
  for (const b of geBucketsResult) {
    if (!b.fulfilled) {
      if (b.bucket_id === 'comp_1') {
        const cat = catalogByCompact.get('ENGL15000');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'ENGL 15000',
          compactCode: 'ENGL15000',
          department: 'ENGL',
          number: 15000,
          title: cat?.title || 'Composition I (GE-Comm)',
          credits: 3,
          category: 'GE',
          geBucketId: b.bucket_id,
          type: 'concrete',
          isPlaceholder: false
        });
      } else if (b.bucket_id === 'comp_2') {
        const cat = catalogByCompact.get('ENGL17000');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'ENGL 17000',
          compactCode: 'ENGL17000',
          department: 'ENGL',
          number: 17000,
          title: cat?.title || 'Composition II (GE-Comm)',
          credits: 3,
          category: 'GE',
          geBucketId: b.bucket_id,
          type: 'concrete',
          isPlaceholder: false
        });
      } else if (b.bucket_id === 'math') {
        const cat = catalogByCompact.get('MTH14100');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'MTH 14100',
          compactCode: 'MTH14100',
          department: 'MTH',
          number: 14100,
          title: cat?.title || 'Basic Statistics (GE-Math)',
          credits: 3,
          category: 'M',
          dualSatisfiesGE: true,
          geBucketId: b.bucket_id,
          type: 'concrete',
          isPlaceholder: false
        });
      } else if (b.bucket_id === 'stem_elective' && !secondGeMathMatchedCourse) {
        // CS/IT majors require a second GE-Math course (standardized on REQ_GE_MATH)
        const cat = catalogByCompact.get('REQ_GE_MATH');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'REQ_GE_MATH',
          compactCode: 'REQ_GE_MATH',
          department: 'GE',
          number: 14000,
          title: b.requiresHD ? 'GE: Mathematics (HD) (3cr)' : (cat?.title || 'GE: Mathematics (3cr)'),
          credits: 3,
          category: 'M',
          dualSatisfiesGE: true,
          geBucketId: b.bucket_id,
          type: 'placeholder',
          isPlaceholder: true,
          system_locked: true,
          requiresHD: Boolean(b.requiresHD),
          needs_hd: Boolean(b.requiresHD),
          offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
          FA_I_8wk: true,
          FA_II_8wk: true,
          FA_16wk: true,
          SP_I_8wk: true,
          SP_II_8wk: true,
          SP_16wk: true,
          SU_8wk: true,
          modalities: cat?.modalities || ['Online', 'OnGround'],
          prereq_logic: null,
          coreq_codes: [],
          verification_status: 'Verified'
        });
      } else {
        const canonicalCode = BUCKET_TO_CANONICAL_TOKEN[b.bucket_id] || `REQ_GE_${b.bucket_id.toUpperCase()}`;
        const cat = catalogByCompact.get(canonicalCode);
        const placeholderCredits = b.bucket_id === 'nat_sci_lab' ? 4 : (cat?.credits || b.required_credits || 3);
        const baseTitle = cat?.title || `GE: ${b.name} (${placeholderCredits}cr)`;
        let displayTitle = baseTitle;
        if (b.requiresHD) {
          if (baseTitle.includes('(HD)')) {
            displayTitle = baseTitle;
          } else if (baseTitle.includes('(3cr)')) {
            displayTitle = baseTitle.replace('(3cr)', '(HD) (3cr)');
          } else if (baseTitle.includes('(4cr)')) {
            displayTitle = baseTitle.replace('(4cr)', '(HD) (4cr)');
          } else {
            displayTitle = `${baseTitle} (HD)`;
          }
        }

        remainingCourseItems.push({
          ...(cat || {}),
          code: canonicalCode,
          compactCode: canonicalCode,
          department: cat?.department || 'GE',
          number: cat?.number ? Number(cat.number) : 10000 + b.order * 100,
          title: displayTitle,
          credits: placeholderCredits,
          category: 'GE',
          geBucketId: b.bucket_id,
          requiresHD: Boolean(b.requiresHD),
          needs_hd: Boolean(b.requiresHD),
          type: 'placeholder',
          isPlaceholder: true,
          system_locked: true,
          offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
          FA_I_8wk: true,
          FA_II_8wk: true,
          FA_16wk: true,
          SP_I_8wk: true,
          SP_II_8wk: true,
          SP_16wk: true,
          SU_8wk: true,
          modalities: cat?.modalities || ['Online', 'OnGround'],
          prereq_logic: null,
          coreq_codes: [],
          verification_status: 'Verified'
        });
      }
    }
  }

  // If CORE 42 waived STEM bucket, check if second Major Math is still needed
  if (
    options.core42Completed &&
    !secondGeMathMatchedCourse &&
    !remainingCourseItems.some((c) => c.geBucketId === 'stem_elective' || c.code === 'REQ_GE_MATH')
  ) {
    const cat = catalogByCompact.get('REQ_GE_MATH');
    remainingCourseItems.push({
      ...(cat || {}),
      code: 'REQ_GE_MATH',
      compactCode: 'REQ_GE_MATH',
      department: 'GE',
      number: 14000,
      title: 'Mathematics Elective (GE-Math)',
      credits: 3,
      category: 'M',
      dualSatisfiesGE: true,
      type: 'placeholder',
      isPlaceholder: true,
      system_locked: true,
      offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      modalities: ['Online', 'OnGround'],
      prereq_logic: null,
      coreq_codes: [],
      verification_status: 'Verified'
    });
  }

  // 2. Remaining Major Core & Emphasis Courses
  for (const req of [...majorRequirements, ...emphasisRequirements]) {
    if (!req.fulfilled) {
      const cat = catalogByCompact.get(req.compactCode);
      remainingCourseItems.push({
        ...(cat || {}),
        code: req.code,
        compactCode: req.compactCode,
        department: cat?.department || req.code.split(' ')[0],
        number: parseInt(cat?.number || req.code.split(' ')[1] || '30000', 10),
        title: req.title,
        credits: req.credits,
        category: req.category,
        verification_status: cat?.verification_status || 'Blank_Unverified'
      });
    }
  }

  // 3. Upper-Level (30000+) 42-Credit Safeguard
  const earnedAndEnrolledUpperLevelCredits = allStudentCourses
    .filter((c) => c.number >= 30000)
    .reduce((sum, c) => sum + c.credits, 0);

  const remainingRequiredUpperLevelCredits = remainingCourseItems
    .filter((c) => c.number >= 30000)
    .reduce((sum, c) => sum + c.credits, 0);

  const projectedUpperLevelBeforeElectives =
    earnedAndEnrolledUpperLevelCredits + remainingRequiredUpperLevelCredits;

  const upperLevelDeficit = Math.max(0, 42 - projectedUpperLevelBeforeElectives);
  const upperLevelElectiveCount = Math.ceil(upperLevelDeficit / 3);
  const generatedUpperLevelElectives = [];

  for (let i = 1; i <= upperLevelElectiveCount; i++) {
    const ulItem = {
      code: `REQ_ELEC_UPPER_${i}`,
      canonicalCode: 'REQ_ELEC_UPPER',
      compactCode: `REQ_ELEC_UPPER_${i}`,
      department: 'ELEC',
      number: 30000 + i,
      title: 'Upper-Level Elective (30000+) (3cr)',
      credits: 3,
      category: 'E',
      type: 'placeholder',
      isPlaceholder: true,
      isUpperLevelElective: true,
      system_locked: true,
      offered_sessions: ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      modalities: ['Online', 'OnGround'],
      prereq_logic: null,
      coreq_codes: [],
      verification_status: 'Verified'
    };
    generatedUpperLevelElectives.push(ulItem);
    remainingCourseItems.push(ulItem);
  }

  // 4. Dynamic Total Graduation Safeguard (General Electives)
  let defaultBaseFloor = 120;
  if (primaryProgram) {
    if (typeof primaryProgram.totalRequiredCredits === 'number' && primaryProgram.totalRequiredCredits >= 90) {
      defaultBaseFloor = primaryProgram.totalRequiredCredits;
    } else if (typeof primaryProgram.total_degree_credits === 'number' && primaryProgram.total_degree_credits >= 90) {
      defaultBaseFloor = primaryProgram.total_degree_credits;
    }
  }
  const targetGraduationCredits = options.targetGraduationCredits || defaultBaseFloor;

  const remainingCreditsSoFar = remainingCourseItems.reduce((sum, c) => sum + c.credits, 0);
  const projectedTotalBeforeGeneralElectives =
    totalEarnedAndEnrolledCredits + remainingCreditsSoFar;

  const generalElectiveDeficit = Math.max(0, targetGraduationCredits - projectedTotalBeforeGeneralElectives);
  const generalElectiveCount = Math.ceil(generalElectiveDeficit / 3);
  const generatedGeneralElectives = [];

  for (let i = 1; i <= generalElectiveCount; i++) {
    const genItem = {
      code: `REQ_ELEC_GEN_${i}`,
      canonicalCode: 'REQ_ELEC_GEN',
      compactCode: `REQ_ELEC_GEN_${i}`,
      department: 'ELEC',
      number: 10000 + i,
      title: 'General Elective (3cr)',
      credits: 3,
      category: 'E',
      type: 'placeholder',
      isPlaceholder: true,
      system_locked: true,
      offered_sessions: ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      modalities: ['Online', 'OnGround'],
      prereq_logic: null,
      coreq_codes: [],
      verification_status: 'Verified'
    };
    generatedGeneralElectives.push(genItem);
    remainingCourseItems.push(genItem);
  }

  const totalRemainingPlannedCredits = remainingCourseItems.reduce(
    (sum, c) => sum + c.credits,
    0
  );
  const finalProjectedTotalCredits =
    totalEarnedAndEnrolledCredits + totalRemainingPlannedCredits;
  const finalProjectedUpperLevelCredits =
    projectedUpperLevelBeforeElectives + generatedUpperLevelElectives.length * 3;

  // 5. Institutional & Major Residency Calculations
  const currentLindenwoodCredits = allStudentCourses
    .filter((c) => c.state !== 'TR')
    .reduce((sum, c) => sum + c.credits, 0);
  const projectedLindenwoodCredits = currentLindenwoodCredits + totalRemainingPlannedCredits;

  const totalMajorAndEmphasisRequiredCredits =
    (primaryProgram?.requirements?.major_core_credits || 0) +
    (primaryProgram?.requirements?.emphasis_credits || 0);
  const majorResidencyTargetCredits = Math.max(
    18,
    Math.ceil(totalMajorAndEmphasisRequiredCredits * 0.4)
  );

  const lindenwoodMajorCredits = [...majorRequirements, ...emphasisRequirements]
    .filter((r) => !r.fulfilled || (r.matchedCourse && r.matchedCourse.state !== 'TR'))
    .reduce((sum, r) => sum + r.credits, 0);

  return {
    studentMetadata: parsedTranscript?.studentMetadata || null,
    selectedPrograms,
    primaryProgram,
    geBuckets: geBucketsResult,
    majorRequirements,
    emphasisRequirements,
    majorMathRequirements,
    claimedFreeElectives,
    freeElectives: claimedFreeElectives,
    generatedUpperLevelElectives,
    generatedGeneralElectives,
    remainingCourseItems,
    excludedCourses: parsedTranscript?.excludedCourses || [],
    warnings: {
      compositionGatekeeperWarnings,
      advisorRecommendations
    },
    flags: {
      univLulWaived,
      mathPlacementSatisfied,
      ciscoLabExemptionApplied,
      core42Completed: Boolean(options.core42Completed)
    },
    policyChecklist: {
      totalCredits: {
        completed: completedCredits,
        enrolled: enrolledCredits,
        EarnedPlusEnrolled: totalEarnedAndEnrolledCredits,
        remainingPlanned: totalRemainingPlannedCredits,
        projectedTotal: finalProjectedTotalCredits,
        target: targetGraduationCredits,
        minThreshold: targetGraduationCredits,
        transferCredits: totalTransferCredits,
        univLulWaived,
        satisfied: finalProjectedTotalCredits >= targetGraduationCredits
      },
      upperLevelCredits: {
        earnedAndEnrolled: earnedAndEnrolledUpperLevelCredits,
        remainingRequired: remainingRequiredUpperLevelCredits,
        generatedUpperLevelElectiveCredits: generatedUpperLevelElectives.length * 3,
        projectedTotal: finalProjectedUpperLevelCredits,
        minThreshold: 42,
        satisfied: finalProjectedUpperLevelCredits >= 42
      },
      residency: {
        currentLindenwoodCredits,
        projectedLindenwoodCredits,
        minLindenwoodCredits: 30,
        currentInstitutionalCredits: currentLindenwoodCredits,
        projectedInstitutionalCredits: projectedLindenwoodCredits,
        minInstitutionalCredits: 30,
        final24ResidencyMet: projectedLindenwoodCredits >= 24 && incomingList.length === 0,
        majorResidencyTargetCredits,
        projectedLindenwoodMajorCredits: lindenwoodMajorCredits,
        projectedInstitutionalMajorCredits: lindenwoodMajorCredits,
        majorResidencyMet: lindenwoodMajorCredits >= majorResidencyTargetCredits,
        satisfied:
          projectedLindenwoodCredits >= 30 &&
          lindenwoodMajorCredits >= majorResidencyTargetCredits
      },
      humanDiversity: {
        completedOrEnrolledCount: hdCount,
        completedOrEnrolledCourses: hdCoursesSatisfied.map((c) => c.code),
        remainingTaggedInGE: hdDeficit - remainingHdToTag,
        requiredCourses: 2,
        requiredCredits: 6,
        satisfied: hdCount + (hdDeficit - remainingHdToTag) >= 2
      },
      compositionGatekeeper: {
        comp1Fulfilled: geBucketsResult.find((b) => b.bucket_id === 'comp_1')?.fulfilled || false,
        comp2Fulfilled: geBucketsResult.find((b) => b.bucket_id === 'comp_2')?.fulfilled || false,
        warnings: compositionGatekeeperWarnings,
        satisfied:
          Boolean(geBucketsResult.find((b) => b.bucket_id === 'comp_1')?.fulfilled) &&
          Boolean(geBucketsResult.find((b) => b.bucket_id === 'comp_2')?.fulfilled) &&
          compositionGatekeeperWarnings.length === 0
      }
    }
  };
}

// ===========================================================================
// MULTI-PROGRAM DEGREE AUDIT LAYER (Pure, Side-Effect Free)
// ---------------------------------------------------------------------------
// Wraps the baseline runWaterfallAudit() (which continues to feed the
// Critical-Path Scheduler unchanged) and augments it with:
//   A. Per-credential audit ledgers + cross-counting registry
//   B. Missouri CORE 42 / AA Transfer Block 8-category GE audit
//   C. Institutional policy gates (42 Upper-Division, Composition C-Gate)
//   D. Retake net-credit accounting helpers
//   E. Curricular track bifurcation (flexible_elective_configurations)
// No input object is mutated; every function returns new structures.
// ===========================================================================

export const CORE42_CLEARANCE_REASON = 'Cleared via Missouri CORE 42 / AA Transfer Block';
export const COMPOSITION_RETAKE_WARNING =
  'Grade of C or higher required to satisfy Composition GE. Course eligible for retake.';
export const UPPER_DIVISION_REQUIRED_CREDITS = 42;

const NON_EARNING_GRADES = new Set([
  'F', 'W', 'AF', 'WF', 'INC', 'I', 'NP', 'NC', 'U', 'DROPPED', 'DROPPED-W', 'DROP',
  'WITHDRAWN', 'AUDIT', 'AU', 'NG'
]);
const D_RANGE_GRADES = new Set(['D+', 'D', 'D-', 'DH']);
const IN_PROGRESS_STATES = new Set(['Current', 'Scheduled']);
const COMPLETED_STATES = new Set(['Completed', 'Complete', 'TR', 'Transfer']);

const PRESCRIBED_GE_KEY_MAP = {
  math: 'mathematics',
  mathematics: 'mathematics',
  oral_communication: 'oral_communication',
  written_communication: 'written_communication',
  natural_science: 'natural_sciences',
  natural_sciences: 'natural_sciences',
  social_science: 'social_behavioral_sciences',
  social_behavioral_sciences: 'social_behavioral_sciences',
  civics: 'civics',
  humanities: 'humanities_fine_arts',
  humanities_fine_arts: 'humanities_fine_arts'
};

const CATEGORY_RANK = { Major: 0, 'Major - Track': 0, Minor: 1, Certificate: 2 };

function toCompact(code) {
  const norm = normalizeCourseCode(code);
  return norm ? norm.compact : String(code || '').replace(/\s+/g, '').toUpperCase();
}

function upperGrade(grade) {
  return String(grade || '').trim().toUpperCase();
}

/** Credential category (kept local to avoid an engine -> utils dependency). */
export function classifyCredential(program) {
  if (!program) return 'Major';
  const type = program.program_type || '';
  const name = program.name || program.program_name || '';
  if (type === 'Minor' || /minor/i.test(name)) return 'Minor';
  if (type === 'Certificate' || /certificate/i.test(name)) return 'Certificate';
  if (name.includes('Emphasis') || name.includes(' - ')) return 'Major - Track';
  return 'Major';
}

/** True when a course attempt earns graduation credit (completed with a non-failing grade). */
export function isEarningAttempt(course) {
  if (!course) return false;
  if (IN_PROGRESS_STATES.has(course.state)) return false;
  const g = upperGrade(course.grade);
  if (NON_EARNING_GRADES.has(g)) return false;
  return COMPLETED_STATES.has(course.state) || Boolean(g);
}

/** True when a course is applied to the graduation record (earned or in progress). */
export function isAppliedToGraduation(course) {
  if (!course) return false;
  if (IN_PROGRESS_STATES.has(course.state)) return true;
  return isEarningAttempt(course);
}

/**
 * Orders declared programs: Primary Major first, then Secondary Majors, Minors, Certificates.
 * Accepts program objects or IDs (resolved against catalogDb). Returns a new array.
 */
export function orderDeclaredPrograms(declaredPrograms = [], catalogDb = masterDbDefault, primaryProgramId = null) {
  const db = catalogDb || masterDbDefault;
  const allProgs = getAllCatalogPrograms(db);
  const resolved = [];
  const seen = new Set();
  for (const entry of declaredPrograms || []) {
    const prog =
      typeof entry === 'string'
        ? allProgs.find((p) => p.id === entry) || (db.programs || []).find((p) => p.id === entry)
        : entry;
    if (prog && prog.id && !seen.has(prog.id)) {
      seen.add(prog.id);
      resolved.push(prog);
    }
  }
  const primaryId =
    primaryProgramId && resolved.some((p) => p.id === primaryProgramId)
      ? primaryProgramId
      : resolved.find((p) => CATEGORY_RANK[classifyCredential(p)] === 0)?.id || resolved[0]?.id;

  return resolved
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => {
      if (a.p.id === primaryId) return -1;
      if (b.p.id === primaryId) return 1;
      const ra = CATEGORY_RANK[classifyCredential(a.p)] ?? 3;
      const rb = CATEGORY_RANK[classifyCredential(b.p)] ?? 3;
      return ra !== rb ? ra - rb : a.idx - b.idx;
    })
    .map(({ p }) => p);
}

/**
 * Helper to extract program/major requirement load (distinct from 90/120+ degree conferral floors).
 */
export function getProgramRequirementCredits(prog) {
  if (typeof prog?.total_program_credits === 'number') return prog.total_program_credits;
  if (typeof prog?.total_major_credits === 'number') return prog.total_major_credits;
  if (typeof prog?.totalRequiredCredits === 'number' && prog.totalRequiredCredits < 90) return prog.totalRequiredCredits;
  return 0;
}

/**
 * E. Curricular Track Bifurcation.
 * Resolves flexible_elective_configurations tracks into stable ids (option_a, option_b, ...)
 * and reconfigures elective pool targets for the active track.
 */
export function resolveTrackConfiguration(program, activeTrackId = null) {
  const pools = program?.requirements?.elective_pools || [];
  const rawTracks = program?.requirements?.flexible_elective_configurations?.tracks || [];

  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    return {
      hasTracks: false,
      tracks: [],
      activeTrackId: null,
      activeTrack: null,
      electivePoolTargets: pools.map((pool) => ({
        poolId: pool.id,
        title: pool.title,
        creditsRequired: Number(pool.credits_required) || 0
      })),
      totalElectiveCredits: pools.reduce((s, pool) => s + (Number(pool.credits_required) || 0), 0),
      adjustedProgramCredits: getProgramRequirementCredits(program)
    };
  }

  const tracks = rawTracks.map((t, idx) => {
    const letter = String.fromCharCode(97 + idx); // a, b, c...
    const group1 = Number(t.group1_credits) || 0;
    const group2 = Number(t.group2_credits) || 0;
    return {
      id: `option_${letter}`,
      name: t.name || `Option ${letter.toUpperCase()}`,
      group1Credits: group1,
      group2Credits: group2,
      totalElectiveCredits: Number(t.total_elective_credits) || group1 + group2
    };
  });

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const groupTargets = [activeTrack.group1Credits, activeTrack.group2Credits];
  const electivePoolTargets = pools.map((pool, idx) => ({
    poolId: pool.id,
    title: pool.title,
    creditsRequired: idx < groupTargets.length ? groupTargets[idx] : Number(pool.credits_required) || 0
  }));

  // Catalog total_program_credits reflects the largest track; re-base it on the active track.
  const baseTotal = getProgramRequirementCredits(program);
  const maxTrackTotal = Math.max(...tracks.map((t) => t.totalElectiveCredits));
  const adjustedProgramCredits = Math.max(0, baseTotal - maxTrackTotal + activeTrack.totalElectiveCredits);

  return {
    hasTracks: true,
    tracks,
    activeTrackId: activeTrack.id,
    activeTrack,
    electivePoolTargets,
    totalElectiveCredits: activeTrack.totalElectiveCredits,
    adjustedProgramCredits
  };
}

/** True when a course is upper-division (30000+ level). */
export function isUpperDivisionCourse(course) {
  if (!course) return false;
  const num = Number(course.level || course.number);
  if (Number.isFinite(num) && num > 0) return num >= 30000;
  const m = String(course.code || '').match(/\b([3-5]\d{4})\b/);
  return Boolean(m);
}

/** C. 42 Upper-Division Credit Gate across all courses applied to graduation. */
export function computeUpperDivisionGate(courses = [], required = UPPER_DIVISION_REQUIRED_CREDITS) {
  const applied = (courses || []).filter((c) => isAppliedToGraduation(c) && isUpperDivisionCourse(c));
  const completed = applied.reduce((s, c) => s + (Number(c.credits) || 0), 0);
  return {
    required,
    completed,
    remaining: Math.max(0, required - completed),
    isSatisfied: completed >= required,
    courses: applied.map((c) => c.code)
  };
}

/** C. Composition C-Grade Gatekeeper for ENGL 15000 / EPP 15000 and ENGL 17000. */
export function evaluateCompositionGatekeeper(courses = []) {
  const slots = [
    { id: 'comp_1', label: 'Composition I', codes: ['ENGL15000', 'EPP15000'] },
    { id: 'comp_2', label: 'Composition II', codes: ['ENGL17000'] }
  ];
  const warnings = [];
  const slotResults = slots.map((slot) => {
    const attempts = (courses || []).filter((c) => slot.codes.includes(c.compactCode || toCompact(c.code)));
    const satisfying = attempts.find(
      (c) => IN_PROGRESS_STATES.has(c.state) || isGradeCOrHigher(c.grade)
    );
    if (!satisfying) {
      for (const a of attempts) {
        if (D_RANGE_GRADES.has(upperGrade(a.grade))) {
          warnings.push({
            slotId: slot.id,
            courseCode: a.code,
            grade: a.grade,
            creditsRetained: Number(a.credits) || 3,
            retakeEligible: true,
            message: COMPOSITION_RETAKE_WARNING
          });
        }
      }
    }
    return { ...slot, satisfied: Boolean(satisfying), satisfyingCourse: satisfying?.code || null };
  });

  return {
    writtenCommunicationSatisfied: slotResults.every((s) => s.satisfied),
    slots: slotResults,
    warnings
  };
}

function flattenApproved(category) {
  const out = [];
  const push = (list) => (Array.isArray(list) ? list.forEach((c) => out.push(toCompact(c))) : null);
  const ac = category?.approved_courses || category?.courses;
  if (Array.isArray(ac)) push(ac);
  else if (ac && typeof ac === 'object') Object.values(ac).forEach(push);
  push(category?.approved_lab_courses);
  push(category?.approved_non_lab_courses);
  return out;
}

/**
 * B. 8-Category Missouri CORE 42 General Education Audit.
 * - core42Completed === true  -> all categories cleared, 0 remaining GE credits.
 * - core42Completed === false -> distribution audit using catalogDb.general_education[catalogYear],
 *   with prescribed_ge_satisfactions from declared programs auto-applied.
 */
export function auditGeneralEducationCategories({
  courses = [],
  catalogDb = masterDbDefault,
  catalogYear = '2026-2027',
  programs = [],
  core42Completed = false
} = {}) {
  const db = catalogDb || masterDbDefault;
  const yearSchema = resolveGeMatrixForYear(catalogYear, db);
  const categoriesSchema = yearSchema?.categories || {};
  const totalRequired = Number(yearSchema?.total_credits_required) || 42;
  const catalogByCompact = new Map((db.courses || []).map((c) => [toCompact(c.code), c]));

  if (core42Completed) {
    const categories = Object.entries(categoriesSchema).map(([id, cat]) => ({
      id,
      name: cat.name,
      credits: Number(cat.credits ?? cat.credits_required) || 0,
      earnedCredits: Number(cat.credits ?? cat.credits_required) || 0,
      remainingCredits: 0,
      satisfied: true,
      waived: true,
      reason: CORE42_CLEARANCE_REASON,
      appliedCourses: [],
      prescribedCourses: []
    }));
    return {
      catalogYear,
      core42Active: true,
      bannerText: 'Missouri CORE 42 / AA Transfer Block Active',
      totalRequired,
      earnedCredits: totalRequired,
      remainingCredits: 0,
      categories
    };
  }

  // Prescribed GE satisfactions declared by any program in the stack
  const prescribedByCategory = {};
  for (const prog of programs || []) {
    for (const [key, code] of Object.entries(prog?.requirements?.prescribed_ge_satisfactions || {})) {
      const catId = PRESCRIBED_GE_KEY_MAP[key];
      const norm = normalizeCourseCode(code);
      if (!catId || !norm) continue;
      if (!prescribedByCategory[catId]) prescribedByCategory[catId] = [];
      if (!prescribedByCategory[catId].includes(norm.compact)) prescribedByCategory[catId].push(norm.compact);
    }
  }

  const usable = (courses || []).filter((c) => isAppliedToGraduation(c));
  const used = new Set();
  const keyOf = (c, i) => `${c.compactCode || toCompact(c.code)}#${i}`;
  const indexed = usable.map((c, i) => ({ c, key: keyOf(c, i), compact: c.compactCode || toCompact(c.code) }));

  const categories = [];
  for (const [id, cat] of Object.entries(categoriesSchema)) {
    const credits = Number(cat.credits ?? cat.credits_required) || 0;
    const applied = [];
    let earned = 0;

    if (id === 'written_communication') {
      const gate = evaluateCompositionGatekeeper(usable);
      for (const slot of gate.slots) {
        if (!slot.satisfied) continue;
        const hit = indexed.find((x) => !used.has(x.key) && x.c.code === slot.satisfyingCourse);
        if (hit) {
          used.add(hit.key);
          applied.push(hit.c.code);
          earned += Number(hit.c.credits) || 3;
        }
      }
      categories.push({
        id,
        name: cat.name,
        credits,
        earnedCredits: earned,
        remainingCredits: Math.max(0, credits - earned),
        satisfied: gate.writtenCommunicationSatisfied,
        waived: false,
        reason: gate.writtenCommunicationSatisfied ? 'Composition I & II completed with C or higher' : null,
        appliedCourses: applied,
        prescribedCourses: [],
        gatekeeperWarnings: gate.warnings
      });
      continue;
    }

    const prescribed = prescribedByCategory[id] || [];
    const approved = new Set([...flattenApproved(cat), ...prescribed]);
    const isOpenElective = approved.size === 0;
    const pendingPrescribed = [];

    // Prescribed courses first, then approved list / open GE electives
    const ordered = [
      ...indexed.filter((x) => prescribed.includes(x.compact)),
      ...indexed.filter((x) => !prescribed.includes(x.compact))
    ];
    for (const x of ordered) {
      if (earned >= credits) break;
      if (used.has(x.key)) continue;
      const eligible = isOpenElective
        ? GE_DEPARTMENTS.has(x.c.department || x.compact.replace(/\d.*$/, '')) && !isUpperDivisionCourse(x.c)
        : approved.has(x.compact);
      if (!eligible) continue;
      used.add(x.key);
      applied.push(x.c.code);
      earned += Number(x.c.credits) || 3;
    }

    let projected = earned;
    for (const compact of prescribed) {
      if (indexed.some((x) => x.compact === compact && applied.includes(x.c.code))) continue;
      const catCourse = catalogByCompact.get(compact);
      pendingPrescribed.push(catCourse?.code || compact);
      projected += Number(catCourse?.credits) || 3;
    }

    const satisfied = earned >= credits;
    categories.push({
      id,
      name: cat.name,
      credits,
      earnedCredits: earned,
      projectedCredits: projected,
      remainingCredits: Math.max(0, credits - projected),
      satisfied,
      projectedSatisfied: projected >= credits,
      waived: false,
      reason: satisfied
        ? 'Distribution requirement met'
        : projected >= credits
        ? 'Will be satisfied by prescribed major coursework'
        : null,
      appliedCourses: applied,
      prescribedCourses: prescribed.map((c) => catalogByCompact.get(c)?.code || c),
      pendingPrescribedCourses: pendingPrescribed
    });
  }

  const earnedCredits = categories.reduce((s, c) => s + Math.min(c.credits, c.earnedCredits), 0);
  const remainingCredits = categories.reduce((s, c) => s + c.remainingCredits, 0);
  return {
    catalogYear,
    core42Active: false,
    bannerText: null,
    totalRequired,
    earnedCredits,
    remainingCredits,
    categories
  };
}

/**
 * D. Retake Net Credit Accounting.
 * - Semester enrolled load always counts full course credits (billing / full-time pacing).
 * - Graduation pool delta: prior F/W (0 earned) -> full credits; prior D (already earned) -> 0 net.
 */
export function computeRetakeNetCredits(plannedCourse, historicalCourses = []) {
  const enrolledCredits = Number(plannedCourse?.credits) || 0;
  const compact = plannedCourse?.compactCode || toCompact(plannedCourse?.code);
  const priorAttempts = (historicalCourses || []).filter(
    (h) =>
      h &&
      h !== plannedCourse &&
      !h.isPlannedRetake &&
      (h.compactCode || toCompact(h.code)) === compact &&
      (COMPLETED_STATES.has(h.state) || (h.grade && !IN_PROGRESS_STATES.has(h.state)))
  );

  if (priorAttempts.length === 0) {
    return { isRetake: false, priorGrade: null, priorEarnedCredits: 0, enrolledCredits, netCredits: enrolledCredits, badgeLabel: null };
  }

  const earningAttempts = priorAttempts.filter((a) => isEarningAttempt(a));
  const priorEarnedCredits = earningAttempts.reduce((m, a) => Math.max(m, Number(a.credits) || 0), 0);
  const bestAttempt = earningAttempts[0] || priorAttempts[priorAttempts.length - 1];
  const netCredits = Math.max(0, enrolledCredits - priorEarnedCredits);

  return {
    isRetake: true,
    priorGrade: bestAttempt?.grade || null,
    priorEarnedCredits,
    enrolledCredits,
    netCredits,
    badgeLabel: `🔁 Retake (${netCredits} Net Cr / ${enrolledCredits} Enrolled Cr)`
  };
}

/**
 * A. Per-credential audit ledgers with a global cross-counting registry.
 * Shared required courses are marked satisfied in every credential that lists them,
 * but contribute to the unique applied-credit pool exactly once.
 */
export function buildProgramAuditLedgers(orderedPrograms = [], courses = [], catalogDb = masterDbDefault, activeTrackId = null) {
  const db = catalogDb || masterDbDefault;
  const catalogByCompact = new Map((db.courses || []).map((c) => [toCompact(c.code), c]));
  const studentByCompact = new Map();
  for (const c of courses || []) {
    if (!isAppliedToGraduation(c)) continue;
    const compact = c.compactCode || toCompact(c.code);
    if (!studentByCompact.has(compact)) studentByCompact.set(compact, c);
  }

  const appliedCourseCodes = new Map(); // compact -> { programId, programName }
  const sharedEntries = new Map(); // compact -> { code, credits, programs: [] }
  let uniqueAppliedCredits = 0;
  let grossRequiredCredits = 0;
  let crossCountedCredits = 0;

  const programAudits = orderedPrograms.map((prog, idx) => {
    const category = classifyCredential(prog);
    const track = resolveTrackConfiguration(prog, activeTrackId);
    const requiredCredits = track.adjustedProgramCredits || getProgramRequirementCredits(prog);
    grossRequiredCredits += requiredCredits;

    let satisfiedCredits = 0;
    let programCrossCounted = 0;

    const coreCompactSet = new Set((prog.requirements?.major_core_courses || []).map(toCompact));
    const prescribedFoundationCodes = Object.values(prog.requirements?.prescribed_ge_satisfactions || {}).filter((code) => {
      const norm = normalizeCourseCode(code);
      return norm && catalogByCompact.has(norm.compact) && !coreCompactSet.has(norm.compact);
    });
    const allProgramCourseCodes = [
      ...(prog.requirements?.major_core_courses || []),
      ...prescribedFoundationCodes
    ];

    const requirements = allProgramCourseCodes.map((rawCode) => {
      const compact = toCompact(rawCode);
      const catCourse = catalogByCompact.get(compact);
      const credits = Number(catCourse?.credits) || 3;
      const match = studentByCompact.get(compact) || null;
      const prior = appliedCourseCodes.get(compact);
      const isCrossCounted = Boolean(prior);
      const satisfied = Boolean(match);

      if (isCrossCounted) {
        programCrossCounted += credits;
        crossCountedCredits += credits;
        const entry = sharedEntries.get(compact) || { code: catCourse?.code || rawCode, credits, programs: [prior.programId] };
        entry.programs = [...entry.programs, prog.id];
        sharedEntries.set(compact, entry);
      } else {
        appliedCourseCodes.set(compact, { programId: prog.id, programName: prog.name });
        if (satisfied) uniqueAppliedCredits += credits;
      }
      if (satisfied) satisfiedCredits += credits;

      return {
        code: catCourse?.code || rawCode,
        compactCode: compact,
        title: catCourse?.title || rawCode,
        credits,
        satisfied,
        state: match ? match.state : 'Remaining',
        grade: match?.grade || null,
        isCrossCounted,
        sharedWithProgramId: prior?.programId || null,
        sharedWithProgramName: prior?.programName || null
      };
    });

    // Elective pools with active-track targets (courses not already applied to a requirement)
    const electivePools = track.electivePoolTargets.map((target) => {
      const pool = (prog.requirements?.elective_pools || []).find((p) => p.id === target.poolId) || {};
      const allowed = new Set((pool.allowed_courses || []).map(toCompact));
      const applied = [];
      let creditsApplied = 0;
      for (const [compact, c] of studentByCompact.entries()) {
        if (creditsApplied >= target.creditsRequired) break;
        if (!allowed.has(compact) || requirements.some((r) => r.compactCode === compact)) continue;
        applied.push(c.code);
        creditsApplied += Number(c.credits) || 3;
      }
      return {
        ...target,
        creditsApplied,
        remainingCredits: Math.max(0, target.creditsRequired - creditsApplied),
        appliedCourses: applied
      };
    });

    return {
      programId: prog.id,
      name: prog.name,
      category,
      role:
        idx === 0 && CATEGORY_RANK[category] === 0
          ? 'Primary Major'
          : CATEGORY_RANK[category] === 0
          ? 'Secondary Major'
          : category,
      isPrimary: idx === 0,
      requiredCredits,
      satisfiedCredits,
      crossCountedCredits: programCrossCounted,
      requirements,
      electivePools,
      track
    };
  });

  return {
    programAudits,
    crossCountingLedger: {
      entries: Array.from(sharedEntries.values()),
      grossRequiredCredits,
      crossCountedCredits,
      totalDeductedOverlapCredits: crossCountedCredits,
      netRequiredCredits: Math.max(0, grossRequiredCredits - crossCountedCredits),
      uniqueAppliedCredits,
      appliedCourseCodes: Array.from(appliedCourseCodes.keys())
    }
  };
}

/**
 * Multi-Program Degree Audit entry point.
 * @param {object} args
 * @param {object} args.studentRecord - parsed transcript ({ validCourses, excludedCourses, studentMetadata })
 * @param {Array<string|object>} args.declaredPrograms - program IDs or objects (primary first preferred)
 * @param {object} args.catalogDb - master database
 * @param {object} args.auditOptions - { core42Completed, activeTrackId, primaryProgramId, catalogYear, ...runWaterfallAudit options }
 * @returns {object} baseline runWaterfallAudit result augmented with multi-program ledgers and policy gates
 */
export function runDegreeAudit({ studentRecord = null, declaredPrograms = [], catalogDb = masterDbDefault, auditOptions = {} } = {}) {
  const db = catalogDb || masterDbDefault;
  const options = { ...(auditOptions || {}) };
  const ordered = orderDeclaredPrograms(declaredPrograms, db, options.primaryProgramId);
  const orderedIds = ordered.length > 0 ? ordered.map((p) => p.id) : ['cybersecurity_bs_2026'];
  const allProgs = getAllCatalogPrograms(db);
  const programs =
    ordered.length > 0
      ? ordered
      : orderedIds
          .map((id) => (typeof id === 'object' ? id : allProgs.find((p) => p.id === id) || (db.programs || []).find((p) => p.id === id)))
          .filter(Boolean);
  const primaryProgram = programs[0] || null;

  const courses = studentRecord?.validCourses || [];
  const catalogYear =
    options.catalogYear ||
    studentRecord?.studentMetadata?.catalogYear ||
    programs[0]?.catalog_year_id ||
    programs[0]?.catalogYear ||
    '2026-2027';

  const trackHost = programs.find((p) => resolveTrackConfiguration(p).hasTracks) || null;
  const trackConfiguration = trackHost ? resolveTrackConfiguration(trackHost, options.activeTrackId) : null;

  const { programAudits, crossCountingLedger } = buildProgramAuditLedgers(
    programs,
    courses,
    db,
    trackConfiguration?.activeTrackId || options.activeTrackId || null
  );

  const generalEducationAudit = auditGeneralEducationCategories({
    courses,
    catalogDb: db,
    catalogYear,
    programs,
    core42Completed: Boolean(options.core42Completed)
  });

  const upperDivisionGate = computeUpperDivisionGate(courses);
  const compositionGatekeeperAudit = evaluateCompositionGatekeeper(courses);

  // ---------------------------------------------------------------------------
  // Dynamic Graduation Finish Line Calculation
  // ---------------------------------------------------------------------------
  // 1. Dynamic Program Base Floor:
  // Sourced from primaryProgram.totalRequiredCredits (e.g., 90, 120, 124, 128). If missing or undefined, fallback to 120.
  let baseInstitutionalFloor = 120;
  if (primaryProgram) {
    if (typeof primaryProgram.totalRequiredCredits === 'number') {
      if (primaryProgram.totalRequiredCredits >= 90 || primaryProgram.credentialType === 'ASSOCIATE' || primaryProgram.degree_type === 'AA' || primaryProgram.degree_type === 'AS') {
        baseInstitutionalFloor = primaryProgram.totalRequiredCredits;
      } else if (typeof primaryProgram.total_degree_credits === 'number' && primaryProgram.total_degree_credits >= 90) {
        baseInstitutionalFloor = primaryProgram.total_degree_credits;
      } else {
        baseInstitutionalFloor = 120;
      }
    } else if (typeof primaryProgram.total_degree_credits === 'number' && primaryProgram.total_degree_credits >= 90) {
      baseInstitutionalFloor = primaryProgram.total_degree_credits;
    }
  }

  // 2. Net Multi-Credential Stack Floor:
  // Calculate netRequiredStackCredits as the non-duplicative sum of:
  // - General Education required credits (0 if CORE 42 completed, otherwise 42 minus prescribed GE waivers)
  let prescribedGeWaivers = 0;
  const countedPrescribed = new Set();
  const catalogByCompact = new Map((db.courses || []).map((c) => [toCompact(c.code), c]));
  for (const prog of programs || []) {
    for (const [key, code] of Object.entries(prog?.requirements?.prescribed_ge_satisfactions || {})) {
      const norm = normalizeCourseCode(code);
      if (!norm) continue;
      if (!countedPrescribed.has(norm.compact)) {
        countedPrescribed.add(norm.compact);
        const catCourse = catalogByCompact.get(norm.compact);
        prescribedGeWaivers += catCourse ? Number(catCourse.credits) || 3 : 3;
      }
    }
  }
  const geRequiredCredits = options.core42Completed ? 0 : Math.max(0, 42 - prescribedGeWaivers);

  // - Unique requirement credits across all declared credentials in the stack minus crossCountingLedger.totalDeductedOverlapCredits
  const overlapCredits = crossCountingLedger?.totalDeductedOverlapCredits ?? crossCountingLedger?.crossCountedCredits ?? 0;
  const grossProgramCredits = crossCountingLedger?.grossRequiredCredits ?? programs.reduce((sum, p) => {
    return sum + getProgramRequirementCredits(p);
  }, 0);
  const uniqueProgramCredits = Math.max(0, grossProgramCredits - overlapCredits);
  const netRequiredStackCredits = geRequiredCredits + uniqueProgramCredits;

  // 3. Dynamic Target Resolution:
  // targetGraduationCredits = Math.max(baseInstitutionalFloor, netRequiredStackCredits)
  const targetGraduationCredits = Math.max(baseInstitutionalFloor, netRequiredStackCredits);

  // Baseline engine (unchanged contract) continues to drive Screen 2 legacy tables + Screen 3 scheduler
  const baseline = runWaterfallAudit(studentRecord, orderedIds, db, {
    ...options,
    targetGraduationCredits
  });

  const resolvedPrograms = ordered.length > 0 ? ordered : baseline.selectedPrograms;

  const totalAppliedCredits = baseline.policyChecklist?.totalCredits?.EarnedPlusEnrolled ?? 0;
  const totalCompletedCredits = baseline.policyChecklist?.totalCredits?.completed ?? 0;

  // Remaining program requirements across all credential ledgers + remaining GE
  const remainingProgramRequirements = programAudits.reduce((sum, pa) => {
    const reqRemaining = pa.requirements.filter((r) => !r.satisfied).reduce((s, r) => s + r.credits, 0);
    const poolRemaining = (pa.electivePools || []).reduce((s, p) => s + (p.remainingCredits || 0), 0);
    return sum + reqRemaining + poolRemaining;
  }, 0) + (generalEducationAudit?.remainingCredits || 0);

  // Adjust Free Elective remaining calculation:
  // remainingFreeElectives = Math.max(0, targetGraduationCredits - (totalAppliedCredits + remainingProgramRequirements))
  const remainingFreeElectives = Math.max(0, targetGraduationCredits - (totalAppliedCredits + remainingProgramRequirements));

  if (baseline.policyChecklist?.totalCredits) {
    baseline.policyChecklist.totalCredits.target = targetGraduationCredits;
    baseline.policyChecklist.totalCredits.minThreshold = targetGraduationCredits;
    baseline.policyChecklist.totalCredits.satisfied =
      (baseline.policyChecklist.totalCredits.projectedTotal || totalAppliedCredits) >= targetGraduationCredits;
  }

  const advisingWarnings = [
    ...compositionGatekeeperAudit.warnings.map((w) => ({
      type: 'COMPOSITION_GATE',
      courseCode: w.courseCode,
      message: `${w.courseCode} (${w.grade}): ${w.message}`
    })),
    ...(upperDivisionGate.isSatisfied
      ? []
      : [
          {
            type: 'UPPER_DIVISION_GATE',
            message: `${upperDivisionGate.remaining} upper-division (30000+) credits still required (${upperDivisionGate.completed} / ${upperDivisionGate.required} earned or in progress).`
          }
        ])
  ];

  return {
    ...baseline,
    targetGraduationCredits,
    netRequiredStackCredits,
    baseInstitutionalFloor,
    remainingFreeElectives,
    totalEarnedAndEnrolledCredits: totalAppliedCredits,
    totalCompletedCredits,
    declaredProgramsOrdered: resolvedPrograms.map((p) => p.id),
    programAudits,
    crossCountingLedger,
    generalEducationAudit,
    upperDivisionGate,
    compositionGatekeeperAudit,
    advisingWarnings,
    trackConfiguration,
    activeTrackId: trackConfiguration?.activeTrackId || null,
    flags: { ...baseline.flags, core42Completed: Boolean(options.core42Completed) }
  };
}
