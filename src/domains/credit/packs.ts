// 클로버 충전 상품 — 대표 확정 2026-09-14 「이거 충전식이면 좋을듯해. 클로버 충전 이런거.」
//
// 왜 충전인가 = 구독은 「매달 낼래?」를 묻고 충전은 「이번 것만 할래?」를 묻는다.
// 우리 실측이 AI 1개당 월 2건이라 구독은 안 쓰는 달에도 돈이 나가 해지로 이어진다
// (실제로 구독 1건이 팔리고 바로 해지됐다). 업계(제타·크랙)도 전부 재화가 중심이다.
//
// ⚠️ 화면에는 클로버 개수만 보이면 안 된다. 원화를 항상 같이 적는다.
//    중장년은 「지금 얼마 쓰는지 모르는 상태」를 가장 싫어한다(시장 조사 0914).

/** 클로버 1개의 기준 값(원). 대화 1번에 1개가 든다.
 *
 *  원가 = 대화 1번 7.5원. **2027-01-01 부터 Gemini 단가가 2배가 돼 15.1원이 된다.**
 *  큰 묶음일수록 할인이 커지므로, 2027년이 오기 전에 이 표를 다시 봐야 한다.
 *  지금은 가장 싼 묶음(5,000개)도 개당 15.6원이라 그때도 아슬아슬하게 남는다. */
export const CLOVER_UNIT_WON = 22

export interface CloverPack {
    id: string
    /** 받는 클로버 */
    clovers: number
    /** 고객이 내는 돈 */
    won: number
}

/**
 * 충전 상품 — 대표 지시 2026-09-14 「500개, 1000개, 2000개 등 옵션 별 할인율 팍팍 매겨」
 *
 * 많이 살수록 클로버 1개 값이 싸진다. 할인율은 화면에서 계산해 보여준다
 * (여기 적어두면 값과 따로 놀다가 어긋난다).
 *
 * 개당 값과 2027년 마진
 *   300개  22.0원 · 31.4%
 *   500개  20.0원 · 24.5%
 *   1,000개 18.0원 · 16.1%
 *   2,000개 16.0원 · 5.6%
 *   5,000개 15.6원 · 3.2%   ← 여기가 마지노선. 더 깎으면 2027년에 적자다.
 */
export const CLOVER_PACKS: CloverPack[] = [
    { id: 'c300', clovers: 300, won: 6600 },
    { id: 'c500', clovers: 500, won: 10000 },
    { id: 'c1000', clovers: 1000, won: 18000 },
    { id: 'c2000', clovers: 2000, won: 32000 },
    { id: 'c5000', clovers: 5000, won: 78000 },
]

/** 가장 작은 묶음보다 몇 % 싼지 (화면 표시용) */
export function discountPercent(pack: CloverPack): number {
    const 기준개당 = CLOVER_PACKS[0].won / CLOVER_PACKS[0].clovers
    const 개당 = pack.won / pack.clovers
    return Math.round((1 - 개당 / 기준개당) * 100)
}

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
