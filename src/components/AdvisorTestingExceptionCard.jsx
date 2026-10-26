import React from 'react';
import { FileSpreadsheet, FileText, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function AdvisorTestingExceptionCard({
  targetScreen = 2,
  onBackToIntake
}) {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-white rounded-xl border-2 border-[#857542] p-8 shadow-md">
        <div className="flex items-center space-x-2 pb-3 border-b border-neutral-100">
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#F7F5EE] text-[#857542] border border-[#B5A36A]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>100% FERPA CLIENT-SIDE MEMORY</span>
          </span>
          <span className="text-xs font-mono text-neutral-500">
            Intake Required for Screen {targetScreen}
          </span>
        </div>

        <h1 className="text-2xl font-display font-extrabold text-neutral-900 mt-4">
          No Student Record Currently Loaded
        </h1>

        <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
          The <strong>{targetScreen === 3 ? 'Degree Plan' : 'Degree Audit'}</strong> requires student course
          records to be uploaded into browser memory before deterministic degree requirements, prerequisite
          validation, and 8-week graduation schedules can be generated.
        </p>

        {/* Upload Checklist */}
        <div className="mt-6 p-4 rounded-lg bg-neutral-50 border border-neutral-200">
          <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-800 mb-3">
            To begin auditing, upload student documents on Step 1:
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white rounded border border-neutral-200 flex items-start space-x-2.5">
              <FileSpreadsheet className="w-5 h-5 text-[#857542] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-neutral-900">Anthology Export</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  .xlsx or .csv course export from Anthology Degree Audit.
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded border border-neutral-200 flex items-start space-x-2.5">
              <FileText className="w-5 h-5 text-[#857542] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-neutral-900">Unofficial Transcript</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  .pdf transcript (student-based or enrollment-based).
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onBackToIntake}
            className="px-5 py-2.5 bg-[#857542] hover:bg-[#6E6035] text-white text-xs font-bold rounded-lg shadow transition flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to Step 1: Intake Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
}
