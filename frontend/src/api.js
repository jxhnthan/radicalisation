const API = '/api'
export const SESSION_KEY = 'radicalisation-aw-session'

function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch (e) {
    // localStorage can be unavailable (private mode) - degrade gracefully.
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

// Cryptographically random session id (stable per browser). Uses the Web Crypto
// API rather than Math.random so the id is not predictable; works offline and
// in all modern browsers.
function newSessionId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// A per-browser session id lets the backend serve each persona at most once
// per session (no repeats during a demo). Persists across reloads.
function sessionId() {
  const stored = storageGet(SESSION_KEY)
  if (stored) return stored
  const s = newSessionId()
  storageSet(SESSION_KEY, s)
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
