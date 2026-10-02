// domains/messaging — 봇이 남에게 보내는 메일 잠금 (/api/os/messages/send 전용, 1002 설계 8번).
//
// 왜: 큐리AI 메일은 큐리어스와 같은 AWS SES 계정으로 나간다. 한 사람이 단체·광고 메일을 돌리면
//     반송·스팸신고가 쌓여 SES 가 계정을 멈추고, 그러면 큐리어스 메일까지 같이 끊긴다(9/1 반송 24.6% 사고).
//
// 이 잠금은 승인 카드 확인을 통과한 요청만 부른다(라우트가 먼저 본다). 카드 없이 반송 명단을 떠보지 못하게.
//
// 순서 (하나라도 걸리면 보내지 않는다):
//  1. 끄는 스위치      : OS_OUTBOUND_MAIL_ENABLED 가 0·false·off 면 전부 멈춤. 값이 없으면 지금처럼 켜짐
//  2. 한 번에 한 분    : 받는 사람 둘 이상이면 거절
//  3. 광고·단체 표시   : (광고)·(AD)·수신거부·unsubscribe 같은 표시가 있으면 거절(HTML 태그를 벗기고 본다)
//  4. 하루 상한(서울)  : 1인 하루 20통, 새로운 받는 분 5명
//     동시에 들어온 요청이 둘 다 통과하지 않게, 먼저 「보내는 중(pending)」 줄을 적고 나서 센다.
//     서로의 줄이 보이니 넘치는 일은 없고, 아주 드물게 둘 다 막힐 수는 있다(덜 보내는 쪽).
//     pending 상태가 DB 에 아직 없으면(마이그레이션 전) 예약 없이 센다. 그때는 동시 요청 몇 통이 넘칠 수 있다
//     (분당 5번 제한이 있어 몇 통 수준).
//  5. 반송·거부 명단   : SES 계정 명단(반송·스팸신고)에 있으면 거절. 확인 못 하면 보내지 않는다

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuppressedInSes } from './drivers/email'
import { toHint } from './mask'

export const DAILY_MAIL_CAP = 20
export const DAILY_NEW_RECIPIENT_CAP = 5

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
/** 광고·단체 메일에만 붙는 표시. 1:1 안내 메일에는 들어갈 일이 없다 */
const BULK_MARKERS = [
    /[(\[]\s*광\s*고\s*[)\]]/,
    /[(\[]\s*ad\s*[)\]]/i,
    /advertisement/i,
    /수신\s*거부/,
    /unsubscribe/i,
    /opt[\s-]?out/i,
]

const COLUMN_MISSING = new Set(['42703', 'PGRST204'])
const CHECK_VIOLATION = '23514'

export type SentRow = { id: string; toHash: string | null }

export interface OutboundGuardStore {
    /** 서울 오늘 0시(sinceIso) 뒤로 이 사람이 남에게 보낸(보냄·실패·보내는 중) 메일. 지문을 모르면 toHash = null */
    listSentToday(userId: string, sinceIso: string): Promise<SentRow[]>
    /** 「보내는 중」 줄을 먼저 적는다. 적을 수 없으면(pending 상태가 아직 없음) null */
    reserve(r: { userId: string; permissionRequestId: string; toHash: string; toHint: string }): Promise<string | null>
    /** 보내는 중 줄을 지운다(보낸 뒤의 최종 기록은 관문이 따로 적는다) */
    release(id: string | null): Promise<void>
    /** 반송·스팸신고·거부 명단에 있으면 true. 확인 자체가 안 되면 던진다 */
    isSuppressed(email: string): Promise<boolean>
}

export interface GuardInput {
    userId: string
    permissionRequestId: string
    to: unknown
    subject?: unknown
    body?: unknown
    html?: unknown
}

export type GuardResult =
    | { ok: true; toHash: string; reservationId: string | null }
    | { ok: false; status: number; error: string }

export function normalizeEmail(raw: string): string {
    return raw.trim().toLowerCase()
}

/** 받는 주소 지문(sha256). 기록에는 주소 대신 이것만 남긴다 */
export function hashRecipient(raw: string): string {
    return createHash('sha256').update(normalizeEmail(raw)).digest('hex')
}

/** 서울 기준 오늘 0시 (UTC 시각으로) */
export function kstDayStart(now: Date): Date {
    const KST = 9 * 60 * 60 * 1000
    const k = new Date(now.getTime() + KST)
    return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST)
}

/** 끄는 스위치: 0 · false · off (앞뒤 빈칸·대소문자 무시) 이면 꺼짐 */
export function mailKillSwitchOff(v: string | undefined): boolean {
    return ['0', 'false', 'off'].includes((v ?? '').trim().toLowerCase())
}

/** 사람 눈에 보이는 글: HTML 태그를 벗기고 &amp; 같은 표기를 푼다 */
export function visibleText(s: string): string {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    const cp = (n: number) => (Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '')
    return s
        .replace(/<[^>]*>/g, '')
        .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => cp(parseInt(h, 16)))
        .replace(/&#(\d+);?/g, (_, d: string) => cp(parseInt(d, 10)))
        .replace(/&([a-z]+);/gi, (m, n: string) => named[n.toLowerCase()] ?? m)
}

/** 반송 명단에서 찾아볼 주소: 소문자 · 원래 모양 · +꼬리표 뗀 것 (겹치면 한 번) */
export function suppressionCandidates(raw: string): string[] {
    const original = raw.trim()
    const lower = original.toLowerCase()
    const [local, domain] = lower.split('@')
    const untagged = local.includes('+') ? `${local.split('+')[0]}@${domain}` : lower
    return [...new Set([lower, original, untagged])]
}

const fail = (status: number, error: string): GuardResult => ({ ok: false, status, error })

export async function guardOutboundEmail(
    input: GuardInput,
    deps: { store: OutboundGuardStore; now?: () => Date; env?: Record<string, string | undefined> },
): Promise<GuardResult> {
    const env = deps.env ?? process.env
    const now = deps.now ?? (() => new Date())
    const { store } = deps

    // 1. 끄는 스위치
    if (mailKillSwitchOff(env.OS_OUTBOUND_MAIL_ENABLED)) {
        return fail(503, '지금은 봇이 다른 분께 메일을 보내는 기능을 잠시 멈춰 두었어요. 나중에 다시 해 주세요.')
    }

    // 2. 한 번에 한 분
    const list = Array.isArray(input.to) ? input.to : [input.to]
    if (list.length !== 1 || typeof list[0] !== 'string') {
        return fail(400, '메일은 한 번에 한 분에게만 보낼 수 있어요.')
    }
    const to = list[0].trim()
    if (/[,;\s]/.test(to) || (to.match(/@/g) ?? []).length > 1) {
        return fail(400, '메일은 한 번에 한 분에게만 보낼 수 있어요.')
    }
    if (!EMAIL_RE.test(to)) return fail(400, '받는 이메일 주소가 없거나 모양이 이상해요.')

    // 3. 광고·단체 표시
    const text = [input.subject, input.body, input.html]
        .filter((v): v is string => typeof v === 'string')
        .map(visibleText)
        .join('\n')
    if (BULK_MARKERS.some(re => re.test(text))) {
        return fail(400, '광고나 여러 사람에게 돌리는 안내 메일은 보낼 수 없어요. 한 분께 드리는 안내만 보낼 수 있어요.')
    }

    // 4. 하루 상한: 먼저 보내는 중 줄을 적고 센다(동시 요청끼리 서로 보이게)
    const toHash = hashRecipient(to)
    let reservationId: string | null = null
    const refuse = async (status: number, error: string): Promise<GuardResult> => {
        await store.release(reservationId).catch(e => console.warn('[outbound-guard] 예약 풀기 실패', e instanceof Error ? e.message : e))
        return fail(status, error)
    }
    let rows: SentRow[]
    try {
        reservationId = await store.reserve({ userId: input.userId, permissionRequestId: input.permissionRequestId, toHash, toHint: toHint(to) })
        rows = (await store.listSentToday(input.userId, kstDayStart(now()).toISOString())).filter(r => r.id !== reservationId)
    } catch (e) {
        console.warn('[outbound-guard] 오늘 보낸 수를 못 셌다', e instanceof Error ? e.message : e)
        return refuse(503, '오늘 보낸 메일 수를 확인하지 못해 보내지 않았어요. 잠시 뒤 다시 해 주세요.')
    }
    if (rows.length >= DAILY_MAIL_CAP) {
        return refuse(429, `오늘 보낼 수 있는 메일 ${DAILY_MAIL_CAP}통을 다 썼어요. 내일 다시 보내 주세요.`)
    }
    // 지문을 모르면(칸이 없거나 옛 줄) 한 줄 = 새 사람 한 명으로 친다. 덜 보내는 쪽으로 틀린다
    const known = new Set(rows.map(r => r.toHash).filter((h): h is string => !!h))
    const distinct = known.size + rows.filter(r => !r.toHash).length
    if (!known.has(toHash) && distinct >= DAILY_NEW_RECIPIENT_CAP) {
        return refuse(429, `오늘은 새로운 분께 보낼 수 있는 ${DAILY_NEW_RECIPIENT_CAP}명을 다 채웠어요. 오늘 이미 보낸 분께는 더 보낼 수 있고, 새로운 분께는 내일 보내 주세요.`)
    }

    // 5. 반송·거부 명단 (소문자 · 원래 모양 · +꼬리표 뗀 주소 전부)
    try {
        for (const addr of suppressionCandidates(to)) {
            if (await store.isSuppressed(addr)) {
                return refuse(403, '이 주소는 예전에 메일이 되돌아왔거나 받지 않겠다고 하신 주소라 보낼 수 없어요.')
            }
        }
    } catch (e) {
        console.warn('[outbound-guard] 반송 명단 확인 실패', e instanceof Error ? e.message : e)
        return refuse(503, '받는 주소를 확인하지 못해 보내지 않았어요. 잠시 뒤 다시 해 주세요.')
    }

    return { ok: true, toHash, reservationId }
}

/** 실제 저장소: message_log 로 세고 예약하고, SES 계정 명단으로 반송·거부를 본다 */
export function createOutboundGuardStore(db: SupabaseClient): OutboundGuardStore {
    const list = (cols: string, userId: string, sinceIso: string) => db
        .from('message_log')
        .select(cols)
        .eq('user_id', userId)
        .eq('channel', 'email')
        .in('status', ['sent', 'failed', 'pending'])   // 실패로 찍혀도 실제로 나갔을 수 있다. 보내는 중도 센다
        .not('permission_request_id', 'is', null)      // 남에게 보낸 것만(승인 카드가 붙는다). 내게 오는 알림은 안 센다
        .gte('created_at', sinceIso)
        .limit(1000)
    return {
        async listSentToday(userId, sinceIso) {
            const r = await list('id, to_hash', userId, sinceIso)
            if (!r.error) {
                return ((r.data ?? []) as unknown as { id: string; to_hash: string | null }[]).map(x => ({ id: x.id, toHash: x.to_hash ?? null }))
            }
            if (!COLUMN_MISSING.has(r.error.code)) throw new Error(r.error.message)
            // TODO(20261011_message_log_to_hash.sql 적용 뒤 지운다): 지문 칸이 없으면 지문 없이 센다
            const r2 = await list('id', userId, sinceIso)
            if (r2.error) throw new Error(r2.error.message)
            return ((r2.data ?? []) as unknown as { id: string }[]).map(x => ({ id: x.id, toHash: null }))
        },

        async reserve({ userId, permissionRequestId, toHash, toHint: hint }) {
            const row = { user_id: userId, channel: 'email', to_hint: hint, to_hash: toHash, status: 'pending', permission_request_id: permissionRequestId, error: null, subject: null }
            const r = await db.from('message_log').insert(row).select('id').single()
            if (!r.error) return (r.data as { id: string }).id
            // 마이그레이션 전: pending 상태(검사 규칙) 또는 to_hash 칸이 없다. 예약 없이 간다(머리 주석 4번)
            if (r.error.code === CHECK_VIOLATION || COLUMN_MISSING.has(r.error.code)) return null
            throw new Error(r.error.message)
        },

        async release(id) {
            if (!id) return
            const { error } = await db.from('message_log').delete().eq('id', id)
            if (error) throw new Error(error.message)
        },

        isSuppressed: isSuppressedInSes,
    }
}
