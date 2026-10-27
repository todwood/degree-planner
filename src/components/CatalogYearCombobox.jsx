import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, Check, Lock } from 'lucide-react';

const CATALOG_YEAR_CONFIG = [
  {
    id: '2026-2027',
    label: '2026–2027',
    startYear: 2026,
    badgeText: 'Active Catalog',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200'
  },
  {
    id: '2025-2026',
    label: '2025–2026',
    startYear: 2025,
    badgeText: 'Prior Year',
    badgeClass: 'bg-neutral-100 text-neutral-700 border-neutral-200'
  },
  {
    id: '2024-2025',
    label: '2024–2025',
    startYear: 2024,
    badgeText: 'Historical',
    badgeClass: 'bg-neutral-100 text-neutral-600 border-neutral-200'
  }
];

export default function CatalogYearCombobox({
  catalogYear = '2026-2027',
  onChange = () => {},
  minCatalogYearStart = 2024,
  disabled = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const listboxRef = useRef(null);

  const selectedOption = useMemo(() => {
    return CATALOG_YEAR_CONFIG.find((opt) => opt.id === catalogYear) || CATALOG_YEAR_CONFIG[0];
  }, [catalogYear]);

  // Click-outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
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
      setHighlightedIndex((prev) => (prev + 1) % CATALOG_YEAR_CONFIG.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + CATALOG_YEAR_CONFIG.length) % CATALOG_YEAR_CONFIG.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = CATALOG_YEAR_CONFIG[highlightedIndex];
      if (target && !(minCatalogYearStart > target.startYear)) {
        handleSelect(target.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const handleSelect = (yearId) => {
    onChange(yearId);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Hidden Native Select for Headless Test / Scraper Backwards Compatibility */}
      <select
        id="optionB-catalog-year"
        value={catalogYear}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only absolute -left-[9999px] opacity-0 pointer-events-none w-0 h-0"
      >
        <option value="2026-2027">2026–2027 (Active Catalog)</option>
        <option value="2025-2026" disabled={minCatalogYearStart > 2025}>
          2025–2026
        </option>
        <option value="2024-2025" disabled={minCatalogYearStart > 2024}>
          2024–2025
        </option>
      </select>

      {/* Accessible Interactive Trigger Button */}
      <button
        id="optionB-catalog-year-trigger"
        data-testid="catalog-year-trigger"
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(true);
          } else if (isOpen) {
            handleKeyDown(e);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="optionB-catalog-year-listbox"
        className={`w-full text-left bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-lg p-2.5 transition shadow-2xs flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-[#857542] ring-2 ring-[#857542]/20' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="w-4 h-4 text-[#857542] flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-neutral-900 leading-tight">
              {selectedOption.label}
            </div>
            <div className="mt-0.5">
              <span
                className={`inline-flex items-center text-[10px] font-semibold border px-1.5 py-0.2 rounded leading-tight ${selectedOption.badgeClass}`}
              >
                {selectedOption.badgeText}
              </span>
            </div>
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-neutral-500 transition-transform duration-150 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-[#857542]' : ''
          }`}
        />
      </button>

      {/* Popover Floating Listbox */}
      {isOpen && (
        <div
          id="optionB-catalog-year-listbox"
          role="listbox"
          aria-label="Supported Catalog Years"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white rounded-lg border border-[#B5A36A] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="divide-y divide-neutral-100" ref={listboxRef}>
            {CATALOG_YEAR_CONFIG.map((opt, idx) => {
              const isSelected = opt.id === catalogYear;
              const isHighlighted = idx === highlightedIndex;
              const isOptionDisabled = minCatalogYearStart > opt.startYear;

              return (
                <div
                  key={opt.id}
                  id={`catalog-year-option-${opt.id}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={isOptionDisabled}
                  onClick={() => {
                    if (!isOptionDisabled) {
                      handleSelect(opt.id);
                    }
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-2.5 transition flex items-center justify-between gap-2.5 ${
                    isOptionDisabled
                      ? 'bg-neutral-50/70 text-neutral-400 cursor-not-allowed opacity-60'
                      : isSelected
                      ? 'bg-[#F7F5EE] border-l-4 border-l-[#857542] cursor-pointer'
                      : isHighlighted
                      ? 'bg-neutral-50 cursor-pointer'
                      : 'bg-white hover:bg-neutral-50 cursor-pointer'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold leading-tight ${
                          isSelected
                            ? 'text-[#857542]'
                            : isOptionDisabled
                            ? 'text-neutral-400'
                            : 'text-neutral-900'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span
                        className={`text-[9px] font-semibold border px-1 rounded ${
                          isOptionDisabled
                            ? 'bg-neutral-100 text-neutral-400 border-neutral-200'
                            : opt.badgeClass
                        }`}
                      >
                        {opt.badgeText}
                      </span>
                    </div>

                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      {isOptionDisabled
                        ? `Restricted (matriculated ${minCatalogYearStart}+)`
                        : opt.id === '2026-2027'
                        ? 'Current academic catalog year'
                        : 'Prior approved catalog year'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isOptionDisabled ? (
                      <Lock className="w-3.5 h-3.5 text-neutral-400" />
                    ) : isSelected ? (
                      <Check className="w-4 h-4 text-[#857542]" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
