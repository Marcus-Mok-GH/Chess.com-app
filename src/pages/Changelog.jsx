import { useEffect, useState } from 'react';
import './Changelog.css';

const CURRENT_VERSION = '1.1.0';

const CHANGELOG = [
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
