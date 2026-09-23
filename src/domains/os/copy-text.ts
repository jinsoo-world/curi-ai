// 말풍선 복사 시 클립보드에 넣을 평문.

import { stripMdBoldMarkers } from '@/domains/chat/markdown'

/** 마크다운 굵게 표시를 걷어 낸 평문. 칩/@멘션 토큰은 사람이 읽게 그대로 둔다. */
export function plainMessageCopyText(text: string | null | undefined): string {
    if (!text) return ''
    return stripMdBoldMarkers(text).replace(/\u00a0/g, ' ').trim()
}
