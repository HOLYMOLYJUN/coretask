/**
 * 업로드 전 리사이즈 (08_storage.sql 주석).
 * 아바타는 최대 28px 로 렌더되는데 폰 사진 4MB 가 그대로 올라오면
 * 보드 로딩마다 그걸 다 받는다. 버킷의 512KB 상한은 2차 방어선일 뿐이다.
 */
export async function resizeToWebp(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file)

  // 짧은 변을 기준으로 정사각형 중앙을 잘라낸다 — 원형 마스크에 맞춘다
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 처리할 수 없어요')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지를 변환하지 못했어요'))),
      'image/webp',
      0.85,
    )
  })
}
