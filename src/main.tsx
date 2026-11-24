import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import './app/app.css'
import { startSaveOnPageHide } from './app/saveOnPageHide.ts'
import { startAutosave } from './store/autosave.ts'

const root = document.getElementById('root')
if (!root) {
  throw new Error('index.html has no element with the id "root".')
}

startAutosave()
startSaveOnPageHide()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
