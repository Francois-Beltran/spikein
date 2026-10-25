import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, LoaderCircle, QrCode, RefreshCw, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function SessionQrSharing({ sessionId, sessionClosed }: { sessionId: string; sessionClosed: boolean }) {
  const qc = useQueryClient()
  const [token, setToken] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [error, setError] = useState('')
  const receivedInitialStatus = useRef(false)
  const status = useQuery({
    queryKey: ['session-qr-sharing', sessionId],
    enabled: Boolean(supabase && sessionId),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_session_qr_sharing', { target_session: sessionId })
      if (error) throw error
      return data as { sharing_open: boolean; token_expires_at: string | null }
    },
  })
  const setQr = async (result: { sharing_open: boolean; qr_token?: string | null; token_expires_at?: string | null }) => {
    if (!result.sharing_open || !result.qr_token || !result.token_expires_at) {
      setToken(''); setExpiresAt(''); setQrImage(''); return
    }
    setQrImage('')
    const { default: QRCode } = await import('qrcode')
    const image = await QRCode.toDataURL(result.qr_token, { errorCorrectionLevel: 'M', margin: 2, width: 320 })
    setToken(result.qr_token)
    setExpiresAt(result.token_expires_at)
    setQrImage(image)
    setError('')
  }
  const issue = useMutation({
    mutationFn: async (action: 'open' | 'rotate') => {
      if (!supabase) throw new Error('Supabase is unavailable')
      const { data, error } = await supabase.rpc(action === 'open' ? 'open_session_qr_sharing' : 'rotate_session_qr_token', { target_session: sessionId })
      if (error) throw error
      return data as { sharing_open: boolean; qr_token: string | null; token_expires_at: string | null }
    },
    onSuccess: async result => {
      await setQr(result)
      qc.setQueryData(['session-qr-sharing', sessionId], { sharing_open: result.sharing_open, token_expires_at: result.token_expires_at })
      await qc.invalidateQueries({ queryKey: ['session-qr-sharing', sessionId] })
    },
    onError: e => setError(message(e, 'Could not refresh the QR code.')),
  })
  const close = useMutation({
    mutationFn: async () => { if (!supabase) throw new Error('Supabase is unavailable'); const { error } = await supabase.rpc('close_session_qr_sharing', { target_session: sessionId }); if (error) throw error },
    onSuccess: async () => {
      setToken(''); setQrImage(''); setExpiresAt(''); setError('')
      qc.setQueryData(['session-qr-sharing', sessionId], { sharing_open: false, token_expires_at: null })
      await qc.invalidateQueries({ queryKey: ['session-qr-sharing', sessionId] })
    },
    onError: e => setError(message(e, 'Could not close QR sharing.')),
  })

  useEffect(() => {
    if (!status.data) return
    const initialStatus = !receivedInitialStatus.current
    receivedInitialStatus.current = true
    if (initialStatus && status.data.sharing_open && !sessionClosed) issue.mutate('rotate')
    if (!status.data.sharing_open || sessionClosed) { setToken(''); setQrImage(''); setExpiresAt('') }
  // On mount, status reveals no raw token; replace it with a fresh one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.sharing_open, sessionClosed, sessionId])

  useEffect(() => {
    if (!token || !expiresAt) { setSecondsLeft(0); return }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [token, expiresAt])

  useEffect(() => {
    if (!token || !secondsLeft) return
    const timer = window.setTimeout(() => issue.mutate('rotate'), Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    return () => window.clearTimeout(timer)
  // Token expiry is the rotation schedule.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, expiresAt])

  const sharingOpen = status.data?.sharing_open && !sessionClosed
  const expired = !token || secondsLeft <= 0
  return <section className="max-w-xl rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-green-light text-green"><QrCode size={21}/></span><div><h2 className="font-semibold">QR attendance sharing</h2><p className="mt-1 text-sm text-muted">Players scan this inside Spike In. Check-ins still need your review.</p></div></div>
    {sessionClosed ? <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-muted">Reopen this session before sharing an attendance QR.</p> : sharingOpen ? <>
      <div className="mt-4 rounded-2xl border border-line bg-canvas p-4 text-center">
        {qrImage && !expired ? <img className="mx-auto h-auto w-full max-w-72 rounded-xl bg-white p-2" src={qrImage} alt="Rotating attendance QR code"/> : <div className="mx-auto grid aspect-square w-full max-w-72 place-items-center rounded-xl bg-white text-sm text-muted"><span>{expired ? 'QR needs refreshing' : 'Preparing QR code…'}</span></div>}
        <p role="timer" aria-live="off" className="mt-3 text-sm font-semibold">{expired ? 'QR needs refreshing' : `Refreshes in ${secondsLeft}s`}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="secondary-button min-h-11" disabled={issue.isPending} onClick={() => issue.mutate('rotate')}>{issue.isPending ? <LoaderCircle size={16} className="animate-spin"/> : <RefreshCw size={16}/>}Refresh QR</button><button type="button" className="secondary-button min-h-11 border-red-200 text-red-700 hover:bg-red-50" disabled={close.isPending} onClick={() => close.mutate()}>{close.isPending ? <LoaderCircle size={16} className="animate-spin"/> : <X size={16}/>}Close sharing</button></div>
    </> : <button type="button" className="primary-button mt-4 min-h-11" disabled={issue.isPending || status.isLoading} onClick={() => issue.mutate('open')}>{issue.isPending ? <LoaderCircle size={17} className="animate-spin"/> : <QrCode size={17}/>}Open QR sharing</button>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}{sharingOpen && expired ? ' The displayed QR is no longer valid.' : ''}</p>}
    {status.isError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message(status.error, 'Could not load QR sharing status.')}</p>}
  </section>
}

export function SessionQrScanner({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<import('qr-scanner').default | null>(null)
  const submitted = useRef(false)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState('')
  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let scanner: import('qr-scanner').default | null = null
    void import('qr-scanner').then(({ default: QrScanner }) => {
    if (cancelled) return
    scanner = new QrScanner(video, result => {
      if (submitted.current) return
      const value = result.data.trim()
      if (!/^[a-fA-F0-9]{48}$/.test(value)) { setError('That QR code is not a valid Spike In attendance code. Try again.'); return }
      submitted.current = true
      scanner?.stop()
      onScanRef.current(value.toUpperCase())
    }, {
      preferredCamera: 'environment',
      returnDetailedScanResult: true,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      onDecodeError: () => undefined,
    })
    scannerRef.current = scanner
    return scanner.start()
    }).catch(e => {
      if (cancelled) return
      const err = e as Error
      setError(err.name === 'NotAllowedError' ? 'Camera access was denied. Allow camera access or use the manual check-in code.' : err.name === 'NotFoundError' ? 'No camera is available. Use the manual check-in code instead.' : 'Could not start the camera. Use the manual check-in code instead.')
    })
    return () => { cancelled = true; scanner?.stop(); scanner?.destroy(); scannerRef.current = null }
  }, [])

  return <div role="dialog" aria-modal="true" aria-labelledby="qr-scan-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
    <section className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-6" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3"><div><h2 id="qr-scan-title" className="text-lg font-semibold">Scan attendance QR</h2><p className="mt-1 text-sm text-muted">Point your camera at your coach’s screen.</p></div><button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line" aria-label="Close scanner" onClick={onClose}><X size={18}/></button></div>
      <div className="mt-4 overflow-hidden rounded-xl bg-black"><video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera view for scanning an attendance QR"/></div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Camera size={15}/>Camera turns off when you close the scanner.</p>
    </section>
  </div>
}
