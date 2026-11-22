"""Checks for evaluate.py with fictional data. Run: .venv/Scripts/python test_evaluate.py"""
from datetime import datetime, timezone

import numpy as np
import pandas as pd

import evaluate as ev


def snapshot_rows():
    base = {"snapshot_at": "2026-01-01T00:00:00+00:00", "halted": False, "thin_data": False,
            "n_people_strong": 1, "n_dated_why_now": 1}
    return pd.DataFrame([
        {**base, "input": "a.example", "name": "A", "service": "pentest", "final": 8, "priority": "A", "confidence": "high", "cap": None},
        {**base, "input": "a.example", "name": "A", "service": "smart_contract_audit", "final": 3, "priority": "C", "confidence": "high", "cap": "covered_recent"},
        {**base, "input": "b.example", "name": "B", "service": "soc2", "final": 6, "priority": "B", "confidence": "med", "cap": None},
        {**base, "input": "c.example", "name": "C", "service": "pentest", "final": 4, "priority": "C", "confidence": "low", "cap": None},
    ])


def test_top_service_keeps_whole_row():
    top = ev.top_service(snapshot_rows()).set_index("input")
    assert top.loc["a.example", "service"] == "pentest"
    assert pd.isna(top.loc["a.example", "cap"])  # not borrowed from the audit row


def test_expert_agreement():
    labels = pd.DataFrame({"input": ["a.example", "b.example", "c.example"], "bd_priority": ["A", "c", "C"],
                           "bd_service": ["pentest", None, "pentest"], "notes": [None] * 3})
    r = ev.expert_agreement(snapshot_rows(), labels)
    assert r["n"] == 3 and abs(r["tier_match_rate"] - 2 / 3) < 1e-9 and r["service_match_rate"] == 1.0
    assert list(r["disagreements"]["input"]) == ["b.example"]
    assert ev.expert_agreement(snapshot_rows(), labels.assign(bd_priority=np.nan))["n"] == 0


def test_outcomes_only_count_after_snapshot_and_pending():
    outcomes = pd.DataFrame([
        {"input": "a.example", "service": "pentest", "event_date": "2026-02-01"},   # inside window → hit
        {"input": "b.example", "service": "soc2", "event_date": "2025-12-01"},      # before snapshot → ignored
        {"input": "c.example", "service": "*", "event_date": "2026-06-01"},         # after window → ignored
    ])
    later = datetime(2026, 12, 1, tzinfo=timezone.utc)
    lab = ev.label_outcomes(snapshot_rows(), outcomes, window_days=90, now=later).set_index(["input", "service"])
    assert lab.loc[("a.example", "pentest"), "outcome"] == 1
    assert lab.loc[("b.example", "soc2"), "outcome"] == 0
    assert lab.loc[("c.example", "pentest"), "outcome"] == 0
    assert not lab["pending"].any()
    early = ev.label_outcomes(snapshot_rows(), outcomes, window_days=90, now=datetime(2026, 1, 15, tzinfo=timezone.utc))
    assert early["pending"].sum() == 3  # everything except the hit is still unknown


def test_metrics_and_weight_fit_on_synthetic_data():
    rng = np.random.default_rng(0)
    n = 300
    sub = pd.DataFrame({k: rng.uniform(0, 10, n) for k in ev.SUBSCORES})
    # ground truth: timing and gap drive buying
    p = 1 / (1 + np.exp(-(0.6 * sub["timing"] + 0.4 * sub["gap"] - 6)))
    df = sub.assign(final=(sub[ev.SUBSCORES] @ pd.Series(ev.CURRENT_WEIGHTS)).round().clip(1, 10),
                    outcome=(rng.uniform(size=n) < p).astype(int), pending=False)
    m = ev.outcome_metrics(df)
    assert 0.5 < m["auc"] <= 1
    fit = ev.fit_weights(df)
    w = fit["suggested_weights"]
    assert w["timing"] > w["pay"] and w["gap"] > w["reach"]
    assert fit["auc_fitted_cv"] > fit["auc_current_weights"]
    yaml = ev.weights_yaml(w)
    nums = [float(x.split(":")[1]) for x in yaml.split("{")[1].rstrip(" }").split(",")]
    assert abs(sum(nums) - 1) < 1e-9


def test_rejects_non_local_api():
    try:
        ev.analyze("x", url="https://example.com/api/analyze")
    except ValueError:
        return
    raise AssertionError("non-local URL accepted")


if __name__ == "__main__":
    tests = [f for name, f in dict(globals()).items() if name.startswith("test_")]
    for t in tests:
        t()
        print("ok", t.__name__)
    print(f"{len(tests)} passed")
