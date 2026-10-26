#!/usr/bin/env python3
"""
Lindenwood University Deterministic Catalog Crawler (crawl_lindenwood_catalog.py)
Extracts undergraduate degree requirements, course descriptions, credit hours,
prerequisites, corequisites, and course fees from catalogs.lindenwood.edu (Acalog).
Strictly Non-FERPA public curriculum data.
"""

import sys
import os
import json
import re
from datetime import datetime, timezone
import requests
from bs4 import BeautifulSoup

CATALOG_BASE_URL = "https://catalogs.lindenwood.edu"
DEFAULT_CATOID = 12 # 2026-2027 Undergraduate Catalog

PROGRAM_POIDS = {
    2148: "Cybersecurity, BS",
    2151: "Information Technology, BS - Applications Development Emphasis",
    2152: "Information Technology, BS - Networking Emphasis"
}

HEADERS = {
    "User-Agent": "LindenwoodDegreePlannerCrawler/1.0 (Faculty Academic Advising System; non-commercial)"
}

def clean_text(text: str) -> str:
    if not text:
        return ""
    # Normalize unicode whitespace & NBSP
    text = re.sub(r"[\xa0\s]+", " ", text)
    return text.strip()

def parse_course_description_block(html_content: str) -> dict:
    """
    Parses an Acalog course popup / preview block.
    Extracts code, title, credits, description, prerequisites, corequisites, fees.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    
    # Title row usually formatted as: "ICS 21300 - Foundations of Information Technology (3)"
    title_el = soup.find(["h3", "h4", "strong", "span"])
    raw_header = clean_text(title_el.get_text() if title_el else soup.get_text().split("\n")[0])
    
    code = ""
    title = ""
    credits = 3
    
    header_match = re.match(r"^([A-Z]{3,4}\s*\d{5})\s*[-–—:]\s*(.+?)(?:\s*\((\d+)(?:\s*-\s*\d+)?\s*(?:cr|credit|credits)?\))?$", raw_header, re.IGNORECASE)
    if header_match:
        code = clean_text(header_match.group(1)).upper()
        title = clean_text(header_match.group(2))
        if header_match.group(3):
            credits = int(header_match.group(3))
    else:
        # Fallback regex
        code_match = re.search(r"\b([A-Z]{3,4}\s*\d{5})\b", raw_header)
        if code_match:
            code = code_match.group(1).upper()
            title = clean_text(raw_header.replace(code, "").strip("-:–— "))
    
    full_text = clean_text(soup.get_text())
    
    # Extract prerequisites
    prereq_match = re.search(r"(?:Prerequisite|Prerequisites|Pre-requisite)s?:?\s*(.+?)(?=(?:Corequisite|Co-requisite|Fee|Note|Course Fee|\.|\n|$))", full_text, re.IGNORECASE)
    prereq_display = clean_text(prereq_match.group(1)) if prereq_match else "None"
    if not prereq_display or prereq_display.lower() in ["none", "none.", "n/a"]:
        prereq_display = "None"
        
    # Extract corequisites
    coreq_match = re.search(r"(?:Corequisite|Corequisites|Co-requisite)s?:?\s*(.+?)(?=(?:Prerequisite|Fee|Note|Course Fee|\.|\n|$))", full_text, re.IGNORECASE)
    coreqs_raw = clean_text(coreq_match.group(1)) if coreq_match else ""
    coreq_codes = [c.upper() for c in re.findall(r"\b[A-Z]{3,4}\s*\d{5}\b", coreqs_raw)]
    
    # Extract fees
    fee_match = re.search(r"(?:Course Fee|Special Fee|Fee)s?:?\s*(\$\d+(?:\.\d{2})?)", full_text, re.IGNORECASE)
    fee_info = fee_match.group(1) if fee_match else "$0"
    
    # Extract clean description
    # Remove header, prereqs, coreqs, fees from description
    desc = full_text
    if title:
        desc = desc.replace(title, "")
    if code:
        desc = desc.replace(code, "")
    desc = re.sub(r"(?:Prerequisite|Prerequisites|Corequisite|Corequisites|Course Fee|Fee):.*", "", desc, flags=re.IGNORECASE)
    desc = clean_text(desc.strip(" -–—:"))
    if not desc or len(desc) < 10:
        desc = f"Official curriculum course for {code} - {title}."
        
    return {
        "code": code,
        "title": title or code,
        "credits": credits,
        "description": desc,
        "prereq_display": prereq_display,
        "coreq_codes": coreq_codes,
        "fee_info": fee_info
    }

def fetch_program_requirements(catoid: int = DEFAULT_CATOID, poid: int = 2148) -> dict:
    """
    Fetches program checklist from catalogs.lindenwood.edu/preview_program.php?catoid=X&poid=Y
    Falls back gracefully to local master seed database if network is unreachable.
    """
    url = f"{CATALOG_BASE_URL}/preview_program.php?catoid={catoid}&poid={poid}"
    print(f"Fetching program {poid} from {url}...")
    
    courses_found = []
    program_name = PROGRAM_POIDS.get(poid, f"Program {poid}")
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            h1 = soup.find(["h1", "h2"], id="acalog-content")
            if h1:
                program_name = clean_text(h1.get_text())
                
            # Find course links (Acalog uses preview_course_nopop.php or custom onclicks)
            links = soup.find_all("a", href=re.compile(r"preview_course|catoid"))
            for a in links:
                txt = clean_text(a.get_text())
                code_match = re.search(r"\b([A-Z]{3,4}\s*\d{5})\b", txt)
                if code_match:
                    course_code = code_match.group(1).upper()
                    if course_code not in courses_found:
                        courses_found.append(course_code)
    except Exception as e:
        print(f"Notice: Network request to {url} encountered: {e}. Utilizing deterministic seed fallback.")
        
    # If network returned 0 courses (due to offline or DOM layout change), fall back to validated seed
    if not courses_found:
        seed_path = os.path.join(os.path.dirname(__file__), "..", "src", "data", "masterDatabase.json")
        if os.path.exists(seed_path):
            with open(seed_path, "r", encoding="utf-8") as f:
                seed_data = json.load(f)
                matched_prog = next((p for p in seed_data.get("programs", []) if p.get("acalog_poid") == poid), None)
                if matched_prog:
                    program_name = matched_prog.get("name", program_name)
                    reqs = matched_prog.get("requirements", {})
                    courses_found.extend(reqs.get("major_core_courses", []))
                    courses_found.extend(reqs.get("emphasis_courses", []))
                    
    return {
        "poid": poid,
        "program_name": program_name,
        "required_course_codes": list(dict.fromkeys(courses_found))
    }

def crawl_full_catalog(catoid: int = DEFAULT_CATOID) -> dict:
    """
    Orchestrates crawling degree checklists and course metadata across all CSTH programs.
    """
    programs_data = []
    for poid in PROGRAM_POIDS.keys():
        prog = fetch_program_requirements(catoid, poid)
        programs_data.append(prog)
        
    result = {
        "catalog_year": "2026-2027",
        "catoid": catoid,
        "last_crawled_iso": datetime.now(timezone.utc).isoformat(),
        "total_programs_crawled": len(programs_data),
        "programs": programs_data
    }
    
    # Save output to .tmp/catalog_crawled.json
    out_dir = os.path.join(os.path.dirname(__file__), "..", ".tmp")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "catalog_crawled.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        
    print(f"Successfully generated catalog crawl result -> {out_file}")
    return result

if __name__ == "__main__":
    catoid = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CATOID
    crawl_full_catalog(catoid)
