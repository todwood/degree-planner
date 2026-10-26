# Directive: Deterministic Academic Calendar Scraper (Layer 1)

## Goal
Deterministically extract and calculate Lindenwood University Priority Registration opening dates for Fall and Spring semesters across all class standings (`Seniors`, `Juniors`, `Sophomores`, `Freshmen`).

## Brand & Editorial Guidelines (`Style.md`)
- **Strict Full-Month Names:** Never abbreviate month names. Use `"October 26, 2026"`, never `"Oct. 26"` or `"10/26"`.
- **No Ordinal Suffixes:** Use `"October 26, 2026"`, never `"October 26th, 2026"`.

## Class Standing Credit Thresholds
Priority standing is calculated strictly based on credits **completed prior to the registration window**:
- **Seniors:** $\ge 90$ earned credits
- **Juniors:** $60\text{--}89$ earned credits
- **Sophomores:** $30\text{--}59$ earned credits
- **Freshmen:** $0\text{--}29$ earned credits

## Outputs
- Saves `.tmp/academic_calendar_dates.json` containing registration dates mapped by academic year, semester, and standing.
- Provides importable Python function `get_registration_date(season, year, standing)` for downstream scripts and reporting.
