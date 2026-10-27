import React, { useState, useEffect } from 'react';
import { LogOut, Database, ChevronDown, ShieldCheck, Info, X, AlertTriangle } from 'lucide-react';

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

  // 5-Second Countdown Safety Guard for Clear Modal
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

  // Close modal on Escape key
  useEffect(() => {
    if (!clearModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setClearModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearModalOpen]);

  const initials = facultyProfile
    ? `${facultyProfile.first_name?.[0] || 'M'}${facultyProfile.last_name?.[0] || 'W'}`
    : 'DP';

  return (
    <>
      <header className="bg-black text-white h-16 border-b-[3px] border-[#B5A36A] flex items-center justify-between px-3 sm:px-6 select-none sticky top-0 z-50 shadow-md">
        {/* Left: Brand Home Navigation & Responsive FERPA Pill */}
        <div className="flex items-center space-x-2.5 sm:space-x-3.5 flex-shrink-0">
          {/* Brand Mark & Title (Clickable: returns to Screen 1) */}
          <div
            className="flex items-center space-x-2 sm:space-x-2.5 cursor-pointer select-none hover:opacity-90 transition-opacity"
            onClick={() => setCurrentScreen(1)}
            role="button"
            tabIndex={0}
            title="Degree Planner — Return to Student Intake"
          >
            <img
              src="./assets/logos/lu-icon.svg"
              alt="DP"
              className="h-8 w-8 flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <span className="font-sans font-extrabold text-white text-base tracking-tight leading-tight whitespace-nowrap">
              Degree Planner
            </span>
          </div>

          {/* FERPA Compliance Pill with Detailed Hover Popover */}
          <div
            className="hidden md:inline-flex relative items-center"
            onMouseEnter={() => setFerpaHovered(true)}
            onMouseLeave={() => setFerpaHovered(false)}
          >
            <div
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-neutral-900 border border-[#B5A36A]/40 hover:border-[#B5A36A] text-[#B5A36A] transition cursor-help text-[11px] font-medium select-none shadow-2xs whitespace-nowrap"
              role="button"
              tabIndex={0}
              aria-label="Built to Support FERPA-Compliant Advising"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#B5A36A] flex-shrink-0" />
              <span className="hidden xl:inline tracking-tight">Built to Support FERPA-Compliant Advising</span>
              <span className="text-neutral-500">•</span>
              <Info className="w-3 h-3 text-[#B5A36A]/80 flex-shrink-0" />
            </div>

            {/* Hover Popover Tooltip */}
            {ferpaHovered && (
              <div
                role="tooltip"
                className="absolute left-0 top-full mt-2 w-80 sm:w-88 bg-neutral-900 text-white border border-[#B5A36A] p-3.5 rounded-lg shadow-xl text-xs max-w-sm z-50 pointer-events-none"
              >
                <div className="flex items-start space-x-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#B5A36A] flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-white text-xs leading-snug">
                      Local processing protects student information
                    </h4>
                    <p className="text-neutral-300 text-[11px] leading-relaxed">
                      The application processes student information within your web browser. It does not transmit student names or other identifying information to our servers, and no student-identifying information is stored in the cloud.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Workflow Stepper, Active Record Pill, and Faculty Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-xs font-semibold flex-shrink-0">
          {/* Stepper: Condenses to 1, 2, 3 on screens < lg */}
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <button
              onClick={() => setCurrentScreen(1)}
              className={`px-2 sm:px-2.5 py-1.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                currentScreen === 1
                  ? 'bg-[#857542] text-white shadow-xs'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
              }`}
              title="Step 1: Student Intake"
            >
              <span className="font-bold">1.</span>
              <span className="hidden lg:inline">Student Intake</span>
            </button>

            <button
              onClick={() => setCurrentScreen(2)}
              className={`px-2 sm:px-2.5 py-1.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                currentScreen === 2
                  ? 'bg-[#857542] text-white shadow-xs'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
              }`}
              title="Step 2: Degree Audit"
            >
              <span className="font-bold">2.</span>
              <span className="hidden lg:inline">Degree Audit</span>
            </button>

            <button
              onClick={() => setCurrentScreen(3)}
              className={`px-2 sm:px-2.5 py-1.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                currentScreen === 3
                  ? 'bg-[#857542] text-white shadow-xs'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
              }`}
              title="Step 3: Degree Plan"
            >
              <span className="font-bold">3.</span>
              <span className="hidden lg:inline">Degree Plan</span>
            </button>
          </div>

          {/* Active Record Badge with [X] Clear Button */}
          {activeStudentName && (
            <div className="inline-flex items-center px-2 sm:px-2.5 py-1 rounded bg-neutral-900 border border-neutral-700 text-xs text-[#B5A36A] font-semibold whitespace-nowrap shadow-2xs flex-shrink-0">
              <span className="hidden sm:inline">Active Record:</span>
              <span className="text-white sm:ml-1 font-bold">
                {formatActiveStudentName(activeStudentName)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setClearModalOpen(true);
                }}
                className="hover:bg-red-500/20 text-neutral-300 hover:text-white rounded p-0.5 ml-1.5 transition flex-shrink-0 focus:outline-none"
                title="Clear Active Student Record"
                aria-label="Clear Active Student Record"
              >
                <X className="w-3.5 h-3.5 text-neutral-400 hover:text-red-400" />
              </button>
            </div>
          )}

          {/* Far Right: Faculty Profile Badge & Dropdown */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2 sm:space-x-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full pl-1.5 sm:pl-2 pr-2.5 sm:pr-3 py-1 transition focus:outline-none"
            >
              {facultyProfile?.photo_url ? (
                <img
                  src={facultyProfile.photo_url}
                  alt={facultyProfile.first_name}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-[#B5A36A] object-cover"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#857542] text-white font-bold flex items-center justify-center text-xs border-2 border-[#B5A36A]">
                  {initials}
                </div>
              )}

              <div className="text-left hidden lg:block">
                <div className="text-xs font-bold text-white leading-tight">
                  {facultyProfile?.first_name || 'Matthias'} {facultyProfile?.last_name || 'Wood'}
                </div>
                <div className="text-[10px] text-[#B5A36A] leading-tight">
                  {facultyProfile?.position_title?.split(',')[0] || 'Senior Instructor'}
                </div>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 z-50 text-neutral-900"
                onClick={() => setDropdownOpen(false)}
              >
                <div className="px-4 py-2.5 border-b border-neutral-100 bg-neutral-50">
                  <p className="text-xs font-bold text-neutral-900">
                    {facultyProfile?.first_name} {facultyProfile?.last_name}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-mono">{facultyProfile?.email}</p>
                  <p className="text-[10px] text-[#857542] mt-0.5">{facultyProfile?.department}</p>
                </div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenSharedDb?.();
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-[#F7F5EE] flex items-center space-x-2 text-neutral-700 hover:text-neutral-900"
                >
                  <Database className="w-4 h-4 text-[#857542]" />
                  <span>Inspect Master Curriculum Catalog</span>
                </button>

                <div className="border-t border-neutral-100 my-1"></div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onLogout?.();
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4 text-red-600" />
                  <span>Sign Out of Faculty Workspace</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

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
