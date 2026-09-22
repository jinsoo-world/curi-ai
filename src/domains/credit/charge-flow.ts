// 클로버 충전 화면이 같이 쓰는 「셈만 하는」 함수들. 브라우저·DB 를 만지지 않아서 시험이 쉽다.
// 옛 충전 화면(/charge)과 봇 팀 다크 화면(/os/charge)이 이 표 하나를 본다.
import { CLOVER_PACKS, discountPercent, type CloverPack } from './packs'
import { safeNextPath } from '@/lib/safe-next'

/** 잔량 경고선. 이 개수 이하면 「거의 다 떨어졌어요」를 보인다 */
export const LOW_CLOVER_LINE = 20

/** 결제 끝나고 돌아갈 곳을 모르면 여기로 */
export const DEFAULT_RETURN_PATH = '/os'

/** 돌아갈 곳을 브라우저(sessionStorage)에 잠깐 적어 두는 열쇠. 토스 결제창을 거쳐 돌아와도 남는다 */
export const OS_RETURN_KEY = 'curi_os_back'

/** 화면에 그릴 상품 한 줄. 원화 환산(1개 몇 원)은 넣지 않는다(대표 확정 0915) */
export interface PackRow {
    id: string
    clovers: number
    won: number
    /** 가장 작은 묶음보다 몇 % 싼지. 0 이면 배지를 안 그린다 */
    discount: number
    /** 가장 많이 고르는 묶음(할인이 가장 큰 것). 처음 골라 둔다 */
    recommended: boolean
}

/** 상품 표 → 화면 줄. 순서는 표 그대로(작은 것부터) */
export function packRows(packs: CloverPack[] = CLOVER_PACKS): PackRow[] {
    const 최대할인 = Math.max(...packs.map(discountPercent))
    return packs.map(p => ({
        id: p.id,
        clovers: p.clovers,
        won: p.won,
        discount: discountPercent(p),
        recommended: 최대할인 > 0 && discountPercent(p) === 최대할인,
    }))
}

/** 잔량이 경고선 이하인가. 잔량을 아직 못 읽었으면(null) 경고하지 않는다 */
export function isLowClover(balance: number | null | undefined, line: number = LOW_CLOVER_LINE): boolean {
    if (balance === null || balance === undefined || Number.isNaN(balance)) return false
    return balance <= line
}

/**
 * 돌아갈 주소 고르기. 우리 사이트 안의 경로만 받고, 아니면 기본 주소.
 * ?from=//다른사이트 같은 것을 끼워 넣어도 밖으로 튕기지 않는다.
 */
export function resolveReturnPath(raw: string | null | undefined, fallback: string = DEFAULT_RETURN_PATH): string {
    return safeNextPath(raw) ?? fallback
}

/** 충전 주문번호 — 어떤 상품인지 알아볼 수 있게 접두사를 붙인다 (옛 /charge 와 같은 모양) */
export function makeChargeOrderId(packId: string, now: number = Date.now(), random: string = Math.random().toString(36).slice(2, 8)): string {
    return `clover_${packId}_${now}_${random}`
}

/** 토스가 결제 뒤 돌려보낼 주소 두 개 */
export function chargeReturnUrls(origin: string, donePath: string, failPath: string, packId: string) {
    return {
        successUrl: `${origin}${donePath}?packId=${encodeURIComponent(packId)}`,
        failUrl: `${origin}${failPath}?failed=1`,
    }
}
