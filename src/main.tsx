import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from './app/providers'
import { router } from './app/router'
import './styles/index.css'

function LaunchIntro() {
  const [visible, setVisible] = React.useState(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    return installed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  React.useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), 1450)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!visible) return null
  return <div className="launch-intro" aria-hidden="true">
    <div className="launch-lockup">
      <span className="launch-ball"><img src="/icons/icon-512.png" alt="" /></span>
      <span className="launch-wordmark">SPIKE <strong>IN</strong></span>
      <span className="launch-caption">YOUR TEAM. IN SYNC.</span>
    </div>
  </div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Providers><RouterProvider router={router} /><LaunchIntro /></Providers></React.StrictMode>,
)
