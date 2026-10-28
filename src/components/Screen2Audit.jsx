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
  Calendar
} from 'lucide-react';
import {
  buildProgramAuditLedgers,
  auditGeneralEducationCategories,
  computeUpperDivisionGate,
  evaluateCompositionGatekeeper,
  resolveTrackConfiguration,
  orderDeclaredPrograms,
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
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'GE', 'MAJOR', 'EMPHASIS', 'ELECTIVE'
  const [showExcludedLedger, setShowExcludedLedger] = useState(true);
  const [missingModalOpen, setMissingModalOpen] = useState(false);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);

  // Incoming transfer placeholder form state
  const [incomingCode, setIncomingCode] = useState('');
  const [incomingTitle, setIncomingTitle] = useState('');
  const [incomingCredits, setIncomingCredits] = useState(3);
  const [incomingInstitution, setIncomingInstitution] = useState('');

  // Inline note editing state & local equivalence / session overrides
  const [editingNoteKey, setEditingNoteKey] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [rowNotes, setRowNotes] = useState({});
  const [rowOverrides, setRowOverrides] = useState({});
  const [missingSessionInputs, setMissingSessionInputs] = useState({});

  // Curricular Track Bifurcation (Option A vs Option B) local state
  const [activeTrackId, setActiveTrackId] = useState(
    auditResult?.activeTrackId || auditOptions?.activeTrackId || 'option_a'
  );

  // Multi-Program accordion expansion states (default expanded: true)
  const [expandedPrograms, setExpandedPrograms] = useState({});

  const toggleProgramAccordion = (progId) => {
    setExpandedPrograms((prev) => ({
      ...prev,
      [progId]: prev[progId] === undefined ? false : !prev[progId]
    }));
  };

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

  const studentCourseOptions = (auditResult?.normalizedHistory || []).filter(
    (c) => c.state === 'Complete' || c.state === 'Transfer' || c.state === 'Current' || c.state === 'Scheduled'
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

  const policy = auditResult?.policyChecklist || {};
  const total = policy.totalCredits || {};
  const upper = policy.upperLevelCredits || {};
  const res = policy.residency || {};
  const hd = policy.humanDiversity || {};
  const comp = policy.compositionGatekeeper || {};

  const completedCr = total.completed || 0;
  const enrolledCr = total.enrolled || 0;
  const earnedPlusEnrolled = total.EarnedPlusEnrolled || completedCr + enrolledCr;
  const targetCr = Math.max(120, total.projectedTotal || 120);

  // Percent coordinates for Race to the Graduation Flag
  const completedPct = Math.min(100, Math.max(0, (completedCr / targetCr) * 100));
  const enrolledPct = Math.min(100 - completedPct, Math.max(0, (enrolledCr / targetCr) * 100));

  // Check if any remaining course has blank availability
  const checkMissingAvailabilityAndProceed = () => {
    const blankCourses = (auditResult.remainingCourseItems || []).filter(
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
      onProceedToSchedule();
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
      incomingTransfers: [...(auditResult.incomingTransfers || []), newTransfer]
    });

    setIncomingCode('');
    setIncomingTitle('');
    setIncomingInstitution('');
    setIncomingModalOpen(false);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Page Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#857542] uppercase tracking-wider">
            Step 2: Deterministic Degree Audit & Policy Verification
          </span>
          <h1 className="text-3xl font-display font-extrabold text-neutral-900 tracking-tight">
            Curriculum Audit Ledger
          </h1>
          <p className="text-sm text-neutral-600">
            {auditResult.primaryProgram?.name} — Catalog Year {auditResult.primaryProgram?.catalog_year_id || '2026-2027'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToIntake}
            className="px-3.5 py-2 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition"
          >
            ← Back to Intake
          </button>
          <button
            onClick={checkMissingAvailabilityAndProceed}
            className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center space-x-2"
          >
            <span>Proceed to Optimal Degree Plan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Official Student Advising Record Banner */}
      {(auditResult?.studentMetadata?.name || parsedTranscript?.studentMetadata?.name || auditResult?.primaryProgram) && (() => {
        const student = parsedTranscript?.studentMetadata || auditResult?.studentMetadata || {};
        const effectiveConstraints = constraints || auditResult?.constraints || {};
        const max8 = effectiveConstraints.max8wkCredits !== undefined ? effectiveConstraints.max8wkCredits : (effectiveConstraints.pacingMode === 'Part-Time' ? 6 : 9);
        const max16 = effectiveConstraints.max16wkCredits !== undefined ? effectiveConstraints.max16wkCredits : (effectiveConstraints.pacingMode === 'Part-Time' ? 11 : 18);
        const pacingCapText = `${effectiveConstraints.pacingMode || 'Full-Time'} (Max ${max8}cr 8-wk / ${max16}cr 16-wk)`;
        const modalityText = effectiveConstraints.modalityPreference || 'No Preference (Flexible)';
        const isSummerEnabled = effectiveConstraints.summerAvailability && effectiveConstraints.summerAvailability !== 'No Summer' && Number(effectiveConstraints.maxSummerCredits) !== 0;
        const maxSummer = Number(effectiveConstraints.maxSummerCredits) || 6;
        const summerText = isSummerEnabled ? `Summer: Available (Max ${maxSummer}cr)` : 'Summer: Not Available';

        const advisorDisplayName = student.advisor || (facultyProfile ? `${facultyProfile.first_name || ''} ${facultyProfile.last_name || ''}`.trim() : 'Matthias Wood');
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
          <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              {/* Left Column (Student Identity & Academic Programs) */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Row 1 (Badges & Projections) */}
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  {/* Projected Graduation Date Badge (Pending State) */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FDFBF7] border border-[#B5A36A] text-xs font-bold text-neutral-900 shadow-2xs">
                    <span>🎓 Projected Graduation Date:</span>
                    <span className="font-mono text-neutral-700 italic">Pending</span>
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-1.5 py-0.2 rounded ml-1">
                      Calculated in Step 3
                    </span>
                  </div>
                  {/* Catalog Year Badge */}
                  <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#857542]/10 text-[#857542] border border-[#857542]/20 text-xs font-semibold font-mono">
                    Catalog Year: {catalogYearValue}
                  </div>
                </div>

                {/* Row 2 (Student Identity) */}
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
                      {student.name || 'Student'}
                    </h2>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono text-[11px] font-semibold">
                      ID: {student.studentId || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Row 3 (Degree Programs - Major & Minor) */}
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

                {/* Row 4 (Advising Metadata) */}
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
                  {(advisorDisplayName || advisorDisplayEmail || student.phone) && (
                    <span className="text-neutral-300">•</span>
                  )}
                  <span>
                    <strong className="text-neutral-700">Created On:</strong> {planCreationDate}
                  </span>
                </div>
              </div>

              {/* Right Column: Schedule Constraints Sub-Card */}
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
      {comp.warnings?.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-50 border-l-4 border-amber-500 text-amber-900 shadow-xs">
          <div className="flex items-center space-x-2 font-bold text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Composition Grade Gatekeeper Alert</span>
          </div>
          <div className="text-xs mt-1 space-y-1">
            {comp.warnings.map((w, idx) => (
              <p key={idx}>{w.message}</p>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          TOP CARD: Visual "Race to the Graduation Flag" & Policy Checklist
      ========================================================================= */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-base font-bold text-neutral-900">
            Race to the Graduation Flag (120+ Credits)
          </h2>
          <div className="text-xs font-semibold text-neutral-600 flex flex-wrap items-center gap-2">
            <span>
              Completed: <strong className="font-bold text-neutral-900 font-mono" data-testid="audit-completed-cr">{completedCr.toFixed(1)}</strong> cr
            </span>
            <span>|</span>
            <span>
              Current / Enrolled: <strong className="font-bold text-[#857542] font-mono" data-testid="audit-current-cr">{enrolledCr.toFixed(1)}</strong> cr
            </span>
            <span>|</span>
            <span>
              Total Earned + Current: <strong className="font-bold text-neutral-900 font-mono" data-testid="audit-total-cr">{earnedPlusEnrolled.toFixed(1)}</strong> cr
            </span>
            <span>|</span>
            <span>
              Remaining Required: <strong className="font-bold text-neutral-900 font-mono">{(total.remainingPlanned || 0).toFixed(1)}</strong> cr
            </span>
          </div>
        </div>

        {/* Visual Progress Track */}
        <div className="relative pt-8 pb-3">
          {/* Stick-Figure Avatar at Completed Coordinate */}
          <div
            className="absolute top-0 transform -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300"
            style={{ left: `${Math.max(4, Math.min(96, completedPct))}%` }}
          >
            <div className="bg-[#857542] text-white text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shadow">
              {completedCr.toFixed(1)} cr
            </div>
            {/* SVG Stick-Figure Student Avatar */}
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-neutral-900 mt-0.5 fill-current">
              <circle cx="12" cy="4" r="3" />
              <path d="M12 7v7M9 9l3 2 3-2M9 18l3-4 3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </div>

          {/* 15-degree sheared Graduation Flag at Target Mark (100%) */}
          <div className="absolute right-0 top-1 flex flex-col items-center">
            <div className="lu-shear bg-black text-[#B5A36A] font-bold text-[10px] px-2 py-0.5 shadow flex items-center space-x-1 border border-[#B5A36A]">
              <span className="lu-shear-content flex items-center space-x-1">
                <Flag className="w-3 h-3 text-[#B5A36A]" />
                <span>GRADUATION FLAG ({targetCr}+ CR)</span>
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
            {/* Enrolled Segment (Standard Gold #B5A36A striped) */}
            <div
              className="bg-[#B5A36A] h-full transition-all duration-500 relative"
              style={{
                width: `${enrolledPct}%`,
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.3) 5px, rgba(255,255,255,0.3) 10px)'
              }}
            />
          </div>

          {/* Milestone markers below track */}
          <div className="flex justify-between text-[10px] font-mono text-neutral-400 mt-1.5">
            <span>0 cr</span>
            <span>30 cr (Sophomore)</span>
            <span>60 cr (Junior)</span>
            <span>90 cr (Senior)</span>
            <span className="font-bold text-neutral-900">120+ cr (Conferral)</span>
          </div>
        </div>

        {/* Institutional 42 Upper-Division Meter Widget */}
        <div
          data-testid="upper-division-meter"
          className="mt-4 p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-neutral-900 text-xs">
              42 Upper-Division Hours: <strong className="font-mono text-neutral-950">{upperDivisionGate.completed}</strong> / 42 credits
            </span>
            {upperDivisionGate.isSatisfied ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ 42cr Upper-Division Satisfied
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                ⚠️ Deficient by {upperDivisionGate.remaining} cr
              </span>
            )}
          </div>
          <div className="w-full h-2.5 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                upperDivisionGate.isSatisfied ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, (upperDivisionGate.completed / 42) * 100))}%`
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-neutral-500">
            <span>0 cr</span>
            <span>{upperDivisionGate.completed} cr completed (30000+ level)</span>
            <span>42 cr Required</span>
          </div>
        </div>

        {/* Structured Policy Checklist Grid */}
        <div className="mt-4 pt-4 border-t border-neutral-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Row 1: Total Credits */}
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-neutral-900">Total Program Credits:</span>{' '}
              <span className="font-mono">{completedCr.toFixed(1)} Completed + {enrolledCr.toFixed(1)} Current = {earnedPlusEnrolled.toFixed(1)} Total</span>{' '}
              (+ <span className="font-mono">{(total.remainingPlanned || 0).toFixed(1)} Planned</span> ={' '}
              <strong className="font-mono text-neutral-950">{(total.projectedTotal || 120).toFixed(1)} / 120+ Target</strong>)
              {total.transferCredits > 0 && (
                <span className="ml-2 bg-[#F7F5EE] text-[#857542] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#B5A36A]">
                  {total.transferCredits.toFixed(1)} Transfer Credits (UNIV/LUL Waived)
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Upper-Level (30000+) Credits */}
          <div className="flex items-start space-x-2">
            <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${upperDivisionGate.isSatisfied ? 'text-emerald-600' : 'text-amber-500'}`} />
            <div>
              <span className="font-bold text-neutral-900">42 Upper-Division Hours:</span>{' '}
              <span className="font-mono">{upperDivisionGate.completed} / 42 credits</span>
              {!upperDivisionGate.isSatisfied && (
                <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  ⚠️ Deficient by {upperDivisionGate.remaining} cr
                </span>
              )}
            </div>
          </div>

          {/* Row 3: Residency */}
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-neutral-900">Lindenwood Institutional Residency:</span>{' '}
              <span className="font-mono">{res.projectedInstitutionalCredits ?? res.projectedLindenwoodCredits ?? 30} / 30cr Required</span> | Final Residency (24 of last 30cr): <strong>YES (24cr Met)</strong>
            </div>
          </div>

          {/* Row 4: Human Diversity & Composition */}
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-neutral-900">Human Diversity (/HD):</span>{' '}
              <span className="font-mono">{hd.completedOrEnrolledCount} completed</span>
              {hd.remainingTaggedInGE > 0 && ` + ${hd.remainingTaggedInGE} tagged in GE`}{' '}
              (6 Credits / 2 Courses Met) | Composition C-or-Higher Check:{' '}
              <strong className={comp.satisfied ? 'text-emerald-700' : 'text-amber-700'}>
                {comp.satisfied ? 'PASSED' : 'C-GRADE DEFICIT'}
              </strong>
            </div>
          </div>
        </div>

        {/* Row 5: Dedicated Excluded Courses Ledger */}
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div
            className="flex items-center justify-between text-xs font-bold text-neutral-700 cursor-pointer select-none"
            onClick={() => setShowExcludedLedger(!showExcludedLedger)}
          >
            <div className="flex items-center space-x-1.5 text-neutral-800">
              <ShieldAlert className="w-4 h-4 text-neutral-500" />
              <span>Excluded Courses Ledger ({auditResult.excludedCourses?.length || 0} Excluded Attempts: F, W, AF, Repeats, Sub-10000)</span>
            </div>
            {showExcludedLedger ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>

          {showExcludedLedger && (
            <div className="mt-2 text-xs bg-neutral-50 rounded border border-neutral-200 overflow-x-auto">
              {auditResult.excludedCourses?.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-600 border-b border-neutral-200 text-[11px]">
                      <th className="py-1 px-3">Course Code</th>
                      <th className="py-1 px-3">Title</th>
                      <th className="py-1 px-2">Grade</th>
                      <th className="py-1 px-3">Exclusion Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditResult.excludedCourses.map((c, i) => (
                      <tr key={i} className="border-b border-neutral-100 text-neutral-700 hover:bg-neutral-100/50">
                        <td className="py-1 px-3 font-mono font-bold">{c.code}</td>
                        <td className="py-1 px-3 truncate max-w-[200px]">{c.title || 'Course'}</td>
                        <td className="py-1 px-2 font-mono font-bold text-neutral-900">{c.grade || '—'}</td>
                        <td className="py-1 px-3 text-neutral-500 italic">{c.reason || 'Excluded'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-3 text-neutral-500 text-xs italic">
                  No courses excluded. All student records met passing and degree eligibility standards.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          MULTI-PROGRAM AUDIT ACCORDIONS
      ========================================================================= */}
      <div className="space-y-4" data-testid="multi-program-accordions">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
              Multi-Program Audit Ledgers
            </h2>
            <p className="text-xs text-neutral-500">
              Deterministic credential progression with global cross-counting registry
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200 self-start sm:self-auto">
            {programLedgers.length} Credential{programLedgers.length > 1 ? 's' : ''} Declared
          </span>
        </div>

        {programLedgers.map((ledger) => {
          const isExpanded = expandedPrograms[ledger.programId] !== false;
          const roleBadge = (() => {
            if (ledger.role === 'Primary Major') {
              return { label: '🎓 Primary Major', color: 'bg-amber-100 text-amber-900 border-amber-300' };
            }
            if (ledger.role === 'Secondary Major') {
              return { label: '🎓 Secondary Major', color: 'bg-sky-100 text-sky-900 border-sky-300' };
            }
            if (ledger.category === 'Minor' || ledger.role === 'Minor') {
              return { label: '📘 Minor', color: 'bg-blue-100 text-blue-900 border-blue-300' };
            }
            if (ledger.category === 'Certificate' || ledger.role === 'Certificate') {
              return { label: '📜 Certificate', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
            }
            return { label: `🎓 ${ledger.role}`, color: 'bg-amber-100 text-amber-900 border-amber-300' };
          })();

          const progTracks = ledger.track?.hasTracks ? ledger.track : null;

          return (
            <div
              key={ledger.programId}
              data-testid={`program-accordion-${ledger.programId}`}
              className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
            >
              {/* Accordion Header */}
              <div
                onClick={() => toggleProgramAccordion(ledger.programId)}
                className="px-6 py-4 bg-neutral-50/80 hover:bg-neutral-100/70 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
              >
                <div className="flex items-center space-x-3">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold border ${roleBadge.color}`}>
                    {roleBadge.label}
                  </span>
                  <h3 className="text-base font-bold text-neutral-900">{ledger.name}</h3>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-mono font-semibold text-neutral-700">
                    <strong className="text-neutral-900">{ledger.satisfiedCredits}</strong> / {ledger.requiredCredits} cr
                  </span>
                  {ledger.crossCountedCredits > 0 && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      {ledger.crossCountedCredits} cr shared
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-500" />
                  )}
                </div>
              </div>

              {/* Accordion Body */}
              {isExpanded && (
                <div className="p-6 space-y-5">
                  {/* Curricular Track Bifurcation Pills (Data Science BS) */}
                  {progTracks && (
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                          Curricular Track Option
                        </span>
                        <span className="text-[11px] font-mono text-neutral-500">
                          {activeTrackId === 'option_a' ? 'Option A: 9cr Group 1 + 18cr Group 2 = 27cr' : 'Option B: 15cr Group 1 + 15cr Group 2 = 30cr'}
                        </span>
                      </div>
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
                  )}

                  {/* Elective Pools Progress Bars */}
                  {(ledger.electivePools || []).length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                        Program Elective Pools
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {ledger.electivePools.map((pool) => {
                          const pct = Math.min(100, Math.max(0, (pool.creditsApplied / pool.creditsRequired) * 100));
                          const isMet = pool.creditsApplied >= pool.creditsRequired;
                          return (
                            <div
                              key={pool.poolId}
                              data-testid={`elective-pool-${pool.poolId}`}
                              className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-1.5"
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
                                <span>
                                  {isMet ? '✓ Requirement Met' : `${pool.remainingCredits} cr remaining`}
                                </span>
                                {pool.appliedCourses?.length > 0 && (
                                  <span className="font-mono text-neutral-700">
                                    Applied: {pool.appliedCourses.join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Program Requirements Table */}
                  <div className="overflow-x-auto">
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
                            <td className="py-2 px-3">
                              {req.satisfied ? (
                                <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{req.grade ? `Completed (${req.grade})` : 'Satisfied'}</span>
                                </span>
                              ) : (
                                <span className="text-amber-700 font-bold text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  Remaining Required
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {req.isCrossCounted && (
                                <span
                                  data-testid={`cross-counted-${req.compactCode}`}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200"
                                >
                                  [Shared with {req.sharedWithProgramName || 'Declared Program'}]
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
          );
        })}
      </div>

      {/* =========================================================================
          MIDDLE CARD: Requirement Matching & Advisor Override Controls
      ========================================================================= */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        {/* Filter Tabs & Incoming Transfer Button */}
        <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-1">
            {['ALL', 'GE', 'MAJOR', 'EMPHASIS', 'ELECTIVE'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  activeTab === tab
                    ? 'bg-[#857542] text-white'
                    : 'text-neutral-600 hover:bg-neutral-200/60'
                }`}
              >
                {tab === 'ALL'
                  ? 'All Requirements'
                  : tab === 'GE'
                  ? 'General Education (42cr)'
                  : tab === 'MAJOR'
                  ? 'Major Core'
                  : tab === 'EMPHASIS'
                  ? 'Emphasis'
                  : 'Electives'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIncomingModalOpen(true)}
            className="px-3 py-1.5 bg-white border border-[#B5A36A] hover:bg-[#F7F5EE] text-[#857542] font-bold text-xs rounded flex items-center space-x-1.5 shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>[+ Add Incoming Transfer Placeholder]</span>
          </button>
        </div>

        {/* Missouri CORE 42 / AA Transfer Block Banner */}
        {core42Completed && (
          <div
            data-testid="core42-transfer-banner"
            className="p-3.5 mx-6 mt-4 rounded-lg bg-emerald-50 border-l-4 border-emerald-500 text-emerald-900 shadow-2xs flex items-center justify-between text-xs font-bold"
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>✓ Missouri CORE 42 / AA Transfer Block Active — 42 Lower-Division GE Credits Cleared</span>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
              42 / 42 cr Met
            </span>
          </div>
        )}

        {/* 8 Missouri CORE 42 / General Education Categories */}
        {(activeTab === 'ALL' || activeTab === 'GE') && (
          <div className="px-6 py-4 border-b border-neutral-200 space-y-3" data-testid="ge-categories-section">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                General Education Distribution (42 Credits)
              </h3>
              <span className="text-xs font-mono font-semibold text-neutral-600">
                {geAudit.earnedCredits} / {geAudit.totalRequired} cr Satisfied
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {geAudit.categories.map((cat) => {
                const isCatSatisfied = cat.satisfied;
                const isWritten = cat.id === 'written_communication';
                const hasCompWarning = isWritten && (compositionGatekeeper.hasWarning || comp.warnings?.length > 0);

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

                    {core42Completed ? (
                      <div className="flex items-center space-x-1 text-emerald-700 font-semibold text-[11px] pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>Cleared via CORE 42 Transfer Block</span>
                      </div>
                    ) : isCatSatisfied ? (
                      <div className="flex items-center space-x-1 text-emerald-700 font-semibold text-[11px] pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>Distribution requirement met</span>
                      </div>
                    ) : (
                      <div className="text-amber-800 font-semibold text-[11px] pt-1">
                        {cat.remainingCredits} cr remaining
                      </div>
                    )}

                    {/* Composition Gatekeeper Alert on Written Communication block */}
                    {hasCompWarning && (
                      <div
                        data-testid="composition-gatekeeper-alert"
                        className="mt-1.5 p-2 rounded bg-amber-100 border border-amber-400 text-amber-950 text-[10.5px] leading-snug font-bold"
                      >
                        Grade of C or higher required to satisfy Composition GE. Course eligible for retake.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Requirements Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Requirement / Bucket</th>
                <th className="py-2.5 px-3">Cr</th>
                <th className="py-2.5 px-4">Status & Matched Course</th>
                <th className="py-2.5 px-4">Equivalence Override / PE Dropdown</th>
                <th className="py-2.5 px-4 text-right">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {/* GE Buckets */}
              {(activeTab === 'ALL' || activeTab === 'GE') &&
                auditResult.geBuckets?.map((b) => {
                  const reqKey = `GE:${b.bucket_id}`;
                  const activeOverride = rowOverrides[reqKey] || '';
                  const activeNote = rowNotes[reqKey] || '';
                  return (
                    <tr key={b.bucket_id} className="hover:bg-neutral-50/70 transition">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                          General Education
                        </span>
                      </td>
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
                        ) : b.fulfilled || activeOverride ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {activeOverride
                                ? activeOverride
                                : b.matchedCourse
                                ? `${b.matchedCourse.code} (${b.matchedCourse.grade || b.matchedCourse.state})`
                                : 'Waived'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Remaining Unfulfilled
                          </span>
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
                              placeholder="Requirement note..."
                              className="px-2 py-0.5 text-[11px] border border-[#857542] rounded w-32"
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

              {/* Major Core Requirements */}
              {(activeTab === 'ALL' || activeTab === 'MAJOR') &&
                auditResult.majorRequirements?.map((r) => {
                  const reqKey = `MAJOR:${r.code}`;
                  const activeOverride = rowOverrides[reqKey] || '';
                  const activeNote = rowNotes[reqKey] || r.note || '';
                  return (
                    <tr key={r.code} className="hover:bg-neutral-50/70 transition">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                          Major Core
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-bold text-neutral-900">{r.code}</span> —{' '}
                        <span className="text-neutral-700">{r.title}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">{r.credits}cr</td>
                      <td className="py-2.5 px-4">
                        {r.fulfilled || activeOverride ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {activeOverride
                                ? activeOverride
                                : r.matchedCourse
                                ? `${r.matchedCourse.code} (${r.matchedCourse.grade || r.matchedCourse.state})`
                                : 'Waived'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Remaining Required
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600">
                        <select
                          aria-label={`Equivalence override for ${r.code}`}
                          value={activeOverride}
                          onChange={(e) => handleOverrideChange(reqKey, e.target.value)}
                          className="px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white text-neutral-800 font-medium max-w-[230px]"
                        >
                          <option value="">
                            {r.matchedCourse
                              ? `Matched: ${r.matchedCourse.code}`
                              : 'Standard Catalog Rule'}
                          </option>
                          <option value="PE: Waived via Policy Exception">
                            Policy Exception (PE) — Waive Requirement
                          </option>
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
                      <td className="py-2.5 px-4 text-right">
                        {editingNoteKey === reqKey ? (
                          <div className="inline-flex items-center space-x-1">
                            <input
                              type="text"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Requirement note..."
                              className="px-2 py-0.5 text-[11px] border border-[#857542] rounded w-32"
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

              {/* Emphasis Requirements */}
              {(activeTab === 'ALL' || activeTab === 'EMPHASIS') &&
                auditResult.emphasisRequirements?.map((r) => {
                  const reqKey = `EMPHASIS:${r.code}`;
                  const activeOverride = rowOverrides[reqKey] || '';
                  const activeNote = rowNotes[reqKey] || r.note || '';
                  return (
                    <tr key={r.code} className="hover:bg-neutral-50/70 transition">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                          Emphasis
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-bold text-neutral-900">{r.code}</span> —{' '}
                        <span className="text-neutral-700">{r.title}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">{r.credits}cr</td>
                      <td className="py-2.5 px-4">
                        {r.fulfilled || activeOverride ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {activeOverride
                                ? activeOverride
                                : r.matchedCourse
                                ? `${r.matchedCourse.code} (${r.matchedCourse.grade || r.matchedCourse.state})`
                                : 'Waived'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Remaining Required
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600">
                        <select
                          aria-label={`Equivalence override for ${r.code}`}
                          value={activeOverride}
                          onChange={(e) => handleOverrideChange(reqKey, e.target.value)}
                          className="px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white text-neutral-800 font-medium max-w-[230px]"
                        >
                          <option value="">
                            {r.matchedCourse
                              ? `Matched: ${r.matchedCourse.code}`
                              : 'Standard Catalog Rule'}
                          </option>
                          <option value="PE: Waived via Policy Exception">
                            Policy Exception (PE) — Waive Requirement
                          </option>
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
                      <td className="py-2.5 px-4 text-right">
                        {editingNoteKey === reqKey ? (
                          <div className="inline-flex items-center space-x-1">
                            <input
                              type="text"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Requirement note..."
                              className="px-2 py-0.5 text-[11px] border border-[#857542] rounded w-32"
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

              {/* Free Electives & Generated Placeholders */}
              {(activeTab === 'ALL' || activeTab === 'ELECTIVE') && (
                <>
                  {hasFlexibleElectives && (
                    <tr className="bg-neutral-50/90 border-b border-neutral-200">
                      <td colSpan="6" className="p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                            Curricular Track Bifurcation:
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectTrack('option_a')}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border cursor-pointer ${
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
                              onClick={() => handleSelectTrack('option_b')}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border cursor-pointer ${
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
                      </td>
                    </tr>
                  )}
                  {auditResult.freeElectives?.map((fe, idx) => {
                    const reqKey = `ELECTIVE:${fe.code}:${fe.grade || ''}:${idx}`;
                    const activeNote = rowNotes[reqKey] || '';
                    return (
                      <tr key={`fe-${fe.code}-${fe.grade || ''}-${idx}`} className="hover:bg-neutral-50/70 transition">
                        <td className="py-2.5 px-4">
                          <span className="font-bold text-[10px] bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded">
                            Electives
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="font-mono font-bold text-neutral-900">{fe.code}</span> —{' '}
                          <span className="text-neutral-700">{fe.title || 'Applied Elective'}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-600">{fe.credits}cr</td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{fe.code} ({fe.grade || fe.state})</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-neutral-500 text-[11px]">
                          Counted toward 120cr Total
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {editingNoteKey === reqKey ? (
                            <div className="inline-flex items-center space-x-1">
                              <input
                                type="text"
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                placeholder="Elective note..."
                                className="px-2 py-0.5 text-[11px] border border-[#857542] rounded w-32"
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

                  {auditResult.generatedUpperLevelElectives?.map((ul) => (
                    <tr key={ul.code} className="hover:bg-neutral-50/70 transition bg-neutral-50/30">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-[10px] bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded">
                          Electives
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-neutral-800">
                        {ul.title} (30000+ Minimum Safeguard)
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">{ul.credits}cr</td>
                      <td className="py-2.5 px-4">
                        <span className="text-blue-700 font-bold text-[11px]">
                          Generated Placeholder (Safeguard)
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-400 italic">Upper-Level 42cr Requirement</td>
                      <td className="py-2.5 px-4 text-right text-neutral-400">—</td>
                    </tr>
                  ))}

                  {auditResult.generatedGeneralElectives?.map((gen) => (
                    <tr key={gen.code} className="hover:bg-neutral-50/70 transition bg-neutral-50/30">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-[10px] bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded">
                          Electives
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-neutral-800">
                        General Elective (120-Credit Graduation Threshold)
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">{gen.credits}cr</td>
                      <td className="py-2.5 px-4">
                        <span className="text-blue-700 font-bold text-[11px]">
                          Generated Placeholder (Safeguard)
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-400 italic">120cr Degree Minimum</td>
                      <td className="py-2.5 px-4 text-right text-neutral-400">—</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        <button
          onClick={checkMissingAvailabilityAndProceed}
          className="px-6 py-2.5 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center justify-center space-x-2"
        >
          <span>Proceed to Optimal Degree Plan</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* =========================================================================
          CONDITIONAL MISSING AVAILABILITY MODAL
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
              {(auditResult.remainingCourseItems || [])
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
                  onProceedToSchedule();
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
          INCOMING TRANSFER PLACEHOLDER MODAL
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
    </div>
  );
}
