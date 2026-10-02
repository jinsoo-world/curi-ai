// domains/messaging — 봇이 남에게 보내는 메일 잠금 (/api/os/messages/send 전용, 1002 설계 8번).
//
// 왜: 큐리AI 메일은 큐리어스와 같은 AWS SES 계정으로 나간다. 한 사람이 단체·광고 메일을 돌리면
//     반송·스팸신고가 쌓여 SES 가 계정을 멈추고, 그러면 큐리어스 메일까지 같이 끊긴다(9/1 반송 24.6% 사고).
//
// 순서 (하나라도 걸리면 보내지 않는다):
//  1. 끄는 스위치      — OS_OUTBOUND_MAIL_ENABLED='0' 이면 전부 멈춤. 값이 없으면 지금처럼 켜짐
//  2. 한 번에 한 분    — 받는 사람 둘 이상이면 거절
//  3. 광고·단체 표시   — (광고)·수신거부·unsubscribe 같은 표시가 있으면 거절(정보성 1:1 만 허용)
//  4. 하루 상한(서울)  — 1인 하루 20통, 새로운 받는 분 5명
//  5. 반송·거부 명단   — SES 계정 명단(반송·스팸신고)에 있으면 거절. 확인 못 하면 보내지 않는다

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuppressedInSes } from './drivers/email'

export const DAILY_MAIL_CAP = 20
export const DAILY_NEW_RECIPIENT_CAP = 5

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
/** 광고·단체 메일에만 붙는 표시. 1:1 안내 메일에는 들어갈 일이 없다 */
const BULK_MARKERS = [/[(\[]\s*광\s*고\s*[)\]]/, /수신\s*거부/, /unsubscribe/i, /opt[\s-]?out/i]

const COLUMN_MISSING = new Set(['42703', 'PGRST204'])

export interface OutboundGuardStore {
    /** 서울 오늘 0시(sinceIso) 뒤로 이 사람이 남에게 보낸 메일. 지문 칸이 없으면 recipientHashes = null */
    countSentToday(userId: string, sinceIso: string): Promise<{ total: number; recipientHashes: (string | null)[] | null }>
    /** 반송·스팸신고·거부 명단에 있으면 true. 확인 자체가 안 되면 던진다 */
    isSuppressed(email: string): Promise<boolean>
}

export interface GuardInput {
    userId: string
    to: unknown
    subject?: unknown
    body?: unknown
    html?: unknown
}

export type GuardResult = { ok: true; toHash: string } | { ok: false; status: number; error: string }

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

const fail = (status: number, error: string): GuardResult => ({ ok: false, status, error })

export async function guardOutboundEmail(
    input: GuardInput,
    deps: { store: OutboundGuardStore; now?: () => Date; env?: Record<string, string | undefined> },
): Promise<GuardResult> {
    const env = deps.env ?? process.env
    const now = deps.now ?? (() => new Date())

    // 1. 끄는 스위치
    if (env.OS_OUTBOUND_MAIL_ENABLED === '0') {
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
    const text = [input.subject, input.body, input.html].filter((v): v is string => typeof v === 'string').join('\n')
    if (BULK_MARKERS.some(re => re.test(text))) {
        return fail(400, '광고나 여러 사람에게 돌리는 안내 메일은 보낼 수 없어요. 한 분께 드리는 안내만 보낼 수 있어요.')
    }

    // 4. 하루 상한
    const toHash = hashRecipient(to)
    let today: Awaited<ReturnType<OutboundGuardStore['countSentToday']>>
    try {
        today = await deps.store.countSentToday(input.userId, kstDayStart(now()).toISOString())
    } catch (e) {
        console.warn('[outbound-guard] 오늘 보낸 수를 못 셌다', e instanceof Error ? e.message : e)
        return fail(503, '오늘 보낸 메일 수를 확인하지 못해 보내지 않았어요. 잠시 뒤 다시 해 주세요.')
    }
    if (today.total >= DAILY_MAIL_CAP) {
        return fail(429, `오늘 보낼 수 있는 메일 ${DAILY_MAIL_CAP}통을 다 썼어요. 내일 다시 보내 주세요.`)
    }
    // 지문을 모르면(칸이 없거나 옛 줄) 한 통 = 새 사람 한 명으로 친다. 덜 보내는 쪽으로 틀린다
    const hashes = today.recipientHashes ?? Array<null>(today.total).fill(null)
    const known = new Set(hashes.filter((h): h is string => !!h))
    const distinct = known.size + hashes.filter(h => !h).length
    if (!known.has(toHash) && distinct >= DAILY_NEW_RECIPIENT_CAP) {
        return fail(429, `오늘은 새로운 분께 보낼 수 있는 ${DAILY_NEW_RECIPIENT_CAP}명을 다 채웠어요. 오늘 이미 보낸 분께는 더 보낼 수 있고, 새로운 분께는 내일 보내 주세요.`)
    }

    // 5. 반송·거부 명단
    let suppressed: boolean
    try {
        suppressed = await deps.store.isSuppressed(normalizeEmail(to))
    } catch (e) {
        console.warn('[outbound-guard] 반송 명단 확인 실패', e instanceof Error ? e.message : e)
        return fail(503, '받는 주소를 확인하지 못해 보내지 않았어요. 잠시 뒤 다시 해 주세요.')
    }
    if (suppressed) {
        return fail(403, '이 주소는 예전에 메일이 되돌아왔거나 받지 않겠다고 하신 주소라 보낼 수 없어요.')
    }

    return { ok: true, toHash }
}

/** 실제 저장소: message_log 로 세고, SES 계정 명단으로 반송·거부를 본다 */
export function createOutboundGuardStore(db: SupabaseClient): OutboundGuardStore {
    const base = (cols: string, userId: string, sinceIso: string) => db
        .from('message_log')
        .select(cols)
        .eq('user_id', userId)
        .eq('channel', 'email')
        .in('status', ['sent', 'failed'])          // 실패로 찍혀도 실제로 나갔을 수 있다. 세는 쪽으로
        .not('permission_request_id', 'is', null)  // 남에게 보낸 것만(승인 카드가 붙는다). 내게 오는 알림은 안 센다
        .gte('created_at', sinceIso)
        .limit(1000)
    return {
        async countSentToday(userId, sinceIso) {
            const r = await base('to_hash', userId, sinceIso)
            if (!r.error) {
                const rows = (r.data ?? []) as unknown as { to_hash: string | null }[]
                return { total: rows.length, recipientHashes: rows.map(x => x.to_hash ?? null) }
            }
            if (!COLUMN_MISSING.has(r.error.code)) throw new Error(r.error.message)
            // TODO(마이그레이션 20261011_message_log_to_hash.sql 적용 뒤 지운다): 지문 칸이 없으면 통 수만 센다
            const r2 = await base('id', userId, sinceIso)
            if (r2.error) throw new Error(r2.error.message)
            return { total: (r2.data ?? []).length, recipientHashes: null }
        },
        isSuppressed: isSuppressedInSes,
    }
}
