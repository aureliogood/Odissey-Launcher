import '@fontsource-variable/manrope'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NavBar } from './components/NavBar'
import './styles.css'

// Development stub for window.launcher when running via Vite (no Electron preload)
if (import.meta.env.DEV && !(window as any).launcher) {
  (window as any).launcher = {
    getSettings: () => Promise.resolve(null),
    getSystemInfo: () => Promise.resolve(null),
    getAccounts: () => Promise.resolve([]),
    getOAuthConfig: () => Promise.resolve(null),
    getLogPath: () => Promise.resolve(''),
    saveSettings: (patch:any) => Promise.resolve(patch),
    // Add any other methods used in the app as no‑ops
  }
}

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
