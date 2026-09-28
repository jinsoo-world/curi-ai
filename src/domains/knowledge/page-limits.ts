/**
 * 요금제별 월 파일 쪽 한도 (대표 승인 2026-09-29).
 * 파일(PDF, 워드, 한글, 슬라이드, 엑셀) 쪽만 셉니다. SNS 주소, 링크, 붙여넣기, 캡처는 세지 않습니다.
 * 사용량은 knowledge_sources.page_count 합계로 셉니다. 고객 화면에는 퍼센트만 보입니다.
 */
export type PagePlan = 'free' | 'basic' | 'pro'

export const MONTHLY_FILE_PAGES: Record<PagePlan, number> = {
    free: 10,
    basic: 100,
    pro: 300,
}

/** 파일 하나 최대 쪽 수 */
export const MAX_PAGES_PER_FILE: Record<PagePlan, number> = {
    free: 30,
    basic: 100,
    pro: 100,
}

/** 이 비율부터 미리 알림 */
export const PAGE_WARN_RATIO = 0.8

export function monthlyPageLimit(plan: string | null | undefined): number {
    return MONTHLY_FILE_PAGES[(plan as PagePlan)] ?? MONTHLY_FILE_PAGES.free
}

/** 0 ~ 100 정수 퍼센트 */
export function pageUsagePercent(used: number, plan: string | null | undefined): number {
    const limit = monthlyPageLimit(plan)
    if (limit <= 0) return 100
    return Math.max(0, Math.min(100, Math.round((Math.max(0, used) / limit) * 100)))
}
