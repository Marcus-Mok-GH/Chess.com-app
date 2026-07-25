import { useEffect, useState } from 'react';
import './CloudFlare.css';

export default function CloudFlare() {
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const delay = setInterval(() => {
      setRetryCount(prev => prev + 1);
    }, 2000);

    return () => clearInterval(delay);
  }, []);

  return (
    <div className="cf-page">
      <div className="cf-card">
        <h3 className="cf-title">CloudFlare Protection</h3>
        <p className="cf-desc">
          You're being rate-limited or blocked by CloudFlare.
        </p>
        <p className="cf-retry">
          Attempt {retryCount + 1}
        </p>
        <p className="cf-note">
          This typically resolves on retry.
        </p>
      </div>
    </div>
  );
}
