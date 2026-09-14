// 클로버 충전 상품 — 대표 확정 2026-09-14 「이거 충전식이면 좋을듯해. 클로버 충전 이런거.」
//
// 왜 충전인가 = 구독은 「매달 낼래?」를 묻고 충전은 「이번 것만 할래?」를 묻는다.
// 우리 실측이 AI 1개당 월 2건이라 구독은 안 쓰는 달에도 돈이 나가 해지로 이어진다
// (실제로 구독 1건이 팔리고 바로 해지됐다). 업계(제타·크랙)도 전부 재화가 중심이다.
//
// ⚠️ 화면에는 클로버 개수만 보이면 안 된다. 원화를 항상 같이 적는다.
//    중장년은 「지금 얼마 쓰는지 모르는 상태」를 가장 싫어한다(시장 조사 0914).

/** 클로버 1개의 기준 값(원). 대화 1번에 1개가 든다.
 *  원가는 대화 1번 7.5원, 2027-01 부터 15.1원. 그때도 남도록 잡았다. */
export const CLOVER_UNIT_WON = 20

export interface CloverPack {
    id: string
    /** 고객이 내는 돈 */
    won: number
    /** 받는 클로버 (덤 포함) */
    clovers: number
    /** 화면에 붙일 덤 표시 */
    bonusLabel?: string
}

/** 충전 상품. 많이 살수록 1개당 값이 싸진다. */
export const CLOVER_PACKS: CloverPack[] = [
    { id: 'c5000', won: 5000, clovers: 250 },
    { id: 'c10000', won: 10000, clovers: 550, bonusLabel: '10% 더' },
    { id: 'c30000', won: 30000, clovers: 1800, bonusLabel: '20% 더' },
]

export type PackId = (typeof CLOVER_PACKS)[number]['id']

/** 상품 하나를 찾는다. 값을 묻는 곳은 전부 이 함수를 쓴다. */
export function getPack(id: PackId): CloverPack | undefined {
    return CLOVER_PACKS.find(p => p.id === id)
}

/**
 * 브라우저가 보낸 상품 이름이 우리 것인지 확인한다.
 * 이걸 안 보면 100원을 내고 10만 클로버를 달라고 할 수 있다.
 */
export function isValidPackId(v: unknown): v is PackId {
    return typeof v === 'string' && CLOVER_PACKS.some(p => p.id === v)
}
