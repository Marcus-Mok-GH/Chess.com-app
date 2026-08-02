// @ts-nocheck
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './App.css'

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.ready.then(registration => {
      registration.unregister();
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
