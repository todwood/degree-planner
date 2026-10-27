import React, { useState, useRef, useEffect, useId } from 'react';
import {
  FileText,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
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
  Check,
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  parseAnthologySpreadsheet,
  parseTranscriptPdf,
  verifyAnthologySpreadsheet,
  STANDARD_ANTHOLOGY_HEADERS,
  verifyTranscriptText,
  parseTranscriptText,
  parseCombinedStudentRecords,
  extractStateFromDegreePlanPdf,
  processRawCourseRecords,
  extractTextFromPdf,
  verifyDocumentCurrency,
  getCurrentAcademicSemester
} from '../engine/transcriptParser.js';
import { calculateStartingSemester } from '../engine/scheduler.js';
import dbAdapter from '../data/dbAdapter.js';

export const ANTHOLOGY_SOP_GUIDE_URL =
  'https://scribehow.com/shared/Export_Student_Course_Schedules_All_Results_from_Anthology';
export const TRANSCRIPT_SOP_GUIDE_URL =
  'https://scribehow.com/shared/Export_Unofficial_Student_Transcript_PDF_from_Anthology';

/**
 * Generate a friendly fallback student name:
 * e.g. "Student 4821"
 */
function generateDefaultStudentName() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `Student ${randomNum}`;
}

/**
 * Reusable, strictly validated student record dropzone component.
 * Validates file extensions on both drag-and-drop and manual file picker selection,
 * strictly enforces maxFiles = 1, and displays file info with a remove button.
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
      className={`relative border-2 rounded-lg p-3.5 text-center transition select-none ${
        file
          ? 'border-[#857542] bg-[#F7F5EE]/60'
          : isDragOver
          ? 'border-[#857542] bg-[#F7F5EE] ring-2 ring-[#857542]/30 cursor-copy'
          : 'border-dashed border-neutral-300 hover:border-[#857542] bg-neutral-50/50 hover:bg-neutral-50 cursor-pointer'
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
            <div className="p-1.5 bg-[#857542] text-white rounded">
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
            className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-neutral-200/50 transition flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <Icon className="w-6 h-6 text-[#857542] mx-auto mb-1" />
          <p className="text-xs font-semibold text-neutral-800">{title}</p>
          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{subtitle}</p>
          {badgeText && (
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-neutral-600 bg-neutral-200/70 px-1.5 py-0.5 rounded">
              {badgeText}
            </span>
          )}
        </>
      )}
    </div>
  );
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
  // Option A files
  const [activeOption, setActiveOptionState] = useState(intakeFiles?.activeOption || 'B');
  const [degreePlanFile, setDegreePlanFileState] = useState(intakeFiles?.degreePlanFile || null);
  const [optionAAnthologyFile, setOptionAAnthologyFileState] = useState(intakeFiles?.optionAAnthologyFile || null);
  const [optionATranscriptFile, setOptionATranscriptFileState] = useState(intakeFiles?.optionATranscriptFile || null);

  // Option B files
  const [anthologyFile, setAnthologyFileState] = useState(intakeFiles?.anthologyFile || null);
  const [transcriptFile, setTranscriptFileState] = useState(intakeFiles?.transcriptFile || null);

  const setActiveOption = (opt) => {
    setActiveOptionState(opt);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, activeOption: opt }));
  };
  const setDegreePlanFile = (f) => {
    setDegreePlanFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, degreePlanFile: f }));
  };
  const setOptionAAnthologyFile = (f) => {
    setOptionAAnthologyFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, optionAAnthologyFile: f }));
  };
  const setOptionATranscriptFile = (f) => {
    setOptionATranscriptFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, optionATranscriptFile: f }));
  };
  const setAnthologyFile = (f) => {
    setAnthologyFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, anthologyFile: f }));
  };
  const setTranscriptFile = (f) => {
    setTranscriptFileState(f);
    onUpdateIntakeFiles?.((prev) => ({ ...prev, transcriptFile: f }));
  };

  useEffect(() => {
    if (intakeFiles) {
      if (intakeFiles.anthologyFile !== undefined) setAnthologyFileState(intakeFiles.anthologyFile);
      if (intakeFiles.transcriptFile !== undefined) setTranscriptFileState(intakeFiles.transcriptFile);
      if (intakeFiles.degreePlanFile !== undefined) setDegreePlanFileState(intakeFiles.degreePlanFile);
      if (intakeFiles.optionAAnthologyFile !== undefined) setOptionAAnthologyFileState(intakeFiles.optionAAnthologyFile);
      if (intakeFiles.optionATranscriptFile !== undefined) setOptionATranscriptFileState(intakeFiles.optionATranscriptFile);
      if (intakeFiles.activeOption !== undefined) setActiveOptionState(intakeFiles.activeOption);
    }
  }, [intakeFiles]);

  // Workflow B: Currently Enrolled Courses Quick-Add Tray State
  const [isEnrolledTrayOpen, setIsEnrolledTrayOpen] = useState(false);
  const [activeEnrolledCourses, setActiveEnrolledCourses] = useState([]);
  const [dbPlaceholders, setDbPlaceholders] = useState([]);
  const [traySearch, setTraySearch] = useState('');
  const [trayTab, setTrayTab] = useState('all'); // 'all', 'major', 'ge'
  const [isDragOverTray, setIsDragOverTray] = useState(false);

  useEffect(() => {
    let isMounted = true;
    dbAdapter
      .getPlaceholders()
      .then((phs) => {
        if (isMounted && phs && phs.length > 0) {
          setDbPlaceholders(phs);
        }
      })
      .catch((err) => console.warn('Failed to load placeholders from dbAdapter:', err));
    return () => {
      isMounted = false;
    };
  }, []);

  // Zero-Upload Support Modal (New Student / Clean Degree Plan Setup)
  const [zeroUploadModalOpen, setZeroUploadModalOpen] = useState(false);
  const zeroUploadDialogRef = useRef(null);
  const zeroUploadDialogTitleId = useId();

  // Student Advising Info (manual entry or auto-fill with smart defaults)
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [advisorName, setAdvisorName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [detectedGpa, setDetectedGpa] = useState('');

  // Program selection (Separate Catalog Year and Degree dropdowns)
  const [catalogYear, setCatalogYearState] = useState(propCatalogYear || '2026-2027');
  const [minCatalogYearStart, setMinCatalogYearStart] = useState(2024);
  const [selectedProgramId, setSelectedProgramIdState] = useState(propProgramId || 'cybersecurity_bs_2026');
  const [additionalPrograms, setAdditionalProgramsState] = useState(propAdditionalPrograms || []);

  const setCatalogYear = (cy) => {
    setCatalogYearState(cy);
    onUpdateCatalogYear?.(cy);
  };
  const setSelectedProgramId = (pId) => {
    setSelectedProgramIdState(pId);
    onSelectProgramId?.(pId);
  };
  const setAdditionalPrograms = (progsOrFn) => {
    if (typeof progsOrFn === 'function') {
      setAdditionalProgramsState((prev) => {
        const next = progsOrFn(prev);
        onUpdateAdditionalPrograms?.(next);
        return next;
      });
    } else {
      setAdditionalProgramsState(progsOrFn);
      onUpdateAdditionalPrograms?.(progsOrFn);
    }
  };

  useEffect(() => {
    if (propProgramId) setSelectedProgramIdState(propProgramId);
  }, [propProgramId]);

  useEffect(() => {
    if (propCatalogYear) setCatalogYearState(propCatalogYear);
  }, [propCatalogYear]);

  useEffect(() => {
    if (propAdditionalPrograms) setAdditionalProgramsState(propAdditionalPrograms);
  }, [propAdditionalPrograms]);

  // Scheduling Constraints
  const [modalityPreference, setModalityPreferenceState] = useState(
    propConstraints?.modalityPreference || 'No Preference (Flexible)'
  );
  const [summerAvailability, setSummerAvailabilityState] = useState(
    propConstraints?.summerAvailability || 'No Summer'
  );
  const [maxSummerCredits, setMaxSummerCreditsState] = useState(
    propConstraints?.maxSummerCredits !== undefined ? propConstraints.maxSummerCredits : 6
  );

  // Pacing Mode & Contrasting Session Caps
  const [pacingMode, setPacingModeState] = useState(
    propConstraints?.pacingMode || 'Full-Time'
  );
  const [max8wkCredits, setMax8wkCreditsState] = useState(
    propConstraints?.max8wkCredits !== undefined ? propConstraints.max8wkCredits : 9
  );
  const [max16wkCredits, setMax16wkCreditsState] = useState(
    propConstraints?.max16wkCredits !== undefined ? propConstraints.max16wkCredits : 18
  );

  const setModalityPreference = (v) => {
    setModalityPreferenceState(v);
    onUpdateConstraints?.((prev) => ({ ...prev, modalityPreference: v }));
  };
  const setSummerAvailability = (v) => {
    setSummerAvailabilityState(v);
    onUpdateConstraints?.((prev) => ({ ...prev, summerAvailability: v }));
  };
  const setMaxSummerCredits = (vOrFn) => {
    if (typeof vOrFn === 'function') {
      setMaxSummerCreditsState((prev) => {
        const next = vOrFn(prev);
        onUpdateConstraints?.((c) => ({ ...c, maxSummerCredits: next }));
        return next;
      });
    } else {
      setMaxSummerCreditsState(vOrFn);
      onUpdateConstraints?.((prev) => ({ ...prev, maxSummerCredits: vOrFn }));
    }
  };
  const setPacingMode = (v) => {
    setPacingModeState(v);
    onUpdateConstraints?.((prev) => ({ ...prev, pacingMode: v }));
  };
  const setMax8wkCredits = (v) => {
    setMax8wkCreditsState(v);
    onUpdateConstraints?.((prev) => ({ ...prev, max8wkCredits: v }));
  };
  const setMax16wkCredits = (v) => {
    setMax16wkCreditsState(v);
    onUpdateConstraints?.((prev) => ({ ...prev, max16wkCredits: v }));
  };

  useEffect(() => {
    if (!propConstraints) return;
    if (propConstraints.modalityPreference) setModalityPreferenceState(propConstraints.modalityPreference);
    if (propConstraints.summerAvailability) setSummerAvailabilityState(propConstraints.summerAvailability);
    if (propConstraints.maxSummerCredits !== undefined) setMaxSummerCreditsState(propConstraints.maxSummerCredits);
    if (propConstraints.pacingMode) setPacingModeState(propConstraints.pacingMode);
    if (propConstraints.max8wkCredits !== undefined) setMax8wkCreditsState(propConstraints.max8wkCredits);
    if (propConstraints.max16wkCredits !== undefined) setMax16wkCreditsState(propConstraints.max16wkCredits);
    if (propConstraints.startSemester) setCalculatedStartSemester(propConstraints.startSemester);
  }, [propConstraints]);

  const [parsingError, setParsingError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Explicit Extraction State & Deterministic Calculated Start Term
  const [isDataExtracted, setIsDataExtracted] = useState(false);
  const [extractedSummary, setExtractedSummary] = useState(null);
  const [calculatedStartSemester, setCalculatedStartSemester] = useState(
    propConstraints?.startSemester || 'Fall 2026'
  );
  const [cachedParsedTranscript, setCachedParsedTranscript] = useState(null);

  // 5-Second Countdown Active Record Clear Modal State
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    let intervalId;
    if (clearModalOpen) {
      setCountdown(5);
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

  useEffect(() => {
    if (!clearModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setClearModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearModalOpen]);

  // Hydrate local state from incoming props when navigating back to Screen 1
  useEffect(() => {
    if (!parsedTranscript) return;
    const meta = parsedTranscript.studentMetadata || {};
    const name = meta.name || meta.student_name || '';
    if (name) setStudentName(name);
    const sId = meta.studentId || meta.student_id || '';
    if (sId) setStudentId(sId);
    const gpa = meta.gpa || meta.student_gpa || '';
    if (gpa !== undefined && gpa !== null && gpa !== '') setDetectedGpa(String(gpa));
    const adv = meta.advisor || meta.advisor_name || '';
    if (adv) setAdvisorName(adv);
    const em = meta.email || meta.student_email || '';
    if (em) setStudentEmail(em);
    const ph = meta.phone || meta.student_phone || '';
    if (ph) setStudentPhone(ph);
    const catYr = meta.catalogYear || meta.catalog_year || '';
    if (catYr) setCatalogYear(catYr);

    if (propProgramId) setSelectedProgramId(propProgramId);
    if (propConstraints) {
      if (propConstraints.modalityPreference) setModalityPreference(propConstraints.modalityPreference);
      if (propConstraints.summerAvailability) setSummerAvailability(propConstraints.summerAvailability);
      if (propConstraints.maxSummerCredits !== undefined) setMaxSummerCredits(propConstraints.maxSummerCredits);
      if (propConstraints.pacingMode) setPacingMode(propConstraints.pacingMode);
      if (propConstraints.max8wkCredits !== undefined) setMax8wkCredits(propConstraints.max8wkCredits);
      if (propConstraints.max16wkCredits !== undefined) setMax16wkCredits(propConstraints.max16wkCredits);
      if (propConstraints.startSemester) setCalculatedStartSemester(propConstraints.startSemester);
    }

    const validCourses = parsedTranscript.validCourses || [];
    const completedCredits = validCourses
      .filter((c) => c.state === 'Complete' || c.state === 'Transfer')
      .reduce((s, c) => s + (c.credits || 0), 0);
    const currentCredits = validCourses
      .filter((c) => c.state === 'Current' || c.state === 'Scheduled')
      .reduce((s, c) => s + (c.credits || 0), 0);

    const startSem =
      propConstraints?.startSemester ||
      calculatedStartSemester ||
      calculateStartingSemester(parsedTranscript);

    setExtractedSummary({
      completedCredits,
      currentCredits,
      totalCredits: completedCredits + currentCredits,
      totalCourses: validCourses.length,
      calculatedStartSemester: startSem
    });

    // Restore manual enrolled courses if any
    const manualEnrolled = validCourses.filter((c) => c.isManualEnrollment);
    if (manualEnrolled.length > 0) {
      setActiveEnrolledCourses(manualEnrolled);
    }

    setCachedParsedTranscript(parsedTranscript);
    setIsDataExtracted(true);
  }, [parsedTranscript, propProgramId, propConstraints]);

  const handleConfirmClear = () => {
    setClearModalOpen(false);
    setAnthologyFile(null);
    setTranscriptFile(null);
    setDegreePlanFile(null);
    setOptionAAnthologyFile(null);
    setOptionATranscriptFile(null);
    setStudentName('');
    setStudentId('');
    setDetectedGpa('');
    setStudentEmail('');
    setStudentPhone('');
    setIsDataExtracted(false);
    setExtractedSummary(null);
    setCachedParsedTranscript(null);
    setActiveEnrolledCourses([]);
    setModalityPreferenceState('No Preference (Flexible)');
    setSummerAvailabilityState('No Summer');
    setMaxSummerCreditsState(6);
    setPacingModeState('Full-Time');
    setMax8wkCreditsState(9);
    setMax16wkCreditsState(18);
    setCalculatedStartSemester('Fall 2026');
    onClearActiveRecord?.();
  };

  const hasActiveRecord = Boolean(parsedTranscript || cachedParsedTranscript);

  // Student Records Verification & SOP Popup Modal State
  const [documentModalState, setDocumentModalState] = useState({
    isOpen: false,
    isError: false,
    docType: 'Anthology', // 'Anthology' or 'Transcript'
    optionLabel: '',
    fileName: '',
    errorMessage: '',
    missingColumns: []
  });
  const sopDialogRef = useRef(null);
  const sopDialogTitleId = useId();

  // Skippable Currency Verification Warning Modal State (Document May Be Out of Date)
  const [currencyWarningModalState, setCurrencyWarningModalState] = useState({
    isOpen: false,
    docType: 'Anthology', // 'Anthology' or 'Transcript'
    fileName: '',
    currentSemester: '',
    latestTermFound: '',
    printedDate: '',
    explanation: '',
    onProceed: null,
    onCancel: null
  });
  const currencyDialogRef = useRef(null);
  const currencyDialogTitleId = useId();

  useEffect(() => {
    const dialog = currencyDialogRef.current;
    if (!dialog) return;
    if (currencyWarningModalState.isOpen) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [currencyWarningModalState.isOpen]);

  useEffect(() => {
    const dialog = currencyDialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      setCurrencyWarningModalState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    };
    dialog.addEventListener('close', handleClose);

    let handleBackdropClick = null;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = zeroUploadDialogRef.current;
    if (!dialog) return;
    if (zeroUploadModalOpen) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [zeroUploadModalOpen]);

  useEffect(() => {
    const dialog = zeroUploadDialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      setZeroUploadModalOpen(false);
    };
    dialog.addEventListener('close', handleClose);

    let handleBackdropClick = null;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = sopDialogRef.current;
    if (!dialog) return;
    if (documentModalState.isOpen) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [documentModalState.isOpen]);

  // Fallback for browsers without native <dialog closedby="any"> support (per modern-web-guidance)
  useEffect(() => {
    const dialog = sopDialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      setDocumentModalState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    };
    dialog.addEventListener('close', handleClose);

    let handleBackdropClick = null;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, []);

  const openSopGuideModal = (docType = 'Anthology', optionLabel = 'Student Intake') => {
    setDocumentModalState({
      isOpen: true,
      isError: false,
      docType,
      optionLabel,
      fileName: '',
      errorMessage: '',
      missingColumns: []
    });
  };

  const openWrongDocumentModal = ({
    docType = 'Anthology',
    optionLabel,
    fileName,
    errorMessage,
    missingColumns = []
  }) => {
    setDocumentModalState({
      isOpen: true,
      isError: true,
      docType,
      optionLabel,
      fileName,
      errorMessage,
      missingColumns
    });
  };

  // Progressive disclosure flag: true once advisor drops >= 1 student file
  const hasFiles = Boolean(anthologyFile || transcriptFile);

  // Update pacing linked dropdown defaults when pacingMode changes
  const handlePacingModeChange = (mode) => {
    setPacingMode(mode);
    if (mode === 'Full-Time') {
      setMax8wkCredits(9);
      setMax16wkCredits(18);
    } else {
      setMax8wkCredits(6);
      setMax16wkCredits(11);
    }
  };

  // Update summer availability and corresponding credit cap
  const handleSummerChange = (val) => {
    setSummerAvailability(val);
    if (val === 'No Summer') setMaxSummerCredits(0);
    else if (val === 'Yes Summer') setMaxSummerCredits((prev) => (prev > 0 ? prev : 6));
    else if (val === 'Light Summer') setMaxSummerCredits(3);
    else if (val === 'Standard Summer') setMaxSummerCredits(6);
    else if (val === 'Accelerated Summer') setMaxSummerCredits(9);
  };

  /**
   * Deterministic parser runner that uses parseAnthologySpreadsheet and/or parseTranscriptPdf
   * and auto-populates detected student metadata, catalog year, degree, minors, and start term.
   */
  const parseFilesAndPopulateMetadata = async (nextAnthologyFile, nextTranscriptFile) => {
    if (!nextAnthologyFile && !nextTranscriptFile) {
      setIsDataExtracted(false);
      setExtractedSummary(null);
      setCachedParsedTranscript(null);
      return null;
    }

    setIsProcessing(true);
    setParsingError('');

    try {
      let parsed = null;
      const defaultAdvisor =
        advisorName.trim() ||
        (facultyProfile
          ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim()
          : 'Matthias Wood');

      if (nextAnthologyFile && !nextTranscriptFile) {
        const buffer = await nextAnthologyFile.arrayBuffer();
        const ext = '.' + nextAnthologyFile.name.split('.').pop().toLowerCase();
        parsed = parseAnthologySpreadsheet(buffer, ext, {
          referenceYear: 2026,
          masterDb,
          studentMetadata: {
            advisor: defaultAdvisor
          }
        });
      } else if (nextTranscriptFile && !nextAnthologyFile) {
        const pdfBytes = await nextTranscriptFile.arrayBuffer();
        parsed = await parseTranscriptPdf(pdfBytes, {
          referenceYear: 2026,
          masterDb,
          studentMetadata: {
            advisor: defaultAdvisor
          }
        });
      } else {
        const anthologyBufferOrString = await nextAnthologyFile.arrayBuffer();
        const pdfBytes = await nextTranscriptFile.arrayBuffer();
        const transcriptText = await extractTextFromPdf(pdfBytes);
        parsed = parseCombinedStudentRecords({
          anthologyBufferOrString,
          transcriptText,
          options: {
            referenceYear: 2026,
            masterDb,
            studentMetadata: {
              advisor: defaultAdvisor
            }
          }
        });
      }

      const meta = parsed.studentMetadata || {};
      const resolvedName = meta.student_name || meta.name || studentName || generateDefaultStudentName();
      const resolvedId = meta.student_id || meta.studentId || studentId || '';
      const resolvedGpa =
        meta.student_gpa !== null && meta.student_gpa !== undefined
          ? String(meta.student_gpa)
          : meta.gpa || '';

      setStudentName(resolvedName);
      if (resolvedId) setStudentId(resolvedId);
      setAdvisorName(defaultAdvisor);
      if (resolvedGpa) setDetectedGpa(resolvedGpa);

      parsed.studentMetadata = {
        ...meta,
        name: resolvedName,
        studentId: resolvedId,
        advisor: defaultAdvisor,
        gpa: resolvedGpa || meta.gpa
      };

      // Section 1.2 Auto-detect Catalog Year & Primary Major from parsed record
      let targetCatalogYear = catalogYear;
      const inferredYr = meta.catalog_year || meta.catalogYear;
      if (inferredYr) {
        const startYr = parseInt(String(inferredYr).split('-')[0], 10);
        if (!Number.isNaN(startYr)) {
          setMinCatalogYearStart(Math.max(2024, Math.min(2026, startYr)));
        }
        if (['2024-2025', '2025-2026', '2026-2027'].includes(inferredYr)) {
          targetCatalogYear = inferredYr;
          setCatalogYear(inferredYr);
        } else if (inferredYr === '2023-2024') {
          targetCatalogYear = '2024-2025';
          setCatalogYear('2024-2025');
        }
      }

      const detectedMajorStr = (meta.program || meta.major || '').toLowerCase();
      const detectedProgCode = (meta.programCode || '').toUpperCase();
      const minorsList = [
        ...(meta.declaredMinors || []),
        ...(meta.concentrations || [])
      ].filter(Boolean);
      const uniqueMinors = Array.from(new Set(minorsList));

      const availableProgs = (masterDb.programs || []).filter(
        (p) => p.catalog_year_id === targetCatalogYear
      );
      if (availableProgs.length > 0) {
        let matchedProg = null;
        if (detectedProgCode.includes('CYBSC') || detectedMajorStr.includes('cybersecurity')) {
          matchedProg = availableProgs.find((p) => p.name.toLowerCase().includes('cybersecurity'));
        } else if (
          detectedProgCode.includes('INTECH') ||
          detectedMajorStr.includes('information technology')
        ) {
          const minorsStr = uniqueMinors.join(' ').toLowerCase();
          if (minorsStr.includes('networking')) {
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
        } else if (!availableProgs.some((p) => p.id === selectedProgramId)) {
          setSelectedProgramId(availableProgs[0].id);
        }
      }

      if (uniqueMinors.length > 0) {
        setAdditionalPrograms(uniqueMinors);
      }

      const startSem = calculateStartingSemester(parsed);
      setCalculatedStartSemester(startSem);

      const completedCredits = (parsed.validCourses || [])
        .filter((c) => c.state === 'Complete' || c.state === 'Completed' || c.state === 'Transfer' || c.state === 'TR')
        .reduce((s, c) => s + (c.credits || 0), 0);
      const currentCredits = (parsed.validCourses || [])
        .filter((c) => c.state === 'Current' || c.state === 'Scheduled')
        .reduce((s, c) => s + (c.credits || 0), 0);

      setExtractedSummary({
        completedCredits,
        currentCredits,
        totalCredits: completedCredits + currentCredits,
        totalCourses: parsed.validCourses?.length || 0,
        calculatedStartSemester: startSem
      });

      setCachedParsedTranscript(parsed);
      setIsDataExtracted(true);
      return parsed;
    } catch (err) {
      setParsingError(`Extraction Error: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Shared deterministic verification check for Anthology .xlsx / .csv uploads
   * used identically by both Option A and Option B.
   */
  const verifyAndAssignAnthologyFile = async (file, optionKey) => {
    const optionLabel = optionKey === 'A' ? 'Option A (Returning Student Plan)' : 'Option B (New Student Audit)';
    if (!file) {
      if (optionKey === 'A') {
        setOptionAAnthologyFile(null);
      } else {
        setAnthologyFile(null);
        await parseFilesAndPopulateMetadata(null, transcriptFile);
      }
      setParsingError('');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const verification = verifyAnthologySpreadsheet(buffer);
      if (!verification.isValid) {
        if (optionKey === 'A') {
          setOptionAAnthologyFile(null);
        } else {
          setAnthologyFile(null);
          setIsDataExtracted(false);
          setExtractedSummary(null);
        }
        setParsingError(verification.errorMessage);
        openWrongDocumentModal({
          docType: 'Anthology',
          optionLabel,
          fileName: file.name,
          errorMessage: verification.errorMessage,
          missingColumns: verification.missingColumns || []
        });
        return;
      }

      setParsingError('');
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const parsedPreview = parseAnthologySpreadsheet(buffer, ext, { masterDb });
      const currencyCheck = verifyDocumentCurrency(parsedPreview, 'Anthology');

      const applyAnthology = async () => {
        setParsingError('');
        if (optionKey === 'A') {
          setOptionAAnthologyFile(file);
        } else {
          setAnthologyFile(file);
          await parseFilesAndPopulateMetadata(file, transcriptFile);
        }
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
          onCancel: () => {
            if (optionKey === 'A') {
              setOptionAAnthologyFile(null);
            } else {
              setAnthologyFile(null);
            }
          }
        });
        return;
      }

      await applyAnthology();
    } catch (err) {
      if (optionKey === 'A') {
        setOptionAAnthologyFile(null);
      } else {
        setAnthologyFile(null);
      }
      const msg = `Unable to verify Anthology file "${file.name}": ${err.message}`;
      setParsingError(msg);
      openWrongDocumentModal({
        docType: 'Anthology',
        optionLabel,
        fileName: file.name,
        errorMessage: msg,
        missingColumns: []
      });
    }
  };

  /**
   * Shared deterministic verification check for Unofficial Transcript .pdf uploads
   * used identically by both Option A and Option B.
   */
  const verifyAndAssignTranscriptFile = async (file, optionKey) => {
    const optionLabel = optionKey === 'A' ? 'Option A (Returning Student Plan)' : 'Option B (New Student Audit)';
    if (!file) {
      if (optionKey === 'A') {
        setOptionATranscriptFile(null);
      } else {
        setTranscriptFile(null);
        await parseFilesAndPopulateMetadata(anthologyFile, null);
      }
      setParsingError('');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parsedPreview = await parseTranscriptPdf(buffer, { masterDb });
      const text = parsedPreview.reconstructedText || (await extractTextFromPdf(buffer));
      const verification = verifyTranscriptText(text);

      if (!verification.isValid) {
        if (optionKey === 'A') {
          setOptionATranscriptFile(null);
        } else {
          setTranscriptFile(null);
          setIsDataExtracted(false);
          setExtractedSummary(null);
        }
        setParsingError(verification.errorMessage);
        openWrongDocumentModal({
          docType: 'Transcript',
          optionLabel,
          fileName: file.name,
          errorMessage: verification.errorMessage,
          missingColumns: []
        });
        return;
      }

      setParsingError('');
      const currencyCheck = verifyDocumentCurrency(parsedPreview, 'Transcript');

      const applyTranscript = async () => {
        setParsingError('');
        if (optionKey === 'A') {
          setOptionATranscriptFile(file);
        } else {
          setTranscriptFile(file);
          await parseFilesAndPopulateMetadata(anthologyFile, file);
        }
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
          onCancel: () => {
            if (optionKey === 'A') {
              setOptionATranscriptFile(null);
            } else {
              setTranscriptFile(null);
            }
          }
        });
        return;
      }

      await applyTranscript();
    } catch (err) {
      if (optionKey === 'A') {
        setOptionATranscriptFile(null);
      } else {
        setTranscriptFile(null);
      }
      const msg = `Unable to verify Unofficial Transcript PDF "${file.name}": ${err.message}`;
      setParsingError(msg);
      openWrongDocumentModal({
        docType: 'Transcript',
        optionLabel,
        fileName: file.name,
        errorMessage: msg,
        missingColumns: []
      });
    }
  };

  const handleOptionAAnthologyFileChange = (f) => {
    verifyAndAssignAnthologyFile(f, 'A');
  };

  const handleAnthologyFileChange = (f) => {
    verifyAndAssignAnthologyFile(f, 'B');
  };

  const handleOptionATranscriptFileChange = (f) => {
    verifyAndAssignTranscriptFile(f, 'A');
  };

  const handleTranscriptFileChange = (f) => {
    verifyAndAssignTranscriptFile(f, 'B');
  };

  const handleAnthologyDropzoneError = (msg, optionKey) => {
    setParsingError(msg);
    if (msg) {
      const optionLabel =
        optionKey === 'A' ? 'Option A (Returning Student Plan)' : 'Option B (New Student Audit)';
      openWrongDocumentModal({
        docType: 'Anthology',
        optionLabel,
        fileName: 'Unsupported File Format',
        errorMessage: msg,
        missingColumns: []
      });
    }
  };

  const handleTranscriptDropzoneError = (msg, optionKey) => {
    setParsingError(msg);
    if (msg) {
      const optionLabel =
        optionKey === 'A' ? 'Option A (Returning Student Plan)' : 'Option B (New Student Audit)';
      openWrongDocumentModal({
        docType: 'Transcript',
        optionLabel,
        fileName: 'Unsupported File Format',
        errorMessage: msg,
        missingColumns: []
      });
    }
  };

  // Explicit Extract Records Action
  const handleExtractRecords = async () => {
    if (!anthologyFile && !transcriptFile) {
      setParsingError('Please upload at least 1 student record document (.xlsx, .csv, or .pdf).');
      return;
    }
    await parseFilesAndPopulateMetadata(anthologyFile, transcriptFile);
  };

  // Handle Option A Submission (Reload from exported PDF)
  const handleReloadOptionA = async (e) => {
    e.preventDefault();
    if (!degreePlanFile) {
      setParsingError('Please select a previously exported Degree Plan PDF (.pdf).');
      return;
    }

    setIsProcessing(true);
    setParsingError('');

    try {
      const buffer = await degreePlanFile.arrayBuffer();
      const extractedState = await extractStateFromDegreePlanPdf(buffer);

      if (!extractedState || !extractedState.auditResult || !extractedState.schedule) {
        setParsingError(
          'Could not find DegreePlanState metadata in this PDF. Please ensure this PDF was generated by this Degree Planner.'
        );
        setIsProcessing(false);
        return;
      }

      // If newer optional student records were uploaded in Option A, verify and parse them using the exact same engine
      if (optionAAnthologyFile || optionATranscriptFile) {
        let updatedParsed = null;
        if (optionAAnthologyFile && !optionATranscriptFile) {
          const anthologyBuf = await optionAAnthologyFile.arrayBuffer();
          const verification = verifyAnthologySpreadsheet(anthologyBuf);
          if (!verification.isValid) {
            setOptionAAnthologyFile(null);
            setParsingError(verification.errorMessage);
            openWrongDocumentModal({
              docType: 'Anthology',
              optionLabel: 'Option A (Returning Student Plan)',
              fileName: optionAAnthologyFile.name,
              errorMessage: verification.errorMessage,
              missingColumns: verification.missingColumns || []
            });
            setIsProcessing(false);
            return;
          }
          const ext = '.' + optionAAnthologyFile.name.split('.').pop().toLowerCase();
          updatedParsed = parseAnthologySpreadsheet(anthologyBuf, ext, {
            referenceYear: 2026,
            masterDb,
            studentMetadata: extractedState.studentMetadata || {}
          });
        } else if (optionATranscriptFile && !optionAAnthologyFile) {
          const pdfBytes = await optionATranscriptFile.arrayBuffer();
          updatedParsed = await parseTranscriptPdf(pdfBytes, {
            referenceYear: 2026,
            masterDb,
            studentMetadata: extractedState.studentMetadata || {}
          });
        } else {
          const anthologyBuf = await optionAAnthologyFile.arrayBuffer();
          const pdfBytes = await optionATranscriptFile.arrayBuffer();
          const transcriptText = await extractTextFromPdf(pdfBytes);
          updatedParsed = parseCombinedStudentRecords({
            anthologyBufferOrString: anthologyBuf,
            transcriptText,
            options: {
              referenceYear: 2026,
              masterDb,
              studentMetadata: extractedState.studentMetadata || {}
            }
          });
        }

        extractedState.parsedTranscript = updatedParsed;
        extractedState.studentMetadata = {
          ...extractedState.studentMetadata,
          ...updatedParsed.studentMetadata
        };
      }

      onReloadPdfState(extractedState);
    } catch (err) {
      setParsingError(`Failed to parse PDF metadata: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Available courses for Currently Enrolled Courses Tray (Workflow B)
  const availableTrayCourses = React.useMemo(() => {
    const currentProg = (masterDb?.programs || []).find((p) => p.id === selectedProgramId);
    const catalogMap = new Map();
    for (const c of masterDb?.courses || []) {
      catalogMap.set(c.code.toUpperCase().replace(/\s+/g, ''), c);
    }

    const majorList = [];
    if (currentProg?.requirements) {
      const req = currentProg.requirements;
      const processCourse = (item, catLabel) => {
        const code = typeof item === 'string' ? item : item.code;
        if (!code || code.startsWith('REQ_') || code.includes('ELECTIVE') || code.includes('GE-MATH') || dbAdapter.isPlaceholder(code)) return;
        const compact = code.toUpperCase().replace(/\s+/g, '');
        const catalogCourse = catalogMap.get(compact);
        if (catalogCourse?.type === 'placeholder') return;
        majorList.push({
          code: catalogCourse?.code || code,
          compactCode: compact,
          title: catalogCourse?.title || (typeof item === 'object' ? item.title : code),
          credits:
            catalogCourse?.credits !== undefined
              ? Number(catalogCourse.credits)
              : typeof item === 'object' && item.credits
              ? Number(item.credits)
              : 3.0,
          department: catalogCourse?.department || code.split(' ')[0],
          number: catalogCourse?.number || parseInt(code.replace(/\D/g, ''), 10) || 10000,
          category: catLabel,
          type: 'concrete',
          hasHDAttribute: Boolean(
            catalogCourse?.hasHDAttribute || /\/HD\b/i.test(catalogCourse?.title || '')
          )
        });
      };

      for (const c of req.major_core_courses || []) processCourse(c, 'Major Core');
      for (const c of req.emphasis_courses || []) processCourse(c, 'Emphasis');
      for (const c of req.math_courses || []) processCourse(c, 'Math Requirement');
    }

    // Deduplicate major requirements by compactCode
    const seenCodes = new Set();
    const dedupedMajor = [];
    for (const c of majorList) {
      if (!seenCodes.has(c.compactCode)) {
        seenCodes.add(c.compactCode);
        dedupedMajor.push(c);
      }
    }

    // Foundational concrete General Education courses
    const concreteGeCodes = ['ENGL 15000', 'ENGL 17000', 'MTH 14100'];
    const concreteGeList = concreteGeCodes.map((code) => {
      const compact = code.replace(/\s+/g, '').toUpperCase();
      const cat = catalogMap.get(compact);
      return {
        code: cat?.code || code,
        compactCode: compact,
        title: cat?.title || code,
        credits: cat?.credits !== undefined ? Number(cat.credits) : 3.0,
        department: cat?.department || code.split(' ')[0],
        number: cat?.number || parseInt(code.replace(/\D/g, ''), 10) || 10000,
        category: 'General Education',
        type: 'concrete',
        hasHDAttribute: Boolean(cat?.hasHDAttribute || /\/HD\b/i.test(cat?.title || ''))
      };
    });

    // Dynamic canonical placeholders from dbAdapter (or seedData fallback)
    const rawPlaceholders =
      dbPlaceholders.length > 0
        ? dbPlaceholders
        : dbAdapter.getPlaceholdersSync();

    const placeholderList = rawPlaceholders
      .filter(
        (p) =>
          p.placeholder_category === 'ge_bucket' ||
          p.placeholder_category === 'free_elective' ||
          p.placeholder_category === 'elective_gap'
      )
      .map((p) => {
        const compact = p.code.replace(/\s+/g, '').toUpperCase();
        return {
          code: p.code,
          compactCode: compact,
          title: p.title,
          credits: Number(p.credits) || 3.0,
          department: p.department || (p.code.startsWith('REQ_GE') ? 'GE' : 'ELEC'),
          number: p.number || (p.code.includes('UPPER') ? 30000 : 10000),
          category:
            p.placeholder_category === 'ge_bucket'
              ? 'General Education'
              : 'General Elective',
          type: 'placeholder',
          isPlaceholder: true,
          ge_bucket_id: p.ge_bucket_id || null,
          hasHDAttribute: Boolean(p.hasHDAttribute || /\/HD\b/i.test(p.title || ''))
        };
      });

    const geList = [...concreteGeList, ...placeholderList];

    const majorKeys = new Set(dedupedMajor.map((c) => c.compactCode));
    const filteredGe = geList.filter((c) => !majorKeys.has(c.compactCode));

    let combined = [];
    if (trayTab === 'major') combined = dedupedMajor;
    else if (trayTab === 'ge') combined = geList;
    else combined = [...dedupedMajor, ...filteredGe];

    if (!traySearch.trim()) return combined;

    const q = traySearch.trim().toLowerCase();
    const matched = combined.filter(
      (c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
    );

    if (q.length >= 3) {
      const extra = [];
      const existingKeys = new Set(matched.map((c) => c.compactCode));
      for (const catCourse of masterDb?.courses || []) {
        const compact = catCourse.code.toUpperCase().replace(/\s+/g, '');
        if (
          !existingKeys.has(compact) &&
          (catCourse.code.toLowerCase().includes(q) || catCourse.title.toLowerCase().includes(q))
        ) {
          extra.push({
            code: catCourse.code,
            compactCode: compact,
            title: catCourse.title,
            credits: Number(catCourse.credits) || 3.0,
            department: catCourse.department || catCourse.code.split(' ')[0],
            number: catCourse.number || 10000,
            category: catCourse.type === 'placeholder' ? 'Requirement Placeholder' : 'Catalog Course',
            type: catCourse.type || 'concrete',
            isPlaceholder: catCourse.type === 'placeholder',
            ge_bucket_id: catCourse.ge_bucket_id || null,
            hasHDAttribute: Boolean(
              catCourse.hasHDAttribute || /\/HD\b/i.test(catCourse.title || '')
            )
          });
          if (extra.length >= 10) break;
        }
      }
      return [...matched, ...extra];
    }

    return matched;
  }, [masterDb, selectedProgramId, trayTab, traySearch, dbPlaceholders]);

  const handleAddEnrolledCourse = (c) => {
    if (activeEnrolledCourses.some((item) => item.compactCode === c.compactCode)) return;
    const currentSem = getCurrentAcademicSemester(new Date());
    const isPh = Boolean(c.isPlaceholder || c.type === 'placeholder' || c.code?.startsWith('REQ_') || dbAdapter.isPlaceholder(c.code));
    const newCourse = {
      code: c.code,
      compactCode: c.compactCode || c.code.replace(/\s+/g, '').toUpperCase(),
      department: c.department || c.code.split(' ')[0],
      number: c.number || parseInt(c.code.replace(/\D/g, ''), 10) || 10000,
      title: c.title,
      credits: Number(c.credits) || 3.0,
      grade: 'Current',
      state: 'Current',
      term: `${currentSem.season.toUpperCase()}_${String(currentSem.year).slice(-2)}_16W`,
      termInfo: {
        season: currentSem.season,
        year: currentSem.year,
        session: '16W',
        duration: '16W',
        isTransfer: false
      },
      isManualEnrollment: true,
      type: isPh ? 'placeholder' : 'concrete',
      isPlaceholder: isPh,
      ge_bucket_id: c.ge_bucket_id || null,
      hasHDAttribute: Boolean(c.hasHDAttribute || /\/HD\b/i.test(c.title || ''))
    };
    setActiveEnrolledCourses((prev) => [...prev, newCourse]);
  };

  const handleRemoveEnrolledCourse = (compactCode) => {
    setActiveEnrolledCourses((prev) => prev.filter((c) => c.compactCode !== compactCode));
  };

  const handleDropEnrolledCourse = (e) => {
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.code) {
          handleAddEnrolledCourse(c);
        }
      }
    } catch (err) {
      console.warn('Drop error:', err);
    }
  };

  // Zero-Upload Flow: Advance directly to Degree Plan with clean degree audit
  const handleProceedZeroUpload = () => {
    setZeroUploadModalOpen(false);
    const effectiveStudentName =
      studentName.trim() || generateDefaultStudentName();
    const defaultAdvisor =
      advisorName.trim() ||
      (facultyProfile
        ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim()
        : 'Matthias Wood');

    const totalEnrolledCredits = activeEnrolledCourses.reduce((s, c) => s + (c.credits || 0), 0);
    const cleanParsed = {
      studentMetadata: {
        name: effectiveStudentName,
        student_name: effectiveStudentName,
        studentId: studentId.trim(),
        student_id: studentId.trim(),
        advisor: defaultAdvisor,
        email: studentEmail.trim() || facultyProfile?.email || '',
        phone: studentPhone.trim(),
        gpa: '',
        catalogYear,
        pacingMode,
        major: (masterDb?.programs || []).find((p) => p.id === selectedProgramId)?.name || ''
      },
      validCourses: [...activeEnrolledCourses],
      completedCourses: [],
      currentCourses: [...activeEnrolledCourses],
      excludedCourses: [],
      summary: {
        totalCredits: totalEnrolledCredits,
        completedCredits: 0,
        currentCredits: totalEnrolledCredits,
        transferCredits: 0,
        residentCredits: totalEnrolledCredits,
        upperLevelCredits: activeEnrolledCourses
          .filter((c) => (c.number || 0) >= 30000)
          .reduce((s, c) => s + (c.credits || 0), 0),
        humanDiversityCourses: activeEnrolledCourses.filter((c) => c.hasHDAttribute).length
      }
    };

    onIntakeComplete({
      parsedTranscript: cleanParsed,
      selectedProgramId,
      additionalPrograms,
      constraints: {
        startSemester: calculatedStartSemester || 'Spring 2027',
        modalityPreference,
        summerAvailability,
        maxSummerCredits: summerAvailability === 'No Summer' ? 0 : Number(maxSummerCredits) || 6,
        pacingMode,
        max8wkCredits,
        max16wkCredits
      },
      directToSchedule: true
    });
  };

  // Handle Option B Submission (New Student Audit)
  const handleAuditOptionB = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!anthologyFile && !transcriptFile && !cachedParsedTranscript && !parsedTranscript) {
      setZeroUploadModalOpen(true);
      return;
    }

    setIsProcessing(true);
    setParsingError('');

    try {
      let parsed = cachedParsedTranscript || parsedTranscript;
      if (!parsed && (anthologyFile || transcriptFile)) {
        parsed = await parseFilesAndPopulateMetadata(anthologyFile, transcriptFile);
      }
      if (!parsed) {
        setIsProcessing(false);
        return;
      }

      // Merge manually designated currently enrolled courses (Workflow B)
      if (activeEnrolledCourses.length > 0) {
        const existingCompact = new Set(
          (parsed.validCourses || []).map((c) => c.compactCode)
        );
        const toAdd = activeEnrolledCourses.filter((c) => !existingCompact.has(c.compactCode));
        if (toAdd.length > 0) {
          parsed.validCourses = [...(parsed.validCourses || []), ...toAdd];
          parsed.currentCourses = [...(parsed.currentCourses || []), ...toAdd];
          const addedCr = toAdd.reduce((s, c) => s + (c.credits || 0), 0);
          if (parsed.summary) {
            parsed.summary.currentCredits = (parsed.summary.currentCredits || 0) + addedCr;
            parsed.summary.totalCredits = (parsed.summary.totalCredits || 0) + addedCr;
            parsed.summary.residentCredits = (parsed.summary.residentCredits || 0) + addedCr;
            parsed.summary.upperLevelCredits = (parsed.summary.upperLevelCredits || 0) +
              toAdd.filter((c) => (c.number || 0) >= 30000).reduce((s, c) => s + (c.credits || 0), 0);
          }
        }
      }

      const effectiveStudentName =
        studentName.trim() ||
        parsed.studentMetadata?.student_name ||
        parsed.studentMetadata?.name ||
        generateDefaultStudentName();
      const effectiveStudentId =
        studentId.trim() ||
        parsed.studentMetadata?.student_id ||
        parsed.studentMetadata?.studentId ||
        '';
      const effectiveAdvisor =
        advisorName.trim() ||
        (facultyProfile
          ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim()
          : 'Matthias Wood');

      parsed.studentMetadata = {
        ...(parsed.studentMetadata || {}),
        name: effectiveStudentName,
        student_name: effectiveStudentName,
        studentId: effectiveStudentId,
        student_id: effectiveStudentId,
        advisor: effectiveAdvisor,
        email: studentEmail.trim() || facultyProfile?.email || '',
        phone: studentPhone.trim(),
        gpa:
          detectedGpa ||
          (parsed.studentMetadata?.student_gpa !== null &&
          parsed.studentMetadata?.student_gpa !== undefined
            ? String(parsed.studentMetadata.student_gpa)
            : parsed.studentMetadata?.gpa || ''),
        catalogYear:
          parsed.studentMetadata?.catalog_year ||
          parsed.studentMetadata?.catalogYear ||
          catalogYear,
        pacingMode,
        major: masterDb.programs.find((p) => p.id === selectedProgramId)?.name || ''
      };

      const deterministicStart = calculatedStartSemester || calculateStartingSemester(parsed);

      onIntakeComplete({
        parsedTranscript: parsed,
        selectedProgramId,
        additionalPrograms,
        constraints: {
          startSemester: deterministicStart,
          modalityPreference,
          summerAvailability,
          maxSummerCredits: summerAvailability === 'No Summer' ? 0 : Number(maxSummerCredits) || 6,
          pacingMode,
          max8wkCredits,
          max16wkCredits
        }
      });
    } catch (err) {
      setParsingError(`Error parsing student records: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-[#857542] uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Step 1: Student Intake & Academic Constraints</span>
          </div>
          <h1 className="text-3xl font-display font-extrabold text-neutral-900 tracking-tight">
            Advising Workspace Intake
          </h1>
          <p className="text-xs text-neutral-600 mt-0.5">
            Upload student transcript records or reload a previously exported degree plan to run the
            deterministic audit.
          </p>
        </div>

        {Boolean(auditResult) && (
          <div id="screen1-active-record-toolbar" className="flex items-center space-x-3 flex-shrink-0">
            <button
              type="button"
              id="screen1-clear-active-btn"
              onClick={() => setClearModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 hover:text-red-700 hover:border-red-200 transition flex items-center space-x-1.5 cursor-pointer"
              title="Clear Active Student Record"
            >
              <X className="w-3.5 h-3.5 text-neutral-500 hover:text-red-600 flex-shrink-0" />
              <span>Clear Active Student</span>
            </button>

            <button
              type="button"
              id="screen1-top-proceed-btn"
              onClick={handleAuditOptionB}
              disabled={isProcessing}
              className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center space-x-2 cursor-pointer disabled:bg-neutral-300"
            >
              <span>
                {hasFiles || cachedParsedTranscript || parsedTranscript
                  ? 'Proceed to Degree Audit'
                  : 'Proceed to Optimal Degree Plan'}
              </span>
              <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </button>
          </div>
        )}
      </div>

      {parsingError && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start space-x-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Record Intake Error</p>
            <p className="text-xs mt-0.5">{parsingError}</p>
          </div>
        </div>
      )}

      {/* Two-Column Card Layout: Option A vs Option B (Equal Width 1/2 Columns on Large Screens) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* OPTION A: Returning Student Reload */}
        <div
          className={`bg-white rounded-xl border p-6 shadow-sm transition ${
            activeOption === 'A'
              ? 'border-2 border-[#857542] ring-2 ring-[#857542]/20'
              : 'border-neutral-200 opacity-90'
          }`}
          onClick={() => setActiveOption('A')}
        >
          <div className="mb-4 pb-3 border-b border-neutral-100">
            <span className="text-xs font-bold uppercase tracking-wider text-[#857542]">
              Option A
            </span>
            <h2 className="text-lg font-bold text-neutral-900">Returning Student Plan</h2>
          </div>

          <p className="text-xs text-neutral-600 mb-4 leading-relaxed">
            Drag in a previously generated Degree Plan PDF. The complete advisor state
            and course locks will be restored automatically.
          </p>

          <form onSubmit={handleReloadOptionA} className="space-y-4">
            {/* Box A1: Mandatory Degree Plan PDF Dropzone with text style matching Option B */}
            <div>
              <label className="text-xs font-bold text-neutral-900 uppercase tracking-wide flex items-center justify-between mb-1.5">
                <span>1. PREVIOUSLY EXPORTED PLAN (.PDF ONLY)</span>
                <span className="text-[10px] bg-neutral-100 text-neutral-700 font-mono px-1.5 py-0.5 rounded font-bold">
                  REQUIRED
                </span>
              </label>

              <StudentRecordDropzone
                id="optionA-degreePlan"
                title="Previously Exported Degree Plan"
                subtitle=".pdf only (max 1 file)"
                acceptedExtensions={['.pdf']}
                file={degreePlanFile}
                onFileChange={setDegreePlanFile}
                onError={setParsingError}
                icon={FileText}
              />
            </div>

            {/* Section A2: Optional Newer Student Records with exact Option B style & optional language */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  2. OPTIONAL: NEWER STUDENT RECORDS (UPLOAD IF AVAILABLE)
                </label>
                <button
                  type="button"
                  id="optionA-sop-btn"
                  onClick={() => openSopGuideModal('Anthology', 'Option A (Returning Student Plan)')}
                  className="text-[11px] text-[#857542] hover:underline flex items-center space-x-1"
                >
                  <span>🎬 Scribe SOP</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Box A2-1: Anthology .csv / .xlsx */}
                <StudentRecordDropzone
                  id="optionA-anthology"
                  title="Anthology Course Schedule"
                  subtitle=".csv or .xlsx only (max 1)"
                  acceptedExtensions={['.xlsx', '.csv']}
                  file={optionAAnthologyFile}
                  onFileChange={handleOptionAAnthologyFileChange}
                  onError={(msg) => handleAnthologyDropzoneError(msg, 'A')}
                  icon={FileSpreadsheet}
                />

                {/* Box A2-2: Unofficial Transcript .pdf */}
                <StudentRecordDropzone
                  id="optionA-transcript"
                  title="Unofficial Transcript"
                  subtitle=".pdf only (max 1)"
                  acceptedExtensions={['.pdf']}
                  file={optionATranscriptFile}
                  onFileChange={handleOptionATranscriptFileChange}
                  onError={(msg) => handleTranscriptDropzoneError(msg, 'A')}
                  icon={FileText}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing || !degreePlanFile}
              className="w-full py-2.5 px-4 bg-[#857542] hover:bg-[#6E6035] disabled:bg-neutral-300 text-white text-xs font-bold rounded-md shadow transition flex items-center justify-center space-x-2"
            >
              <span>Reload Degree Plan Session</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* OPTION B: New Student Audit */}
        <div
          className={`bg-white rounded-xl border p-6 shadow-sm transition ${
            activeOption === 'B'
              ? 'border-2 border-[#857542] ring-2 ring-[#857542]/20'
              : 'border-neutral-200 opacity-90'
          }`}
          onClick={() => setActiveOption('B')}
        >
          <div className="mb-4 pb-3 border-b border-neutral-100">
            <span className="text-xs font-bold uppercase tracking-wider text-[#857542]">
              Option B
            </span>
            <h2 className="text-lg font-bold text-neutral-900">New Student Audit</h2>
          </div>

          <form onSubmit={handleAuditOptionB} className="space-y-4">
            {/* Stage 1: Student Record Upload */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  1. Student Record Upload (Upload at least 1)
                </label>
                <button
                  type="button"
                  id="optionB-sop-btn"
                  onClick={() => openSopGuideModal('Anthology', 'Option B (New Student Audit)')}
                  className="text-[11px] text-[#857542] hover:underline flex items-center space-x-1"
                >
                  <span>🎬 Scribe SOP</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StudentRecordDropzone
                    id="optionB-anthology"
                    title="Anthology Course Schedule"
                    subtitle=".csv or .xlsx only (max 1)"
                    acceptedExtensions={['.xlsx', '.csv']}
                    file={anthologyFile}
                    onFileChange={handleAnthologyFileChange}
                    onError={(msg) => handleAnthologyDropzoneError(msg, 'B')}
                    icon={FileSpreadsheet}
                  />

                  <StudentRecordDropzone
                    id="optionB-transcript"
                    title="Unofficial Transcript"
                    subtitle=".pdf only (max 1)"
                    acceptedExtensions={['.pdf']}
                    file={transcriptFile}
                    onFileChange={handleTranscriptFileChange}
                    onError={(msg) => handleTranscriptDropzoneError(msg, 'B')}
                    icon={FileText}
                  />
                </div>

                {extractedSummary && (
                  <div className="p-2.5 bg-[#F7F5EE] rounded-lg border border-[#B5A36A]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center space-x-1.5 font-bold text-[#857542]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        Parsed {extractedSummary.totalCourses} Active Courses ({extractedSummary.completedCredits.toFixed(1)} Completed + {extractedSummary.currentCredits.toFixed(1)} Current = {extractedSummary.totalCredits.toFixed(1)} Total cr)
                      </span>
                    </span>
                    <button
                      type="button"
                      id="optionB-extract-btn"
                      onClick={handleExtractRecords}
                      className="text-[11px] font-bold text-[#857542] hover:underline flex items-center space-x-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Re-Extract</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Stage 2: Program Selectors, Optional Bingo Sheet, Constraints, and Student Metadata */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-5">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                    2. Program Selection &amp; Scheduling Preferences
                  </span>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>FERPA Local Memory Active</span>
                </span>
              </div>

              {/* Section A: Catalog Year -> Degree/Emphasis -> [+ Add Major / Minor / Certificate] ABOVE Optional Bingo Sheet Dropzone */}
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100 gap-2">
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide flex items-center space-x-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#857542] flex-shrink-0" />
                    <span>Degree Curriculum &amp; Catalog</span>
                  </h3>
                  <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                    Verified Degree Programs
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Dropdown 1: Catalog Year (Forward-only selection) */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      <span>Catalog Year (Forward-Only)</span>
                      <span className="text-red-600 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <select
                        id="optionB-catalog-year"
                        value={catalogYear}
                        onChange={(e) => {
                          const newYear = e.target.value;
                          setCatalogYear(newYear);
                          const currentProg = (masterDb.programs || []).find(
                            (p) => p.id === selectedProgramId
                          );
                          const matching = (masterDb.programs || []).filter(
                            (p) => p.catalog_year_id === newYear
                          );
                          if (matching.length > 0) {
                            const sameName = currentProg
                              ? matching.find((p) => p.name === currentProg.name)
                              : null;
                            setSelectedProgramId(sameName ? sameName.id : matching[0].id);
                          }
                        }}
                        className="w-full appearance-none pl-3.5 pr-9 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                      >
                        <option value="2026-2027">2026–2027 (Active Catalog)</option>
                        <option value="2025-2026" disabled={minCatalogYearStart > 2025}>
                          2025–2026
                        </option>
                        <option value="2024-2025" disabled={minCatalogYearStart > 2024}>
                          2024–2025
                        </option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-1">
                      Forward-only catalog switching from matriculation year
                    </p>
                  </div>

                  {/* Dropdown 2: Primary Degree / Emphasis Seeking */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                      <span>Primary Degree / Emphasis</span>
                      <span className="text-red-600 ml-0.5">*</span>
                    </label>

                    <div className="relative">
                      <select
                        id="optionB-program-select"
                        value={selectedProgramId}
                        onChange={(e) => setSelectedProgramId(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-9 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs truncate cursor-pointer"
                      >
                        <optgroup label="Official Undergraduate Degree Programs">
                          {(masterDb.programs || [])
                            .filter((p) => p.catalog_year_id === catalogYear)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-1">
                      Auto-selected from parsed student record
                    </p>
                  </div>
                </div>

                {/* Declared Minors / Secondary Credentials */}
                {additionalPrograms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold text-neutral-600 uppercase">
                      Detected Secondary / Minors:
                    </span>
                    {additionalPrograms.map((prog, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center space-x-1 bg-[#F7F5EE] text-[#857542] border border-[#B5A36A] text-[10px] font-bold px-2 py-0.5 rounded-full"
                      >
                        <span>{prog}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAdditionalPrograms((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="hover:text-red-600 ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Section B: Important Scheduling Building Constraints */}
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#857542] flex-shrink-0" />
                    <span>Scheduling Constraints &amp; Pacing</span>
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">Critical-Path Pacing Rules</span>
                </div>

                {/* Row 1: Schedule Start Semester & Modality Preference */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      <span>Schedule Start Semester</span>
                    </label>
                    <div className="relative">
                      <select
                        id="optionB-start-semester"
                        value={calculatedStartSemester}
                        onChange={(e) => setCalculatedStartSemester(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                      >
                        <option value="Fall 2026">Fall 2026</option>
                        <option value="Spring 2027">Spring 2027</option>
                        <option value="Summer 2027">Summer 2027</option>
                        <option value="Fall 2027">Fall 2027</option>
                        <option value="Spring 2028">Spring 2028</option>
                        <option value="Summer 2028">Summer 2028</option>
                        <option value="Fall 2028">Fall 2028</option>
                        <option value="Spring 2029">Spring 2029</option>
                        <option value="Summer 2029">Summer 2029</option>
                        <option value="Fall 2029">Fall 2029</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-1">
                      First term the planner will schedule new courses into. Auto-defaults based on uploaded records, or select manually.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                      <span>Course Modality Preference</span>
                    </label>
                    <div className="relative">
                      <select
                        id="optionB-modality-select"
                        value={modalityPreference}
                        onChange={(e) => setModalityPreference(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer truncate"
                      >
                        <option value="No Preference">No Preference</option>
                        <option value="Online-Only">Online-Only</option>
                        <option value="Prefer OnGround">Prefer OnGround</option>
                        <option value="Prefer Online">Prefer Online</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Expandable Currently Enrolled Courses Quick-Add Tray (Workflow B) */}
                <div className="pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    id="optionB-toggle-enrolled-tray-btn"
                    onClick={() => setIsEnrolledTrayOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-bold transition bg-[#F7F5EE] border-[#B5A36A]/50 text-[#857542] hover:bg-[#EFEBD9] cursor-pointer"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Sparkles className="w-4 h-4 text-[#857542] flex-shrink-0" />
                      <span className="truncate">
                        {activeEnrolledCourses.length > 0
                          ? `Currently Enrolled Courses • ${activeEnrolledCourses.length} Courses Active (${activeEnrolledCourses.reduce((s, c) => s + (c.credits || 0), 0).toFixed(1)} cr)`
                          : '+ Add Currently Enrolled Courses (Optional)'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-neutral-600 flex-shrink-0">
                      <span>{isEnrolledTrayOpen ? 'Collapse' : 'Expand'}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isEnrolledTrayOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {isEnrolledTrayOpen && (
                    <div className="mt-2.5 p-3.5 bg-neutral-50/90 rounded-xl border border-neutral-200 space-y-3">
                      <p className="text-[11px] text-neutral-600 leading-relaxed">
                        Designate courses the student is actively taking this semester (e.g. if an uploaded Student-Based transcript lacks in-progress courses, or for incoming students). Click or drag courses into the active enrollment bucket.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Left Pane: Available Major & GE Requirements */}
                        <div className="bg-white p-3 rounded-lg border border-neutral-200 flex flex-col h-72">
                          <div className="mb-2 space-y-1.5 flex-shrink-0">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wide">
                                Available Requirements
                              </span>
                              <span className="text-[10px] text-neutral-500 font-mono">
                                {availableTrayCourses.length} courses
                              </span>
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                              <input
                                id="tray-course-search"
                                type="text"
                                placeholder="Search course code or title..."
                                value={traySearch}
                                onChange={(e) => setTraySearch(e.target.value)}
                                className="w-full pl-7 pr-3 py-1 text-xs bg-neutral-50 border border-neutral-200 rounded focus:outline-none focus:border-[#857542] text-neutral-800"
                              />
                              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>

                            {/* Filter Tabs */}
                            <div className="flex border-b border-neutral-100 gap-1 pt-1 text-[10px] font-bold">
                              <button
                                type="button"
                                onClick={() => setTrayTab('all')}
                                className={`px-2 py-0.5 rounded-t transition ${
                                  trayTab === 'all'
                                    ? 'bg-[#F7F5EE] text-[#857542] border-b-2 border-[#857542]'
                                    : 'text-neutral-500 hover:text-neutral-800'
                                }`}
                              >
                                All
                              </button>
                              <button
                                type="button"
                                onClick={() => setTrayTab('major')}
                                className={`px-2 py-0.5 rounded-t transition ${
                                  trayTab === 'major'
                                    ? 'bg-[#F7F5EE] text-[#857542] border-b-2 border-[#857542]'
                                    : 'text-neutral-500 hover:text-neutral-800'
                                }`}
                              >
                                Major Requirements
                              </button>
                              <button
                                type="button"
                                onClick={() => setTrayTab('ge')}
                                className={`px-2 py-0.5 rounded-t transition ${
                                  trayTab === 'ge'
                                    ? 'bg-[#F7F5EE] text-[#857542] border-b-2 border-[#857542]'
                                    : 'text-neutral-500 hover:text-neutral-800'
                                }`}
                              >
                                General Education
                              </button>
                            </div>
                          </div>

                          {/* Scrollable Course List */}
                          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                            {availableTrayCourses.length === 0 ? (
                              <p className="text-[11px] text-neutral-400 text-center py-6">
                                No courses matching &ldquo;{traySearch}&rdquo;
                              </p>
                            ) : (
                              availableTrayCourses.map((c) => {
                                const isAdded = activeEnrolledCourses.some(
                                  (item) => item.compactCode === c.compactCode
                                );
                                return (
                                  <div
                                    key={`${c.category}-${c.compactCode}`}
                                    draggable={!isAdded}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('application/json', JSON.stringify(c));
                                    }}
                                    onClick={() => {
                                      if (!isAdded) handleAddEnrolledCourse(c);
                                    }}
                                    className={`p-2 rounded border text-left transition flex items-center justify-between ${
                                      isAdded
                                        ? 'bg-neutral-50 border-neutral-200 opacity-60 cursor-default'
                                        : 'bg-white hover:bg-[#F7F5EE] border-neutral-200 hover:border-[#B5A36A] cursor-pointer shadow-2xs'
                                    }`}
                                  >
                                    <div className="truncate mr-2">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="font-bold text-xs text-neutral-900 font-mono">
                                          {c.code}
                                        </span>
                                        <span className="text-[9px] font-mono text-neutral-500 bg-neutral-100 px-1 py-0.2 rounded">
                                          {c.credits.toFixed(1)} cr
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-neutral-600 truncate mt-0.5">
                                        {c.title}
                                      </p>
                                    </div>
                                    {isAdded ? (
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center space-x-1 flex-shrink-0">
                                        <Check className="w-2.5 h-2.5" />
                                        <span>Added</span>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        data-tray-add-code={c.compactCode}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleAddEnrolledCourse(c);
                                        }}
                                        className="text-[10px] font-bold text-[#857542] hover:text-[#6E6035] bg-[#F7F5EE] hover:bg-[#EFEBD9] px-2 py-0.5 rounded border border-[#B5A36A]/40 flex-shrink-0 cursor-pointer"
                                      >
                                        + Add
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Right Pane: Active Enrollments for [Active Term] */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragOverTray(true);
                          }}
                          onDragLeave={() => setIsDragOverTray(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragOverTray(false);
                            handleDropEnrolledCourse(e);
                          }}
                          className={`bg-white p-3 rounded-lg border flex flex-col h-72 transition ${
                            isDragOverTray
                              ? 'border-2 border-[#857542] bg-[#F7F5EE]/40'
                              : 'border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-neutral-100 mb-2 flex-shrink-0">
                            <div>
                              <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wide block">
                                Active Enrollments ({getCurrentAcademicSemester(new Date())?.termName || 'Fall 2026'})
                              </span>
                              <span className="text-[10px] font-mono text-[#857542] font-semibold">
                                {activeEnrolledCourses.length} Courses • {activeEnrolledCourses.reduce((s, c) => s + (c.credits || 0), 0).toFixed(1)} cr
                              </span>
                            </div>
                            {activeEnrolledCourses.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setActiveEnrolledCourses([])}
                                className="text-[10px] text-red-600 hover:underline font-semibold flex items-center space-x-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Clear</span>
                              </button>
                            )}
                          </div>

                          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {activeEnrolledCourses.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-lg p-4 text-center">
                                <Sparkles className="w-6 h-6 text-neutral-300 mb-1" />
                                <p className="text-xs font-semibold text-neutral-600">
                                  No Active Courses Designated
                                </p>
                                <p className="text-[10px] text-neutral-400 mt-1 max-w-[200px]">
                                  Click courses from the left or drag them here to designate them as currently in-progress.
                                </p>
                              </div>
                            ) : (
                              activeEnrolledCourses.map((c) => (
                                <div
                                  key={c.compactCode}
                                  className="p-2 rounded bg-[#FFFBEB] border-l-4 border-l-[#D97706] border border-amber-200/80 text-left flex items-center justify-between shadow-2xs"
                                >
                                  <div className="truncate mr-2">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-bold text-xs text-neutral-900 font-mono">
                                        {c.code}
                                      </span>
                                      <span className="text-[9px] font-mono text-amber-900 bg-amber-100/90 px-1 py-0.2 rounded font-semibold">
                                        {c.credits.toFixed(1)} cr
                                      </span>
                                      <span className="text-[8px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-1 py-0.2 rounded">
                                        Current
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-neutral-600 truncate mt-0.5">
                                      {c.title}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEnrolledCourse(c.compactCode)}
                                    title="Remove from active enrollments"
                                    className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-amber-100 transition flex-shrink-0"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 2: Summer Availability & Conditional Max Summer Credits */}
                <div className="pt-2 border-t border-neutral-100 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                        <span>Summer Availability</span>
                      </label>
                      <div className="relative">
                        <select
                          id="optionB-summer-select"
                          value={summerAvailability}
                          onChange={(e) => handleSummerChange(e.target.value)}
                          className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer truncate"
                        >
                          <option value="No Summer">No Summer (Default)</option>
                          <option value="Yes Summer">Yes Summer</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {summerAvailability === 'Yes Summer' && (
                      <div>
                        <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                          <span>Max Summer Credits Cap</span>
                        </label>
                        <div className="relative">
                          <select
                            id="optionB-summer-cap"
                            value={maxSummerCredits}
                            onChange={(e) => setMaxSummerCredits(Number(e.target.value))}
                            className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-white border border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                          >
                            <option value={3}>3 Credits</option>
                            <option value={6}>6 Credits (Standard)</option>
                            <option value={9}>9 Credits</option>
                            <option value={12}>12 (Not Recommended)</option>
                          </select>
                          <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </div>

                  {summerAvailability === 'Yes Summer' && (
                    <div className="p-2.5 rounded-lg bg-[#F7F5EE] border border-[#B5A36A] text-[11px] text-neutral-800 leading-relaxed">
                      <strong>Summer Tuition Notice:</strong> Summer courses are billed per credit hour separately from standard fall/spring flat-rate tuition and may incur additional charges.
                    </div>
                  )}
                </div>

                {/* Row 3: 3 Linked Pacing Mode Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-100">
                  {/* Dropdown 1: Academic Pacing Mode */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                      <span>Pacing Mode</span>
                      <span className="text-red-600 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <select
                        id="optionB-pacing-mode"
                        value={pacingMode}
                        onChange={(e) => handlePacingModeChange(e.target.value)}
                        className="w-full appearance-none pl-2.5 pr-6 py-2 text-[11px] bg-white border border-[#857542] ring-1 ring-[#857542]/30 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                      >
                        <option value="Full-Time">Full-Time</option>
                        <option value="Part-Time">Part-Time</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Dropdown 2: Max 8-Week Session Cap */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                      <span>8-Week Session Cap</span>
                    </label>
                    <div className="relative">
                      <select
                        id="optionB-max-8wk"
                        value={max8wkCredits}
                        onChange={(e) => setMax8wkCredits(Number(e.target.value))}
                        className="w-full appearance-none pl-2.5 pr-6 py-2 text-[11px] bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                      >
                        {(pacingMode === 'Full-Time' ? [3, 6, 9, 12] : [3, 6]).map((cr) => (
                          <option key={cr} value={cr}>
                            {cr}cr / 8wk{ (pacingMode === 'Full-Time' && cr === 9) || (pacingMode === 'Part-Time' && cr === 6) ? ' (Default)' : '' }
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Dropdown 3: Max 16-Week Semester Cap */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5 whitespace-nowrap">
                      <span>16-Week Semester Cap</span>
                    </label>
                    <div className="relative">
                      <select
                        id="optionB-max-16wk"
                        value={max16wkCredits}
                        onChange={(e) => setMax16wkCredits(Number(e.target.value))}
                        className="w-full appearance-none pl-2.5 pr-6 py-2 text-[11px] bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                      >
                        {(pacingMode === 'Full-Time'
                          ? [12, 15, 17, 18, 21, 24]
                          : [1, 3, 6, 9, 11, 12]
                        ).map((cr) => (
                          <option key={cr} value={cr}>
                            {cr}cr / 16wk{ (pacingMode === 'Full-Time' && cr === 18) || (pacingMode === 'Part-Time' && cr === 11) ? ' (Default)' : '' }
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section C: Student & Advisor Profile */}
              <div className="pt-3 border-t border-neutral-200 space-y-3">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  Student &amp; Advisor Profile (Editable Header Metadata)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                      Student Full Name
                    </label>
                    <input
                      id="optionB-student-name"
                      type="text"
                      placeholder="Auto-filled from transcript or blank"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded font-semibold focus:outline-none focus:border-[#857542]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                      Student ID / Enrollment #
                    </label>
                    <input
                      id="optionB-student-id"
                      type="text"
                      placeholder="Optional ID"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded font-mono font-semibold focus:outline-none focus:border-[#857542]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                      Academic Advisor Name
                    </label>
                    <input
                      id="optionB-advisor-name"
                      type="text"
                      placeholder="Advisor Name"
                      value={advisorName}
                      onChange={(e) => setAdvisorName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded font-semibold focus:outline-none focus:border-[#857542]"
                    />
                  </div>
                </div>
              </div>

              {/* Primary Submit Button */}
              <button
                id="optionB-submit-btn"
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-[#857542] hover:bg-[#6E6035] disabled:bg-neutral-300 text-white text-sm font-bold rounded-lg shadow-md transition flex items-center justify-center space-x-2 mt-4 cursor-pointer"
              >
                <span>
                  {hasFiles || cachedParsedTranscript || parsedTranscript
                    ? 'Proceed to Degree Audit'
                    : 'Proceed to Optimal Degree Plan'}
                </span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Zero-Upload Confirmation Modal (New Student / Clean Degree Plan Setup) */}
      <dialog
        ref={zeroUploadDialogRef}
        id="zero-upload-modal"
        aria-labelledby={zeroUploadDialogTitleId}
        className="w-full max-w-lg rounded-xl shadow-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-xs border-2 border-[#B5A36A] text-left bg-white open:animate-in open:fade-in-0 open:zoom-in-95 m-auto"
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-neutral-200">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-full bg-[#F7F5EE] text-[#857542] border border-[#B5A36A]/50">
                <Sparkles className="w-6 h-6 text-[#857542]" />
              </div>
              <div>
                <h2
                  id={zeroUploadDialogTitleId}
                  className="text-base font-extrabold text-neutral-900 leading-snug"
                >
                  New Student / Clean Degree Plan Setup
                </h2>
                <p className="text-xs font-semibold text-[#857542]">
                  Fresh Graduation Plan Initiation
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setZeroUploadModalOpen(false)}
              aria-label="Close modal"
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Message */}
          <div className="p-4 rounded-lg bg-[#F7F5EE] border border-[#B5A36A]/40 text-xs text-neutral-800 space-y-2">
            <p className="leading-relaxed">
              No prior transcript or Anthology course history was uploaded. The Degree Audit stage
              will be skipped, and you will proceed directly to the Degree Plan to construct a clean,
              multi-year graduation plan from scratch for{' '}
              <strong className="text-neutral-900 font-bold">
                {(masterDb?.programs || []).find((p) => p.id === selectedProgramId)?.name || 'Selected Degree'}
              </strong>{' '}
              ({catalogYear}).
            </p>
            {activeEnrolledCourses.length > 0 && (
              <p className="text-[11px] font-semibold text-[#857542] pt-1 border-t border-[#B5A36A]/30">
                ✓ Including {activeEnrolledCourses.length} currently enrolled course(s) ({activeEnrolledCourses.reduce((s, c) => s + (c.credits || 0), 0).toFixed(1)} cr) as active in-progress credits.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              id="zero-upload-cancel-btn"
              onClick={() => setZeroUploadModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition cursor-pointer"
            >
              Cancel / Upload File
            </button>
            <button
              type="button"
              id="zero-upload-proceed-btn"
              onClick={handleProceedZeroUpload}
              className="px-4 py-2 text-xs font-bold text-white bg-[#857542] hover:bg-[#6b5e35] rounded-lg shadow-sm transition flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Proceed to Optimal Degree Plan</span>
              <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
            </button>
          </div>
        </div>
      </dialog>


      {/* Student Record Wrong Document Notification & SOP Export Instructions Popup Modal */}
      <dialog
        ref={sopDialogRef}
        id="anthology-verification-modal"
        {...{ closedby: 'any' }}
        aria-labelledby={sopDialogTitleId}
        className="w-full max-w-lg rounded-xl border-2 border-[#B5A36A] bg-white p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs"
      >
        <div className="p-6 space-y-4 text-left">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3">
            <div className="flex items-start space-x-3">
              {documentModalState.isError ? (
                <div className="p-2 rounded-lg bg-red-100 text-red-700 flex-shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              ) : documentModalState.docType === 'Transcript' ? (
                <div className="p-2 rounded-lg bg-[#F7F5EE] text-[#857542] border border-[#B5A36A]/40 flex-shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-[#F7F5EE] text-[#857542] border border-[#B5A36A]/40 flex-shrink-0">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
              )}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#857542]">
                  {documentModalState.optionLabel ||
                    (documentModalState.docType === 'Transcript'
                      ? 'Unofficial Transcript Verification'
                      : 'Anthology File Verification')}
                </span>
                <h2
                  id={sopDialogTitleId}
                  className="text-base font-extrabold text-neutral-900 leading-snug"
                >
                  {documentModalState.isError
                    ? documentModalState.docType === 'Transcript'
                      ? 'Wrong Document Uploaded — Transcript Verification Failed'
                      : 'Wrong Document Uploaded — Anthology Verification Failed'
                    : documentModalState.docType === 'Transcript'
                    ? 'SOP Guide: How to Export Unofficial Transcripts from Anthology'
                    : 'SOP Guide: How to Export Student Course Schedules from Anthology'}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDocumentModalState((prev) => ({ ...prev, isOpen: false }))}
              aria-label="Close modal"
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Details Box (Shown when wrong document is uploaded) */}
          {documentModalState.isError && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1.5">
              <p className="font-bold flex items-center space-x-1.5">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>
                  Rejected File: <code className="font-mono font-extrabold">{documentModalState.fileName}</code>
                </span>
              </p>
              <p className="leading-relaxed">{documentModalState.errorMessage}</p>
              {documentModalState.missingColumns?.length > 0 && (
                <p className="text-[11px] font-mono text-red-700 bg-white/80 p-2 rounded border border-red-200">
                  Missing Anthology Columns: {documentModalState.missingColumns.slice(0, 6).join(', ')}
                  {documentModalState.missingColumns.length > 6
                    ? ` (+${documentModalState.missingColumns.length - 6} more)`
                    : ''}
                </p>
              )}
            </div>
          )}

          {/* Guide Selector Tabs */}
          <div className="flex border-b border-neutral-200 gap-2 pt-1">
            <button
              type="button"
              id="sop-tab-anthology"
              onClick={() => setDocumentModalState((prev) => ({ ...prev, docType: 'Anthology' }))}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition ${
                documentModalState.docType === 'Anthology'
                  ? 'border-[#857542] text-[#857542]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Anthology Schedule (.xlsx / .csv)
            </button>
            <button
              type="button"
              id="sop-tab-transcript"
              onClick={() => setDocumentModalState((prev) => ({ ...prev, docType: 'Transcript' }))}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition ${
                documentModalState.docType === 'Transcript'
                  ? 'border-[#857542] text-[#857542]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Unofficial Transcript (.pdf)
            </button>
          </div>

          {/* Step-by-Step Instructions based on selected docType */}
          {documentModalState.docType === 'Anthology' ? (
            <div className="p-4 rounded-lg bg-[#F7F5EE] border border-[#B5A36A]/50 space-y-2.5">
              <h3 className="text-xs font-extrabold text-neutral-900 uppercase tracking-wide">
                How to Export Course Schedules from Anthology:
              </h3>
              <ol className="text-xs text-neutral-800 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>
                  Log into <strong>Anthology Student</strong> and open the student&apos;s record.
                </li>
                <li>
                  Navigate to <strong>Academic Records</strong> &rarr;{' '}
                  <strong>Student Course Schedules (All Results)</strong>.
                </li>
                <li>
                  Confirm the table displays all <strong>20 standard columns</strong> (starting with{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    Course Code
                  </code>
                  ,{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    Course Name
                  </code>
                  ,{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    Published Code
                  </code>
                  ,{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    Term
                  </code>
                  ,{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    Course Status
                  </code>
                  , and{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    Letter Grade
                  </code>
                  ).
                </li>
                <li>
                  Click the <strong>Export to Excel (.xlsx)</strong> or{' '}
                  <strong>Export to CSV (.csv)</strong> icon in the top-right toolbar and upload that
                  file here.
                </li>
              </ol>

              {/* Direct Scribe SOP Link */}
              <div className="pt-2 border-t border-[#B5A36A]/30 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-neutral-700">
                  Need visual step-by-step screenshots?
                </span>
                <a
                  id="anthology-sop-modal-link"
                  href={ANTHOLOGY_SOP_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-[#EFEBD9] text-[#857542] border border-[#857542] text-xs font-bold transition shadow-2xs"
                >
                  <span>🎬 Open Scribe SOP Instructions</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[#F7F5EE] border border-[#B5A36A]/50 space-y-2.5">
              <h3 className="text-xs font-extrabold text-neutral-900 uppercase tracking-wide">
                How to Export Unofficial Transcripts from Anthology:
              </h3>
              <ol className="text-xs text-neutral-800 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>
                  Log into <strong>Anthology Student</strong> and open the student&apos;s record.
                </li>
                <li>
                  Navigate to <strong>Academic Records</strong> &rarr;{' '}
                  <strong>Transcripts</strong> (or <strong>Unofficial Transcript</strong>).
                </li>
                <li>
                  Select <strong>Unofficial Transcript - Landscape</strong> or <strong>Enrollment-Based Transcript</strong>.
                </li>
                <li>
                  Click <strong>Print / Export to PDF</strong> and ensure the document contains the text layer with Course, Description, Credits, and Grades. Upload that{' '}
                  <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-neutral-200">
                    .pdf
                  </code>{' '}
                  file here.
                </li>
              </ol>

              {/* Direct Scribe SOP Link */}
              <div className="pt-2 border-t border-[#B5A36A]/30 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-neutral-700">
                  Need visual step-by-step screenshots?
                </span>
                <a
                  id="transcript-sop-modal-link"
                  href={TRANSCRIPT_SOP_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-[#EFEBD9] text-[#857542] border border-[#857542] text-xs font-bold transition shadow-2xs"
                >
                  <span>🎬 Open Scribe SOP Instructions</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Footer Action */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              id="anthology-modal-dismiss-btn"
              onClick={() => setDocumentModalState((prev) => ({ ...prev, isOpen: false }))}
              className="px-4 py-2 bg-[#857542] hover:bg-[#6E6035] text-white text-xs font-bold rounded-lg shadow transition"
            >
              {documentModalState.isError
                ? documentModalState.docType === 'Transcript'
                  ? 'Understood — Upload Correct Transcript PDF'
                  : 'Understood — Upload Correct Anthology File'
                : 'Close SOP Guide'}
            </button>
          </div>
        </div>
      </dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Skippable Currency Warning Modal (Document May Be Out of Date) */}
      {/* ------------------------------------------------------------------ */}
      <dialog
        ref={currencyDialogRef}
        id="currency-warning-dialog"
        aria-labelledby={currencyDialogTitleId}
        className="w-full max-w-xl rounded-xl shadow-2xl p-0 backdrop:bg-black/60 backdrop:backdrop-blur-xs border border-amber-300 text-left bg-white open:animate-in open:fade-in-0 open:zoom-in-95 m-auto"
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-amber-200">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h2
                  id={currencyDialogTitleId}
                  className="text-base font-extrabold text-neutral-900 leading-snug"
                >
                  Uploaded Document May Be Out of Date
                </h2>
                <p className="text-xs font-semibold text-amber-800">
                  Institutional Currency Verification Notice
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (currencyWarningModalState.onCancel) currencyWarningModalState.onCancel();
                setCurrencyWarningModalState((prev) => ({ ...prev, isOpen: false }));
              }}
              aria-label="Close modal"
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Explanation Banner */}
          <div className="p-4 rounded-lg bg-amber-50/80 border border-amber-200 space-y-2 text-xs text-amber-950">
            <p className="font-bold flex items-center space-x-1.5 text-amber-900">
              <span>
                File Flagged:{' '}
                <code className="font-mono font-extrabold text-neutral-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                  {currencyWarningModalState.fileName}
                </code>
              </span>
            </p>
            <p className="leading-relaxed text-neutral-800">
              {currencyWarningModalState.explanation}
            </p>
          </div>

          {/* Comparison Breakdown Box */}
          <div className="bg-[#F7F5EE] p-3.5 rounded-lg border border-[#B5A36A]/40 text-xs space-y-2">
            <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-[11px]">
              Active Semester vs. Document Verification:
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white p-2 rounded border border-neutral-200">
                <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                  Current Active Semester
                </span>
                <span className="font-extrabold text-emerald-800">
                  {currencyWarningModalState.currentSemester || 'Fall 2026'}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-neutral-200">
                <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                  Document Detected Status
                </span>
                <span className="font-extrabold text-amber-800">
                  {currencyWarningModalState.latestTermFound ||
                    currencyWarningModalState.printedDate ||
                    'Prior Term Snapshot'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-600 leading-normal pt-1">
              To guarantee that the student&apos;s remaining requirements and 8-week schedule are computed correctly, current in-progress courses must be reflected.
            </p>
          </div>

          {/* Scribe SOP Link Helper */}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-neutral-600 font-medium text-[11px]">
              Need help exporting the latest record?
            </span>
            <a
              id="currency-sop-modal-link"
              href={
                currencyWarningModalState.docType === 'Transcript'
                  ? TRANSCRIPT_SOP_GUIDE_URL
                  : ANTHOLOGY_SOP_GUIDE_URL
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-[#857542] hover:text-[#6b5e35] font-bold text-xs underline"
            >
              <span>Export Instructions SOP</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Action Buttons (Skippable!) */}
          <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              id="currency-modal-upload-newer-btn"
              onClick={() => {
                if (currencyWarningModalState.onCancel) currencyWarningModalState.onCancel();
                setCurrencyWarningModalState((prev) => ({ ...prev, isOpen: false }));
              }}
              className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition"
            >
              Upload Newer Document
            </button>
            <button
              type="button"
              id="currency-modal-proceed-btn"
              onClick={() => {
                if (currencyWarningModalState.onProceed) currencyWarningModalState.onProceed();
                setCurrencyWarningModalState((prev) => ({ ...prev, isOpen: false }));
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-[#857542] hover:bg-[#6b5e35] rounded-lg shadow-sm transition flex items-center space-x-1.5"
            >
              <span>Proceed Anyway / Use This Document</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </dialog>
      {/* 5-Second Countdown Active Record Clear Modal */}
      {clearModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-student-intake-title"
          onClick={() => setClearModalOpen(false)}
        >
          <div
            className="bg-neutral-900 border border-[#B5A36A]/60 rounded-xl max-w-md w-full p-6 text-white shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div className="space-y-1">
                <h3
                  id="clear-student-intake-title"
                  className="text-base font-bold text-white tracking-tight"
                >
                  Clear Active Student Record?
                </h3>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  This will clear all degree audit results, customized schedules, and uploaded files. You will be returned to the intake workspace.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-neutral-800">
              <button
                type="button"
                id="clear-student-intake-cancel-btn"
                onClick={() => setClearModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                id="clear-student-intake-confirm-btn"
                disabled={countdown > 0}
                onClick={handleConfirmClear}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition flex items-center space-x-1.5 ${
                  countdown > 0
                    ? 'bg-neutral-800 text-neutral-500 border border-neutral-700/60 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md cursor-pointer'
                }`}
              >
                <span>
                  {countdown > 0 ? `Confirm Clear (${countdown}s)` : 'Confirm Clear Record'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
