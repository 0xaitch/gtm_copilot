"""
Scoring evaluation helpers for the Security GTM Copilot.

Two kinds of ground truth:
  1. Expert labels (available now): your own BD judgment of each lead (A/B/C).
     Measures agreement, and surfaces disagreements worth reviewing.
  2. Outcomes (available later): what the project actually did after the snapshot
     (announced an audit, replied, booked a call...). Measures whether scores predict buying.

Why snapshots: scoring a project today and comparing it with what it did *last* month leaks the
answer (a fresh audit already lowers the audit score). So we save scores with a timestamp and
only count outcomes that happen AFTER that timestamp.

The copilot API must be running locally (npm run dev → http://127.0.0.1:3000).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

API_URL = "http://127.0.0.1:3000/api/analyze"
SUBSCORES = ["need", "gap", "timing", "pay", "reach"]
CURRENT_WEIGHTS = {"need": 0.30, "gap": 0.25, "timing": 0.25, "pay": 0.10, "reach": 0.10}
TIERS = {"A": 8, "B": 6}  # same as the rubrik: A >= 8, B >= 6, else C
TIER_RANK = {"A": 3, "B": 2, "C": 1}


def tier_of(score: float) -> str:
    return "A" if score >= TIERS["A"] else "B" if score >= TIERS["B"] else "C"


# ---------------------------------------------------------------- collecting

def analyze(project: str, url: str = API_URL, timeout: int = 180) -> dict:
    """One analysis via the local API. Only talks to the local server."""
    if not url.startswith(("http://127.0.0.1", "http://localhost")):
        raise ValueError("API_URL must point at the local copilot server")
    r = requests.post(url, json={"input": project}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def flatten(result: dict, project: str, snapshot_at: str) -> list[dict]:
    """One row per scored service. Halted projects get a single row with no service."""
    p = result.get("project") or {}
    prof = result.get("profile") or {}
    warnings = result.get("warnings") or []
    base = {
        "input": project,
        "snapshot_at": snapshot_at,
        "name": p.get("name"),
        "website": p.get("website"),
        "segments": ",".join(prof.get("segments") or []),
        "stage": prof.get("stage"),
        "tvl_usd": prof.get("tvlUsd"),
        "halted": bool(result.get("halted")),
        "halt_reason": (result.get("halted") or {}).get("reason"),
        "thin_data": any("could not be fetched" in w or "results will be thin" in w for w in warnings),
        "n_warnings": len(warnings),
    }
    briefs = {b["service"]: b for b in result.get("briefs") or []}
    scores = result.get("scores") or []
    if not scores:
        return [{**base, "service": None}]
    rows = []
    for s in scores:
        b = briefs.get(s["service"], {})
        people = [d for d in b.get("decisionMakers", []) if d.get("found")]
        rows.append({
            **base,
            "service": s["service"],
            "final": s["final"],
            "raw": s["raw"],
            **{k: s["sub"][k] for k in SUBSCORES},
            "cap": s.get("capApplied"),
            "confidence": s["confidence"],
            "priority": b.get("priority") or tier_of(s["final"]),
            "n_dated_why_now": sum(1 for w in b.get("whyNow", []) if w.get("date")),
            "n_people_strong": sum(1 for d in people if d.get("affiliation") == "strong"),
            "n_people_medium": sum(1 for d in people if d.get("affiliation") == "medium"),
        })
    return rows


def run_snapshot(projects: list[str], path: Path, url: str = API_URL, pause_s: float = 2.0) -> pd.DataFrame:
    """
    Score every project and append to a CSV. Resumable: projects already in the file are skipped,
    so you can stop and rerun. Requests are sequential and paced to be gentle on free data sources.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    done = set(pd.read_csv(path)["input"]) if path.exists() else set()
    todo = [p for p in projects if p not in done]
    for i, project in enumerate(todo, 1):
        at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            rows = flatten(analyze(project, url), project, at)
        except Exception as e:  # keep going; record the failure
            rows = [{"input": project, "snapshot_at": at, "halted": True, "halt_reason": f"request failed: {type(e).__name__}", "service": None}]
        pd.DataFrame(rows).to_csv(path, mode="a", header=not path.exists(), index=False)
        print(f"[{i}/{len(todo)}] {project}: {len([r for r in rows if r.get('service')])} services scored")
        time.sleep(pause_s)
    return pd.read_csv(path)


# ---------------------------------------------------------------- data health

def health(snap: pd.DataFrame) -> pd.Series:
    """How much the copilot could actually see — low coverage means low-trust scores."""
    per_project = snap.groupby("input").agg(
        halted=("halted", "max"),
        thin=("thin_data", "max"),
        people=("n_people_strong", "max"),
        dated=("n_dated_why_now", "max"),
    )
    ok = per_project[~per_project["halted"].astype(bool)]
    return pd.Series({
        "projects": len(per_project),
        "halted": int(per_project["halted"].astype(bool).sum()),
        "thin data (of analysed)": int(ok["thin"].astype(bool).sum()),
        "≥1 strong decision maker": int((ok["people"].fillna(0) > 0).sum()),
        "≥1 dated why-now event": int((ok["dated"].fillna(0) > 0).sum()),
    })


# ---------------------------------------------------------------- expert agreement

def top_service(snap: pd.DataFrame) -> pd.DataFrame:
    """The copilot's best pitch per project: highest-scoring service."""
    scored = snap.dropna(subset=["service"]).sort_values("final", ascending=False, kind="stable")
    return scored.drop_duplicates("input").reset_index(drop=True)  # whole row, not first-non-null per column


def expert_agreement(snap: pd.DataFrame, labels: pd.DataFrame) -> dict:
    """
    Compare the copilot's top tier per project with your own A/B/C call (`bd_priority`)
    and, if given, your best service (`bd_service`).
    """
    top = top_service(snap)[["input", "name", "service", "final", "priority", "confidence"]]
    lab = labels.dropna(subset=["bd_priority"]).copy()
    if lab.empty:
        return {"n": 0}
    lab["bd_priority"] = lab["bd_priority"].astype(str).str.strip().str.upper()
    df = top.merge(lab, on="input", how="inner")
    if df.empty:
        return {"n": 0}
    df["copilot_rank"] = df["priority"].map(TIER_RANK)
    df["bd_rank"] = df["bd_priority"].map(TIER_RANK)
    out = {
        "n": len(df),
        "tier_match_rate": float((df["priority"] == df["bd_priority"]).mean()),
        "within_one_tier": float(((df["copilot_rank"] - df["bd_rank"]).abs() <= 1).mean()),
        "spearman": float(df[["final", "bd_rank"]].corr(method="spearman").iloc[0, 1]) if df["bd_rank"].nunique() > 1 else float("nan"),
        "confusion": pd.crosstab(df["bd_priority"].rename("you"), df["priority"].rename("copilot")),
        "disagreements": df[df["priority"] != df["bd_priority"]].sort_values("final", ascending=False),
    }
    if "bd_service" in df and df["bd_service"].notna().any():
        has = df.dropna(subset=["bd_service"])
        out["service_match_rate"] = float((has["service"] == has["bd_service"].astype(str).str.strip()).mean())
    return out


# ---------------------------------------------------------------- outcomes

def label_outcomes(snap: pd.DataFrame, outcomes: pd.DataFrame, window_days: int = 90,
                   now: datetime | None = None) -> pd.DataFrame:
    """
    For each (project, service) row: did a matching outcome happen within `window_days` AFTER
    the snapshot? Rows whose window hasn't closed and have no outcome yet are marked pending
    and excluded from metrics (we don't know the answer yet).
    An outcome with service "*" counts for every service (e.g. "replied to outreach").
    """
    now = now or datetime.now(timezone.utc)
    rows = snap.dropna(subset=["service"]).copy()
    rows["snapshot_at"] = pd.to_datetime(rows["snapshot_at"], utc=True)
    oc = outcomes.dropna(subset=["input", "event_date"]).copy()
    oc["event_date"] = pd.to_datetime(oc["event_date"], utc=True)
    window = pd.Timedelta(days=window_days)

    def hit(r) -> bool:
        m = oc[(oc["input"] == r["input"]) & (oc["service"].isin([r["service"], "*"]))]
        return bool(((m["event_date"] > r["snapshot_at"]) & (m["event_date"] <= r["snapshot_at"] + window)).any())

    rows["outcome"] = rows.apply(hit, axis=1).astype(int)
    rows["window_closed"] = rows["snapshot_at"] + window <= now
    rows["pending"] = (rows["outcome"] == 0) & ~rows["window_closed"]
    return rows


def outcome_metrics(labelled: pd.DataFrame, k: int = 10) -> dict:
    """AUC, precision of the top-k scores, and hit rate by score band."""
    from sklearn.metrics import roc_auc_score

    df = labelled[~labelled["pending"]]
    if df.empty or df["outcome"].nunique() < 2:
        return {"n": len(df), "positives": int(df["outcome"].sum()) if len(df) else 0,
                "note": "need both outcomes and non-outcomes with closed windows to measure"}
    top = df.sort_values("final", ascending=False).head(k)
    bands = pd.cut(df["final"], bins=[0, 3, 5, 7, 10], labels=["1–3", "4–5", "6–7", "8–10"])
    return {
        "n": len(df),
        "positives": int(df["outcome"].sum()),
        "base_rate": float(df["outcome"].mean()),
        "auc": float(roc_auc_score(df["outcome"], df["final"])),
        f"precision@{k}": float(top["outcome"].mean()),
        "hit_rate_by_band": df.groupby(bands, observed=False)["outcome"].agg(["count", "mean"]),
    }


def fit_weights(labelled: pd.DataFrame, min_positives: int = 20, seed: int = 0) -> dict:
    """
    Learn which sub-scores actually predict outcomes (logistic regression), and compare
    cross-validated AUC of current weights vs fitted ones. Suggested weights are the positive
    coefficients rescaled to sum to 1 — a starting point for the rubrik, not a replacement for judgment.
    """
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import StratifiedKFold

    df = labelled[~labelled["pending"]].dropna(subset=SUBSCORES)
    pos = int(df["outcome"].sum()) if len(df) else 0
    if pos < 2 or pos == len(df):
        return {"note": "not enough outcomes yet to fit weights", "positives": pos}
    X, y = df[SUBSCORES].to_numpy(float), df["outcome"].to_numpy(int)
    current = X @ np.array([CURRENT_WEIGHTS[k] for k in SUBSCORES])

    folds = StratifiedKFold(n_splits=min(5, pos, len(df) - pos), shuffle=True, random_state=seed)
    fitted_pred = np.zeros(len(y))
    for train, test in folds.split(X, y):
        m = LogisticRegression(C=1.0, max_iter=1000).fit(X[train], y[train])
        fitted_pred[test] = m.predict_proba(X[test])[:, 1]

    model = LogisticRegression(C=1.0, max_iter=1000).fit(X, y)
    coef = np.clip(model.coef_[0], 0, None)
    suggested = coef / coef.sum() if coef.sum() > 0 else np.array([CURRENT_WEIGHTS[k] for k in SUBSCORES])
    out = {
        "n": len(df),
        "positives": pos,
        "auc_current_weights": float(roc_auc_score(y, current)),
        "auc_fitted_cv": float(roc_auc_score(y, fitted_pred)),
        "coefficients": dict(zip(SUBSCORES, model.coef_[0].round(3))),
        "suggested_weights": dict(zip(SUBSCORES, suggested.round(2))),
    }
    if pos < min_positives:
        out["warning"] = f"only {pos} positive outcomes — treat suggested weights as a hint, not a result"
    return out


def weights_yaml(weights: dict) -> str:
    """Rubrik snippet (weights rounded; the schema requires they sum to 1)."""
    w = {k: round(float(v), 2) for k, v in weights.items()}
    w[max(w, key=w.get)] += round(1 - sum(w.values()), 2)  # absorb rounding
    return "scoring:\n  weights: { " + ", ".join(f"{k}: {w[k]:.2f}" for k in SUBSCORES) + " }"
