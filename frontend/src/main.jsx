import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './design.css'
import './light-theme.css'
import App from './App.jsx'
import { startPerformanceMonitoring } from './lib/performance'

// Install small performance observers early enough to capture the first input.
startPerformanceMonitoring()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
