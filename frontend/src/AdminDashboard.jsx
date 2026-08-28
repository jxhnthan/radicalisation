// Admin dashboard: aggregates anonymized session submissions and reports whether the
// pre/post quiz knowledge change is statistically significant. Prototype-only,
// local, no auth - and the summary is read-only from the backend.
import { useEffect, useState } from 'react'
import { adminAction, fetchAdminSummary, fetchPerformance } from './api.js'
import { QUIZ_QUESTIONS } from './quiz.js'

const QUIZ_MAX = QUIZ_QUESTIONS.length

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null)
  const [perf, setPerf] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [tab, setTab] = useState('sessions')

  async function load() {
    try {
      setSummary(await fetchAdminSummary())
      setPerf(await fetchPerformance())
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function simulate() {
    setBusy(true)
    setNote(null)
    try {
      const r = await adminAction('simulate')
      setNote(`Added ${r.added} sample sessions.`)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function clearSim() {
    setBusy(true)
    setNote(null)
    try {
      const r = await adminAction('clear-simulated')
      setNote(`Removed ${r.removed} sample sessions.`)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={s.wrap}>
      <div style={s.card}>
        <div style={s.head}>
          <div>
            <div style={s.kicker}>Admin · prototype</div>
            <h2 style={s.title}>Dashboard</h2>
          </div>
          <a href="#/" style={s.back}>← Back to app</a>
        </div>

        <div style={s.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sessions'}
            onClick={() => setTab('sessions')}
            style={tab === 'sessions' ? s.tabOn : s.tab}
          >
            Sessions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'perf'}
            onClick={() => setTab('perf')}
            style={tab === 'perf' ? s.tabOn : s.tab}
          >
            Model performance
          </button>
        </div>

        {error && <p style={s.err}>Error: {error}</p>}
        {!summary && !error && <p style={s.hint}>Loading…</p>}

        {summary && tab === 'sessions' && (
          <>
            <div style={s.actions}>
              <button onClick={simulate} disabled={busy} style={s.primary}>
                {busy ? 'Working…' : 'Simulate sample data'}
              </button>
              {summary.simulated > 0 && (
                <button onClick={clearSim} disabled={busy} style={s.secondary}>
                  Clear sample data ({summary.simulated})
                </button>
              )}
            </div>
            {note && <p style={s.note}>{note}</p>}

            <div style={s.row}>
              <Stat val={summary.n_sessions} lab="Sessions uploaded" />
              <Stat val={summary.total_rated} lab="Personas rated" />
              <Stat val={pct(summary.correct_rate)} lab="Correct calls" />
              <Stat val={summary.total_false_alarm} lab="False alarms" />
              <Stat val={summary.total_missed} lab="Missed" />
            </div>

            <div style={s.subhead}>Learning check · pre vs post</div>

            {!summary.quiz ? (
              <p style={s.hint}>
                Not enough paired sessions yet. Hit &ldquo;Simulate sample data&rdquo;
                above, or upload sessions that completed both the pre- and post-check.
              </p>
            ) : (
              <QuizSection quiz={summary.quiz} />
            )}

            <p style={s.fine}>
              Sessions are auto-submitted from the app in anonymized form (counts
              and quiz scores only - no personal information). Sample sessions
              are marked &ldquo;sim-&rdquo; and can be cleared.
            </p>
          </>
        )}

        {perf && perf.available && tab === 'perf' && (
          <>
            <PerfSection perf={perf} />
            <p style={s.fine}>
              Detector metrics are read-only from data/evaluation_results.json and
              describe the synthetic labelled set, not real individuals.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function Stat({ val, lab }) {
  return (
    <div style={s.stat}>
      <div style={s.val}>{val}</div>
      <div style={s.lab}>{lab}</div>
    </div>
  )
}

function QuizSection({ quiz }) {
  const delta = quiz.mean_diff
  const verdict =
    quiz.significant && quiz.direction === 'improvement'
      ? 'Significant improvement'
      : quiz.significant && quiz.direction === 'decline'
      ? 'Significant decline'
      : quiz.direction === 'no change'
      ? 'No measurable change'
      : 'Change not statistically significant'
  const tone = quiz.significant ? s.badgetUp : s.badgetFlat

  return (
    <div>
      <div style={s.charts}>
        <div style={s.chartCard}>
          <div style={s.chartTitle}>Mean score</div>
          <Bars pre={quiz.mean_pre} post={quiz.mean_post} />
        </div>
        <div style={s.chartCard}>
          <div style={s.chartTitle}>Per session · pre → post</div>
          <PairedChart pairs={quiz.pairs} />
        </div>
      </div>

      <div style={s.metrics}>
        <div style={s.mRow}>
          <span style={s.mName}>Paired sessions</span>
          <span style={s.mVal}>{quiz.n_pairs}</span>
        </div>
        <div style={s.mRow}>
          <span style={s.mName}>
            Mean score
            <Tip text={`Average pre-check score vs average post-check score, out of ${QUIZ_MAX}.`} />
          </span>
          <span style={s.mVal}>
            {quiz.mean_pre} → {quiz.mean_post}
            <span style={s.mSub}> / {QUIZ_MAX}</span>
          </span>
        </div>
        <div style={s.mRow}>
          <span style={s.mName}>
            Mean change
            <Tip text="How much scores moved on average after using the tool. Positive = improvement." />
          </span>
          <span style={s.mFormula}>Δ = mean(post − pre)</span>
          <span style={s.mVal}>{delta > 0 ? `+${delta}` : delta}</span>
        </div>
        <div style={s.mRow}>
          <span style={s.mName}>
            p-value
            <Tip text="Probability that the change is just random noise. p < 0.05 is usually called significant." />
          </span>
          <span style={s.mFormula}>p = Wilcoxon signed-rank</span>
          <span style={s.mVal}>{quiz.p_value ?? '—'}</span>
        </div>
        <div style={s.mRow}>
          <span style={s.mName}>
            Cohen&rsquo;s d
            <Tip text="Effect size: ~0.2 small, ~0.5 medium, ~0.8 large." />
          </span>
          <span style={s.mFormula}>d = Δ / SD(post − pre)</span>
          <span style={s.mVal}>{quiz.cohens_d ?? '—'}</span>
        </div>
      </div>

      <p style={s.hint}>
        Verdict: <span style={tone}>{verdict}</span>
        {quiz.p_value != null && (
          <>
            {' '}
            (p {quiz.p_value < 0.001 ? '< 0.001' : `= ${quiz.p_value}`},{' '}
            {quiz.cohens_d != null ? `d = ${quiz.cohens_d}` : 'd unavailable'})
          </>
        )}
        . Small samples inflate uncertainty; treat as indicative, not conclusive.
      </p>
    </div>
  )
}

function Bars({ pre, post }) {
  return (
    <div>
      <BarRow label="Pre" val={pre} color="var(--text-muted)" />
      <BarRow label="Post" val={post} color="var(--accent)" />
    </div>
  )
}

function BarRow({ label, val, color }) {
  return (
    <div style={s.barRow}>
      <span style={s.barLabel}>{label}</span>
      <div style={s.barTrack}>
        <div style={{ ...s.barFill, width: `${(val / QUIZ_MAX) * 100}%`, background: color }} />
      </div>
      <span style={s.barVal}>{val}</span>
    </div>
  )
}

function PairedChart({ pairs }) {
  const W = 320
  const H = 140
  const padL = 26
  const padB = 20
  const padT = 10
  const innerW = W - padL - 8
  const innerH = H - padT - padB
  const y = (v) => padT + innerH * (1 - v / QUIZ_MAX)
  const x = (i) => padL + (innerW * (i + 0.5)) / pairs.length
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', display: 'block' }}
      role="img"
      aria-label="Per-session pre and post quiz scores"
    >
      {[0, 2, 4, 6, 8].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - 8} y1={y(g)} y2={y(g)} stroke="var(--hover)" strokeWidth="1" />
          <text x={padL - 5} y={y(g) + 3} fontSize="9" fill="var(--text-faint)" textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {pairs.map(([pre, post], i) => (
        <g key={i}>
          <line
            x1={x(i)}
            x2={x(i)}
            y1={y(pre)}
            y2={y(post)}
            stroke={post >= pre ? 'var(--accent)' : 'var(--red)'}
            strokeWidth="1.5"
          />
          <circle cx={x(i)} cy={y(pre)} r="3" fill="#fff" stroke="var(--text-muted)" strokeWidth="1.5" />
          <circle cx={x(i)} cy={y(post)} r="3" fill={post >= pre ? 'var(--accent)' : 'var(--red)'} />
        </g>
      ))}
      <text x={padL} y={H - 4} fontSize="9" fill="var(--text-faint)">
        each session: ○ pre → ● post (y = score /{QUIZ_MAX})
      </text>
    </svg>
  )
}

function Tip({ text, children }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      style={s.tip}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children || (
        <span style={s.tipIcon} aria-hidden="true">
          ?
        </span>
      )}
      {open && (
        <span style={s.tipBubble} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}

function pct(x) {
  if (typeof x !== 'number') return '—'
  return `${Math.round(x * 100)}%`
}

function dec(x) {
  return typeof x === 'number' ? x.toFixed(2) : '—'
}

function PerfSection({ perf }) {
  if (!perf || !perf.available) return null
  const hn = perf.hard_negative_fp_rate || {}
  const agree = perf.agreement || {}
  const models = [
    { name: 'Rule-based', d: perf.rule_based },
    { name: 'LLM-as-judge', d: perf.llm_judge },
  ].filter((m) => m.d)

  return (
    <div>
      <p style={s.hint}>
        {perf.note || 'Metrics at the flag threshold (signal &ge; 3).'} Both
        detectors are conservative - when they flag, they are correct, but they
        miss most positives.
      </p>

      <div style={s.charts}>
        {models.map((m) => (
          <div style={s.chartCard} key={m.name}>
            <div style={s.chartTitle}>
              {m.name} <span style={s.mSub}>(n = {m.d.n})</span>
            </div>
            <div style={s.row}>
              <MiniStat val={pct(m.d.precision)} lab="Precision" />
              <MiniStat val={pct(m.d.recall)} lab="Recall" />
              <MiniStat val={dec(m.d.f1)} lab="F1" />
              <MiniStat val={dec(m.d.roc_auc)} lab="AUC" />
            </div>
            <div style={s.cmTitle}>Confusion by cohort</div>
            <ConfusionMatrix perClass={m.d.per_class} />
          </div>
        ))}
      </div>

      <div style={s.metrics}>
        <div style={s.mRow}>
          <span style={s.mName}>
            Over-firing on hard negatives
            <Tip text="False-positive rate on the 100 hard negatives - ordinary discontent that must NOT be flagged." />
          </span>
          <span style={s.mFormula}>flagged / 100</span>
          <span style={s.mVal}>
            {pct(hn.rule_based)} <span style={s.mSub}>rule</span> ·{' '}
            {pct(hn.llm_judge)} <span style={s.mSub}>llm</span>
          </span>
        </div>
        <div style={s.mRow}>
          <span style={s.mName}>
            Rule vs LLM agreement
            <Tip text="How consistently the two detectors rank personas (Pearson on signal, Cohen's kappa on flag/no-flag)." />
          </span>
          <span style={s.mFormula}>signal Pearson · flag κ</span>
          <span style={s.mVal}>
            {dec(agree.signal_pearson)} <span style={s.mSub}>·</span> κ{' '}
            {dec(agree.flag_cohens_kappa)}
          </span>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ val, lab }) {
  return (
    <div style={s.miniStat}>
      <div style={s.val}>{val}</div>
      <div style={s.lab}>{lab}</div>
    </div>
  )
}

const COHORTS = [
  ['full_indicator', 'Full indicator'],
  ['partial_indicator', 'Partial indicator'],
  ['baseline', 'Baseline'],
  ['hard_negative', 'Hard negative'],
]

function ConfusionMatrix({ perClass }) {
  return (
    <table style={s.cm}>
      <thead>
        <tr>
          <th style={s.cmHead}>Cohort</th>
          <th style={{ ...s.cmHead, textAlign: 'right' }}>Flagged</th>
          <th style={{ ...s.cmHead, textAlign: 'right' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {COHORTS.map(([key, label]) => {
          const c = perClass[key]
          if (!c) return null
          return (
            <tr key={key}>
              <td style={s.cmCell}>{label}</td>
              <td style={{ ...s.cmCell, textAlign: 'right' }}>{c.flagged}</td>
              <td style={{ ...s.cmCell, textAlign: 'right', color: 'var(--text-faint)' }}>
                {c.n}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const s = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '28px 20px 44px' },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '28px 32px',
    background: 'var(--surface)',
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 24,
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 4,
  },
  title: { fontSize: 22, margin: 0 },
  back: { fontSize: 13, color: 'var(--accent)', textDecoration: 'none' },
  tabs: {
    display: 'flex',
    gap: 4,
    borderBottom: '1px solid var(--border)',
    marginBottom: 22,
  },
  tab: {
    fontSize: 13,
    color: 'var(--text-muted)',
    background: 'none',
    border: 'none',
    padding: '8px 14px',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  tabOn: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--accent)',
    background: 'none',
    border: 'none',
    padding: '8px 14px',
    cursor: 'pointer',
    borderBottom: '2px solid var(--accent)',
    marginBottom: -1,
  },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
  primary: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondary: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    fontSize: 13,
    cursor: 'pointer',
  },
  note: { fontSize: 13, color: 'var(--accent)', margin: '2px 0 14px', fontWeight: 500 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 26 },
  stat: {
    flex: '1 1 120px',
    minWidth: 0,
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '14px 16px',
  },
  miniStat: {
    flex: '1 1 70px',
    minWidth: 0,
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
  },
  val: { fontSize: 20, fontWeight: 600, lineHeight: 1.1 },
  lab: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 },
  subhead: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    margin: '14px 0 14px',
  },
  charts: { display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 26 },
  chartCard: {
    flex: '1 1 300px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '16px 18px',
    background: 'var(--surface)',
  },
  chartTitle: { fontSize: 12, fontWeight: 600, marginBottom: 14, color: 'var(--text-muted)' },
  barRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barLabel: { width: 36, fontSize: 12, color: 'var(--text-muted)' },
  barTrack: {
    flex: 1,
    height: 14,
    background: 'var(--hover)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barVal: { width: 40, fontSize: 12, textAlign: 'right', fontWeight: 600 },
  formulas: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px 14px',
    background: 'var(--callout)',
    marginBottom: 12,
  },
  formula: { fontSize: 13, margin: '6px 0', color: 'var(--text-muted)' },
  metrics: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    marginBottom: 22,
  },
  mRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: '14px 18px',
    borderTop: '1px solid var(--border)',
  },
  mName: {
    flex: '0 0 150px',
    fontSize: 13,
    color: 'var(--text-muted)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  mFormula: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: 'var(--text-faint)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  mVal: { fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' },
  mSub: { fontSize: 12, fontWeight: 400, color: 'var(--text-faint)' },
  cmTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    margin: '6px 0 8px',
  },
  cm: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  cmHead: {
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 11,
    color: 'var(--text-faint)',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
  },
  cmCell: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  hint: { fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 14px', lineHeight: 1.6 },
  fine: { fontSize: 12, color: 'var(--text-faint)', marginTop: 24, lineHeight: 1.6 },
  err: { color: 'var(--red)', fontSize: 13 },
  badgetUp: { color: 'var(--accent)', fontWeight: 700 },
  badgetFlat: { color: 'var(--text-muted)', fontWeight: 600 },
  tip: { position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help' },
  tipIcon: {
    width: 15,
    height: 15,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    color: 'var(--text-faint)',
    fontSize: 10,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipBubble: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 5,
    width: 240,
    marginTop: 6,
    padding: '8px 10px',
    background: '#fff',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 1.45,
    boxShadow: '0 6px 20px rgba(55, 52, 47, 0.15)',
  },
}

