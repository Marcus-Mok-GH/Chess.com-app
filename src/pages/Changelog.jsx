import { useEffect, useState } from 'react';
import './Changelog.css';

const CURRENT_VERSION = '1.1.9';

const CHANGELOG = [
  {
    version: '1.1.9',
    date: '2026-05-04',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Aligned Supabase OTP request payload with documented create_user + metadata fields.',
          'Improved OTP login UX with separate send-code and verify-code loading states.',
          'Added username validation and metadata forwarding during OTP request.',
        ],
      },
    ],
  },
  {
    version: '1.1.8',
    date: '2026-05-04',
    sections: [
      {
        title: 'Features',
        items: [
          'Replaced Supabase email/password auth with email OTP verification.',
          'Removed magic-link flow from login and switched to explicit one-time code entry.',
          'Kept username-based in-app profile creation after OTP verification succeeds.',
        ],
      },
    ],
  },
  {
    version: '1.1.7',
    date: '2026-05-03',
    sections: [
      {
        title: 'Maintenance',
        items: [
          'Unified frontend env support for both VITE_* and NEXT_PUBLIC_* variable names.',
          'Enabled NEXT_PUBLIC_ envPrefix in Vite config for shared variable naming.',
        ],
      },
    ],
  },
  {
    version: '1.1.6',
    date: '2026-05-03',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Updated Fireworks proxy coach endpoint path to /v1/chat/completions for OpenAI compatibility.',
        ],
      },
    ],
  },
  {
    version: '1.1.5',
    date: '2026-05-03',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Updated coach integration to use configured Fireworks proxy endpoint base URL.',
          'Made coach API key optional for proxy deployments that do not require Authorization headers.',
          'Updated coach status and UI guidance for FIREWORKS_BASE_URL configuration.',
        ],
      },
    ],
  },
  {
    version: '1.1.4',
    date: '2026-05-03',
    sections: [
      {
        title: 'Features',
        items: [
          'Switched AI coach provider from Mistral to Fireworks AI.',
          'Updated coach endpoints to use Fireworks chat completions.',
          'Added configurable FIREWORKS_COACH_MODEL for model selection.',
        ],
      },
    ],
  },
  {
    version: '1.1.3',
    date: '2026-05-03',
    sections: [
      {
        title: 'Features',
        items: [
          'Switched authentication flow to Supabase Auth with email/password sign-in.',
          'Added automatic Supabase account creation fallback on first sign-in attempt.',
          'Updated login page and login modal to collect Supabase credentials.',
        ],
      },
    ],
  },
  {
    version: '1.1.2',
    date: '2026-02-10',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Fixed Neon serverless driver pool config for Vercel production.',
          'Separated pg and Neon pool options with safer defaults.',
          'Switched to dynamic WebSocket import and auto-detected Neon hosts.',
          'Enabled secure WebSocket (wss) for Neon connections.',
        ],
      },
    ],
  },
  {
    version: '1.1.1',
    date: '2026-02-10',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Added missing elo_history table creation to database init (fixes 500 errors on ELO updates).',
          'Improved login error logging for easier debugging on Vercel.',
        ],
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-02-10',
    sections: [
      {
        title: 'Features',
        items: [
          'Expanded matchmaking polling improvements for serverless environments.',
          'Added ELO progress and win rate charts to game history and profile views.',
          'Added Playwright E2E coverage for matchmaking polling fallback and cancel flow.',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'Improved matchmaking connection handling, logging, and guardrails.',
          'Fixed online bot play to apply UCI moves reliably with Stockfish timeout fallback.',
          'Ensured Vitest ignores Playwright specs during unit test runs.',
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-02-09',
    sections: [
      {
        title: 'Features',
        items: [
          'Introduced HTTP polling matchmaking endpoints for Vercel-style serverless hosting.',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'Improved Socket.IO compatibility for external server configurations.',
          'Deployment configuration updates for Vercel and hosting environments.',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-02-04',
    sections: [
      {
        title: 'Maintenance',
        items: ['Added database readiness logging for troubleshooting.'],
      },
    ],
  },
];

export default function Changelog() {
  const [activeVersion, setActiveVersion] = useState(CURRENT_VERSION);

  useEffect(() => {
    document.title = `Changelog · ${CURRENT_VERSION}`;
  }, []);

  return (
    <div className="changelog-page">
      <div className="changelog-container">
        <div className="changelog-header">
          <h1>Changelog</h1>
          <p>Latest version: {CURRENT_VERSION}</p>
        </div>

        <div className="changelog-layout">
          <aside className="changelog-sidebar">
            {CHANGELOG.map((entry) => (
              <button
                key={entry.version}
                className={`changelog-version ${activeVersion === entry.version ? 'active' : ''}`}
                onClick={() => setActiveVersion(entry.version)}
                type="button"
              >
                <span className="version-label">v{entry.version}</span>
                <span className="version-date">{entry.date}</span>
              </button>
            ))}
          </aside>

          <section className="changelog-entries">
            {CHANGELOG.filter((entry) => entry.version === activeVersion).map((entry) => (
              <article key={entry.version} className="changelog-entry">
                <header>
                  <h2>Version {entry.version}</h2>
                  <span>{entry.date}</span>
                </header>

                {entry.sections.map((section) => (
                  <div key={section.title} className="changelog-section">
                    <h3>{section.title}</h3>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
