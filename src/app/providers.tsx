import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type Profile = { id: string; full_name: string; role: 'coach' | 'student' }
type AuthValue = { user: User | null; session: Session | null; profile: Profile | null; profileError: string | null; isGoogleUser: boolean; loading: boolean; configured: boolean; signOut: () => Promise<void>; refreshProfile: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } })

export function Providers({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const isGoogleUser = session?.user ? hasGoogleIdentity(session.user) : false
  const refreshProfile = async () => {
    if (!supabase || !session?.user) { setProfile(null); setProfileError(null); return }
    const { data, error } = await supabase.from('profiles').select('id,full_name,role').eq('id', session.user.id).maybeSingle()
    if (error) { setProfileError(error.message); throw error }
    setProfile(data as Profile | null)
    setProfileError(null)
  }
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => { if (alive) { setSession(data.session); setAuthReady(true); if (error) setProfileError(error.message) } })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    let alive = true
    if (!authReady) return
    if (!supabase || !session?.user || !isGoogleUser) { setProfile(null); setProfileError(null); setProfileLoading(false); return }
    setProfile(null)
    setProfileError(null)
    setProfileLoading(true)
    supabase.from('profiles').select('id,full_name,role').eq('id', session.user.id).maybeSingle()
      .then(({ data, error }) => { if (alive) { setProfile(data as Profile | null); setProfileError(error?.message ?? null); setProfileLoading(false) } })
    return () => { alive = false }
  }, [authReady, session?.user.id, isGoogleUser])
  const value: AuthValue = { session, user: session?.user ?? null, profile, profileError, isGoogleUser, loading: !authReady || profileLoading, configured: isSupabaseConfigured, signOut: async () => { if (supabase) await supabase.auth.signOut() }, refreshProfile }
  return <QueryClientProvider client={queryClient}><AuthContext.Provider value={value}>{children}</AuthContext.Provider></QueryClientProvider>
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside Providers'); return value }

function hasGoogleIdentity(user: User) {
  const metadata = user.app_metadata as { provider?: unknown; providers?: unknown }
  return metadata.provider === 'google' || (Array.isArray(metadata.providers) && metadata.providers.includes('google'))
}
