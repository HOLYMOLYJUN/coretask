import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'
import { useSession } from '@/features/auth/session'
import type { BoardMember } from '@/features/board/use-board'

/**
 * US-602 — 댓글.
 * 알림(담당자 task_commented · 멘션 task_mentioned)은 DB 트리거가 보낸다 —
 * 클라이언트가 할 일이 없다 (tg_comment_created, 05_triggers.sql).
 */

export interface Comment {
  id: string
  user_id: string
  body: string
  mentions: string[]
  created_at: string
  updated_at: string
  author: { name: string } | null
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: qk.comments(taskId),
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select('id, user_id, body, mentions, created_at, updated_at, author:profiles(name)')
        .eq('task_id', taskId)
        .order('created_at') // 시간순 (US-602 AC-4)
      if (error) throw error
      return (data ?? []) as unknown as Comment[]
    },
  })
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * body 에 `@이름` 으로 등장하는 멤버의 id 목록.
 * 이름 바로 뒤가 글자/숫자면 더 긴 다른 이름의 접두어이므로 제외한다
 * (`@김대` 멤버가 `@김대표` 를 가로채지 않게).
 */
export function extractMentions(body: string, members: BoardMember[]): string[] {
  return members
    .filter((m) => new RegExp(`@${escapeRe(m.name)}(?![\\p{L}\\p{N}])`, 'u').test(body))
    .map((m) => m.user_id)
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient()
  const { userId } = useSession()
  return useMutation({
    mutationFn: async (v: { body: string; mentions: string[] }) => {
      const { error } = await supabase.from('comments').insert({
        task_id: taskId,
        user_id: userId!, // RLS: user_id = auth.uid()
        body: v.body,
        mentions: v.mentions,
      })
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.comments(taskId) }),
  })
}

export function useEditComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; body: string; mentions: string[] }) => {
      const { error } = await supabase
        .from('comments')
        .update({ body: v.body, mentions: v.mentions, updated_at: new Date().toISOString() })
        .eq('id', v.id)
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.comments(taskId) }),
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', id)
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.comments(taskId) }),
  })
}
