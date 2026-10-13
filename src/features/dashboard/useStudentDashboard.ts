import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../app/providers'
import { supabase } from '../../lib/supabase'
import type { Team, TeamSession } from './useCoachDashboard'

export function useStudentDashboard() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['student-dashboard', user?.id],
    enabled: Boolean(supabase && user),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!supabase || !user) throw new Error('Sign in to load your player dashboard.')

      const { error: claimError } = await supabase.rpc('claim_team_invitations')
      if (claimError) throw claimError

      const { data: memberships, error: membershipsError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('student_id', user.id)
      if (membershipsError) throw membershipsError

      const groupIds = [...new Set((memberships ?? []).map(membership => membership.group_id))]
      if (!groupIds.length) return { teams: [] as Team[], sessions: [] as TeamSession[] }

      const earliest = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const [teamsResult, sessionsResult] = await Promise.all([
        supabase.from('groups').select('id,name,created_at').in('id', groupIds).order('created_at', { ascending: true }),
        supabase.from('sessions').select('id,group_id,title,type,starts_at,ends_at,closed_at').in('group_id', groupIds).gte('ends_at', earliest).order('starts_at', { ascending: true }),
      ])
      if (teamsResult.error) throw teamsResult.error
      if (sessionsResult.error) throw sessionsResult.error

      return {
        teams: (teamsResult.data ?? []) as Team[],
        sessions: ((sessionsResult.data ?? []) as TeamSession[]).filter(session => !session.closed_at),
      }
    },
  })
}
