import React from 'react';
import { useT } from '../../../i18n/I18nContext';

export default function GameStatus({ engineError }) {
  const t = useT();
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
      <strong>{t("⚠️ Engine error:")}</strong> {engineError}
    </div>
  );
}
