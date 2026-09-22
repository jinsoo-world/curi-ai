// domains/messaging — 밖으로 나가는 메시지(푸시·문자·이메일). 관문은 dispatch 하나.

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatch } from './dispatch'
import { createSupabaseStore } from './store'
import { createPushDriver } from './drivers/push'
import { createSmsDriver } from './drivers/sms'
import { createEmailDriver } from './drivers/email'
import type { DispatchInput, DispatchOutcome } from './types'

export { dispatch } from './dispatch'
export { createSupabaseStore, savePrefs, TABLE_MISSING } from './store'
export { createPushDriver, pushReady, vapidPublicKey } from './drivers/push'
export { createSmsDriver, smsEnabled } from './drivers/sms'
export { createEmailDriver, emailReady } from './drivers/email'
export { isQuietHours, localHHMM } from './quiet-hours'
export { maskPhone, maskEmail, toHint } from './mask'
export { DEFAULT_PREFS } from './types'
export type * from './types'

/** 서버에서 쓰는 한 줄: 실제 저장소 + 드라이버 셋으로 관문을 지난다 */
export function dispatchWith(db: SupabaseClient, input: DispatchInput): Promise<DispatchOutcome> {
    return dispatch(input, {
        store: createSupabaseStore(db),
        drivers: { push: createPushDriver(db), sms: createSmsDriver(), email: createEmailDriver() },
    })
}
