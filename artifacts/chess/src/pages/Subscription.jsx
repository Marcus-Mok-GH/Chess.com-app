import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import AccountRequired from '../components/AccountRequired';
import { useUser } from '../contexts/UserContext';
import { getReviewUsage, getSubscription } from '../engine/coach/coachAI';
import { useT } from '../i18n/I18nContext';
import { getActiveLocale } from '../i18n/translate';
import './Subscription.css';

/**
 * The one page where purchases and subscriptions live: current plan, today's
 * review quota and the checkout link for the paid plan. Other screens only
 * link here instead of carrying their own buy buttons.
 */
export default function Subscription() {
  const t = useT();
  const { user, isLoading } = useUser();

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState('loading'); // loading | ready | error | signed-out
  const [usage, setUsage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    if (isLoading) return undefined;
    if (!user) {
      setState('signed-out');
      return undefined;
    }

    let cancelled = false;
    setState('loading');
    setUsage(null);
    setSubscription(null);
    setOffer(null);

    Promise.all([
      getReviewUsage().catch(() => null),
      getSubscription().catch(() => null),
    ]).then(([usageData, subscriptionData]) => {
      if (cancelled) return;
      if (!usageData && !subscriptionData) {
        setState('error');
        return;
      }
      setUsage(usageData);
      setSubscription(subscriptionData?.subscription || null);
      setOffer(subscriptionData?.offer || null);
      setState('ready');
    });

    return () => { cancelled = true; };
  }, [user, isLoading, attempt]);

  const locale = getActiveLocale();
  const active = Boolean(subscription?.active);
  const renewsAt = active && subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;
  const validRenewDate = renewsAt && !Number.isNaN(renewsAt.getTime()) ? renewsAt : null;

  return (
    <div className="subscription-page">
      <div className="subscription-container">
        <header className="subscription-header">
          <span className="subscription-header-icon" aria-hidden="true">
            <CreditCard size={22} />
          </span>
          <div>
            <h1>{t('Subscription')}</h1>
            <p className="subscription-subtitle">{t('View your plan, review usage, and upgrade options.')}</p>
          </div>
        </header>

        {state === 'loading' && (
          <p className="subscription-state" role="status">{t('Loading...')}</p>
        )}

        {state === 'signed-out' && (
          <AccountRequired
            title={t('Subscription')}
            message={t('Sign in to see your plan and upgrade options.')}
          />
        )}

        {state === 'error' && (
          <div className="subscription-state" role="alert">
            <p>{t('Something went wrong. Please try again.')}</p>
            <button
              type="button"
              className="subscription-retry"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t('Retry')}
            </button>
          </div>
        )}

        {state === 'ready' && (
          <div className="subscription-cards">
            <section className="subscription-card" aria-labelledby="subscription-plan-title">
              <div className="subscription-card-head">
                <h2 id="subscription-plan-title">{t('Your plan')}</h2>
                <span className={`subscription-badge ${active ? 'subscription-badge-active' : ''}`}>
                  {active ? t('Active') : t('Free plan')}
                </span>
              </div>
              {active ? (
                validRenewDate && (
                  <p className="subscription-card-copy">
                    {t('Renews {date}', {
                      date: validRenewDate.toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }),
                    })}
                  </p>
                )
              ) : (
                <>
                  <p className="subscription-card-copy">
                    {t('Free accounts get 1 game review per day. Upgrade for unlimited reviews — {price} {currency}/month.', {
                      price: offer?.price ?? 7.99,
                      currency: offer?.currency ?? 'SGD',
                    })}
                  </p>
                  {offer?.checkoutUrl ? (
                    <a
                      className="subscription-cta"
                      href={offer.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('Upgrade — unlimited reviews')}
                    </a>
                  ) : (
                    <p className="subscription-card-copy">{t('Upgrades are not available right now.')}</p>
                  )}
                </>
              )}
            </section>

            <section className="subscription-card" aria-labelledby="subscription-usage-title">
              <div className="subscription-card-head">
                <h2 id="subscription-usage-title">{t('Reviews today')}</h2>
              </div>
              {!usage ? (
                <p className="subscription-card-copy">{t('Something went wrong')}</p>
              ) : usage.unlimited ? (
                <p className="subscription-card-copy subscription-card-copy-pro">
                  {t('Unlimited reviews — subscribed')}
                </p>
              ) : (
                <p className="subscription-card-copy">
                  {t('Free review {used} of {limit} used today', {
                    used: usage.used ?? 0,
                    limit: usage.limit ?? 1,
                  })}
                </p>
              )}
              {usage?.resetsAt && (
                <p className="subscription-card-note">
                  {t('Free reviews reset at {time}.', {
                    time: new Date(usage.resetsAt).toLocaleString(locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}