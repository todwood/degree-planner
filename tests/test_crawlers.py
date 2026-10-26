"""
Pytest Suite for Deterministic Lindenwood Crawlers
Tests crawl_lindenwood_catalog.py and scrape_academic_calendar.py
"""

import os
import json
import re
from datetime import datetime
from execution.crawl_lindenwood_catalog import (
    clean_text,
    parse_course_description_block,
    fetch_program_requirements,
    crawl_full_catalog
)
from execution.scrape_academic_calendar import (
    format_editorial_date,
    calculate_priority_schedule_for_term,
    scrape_or_generate_academic_calendar,
    FULL_MONTH_NAMES
)

def test_clean_text_normalizes_whitespace():
    raw = "  ICS   21300\xa0\xa0Foundations\n   of IT   "
    cleaned = clean_text(raw)
    assert cleaned == "ICS 21300 Foundations of IT"

def test_parse_course_description_block():
    html_sample = """
    <h3>ICS 31000 - Foundations of Cybersecurity (3)</h3>
    <p>Introduction to information security principles, threat modeling, and defense strategies.</p>
    <p>Prerequisites: ICS 21300.</p>
    <p>Corequisites: None.</p>
    <p>Course Fee: $50.00.</p>
    """
    parsed = parse_course_description_block(html_sample)
    assert parsed["code"] == "ICS 31000"
    assert parsed["title"] == "Foundations of Cybersecurity"
    assert parsed["credits"] == 3
    assert "information security" in parsed["description"]
    assert "ICS 21300" in parsed["prereq_display"]
    assert parsed["fee_info"] == "$50.00"

def test_fetch_program_requirements_fallback():
    # Program 2148: Cybersecurity, BS
    cyber = fetch_program_requirements(catoid=12, poid=2148)
    assert cyber["poid"] == 2148
    assert "Cybersecurity" in cyber["program_name"]
    assert len(cyber["required_course_codes"]) >= 15
    assert "ICS 21300" in cyber["required_course_codes"]
    assert "ICS 48900" in cyber["required_course_codes"]

def test_academic_calendar_editorial_style():
    # Style.md: Never abbreviate month names, no ordinal suffixes
    dt = datetime(2026, 10, 26)
    formatted = format_editorial_date(dt)
    assert formatted == "October 26, 2026"
    assert not re.search(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.", formatted)
    assert not re.search(r"\d+(st|nd|rd|th)\b", formatted)

def test_priority_registration_schedule_matrix():
    spring_2027 = calculate_priority_schedule_for_term("Spring", 2027)
    assert spring_2027["season"] == "Spring"
    assert spring_2027["registration_window_year"] == 2026
    
    seniors = spring_2027["schedule"]["Seniors"]
    assert seniors["min_completed_credits"] == 90
    assert "October" in seniors["opening_date"]
    
    juniors = spring_2027["schedule"]["Juniors"]
    assert juniors["min_completed_credits"] == 60
    assert "October" in juniors["opening_date"]
    
    sophomores = spring_2027["schedule"]["Sophomores"]
    assert sophomores["min_completed_credits"] == 30
    assert "October" in sophomores["opening_date"]
    
    freshmen = spring_2027["schedule"]["Freshmen"]
    assert freshmen["min_completed_credits"] == 0
    assert "November" in freshmen["opening_date"]

def test_scrape_or_generate_academic_calendar_output():
    cal = scrape_or_generate_academic_calendar()
    assert cal["institution"] == "Lindenwood University"
    assert "Spring 2027" in cal["terms"]
    assert "Fall 2027" in cal["terms"]
    
    out_path = os.path.join(os.path.dirname(__file__), "..", ".tmp", "academic_calendar_dates.json")
    assert os.path.exists(out_path)
