const API = '/api'
export const SESSION_KEY = 'radicalisation-aw-session'

// A per-browser session id lets the backend serve each persona at most once
// per session (no repeats during a demo). Persists across reloads.
function sessionId() {
  let s
  try {
    s = localStorage.getItem(SESSION_KEY)
  } catch (e) {
    /* ignore */
  }
  if (!s) {
    s = Math.random().toString(36).slice(2) + Date.now().toString(36)
    try {
      localStorage.setItem(SESSION_KEY, s)
    } catch (e) {
      /* ignore */
    }
  }
  return s
}

export async function fetchPersona() {
  const r = await fetch(`${API}/persona?session=${sessionId()}`)
  if (!r.ok) throw new Error('failed to load persona')
  return r.json()
}

export async function revealPersona(uuid, guess) {
  const r = await fetch(`${API}/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuid, guess }),
  })
  if (!r.ok) throw new Error('failed to reveal')
  return r.json()
}

export async function fetchPerformance() {
  const r = await fetch(`${API}/performance`)
  if (!r.ok) return {}
  return r.json()
}

export async function submitSession(payload) {
  const r = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('upload failed')
  return r.json()
}

export async function fetchAdminSummary() {
  const r = await fetch(`${API}/admin/summary`)
  if (!r.ok) throw new Error('failed to load admin summary')
  return r.json()
}

export async function adminAction(action) {
  const r = await fetch(`${API}/admin/${action}`, { method: 'POST' })
  if (!r.ok) throw new Error('admin action failed')
  return r.json()
}
