import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import Navigation from './Navigation'

describe('Navigation component', () => {
  it('renders brand logo as a focusable button with aria-label', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Navigation />
      </MemoryRouter>
    )

    const logoBtn = screen.getByRole('button', { name: /chess homepage/i })
    expect(logoBtn).toBeTruthy()
  })

  it('sets aria-current="page" on the active route link', () => {
    render(
      <MemoryRouter initialEntries={['/play']}>
        <Navigation />
      </MemoryRouter>
    )

    const computerBtn = screen.getByRole('button', { name: /vs computer/i })
    const onlineBtn = screen.getByRole('button', { name: /online/i })

    expect(computerBtn.getAttribute('aria-current')).toBe('page')
    expect(onlineBtn.getAttribute('aria-current')).toBeNull()
  })
})
