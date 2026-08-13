import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { Hash, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react'
import api from '../services/api'
import socket from '../services/socket'
import './Chat.css'

const DEFAULT_ROOM = 'lounge'
const POLL_INTERVAL_MS = 30000

const ROOMS = [
  { key: 'lounge', label: 'Global Lounge' },
  { key: 'help', label: 'Help & Support' },
]

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Chat() {
  const navigate = useNavigate()
  const { user, isLoggedIn, isLoading } = useUser()

  const [room, setRoom] = useState(DEFAULT_ROOM)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)

  const listRef = useRef(null)
  const knownIdsRef = useRef(new Set())

  // Merge new messages in, deduping by id so socket echo + ack + polling never
  // produce duplicates.
  const appendMessages = useCallback((incoming) => {
    const items = (Array.isArray(incoming) ? incoming : [incoming]).filter((m) => m && m.id != null)
    const additions = items.filter((m) => !knownIdsRef.current.has(String(m.id)))
    if (additions.length === 0) return
    additions.forEach((m) => knownIdsRef.current.add(String(m.id)))
    setMessages((prev) => {
      const known = new Set(prev.map((m) => String(m.id)))
      const fresh = additions.filter((m) => !known.has(String(m.id)))
      if (fresh.length === 0) return prev
      return [...prev, ...fresh].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    })
  }, [])

  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await api.getMessages(room, 50)
      const list = Array.isArray(data?.messages) ? data.messages : []
      list.forEach((m) => knownIdsRef.current.add(String(m.id)))
      setMessages(list)
    } catch (err) {
      setError(err.message || 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [room])

  // Initial history load whenever the room (or auth) changes.
  useEffect(() => {
    if (!isLoggedIn) return
    loadMessages()
  }, [isLoggedIn, room, loadMessages])

  // Live socket chat: join only after the connection is established, then
  // continue polling as a fallback when real-time delivery is unavailable.
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return
    let mounted = true

    const connectAndJoin = async () => {
      await socket.connect().catch(() => {})
      if (!mounted) return
      setConnected(Boolean(socket.isConnected))
      if (socket.isConnected) socket.joinChat(room)
    }
    connectAndJoin()

    const handleMessage = (data) => { if (data?.room === room) appendMessages(data) }
    const handleAck = (data) => { if (data?.room === room) appendMessages(data) }
    const handleStatus = (status) => { setConnected(Boolean(status?.connected)) }
    socket.on('chat:message', handleMessage)
    socket.on('chat:ack', handleAck)
    socket.on('connection_status', handleStatus)

    const poll = setInterval(() => loadMessages(true), POLL_INTERVAL_MS)
    return () => {
      mounted = false
      clearInterval(poll)
      socket.off('chat:message', handleMessage)
      socket.off('chat:ack', handleAck)
      socket.off('connection_status', handleStatus)
      socket.leaveChat(room)
    }
  }, [isLoggedIn, user?.id, room, appendMessages, loadMessages])

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function handleSend(event) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setSending(true)
    setError('')
    try {
      const sent = await socket.sendChat(room, trimmed, { id: String(user?.id), username: user?.username })
      if (sent) {
        // Server echoes the persisted message back via chat:message / chat:ack.
        setBody('')
        return
      }
      // Fall back to REST when the socket is unavailable.
      const data = await api.sendMessage(room, trimmed)
      if (data?.message) appendMessages(data.message)
      setBody('')
    } catch (err) {
      setError(err.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (isLoading) {
    return (
      <div className="chat-page">
        <div className="chat-container">
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!isLoggedIn || !user) {
    return (
      <div className="chat-page">
        <div className="chat-container">
          <div className="chat-empty-card card-surface">
            <MessageCircle size={40} />
            <h2>Log in to join the chat</h2>
            <button className="chat-primary-btn" onClick={() => navigate('/login')}>Log In</button>
          </div>
        </div>
      </div>
    )
  }

  const roomLabel = ROOMS.find((r) => r.key === room)?.label || room
  const connectionLabel = connected ? 'Live' : socket.isRealtimeAvailable ? 'Reconnecting' : 'Polling'
  const connectionTitle = connected
    ? 'Live delivery is active'
    : socket.isRealtimeAvailable
      ? 'Reconnecting to live delivery'
      : 'Live delivery is unavailable; messages refresh automatically'

  return (
    <div className="chat-page">
      <div className="chat-container">
        <header className="chat-header">
          <div className="chat-eyebrow">
            <MessageCircle size={13} />
            <span>Social</span>
          </div>
          <h1 className="chat-title">Chat</h1>
          <p className="chat-subtitle">Lobby chat with players from around the site.</p>
        </header>

        <div className="chat-card card-surface">
          <div className="chat-card-top">
            <div className="chat-rooms" role="tablist" aria-label="Chat rooms">
              {ROOMS.map((r) => (
                <button
                  key={r.key}
                  role="tab"
                  aria-selected={r.key === room}
                  className={`chat-room-tab ${r.key === room ? 'is-active' : ''}`}
                  onClick={() => setRoom(r.key)}
                >
                  <Hash size={13} />
                  {r.label}
                </button>
              ))}
            </div>
            <span className={`chat-live ${connected ? 'is-online' : ''}`} title={connectionTitle}>
              <span className="chat-live-dot" />
              {connectionLabel}
            </span>
          </div>

          <div className="chat-thread" ref={listRef} role="log" aria-live="polite" aria-label={`${roomLabel} messages`}>
            {loading && messages.length === 0 ? (
              <div className="chat-loading"><Loader2 size={18} className="spin" /> Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                <MessageCircle size={36} />
                <p>No messages in {roomLabel} yet. Say hello!</p>
              </div>
            ) : (
              messages.map((m) => {
                const own = user?.id != null && m.userId != null && String(m.userId) === String(user.id)
                return (
                  <div key={String(m.id)} className={`chat-msg ${own ? 'is-own' : ''}`}>
                    <div className="chat-msg-meta">
                      <span className="chat-msg-username">{m.username || 'guest'}</span>
                      {m.timestamp && <time className="chat-msg-time">{formatTime(m.timestamp)}</time>}
                    </div>
                    <div className="chat-msg-body">{m.body}</div>
                  </div>
                )
              })
            )}
            {error && <p className="chat-error" role="alert">{error}</p>}
          </div>

          <form className="chat-composer" onSubmit={handleSend}>
            <label className="sr-only" htmlFor="chat-body">Message</label>
            <input
              id="chat-body"
              type="text"
              className="chat-input"
              placeholder={`Message ${roomLabel}…`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              autoComplete="off"
            />
            <button type="submit" className="chat-send" disabled={sending || !body.trim()}>
              {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              <span className="chat-send-label">Send</span>
            </button>
          </form>
        </div>

        <section className="chat-tip card-surface">
          <RefreshCw size={16} />
          <p>Messages are saved and shown to everyone in the room. Delivery is live over socket with polling as a backup.</p>
        </section>
      </div>
    </div>
  )
}
