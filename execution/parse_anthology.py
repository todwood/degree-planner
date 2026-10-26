"""
Deterministic Anthology Course Schedule Parser & Validator (execution/parse_anthology.py)
Implements directives/ExtractAnthologyFile.md for Anthology "Student Course Schedules (All Results)"
exports (.xlsx and .csv).

Strict FERPA Boundary:
- Runs 100% locally. Never transmits student records to any external server.
"""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
import json
import math
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET
import zipfile

try:
    import openpyxl  # type: ignore
except ImportError:
    openpyxl = None

STANDARD_ANTHOLOGY_HEADERS: List[str] = [
    "Course Code",
    "Course Name",
    "Published Code",
    "Section",
    "Term",
    "Course Status",
    "Letter Grade",
    "Start Date",
    "Instructor",
    "Credits",
    "Hours",
    "Campus",
    "Enroll Status Credits",
    "Enroll Status Hours",
    "Area of Study",
    "Payment Period",
    "Delivery Method",
    "Points",
    "SPE Progression",
    "Enrollment",
]

ESSENTIAL_ANTHOLOGY_HEADERS: List[str] = [
    "Course Code",
    "Course Name",
    "Published Code",
    "Term",
    "Course Status",
    "Letter Grade",
    "Start Date",
    "Credits",
    "Area of Study",
    "Delivery Method",
    "Enrollment",
]

WEEKDAY_NAMES = {
    "day",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}

PUBLISHED_CODE_REGEX = re.compile(r"^([A-Z]{2,5})\s*(\d{4,5}[A-Z]?)$", re.IGNORECASE)
COURSE_CODE_SUFFIX_REGEX = re.compile(r"^[A-Z]{2,5}\s*\d{4,5}[A-Z]?-(\d{2})$", re.IGNORECASE)
INLINE_GE_TAG_REGEX = re.compile(r"\((GE-[^)]+)\)", re.IGNORECASE)

PASSING_COMPLETED_GRADES = {
    "A", "A+", "A-", "AH",
    "B", "B+", "B-", "BH",
    "C", "C+", "C-", "CH",
    "D", "D+", "D-", "DH",
    "P", "CR", "S",
}
FAILING_OR_EXCLUDED_GRADES = {"F", "W", "WF", "AF", "INC", "I", "AU", "NC", "U"}
EXCLUDED_STATUSES = {"WITHDRAWN", "W", "F", "INC", "DROPPED", "DROPPED-W"}

GRADE_PRIORITY: Dict[str, int] = {
    "A+": 62,
    "AH": 61,
    "A": 60,
    "TR-A": 60,
    "A-": 58,
    "B+": 52,
    "BH": 51,
    "B": 50,
    "TR-B": 50,
    "B-": 48,
    "C+": 42,
    "CH": 41,
    "C": 40,
    "TR-C": 40,
    "C-": 38,
    "TR-P": 30,
    "TR": 30,
    "P": 30,
    "CR": 30,
    "S": 30,
    "D+": 22,
    "DH": 21,
    "D": 20,
    "TR-D": 20,
    "D-": 18,
}

STATE_PRIORITY: Dict[str, int] = {
    "Completed": 400,
    "Transfer": 400,
    "Current": 300,
    "Scheduled": 200,
    "Excluded": 100,
}


def _clean_cell(val: Any) -> str:
    """Convert cell value to clean trimmed string, treating None/NaN as empty string."""
    if val is None:
        return ""
    if isinstance(val, float) and math.isnan(val):
        return ""
    text = str(val).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return text


def _clean_date(val: Any) -> str:
    """Format date cell into YYYY-MM-DD if possible (supports datetime, ISO, US dates, and Excel serial numbers)."""
    if val is None:
        return ""
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    text = _clean_cell(val)
    if not text:
        return ""
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    if match:
        return match.group(1)
    # Try MM/DD/YYYY
    m_us = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if m_us:
        mm, dd, yyyy = int(m_us.group(1)), int(m_us.group(2)), int(m_us.group(3))
        return f"{yyyy:04d}-{mm:02d}-{dd:02d}"
    # Check Excel serial date number (e.g. 45530 -> 2024-08-26)
    if re.match(r"^\d{5}(?:\.\d+)?$", text):
        serial = int(float(text))
        if 30000 <= serial <= 60000:
            dt = datetime(1899, 12, 30) + timedelta(days=serial)
            return dt.strftime("%Y-%m-%d")
    return text


def _col_letters_to_index(col_letters: str) -> int:
    """Convert Excel column letters (A, B, ..., T, AA) to 0-based index."""
    idx = 0
    for ch in col_letters.upper():
        if "A" <= ch <= "Z":
            idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _read_xlsx_stdlib(file_path: str) -> List[List[Any]]:
    """Pure Python stdlib reader for .xlsx worksheet index 0."""
    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(file_path, "r") as zf:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in ss_root.findall("main:si", ns):
                texts = [t.text or "" for t in si.findall(".//main:t", ns)]
                shared_strings.append("".join(texts))

        sheet_files = sorted(
            [
                name
                for name in zf.namelist()
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
            ]
        )
        if not sheet_files:
            return []
        sheet_root = ET.fromstring(zf.read(sheet_files[0]))
        rows_out: List[List[Any]] = []
        for row_el in sheet_root.findall(".//main:sheetData/main:row", ns):
            cells_dict: Dict[int, Any] = {}
            max_col = -1
            for c_el in row_el.findall("main:c", ns):
                ref = c_el.attrib.get("r", "")
                col_match = re.match(r"^([A-Z]+)", ref, re.IGNORECASE)
                col_idx = (
                    _col_letters_to_index(col_match.group(1))
                    if col_match
                    else (max_col + 1)
                )
                max_col = max(max_col, col_idx)
                c_type = c_el.attrib.get("t", "")
                val: Any = None
                if c_type == "s":
                    v_el = c_el.find("main:v", ns)
                    if v_el is not None and v_el.text is not None:
                        s_idx = int(v_el.text)
                        val = (
                            shared_strings[s_idx]
                            if 0 <= s_idx < len(shared_strings)
                            else ""
                        )
                elif c_type == "inlineStr":
                    t_els = c_el.findall(".//main:t", ns)
                    val = "".join((t.text or "") for t in t_els)
                else:
                    v_el = c_el.find("main:v", ns)
                    val = v_el.text if v_el is not None else ""
                cells_dict[col_idx] = val
            if max_col >= 0:
                row_vals = [cells_dict.get(i, None) for i in range(max_col + 1)]
            else:
                row_vals = []
            rows_out.append(row_vals)
        return rows_out


def _read_raw_rows_from_file(file_path: str) -> Tuple[List[str], List[List[Any]]]:
    """Read header row (Row 0) and raw data rows from .xlsx (Sheet index 0) or .csv."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".xlsx":
        if openpyxl is not None:
            wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
            sheet = wb.worksheets[0]
            all_rows = [list(r) for r in sheet.iter_rows(values_only=True)]
            wb.close()
        else:
            all_rows = _read_xlsx_stdlib(file_path)
        if not all_rows:
            return [], []
        headers = [_clean_cell(h) for h in all_rows[0]]
        data_rows = [list(r) for r in all_rows[1:]]
        return headers, data_rows
    elif ext == ".csv":
        with open(file_path, mode="r", encoding="utf-8-sig", newline="") as f:
            reader = list(csv.reader(f))
        if not reader:
            return [], []
        headers = [_clean_cell(h) for h in reader[0]]
        data_rows = reader[1:]
        return headers, data_rows
    else:
        raise ValueError(f"Unsupported file extension '{ext}'. Expected .xlsx or .csv.")


def verify_anthology_headers(headers: List[str]) -> Dict[str, Any]:
    """
    Deterministically verify that the uploaded spreadsheet has the required Anthology
    'Student Course Schedules (All Results)' header structure.
    """
    normalized_headers = [h.strip() for h in headers if h is not None]
    header_set = {h.lower() for h in normalized_headers if h}

    missing_essential = [
        col for col in ESSENTIAL_ANTHOLOGY_HEADERS if col.lower() not in header_set
    ]
    exact_20_match = normalized_headers[:20] == STANDARD_ANTHOLOGY_HEADERS

    if missing_essential:
        return {
            "isValid": False,
            "exact20ColumnMatch": False,
            "columnCount": len(normalized_headers),
            "missingColumns": missing_essential,
            "errorCode": "INVALID_ANTHOLOGY_HEADERS",
            "errorMessage": (
                "The uploaded file does not match the Anthology 'Student Course Schedules (All Results)' "
                f"export format. Missing required columns: {', '.join(missing_essential)}."
            ),
        }

    return {
        "isValid": True,
        "exact20ColumnMatch": exact_20_match,
        "columnCount": len(normalized_headers),
        "missingColumns": [],
        "errorCode": None,
        "errorMessage": None,
    }


def extract_inline_ge_tags(course_name: str) -> Dict[str, Any]:
    """
    Section 5.3: Extract parenthetical (GE-...) tags and Human Diversity (/HD) marker
    from Course Name.
    """
    if not course_name:
        return {"rawTag": None, "isHd": False, "geCategory": None}

    matches = INLINE_GE_TAG_REGEX.findall(course_name)
    if not matches:
        return {"rawTag": None, "isHd": False, "geCategory": None}

    raw_tag = matches[-1].strip()
    upper_tag = raw_tag.upper()
    is_hd = "/HD" in upper_tag

    ge_category: Optional[str] = None
    if "MATH" in upper_tag:
        ge_category = "GE-Math"
    elif "USHISGOV" in upper_tag or "GE-CIV" in upper_tag:
        ge_category = "U.S. Hist/Gov"
    elif "SOCSCI" in upper_tag:
        ge_category = "Social Science"
    elif "NATSCILEC/LAB" in upper_tag or "NATSCILEC" in upper_tag or "NATSCILAB" in upper_tag:
        ge_category = "Natural Science with Lab"
    elif "NATSCI" in upper_tag:
        ge_category = "Natural Science"
    elif ":ARTS" in upper_tag or ":ART" in upper_tag:
        ge_category = "Fine Arts"
    elif ":LIT" in upper_tag:
        ge_category = "Literature"
    elif "GE-HC" in upper_tag:
        ge_category = "Human Culture Elective (Non-Lit/Non-Arts)"
    elif upper_tag.startswith("GE-"):
        ge_category = "GE Elective"

    return {
        "rawTag": raw_tag,
        "isHd": is_hd,
        "geCategory": ge_category,
    }


def parse_term_metadata(term_str: str) -> Dict[str, Any]:
    """
    Section 2.1: Parse Term encoding Season, Session (I or II), 2-digit Year, and Duration (8W or 16W).
    Examples:
      FALL_I_26_8W -> Fall 2026, Session I (8-week)
      FALL_26_16W  -> Fall 2026, Full Semester (16-week)
      TRANSFER_TERM -> External transfer credit
    """
    clean = (term_str or "").strip().upper()
    if not clean:
        return {
            "raw": "",
            "isTransfer": False,
            "season": None,
            "session": None,
            "year": None,
            "duration": None,
            "chronologicalRank": 999999,
        }
    if clean == "TRANSFER_TERM" or clean.startswith("TRANSFER"):
        return {
            "raw": clean,
            "isTransfer": True,
            "season": "Transfer",
            "session": None,
            "year": None,
            "duration": None,
            "chronologicalRank": 0,
        }

    season = None
    season_order = 0
    if clean.startswith("FALL") or clean.startswith("FA"):
        season = "Fall"
        season_order = 3
    elif clean.startswith("SPRING") or clean.startswith("SP"):
        season = "Spring"
        season_order = 1
    elif clean.startswith("SUMMER") or clean.startswith("SU"):
        season = "Summer"
        season_order = 2

    session = None
    session_order = 0
    if re.search(r"(?:_|^)II(?:_|$)", clean):
        session = "II"
        session_order = 2
    elif re.search(r"(?:_|^)I(?:_|$)", clean):
        session = "I"
        session_order = 1

    year = None
    yr_match = re.search(r"(?:_|^|[A-Z])(1\d|2\d|3\d)(?:_|$|[A-Z])", clean)
    if yr_match:
        year = 2000 + int(yr_match.group(1))

    duration = None
    if "8W" in clean:
        duration = "8W"
    elif "16W" in clean:
        duration = "16W"

    chrono_rank = (year or 9999) * 100 + season_order * 10 + session_order
    return {
        "raw": clean,
        "isTransfer": False,
        "season": season,
        "session": session,
        "year": year,
        "duration": duration,
        "chronologicalRank": chrono_rank,
    }


def infer_catalog_year(valid_rows: List[Dict[str, Any]]) -> str:
    """
    Section 1.2: Determine the student's default Catalog Year from the earliest
    chronological non-transfer Lindenwood Start Date or Term.
    E.g., earliest term FALL_I_24_8W / FALL_24_16W starting 2024-08-26 maps to '2024-2025'.
    """
    earliest_date: Optional[str] = None
    earliest_term_info: Optional[Dict[str, Any]] = None

    for row in valid_rows:
        if row["state"] == "Transfer" or row["term"] == "TRANSFER_TERM":
            continue
        if row["isUnscheduledFuture"]:
            continue
        start_date = row.get("startDate") or ""
        if re.match(r"^\d{4}-\d{2}-\d{2}$", start_date):
            if earliest_date is None or start_date < earliest_date:
                earliest_date = start_date
        t_info = parse_term_metadata(row.get("term", ""))
        if t_info["year"] is not None:
            if (
                earliest_term_info is None
                or t_info["chronologicalRank"] < earliest_term_info["chronologicalRank"]
            ):
                earliest_term_info = t_info

    if earliest_date:
        yyyy = int(earliest_date[:4])
        mm = int(earliest_date[5:7])
        start_yr = yyyy if mm >= 8 else (yyyy - 1)
        return f"{start_yr}-{start_yr + 1}"

    if earliest_term_info and earliest_term_info["year"]:
        yr = earliest_term_info["year"]
        season = earliest_term_info["season"]
        start_yr = yr if season == "Fall" else (yr - 1)
        return f"{start_yr}-{start_yr + 1}"

    return "2026-2027"


def classify_anthology_row(
    published_code: str,
    course_number: int,
    term: str,
    course_status: str,
    letter_grade: str,
) -> Tuple[str, Optional[str], bool]:
    """
    Section 3: Classify a valid Anthology course row into one of the 5 deterministic states:
      1. 'Completed'
      2. 'Transfer'
      3. 'Current'
      4. 'Scheduled'
      5. 'Excluded'
    Returns (state, exclusion_reason, is_unscheduled_future)
    """
    status_upper = (course_status or "").strip().upper()
    grade_upper = (letter_grade or "").strip().upper()
    term_upper = (term or "").strip().upper()

    # Check 3.5.1: Unscheduled Anthology Audit Rows (Course Status == "Future" AND Term is NaN/blank)
    if status_upper == "FUTURE" and not term_upper:
        return ("Excluded", "Unscheduled Future Audit Row", True)

    # Check 3.5.2: Failing / Non-Passing / Withdrawn Grades or Statuses
    if grade_upper in FAILING_OR_EXCLUDED_GRADES or status_upper in EXCLUDED_STATUSES:
        reason_label = grade_upper or status_upper
        return ("Excluded", f"Excluded Grade/Status ({reason_label})", False)

    if grade_upper in {"TR-F", "TR-W", "TR-WF", "TR-NC"}:
        return ("Excluded", f"Excluded Transfer Grade ({grade_upper})", False)

    # Check 3.5.3: Preparatory Level (< 10000)
    if course_number < 10000:
        return ("Excluded", "Sub-10000 Preparatory Course", False)

    # Check 3.2: State 2: Transfer (TR)
    if (
        term_upper == "TRANSFER_TERM"
        or grade_upper.startswith("TR")
        or status_upper == "TR"
    ):
        return ("Transfer", None, False)

    # Check 3.1: State 1: Completed (Lindenwood Earned Credits)
    if (
        status_upper == "COMPLETE"
        and term_upper != "TRANSFER_TERM"
        and grade_upper in PASSING_COMPLETED_GRADES
    ):
        return ("Completed", None, False)

    # Check 3.3: State 3: Current (In-Progress Active Term Credits)
    if status_upper in {"CURRENT", "IN PROGRESS"} or (
        grade_upper in {"", "IP"}
        and term_upper
        and status_upper not in {"SCHEDULED", "REGISTERED", "FUTURE", "COMPLETE"}
    ):
        return ("Current", None, False)

    # Check 3.4: State 4: Scheduled (Registered Future Anchor Credits)
    if status_upper in {"SCHEDULED", "REGISTERED"} or (
        status_upper == "FUTURE" and bool(term_upper)
    ):
        return ("Scheduled", None, False)

    # Fallback if status is Complete with no failing grade or passing grade with non-standard status
    if grade_upper in PASSING_COMPLETED_GRADES and term_upper != "TRANSFER_TERM":
        return ("Completed", None, False)

    return ("Excluded", f"Unrecognized Status/Grade ({course_status}/{letter_grade})", False)


def parse_anthology_file(file_path: str) -> Dict[str, Any]:
    """
    Full deterministic extraction and calibration engine for Anthology
    'Student Course Schedules (All Results)' (.xlsx or .csv) per directives/ExtractAnthologyFile.md.
    """
    if not os.path.exists(file_path):
        return {
            "isValid": False,
            "errorCode": "FILE_NOT_FOUND",
            "errorMessage": f"File not found: {file_path}",
        }

    try:
        headers, raw_rows = _read_raw_rows_from_file(file_path)
    except Exception as exc:
        return {
            "isValid": False,
            "errorCode": "FILE_READ_ERROR",
            "errorMessage": f"Unable to read spreadsheet file: {exc}",
        }

    verification = verify_anthology_headers(headers)
    if not verification["isValid"]:
        return verification

    # Map header names to column indices
    col_map: Dict[str, int] = {}
    for idx, h in enumerate(headers):
        clean_h = h.strip().lower()
        if clean_h and clean_h not in col_map:
            col_map[clean_h] = idx

    def get_col(row: List[Any], name: str, fallback_idx: int) -> Any:
        idx = col_map.get(name.lower(), fallback_idx)
        return row[idx] if idx < len(row) else None

    total_raw_rows = len(raw_rows)
    dropped_noise_rows = 0
    valid_rows: List[Dict[str, Any]] = []

    detected_enrollments: List[str] = []
    detected_areas_of_study: List[str] = []
    template_suffixes: List[str] = []

    for row_idx, row in enumerate(raw_rows):
        course_code_raw = _clean_cell(get_col(row, "Course Code", 0))
        course_name_raw = _clean_cell(get_col(row, "Course Name", 1))
        published_code_raw = _clean_cell(get_col(row, "Published Code", 2))

        # Section 1.3 Mandatory Row-Level Noise Filter (Execute First):
        # 1. DROP any row where Course Code is null, empty, or whitespace (NaN).
        if not course_code_raw:
            dropped_noise_rows += 1
            continue

        # 2. DROP any row where Course Name equals "Day" or a weekday name,
        #    or where Published Code equals "Room".
        if (
            course_name_raw.lower() in WEEKDAY_NAMES
            or published_code_raw.lower() == "room"
        ):
            dropped_noise_rows += 1
            continue

        # 3. Only rows where Published Code matches ^[A-Z]{2,4}\s*\d{4,5}$ proceed.
        normalized_pub = re.sub(r"[\s\-]+", "", published_code_raw).upper()
        pub_match = PUBLISHED_CODE_REGEX.match(normalized_pub)
        if not pub_match:
            dropped_noise_rows += 1
            continue

        dept = pub_match.group(1).upper()
        num_str = pub_match.group(2)
        course_number = int(num_str)
        published_code = f"{dept}{num_str}"
        canonical_code = f"{dept} {num_str}"

        # Check catalog version suffix on Course Code (e.g. ICS42100-23)
        suffix_match = COURSE_CODE_SUFFIX_REGEX.match(course_code_raw)
        if suffix_match:
            suf = f"-{suffix_match.group(1)}"
            if suf not in template_suffixes:
                template_suffixes.append(suf)

        # Extract the remaining essential columns
        term_raw = _clean_cell(get_col(row, "Term", 4))
        status_raw = _clean_cell(get_col(row, "Course Status", 5))
        grade_raw = _clean_cell(get_col(row, "Letter Grade", 6))
        start_date_raw = _clean_date(get_col(row, "Start Date", 7))
        credits_raw = _clean_cell(get_col(row, "Credits", 9))
        area_of_study_raw = _clean_cell(get_col(row, "Area of Study", 14))
        delivery_method_raw = _clean_cell(get_col(row, "Delivery Method", 16))
        enrollment_raw = _clean_cell(get_col(row, "Enrollment", 19))

        try:
            credits_val = float(credits_raw) if credits_raw else 0.0
        except ValueError:
            credits_val = 0.0

        if enrollment_raw and enrollment_raw not in detected_enrollments:
            detected_enrollments.append(enrollment_raw)
        if area_of_study_raw and area_of_study_raw not in detected_areas_of_study:
            detected_areas_of_study.append(area_of_study_raw)

        state, exclusion_reason, is_unscheduled_future = classify_anthology_row(
            published_code=published_code,
            course_number=course_number,
            term=term_raw,
            course_status=status_raw,
            letter_grade=grade_raw,
        )

        ge_info = extract_inline_ge_tags(course_name_raw)

        # Composition C-or-higher rule (Section 3.1)
        is_comp_course = published_code in {"ENGL15000", "EPP15000", "ENGL17000"}
        satisfies_composition = True
        if is_comp_course:
            satisfies_composition = grade_raw.upper() in {
                "A", "A+", "A-", "AH",
                "B", "B+", "B-", "BH",
                "C", "C+", "C-", "CH",
                "TR-A", "TR-B", "TR-C", "TR-P",
                "P", "CR", "S",
            }

        valid_rows.append(
            {
                "rowIndex": row_idx + 2,  # 1-based Excel row index (Row 1 is header)
                "courseCode": course_code_raw,
                "courseName": course_name_raw,
                "publishedCode": published_code,
                "canonicalCode": canonical_code,
                "department": dept,
                "courseNumber": course_number,
                "isUpperLevel": course_number >= 30000,
                "isPreparatory": course_number < 10000,
                "term": term_raw,
                "courseStatus": status_raw,
                "letterGrade": grade_raw,
                "startDate": start_date_raw,
                "credits": credits_val,
                "deliveryMethod": delivery_method_raw,
                "areaOfStudy": area_of_study_raw,
                "enrollment": enrollment_raw,
                "state": state,
                "exclusionReason": exclusion_reason,
                "isUnscheduledFuture": is_unscheduled_future,
                "satisfiesComposition": satisfies_composition,
                "geTag": ge_info["rawTag"],
                "geCategory": ge_info["geCategory"],
                "isHd": ge_info["isHd"],
            }
        )

    if len(valid_rows) == 0:
        return {
            "isValid": False,
            "errorCode": "NO_VALID_COURSE_ROWS",
            "errorMessage": (
                "No valid Anthology course records were found in the uploaded file. "
                "Please ensure you exported 'Student Course Schedules (All Results)' from Anthology."
            ),
        }

    # Count unscheduled Future (Term == NaN) audit rows before deduplication (Section 6 benchmark)
    unscheduled_future_rows = [r for r in valid_rows if r["isUnscheduledFuture"]]
    ignored_unscheduled_future_count = len(unscheduled_future_rows)
    ignored_unscheduled_future_credits = round(
        sum(r["credits"] for r in unscheduled_future_rows), 2
    )

    # Section 4: Retake & Deduplication Rules
    # Group all valid course rows by canonical Published Code
    grouped_by_pub: Dict[str, List[Dict[str, Any]]] = {}
    for r in valid_rows:
        grouped_by_pub.setdefault(r["publishedCode"], []).append(r)

    def _row_sort_key(item: Dict[str, Any]) -> Tuple[int, int, int, str]:
        st_prio = STATE_PRIORITY.get(item["state"], 0)
        gr_prio = GRADE_PRIORITY.get((item["letterGrade"] or "").upper(), 0)
        lu_tiebreak = 1 if item["state"] == "Completed" else 0
        return (st_prio, gr_prio, lu_tiebreak, item.get("startDate") or "")

    deduplicated_active_courses: List[Dict[str, Any]] = []
    excluded_courses_ledger: List[Dict[str, Any]] = []

    for pub_code, group in grouped_by_pub.items():
        # Section 4.2 Minor Tag Preservation:
        # Merge non-empty Area of Study values across all rows for this Published Code
        merged_areas = []
        for g in group:
            if g["areaOfStudy"] and g["areaOfStudy"] not in merged_areas:
                merged_areas.append(g["areaOfStudy"])
        merged_area_str = "; ".join(merged_areas) if merged_areas else ""

        # Sort candidates by priority hierarchy (Section 4.1)
        sorted_group = sorted(group, key=_row_sort_key, reverse=True)
        winner = dict(sorted_group[0])
        if merged_area_str:
            winner["areaOfStudy"] = merged_area_str

        if winner["state"] in {"Completed", "Transfer", "Current", "Scheduled"}:
            deduplicated_active_courses.append(winner)
            # Check remaining rows in group for historical retakes or failures to log in Excluded Ledger
            for other in sorted_group[1:]:
                if other["isUnscheduledFuture"]:
                    # Unscheduled Future (Term = NaN) rows are silently ignored by the credit counter
                    continue
                reason = (
                    "Excluded: Repeat / Retake"
                    if other["state"] in {"Completed", "Transfer", "Current", "Scheduled"}
                    else (other["exclusionReason"] or "Excluded: Repeat / Retake")
                )
                excluded_entry = dict(other)
                excluded_entry["exclusionReason"] = reason
                excluded_courses_ledger.append(excluded_entry)
        else:
            # Winner itself is in Excluded state
            for item in sorted_group:
                if item["isUnscheduledFuture"]:
                    continue
                excluded_courses_ledger.append(dict(item))

    # Compute exact deterministic credit sums & counters (Section 6)
    transfer_courses = [c for c in deduplicated_active_courses if c["state"] == "Transfer"]
    completed_lu_courses = [c for c in deduplicated_active_courses if c["state"] == "Completed"]
    current_courses = [c for c in deduplicated_active_courses if c["state"] == "Current"]
    scheduled_courses = [c for c in deduplicated_active_courses if c["state"] == "Scheduled"]

    total_transfer_credits = round(sum(c["credits"] for c in transfer_courses), 2)
    total_completed_lu_credits = round(sum(c["credits"] for c in completed_lu_courses), 2)
    total_completed_credits = round(total_transfer_credits + total_completed_lu_credits, 2)
    total_current_credits = round(sum(c["credits"] for c in current_courses), 2)
    total_scheduled_credits = round(sum(c["credits"] for c in scheduled_courses), 2)
    total_enrolled_credits = round(total_current_credits + total_scheduled_credits, 2)
    total_earned_plus_enrolled_credits = round(
        total_completed_credits + total_enrolled_credits, 2
    )
    lindenwood_residency_credits = round(
        total_completed_lu_credits + total_enrolled_credits, 2
    )

    upper_level_courses = [
        c for c in deduplicated_active_courses if c["isUpperLevel"]
    ]
    upper_level_credits = round(sum(c["credits"] for c in upper_level_courses), 2)

    hd_courses = [c for c in deduplicated_active_courses if c["isHd"]]
    hd_credits = round(sum(c["credits"] for c in hd_courses), 2)

    # Extract Primary Degree / Major from Enrollment column (Index 19)
    # Formatted as <ProgramCode>/<Program Title>/<Status> (e.g., CYBSCBS/Cybersecurity BS/ATT)
    primary_major = None
    primary_program_code = None
    if detected_enrollments:
        parts = [p.strip() for p in detected_enrollments[0].split("/")]
        if len(parts) >= 2:
            primary_program_code = parts[0]
            primary_major = parts[1]
        else:
            primary_major = detected_enrollments[0]

    inferred_catalog_year = infer_catalog_year(valid_rows)

    return {
        "isValid": True,
        "filePath": os.path.basename(file_path),
        "verification": verification,
        "metadata": {
            "studentName": None,
            "studentId": None,
            "studentEmail": None,
            "advisorName": None,
            "primaryProgramCode": primary_program_code,
            "primaryMajor": primary_major,
            "declaredMinors": detected_areas_of_study,
            "inferredCatalogYear": inferred_catalog_year,
            "templateSuffixes": template_suffixes,
        },
        "summary": {
            "totalRawRows": total_raw_rows,
            "droppedNoiseRows": dropped_noise_rows,
            "validCourseRows": len(valid_rows),
            "ignoredUnscheduledFutureRows": ignored_unscheduled_future_count,
            "ignoredUnscheduledFutureCredits": ignored_unscheduled_future_credits,
            "activeUniqueCourseCount": len(deduplicated_active_courses),
            "transferCourseCount": len(transfer_courses),
            "transferCredits": total_transfer_credits,
            "univLulWaived": total_transfer_credits > 0,
            "completedLuCourseCount": len(completed_lu_courses),
            "completedLuCredits": total_completed_lu_credits,
            "totalCompletedCredits": total_completed_credits,
            "currentCourseCount": len(current_courses),
            "currentCredits": total_current_credits,
            "scheduledCourseCount": len(scheduled_courses),
            "scheduledCredits": total_scheduled_credits,
            "totalEarnedPlusEnrolledCredits": total_earned_plus_enrolled_credits,
            "lindenwoodResidencyCredits": lindenwood_residency_credits,
            "upperLevelCourseCount": len(upper_level_courses),
            "upperLevelCredits": upper_level_credits,
            "upperLevelCodes": [c["publishedCode"] for c in upper_level_courses],
            "upperLevelCreditsNeeded": round(max(0.0, 42.0 - upper_level_credits), 2),
            "hdCourseCount": len(hd_courses),
            "hdCredits": hd_credits,
            "hdCodes": [c["publishedCode"] for c in hd_courses],
            "hdSatisfied": len(hd_courses) >= 2 and hd_credits >= 6.0,
            "excludedLedgerCount": len(excluded_courses_ledger),
        },
        "activeCourses": deduplicated_active_courses,
        "excludedCourses": excluded_courses_ledger,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python execution/parse_anthology.py <path_to_xlsx_or_csv>")
        sys.exit(1)

    target_path = sys.argv[1]
    result = parse_anthology_file(target_path)
    print(json.dumps(result, indent=2))
    if not result.get("isValid"):
        sys.exit(1)


if __name__ == "__main__":
    main()
