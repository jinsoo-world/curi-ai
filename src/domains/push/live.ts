// domains/push — 실제 열쇠(환경변수)로 만든 애플·구글 보내기 + Supabase 저장소.
// messaging 관문(dispatch)이 이 파일만 부른다(순환 import 를 막으려고 index.ts 와 나눴다).

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPush } from './send'
import { createSupabasePushStore } from './store'
import { createApnsTransport } from './apns'
import { createFcmTransport } from './fcm'
import type { PushInput, PushOutcome } from './types'

// 열쇠는 처음 부를 때 한 번 읽는다. 출입증 저장도 이 둘이 한다
let transports: { ios: ReturnType<typeof createApnsTransport>; android: ReturnType<typeof createFcmTransport> } | null = null
function liveTransports() {
    if (!transports) transports = { ios: createApnsTransport(), android: createFcmTransport() }
    return transports
}

/** 아이폰이나 안드로이드 열쇠가 하나라도 있나 */
export function pushConfigured(): boolean {
    const t = liveTransports()
    return t.ios.ready() || t.android.ready()
}

/** 앱 푸시 드라이버: 실제 저장소 + 애플·구글. 규칙(상한·광고·조용한 시간·겹침)은 sendPush 안에 있다 */
export function sendPushWith(db: SupabaseClient, input: PushInput): Promise<PushOutcome> {
    return sendPush(input, { store: createSupabasePushStore(db), transports: liveTransports() })
}
