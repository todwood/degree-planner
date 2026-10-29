import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { getProgramCategory } from '../utils/programStackUtils.js';
import masterProgramsDb from '../data/masterProgramsDatabase.json' with { type: 'json' };

/**
 * Parses program name into discipline, emphasis, and degree badge.
 * e.g. "Information Technology, BS - Applications Development Emphasis"
 * -> discipline: "Information Technology, BS"
 * -> emphasis: "Applications Development Emphasis"
 * -> degreeBadge: "BS"
 */
export function parseProgramDetails(name = '') {
  if (!name) return { discipline: 'Select Degree Program', emphasis: null, degreeBadge: 'BS' };

  let discipline = name.trim();
  let emphasis = null;

  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    discipline = parts[0].trim();
    emphasis = parts.slice(1).join(' - ').trim();
  }

  let degreeBadge = 'BS';
  const match = discipline.match(/,\s*(BS|BA|MS|BFA|BBA|BSN|CER|MIN)\b/i);
  if (match) {
    degreeBadge = match[1].toUpperCase();
  } else if (/minor\b/i.test(name)) {
    degreeBadge = 'Minor';
  } else if (/certificate\b/i.test(name)) {
    degreeBadge = 'Cert';
  }

  return { discipline, emphasis, degreeBadge };
}

/**
 * Searchable Combobox for selecting Lindenwood Degree Programs without text truncation.
 */
export default function ProgramCombobox({
  programs = [],
  catalogYear = '2026-2027',
  selectedProgramId = '',
  onSelectProgramId = () => {},
  disabled = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listboxRef = useRef(null);

  // Fallback to masterProgramsDatabase filtered by catalogYear if programs prop is empty
  const effectivePrograms = useMemo(() => {
    if (Array.isArray(programs) && programs.length > 0) {
      return programs;
    }
    const all = masterProgramsDb?.programs
      ? (Array.isArray(masterProgramsDb.programs) ? masterProgramsDb.programs : Object.values(masterProgramsDb.programs))
      : [];
    return all.filter(
      (p) =>
        p.catalogYear === catalogYear ||
        p.catalog_year === catalogYear ||
        p.catalog_year_id === catalogYear
    );
  }, [programs, catalogYear]);

  // Find currently selected program
  const selectedProgram = useMemo(() => {
    return effectivePrograms.find((p) => p.id === selectedProgramId) || effectivePrograms[0] || null;
  }, [effectivePrograms, selectedProgramId]);

  const { discipline, emphasis, degreeBadge } = useMemo(() => {
    return parseProgramDetails(selectedProgram?.name || '');
  }, [selectedProgram]);

  const selectedCategory = useMemo(() => {
    return selectedProgram ? getProgramCategory(selectedProgram) : 'Major';
  }, [selectedProgram]);

  // Filter programs by search query (discipline, emphasis, id, degree, or category)
  const filteredPrograms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return effectivePrograms;
    return effectivePrograms.filter((p) => {
      const name = (p.name || p.program_name || '').toLowerCase();
      const id = (p.id || '').toLowerCase();
      const cat = getProgramCategory(p).toLowerCase();
      return name.includes(q) || id.includes(q) || cat.includes(q);
    });
  }, [effectivePrograms, searchQuery]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Click-outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!filteredPrograms.length) return;
      setHighlightedIndex((prev) => (prev + 1) % filteredPrograms.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filteredPrograms.length) return;
      setHighlightedIndex((prev) => (prev - 1 + filteredPrograms.length) % filteredPrograms.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredPrograms.length > 0 && filteredPrograms[highlightedIndex]) {
        handleSelect(filteredPrograms[highlightedIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const handleSelect = (programId) => {
    onSelectProgramId(programId);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Hidden Native Select for Headless Test / Scraper Backwards Compatibility */}
      <select
        id="optionB-program-select"
        value={selectedProgramId}
        onChange={(e) => onSelectProgramId(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only absolute -left-[9999px] opacity-0 pointer-events-none w-0 h-0"
      >
        <optgroup label="Official Undergraduate Degree Programs">
          {effectivePrograms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      </select>

      {/* Accessible Interactive Trigger Button */}
      <button
        id="optionB-program-combobox-trigger"
        data-testid="program-combobox-trigger"
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="optionB-program-listbox"
        className={`w-full text-left bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg p-2.5 transition shadow-2xs flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-[#857542] ring-2 ring-[#857542]/20' : ''
        }`}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Search className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-neutral-900 leading-snug break-words">
              {selectedProgram ? discipline : 'Select a verified degree program...'}
            </div>
            {selectedProgram && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${
                    selectedCategory === 'Major'
                      ? 'bg-slate-100 text-slate-800 border border-slate-300'
                      : selectedCategory === 'Major - Track'
                      ? 'bg-[#857542]/10 text-[#857542] border border-[#857542]/30'
                      : selectedCategory === 'Minor'
                      ? 'bg-slate-100 text-slate-600 border border-slate-300'
                      : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                  }`}
                >
                  {selectedCategory}
                </span>
                {emphasis ? (
                  <span className="inline-flex items-center text-[10px] font-semibold text-[#857542] bg-[#F7F5EE] border border-[#B5A36A]/40 px-1.5 py-0.5 rounded leading-none">
                    {emphasis}
                  </span>
                ) : selectedCategory === 'Major' ? (
                  <span className="text-[10px] font-medium text-neutral-500">
                    Major Core Curriculum
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
            {degreeBadge}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-neutral-500 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-[#857542]' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Floating Listbox */}
      {isOpen && (
        <div
          id="optionB-program-listbox"
          role="listbox"
          aria-label="Verified Degree Programs"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white rounded-lg border border-[#B5A36A] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Popover Search Bar */}
          <div className="p-2 bg-neutral-50/90 border-b border-neutral-200/80">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                id="optionB-program-search-input"
                data-testid="program-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search degree or track (e.g., Cyber, App, Net)..."
                className="w-full text-xs pl-8 pr-7 py-1.5 bg-white border border-neutral-300 focus:border-[#857542] focus:ring-1 focus:ring-[#857542] rounded-md outline-none text-neutral-900 placeholder:text-neutral-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    if (searchInputRef.current) searchInputRef.current.focus();
                  }}
                  className="absolute right-2 text-neutral-400 hover:text-neutral-600 text-xs px-1 cursor-pointer"
                  aria-label="Clear search query"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div
            className="max-h-60 overflow-y-auto divide-y divide-neutral-100"
            ref={listboxRef}
          >
            {filteredPrograms.length === 0 ? (
              <div
                id="optionB-program-empty-state"
                className="p-4 text-center text-xs text-neutral-500 italic"
              >
                No matching verified programs found in this catalog year.
              </div>
            ) : (
              filteredPrograms.map((prog, idx) => {
                const isSelected = prog.id === selectedProgramId;
                const isHighlighted = idx === highlightedIndex;
                const details = parseProgramDetails(prog.name);

                return (
                  <div
                    key={prog.id}
                    id={`program-option-${prog.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(prog.id)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2.5 cursor-pointer transition flex items-start justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-[#F7F5EE] border-l-4 border-l-[#857542]'
                        : isHighlighted
                        ? 'bg-neutral-50'
                        : 'bg-white hover:bg-neutral-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-xs font-bold leading-tight ${
                          isSelected ? 'text-[#857542]' : 'text-neutral-900'
                        }`}
                      >
                        {details.discipline}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${
                            getProgramCategory(prog) === 'Major'
                              ? 'bg-slate-100 text-slate-800 border border-slate-300'
                              : getProgramCategory(prog) === 'Major - Track'
                              ? 'bg-[#857542]/10 text-[#857542] border border-[#857542]/30'
                              : getProgramCategory(prog) === 'Minor'
                              ? 'bg-slate-100 text-slate-600 border border-slate-300'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                          }`}
                        >
                          {getProgramCategory(prog)}
                        </span>
                        {details.emphasis ? (
                          <span
                            className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none ${
                              isSelected
                                ? 'bg-[#857542]/15 text-[#857542] border border-[#857542]/30'
                                : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                            }`}
                          >
                            {details.emphasis}
                          </span>
                        ) : getProgramCategory(prog) === 'Major' ? (
                          <span className="text-[10px] font-medium text-neutral-500">
                            Major Core Curriculum
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                      <span className="text-[10px] font-bold text-neutral-600 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded">
                        {details.degreeBadge}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-[#857542]" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
