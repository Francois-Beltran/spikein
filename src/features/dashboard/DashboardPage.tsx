import { Link } from 'react-router-dom'
import { CalendarDays, CheckCheck, Clock3, Plus, Users, Volleyball } from 'lucide-react'
import { useAuth } from '../../app/providers'
import { useCoachDashboard } from './useCoachDashboard'
import { useStudentDashboard } from './useStudentDashboard'

export function DashboardPage() {
  const { profile, user } = useAuth()
  return profile?.role === 'coach' ? <CoachOverview name={profile?.full_name ?? ''} email={user?.email ?? ''} /> : <StudentOverview name={profile?.full_name ?? ''} email={user?.email ?? ''} />
}

function CoachOverview({name,email}:{name:string;email:string}) {
  const { data, isLoading, isError, error } = useCoachDashboard()
  const teams = data?.teams ?? [], sessions = data?.sessions ?? [], members = data?.members ?? []
  const upcoming = sessions.filter(s => !s.closed_at && new Date(s.ends_at).getTime() >= Date.now()).slice(0, 3)
  const pending = data?.pendingAttendance ?? 0
  return <div className="space-y-6">
    <header className="min-w-0"><p className="text-xs font-medium text-muted">Coach workspace</p><h1 className="mt-1 break-words text-[30px] font-semibold tracking-[-.045em] [overflow-wrap:anywhere]">Welcome{name ? `, ${name.split(' ')[0]}` : ''}</h1><p className="mt-2 text-sm text-muted">Your teams, training, and attendance at a glance.</p><p className="mt-2 break-all text-xs text-muted">Signed in with Google as <span className="font-semibold text-ink">{email}</span></p></header>
    {isError && <p role="alert" className="rounded-xl bg-[#fff0ef] p-4 text-sm text-red-700">Couldn’t load your dashboard. {error instanceof Error ? error.message : 'Try again.'}</p>}
    <section className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">{[[Volleyball,'Teams',teams.length],[Users,'Players',new Set(members.map(m=>m.student_id)).size],[CalendarDays,'Upcoming',upcoming.length],[CheckCheck,'To review',pending]].map(([Icon,label,value]:any)=><div key={label} className="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-card"><Icon size={18} className="text-green"/><div className="mt-4 text-2xl font-semibold tabular-nums">{isLoading?'…':value}</div><div className="mt-1 text-xs text-muted">{label}</div></div>)}</section>
    <div className="flex flex-wrap gap-2">
      <Link to="/admin/teams/new" className="secondary-button min-h-11 px-4"><Plus size={17}/>Create a team</Link>
      <Link to="/admin/sessions/new" className="secondary-button min-h-11 px-4"><CalendarDays size={17}/>Schedule a session</Link>
    </div>
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-4 sm:px-5"><div><h2 className="font-semibold">Coming up</h2><p className="mt-1 text-xs text-muted">Your next practices and games</p></div><Link className="shrink-0 text-sm font-semibold text-green" to="/admin/sessions">All sessions</Link></div>{upcoming.length?upcoming.map(s=><div key={s.id} className="flex min-w-0 items-start gap-3 border-b border-line p-4 last:border-0"><CalendarDays className="mt-0.5 shrink-0 text-green" size={19}/><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold">{s.title}</div><div className="mt-1 break-words text-xs text-muted"><span>{new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span> · {teams.find(t=>t.id===s.group_id)?.name}</div></div></div>):<p className="p-6 text-sm text-muted">{isLoading?'Loading…':'No upcoming sessions yet.'}</p>}</section>
    <Link to="/admin/attendance" className="flex min-h-14 items-center justify-between rounded-2xl border border-line bg-white p-4 shadow-card"><span className="flex items-center gap-3"><CheckCheck className="text-green"/><span className="text-sm font-semibold">Review attendance</span></span><span className="rounded-full bg-[#f4f5f1] px-3 py-1 text-xs font-semibold">{pending} pending</span></Link>
  </div>
}

function StudentOverview({name,email}:{name:string;email:string}) {
  const {data,isLoading}=useStudentDashboard()
  const next=data?.sessions?.[0]
  return <div className="space-y-6"><header className="min-w-0"><p className="text-xs text-muted">Player workspace</p><h1 className="mt-1 break-words text-[30px] font-semibold tracking-[-.045em] [overflow-wrap:anywhere]">Hey{name?`, ${name.split(' ')[0]}`:''}</h1><p className="mt-2 text-sm text-muted">Your schedule and attendance.</p><p className="mt-2 break-all text-xs text-muted">Signed in with Google as <span className="font-semibold text-ink">{email}</span></p></header>
    <section className="rounded-2xl bg-green p-5 text-white"><div className="text-xs font-semibold uppercase tracking-wider text-white/70">Next session</div><h2 className="mt-3 text-xl font-semibold">{isLoading?'Loading…':next?.title??'Nothing scheduled yet'}</h2>{next&&<p className="mt-2 text-sm text-white/75">{new Date(next.starts_at).toLocaleString()}</p>}<Link className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-lime px-4 text-sm font-semibold text-ink" to="/sessions">View sessions <Clock3 size={16}/></Link></section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card"><div className="flex items-center justify-between"><h2 className="font-semibold">My teams</h2><Link to="/teams" className="text-sm font-semibold text-green">See all</Link></div>{data?.teams?.length?<div className="mt-3 space-y-3">{data.teams.slice(0,3).map(team=><div key={team.id} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-green-light text-green"><Volleyball size={19}/></span><span className="font-medium">{team.name}</span></div>)}</div>:<p className="mt-3 text-sm text-muted">Enter the join code from your coach in My teams to join a roster.</p>}</section>
    <Link to="/attendance" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm font-semibold shadow-card"><CheckCheck className="text-green"/>View attendance history</Link>
  </div>
}
