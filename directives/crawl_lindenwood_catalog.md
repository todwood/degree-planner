# Directive: On-Demand Lindenwood Catalog Crawler (Layer 1)

## Goal
Deterministically extract public undergraduate degree requirements, General Education matrices, official course descriptions, credit hours, prerequisites, corequisites, and course fees from the Lindenwood University Modern Campus Catalog (Acalog at `catalogs.lindenwood.edu`, `catoid=12` for 2026–2027).

## FERPA & Privacy Invariants
- Strictly public non-FERPA data only.
- Never accept, scrape, or process student names, IDs, grades, or personal information.
- Output cached non-FERPA curriculum JSON strictly into `.tmp/catalog_cache.json` or update `src/data/masterDatabase.json`.

## Inputs & Parameters
- `catoid`: Catalog identifier (defaults to `12` for 2026–2027 Undergraduate Catalog).
- `poids`: Program Object Identifiers:
  - `2148`: Cybersecurity, BS
  - `2151`: Information Technology, BS - Applications Development Emphasis
  - `2152`: Information Technology, BS - Networking Emphasis
- `--offline-fallback`: When network connection is unavailable or Acalog server returns 5xx/429, seamlessly loads from validated seed cache.

## Outputs
- Structured JSON output containing:
  - `catalog_year`: e.g. `"2026-2027"`
  - `programs`: list of extracted degree checklists
  - `courses`: map of course codes to title, credits, description, prereq_display, coreq_codes, fee_info, and ge_bucket.
  - `last_scraped`: ISO timestamp

## Deterministic Script Execution
Run with:
```bash
.\.venv\Scripts\python.exe execution/crawl_lindenwood_catalog.py
```
Or test via Pytest:
```bash
.\.venv\Scripts\python.exe -m pytest tests/test_catalog_crawler.py
```
