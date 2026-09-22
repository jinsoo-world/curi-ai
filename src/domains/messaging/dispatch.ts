// domains/messaging — 관문 한 곳. 밖으로 나가는 모든 메시지는 여기를 지난다.
//
// 순서 (하나라도 걸리면 드라이버를 부르지 않는다):
//  1. 도구 관문(gateTool)  — 내게 오는 알림 = notify_owner(안전). 남에게 = send_* (allowed 카드 필수)
//  2. 채널 스위치         — 문자는 SMS_ENABLED=true 여야 나간다(돈 드는 채널, 대표 사전승인 뒤 켬)
//  3. 내 설정             — 내게 오는 알림은 내가 그 채널을 켜 두었을 때만
//  4. 조용한 시간         — 푸시·문자 보류, 이메일은 간다
//  5. 드라이버 준비        — 열쇠 없으면 blocked (죽지 않는다)
//  6. 보내기 → message_log 에 한 줄 (받는 곳은 끝 4자만)

import { gateTool } from '@/domains/agent/tool-gate'
import { isQuietHours } from './quiet-hours'
import { toHint } from './mask'
import type { BlockReason, Channel, DispatchDeps, DispatchInput, DispatchOutcome, MessageLogEntry } from './types'

/** 채널 → 도구 관문에서 쓰는 도구 이름 */
const TOOL_FOR_OTHER: Record<Channel, string> = { push: 'send_message', sms: 'send_sms', email: 'send_email' }
const TOOL_FOR_SELF = 'notify_owner'

const REASON_TEXT: Record<BlockReason, string> = {
    no_permission: '허용된 승인 카드가 없어 보내지 않았어요.',
    draft_only: '이 봇은 초안만 만들어요. 밖으로 보내지 않아요.',
    channel_off: '이 알림 채널을 꺼 두셨어요. 알림 설정에서 켤 수 있어요.',
    sms_disabled: '문자는 아직 준비 중이에요.',
    quiet_hours: '조용한 시간이라 보내지 않았어요.',
    driver_not_ready: '이 채널을 보낼 열쇠가 아직 연결되지 않았어요.',
}

export async function dispatch(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutcome> {
    const { message, audience, approvalMode } = input
    const { store, drivers } = deps
    const now = deps.now ?? (() => new Date())
    const smsEnabled = deps.smsEnabled ?? (process.env.SMS_ENABLED === 'true')

    const base: Omit<MessageLogEntry, 'status' | 'error'> = {
        userId: message.userId,
        channel: message.channel,
        toHint: toHint(message.to),
        subject: message.subject ?? null,
        permissionRequestId: null,
    }
    const finish = async (entry: MessageLogEntry, outcome: DispatchOutcome): Promise<DispatchOutcome> => {
        try { await store.log(entry) } catch (e) {
            console.warn('[messaging] 기록 실패(표 없음?)', e instanceof Error ? e.message : e)
        }
        return outcome
    }
    const block = (reason: BlockReason, permissionRequestId: string | null = null) =>
        finish({ ...base, permissionRequestId, status: 'blocked', error: reason }, { status: 'blocked', reason, message: REASON_TEXT[reason] })

    // 1. 도구 관문
    let approvedId: string | null = null
    if (audience === 'other') {
        const id = input.permissionRequestId ?? null
        const card = id ? await store.getApprovedRequest(id, message.userId).catch(() => null) : null
        approvedId = card?.id ?? null
        const gate = gateTool({ tool: TOOL_FOR_OTHER[message.channel], approvalMode, approvedRequestId: approvedId })
        if (!gate.allowed) {
            return block(gate.needsApproval ? 'no_permission' : approvalMode === 'draft_only' ? 'draft_only' : 'no_permission')
        }
    } else {
        const gate = gateTool({ tool: TOOL_FOR_SELF, approvalMode })
        if (!gate.allowed) return block('no_permission')
    }
    base.permissionRequestId = approvedId

    // 2. 채널 스위치
    if (message.channel === 'sms' && !smsEnabled) return block('sms_disabled', approvedId)

    // 3. 내 설정 + 4. 조용한 시간
    const prefs = await store.getPrefs(message.userId).catch(() => null)
    if (prefs) {
        if (audience === 'self' && !prefs[message.channel]) return block('channel_off', approvedId)
        if (message.channel !== 'email' && isQuietHours(now(), prefs.quietFrom, prefs.quietTo)) return block('quiet_hours', approvedId)
    }

    // 5. 드라이버 준비
    const driver = drivers[message.channel]
    if (!driver.ready()) return block('driver_not_ready', approvedId)

    // 6. 보내기
    const r = await driver.send(message)
    if (r.ok) {
        return finish({ ...base, status: 'sent', error: null }, { status: 'sent', id: r.id, message: '보냈어요.' })
    }
    return finish({ ...base, status: 'failed', error: r.error }, { status: 'failed', error: r.error, message: '보내지 못했어요. 잠시 뒤 다시 해 주세요.' })
}
