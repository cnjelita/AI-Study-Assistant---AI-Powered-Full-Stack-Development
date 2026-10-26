import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

const tokenKey = 'study-assistant-token'

function readToken() {
  try {
    return sessionStorage.getItem(tokenKey) || ''
  } catch {
    return ''
  }
}

async function request(path, { token, body, signal } = {}) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed. Please try again.')
    error.status = response.status
    throw error
  }
  return data
}

function ErrorMessage({ message }) {
  return message ? <p className="error" role="alert">{message}</p> : null
}

function AuthForm({ register, onLogin }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      const data = await request(register ? '/auth/register' : '/auth/login', {
        body: {
          ...(register ? { name: form.get('name').trim() } : {}),
          email: form.get('email').trim(),
          password: form.get('password'),
        },
      })
      onLogin(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card auth">
      <h1>{register ? 'Create a learner account' : 'Welcome back'}</h1>
      <p>{register ? 'Ask questions and practice what you learn.' : 'Log in to your AI Study Assistant.'}</p>
      <form onSubmit={submit}>
        {register && <label>Name<input name="name" autoComplete="name" required maxLength={100} /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined} maxLength={72} /></label>
        {register && <small>Use at least 12 characters, up to 72 UTF-8 bytes. Registration creates a learner, not an admin.</small>}
        <ErrorMessage message={error} />
        <button disabled={busy}>{busy ? 'Please wait…' : register ? 'Register' : 'Log in'}</button>
      </form>
      <p>{register ? 'Already registered? ' : 'New here? '}<Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Register'}</Link></p>
    </section>
  )
}

function Study({ api, user }) {
  const [answer, setAnswer] = useState('')
  const [practice, setPractice] = useState('')
  const [sources, setSources] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setAnswer('')
    setPractice('')
    setSources([])
    try {
      const result = await api('/study/ask', {
        body: {
          question: form.get('question').trim(),
          includePractice: form.get('includePractice') === 'on',
        },
      })
      setAnswer(result.answer)
      setPractice(result.practice || '')
      setSources(result.sources || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h1>AI Study</h1>
      <p>{user.role === 'admin'
        ? 'Ask about a topic. Relevant context comes only from your own notes.'
        : 'Ask a general study question. Private administrator notes are never used.'}</p>
      <form onSubmit={submit}>
        <label>Topic or question<textarea name="question" placeholder="What is photosynthesis?" required maxLength={2000} rows={4} /></label>
        <label className="checkbox"><input name="includePractice" type="checkbox" /> Include three short practice questions</label>
        <button disabled={busy}>{busy ? 'Thinking…' : 'Ask AI'}</button>
      </form>
      <ErrorMessage message={error} />
      <div aria-live="polite" aria-busy={busy}>
        {busy && <p>Ollama is preparing your answer. This may take a moment.</p>}
        {answer && <section className="answer"><h2>Study answer</h2><div className="preserve-text">{answer}</div><small>AI can make mistakes. Check important facts against your study materials.</small></section>}
        {practice && <section className="answer"><h2>Practice questions</h2><div className="preserve-text">{practice}</div></section>}
        {sources.length > 0 && <section><h2>Your note sources</h2><ul>{sources.map((source) => <li key={source.noteId}>{source.title} · {source.subject}</li>)}</ul></section>}
      </div>
    </section>
  )
}

function MyNotes({ api }) {
  const [notes, setNotes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    api('/notes', { signal: controller.signal })
      .then((data) => setNotes(data.notes))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api])

  return (
    <section className="card">
      <h1>My Notes</h1>
      <p>Only you can view these notes or use them as AI context.</p>
      <Link to="/add-note">Add a note</Link>
      <ErrorMessage message={error} />
      {loading ? <p role="status">Loading notes…</p> : !error && notes.length === 0 && <p>No notes yet. Add your first study note.</p>}
      <div className="notes">
        {notes.map((note) => <article key={note.id} className="note">
          <h2>{note.title}</h2><p className="subject">{note.subject}</p><div className="preserve-text">{note.content}</div>
        </article>)}
      </div>
    </section>
  )
}

function AddNote({ api }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api('/notes', { body: {
        title: form.get('title').trim(),
        subject: form.get('subject').trim(),
        content: form.get('content').trim(),
      } })
      navigate('/my-notes')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h1>Add Note</h1>
      <p>Your note stays private to your account. Ollama must be running to index it.</p>
      <form onSubmit={submit}>
        <label>Title<input name="title" required maxLength={200} /></label>
        <label>Subject<input name="subject" required maxLength={100} /></label>
        <label>Content<textarea name="content" required maxLength={20000} rows={12} /></label>
        <ErrorMessage message={error} />
        <button disabled={busy}>{busy ? 'Saving and indexing…' : 'Save note'}</button>
      </form>
    </section>
  )
}

function Protected({ user, admin = false }) {
  if (!user) return <Navigate to="/login" replace />
  if (admin && user.role !== 'admin') return <Navigate to="/study" replace />
  return <Outlet />
}

function App() {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(token))
  const [sessionError, setSessionError] = useState('')

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    try { sessionStorage.removeItem(tokenKey) } catch { /* Storage may be disabled. */ }
  }, [])

  useEffect(() => {
    if (!token || !checking) return
    const controller = new AbortController()
    request('/auth/me', { token, signal: controller.signal })
      .then((data) => { setUser(data.user); setSessionError('') })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          logout()
          setSessionError(err.status === 401 ? 'Your session expired. Please log in again.' : 'Could not restore your session. Please log in again.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [token, checking, logout])

  const api = useCallback(async (path, options = {}) => {
    try {
      return await request(path, { ...options, token })
    } catch (err) {
      if (err.status === 401) {
        logout()
        setSessionError('Your session expired. Please log in again.')
      }
      throw err
    }
  }, [token, logout])

  function login(data) {
    try { sessionStorage.setItem(tokenKey, data.token) } catch { /* Login still works without storage. */ }
    setSessionError('')
    setUser(data.user)
    setToken(data.token)
  }

  if (checking) return <main><p role="status">Checking session…</p></main>
  return (
    <BrowserRouter>
      <header>
        <span className="brand">AI Study Assistant</span>
        {user && <nav aria-label="Main navigation">
          <NavLink to="/study">AI Study</NavLink>
          {user.role === 'admin' && <><NavLink to="/my-notes">My Notes</NavLink><NavLink to="/add-note">Add Note</NavLink></>}
          <span>{user.name} · {user.role === 'admin' ? 'Admin' : 'Learner'}</span>
          <button className="secondary" onClick={logout}>Logout</button>
        </nav>}
      </header>
      <main>
        <ErrorMessage message={sessionError} />
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/study" replace /> : <AuthForm key="login" onLogin={login} />} />
          <Route path="/register" element={user ? <Navigate to="/study" replace /> : <AuthForm key="register" register onLogin={login} />} />
          <Route element={<Protected user={user} />}>
            <Route path="/study" element={<Study key={token} api={api} user={user} />} />
          </Route>
          <Route element={<Protected user={user} admin />}>
            <Route path="/my-notes" element={<MyNotes key={token} api={api} />} />
            <Route path="/add-note" element={<AddNote key={token} api={api} />} />
          </Route>
          <Route path="*" element={<Navigate to={user ? '/study' : '/login'} replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
