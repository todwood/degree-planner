import React, { useState, useEffect, useRef } from 'react';
import { LogOut, Database, User, BookOpen, ShieldCheck, Info, X, AlertTriangle } from 'lucide-react';

/**
 * Deterministic Name Parser for Active Record Badge:
 * - Anonymous Token: If the name matches "Student ####", render as-is without altering.
 * - "Last, First Middle" or "Last, First": extract first name and last initial: "Brandon P."
 * - "First Middle Last" or "First Last": extract first name and last initial: "Brandon P."
 * - Length Guard: Truncate resulting string to a maximum of 15 characters (append "…" if exceeded).
 */
export function formatActiveStudentName(rawName) {
  if (!rawName) return '';
  const str = String(rawName).trim();
  if (!str) return '';

  let formatted = str;

  // 1. Anonymous Token: e.g. "Student 4821"
  if (/^Student\s+\d+/i.test(str)) {
    formatted = str;
  }
  // 2. "Last, First Middle" or "Last, First": e.g. "Paz, Brandon A" or "Paz, Brandon"
  else if (str.includes(',')) {
    const [lastPart, firstPart] = str.split(',').map((s) => s.trim());
    const firstTokens = (firstPart || '').split(/\s+/).filter(Boolean);
    const firstName = firstTokens[0] || '';
    const lastInitial = lastPart?.[0] ? `${lastPart[0].toUpperCase()}.` : '';
    formatted = [firstName, lastInitial].filter(Boolean).join(' ');
  }
  // 3. "First Middle Last" or "First Last": e.g. "Brandon A Paz" or "Brandon Paz"
  else {
    const tokens = str.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      const firstName = tokens[0];
      const lastToken = tokens[tokens.length - 1];
      const lastInitial = lastToken?.[0] ? `${lastToken[0].toUpperCase()}.` : '';
      formatted = [firstName, lastInitial].filter(Boolean).join(' ');
    } else {
      formatted = tokens[0] || str;
    }
  }

  // 4. Length Guard: Truncate to a maximum of 15 characters (append an ellipsis … if exceeded)
  if (formatted.length > 15) {
    formatted = `${formatted.slice(0, 15)}…`;
  }

  return formatted;
}

export default function HeaderNav({
  facultyProfile,
  onLogout,
  currentScreen,
  setCurrentScreen,
  onOpenSharedDb,
  activeStudentName,
  onClearActiveRecord
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [ferpaHovered, setFerpaHovered] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);

  // 3-Second Sign-Out Confirmation Modal State
  const [signOutModalOpen, setSignOutModalOpen] = useState(false);
  const [signOutCountdown, setSignOutCountdown] = useState(3);

  const popoverRef = useRef(null);
  const avatarBtnRef = useRef(null);

  // 3-Second Countdown Safety Guard for Sign Out Modal
  useEffect(() => {
    let intervalId;
    if (signOutModalOpen) {
      setSignOutCountdown(3);
      intervalId = setInterval(() => {
        setSignOutCountdown((prev) => {
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
  }, [signOutModalOpen]);

  // Click-outside listener for Profile Popover
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        avatarBtnRef.current &&
        !avatarBtnRef.current.contains(event.target)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  // 5-Second Countdown Safety Guard for Clear Student Record Modal
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

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (signOutModalOpen) setSignOutModalOpen(false);
        if (clearModalOpen) setClearModalOpen(false);
        if (dropdownOpen) setDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [signOutModalOpen, clearModalOpen, dropdownOpen]);

  const displayAdvisorName =
    facultyProfile?.advisorName ||
    (facultyProfile?.first_name && facultyProfile?.last_name
      ? `${facultyProfile.first_name} ${facultyProfile.last_name}`
      : 'Prof Wood');

  const displayAdvisorEmail =
    facultyProfile?.advisorEmail ||
    facultyProfile?.email ||
    'mwood@lindenwood.edu';

  return (
    <>
      <header className="bg-black text-white h-16 border-b-[3px] border-[#B5A36A] flex items-center justify-between px-3 sm:px-6 select-none sticky top-0 z-50 shadow-md">
        {/* Left: Brand Home Navigation & Responsive FERPA Pill */}
        <div className="flex items-center space-x-2.5 sm:space-x-3.5 flex-shrink-0">
          <div
            onClick={() => setCurrentScreen?.(1)}
            className="flex items-center space-x-2.5 cursor-pointer group"
            title="Return to Student Intake (Screen 1)"
          >
            <img
              src="./assets/logos/lu-primary-reversed.svg"
              alt="Lindenwood University"
              className="h-8 sm:h-9 w-auto transition-transform group-hover:scale-105"
            />
            <span className="font-display font-extrabold text-white tracking-tight text-sm sm:text-base hidden md:inline">
              Degree Planner
            </span>
          </div>

          {/* FERPA Compliance Pill */}
          <div className="relative">
            <div
              onMouseEnter={() => setFerpaHovered(true)}
              onMouseLeave={() => setFerpaHovered(false)}
              className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-neutral-900 border border-[#B5A36A]/50 text-neutral-300 text-[10px] sm:text-xs cursor-help transition hover:border-[#B5A36A] hover:text-white"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#B5A36A] flex-shrink-0" />
              <span className="font-semibold hidden lg:inline">Built to Support FERPA-Compliant Advising</span>
              <span className="font-semibold lg:hidden">FERPA Compliant</span>
              <Info className="w-3 h-3 text-neutral-400" />
            </div>

            {/* Hover Tooltip */}
            {ferpaHovered && (
              <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 p-3 bg-neutral-900 border border-[#B5A36A] text-white text-[11px] rounded-lg shadow-2xl z-50 pointer-events-none animate-in fade-in duration-150">
                <p className="font-bold text-[#B5A36A] mb-1">Zero-Cloud Student Data Invariant</p>
                <p className="text-neutral-300 leading-relaxed">
                  Student transcripts, grades, and degree audits are parsed and stored strictly inside your browser memory. No student PII leaves this device.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Center: Stepper (1. Student Intake -> 2. Degree Audit -> 3. Degree Plan) */}
        <nav className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm font-semibold">
          {/* Step 1 */}
          <button
            onClick={() => setCurrentScreen(1)}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-md transition flex items-center space-x-1.5 cursor-pointer ${
              currentScreen === 1
                ? 'bg-[#857542] text-white font-bold shadow'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-bold">1</span>
            <span className="hidden sm:inline">Student Intake</span>
            <span className="sm:hidden">Intake</span>
          </button>

          <span className="text-neutral-600 text-xs">•</span>

          {/* Step 2 */}
          <button
            onClick={() => setCurrentScreen(2)}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-md transition flex items-center space-x-1.5 cursor-pointer ${
              currentScreen === 2
                ? 'bg-[#857542] text-white font-bold shadow'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-bold">2</span>
            <span className="hidden sm:inline">Degree Audit</span>
            <span className="sm:hidden">Audit</span>
          </button>

          <span className="text-neutral-600 text-xs">•</span>

          {/* Step 3 */}
          <button
            onClick={() => setCurrentScreen(3)}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-md transition flex items-center space-x-1.5 cursor-pointer ${
              currentScreen === 3
                ? 'bg-[#857542] text-white font-bold shadow'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-bold">3</span>
            <span className="hidden sm:inline">Degree Plan</span>
            <span className="sm:hidden">Plan</span>
          </button>
        </nav>

        {/* Right Section: Active Student Pill + Profile Avatar Icon Button */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 flex-shrink-0">
          {/* Active Record Badge (When student is loaded) */}
          {activeStudentName && (
            <div
              id="active-student-badge"
              data-testid="active-student-badge"
              className="flex items-center bg-neutral-900 border border-neutral-700/80 rounded-full pl-2.5 pr-1.5 py-0.5 text-xs text-neutral-200 shadow-2xs max-w-[140px] sm:max-w-[200px]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse flex-shrink-0" />
              <span
                className="font-medium truncate text-[11px] sm:text-xs"
                title={`Active Student: ${activeStudentName}`}
              >
                {formatActiveStudentName(activeStudentName)}
              </span>
              <button
                type="button"
                id="header-clear-student-btn"
                data-testid="header-clear-student-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setClearModalOpen(true);
                }}
                className="hover:bg-red-500/20 text-neutral-300 hover:text-white rounded p-0.5 ml-1.5 transition flex-shrink-0 focus:outline-none cursor-pointer"
                title="Clear Active Student Record"
                aria-label="Clear Active Student Record"
              >
                <X className="w-3.5 h-3.5 text-neutral-400 hover:text-red-400" />
              </button>
            </div>
          )}

          {/* Far Right: Clean Profile Avatar Icon Button & Floating Popover */}
          <div className="relative flex-shrink-0">
            <button
              ref={avatarBtnRef}
              id="profile-avatar-btn"
              data-testid="profile-avatar-btn"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
              aria-label="Advisor Profile Menu"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#857542] hover:bg-[#6E6035] border-2 border-[#B5A36A] flex items-center justify-center text-white transition focus:outline-none focus:ring-2 focus:ring-[#B5A36A]/50 shadow-xs cursor-pointer"
              title="Advisor Workspace Profile & Settings"
            >
              <User className="w-4 h-4 text-white" />
            </button>

            {/* Floating Popover Menu Docked Below Avatar */}
            {dropdownOpen && (
              <div
                ref={popoverRef}
                id="profile-popover-menu"
                data-testid="profile-popover-menu"
                role="menu"
                aria-label="Advisor Account"
                className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-[#B5A36A]/40 overflow-hidden z-50 text-neutral-900 animate-in fade-in zoom-in-95 duration-100"
              >
                {/* Header Section */}
                <div className="px-4 py-3 bg-[#F7F5EE]/70 border-b border-neutral-100">
                  <p className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                    Advisor Workspace
                  </p>
                  <p className="text-sm font-bold text-neutral-900 mt-0.5">
                    {displayAdvisorName}
                  </p>
                  <p className="text-xs text-neutral-500 font-mono mt-0.5">
                    {displayAdvisorEmail}
                  </p>
                </div>

                {/* Action Item 1: Master Curriculum Catalog */}
                <div className="p-1.5">
                  <button
                    type="button"
                    id="view-catalog-action-btn"
                    data-testid="view-catalog-action-btn"
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenSharedDb?.();
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#F7F5EE] transition flex items-start gap-2.5 group cursor-pointer"
                  >
                    <div className="p-1.5 rounded-md bg-[#857542]/10 text-[#857542] group-hover:bg-[#857542]/20 transition flex-shrink-0 mt-0.5">
                      <BookOpen className="w-4 h-4 text-[#857542]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-neutral-900 leading-snug">
                        View List of all Current Courses
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        Inspect Master Curriculum Catalog
                      </div>
                    </div>
                  </button>
                </div>

                {/* Divider Line */}
                <div className="border-t border-neutral-100 mx-2" />

                {/* Action Item 2: Sign Out */}
                <div className="p-1.5">
                  <button
                    type="button"
                    id="sign-out-action-btn"
                    data-testid="sign-out-action-btn"
                    onClick={() => {
                      setDropdownOpen(false);
                      setSignOutModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 hover:text-red-700 transition flex items-center gap-2 group cursor-pointer text-xs font-semibold"
                  >
                    <LogOut className="w-4 h-4 text-red-500 group-hover:text-red-700 transition" />
                    <span>Sign Out of Degree Planner</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 3-Second Sign-Out Confirmation Modal */}
      {signOutModalOpen && (
        <div
          id="signout-modal"
          data-testid="signout-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
          onClick={() => setSignOutModalOpen(false)}
        >
          <div
            className="bg-white border border-[#B5A36A]/60 rounded-xl max-w-md w-full p-6 text-neutral-900 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 flex-shrink-0">
                <LogOut className="w-5 h-5 text-red-600" />
              </div>
              <div className="space-y-1">
                <h3 id="signout-dialog-title" className="text-base font-bold text-neutral-900 tracking-tight">
                  Confirm Sign Out
                </h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Are you sure you want to sign out of the Degree Planner? Any unsaved changes in the active student session will be reset.
                </p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end space-x-3 border-t border-neutral-100">
              <button
                type="button"
                id="cancel-signout-btn"
                data-testid="cancel-signout-btn"
                onClick={() => setSignOutModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                id="confirm-signout-btn"
                data-testid="confirm-signout-btn"
                disabled={signOutCountdown > 0}
                onClick={() => {
                  setSignOutModalOpen(false);
                  onLogout?.();
                }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition flex items-center space-x-1.5 ${
                  signOutCountdown > 0
                    ? 'bg-neutral-200 text-neutral-400 border border-neutral-300 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md cursor-pointer'
                }`}
              >
                <span>
                  {signOutCountdown > 0
                    ? `Confirm Sign Out (${signOutCountdown}s)`
                    : 'Confirm Sign Out'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Record Clear Confirmation Modal with 5-Second Countdown */}
      {clearModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-active-record-title"
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
                  id="clear-active-record-title"
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
                onClick={() => setClearModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={countdown > 0}
                onClick={() => {
                  setClearModalOpen(false);
                  onClearActiveRecord?.();
                }}
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
    </>
  );
}
