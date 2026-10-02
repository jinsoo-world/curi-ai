// domains/push — 아이폰·안드로이드 앱 알림. 앱과의 약속은 deeplink.ts 머리말.
// 밖으로 나가는 관문은 messaging/dispatch 하나다. 앱 푸시는 그 안의 push 채널로 들어가고,
// 앱 푸시 전용 규칙(하루 3번·광고 규칙·겹침·기록)은 드라이버 자리의 sendPush(send.ts)가 지킨다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWith, type DispatchOutcome } from '@/domains/messaging'
import { pushConfigured } from './live'
import type { PushInput } from './types'

export { sendPush } from './send'
export { sendPushWith, pushConfigured } from './live'
export { createSupabasePushStore } from './store'
export { createApnsTransport, apnsConfig } from './apns'
export { createFcmTransport, fcmConfig } from './fcm'
export { DEEPLINK_HOME, deeplinkBot, deeplinkGroup } from './deeplink'
export { parseRegisterBody, registerDevice, unregisterDevice, markOpened, isUuid } from './devices'
export * from './rules'
export type * from './types'

/** 앱 알림 한 건을 messaging 관문(dispatch)에 넣는 모양으로 바꾼다 */
export function toDispatchInput(p: PushInput) {
    return {
        message: { channel: 'push' as const, userId: p.userId, subject: p.title, body: p.body, url: p.deeplink ?? undefined },
        audience: 'self' as const,
        appPush: { type: p.type, category: p.category, deeplink: p.deeplink ?? null, dedupe: p.dedupe, ignoreLimits: p.ignoreLimits },
    }
}

/**
 * 일이 생긴 곳(루틴·승인 카드·단체방·공개 검사)에서 부르는 안전한 한 줄.
 * 밖으로 나가는 메시지 관문은 하나(domains/messaging/dispatch)라서 여기서도 그 관문을 지난다.
 * 절대 던지지 않는다 = 알림이 실패해도 원래 일(루틴 저장·공개 등)은 그대로 끝난다.
 * 열쇠가 없으면 문구를 만들지도 않는다(봇 이름 조회 같은 DB 읽기도, 기록도 안 한다).
 */
export async function notifyNative(
    db: SupabaseClient,
    input: PushInput | (() => Promise<PushInput | null>),
): Promise<DispatchOutcome | null> {
    if (!pushConfigured()) return null
    let type = '?'
    try {
        const built = typeof input === 'function' ? await input() : input
        if (!built) return null
        type = built.type
        return await dispatchWith(db, toDispatchInput(built))
    } catch (e) {
        console.warn('[push] 앱 알림 실패', type, e instanceof Error ? e.message : e)
        return null
    }
}
export * from './catalog'

/** 알림 문구에 쓸 봇 이름. 못 찾으면 null (문구는 「봇」으로 간다) */
export async function mentorName(db: SupabaseClient, mentorId: string | null | undefined): Promise<string | null> {
    if (!mentorId) return null
    const { data } = await db.from('mentors').select('name').eq('id', mentorId).maybeSingle()
    return (data as { name?: string | null } | null)?.name ?? null
}
