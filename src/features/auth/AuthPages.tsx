import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, CircleAlert, LoaderCircle, ShieldCheck, Volleyball } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../app/providers'
import { supabase } from '../../lib/supabase'
import { Brand } from '../../components/AppShell'

function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.08fr_.92fr]">
    <section className="relative hidden overflow-hidden bg-green p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16"><Brand /><div className="relative z-10 max-w-lg pb-10"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold tracking-wide"><span className="h-1.5 w-1.5 rounded-full bg-lime" />THE TEAM, IN SYNC</div><h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.045em] xl:text-6xl">Every session.<br /><span className="text-lime">Every teammate.</span><br />All in.</h1><p className="mt-6 max-w-md text-[15px] leading-7 text-white/70">A simpler way to keep your volleyball team together, on the court and on the record.</p></div><div className="flex items-center gap-5 text-[11px] text-white/55"><span>Built for the whole team</span><span>·</span><span>Made for the court</span></div><div className="pointer-events-none absolute -bottom-28 -right-24 h-[420px] w-[420px] rounded-full border border-white/10" /><div className="pointer-events-none absolute -bottom-14 -right-10 h-[280px] w-[280px] rounded-full border border-white/10" /><div className="pointer-events-none absolute bottom-12 right-14 grid h-16 w-16 place-items-center rounded-full bg-lime text-green"><Volleyball size={32} /></div></section>
    <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16"><div className="lg:hidden"><Brand /></div><div className="mx-auto my-auto w-full max-w-[390px] py-12">{children}</div><p className="text-center text-[11px] text-[#9aa39c]">Made for the people who show up.</p></section>
  </div>
}

export function SetupPage() { return <AuthLayout><div className="mb-7 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff4e8] text-[#bd691b]"><CircleAlert size={22} /></div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-green">One quick setup step</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Connect your team space</h2><p className="mt-3 text-sm leading-6 text-muted">Add your Supabase project URL and public anon key to the app environment. Then restart the app to enable Google sign in.</p><div className="mt-7 rounded-2xl border border-line bg-canvas p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-green" />Your keys stay private</div><p className="mt-2 text-xs leading-5 text-muted">Use the project’s anon key only. Never add a service role key to the app.</p></div></AuthLayout> }

export function SignInPage() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signInWithGoogle() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (session) await supabase.auth.signOut({ scope: 'local' })
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (authError) { setError(authError.message); setBusy(false) }
  }
  return <AuthLayout><div className="mb-8"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-green">Welcome to Spike In</p><h2 className="mt-3 text-[32px] font-semibold tracking-[-.045em]">Good to have you.</h2><p className="mt-2 text-sm text-muted">Choose a Google account to sign in or create your account.</p></div><button type="button" disabled={busy} onClick={() => void signInWithGoogle()} className="google-button w-full">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <GoogleMark />}<span>{busy ? 'Opening Google…' : 'Continue with Google'}</span></button>{error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ef] px-3 py-2.5 text-xs text-[#b73d36]">{error}</p>}<p className="mt-7 text-center text-xs leading-5 text-muted">Spike In only accepts Google accounts.<br />Coaches must be added by a team administrator.</p></AuthLayout>
}

export function CompleteProfilePage() {
  const { user, refreshProfile } = useAuth()
  const initialName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !user) return
    setBusy(true); setError('')
    const { error: createError } = await supabase.rpc('create_student_profile', { profile_name: name.trim() })
    if (createError) { setError(createError.message); setBusy(false); return }
    try { await refreshProfile() } catch { setError('Your profile was created, but we could not load it yet. Refresh this page to continue.') }
    setBusy(false)
  }
  return <AuthLayout><div className="mb-8"><div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-green-light text-green"><Check size={22}/></div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-green">Google sign-in complete</p><h2 className="mt-3 text-[32px] font-semibold tracking-[-.045em]">Set up your player profile.</h2><p className="mt-2 text-sm leading-6 text-muted">Add your name to finish joining Spike In. Your profile starts as a player; a team coach can add you to a roster.</p></div><form onSubmit={submit} className="space-y-5"><label className="block"><span className="mb-2 block text-xs font-semibold">Your name</span><input autoComplete="name" required maxLength={120} value={name} onChange={event=>setName(event.target.value)} placeholder="Full name" className="field"/></label>{error&&<p role="alert" className="rounded-xl bg-[#fff0ef] px-3 py-2.5 text-xs text-[#b73d36]">{error}</p>}<button disabled={busy} className="primary-button w-full">{busy?<LoaderCircle size={17} className="animate-spin"/>:<>Create player profile <ArrowRight size={17}/></>}</button></form><p className="mt-6 text-center text-xs leading-5 text-muted">Are you a coach? Ask the project administrator to grant coach access. Coach status can’t be selected here.</p></AuthLayout>
}

export function GoogleCallbackPage() {
  const [timedOut, setTimedOut] = useState(false)
  const { user, loading } = useAuth()
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 10_000)
    return () => window.clearTimeout(timer)
  }, [])
  if (user) return <Navigate to="/" replace />
  if (timedOut && !loading) return <Navigate to="/sign-in?error=google_callback" replace />
  return <div role="status" className="grid min-h-screen place-items-center bg-canvas px-6"><div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-5 py-4 text-sm font-medium text-ink shadow-card"><LoaderCircle size={19} className="animate-spin text-green" />Finishing Google sign in…</div></div>
}

function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px]"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.93c-.58 2.96-2.26 5.48-4.73 7.18l7.28 5.65c4.25-3.92 6.7-9.7 6.7-17.3Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.28-5.65c-2.02 1.35-4.62 2.15-8.62 2.15-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg> }
