// domains/messaging — 밖으로 나가는 메시지(푸시·문자·이메일). 관문은 dispatch 하나.

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatch } from './dispatch'
import { createSupabaseStore } from './store'
import { createPushDriver } from './drivers/push'
import { createSmsDriver } from './drivers/sms'
import { createEmailDriver } from './drivers/email'
import { sendPushWith } from '@/domains/push/live'
import { effectiveOn, getTypeDef } from './registry'
import type { DispatchInput, DispatchOutcome } from './types'

export { dispatch } from './dispatch'
export { createSupabaseStore, savePrefs, TABLE_MISSING } from './store'
export { createPushDriver, pushReady, vapidPublicKey } from './drivers/push'
export { createSmsDriver, smsEnabled } from './drivers/sms'
export { createEmailDriver, emailReady } from './drivers/email'
export { isQuietHours, localHHMM } from './quiet-hours'
export { maskPhone, maskEmail, toHint } from './mask'
export { DEFAULT_PREFS } from './types'
export { MESSAGE_TYPES, getTypeDef, effectiveOn, defaultOnTypes, ROUTES } from './registry'
export type { Route, Category, MessageTypeDef } from './registry'
export type * from './types'

/**
 * 관문 밖에서 직접 보내는 유형(장부 viaGateway=false, 예: 고객센터 문의 알림 메일)이 장부의 켬/끔을 보는 한 줄.
 * 표를 못 읽으면 기본값을 쓴다(회사 메일함으로 가는 내부 알림이라 막는 쪽보다 받는 쪽이 안전하다).
 */
export async function isTypeOn(db: SupabaseClient, type: string): Promise<boolean> {
    const def = getTypeDef(type)
    if (!def) return false
    const override = await createSupabaseStore(db).getTypeSwitch(type).catch(() => null)
    return effectiveOn(def, override)
}

/** 서버에서 쓰는 한 줄: 실제 저장소 + 드라이버 셋으로 관문을 지난다 */
export function dispatchWith(db: SupabaseClient, input: DispatchInput): Promise<DispatchOutcome> {
    return dispatch(input, {
        store: createSupabaseStore(db),
        drivers: { push: createPushDriver(db), sms: createSmsDriver(), email: createEmailDriver() },
        appPush: input => sendPushWith(db, input),
    })
}
