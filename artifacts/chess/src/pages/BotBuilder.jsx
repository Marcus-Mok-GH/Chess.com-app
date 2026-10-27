import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useI18n, useT } from '../i18n/I18nContext';
import { api } from '../services/api';
import {
  Bot,
  Plus,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  Users,
  MessageSquare,
  Crown,
  Shield,
  Cpu,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';
import './BotBuilder.css';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function chatFrequencyLabel(value) {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  const frequency = Number(value);
  if (!Number.isFinite(frequency)) return 'medium';
  if (frequency < 0.2) return 'low';
  if (frequency > 0.45) return 'high';
  return 'medium';
}

/* ─── Main Component ──────────────────────────────────────────────────────── */
export default function BotBuilder() {
  const { user } = useUser();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [botsError, setBotsError] = useState('');
  const [botModels, setBotModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [modelsConnected, setModelsConnected] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', bot: Bot | null }
  const [form, setForm] = useState(initialForm());
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());

  /* ─── Auth check ────────────────────────────────────────────────────────── */
  const isAdmin = user?.isAdmin === true;
  if (!isAdmin) {
    return (
      <div className="bot-builder-page bot-builder-access-denied">
        <Crown className="access-denied-icon" size={64} />
        <h1>{t('Admin access required')}</h1>
        <p>{t('Bot Builder is only available to administrators.')}</p>
      </div>
    );
  }

  /* ─── Toast ─────────────────────────────────────────────────────────────── */
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ─── Load bots ─────────────────────────────────────────────────────────── */
  const loadBots = useCallback(async () => {
    try {
      const data = await api.adminListBots();
      setBots(data.bots || []);
      setBotsError('');
    } catch (e) {
      console.error('[BotBuilder] loadBots error:', e);
      setBotsError(t('Failed to load bots. Please retry.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBotModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const result = await api.adminListBotModels();
      const models = Array.isArray(result.models) ? result.models : [];
      setBotModels(models);
      setModelsConnected(Boolean(result.connected));
      setModelsError('');
      const defaultModel = models.find((model) => !model.paidOnly)?.id || models[0]?.id || '';
      if (defaultModel) {
        setForm((current) => current.model ? current : { ...current, model: defaultModel });
      }
    } catch (error) {
      console.error('[BotBuilder] loadBotModels error:', error);
      setModelsError(t('Could not load AI models. Retry to try again.'));
    } finally {
      setModelsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadBots();
    loadBotModels();
  }, [loadBots, loadBotModels]);

  /* ─── Form handling ─────────────────────────────────────────────────────── */
  function initialForm() {
    return {
      id: '',
      username: '',
      displayName: '',
      avatar: '♟️',
      personality: '',
      systemPrompt: '',
      model: '',
      elo: 1500,
      playStyle: 'balanced',
      chatFrequency: 'medium',
      chatStyle: 'friendly',
      joinCommunities: false,
      createCommunities: false,
      autoJoinMatches: false,
      isActive: true,
      isPublic: true,
      createdBy: 'admin',
    };
  }

  function validateForm() {
    const errors = {};
    if (!form.model) errors.model = t('Choose an AI model');
    else if (modal?.mode === 'create' && !botModels.some((model) => model.id === form.model)) {
      errors.model = t('Select an AI model from the current list');
    }
    if (!form.username.trim()) errors.username = t('Username is required');
    else if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.username)) {
      errors.username = t('Username must be 3–20 chars (letters, numbers, underscore)');
    }
    if (!form.displayName.trim()) errors.displayName = t('Display name is required');
    if (!form.personality.trim()) errors.personality = t('Personality is required');
    if (form.elo < 100 || form.elo > 3000) errors.elo = t('ELO must be between 100 and 3000');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    if (formErrors[name]) setFormErrors((e) => ({ ...e, [name]: undefined }));
  };

  const openCreateModal = () => {
    const defaultModel = botModels.find((model) => !model.paidOnly)?.id || botModels[0]?.id || '';
    setForm({ ...initialForm(), model: defaultModel });
    setFormErrors({});
    setModal({ mode: 'create', bot: null });
  };

  const openEditModal = (bot) => {
    setForm({
      id: bot.id,
      username: bot.username,
      displayName: bot.display_name || bot.username,
      avatar: bot.avatar || '♟️',
      personality: bot.personality || '',
      systemPrompt: bot.system_prompt || '',
      model: bot.model || '',
      elo: bot.elo || 1500,
      playStyle: bot.play_style || 'balanced',
      chatFrequency: chatFrequencyLabel(bot.chat_frequency),
      chatStyle: bot.chat_style || 'friendly',
      joinCommunities: !!bot.join_communities,
      createCommunities: !!bot.create_communities,
      autoJoinMatches: !!bot.auto_join_matches,
      isActive: !!bot.is_active,
      isPublic: !!bot.is_public,
      createdBy: bot.created_by,
    });
    setFormErrors({});
    setModal({ mode: 'edit', bot });
  };

  const closeModal = () => {
    setModal(null);
    setForm(initialForm());
    setFormErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (modal.mode === 'create') {
        await api.adminCreateBot({
          username: form.username,
          display_name: form.displayName,
          avatar: form.avatar,
          personality: form.personality,
          system_prompt: form.systemPrompt,
          model: form.model,
          elo: form.elo,
          play_style: form.playStyle,
          chat_frequency: form.chatFrequency,
          chat_style: form.chatStyle,
          join_communities: form.joinCommunities,
          create_communities: form.createCommunities,
          auto_join_matches: form.autoJoinMatches,
          is_active: form.isActive,
          is_public: form.isPublic,
        });
        showToast(t('Bot created successfully'));
      } else {
        await api.adminUpdateBot(form.id, {
          display_name: form.displayName,
          avatar: form.avatar,
          personality: form.personality,
          system_prompt: form.systemPrompt,
          model: form.model,
          elo: form.elo,
          play_style: form.playStyle,
          chat_frequency: form.chatFrequency,
          chat_style: form.chatStyle,
          join_communities: form.joinCommunities,
          create_communities: form.createCommunities,
          auto_join_matches: form.autoJoinMatches,
          is_active: form.isActive,
          is_public: form.isPublic,
        });
        showToast(t('Bot updated successfully'));
      }
      closeModal();
      await loadBots();
    } catch (e) {
      console.error('[BotBuilder] submit error:', e);
      const msg = e.message || t('Operation failed');
      setFormErrors({ submit: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (bot) => {
    try {
      await api.adminUpdateBot(bot.id, { is_active: !bot.is_active });
      showToast(t(bot.is_active ? 'Bot deactivated' : 'Bot activated'));
      await loadBots();
    } catch (e) {
      console.error('[BotBuilder] toggle error:', e);
      showToast(t('Failed to toggle bot'), 'error');
    }
  };

  const handleDelete = async (bot) => {
    if (!window.confirm(t('Delete {name}? This cannot be undone.', { name: bot.display_name || bot.username }))) return;
    try {
      await api.adminDeleteBot(bot.id);
      showToast(t('Bot deleted'));
      await loadBots();
    } catch (e) {
      console.error('[BotBuilder] delete error:', e);
      showToast(t('Failed to delete bot'), 'error');
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  /* ─── Render ────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="bot-builder-page">
        <div className="bot-builder-loading">
          <Loader2 className="spin" size={32} color="var(--primary, #81b64c)" />
          <span>{t('Loading bots…')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bot-builder-page">
      {/* Toast */}
      {toast && (
        <div className={`bot-builder-toast ${toast.type}`} role="alert">
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label={t('Dismiss')}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bot-builder-header">
        <div className="bot-builder-title">
          <Bot className="bot-icon" size={28} />
          <div>
            <h1>{t('Bot Builder')}</h1>
            <p>{t('Create and manage AI bots that play, chat, and build communities')}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <Plus size={18} /> {t('Create Bot')}
        </button>
      </header>

      {/* Grid / Empty */}
      {botsError ? (
        <div className="bot-builder-empty bot-builder-load-error" role="alert">
          <h2>{t('Failed to load bots')}</h2>
          <p>{botsError}</p>
          <button className="btn-primary" onClick={loadBots}>{t('Retry')}</button>
        </div>
      ) : bots.length === 0 ? (
        <div className="bot-builder-empty">
          <Bot size={64} style={{ opacity: 0.3 }} />
          <h2>{t('No bots yet')}</h2>
          <p>{t('Create your first AI bot to join matches, chat with players, and build communities.')}</p>
          <button className="btn-primary" onClick={openCreateModal} style={{ marginTop: '0.5rem' }}>
            <Plus size={18} /> {t('Create Bot')}
          </button>
        </div>
      ) : (
        <div className="bot-builder-grid" role="list" aria-label={t('Bots')}>
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              expanded={expandedIds.has(bot.id)}
              onToggleExpand={() => toggleExpand(bot.id)}
              onEdit={() => openEditModal(bot)}
              onDelete={() => handleDelete(bot)}
              onToggleActive={() => handleToggleActive(bot)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="bot-builder-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-labelledby="bot-modal-title">
          <div className="bot-builder-modal" onClick={(e) => e.stopPropagation()}>
            <header className="bot-builder-modal-header">
              <h2 id="bot-modal-title">{modal.mode === 'create' ? t('Create Bot') : t('Edit Bot')}</h2>
              <button className="modal-close" onClick={closeModal} aria-label={t('Close')}>
                <X size={20} />
              </button>
            </header>
            <form onSubmit={handleSubmit} className="bot-builder-modal-body">
              {/* Identity */}
              <fieldset className="form-group">
                <legend>{t('Identity')}</legend>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="username">{t('Username')} <span style={{color:'#e05252'}}>*</span></label>
                    <input id="username" name="username" value={form.username} onChange={handleChange} placeholder="bot_username" disabled={modal.mode === 'edit'} />
                    {formErrors.username && <span className="form-error">{formErrors.username}</span>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="displayName">{t('Display Name')} <span style={{color:'#e05252'}}>*</span></label>
                    <input id="displayName" name="displayName" value={form.displayName} onChange={handleChange} placeholder="Bot Name" />
                    {formErrors.displayName && <span className="form-error">{formErrors.displayName}</span>}
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="avatar">{t('Avatar Emoji')}</label>
                  <input id="avatar" name="avatar" value={form.avatar} onChange={handleChange} placeholder="♟️" maxLength={4} style={{fontSize:'1.2rem'}} />
                  <p className="form-hint">{t('Single emoji, e.g. ♟️, 🤖, 🧙, 🐱')}</p>
                </div>
              </fieldset>

              {/* Personality */}
              <fieldset className="form-group">
                <legend>{t('Personality & AI')}</legend>
                <div className="form-group">
                  <label htmlFor="personality">{t('Personality Description')} <span style={{color:'#e05252'}}>*</span></label>
                  <textarea id="personality" name="personality" value={form.personality} onChange={handleChange} placeholder={t('Describe the bot\'s personality, play style, and behavior…')} />
                  {formErrors.personality && <span className="form-error">{formErrors.personality}</span>}
                  <p className="form-hint">{t('This defines how the bot thinks, talks, and plays. Be specific!')}</p>
                </div>
                <div className="form-group">
                  <label htmlFor="systemPrompt">{t('System Prompt (optional)')}</label>
                  <textarea id="systemPrompt" name="systemPrompt" value={form.systemPrompt} onChange={handleChange} placeholder={t('Custom system prompt for the AI model. Leave empty to use default.')} />
                  <p className="form-hint">{t('Advanced: overrides the default system prompt sent to the model.')}</p>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="model">{t('AI Model')}</label>
                    <select id="model" name="model" value={form.model} onChange={handleChange} disabled={modelsLoading}>
                      <option value="" disabled>{modelsLoading ? t('Loading models…') : t('Choose a model')}</option>
                      {form.model && !botModels.some((model) => model.id === form.model) && (
                        <option value={form.model}>{form.model} ({t('no longer listed')})</option>
                      )}
                      {botModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.title}{model.paidOnly ? ` — ${t('Paid')}` : ''}
                        </option>
                      ))}
                    </select>
                    {formErrors.model && <span className="form-error">{formErrors.model}</span>}
                    {modelsError && (
                      <p className="form-error" role="alert">
                        {modelsError}{' '}
                        <button type="button" className="link-button" onClick={loadBotModels}>{t('Retry')}</button>
                      </p>
                    )}
                    {!modelsConnected && !modelsError && !modelsLoading && (
                      <p className="form-hint">{t('Connect Pollinations in AI Coach to enable bot model responses.')}</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="elo">{t('Starting ELO')} <span style={{color:'#e05252'}}>*</span></label>
                    <input id="elo" name="elo" type="number" min="100" max="3000" step="50" value={form.elo} onChange={handleChange} />
                    {formErrors.elo && <span className="form-error">{formErrors.elo}</span>}
                  </div>
                </div>
              </fieldset>

              {/* Play Style */}
              <fieldset className="form-group">
                <legend>{t('Play Style')}</legend>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="playStyle">{t('Play Style')}</label>
                    <select id="playStyle" name="playStyle" value={form.playStyle} onChange={handleChange}>
                      <option value="aggressive">{t('Aggressive')}</option>
                      <option value="balanced">{t('Balanced')}</option>
                      <option value="positional">{t('Positional')}</option>
                      <option value="tactical">{t('Tactical')}</option>
                      <option value="defensive">{t('Defensive')}</option>
                      <option value="creative">{t('Creative')}</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Chat Behavior */}
              <fieldset className="form-group">
                <legend>{t('Chat & Social Behavior')}</legend>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="chatFrequency">{t('Chat Frequency')}</label>
                    <select id="chatFrequency" name="chatFrequency" value={form.chatFrequency} onChange={handleChange}>
                      <option value="low">{t('Low (rarely chats)')}</option>
                      <option value="medium">{t('Medium (occasionally)')}</option>
                      <option value="high">{t('High (chatty)')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="chatStyle">{t('Chat Style')}</label>
                    <select id="chatStyle" name="chatStyle" value={form.chatStyle} onChange={handleChange}>
                      <option value="friendly">{t('Friendly')}</option>
                      <option value="competitive">{t('Competitive')}</option>
                      <option value="educational">{t('Educational')}</option>
                      <option value="playful">{t('Playful')}</option>
                      <option value="stoic">{t('Stoic')}</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Community & Match Behavior */}
              <fieldset className="form-group">
                <legend>{t('Community & Match Behavior')}</legend>
                <div className="form-group checkbox-group">
                  <label>
                    <input type="checkbox" name="joinCommunities" checked={form.joinCommunities} onChange={handleChange} />
                    {t('Auto-join communities')}
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input type="checkbox" name="createCommunities" checked={form.createCommunities} onChange={handleChange} />
                    {t('Create communities')}
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input type="checkbox" name="autoJoinMatches" checked={form.autoJoinMatches} onChange={handleChange} />
                    {t('Auto-join open matches')}
                  </label>
                </div>
              </fieldset>

              {/* Visibility */}
              <fieldset className="form-group">
                <legend>{t('Visibility & Status')}</legend>
                <div className="form-group checkbox-group">
                  <label>
                    <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} />
                    {t('Bot is active (can play, chat, join matches)')}
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input type="checkbox" name="isPublic" checked={form.isPublic} onChange={handleChange} />
                    {t('Bot is public (visible to all players)')}
                  </label>
                </div>
              </fieldset>

              {formErrors.submit && (
                <div className="form-error submit-error">
                  <AlertCircle size={16} /> {formErrors.submit}
                </div>
              )}

              <footer className="bot-builder-modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  {t('Cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="spin" size={16} />
                      {t('Saving…')}
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {modal.mode === 'create' ? t('Create Bot') : t('Save Changes')}
                    </>
                  )}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── BotCard Sub-component ─────────────────────────────────────────────── */
function BotCard({ bot, expanded, onToggleExpand, onEdit, onDelete, onToggleActive, t }) {
  const isActive = bot.is_active !== false;
  const isCreator = bot.created_by !== 'admin';

  return (
    <article className={`bot-card ${isActive ? '' : 'inactive'}`} role="listitem">
      <header className="bot-card-header">
        <span className="bot-avatar-large" aria-hidden="true">{bot.avatar || '♟️'}</span>
        <div className="bot-info">
          <h3>{bot.display_name || bot.username}</h3>
          <p className="bot-username">@{bot.username}</p>
        </div>
        <div className="bot-badges">
          <span className={`bot-badge ${isActive ? 'active' : 'inactive'}`}>
            {isActive ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
            {isActive ? t('Active') : t('Inactive')}
          </span>
          {isCreator && <span className="bot-badge creator"><Crown size={10} /> {t('Creator')}</span>}
          {bot.is_public !== false && <span className="bot-badge admin"><Users size={10} /> {t('Public')}</span>}
          {bot.is_public === false && <span className="bot-badge inactive"><Shield size={10} /> {t('Private')}</span>}
        </div>
      </header>

      <div className="bot-stats">
        <div className="stat">
          <span className="stat-value">{formatNumber(bot.games_played || 0)}</span>
          <span className="stat-label">{t('Games')}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{bot.win_rate ? `${bot.win_rate}%` : '—'}</span>
          <span className="stat-label">{t('Win %')}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatNumber(bot.messages_sent || 0)}</span>
          <span className="stat-label">{t('Messages')}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{bot.communities_joined || 0}</span>
          <span className="stat-label">{t('Clubs')}</span>
        </div>
      </div>

      {expanded && (
        <>
          <div className="bot-personality-preview">
            <span className="personality-label">{t('Personality:')}</span>
            <span className="personality-text">{bot.personality || '—'}</span>
          </div>
          <div className="bot-personality-preview">
            <span className="personality-label">{t('Model:')}</span>
            <span className="personality-text">{bot.model || '—'}</span>
          </div>
          <div className="bot-personality-preview">
            <span className="personality-label">{t('Style:')}</span>
            <span className="personality-text">
              {t(bot.play_style || 'balanced')} · {t('Chat:')} {t(bot.chat_frequency || 'medium')} {t(bot.chat_style || 'friendly')}
            </span>
          </div>
        </>
      )}

      <footer className="bot-actions">
        <button
          className="action-btn"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-controls={`bot-details-${bot.id}`}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <button className={`action-btn toggle-btn ${isActive ? 'active' : ''}`} onClick={onToggleActive} aria-label={isActive ? t('Deactivate') : t('Activate')}>
          {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        </button>
        <button className="action-btn" onClick={onEdit} aria-label={t('Edit')}>
          <Edit size={18} />
        </button>
        <button className="action-btn danger" onClick={onDelete} aria-label={t('Delete')}>
          <Trash2 size={18} />
        </button>
      </footer>
    </article>
  );
}
