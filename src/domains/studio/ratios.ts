// 사진 비율 — 대표 확인 2026-09-14 (보여준 예시가 360×540 = 2:3)
//
// pfpmaker 는 8가지를 고르게 하지만 중장년 대상이라 셋으로 줄였다.
// 고를 것이 많으면 고민만 늘어난다.

export interface Ratio {
    id: string
    label: string
    /** 어디에 쓰는지 */
    use: string
    /** Gemini 에 넘기는 값 */
    value: string
    /** 미리보기 네모의 가로세로 */
    w: number
    h: number
}

// 대표 지시 2026-09-15 = 「틱톡, 인스타그램, 페이스북, 링크드인에 최적화된 종횡비… 이것도 지원해라」
// 숫자(4:5)만 적으면 중장년은 어디에 쓰는지 모른다. 그래서 갈 곳 이름을 같이 적는다.
export const RATIOS: Ratio[] = [
    // 대표 지시 0914 = 「1:1 비율은 밑으로 내려」. 세로가 프로필 사진의 기본이다.
    { id: 'portrait45', label: '4:5', use: '링크드인·인스타 게시물', value: '4:5', w: 4, h: 5 },
    { id: 'portrait23', label: '2:3', use: '상반신 소개 사진', value: '2:3', w: 2, h: 3 },
    { id: 'vertical916', label: '9:16', use: '틱톡·릴스·쇼츠', value: '9:16', w: 9, h: 16 },
    { id: 'landscape169', label: '16:9', use: '유튜브·페이스북 커버', value: '16:9', w: 16, h: 9 },
    { id: 'square', label: '1:1', use: '카톡·인스타·페북 프로필', value: '1:1', w: 1, h: 1 },
]

export const DEFAULT_RATIO_ID = 'portrait45'

export function getRatio(id: string): Ratio | undefined {
    return RATIOS.find(r => r.id === id)
}

export function isValidRatioId(v: unknown): v is string {
    return typeof v === 'string' && RATIOS.some(r => r.id === v)
}
