import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, Mail, ArrowRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Screen0Login({ onLoginSuccess }) {
  const [usernamePrefix, setUsernamePrefix] = useState('mwood');
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [simulatedCode, setSimulatedCode] = useState('123456');
  const [errorMsg, setErrorMsg] = useState('');
  const otpInputsRef = useRef([]);

  // 5-minute cooldown timer ticker
  useEffect(() => {
    let timer;
    if (cooldownSeconds > 0) {
      timer = setInterval(() => {
        setCooldownSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleRequestOtp = (e) => {
    e?.preventDefault();
    const cleanPrefix = usernamePrefix.trim().toLowerCase();
    if (!cleanPrefix) {
      setErrorMsg('Please enter your university username prefix (e.g., mwood).');
      return;
    }

    if (cooldownSeconds > 0) {
      setErrorMsg(`Anti-spam rate limit active. Please wait ${cooldownSeconds}s before requesting a new code.`);
      return;
    }

    setErrorMsg('');
    setIsRequestingOtp(true);

    // Simulate OTP generation and send
    setTimeout(() => {
      const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
      setSimulatedCode(randomCode);
      setIsRequestingOtp(false);
      setOtpModalOpen(true);
      setCooldownSeconds(300); // 5-minute cooldown per ProjectStrategy.md Section 2.1
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpInputsRef.current[0]?.focus(), 100);
    }, 600);
  };

  const handleOtpChange = (index, value) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    // Handle single-digit input or multi-digit paste
    if (cleaned.length === 1) {
      const next = [...otpDigits];
      next[index] = cleaned;
      setOtpDigits(next);
      if (index < 5) {
        otpInputsRef.current[index + 1]?.focus();
      }
    } else if (cleaned.length >= 6) {
      // Pasted full 6-digit code
      const pasted = cleaned.slice(0, 6).split('');
      setOtpDigits(pasted);
      otpInputsRef.current[5]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = (e) => {
    e?.preventDefault();
    const entered = otpDigits.join('');
    if (entered.length < 6) {
      setErrorMsg('Please enter all 6 digits of your verification code.');
      return;
    }

    // In demo / offline environment, accept simulatedCode or 123456
    if (entered === simulatedCode || entered === '123456') {
      const faculty = {
        email: `${usernamePrefix.trim().toLowerCase()}@lindenwood.edu`,
        username_prefix: usernamePrefix.trim().toLowerCase(),
        first_name: usernamePrefix.toLowerCase() === 'mwood' ? 'Matthias' : 'Faculty',
        last_name: usernamePrefix.toLowerCase() === 'mwood' ? 'Wood' : 'Advisor',
        position_title: 'Senior Instructor, Mathematics',
        department: 'College of Science, Technology, and Health',
        photo_url: ''
      };
      onLoginSuccess(faculty);
    } else {
      setErrorMsg(`Invalid verification code. (Hint: Test code is ${simulatedCode})`);
    }
  };

  const handleDemoBypass = () => {
    const faculty = {
      email: 'mwood@lindenwood.edu',
      username_prefix: 'mwood',
      first_name: 'Matthias',
      last_name: 'Wood',
      position_title: 'Senior Instructor, Mathematics',
      department: 'College of Science, Technology, and Health',
      photo_url: ''
    };
    onLoginSuccess(faculty);
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
              Faculty Advising Workspace
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Deterministic Academic Auditing & 8-Week Session Scheduling
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider mb-1.5">
                Advisor Email Login
              </label>

              {/* Split Username Input with seamlessly joined @lindenwood.edu addon */}
              <div className="flex rounded-md shadow-sm border border-neutral-300 focus-within:border-[#857542] focus-within:ring-1 focus-within:ring-[#857542] overflow-hidden">
                <input
                  id="login-username-prefix"
                  type="text"
                  value={usernamePrefix}
                  onChange={(e) => setUsernamePrefix(e.target.value)}
                  placeholder="mwood"
                  className="w-full px-3 py-2.5 text-sm text-neutral-900 focus:outline-none font-mono"
                  disabled={cooldownSeconds > 0}
                  required
                />
                <span className="inline-flex items-center px-3.5 bg-[#F3F4F6] text-neutral-800 font-bold text-xs border-l border-neutral-300 select-none">
                  @lindenwood.edu
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Enter your university username prefix to receive a 6-digit verification code.
              </p>
            </div>

            {/* Primary Action Button */}
            <button
              id="login-send-otp-btn"
              type="submit"
              disabled={isRequestingOtp || cooldownSeconds > 0}
              className={`w-full py-2.5 px-4 rounded-md font-bold text-sm text-white flex items-center justify-center space-x-2 transition shadow ${
                cooldownSeconds > 0
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-[#857542] hover:bg-[#6E6035]'
              }`}
            >
              {isRequestingOtp ? (
                <span>Dispatching Code...</span>
              ) : cooldownSeconds > 0 ? (
                <>
                  <Clock className="w-4 h-4 text-white" />
                  <span>Resend Available in {cooldownSeconds}s</span>
                </>
              ) : (
                <>
                  <span>Send 6-Digit Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Bypass Button */}
          <div className="mt-4 pt-4 border-t border-neutral-100 text-center">
            <button
              id="login-demo-bypass-btn"
              type="button"
              onClick={handleDemoBypass}
              className="w-full py-2 px-3 rounded text-xs font-semibold text-[#857542] bg-[#F7F5EE] hover:bg-[#EFEBD9] border border-[#B5A36A] transition flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4 text-[#857542]" />
              <span>Demo Login (Matthias Wood — Senior Instructor, Mathematics)</span>
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

      {/* 6-Digit OTP Verification Modal */}
      {otpModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-md w-full p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-[#F7F5EE] border border-[#B5A36A] flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6 text-[#857542]" />
            </div>

            <h3 className="text-lg font-bold text-neutral-950">Enter 6-Digit Verification Code</h3>
            <p className="text-xs text-neutral-600 mt-1">
              We sent a verification code to{' '}
              <strong className="text-neutral-900 font-mono">
                {usernamePrefix.toLowerCase()}@lindenwood.edu
              </strong>
            </p>

            <div className="my-3 py-1.5 px-3 bg-[#F7F5EE] border border-[#B5A36A] rounded text-xs text-[#857542] inline-block font-mono">
              Demo Code: <strong>{simulatedCode}</strong>
            </div>

            <form onSubmit={handleVerifyOtp} className="mt-4">
              {/* 6 Large Numeric Paste Boxes */}
              <div className="flex justify-center space-x-2 mb-6">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputsRef.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-12 h-14 text-center text-xl font-bold font-mono border-2 border-neutral-300 rounded-lg focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 focus:outline-none"
                  />
                ))}
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setOtpModalOpen(false)}
                  className="w-1/2 py-2 px-3 border border-neutral-300 text-xs font-bold text-neutral-700 rounded hover:bg-neutral-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 px-3 bg-[#857542] hover:bg-[#6E6035] text-xs font-bold text-white rounded transition shadow"
                >
                  Verify & Enter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
