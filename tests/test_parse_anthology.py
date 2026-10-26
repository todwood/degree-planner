"""
Pytest verification suite for execution/parse_anthology.py
Tests all extraction, noise filtering, deduplication, verification, and calibration
rules defined in directives/ExtractAnthologyFile.md.
"""

import csv
import os
import tempfile
import pytest

from execution.parse_anthology import (
    STANDARD_ANTHOLOGY_HEADERS,
    parse_anthology_file,
    verify_anthology_headers,
)


def _write_temp_csv(headers, rows):
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)
    return path


def test_verify_anthology_headers_valid_and_invalid():
    valid_check = verify_anthology_headers(STANDARD_ANTHOLOGY_HEADERS)
    assert valid_check["isValid"] is True
    assert valid_check["exact20ColumnMatch"] is True
    assert valid_check["missingColumns"] == []

    # Invalid headers (e.g., user uploaded a random CSV or Bingo Sheet)
    invalid_check = verify_anthology_headers(["Department", "Course", "Credits", "Semester"])
    assert invalid_check["isValid"] is False
    assert invalid_check["errorCode"] == "INVALID_ANTHOLOGY_HEADERS"
    assert "Published Code" in invalid_check["missingColumns"]
    assert "Course Status" in invalid_check["missingColumns"]


def test_parse_anthology_rejects_wrong_document():
    path = _write_temp_csv(
        ["Student Name", "Major", "GPA"],
        [["Jane Doe", "Cybersecurity", "3.8"]],
    )
    try:
        res = parse_anthology_file(path)
        assert res["isValid"] is False
        assert res["errorCode"] == "INVALID_ANTHOLOGY_HEADERS"
    finally:
        if os.path.exists(path):
            os.remove(path)


def test_parse_anthology_noise_filter_and_deduplication_csv():
    rows = [
        # Valid Transfer row with HD tag
        [
            "HIST10100",
            "World History: Empires and Exchanges since 1500 (GE-HC:WHis/HD)",
            "HIST10100",
            "",
            "TRANSFER_TERM",
            "Complete",
            "TR-P",
            "",
            "",
            "3.0",
            "0.0",
            "",
            "3.0",
            "0.0",
            "",
            "",
            "",
            "0.0",
            "",
            "CYBSCBS/Cybersecurity BS/ATT",
        ],
        # Synthetic GE bucket transfer code
        [
            "GE11006",
            "GE-Human Culture: Literature (GE-HC:Lit)",
            "GE11006",
            "",
            "TRANSFER_TERM",
            "Complete",
            "TR-P",
            "",
            "",
            "3.0",
            "0.0",
            "",
            "3.0",
            "0.0",
            "",
            "",
            "",
            "0.0",
            "",
            "CYBSCBS/Cybersecurity BS/ATT",
        ],
        # On-Ground meeting sub-table noise header & meeting rows
        ["", "Day", "Room", "Building", "Location", "Time", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        [
            "",
            "Monday",
            "Young Hall 204",
            "Young Hall",
            "St. Charles - Home Campus",
            "10:00:00 AM - 10:50:00 AM",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
        ],
        # Failed attempt in Fall 2024
        [
            "MTH14100",
            "Basic Statistics (GE-Math)",
            "MTH14100",
            "11",
            "FALL_24_16W",
            "Complete",
            "F",
            "2024-08-26",
            "Faculty",
            "3.0",
            "0.0",
            "MAIN Campus",
            "3.0",
            "0.0",
            "",
            "",
            "On Ground",
            "0.0",
            "",
            "CYBSCBS/Cybersecurity BS/ATT",
        ],
        # Retake passed in Spring 2025 with B
        [
            "MTH14100",
            "Basic Statistics (GE-Math)",
            "MTH14100",
            "OL1",
            "SPRING_I_25_8W",
            "Complete",
            "B",
            "2025-01-13",
            "Faculty",
            "3.0",
            "0.0",
            "MAIN Campus",
            "3.0",
            "0.0",
            "",
            "",
            "Online",
            "3.0",
            "",
            "CYBSCBS/Cybersecurity BS/ATT",
        ],
        # Current course with duplicate unscheduled Future row carrying Minor tag
        [
            "CINE11000",
            "Introduction to Cinema Arts",
            "CINE11000",
            "11",
            "FALL_26_16W",
            "Current",
            "",
            "2026-08-24",
            "Faculty",
            "3.0",
            "0.0",
            "MAIN Campus",
            "3.0",
            "0.0",
            "",
            "",
            "On Ground",
            "0.0",
            "",
            "CYBSCBS/Cybersecurity BS/ATT",
        ],
        [
            "CINE11000",
            "Introduction to Cinema Arts",
            "CINE11000",
            "",
            "",
            "Future",
            "",
            "",
            "",
            "3.0",
            "0.0",
            "",
            "3.0",
            "0.0",
            "Minor - Cinema Arts Minor",
            "",
            "",
            "0.0",
            "",
            "CYBSCBS/Cybersecurity BS/ATT",
        ],
    ]
    path = _write_temp_csv(STANDARD_ANTHOLOGY_HEADERS, rows)
    try:
        res = parse_anthology_file(path)
        assert res["isValid"] is True
        s = res["summary"]
        assert s["totalRawRows"] == 8
        assert s["droppedNoiseRows"] == 2
        assert s["validCourseRows"] == 6
        assert s["ignoredUnscheduledFutureRows"] == 1
        assert s["activeUniqueCourseCount"] == 4
        assert s["transferCredits"] == 6.0
        assert s["univLulWaived"] is True
        assert s["completedLuCredits"] == 3.0
        assert s["totalCompletedCredits"] == 9.0
        assert s["currentCredits"] == 3.0
        assert s["totalEarnedPlusEnrolledCredits"] == 12.0
        assert s["excludedLedgerCount"] == 1
        assert res["excludedCourses"][0]["publishedCode"] == "MTH14100"

        # Check Minor Tag Preservation on CINE11000
        cine = next(c for c in res["activeCourses"] if c["publishedCode"] == "CINE11000")
        assert cine["areaOfStudy"] == "Minor - Cinema Arts Minor"
        assert res["metadata"]["primaryMajor"] == "Cybersecurity BS"
        assert res["metadata"]["inferredCatalogYear"] == "2024-2025"
    finally:
        if os.path.exists(path):
            os.remove(path)


def test_calibration_benchmark_brandon_paz():
    """
    Section 6 Calibration Benchmark:
    When execution/parse_anthology.py runs on the reference file
    (.tmp/samples/Brandon Paz/StudentCourseSchedules (All Results).xlsx),
    it must produce the exact deterministic numbers from Section 6.
    """
    sample_path = os.path.join(
        ".tmp", "samples", "Brandon Paz", "StudentCourseSchedules (All Results).xlsx"
    )
    if not os.path.exists(sample_path):
        pytest.skip("Local calibration sample not present in .tmp/samples/")

    res = parse_anthology_file(sample_path)
    assert res["isValid"] is True
    s = res["summary"]

    assert s["totalRawRows"] == 78
    assert s["droppedNoiseRows"] == 34
    assert s["validCourseRows"] == 44
    assert s["ignoredUnscheduledFutureRows"] == 15
    assert s["ignoredUnscheduledFutureCredits"] == 46.0
    assert s["activeUniqueCourseCount"] == 29
    assert s["transferCourseCount"] == 2
    assert s["transferCredits"] == 6.0
    assert s["univLulWaived"] is True
    assert s["completedLuCourseCount"] == 23
    assert s["completedLuCredits"] == 68.0
    assert s["totalCompletedCredits"] == 74.0
    assert s["currentCourseCount"] == 4
    assert s["currentCredits"] == 10.0
    assert s["totalEarnedPlusEnrolledCredits"] == 84.0
    assert s["lindenwoodResidencyCredits"] == 78.0
    assert s["upperLevelCourseCount"] == 10
    assert s["upperLevelCredits"] == 30.0
    assert s["upperLevelCreditsNeeded"] == 12.0
    assert set(s["upperLevelCodes"]) == {
        "ICS31000",
        "IIT33500",
        "IIT35100",
        "ICS41500",
        "ICS43200",
        "CINE31500",
        "ICS41700",
        "ICS32700",
        "ICS42100",
        "ICS42300",
    }
    assert s["hdCourseCount"] == 2
    assert s["hdCredits"] == 6.0
    assert set(s["hdCodes"]) == {"SOC10200", "HIST10100"}
    assert s["hdSatisfied"] is True
