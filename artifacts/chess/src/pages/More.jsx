import { Link } from 'react-router-dom'
import './More.css'

const optionGroups = [
  {
    title: 'Learn & improve',
    options: [
      { to: '/puzzles', icon: '🧩', title: 'Puzzles', description: 'Train your tactical vision' },
      { to: '/openings', icon: '📖', title: 'Openings', description: 'Explore opening ideas' },
      { to: '/lessons', icon: '🎓', title: 'Lessons', description: 'Build your chess skills' },
    ],
  },
  {
    title: 'Community',
    options: [
      { to: '/friends', icon: '👥', title: 'Friends', description: 'Connect with other players' },
      { to: '/chat', icon: '💬', title: 'Chat', description: 'Keep the conversation going' },
      { to: '/clubs', icon: '🏛️', title: 'Clubs', description: 'Find a community to join' },
    ],
  },
  {
    title: 'Your account',
    options: [
      { to: '/history', icon: '📚', title: 'Game History', description: 'Review your past games' },
      { to: '/settings', icon: '⚙️', title: 'Settings', description: 'Manage your preferences' },
    ],
  },
]

export default function More() {
  return (
    <section className="more-page" aria-labelledby="more-page-title">
      <div className="more-container">
        <header className="more-page-header">
          <span className="more-page-icon" aria-hidden="true">•••</span>
          <div>
            <h1 id="more-page-title">More</h1>
            <p>Discover more ways to play, learn, and connect.</p>
          </div>
        </header>

        <div className="more-groups">
          {optionGroups.map((group) => (
            <section className="more-group" key={group.title} aria-labelledby={`more-${group.title.replaceAll(' ', '-').toLowerCase()}`}>
              <h2 id={`more-${group.title.replaceAll(' ', '-').toLowerCase()}`}>{group.title}</h2>
              <div className="more-options">
                {group.options.map((option) => (
                  <Link key={option.to} to={option.to} className="more-option">
                    <span className="more-option-icon" aria-hidden="true">{option.icon}</span>
                    <span className="more-option-copy">
                      <span className="more-option-title">{option.title}</span>
                      <span className="more-option-description">{option.description}</span>
                    </span>
                    <span className="more-option-arrow" aria-hidden="true">›</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
