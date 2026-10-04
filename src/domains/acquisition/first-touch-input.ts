// 브라우저가 보낸 「처음 들어온 길」을 믿을 만한 모양으로 다듬는다 (순수 함수).
import { detectClientContext } from '@/domains/os/onboarding'

export interface CleanFirstTouch {
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
    referrer: string | null; ref_code: string | null; landing_path: string | null
    device: string | null; os: string | null; app_shell: string | null
    /** 브라우저가 처음 들어온 순간으로 적은 시각 (ISO). 못 믿으면 지금 */
    at: string
}

const cut = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const oneOf = (v: unknown, list: readonly string[]): string | null => (typeof v === 'string' && list.includes(v) ? v : null)

export function sanitizeFirstTouch(raw: unknown, ua: string | null | undefined, now = new Date()): CleanFirstTouch | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    // 기기: 브라우저가 처음 들어올 때 적은 값을 우선. 없으면 이번 요청의 브라우저 정보로 가른다(같은 브라우저)
    const fallback = detectClientContext(ua || '', null)
    const device = oneOf(r.device, ['mobile', 'pc']) ?? fallback.device
    const os = oneOf(r.os, ['ios', 'android', 'windows', 'mac', 'linux', 'other']) ?? fallback.os
    const app_shell = oneOf(r.app_shell, ['ios_app', 'android_app', 'web']) ?? fallback.app_shell
    let at = now.toISOString()
    if (typeof r.at === 'string') {
        const t = Date.parse(r.at)
        // 미래이거나 2026-01-01 이전이면 믿지 않는다
        if (Number.isFinite(t) && t <= now.getTime() + 60_000 && t >= Date.parse('2026-01-01T00:00:00Z')) at = new Date(t).toISOString()
    }
    return {
        utm_source: cut(r.utm_source, 60), utm_medium: cut(r.utm_medium, 60), utm_campaign: cut(r.utm_campaign, 80),
        referrer: cut(r.referrer, 200), ref_code: cut(r.ref_code, 40), landing_path: cut(r.path, 200),
        device, os, app_shell, at,
    }
}
