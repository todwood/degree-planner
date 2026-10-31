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

  // Initialize from localStorage
  useEffect(() => {
    const isAuth = isDeviceAuthorized();
    setDeviceAuthorized(isAuth);
    const persona = getSavedAdvisorPersona();
    setAdvisorName(persona.advisorName || 'Prof Wood');
    setAdvisorUsername(persona.advisorUsername || 'mwood');
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault();
    setErrorMsg('');

    // If device is not yet authorized, require valid passphrase
    if (!deviceAuthorized) {
      if (!validatePassphrase(passphrase)) {
        setErrorMsg('Invalid department passphrase. Please enter the authorized department passphrase.');
        return;
      }
    }

    const cleanName = advisorName.trim() || 'Prof Wood';
    const cleanUsername = advisorUsername.trim().toLowerCase() || 'mwood';

    const profile = saveAdvisorSession({
      advisorName: cleanName,
      advisorUsername: cleanUsername,
      advisorEmail: `${cleanUsername}@lindenwood.edu`
    });

    onLoginSuccess?.(profile);
  };

  const handleDemoBypass = () => {
    const profile = saveAdvisorSession({
      advisorName: 'Prof Wood',
      advisorUsername: 'mwood',
      advisorEmail: 'mwood@lindenwood.edu'
    });
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
              Advisor Workspace Access
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Deterministic Academic Auditing &amp; 8-Week Session Scheduling
            </p>
          </div>

          {errorMsg && (
            <div
              id="login-error-alert"
              data-testid="login-error-alert"
              className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

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
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md font-mono focus:outline-none focus:border-[#857542] focus:ring-1 focus:ring-[#857542]"
                  required
                />
              )}
            </div>

            {/* 2. Advisor Name Input */}
            <div>
              <label
                htmlFor="login-advisor-name"
                className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5"
              >
                Advisor Full Name
              </label>
              <input
                id="login-advisor-name"
                data-testid="login-advisor-name"
                type="text"
                value={advisorName}
                onChange={(e) => setAdvisorName(e.target.value)}
                placeholder="Prof Wood"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:border-[#857542] focus:ring-1 focus:ring-[#857542]"
                required
              />
            </div>

            {/* 3. Lindenwood Username Input */}
            <div>
              <label
                htmlFor="login-advisor-username"
                className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5"
              >
                Lindenwood Username
              </label>
              <div className="flex rounded-md shadow-2xs border border-neutral-300 focus-within:border-[#857542] focus-within:ring-1 focus-within:ring-[#857542] overflow-hidden">
                <input
                  id="login-advisor-username"
                  data-testid="login-advisor-username"
                  type="text"
                  value={advisorUsername}
                  onChange={(e) => setAdvisorUsername(e.target.value)}
                  placeholder="mwood"
                  className="w-full px-3 py-2 text-sm font-mono text-neutral-900 focus:outline-none"
                  required
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
              className="w-full py-2.5 px-4 bg-[#857542] hover:bg-[#6E6035] text-white font-bold text-sm rounded-md transition shadow flex items-center justify-center space-x-2 cursor-pointer mt-2"
            >
              <span>Launch Degree Planner →</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </form>

          {/* Quick Demo Bypass Button for Local Dev / Test Compatibility */}
          <div className="mt-4 pt-4 border-t border-neutral-100 text-center">
            <button
              id="login-demo-bypass-btn"
              data-testid="login-demo-bypass-btn"
              type="button"
              onClick={handleDemoBypass}
              className="w-full py-2 px-3 rounded text-xs font-semibold text-[#857542] bg-[#F7F5EE] hover:bg-[#EFEBD9] border border-[#B5A36A] transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-[#857542]" />
              <span>Instant Demo / Local Dev Bypass (Prof Wood)</span>
            </button>
          </div>

          {/* FERPA Reassurance Box */}
          <div className="mt-6 p-4 rounded-lg bg-[#F7F5EE] border-l-4 border-[#857542] text-neutral-700">
            <div className="flex items-center space-x-2 text-xs font-bold text-neutral-900 mb-1">
              <ShieldCheck className="w-4 h-4 text-[#857542]" />
              <span>100% FERPA &amp; Client-Side Privacy Guarantee</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-600">
              Student transcripts, Anthology course records, and exported degree plans are processed
              <strong> strictly in local browser memory</strong>. No student names, student IDs,
              grades, or PII are ever stored on, uploaded to, or transmitted to any external server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
