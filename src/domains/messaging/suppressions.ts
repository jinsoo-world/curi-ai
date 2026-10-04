// domains/messaging — 받지 않을 사람 명단(message_suppressions) 쓰기. 주소 원문 대신 지문만 남긴다.
// 지금 채우는 곳 = 로그인 없는 수신 거부(/api/unsubscribe) · 회원 탈퇴(domains/account/delete.ts).
// 반송·스팸신고(메일 이벤트)·결번(솔라피 코드)은 메일 채널 개통(설계서 1차 7번) 때 여기로 넣는다.
// 관문(dispatch)은 이 명단을 모든 채널에서 드라이버를 부르기 직전에 본다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { addressHint, hashAddress, SUPPRESSION_SCOPE, type AddressKind, type SuppressionChannel, type SuppressionReason } from './consent'

export interface SuppressionInput { kind: AddressKind; address: string; channel: SuppressionChannel; reason: SuppressionReason; source: string }

/** 명단에 더한다(이미 있으면 그대로). 표가 없으면 false */
export async function addSuppressions(db: Pick<SupabaseClient, 'from'>, items: SuppressionInput[]): Promise<boolean> {
    const rows = items.filter(i => i.address && i.address.trim()).map(i => ({
        channel: i.channel, address_hash: hashAddress(i.kind, i.address), address_hint: addressHint(i.kind, i.address.trim()),
        reason: i.reason, scope: SUPPRESSION_SCOPE[i.reason], source: i.source.slice(0, 60),
    }))
    if (rows.length === 0) return true
    const { error } = await db.from('message_suppressions').upsert(rows, { onConflict: 'channel,address_hash,reason', ignoreDuplicates: true })
    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return false
        throw new Error(error.message)
    }
    return true
}
