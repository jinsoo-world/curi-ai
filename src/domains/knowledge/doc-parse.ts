/**
 * 업스테이지 Document Parse Standard 로 파일 읽기 + 월 자료 한도 + 회사 월 비용 상한.
 * 대표 확정값 (2026-09-29): Standard 만(쪽당 0.01달러), 월 상한 50달러, 환율 1,356원.
 * 한도 넘김: 무료는 요금제 안내만, 유료는 클로버(쪽당 6) 또는 요금제 안내.
 * 고객 화면에는 퍼센트만 보입니다. 쪽 수와 클로버 개수는 보이지 않습니다.
 * 기능 스위치: 서버 환경값 DOC_PARSE_ENABLED (1 또는 true 면 켜짐).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CLOVER_COST } from '@/domains/os/usage-config'
import { MAX_PAGES_PER_FILE, monthlyPageLimit, pageUsagePercent, PAGE_WARN_RATIO, type PagePlan } from './page-limits'

export const DOC_PARSE = {
    endpoint: 'https://api.upstage.ai/v1/document-digitization',
    model: 'document-parse',
    mode: 'standard',
    usdPerPage: 0.01,
    ocrUsdPerPage: 0.0015,
    krwPerUsd: 1356,
    monthlyCapUsd: 50,
    // 3쪽 11초 실측. 넘으면 kordoc 로컬로 읽음 (process 창구 최대 300초)
    timeoutMs: 180_000,
    /** 동기 호출 상한 */
    maxSyncPages: 100,
} as const

/** 업스테이지 문서 읽기(Document Parse·OCR) 공통 마감. 마감 없이 부르면 300초 창구가 통째로 끊긴다 */
export function upstageTimeoutSignal(ms: number = DOC_PARSE.timeoutMs): AbortSignal {
    return AbortSignal.timeout(ms)
}

export const DOC_PARSE_KRW_PER_PAGE = Math.round(DOC_PARSE.usdPerPage * DOC_PARSE.krwPerUsd * 100) / 100   // 13.56
export const UPSTAGE_MONTHLY_CAP_KRW = DOC_PARSE.monthlyCapUsd * DOC_PARSE.krwPerUsd                      // 67,800

export function docParseEnabled(env: Record<string, string | undefined> = process.env): boolean {
    const v = String(env.DOC_PARSE_ENABLED ?? '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'on'
}

/** 업스테이지 문서 읽기 한 번의 원화 (쪽 수 x 쪽당 단가) */
export function upstageDocCostKrw(model: string, pages: number | null | undefined): number | null {
    if (typeof pages !== 'number' || !Number.isFinite(pages) || pages < 0) return null
    const usd = model === 'document-parse' ? DOC_PARSE.usdPerPage : model === 'ocr' ? DOC_PARSE.ocrUsdPerPage : null
    if (usd === null) return null
    return Math.round(pages * usd * DOC_PARSE.krwPerUsd * 100) / 100
}

/** 서울 시각 이번 달 1일 0시 */
export function kstMonthStart(now = new Date()): Date {
    const k = new Date(now.getTime() + 9 * 3600_000)
    return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3600_000)
}

export type GateCode = 'doc_space_full' | 'no_clovers' | 'file_too_long'

export type GateDecision =
    | { ok: true; overPages: number; clovers: number }
    | { ok: false; code: GateCode; canPayClovers: boolean }

/**
 * 이 파일을 지금 읽어도 되는지 (순수 함수).
 * overPages 만큼은 클로버로 냅니다 (payClovers 이고 유료일 때만).
 */
export function decidePageGate(i: { plan: PagePlan; usedPages: number; filePages: number; payClovers: boolean }): GateDecision {
    const paid = i.plan !== 'free'
    if (i.filePages > MAX_PAGES_PER_FILE[i.plan]) return { ok: false, code: 'file_too_long', canPayClovers: false }
    const limit = monthlyPageLimit(i.plan)
    const left = Math.max(0, limit - Math.max(0, i.usedPages))
    const over = Math.max(0, i.filePages - left)
    if (over === 0) return { ok: true, overPages: 0, clovers: 0 }
    if (!paid) return { ok: false, code: 'doc_space_full', canPayClovers: false }
    if (!i.payClovers) return { ok: false, code: 'doc_space_full', canPayClovers: true }
    return { ok: true, overPages: over, clovers: over * CLOVER_COST.knowledgePage }
}

/** 올리기 전 막기: 이미 100% 면 클로버 없이는 못 올림 */
export function blockBeforeUpload(i: { plan: PagePlan; usedPages: number; payClovers: boolean }): GateDecision | null {
    const limit = monthlyPageLimit(i.plan)
    if (i.usedPages < limit) return null
    if (i.plan !== 'free' && i.payClovers) return null
    return { ok: false, code: 'doc_space_full', canPayClovers: i.plan !== 'free' }
}

export interface DocSpaceView {
    enabled: boolean
    percent: number
    warn: boolean
    full: boolean
    canPayClovers: boolean
}

export function docSpaceView(plan: PagePlan, usedPages: number, enabled = true): DocSpaceView {
    const percent = pageUsagePercent(usedPages, plan)
    return {
        enabled,
        percent,
        warn: percent >= Math.round(PAGE_WARN_RATIO * 100),
        full: percent >= 100,
        canPayClovers: plan !== 'free',
    }
}

/** 이 사람이 주인인 봇들 (만든 사람 기준 + 마켓에서 데려오지 않은 팀 봇) */
export async function ownedMentorIds(db: SupabaseClient, userId: string): Promise<string[]> {
    const ids = new Set<string>()
    const { data: cp } = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle()
    const creatorId = (cp as { id?: string } | null)?.id
    if (creatorId) {
        const { data } = await db.from('mentors').select('id').eq('creator_id', creatorId)
        for (const r of (data ?? []) as { id: string }[]) ids.add(r.id)
    }
    const { data: tb } = await db.from('team_bots').select('mentor_id, linked_from_market').eq('user_id', userId)
    for (const r of (tb ?? []) as { mentor_id: string; linked_from_market: boolean | null }[]) {
        if (!r.linked_from_market && r.mentor_id) ids.add(r.mentor_id)
    }
    return [...ids]
}

/** 이번 달(서울) 쓴 파일 쪽 수 = 못 읽음이 아닌 자료의 page_count 합. exceptSourceId 는 빼고 셉니다 (다시 읽기 두 번 안 셈) */
/** 기록장 표가 아직 없을 때(마이그레이션 전) 나는 오류인가 */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
    if (!err) return false
    return err.code === '42P01' || err.code === 'PGRST205' || /doc_page_usage/.test(err.message ?? '') && /(does not exist|not find|schema cache)/i.test(err.message ?? '')
}

/**
 * 이번 달(서울) 쓴 파일 쪽 수. 지워지지 않는 기록장(doc_page_usage)에서 셉니다.
 * 자료나 봇을 지워도 줄지 않습니다(대표 승인 0929 「한도 구멍 막아」). 기록장이 아직 없으면 예전 방식.
 */
export async function readMonthlyFilePages(db: SupabaseClient, userId: string, opts: { now?: Date; exceptSourceId?: string } = {}): Promise<number> {
    let lq = db.from('doc_page_usage').select('pages').eq('user_id', userId).gte('created_at', kstMonthStart(opts.now).toISOString())
    if (opts.exceptSourceId) lq = lq.neq('source_id', opts.exceptSourceId)
    const { data: ld, error: le } = await lq
    if (!le) return ((ld ?? []) as { pages: number | null }[]).reduce((s, r) => s + (r.pages ?? 0), 0)
    if (!isMissingTable(le)) throw new Error(le.message)
    return readMonthlyFilePagesFromSources(db, userId, opts)
}

/** 예전 방식: 남아 있는 자료의 page_count 합 (지우면 줄어드는 구멍이 있음. 기록장 없을 때만) */
export async function readMonthlyFilePagesFromSources(db: SupabaseClient, userId: string, opts: { now?: Date; exceptSourceId?: string } = {}): Promise<number> {
    const ids = await ownedMentorIds(db, userId)
    if (ids.length === 0) return 0
    let q = db.from('knowledge_sources')
        .select('page_count')
        .in('mentor_id', ids)
        .gte('created_at', kstMonthStart(opts.now).toISOString())
        .neq('processing_status', 'failed')
        .not('page_count', 'is', null)
    if (opts.exceptSourceId) q = q.neq('id', opts.exceptSourceId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return ((data ?? []) as { page_count: number | null }[]).reduce((s, r) => s + (r.page_count ?? 0), 0)
}

/** 이번 달(서울) 업스테이지 문서 읽기 원화 합 */
export async function readMonthlyUpstageDocKrw(db: SupabaseClient, now = new Date()): Promise<number> {
    const { data, error } = await db.from('llm_usage')
        .select('cost_krw')
        .eq('provider', 'upstage')
        .eq('kind', 'ocr')
        .gte('created_at', kstMonthStart(now).toISOString())
    if (error) throw new Error(error.message)
    return ((data ?? []) as { cost_krw: number | null }[]).reduce((s, r) => s + Number(r.cost_krw ?? 0), 0)
}

/** 회사 월 상한 안인가. 읽기 실패면 안전하게 「넘음」으로 봅니다 */
export async function underUpstageCap(db: SupabaseClient, addPages = 0, now = new Date()): Promise<boolean> {
    try {
        const spent = await readMonthlyUpstageDocKrw(db, now)
        return spent + addPages * DOC_PARSE_KRW_PER_PAGE <= UPSTAGE_MONTHLY_CAP_KRW
    } catch (e) {
        console.warn('[doc-parse] 월 비용 읽기 실패, 상한 넘음으로 봄:', e instanceof Error ? e.message : e)
        return false
    }
}

/** Document Parse 응답에서 글 꺼내기 (마크다운 먼저) */
export function docParseText(body: unknown): string {
    const b = (body ?? {}) as { content?: { markdown?: string; text?: string; html?: string }; elements?: { content?: { markdown?: string; text?: string } }[] }
    const md = b.content?.markdown?.trim()
    if (md) return md
    const tx = b.content?.text?.trim()
    if (tx) return tx
    if (Array.isArray(b.elements)) {
        const parts = b.elements.map(el => el.content?.markdown || el.content?.text || '').filter(Boolean)
        if (parts.length) return parts.join('\n\n').trim()
    }
    const html = b.content?.html
    if (html) return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\n{3,}/g, '\n\n').trim()
    return ''
}

export interface DocParseResult {
    ok: boolean
    text: string
    pages: number | null
    status?: number
    error?: string
    body?: unknown
}

/** 업스테이지 Document Parse Standard 한 번 (동기, 100쪽까지). 절대 던지지 않습니다 */
export async function callDocumentParse(file: Blob, fileName: string, apiKey = process.env.UPSTAGE_API_KEY): Promise<DocParseResult> {
    if (!apiKey) return { ok: false, text: '', pages: null, error: 'no_key' }
    try {
        const fd = new FormData()
        fd.append('document', file, fileName)
        fd.append('model', DOC_PARSE.model)
        fd.append('mode', DOC_PARSE.mode)
        fd.append('ocr', 'auto')
        fd.append('output_formats', '["markdown"]')
        const res = await fetch(DOC_PARSE.endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: fd,
            signal: upstageTimeoutSignal(),
        })
        if (!res.ok) {
            const t = await res.text().catch(() => '')
            return { ok: false, text: '', pages: null, status: res.status, error: t.slice(0, 200) }
        }
        const body = await res.json()
        const pages = (body as { usage?: { pages?: unknown } })?.usage?.pages
        return { ok: true, text: docParseText(body), pages: typeof pages === 'number' ? pages : null, status: res.status, body }
    } catch (e) {
        return { ok: false, text: '', pages: null, error: e instanceof Error ? e.message : String(e) }
    }
}

/** 클로버 빼기 (DB 함수 하나로 잔액 확인, 차감, 거래 기록. 모자라면 false) */
export async function spendDocClovers(db: SupabaseClient, userId: string, amount: number, mentorId: string): Promise<boolean> {
    if (amount <= 0) return true
    const { data, error } = await db.rpc('spend_clovers_for_chat', { p_user: userId, p_amount: amount, p_mentor: mentorId, p_desc: '자료 넣기 이어서 읽기' })
    if (error) { console.error('[doc-parse] 클로버 차감 실패:', error.message); return false }
    return typeof data === 'number' && data >= 0
}

/** 읽기에 실패했을 때 뺀 클로버를 되돌립니다 (기술 오류 보전) */
export async function refundDocClovers(db: SupabaseClient, userId: string, amount: number): Promise<void> {
    if (amount <= 0) return
    try {
        const { data: left } = await db.rpc('클로버_더하기', { 그사람: userId, 더할값: amount })
        if (typeof left === 'number' && left >= 0) {
            await db.from('credit_transactions').insert({ user_id: userId, amount, balance_after: left, type: 'chat_usage', description: '자료를 못 읽어 되돌림' })
        }
    } catch (e) {
        console.error('[doc-parse] 클로버 되돌리기 실패:', e instanceof Error ? e.message : e)
    }
}

/** 화면 문구 (쪽 수, 클로버 개수 없이) */
export const DOC_SPACE_COPY = {
    fullFree: '이 파일은 이번 달 무료로 넣을 수 있는 양보다 커요. 유료로 바꾸시면 훨씬 많은 자료를 넣고, 봇이 더 정확하게 답해요.',
    fullPaid: '이번 달 자료 넣기를 100% 쓰셨어요. 이 파일은 모아 둔 대화로 이어서 넣거나 요금제를 올려서 넣을 수 있어요.',
    noClovers: '모아 둔 대화가 모자라요. 요금제를 올리시면 이어서 넣을 수 있어요.',
    tooLong: '파일이 너무 길어요. 나눠서 올려 주세요.',
    cap: '지금 자료를 읽는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.',
    cloverNote: '이 파일을 넣는 데 모아 둔 대화가 쓰여요.',
} as const
