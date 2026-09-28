// domains/llm = 모델별 가격표 한 곳 (추정값). 비용 기록(llm_usage.cost_krw)이 이 표로 원화를 계산한다.
//
// ⚠ 추정값이다. 실제 청구는 각 회사 콘솔이 기준이다. 가격이 바뀌면 이 파일 하나만 고친다.
//   출처: 업스테이지 콘솔 문서(2026-09-23 실측, domains/llm/constants.ts 주석),
//         ai.google.dev/gemini-api/docs/pricing (2026-09-24 갱신본, 유료 등급 표준 가격).
//   환율도 추정값이다 (2026-09-28 서울 15:30 매매기준율 1,365.1원을 반올림).

export const USD_TO_KRW_ESTIMATE = 1365

/** 100만 토큰당 달러 (입력, 출력). 출력에는 생각(thinking) 토큰도 들어간다 */
export interface ModelPrice { inputUsd: number; outputUsd: number }

export const MODEL_PRICES_USD_PER_M: Record<string, ModelPrice> = {
    'solar-pro4': { inputUsd: 0.30, outputUsd: 1.20 },
    'solar-mini4': { inputUsd: 0.10, outputUsd: 0.40 },
    // 2026-12-31 까지 할인가. 2027-01-01 부터 입력 1.50, 출력 7.50
    'gemini-3.8-flash': { inputUsd: 0.75, outputUsd: 3.75 },
    'gemini-3.5-flash-lite': { inputUsd: 0.30, outputUsd: 2.50 },
    'gemini-3.1-flash-lite': { inputUsd: 0.25, outputUsd: 1.50 },
    'gemini-embedding-001': { inputUsd: 0.15, outputUsd: 0 },
    // 답 저장소(의미 캐시)에서 꺼낸 답은 모델을 안 부른다
    cache: { inputUsd: 0, outputUsd: 0 },
}

/** 모델 이름 정리: 판 번호가 붙은 이름(solar-pro4-260806, models/…)도 표의 이름으로 */
export function priceKey(model: string): string {
    const m = String(model ?? '').trim().toLowerCase().replace(/^models\//, '')
    if (MODEL_PRICES_USD_PER_M[m]) return m
    const hit = Object.keys(MODEL_PRICES_USD_PER_M).find(k => m.startsWith(`${k}-`))
    return hit ?? m
}

/** 토큰 수로 원화 추정. 표에 없는 모델은 null (모르는 값을 지어내지 않는다) */
export function estimateCostKrw(model: string, inputTokens: number | null | undefined, outputTokens: number | null | undefined): number | null {
    const p = MODEL_PRICES_USD_PER_M[priceKey(model)]
    if (!p) return null
    const usd = ((inputTokens ?? 0) * p.inputUsd + (outputTokens ?? 0) * p.outputUsd) / 1e6
    return Math.round(usd * USD_TO_KRW_ESTIMATE * 10_000) / 10_000
}

/** 임베딩은 토큰 수를 돌려주지 않는다. 한국어는 대략 글자 1개에 토큰 1개로 잡는다 (추정) */
export function estimateTokensFromText(text: string): number {
    return Math.max(1, Math.ceil(String(text ?? '').length))
}

/**
 * 사진 모델 가격 (장당 달러 + 입력 100만 토큰당 달러). 1K(1024px) 한 장 기준 표준 가격.
 * 출처: ai.google.dev/gemini-api/docs/pricing (2026-09-24 갱신본).
 *   gemini-2.5-flash-image 는 2026-10-02 에 종료된다 (구글 가격표 경고). 기록 비교용으로 남긴다.
 *   gemini-3-pro-image-preview 는 2026-06-25 종료 예정이었다. 값은 정식판과 같다.
 */
export interface ImagePrice { perImageUsd: number; inputUsdPerM: number }

export const IMAGE_PRICES_USD: Record<string, ImagePrice> = {
    'gemini-3.1-flash-lite-image': { perImageUsd: 0.0336, inputUsdPerM: 0.25 },
    'gemini-2.5-flash-image': { perImageUsd: 0.039, inputUsdPerM: 0.30 },
    'gemini-3.1-flash-image': { perImageUsd: 0.067, inputUsdPerM: 0.50 },
    'gemini-3-pro-image': { perImageUsd: 0.134, inputUsdPerM: 2.00 },
    'gemini-3-pro-image-preview': { perImageUsd: 0.134, inputUsdPerM: 2.00 },
}

/** 사진 장수와 입력 토큰으로 원화 추정. 표에 없는 모델은 null */
export function estimateImageCostKrw(model: string, images: number, inputTokens?: number | null): number | null {
    const m = String(model ?? '').trim().toLowerCase().replace(/^models\//, '')
    const p = IMAGE_PRICES_USD[m]
    if (!p) return null
    const usd = Math.max(0, images) * p.perImageUsd + (inputTokens ?? 0) * p.inputUsdPerM / 1e6
    return Math.round(usd * USD_TO_KRW_ESTIMATE * 10_000) / 10_000
}
