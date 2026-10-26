import json
import os
import pytest

def get_master_db():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "src", "data", "masterDatabase.json")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)

def test_master_db_structure():
    db = get_master_db()
    assert db["version"] == "1.0.0"
    assert len(db["catalog_years"]) >= 3
    assert len(db["programs"]) >= 3
    assert len(db["ge_waterfall_schema"]) == 14
    assert db["degree_policies"]["min_total_credits"] == 120
    assert db["degree_policies"]["min_upper_level_credits"] == 42
    assert db["degree_policies"]["min_lindenwood_residency_credits"] == 30
    assert db["degree_policies"]["final_residency_credits"] == 24

def test_programs_and_credits():
    db = get_master_db()
    prog_map = {p["acalog_poid"]: p for p in db["programs"]}
    
    # 1. Cybersecurity, BS
    cyber = prog_map[2148]
    assert cyber["total_program_credits"] == 66
    assert cyber["requirements"]["major_core_credits"] == 60
    assert len(cyber["requirements"]["major_core_courses"]) == 20
    
    # 2. IT, BS - Applications Development
    app_dev = prog_map[2151]
    assert app_dev["total_program_credits"] == 66
    assert app_dev["requirements"]["major_core_credits"] == 24
    assert app_dev["requirements"]["emphasis_credits"] == 36
    
    # 3. IT, BS - Networking
    net = prog_map[2152]
    assert net["total_program_credits"] == 60
    assert net["requirements"]["major_core_credits"] == 24
    assert net["requirements"]["emphasis_credits"] == 30

def test_ge_waterfall_and_composition():
    db = get_master_db()
    schema = db["ge_waterfall_schema"]
    total_cr = sum(b["required_credits"] for b in schema)
    assert total_cr == 42
    
    comp1 = next(b for b in schema if b["bucket_id"] == "comp_1")
    comp2 = next(b for b in schema if b["bucket_id"] == "comp_2")
    assert comp1["min_grade"] == "C"
    assert comp2["min_grade"] == "C"
