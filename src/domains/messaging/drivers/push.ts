// 웹푸시 드라이버 — 앱푸시 역할. 아이폰은 홈 화면에 추가한 PWA 에서(iOS 16.4+) 받는다.
// 열쇠(VAPID)는 scripts/webpush-keys.mjs 로 만들어 Vercel 환경변수에 넣는다. 무료.

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Driver, OutboundMessage, SendResult } from '../types'

const PUBLIC = process.env.WEBPUSH_VAPID_PUBLIC
const PRIVATE = process.env.WEBPUSH_VAPID_PRIVATE
const SUBJECT = process.env.WEBPUSH_SUBJECT   // mailto:누구@어디

export function pushReady(): boolean {
    return !!(PUBLIC && PRIVATE && SUBJECT)
}

/** 브라우저에 줄 공개 열쇠(공개돼도 되는 값) */
export function vapidPublicKey(): string | null {
    return PUBLIC ?? null
}

type SubRow = { id: string; endpoint: string; keys: { p256dh: string; auth: string } }

let configured = false
function configure() {
    if (configured || !pushReady()) return
    webpush.setVapidDetails(SUBJECT!, PUBLIC!, PRIVATE!)
    configured = true
}

/** 구독이 죽었다는 응답 (기기에서 지웠거나 만료) */
const GONE = new Set([404, 410])

export function createPushDriver(db: SupabaseClient): Driver {
    return {
        ready: pushReady,
        async send(msg: OutboundMessage): Promise<SendResult> {
            configure()
            const { data, error } = await db
                .from('push_subscriptions')
                .select('id, endpoint, keys')
                .eq('user_id', msg.userId)
            if (error) return { ok: false, error: error.code === '42P01' ? '푸시 구독 표가 아직 없어요.' : '푸시 구독을 읽지 못했어요.' }
            const subs = (data ?? []) as SubRow[]
            if (subs.length === 0) return { ok: false, error: '푸시를 받을 기기가 없어요. 알림 설정에서 푸시를 켜 주세요.' }

            const payload = JSON.stringify({ title: msg.subject ?? '큐리AI', body: msg.body, url: msg.url ?? '/os' })
            let sent = 0
            const dead: string[] = []
            for (const s of subs) {
                try {
                    await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60, timeout: 8_000 })
                    sent++
                } catch (e) {
                    const code = (e as { statusCode?: number }).statusCode
                    if (code && GONE.has(code)) dead.push(s.id)
                    else console.error('[push] 실패', code ?? (e instanceof Error ? e.message : e))
                }
            }
            if (dead.length) await db.from('push_subscriptions').delete().in('id', dead)
            return sent > 0 ? { ok: true, id: `push:${sent}/${subs.length}` } : { ok: false, error: '푸시를 보내지 못했어요.' }
        },
    }
}
