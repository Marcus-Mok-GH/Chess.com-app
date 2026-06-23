import { useState } from 'react'
import './EloSlider.css'

export default function EloSlider({ value, onChange, disabled }) {
  const [displayValue, setDisplayValue] = useState(value)

  const handleChange = (e) => {
    const newValue = parseInt(e.target.value)
    setDisplayValue(newValue)
    onChange(newValue)
  }

  const getSkillLevel = (elo) => {
    if (elo < 800) return 'Beginner'
    if (elo < 1200) return 'Intermediate'
    if (elo < 1600) return 'Advanced'
    if (elo < 2000) return 'Expert'
    if (elo < 2400) return 'Master'
    return 'Grandmaster'
  }

  return (
    <div className="elo-slider">
      <div className="elo-slider-header">
        <label className="elo-slider-label">Custom ELO Rating</label>
        <div className="elo-value">
          <span className="elo-number">{displayValue}</span>
          <span className="elo-skill">{getSkillLevel(displayValue)}</span>
        </div>
      </div>
      <input
        type="range"
        min="400"
        max="2500"
        step="50"
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        className="elo-slider-input"
      />
      <div className="elo-slider-marks">
        <span>400</span>
        <span>1000</span>
        <span>1500</span>
        <span>2000</span>
        <span>2500</span>
      </div>
    </div>
  )
}
