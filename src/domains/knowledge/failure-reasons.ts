/**
 * 자료 실패 이유 코드 (knowledge_sources.failure_reason).
 * 설계 문서 4-1. DB 는 200자까지 글을 받지만 여기 코드만 씁니다.
 */
export const FAILURE_REASONS = {
    link_only_platform: '이 사이트는 링크만 저장할 수 있어요',
    empty_content: '읽을 글이 없었어요',
    timeout: '읽는 데 시간이 너무 오래 걸렸어요',
    scanned_no_text: '글자가 없는 파일이에요. 캡처로 넣어 주세요',
    password_protected: '암호가 걸린 파일이에요',
    file_too_large: '파일이 너무 커요',
    unsupported_format: '아직 읽을 수 없는 형식이에요',
    monthly_page_limit: '이번 달 자료 넣기를 다 썼어요',
    company_cap_wait: '지금 자료를 읽는 사람이 많아요. 잠시 뒤 다시 시도해 주세요',
    chunk_save_failed: '저장하다 문제가 생겼어요. 다시 시도해 주세요',
    unknown: '읽지 못했어요. 다시 시도해 주세요',
} as const

export type FailureReason = keyof typeof FAILURE_REASONS

export function isFailureReason(v: unknown): v is FailureReason {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FAILURE_REASONS, v)
}

/** 화면에 보일 한 줄. 모르는 코드면 기본 문구 */
export function failureMessage(code: string | null | undefined): string | null {
    if (!code) return null
    return isFailureReason(code) ? FAILURE_REASONS[code] : FAILURE_REASONS.unknown
}
