import React from 'react';

export default function GameStatus({ engineError }) {
  if (!engineError) return null;

  return (
    <div
      role="alert"
      style={{
        margin: '8px 0',
        padding: '10px 14px',
        background: '#3a0000',
        border: '1px solid #ff4444',
        borderRadius: '6px',
        color: '#ff8080',
        fontSize: '13px',
        lineHeight: '1.4',
      }}
    >
      <strong>⚠️ Engine error:</strong> {engineError}
    </div>
  );
}
