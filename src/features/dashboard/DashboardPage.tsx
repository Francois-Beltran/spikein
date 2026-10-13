import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, ArrowRight, CalendarDays, Check, ChevronDown, CircleAlert, Clock3, LoaderCircle, Plus, RefreshCw, Users, Volleyball, X } from 'lucide-react'
import { useAuth } from '../../app/providers'
import { supabase } from '../../lib/supabase'
import { useCoachDashboard, type Team, type TeamSession } from './useCoachDashboard'
import { useStudentDashboard } from './useStudentDashboard'

export function DashboardPage() {
  const { profile } = useAuth()
  if (profile?.role === 'coach') return <CoachDashboard />
  return <StudentHome name={profile?.full_name ?? ''} />
}

function CoachDashboard() {
  const { profile, user } = useAuth()
  const { data, isLoading, isError, error, refetch, isFetching } = useCoachDashboard()
  const [dialog, setDialog] = useState<'team'|'session'|null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const onOnline = () => setOnline(true), onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  const teams = data?.teams ?? []
  const members = data?.members ?? []
  const sessions = data?.sessions ?? []
  const upcoming = sessions.filter(session => !session.closed_at && new Date(session.ends_at).getTime() >= Date.now()).slice(0, 4)
  const weekSessions = sessions.filter(session => { const day = new Date(session.starts_at); const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - ((now.getDay()+6)%7)); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(start.getDate()+7); return day >= start && day < end }).length
  const uniquePlayers = new Set(members.map(member => member.student_id)).size
  const teamNames = useMemo(() => new Map(teams.map(team => [team.id,team.name])), [teams])

  return <div className="space-y-6 sm:space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div><div className="text-xs font-medium text-muted">{new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date())}</div><h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.045em] sm:text-[32px]">Coach overview</h1><p className="mt-1.5 text-sm text-muted">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Here’s your team at a glance.</p></div>
      <div className="grid grid-cols-2 gap-2 sm:flex"><button onClick={()=>setDialog('team')} disabled={!online} className="secondary-button min-h-12"><Plus size={17} aria-hidden="true"/>New team</button><button onClick={()=>setDialog('session')} disabled={!online || !teams.length} className="primary-button min-h-12"><Plus size={17} aria-hidden="true"/>New session</button></div>
    </header>

    {!online && <div role="status" className="flex items-center gap-2 rounded-xl border border-[#f1d5b8] bg-[#fff7ed] px-4 py-3 text-xs text-[#92501b]"><CircleAlert size={16}/>You’re offline. Team and session changes need an internet connection.</div>}
    {isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2d1ce] bg-[#fff7f6] px-4 py-3 text-xs text-[#a24038]"><span>We couldn’t load your team data. {error instanceof Error ? error.message : 'Check your connection and try again.'}</span><button className="inline-flex min-h-10 items-center gap-2 font-semibold" onClick={()=>void refetch()}><RefreshCw size={14}/>Try again</button></div>}

    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Metric label="Teams" value={isLoading?'…':String(teams.length)} note={teams.length===1?'Your volleyball team':'Teams you manage'} icon={Volleyball} tone="green" />
      <Metric label="Players" value={isLoading?'…':String(uniquePlayers)} note="Across your teams" icon={Users} tone="orange" />
      <Metric label="This week" value={isLoading?'…':String(weekSessions)} note="Scheduled sessions" icon={CalendarDays} tone="blue" />
      <Metric label="Coming up" value={isLoading?'…':String(sessions.filter(session=>!session.closed_at && new Date(session.ends_at).getTime()>=Date.now()).length)} note="Open upcoming sessions" icon={Clock3} tone="purple" />
    </section>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section id="sessions" className="scroll-mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6"><div><h2 className="text-sm font-semibold">Upcoming sessions</h2><p className="mt-1 text-[11px] text-muted">Your team’s next practices and games</p></div><button aria-label="Refresh sessions" onClick={()=>void refetch()} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-canvas"><RefreshCw size={16} className={isFetching?'animate-spin':''}/></button></div>
        {isLoading ? <LoadingRows/> : upcoming.length ? <div>{upcoming.map(session=><SessionRow key={session.id} session={session} teamName={teamNames.get(session.group_id)}/>)}</div> : <EmptySessions hasTeams={teams.length>0} onCreate={()=>setDialog(teams.length?'session':'team')}/>}
        <div className="border-t border-line px-5 py-3 text-center text-[10px] text-muted sm:px-6">Attendance review and check-in codes will appear here when those features are enabled.</div>
      </section>

      <aside className="space-y-5">
        <div className="overflow-hidden rounded-2xl bg-green p-5 text-white"><div className="flex items-start justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/65">Coach tools</div><div className="mt-2 text-2xl font-semibold tracking-[-.04em]">Build your team</div></div><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><Activity size={18}/></div></div><p className="mt-2 text-xs leading-5 text-white/70">Set up a roster and put the next practice on the calendar.</p><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setDialog('team')} disabled={!online} className="min-h-11 rounded-xl bg-lime px-3 text-xs font-bold text-ink">Create a team</button><button onClick={()=>setDialog('session')} disabled={!online||!teams.length} className="min-h-11 rounded-xl border border-white/20 px-3 text-xs font-semibold text-white disabled:opacity-50">Schedule session</button></div></div>
        <div id="teams" className="scroll-mt-5 rounded-2xl border border-line bg-white p-5 shadow-card"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Your teams</h2><p className="mt-1 text-[11px] text-muted">Teams you coach</p></div><span className="rounded-lg bg-canvas px-2 py-1 text-[10px] font-semibold text-muted">{isLoading?'…':teams.length}</span></div>
          {isLoading ? <div className="mt-4 h-14 animate-pulse rounded-xl bg-canvas"/> : teams.length ? <div className="mt-3 divide-y divide-line">{teams.slice(0,4).map(team=><TeamRow key={team.id} team={team} memberCount={members.filter(member=>member.group_id===team.id).length}/>)}</div> : <div className="mt-4 rounded-xl bg-canvas p-4"><p className="text-xs font-semibold">Start with your first team</p><p className="mt-1 text-[11px] leading-5 text-muted">Create a team space, then you can add players.</p><button onClick={()=>setDialog('team')} disabled={!online} className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-green">Create team <ArrowRight size={14}/></button></div>}
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f1edfb] text-[#7956aa]"><Check size={17}/></div><div><h2 className="text-xs font-semibold">Attendance review</h2><p className="mt-1 text-[10px] text-muted">Pending check-ins and tracker are coming soon.</p></div></div></div>
      </aside>
    </div>
    {dialog==='team' && <CreateTeamDialog userId={user?.id??''} onClose={()=>setDialog(null)}/>}
    {dialog==='session' && <CreateSessionDialog teams={teams} onClose={()=>setDialog(null)}/>}
  </div>
}

function StudentHome({name}:{name:string}) {
  const { data, isLoading, isError, error, refetch, isFetching } = useStudentDashboard()
  const teams = data?.teams ?? []
  const upcoming = data?.sessions ?? []
  const teamNames = useMemo(() => new Map(teams.map(team => [team.id, team.name])), [teams])
  const nextSession = upcoming[0]

  return <div className="space-y-6 sm:space-y-8">
    <header className="space-y-1">
      <div className="text-xs font-medium text-muted">{new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date())}</div>
      <h1 className="text-[30px] font-semibold tracking-[-.045em] sm:text-[34px]">Hey{name ? `, ${name.split(' ')[0]}` : ''}</h1>
      <p className="text-sm text-muted">Here’s what’s happening with your team.</p>
    </header>

    {isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f2d1ce] bg-[#fff7f6] px-4 py-3 text-sm text-[#8f3029]"><span>We couldn’t load your team schedule. {error instanceof Error ? error.message : 'Check your connection and try again.'}</span><button className="inline-flex min-h-11 items-center gap-2 font-semibold" onClick={()=>void refetch()}><RefreshCw size={16} aria-hidden="true"/>Try again</button></div>}

    <section aria-labelledby="next-session-title" className="overflow-hidden rounded-[1.5rem] bg-green p-5 text-white sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-white/75">Next up</p><h2 id="next-session-title" className="mt-2 text-xl font-semibold tracking-[-.025em]">{isLoading ? 'Checking your schedule…' : nextSession?.title ?? 'No sessions scheduled'}</h2></div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><CalendarDays size={21} aria-hidden="true"/></span>
      </div>
      {isLoading ? <div className="mt-5 h-12 animate-pulse rounded-xl bg-white/15"/> : nextSession ? <>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/85"><span className="inline-flex items-center gap-2"><CalendarDays size={15} aria-hidden="true"/>{new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(new Date(nextSession.starts_at))}</span><span className="inline-flex items-center gap-2"><Clock3 size={15} aria-hidden="true"/>{new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(nextSession.starts_at))}</span></div>
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-white/70"><Users size={14} aria-hidden="true"/>{teamNames.get(nextSession.group_id) ?? 'Your team'}<span aria-hidden="true">·</span><span className="capitalize">{nextSession.type}</span></div>
      </> : <p className="mt-2 max-w-md text-sm leading-6 text-white/75">{teams.length ? 'Your coach has not added a practice or game yet.' : 'Once your coach adds you to a team, its schedule will show here.'}</p>}
    </section>

    <section id="sessions" className="scroll-mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="text-base font-semibold">Upcoming sessions</h2><p className="mt-1 text-xs text-muted">Practices and games on your schedule</p></div><button aria-label="Refresh schedule" onClick={()=>void refetch()} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-muted transition-colors hover:bg-canvas active:bg-green-light"><RefreshCw size={17} aria-hidden="true" className={isFetching?'animate-spin':''}/></button></div>
      {isLoading ? <LoadingRows/> : upcoming.length ? <div>{upcoming.slice(0,6).map(session=><SessionRow key={session.id} session={session} teamName={teamNames.get(session.group_id)}/>)}</div> : <div className="px-5 py-9 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-canvas text-muted"><CalendarDays size={20} aria-hidden="true"/></div><h3 className="mt-3 text-sm font-semibold">Nothing on your schedule yet</h3><p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-muted">{teams.length ? 'Your coach’s next practice or game will appear here.' : 'Ask your coach to add you to a team so you can see its schedule.'}</p></div>}
    </section>

    <section id="teams" className="scroll-mt-5 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">My teams</h2><p className="mt-1 text-xs text-muted">Teams you’re on the roster for</p></div><span className="rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-semibold text-muted">{isLoading ? '…' : teams.length}</span></div>
      {isLoading ? <div className="mt-4 h-14 animate-pulse rounded-xl bg-canvas"/> : teams.length ? <div className="mt-3 divide-y divide-line">{teams.map(team=><TeamRow key={team.id} team={team}/>)}</div> : <div className="mt-4 flex items-start gap-3 rounded-xl bg-canvas p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-light text-green"><Volleyball size={19} aria-hidden="true"/></span><div><p className="text-sm font-semibold">You’re not on a team yet</p><p className="mt-1 text-sm leading-6 text-muted">Ask your coach to add your Google account to the roster. Your team and schedule will show up here.</p></div></div>}
    </section>

    <section className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 sm:p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf1fa] text-[#4b5f92]"><Check size={18} aria-hidden="true"/></span><div><h2 className="text-sm font-semibold">Attendance history</h2><p className="mt-1 text-sm leading-6 text-muted">Your attendance record will appear here once check-ins are enabled for your team.</p></div></section>
  </div>
}

function Metric({label,value,note,icon:Icon,tone}:{label:string;value:string;note:string;icon:typeof Users;tone:string}) { const tones:Record<string,string>={green:'bg-green-light text-green',orange:'bg-[#fff1e5] text-[#bb671e]',blue:'bg-[#eaf2fb] text-[#4679ad]',purple:'bg-[#f1edfb] text-[#7956aa]'}; return <div className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5"><div className="flex items-center justify-between"><span className="text-sm font-medium text-muted">{label}</span><span aria-hidden="true" className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={18}/></span></div><div className="mt-3 text-[27px] font-semibold leading-none tracking-[-.04em] tabular-nums">{value}</div><div className="mt-2 text-xs text-muted">{note}</div></div> }

function SessionRow({session,teamName}:{session:TeamSession;teamName?:string}) { const start=new Date(session.starts_at); const end=new Date(session.ends_at); return <div className="flex items-center gap-3 border-b border-line px-4 py-4 last:border-0 sm:gap-4 sm:px-6"><div className="w-11 shrink-0 text-center"><div className="text-[9px] font-bold tracking-wider text-muted">{new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(start).toUpperCase()}</div><div className="mt-0.5 text-xl font-semibold leading-6">{start.getDate()}</div><div className="text-[9px] font-medium text-muted">{new Intl.DateTimeFormat(undefined,{month:'short'}).format(start).toUpperCase()}</div></div><div className="h-10 w-px bg-line"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="truncate text-[13px] font-semibold">{session.title}</div><span className="rounded-md bg-green-light px-1.5 py-0.5 text-[9px] font-semibold capitalize text-green">{session.type}</span></div><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted"><span className="flex items-center gap-1"><Clock3 size={12}/>{new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(start)} – {new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(end)}</span>{teamName&&<span className="flex items-center gap-1"><Users size={12}/>{teamName}</span>}</div></div></div> }

function TeamRow({team,memberCount}:{team:Team;memberCount?:number}) { return <div className="flex min-h-[60px] items-center gap-3"><div aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-green-light text-green"><Volleyball size={18}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{team.name}</div>{memberCount!==undefined&&<div className="mt-0.5 text-xs text-muted">{memberCount} {memberCount===1?'player':'players'}</div>}</div></div> }

function EmptySessions({hasTeams,onCreate}:{hasTeams:boolean;onCreate:()=>void}) { return <div className="px-6 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-canvas text-muted"><CalendarDays size={20}/></div><h3 className="mt-4 text-sm font-semibold">No upcoming sessions</h3><p className="mx-auto mt-1.5 max-w-xs text-xs leading-5 text-muted">{hasTeams?'Schedule a practice or game and it will show up here.':'Create a team first, then schedule its first session.'}</p><button onClick={onCreate} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-green px-4 text-xs font-semibold text-white"><Plus size={15}/>{hasTeams?'Schedule a session':'Create a team'}</button></div> }

function Dialog({title,description,onClose,children}:{title:string;description:string;onClose:()=>void;children:ReactNode}) { return <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="dialog-title" className="text-lg font-semibold tracking-[-.03em]">{title}</h2><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div><button onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas"><X size={18}/></button></div>{children}</section></div> }

function CreateTeamDialog({userId,onClose}:{userId:string;onClose:()=>void}) { const [name,setName]=useState('');const [formError,setFormError]=useState('');const queryClient=useQueryClient();const mutation=useMutation({mutationFn:async()=>{if(!supabase)throw new Error('Supabase is not configured.');const {error}=await supabase.from('groups').insert({name:name.trim(),owner_id:userId});if(error)throw error},onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['coach-dashboard',userId]});onClose()},onError:e=>setFormError(e instanceof Error?e.message:'Could not create team.')});function submit(e:FormEvent){e.preventDefault();setFormError('');mutation.mutate()} return <Dialog title="Create a team" description="Set up a space for your players and sessions." onClose={onClose}><form onSubmit={submit} className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-xs font-semibold">Team name</span><input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Varsity Volleyball" className="field"/></label>{formError&&<p role="alert" className="text-xs text-red-600">{formError}</p>}<div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="secondary-button">Cancel</button><button disabled={mutation.isPending||!navigator.onLine} className="primary-button">{mutation.isPending?<LoaderCircle size={16} className="animate-spin"/>:'Create team'}</button></div></form></Dialog> }

function CreateSessionDialog({teams,onClose}:{teams:Team[];onClose:()=>void}) { const [title,setTitle]=useState('');const [teamId,setTeamId]=useState(teams[0]?.id??'');const [type,setType]=useState<'practice'|'game'|'tournament'>('practice');const [startsAt,setStartsAt]=useState('');const [endsAt,setEndsAt]=useState('');const [formError,setFormError]=useState('');const {user}=useAuth();const queryClient=useQueryClient();const mutation=useMutation({mutationFn:async()=>{if(!supabase)throw new Error('Supabase is not configured.');const {error}=await supabase.from('sessions').insert({group_id:teamId,title:title.trim(),type,starts_at:new Date(startsAt).toISOString(),ends_at:new Date(endsAt).toISOString()});if(error)throw error},onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['coach-dashboard',user?.id]});onClose()},onError:e=>setFormError(e instanceof Error?e.message:'Could not schedule session.')});function submit(e:FormEvent){e.preventDefault();setFormError('');if(new Date(endsAt)<=new Date(startsAt)){setFormError('End time must be after the start time.');return}mutation.mutate()}return <Dialog title="Schedule a session" description="Add a practice, game, or tournament to your team calendar." onClose={onClose}><form onSubmit={submit} className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-xs font-semibold">Session title</span><input autoFocus required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Team practice" className="field"/></label><label className="block"><span className="mb-2 block text-xs font-semibold">Team</span><div className="relative"><select required value={teamId} onChange={e=>setTeamId(e.target.value)} className="field appearance-none">{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-4 top-4 text-muted"/></div></label><label className="block"><span className="mb-2 block text-xs font-semibold">Session type</span><select value={type} onChange={e=>setType(e.target.value as typeof type)} className="field"><option value="practice">Practice</option><option value="game">Game</option><option value="tournament">Tournament</option></select></label><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-semibold">Starts</span><input required type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} className="field"/></label><label className="block"><span className="mb-2 block text-xs font-semibold">Ends</span><input required type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} className="field"/></label></div>{formError&&<p role="alert" className="text-xs text-red-600">{formError}</p>}<div className="rounded-xl bg-canvas px-3 py-2.5 text-[10px] leading-5 text-muted">Session check-in code generation will be added with the attendance workflow.</div><div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="secondary-button">Cancel</button><button disabled={mutation.isPending||!navigator.onLine} className="primary-button">{mutation.isPending?<LoaderCircle size={16} className="animate-spin"/>:'Schedule session'}</button></div></form></Dialog> }

function LoadingRows(){return <div aria-label="Loading sessions" className="divide-y divide-line">{[1,2,3].map(item=><div key={item} className="flex items-center gap-4 px-6 py-5"><div className="h-10 w-10 animate-pulse rounded-lg bg-canvas"/><div className="flex-1"><div className="h-3 w-1/3 animate-pulse rounded bg-canvas"/><div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-canvas"/></div></div>)}</div>}
