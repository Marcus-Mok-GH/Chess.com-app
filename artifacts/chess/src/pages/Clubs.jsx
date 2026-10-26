import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, Users, LogIn, LogOut, Loader2 } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import api from '../services/api'
import AccountRequired from '../components/AccountRequired'
import './Clubs.css'
import { useT } from '../i18n/I18nContext';
import { useI18n } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';

export default function Clubs() {
  const t = useT();
  const { tCount } = useI18n();
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
      setNotice(tNow('Club created.'))
    } catch (err) { setError(err.message || 'Failed to create club') }
    finally { setSaving(false) }
  }

  async function toggleMembership(club) {
    try {
      await api.joinClub(club.slug)
      setNotice(tNow('Joined {club}.', { club: club.name }))
      setClubs((current) => current.map((item) => item.slug === club.slug ? { ...item, memberCount: (item.memberCount || 0) + 1 } : item))
    } catch (err) { setError(err.message || 'Failed to join club') }
  }

  if (isLoading) return <div className="clubs-page"><div className="clubs-container clubs-loading">{t("Loading…")}</div></div>
  if (!isLoggedIn || !user) return <div className="clubs-page"><div className="clubs-container">
    <header className="clubs-header"><div className="clubs-eyebrow"><Building2 size={14} /> {' '}{t("Social")}</div><h1>{t("Clubs")}</h1><p>{t("Find players who share your chess interests.")}</p></header>
    <AccountRequired
      title={t("Clubs are for members")}
      message={t("Creating, joining, and browsing clubs is tied to your account. Log in to get started.")}
    />
  </div></div>

  return (
    <div className="clubs-page"><div className="clubs-container">
      <header className="clubs-header"><div className="clubs-eyebrow"><Building2 size={14} /> {' '}{t("Social")}</div><h1>{t("Clubs")}</h1><p>{t("Find players who share your chess interests.")}</p><button className="clubs-primary" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> {' '}{t("Create club")}</button></header>
      {notice && <p className="clubs-notice" role="status">{notice}</p>}
      {showCreate && <form className="clubs-create card-surface" onSubmit={createClub}><input aria-label={t("Club name")} placeholder={t("Club name")} value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} /><textarea aria-label={t("Club description")} placeholder={t("What is this club about?")} value={form.description} maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} /><button className="clubs-primary" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} {' '}{t("Create")}</button></form>}
      {error && <p className="clubs-error" role="alert">{t(error)}</p>}
      {loading ? <div className="clubs-loading"><Loader2 className="spin" /> {' '}{t("Loading clubs…")}</div> : clubs.length === 0 ? <div className="clubs-empty card-surface"><Users size={36} /><p>{t("No clubs yet. Create the first one.")}</p></div> : <div className="clubs-grid">{clubs.map((club) => <article className="club-card card-surface" key={club.slug}><div className="club-card-icon"><Building2 size={20} /></div><h2>{club.name}</h2><p>{club.description}</p><div className="club-meta"><span><Users size={14} /> {tCount(club.memberCount || 0, '{count} member', '{count} members')}</span><button className="club-join" onClick={() => toggleMembership(club)}><LogIn size={14} /> {' '}{t("Join")}</button></div></article>)}</div>}
    </div></div>
  )
}
