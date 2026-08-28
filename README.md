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
- [12. Layout](#13-layout)

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

- The interface assumes no specialist knowledge. It uses plain language, explains indicators in non-technical terms, and makes clear that the AI’s assessment is not a diagnosis or definitive determination of radicalisation.

- The goal is awareness and better-informed judgement: helping users distinguish ordinary expressions of dissatisfaction from potential vulnerability indicators, while highlighting the risks of both under-reporting and over-reporting.

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

We inject these indicators into a controlled subset of synthetic personas, giving us known ground-truth labels without using real personal data.

The evaluation is therefore indicator-level, not person-level. Detecting an indicator does not mean that a person is radicalised or poses a threat. It only tests whether the AI can identify a predefined textual signal under controlled conditions

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

The evaluation combines a benchmark against synthetic ground truth with a cross-method comparison between a deterministic rule-based detector and an LLM-as-judge. Performance is assessed both overall and across the four cohorts, with particular attention to false positives on hard negatives.

**(5.1) Why synthetic ground truth?**
Reliable labelled data on radicalisation is extremely difficult to obtain ethically. Real-world datasets may contain sensitive personal information, while establishing whether an individual is genuinely “radicalised” is itself a difficult and consequential labelling task. 

In contrast, our labels are known by construction: the target indicators are deliberately injected into synthetic personas under controlled conditions. This makes the experiment reproducible, auditable, and suitable for testing the detection methodology.

**(5.2) Why not human evaluation?**
Human evaluation would not solve the underlying ground-truth problem. There is no objective label against which human raters could reliably classify these synthetic personas as “radicalised.”

More importantly, asking people to make person-level radicalisation judgements would conflict with the project's focus on avoiding misidentification. 

Human assessment is therefore used for the public-education component, rather than as the ground truth for model evaluation.

**(5.3) Why a rule-based baseline and an LLM judge?**
The rule-based detector provides a transparent and deterministic baseline whose decisions can be directly inspected. The LLM-as-judge then tests whether semantic reasoning can identify indicators that simple rules may miss. Because the LLM is also involved in generating the synthetic examples, the LLM-based results are treated as a comparison rather than as authoritative ground truth. Agreement with the independent rule-based approach provides an additional check against relying solely on the generating model.

**(5.4) Evaluation design**

The evaluation is designed to answer three questions:

1. Can the detector identify personas containing the injected indicators?
2. Does it still work when indicators are subtle or incomplete?
3. Does it avoid over-flagging personas that appear concerning but do not contain the target indicators?

**Primary evaluation**
The primary task is binary detection against the synthetic ground truth:
- Positive: 200 personas containing full or partial indicators
- Negative: 800 personas comprising baseline and hard-negative cases

We report precision, recall, and the full confusion matrix at a pre-specified operating threshold, rather than relying on a single aggregate score.

**Cohort-level evaluation:**
Overall performance can hide weaknesses on less obvious cases. We therefore report recall separately for the full-indicator and partial-indicator cohorts.

This tests whether the detector can identify weaker or incomplete signals, rather than succeeding only when multiple indicators are clearly present.

**Hard-negative evaluation:**
We separately measure the false-positive rate on the 100 hard-negative personas.
Hard negatives are designed to contain potentially concerning language without the target psychosocial indicators. This provides a focused test of over-flagging, which is particularly important in a public-facing CVE education context.

**Secondary comparison:**
We compare the rule-based detection pipeline with an LLM-as-judge approach. Agreement is measured using Cohen's κ (kappa) rather than raw percentage agreement, as kappa accounts for agreement that could occur by chance under class imbalance.

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

### Run with Docker (no local installs needed)

The precomputed data (app pool + judge analyses) is baked into the backend
image, so the demo runs fully offline; Ollama is only a fallback for uncached
personas.

```bash
docker compose up --build     # first build takes a few minutes
# app:   http://localhost:8080
# api:   http://localhost:8000

# smoke test
curl http://localhost:8000/api/health        # {"status":"ok"}
curl http://localhost:8000/api/performance   # measured metrics
```

Verification status: the backend image was validated by installing
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

WIP

## 12. Layout

```
radicalisation/
├── README.md                    # primary artifact (this file)
├── requirements.txt             # data-pipeline deps
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
│   └── admin/sessions.jsonl     # auto-submitted sessions (anonymized)
├── backend/
│   ├── app.py                   # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── public/badges/           # reward badge images
│   ├── src/
│   │   ├── App.jsx              # main React UI
│   │   ├── AdminDashboard.jsx   # #/admin significance dashboard
│   │   ├── PreCheck.jsx         # pre-game baseline check
│   │   ├── LearningCheck.jsx    # post-check + comparison
│   │   ├── QuizRunner.jsx       # 1-at-a-time quiz widget
│   │   ├── quiz.js              # scenarios + scoring
│   │   ├── api.js / index.css / main.jsx
│   │   └── ...
│   ├── Dockerfile / nginx.conf
│   └── package.json
├── tests/
│   ├── test_backend.py
│   └── test_inject.py
└── src/
    ├── data_loader.py           # datasets-server API loader
    ├── llm_client.py            # OpenAI-compatible client (Ollama / any endpoint)
    ├── inject_indicators.py     # selection + LLM rewriting -> labelled set
    ├── precompute_judgements.py # precompute LLM-judge analyses
    ├── scoring.py               # rule-based indicator scorer
    └── evaluate.py              # precision/recall/agreement on the labelled set
```


