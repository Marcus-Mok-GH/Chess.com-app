import { Link } from 'react-router-dom'
import { BookOpen, Library, Puzzle, Settings2, ShieldCheck, UsersRound, UserRound } from 'lucide-react'
import { useUser } from '../contexts/UserContext';
import './More.css'

// Mobile users never see the desktop sidebar, so the admin-only /admin route
// is surfaced here for admins (mirrors the sidebar link on desktop).
const adminOption = {
  to: '/admin',
  icon: ShieldCheck,
  title: 'Admin',
  description: 'Manage accounts and fair-play reviews',
};

const staticOptionGroups = [
  {
    title: 'Learn & improve',
    options: [
      { to: '/puzzles', icon: Puzzle, title: 'Puzzles', description: 'Train with the structured lesson scheme' },
      { to: '/openings', icon: BookOpen, title: 'Openings', description: 'Explore opening ideas' },
    ],
  },
  {
    title: 'Community',
    options: [
      { to: '/friends', icon: UsersRound, title: 'Friends', description: 'Connect with other players' },
      { to: '/clubs', icon: Library, title: 'Clubs', description: 'Find a community to join' },
    ],
  },
  {
    title: 'Your account',
    options: [
      { to: '/history', icon: BookOpen, title: 'Game History', description: 'Review your past games' },
      { to: '/settings', icon: Settings2, title: 'Settings', description: 'Manage your preferences' },
    ],
  },
]

export default function More() {
  const { user } = useUser();
  const optionGroups = user?.isAdmin
    ? [...staticOptionGroups, { title: 'Admin', options: [adminOption] }]
    : staticOptionGroups;

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
                {group.options.map((option) => {
                  const Icon = option.icon
                  return (
                    <Link key={option.to} to={option.to} className="more-option">
                      <span className="more-option-icon" aria-hidden="true"><Icon size={18} /></span>
                      <span className="more-option-copy">
                        <span className="more-option-title">{option.title}</span>
                        <span className="more-option-description">{option.description}</span>
                      </span>
                      <span className="more-option-arrow" aria-hidden="true">›</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
