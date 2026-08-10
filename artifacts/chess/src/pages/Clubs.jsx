import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, Users, LogIn, LogOut, Loader2 } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import api from '../services/api'
import './Clubs.css'

export default function Clubs() {
  const navigate = useNavigate()
  const { user, isLoggedIn, isLoading } = useUser()
  const [clubs, setClubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  async function loadClubs() {
    setLoading(true)
    try {
      const data = await api.getClubs()
      setClubs(Array.isArray(data?.clubs) ? data.clubs : [])
      setError('')
    } catch (err) { setError(err.message || 'Failed to load clubs') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isLoggedIn) loadClubs() }, [isLoggedIn])

  async function createClub(event) {
    event.preventDefault()
    if (!form.name.trim() || !form.description.trim()) return
    setSaving(true)
    try {
      const data = await api.createClub(form)
      setClubs((current) => [data.club, ...current])
      setForm({ name: '', description: '' })
      setShowCreate(false)
      setNotice('Club created.')
    } catch (err) { setError(err.message || 'Failed to create club') }
    finally { setSaving(false) }
  }

  async function toggleMembership(club) {
    try {
      await api.joinClub(club.slug)
      setNotice(`Joined ${club.name}.`)
      setClubs((current) => current.map((item) => item.slug === club.slug ? { ...item, memberCount: (item.memberCount || 0) + 1 } : item))
    } catch (err) { setError(err.message || 'Failed to join club') }
  }

  if (isLoading) return <div className="clubs-page"><div className="clubs-container clubs-loading">Loading…</div></div>
  if (!isLoggedIn || !user) return <div className="clubs-page"><div className="clubs-container"><div className="clubs-empty card-surface"><Building2 size={40} /><h2>Log in to explore clubs</h2><button onClick={() => navigate('/login')}>Log In</button></div></div></div>

  return (
    <div className="clubs-page"><div className="clubs-container">
      <header className="clubs-header"><div className="clubs-eyebrow"><Building2 size={14} /> Social</div><h1>Clubs</h1><p>Find players who share your chess interests.</p><button className="clubs-primary" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Create club</button></header>
      {notice && <p className="clubs-notice" role="status">{notice}</p>}
      {showCreate && <form className="clubs-create card-surface" onSubmit={createClub}><input aria-label="Club name" placeholder="Club name" value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} /><textarea aria-label="Club description" placeholder="What is this club about?" value={form.description} maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} /><button className="clubs-primary" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create</button></form>}
      {error && <p className="clubs-error" role="alert">{error}</p>}
      {loading ? <div className="clubs-loading"><Loader2 className="spin" /> Loading clubs…</div> : clubs.length === 0 ? <div className="clubs-empty card-surface"><Users size={36} /><p>No clubs yet. Create the first one.</p></div> : <div className="clubs-grid">{clubs.map((club) => <article className="club-card card-surface" key={club.slug}><div className="club-card-icon"><Building2 size={20} /></div><h2>{club.name}</h2><p>{club.description}</p><div className="club-meta"><span><Users size={14} /> {club.memberCount || 0} members</span><button className="club-join" onClick={() => toggleMembership(club)}><LogIn size={14} /> Join</button></div></article>)}</div>}
    </div></div>
  )
}
