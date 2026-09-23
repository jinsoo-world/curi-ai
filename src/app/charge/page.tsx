import { redirect } from 'next/navigation'
import { safeNextPath } from '@/lib/safe-next'

/**
 * 옛 클로버 충전 화면(/charge) → 요금제 화면(/os/charge)으로 넘긴다.
 *
 * 대표 확정 0923: 요금 구조 = 구독(무료 / 월 29,000원 / 월 99,000원) + 클로버 충전(부가).
 * 사진 도구 여러 곳이 `/charge?back=…` 으로 보내고 있어서, 그 주소들을 하나하나 고치지 않고 여기서 받아 넘긴다.
 * ?back= 은 /os/charge 의 ?from= 으로 옮겨 「돌아가기」가 그대로 된다.
 * 결제 뒤 돌아오는 /charge/done 은 옛 주문(clover_…)이 아직 올 수 있어 그대로 둔다.
 */
export default async function ChargeRedirectPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
    const { back } = await searchParams
    const from = safeNextPath(back ?? null)
    redirect(from ? `/os/charge?from=${encodeURIComponent(from)}` : '/os/charge')
}
