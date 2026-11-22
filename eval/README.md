# Scoring evaluation

Checks whether the copilot's 1–10 scores predict which projects actually buy security services.
The full walkthrough is in [`scoring_eval.ipynb`](scoring_eval.ipynb); the logic is in [`evaluate.py`](evaluate.py).

| Step | When | What you need |
|---|---|---|
| Snapshot | now | the copilot running locally |
| Expert check | now | your own A/B/C call per project in `projects.csv` |
| Outcome check | after 60–90 days | what projects did, in `outcomes.csv` |
| Weight tuning | once there are 20+ outcomes | the above |

Snapshots are scored *before* outcomes happen, so the evaluation can't peek at the answer.

## Setup

```bash
cd eval
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
jupyter notebook scoring_eval.ipynb
```

Start the copilot first (`npm run dev` in the project folder).

Tests (fictional data): `.venv\Scripts\python test_evaluate.py`

## Files

- `projects.csv` — projects to score, plus your labels (`bd_priority`: A/B/C, `bd_service`, `notes`)
- `outcomes.csv` — what happened after the snapshot (`input, service, event_date, kind, source_url`)
- `snapshots/` — saved scores, one CSV per run. **Git-ignored**: briefs include people's names.

Clear notebook outputs before committing for the same reason.
