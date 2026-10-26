import React, { useMemo } from 'react';

/**
 * Ultra-Minimal Systems Ledger Footer
 * Displays deterministic academic semester, architecture note, and zero-PII FERPA guarantee.
 */
export default function Footer() {
  const currentSemesterText = useMemo(() => {
    const d = new Date();
    const month = d.getMonth(); // 0–11: 0–4 = Spring, 5–6 = Summer, 7–11 = Fall
    const year = d.getFullYear();
    const term = month <= 4 ? 'Spring' : month <= 6 ? 'Summer' : 'Fall';
    return `Current Academic Semester: ${term} ${year}`;
  }, []);

  return (
    <footer className="border-t border-neutral-200 bg-white/60 py-4 px-6 mt-12 text-center text-xs text-neutral-500">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-y-1 gap-x-3">
        <span>Advising Platform &amp; Schedule Workspace</span>
        <span className="hidden sm:inline text-neutral-300">•</span>
        <span>{currentSemesterText}</span>
        <span className="hidden sm:inline text-neutral-300">•</span>
        <span>Local In-Memory Session</span>
        <span className="hidden sm:inline text-neutral-300">•</span>
        <span>Zero PII Retention</span>
      </div>
    </footer>
  );
}
