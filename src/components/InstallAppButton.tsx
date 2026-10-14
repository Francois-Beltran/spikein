import { Download, MoreVertical, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installHelp, setInstallHelp] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) { setInstalled(true); return }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      setShowInvite(true)
    }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isAndroid = /android/i.test(navigator.userAgent)
  async function install() {
    if (!installPrompt) { setInstallHelp(true); return }
    setShowInvite(false)
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

  return <>
    <button type="button" onClick={() => void install()} className="absolute right-5 top-[max(1.5rem,env(safe-area-inset-top))] inline-flex min-h-10 items-center gap-1.5 rounded-full border border-green/15 bg-white px-3 text-xs font-semibold text-green shadow-sm transition-colors hover:bg-green-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green sm:right-12 lg:right-16" aria-label="Install Spike In app">
      {installPrompt && !isIos ? <Download size={15} aria-hidden="true" /> : <Share size={15} aria-hidden="true" />}
      <span>Install app</span>
    </button>
    {showInvite && installPrompt && <div className="fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-green/15 bg-white p-3 shadow-xl sm:inset-x-auto sm:right-5 sm:top-5">
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">Install Spike In</p><p className="text-xs text-muted">Add your team app to your home screen.</p></div>
      <button type="button" onClick={() => void install()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-green px-3 text-xs font-semibold text-white hover:bg-green-dark"><Download size={15} aria-hidden="true" />Install</button>
      <button type="button" onClick={() => setShowInvite(false)} aria-label="Dismiss install invitation" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas"><X size={17} /></button>
    </div>}
    {installHelp && <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 sm:place-items-center" role="presentation" onClick={() => setInstallHelp(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-help-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><h2 id="install-help-title" className="text-base font-bold">Add Spike In to your home screen</h2><p className="mt-2 text-sm leading-6 text-muted">{isAndroid ? <>In Chrome, tap <MoreVertical className="mx-1 inline-block align-[-3px]" size={17} aria-label="More options" /> in the top-right menu, then choose <strong className="text-ink">Install app</strong> or <strong className="text-ink">Add to Home screen</strong>. If you don’t see either option, open this page in Chrome over HTTPS and try again.</> : isIos ? <>In Safari, tap <Share className="mx-1 inline-block align-[-3px]" size={15} aria-label="Share" /> Share, then choose <strong className="text-ink">Add to Home Screen</strong>.</> : <>Open this page in your browser’s menu and choose <strong className="text-ink">Install app</strong> or <strong className="text-ink">Add to Home screen</strong>. If the option is missing, use a supported browser over HTTPS.</>}</p></div><button type="button" autoFocus onClick={() => setInstallHelp(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas" aria-label="Close install instructions">×</button></div>
      </section>
    </div>}
  </>
}
