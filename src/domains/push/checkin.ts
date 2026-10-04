// domains/push — ⑤ P089 「3일 안부」를 받을 사람 고르기 + 보내기 (예약 작업 api/cron/push-checkin 이 매일 서울 10시에 부른다).
//
// 「마지막 접속」 = 앱이 기기 번호를 마지막으로 보낸 시각(push_devices.last_seen_at, 앱 실행·로그인 때마다 갱신).
//   기기가 여러 대면 가장 최근 것. 앱 알림을 받을 기기가 있는 사람만 대상이라 이 신호가 제일 곧다.
//   chat_sessions.last_message_at 은 쓰지 않는다 = 루틴(봇)이 글을 남길 때도 갱신돼 사람의 접속이 아니다.
// 고르는 순서:
//   1. 꺼지지 않은 기기 중 마지막 접속이 3일 이상 4일 미만 전인 사람 (4일 창 = 매일 한 번 돌면 한 사람이 한 번만 걸린다)
//   2. 3일 안에 직접 말한 사람은 뺀다(웹 대화 messages.role=user, 단체방 channel_messages.author_kind=user) = 앱만 안 열었을 뿐 쓰고 있다
//   3. 앱 광고 수신 동의(users.ad_consent_app_push = true)한 사람만
//   4. 7일 안에 P089 를 이미 받은 사람은 뺀다 (sendPush 의 겹침 막기가 한 번 더 지킨다)
//   5. 한 번에 최대 500명
// 보내기는 messaging 관문(dispatch) → sendPush 를 지난다 = 광고 규칙(「(광고)」·21~08시 금지·동의)·하루 3번·광고 하루 1번·주 3번이 그대로 걸린다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWith } from '@/domains/messaging'
import { toDispatchInput } from './index'
import { p089CheckIn } from './catalog'
import { isAdQuietHour } from './rules'
import type { PushInput } from './types'

const DAY_MS = 86_400_000
export const P089_BATCH_LIMIT = 500
const IN_CHUNK = 200          // .in(...) 한 번에 넣는 사람 수 (주소 길이 제한)
const SEND_CONCURRENCY = 5    // 애플·구글에 동시에 보내는 수

export interface P089Reader {
    /** 꺼지지 않은 기기 중 since 이후에 접속한 기기 (기기마다 한 줄) */
    devicesSeenSince(since: Date): Promise<{ userId: string; lastSeenAt: string }[]>
    /** since 이후 직접 말한(웹 대화·단체방) 사람 */
    usersActiveSince(userIds: string[], since: Date): Promise<Set<string>>
    /** 광고 수신 동의한 사람 */
    consented(userIds: string[]): Promise<Set<string>>
    /** since 이후 P089 를 「보냄」으로 받은 사람 */
    sentP089Since(userIds: string[], since: Date): Promise<Set<string>>
    /** 사람마다 기획팀장 봇 (없으면 빠진다) */
    planningBots(userIds: string[]): Promise<Map<string, { mentorId: string; name: string }>>
}

/** 순수 계산: 받을 사람 고르기 */
export function pickP089Targets(a: {
    now: Date
    devices: { userId: string; lastSeenAt: string }[]
    activeRecently: Set<string>
    consented: Set<string>
    sentRecently: Set<string>
    limit: number
}): string[] {
    const latest = new Map<string, number>()
    for (const d of a.devices) {
        const t = new Date(d.lastSeenAt).getTime()
        if (!Number.isFinite(t)) continue
        if (t > (latest.get(d.userId) ?? -Infinity)) latest.set(d.userId, t)
    }
    const from = a.now.getTime() - 4 * DAY_MS   // 미포함
    const to = a.now.getTime() - 3 * DAY_MS     // 포함
    const out: string[] = []
    for (const [userId, t] of latest) {
        if (!(t > from && t <= to)) continue
        if (a.activeRecently.has(userId) || !a.consented.has(userId) || a.sentRecently.has(userId)) continue
        out.push(userId)
        if (out.length >= a.limit) break
    }
    return out
}

export type P089SendResult = 'sent' | 'blocked' | 'failed'
export type P089RunOutcome =
    | { skipped: 'ad_quiet_hours' | 'not_configured' }
    | { candidates: number; sent: number; blocked: number; failed: number }

export async function runP089(a: {
    reader: P089Reader
    send: (p: PushInput) => Promise<P089SendResult>
    now?: Date
    limit?: number
}): Promise<P089RunOutcome> {
    const now = a.now ?? new Date()
    // 광고는 21:00~08:00 금지. 막힌 기록 수백 줄을 남기지 않게 DB 를 읽기 전에 끝낸다
    if (isAdQuietHour(now)) return { skipped: 'ad_quiet_hours' }
    const { reader } = a
    const ago = (d: number) => new Date(now.getTime() - d * DAY_MS)

    const devices = await reader.devicesSeenSince(ago(4))
    const latest = new Map<string, number>()
    for (const d of devices) latest.set(d.userId, Math.max(latest.get(d.userId) ?? 0, new Date(d.lastSeenAt).getTime()))
    const inWindow = [...latest].filter(([, t]) => t <= ago(3).getTime()).map(([u]) => u)

    const activeRecently = new Set<string>(), consented = new Set<string>(), sentRecently = new Set<string>()
    for (const ids of chunks(inWindow, IN_CHUNK)) {
        const [ok, sent] = await Promise.all([reader.consented(ids), reader.sentP089Since(ids, ago(7))])
        ok.forEach(u => consented.add(u)); sent.forEach(u => sentRecently.add(u))
        // 활동 확인은 사람마다 묻는 거라 비싸다 = 동의했고 아직 안 받은 사람만
        const left = ids.filter(u => ok.has(u) && !sent.has(u))
        if (left.length > 0) (await reader.usersActiveSince(left, ago(3))).forEach(u => activeRecently.add(u))
    }
    const targets = pickP089Targets({ now, devices, activeRecently, consented, sentRecently, limit: a.limit ?? P089_BATCH_LIMIT })

    const bots = new Map<string, { mentorId: string; name: string }>()
    for (const ids of chunks(targets, IN_CHUNK)) (await reader.planningBots(ids)).forEach((v, k) => bots.set(k, v))

    const tally = { sent: 0, blocked: 0, failed: 0 }
    let next = 0
    const worker = async () => {
        while (next < targets.length) {
            const userId = targets[next++]
            const bot = bots.get(userId)
            try {
                tally[await a.send(p089CheckIn({ userId, mentorId: bot?.mentorId ?? null, botName: bot?.name }))]++
            } catch (e) {
                tally.failed++
                console.warn('[push] P089 보내기 실패', e instanceof Error ? e.message : e)
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, targets.length) }, worker))
    return { candidates: targets.length, ...tally }
}

function chunks<T>(xs: T[], n: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
    return out
}

/** 실제 Supabase 로 읽기 (service_role). 읽다 실패하면 던진다 = 확인 못 한 사람에게 광고를 보내지 않는다 */
export function createSupabaseP089Reader(db: SupabaseClient): P089Reader {
    const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
        if (r.error) throw new Error(`[P089] ${what} 읽기 실패: ${r.error.message}`)
        return (r.data ?? []) as T
    }
    return {
        async devicesSeenSince(since) {
            const out: { userId: string; lastSeenAt: string }[] = []
            const PAGE = 1000
            for (let from = 0; from < 20_000; from += PAGE) {
                const rows = must(await db.from('push_devices').select('user_id, last_seen_at')
                    .is('disabled_at', null).gt('last_seen_at', since.toISOString())
                    .order('id').range(from, from + PAGE - 1), '기기') as { user_id: string; last_seen_at: string }[]
                rows.forEach(r => out.push({ userId: r.user_id, lastSeenAt: r.last_seen_at }))
                if (rows.length < PAGE) break
            }
            return out
        },
        async usersActiveSince(userIds, since) {
            // 사람마다 「since 이후 내가 한 말이 1개라도 있나」만 묻는다(한 번에 묻으면 1,000줄 상한에 잘려 활동한 사람을 놓친다)
            const s = since.toISOString()
            const out = new Set<string>()
            for (const ids of chunks(userIds, 10)) {
                await Promise.all(ids.map(async userId => {
                    const [chat, group] = await Promise.all([
                        db.from('messages').select('id, chat_sessions!inner(user_id)').eq('role', 'user').gte('created_at', s).eq('chat_sessions.user_id', userId).limit(1),
                        db.from('channel_messages').select('id, channels!inner(user_id)').eq('author_kind', 'user').gte('created_at', s).eq('channels.user_id', userId).limit(1),
                    ])
                    if ((must(chat, '대화') as unknown[]).length > 0 || (must(group, '단체방') as unknown[]).length > 0) out.add(userId)
                }))
            }
            return out
        },
        async consented(userIds) {
            // 앱 광고 동의 칸(메시지엔진 1차). 칸이 아직 없으면 옛 marketing_consent
            let r = await db.from('users').select('id').in('id', userIds).eq('ad_consent_app_push', true)
            if (r.error && (r.error.code === '42703' || r.error.code === 'PGRST204')) r = await db.from('users').select('id').in('id', userIds).eq('marketing_consent', true)
            const rows = must(r, '광고 동의') as { id: string }[]
            return new Set(rows.map(x => x.id))
        },
        async sentP089Since(userIds, since) {
            const rows = must(await db.from('push_sends').select('user_id').eq('push_type', 'P089').eq('status', 'sent')
                .gte('sent_at', since.toISOString()).in('user_id', userIds), 'P089 기록') as { user_id: string }[]
            return new Set(rows.map(r => r.user_id))
        },
        async planningBots(userIds) {
            const rows = must(await db.from('team_bots').select('user_id, mentor_id, mentors!inner(name)')
                .in('user_id', userIds).eq('mentors.name', '기획팀장'), '기획팀장') as { user_id: string; mentor_id: string; mentors: { name: string } | { name: string }[] }[]
            const out = new Map<string, { mentorId: string; name: string }>()
            for (const r of rows) if (!out.has(r.user_id)) out.set(r.user_id, { mentorId: r.mentor_id, name: one(r.mentors)[0]?.name ?? '기획팀장' })
            return out
        },
    }
}

const one = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

/** 실제 보내기: messaging 관문 → sendPush */
export function liveP089Sender(db: SupabaseClient) {
    return async (p: PushInput): Promise<P089SendResult> => (await dispatchWith(db, toDispatchInput(p))).status
}
