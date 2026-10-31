import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import {
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  ArrowRight,
  ExternalLink,
  Sparkles,
  BookOpen,
  X,
  Layers,
  RotateCcw,
  ChevronDown,
  Search,
  Trash2,
  Lock,
  Edit3,
  Calendar,
  Clock,
  ShieldCheck
} from 'lucide-react';
import {
  parseAnthologySpreadsheet,
  parseTranscriptPdf,
  verifyAnthologySpreadsheet,
  verifyTranscriptText,
  parseCombinedStudentRecords,
  extractStateFromDegreePlanPdf,
  extractTextFromPdf,
  verifyDocumentCurrency
} from '../engine/transcriptParser.js';
import { calculateStartingSemester } from '../engine/scheduler.js';
import dbAdapter from '../data/dbAdapter.js';
import ProgramCombobox, { parseProgramDetails } from './ProgramCombobox.jsx';
import CatalogYearCombobox from './CatalogYearCombobox.jsx';
import masterProgramsDb from '../data/masterProgramsDatabase.json' with { type: 'json' };
import {
  getProgramCategory,
  formatDeclaredStackHeader,
  calculateStackOverlap,
  remapStackForCatalogYear
} from '../utils/programStackUtils.js';
import {
  formatParsedTelemetrySummary,
  computeParsedTelemetryTotals,
  evaluateActiveTermEnrollment,
  parseAdvisorEmailUsername,
  formatFullAdvisorEmail,
  resolveRegistrationStartTerm,
  computePriorityRegistrationWindow,
  getPacingConstraintOptions,
  extractPlanPayloadFromPdfText,
  DEFAULT_ACTIVE_TERM_ID,
  DEFAULT_REFERENCE_DATE,
  MODALITY_PREFERENCE_OPTIONS,
  SUMMER_AVAILABILITY_OPTIONS,
  doesCourseMatchSemester
} from '../utils/intakeHelpers.js';

export const ANTHOLOGY_SOP_GUIDE_URL =
  'https://scribehow.com/shared/Export_Student_Course_Schedules_All_Results_from_Anthology';
export const TRANSCRIPT_SOP_GUIDE_URL =
  'https://scribehow.com/shared/Export_Unofficial_Student_Transcript_PDF_from_Anthology';

/**
 * Reusable, strictly validated student record dropzone component.
 */
function StudentRecordDropzone({
  id,
  title,
  subtitle,
  acceptedExtensions = ['.csv', '.xlsx'],
  file,
  onFileChange,
  onError,
  icon: Icon = FileSpreadsheet,
  badgeText = null
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const validateAndSetFile = (f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    const isAllowed = acceptedExtensions.map((e) => e.toLowerCase()).includes(ext);
    if (!isAllowed) {
      onError(`Invalid file format "${f.name}". Only ${acceptedExtensions.join(' or ')} files are permitted in this upload zone.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    onError('');
    onFileChange(f);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleInputChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      id={id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
      className={`relative border-2 rounded-xl p-4 text-center transition select-none ${
        file
          ? 'border-[#857542] bg-[#F7F5EE]/60'
          : isDragOver
          ? 'border-[#857542] bg-[#F7F5EE] ring-2 ring-[#857542]/30 cursor-copy'
          : 'border-dashed border-neutral-300 hover:border-[#857542] bg-neutral-50/50 hover:bg-neutral-50 cursor-pointer shadow-2xs'
      }`}
    >
      <input
        ref={inputRef}
        id={id ? `${id}-input` : undefined}
        type="file"
        accept={acceptedExtensions.join(',')}
        multiple={false}
        onChange={handleInputChange}
        className="hidden"
      />

      {file ? (
        <div className="flex items-center justify-between space-x-2 text-left">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="p-2 bg-[#857542] text-white rounded-lg">
              <Icon className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-neutral-900 truncate">{file.name}</p>
              <p className="text-[10px] text-neutral-500 font-mono">
                {(file.size / 1024).toFixed(1)} KB • <span className="text-emerald-700 font-semibold">Ready</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            title="Remove file"
            className="p-1 text-neutral-400 hover:text-red-600 rounded-md hover:bg-neutral-200/50 transition flex-shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <Icon className="w-6 h-6 text-[#857542] mx-auto mb-1.5" />
          <p className="text-xs font-bold text-neutral-800">{title}</p>
          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{subtitle}</p>
          {badgeText && (
            <span className="inline-block mt-1.5 text-[9px] font-bold uppercase tracking-wider text-neutral-600 bg-neutral-200/70 px-1.5 py-0.5 rounded">
              {badgeText}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Determine display session band label for an active semester course.
 */
function getCourseSessionBandLabel(course) {
  if (course.sessionBand) return course.sessionBand;
  const rawTerm = String(course.session || course.term || course.semester || course.termId || '').toUpperCase();
  if (/_II\b|SESSION\s*II|8-?WK\s*II|FA-II|SP-II/i.test(rawTerm)) {
    return 'Session II 8-Week';
  }
  if (/_I\b|SESSION\s*I\b|8-?WK\s*I\b|FA-I|SP-I/i.test(rawTerm)) {
    return 'Session I 8-Week';
  }
  return 'Full 16-Week';
}

export default function Screen1Intake({
  masterDb,
  facultyProfile,
  onIntakeComplete,
  onReloadPdfState,
  parsedTranscript,
  auditResult,
  selectedProgramId: propProgramId,
  onSelectProgramId,
  constraints: propConstraints,
  onUpdateConstraints,
  catalogYear: propCatalogYear,
  onUpdateCatalogYear,
  additionalPrograms: propAdditionalPrograms,
  onUpdateAdditionalPrograms,
  intakeFiles,
  onUpdateIntakeFiles,
  onClearActiveRecord
}) {
  // ---------------------------------------------------------------------------
  // 1. Files & Ingestion Channels (Card 1)
  // ---------------------------------------------------------------------------
  const [anthologyFile, setAnthologyFileState] = useState(intakeFiles?.anthologyFile || null);
  const [transcriptFile, setTranscriptFileState] = useState(intakeFiles?.transcriptFile || null);
  const [degreePlanFile, setDegreePlanFileState] = useState(intakeFiles?.degreePlanFile || null);

  const setAnthologyFile = (f) => {
    setAnthologyFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, anthologyFile: f }));
  };
  const setTranscriptFile = (f) => {
    setTranscriptFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, transcriptFile: f }));
  };
  const setDegreePlanFile = (f) => {
    setDegreePlanFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, degreePlanFile: f }));
  };

  useEffect(() => {
    if (intakeFiles) {
      if (intakeFiles.anthologyFile !== undefined) setAnthologyFileState(intakeFiles.anthologyFile);
      if (intakeFiles.transcriptFile !== undefined) setTranscriptFileState(intakeFiles.transcriptFile);
      if (intakeFiles.degreePlanFile !== undefined) setDegreePlanFileState(intakeFiles.degreePlanFile);
    }
  }, [intakeFiles]);

  // ---------------------------------------------------------------------------
  // 2. Identity Row (4 Inputs — All start empty with zero hardcoded sample names)
  // ---------------------------------------------------------------------------
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [advisorName, setAdvisorName] = useState(facultyProfile?.advisorName || '');
  const [advisorUsername, setAdvisorUsername] = useState(facultyProfile?.advisorUsername || '');

  // Keep advisorName and advisorUsername synced with facultyProfile if present
  useEffect(() => {
    if (facultyProfile?.advisorName && !advisorName) {
      setAdvisorName(facultyProfile.advisorName);
    }
    if (facultyProfile?.advisorUsername && !advisorUsername) {
      setAdvisorUsername(facultyProfile.advisorUsername);
    }
  }, [facultyProfile]);
  const [detectedGpa, setDetectedGpa] = useState('');

  // ---------------------------------------------------------------------------
  // 3. Card 2: Degree Curriculum & Credential Roster State
  // ---------------------------------------------------------------------------
  const [catalogYear, setCatalogYearState] = useState(propCatalogYear || '2026-2027');
  const [minCatalogYearStart, setMinCatalogYearStart] = useState(2023);
  const [selectedProgramId, setSelectedProgramIdState] = useState(propProgramId || '');
  const [primaryProgramId, setPrimaryProgramId] = useState(propProgramId || '');
  const [stagedComboboxProgramId, setStagedComboboxProgramId] = useState(propProgramId || '');
  const [core42TransferBlock, setCore42TransferBlock] = useState(false);
  const [declaredProgramIds, setDeclaredProgramIds] = useState(() => {
    if (Array.isArray(propAdditionalPrograms) && propAdditionalPrograms.length > 0) {
      const initial = propProgramId ? [propProgramId] : [];
      for (const p of propAdditionalPrograms) {
        if (p && !initial.includes(p)) initial.push(p);
      }
      return initial;
    }
    if (parsedTranscript && propProgramId) {
      return [propProgramId];
    }
    return propProgramId ? [propProgramId] : [];
  });

  const setCatalogYear = (cy) => {
    setCatalogYearState(cy);
    onUpdateCatalogYear?.(cy);
  };
  const setSelectedProgramId = (pId) => {
    setSelectedProgramIdState(pId);
    setPrimaryProgramId(pId);
    setStagedComboboxProgramId(pId);
    onSelectProgramId?.(pId);
    setDeclaredProgramIds((prev) => {
      if (!prev.includes(pId)) return [...prev, pId];
      return prev;
    });
  };

  useEffect(() => {
    if (propProgramId && parsedTranscript) {
      setSelectedProgramIdState(propProgramId);
      setPrimaryProgramId(propProgramId);
      setStagedComboboxProgramId(propProgramId);
      setDeclaredProgramIds((prev) => {
        if (!prev.includes(propProgramId)) return [propProgramId, ...prev];
        return prev;
      });
    }
  }, [propProgramId, parsedTranscript]);

  useEffect(() => {
    if (propCatalogYear) setCatalogYearState(propCatalogYear);
  }, [propCatalogYear]);

  const allAvailablePrograms = useMemo(() => {
    if (masterProgramsDb?.programs) {
      return Array.isArray(masterProgramsDb.programs)
        ? masterProgramsDb.programs
        : Object.values(masterProgramsDb.programs);
    }
    if (masterDb?.programs) {
      return Array.isArray(masterDb.programs)
        ? masterDb.programs
        : Object.values(masterDb.programs);
    }
    return [];
  }, [masterDb]);

  const availableProgramsForYear = useMemo(() => {
    return allAvailablePrograms.filter(
      (p) =>
        p.catalogYear === catalogYear ||
        p.catalog_year === catalogYear ||
        p.catalog_year_id === catalogYear
    );
  }, [allAvailablePrograms, catalogYear]);

  const declaredPrograms = useMemo(() => {
    return declaredProgramIds
      .map((id) => allAvailablePrograms.find((p) => p.id === id) || (masterDb?.programs || []).find((p) => p.id === id))
      .filter(Boolean);
  }, [declaredProgramIds, allAvailablePrograms, masterDb]);

  const effectivePrimaryMajorId = useMemo(() => {
    const declaredMajors = declaredPrograms.filter((p) => {
      const cat = getProgramCategory(p);
      return cat === 'Major' || cat === 'Major - Track';
    });
    if (declaredMajors.length === 0) return null;
    const match = declaredMajors.find((m) => m.id === primaryProgramId);
    return match ? match.id : declaredMajors[0].id;
  }, [declaredPrograms, primaryProgramId]);

  const stackOverlap = useMemo(() => {
    return calculateStackOverlap(declaredPrograms, { ...masterDb, programs: allAvailablePrograms });
  }, [declaredPrograms, masterDb, allAvailablePrograms]);

  const handleMakePrimary = (progId) => {
    setPrimaryProgramId(progId);
    setSelectedProgramIdState(progId);
    onSelectProgramId?.(progId);
  };

  const handleAddProgramToStack = (progId) => {
    if (!progId || declaredProgramIds.includes(progId)) return;
    setDeclaredProgramIds((prev) => [...prev, progId]);
    const addedProg = allAvailablePrograms.find((p) => p.id === progId) || (masterDb?.programs || []).find((p) => p.id === progId);
    if (addedProg) {
      const cat = getProgramCategory(addedProg);
      const isMajor = cat === 'Major' || cat === 'Major - Track';
      const hasExistingMajor = declaredProgramIds.some((id) => {
        const p = allAvailablePrograms.find((x) => x.id === id) || (masterDb?.programs || []).find((x) => x.id === id);
        return p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track');
      });
      if (isMajor && !hasExistingMajor) {
        setPrimaryProgramId(progId);
        setSelectedProgramIdState(progId);
        onSelectProgramId?.(progId);
      }
      onUpdateAdditionalPrograms?.((prev) => [...(prev || []), addedProg.name]);
    }
  };

  const handleRemoveProgramFromStack = (progId) => {
    setDeclaredProgramIds((prev) => {
      const next = prev.filter((id) => id !== progId);
      if (progId === effectivePrimaryMajorId) {
        const nextMajor = next.find((id) => {
          const p = allAvailablePrograms.find((x) => x.id === id) || (masterDb?.programs || []).find((x) => x.id === id);
          return p && (getProgramCategory(p) === 'Major' || getProgramCategory(p) === 'Major - Track');
        });
        if (nextMajor) {
          setPrimaryProgramId(nextMajor);
          setSelectedProgramIdState(nextMajor);
          onSelectProgramId?.(nextMajor);
        } else if (next.length > 0) {
          setPrimaryProgramId(next[0]);
          setSelectedProgramIdState(next[0]);
          onSelectProgramId?.(next[0]);
        }
      }
      return next;
    });
    const removedProg = allAvailablePrograms.find((p) => p.id === progId) || (masterDb?.programs || []).find((p) => p.id === progId);
    if (removedProg) {
      onUpdateAdditionalPrograms?.((prev) => (prev || []).filter((n) => n !== removedProg.name));
    }
  };

  const handleCatalogYearChange = (newYear) => {
    setCatalogYear(newYear);
    const remapped = remapStackForCatalogYear(declaredProgramIds, newYear, { programs: allAvailablePrograms });
    setDeclaredProgramIds(remapped);
    const remappedPrimary =
      remapped.find((id) => {
        const p = allAvailablePrograms.find((x) => x.id === id) || (masterDb?.programs || []).find((x) => x.id === id);
        return p && getProgramCategory(p).startsWith('Major');
      }) || remapped[0];
    if (remappedPrimary) {
      setPrimaryProgramId(remappedPrimary);
      setSelectedProgramId(remappedPrimary);
      setStagedComboboxProgramId(remappedPrimary);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Card 3: Scheduling Constraints State
  // ---------------------------------------------------------------------------
  const [pacingMode, setPacingModeState] = useState(
    propConstraints?.pacingMode || 'Full-Time'
  );
  const [min16wkCredits, setMin16wkCreditsState] = useState(
    propConstraints?.min16wkCredits !== undefined
      ? propConstraints.min16wkCredits
      : propConstraints?.pacingMode === 'Part-Time'
      ? 6
      : 12
  );
  const [max16wkCredits, setMax16wkCreditsState] = useState(
    propConstraints?.max16wkCredits !== undefined
      ? propConstraints.max16wkCredits
      : propConstraints?.pacingMode === 'Part-Time'
      ? 11
      : 15
  );
  const [modalityPreference, setModalityPreferenceState] = useState(
    propConstraints?.modalityPreference || 'No Preference (Default)'
  );
  const [max8wkCredits, setMax8wkCreditsState] = useState(
    propConstraints?.max8wkCredits !== undefined ? propConstraints.max8wkCredits : 9
  );
  const [summerAvailability, setSummerAvailabilityState] = useState(
    propConstraints?.summerAvailability || 'No Summer (Default)'
  );
  const [maxSummerCredits, setMaxSummerCreditsState] = useState(
    propConstraints?.maxSummerCredits !== undefined ? propConstraints.maxSummerCredits : 6
  );

  const setPacingMode = (mode) => {
    setPacingModeState(mode);
    if (mode === 'Part-Time') {
      setMin16wkCreditsState(6);
      setMax16wkCreditsState(11);
      setMax8wkCreditsState(6);
      onUpdateConstraints?.((prev) => ({
        ...prev,
        pacingMode: mode,
        min16wkCredits: 6,
        max16wkCredits: 11,
        max8wkCredits: 6
      }));
    } else {
      setMin16wkCreditsState(12);
      setMax16wkCreditsState(15);
      setMax8wkCreditsState(9);
      onUpdateConstraints?.((prev) => ({
        ...prev,
        pacingMode: mode,
        min16wkCredits: 12,
        max16wkCredits: 15,
        max8wkCredits: 9
      }));
    }
  };

  const setMin16wkCredits = (val) => {
    const num = Number(val);
    setMin16wkCreditsState(num);
    if (max16wkCredits < num) {
      setMax16wkCreditsState(num);
      onUpdateConstraints?.((prev) => ({ ...prev, min16wkCredits: num, max16wkCredits: num }));
    } else {
      onUpdateConstraints?.((prev) => ({ ...prev, min16wkCredits: num }));
    }
  };

  const setMax16wkCredits = (val) => {
    const num = Number(val);
    setMax16wkCreditsState(num);
    onUpdateConstraints?.((prev) => ({ ...prev, max16wkCredits: num }));
  };

  const setModalityPreference = (val) => {
    setModalityPreferenceState(val);
    onUpdateConstraints?.((prev) => ({ ...prev, modalityPreference: val }));
  };

  const setMax8wkCredits = (val) => {
    const num = Number(val);
    setMax8wkCreditsState(num);
    onUpdateConstraints?.((prev) => ({ ...prev, max8wkCredits: num }));
  };

  const setSummerAvailability = (val) => {
    setSummerAvailabilityState(val);
    onUpdateConstraints?.((prev) => ({ ...prev, summerAvailability: val }));
  };

  const setMaxSummerCredits = (val) => {
    const num = Number(val);
    setMaxSummerCreditsState(num);
    onUpdateConstraints?.((prev) => ({ ...prev, maxSummerCredits: num }));
  };

  const pacingOptions = useMemo(() => {
    return getPacingConstraintOptions(
      pacingMode === 'Part-Time' ? 'PART_TIME' : 'FULL_TIME',
      min16wkCredits,
      max16wkCredits,
      summerAvailability
    );
  }, [pacingMode, min16wkCredits, max16wkCredits, summerAvailability]);

  // ---------------------------------------------------------------------------
  // 5. Parsed Records & Cache State
  // ---------------------------------------------------------------------------
  const [cachedParsedTranscript, setCachedParsedTranscript] = useState(parsedTranscript || null);
  const [isDataExtracted, setIsDataExtracted] = useState(Boolean(parsedTranscript));
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsingError, setParsingError] = useState('');

  const currentCourses = useMemo(() => {
    if (cachedParsedTranscript?.validCourses) return cachedParsedTranscript.validCourses;
    if (parsedTranscript?.validCourses) return parsedTranscript.validCourses;
    return [];
  }, [cachedParsedTranscript, parsedTranscript]);

  const activeTermEnrollment = useMemo(() => {
    return evaluateActiveTermEnrollment(
      currentCourses,
      DEFAULT_ACTIVE_TERM_ID,
      pacingMode === 'Part-Time' ? 'PART_TIME' : 'FULL_TIME'
    );
  }, [currentCourses, pacingMode]);

  // ---------------------------------------------------------------------------
  // 6. Hydration from parsedTranscript props (e.g. back navigation)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!parsedTranscript) return;
    const meta = parsedTranscript.studentMetadata || {};
    if (meta.name || meta.student_name) setStudentName(meta.name || meta.student_name);
    if (meta.studentId || meta.student_id) setStudentId(meta.studentId || meta.student_id);
    if (meta.advisor || meta.advisor_name) setAdvisorName(meta.advisor || meta.advisor_name);
    const em = meta.email || meta.student_email || meta.advisorEmail || meta.advisor_email || '';
    if (em) setAdvisorUsername(parseAdvisorEmailUsername(em));
    if (meta.gpa !== undefined && meta.gpa !== null && meta.gpa !== '') setDetectedGpa(String(meta.gpa));
    if (meta.catalogYear || meta.catalog_year) setCatalogYear(meta.catalogYear || meta.catalog_year);
    if (meta.core42Completed !== undefined) setCore42TransferBlock(Boolean(meta.core42Completed));

    setCachedParsedTranscript(parsedTranscript);
    setIsDataExtracted(true);
  }, [parsedTranscript]);

  // ---------------------------------------------------------------------------
  // 7. Modals State
  // ---------------------------------------------------------------------------
  // Modal A: Active Term Course Editor
  const [editActiveTermModalOpen, setEditActiveTermModalOpen] = useState(false);
  const [activeTermWorkingList, setActiveTermWorkingList] = useState([]);
  const [activeTermSearchQuery, setActiveTermSearchQuery] = useState('');
  const [newCourseSessionBand, setNewCourseSessionBand] = useState('Full 16-Week');
  const [newCourseStatus, setNewCourseStatus] = useState('In-Progress');

  useEffect(() => {
    if (editActiveTermModalOpen) {
      setActiveTermWorkingList(
        activeTermEnrollment.activeCourses.map((c) => ({
          ...c,
          sessionBand: getCourseSessionBandLabel(c),
          status: c.status || (c.state === 'Completed' ? 'Completed' : c.state === 'Scheduled' ? 'Scheduled' : 'In-Progress')
        }))
      );
      setActiveTermSearchQuery('');
    }
  }, [editActiveTermModalOpen, activeTermEnrollment.activeCourses]);

  const activeTermSearchResults = useMemo(() => {
    const q = activeTermSearchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const all = masterDb?.courses || [];
    const matched = [];
    for (const c of all) {
      if (
        c.code.toLowerCase().includes(q) ||
        (c.title && c.title.toLowerCase().includes(q))
      ) {
        matched.push(c);
        if (matched.length >= 25) break;
      }
    }
    return matched;
  }, [activeTermSearchQuery, masterDb]);

  const handleAddCourseToActiveWorking = (catalogCourse) => {
    const compact = catalogCourse.code.replace(/\s+/g, '').toUpperCase();
    if (activeTermWorkingList.some((c) => (c.compactCode || c.code.replace(/\s+/g, '').toUpperCase()) === compact)) {
      return;
    }
    const newCourseObj = {
      code: catalogCourse.code,
      compactCode: compact,
      title: catalogCourse.title || catalogCourse.code,
      credits: Number(catalogCourse.credits) || 3.0,
      term: newCourseSessionBand === 'Session II 8-Week'
        ? 'Fall 2026 II 8wk'
        : newCourseSessionBand === 'Session I 8-Week'
        ? 'Fall 2026 I 8wk'
        : 'Fall 2026',
      semester: 'Fall 2026',
      sessionBand: newCourseSessionBand,
      status: newCourseStatus,
      state: newCourseStatus === 'Completed' ? 'Completed' : newCourseStatus === 'Scheduled' ? 'Scheduled' : 'Current',
      isActiveTerm: true
    };
    setActiveTermWorkingList((prev) => [newCourseObj, ...prev]);
  };

  const handleRemoveCourseFromActiveWorking = (idx) => {
    setActiveTermWorkingList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveActiveTermModal = () => {
    const existingCourses = currentCourses;
    const nonActiveCourses = existingCourses.filter((c) => !doesCourseMatchSemester(c, DEFAULT_ACTIVE_TERM_ID));

    const formattedActive = activeTermWorkingList.map((c) => {
      const compact = (c.compactCode || c.code || '').replace(/\s+/g, '').toUpperCase();
      const isCompleted = c.status === 'Completed' || c.state === 'Completed';
      return {
        ...c,
        code: c.code,
        compactCode: compact,
        title: c.title,
        credits: Number(c.credits) || 3.0,
        term: c.sessionBand === 'Session II 8-Week'
          ? 'Fall 2026 II 8wk'
          : c.sessionBand === 'Session I 8-Week'
          ? 'Fall 2026 I 8wk'
          : 'Fall 2026',
        semester: 'Fall 2026',
        sessionBand: c.sessionBand || 'Full 16-Week',
        state: isCompleted ? 'Completed' : c.status === 'Scheduled' ? 'Scheduled' : 'Current',
        status: c.status || (isCompleted ? 'Completed' : 'Current'),
        isActiveTerm: true
      };
    });

    const updatedValid = [...nonActiveCourses, ...formattedActive];
    const newRecord = {
      ...(cachedParsedTranscript || parsedTranscript || { studentMetadata: {} }),
      validCourses: updatedValid,
      completedCourses: updatedValid.filter((c) => c.state === 'Completed' || c.state === 'Transfer'),
      currentCourses: updatedValid.filter((c) => c.state === 'Current' || c.state === 'Scheduled')
    };

    setCachedParsedTranscript(newRecord);
    setIsDataExtracted(true);
    setEditActiveTermModalOpen(false);
  };

  // Modal B: Registration Start Term Confirmation Modal
  const [registrationModalState, setRegistrationModalState] = useState({
    isOpen: false,
    regResult: null,
    selectedTerm: 'Spring 2027 16wk'
  });

  // Clear Active Student Modal (3-second countdown)
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    let intervalId;
    if (clearModalOpen) {
      setCountdown(3);
      intervalId = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalId);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [clearModalOpen]);

  const handleConfirmClear = () => {
    setClearModalOpen(false);
    setAnthologyFile(null);
    setTranscriptFile(null);
    setDegreePlanFile(null);
    setStudentName('');
    setStudentId('');
    const preservedName = facultyProfile?.advisorName || advisorName || '';
    const preservedUser = facultyProfile?.advisorUsername || advisorUsername || '';
    setAdvisorName(preservedName);
    setAdvisorUsername(preservedUser);
    setDetectedGpa('');
    setCachedParsedTranscript(null);
    setIsDataExtracted(false);
    setCatalogYear('2026-2027');
    setSelectedProgramIdState('');
    setPrimaryProgramId('');
    setStagedComboboxProgramId('');
    setDeclaredProgramIds([]);
    setCore42TransferBlock(false);
    setActiveEnrollmentCourses([]);
    setPacingModeState('Full-Time');
    setMin16wkCreditsState(12);
    setMax16wkCreditsState(15);
    setMax8wkCreditsState(9);
    setModalityPreferenceState('No Preference (Default)');
    setSummerAvailabilityState('No Summer (Default)');
    setMaxSummerCreditsState(6);
    onClearActiveRecord?.();
  };

  // SOP Help & Wrong Document Modal
  const [documentModalState, setDocumentModalState] = useState({
    isOpen: false,
    isError: false,
    docType: 'Anthology',
    fileName: '',
    errorMessage: '',
    missingColumns: []
  });

  // Currency Warning Modal
  const [currencyWarningModalState, setCurrencyWarningModalState] = useState({
    isOpen: false,
    docType: 'Anthology',
    fileName: '',
    currentSemester: '',
    latestTermFound: '',
    printedDate: '',
    explanation: '',
    onProceed: null,
    onCancel: null
  });

  // ---------------------------------------------------------------------------
  // 8. Document Parsing & Pipeline Helpers
  // ---------------------------------------------------------------------------
  const parseFilesAndPopulateMetadata = async (nextAnthologyFile, nextTranscriptFile, nextDegreePlanFile) => {
    setIsProcessing(true);
    setParsingError('');

    try {
      let parsed = null;
      const defaultAdvisor =
        advisorName.trim() ||
        (facultyProfile
          ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim()
          : '');

      if (nextDegreePlanFile) {
        const buffer = await nextDegreePlanFile.arrayBuffer();
        const text = await extractTextFromPdf(buffer);
        const planPayload = extractPlanPayloadFromPdfText(text);

        if (planPayload) {
          if (planPayload.studentName || planPayload.studentMetadata?.name) {
            setStudentName(planPayload.studentName || planPayload.studentMetadata?.name);
          }
          if (planPayload.studentId || planPayload.studentMetadata?.studentId) {
            setStudentId(planPayload.studentId || planPayload.studentMetadata?.studentId);
          }
          if (planPayload.advisorName || planPayload.advisorInfo?.name) {
            setAdvisorName(planPayload.advisorName || planPayload.advisorInfo?.name);
          }
          const email = planPayload.advisorEmail || planPayload.advisorInfo?.email || planPayload.advisorInfo?.username || '';
          if (email) setAdvisorUsername(parseAdvisorEmailUsername(email));
          if (planPayload.catalogYear) handleCatalogYearChange(planPayload.catalogYear);
          if (Array.isArray(planPayload.declaredCredentialIds) && planPayload.declaredCredentialIds.length > 0) {
            setDeclaredProgramIds(planPayload.declaredCredentialIds);
            setPrimaryProgramId(planPayload.declaredCredentialIds[0]);
            setSelectedProgramId(planPayload.declaredCredentialIds[0]);
          }
          const rules = planPayload.pacingRules || planPayload.intakeConfig || {};
          if (rules.pacingMode) setPacingMode(rules.pacingMode);
          if (rules.selectedMin16Wk || rules.min16wkCredits) setMin16wkCredits(rules.selectedMin16Wk || rules.min16wkCredits);
          if (rules.selectedCap16Wk || rules.max16wkCredits) setMax16wkCredits(rules.selectedCap16Wk || rules.max16wkCredits);
          if (rules.max8wkCredits !== undefined) setMax8wkCredits(rules.max8wkCredits);
          if (rules.modalityPreference) setModalityPreference(rules.modalityPreference);
          if (rules.summerAvailability) setSummerAvailability(rules.summerAvailability);
          if (rules.maxSummerCredits !== undefined) setMaxSummerCredits(rules.maxSummerCredits);

          if (Array.isArray(planPayload.courses) && planPayload.courses.length > 0) {
            parsed = {
              validCourses: planPayload.courses,
              completedCourses: planPayload.courses.filter((c) => c.state === 'Completed' || c.state === 'Transfer'),
              currentCourses: planPayload.courses.filter((c) => c.state === 'Current' || c.state === 'Scheduled'),
              excludedCourses: [],
              studentMetadata: planPayload.studentMetadata || {}
            };
          }
        } else {
          const extractedState = await extractStateFromDegreePlanPdf(buffer);
          if (extractedState?.parsedTranscript) {
            parsed = extractedState.parsedTranscript;
          } else if (extractedState?.studentMetadata) {
            const history = extractedState.auditResult?.normalizedHistory || extractedState.auditResult?.allStudentCourses || [];
            parsed = {
              studentMetadata: extractedState.studentMetadata,
              validCourses: history,
              completedCourses: history.filter((c) => c.state === 'Complete' || c.state === 'Transfer'),
              currentCourses: history.filter((c) => c.state === 'Current' || c.state === 'Scheduled'),
              excludedCourses: []
            };
          }
        }
      }

      // If anthology and/or transcript files are provided, parse/merge them
      if (nextAnthologyFile && !nextTranscriptFile) {
        const buffer = await nextAnthologyFile.arrayBuffer();
        const ext = '.' + nextAnthologyFile.name.split('.').pop().toLowerCase();
        parsed = parseAnthologySpreadsheet(buffer, ext, {
          referenceYear: 2026,
          masterDb,
          studentMetadata: { advisor: defaultAdvisor }
        });
      } else if (nextTranscriptFile && !nextAnthologyFile) {
        const pdfBytes = await nextTranscriptFile.arrayBuffer();
        parsed = await parseTranscriptPdf(pdfBytes, {
          referenceYear: 2026,
          masterDb,
          studentMetadata: { advisor: defaultAdvisor }
        });
      } else if (nextAnthologyFile && nextTranscriptFile) {
        const anthologyBuffer = await nextAnthologyFile.arrayBuffer();
        const pdfBytes = await nextTranscriptFile.arrayBuffer();
        const transcriptText = await extractTextFromPdf(pdfBytes);
        parsed = parseCombinedStudentRecords({
          anthologyBufferOrString: anthologyBuffer,
          transcriptText,
          options: {
            referenceYear: 2026,
            masterDb,
            studentMetadata: { advisor: defaultAdvisor }
          }
        });
      }

      if (parsed) {
        const meta = parsed.studentMetadata || {};
        if (meta.student_name || meta.name) {
          setStudentName(meta.student_name || meta.name);
        }
        if (meta.student_id || meta.studentId) {
          setStudentId(meta.student_id || meta.studentId);
        }
        if (meta.advisor || meta.advisor_name) {
          setAdvisorName(meta.advisor || meta.advisor_name);
        }
        const parsedAdvEmail = meta.advisorEmail || meta.advisor_email || meta.email || '';
        if (parsedAdvEmail) {
          setAdvisorUsername(parseAdvisorEmailUsername(parsedAdvEmail));
        }
        if (meta.gpa !== undefined && meta.gpa !== null && meta.gpa !== '') {
          setDetectedGpa(String(meta.gpa));
        }

        // Program auto-matching if available
        let targetCatalogYear = catalogYear;
        const inferredYr = meta.catalog_year || meta.catalogYear;
        if (inferredYr && ['2024-2025', '2025-2026', '2026-2027'].includes(inferredYr)) {
          targetCatalogYear = inferredYr;
          setCatalogYear(inferredYr);
        }

        const detectedMajorStr = (meta.program || meta.major || '').toLowerCase();
        const detectedProgCode = (meta.programCode || '').toUpperCase();
        const availableProgs = allAvailablePrograms.filter(
          (p) =>
            p.catalogYear === targetCatalogYear ||
            p.catalog_year === targetCatalogYear ||
            p.catalog_year_id === targetCatalogYear
        );

        if (availableProgs.length > 0) {
          let matchedProg = null;
          if (detectedProgCode.includes('CYBSC') || detectedMajorStr.includes('cybersecurity')) {
            matchedProg = availableProgs.find((p) => p.name.toLowerCase().includes('cybersecurity'));
          } else if (detectedProgCode.includes('INTECH') || detectedMajorStr.includes('information technology')) {
            if (detectedMajorStr.includes('networking')) {
              matchedProg = availableProgs.find((p) => p.name.toLowerCase().includes('networking'));
            } else {
              matchedProg = availableProgs.find((p) =>
                p.name.toLowerCase().includes('applications development') ||
                p.name.toLowerCase().includes('information technology')
              );
            }
          } else if (detectedMajorStr) {
            matchedProg = availableProgs.find((p) =>
              p.name.toLowerCase().includes(detectedMajorStr.replace(/\s+bs$/i, '').trim())
            );
          }
          if (matchedProg) {
            setSelectedProgramId(matchedProg.id);
          }
        }

        setCachedParsedTranscript(parsed);
        setIsDataExtracted(true);
        return parsed;
      }

      return null;
    } catch (err) {
      setParsingError(`Extraction Error: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnthologyFileChange = async (file) => {
    if (!file) {
      setAnthologyFile(null);
      await parseFilesAndPopulateMetadata(null, transcriptFile, degreePlanFile);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const verification = verifyAnthologySpreadsheet(buffer);
      if (!verification.isValid) {
        setAnthologyFile(null);
        setParsingError(verification.errorMessage);
        setDocumentModalState({
          isOpen: true,
          isError: true,
          docType: 'Anthology',
          fileName: file.name,
          errorMessage: verification.errorMessage,
          missingColumns: verification.missingColumns || []
        });
        return;
      }

      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const parsedPreview = parseAnthologySpreadsheet(buffer, ext, { masterDb });
      const currencyCheck = verifyDocumentCurrency(parsedPreview, 'Anthology');

      const applyAnthology = async () => {
        setParsingError('');
        setAnthologyFile(file);
        await parseFilesAndPopulateMetadata(file, transcriptFile, degreePlanFile);
      };

      if (!currencyCheck.isCurrent) {
        setCurrencyWarningModalState({
          isOpen: true,
          docType: 'Anthology',
          fileName: file.name,
          currentSemester: currencyCheck.currentSemester,
          latestTermFound: currencyCheck.latestTermFound,
          printedDate: '',
          explanation: currencyCheck.explanation,
          onProceed: applyAnthology,
          onCancel: () => setAnthologyFile(null)
        });
        return;
      }

      await applyAnthology();
    } catch (err) {
      setAnthologyFile(null);
      setParsingError(`Unable to process Anthology file: ${err.message}`);
    }
  };

  const handleTranscriptFileChange = async (file) => {
    if (!file) {
      setTranscriptFile(null);
      await parseFilesAndPopulateMetadata(anthologyFile, null, degreePlanFile);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsedPreview = await parseTranscriptPdf(buffer, { masterDb });
      const text = parsedPreview.reconstructedText || (await extractTextFromPdf(buffer));
      const verification = verifyTranscriptText(text);

      if (!verification.isValid) {
        setTranscriptFile(null);
        setParsingError(verification.errorMessage);
        setDocumentModalState({
          isOpen: true,
          isError: true,
          docType: 'Transcript',
          fileName: file.name,
          errorMessage: verification.errorMessage,
          missingColumns: []
        });
        return;
      }

      const currencyCheck = verifyDocumentCurrency(parsedPreview, 'Transcript');
      const applyTranscript = async () => {
        setParsingError('');
        setTranscriptFile(file);
        await parseFilesAndPopulateMetadata(anthologyFile, file, degreePlanFile);
      };

      if (!currencyCheck.isCurrent) {
        setCurrencyWarningModalState({
          isOpen: true,
          docType: 'Transcript',
          fileName: file.name,
          currentSemester: currencyCheck.currentSemester,
          latestTermFound: currencyCheck.latestTermFound,
          printedDate: currencyCheck.printedDate,
          explanation: currencyCheck.explanation,
          onProceed: applyTranscript,
          onCancel: () => setTranscriptFile(null)
        });
        return;
      }

      await applyTranscript();
    } catch (err) {
      setTranscriptFile(null);
      setParsingError(`Unable to process Unofficial Transcript: ${err.message}`);
    }
  };

  const handleDegreePlanFileChange = async (file) => {
    if (!file) {
      setDegreePlanFile(null);
      await parseFilesAndPopulateMetadata(anthologyFile, transcriptFile, null);
      return;
    }
    setDegreePlanFile(file);
    await parseFilesAndPopulateMetadata(anthologyFile, transcriptFile, file);
  };

  const handleReExtract = async () => {
    await parseFilesAndPopulateMetadata(anthologyFile, transcriptFile, degreePlanFile);
  };

  // ---------------------------------------------------------------------------
  // 9. Run Degree Audit Workflow & Modal B Integration
  // ---------------------------------------------------------------------------
  const proceedWithAudit = (parsedRecord, startTerm) => {
    const effectiveStudentName = studentName.trim();
    const effectiveStudentId = studentId.trim();
    const effectiveAdvisor = advisorName.trim();
    const effectiveAdvisorEmail = formatFullAdvisorEmail(advisorUsername);

    let finalParsed = parsedRecord;
    if (!finalParsed) {
      finalParsed = {
        studentMetadata: {},
        validCourses: [],
        completedCourses: [],
        currentCourses: [],
        excludedCourses: [],
        summary: { totalCredits: 0, completedCredits: 0, currentCredits: 0, transferCredits: 0 }
      };
    }

    finalParsed.studentMetadata = {
      ...(finalParsed.studentMetadata || {}),
      name: effectiveStudentName || finalParsed.studentMetadata?.name || '',
      student_name: effectiveStudentName || finalParsed.studentMetadata?.student_name || '',
      studentId: effectiveStudentId || finalParsed.studentMetadata?.studentId || '',
      student_id: effectiveStudentId || finalParsed.studentMetadata?.student_id || '',
      advisor: effectiveAdvisor || finalParsed.studentMetadata?.advisor || '',
      advisorName: effectiveAdvisor || finalParsed.studentMetadata?.advisorName || '',
      email: effectiveAdvisorEmail || finalParsed.studentMetadata?.email || '',
      advisorEmail: effectiveAdvisorEmail || finalParsed.studentMetadata?.advisorEmail || '',
      gpa: detectedGpa || finalParsed.studentMetadata?.gpa || '',
      catalogYear,
      pacingMode,
      major: (allAvailablePrograms.find((p) => p.id === selectedProgramId) || (masterDb.programs || []).find((p) => p.id === selectedProgramId))?.name || '',
      core42Completed: core42TransferBlock,
      declaredPrograms: declaredProgramIds
    };

    onIntakeComplete({
      parsedTranscript: finalParsed,
      selectedProgramId,
      additionalPrograms: declaredPrograms.filter((p) => p.id !== selectedProgramId).map((p) => p.name),
      declaredPrograms: declaredProgramIds,
      core42Completed: core42TransferBlock,
      constraints: {
        startSemester: startTerm || 'Spring 2027 16wk',
        modalityPreference,
        summerAvailability,
        maxSummerCredits: summerAvailability === 'Yes Summer' ? Number(maxSummerCredits) || 6 : 0,
        pacingMode,
        min16wkCredits: Number(min16wkCredits) || 12,
        max16wkCredits: Number(max16wkCredits) || 15,
        max8wkCredits: Number(max8wkCredits) || 9,
        core42Completed: core42TransferBlock
      }
    });
  };

  const handleRunDegreeAudit = async () => {
    setIsProcessing(true);
    setParsingError('');

    try {
      let parsed = cachedParsedTranscript || parsedTranscript;
      if (!parsed && (anthologyFile || transcriptFile || degreePlanFile)) {
        parsed = await parseFilesAndPopulateMetadata(anthologyFile, transcriptFile, degreePlanFile);
      }

      const activeList = parsed?.validCourses || [];
      const regResult = resolveRegistrationStartTerm({
        courses: activeList,
        referenceDate: DEFAULT_REFERENCE_DATE
      });

      if (regResult.requiresManualSelection) {
        setRegistrationModalState({
          isOpen: true,
          regResult,
          selectedTerm: regResult.startTerm || 'Spring 2027 16wk'
        });
        setIsProcessing(false);
        return;
      }

      // If active Fall 2026 courses exist, automatically set start term to Spring 2027 16wk and proceed directly
      proceedWithAudit(parsed, regResult.startTerm || 'Spring 2027 16wk');
    } catch (err) {
      setParsingError(`Audit Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmRegistrationModal = () => {
    const term = registrationModalState.selectedTerm;
    setRegistrationModalState((prev) => ({ ...prev, isOpen: false }));
    const parsed = cachedParsedTranscript || parsedTranscript;
    proceedWithAudit(parsed, term);
  };

  const hasActiveRecord = Boolean(
    parsedTranscript ||
    cachedParsedTranscript ||
    currentCourses.length > 0 ||
    studentName.trim() ||
    studentId.trim() ||
    declaredProgramIds.length > 0
  );

  // ---------------------------------------------------------------------------
  // 10. Render
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-[#857542] uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Step 1: Student Intake &amp; Academic Constraints</span>
          </div>
          <h1 className="text-3xl font-display font-extrabold text-neutral-900 tracking-tight">
            Advising Workspace Intake
          </h1>
          <p className="text-xs text-neutral-600 mt-0.5">
            Ingest student records, define declared credentials, and configure scheduling pacing constraints.
          </p>
        </div>

        {hasActiveRecord && (
          <div id="screen1-active-record-toolbar" className="flex items-center space-x-3 flex-shrink-0">
            <button
              type="button"
              id="screen1-clear-active-btn"
              data-testid="clear-active-student-btn"
              onClick={() => setClearModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-100 hover:text-red-700 hover:border-red-200 transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              title="Clear Active Student Record"
            >
              <X className="w-3.5 h-3.5 text-neutral-500 hover:text-red-600 flex-shrink-0" />
              <span>✕ Clear Active Student</span>
            </button>

            <button
              type="button"
              id="screen1-top-proceed-btn"
              data-testid="top-run-audit-btn"
              onClick={handleRunDegreeAudit}
              disabled={isProcessing}
              className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded-lg shadow-sm transition flex items-center space-x-2 cursor-pointer disabled:bg-neutral-300"
            >
              <span>Run Degree Audit</span>
              <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </button>
          </div>
        )}
      </div>

      {parsingError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start space-x-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Record Intake Error</p>
            <p className="text-xs mt-0.5">{parsingError}</p>
          </div>
          <button
            type="button"
            onClick={() => setParsingError('')}
            className="text-red-400 hover:text-red-700 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* CARD 1: 1. STUDENT RECORDS */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-neutral-200/90 p-6 shadow-sm space-y-6">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#F7F5EE] border border-[#B5A36A]/40 text-[#857542] rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-neutral-900 tracking-tight">
                1. STUDENT RECORDS
              </h2>
              <p className="text-xs text-neutral-500">
                Official documents, student identity, and active semester telemetry
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Local Processing, Zero Uploads</span>
          </span>
        </div>

        {/* Identity Row (4 Inputs — All start empty with zero hardcoded sample names) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Student Full Name</span>
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <input
              id="optionB-student-name"
              data-testid="student-full-name"
              type="text"
              placeholder="Auto-Filled by Transcripts"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-semibold text-neutral-900 transition shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Student ID</span>
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <input
              id="optionB-student-id"
              data-testid="student-id"
              type="text"
              placeholder="Auto-Filled by Transcripts"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-mono font-semibold text-neutral-900 transition shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Advisor Name</span>
            </label>
            <input
              id="optionB-advisor-name"
              data-testid="advisor-full-name"
              type="text"
              placeholder="Prof. Name"
              value={advisorName}
              onChange={(e) => setAdvisorName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-semibold text-neutral-900 transition shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Advisor Email</span>
            </label>
            <div className="flex rounded-lg border border-neutral-300 hover:border-[#857542] focus-within:border-[#857542] focus-within:ring-2 focus-within:ring-[#857542]/20 overflow-hidden bg-white shadow-2xs transition">
              <input
                id="optionB-advisor-email"
                data-testid="advisor-email"
                type="text"
                placeholder="username"
                value={advisorUsername}
                onChange={(e) => setAdvisorUsername(parseAdvisorEmailUsername(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-transparent border-0 focus:outline-none focus:ring-0 font-medium text-neutral-900"
              />
              <span className="inline-flex items-center px-2.5 bg-neutral-100 text-neutral-500 text-[11px] font-mono font-semibold border-l border-neutral-200 select-none">
                @lindenwood.edu
              </span>
            </div>
          </div>
        </div>

        {/* 3 Ingestion Channels */}
        <div className="space-y-3 pt-2 border-t border-neutral-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
              Provide at least one document to Analyze
            </span>
            <button
              type="button"
              onClick={() =>
                setDocumentModalState({
                  isOpen: true,
                  isError: false,
                  docType: 'Anthology',
                  fileName: '',
                  errorMessage: '',
                  missingColumns: []
                })
              }
              className="text-[11px] text-[#857542] hover:underline flex items-center space-x-1 cursor-pointer font-semibold"
            >
              <span>🎬 Scribe SOP Export Guides</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Channel 1: Anthology Schedule */}
            <StudentRecordDropzone
              id="optionB-anthology"
              title="Anthology Schedule"
              subtitle=".xlsx or .csv"
              acceptedExtensions={['.xlsx', '.csv']}
              file={anthologyFile}
              onFileChange={handleAnthologyFileChange}
              onError={setParsingError}
              icon={FileSpreadsheet}
            />

            {/* Channel 2: Unofficial Transcript */}
            <StudentRecordDropzone
              id="optionB-transcript"
              title="Unofficial Transcript"
              subtitle=".pdf only"
              acceptedExtensions={['.pdf']}
              file={transcriptFile}
              onFileChange={handleTranscriptFileChange}
              onError={setParsingError}
              icon={FileText}
            />

            {/* Channel 3: Exported Degree Plan */}
            <StudentRecordDropzone
              id="optionA-degreePlan"
              title="Exported Degree Plan"
              subtitle=".pdf (Smart Advising Plan)"
              acceptedExtensions={['.pdf']}
              file={degreePlanFile}
              onFileChange={handleDegreePlanFileChange}
              onError={setParsingError}
              icon={FileText}
            />
          </div>
        </div>

        {/* Minimal Parsed Telemetry Panel (rendered below dropzones when courses exist) */}
        {currentCourses.length > 0 && (
          <div
            id="parsed-telemetry-panel"
            data-testid="parsed-telemetry-panel"
            className="p-4 bg-[#F7F5EE]/70 rounded-xl border border-[#B5A36A]/60 space-y-3.5 shadow-2xs"
          >
            {/* Header Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#B5A36A]/30">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#857542]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>✓ {formatParsedTelemetrySummary(currentCourses, DEFAULT_ACTIVE_TERM_ID)}</span>
              </div>
              <button
                type="button"
                id="telemetry-re-extract-btn"
                data-testid="telemetry-re-extract-btn"
                onClick={handleReExtract}
                className="text-[11px] font-bold text-[#857542] hover:text-[#5C512E] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Re-Extract</span>
              </button>
            </div>

            {/* Active Term Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800">
                  Active Term Enrollment Breakdown ({DEFAULT_ACTIVE_TERM_ID}):
                </span>
                <span className="text-[11px] font-mono text-neutral-600 font-semibold">
                  {activeTermEnrollment.activeCourses.length} active courses • {activeTermEnrollment.activeTermTotalCredits} credits
                </span>
              </div>

              {activeTermEnrollment.activeCourses.length === 0 ? (
                <p className="text-xs text-neutral-500 italic py-1">
                  No active {DEFAULT_ACTIVE_TERM_ID} courses detected on records. Click &ldquo;Edit Active Term&rdquo; to add in-progress coursework.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {activeTermEnrollment.activeCourses.map((c, idx) => {
                    const band = getCourseSessionBandLabel(c);
                    const isCompleted = c.state === 'Completed' || c.status === 'Completed';
                    const isScheduled = c.state === 'Scheduled' || c.status === 'Scheduled';
                    return (
                      <div
                        key={`${c.code}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-neutral-200/90 text-xs shadow-2xs"
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 font-mono">
                          {band}
                        </span>
                        <span className="font-bold font-mono text-neutral-900">{c.code}</span>
                        <span className="text-neutral-600 max-w-[140px] truncate">{c.title}</span>
                        <span className="font-mono text-neutral-500 text-[10px]">
                          ({Math.round(c.credits || 3)}cr)
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            isCompleted
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : isScheduled
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-amber-50 text-amber-900 border border-amber-200'
                          }`}
                        >
                          {isCompleted ? (c.grade ? `Completed (${c.grade})` : 'Completed') : isScheduled ? 'Scheduled' : 'In-Progress'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Warning & Edit Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#B5A36A]/30">
              <button
                type="button"
                id="edit-active-term-btn"
                data-testid="edit-active-term-btn"
                onClick={() => setEditActiveTermModalOpen(true)}
                className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 rounded-lg shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#857542]" />
                <span>✏️ Edit Active Term</span>
              </button>

              {activeTermEnrollment.showLowCreditWarning && (
                <span
                  id="low-active-credits-warning"
                  data-testid="low-active-credits-warning"
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 rounded-lg shadow-2xs"
                >
                  <span>⚠️ {activeTermEnrollment.activeTermTotalCredits} Active-Term Credits Detected (Expected ≥ 12 for Full-Time)</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* CARD 2: 2. DEGREE CURRICULUM & CREDENTIAL ROSTER */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-neutral-200/90 p-6 shadow-sm space-y-5">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#F7F5EE] border border-[#B5A36A]/40 text-[#857542] rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-neutral-900 tracking-tight">
                STUDENT ACADEMIC PLAN &amp; FUTURE CREDENTIALS
              </h2>
              <p className="text-xs text-neutral-500">
                Catalog year, multi-program stacking, and CORE42 Waiver.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-neutral-100 text-neutral-700 font-extrabold px-3 py-1 rounded-full border border-neutral-200">
            Curriculum from Website
          </span>
        </div>

        {/* 1. Catalog Year & CORE 42 Header Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Catalog Year */}
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Catalog Year</span>
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <CatalogYearCombobox
              catalogYear={catalogYear}
              minCatalogYearStart={minCatalogYearStart}
              onChange={handleCatalogYearChange}
            />
          </div>

          {/* Missouri CORE 42 / AA Transfer Block Complete Toggle */}
          <div className="md:col-span-7 flex justify-end">
            <div className="w-full sm:max-w-md bg-[#F7F5EE]/80 border border-[#B5A36A]/40 rounded-xl p-2.5 flex items-start gap-2.5 ml-auto">
              <input
                type="checkbox"
                id="core42-transfer-toggle"
                data-testid="core42-transfer-toggle"
                checked={core42TransferBlock}
                onChange={(e) => setCore42TransferBlock(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-[#857542] focus:ring-[#857542] cursor-pointer"
              />
              <label htmlFor="core42-transfer-toggle" className="cursor-pointer select-none">
                <span className="block text-xs font-bold text-neutral-900 leading-tight">
                  Missouri CORE 42 / AA Transfer Block Complete
                </span>
                <span className="block text-[10px] font-medium text-neutral-600 mt-0.5">
                  Waives all 42 lower-division GE requirements
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* 2. Credential Combobox & Add Action */}
        <div className="space-y-1.5 pt-2 border-t border-neutral-100">
          <div>
            <label className="block text-xs font-bold text-neutral-800">
              <span>Search & Add Academic Programs</span>
            </label>
            <p className="text-[10px] text-neutral-500">
              Majors, minors, or certificates
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <ProgramCombobox
                programs={availableProgramsForYear}
                catalogYear={catalogYear}
                selectedProgramId={stagedComboboxProgramId}
                onSelectProgramId={(newId) => setStagedComboboxProgramId(newId)}
              />
            </div>
            <button
              id="add-program-to-stack-button"
              data-testid="add-program-to-stack-button"
              type="button"
              disabled={!stagedComboboxProgramId || declaredProgramIds.includes(stagedComboboxProgramId)}
              onClick={() => handleAddProgramToStack(stagedComboboxProgramId)}
              className="px-4 py-2.5 bg-[#1E293B] hover:bg-[#0F172A] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-2xs transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Student Stack</span>
            </button>
          </div>
        </div>

        {/* 3. The Declared Credentials Stack Display */}
        <div className="pt-2 border-t border-neutral-100 space-y-2.5">
          <div className="flex items-center justify-between pb-1">
            <span
              id="declared-stack-header"
              data-testid="declared-stack-header"
              className="text-[11px] font-extrabold tracking-wider text-neutral-800"
            >
              {formatDeclaredStackHeader(declaredPrograms)}
            </span>
            <span className="text-[10px] font-semibold text-neutral-500">
              {declaredPrograms.length} {declaredPrograms.length === 1 ? 'Credential' : 'Credentials'} Active
            </span>
          </div>

          <div className="space-y-2" id="declared-credentials-stack">
            {declaredPrograms.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-500 border border-dashed border-neutral-300 rounded-xl bg-neutral-50/50">
                No degree programs declared. Select a program above and click <span className="font-semibold text-neutral-700">Add to Student Stack</span>.
              </div>
            ) : (
              declaredPrograms.map((prog) => {
                const category = getProgramCategory(prog);
                const isMajor = category === 'Major' || category === 'Major - Track';
                const isPrimary = isMajor && prog.id === effectivePrimaryMajorId;
                const isSecondaryMajor = isMajor && !isPrimary;
                const credits = prog.total_program_credits || prog.total_major_credits || 0;
                const details = parseProgramDetails(prog.name);

                let borderClass = 'border-l-4 border-l-[#1E293B]';
                let badgeText = category;
                let badgeClass = 'bg-[#1E293B]/10 text-[#1E293B] border-[#1E293B]/20';
                let iconText = '🎓';

                if (category === 'Minor') {
                  borderClass = 'border-l-4 border-l-slate-400';
                  badgeText = 'Minor';
                  badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
                  iconText = '📘';
                } else if (category === 'Certificate') {
                  borderClass = 'border-l-4 border-l-neutral-300';
                  badgeText = 'Certificate';
                  badgeClass = 'bg-neutral-100 text-neutral-700 border-neutral-300';
                  iconText = '📜';
                } else if (isSecondaryMajor) {
                  borderClass = 'border-l-4 border-l-[#857542]';
                  badgeText = 'Secondary Major (Double Major)';
                  badgeClass = 'bg-[#857542]/15 text-[#857542] border-[#857542]/30';
                  iconText = '🎓';
                } else if (isPrimary) {
                  borderClass = 'border-l-4 border-l-[#1E293B]';
                  badgeText = 'Primary Major';
                  badgeClass = 'bg-[#1E293B]/10 text-[#1E293B] border-[#1E293B]/20';
                  iconText = '🎓';
                }

                return (
                  <div
                    key={prog.id}
                    id={`declared-card-${prog.id}`}
                    data-testid={`declared-card-${prog.id}`}
                    className={`p-3 bg-neutral-50/70 hover:bg-neutral-50 rounded-xl border border-neutral-200 ${borderClass} transition flex items-center justify-between gap-3 shadow-2xs`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm select-none">{iconText}</span>
                        <span className="text-xs font-bold text-neutral-900 leading-tight">
                          {details.discipline}
                        </span>
                        <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${badgeClass}`}>
                          {isSecondaryMajor ? '🎓 SECONDARY MAJOR (Double Major)' : badgeText}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-6 text-[10px] text-neutral-600 flex-wrap">
                        {details.emphasis && (
                          <span className="font-semibold text-[#857542] bg-[#F7F5EE] border border-[#B5A36A]/40 px-1 rounded">
                            {details.emphasis}
                          </span>
                        )}
                        <span className="font-mono font-medium">{credits} credits</span>
                        {isPrimary && declaredPrograms.filter((p) => getProgramCategory(p).startsWith('Major')).length === 1 && (
                          <span className="inline-flex items-center gap-1 font-bold text-[#857542] bg-[#857542]/10 border border-[#857542]/30 px-1.5 py-0.5 rounded">
                            <Lock className="w-2.5 h-2.5" />
                            <span>Primary Degree (Locked)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSecondaryMajor && (
                        <button
                          type="button"
                          id={`make-primary-${prog.id}`}
                          data-testid={`make-primary-${prog.id}`}
                          onClick={() => handleMakePrimary(prog.id)}
                          className="px-2.5 py-1 text-[10px] font-bold text-[#857542] hover:text-[#5C512E] bg-[#F7F5EE] hover:bg-[#EFEBD9] border border-[#B5A36A]/50 rounded-md transition cursor-pointer"
                        >
                          Make Primary
                        </button>
                      )}
                      <button
                        type="button"
                        id={`remove-program-${prog.id}`}
                        data-testid={`remove-program-${prog.id}`}
                        onClick={() => handleRemoveProgramFromStack(prog.id)}
                        className="p-1 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title={`Remove ${prog.name}`}
                        aria-label={`Remove ${prog.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Overlap Summary */}
          <div
            id="declared-stack-overlap-footer"
            data-testid="declared-stack-overlap-footer"
            className="p-3 bg-white rounded-xl border border-neutral-200 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-3">
              <span className="text-neutral-600">
                Combined Total: <strong className="font-bold text-neutral-900">{stackOverlap.totalDeclaredCredits} cr</strong>
              </span>
              <span className="text-neutral-300">|</span>
              <span className="text-neutral-600">
                Shared Overlap: <strong className="font-bold text-[#857542]">-{stackOverlap.sharedOverlapCredits} cr</strong>
              </span>
            </div>
            <div className="text-right">
              <span className="text-neutral-600">
                Net Program Load: <strong className="font-extrabold text-[#1E293B] text-sm">{stackOverlap.netProgramLoad} cr</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* CARD 3: 3. SCHEDULING CONSTRAINTS */}
      {/* =================================================================== */}
      <div className="bg-white rounded-xl border border-neutral-200/90 p-6 shadow-sm space-y-6">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#F7F5EE] border border-[#B5A36A]/40 text-[#857542] rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-neutral-900 tracking-tight">
                3. SCHEDULING CONSTRAINTS
              </h2>
              <p className="text-xs text-neutral-500">
                Enrollment Status, pacing restrictions, summer availability
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-neutral-100 text-neutral-700 font-extrabold px-3 py-1 rounded-full border border-neutral-200">
            Path Pacing Rules
          </span>
        </div>

        {/* First Grid Row (3 Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Enrollment Status */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Enrollment Status</span>
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <div className="relative">
              <select
                id="optionB-pacing-mode"
                data-testid="enrollment-status-select"
                value={pacingMode}
                onChange={(e) => setPacingMode(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
              >
                <option value="Full-Time">Full-Time Student</option>
                <option value="Part-Time">Part-Time Student</option>
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Full-Time (&ge;12min) and Part-Time (&lt;12max) loads for Fall &amp; Spring
            </p>
          </div>

          {/* 2. 16-Week Semester Minimum */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>16-Week Semester Minimum</span>
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <div className="relative">
              <select
                id="optionB-min-16wk"
                data-testid="min-16wk-select"
                value={pacingOptions.selectedMin16Wk}
                onChange={(e) => setMin16wkCredits(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
              >
                {pacingOptions.min16WkOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 3. 16-Week Semester Cap */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>16-Week Semester Cap</span>
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <div className="relative">
              <select
                id="optionB-max-16wk"
                data-testid="cap-16wk-select"
                value={pacingOptions.selectedCap16Wk}
                onChange={(e) => setMax16wkCredits(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
              >
                {pacingOptions.cap16WkOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Second Grid Row (3 Columns default, expands to 4 when Yes Summer is selected) */}
        <div
          className={`grid gap-4 ${
            summerAvailability === 'Yes Summer'
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4'
              : 'grid-cols-1 md:grid-cols-3'
          }`}
        >
          {/* 1. Course Modality Preference */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Course Modality Preference</span>
            </label>
            <div className="relative">
              <select
                id="optionB-modality-select"
                data-testid="modality-select"
                value={modalityPreference}
                onChange={(e) => setModalityPreference(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
              >
                {MODALITY_PREFERENCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 2. 8-Week Session Cap */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>8-Week Session Cap</span>
            </label>
            <div className="relative">
              <select
                id="optionB-max-8wk"
                data-testid="cap-8wk-select"
                value={max8wkCredits}
                onChange={(e) => setMax8wkCredits(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
              >
                {pacingOptions.cap8WkOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 3. Summer Availability */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              <span>Summer Availability</span>
            </label>
            <div className="relative">
              <select
                id="optionB-summer-select"
                data-testid="summer-select"
                value={summerAvailability}
                onChange={(e) => setSummerAvailability(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
              >
                {SUMMER_AVAILABILITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* 4. Summer Credit Cap (Only when Yes Summer is selected) */}
          {summerAvailability === 'Yes Summer' && (
            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                <span>Summer Credit Cap</span>
              </label>
              <div className="relative">
                <select
                  id="optionB-summer-cap"
                  data-testid="summer-cap-select"
                  value={maxSummerCredits}
                  onChange={(e) => setMaxSummerCredits(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                >
                  {pacingOptions.summerCapOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Policy Callout Banners at bottom of Card 3 */}
        {(pacingOptions.showSummerTuitionNotice || pacingOptions.showOverloadNotice) && (
          <div className="space-y-2 pt-2 border-t border-neutral-100">
            {pacingOptions.showSummerTuitionNotice && (
              <div
                data-testid="summer-tuition-notice"
                className="p-3 rounded-lg bg-[#F7F5EE] border border-[#B5A36A] text-xs text-neutral-800 flex items-start space-x-2"
              >
                <span className="text-sm select-none">ℹ️</span>
                <div>
                  <strong className="font-bold text-neutral-900">Summer Tuition Notice:</strong>{' '}
                  <span>{pacingOptions.summerTuitionNoticeText}</span>
                </div>
              </div>
            )}

            {pacingOptions.showOverloadNotice && (
              <div
                data-testid="overload-notice"
                className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start space-x-2"
              >
                <span className="text-sm select-none">⚠️</span>
                <div>
                  <strong className="font-bold text-amber-950">Academic Course Overload Notice:</strong>{' '}
                  <span>{pacingOptions.overloadNoticeText}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* Bottom Dynamic Action Bar */}
      {/* =================================================================== */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-4">
        <button
          type="button"
          id="optionB-submit-btn"
          data-testid="run-degree-audit-btn"
          onClick={handleRunDegreeAudit}
          disabled={isProcessing}
          className="w-full sm:w-auto px-8 py-3.5 bg-[#857542] hover:bg-[#6E6035] disabled:bg-neutral-300 text-white text-sm font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 cursor-pointer"
        >
          <span>Run Degree Audit</span>
          <ArrowRight className="w-4 h-4 flex-shrink-0" />
        </button>
      </div>

      {/* =================================================================== */}
      {/* MODAL A: Active Term Course Editor */}
      {/* =================================================================== */}
      {editActiveTermModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="active-term-modal-title"
        >
          <div
            className="bg-white rounded-2xl border-2 border-[#B5A36A] max-w-3xl w-full p-6 text-neutral-900 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-[#F7F5EE] border border-[#B5A36A]/50 text-[#857542]">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="active-term-modal-title" className="text-base font-extrabold text-neutral-900">
                    Active Term Course Editor ({DEFAULT_ACTIVE_TERM_ID})
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Add, remove, or modify session bands and completion statuses for active term enrollments.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditActiveTermModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {/* Section 1: Active Term Courses List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-neutral-800 uppercase tracking-wide">
                    Enrolled Active Courses ({activeTermWorkingList.length})
                  </span>
                  <span className="font-mono text-neutral-600 font-semibold text-[11px]">
                    Total:{' '}
                    {activeTermWorkingList.reduce((sum, c) => sum + (Number(c.credits) || 0), 0)} cr
                  </span>
                </div>

                {activeTermWorkingList.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-neutral-200 rounded-xl text-center text-xs text-neutral-400">
                    No active term courses currently enrolled. Search the catalog below to add courses.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeTermWorkingList.map((c, idx) => (
                      <div
                        key={`${c.code}-${idx}`}
                        className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-neutral-900">{c.code}</span>
                            <span className="text-[10px] font-mono text-neutral-500 bg-white px-1.5 py-0.5 rounded border border-neutral-200">
                              {Math.round(c.credits || 3)} cr
                            </span>
                          </div>
                          <p className="text-xs text-neutral-700 truncate mt-0.5">{c.title}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                          {/* Term Band Selector */}
                          <select
                            value={c.sessionBand || 'Full 16-Week'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setActiveTermWorkingList((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, sessionBand: val } : item))
                              );
                            }}
                            className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 cursor-pointer shadow-2xs"
                          >
                            <option value="Full 16-Week">Full 16-Week</option>
                            <option value="Session I 8-Week">Session I 8-Week</option>
                            <option value="Session II 8-Week">Session II 8-Week</option>
                          </select>

                          {/* Status Selector */}
                          <select
                            value={c.status || 'In-Progress'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setActiveTermWorkingList((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, status: val } : item))
                              );
                            }}
                            className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 cursor-pointer shadow-2xs"
                          >
                            <option value="In-Progress">In-Progress</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Completed">Completed</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleRemoveCourseFromActiveWorking(idx)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-neutral-100 transition cursor-pointer"
                            title="Remove course"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Catalog Course Search */}
              <div className="pt-3 border-t border-neutral-200 space-y-3">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wide block">
                  Search All 1,936 Catalog Courses to Add
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6 relative">
                    <input
                      type="text"
                      placeholder="Search code or title (e.g. MTH 14100, CSC, Ethics)..."
                      value={activeTermSearchQuery}
                      onChange={(e) => setActiveTermSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-[#857542] text-neutral-900"
                    />
                    <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={newCourseSessionBand}
                      onChange={(e) => setNewCourseSessionBand(e.target.value)}
                      className="w-full py-2 px-2.5 text-xs bg-white border border-neutral-300 rounded-lg font-semibold text-neutral-800 cursor-pointer"
                    >
                      <option value="Full 16-Week">Full 16-Week</option>
                      <option value="Session I 8-Week">Session I 8-Week</option>
                      <option value="Session II 8-Week">Session II 8-Week</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={newCourseStatus}
                      onChange={(e) => setNewCourseStatus(e.target.value)}
                      className="w-full py-2 px-2.5 text-xs bg-white border border-neutral-300 rounded-lg font-semibold text-neutral-800 cursor-pointer"
                    >
                      <option value="In-Progress">In-Progress</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Search Results List */}
                {activeTermSearchQuery.trim().length >= 2 && (
                  <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-neutral-100 bg-white shadow-2xs">
                    {activeTermSearchResults.length === 0 ? (
                      <p className="p-3 text-xs text-neutral-400 text-center">
                        No courses found matching &ldquo;{activeTermSearchQuery}&rdquo;
                      </p>
                    ) : (
                      activeTermSearchResults.map((course) => {
                        const compact = course.code.replace(/\s+/g, '').toUpperCase();
                        const isAlreadyAdded = activeTermWorkingList.some(
                          (c) => (c.compactCode || c.code.replace(/\s+/g, '').toUpperCase()) === compact
                        );
                        return (
                          <div
                            key={course.code}
                            className="p-2.5 flex items-center justify-between gap-2 hover:bg-[#F7F5EE]/60 transition"
                          >
                            <div className="min-w-0 flex-1 truncate">
                              <span className="font-mono font-bold text-xs text-neutral-900 mr-2">
                                {course.code}
                              </span>
                              <span className="text-xs text-neutral-700 truncate">{course.title}</span>
                              <span className="text-[10px] font-mono text-neutral-500 ml-2">
                                ({Math.round(course.credits || 3)}cr)
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={isAlreadyAdded}
                              onClick={() => handleAddCourseToActiveWorking(course)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg transition disabled:bg-neutral-100 disabled:text-neutral-400 bg-[#857542] hover:bg-[#6E6035] text-white flex-shrink-0 cursor-pointer"
                            >
                              {isAlreadyAdded ? 'Added' : '+ Add'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditActiveTermModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-active-term-btn"
                data-testid="save-active-term-btn"
                onClick={handleSaveActiveTermModal}
                className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded-lg shadow-sm transition cursor-pointer"
              >
                Done / Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL B: Registration Start Term Confirmation Modal */}
      {/* =================================================================== */}
      {registrationModalState.isOpen && registrationModalState.regResult && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reg-modal-title"
        >
          <div
            className="bg-white rounded-2xl border-2 border-[#B5A36A] max-w-xl w-full p-6 text-neutral-900 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-[#F7F5EE] border border-[#B5A36A]/50 text-[#857542]">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="reg-modal-title" className="text-base font-extrabold text-neutral-900 leading-snug">
                    Confirm Registration Start Term
                  </h3>
                  <p className="text-xs text-neutral-500">
                    No active Fall 2026 courses detected. Select the starting semester for course scheduling.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRegistrationModalState((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Priority Registration Window Box */}
            <div className="p-4 rounded-xl bg-[#F7F5EE] border border-[#B5A36A]/50 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[#857542] font-bold">
                <span className="flex items-center space-x-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Student Standing: {registrationModalState.regResult.priorityWindow.standing}</span>
                </span>
                <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-[#B5A36A]/40">
                  {registrationModalState.regResult.priorityWindow.windowLabel} ({registrationModalState.regResult.priorityWindow.creditBand} cr)
                </span>
              </div>
              <p className="text-neutral-700 leading-relaxed">
                Registration Cutoff:{' '}
                <strong className="text-neutral-900 font-bold">
                  {registrationModalState.regResult.priorityWindow.cutoffDate}
                </strong>{' '}
                ({registrationModalState.regResult.priorityWindow.cutoffRule})
              </p>
            </div>

            {/* Term Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-800">
                Select Starting Term from Eligible Registration Windows:
              </label>
              <div className="relative">
                <select
                  id="registration-start-term-select"
                  data-testid="registration-start-term-select"
                  value={registrationModalState.selectedTerm}
                  onChange={(e) =>
                    setRegistrationModalState((prev) => ({ ...prev, selectedTerm: e.target.value }))
                  }
                  className="w-full appearance-none pl-3.5 pr-8 py-2.5 text-xs bg-white border border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-xl font-bold text-neutral-900 shadow-2xs cursor-pointer"
                >
                  {registrationModalState.regResult.eligibleTerms.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setRegistrationModalState((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-registration-term-btn"
                data-testid="confirm-start-term-btn"
                onClick={handleConfirmRegistrationModal}
                className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded-lg shadow-sm transition flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Confirm &amp; Run Degree Audit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* Clear Active Student Safety Modal (3-Second Countdown) */}
      {/* =================================================================== */}
      {clearModalOpen && (
        <div
          id="clear-student-modal"
          data-testid="clear-student-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-student-intake-title"
          onClick={() => setClearModalOpen(false)}
        >
          <div
            className="bg-white border border-neutral-200 rounded-xl max-w-md w-full p-6 text-neutral-900 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="space-y-1">
                <h3 id="clear-student-intake-title" className="text-base font-bold text-neutral-900 tracking-tight">
                  Clear Active Student Record?
                </h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  This will clear all 1. Student Intake information, 2. Degree Audit insights, and 3. Degree Planner Schedule. You will be returned to an empty student intake workspace.
                </p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end space-x-3 border-t border-neutral-100">
              <button
                type="button"
                id="clear-student-intake-cancel-btn"
                data-testid="cancel-clear-student-button"
                onClick={() => setClearModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg border border-neutral-300 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                id="clear-student-intake-confirm-btn"
                data-testid="confirm-clear-student-button"
                disabled={countdown > 0}
                onClick={handleConfirmClear}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition flex items-center space-x-1.5 ${
                  countdown > 0
                    ? 'opacity-50 cursor-not-allowed bg-red-400 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md cursor-pointer'
                }`}
              >
                <span>
                  {countdown > 0 ? `Confirm Clear (${countdown}s)` : 'Confirm Clear'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SOP Export Guide & Document Verification Modal */}
      {/* =================================================================== */}
      {documentModalState.isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl border-2 border-[#B5A36A] max-w-lg w-full p-6 text-neutral-900 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-[#F7F5EE] border border-[#B5A36A]/50 text-[#857542]">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-neutral-900">
                    {documentModalState.isError ? 'Document Verification Notice' : 'Anthology & Transcript Export Guide'}
                  </h3>
                  <p className="text-xs text-neutral-500">Official Lindenwood Scribe SOP instructions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDocumentModalState((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {documentModalState.isError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                <p className="font-bold">Rejected File: {documentModalState.fileName}</p>
                <p>{documentModalState.errorMessage}</p>
              </div>
            )}

            <div className="space-y-3 text-xs text-neutral-700">
              <p>
                Follow the official Lindenwood University Scribe SOPs to export student documents from Anthology Student:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <a
                  href={ANTHOLOGY_SOP_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#857542] hover:bg-[#F7F5EE]/40 transition block text-neutral-900 font-bold"
                >
                  <FileSpreadsheet className="w-5 h-5 text-[#857542] mb-1" />
                  <span>Anthology Schedule SOP</span>
                  <p className="text-[10px] text-neutral-500 font-normal mt-0.5">.xlsx or .csv format</p>
                </a>
                <a
                  href={TRANSCRIPT_SOP_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl border border-neutral-200 hover:border-[#857542] hover:bg-[#F7F5EE]/40 transition block text-neutral-900 font-bold"
                >
                  <FileText className="w-5 h-5 text-[#857542] mb-1" />
                  <span>Unofficial Transcript SOP</span>
                  <p className="text-[10px] text-neutral-500 font-normal mt-0.5">.pdf format</p>
                </a>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-200 flex justify-end">
              <button
                type="button"
                onClick={() => setDocumentModalState((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-white bg-[#857542] hover:bg-[#6E6035] rounded-lg transition cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* Skippable Currency Warning Modal */}
      {/* =================================================================== */}
      {currencyWarningModalState.isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl border-2 border-amber-400 max-w-lg w-full p-6 text-neutral-900 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3 pb-3 border-b border-amber-200">
              <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-900">
                  Uploaded Document May Be Out of Date
                </h3>
                <p className="text-xs text-amber-800 font-semibold">Institutional Currency Verification</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 space-y-1">
              <p className="font-bold">File: {currencyWarningModalState.fileName}</p>
              <p>{currencyWarningModalState.explanation}</p>
            </div>

            <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  if (currencyWarningModalState.onCancel) currencyWarningModalState.onCancel();
                  setCurrencyWarningModalState((prev) => ({ ...prev, isOpen: false }));
                }}
                className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition cursor-pointer"
              >
                Upload Newer Document
              </button>
              <button
                type="button"
                onClick={() => {
                  if (currencyWarningModalState.onProceed) currencyWarningModalState.onProceed();
                  setCurrencyWarningModalState((prev) => ({ ...prev, isOpen: false }));
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#857542] hover:bg-[#6E6035] rounded-lg shadow-sm transition flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Proceed Anyway</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
