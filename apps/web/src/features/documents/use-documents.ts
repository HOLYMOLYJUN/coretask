import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type Tables, type Enums } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'
import { useSession } from '@/features/auth/session'

/**
 * US-901 — 링크 보관함.
 *
 * ⚠️ 문서를 만들지 않는다 (D-012). content 컬럼이 없는 것이 설계다 —
 * 팀은 이미 Notion 을 쓰고, 여기에 에디터를 만들면 그걸 두 번 쓰게 된다.
 * 이 화면이 답하는 질문은 하나다: **"그 문서 링크 어디 있더라?"**
 */

export type DocSource = Enums['doc_source']
export type Document = Tables['documents']['Row'] & { creator: { name: string } | null }

export const SOURCE_LABEL: Record<DocSource, string> = {
  notion: 'Notion',
  figma: 'Figma',
  gdocs: 'Google Docs',
  other: '기타',
}

/** US-901 AC-2 — URL 에서 출처를 유도한다. 사용자가 고를 수 있지만 기본값이 맞아야 한다 */
export function guessSource(url: string): DocSource {
  const u = url.toLowerCase()
  if (u.includes('notion.so') || u.includes('notion.site')) return 'notion'
  if (u.includes('figma.com')) return 'figma'
  if (u.includes('docs.google.com')) return 'gdocs'
  return 'other'
}

/** 붙여넣기 실수를 여기서 잡는다 — DB 에는 URL 형식 제약이 없다 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withScheme).toString()
  } catch {
    return null
  }
}

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: qk.documents(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<Document[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, creator:profiles(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Document[]
    },
  })
}

export function useAddDocument(projectId: string) {
  const qc = useQueryClient()
  const { userId } = useSession()
  return useMutation({
    mutationFn: async (v: { title: string; url: string; source: DocSource }) => {
      const { error } = await supabase.from('documents').insert({
        project_id: projectId,
        title: v.title,
        url: v.url,
        source: v.source,
        created_by: userId!, // RLS: created_by = auth.uid()
      })
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.documents(projectId) }),
  })
}

/** 제목만 고칠 수 있다 (AC-5). URL 이 바뀌면 그건 다른 문서다 */
export function useRenameDocument(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; title: string }) => {
      const { error } = await supabase.from('documents').update({ title: v.title }).eq('id', v.id)
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.documents(projectId) }),
  })
}

export function useDeleteDocument(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.documents(projectId) }),
  })
}
