/**
 * 초대 링크 전체를 붙여넣어도, 코드만 넣어도 받아준다.
 * 사용자에게 "링크 말고 코드만 넣으세요" 라고 요구하지 않는다.
 */
export function extractInviteToken(input: string): string | null {
  const s = input.trim()
  if (!s) return null

  const m = /\/invite\/([a-f0-9-]{16,})/i.exec(s)
  if (m) return m[1]

  return /^[a-f0-9-]{16,}$/i.test(s) ? s : null
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`
}
