/**
 * DB 에러코드 → 사용자 문구 (API §6)
 *
 * 문구를 컴포넌트에 흩지 않는다. 같은 에러가 보드·상세·리스트 세 곳에서 난다.
 *
 * 문구 규칙 3개
 *  1. 무엇이 잘못됐는지 + 어떻게 하면 되는지를 한 문장에
 *  2. 사과하지 않는다 ("죄송합니다"는 정보가 0이다)
 *  3. DB 코드를 노출하지 않는다
 */

export const MESSAGE: Record<string, string> = {
  INVALID_TRANSITION: '완료 확정은 리뷰를 거쳐야 합니다. 먼저 리뷰중으로 올려주세요',
  FORBIDDEN: '완료 확정은 Lead가 합니다. 리뷰중으로 올려주세요',
  INVALID_ASSIGNEE: '이 사람은 프로젝트 멤버가 아니에요. 먼저 프로젝트에 추가해주세요',
  LAST_LEAD: '프로젝트에는 최소 1명의 Lead가 필요합니다',
  LAST_OWNER: '워크스페이스에는 최소 1명의 Owner가 필요합니다',
  ALREADY_IN_WORKSPACE: '이미 다른 워크스페이스에 참여 중이에요',
  NO_WORKSPACE: '워크스페이스에 먼저 참여해야 해요',
  NOT_AUTHENTICATED: '로그인이 필요해요',
  INVITE_EXPIRED: '초대가 만료되었습니다. 초대한 분에게 다시 요청해주세요',
  INVITE_USED: '이미 사용된 초대예요',
  INVITE_NOT_FOUND: '초대를 찾을 수 없어요. 링크를 다시 확인해주세요',
  REASON_REQUIRED: '반려 사유를 입력해주세요',
  DUE_REQUIRED: '언제까지 하실 건지 정해주세요',
  ALREADY_ASSIGNED: '다른 분이 먼저 가져갔어요',
  NOT_IN_REVIEW: '이미 처리된 업무예요',
  TASK_NOT_FOUND: '업무를 찾을 수 없어요',
  DUPLICATE: '이미 참여 중이거나 초대한 멤버예요',
  UNKNOWN: '잠시 후 다시 시도해주세요',
}

export interface ParsedError {
  code: string
  detail: string
  message: string
}

/**
 * 트리거가 던지는 예외는 `CODE: 설명` 형태다.
 * PostgREST 는 RLS 차단 시 에러가 아니라 0건을 돌려주므로,
 * PGRST116 은 404 로 다뤄야 한다 — 권한 없음을 알리면 리소스 존재가 유출된다 (D-032).
 */
export function parseDbError(e: unknown): ParsedError {
  const err = e as { message?: string; code?: string } | null
  const raw = err?.message ?? ''

  if (err?.code === '23505') {
    return { code: 'DUPLICATE', detail: raw, message: MESSAGE.DUPLICATE }
  }

  const m = /^([A-Z_]+)(?::\s*(.*))?$/s.exec(raw.trim())
  const code = m?.[1] && MESSAGE[m[1]] ? m[1] : 'UNKNOWN'

  return {
    code,
    detail: m?.[2] ?? raw,
    message: MESSAGE[code],
  }
}

/** RLS 가 막아 0건이 돌아온 경우 — 없는 것처럼 다룬다 (D-032) */
export function isNotFound(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'PGRST116'
}
