import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/** M2~M4 에서 채울 자리 */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      <EmptyState
        icon={<Construction size={32} strokeWidth={1.5} />}
        title="아직 만들지 않았어요"
        description="M1 은 배정 보드까지입니다"
      />
    </div>
  )
}
