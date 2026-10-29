import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/providers'
import { supabase } from '../../lib/supabase'

export function ContributionDashboardCard({ teams }: { teams: { id: string; name: string }[] }) {
  const { user } = useAuth()
  const ids = teams.map(t => t.id)
  const summary = useQuery({ queryKey: ['contribution-summary', user?.id, ids.join(',')], enabled: !!supabase && !!user && ids.length > 0, staleTime: 0, refetchOnMount: 'always', refetchInterval: 10_000, queryFn: async () => {
    const [settings, payments] = await Promise.all([
      supabase!.from('contribution_settings').select('group_id,target_centavos').in('group_id', ids),
      supabase!.from('contribution_payments').select('group_id,amount_centavos').in('group_id', ids).eq('payer_id', user!.id).eq('status', 'approved'),
    ])
    if (settings.error) throw settings.error
    if (payments.error) throw payments.error
    return teams.map(team => ({ ...team, target: Number(settings.data?.find(s => s.group_id === team.id)?.target_centavos ?? 0), paid: (payments.data ?? []).filter(p => p.group_id === team.id).reduce((sum, p) => sum + Number(p.amount_centavos), 0) }))
  } })
  if (!teams.length) return null
  const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100)
  return <section className="rounded-2xl border border-line bg-white p-5 shadow-card"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">My contributions</h2><Link to="/contributions" className="text-sm font-semibold text-green">View details</Link></div>{summary.isLoading ? <p className="mt-3 text-sm text-muted">Loading balances…</p> : summary.error ? <p className="mt-3 text-sm text-red-700">Could not load balances. Open contributions to retry.</p> : <div className="mt-3 space-y-4">{summary.data?.map(item => { const remaining = Math.max(0, item.target - item.paid); const percent = item.target ? Math.min(100, Math.round(item.paid / item.target * 100)) : 0; return <div key={item.id}><div className="flex flex-wrap justify-between gap-1 text-sm"><span className="break-words font-medium">{item.name}</span><span className="tabular-nums text-muted">{peso(item.paid)} paid · {peso(remaining)} left</span></div><div role="progressbar" aria-label={`${item.name} contribution progress`} aria-valuemin={0} aria-valuemax={Math.max(item.target, 1)} aria-valuenow={Math.min(item.paid, Math.max(item.target, 1))} aria-valuetext={`${peso(item.paid)} paid; ${peso(remaining)} remaining`} className="mt-2 h-2.5 overflow-hidden rounded-full bg-green-light"><div className="h-full rounded-full bg-green" style={{ width: `${percent}%` }} /></div></div> })}</div>}</section>
}
