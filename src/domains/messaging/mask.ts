// 화면·로그에 받는 곳을 통째로 남기지 않는다. 끝자리만.

/** 01012345678 → 010-****-5678 */
export function maskPhone(raw: string | null | undefined): string {
    if (!raw) return ''
    const d = raw.replace(/[^0-9]/g, '')
    if (d.length < 8) return ''
    return `${d.slice(0, 3)}-****-${d.slice(-4)}`
}

/** jin@mission-driven.kr → ji***@mission-driven.kr */
export function maskEmail(raw: string | null | undefined): string {
    if (!raw || !raw.includes('@')) return ''
    const [id, domain] = raw.split('@')
    return `${id.slice(0, 2)}***@${domain}`
}

/** 로그용: 무엇이든 끝 4자만 */
export function toHint(raw: string | null | undefined): string {
    if (!raw) return ''
    return raw.slice(-4)
}
