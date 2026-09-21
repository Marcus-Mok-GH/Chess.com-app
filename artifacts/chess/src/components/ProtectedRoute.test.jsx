import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'

const mockUseUser = vi.fn()

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUseUser(),
}))

function CurrentPath() {
  return <output aria-label="current path">{useLocation().pathname}</output>
}

function renderRoute({ path = '/puzzles', loginRequiredFor }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CurrentPath />
      <Routes>
        <Route
          path={path}
          element={
            <ProtectedRoute loginRequiredFor={loginRequiredFor}>
              <div>Private content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseUser.mockReturnValue({ isLoggedIn: false, isLoading: false })
  })

  it.each([
    ['/puzzles', 'Puzzles'],
    ['/clubs', 'Clubs'],
    ['/history', 'Game Archive'],
  ])('keeps guests on %s and explains that login is required', (path, pageName) => {
    renderRoute({ path, loginRequiredFor: pageName })

    expect(screen.getByRole('heading', { name: /log in required/i })).toBeTruthy()
    expect(screen.getByText(`You need to log in to access ${pageName}.`)).toBeTruthy()
    expect(screen.getByLabelText('current path').textContent).toBe(path)
    expect(screen.queryByText('Login page')).toBeNull()
  })

  it('still redirects other protected guest routes to login', async () => {
    renderRoute({ path: '/home' })

    expect(await screen.findByText('Login page')).toBeTruthy()
    expect(screen.getByLabelText('current path').textContent).toBe('/login')
  })

  it('renders private content for logged-in users', () => {
    mockUseUser.mockReturnValue({ isLoggedIn: true, isLoading: false })
    renderRoute({ loginRequiredFor: 'Puzzles' })

    expect(screen.getByText('Private content')).toBeTruthy()
  })
})
