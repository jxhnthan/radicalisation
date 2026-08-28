// Pre-check: a dedicated screen shown before the game, so the baseline is
// captured before the user sees any personas. Phases: intro -> quiz -> result.
import { useState } from 'react'
import QuizRunner from './QuizRunner.jsx'
import { QUIZ_QUESTIONS, scoreQuiz } from './quiz.js'

export default function PreCheck({ onDone, onSkip }) {
  const [phase, setPhase] = useState('intro')
  const [answers, setAnswers] = useState([])
  const [score, setScore] = useState(null)

  function finish(answers) {
    setAnswers(answers)
    setScore(scoreQuiz(answers))
    setPhase('result')
  }

  if (phase === 'intro') {
    return (
      <section style={s.wrap}>
        <div style={s.card}>
          <div style={s.kicker}>Before you start</div>
          <h2 style={s.title}>Can you spot the signs?</h2>
          <p style={s.body}>
            You&rsquo;ll read {QUIZ_QUESTIONS.length} short scenarios. For each
            one, indicate how likely you would be to flag the scenario for
            potential radicalisation risk.
          </p>
          <p style={s.body}>
            There are no right or wrong answers, and no marks are at stake. This
            is simply a baseline check of where you&rsquo;re starting from.
          </p>
          <p style={s.body}>
            After reviewing the scenarios, you&rsquo;ll take the same check again
            to see what you&rsquo;ve learned and how your assessments have
            changed.
          </p>
          <div style={s.actions}>
            <button onClick={() => setPhase('quiz')} style={s.primary}>
              Start the check
            </button>
            <button onClick={onSkip} style={s.secondary}>
              Skip for now
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'quiz') {
    return (
      <section style={s.wrap}>
        <div style={s.card}>
          <div style={s.kicker}>
            Pre-check · {QUIZ_QUESTIONS.length} scenarios
          </div>
          <QuizRunner onFinish={finish} />
        </div>
      </section>
    )
  }

  const pct = Math.round((score.total / score.max) * 100)
  return (
    <section style={s.wrap}>
      <div style={s.card}>
        <div style={s.kicker}>Pre-check saved</div>
        <h2 style={s.title}>
          You scored {score.total}/{score.max} ({pct}%)
        </h2>
        <p style={s.body}>
          That&rsquo;s your baseline. After you&rsquo;ve rated a few personas,
          take the same check again and compare - that&rsquo;s how this tool
          shows what it teaches.
        </p>
        <div style={s.actions}>
          <button onClick={() => onDone(answers)} style={s.primary}>
            Start rating personas
          </button>
        </div>
      </div>
    </section>
  )
}

const s = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '20px' },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '24px 28px',
    background: 'var(--surface)',
  },
  kicker: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 6,
  },
  title: { fontSize: 22, margin: '0 0 10px' },
  body: { fontSize: 14, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  primary: {
    padding: '10px 20px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondary: {
    padding: '10px 20px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 15,
    cursor: 'pointer',
  },
}
