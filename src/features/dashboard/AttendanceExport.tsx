import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Team } from './useCoachDashboard'

type Props = { teams: Team[] }
type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'Not recorded'

function localDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toISOString()
}

function startOfNextLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + 1).toISOString()
}

function timeLabel(value: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
}

export function AttendanceExport({ teams }: Props) {
  const today = new Date()
  const [fromDate, setFromDate] = useState(() => localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [toDate, setToDate] = useState(() => localDateValue(today))
  const [teamId, setTeamId] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const exportAttendance = async () => {
    if (!supabase) {
      setError('Attendance export is unavailable right now.')
      return
    }
    if (!fromDate || !toDate || fromDate > toDate) {
      setError('Choose a valid date range.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const XLSX = await import('xlsx')
      const selectedTeams = teamId === 'all' ? teams : teams.filter(team => team.id === teamId)
      const teamIds = selectedTeams.map(team => team.id)
      if (!teamIds.length) throw new Error('Create a team before exporting attendance.')

      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id,group_id,title,type,starts_at,ends_at')
        .in('group_id', teamIds)
        .gte('starts_at', startOfLocalDate(fromDate))
        .lt('starts_at', startOfNextLocalDate(toDate))
        .order('starts_at', { ascending: true })
      if (sessionsError) throw sessionsError
      if (!sessions?.length) throw new Error('No sessions were found for that team and date range.')

      const sessionIds = sessions.map(session => session.id)
      const [membersResult, recordsResult] = await Promise.all([
        supabase.from('group_members').select('group_id,student_id,profiles(full_name)').in('group_id', teamIds),
        supabase.from('attendance_records').select('session_id,student_id,status,recorded_at,reason,profiles!attendance_records_student_id_fkey(full_name)').in('session_id', sessionIds),
      ])
      if (membersResult.error) throw membersResult.error
      if (recordsResult.error) throw recordsResult.error

      const teamNames = new Map(selectedTeams.map(team => [team.id, team.name]))
      const memberNames = new Map<string, string>()
      for (const member of membersResult.data ?? []) {
        const profile = member.profiles as unknown as { full_name: string } | null
        memberNames.set(`${member.group_id}:${member.student_id}`, profile?.full_name ?? 'Player')
      }
      const recordsByKey = new Map<string, (typeof recordsResult.data extends (infer R)[] | null ? R : never)>()
      for (const record of recordsResult.data ?? []) {
        recordsByKey.set(`${record.session_id}:${record.student_id}`, record)
      }

      const detailRows: Array<Array<string | number | Date>> = []
      const counts = new Map<string, { team: string; player: string; total: number; present: number; late: number; absent: number; excused: number; unrecorded: number }>()
      for (const session of sessions) {
        const roster = new Map([...memberNames.entries()].filter(([key]) => key.startsWith(`${session.group_id}:`)).map(([key, name]) => [key.slice(session.group_id.length + 1), name]))
        for (const [key, record] of recordsByKey) {
          if (!key.startsWith(`${session.id}:`)) continue
          const profile = record.profiles as unknown as { full_name: string } | null
          if (!roster.has(record.student_id)) roster.set(record.student_id, profile?.full_name ?? 'Player')
        }
        const sessionRows: Array<Array<string | number | Date>> = []
        for (const [studentId, player] of roster) {
          const record = recordsByKey.get(`${session.id}:${studentId}`)
          const status = (record?.status ?? 'Not recorded') as AttendanceStatus
          const team = teamNames.get(session.group_id) ?? 'Team'
          sessionRows.push([
            localDateValue(new Date(session.starts_at)),
            timeLabel(session.starts_at),
            team,
            session.title,
            session.type,
            player,
            status,
            record?.recorded_at ? new Date(record.recorded_at).toLocaleString() : '',
            record?.reason ?? '',
          ])
          const summaryKey = `${team}:${player}`
          const summary = counts.get(summaryKey) ?? { team, player, total: 0, present: 0, late: 0, absent: 0, excused: 0, unrecorded: 0 }
          summary.total += 1
          if (status === 'Not recorded') summary.unrecorded += 1
          else summary[status] += 1
          counts.set(summaryKey, summary)
        }
        if (sessionRows.length) {
          if (detailRows.length) detailRows.push([])
          detailRows.push(...sessionRows)
        }
      }
      if (!detailRows.length) throw new Error('No rostered players were found for those sessions.')

      const workbook = XLSX.utils.book_new()
      const detailHeaders = ['Date', 'Start time', 'Team', 'Session', 'Type', 'Player', 'Attendance status', 'Recorded at', 'Excusal reason']
      const detailSheet = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows])
      detailSheet['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 36 }]
      detailSheet['!autofilter'] = { ref: `A1:I${detailRows.length + 1}` }
      detailSheet['!freeze'] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Attendance')

      const summaryRows = [...counts.values()].sort((a, b) => a.team.localeCompare(b.team) || a.player.localeCompare(b.player)).map(summary => ({
        Team: summary.team,
        Player: summary.player,
        'Sessions in range': summary.total,
        Present: summary.present,
        Late: summary.late,
        Absent: summary.absent,
        Excused: summary.excused,
        'Not recorded': summary.unrecorded,
        'Attendance rate': summary.present + summary.late + summary.absent + summary.excused
          ? (summary.present + summary.late + summary.excused) / (summary.present + summary.late + summary.absent + summary.excused)
          : '',
      }))
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
      summarySheet['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }]
      summarySheet['!autofilter'] = { ref: `A1:I${Math.max(summaryRows.length + 1, 1)}` }
      summarySheet['!freeze'] = { xSplit: 0, ySplit: 1 }
      for (let row = 2; row <= summaryRows.length + 1; row += 1) {
        const cell = summarySheet[`I${row}`]
        if (cell) cell.z = '0%'
      }
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Player summary')

      XLSX.writeFile(workbook, `attendance_${fromDate}_to_${toDate}.xlsx`, { compression: true })
    } catch (caught) {
      const caughtError = caught && typeof caught === 'object' ? caught as { message?: unknown; code?: unknown; status?: unknown } : null
      const message = typeof caughtError?.message === 'string' ? caughtError.message : caught instanceof Error ? caught.message : ''
      if (caughtError?.status === 540 || caughtError?.code === '540' || /540|project.*paused|project.*inactive/i.test(message)) {
        setError('Attendance data is temporarily unavailable because the database project is paused. Ask the project owner to resume it, then try the export again.')
      } else if (/failed to fetch|networkerror|load failed/i.test(message)) {
        setError('Could not reach attendance data. Check your connection and try again.')
      } else {
        setError(message || 'Could not export attendance. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return <section className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
    <div>
      <h2 className="font-semibold">Export attendance</h2>
      <p className="mt-1 text-sm leading-6 text-muted">Download one Excel workbook with session details and player totals for your selected dates.</p>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <label className="block"><span className="mb-1.5 block text-sm font-medium">Team</span><select className="field min-h-11" value={teamId} onChange={event => setTeamId(event.target.value)}><option value="all">All teams</option>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
      <label className="block"><span className="mb-1.5 block text-sm font-medium">From</span><input className="field min-h-11" type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} required /></label>
      <label className="block"><span className="mb-1.5 block text-sm font-medium">Through</span><input className="field min-h-11" type="date" value={toDate} min={fromDate} max={localDateValue(today)} onChange={event => setToDate(event.target.value)} required /></label>
      <button type="button" className="primary-button min-h-11 w-full" disabled={busy || !teams.length} onClick={() => void exportAttendance()}>{busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />} {busy ? 'Preparing workbook…' : 'Download .xlsx'}</button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </section>
}
