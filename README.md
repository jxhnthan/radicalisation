# Can you spot the signs of radicalisation?

An AI prototype that evaluates whether LLM-based methods can surface radicalisation-vulnerability indicators from synthetic Singaporean personas.

## Contents

- [How it works](#how-it-works)
- [Target audience](#target-audience)
- [1. Problem statement](#1-problem-statement)
- [2. Objectives and rationale](#2-objectives-and-rationale)
- [3. AI integration](#3-ai-integration)
- [4. Data](#4-data)
- [5. Evaluation methodology](#5-evaluation-methodology)
- [6. How to run](#6-how-to-run)
- [7. Results](#7-results)
- [8. Deployment considerations](#8-deployment-considerations)
- [9. Development process](#9-development-process)
- [10. Limitations](#10-limitations)
- [11. Use of AI coding agents](#11-use-of-ai-coding-agents)
- [12. Layout](#12-layout)

---

## How it works

Here's a walkthrough of the whole data pipeline that this project is using:

1. **Obtaining personas.** The initial dataset (obtained from NVIDIA Nemotron) comprises 148k synthetic Singaporeans, each consisting of demographic variables (age, job, hobbies, cultural background) that mirror the real Singaporean population. For feasability purposes, we randomly sample 1,000 individuals for this project.

2. **Make some personas carry risk signals.** We chose not to add new individuals to the existing dataset. Instead, we used a local LLM to rewrite 300 of the 1,000 personas (30%) into three distinct rewrite types, so the resulting labels reflect genuine risk-language detection rather than a classification task to determine if the persona was rewritten. Of the 300 personas, there are 3 main categories:

- 150 "full indicator" personas: rewritten to openly express the complete cluster of radicalisation-vulnerability indicators from existing counter-extremism research: feeling passed over, "the system is rigged," "us vs them" thinking, pulling away from family and friends, distrusting institutions.

- 50 "partial indicator" personas: rewritten with only one or two of these markers embedded subtly, to test sensitivity at the margin rather than only on obvious cases.

- 100 "hard negative" personas: rewritten to sound frustrated, cynical, or withdrawn for ordinary, non-extremism reasons (e.g., generic bureaucratic frustration, burnout, grief-related withdrawal, general political cynicism), without any of the specific vulnerability markers. These exist to test whether the detector overfires on everyday discontent, which is common and not itself a risk signal.

3. **This approach creates a labelled test set.** 700 personas stay unchanged
   (baseline). Detection positives are full + partial indicators (200); 
   negatives are baseline + hard negatives (800). 

4. **Next, we try to detect them.** We extract text features: sentiment, anger and
   negative words, and topics, then test whether a detector can tell the 200
   positive personas apart from the 800 negatives, which signals it relies on,
   and whether it over-fires on the hard negatives.

5. **Finally, we measure accuracy.** we report precision/recall (not accuracy) and
   cross-check a rule-based detector against an LLM judge. Everything is
   synthetic, so the results describe the methods, not real people.

```
148k synthetic personas (Hugging Face)
        |
        v
   1,000-persona sample
        |
        +-- 700 baseline          -> label 0
        |
        +-- 100 hard negatives    -> ordinary discontent, label 0
        |
        +-- 150 full indicators   -> full marker cluster, label 1
        |
        +-- 50 partial indicators -> subtle markers, label 1
        |
        v
detection -> precision/recall + hard-negative false-positive rate
```

---

## Target audience

This project is designed as a public education tool for the **Singaporean public.**

- End users: Members of the Singapore public. The prototype uses a guess-then-reveal format: users read a synthetic persona and indicate how likely they would be to report the individual to ISD. They then see the AI’s assessment and an explanation of the indicators it identified.

- The platform assumes no specialised knowledge. It uses plain language, explains indicators in non-technical terms, and explicitly states that the AI’s assessment is not a diagnosis or definitive determination of radicalisation.

- The goal is to increase awareness and better-informed judgement in helping users distinguish ordinary expressions of dissatisfaction from potential vulnerability indicators, while highlighting the risks of both under-reporting and over-reporting.

---

## 1. Problem statement

How can we develop and evaluate AI-assisted detection of potential radicalisation risk factors when real-world labelled data is difficult to obtain ethically?

- Research on radicalisation and countering violent extremism (CVE) often relies on behavioural data such as social media posts, private messages, and social interaction histories. However, this data is difficult to access responsibly: it may contain highly sensitive personal information, meaningful consent is often impractical, and false identification can have serious consequences. 

- This creates a fundamental challenge for developing and validating AI-based detection methods: reliable, labelled ground-truth data is extremely limited.

- The prototype focuses on indicators such as **grievance, us-versus-them framing, identity-seeking, social isolation, institutional distrust, and moral outrage.**

- To investigate this without using real individuals or personal data, we construct a synthetic labelled dataset using NVIDIA's Nemotron-Personas-Singapore dataset. The dataset contains synthetic personas grounded in Singapore census demographics rather than real individuals. A local LLM rewrites a subset of persona texts to introduce the target risk-factor patterns, while the remaining personas are left unchanged as negative examples.

- This creates a controlled dataset where the presence or absence of each injected risk factor is known by construction. We can therefore evaluate whether AI-based detection methods can identify these patterns, measure where they succeed or fail, and examine the potential for both under-detection and over-detection.

## 2. Objectives and rationale

**Objectives**

1. Construct a labelled synthetic dataset of 1,000 personas across four categories: 700 baseline personas, 100 hard negatives, 150 personas containing multiple indicators, and 50 personas containing partial indicators. A local LLM is used to generate the controlled variations.

2. Extract interpretable text features from each persona, including sentiment, anger and negative-word counts, and topic or indicator markers.

3. Develop and evaluate a detection pipeline that identifies the injected psychosocial indicators, assessing both overall classification performance and which individual indicators are most reliably detected.

4. Translate the findings into a public-education prototype using a guess-then-reveal interface. A pre/post learning check measures whether exposure to the AI's reasoning changes how users assess potential risk. Results are then surfaced to an admin dashboard for longitudinal tracking purposes.

**Rationale**

The source dataset contains synthetic persona descriptions, not observations of real-world behaviour. Therefore, the results cannot establish whether any individual is radicalised, nor should the resulting model be interpreted as a tool for making person-level radicalisation judgements.

Instead, we test a narrower question:
- Can AI detect specific psychosocial indicators associated with radicalisation vulnerability when they appear in text?

We inject these indicators into a controlled subset of synthetic personas, giving us known ground-truth labels without using any real personal data.

Hence, our evaluation is limited to that at an indicator-level and not person-level. Detecting an indicator does not mean that a person is radicalised or poses a threat for society. It only tests whether the AI can identify a predefined textual signal under controlled conditions.

## 3. AI integration
 
- A **local LLM** (Ollama + qwen2.5:7b) generates the positive class: it
  rewrites persona text so the character expresses CVE indicators, returning
  structured JSON.
- A **rule-based scoring stage** (`src/scoring.py`) detects indicators from
  text and is evaluated against the labelled set.
- An **LLM-as-judge stage** (`src/precompute_judgements.py` + the app backend)
  scores the same indicators semantically; the two are cross-checked in the
  evaluation.
- A **web application** (FastAPI + React) demonstrates the detection live in a
  guess-then-reveal public-education format.

Model choice is justified by operational requirements: local inference keeps all persona data on-machine (data-sensitivity framing), avoids API keys and per-token costs at scale, and works within free-tier resource limits. 

The 7B model was chosen over larger/cloud models for speed on the target machine and because the task (rewriting short personas) does not need frontier capacity.

## 4. Data

- **Source:** `nvidia/Nemotron-Personas-Singapore` (Hugging Face), CC BY 4.0.
- **Contents:** 148k synthetic personas modelled on the 2024 Singapore census.
- **Access:** fetched via the Hugging Face datasets-server HTTP API (the
  sanctioned access path; `robots.txt` respected). No bulk download.
- **Local artifacts:** `data/personas_sample_1000.csv` (sample), and
  `data/labelled_personas.csv` (sample + LLM-rewritten positives, label 0/1).
- **Privacy:** fully synthetic; no real individuals; no names in the fields we
  use. No personal information is collected, stored, or transmitted.
- **Licensing:** CC BY 4.0 permits use; NVIDIA is attributed. All derived data
  remains synthetic.
- **Synthetic-data defense:** real radicalisation data is unavailable and
  ethically problematic to collect; synthetic personas from a census-aligned,
  licensed dataset are a safe and high-fidelity substitute for evaluating
  indicator-detection methods.

## 5. Evaluation methodology

The evaluation benchmarks detection against synthetic ground truth and cross-checks a rule-based detector against an LLM-as-judge, reporting performance overall, by cohort, and on hard negatives.

**Why synthetic ground truth and not human evaluation?**
Reliable radicalisation-labelled data is hard to obtain ethically, and there is no objective label a human rater could apply to judge whether a synthetic persona is "radicalised." Instead, our labels are known by construction: indicators are deliberately injected into personas under controlled conditions, making the experiment reproducible and auditable. Person-level human judgement is reserved for the public-education component, not model evaluation.

**Why both a rule-based detector and an LLM judge?**
The rule-based detector gives a transparent, inspectable baseline. The LLM-as-judge tests whether semantic reasoning catches indicators simple rules miss. Since the same LLM family generates the synthetic examples, LLM-judge results are treated as a comparison point rather than ground truth; agreement with the independent rule-based detector guards against relying solely on the generating model.

**Evaluation design**
Three questions drive the design: (1) can the detector catch injected indicators, (2) does it hold up when indicators are subtle or partial, and (3) does it avoid over-flagging personas that merely sound discontented?

- **Primary:** binary detection against ground truth — 200 positives (full + partial indicators) vs. 800 negatives (baseline + hard negatives). We report precision, recall, and the confusion matrix at a pre-specified threshold, not a single aggregate score.
- **Cohort-level:** recall is reported separately for full and partial-indicator personas, since overall performance can mask weak detection of subtler signals.
- **Hard-negative:** false-positive rate is measured on the 100 hard negatives specifically, since over-flagging ordinary discontent is a key risk in a public-facing CVE context.
- **Secondary:** rule-based vs. LLM-judge agreement, measured with Cohen's κ rather than raw agreement, since κ corrects for chance agreement under class imbalance.

## 6. How to run

Two ways to run the app: **Quickstart** (uses the precomputed data in `data/`,
no Ollama or network needed) or **Full reproduction** (rebuilds everything from
the source personas via the local LLM).

### Quickstart - run the app with the precomputed data

```bash
# 1. Python environment (backend deps only)
uv venv --python 3.12 .venv
uv pip install -r backend/requirements.txt

# 2. Backend - serves the precomputed pool; reveal is instant and offline
.venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000

# 3. Frontend (second terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

No Ollama, no network, no dataset rebuild - the labelled set, app pool and
judge analyses are already in `data/`. Personas are not repeated within a
browser session until the pool is exhausted.

### Admin dashboard (prototype)

- **Automatic session submission.** Each session is submitted automatically
  (after each persona rating and quiz completion) as an anonymized row: counts
  and quiz pre/post scores, no PII which is upserted by session id to
  `POST /api/sessions`, stored in `data/admin/sessions.jsonl`.
- **`#/admin`** (or the Admin toggle in the masthead) shows aggregate usage plus
  a paired pre/post significance test for the learning check (Wilcoxon
  signed-rank with Cohen's d) - a small end-to-end collect → analyze → report
  loop that surfaces results immediately.
- **Simulate / Clear sample data** seed the dashboard with 15 `sim-`-prefixed
  sessions (and remove only those) so a reviewer can see the populated report
  without real uploads.

### Full reproduction (optional - rebuilds everything via the local LLM)

Requirements: macOS/Linux, Python 3.12, `uv`, Ollama (`qwen2.5:7b`, ~4.7 GB).

```bash
# 1. Python environment, model, config
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
ollama pull qwen2.5:7b
cp .env.example .env

# 2. Fetch the 1,000-persona sample (network, one time): run the cells in
#    notebooks/01_explore_personas.ipynb -> data/personas_sample_1000.csv

# 3. Generate the 4-class labelled set via the local LLM
.venv/bin/python -m src.build_labelled_set --full 150 --hard 100 --partial 50

# 4. Build the app pool + precompute judge analyses (instant, offline reveal)
.venv/bin/python -m src.rebuild_app_pool --baseline 100
```

**Outputs:** `data/labelled_personas.csv` (labelled set with `class_label`),
`data/injection_log.jsonl` (audit log), and `data/app_pool.csv` +
`data/analyses.json` (app pool + judge analyses). Then run the app as in
Quickstart.

### Run with Docker (recommended for the assessor)

The fastest way to run the full app on a fresh machine - no Python, Node or
Ollama installs required. The precomputed data (app pool + judge analyses) is
baked into the backend image, so the demo runs fully offline; Ollama is only a
fallback for uncached personas and is NOT needed for the demo.

**Prerequisites.** Docker Desktop (macOS/Windows) or Docker Engine + Compose v2
(Linux). Confirm with:

```bash
docker --version
docker compose version
```

**Run it.**

```bash
# From the project root (the folder containing docker-compose.yml):
docker compose up --build     # first build takes a few minutes

# App:   http://localhost:8080
# API:   http://localhost:8000
```

The first build pulls base images and compiles the frontend; later runs can use
`docker compose up` and are much faster.

**Smoke test** (in a second terminal):

```bash
curl http://localhost:8000/api/health                              # {"status":"ok"}
curl http://localhost:8000/api/performance                         # measured metrics
curl "http://localhost:8000/api/persona?session=demo"              # a JSON persona
```

**Manual check.** At http://localhost:8080 you should see the landing page, then
be able to load a persona and get an instant "reveal" (offline, no LLM needed).
The admin dashboard is at http://localhost:8080/#/admin - use its "Simulate"
button to seed sample data and see a populated report.

**Stop / clean up.**

```bash
docker compose down        # stop the containers
docker compose down -v     # also remove named volumes, if any
```

**Troubleshooting.**

- `docker: command not found` - install Docker Desktop (or Docker Engine) and reopen your terminal.
- `Cannot connect to the Docker daemon` - start Docker Desktop first, then run `docker compose up --build`.
- Ports 8080 or 8000 already in use - edit the `ports:` mapping in `docker-compose.yml` (e.g. `"9090:80"` for the frontend) and open the app on the new port; the frontend proxies `/api` to the backend container, so only the frontend port needs to change.
- `ERROR: Cannot locate specified Dockerfile` - you must run `docker compose` from the project root.
- The precomputed `data/` files are required by the build and are committed to the repo - keep them (do not delete or gitignore them).
- Ollama is not required for this path; it is only used as a fallback for uncached personas, or by the optional "Full reproduction" below.
- This repo uses the Compose v2 command `docker compose`, not the legacy `docker-compose`.

**Note on the admin dashboard.** Session rows are stored inside the backend
container (`/app/data/admin/sessions.jsonl`) and reset when the container is
recreated; there is no persistent volume by design. Use the "Simulate" button to
re-seed sample data.

**Verification status.** The backend image was validated by installing
`backend/requirements.txt` into a clean environment and booting the same
endpoints (health / performance / persona / reveal all return 200); the
frontend build stage was validated with `npm run build`. The full
`docker compose up --build` has not been run end-to-end on this machine (Docker
is not installed here), so run the smoke test on first launch.

## 7. Results

Final 4-class set: 700 baseline / 100 hard negatives / 150 full indicators /
50 partial indicators (1,000 total), fully audited (no no-op positives).
Metrics are at the flag threshold (signal >= 3).

- **Rule-based detection** (lexicon scorer, all 1,000): precision 1.00,
  recall 0.06, F1 0.11, ROC-AUC 0.819; over-fired on 0/100 hard negatives.
- **LLM-as-judge detection** (400-persona precomputed pool): precision 1.00,
  recall 0.31, F1 0.47, ROC-AUC 0.793; over-fired on 0/100 hard negatives.
- **Rule-vs-LLM agreement** (400): signal Pearson 0.85, flag Cohen's kappa 0.23.
- **Interpretation:** both detectors are conservative - when they flag, they
  are correct, but they miss most positives (low recall). The key result is the
  over-firing check: neither flags ordinary discontent in the hard negatives.
- **Application:** FastAPI + React guess-then-reveal app working end-to-end,
  with an in-app model-accuracy transparency panel, a pre/post learning check,
  and an admin dashboard for significance testing.
- **Tests:** 12 passing (backend endpoints, no-repeat session serving, admin
  summary + simulate/clear, injection helpers).

## 8. Deployment considerations

**Target user and environment.** The primary user is a member of the Singapore public, accessing the guess-then-reveal tool via browser with no specialist knowledge assumed. A secondary user is an internal reviewer using the `#/admin` dashboard to monitor engagement and learning-check outcomes. The current build targets single-instance deployment (Docker Compose, FastAPI + React) suited to a pilot or exhibit-style rollout, not nationwide scale.

**Inference cost and compute footprint.** The app serves almost entirely from a precomputed pool (`data/app_pool.csv`, `data/analyses.json`), so per-session cost is near zero. The local LLM (Ollama, qwen2.5:7b, ~4.7GB) only runs as a fallback for uncached personas, at roughly 2 to 5 seconds per rewrite on CPU-only hardware. Since no cloud API is called, there is no per-query spend; scaling to higher concurrency would require GPU-backed inference or a larger precomputed pool, a one-time cost rather than a recurring one.

**Monitoring metrics.** Post-deployment we would track: (1) hard-negative false-positive rate on new personas, to catch drift toward over-flagging ordinary discontent; (2) the pre/post learning-check delta (Wilcoxon signed-rank, already computed in the admin dashboard), to confirm the tool keeps improving user judgement; and (3) session completion rate, to detect drop-off mid-flow.

**Deployment risk.** The main risk is misinterpretation: users may read the AI's "reveal" as a validated real-world radicalisation assessment rather than a demonstration of indicator-detection on synthetic text. In-app disclaimers mitigate but cannot fully eliminate this.

## 9. Development process

- **Dataset access.** The Hugging Face `datasets` library download failed and
  was heavy; switched to the datasets-server HTTP API (lightweight, paginated),
  then to a growable local cache.
- **Injection approach.** Rule-based template injection was considered (free,
  deterministic) but rejected in favour of LLM rewriting for more natural text.
- **Model selection.** Local Ollama/qwen2.5:7b chosen over cloud APIs for
  privacy framing, no keys, and free-tier cost; a smaller model was considered
  for speed but kept at 7B to preserve rewrite quality.
- **Prompt iteration.** The prompt went through v1–v4. v1 produced bland text
  with indicators only in the notes field; later versions added an explicit
  before/after example and short-output constraints so indicators are visible in
  the text. Verified via before/after review of the audit log.
- **Observability.** Added incremental CSV writes and flushed progress so long
  local runs are observable instead of writing only at the end.
- **Discarded:** bulk parquet download (heavy), the `datasets` library (rate
  limits), and cloud LLM APIs (keys/cost). A Streamlit front-end was also
  considered and replaced by the React app.

## 10. Limitations

- **Synthetic data only.** Every persona is machine-generated and the
  evaluation runs entirely on this synthetic set. The results describe how well
  the methods detect injected textual patterns & they say nothing about real
  individuals and cannot be used to identify or assess any actual person.
- **No real ground truth.** The source dataset contains no labels for
  radicalisation; the positive class is created by rewriting personas to express
  CVE indicators. Detection therefore measures recognition of the injected
  markers, not a real-world phenomenon, and both positive and negative cases
  reflect the LLM's writing style.
- **Religious ideology out of scope.** The source dataset excludes religious
  personas, so religiously framed pathways to radicalisation (a common CVE
  theme) are not represented. Results may not generalise to content that draws
  on religious narratives.
- **Small positive class and single model.** Only 100 personas carry full or
  partial indicators, and all rewrites come from one local 7B model. The small
  positive class gives detection metrics wide confidence intervals, and any
  quirks in the 7B model's writing style may leak into both the data and the
  LLM-as-judge evaluation.
- **Indicators are not harmful content.** The injected markers are
  vulnerability signals from CVE research, not hate speech or violent
  advocacy. The detector is not a content-moderation tool, and a detected
  indicator is not evidence of intent or harm.

## 11. Use of AI coding agents

AI coding agents were used for two specific, bounded tasks: static-analysis remediation and API component construction. Methodology, evaluation design, and dataset construction (Sections 2, 4, 5) were reasoned manually and are not part of this disclosure.

**1. SonarQube issue triage and remediation.**
The codebase was scanned with SonarQube, and an AI agent was used to work through the flagged issues across the Python (`src/`, `backend/`) and JavaScript/React (`frontend/src/`) files. The agent's role was to:
- Explain each flagged issue (code smell, potential bug, security hotspot, duplication) in context.
- Propose a fix consistent with the surrounding code style.
- Apply the fix, which was then re-scanned to confirm the issue cleared without introducing a new one.

Every proposed fix was reviewed before acceptance rather than applied blind, particularly for flags touching `src/scoring.py` and `src/evaluate.py`, where a careless "fix" could silently change scoring or metric logic. Fixes that were purely stylistic (unused imports, naming conventions, duplicate string literals) were accepted with lighter review than fixes touching control flow or data handling.

**2. API component construction.**
An AI agent assisted in building out the FastAPI backend (`backend/app.py`) endpoints and the corresponding frontend API client (`frontend/src/api.js`) — request/response schemas, route handlers for persona serving and session submission, and the `/api/health` and `/api/performance` endpoints. 

This was verified rather than trusted outright: each endpoint was smoke-tested manually (`curl` checks returning 200, confirmed in Section 6/7), and the session-submission and no-repeat-serving logic was covered by the backend test suite (`tests/test_backend.py`) to confirm behaviour matched intent, not just that the endpoint returned without error.

## 12. Layout

```
radicalisation/
├── README.md                    # primary artifact (this file)
├── requirements.txt             # data-pipeline deps
├── LICENSE
├── docker-compose.yml           # app + API containers
├── .gitignore / .dockerignore / .env.example
├── prompts/
│   ├── indicator_injection.md   # full-indicator rewrite prompt
│   ├── partial_indicator_injection.md
│   ├── hard_negative_injection.md
│   └── indicator_judge.md       # LLM-as-judge scoring prompt
├── notebooks/
│   └── 01_explore_personas.ipynb  # fetch + explore the sample
├── data/
│   ├── personas_sample_1000.csv
│   ├── labelled_personas.csv
│   ├── app_pool.csv             # personas served by the app
│   ├── analyses.json            # precomputed LLM-judge results
│   ├── evaluation_results.json  # detector metrics
│   ├── injection_log.jsonl      # audit log of LLM rewrites
│   └── admin/sessions.jsonl     # auto-submitted sessions (anonymized)
├── backend/
│   ├── app.py                   # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── index.html
│   ├── vite.config.js           # dev server + /api proxy
│   ├── public/badges/           # reward badge images
│   ├── src/
│   │   ├── App.jsx              # main React UI
│   │   ├── AdminDashboard.jsx   # #/admin significance dashboard
│   │   ├── PreCheck.jsx         # pre-game baseline check
│   │   ├── LearningCheck.jsx    # post-check + comparison
│   │   ├── QuizRunner.jsx       # 1-at-a-time quiz widget
│   │   ├── quiz.js              # scenarios + scoring
│   │   ├── icons.jsx            # inline SVG icons
│   │   └── api.js / index.css / main.jsx
│   ├── Dockerfile / nginx.conf
│   └── package.json / package-lock.json
├── tests/
│   ├── test_backend.py
│   └── test_inject.py
└── src/
    ├── build_labelled_set.py    # 4-class labelled set (LLM rewrites)
    ├── data_loader.py           # datasets-server API loader
    ├── llm_client.py            # OpenAI-compatible client (Ollama / any endpoint)
    ├── inject_indicators.py     # selection + LLM rewriting -> labelled set
    ├── precompute_judgements.py # precompute LLM-judge analyses
    ├── rebuild_app_pool.py      # app pool + incremental judge analyses
    ├── scoring.py               # rule-based indicator scorer
    └── evaluate.py              # precision/recall/agreement on the labelled set
```


