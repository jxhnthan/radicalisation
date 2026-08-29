import { useEffect, useRef, useState } from 'react'
import { fetchPersona, fetchPerformance, revealPersona, submitSession, SESSION_KEY } from './api.js'
import AdminDashboard from './AdminDashboard.jsx'
import { DownloadIcon, ResetIcon, ChartIcon, WrenchIcon, CloseIcon } from './icons.jsx'
import Landing from './Landing.jsx'
import LearningCheck from './LearningCheck.jsx'
import PreCheck from './PreCheck.jsx'
import { loadQuiz, normalizeQuiz, saveQuiz, scoreQuiz, POST_KEY, PRE_KEY, SKIP_KEY } from './quiz.js'
import './index.css'

const FACTOR_LABELS = {
  grievance: 'Grievance',
  us_vs_them: 'Us vs them',
  identity_seeking: 'Identity seeking',
  social_isolation: 'Social isolation',
  institutional_distrust: 'Institutional distrust',
  moral_outrage: 'Moral outrage',
}

const FACTOR_EXPLANATIONS = {
  grievance: 'Feeling treated unfairly or passed over, and dwelling on it.',
  us_vs_them: '"Them vs us" thinking that divides people into in-groups and out-groups.',
  identity_seeking: 'Searching for a cause, meaning or belonging.',
  social_isolation: 'Withdrawing from family, friends or community.',
  institutional_distrust: 'Believing the system or authorities are rigged or untrustworthy.',
  moral_outrage: 'Intense anger at a perceived injustice.',
}

const PERSONA_FIELDS = [
  ['persona', 'About'],
  ['cultural_background', 'Background'],
  ['hobbies_and_interests', 'Interests'],
  ['career_goals_and_ambitions', 'Career'],
]

const RATING_OPTIONS = [
  { v: 1, label: 'Not likely' },
  { v: 2, label: 'Unlikely' },
  { v: 3, label: 'Unsure' },
  { v: 4, label: 'Likely' },
  { v: 5, label: 'Very likely' },
]

function classShort(gt) {
  const map = {
    baseline: 'None',
    hard_negative: 'Hard negative',
    full_indicator: 'Full',
    partial_indicator: 'Partial',
  }
  return map[gt.class_label] || gt.class_label || 'Unknown'
}

function classExplain(gt) {
  const map = {
    baseline: 'No indicators (untouched baseline)',
    hard_negative: 'Hard negative - ordinary discontent, no risk markers',
    full_indicator: 'Full indicators injected',
    partial_indicator: 'Partial indicators injected',
  }
  return map[gt.class_label] || gt.class_label || 'No indicators'
}

const BADGES = [
  { name: 'Bronze', img: '/badges/bronze.png', need: 3 },
  { name: 'Silver', img: '/badges/silver.png', need: 8 },
  { name: 'Gold', img: '/badges/gold.png', need: 15 },
]

const STORAGE_KEY = 'radicalisation-aw-stats'
const WELCOME_KEY = 'radicalisation-aw-welcome'
const EMPTY_STATS = { rated: 0, correct: 0, falseAlarm: 0, miss: 0, streak: 0, bestStreak: 0 }

const VOUCHER_KEY = 'radicalisation-aw-vouchers'

const MERCH = {
  Bronze: { item: 'ISD canvas tote bag' },
  Silver: { item: 'ISD steel water bottle' },
  Gold: { item: 'ISD black hoodie' },
}

// Voucher codes are generated client-side from a seeded hash so each unlock
// produces a stable, unique-looking code for the gamification concept.
// Character set excludes 0/O/1/I to avoid ambiguity.
const VOUCHER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function seedFor(name) {
  // FNV-1a hash of the name -> a stable 32-bit seed.
  let h = 2166136261
  for (const c of name) {
    h ^= c.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function makeVoucherCode(seed) {
  // Deterministic voucher codes: hash the seed with a per-position salt to pick
  // characters, so the same badge always yields the same code (no PRNG needed).
  const block = (salt) =>
    Array.from({ length: 4 }, (_, i) => {
      const h = seedFor(`${seed}:${salt}:${i}`)
      return VOUCHER_CHARS[h % VOUCHER_CHARS.length]
    }).join('')
  return `ISD-${block(0)}-${block(1)}`
}

function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch (e) {
    // localStorage can be unavailable (private/restricted mode) - degrade.
    console.warn('localStorage unavailable:', e)
    return null
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    console.warn('localStorage unavailable:', e)
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    console.warn('localStorage unavailable:', e)
  }
}

function loadVouchers() {
  const raw = storageGet(VOUCHER_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    console.warn('corrupt voucher data:', e)
    return {}
  }
}

function saveVouchers(vouchers) {
  storageSet(VOUCHER_KEY, JSON.stringify(vouchers))
}

function loadStats() {
  const raw = storageGet(STORAGE_KEY)
  if (!raw) return { ...EMPTY_STATS }
  try {
    return { ...EMPTY_STATS, ...JSON.parse(raw) }
  } catch (e) {
    console.warn('corrupt stats data:', e)
    return { ...EMPTY_STATS }
  }
}

function saveStats(stats) {
  storageSet(STORAGE_KEY, JSON.stringify(stats))
}

function classifyCall(guess, gt) {
  const wouldReport = guess >= 4
  const isPositive = gt.label === 1
  if (wouldReport && isPositive) return 'hit'
  if (wouldReport && !isPositive) return 'false_alarm'
  if (!wouldReport && isPositive) return 'miss'
  return 'correct_no'
}

function applyStats(prev, call) {
  const next = { ...prev, rated: prev.rated + 1 }
  if (call === 'hit' || call === 'correct_no') {
    next.correct += 1
    next.streak += 1
    next.bestStreak = Math.max(next.bestStreak, next.streak)
  } else {
    if (call === 'false_alarm') next.falseAlarm += 1
    else next.miss += 1
    next.streak = 0
  }
  return next
}

function calibrationText(guess, gt) {
  const call = classifyCall(guess, gt)
  const said = guess >= 4 ? 'would report' : 'would not report'
  const truth = gt.label === 1 ? 'indicators present' : 'no indicators'
  const map = {
    hit: `Correct - you ${said}, and there were ${truth}.`,
    correct_no: `Correct - you ${said}, and there were ${truth}.`,
    false_alarm: `False alarm - you ${said}, but there were ${truth}. You over-reported.`,
    miss: `Missed - you ${said}, but there were ${truth}. You under-reported.`,
  }
  return map[call]
}

function pct(x) {
  if (typeof x !== 'number') return '–'
  return `${Math.round(x * 100)}%`
}

// The app's "AI" reveal uses the LLM judge, so show its measured accuracy when
// available; fall back to the rule-based numbers.
function perfPrimary(perf) {
  const j = perf?.llm_judge
  if (j && typeof j === 'object' && typeof j.precision === 'number') {
    return { ...j, fpRate: perf.hard_negative_fp_rate?.llm_judge }
  }
  const r = perf?.rule_based
  if (r && typeof r === 'object' && typeof r.precision === 'number') {
    return { ...r, fpRate: perf.hard_negative_fp_rate?.rule_based }
  }
  return null
}

function downloadBlob(text, filename, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportSession(stats, vouchers, format) {
  const date = new Date().toISOString().slice(0, 10)
  const quizPre = loadQuiz(PRE_KEY)
  const quizPost = loadQuiz(POST_KEY)
  if (format === 'csv') {
    const rows = [
      ['field', 'value'],
      ...Object.entries(stats),
      ...Object.entries(vouchers).map(([name, v]) => [`voucher_${name}`, v.code]),
      ['quiz_pre', JSON.stringify(quizPre)],
      ['quiz_post', JSON.stringify(quizPost)],
      ['exported_at', new Date().toISOString()],
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    downloadBlob(csv, `radicalisation-session-${date}.csv`, 'text/csv')
  } else {
    const payload = {
      exported_at: new Date().toISOString(),
      stats,
      vouchers,
      quiz_pre: quizPre,
      quiz_post: quizPost,
    }
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `radicalisation-session-${date}.json`,
      'application/json'
    )
  }
}

function Masthead({ isAdmin, onToggleAdmin, toolsOpen, setToolsOpen }) {
  return (
    <header style={s.masthead}>
      <div style={s.brandRow}>
        <span style={s.brand}>ISD</span>
        <span style={s.brandSub}>Internal Security Department</span>
        <span style={s.badge}>Public-education prototype</span>
        <button type="button" onClick={onToggleAdmin} style={isAdmin ? s.adminToggleOn : s.adminToggle}>
          {isAdmin ? 'View app' : 'Admin'}
        </button>
        {!isAdmin && (
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            style={s.toolsToggle}
            aria-expanded={toolsOpen}
            aria-controls="tools-panel"
            title="Tools and session actions"
            aria-label="Tools and session actions"
          >
            <WrenchIcon />
          </button>
        )}
      </div>
      <h1 style={s.h1}>Spotting the signs of radicalisation</h1>
      <p className="sub-line" style={s.sub}>
        Users read a synthetic persona and select which textual patterns, if any, they believe are present. They can also select "insufficient information for a person-level judgement."
      </p>
      <p className="sub-line" style={s.subNote}>
        The reveal screen compares their selections with the prototype's indicator-level analysis and explains why text alone cannot support an assessment of a real person.
      </p>
      <div style={s.caveatBox}>
        <span style={s.caveatIcon} aria-hidden="true">
          ⓘ
        </span>
        <span style={s.caveatText}>
          Names are synthetic placeholders and may differ between fields.
          Personas come from the{' '}
          <a
            href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Singapore"
            target="_blank"
            rel="noreferrer"
            style={s.caveatLink}
          >
            Nemotron-Personas-Singapore
          </a>{' '}
          dataset (CC BY 4.0).
        </span>
      </div>
    </header>
  )
}

function ToolsSidebar({ onClose, onExportJson, onExportCsv, onReset }) {
  return (
    <>
      <div style={s.sidebarOverlay} onClick={onClose} aria-hidden="true" />
      <aside id="tools-panel" style={s.sidebar} aria-label="Tools">
        <div style={s.sidebarHead}>
          <span style={s.sidebarTitle}>
            <WrenchIcon /> Tools
          </span>
          <button
            type="button"
            onClick={onClose}
            style={s.sidebarClose}
            title="Close"
            aria-label="Close tools"
          >
            <CloseIcon />
          </button>
        </div>
        <div style={s.sidebarBody}>
          <button type="button" onClick={onExportJson} style={s.exportBtn} title="Download session as JSON">
            <DownloadIcon /> Export JSON
          </button>
          <button type="button" onClick={onExportCsv} style={s.exportBtn} title="Download session as CSV">
            <DownloadIcon /> Export CSV
          </button>
          <button type="button" onClick={onReset} style={s.resetBtn} title="Reset this session">
            <ResetIcon /> Reset
          </button>
          <a href="#/admin" style={s.exportLink} title="Admin dashboard">
            <ChartIcon /> Admin
          </a>
        </div>
      </aside>
    </>
  )
}

function StatsBar({ stats }) {
  return (
    <div style={s.statsBar}>
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statNum}>{stats.rated}</div>
          <div style={s.trackLabel}>Rated</div>
        </div>
        <div style={s.statCard}>
          <div
            style={{ ...s.statNum, ...(stats.correct > 0 ? s.numAccent : {}) }}
          >
            {stats.correct}
          </div>
          <div style={s.trackLabel}>Correct</div>
        </div>
        <div style={s.statCard}>
          <div
            style={{ ...s.statNum, ...(stats.falseAlarm > 0 ? s.numRed : {}) }}
          >
            {stats.falseAlarm}
          </div>
          <div style={s.trackLabel}>False alarms</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statNum, ...(stats.miss > 0 ? s.numRed : {}) }}>
            {stats.miss}
          </div>
          <div style={s.trackLabel}>Missed</div>
        </div>
        <div
          style={{ ...s.statCard, ...(stats.streak > 0 ? s.streakCard : {}) }}
        >
          <div style={{ ...s.statNum, ...(stats.streak > 0 ? s.streakNum : {}) }}>
            {stats.streak}
          </div>
          <div style={s.trackLabel}>Streak</div>
        </div>
      </div>
    </div>
  )
}

function RewardsCard({ stats, vouchers, openVoucher, setOpenVoucher, ensureVoucher, copyVoucher, copied }) {
  return (
    <section style={s.rewardsWrap}>
      <div style={s.rewardsCard}>
        <div style={s.rewardsTitle}>Unlock rewards</div>
        <p style={s.rewardsHint}>
          Correct calls unlock badges. Each badge comes with a proposed ISD
          merch voucher to claim.
        </p>
        <div style={s.badgesRow}>
          {BADGES.map((b) => {
            const earned = stats.correct >= b.need
            return (
              <div key={b.name} style={s.badgeCell}>
                <img
                  src={b.img}
                  alt={b.name}
                  title={earned ? `Earned - ${b.need} correct calls` : `Locked - earn ${b.need} correct calls`}
                  style={s.badgeImg}
                />
                <span style={s.badgeTier}>{b.name}</span>
                <span style={earned ? s.badgeStatusEarned : s.badgeStatusLocked}>
                  {earned ? 'Earned' : `Locked · ${b.need} correct`}
                </span>
                {earned && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenVoucher(b.name)
                      ensureVoucher(b.name)
                    }}
                    style={s.badgeClaim}
                  >
                    {vouchers[b.name] ? 'View voucher' : 'Claim voucher'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {openVoucher && vouchers[openVoucher] && (
          <div style={s.voucher}>
            <div style={s.voucherHead}>
              <span style={s.voucherLabel}>ISD MERCH VOUCHER</span>
              <span style={s.voucherTier}>{openVoucher}</span>
            </div>
            <div style={s.voucherItem}>1 × {MERCH[openVoucher].item}</div>
            <div style={s.voucherCode}>{vouchers[openVoucher].code}</div>
            <button type="button" onClick={() => copyVoucher(openVoucher)} style={s.voucherCopy}>
              {copied === openVoucher ? 'Copied' : 'Copy code'}
            </button>
            <div style={s.voucherFine}>
              This voucher is part of a proposed gamification concept for the
              demo. ISD does not make merch and there is nothing to redeem.
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function PersonaCard({ persona, guess, setGuess, onReveal, loading }) {
  return (
    <section style={s.block}>
      <div style={s.blockLabel}>Persona</div>

      {PERSONA_FIELDS.map(([key, label]) => (
        <div key={key} style={s.field}>
          <div style={s.fieldLabel}>{label}</div>
          <div style={s.fieldText}>{persona[key]}</div>
        </div>
      ))}

      <div style={s.rating}>
        <div style={s.fieldLabel}>
          How likely would you be to report this person for signs of
          radicalisation?
        </div>
        <div style={s.ratingControl}>
          <div style={s.ratingRow}>
            {RATING_OPTIONS.map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setGuess(v)}
                aria-label={`${label} (${v} of 5)`}
                style={{
                  ...s.segment,
                  ...(v === 5 ? { borderRight: 'none' } : {}),
                  ...(guess !== null && guess >= v ? s.segmentFilled : {}),
                  ...(guess === v ? s.segmentActive : {}),
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <div style={s.ratingLabels}>
            {RATING_OPTIONS.map(({ v, label }) => (
              <span
                key={v}
                style={{
                  ...s.ratingLabel,
                  ...(guess === v ? s.ratingLabelActive : {}),
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onReveal}
        disabled={guess == null || loading}
        style={{
          ...s.primary,
          ...(guess == null || loading ? s.disabled : {}),
        }}
      >
        {loading ? 'Analysing…' : 'Reveal what the AI sees'}
      </button>
    </section>
  )
}

function ResultCard({ result, guess, primaryPerf, guideOpen, setGuideOpen, perfOpen, setPerfOpen, onNext }) {
  return (
    <section style={s.block}>
      <div style={s.blockLabel}>Result</div>

      <div style={s.stats}>
        <div style={s.stat}>
          <div style={s.statValue}>
            {RATING_OPTIONS[guess - 1]?.label || guess}
          </div>
          <div style={s.statLabel}>Your guess</div>
        </div>
        <div style={s.stat}>
          <div style={s.statValue}>{classShort(result.ground_truth)}</div>
          <div style={s.statLabel}>Ground-truth class</div>
        </div>
        <div style={s.stat}>
          <div style={s.statValue}>
            {result.ai.signal}/5
            {result.ai.flagged ? (
              <span style={s.flagBadge}> flagged</span>
            ) : null}
          </div>
          <div style={s.statLabel}>AI signal score</div>
        </div>
      </div>

      <p style={s.line}>
        Ground truth: <strong>{classExplain(result.ground_truth)}</strong>
        {result.ground_truth.injected_factors.length > 0
          ? ` Injected indicators: ${result.ground_truth.injected_factors.join(', ')}.`
          : ''}
      </p>

      <p style={s.calibration}>
        {calibrationText(guess, result.ground_truth)}
      </p>

      <h3 style={s.h3}>What the AI detected</h3>
      <div style={s.factors}>
        {Object.entries(result.ai.scores || {}).map(([key, val]) => (
          <div key={key} style={s.factorRow}>
            <span style={s.factorName}>{FACTOR_LABELS[key] || key}</span>
            <div style={s.factorTrack}>
              <div
                style={{ ...s.factorFill, width: `${(val / 5) * 100}%` }}
              />
            </div>
            <span style={s.factorValue}>{val}/5</span>
          </div>
        ))}
      </div>

      {Object.keys(result.rule_evidence || {}).length > 0 && (
        <div style={s.evidence}>
          <div style={s.fieldLabel}>Signals found in the text</div>
          {Object.entries(result.rule_evidence).map(([factor, phrases]) => (
            <div key={factor} style={s.evidenceRow}>
              <span style={s.evidenceFactor}>
                {FACTOR_LABELS[factor] || factor}
              </span>
              <span style={s.evidencePhrases}>
                "{phrases.join('" · "')}"
              </span>
            </div>
          ))}
        </div>
      )}

      {result.ai.summary && (
        <p style={s.summary}>{result.ai.summary}</p>
      )}

      {result.ground_truth.class_label === 'hard_negative' && (
        <div style={s.callout}>
          <strong>Hard negative.</strong> This persona expresses ordinary
          discontent (frustration, cynicism, burnout) with no
          radicalisation-vulnerability markers. This is the classic
          over-report case - not every grumbler is at risk.
        </div>
      )}

      <div style={s.callout}>{result.note}</div>

      <div style={s.guide}>
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          style={s.guideToggle}
          aria-expanded={guideOpen}
        >
          <span>What are these indicators?</span>
          <span
            style={{ ...s.chevron, ...(guideOpen ? s.chevronOpen : {}) }}
          >
            ▾
          </span>
        </button>
        {guideOpen && (
          <div style={s.guideGrid}>
            {Object.entries(FACTOR_EXPLANATIONS).map(([key, text]) => (
              <div key={key} style={s.guideItem}>
                <span style={s.guideItemName}>
                  <span style={s.guideDot} />
                  {FACTOR_LABELS[key] || key}
                </span>
                <span style={s.guideItemText}>{text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {primaryPerf && (
        <div style={s.guide}>
          <button
            type="button"
            onClick={() => setPerfOpen((v) => !v)}
            style={s.guideToggle}
            aria-expanded={perfOpen}
          >
            <span>How accurate is this model?</span>
            <span
              style={{ ...s.chevron, ...(perfOpen ? s.chevronOpen : {}) }}
            >
              ▾
            </span>
          </button>
          {perfOpen && (
            <div style={s.perfBody}>
              <div style={s.perfGrid}>
                <div style={s.perfStat}>
                  <div style={s.perfValue}>{pct(primaryPerf.precision)}</div>
                  <div style={s.perfLabel}>
                    Precision - of the personas the model flagged, this % truly
                    carried indicators.
                  </div>
                </div>
                <div style={s.perfStat}>
                  <div style={s.perfValue}>{pct(primaryPerf.recall)}</div>
                  <div style={s.perfLabel}>
                    Recall - of the personas that carried indicators, this % were
                    caught.
                  </div>
                </div>
                <div style={s.perfStat}>
                  <div style={s.perfValue}>{pct(primaryPerf.fpRate)}</div>
                  <div style={s.perfLabel}>
                    Over-report rate - ordinary discontent that was wrongly
                    flagged.
                  </div>
                </div>
              </div>
              <p style={s.perfNote}>
                Measured on the synthetic labelled set of 1,000 personas.
                Shown for transparency - these numbers describe the method on
                synthetic data, not real people.
              </p>
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={onNext} style={s.secondary}>
        Next persona
      </button>
    </section>
  )
}

export default function App() {
  const [persona, setPersona] = useState(null)
  const [guess, setGuess] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(loadStats)
  const [vouchers, setVouchers] = useState(loadVouchers)
  const [openVoucher, setOpenVoucher] = useState(null)
  const [copied, setCopied] = useState(false)
  const [perf, setPerf] = useState(null)
  const [resetCount, setResetCount] = useState(0)
  const [guideOpen, setGuideOpen] = useState(true)
  const [perfOpen, setPerfOpen] = useState(true)
  const [quizPre, setQuizPre] = useState(() => normalizeQuiz(loadQuiz(PRE_KEY)))
  const [quizPost, setQuizPost] = useState(() => normalizeQuiz(loadQuiz(POST_KEY)))
  // New visitors see the pre-check screen first; returning ones (pre saved) go straight to the game.
  const [started, setStarted] = useState(
    () => normalizeQuiz(loadQuiz(PRE_KEY)) != null
  )
  // First-visit landing page shows once; returning users go straight in.
  const [welcome, setWelcome] = useState(() => storageGet(WELCOME_KEY) !== '1')
  const [hash, setHash] = useState(() => window.location.hash)
  const [toolsOpen, setToolsOpen] = useState(false)
  const prevEarned = useRef([])

  async function loadPersona() {
    setLoading(true)
    setError(null)
    setResult(null)
    setGuess(null)
    try {
      setPersona(await fetchPersona())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPersona()
    fetchPerformance().then(setPerf).catch(() => setPerf({}))
  }, [])

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  async function onReveal() {
    if (!persona || guess == null) return
    setLoading(true)
    setError(null)
    try {
      const r = await revealPersona(persona.uuid, guess)
      setResult(r)
      const next = applyStats(stats, classifyCall(guess, r.ground_truth))
      setStats(next)
      saveStats(next)
      // Upload the updated (anonymized) session in the background.
      autoUpload(next)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function ensureVoucher(name) {
    setVouchers((prev) => {
      if (prev[name]) return prev
      const next = {
        ...prev,
        [name]: { code: makeVoucherCode(seedFor(name) + stats.correct) },
      }
      saveVouchers(next)
      return next
    })
  }

  async function copyVoucher(name) {
    try {
      await navigator.clipboard.writeText(vouchers[name].code)
      setCopied(name)
      setTimeout(() => setCopied(null), 1500)
    } catch (e) {
      console.warn('clipboard write failed:', e)
    }
  }

  function resetSession() {
    const ok = window.confirm(
      'Reset this session? This clears your rating stats, badges, vouchers and learning-check answers.'
    )
    if (!ok) return
    for (const k of [
      STORAGE_KEY,
      VOUCHER_KEY,
      PRE_KEY,
      POST_KEY,
      SKIP_KEY,
      SESSION_KEY,
      WELCOME_KEY,
    ]) {
      storageRemove(k)
    }
    setStats({ ...EMPTY_STATS })
    setVouchers({})
    setOpenVoucher(null)
    setCopied(false)
    setResult(null)
    setGuess(null)
    setQuizPre(null)
    setQuizPost(null)
    setStarted(false)
    setWelcome(true)
    setResetCount((n) => n + 1)
    loadPersona()
  }

  function handlePreDone(answers) {
    setQuizPre(saveQuiz(PRE_KEY, answers))
    setStarted(true)
    autoUpload()
  }

  function handleSkip() {
    setStarted(true)
  }

  function handleBegin() {
    setWelcome(false)
    storageSet(WELCOME_KEY, '1')
  }

  function toggleAdmin() {
    window.location.hash = isAdmin ? '#/' : '#/admin'
  }

  function handlePostDone(answers) {
    setQuizPost(saveQuiz(POST_KEY, answers))
    autoUpload()
  }

  // Aggregated, anonymized session data is auto-submitted for evaluation.
  async function autoUpload(statsOverride) {
    try {
      const quizPre = loadQuiz(PRE_KEY)
      const quizPost = loadQuiz(POST_KEY)
      const sid = storageGet(SESSION_KEY) || ''
      const payload = {
        session_id: sid,
        stats: statsOverride || stats,
        vouchers,
        quiz_pre: quizPre,
        quiz_post: quizPost,
        pre_score: quizPre ? scoreQuiz(quizPre.answers).total : null,
        post_score: quizPost ? scoreQuiz(quizPost.answers).total : null,
        submitted_at: new Date().toISOString(),
      }
      await submitSession(payload)
    } catch (e) {
      // Non-blocking background upload - log and keep the session going.
      console.warn('session upload failed:', e)
    }
  }

  // Auto-open the voucher card the moment a new badge is earned.
  useEffect(() => {
    const earned = BADGES.filter((b) => stats.correct >= b.need).map(
      (b) => b.name
    )
    const fresh = earned.find((n) => !prevEarned.current.includes(n))
    if (fresh) {
      ensureVoucher(fresh)
      setOpenVoucher(fresh)
    }
    prevEarned.current = earned
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.correct])

  // Close the tools sidebar with the Escape key.
  useEffect(() => {
    if (!toolsOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setToolsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolsOpen])

  const primaryPerf = perf ? perfPrimary(perf) : null
  const isAdmin = hash === '#/admin'
  const showLanding = welcome && !started && !isAdmin

  let content
  if (isAdmin) {
    content = <AdminDashboard />
  } else if (showLanding) {
    content = <Landing onBegin={handleBegin} />
  } else if (!started) {
    content = <PreCheck onDone={handlePreDone} onSkip={handleSkip} />
  } else {
    content = (
      <>
        <StatsBar stats={stats} />
        <RewardsCard
          stats={stats}
          vouchers={vouchers}
          openVoucher={openVoucher}
          setOpenVoucher={setOpenVoucher}
          ensureVoucher={ensureVoucher}
          copyVoucher={copyVoucher}
          copied={copied}
        />

        <main style={s.main}>
        {error && (
          <div style={s.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {persona && !result && (
          <PersonaCard
            persona={persona}
            guess={guess}
            setGuess={setGuess}
            onReveal={onReveal}
            loading={loading}
          />
        )}

        {result && (
          <ResultCard
            result={result}
            guess={guess}
            primaryPerf={primaryPerf}
            guideOpen={guideOpen}
            setGuideOpen={setGuideOpen}
            perfOpen={perfOpen}
            setPerfOpen={setPerfOpen}
            onNext={loadPersona}
          />
        )}

        {loading && !persona && <p style={s.muted}>Loading…</p>}
        </main>

        <LearningCheck
          key={resetCount}
          stats={stats}
          pre={quizPre}
          post={quizPost}
          onPre={handlePreDone}
          onPost={handlePostDone}
        />
      </>
    )
  }

  return (
    <div>
      <div style={s.strip} />
      {!showLanding && (
        <Masthead
          isAdmin={isAdmin}
          onToggleAdmin={toggleAdmin}
          toolsOpen={toolsOpen}
          setToolsOpen={setToolsOpen}
        />
      )}
      {!isAdmin && toolsOpen && (
        <ToolsSidebar
          onClose={() => setToolsOpen(false)}
          onExportJson={() => exportSession(stats, vouchers, 'json')}
          onExportCsv={() => exportSession(stats, vouchers, 'csv')}
          onReset={resetSession}
        />
      )}
      {content}

      <footer style={s.footer}>
        Educational tool. All personas are synthetic; results are not a diagnosis
        and say nothing about real individuals. Aggregated, anonymized session
        data is automatically submitted to ISD for evaluation - no personal
        information is collected.
      </footer>
    </div>
  )
}

const s = {
  strip: { height: 3, background: 'var(--red)' },
  masthead: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '28px 20px 24px',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    rowGap: 4,
    flexWrap: 'wrap',
    marginBottom: 22,
  },
  brand: { fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' },
  brandSub: { fontSize: 13, color: 'var(--text-muted)' },
  badge: {
    marginLeft: 'auto',
    fontSize: 11,
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    height: 22,
    minWidth: 170,
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    padding: '0 12px',
  },
  adminToggle: {
    fontSize: 11,
    color: 'var(--accent)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    borderRadius: 999,
    height: 22,
    minWidth: 170,
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    padding: '0 12px',
    cursor: 'pointer',
  },
  adminToggleOn: {
    fontSize: 11,
    color: '#fff',
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    borderRadius: 999,
    height: 22,
    minWidth: 170,
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    padding: '0 12px',
    cursor: 'pointer',
  },
  h1: { fontSize: 28, marginBottom: 4 },
  sub: {
    color: 'var(--text-muted)',
    marginBottom: 0,
    fontSize: 14,
  },
  subNote: {
    color: 'var(--text-muted)',
    marginTop: 6,
    marginBottom: 0,
    fontSize: 14,
  },
  caveatBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    padding: '8px 12px',
    background: 'var(--callout)',
    border: '1px solid var(--border)',
    borderRadius: 6,
  },
  caveatIcon: {
    color: 'var(--text-muted)',
    fontSize: 13,
    lineHeight: 1.4,
    flexShrink: 0,
  },
  caveatText: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.45,
  },
  caveatLink: {
    color: 'var(--accent)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
  statsBar: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '0 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  statsGrid: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  statCard: {
    flex: '1 1 110px',
    minWidth: 90,
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '10px 12px',
    background: 'var(--surface)',
  },
  statNum: { fontSize: 22, fontWeight: 600, lineHeight: 1.1 },
  trackLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  numAccent: { color: 'var(--accent)' },
  numRed: { color: 'var(--red)' },
  streakCard: {
    border: '1px solid var(--accent)',
    background: 'var(--accent-soft)',
  },
  streakNum: { color: 'var(--accent-strong)' },
  sidebarOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.28)',
    zIndex: 40,
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 280,
    maxWidth: '85vw',
    background: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.1)',
    zIndex: 41,
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid var(--border)',
  },
  sidebarTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontWeight: 600,
    fontSize: 14,
  },
  sidebarClose: {
    border: 'none',
    background: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    padding: 4,
  },
  sidebarBody: {
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
  },
  toolsToggle: {
    fontSize: 11,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    borderRadius: 999,
    height: 22,
    width: 22,
    boxSizing: 'border-box',
    padding: 0,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
  },
  exportBtn: {
    fontSize: 13,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    borderRadius: 6,
    padding: '9px 12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-start',
    textAlign: 'left',
  },
  resetBtn: {
    fontSize: 13,
    border: '1px solid var(--red)',
    background: 'var(--red-soft)',
    color: 'var(--red)',
    borderRadius: 6,
    padding: '9px 12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-start',
    textAlign: 'left',
  },
  exportLink: {
    fontSize: 13,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--accent)',
    borderRadius: 6,
    padding: '9px 12px',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-start',
  },
  badgesRow: { display: 'flex', gap: 12, alignItems: 'center' },
  badgeCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  badgeImg: { width: 36, height: 36, borderRadius: 8 },
  badgeTier: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' },
  badgeStatusEarned: { fontSize: 9, color: 'var(--accent)' },
  badgeStatusLocked: { fontSize: 9, color: 'var(--text-faint)' },
  badgeClaim: {
    fontSize: 10,
    border: 'none',
    background: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    padding: 0,
    marginTop: 2,
    textDecoration: 'underline',
  },
  rewardsWrap: { maxWidth: 760, margin: '0 auto', padding: '0 20px 16px' },
  rewardsCard: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '16px 24px',
    background: 'var(--surface)',
  },
  rewardsTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 4,
  },
  rewardsHint: { fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' },
  voucher: {
    maxWidth: 400,
    marginTop: 14,
    border: '1px dashed var(--accent)',
    borderRadius: 8,
    padding: '16px 20px',
    background: 'var(--surface)',
  },
  voucherHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  voucherLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--text-faint)',
  },
  voucherTier: { fontSize: 11, fontWeight: 600, color: 'var(--accent)' },
  voucherItem: { fontSize: 15, fontWeight: 600, marginTop: 10 },
  voucherCode: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 20,
    letterSpacing: '0.08em',
    marginTop: 10,
    color: 'var(--text)',
  },
  voucherCopy: {
    marginTop: 14,
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
    cursor: 'pointer',
  },
  voucherFine: {
    marginTop: 10,
    fontSize: 11,
    color: 'var(--text-faint)',
  },
  calibration: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 8,
    fontStyle: 'italic',
  },
  main: { maxWidth: 760, margin: '0 auto', padding: '20px' },
  block: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '20px 24px',
    marginBottom: 16,
    background: 'var(--surface)',
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 14,
  },
  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 2,
  },
  fieldText: { fontSize: 15 },
  rating: {
    margin: '18px 0 14px',
    paddingTop: 16,
    borderTop: '1px solid var(--border)',
  },
  ratingControl: { marginTop: 10 },
  ratingRow: {
    display: 'flex',
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    height: 40,
    border: 'none',
    borderRight: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    fontSize: 15,
    cursor: 'pointer',
  },
  segmentFilled: {
    background: 'var(--accent-soft)',
    color: 'var(--accent-strong)',
  },
  segmentActive: { background: 'var(--accent)', color: '#fff' },
  ratingLabels: { display: 'flex', marginTop: 6 },
  ratingLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--text-faint)',
  },
  ratingLabelActive: { color: 'var(--accent)', fontWeight: 600 },
  primary: {
    marginTop: 6,
    padding: '10px 18px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  },
  disabled: { opacity: 0.4, cursor: 'default' },
  secondary: {
    marginTop: 14,
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 15,
    cursor: 'pointer',
  },
  stats: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  stat: {
    flex: '1 1 120px',
    minWidth: 0,
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px 14px',
  },
  statValue: { fontSize: 20, fontWeight: 600 },
  statLabel: { fontSize: 12, color: 'var(--text-muted)' },
  flagBadge: {
    fontSize: 12,
    color: 'var(--red)',
    background: 'var(--red-soft)',
    borderRadius: 4,
    padding: '1px 6px',
    marginLeft: 6,
    verticalAlign: 'middle',
  },
  line: { fontSize: 14 },
  h3: { fontSize: 14, marginTop: 4 },
  factors: { margin: '6px 0 14px' },
  factorRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  factorName: { width: 150, fontSize: 13, color: 'var(--text-muted)' },
  factorTrack: {
    flex: 1,
    height: 6,
    background: 'var(--hover)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  factorFill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 3,
  },
  factorValue: {
    width: 34,
    fontSize: 12,
    textAlign: 'right',
    color: 'var(--text-muted)',
  },
  summary: { fontStyle: 'italic', color: 'var(--text-muted)', fontSize: 14 },
  evidence: {
    margin: '8px 0 14px',
    padding: '12px 14px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--callout)',
  },
  evidenceRow: { display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 },
  evidenceFactor: { minWidth: 120, fontWeight: 600 },
  evidencePhrases: { color: 'var(--text-muted)' },
  guide: { marginTop: 8 },
  guideToggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--callout)',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--text)',
    fontWeight: 500,
    textAlign: 'left',
  },
  chevron: {
    transition: 'transform 0.15s ease',
    color: 'var(--text-muted)',
    fontSize: 12,
    lineHeight: 1,
  },
  chevronOpen: { transform: 'rotate(180deg)' },
  guideGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  guideItem: {
    flex: '1 1 300px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '10px 12px',
    background: 'var(--surface)',
  },
  guideItemName: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 12.5,
    fontWeight: 600,
    marginBottom: 3,
  },
  guideDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: 3,
    background: 'var(--accent)',
    marginRight: 6,
  },
  guideItemText: { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 },
  perfBody: { marginTop: 8 },
  perfGrid: { display: 'flex', gap: 10, margin: '8px 0', flexWrap: 'wrap' },
  perfStat: {
    flex: '1 1 120px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '10px 12px',
  },
  perfValue: { fontSize: 20, fontWeight: 600, marginBottom: 2 },
  perfLabel: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 },
  perfNote: { fontSize: 12, color: 'var(--text-faint)', marginTop: 8 },
  callout: {
    margin: '14px 0',
    padding: '12px 14px',
    background: 'var(--callout)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  footer: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '0 20px 40px',
    fontSize: 12,
    color: 'var(--text-faint)',
    textAlign: 'center',
  },
  error: {
    color: 'var(--red)',
    border: '1px solid var(--red)',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    background: 'var(--red-soft)',
  },
  muted: { color: 'var(--text-muted)' },
}
