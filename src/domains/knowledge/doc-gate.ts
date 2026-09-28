/**
 * 월 자료 한도 문지기 (process 창구가 업스테이지를 부르기 전에 한 번 부릅니다).
 * 쪽은 처리 시작 때 page_count 에 잡아 두고, 성공하면 그대로, 실패하면 자료가 「못 읽음」이 되어 빠집니다.
 * 클로버로 이어 넣었다가 못 읽으면 클로버를 되돌립니다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FailureReason } from './failure-reasons'
import { countFilePages } from './doc-pages'
import {
    decidePageGate, docSpaceView, readMonthlyFilePages, spendDocClovers, refundDocClovers,
    DOC_SPACE_COPY, isMissingTable, type DocSpaceView, type GateCode,
} from './doc-parse'
import { readPlanId } from '@/domains/os/usage-db'
import type { PagePlan } from './page-limits'

export interface PageReservation {
    pages: number
    clovers: number
    /** 실제 쪽 수가 더 적으면 줄입니다 (더 많으면 회사가 부담, 고객에게 더 빼지 않음) */
    settle: (actualPages: number) => Promise<void>
    /** 실패: 뺀 클로버 되돌림 (쪽은 자료가 「못 읽음」이라 자동으로 빠짐) */
    release: () => Promise<void>
    /** 성공 뒤 화면용 퍼센트 */
    view: () => Promise<DocSpaceView>
}

export type ReserveResult =
    | { ok: true; reservation: PageReservation | null }
    | { ok: false; reason: FailureReason; code: GateCode; message: string; canPayClovers: boolean; status: number }

export function gateMessage(code: GateCode, plan: PagePlan): string {
    if (code === 'file_too_long') return DOC_SPACE_COPY.tooLong
    if (code === 'no_clovers') return DOC_SPACE_COPY.noClovers
    return plan === 'free' ? DOC_SPACE_COPY.fullFree : DOC_SPACE_COPY.fullPaid
}

export async function reserveFilePages(i: {
    db: SupabaseClient
    userId: string
    mentorId: string
    sourceId: string
    ext: string
    buf: Buffer
    payClovers: boolean
}): Promise<ReserveResult> {
    const count = await countFilePages(i.ext, i.buf)
    if (!count) return { ok: true, reservation: null }   // 세지 않는 파일 (txt, md, vtt)

    const plan = await readPlanId(i.db, i.userId) as PagePlan
    const used = await readMonthlyFilePages(i.db, i.userId, { exceptSourceId: i.sourceId })
    const d = decidePageGate({ plan, usedPages: used, filePages: count.pages, payClovers: i.payClovers })
    if (!d.ok) {
        return {
            ok: false,
            reason: d.code === 'file_too_long' ? 'file_too_large' : 'monthly_page_limit',
            code: d.code, message: gateMessage(d.code, plan), canPayClovers: d.canPayClovers,
            status: d.code === 'file_too_long' ? 400 : 402,
        }
    }
    if (d.clovers > 0) {
        const paid = await spendDocClovers(i.db, i.userId, d.clovers, i.mentorId)
        if (!paid) {
            return { ok: false, reason: 'monthly_page_limit', code: 'no_clovers', message: gateMessage('no_clovers', plan), canPayClovers: true, status: 402 }
        }
    }

    await i.db.from('knowledge_sources').update({ page_count: count.pages }).eq('id', i.sourceId).eq('mentor_id', i.mentorId)
    await writeLedger(i.db, { source_id: i.sourceId, user_id: i.userId, mentor_id: i.mentorId, pages: count.pages })
    console.log('[doc-gate] 쪽 잡음:', count.pages, count.method, 'plan', plan, 'clovers', d.clovers)

    let pages = count.pages
    let clovers = d.clovers
    return {
        ok: true,
        reservation: {
            get pages() { return pages },
            get clovers() { return clovers },
            settle: async (actual: number) => {
                if (Number.isFinite(actual) && actual > 0 && actual < pages) {
                    pages = Math.round(actual)
                    await i.db.from('knowledge_sources').update({ page_count: pages }).eq('id', i.sourceId).eq('mentor_id', i.mentorId)
                    await i.db.from('doc_page_usage').update({ pages }).eq('source_id', i.sourceId)
                }
            },
            release: async () => {
                await i.db.from('doc_page_usage').delete().eq('source_id', i.sourceId)   // 못 읽으면 안 셈
                if (clovers > 0) { await refundDocClovers(i.db, i.userId, clovers); clovers = 0 }
            },
            view: async () => docSpaceView(plan, await readMonthlyFilePages(i.db, i.userId)),
        },
    }
}

/** 기록장에 적기. 표가 아직 없으면(마이그레이션 전) 조용히 넘어갑니다. 다른 오류는 로그만 */
export async function writeLedger(db: SupabaseClient, row: { source_id: string; user_id: string; mentor_id: string; pages: number }): Promise<void> {
    const { error } = await db.from('doc_page_usage').upsert(row, { onConflict: 'source_id' })
    if (error && !isMissingTable(error)) console.warn('[doc-gate] 기록장 적기 실패:', error.message)
}
