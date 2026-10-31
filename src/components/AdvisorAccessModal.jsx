import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import {
  validatePassphrase,
  isDeviceAuthorized,
  getSavedAdvisorPersona,
  saveAdvisorSession,
  MASKED_PASSPHRASE
} from '../utils/authHelpers.js';

export default function AdvisorAccessModal({ onLoginSuccess }) {
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [advisorName, setAdvisorName] = useState('');
  const [advisorUsername, setAdvisorUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState(0);

  // Initialize from localStorage
  useEffect(() => {
    const isAuth = isDeviceAuthorized();
    setDeviceAuthorized(isAuth);
    const persona = getSavedAdvisorPersona();
    setAdvisorName(persona.advisorName || '');
    setAdvisorUsername(persona.advisorUsername || '');
  }, []);

  // 30-Second Lockout Countdown Ticker
  useEffect(() => {
    let intervalId;
    if (lockoutSecondsRemaining > 0) {
      intervalId = setInterval(() => {
        setLockoutSecondsRemaining((prev) => {
          if (prev <= 1) {
            setFailedAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [lockoutSecondsRemaining]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (lockoutSecondsRemaining > 0) return;

    setErrorMsg('');

    // If device is not yet authorized, require valid passphrase
    if (!deviceAuthorized) {
      if (!validatePassphrase(passphrase)) {
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);
        if (nextFailed >= 5) {
          setLockoutSecondsRemaining(30);
          setErrorMsg('');
        } else {
          setErrorMsg(`Incorrect passphrase. (${5 - nextFailed} attempts remaining)`);
        }
        return;
      }
    }

    const cleanName = advisorName.trim();
    const cleanUsername = advisorUsername.trim().toLowerCase();

    const profile = saveAdvisorSession({
      advisorName: cleanName,
      advisorUsername: cleanUsername,
      advisorEmail: cleanUsername ? `${cleanUsername}@lindenwood.edu` : ''
    });

    setFailedAttempts(0);
    setLockoutSecondsRemaining(0);
    onLoginSuccess?.(profile);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col justify-center items-center py-12 px-4 bg-[#F8F7F4]">
      {/* Centered Login Card */}
      <div className="w-full max-w-[460px] bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden relative">
        {/* Top 4px Gold Accent Bar */}
        <div className="h-1 bg-[#B5A36A] w-full" />

        <div className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-full bg-[#F7F5EE] border border-[#B5A36A] mb-3">
              <Lock className="w-6 h-6 text-[#857542]" />
            </div>
            <h2 className="text-2xl font-display font-extrabold text-neutral-950 tracking-tight">
              Degree Planner Access
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Automatic &amp; Custom Degree Audit and Planning Tool
            </p>
          </div>

          {/* Rate Limiter Lockout Alert */}
          {lockoutSecondsRemaining > 0 ? (
            <div
              id="login-lockout-alert"
              data-testid="login-lockout-alert"
              className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-xs text-amber-800 flex items-start space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>Too many failed attempts. Submissions locked for {lockoutSecondsRemaining}s.</span>
            </div>
          ) : errorMsg ? (
            <div
              id="login-error-alert"
              data-testid="login-error-alert"
              className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Passphrase Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-passphrase"
                  className="block text-xs font-bold text-neutral-800 uppercase tracking-wider"
                >
                  Passphrase
                </label>
                {deviceAuthorized && (
                  <span
                    id="device-authorized-badge"
                    data-testid="device-authorized-badge"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>✓ Device Authorized</span>
                  </span>
                )}
              </div>

              {deviceAuthorized ? (
                <div className="relative">
                  <input
                    id="login-passphrase"
                    data-testid="login-passphrase"
                    type="text"
                    value={MASKED_PASSPHRASE}
                    disabled
                    aria-label="Passphrase (Device Authorized)"
                    className="w-full px-3 py-2 text-sm bg-neutral-100 text-neutral-400 font-mono border border-neutral-300 rounded-md cursor-not-allowed select-none"
                  />
                </div>
              ) : (
                <input
                  id="login-passphrase"
                  data-testid="login-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter Passphrase"
                  disabled={lockoutSecondsRemaining > 0}
                  className={`w-full px-3 py-2 text-sm border rounded-md font-mono focus:outline-none focus:border-[#857542] focus:ring-1 focus:ring-[#857542] ${
                    lockoutSecondsRemaining > 0
                      ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                      : 'border-neutral-300'
                  }`}
                  required={!deviceAuthorized}
                />
              )}
            </div>

            {/* 2. Advisor Name Input (Optional) */}
            <div>
              <label
                htmlFor="login-advisor-name"
                className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5"
              >
                Advisor Name
              </label>
              <input
                id="login-advisor-name"
                data-testid="login-advisor-name"
                type="text"
                value={advisorName}
                onChange={(e) => setAdvisorName(e.target.value)}
                placeholder="Prof. Name"
                disabled={lockoutSecondsRemaining > 0}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md placeholder-neutral-400 focus:outline-none focus:border-[#857542] focus:ring-1 focus:ring-[#857542]"
              />
            </div>

            {/* 3. Advisor Email Input (Optional) */}
            <div>
              <label
                htmlFor="login-advisor-username"
                className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5"
              >
                Advisor Email
              </label>
              <div className="flex rounded-md shadow-2xs border border-neutral-300 focus-within:border-[#857542] focus-within:ring-1 focus-within:ring-[#857542] overflow-hidden">
                <input
                  id="login-advisor-username"
                  data-testid="login-advisor-username"
                  type="text"
                  value={advisorUsername}
                  onChange={(e) => setAdvisorUsername(e.target.value)}
                  placeholder="username"
                  disabled={lockoutSecondsRemaining > 0}
                  className="w-full px-3 py-2 text-sm font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none"
                />
                <span className="inline-flex items-center px-3.5 bg-[#F3F4F6] text-neutral-800 font-bold text-xs border-l border-neutral-300 select-none">
                  @lindenwood.edu
                </span>
              </div>
            </div>

            {/* 4. Launch Action Button */}
            <button
              id="login-launch-btn"
              data-testid="login-launch-btn"
              type="submit"
              disabled={lockoutSecondsRemaining > 0}
              className={`w-full py-2.5 px-4 font-bold text-sm rounded-md transition shadow flex items-center justify-center space-x-2 mt-2 ${
                lockoutSecondsRemaining > 0
                  ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed border border-neutral-300'
                  : 'bg-[#857542] hover:bg-[#6E6035] text-white cursor-pointer'
              }`}
            >
              <span>Launch Degree Planner →</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </form>

          {/* FERPA Reassurance Box */}
          <div className="mt-6 p-4 rounded-lg bg-[#F7F5EE] border-l-4 border-[#857542] text-neutral-700">
            <div className="flex items-center space-x-2 text-xs font-bold text-neutral-900 mb-1">
              <ShieldCheck className="w-4 h-4 text-[#857542]" />
              <span>Built to Support FERPA-Compliant Advising</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-600">
              Zero-Cloud Student Data: Student transcripts, grades, and degree audits are parsed and stored strictly inside your browser memory. No student Personal Identifiable Information (PII) leaves this device.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
