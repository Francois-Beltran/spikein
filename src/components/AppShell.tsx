import { CalendarDays, CheckCheck, CircleHelp, LayoutDashboard, LogOut, Users, Volleyball } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../app/providers'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const coach = profile?.role === 'coach'
  const nav = coach
    ? [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard },
      { to: '/admin/teams', label: 'Teams', icon: Users },
      { to: '/admin/sessions', label: 'Sessions', icon: CalendarDays },
      { to: '/admin/attendance', label: 'Attendance', icon: CheckCheck },
    ]
    : [
      { to: '/', label: 'Home', icon: LayoutDashboard },
      { to: '/sessions', label: 'Sessions', icon: CalendarDays },
      { to: '/teams', label: 'My teams', icon: Users },
      { to: '/attendance', label: 'Attendance', icon: CheckCheck },
    ]
  const active = (to: string) => to === '/admin' ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`)

  return <div className="min-h-screen bg-canvas text-ink lg:flex">
    <aside className="hidden w-[258px] shrink-0 flex-col border-r border-line border-t-[3px] border-t-gold bg-white px-5 py-6 lg:flex">
      <Brand />
      <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-[#a1aaa3]">Workspace</div>
      <nav aria-label="Main navigation" className="mt-3 space-y-1">{nav.map(({ to, label, icon: Icon }) => <Link key={label} to={to} aria-current={active(to) ? 'page' : undefined} className={`nav-item min-h-11 ${active(to) ? 'nav-active' : ''}`}><Icon aria-hidden="true" size={18} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="mt-auto space-y-1 border-t border-line pt-5"><a className="nav-item min-h-11" href="mailto:hello@spikein.app"><CircleHelp aria-hidden="true" size={18} />Help & support</a><button onClick={() => void signOut()} className="nav-item min-h-11 w-full text-left"><LogOut aria-hidden="true" size={18} />Sign out</button></div>
      <div className="mt-5 flex items-center gap-3 rounded-xl bg-canvas p-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-green-light text-xs font-bold text-green">{profile?.full_name?.slice(0,1).toUpperCase() || 'S'}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{profile?.full_name || 'Team coach'}</div><div className="mt-0.5 text-xs capitalize text-muted">{profile?.role || 'coach'}</div></div></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="flex min-h-[64px] items-center justify-between border-b-[3px] border-b-gold bg-green px-4 pt-[env(safe-area-inset-top)] text-white sm:px-5 lg:hidden"><Brand /><button onClick={() => void signOut()} aria-label="Sign out" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white/90 transition-colors hover:bg-white/10 active:bg-white/20"><LogOut aria-hidden="true" size={19} /></button></header>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1200px] px-4 py-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-9 lg:px-10 lg:pb-12">{children}</main>
      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-white/88 px-1 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(11,61,30,.08)] backdrop-blur-xl lg:hidden">{nav.map(({ to, label, icon: Icon }) => <Link key={label} to={to} aria-current={active(to) ? 'page' : undefined} className={`mobile-nav min-h-12 rounded-lg transition-colors active:bg-green-light ${active(to) ? 'text-green' : 'text-muted'}`}><Icon aria-hidden="true" size={20} strokeWidth={1.8} /><span>{label}</span></Link>)}</nav>
    </div>
  </div>
}

export function Brand() { return <div className="flex items-center gap-2.5"><img src="/vsu-seal.jpg" alt="Visayas State University seal" className="h-10 w-10 rounded-full border border-white/70 bg-white object-cover shadow-sm"/><span className="text-[19px] font-extrabold tracking-[-.045em] text-white lg:text-ink">spike<span className="text-gold lg:text-green">in</span><span className="ml-1 text-[10px] font-medium tracking-normal text-white/75 lg:text-muted">TEAM</span></span></div> }
