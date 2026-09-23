// 대화 말풍선 옆 시각 표기. Grok 처럼 「오후 5:28」 / 「오전 9:05」(Asia/Seoul).

import { OS_TIMEZONE } from './settings'

/** 메시지 createdAt(ISO) → 「오후 5:28」. 없거나 깨지면 빈 문자열(그 줄은 시각 칸만 비운다). */
export function formatMessageTime(
    iso: string | null | undefined,
    timeZone: string = OS_TIMEZONE,
): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('ko-KR', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone,
    })
}
