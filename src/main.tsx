import 'leaflet/dist/leaflet.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/ui/ToastProvider'
import './index.css'
import { SimulationProvider } from './sim/SimulationProvider'
import { StoreProvider } from './store/StoreProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <StoreProvider>
        <SimulationProvider>
          <App />
        </SimulationProvider>
      </StoreProvider>
    </ToastProvider>
  </StrictMode>,
)
