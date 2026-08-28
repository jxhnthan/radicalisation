// Pre/post learning check: short scenarios rated before and after the user
// rates personas. The pre-check runs as its own screen before the game so it is
// a true baseline; the post-check runs after N ratings and the comparison
// shows what changed, so the tool can measure knowledge learnt.

export const QUIZ_OPTIONS = [
  { v: 2, label: 'Clear risk', desc: 'I would flag this' },
  { v: 1, label: 'Possible risk', desc: 'Unsure' },
  { v: 0, label: 'Low risk', desc: 'I would not flag this' },
]

export const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    flag: true,
    text: 'A colleague tells you the government is hiding the truth and only he can see it. He has stopped talking to his team and family.',
    explain:
      'A fixed "only I know the truth" belief together with withdrawal from family and colleagues is a classic vulnerability pattern.',
  },
  {
    id: 'q2',
    flag: false,
    text: 'A friend is frustrated with long wait times at the polyclinic and posts about it online. Nothing else has changed in his life.',
    explain:
      'Ordinary service frustration is common and, on its own, is not a risk marker.',
  },
  {
    id: 'q3',
    flag: true,
    text: 'A neighbour joined an online group that talks about "the enemy within" and says ordinary people are being replaced. He has cut off contact with his family.',
    explain:
      '"Them vs us" framing of a whole group plus cutting off family points to radicalisation-vulnerability indicators.',
  },
  {
    id: 'q4',
    flag: false,
    text: 'A teammate complains about tight deadlines and says management "doesn\'t care". He still socialises normally and gets on with his work.',
    explain:
      'Workplace grumbling without grievance fixation, isolation or escalating distrust is not a risk signal.',
  },
  {
    id: 'q5',
    flag: true,
    text: 'Someone you know says the system is rigged against people like him, and has quit his job to spend all his time with a small online group that talks about "waking people up".',
    explain:
      'Institutional-distrust fixation, dropping out of normal life and immersion in a radicalising group together are strong markers.',
  },
  {
    id: 'q6',
    flag: false,
    text: 'A relative is going through a divorce and has become quiet and withdrawn, spending more time alone. Nothing about politics, causes or grievances.',
    explain:
      'Withdrawal after a life event is not the same as ideological isolation; context matters.',
  },
  {
    id: 'q7',
    flag: true,
    text: 'A classmate suddenly talks only about "the corruption of the elites", wears a symbol of the group, and says he will "sacrifice everything" for the cause.',
    explain:
      'A sudden single-minded cause, group affiliation and self-sacrifice language together are all vulnerability indicators.',
  },
  {
    id: 'q8',
    flag: false,
    text: 'A colleague grumbles about office politics and says "the higher-ups always win". He is otherwise warm and active in the community.',
    explain:
      'General cynicism without a fixed out-group or behavioural change is ordinary discontent, not a risk marker.',
  },
]

export const PRE_KEY = 'radicalisation-aw-quiz-pre'
export const POST_KEY = 'radicalisation-aw-quiz-post'
// Set to '1' when the user skips the first-visit pre-check screen.
export const SKIP_KEY = 'radicalisation-aw-quiz-skip'

// Number of ratings before the post-check unlocks.
export const POST_MIN_RATED = 5

export function loadQuiz(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null
  } catch (e) {
    return null
  }
}

// Store answers as { answers: [{ qid, v }], at }.
export function saveQuiz(key, answers) {
  const payload = { answers, at: new Date().toISOString() }
  try {
    localStorage.setItem(key, JSON.stringify(payload))
  } catch (e) {
    /* ignore */
  }
  return payload
}

// Old-format payloads (flat { q1: 'yes', ... }) are ignored so a fresh check is
// forced; a quiz is only valid when it has an answers array.
export function normalizeQuiz(q) {
  return q && Array.isArray(q.answers) ? q : null
}

function ptsFor(q, v) {
  if (v == null) return null
  if (q.flag) {
    if (v === 2) return 1
    if (v === 1) return 0.5
    return 0
  }
  if (v === 0) return 1
  if (v === 1) return 0.5
  return 0
}

// Score a set of answers. Full credit (1) for the correct extreme, half (0.5)
// for "possible risk" (an honest unsure), zero for the wrong extreme.
export function scoreQuiz(answers) {
  const per = QUIZ_QUESTIONS.map((q) => {
    const a = (answers || []).find((x) => x.qid === q.id)
    const v = a ? a.v : null
    return { qid: q.id, flag: q.flag, v, pts: ptsFor(q, v) }
  })
  const total = per.reduce((s, p) => s + (p.pts ?? 0), 0)
  return { total, max: QUIZ_QUESTIONS.length, per }
}
