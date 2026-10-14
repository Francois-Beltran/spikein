import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/providers'

export type Team = { id: string; name: string; created_at: string }
export type TeamSession = { id: string; group_id: string; title: string; type: 'practice'|'game'|'tournament'; starts_at: string; ends_at: string; closed_at: string|null; checkin_override_enabled: boolean }

export function useCoachDashboard() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach-dashboard', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      if (!supabase || !user) throw new Error('Sign in to load the coach dashboard.')
      const { data: groups, error: groupsError } = await supabase.from('groups').select('id,name,created_at').eq('owner_id', user.id).order('created_at', { ascending: true })
      if (groupsError) throw groupsError
      const teams = (groups ?? []) as Team[]
      if (!teams.length) return { teams, members: [] as { group_id:string; student_id:string }[], sessions: [] as TeamSession[], pendingAttendance: 0 }
      const ids = teams.map(team => team.id)
      const [membersResult, sessionsResult] = await Promise.all([
        supabase.from('group_members').select('group_id,student_id').in('group_id', ids),
        supabase.from('sessions').select('id,group_id,title,type,starts_at,ends_at,closed_at,checkin_override_enabled').in('group_id', ids).order('starts_at', { ascending: false }),
      ])
      if (membersResult.error) throw membersResult.error
      if (sessionsResult.error) throw sessionsResult.error
      const sessionIds = (sessionsResult.data ?? []).map(session => session.id)
      let pendingAttendance = 0
      if (sessionIds.length) {
        const { count, error } = await supabase.from('attendance_attempts').select('id', { count: 'exact', head: true }).in('session_id', sessionIds).eq('status', 'pending')
        if (error) throw error
        pendingAttendance = count ?? 0
      }
      return { teams, members: membersResult.data ?? [], sessions: (sessionsResult.data ?? []) as TeamSession[], pendingAttendance }
    },
  })
}
