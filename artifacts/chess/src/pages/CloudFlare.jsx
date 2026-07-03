import { useEffect, useState } from 'react';

export default function CloudFlare() {
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const delay = setInterval(() => {
      setRetryCount(prev => prev + 1);
    }, 2000);

    return () => clearInterval(delay);
  }, []);

  return (
    <div style={{ 
      padding: '40px 20px', 
      textAlign: 'center', 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)'
    }}>
      <h3 style={{ fontSize: '2rem', marginBottom: '16px' }}>CloudFlare Protection</h3>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
        You're being rate-limited or blocked by CloudFlare.
      </p>
      <p style={{ color: 'var(--color-accent-primary)', fontWeight: 'bold' }}>
        Attempt {retryCount + 1}
      </p>
      <p style={{ color: 'var(--color-text-muted)', marginTop: '16px' }}>
        This typically resolves on retry.
      </p>
    </div>
  );
}
