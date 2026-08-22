import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx'; // ✨ Imported ErrorBoundary
import { LanguageProvider } from './context/LanguageContext.jsx'; // ✨ Imported God-Mode Translation Engine
import './index.css';
import { registerSW } from 'virtual:pwa-register'; // ✨ Vite PWA Engine Injection

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary> {/* ✨ Wrapping the app to prevent white screens */}
      <LanguageProvider> {/* ✨ Injecting the global dictionary & terminology */}
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// ✨ ENTERPRISE OFFLINE ENGINE: Auto-Generated Service Worker Registration
if ('serviceWorker' in navigator) {
  registerSW({ 
    immediate: true,
    onNeedRefresh() {
      // Automatically triggers when you deploy an update to GitHub
      console.log('🔄 New content available, refreshing...');
    },
    onOfflineReady() {
      // Triggers when the app successfully caches everything
      console.log('✅ Sanatani Bandhan is now ready to work 100% offline.');
    }
  });
}
