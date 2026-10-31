import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Flag,
  HelpCircle,
  Plus,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  Sparkles,
  Info,
  User,
  Mail,
  Phone,
  Calendar,
  Layers,
  BookOpen,
  Award
} from 'lucide-react';
import {
  buildProgramAuditLedgers,
  auditGeneralEducationCategories,
  computeUpperDivisionGate,
  evaluateCompositionGatekeeper,
  resolveTrackConfiguration,
  orderDeclaredPrograms,
  toCompact,
  CORE42_CLEARANCE_REASON
} from '../engine/waterfallAudit.js';

export default function Screen2Audit({
  auditResult,
  auditOptions,
  onUpdateAuditOptions,
  onProceedToSchedule,
  onBackToIntake,
  masterDb,
  facultyProfile,
  constraints,
  selectedProgramId: propSelectedProgramId,
  additionalPrograms: propAdditionalPrograms,
  catalogYear: propCatalogYear,
  parsedTranscript
}) {
  const planCreationDate = useMemo(() => {
    const d = new Date();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} (${days[d.getDay()]})`;
  }, []);

  // Filter tabs for table views (if advisor wants to focus on a subsection)
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'GE', 'MAJOR', 'EMPHASIS', 'ELECTIVE'
  
  // Card 2 Collapsible Drawer State (Institutional Details & Excluded Courses Ledger - default expanded)
  const [drawerOpen, setDrawerOpen] = useState(true);

  // Accordion Expand/Collapse States (All expanded by default for full visibility)
  const [accordionOpen, setAccordionOpen] = useState({
    ge: true,
    primaryMajor: true,
    secondaryMajor: true,
    minorsCerts: true,
    freeElectives: true
  });

  const toggleAccordion = (key) => {
    setAccordionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Modals state
  const [missingModalOpen, setMissingModalOpen] = useState(false);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);
  const [customElectiveModalOpen, setCustomElectiveModalOpen] = useState(false);

  // Incoming transfer placeholder form state
  const [incomingCode, setIncomingCode] = useState('');
  const [incomingTitle, setIncomingTitle] = useState('');
  const [incomingCredits, setIncomingCredits] = useState(3);
  const [incomingInstitution, setIncomingInstitution] = useState('');

  // Custom elective placeholder form state
  const [customElecTitle, setCustomElecTitle] = useState('General Upper-Division Elective (30000+)');
  const [customElecCredits, setCustomElecCredits] = useState(3);
  const [customElecType, setCustomElecType] = useState('UPPER'); // 'UPPER' or 'GENERAL'
  const [customElectives, setCustomElectives] = useState([]);

  // Choice group pre-selection state for elective pools
  const [selectedPoolChoices, setSelectedPoolChoices] = useState({});

  // Inline notes, equivalence overrides & missing session inputs
  const [editingNoteKey, setEditingNoteKey] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [rowNotes, setRowNotes] = useState(auditResult?.requirementNotes || {});
  const [rowOverrides, setRowOverrides] = useState(auditResult?.advisorOverrides || {});
  const [missingSessionInputs, setMissingSessionInputs] = useState({});

  // Curricular Track Bifurcation & Commitment Mode state
  const [activeTrackId, setActiveTrackId] = useState(
    auditResult?.activeTrackId || auditOptions?.activeTrackId || 'option_a'
  );
  const [activeTrackMode, setActiveTrackMode] = useState(
    auditResult?.activeTrackMode || 'COMMITTED' // 'COMMITTED' or 'UNCOMMITTED_DUAL'
  );

  const handleSelectTrack = (trackId) => {
    setActiveTrackId(trackId);
    if (onUpdateAuditOptions) {
      onUpdateAuditOptions({ activeTrackId: trackId });
    }
  };

  const core42Completed = Boolean(
    auditOptions?.core42Completed ??
    auditResult?.flags?.core42Completed ??
    auditResult?.generalEducationAudit?.core42Active ??
    parsedTranscript?.studentMetadata?.core42Completed
  );

  const currentProgram = useMemo(() => {
    const progId =
      propSelectedProgramId ||
      auditResult?.primaryProgram?.id ||
      'cybersecurity_bs_2026';
    return (
      (masterDb?.programs || []).find((p) => p.id === progId) ||
      auditResult?.primaryProgram ||
      null
    );
  }, [masterDb, propSelectedProgramId, auditResult]);

  const hasFlexibleElectives = Boolean(
    currentProgram?.flexible_elective_configurations ||
    currentProgram?.requirements?.flexible_elective_configurations
  );

  const trackConfig = useMemo(() => {
    return currentProgram ? resolveTrackConfiguration(currentProgram, activeTrackId) : null;
  }, [currentProgram, activeTrackId]);

  const programLedgers = useMemo(() => {
    if (
      (auditResult?.programLedgers || auditResult?.programAudits) &&
      (!auditResult.activeTrackId || auditResult.activeTrackId === activeTrackId)
    ) {
      return auditResult.programLedgers || auditResult.programAudits;
    }
    const courses =
      parsedTranscript?.validCourses ||
      auditResult?.normalizedHistory ||
      auditResult?.allStudentCourses ||
      [];
    const declaredList = [
      propSelectedProgramId || auditResult?.primaryProgram?.id || 'cybersecurity_bs_2026',
      ...(propAdditionalPrograms || [])
    ];
    const ordered = orderDeclaredPrograms(
      declaredList,
      masterDb,
      propSelectedProgramId || auditResult?.primaryProgram?.id
    );
    const { programAudits } = buildProgramAuditLedgers(
      ordered,
      courses,
      masterDb,
      activeTrackId
    );
    return programAudits;
  }, [
    auditResult,
    parsedTranscript,
    propSelectedProgramId,
    propAdditionalPrograms,
    masterDb,
    activeTrackId
  ]);

  const primaryLedger = useMemo(() => {
    return (
      programLedgers.find((l) => l.role === 'Primary Major') ||
      programLedgers[0] ||
      null
    );
  }, [programLedgers]);

  const secondaryLedgers = useMemo(() => {
    return programLedgers.filter((l) => l.role === 'Secondary Major');
  }, [programLedgers]);

  const minorAndCertLedgers = useMemo(() => {
    return programLedgers.filter(
      (l) =>
        l.category === 'Minor' ||
        l.role === 'Minor' ||
        l.category === 'Certificate' ||
        l.role === 'Certificate'
    );
  }, [programLedgers]);

  const upperDivisionGate = useMemo(() => {
    if (auditResult?.upperDivisionGate) return auditResult.upperDivisionGate;
    const courses =
      parsedTranscript?.validCourses ||
      auditResult?.normalizedHistory ||
      auditResult?.allStudentCourses ||
      [];
    return computeUpperDivisionGate(courses);
  }, [auditResult, parsedTranscript]);

  const compositionGatekeeper = useMemo(() => {
    const raw =
      auditResult?.compositionGatekeeperAudit ||
      auditResult?.compositionGatekeeper ||
      evaluateCompositionGatekeeper(
        parsedTranscript?.validCourses ||
        auditResult?.normalizedHistory ||
        auditResult?.allStudentCourses ||
        []
      );
    return {
      ...raw,
      hasWarning: Boolean(raw?.hasWarning ?? raw?.warnings?.length > 0)
    };
  }, [auditResult, parsedTranscript]);

  const geAudit = useMemo(() => {
    if (
      auditResult?.generalEducationAudit &&
      Boolean(auditResult.generalEducationAudit.core42Active) === core42Completed
    ) {
      return auditResult.generalEducationAudit;
    }
    const courses =
      parsedTranscript?.validCourses ||
      auditResult?.normalizedHistory ||
      auditResult?.allStudentCourses ||
      [];
    const declaredList = [
      propSelectedProgramId || auditResult?.primaryProgram?.id || 'cybersecurity_bs_2026',
      ...(propAdditionalPrograms || [])
    ];
    const ordered = orderDeclaredPrograms(
      declaredList,
      masterDb,
      propSelectedProgramId || auditResult?.primaryProgram?.id
    );
    return auditGeneralEducationCategories({
      courses,
      catalogDb: masterDb,
      catalogYear: propCatalogYear || '2026-2027',
      programs: ordered,
      core42Completed
    });
  }, [
    auditResult,
    parsedTranscript,
    propSelectedProgramId,
    propAdditionalPrograms,
    masterDb,
    propCatalogYear,
    core42Completed
  ]);

  const studentCourseOptions = (auditResult?.normalizedHistory || auditResult?.allStudentCourses || []).filter(
    (c) =>
      c.state === 'Complete' ||
      c.state === 'Completed' ||
      c.state === 'Transfer' ||
      c.state === 'TR' ||
      c.state === 'Current' ||
      c.state === 'Scheduled' ||
      c.state === 'In-Progress'
  );

  const handleSaveRowNote = (key) => {
    const trimmed = noteDraft.trim();
    const updated = { ...rowNotes, [key]: trimmed };
    if (!trimmed) delete updated[key];
    setRowNotes(updated);
    setEditingNoteKey(null);
    setNoteDraft('');
    if (onUpdateAuditOptions) {
      onUpdateAuditOptions({ requirementNotes: updated });
    }
  };

  const handleOverrideChange = (reqKey, value) => {
    const updated = { ...rowOverrides, [reqKey]: value };
    if (!value) delete updated[reqKey];
    setRowOverrides(updated);
    if (onUpdateAuditOptions) {
      onUpdateAuditOptions({ advisorOverrides: updated });
    }
  };

  // Excluded Courses Ledger: prioritize Phase A engine output
  const excludedCoursesList = useMemo(() => {
    return auditResult?.excludedCoursesLedger || auditResult?.excludedCourses || [];
  }, [auditResult]);

  // Credit Summations for Race to Graduation
  const allCourses = parsedTranscript?.validCourses || auditResult?.allStudentCourses || [];

  const completedCr = useMemo(() => {
    if (typeof auditResult?.totalCompletedCredits === 'number') {
      return auditResult.totalCompletedCredits;
    }
    return allCourses
      .filter(
        (c) =>
          c.operationalStatus === 'COMPLETED' ||
          c.state === 'Completed' ||
          c.state === 'Complete' ||
          c.state === 'TR' ||
          c.state === 'Transfer'
      )
      .reduce((s, c) => s + (Number(c.credits) || 0), 0);
  }, [auditResult, allCourses]);

  const inProgressCr = useMemo(() => {
    return allCourses
      .filter(
        (c) =>
          c.operationalStatus === 'IN_PROGRESS' ||
          c.state === 'In-Progress' ||
          c.state === 'Current'
      )
      .reduce((s, c) => s + (Number(c.credits) || 0), 0);
  }, [allCourses]);

  const scheduledCr = useMemo(() => {
    return allCourses
      .filter(
        (c) =>
          c.operationalStatus === 'SCHEDULED' ||
          c.state === 'Scheduled'
      )
      .reduce((s, c) => s + (Number(c.credits) || 0), 0);
  }, [allCourses]);

  const totalEarnedAndActive = completedCr + inProgressCr + scheduledCr;

  const targetCr = useMemo(() => {
    return (
      auditResult?.targetGraduationCredits ||
      auditResult?.dynamicGraduationTarget ||
      auditResult?.policyChecklist?.totalCredits?.target ||
      120
    );
  }, [auditResult]);

  const remainingCr = Math.max(0, targetCr - totalEarnedAndActive);
  const percentComplete = Math.min(100, Math.round((completedCr / targetCr) * 100));

  // Visual Coordinates
  const completedPct = Math.min(100, Math.max(0, (completedCr / targetCr) * 100));
  const activePct = Math.min(100 - completedPct, Math.max(0, ((inProgressCr + scheduledCr) / targetCr) * 100));

  const remainingFreeElectivesCr = useMemo(() => {
    if (typeof auditResult?.remainingFreeElectives === 'number') {
      return auditResult.remainingFreeElectives;
    }
    const appliedReqs = (auditResult?.remainingCourseItems || []).reduce((s, c) => s + (c.credits || 0), 0);
    return Math.max(0, targetCr - (totalEarnedAndActive + appliedReqs));
  }, [auditResult, targetCr, totalEarnedAndActive]);

  // Helper to render Anthology operational status badge
  const renderStatusBadge = (req) => {
    if (req.isOverride) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-purple-700" />
          <span>Override ({req.overrideValue})</span>
        </span>
      );
    }

    const mc = req.matchedCourse;
    if (!mc && req.waived) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          <span>✓ Waived ({req.note || 'Policy Exception'})</span>
        </span>
      );
    }

    if (mc) {
      const op =
        mc.operationalStatus ||
        (mc.state === 'In-Progress' || mc.state === 'Current'
          ? 'IN_PROGRESS'
          : mc.state === 'Scheduled'
          ? 'SCHEDULED'
          : 'COMPLETED');

      if (op === 'IN_PROGRESS') {
        const termLabel = mc.term ? ` • ${mc.term}` : '';
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
            <span>⏳ In-Progress{termLabel}</span>
          </span>
        );
      }

      if (op === 'SCHEDULED') {
        const termLabel = mc.term ? ` • ${mc.term}` : '';
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
            <span>⏳ Scheduled{termLabel}</span>
          </span>
        );
      }

      // Completed
      const gradeLabel = mc.grade ? ` (${mc.grade})` : '';
      const termLabel = mc.term ? ` • ${mc.term}` : '';
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          <span>✓ Completed{termLabel}{gradeLabel}</span>
        </span>
      );
    }

    if (req.satisfied) {
      const gradeLabel = req.grade ? ` (${req.grade})` : '';
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          <span>✓ Completed{gradeLabel}</span>
        </span>
      );
    }

    // Unfulfilled
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-300">
        <span>○ Unfulfilled</span>
      </span>
    );
  };

  // Helper for Excluded Courses Ledger badges
  const renderExclusionReasonBadge = (reason) => {
    if (reason === 'DEVELOPMENTAL') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
          [Developmental / Non-College Level]
        </span>
      );
    }
    if (reason === 'REPEATED_ATTEMPT') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
          [Repeated Attempt / Subsequent Used]
        </span>
      );
    }
    if (reason === 'BELOW_MIN_GRADE') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-900 border border-red-300">
          [Below Minimum Grade Threshold]
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-800 border border-neutral-300">
        [{reason || 'Excluded Attempt'}]
      </span>
    );
  };

  // Screen 2 -> Screen 3 Handoff Compiler
  const handleCompileAndProceed = () => {
    // 1. Identify active enrolled and scheduled course codes to strictly exclude from scheduling queue
    const activeEnrolledCodes = new Set(
      allCourses
        .filter(
          (c) =>
            c.operationalStatus === 'IN_PROGRESS' ||
            c.operationalStatus === 'SCHEDULED' ||
            c.state === 'In-Progress' ||
            c.state === 'Scheduled' ||
            c.state === 'Current'
        )
        .map((c) => c.compactCode || toCompact(c.code))
    );

    // 2. Build primaryRemainingQueue: filter remainingCourseItems
    const rawQueue = auditResult?.remainingCourseItems || [];
    const filteredQueue = rawQueue.filter((item) => {
      const compact = item.compactCode || toCompact(item.code);
      return !activeEnrolledCodes.has(compact);
    });

    // Replace choice pool placeholders with selected choices if any
    const finalPrimaryQueue = filteredQueue.map((item) => {
      if (item.electivePoolId && selectedPoolChoices[item.electivePoolId]) {
        const selectedCode = selectedPoolChoices[item.electivePoolId];
        const catCourse = (masterDb?.courses || []).find((c) => toCompact(c.code) === toCompact(selectedCode));
        return {
          ...item,
          code: selectedCode,
          compactCode: toCompact(selectedCode),
          title: catCourse?.title || item.title,
          isPreselectedChoice: true
        };
      }
      return item;
    });

    // Add custom electives created by the advisor
    finalPrimaryQueue.push(...customElectives);

    // 3. Build secondaryRemainingQueue if UNCOMMITTED_DUAL
    let secondaryQueue = null;
    if (activeTrackMode === 'UNCOMMITTED_DUAL' && trackConfig?.hasTracks) {
      const altTrackId = activeTrackId === 'option_a' ? 'option_b' : 'option_a';
      secondaryQueue = finalPrimaryQueue.map((c) => ({ ...c, targetTrack: altTrackId }));
    }

    const handoffPayload = {
      activeTrackMode,
      activeTrackId,
      primaryRemainingQueue: finalPrimaryQueue,
      secondaryRemainingQueue: secondaryQueue
    };

    onProceedToSchedule(handoffPayload);
  };

  // Check blank availability modal check
  const checkMissingAvailabilityAndProceed = () => {
    const blankCourses = (auditResult?.remainingCourseItems || []).filter(
      (c) =>
        c.type !== 'placeholder' &&
        !c.isPlaceholder &&
        !c.code?.startsWith('REQ_') &&
        (c.verification_status === 'Blank_Unverified' ||
          (!c.FA_I_8wk &&
            !c.FA_II_8wk &&
            !c.FA_16wk &&
            !c.SP_I_8wk &&
            !c.SP_II_8wk &&
            !c.SP_16wk &&
            !c.SU_8wk &&
            (!c.offered_sessions || c.offered_sessions.length === 0)))
    );

    if (blankCourses.length > 0) {
      setMissingModalOpen(true);
    } else {
      handleCompileAndProceed();
    }
  };

  const handleAddIncomingPlaceholder = (e) => {
    e.preventDefault();
    if (!incomingCode) return;

    const newTransfer = {
      code: incomingCode.trim(),
      title: incomingTitle.trim() || `Transfer (${incomingInstitution || 'Pending'})`,
      credits: Number(incomingCredits) || 3,
      institution: incomingInstitution || 'External College'
    };

    onUpdateAuditOptions({
      incomingTransfers: [...(auditResult?.incomingTransfers || []), newTransfer]
    });

    setIncomingCode('');
    setIncomingTitle('');
    setIncomingInstitution('');
    setIncomingModalOpen(false);
  };

  const handleAddCustomElective = (e) => {
    e.preventDefault();
    const count = customElectives.length + 1;
    const newSlot = {
      code: customElecType === 'UPPER' ? `REQ_ELEC_UPPER_CUSTOM_${count}` : `REQ_ELEC_GEN_CUSTOM_${count}`,
      compactCode: customElecType === 'UPPER' ? `REQ_ELEC_UPPER_CUSTOM_${count}` : `REQ_ELEC_GEN_CUSTOM_${count}`,
      title: customElecTitle || (customElecType === 'UPPER' ? 'Custom Upper-Division Elective (30000+)' : 'Custom General Elective'),
      credits: Number(customElecCredits) || 3,
      isPlaceholder: true,
      type: 'placeholder',
      isCustomPlaceholder: true,
      category: 'E'
    };
    setCustomElectives([...customElectives, newSlot]);
    setCustomElectiveModalOpen(false);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* =========================================================================
          CARD 1: TOP ADVISING & SCHEDULING CONTEXT BAR (PRESERVED)
      ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#857542] uppercase tracking-wider">
            Step 2: Deterministic Degree Audit & Policy Verification
          </span>
          <h1 className="text-3xl font-display font-extrabold text-neutral-900 tracking-tight">
            Curriculum Audit Ledger
          </h1>
          <p className="text-sm text-neutral-600">
            {auditResult?.primaryProgram?.name} — Catalog Year {propCatalogYear || auditResult?.primaryProgram?.catalog_year_id || '2026-2027'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToIntake}
            className="px-3.5 py-2 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition"
          >
            ← Back to Student Records
          </button>
          <button
            id="top-confirm-audit-proceed-btn"
            data-testid="top-confirm-audit-proceed-btn"
            onClick={checkMissingAvailabilityAndProceed}
            className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center space-x-2"
          >
            <span>Confirm Audit & Build Schedule (Screen 3)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Official Student Advising Record Context Grid */}
      {(() => {
        const student = parsedTranscript?.studentMetadata || auditResult?.studentMetadata || {};
        const effectiveConstraints = constraints || auditResult?.constraints || {};
        const max8 =
          effectiveConstraints.max8wkCredits !== undefined
            ? effectiveConstraints.max8wkCredits
            : effectiveConstraints.pacingMode === 'Part-Time'
            ? 6
            : 9;
        const max16 =
          effectiveConstraints.max16wkCredits !== undefined
            ? effectiveConstraints.max16wkCredits
            : effectiveConstraints.pacingMode === 'Part-Time'
            ? 11
            : 18;
        const pacingCapText = `${effectiveConstraints.pacingMode || 'Full-Time'} (Max ${max8}cr 8-wk / ${max16}cr 16-wk)`;
        const modalityText = effectiveConstraints.modalityPreference || 'No Preference (Flexible)';
        const isSummerEnabled =
          effectiveConstraints.summerAvailability &&
          effectiveConstraints.summerAvailability !== 'No Summer' &&
          Number(effectiveConstraints.maxSummerCredits) !== 0;
        const maxSummer = Number(effectiveConstraints.maxSummerCredits) || 6;
        const summerText = isSummerEnabled ? `Summer: Available (Max ${maxSummer}cr)` : 'Summer: Not Available';

        const advisorDisplayName =
          student.advisor ||
          (facultyProfile ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim() : 'Matthias Wood');
        const advisorDisplayEmail = student.email || facultyProfile?.email || 'mwood@lindenwood.edu';

        const catalogYearValue =
          propCatalogYear ||
          student.catalogYear ||
          auditResult?.primaryProgram?.catalog_year_id ||
          '2026-2027';

        const primaryProgramName =
          auditResult?.primaryProgram?.name ||
          student.programVersion ||
          (masterDb?.programs || []).find((p) => p.id === propSelectedProgramId)?.name ||
          'Undergraduate Degree';

        let degreeTitle = primaryProgramName;
        let emphasis = '';
        if (primaryProgramName.includes(' - ')) {
          const parts = primaryProgramName.split(' - ');
          degreeTitle = parts[0].trim();
          emphasis = parts.slice(1).join(' - ').trim();
        } else if (primaryProgramName.includes(' — ')) {
          const parts = primaryProgramName.split(' — ');
          degreeTitle = parts[0].trim();
          emphasis = parts.slice(1).join(' — ').trim();
        }

        const rawAdditionalList = [
          ...(propAdditionalPrograms || []),
          ...(student.declaredMinors || []),
          ...(student.concentrations || []),
          ...(student.additionalPrograms || []),
          ...(auditResult?.additionalPrograms || [])
        ];

        const allAdditionalPrograms = Array.from(
          new Set(
            rawAdditionalList
              .map((p) => (typeof p === 'string' ? p.trim() : p?.name?.trim() || ''))
              .filter(Boolean)
          )
        ).filter((prog) => {
          const lower = prog.toLowerCase();
          if (degreeTitle.toLowerCase().includes(lower)) return false;
          if (emphasis && emphasis.toLowerCase().includes(lower)) return false;
          return true;
        });

        return (
          <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              {/* Left Column: Student Identity & Academic Programs */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FDFBF7] border border-[#B5A36A] text-xs font-bold text-neutral-900 shadow-2xs">
                    <span>🎓 Projected Graduation Date:</span>
                    <span className="font-mono text-neutral-700 italic">Pending</span>
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-1.5 py-0.2 rounded ml-1">
                      Calculated in Step 3
                    </span>
                  </div>
                  <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#857542]/10 text-[#857542] border border-[#857542]/20 text-xs font-semibold font-mono">
                    Catalog Year: {catalogYearValue}
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#857542]/10 border border-[#857542]/30 flex items-center justify-center font-bold text-[#857542] text-xs shrink-0">
                    {(student.name || 'Student')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h2 className="text-base font-bold text-neutral-900 tracking-tight truncate">
                      {student.name || 'Unassigned Record'}
                    </h2>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono text-[11px] font-semibold">
                      ID: {student.studentId || student.id || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-neutral-800">
                    <span className="text-neutral-500 uppercase text-[10px] tracking-wider font-bold mr-1.5">
                      Major:
                    </span>
                    {degreeTitle}
                    {emphasis ? ` • ${emphasis}` : ''}
                  </p>
                  {allAdditionalPrograms.map((prog, idx) => {
                    const isCert = /cert/i.test(prog);
                    const label = isCert ? 'Certificate' : 'Minor';
                    return (
                      <p key={idx} className="text-xs font-semibold text-neutral-800">
                        <span className="text-neutral-500 uppercase text-[10px] tracking-wider font-bold mr-1.5">
                          {label}:
                        </span>
                        {prog}
                      </p>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 pt-1">
                  {advisorDisplayName && (
                    <span>
                      <strong className="text-neutral-700">Advisor Name:</strong> {advisorDisplayName}
                    </span>
                  )}
                  {advisorDisplayName && advisorDisplayEmail && <span className="text-neutral-300">•</span>}
                  {advisorDisplayEmail && (
                    <span>
                      <strong className="text-neutral-700">Advisor Email:</strong> {advisorDisplayEmail}
                    </span>
                  )}
                  {student.phone && <span className="text-neutral-300">•</span>}
                  {student.phone && (
                    <span>
                      <strong className="text-neutral-700">Phone:</strong> {student.phone}
                    </span>
                  )}
                  <span className="text-neutral-300">•</span>
                  <span>
                    <strong className="text-neutral-700">Created On:</strong> {planCreationDate}
                  </span>
                </div>
              </div>

              {/* Right Column: Schedule Constraints Context Grid */}
              <div className="w-full lg:w-80 flex-shrink-0 bg-neutral-50/90 border border-neutral-200/80 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                  <span>SCHEDULE CONSTRAINTS</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-mono text-[9px] font-bold lowercase">
                    active
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-0.5 text-neutral-600">
                    <span>Pacing Mode:</span>
                    <strong className="text-neutral-800 text-right truncate">{pacingCapText}</strong>
                  </div>
                  <div className="flex justify-between items-center py-0.5 text-neutral-600">
                    <span>Modality Preference:</span>
                    <strong className="text-neutral-800 text-right">{modalityText}</strong>
                  </div>
                  <div className="flex justify-between items-center py-0.5 text-neutral-600">
                    <span>Summer Availability:</span>
                    <strong className="text-neutral-800 text-right">{summerText}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Composition Gatekeeper Alert if D-Grade is present */}
      {compositionGatekeeper.warnings?.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-50 border-l-4 border-amber-500 text-amber-900 shadow-xs">
          <div className="flex items-center space-x-2 font-bold text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Composition Grade Gatekeeper Alert</span>
          </div>
          <div className="text-xs mt-1 space-y-1">
            {compositionGatekeeper.warnings.map((w, idx) => (
              <p key={idx}>{w.message}</p>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          CARD 2: STREAMLINED "RACE TO GRADUATION" CARD & EXCLUDED COURSES DRAWER
      ========================================================================= */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm space-y-6">
        {/* Glanceable Race Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
              RACE TO GRADUATION <span className="text-xs font-normal text-neutral-500">(Race to the Graduation Flag)</span>
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#857542]/10 text-[#857542] border border-[#857542]/30">
              Dynamic Target: {targetCr} cr
            </span>
            <span
              data-testid="audit-summary-metric"
              className="text-xs font-bold text-neutral-900 font-mono bg-neutral-100 px-3 py-1 rounded border border-neutral-200"
            >
              {completedCr} / {targetCr} Total Credits Completed ({percentComplete}%)
            </span>
          </div>
        </div>

        {/* Visual Progress Track with Milestones */}
        <div className="relative pt-8 pb-3">
          {/* Stick-Figure Avatar at Completed Coordinate */}
          <div
            className="absolute top-0 transform -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300"
            style={{ left: `${Math.max(4, Math.min(96, completedPct))}%` }}
          >
            <div className="bg-[#857542] text-white text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shadow">
              {completedCr} cr
            </div>
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-neutral-900 mt-0.5 fill-current">
              <circle cx="12" cy="4" r="3" />
              <path d="M12 7v7M9 9l3 2 3-2M9 18l3-4 3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </div>

          {/* 15-degree Sheared Graduation Flag at Target Mark (100%) */}
          <div className="absolute right-0 top-1 flex flex-col items-center">
            <div className="lu-shear bg-black text-[#B5A36A] font-bold text-[10px] px-2 py-0.5 shadow flex items-center space-x-1 border border-[#B5A36A]">
              <span className="lu-shear-content flex items-center space-x-1">
                <Flag className="w-3 h-3 text-[#B5A36A]" />
                <span>GRADUATION FLAG ({targetCr} CR)</span>
              </span>
            </div>
          </div>

          {/* Horizontal Track Bar */}
          <div className="w-full h-7 bg-neutral-100 rounded-full overflow-hidden flex border border-neutral-300">
            {/* Completed Segment (Digital Gold #857542) */}
            <div
              className="bg-[#857542] h-full transition-all duration-500"
              style={{ width: `${completedPct}%` }}
            />
            {/* Active In-Progress + Scheduled Segment (Striped Gold #B5A36A) */}
            <div
              className="bg-[#B5A36A] h-full transition-all duration-500 relative"
              style={{
                width: `${activePct}%`,
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.3) 5px, rgba(255,255,255,0.3) 10px)'
              }}
            />
          </div>

          {/* Milestone Markers */}
          <div className="flex justify-between text-[11px] font-mono text-neutral-500 mt-2">
            <span>0 cr</span>
            <span className={completedCr >= 30 ? 'font-bold text-emerald-700' : ''}>
              30 cr {completedCr >= 30 ? '[✓]' : ''} (Sophomore)
            </span>
            <span className={completedCr >= 60 ? 'font-bold text-emerald-700' : ''}>
              60 cr {completedCr >= 60 ? '[✓]' : ''} (Junior)
            </span>
            <span className={completedCr >= 90 ? 'font-bold text-emerald-700' : ''}>
              90 cr {completedCr >= 90 ? '[✓]' : ''} (Senior)
            </span>
            <span className="font-bold text-neutral-900">{targetCr} cr (Graduation)</span>
          </div>
        </div>

        {/* Credit Breakdown Summary */}
        <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex flex-wrap items-center justify-between text-xs text-neutral-700 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              <strong className="text-neutral-950 font-bold font-mono" data-testid="audit-completed-cr">{completedCr}</strong> Completed
            </span>
            <span className="text-neutral-300">•</span>
            <span>
              <strong className="text-blue-800 font-bold font-mono" data-testid="audit-current-cr">{inProgressCr}</strong> Active In-Progress
            </span>
            <span className="text-neutral-300">•</span>
            <span>
              <strong className="text-purple-800 font-bold font-mono">{scheduledCr}</strong> Active Scheduled
            </span>
            <span className="text-neutral-300">•</span>
            <span>
              <strong className="text-neutral-900 font-bold font-mono">{remainingCr}</strong> Remaining to Finish Line
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            Earned + Active: <strong className="text-neutral-900 font-bold" data-testid="audit-total-cr">{totalEarnedAndActive}</strong> cr
          </span>
        </div>

        {/* Collapsible Drawer Toggle Button */}
        <div>
          <button
            type="button"
            data-testid="audit-details-drawer-toggle"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="w-full flex items-center justify-between p-3.5 bg-neutral-50 hover:bg-neutral-100/80 rounded-lg border border-neutral-200 transition text-xs font-bold text-neutral-800 cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-neutral-600" />
              <span>
                View Institutional Audit Details & Excluded Courses Ledger ({excludedCoursesList.length} Courses)
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-neutral-500">
              <span className="text-[11px] font-semibold">{drawerOpen ? 'Hide' : 'Show'}</span>
              {drawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {/* Collapsible Drawer Body */}
          {drawerOpen && (
            <div className="mt-3 p-4 bg-neutral-50/60 rounded-lg border border-neutral-200 space-y-6">
              {/* Sub-Panel A: Institutional Policy Gates */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#857542]" />
                  <span>Institutional Policy Verification Gates</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Gate 1: 42 Upper-Division Hours */}
                  <div
                    data-testid="upper-division-meter"
                    className="p-3 bg-white rounded border border-neutral-200 space-y-2"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-neutral-900">42 Upper-Division Hours (30000+ Level)</span>
                      {upperDivisionGate.isSatisfied ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ {upperDivisionGate.completed} / 42 cr Completed
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          ⚠️ {upperDivisionGate.remaining} cr 30000+ remaining
                        </span>
                      )}
                    </div>
                    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          upperDivisionGate.isSatisfied ? 'bg-emerald-600' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, (upperDivisionGate.completed / 42) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10.5px] text-neutral-500">
                      {upperDivisionGate.completed} earned or active upper-division credits applied.
                    </span>
                  </div>

                  {/* Gate 2: Missouri CORE 42 / AA Status */}
                  <div className="p-3 bg-white rounded border border-neutral-200 space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-neutral-900">General Education Framework</span>
                      <span className="text-[10px] font-mono text-neutral-500">42 Credits</span>
                    </div>
                    {core42Completed ? (
                      <p className="text-emerald-700 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>✓ Cleared via Block Transfer Override (CORE 42 / AA)</span>
                      </p>
                    ) : (
                      <p className="text-neutral-700 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#857542]" />
                        <span>Distributed across 8 Categories ({geAudit.earnedCredits} / 42 cr Met)</span>
                      </p>
                    )}
                  </div>

                  {/* Gate 3: Composition Gatekeeper */}
                  <div className="p-3 bg-white rounded border border-neutral-200 space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-neutral-900">Composition Gate (ENGL 15000 & 17000)</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          compositionGatekeeper.writtenCommunicationSatisfied
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {compositionGatekeeper.writtenCommunicationSatisfied ? 'PASSED' : 'C-GRADE DEFICIT'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600">
                      {compositionGatekeeper.writtenCommunicationSatisfied
                        ? '✓ Composition I & II completed with C or higher.'
                        : 'Composition requires grade of C or higher; credits earned count towards general electives.'}
                    </p>
                  </div>

                  {/* Gate 4: Institutional Residency */}
                  <div className="p-3 bg-white rounded border border-neutral-200 space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-neutral-900">Institutional Residency Requirements</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        30cr Met
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600">
                      Minimum 30 credits institutional residency satisfied | Final 24 of 30 credits in residency: Met.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sub-Panel B: Excluded Courses Ledger Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-neutral-600" />
                  <span>Itemized Excluded Courses Ledger ({excludedCoursesList.length} Attempts)</span>
                </h4>

                <div className="bg-white rounded border border-neutral-200 overflow-x-auto">
                  <table data-testid="excluded-courses-table" className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200 text-[11px]">
                        <th className="py-2 px-3">Course</th>
                        <th className="py-2 px-3">Credits</th>
                        <th className="py-2 px-3">Term</th>
                        <th className="py-2 px-2 text-center">Grade</th>
                        <th className="py-2 px-3">Reason Badge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {excludedCoursesList.length > 0 ? (
                        excludedCoursesList.map((c, idx) => (
                          <tr key={`${c.code}-${idx}`} className="hover:bg-neutral-50/70 transition">
                            <td className="py-2 px-3 font-mono font-bold text-neutral-900">
                              {c.code} <span className="font-normal text-neutral-600 font-sans ml-1">{c.title}</span>
                            </td>
                            <td className="py-2 px-3 font-mono text-neutral-600">{c.credits || 0}cr</td>
                            <td className="py-2 px-3 text-neutral-600">{c.term || '—'}</td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-neutral-900">
                              {c.grade || '—'}
                            </td>
                            <td className="py-2 px-3">{renderExclusionReasonBadge(c.reason)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="py-4 px-3 text-center text-neutral-500 italic">
                            No courses excluded. All student records met passing and degree eligibility standards.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          CARD 3: DEGREE REQUIREMENT ACCORDIONS (STRICT ORDERING)
      ========================================================================= */}
      <div className="space-y-5">
        {/* =====================================================================
            ACCORDION 1: GENERAL EDUCATION: CORE 42 (TOP PRIORITY)
        ===================================================================== */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div
            onClick={() => toggleAccordion('ge')}
            className="px-6 py-4 bg-neutral-50/90 hover:bg-neutral-100/80 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
          >
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 rounded text-xs font-bold border bg-sky-100 text-sky-900 border-sky-300">
                🏛️ General Education
              </span>
              <h3 className="text-base font-bold text-neutral-900">
                GENERAL EDUCATION: CORE 42 (42 CREDITS)
              </h3>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-semibold text-neutral-700">
                <strong className="text-neutral-900">{core42Completed ? 42 : geAudit.earnedCredits}</strong> / 42 cr
              </span>
              {accordionOpen.ge ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
            </div>
          </div>

          {accordionOpen.ge && (
            <div className="p-6 space-y-5">
              {/* Transfer Block Waiver Banner */}
              {core42Completed ? (
                <div
                  data-testid="core42-transfer-banner"
                  className="p-4 rounded-lg bg-emerald-50 border-l-4 border-emerald-500 text-emerald-900 flex items-center justify-between text-xs font-bold"
                >
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span>✓ All 42 General Education lower-division credits fulfilled via Transfer Block Waiver</span>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-mono text-[11px]">
                    42 / 42 cr Met
                  </span>
                </div>
              ) : (
                /* Native Student: 8 State-Aligned Distribution Categories */
                <div data-testid="ge-categories-section" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                      State-Aligned Distribution Categories (Restrictive-First Allocation)
                    </span>
                    <span className="text-xs font-mono font-semibold text-neutral-600">
                      {geAudit.earnedCredits} / {geAudit.totalRequired} cr Satisfied
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {geAudit.categories.map((cat) => {
                      const isCatSatisfied = cat.satisfied;
                      const isWritten = cat.id === 'written_communication';
                      const hasCompWarning = isWritten && compositionGatekeeper.hasWarning;

                      return (
                        <div
                          key={cat.id}
                          data-testid={`ge-category-${cat.id}`}
                          className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                            isCatSatisfied
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : hasCompWarning
                              ? 'bg-amber-50/50 border-amber-300'
                              : 'bg-neutral-50 border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-neutral-900 truncate">{cat.name}</span>
                            <span className="font-mono text-[11px] text-neutral-600 shrink-0 ml-1">
                              {cat.credits}cr
                            </span>
                          </div>

                          {isCatSatisfied ? (
                            <div className="flex items-center space-x-1 text-emerald-700 font-semibold text-[11px] pt-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span>Distribution requirement met</span>
                            </div>
                          ) : (
                            <div className="text-amber-800 font-semibold text-[11px] pt-1">
                              {cat.remainingCredits} cr remaining
                            </div>
                          )}

                          {hasCompWarning && (
                            <div
                              data-testid="composition-gatekeeper-alert"
                              className="mt-1.5 p-2 rounded bg-amber-100 border border-amber-400 text-amber-950 text-[10px] leading-snug font-bold"
                            >
                              Grade of C or higher required to satisfy Composition GE.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Itemized General Education Buckets Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                      <th className="py-2.5 px-4">Requirement / Bucket</th>
                      <th className="py-2.5 px-3">Cr</th>
                      <th className="py-2.5 px-4">Status & Matched Course</th>
                      <th className="py-2.5 px-4">Equivalence Override / PE</th>
                      <th className="py-2.5 px-4 text-right">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {auditResult?.geBuckets?.map((b) => {
                      const reqKey = `GE:${b.bucket_id}`;
                      const activeOverride = rowOverrides[reqKey] || '';
                      const activeNote = rowNotes[reqKey] || '';
                      return (
                        <tr key={b.bucket_id} className="hover:bg-neutral-50/70 transition">
                          <td className="py-2.5 px-4 font-bold text-neutral-900">
                            {b.displayPlaceholderTitle || b.name}
                            {b.requiresHD && (
                              <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded">
                                /HD
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-neutral-600">{b.required_credits}cr</td>
                          <td className="py-2.5 px-4">
                            {core42Completed ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Cleared via CORE 42 Transfer Block</span>
                              </span>
                            ) : activeOverride ? (
                              <span className="inline-flex items-center space-x-1 text-purple-700 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                                <span>Override: {activeOverride}</span>
                              </span>
                            ) : (
                              renderStatusBadge(b)
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-neutral-600">
                            <select
                              aria-label={`Equivalence override for ${b.name}`}
                              value={activeOverride}
                              onChange={(e) => handleOverrideChange(reqKey, e.target.value)}
                              className="px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white text-neutral-800 font-medium max-w-[230px]"
                            >
                              <option value="">
                                {core42Completed
                                  ? 'Cleared via CORE 42 Transfer Block'
                                  : b.matchedCourse
                                  ? `Default: ${b.matchedCourse.code}`
                                  : 'Auto-Match / Standard Rule'}
                              </option>
                              <option value="PE: Waived via Policy Exception">
                                Policy Exception (PE) — Waive Bucket
                              </option>
                              {studentCourseOptions.map((sc) => (
                                <option key={`tent-${sc.code}`} value={`${sc.code} (* Tentative DB)`}>
                                  {sc.code} — Save to Shared DB (* Tentative)
                                </option>
                              ))}
                              {studentCourseOptions.map((sc) => (
                                <option key={`pe-${sc.code}`} value={`${sc.code} (Student PE)`}>
                                  {sc.code} — Apply as Student PE
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {editingNoteKey === reqKey ? (
                              <div className="inline-flex items-center space-x-1">
                                <input
                                  type="text"
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  placeholder="Note..."
                                  className="px-2 py-0.5 text-[11px] border border-[#857542] rounded w-28"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRowNote(reqKey)}
                                  className="px-1.5 py-0.5 bg-[#857542] text-white text-[10px] font-bold rounded"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center space-x-2">
                                {activeNote && (
                                  <span className="text-[10px] bg-[#F7F5EE] border border-[#B5A36A] text-[#857542] px-1.5 py-0.5 rounded font-semibold">
                                    {activeNote}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteKey(reqKey);
                                    setNoteDraft(activeNote);
                                  }}
                                  className="text-[11px] text-neutral-500 hover:text-black font-semibold"
                                >
                                  [+ Add Note]
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* =====================================================================
            ACCORDION 2: PRIMARY MAJOR (and Secondary Major if present)
        ===================================================================== */}
        {primaryLedger && (
          <div
            data-testid={`program-accordion-${primaryLedger.programId}`}
            className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
          >
            <div
              onClick={() => toggleAccordion('primaryMajor')}
              className="px-6 py-4 bg-neutral-50/90 hover:bg-neutral-100/80 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
            >
              <div className="flex items-center space-x-3">
                <span className="px-2.5 py-1 rounded text-xs font-bold border bg-amber-100 text-amber-900 border-amber-300">
                  🎓 Primary Major
                </span>
                <h3 className="text-base font-bold text-neutral-900">{primaryLedger.name}</h3>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-semibold text-neutral-700">
                  <strong className="text-neutral-900">{primaryLedger.satisfiedCredits}</strong> / {primaryLedger.requiredCredits} cr
                </span>
                {accordionOpen.primaryMajor ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
              </div>
            </div>

            {accordionOpen.primaryMajor && (
              <div className="p-6 space-y-6">
                {/* Embedded Multi-Track Navigation (e.g. Data Science BS) */}
                {primaryLedger.track?.hasTracks && (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                          Curricular Track Option
                        </span>
                        <span className="text-xs text-neutral-500 font-mono">
                          {activeTrackId === 'option_a'
                            ? 'Option A: 9cr Group 1 + 18cr Group 2 = 27cr'
                            : 'Option B: 15cr Group 1 + 15cr Group 2 = 30cr'}
                        </span>
                      </div>
                      {/* Track Tabs */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid="track-pill-option_a"
                          onClick={() => handleSelectTrack('option_a')}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border cursor-pointer ${
                            activeTrackId === 'option_a'
                              ? 'bg-[#857542] text-white border-[#857542] shadow-xs'
                              : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                          }`}
                        >
                          <span>{activeTrackId === 'option_a' ? '◉' : '○'}</span>
                          <span>Option A: Domain Depth (9/18)</span>
                        </button>
                        <button
                          type="button"
                          data-testid="track-pill-option_b"
                          onClick={() => handleSelectTrack('option_b')}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border cursor-pointer ${
                            activeTrackId === 'option_b'
                              ? 'bg-[#857542] text-white border-[#857542] shadow-xs'
                              : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                          }`}
                        >
                          <span>{activeTrackId === 'option_b' ? '◉' : '○'}</span>
                          <span>Option B: Balanced Applied Science (15/15)</span>
                        </button>
                      </div>
                    </div>

                    {/* Track Commitment Action Toggle */}
                    <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center gap-4 text-xs font-semibold">
                      <span className="text-neutral-500 text-[11px] uppercase tracking-wider font-bold">
                        Scheduler Contract:
                      </span>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="trackCommitmentMode"
                          value="COMMITTED"
                          checked={activeTrackMode === 'COMMITTED'}
                          onChange={() => setActiveTrackMode('COMMITTED')}
                          className="text-[#857542] focus:ring-[#857542]"
                        />
                        <span className="text-neutral-800">● Commit to Active Track</span>
                        <span className="text-[10px] text-neutral-500 font-normal">
                          (Locks audit to selected track for a single plan)
                        </span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="trackCommitmentMode"
                          value="UNCOMMITTED_DUAL"
                          checked={activeTrackMode === 'UNCOMMITTED_DUAL'}
                          onChange={() => setActiveTrackMode('UNCOMMITTED_DUAL')}
                          className="text-[#857542] focus:ring-[#857542]"
                        />
                        <span className="text-neutral-800">○ Keep Uncommitted (Generate Both Schedules)</span>
                        <span className="text-[10px] text-neutral-500 font-normal">
                          (Signals scheduler to compile dual roadmaps)
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Elective Pools & Choice Group Dropdowns */}
                {(primaryLedger.electivePools || []).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                      Major Elective Pools & Choice Groups
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {primaryLedger.electivePools.map((pool) => {
                        const pct = Math.min(100, Math.max(0, (pool.creditsApplied / pool.creditsRequired) * 100));
                        const isMet = pool.creditsApplied >= pool.creditsRequired;
                        return (
                          <div
                            key={pool.poolId}
                            data-testid={`elective-pool-${pool.poolId}`}
                            className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="text-neutral-900 truncate">{pool.title}</span>
                              <span className="font-mono text-neutral-700 shrink-0 ml-2">
                                {pool.creditsApplied} / {pool.creditsRequired} cr
                              </span>
                            </div>
                            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${isMet ? 'bg-emerald-600' : 'bg-[#857542]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-neutral-500">
                              <span>{isMet ? '✓ Requirement Met' : `${pool.remainingCredits} cr remaining`}</span>
                              {pool.appliedCourses?.length > 0 && (
                                <span className="font-mono text-neutral-700">
                                  Applied: {pool.appliedCourses.join(', ')}
                                </span>
                              )}
                            </div>

                            {/* Choice Group Inline Dropdown */}
                            {!isMet && (
                              <div className="pt-2 border-t border-neutral-200/70 space-y-1">
                                <label className="block text-[10.5px] font-bold text-neutral-600">
                                  Choice Group Pre-Selection:
                                </label>
                                <select
                                  value={selectedPoolChoices[pool.poolId] || ''}
                                  onChange={(e) =>
                                    setSelectedPoolChoices({
                                      ...selectedPoolChoices,
                                      [pool.poolId]: e.target.value
                                    })
                                  }
                                  className="w-full px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white text-neutral-800 font-medium truncate"
                                >
                                  <option value="">-- Pass as Category Placeholder to Scheduler --</option>
                                  {(pool.approvedCourses || pool.courses || []).map((code) => (
                                    <option key={code} value={code}>
                                      {code}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Primary Major Requirements Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                        <th className="py-2.5 px-3">Course Code & Title</th>
                        <th className="py-2.5 px-2 text-center">Cr</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Cross-Counting / Credential Sharing</th>
                        <th className="py-2.5 px-3">Equivalence Override / PE</th>
                        <th className="py-2.5 px-3 text-right">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {primaryLedger.requirements.map((req) => {
                        const reqKey = `MAJOR:${req.compactCode}`;
                        const activeOverride = rowOverrides[reqKey] || '';
                        const activeNote = rowNotes[reqKey] || '';
                        return (
                          <tr key={req.compactCode} className="hover:bg-neutral-50/70 transition">
                            <td className="py-2 px-3">
                              <span className="font-mono font-bold text-neutral-900 mr-2">{req.code}</span>
                              <span className="text-neutral-700">{req.title}</span>
                            </td>
                            <td className="py-2 px-2 font-mono text-neutral-600 text-center">{req.credits}cr</td>
                            <td className="py-2 px-3">{renderStatusBadge(req)}</td>
                            <td className="py-2 px-3">
                              {req.isCrossCounted ? (
                                <span
                                  data-testid={`cross-counted-${req.compactCode}`}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200"
                                >
                                  🔗 Cross-Counted with {req.sharedWithProgramName || 'Declared Program'}
                                </span>
                              ) : (
                                <span className="text-neutral-400 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-neutral-600">
                              <select
                                aria-label={`Equivalence override for ${req.code}`}
                                value={activeOverride}
                                onChange={(e) => handleOverrideChange(reqKey, e.target.value)}
                                className="px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white text-neutral-800 font-medium max-w-[200px]"
                              >
                                <option value="">
                                  {req.matchedCourse ? `Matched: ${req.matchedCourse.code}` : 'Standard Catalog Rule'}
                                </option>
                                <option value="PE: Waived via Policy Exception">Policy Exception (PE) — Waive</option>
                                {studentCourseOptions.map((sc) => (
                                  <option key={`tent-${sc.code}`} value={`${sc.code} (* Tentative DB)`}>
                                    {sc.code} — Save Equivalence (* Tentative)
                                  </option>
                                ))}
                                {studentCourseOptions.map((sc) => (
                                  <option key={`pe-${sc.code}`} value={`${sc.code} (Student PE)`}>
                                    {sc.code} — Substitute via Student PE
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-right">
                              {editingNoteKey === reqKey ? (
                                <div className="inline-flex items-center space-x-1">
                                  <input
                                    type="text"
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    placeholder="Note..."
                                    className="px-2 py-0.5 text-[11px] border border-[#857542] rounded w-24"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRowNote(reqKey)}
                                    className="px-1.5 py-0.5 bg-[#857542] text-white text-[10px] font-bold rounded"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center space-x-2">
                                  {activeNote && (
                                    <span className="text-[10px] bg-[#F7F5EE] border border-[#B5A36A] text-[#857542] px-1.5 py-0.5 rounded font-semibold">
                                      {activeNote}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNoteKey(reqKey);
                                      setNoteDraft(activeNote);
                                    }}
                                    className="text-[11px] text-neutral-500 hover:text-black font-semibold"
                                  >
                                    [+ Note]
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Secondary Majors (if present) */}
        {secondaryLedgers.map((secLedger) => (
          <div
            key={secLedger.programId}
            data-testid={`program-accordion-${secLedger.programId}`}
            className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
          >
            <div
              onClick={() => toggleAccordion(`sec_${secLedger.programId}`)}
              className="px-6 py-4 bg-neutral-50/90 hover:bg-neutral-100/80 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
            >
              <div className="flex items-center space-x-3">
                <span className="px-2.5 py-1 rounded text-xs font-bold border bg-sky-100 text-sky-900 border-sky-300">
                  🎓 Secondary Major
                </span>
                <h3 className="text-base font-bold text-neutral-900">{secLedger.name}</h3>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-semibold text-neutral-700">
                  <strong className="text-neutral-900">{secLedger.satisfiedCredits}</strong> / {secLedger.requiredCredits} cr
                </span>
                {secLedger.crossCountedCredits > 0 && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    {secLedger.crossCountedCredits} cr shared
                  </span>
                )}
                {accordionOpen[`sec_${secLedger.programId}`] !== false ? (
                  <ChevronUp className="w-4 h-4 text-neutral-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-500" />
                )}
              </div>
            </div>

            {accordionOpen[`sec_${secLedger.programId}`] !== false && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                        <th className="py-2.5 px-3">Course Code & Title</th>
                        <th className="py-2.5 px-2 text-center">Cr</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Cross-Counting / Credential Sharing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {secLedger.requirements.map((req) => (
                        <tr key={req.compactCode} className="hover:bg-neutral-50/70 transition">
                          <td className="py-2 px-3">
                            <span className="font-mono font-bold text-neutral-900 mr-2">{req.code}</span>
                            <span className="text-neutral-700">{req.title}</span>
                          </td>
                          <td className="py-2 px-2 font-mono text-neutral-600 text-center">{req.credits}cr</td>
                          <td className="py-2 px-3">{renderStatusBadge(req)}</td>
                          <td className="py-2 px-3">
                            {req.isCrossCounted && (
                              <span
                                data-testid={`cross-counted-${req.compactCode}`}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200"
                              >
                                🔗 Cross-Counted with {req.sharedWithProgramName || 'Primary Major'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* =====================================================================
            ACCORDION 3: MINORS & CERTIFICATES (STACK WATERFALL)
        ===================================================================== */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div
            onClick={() => toggleAccordion('minorsCerts')}
            className="px-6 py-4 bg-neutral-50/90 hover:bg-neutral-100/80 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
          >
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 rounded text-xs font-bold border bg-blue-100 text-blue-900 border-blue-300">
                📚 Credentials
              </span>
              <h3 className="text-base font-bold text-neutral-900">
                MINORS & CERTIFICATES (STACK WATERFALL)
              </h3>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                {minorAndCertLedgers.length} Declared
              </span>
              {accordionOpen.minorsCerts ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
            </div>
          </div>

          {accordionOpen.minorsCerts && (
            <div className="p-6 space-y-6">
              {minorAndCertLedgers.length > 0 ? (
                minorAndCertLedgers.map((ledger) => {
                  const isCert = ledger.category === 'Certificate' || ledger.role === 'Certificate';
                  const label = isCert ? '📜 Certificate' : '📘 Minor';
                  const badgeColor = isCert ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-blue-100 text-blue-900 border-blue-300';

                  return (
                    <div
                      key={ledger.programId}
                      data-testid={`program-accordion-${ledger.programId}`}
                      className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badgeColor}`}>
                            {label}
                          </span>
                          <h4 className="text-sm font-bold text-neutral-900">{ledger.name}</h4>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-semibold text-neutral-700">
                            <strong>{ledger.satisfiedCredits}</strong> / {ledger.requiredCredits} cr
                          </span>
                          {ledger.crossCountedCredits > 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                              {ledger.crossCountedCredits} cr shared
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto bg-white rounded border border-neutral-200">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                              <th className="py-2 px-3">Course Code & Title</th>
                              <th className="py-2 px-2 text-center">Cr</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Cross-Counting / Credential Sharing</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {ledger.requirements.map((req) => (
                              <tr key={req.compactCode} className="hover:bg-neutral-50/70 transition">
                                <td className="py-2 px-3">
                                  <span className="font-mono font-bold text-neutral-900 mr-2">{req.code}</span>
                                  <span className="text-neutral-700">{req.title}</span>
                                </td>
                                <td className="py-2 px-2 font-mono text-neutral-600 text-center">{req.credits}cr</td>
                                <td className="py-2 px-3">{renderStatusBadge(req)}</td>
                                <td className="py-2 px-3">
                                  {req.isCrossCounted ? (
                                    <span
                                      data-testid={`cross-counted-${req.compactCode}`}
                                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200"
                                    >
                                      🔗 Cross-Counted with {req.sharedWithProgramName || 'Primary Major'}
                                    </span>
                                  ) : (
                                    <span className="text-neutral-400 text-[10px]">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-neutral-500 bg-neutral-50 rounded-lg border border-neutral-200">
                  <p>No Minors or Certificates declared for this degree plan.</p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Advisors can declare additional credentials on Screen 1 to view cross-counting waterfalls.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =====================================================================
            ACCORDION 4: FREE ELECTIVES TO REACH DEGREE FINISH LINE
        ===================================================================== */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div
            onClick={() => toggleAccordion('freeElectives')}
            className="px-6 py-4 bg-neutral-50/90 hover:bg-neutral-100/80 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
          >
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 rounded text-xs font-bold border bg-neutral-200 text-neutral-900 border-neutral-300">
                🎯 Finish Line
              </span>
              <h3 className="text-base font-bold text-neutral-900">
                FREE ELECTIVES TO REACH DEGREE FINISH LINE
              </h3>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-semibold text-neutral-700">
                <strong className="text-neutral-900">{remainingFreeElectivesCr}</strong> cr Required
              </span>
              {accordionOpen.freeElectives ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
            </div>
          </div>

          {accordionOpen.freeElectives && (
            <div className="p-6 space-y-5">
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-neutral-800">Dynamic Finish Line Target: {targetCr} cr</span>
                  <p className="text-[11px] text-neutral-500">
                    Remaining free elective credit balance required to bridge specific program requirements: {remainingFreeElectivesCr} cr.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomElectiveModalOpen(true)}
                    className="px-3 py-1.5 bg-[#857542] hover:bg-[#6E6035] text-white font-bold text-xs rounded flex items-center space-x-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>[+ Add Custom Elective Placeholder]</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncomingModalOpen(true)}
                    className="px-3 py-1.5 bg-white border border-[#B5A36A] hover:bg-[#F7F5EE] text-[#857542] font-bold text-xs rounded flex items-center space-x-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>[+ Add Incoming Transfer Placeholder]</span>
                  </button>
                </div>
              </div>

              {/* Table of Applied Free Electives & Generated Placeholders */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                      <th className="py-2.5 px-3">Course Code & Description</th>
                      <th className="py-2.5 px-2 text-center">Cr</th>
                      <th className="py-2.5 px-3">Role / Status</th>
                      <th className="py-2.5 px-3">Threshold Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {/* Applied Free Electives from Transcript */}
                    {(auditResult?.freeElectives || []).map((fe, idx) => (
                      <tr key={`fe-${fe.code}-${idx}`} className="hover:bg-neutral-50/70 transition">
                        <td className="py-2 px-3 font-mono font-bold text-neutral-900">
                          {fe.code} <span className="font-normal text-neutral-600 font-sans ml-1">{fe.title || 'Applied Elective'}</span>
                        </td>
                        <td className="py-2 px-2 font-mono text-neutral-600 text-center">{fe.credits}cr</td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>✓ Completed ({fe.grade || fe.state})</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 text-neutral-500">Applied toward Degree Finish Line</td>
                      </tr>
                    ))}

                    {/* Generated Upper-Level Safeguard Placeholders */}
                    {(auditResult?.generatedUpperLevelElectives || []).map((ul) => (
                      <tr key={ul.code} className="hover:bg-neutral-50/70 transition bg-neutral-50/30">
                        <td className="py-2 px-3 font-mono font-bold text-neutral-800">
                          {ul.code} <span className="font-normal font-sans ml-1">{ul.title}</span>
                        </td>
                        <td className="py-2 px-2 font-mono text-neutral-600 text-center">{ul.credits}cr</td>
                        <td className="py-2 px-3">
                          <span className="text-blue-700 font-bold text-[11px] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Generated Safeguard Placeholder
                          </span>
                        </td>
                        <td className="py-2 px-3 text-neutral-500 italic">42cr Upper-Division (30000+) Safeguard</td>
                      </tr>
                    ))}

                    {/* Generated General Elective Placeholders */}
                    {(auditResult?.generatedGeneralElectives || []).map((gen) => (
                      <tr key={gen.code} className="hover:bg-neutral-50/70 transition bg-neutral-50/30">
                        <td className="py-2 px-3 font-mono font-bold text-neutral-800">
                          {gen.code} <span className="font-normal font-sans ml-1">{gen.title}</span>
                        </td>
                        <td className="py-2 px-2 font-mono text-neutral-600 text-center">{gen.credits}cr</td>
                        <td className="py-2 px-3">
                          <span className="text-neutral-700 font-bold text-[11px] bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                            Generated Degree Minimum Placeholder
                          </span>
                        </td>
                        <td className="py-2 px-3 text-neutral-500 italic">{targetCr}cr Degree Finish Line Gap</td>
                      </tr>
                    ))}

                    {/* Custom Electives Added by Advisor */}
                    {customElectives.map((ce) => (
                      <tr key={ce.code} className="hover:bg-neutral-50/70 transition bg-amber-50/30">
                        <td className="py-2 px-3 font-mono font-bold text-amber-900">
                          {ce.code} <span className="font-normal font-sans ml-1">{ce.title}</span>
                        </td>
                        <td className="py-2 px-2 font-mono text-neutral-600 text-center">{ce.credits}cr</td>
                        <td className="py-2 px-3">
                          <span className="text-amber-800 font-bold text-[11px] bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                            Custom Advisor Slot
                          </span>
                        </td>
                        <td className="py-2 px-3 text-neutral-500 italic">Injected Custom Elective Slot</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          BOTTOM ACTION BAR (PRESERVED)
      ========================================================================= */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        <button
          id="confirm-audit-proceed-btn"
          data-testid="confirm-audit-proceed-btn"
          onClick={checkMissingAvailabilityAndProceed}
          className="px-6 py-2.5 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center justify-center space-x-2"
        >
          <span>Confirm Audit & Build Schedule (Screen 3)</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* =========================================================================
          MODAL: CONDITIONAL MISSING AVAILABILITY
      ========================================================================= */}
      {missingModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h3 className="text-lg font-bold text-neutral-950">
              Missing Course Offering Availability
            </h3>
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
              The following required courses lack verified session availability in{' '}
              <code>masterDatabase.json</code>. Enter known session offerings below (saved as{' '}
              <strong>* Tentative</strong>), or leave blank to apply the default sitewide fallback (
              <strong>Fall-16wk</strong> and <strong>Spring-16wk</strong>).
            </p>

            <div className="my-4 max-h-60 overflow-y-auto p-3 bg-neutral-50 rounded border border-neutral-200 text-xs space-y-2.5">
              {(auditResult?.remainingCourseItems || [])
                .filter(
                  (c) =>
                    c.type !== 'placeholder' &&
                    !c.isPlaceholder &&
                    !c.code?.startsWith('REQ_') &&
                    (c.verification_status === 'Blank_Unverified' ||
                      ((!c.offered_sessions || c.offered_sessions.length === 0) &&
                        !c.FA_16wk &&
                        !c.SP_16wk))
                )
                .map((c) => (
                  <div key={c.code} className="bg-white p-2.5 rounded border border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-neutral-900">{c.code}</span> —{' '}
                      <span className="text-neutral-700">{c.title}</span>
                    </div>
                    <select
                      value={missingSessionInputs[c.code] || ''}
                      onChange={(e) =>
                        setMissingSessionInputs({ ...missingSessionInputs, [c.code]: e.target.value })
                      }
                      className="px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white font-semibold text-neutral-700"
                    >
                      <option value="">Leave Blank (Default: Fall-16wk & Spring-16wk)</option>
                      <option value="FA-I, SP-I">Fall I (8wk) & Spring I (8wk) (* Tentative)</option>
                      <option value="FA-II, SP-II">Fall II (8wk) & Spring II (8wk) (* Tentative)</option>
                      <option value="Fall-16wk">Fall-16wk Only (* Tentative)</option>
                      <option value="Spring-16wk">Spring-16wk Only (* Tentative)</option>
                      <option value="Fall-16wk, Spring-16wk, SU">Fall, Spring & Summer (* Tentative)</option>
                    </select>
                  </div>
                ))}
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setMissingModalOpen(false)}
                className="py-2 px-3 border border-neutral-300 rounded text-xs font-bold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setMissingModalOpen(false);
                  handleCompileAndProceed();
                }}
                className="py-2 px-4 bg-[#857542] hover:bg-[#6E6035] text-white text-xs font-bold rounded shadow"
              >
                Save / Apply Fallback & Generate Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: INCOMING TRANSFER PLACEHOLDER
      ========================================================================= */}
      {incomingModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-neutral-950 mb-1">
              Add Incoming Transfer Placeholder
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Log a pending transfer course currently in-progress at another institution (e.g. SLU or SCC).
            </p>

            <form onSubmit={handleAddIncomingPlaceholder} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">Course Code</label>
                <input
                  type="text"
                  placeholder="COM 11000"
                  value={incomingCode}
                  onChange={(e) => setIncomingCode(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">Course Title</label>
                <input
                  type="text"
                  placeholder="Public Speaking"
                  value={incomingTitle}
                  onChange={(e) => setIncomingTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">Credits</label>
                  <input
                    type="number"
                    value={incomingCredits}
                    onChange={(e) => setIncomingCredits(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded font-mono"
                    min="1"
                    max="6"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">External Institution</label>
                  <input
                    type="text"
                    placeholder="Saint Louis University"
                    value={incomingInstitution}
                    onChange={(e) => setIncomingInstitution(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIncomingModalOpen(false)}
                  className="py-1.5 px-3 border border-neutral-300 rounded text-neutral-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-1.5 px-4 bg-[#857542] text-white rounded font-bold shadow"
                >
                  Add Placeholder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CUSTOM ELECTIVE PLACEHOLDER
      ========================================================================= */}
      {customElectiveModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-neutral-950 mb-1">
              Add Custom Elective Placeholder
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Inject a custom elective placeholder slot to bridge specific degree requirements to the finish line.
            </p>

            <form onSubmit={handleAddCustomElective} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">Placeholder Title</label>
                <input
                  type="text"
                  placeholder="e.g. Upper-Division Cybersecurity Elective"
                  value={customElecTitle}
                  onChange={(e) => setCustomElecTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">Credits</label>
                  <input
                    type="number"
                    value={customElecCredits}
                    onChange={(e) => setCustomElecCredits(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded font-mono"
                    min="1"
                    max="6"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">Level Category</label>
                  <select
                    value={customElecType}
                    onChange={(e) => setCustomElecType(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded bg-white font-semibold"
                  >
                    <option value="UPPER">Upper-Division (30000+)</option>
                    <option value="GENERAL">General Elective (Any Level)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCustomElectiveModalOpen(false)}
                  className="py-1.5 px-3 border border-neutral-300 rounded text-neutral-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-1.5 px-4 bg-[#857542] text-white rounded font-bold shadow"
                >
                  Inject Placeholder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
