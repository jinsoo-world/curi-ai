// 웹 회원 탈퇴 화면이 쓰는 판단 (2026-10-02). 브라우저에서 돌아서 delete.ts(서버 전용)를 가져오지 않는다.
// 확인 단어와 안내 글은 앱(CuriAI MyPageL10n)과 서버(delete.ts CONFIRM_WORD)와 같아야 한다. 시험이 지킨다.

export const DELETE_WORD = '탈퇴'
export const DELETE_WARNING = '내가 만든 봇, 대화, 자료가 모두 지워지고 되돌릴 수 없어요. 결제 기록은 법에 따라 5년 보관돼요.'

export function isDeleteWordTyped(s: string): boolean {
    return s.trim() === DELETE_WORD
}

export type DeleteOutcome =
    | { kind: 'done' }
    | { kind: 'active_subscription'; message: string }
    | { kind: 'error'; message: string }

export function interpretDeleteResponse(status: number, data: unknown): DeleteOutcome {
    const d = (data && typeof data === 'object' ? data : {}) as { ok?: unknown; code?: unknown; error?: unknown }
    if (status === 200 && d.ok) return { kind: 'done' }
    const message = typeof d.error === 'string' && d.error ? d.error : '잠시 후 다시 해 주세요.'
    if (status === 409 && d.code === 'ACTIVE_SUBSCRIPTION') return { kind: 'active_subscription', message }
    return { kind: 'error', message }
}
