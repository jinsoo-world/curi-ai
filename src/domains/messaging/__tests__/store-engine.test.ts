// 메시지엔진 표·칸이 아직 없어도(마이그레이션 20261013 전) 운영 알림이 막히지 않는다
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseStore } from '../store'

const COL_MISSING = { code: '42703', message: 'column message_log.msg_type does not exist' }
const TABLE_MISSING = { code: 'PGRST205', message: "Could not find the table 'public.message_types'" }

function fakeDb(opts: { engine: boolean; legacyCount?: number; count?: number; users?: Record<string, unknown> }) {
    const filters: string[][] = []
    const db = {
        from: (table: string) => {
            const used: string[] = []
            filters.push(used)
            const res = () => {
                if (table === 'message_types' || table === 'message_suppressions') return opts.engine ? { data: table === 'message_types' ? null : [], error: null } : { data: null, error: TABLE_MISSING }
                if (table === 'users') {
                    const wantsNew = used.some(u => u.includes('ad_consent'))
                    if (wantsNew && !opts.engine) return { data: null, error: COL_MISSING }
                    return { data: opts.users ?? null, error: null }
                }
                const touchesNew = used.some(u => /msg_type|is_test|category|dedupe_key/.test(u))
                if (touchesNew && !opts.engine) return { data: null, count: null, error: COL_MISSING }
                return { data: [], count: touchesNew ? (opts.count ?? 0) : (opts.legacyCount ?? 0), error: null }
            }
            const q: Record<string, unknown> = {}
            for (const m of ['select', 'eq', 'is', 'gte', 'not', 'or', 'in', 'limit']) {
                q[m] = (...args: unknown[]) => { used.push(`${m}:${args.map(String).join(',')}`); return q }
            }
            q.maybeSingle = async () => res()
            q.then = (resolve: (v: unknown) => unknown) => resolve(res())
            return q
        },
    }
    return { db: db as unknown as SupabaseClient, filters }
}

describe('메시지엔진 저장소 — 마이그레이션 전 안전', () => {
    it('유형 장부 표가 없으면 기본값을 쓴다(null)', async () => {
        expect(await createSupabaseStore(fakeDb({ engine: false }).db).getTypeSwitch('P001')).toBeNull()
    })
    it('명단 표가 없으면 빈 명단', async () => {
        expect(await createSupabaseStore(fakeDb({ engine: false }).db).findSuppressions(['h'], ['email', 'all'])).toEqual([])
    })
    it('상한 세기: 새 칸이 없으면 옛 칸으로 센다(시험 알림 빼고), 광고는 0', async () => {
        const { db } = fakeDb({ engine: false, legacyCount: 2 })
        const s = createSupabaseStore(db)
        expect(await s.countSent('u1', new Date())).toBe(2)
        expect(await s.countSent('u1', new Date(), 'ad')).toBe(0)
    })
    it('상한 세기: 새 칸이 있으면 새 칸으로', async () => {
        expect(await createSupabaseStore(fakeDb({ engine: true, count: 3 }).db).countSent('u1', new Date())).toBe(3)
    })
    it('겹침: 새 칸이 없으면 모른다(false) — 막지 않는다', async () => {
        expect(await createSupabaseStore(fakeDb({ engine: false }).db).hasSent('u1', 'P001', 'k', null)).toBe(false)
    })
    it('광고 동의: 새 칸이 없으면 옛 marketing_consent 를 네 칸으로 나눠 본다', async () => {
        const p = await createSupabaseStore(fakeDb({ engine: false, users: { email: 'a@b.c', phone: null, marketing_consent: true } }).db).getAdProfile('u1')
        expect(p.consent).toEqual({ app_push: true, web_push: true, email: true, sms: true })
    })
    it('광고 동의: 새 칸이 있으면 채널마다 따로', async () => {
        const p = await createSupabaseStore(fakeDb({ engine: true, users: { email: null, phone: null, ad_consent_app_push: true, ad_consent_email: false, ad_consent_web_push: false, ad_consent_sms: false, ad_consent_updated_at: '2026-10-13T00:00:00Z' } }).db).getAdProfile('u1')
        expect(p.consent).toEqual({ app_push: true, web_push: false, email: false, sms: false })
        expect(p.consentAt).toBe('2026-10-13T00:00:00Z')
    })
})
