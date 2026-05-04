import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import changelogRaw from '../../CHANGELOG.md?raw';
import './Changelog.css';

function parseChangelog(markdown) {
  const lines = markdown.split('\n');
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) entries.push(current);
      const heading = line.replace('## ', '').trim();
      const [version, ...dateParts] = heading.split(' - ');
      current = { version, date: dateParts.join(' - ') || '', items: [] };
      continue;
    }

    if (current && line.startsWith('- ')) {
      current.items.push(line.replace('- ', '').trim());
    }
  }

  if (current) entries.push(current);
  return entries;
}

export default function Changelog() {
  const navigate = useNavigate();
  const entries = useMemo(() => parseChangelog(changelogRaw), []);

  return (
    <div className="changelog-page">
      <div className="changelog-container">
        <div className="changelog-nav-row">
          <button className="changelog-home-btn" onClick={() => navigate('/home')}>
            ← Back to Home
          </button>
        </div>

        <header className="changelog-header">
          <h1>Changelog</h1>
          <p>Release history from CHANGELOG.md</p>
        </header>

        <div className="changelog-entries">
          {entries.map((entry) => (
            <article key={entry.version} className="changelog-entry">
              <header>
                <h2>{entry.version}</h2>
                <span>{entry.date}</span>
              </header>
              <ul>
                {entry.items.map((item, index) => (
                  <li key={`${entry.version}-${index}`}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
