// 조용한 시간 — 기본 22:00~08:00 (서울). 이 시간엔 푸시·문자를 보류하고 이메일만 보낸다.

const TZ = 'Asia/Seoul'

/** 그 시각의 서울 'HH:MM' */
export function localHHMM(now: Date, timeZone = TZ): string {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
    const h = parts.find(p => p.type === 'hour')?.value ?? '00'
    const m = parts.find(p => p.type === 'minute')?.value ?? '00'
    // 일부 런타임은 자정을 '24' 로 준다
    return `${h === '24' ? '00' : h}:${m}`
}

/** 'HH:MM' / 'HH:MM:SS' → 분. 못 읽으면 null */
function toMinutes(t: string | null | undefined): number | null {
    if (!t) return null
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
    if (!m) return null
    const h = Number(m[1]), mm = Number(m[2])
    if (h > 24 || mm > 59) return null
    return (h % 24) * 60 + mm
}

/**
 * 지금이 조용한 시간인가. 시작은 포함, 끝은 미포함.
 * from == to 면 조용한 시간이 없는 것으로 본다.
 */
export function isQuietHours(now: Date, from: string | null = '22:00', to: string | null = '08:00', timeZone = TZ): boolean {
    const f = toMinutes(from), t = toMinutes(to)
    if (f === null || t === null || f === t) return false
    const cur = toMinutes(localHHMM(now, timeZone))!
    if (f < t) return cur >= f && cur < t          // 13:00~15:00
    return cur >= f || cur < t                     // 22:00~08:00 (자정을 넘는다)
}
