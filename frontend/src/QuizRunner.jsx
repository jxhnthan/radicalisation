// One-question-at-a-time quiz widget with a progress bar, back/next and
// keyboard support (1/2/3 to answer, Enter/→ next, Backspace/← back).
import { useEffect, useRef, useState } from 'react'
import { QUIZ_OPTIONS, QUIZ_QUESTIONS } from './quiz.js'

const KEY_MAP = { 1: 0, 2: 1, 3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }

export default function QuizRunner({ onFinish }) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState([])
  const q = QUIZ_QUESTIONS[idx]
  const current = answers.find((a) => a.qid === q.id)
  const answered = current != null
  const isLast = idx === QUIZ_QUESTIONS.length - 1
  const progress = ((idx + (answered ? 1 : 0)) / QUIZ_QUESTIONS.length) * 100

  const qRef = useRef(null)
  const stateRef = useRef({ idx, answers, answered })
  stateRef.current = { idx, answers, answered }
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  // Move focus to the question when it changes so no stale button keeps a ring.
  useEffect(() => {
    qRef.current?.focus()
  }, [idx])

  function choose(v) {
    setAnswers((prev) => [...prev.filter((a) => a.qid !== q.id), { qid: q.id, v }])
  }

  function advance() {
    if (!answered) return
    if (isLast) onFinish(answers)
    else setIdx(idx + 1)
  }

  // Keyboard answers: 1/2/3 (top row or numpad), Enter/-> next, Backspace/<- back.
  useEffect(() => {
    function onKey(e) {
      const st = stateRef.current
      const optIdx = KEY_MAP[e.key]
      if (optIdx !== undefined) {
        e.preventDefault()
        const qid = QUIZ_QUESTIONS[st.idx].id
        const v = QUIZ_OPTIONS[optIdx].v
        setAnswers((prev) => [...prev.filter((a) => a.qid !== qid), { qid, v }])
        return
      }
      const goNext = () => {
        if (st.idx === QUIZ_QUESTIONS.length - 1) onFinishRef.current(st.answers)
        else setIdx(st.idx + 1)
      }
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && st.answered) {
        e.preventDefault()
        goNext()
      } else if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && st.idx > 0) {
        e.preventDefault()
        setIdx(st.idx - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div>
      <div style={s.progressRow}>
        <span style={s.counter}>
          {idx + 1} / {QUIZ_QUESTIONS.length}
        </span>
        <div style={s.track}>
          <div style={{ ...s.fill, width: `${progress}%` }} />
        </div>
      </div>

      <div ref={qRef} tabIndex={-1} style={s.qtext}>
        {q.text}
      </div>

      <div style={s.opts}>
        {QUIZ_OPTIONS.map((o, oi) => {
          const on = current?.v === o.v
          return (
            <button
              key={o.v}
              onClick={() => choose(o.v)}
              style={{ ...s.opt, ...(on ? s.optOn : {}) }}
              aria-pressed={on}
            >
              <span style={{ ...s.optKey, ...(on ? s.optKeyOn : {}) }}>{oi + 1}</span>
              <span style={s.optText}>
                <span style={s.optLabel}>{o.label}</span>
                <span style={s.optDesc}>{o.desc}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div style={s.nav}>
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          style={{ ...s.btn, ...(idx === 0 ? s.btnHidden : {}) }}
        >
          Back
        </button>
        <button onClick={advance} disabled={!answered} style={{ ...s.btnPrimary, ...(!answered ? s.btnDisabled : {}) }}>
          {isLast ? 'Finish' : 'Next'}
        </button>
      </div>
      <p style={s.hint}>Keys: 1 / 2 / 3 to answer · Enter next · Backspace back</p>
    </div>
  )
}

const s = {
  progressRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  counter: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' },
  track: {
    flex: 1,
    height: 6,
    background: 'var(--hover)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: { height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' },
  qtext: { fontSize: 16, lineHeight: 1.5, marginBottom: 16, outline: 'none' },
  opts: { display: 'flex', flexDirection: 'column', gap: 8 },
  opt: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
    padding: '10px 14px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  optOn: { border: '1px solid var(--accent)', background: 'var(--accent-soft)' },
  optKey: {
    flexShrink: 0,
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  optKeyOn: {
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
    background: 'var(--surface)',
  },
  optText: { display: 'flex', flexDirection: 'column', gap: 2 },
  optLabel: { fontSize: 14, fontWeight: 600 },
  optDesc: { fontSize: 12, color: 'var(--text-muted)' },
  nav: { display: 'flex', justifyContent: 'space-between', marginTop: 18 },
  btn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 14,
    cursor: 'pointer',
  },
  btnHidden: { visibility: 'hidden' },
  btnPrimary: {
    padding: '8px 18px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.4, cursor: 'default' },
  hint: { fontSize: 11, color: 'var(--text-faint)', marginTop: 12, textAlign: 'right' },
}
