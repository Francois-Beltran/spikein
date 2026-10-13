import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './providers'
import { AppShell } from '../components/AppShell'
import { SignInPage, SetupPage, GoogleCallbackPage, CompleteProfilePage } from '../features/auth/AuthPages'
import { DashboardPage } from '../features/dashboard/DashboardPage'

function RootGate() {
  const { user, profile, profileError, isGoogleUser, loading, configured, refreshProfile } = useAuth()
  if (!configured) return <SetupPage />
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Getting your team ready…</div>
  if (!user) return <Navigate to="/sign-in" replace />
  if (!isGoogleUser) return <Navigate to="/sign-in" replace />
  if (profileError) return <div className="grid min-h-screen place-items-center px-6"><div className="max-w-md rounded-2xl border border-line bg-white p-6 text-center shadow-card"><h1 className="text-xl font-semibold">We couldn’t check your team profile</h1><p className="mt-2 text-sm leading-6 text-muted">{profileError}</p><button onClick={()=>void refreshProfile().catch(()=>undefined)} className="primary-button mt-5">Try again</button></div></div>
  if (!profile) return <CompleteProfilePage />
  return <AppShell><Outlet /></AppShell>
}

function SignInGate() {
  const { user, isGoogleUser, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Getting your team ready…</div>
  return user && isGoogleUser ? <Navigate to="/" replace /> : <SignInPage />
}

function AdminGate() {
  const { profile } = useAuth()
  return profile?.role === 'coach' ? <DashboardPage /> : <Navigate to="/" replace />
}

export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInGate /> },
  { path: '/auth/callback', element: <GoogleCallbackPage /> },
  { path: '/', element: <RootGate />, children: [{ index: true, element: <DashboardPage /> }, { path: 'admin', element: <AdminGate /> }] },
  { path: '*', element: <Navigate to="/" replace /> },
])
