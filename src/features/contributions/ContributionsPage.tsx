import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, ReceiptText, Search, Share2 } from 'lucide-react'
import { useAuth } from '../../app/providers'
import { supabase } from '../../lib/supabase'

type Team = { id: string; name: string; owner_id: string }
type Settings = { group_id: string; target_centavos: number; treasurer_id: string | null; auditor_id: string | null }
type Payer = { id: string; name: string; coach?: boolean }
type Payment = { id: string; group_id: string; payer_id: string; amount_centavos: number; paid_on: string; status: 'pending'|'approved'; receipt_number: number|null; approved_at: string|null; entered_by: string }
type Edit = { id: number; payment_id: string; old_amount_centavos: number; new_amount_centavos: number; old_paid_on: string; new_paid_on: string; reason: string; edited_at: string; edited_by: string }
const money = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100)
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
function cents(value: string) { const number = Number(value); if (!Number.isFinite(number) || number <= 0 || !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount greater than zero with up to two decimal places.'); return Math.round(number * 100) }
function targetAmount(value: string) { if (Number(value) === 0 && /^0+(\.0{1,2})?$/.test(value)) return 0; return cents(value) }
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Try again.' }

function Progress({ paid, target, name }: { paid: number; target: number; name: string }) {
  const remaining = Math.max(0, target - paid)
  const percent = target ? Math.min(100, Math.round(paid / target * 100)) : 0
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs text-muted">Paid so far</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(paid)}</p></div><div className="text-right"><p className="text-xs text-muted">Remaining</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(remaining)}</p></div></div>
    <div role="progressbar" aria-label={`${name} contribution progress`} aria-valuemin={0} aria-valuemax={Math.max(target, 1)} aria-valuenow={Math.min(paid, Math.max(target, 1))} aria-valuetext={`${money(paid)} paid toward ${money(target)}; ${money(remaining)} remaining`} className="mt-4 h-3 overflow-hidden rounded-full bg-green-light"><div className="h-full rounded-full bg-green transition-[width]" style={{ width: `${percent}%` }} /></div>
    <p className="mt-2 text-xs text-muted">{target ? `${percent}% of ${money(target)} target` : 'No target set yet'}{paid > target && target > 0 ? ` · ${money(paid - target)} over target` : ''}</p>
  </div>
}

function receiptText(payment: Payment, team: Team, payer: Payer, edits: Edit[]) {
  return `SPIKE IN CONTRIBUTION RECEIPT\nReceipt #${String(payment.receipt_number).padStart(6, '0')}\nTeam: ${team.name}\nPayer: ${payer.name}\nAmount: ${money(payment.amount_centavos)}\nPaid on: ${date(payment.paid_on)}\nApproved: ${payment.approved_at ? new Date(payment.approved_at).toLocaleString('en-PH') : ''}\n${edits.length ? `Corrected ${edits.length} time(s); see in-app history for details.\n` : ''}Payment ID: ${payment.id}\n`
}
function receiptHtml(payment: Payment, team: Team, payer: Payer, edits: Edit[]) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
  const number = String(payment.receipt_number).padStart(6, '0')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spike In receipt ${number}</title><style>body{font:16px system-ui,sans-serif;color:#111a14;max-width:560px;margin:32px auto;padding:20px}h1{color:#135d2e}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-block:1px solid #d6e0d5;padding:20px 0}dt{color:#5b6b60}dd{margin:0;text-align:right;font-weight:600}.note{font-size:13px;color:#5b6b60}</style><h1>Spike In</h1><p>Contribution receipt #${number}</p><dl><dt>Team</dt><dd>${escape(team.name)}</dd><dt>Payer</dt><dd>${escape(payer.name)}</dd><dt>Amount</dt><dd>${money(payment.amount_centavos)}</dd><dt>Paid on</dt><dd>${date(payment.paid_on)}</dd><dt>Approved</dt><dd>${payment.approved_at ? escape(new Date(payment.approved_at).toLocaleString('en-PH')) : ''}</dd></dl>${edits.length ? `<p class="note">Corrected ${edits.length} time(s). See the in-app receipt for correction history.</p>` : ''}<p class="note">Payment ID: ${payment.id}</p></html>`
}
function Receipt({ payment, team, payer, edits }: { payment: Payment; team: Team; payer: Payer; edits: Edit[] }) {
  const content = receiptText(payment, team, payer, edits)
  const download = () => { const url = URL.createObjectURL(new Blob([receiptHtml(payment, team, payer, edits)], { type: 'text/html;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `spikein-receipt-${payment.receipt_number}.html`; link.click(); URL.revokeObjectURL(url) }
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: `Spike In receipt #${payment.receipt_number}`, text: content }) } catch { /* User dismissed the share sheet. */ } } else { download() } }
  return <div className="mt-3 rounded-xl border border-line bg-canvas p-4 text-sm"><p className="font-semibold">Receipt #{String(payment.receipt_number).padStart(6, '0')}</p><p className="mt-1 break-words text-muted">{payer.name} · {money(payment.amount_centavos)} · {date(payment.paid_on)}</p><div className="mt-3 flex flex-wrap gap-2"><button className="secondary-button" type="button" onClick={download}><Download size={16} />Download</button><button className="secondary-button" type="button" onClick={() => void share()}><Share2 size={16} />Share</button></div></div>
}

export function ContributionsPage() {
  const { user, profile } = useAuth()
  const qc = useQueryClient()
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState('')
  const [receiptId, setReceiptId] = useState('')
  const [editing, setEditing] = useState<Payment|null>(null)
  const [confirming, setConfirming] = useState<{ payer: Payer; amount: string; paidOn: string }|null>(null)
  const [payerId, setPayerId] = useState('')
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toLocaleDateString('en-CA'))
  const [target, setTarget] = useState('')
  const [treasurer, setTreasurer] = useState<string|null>(null)
  const [auditor, setAuditor] = useState<string|null>(null)
  const [correctionAmount, setCorrectionAmount] = useState('')
  const [correctionDate, setCorrectionDate] = useState('')
  const [reason, setReason] = useState('')

  const teams = useQuery({ queryKey: ['contribution-teams', user?.id], enabled: !!supabase && !!user, queryFn: async () => {
    const [owned, memberships] = await Promise.all([supabase!.from('groups').select('id,name,owner_id').eq('owner_id', user!.id), supabase!.from('group_members').select('group_id').eq('student_id', user!.id)])
    if (owned.error) throw owned.error; if (memberships.error) throw memberships.error
    const joinedIds = (memberships.data ?? []).map(m => m.group_id).filter(id => !(owned.data ?? []).some(team => team.id === id))
    if (!joinedIds.length) return (owned.data ?? []) as Team[]
    const joined = await supabase!.from('groups').select('id,name,owner_id').in('id', joinedIds)
    if (joined.error) throw joined.error
    return [...(owned.data ?? []), ...(joined.data ?? [])] as Team[]
  } })
  const team = teams.data?.find(t => t.id === selected) ?? teams.data?.[0]
  const groupId = team?.id ?? ''
  const ledger = useQuery({ queryKey: ['contribution-ledger', groupId, user?.id], enabled: !!supabase && !!team, refetchOnWindowFocus: true, refetchInterval: 10_000, queryFn: async () => {
    const [settings, payments, members, coach] = await Promise.all([
      supabase!.from('contribution_settings').select('group_id,target_centavos,treasurer_id,auditor_id').eq('group_id', groupId).maybeSingle(),
      supabase!.from('contribution_payments').select('id,group_id,payer_id,amount_centavos,paid_on,status,receipt_number,approved_at,entered_by').eq('group_id', groupId).order('created_at', { ascending: false }),
      supabase!.from('group_members').select('student_id,profiles(full_name)').eq('group_id', groupId),
      supabase!.from('profiles').select('id,full_name').eq('id', team!.owner_id).single(),
    ])
    for (const result of [settings, payments, members, coach]) if (result.error) throw result.error
    const rows = (payments.data ?? []) as Payment[]
    const editsResult = rows.length ? await supabase!.from('contribution_payment_edits').select('id,payment_id,old_amount_centavos,new_amount_centavos,old_paid_on,new_paid_on,reason,edited_at,edited_by').in('payment_id', rows.map(r => r.id)).order('edited_at', { ascending: false }) : null
    if (editsResult?.error) throw editsResult.error
    const roster = (members.data ?? []).map(m => ({ id: m.student_id, name: (m.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Player' }))
    return { settings: settings.data as Settings|null, payments: rows, edits: (editsResult?.data ?? []) as Edit[], payers: [{ id: team!.owner_id, name: coach.data?.full_name ?? 'Coach', coach: true }, ...roster] as Payer[] }
  } })
  const settings = ledger.data?.settings
  const isCoach = profile?.role === 'coach' && team?.owner_id === user?.id
  const isTreasurer = settings?.treasurer_id === user?.id
  const isAuditor = settings?.auditor_id === user?.id
  const canSeeRoster = isCoach || isTreasurer || isAuditor
  const payers = ledger.data?.payers ?? []
  const payments = ledger.data?.payments ?? []
  const edits = ledger.data?.edits ?? []
  const approved = payments.filter(p => p.status === 'approved')
  const ownPaid = approved.filter(p => p.payer_id === user?.id).reduce((sum, p) => sum + p.amount_centavos, 0)
  const targetCents = Number(settings?.target_centavos ?? 0)
  const visiblePayers = useMemo(() => payers.filter(p => p.name.toLowerCase().includes(search.toLowerCase())), [payers, search])
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['contribution-ledger', groupId] }) }
  const saveSettings = useMutation({ mutationFn: async () => { if (!supabase) throw new Error('Unavailable'); const value = target === '' ? targetCents : targetAmount(target); const { error } = await supabase.rpc('set_contribution_settings', { target_group: groupId, new_target_centavos: value, new_treasurer: treasurer === null ? settings?.treasurer_id ?? null : treasurer || null, new_auditor: auditor === null ? settings?.auditor_id ?? null : auditor || null }); if (error) throw error }, onSuccess: async () => { setFeedback('Contribution settings saved.'); setTarget(''); setTreasurer(null); setAuditor(null); await refresh() }, onError: e => setFeedback(message(e)) })
  const record = useMutation({ mutationFn: async (input: { payer: Payer; amount: string; paidOn: string }) => { if (!supabase) throw new Error('Unavailable'); const { error } = await supabase.rpc('record_contribution', { target_group: groupId, target_payer: input.payer.id, amount_centavos: cents(input.amount), payment_date: input.paidOn }); if (error) throw error }, onSuccess: async () => { setConfirming(null); setAmount(''); setFeedback(isTreasurer ? 'Payment approved. Receipt is ready.' : 'Pending payment sent to the treasurer.'); await refresh() }, onError: e => { setConfirming(null); setFeedback(message(e)) } })
  const approve = useMutation({ mutationFn: async (id: string) => { if (!supabase) throw new Error('Unavailable'); const { error } = await supabase.rpc('approve_contribution', { target_payment: id }); if (error) throw error }, onSuccess: async () => { setFeedback('Payment approved. Receipt is ready.'); await refresh() }, onError: e => setFeedback(message(e)) })
  const correct = useMutation({ mutationFn: async () => { if (!supabase || !editing) throw new Error('Unavailable'); const { error } = await supabase.rpc('correct_contribution', { target_payment: editing.id, new_amount_centavos: cents(correctionAmount), new_paid_on: correctionDate, correction_reason: reason.trim() }); if (error) throw error }, onSuccess: async () => { setEditing(null); setReason(''); setFeedback('Receipt corrected. Previous details remain in its history.'); await refresh() }, onError: e => setFeedback(message(e)) })

  return <div className="mx-auto max-w-4xl space-y-5">
    <Link to={profile?.role === 'coach' ? '/admin' : '/'} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted"><ArrowLeft size={16} />Back to dashboard</Link>
    <header><p className="text-xs text-muted">Team finances</p><h1 className="mt-1 text-[30px] font-semibold">Contributions</h1><p className="mt-2 text-sm text-muted">Track approved payments and receipts for each team.</p></header>
    {feedback && <p role="status" className="rounded-xl bg-green-light p-3 text-sm text-green">{feedback}</p>}
    {teams.isLoading ? <p className="text-sm text-muted">Loading teams…</p> : teams.error ? <p role="alert" className="text-sm text-red-700">{message(teams.error)}</p> : !team ? <section className="rounded-2xl bg-white p-5 text-sm text-muted">No teams yet. <Link className="font-semibold text-green" to={profile?.role === 'coach' ? '/admin/teams' : '/teams'}>View teams</Link></section> : <>
      {teams.data!.length > 1 && <label className="block text-sm font-semibold">Team<select className="field mt-2" value={groupId} onChange={e => { setSelected(e.target.value); setFeedback(''); setSearch(''); setTarget(''); setTreasurer(null); setAuditor(null); setPayerId('') }}>{teams.data!.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <h2 className="break-words text-xl font-semibold">{team.name}</h2>
      {ledger.isLoading ? <p className="text-sm text-muted">Loading contributions…</p> : ledger.error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{message(ledger.error)}<button className="secondary-button mt-3" onClick={() => void ledger.refetch()}>Try again</button></div> : <>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="mb-4 font-semibold">My contribution</h2><Progress paid={ownPaid} target={targetCents} name="My" /></section>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="font-semibold">My payment history</h2>{approved.filter(p => p.payer_id === user?.id).length ? <div className="mt-3 divide-y divide-line">{approved.filter(p => p.payer_id === user?.id).map(p => <PaymentRow key={p.id} payment={p} team={team} payer={payers.find(x => x.id === p.payer_id)!} edits={edits.filter(e => e.payment_id === p.id)} open={receiptId === p.id} onToggle={() => setReceiptId(receiptId === p.id ? '' : p.id)} />)}</div> : <p className="mt-3 text-sm text-muted">Approved payments and receipts will appear here after the treasurer confirms them.</p>}</section>
        {isCoach && <section className="rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="font-semibold">Team contribution settings</h2><p className="mt-1 text-sm text-muted">Set the same target for you and each player. Assign finance duties to rostered players.</p><form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); setFeedback(''); saveSettings.mutate() }}><label className="text-sm font-semibold">Target (₱)<input className="field mt-2" inputMode="decimal" type="number" min="0" step="0.01" key={`amount-${groupId}-${targetCents}`} defaultValue={(targetCents / 100).toFixed(2)} onChange={e => setTarget(e.target.value)} required /></label><label className="text-sm font-semibold">Treasurer<select className="field mt-2" defaultValue={settings?.treasurer_id ?? ''} key={`t-${groupId}-${settings?.treasurer_id}`} onChange={e => setTreasurer(e.target.value)}><option value="">Unassigned</option>{payers.filter(p => !p.coach).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm font-semibold">Auditor<select className="field mt-2" defaultValue={settings?.auditor_id ?? ''} key={`a-${groupId}-${settings?.auditor_id}`} onChange={e => setAuditor(e.target.value)}><option value="">Unassigned</option>{payers.filter(p => !p.coach).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="primary-button sm:col-span-3 sm:justify-self-start" disabled={saveSettings.isPending}>Save settings</button></form></section>}
        {(isTreasurer || isAuditor) && <section className="rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="font-semibold">Record a payment</h2><p className="mt-1 text-sm text-muted">{isTreasurer ? 'Review the details before confirming. A receipt is issued immediately.' : 'Your entry will wait for the treasurer to approve it.'}</p><form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); const payer = payers.find(p => p.id === payerId); if (!payer) { setFeedback('Choose a payer.'); return } try { cents(amount); setConfirming({ payer, amount, paidOn }) } catch (error) { setFeedback(message(error)) } }}><label className="text-sm font-semibold">Payer<select className="field mt-2" value={payerId} onChange={e => setPayerId(e.target.value)} required><option value="">Choose payer</option>{payers.map(p => <option key={p.id} value={p.id}>{p.name}{p.coach ? ' (coach)' : ''}</option>)}</select></label><label className="text-sm font-semibold">Amount (₱)<input className="field mt-2" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></label><label className="text-sm font-semibold">Paid on<input className="field mt-2" type="date" max={new Date().toLocaleDateString('en-CA')} value={paidOn} onChange={e => setPaidOn(e.target.value)} required /></label><button className="primary-button sm:col-span-3 sm:justify-self-start" disabled={record.isPending}>Review payment</button></form></section>}
        {canSeeRoster && <><section className="rounded-2xl border border-line bg-white p-5 shadow-card"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Team ledger</h2><p className="text-sm text-muted">{money(approved.reduce((sum, p) => sum + p.amount_centavos, 0))} collected</p></div><label className="relative mt-4 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} /><span className="sr-only">Search team members</span><input className="field" style={{ paddingLeft: 44 }} placeholder="Search team members" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="mt-3 space-y-3">{visiblePayers.map(p => { const paid = approved.filter(x => x.payer_id === p.id).reduce((sum, x) => sum + x.amount_centavos, 0); return <details key={p.id} className="rounded-xl border border-line p-4"><summary className="min-h-11 cursor-pointer break-words font-semibold">{p.name}{p.coach ? ' · Coach' : ''}<span className="ml-2 text-sm font-normal text-muted">{money(paid)} paid</span></summary><div className="mt-4"><Progress paid={paid} target={targetCents} name={p.name} />{payments.filter(x => x.payer_id === p.id).map(payment => <div key={payment.id} className="mt-3 border-t border-line pt-3"><PaymentRow payment={payment} team={team} payer={p} edits={edits.filter(e => e.payment_id === payment.id)} open={receiptId === payment.id} onToggle={() => setReceiptId(receiptId === payment.id ? '' : payment.id)} />{payment.status === 'pending' && isTreasurer && <button className="primary-button mt-2" disabled={approve.isPending} onClick={() => approve.mutate(payment.id)}>Approve payment</button>}{payment.status === 'approved' && isTreasurer && <button className="secondary-button mt-2" onClick={() => { setEditing(payment); setCorrectionAmount((payment.amount_centavos / 100).toFixed(2)); setCorrectionDate(payment.paid_on); setReason('') }}>Correct payment</button>}</div>)}</div></details> })}{!visiblePayers.length && <p className="text-sm text-muted">No members match your search.</p>}</div></section></>}
      </>}
    </>}
    {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="confirm-payment" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><h2 id="confirm-payment" className="text-xl font-semibold">{isTreasurer ? 'Confirm and issue receipt' : 'Send for approval'}</h2><p className="mt-3 break-words text-sm">{confirming.payer.name} · {money(cents(confirming.amount))} · {date(confirming.paidOn)}</p><p className="mt-2 text-sm text-muted">{isTreasurer ? 'This amount will appear on the payer’s dashboard immediately.' : 'The treasurer must approve this entry before it counts toward the balance.'}</p><div className="mt-5 flex flex-col gap-2"><button className="primary-button" disabled={record.isPending} onClick={() => record.mutate(confirming)}>{isTreasurer ? 'Confirm payment' : 'Send pending payment'}</button><button className="secondary-button" onClick={() => setConfirming(null)}>Cancel</button></div></section></div>}
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="correct-payment" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><h2 id="correct-payment" className="text-xl font-semibold">Correct receipt #{editing.receipt_number}</h2><form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); correct.mutate() }}><label className="block text-sm font-semibold">Amount (₱)<input className="field mt-2" type="number" min="0.01" step="0.01" value={correctionAmount} onChange={e => setCorrectionAmount(e.target.value)} required /></label><label className="block text-sm font-semibold">Paid on<input className="field mt-2" type="date" max={new Date().toLocaleDateString('en-CA')} value={correctionDate} onChange={e => setCorrectionDate(e.target.value)} required /></label><label className="block text-sm font-semibold">Reason<textarea className="field mt-2 min-h-24 py-3" minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} required /></label><button className="primary-button w-full" disabled={correct.isPending}>Save correction</button><button type="button" className="secondary-button w-full" onClick={() => setEditing(null)}>Cancel</button></form></section></div>}
  </div>
}

function PaymentRow({ payment, team, payer, edits, open, onToggle }: { payment: Payment; team: Team; payer: Payer; edits: Edit[]; open: boolean; onToggle: () => void }) {
  return <div className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold tabular-nums">{money(payment.amount_centavos)}</p><p className="text-xs text-muted">{date(payment.paid_on)} · {payment.status === 'approved' ? `Receipt #${String(payment.receipt_number).padStart(6, '0')}` : 'Pending approval'}</p></div>{payment.status === 'approved' && <button className="secondary-button" type="button" aria-expanded={open} onClick={onToggle}><ReceiptText size={16} />{open ? 'Hide receipt' : 'View receipt'}</button>}</div>{open && payment.status === 'approved' && <><Receipt payment={payment} team={team} payer={payer} edits={edits} />{edits.length > 0 && <div className="mt-3 rounded-xl bg-canvas p-3 text-xs"><p className="font-semibold">Correction history</p>{edits.map(e => <p key={e.id} className="mt-2 break-words text-muted">{new Date(e.edited_at).toLocaleString('en-PH')}: {money(e.old_amount_centavos)} on {date(e.old_paid_on)} → {money(e.new_amount_centavos)} on {date(e.new_paid_on)}. Reason: {e.reason}</p>)}</div>}</>}</div>
}
