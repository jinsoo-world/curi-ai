// 기간 고르기 (한국 시간 기준, 순수 함수). 미리 정한 버튼과 날짜 직접 고르기를 같이 받는다.
import { kstRange } from '@/domains/os/onboarding-admin'
import type { Period } from './query'

export const PRESETS: { days: number; label: string }[] = [
    { days: 1, label: '오늘' },
    { days: 7, label: '7일' },
    { days: 30, label: '30일' },
    { days: 90, label: '90일' },
    { days: 365, label: '1년' },
]

export interface PickedPeriod extends Period { from: string; to: string; days: number; prev: Period }

export function pickPeriod(sp: { days?: string; from?: string; to?: string }, now = new Date()): PickedPeriod {
    const d = Number(sp.days)
    let r: ReturnType<typeof kstRange>
    if (Number.isFinite(d) && d >= 1 && d <= 366) {
        const to = kstRange(null, null, now).to
        const from = new Date(Date.parse(`${to}T00:00:00+09:00`) - (Math.floor(d) - 1) * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10)
        r = kstRange(from, to, now)
    } else if (sp.from || sp.to) {
        r = kstRange(sp.from, sp.to, now)
    } else {
        const to = kstRange(null, null, now).to
        const from = new Date(Date.parse(`${to}T00:00:00+09:00`) - 29 * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10)
        r = kstRange(from, to, now)
    }
    const len = Date.parse(r.endIso) - Date.parse(r.startIso)
    const days = Math.max(1, Math.round(len / 86400_000))
    // 시작이 끝보다 뒤로 입력되면 서로 바꾼다
    if (len <= 0) {
        const f = kstRange(r.to, r.from, now)
        return pickPeriod({ from: f.from, to: f.to }, now)
    }
    return {
        startIso: r.startIso, endIso: r.endIso, from: r.from, to: r.to, days,
        prev: { startIso: new Date(Date.parse(r.startIso) - len).toISOString(), endIso: r.startIso },
    }
}
