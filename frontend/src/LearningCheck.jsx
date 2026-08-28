// Post-check + comparison for the learning check. The pre-check runs as its own
// screen (PreCheck.jsx) before the game; this section shows the post-check once
// it unlocks and compares scores/answers to show what was learned.
import { useEffect, useRef, useState } from 'react'
import QuizRunner from './QuizRunner.jsx'
import {
  POST_MIN_RATED,
  QUIZ_OPTIONS,
  QUIZ_QUESTIONS,
  scoreQuiz,
} from './quiz.js'

function labelFor(v) {
  const o = QUIZ_OPTIONS.find((x) => x.v === v)
  return o ? o.label : '—'
}

export default function LearningCheck({ stats, pre, post, onPre, onPost }) {
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState('post')
  const [note, setNote] = useState(null)
  const dialogRef = useRef(null)

  const postLocked = stats.rated < POST_MIN_RATED
  const preScore = pre ? scoreQuiz(pre.answers) : null

  useEffect(() => {
    if (show) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [show])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return undefined
    const onClose = () => setShow(false)
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [])

  function open(m) {
    setMode(m)
    setNote(null)
    setShow(true)
  }

  function finish(answers) {
    if (mode === 'post') {
      onPost(answers)
      setNote('Post-check saved.')
    } else {
      onPre(answers)
      setNote('Pre-check saved.')
    }
    setShow(false)
    setTimeout(() => setNote(null), 3000)
  }

  return (
    <section style={s.wrap}>
      <div style={s.card}>
        <div style={s.title}>Learning check</div>
        {note && <p style={s.note}>{note}</p>}

        {!pre && (
          <>
            <p style={s.hint}>
              You skipped the pre-check. You can still take it now - it only
              matters if you take it again later for comparison.
            </p>
            <button onClick={() => open('pre')} style={s.primary}>
              Take the pre-check
            </button>
          </>
        )}

        {pre && !post && (
          <>
            <p style={s.hint}>
              Pre-check: <strong>{preScore.total}/{preScore.max}</strong>.
              {postLocked
                ? ` Take the post-check after ${POST_MIN_RATED - stats.rated} more rating${stats.rated === POST_MIN_RATED - 1 ? '' : 's'}.`
                : ' You can now take the post-check.'}
            </p>
            {!postLocked && (
              <button onClick={() => open('post')} style={s.primary}>
                Take the post-check
              </button>
            )}
          </>
        )}

        {pre && post && <Comparison pre={pre} post={post} />}
      </div>

      <dialog ref={dialogRef} style={s.dialog}>
        <div style={s.modalHead}>
          <span style={s.title}>{mode === 'post' ? 'Post-check' : 'Pre-check'}</span>
          <button onClick={() => setShow(false)} style={s.closeBtn} aria-label="Close">
            ×
          </button>
        </div>
        <p style={s.hint}>
          For each scenario: how likely would you be to flag this person for
          radicalisation risk?
        </p>
        <QuizRunner onFinish={finish} />
      </dialog>
    </section>
  )
}

function Comparison({ pre, post }) {
  const preScore = scoreQuiz(pre.answers)
  const postScore = scoreQuiz(post.answers)
  const delta = Math.round(postScore.total - preScore.total)
  const pct = Math.round((postScore.total / postScore.max) * 100)
  const deltaStyle = delta > 0 ? s.up : delta < 0 ? s.down : s.same
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : 'no change'

  return (
    <div>
      <p style={s.hint}>
        You went from <strong>{preScore.total}/{preScore.max}</strong> to{' '}
        <strong>{postScore.total}/{postScore.max}</strong> ({pct}%){' '}
        <span style={deltaStyle}>{deltaText}</span>
        {'.'}
      </p>
      {QUIZ_QUESTIONS.map((q, i) => {
        const bv = pre.answers.find((a) => a.qid === q.id)?.v
        const av = post.answers.find((a) => a.qid === q.id)?.v
        const changed = bv !== av
        const postPts = postScore.per[i].pts
        return (
          <div key={q.id} style={s.row}>
            <div style={s.qtext}>
              <strong>{i + 1}.</strong> {q.text}
            </div>
            <div style={s.answers}>
              <span style={s.before}>before: {labelFor(bv)}</span>
              <span style={s.arrow}>→</span>
              <span style={changed ? s.afterDiff : s.after}>
                after: {labelFor(av)}
              </span>
            </div>
            {postPts !== 1 && <p style={s.explain}>{q.explain}</p>}
          </div>
        )
      })}
    </div>
  )
}

const s = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '0 20px 16px' },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '16px 24px',
    background: 'var(--surface)',
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 4,
  },
  hint: { fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 10px' },
  note: { fontSize: 13, color: 'var(--accent)', margin: '6px 0 10px', fontWeight: 500 },
  primary: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  row: { margin: '12px 0', borderTop: '1px solid var(--border)', paddingTop: 10 },
  qtext: { fontSize: 13, lineHeight: 1.5 },
  answers: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: 12,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  before: { color: 'var(--text-faint)' },
  after: { color: 'var(--accent)', fontWeight: 600 },
  afterDiff: { color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline' },
  arrow: { color: 'var(--text-faint)' },
  up: { color: 'var(--accent)', fontWeight: 700 },
  down: { color: 'var(--red)', fontWeight: 700 },
  same: { color: 'var(--text-faint)' },
  explain: { fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', fontStyle: 'italic' },
  dialog: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '20px 24px',
    maxWidth: 560,
    boxShadow: '0 10px 40px rgba(55, 52, 47, 0.15)',
    color: 'var(--text)',
  },
  modalHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: '0 2px',
  },
}
