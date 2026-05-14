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
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h3>CloudFlare Protection</h3>
      <p>You're being rate-limited or blocked by CloudFlare.</p>
      <p>Attempt {retryCount + 1}</p>
      <p>This typically resolves on retry.</p>
    </div>
  );
}
