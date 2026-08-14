import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { Users, UserPlus, UserMinus, MessageCircle, RefreshCw, ArrowUpRight, Check, Loader2, Wifi, WifiOff } from 'lucide-react'
import api from '../services/api'
import socket from '../services/socket'
import './Friends.css'

const POLL_INTERVAL_MS = 30000

export default function Friends() {
  const navigate = useNavigate()
  const { user, isLoggedIn, isLoading } = useUser()

  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlineIds, setOnlineIds] = useState(() => new Set())
  const onlineIdsRef = useRef(onlineIds)
  onlineIdsRef.current = onlineIds

  const [addUsername, setAddUsername] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [removing, setRemoving] = useState('')

  const loadFriends = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await api.getFriends()
      const list = Array.isArray(data?.friends) ? data.friends : []
      setFriends(list)
      setOnlineIds((prev) => new Set([...prev, ...list.filter((f) => f.online).map((f) => String(f.id))]))
    } catch (err) {
      setError(err.message || 'Failed to load friends')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    loadFriends()
  }, [isLoggedIn, loadFriends])

  // Join presence so the server can flag us online for our friends' lists.
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return
    socket.joinPresence({ id: user.id, username: user.username }).catch(() => {})
    const poll = setInterval(() => loadFriends(true), POLL_INTERVAL_MS)
    return () => {
      clearInterval(poll)
      socket.leavePresence()
    }
  }, [isLoggedIn, user?.id, user?.username, loadFriends])

  // Live presence updates from the socket.
  useEffect(() => {
    const handleOnline = (data) => {
      if (data?.userId) {
        const id = String(data.userId)
        setOnlineIds((prev) => {
          if (prev.has(id)) return prev
          const next = new Set(prev)
          next.add(id)
          return next
        })
      }
    }
    const handleOffline = (data) => {
      if (data?.socketId || data?.userId) {
        setOnlineIds((prev) => {
          if (prev.size === 0) return prev
          const next = new Set(prev)
          if (data.userId) next.delete(String(data.userId))
          return next
        })
      }
    }
    socket.on('user:online', handleOnline)
    socket.on('user:offline', handleOffline)
    return () => {
      socket.off('user:online', handleOnline)
      socket.off('user:offline', handleOffline)
    }
  }, [])

  async function handleAddFriend(event) {
    event.preventDefault()
    const username = addUsername.trim()
    if (!username) return
    setAdding(true)
    setAddError('')
    setAddSuccess('')
    try {
      await api.addFriend(username)
      setAddSuccess(`${username} added to your friends.`)
      setAddUsername('')
      loadFriends(true)
    } catch (err) {
      setAddError(err.message || 'Failed to add friend')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveFriend(friend) {
    setRemoving(String(friend.id))
    try {
      await api.removeFriend(friend.username)
      setFriends((prev) => prev.filter((f) => String(f.id) !== String(friend.id)))
    } catch (err) {
      setError(err.message || 'Failed to remove friend')
    } finally {
      setRemoving('')
    }
  }

  if (isLoading) {
    return (
      <div className="friends-page">
        <div className="friends-container">
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!isLoggedIn || !user) {
    return (
      <div className="friends-page">
        <div className="friends-container">
          <div className="friends-empty-card card-surface">
            <Users size={40} />
            <h2>Access Restricted</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', textAlign: 'center' }}>
              You need to be logged in to access account specific privileges.
            </p>
            <button className="friends-primary-btn" onClick={() => navigate('/login')}>
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="friends-page">
      <div className="friends-container">
        <header className="friends-header">
          <div className="friends-eyebrow">
            <Users size={13} />
            <span>Social</span>
          </div>
          <h1 className="friends-title">Friends</h1>
          <p className="friends-subtitle">
            Add players, see who is online, and jump into games together.
          </p>
        </header>

        {/* Add friend */}
        <section className="friends-card card-surface">
          <form className="friends-add-form" onSubmit={handleAddFriend}>
            <label className="sr-only" htmlFor="friend-username">Username</label>
            <input
              id="friend-username"
              type="text"
              className="friends-input"
              placeholder="Add by username"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              maxLength={50}
              autoComplete="off"
            />
            <button type="submit" className="friends-primary-btn" disabled={adding || !addUsername.trim()}>
              {adding ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
              Add Friend
            </button>
          </form>
          {addError && <p className="friends-form-msg friends-form-msg--error" role="alert">{addError}</p>}
          {addSuccess && <p className="friends-form-msg friends-form-msg--success" role="status">{addSuccess}</p>}
        </section>

        {/* Friend list */}
        <section className="friends-list-section">
          <div className="friends-list-head">
            <h2 className="section-title">Your Friends</h2>
            <button
              className="friends-refresh"
              onClick={() => loadFriends(true)}
              title="Refresh"
              aria-label="Refresh friends"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {loading && friends.length === 0 ? (
            <div className="friends-loading card-surface"><Loader2 size={18} className="spin" /> Loading friends…</div>
          ) : friends.length === 0 ? (
            <div className="friends-empty-card card-surface">
              <Users size={36} />
              <p>No friends yet. Add someone by username above to get started.</p>
            </div>
          ) : (
            <ul className="friends-list">
              {friends.map((friend) => {
                const isOnline = onlineIds.has(String(friend.id)) || Boolean(friend.online)
                return (
                  <li key={String(friend.id)} className="friend-row card-surface">
                    <span className={`friend-status-dot ${isOnline ? 'is-online' : ''}`} aria-label={isOnline ? 'Online' : 'Offline'} />
                    <div className="friend-info">
                      <span className="friend-name">{friend.username}</span>
                      <span className="friend-meta">
                        {isOnline ? <><Wifi size={12} /> Online</> : <><WifiOff size={12} /> Offline</>}
                      </span>
                    </div>
                    <div className="friend-actions">
                      <button
                        className="friend-action friend-action--chat"
                        onClick={() => navigate('/chat')}
                        title="Chat"
                        aria-label={`Chat with ${friend.username}`}
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        className="friend-action friend-action--remove"
                        onClick={() => handleRemoveFriend(friend)}
                        disabled={removing === String(friend.id)}
                        title="Remove friend"
                        aria-label={`Remove ${friend.username}`}
                      >
                        {removing === String(friend.id) ? <Loader2 size={16} className="spin" /> : <UserMinus size={16} />}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {error && <p className="friends-error" role="alert">{error}</p>}
        </section>

        <section className="friends-tip card-surface">
          <ArrowUpRight size={16} />
          <p>Tip: friends appear with a green dot when they are online on the site.</p>
        </section>
      </div>
    </div>
  )
}