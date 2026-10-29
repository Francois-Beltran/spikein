import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './providers'
import { AppShell } from '../components/AppShell'
import { SignInPage, SetupPage, GoogleCallbackPage, CompleteProfilePage } from '../features/auth/AuthPages'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ContributionsPage } from '../features/contributions/ContributionsPage'
import { AdminAttendancePage, NewSessionPage, NewTeamPage, SessionDetailPage, SessionsPage, StudentAttendancePage, StudentSessionsPage, StudentTeamsPage, StudentTeamDetailPage, TeamDetailPage, TeamsPage } from '../features/dashboard/ManagementPages'

function RootGate() {
  const { user, profile, profileError, isGoogleUser, loading, configured } = useAuth()
  if (!configured) return <SetupPage />
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Getting your team ready…</div>
  if (!user) return <Navigate to="/sign-in" replace />
  if (!isGoogleUser) return <Navigate to="/sign-in" replace />
  if (profileError) return <Navigate to="/sign-in" replace />
  if (!profile) return <Navigate to="/sign-in" replace />
  return <AppShell><Outlet /></AppShell>
}

function SignInGate() {
  const { user, profile, isGoogleUser, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Getting your team ready…</div>
  return user && isGoogleUser && profile ? <Navigate to="/" replace /> : <SignInPage />
}

function ProfileSetupGate() {
  const { user, profile, isGoogleUser, loading, configured } = useAuth()
  if (!configured) return <SetupPage />
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Checking your Google account…</div>
  if (!user || !isGoogleUser) return <Navigate to="/sign-in" replace />
  return profile ? <Navigate to="/" replace /> : <CompleteProfilePage />
}

function RoleGate({ role, children }: { role: 'coach'|'student'; children: React.ReactNode }) { const {profile}=useAuth(); return profile?.role===role?children:<Navigate to={role==='coach'?'/':'/admin'} replace /> }

export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInGate /> },
  { path: '/auth/callback', element: <GoogleCallbackPage /> },
  { path: '/complete-profile', element: <ProfileSetupGate /> },
  { path: '/', element: <RootGate />, children: [
    { index: true, element: <DashboardPage /> },
    { path: 'admin', element: <RoleGate role="coach"><DashboardPage /></RoleGate> },
    { path: 'admin/teams', element: <RoleGate role="coach"><TeamsPage /></RoleGate> },
    { path: 'admin/teams/new', element: <RoleGate role="coach"><NewTeamPage /></RoleGate> },
    { path: 'admin/teams/:teamId', element: <RoleGate role="coach"><TeamDetailPage /></RoleGate> },
    { path: 'admin/sessions', element: <RoleGate role="coach"><SessionsPage /></RoleGate> },
    { path: 'admin/sessions/new', element: <RoleGate role="coach"><NewSessionPage /></RoleGate> },
    { path: 'admin/sessions/:sessionId', element: <RoleGate role="coach"><SessionDetailPage /></RoleGate> },
    { path: 'admin/attendance', element: <RoleGate role="coach"><AdminAttendancePage /></RoleGate> },
    { path: 'contributions', element: <ContributionsPage /> },
    { path: 'sessions', element: <RoleGate role="student"><StudentSessionsPage /></RoleGate> },
    { path: 'teams', element: <RoleGate role="student"><StudentTeamsPage /></RoleGate> },
    { path: 'teams/:teamId', element: <RoleGate role="student"><StudentTeamDetailPage /></RoleGate> },
    { path: 'attendance', element: <RoleGate role="student"><StudentAttendancePage /></RoleGate> },
  ] },
  { path: '*', element: <Navigate to="/" replace /> },
])
