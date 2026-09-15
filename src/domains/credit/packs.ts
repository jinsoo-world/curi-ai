// 클로버 충전 상품 — 대표 확정 2026-09-14 「이거 충전식이면 좋을듯해. 클로버 충전 이런거.」
//
// 왜 충전인가 = 구독은 「매달 낼래?」를 묻고 충전은 「이번 것만 할래?」를 묻는다.
// 우리 실측이 AI 1개당 월 2건이라 구독은 안 쓰는 달에도 돈이 나가 해지로 이어진다
// (실제로 구독 1건이 팔리고 바로 해지됐다). 업계(제타·크랙)도 전부 재화가 중심이다.
//
// ⚠️ 화면에는 클로버 개수만 보이면 안 된다. 원화를 항상 같이 적는다.
//    중장년은 「지금 얼마 쓰는지 모르는 상태」를 가장 싫어한다(시장 조사 0914).

/**
 * 클로버 1개의 속값(원) — **화면에는 쓰지 않는다.**
 *
 * 대표 확정 2026-09-15 「한장 660원이라는 걸 빼. 모르게 해. 500원 문구 다 빼」
 * 고객에게는 「얼마 내고 몇 개 받는지」만 보여준다. 개당 얼마로 환산해 보여주지 않는다.
 * 이 값은 우리가 마진을 셈할 때만 쓴다.
 *
 * 원가 = 대화 1번 7.5원. 2027-01-01 부터 Gemini 단가가 2배가 돼 15.1원이 된다.
 */
export const CLOVER_UNIT_WON = 33

export interface CloverPack {
    id: string
    /** 받는 클로버 */
    clovers: number
    /** 고객이 내는 돈 */
    won: number
}

/**
 * 충전 상품 — 대표 확정 2026-09-15
 * 「300개 9,900원 / 1000개 19,900원 / 3000개 39,900원」
 *
 * 입구를 1만원 아래로 내렸다. 중장년 첫 결제에서 1만 원은 확실한 선이다.
 * 많이 담을수록 개당 값이 내려간다. 할인율(%)만 화면에 보여주고 개당 값은 안 보여준다.
 *
 * 속값과 마진 (대화 기준 원가 지금 7.5원 / 2027-01 부터 15.1원)
 *   300개   33.0원 · 지금 77% · 2027 54%
 *   1,000개 19.9원 · 62% · 24%   ← 40% 싸게
 *   3,000개 13.3원 · 44% · 적자  ← 60% 싸게
 *
 * ⚠️ 3,000개 묶음은 2027-01 에 Gemini 단가가 오르면 대화 기준으로 적자가 된다.
 *    사진은 한 장에 20개를 받으므로 사진만 놓고 보면 사정이 다르지만,
 *    2027년이 오기 전에 이 표를 반드시 다시 본다.
 */
export const CLOVER_PACKS: CloverPack[] = [
    { id: 'c300', clovers: 300, won: 9900 },
    { id: 'c1000', clovers: 1000, won: 19900 },
    { id: 'c3000', clovers: 3000, won: 39900 },
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
