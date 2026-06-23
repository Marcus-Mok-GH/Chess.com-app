import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // Production: unregister old service workers
    navigator.serviceWorker.ready.then(registration => {
      registration.unregister();
      console.log('Service worker unregistered for production');
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
