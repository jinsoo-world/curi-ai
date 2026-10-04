// domains/messaging — 관문 한 곳. 밖으로 나가는 모든 메시지(앱 푸시·웹 푸시·메일·문자)는 여기를 지난다.
//
// 순서 (하나라도 걸리면 드라이버를 부르지 않는다. 막힌 것도 message_log 에 이유와 함께 한 줄):
//  1. 도구 관문(gateTool)  — 내게 오는 알림 = notify_owner(안전). 남에게 = send_* (allowed 카드 필수)
//  2. 유형 장부            — 장부에 있고 켜진 유형인가, 이 채널·받는 사람 종류를 쓰는 유형인가 (registry.ts)
//  3. 채널 스위치         — 문자는 SMS_ENABLED=true 여야 나간다(돈 드는 채널, 대표 사전승인 뒤 켬)
//  4. 광고 규칙(모든 채널) — 광고 문자 금지 · 제목 「(광고)」 · 21~08시 금지 · 그 채널의 광고 동의 칸 · 메일은 수신 거부 주소
//  5. 받지 않을 사람 명단 — 반송·스팸신고·결번은 전부, 수신 거부·탈퇴는 광고만
//  6. 겹침               — 같은 사람 + 같은 유형 + 같은 열쇠로 이미 「보냄」이면 안 보낸다
//  7. 상한               — 1인 하루 3번(채널 다 합쳐서, 서울 자정 기준), 광고 하루 1번·주 3번
//  8. 채널별 드라이버     — 앱 푸시 = sendPush(기기·푸시 꺼짐·조용한 시간·자기 상한을 한 번 더 본다)
//                          웹 푸시·메일·문자 = 내 설정 → 조용한 시간(메일 제외) → 열쇠 → 보내기
// 규칙을 읽다가 DB 가 실패하면 보내지 않는다(check_failed). 모르면 막는다.
// 앱이 없는 사람(no_device)은 매번 생기는 일이라 기록하지 않는다(예전과 같다).

import { gateTool } from '@/domains/agent/tool-gate'
import { isQuietHours } from './quiet-hours'
import { toHint } from './mask'
import { effectiveOn, getTypeDef, type Route } from './registry'
import { hashAddress, suppressionApplies, unsubscribeUrl as defaultUnsubscribeUrl, type SuppressionChannel } from './consent'
import {
    AD_DAILY_MAX, AD_WEEKLY_MAX, DAILY_MAX, fillUnsubscribe, hasAdPrefix, hasUnsubscribePlaceholder,
    isAdQuietHour, kstDayStart, weekWindowStart, withAdFooter,
} from './rules'
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
    push_rule: '앱 알림 규칙에 걸려 보내지 않았어요.',
    unknown_type: '알 수 없는 종류의 메시지라 보내지 않았어요.',
    type_off: '이 종류의 메시지는 지금 꺼져 있어요.',
    route_not_allowed: '이 종류의 메시지는 이 채널로 보내지 않아요.',
    ad_not_allowed: '광고는 다른 분께 보낼 수 없어요.',
    sms_ad_disabled: '광고 문자는 보내지 않아요.',
    ad_title_prefix: '광고는 제목이 「(광고)」로 시작해야 해요.',
    ad_quiet_hours: '광고는 밤 9시부터 아침 8시까지 보내지 않아요.',
    ad_no_consent: '광고 수신에 동의하지 않은 분이라 보내지 않았어요.',
    ad_no_unsubscribe: '광고 메일에는 수신 거부 링크 자리가 있어야 해요.',
    unsubscribe_unavailable: '수신 거부 링크를 만들 열쇠가 없어 광고를 보내지 않았어요.',
    suppressed: '받지 않기로 한 분이라 보내지 않았어요.',
    duplicate: '같은 소식을 이미 보냈어요.',
    daily_cap: '오늘 보낼 수 있는 알림을 다 썼어요.',
    ad_daily_cap: '광고는 하루 한 번만 보내요.',
    ad_weekly_cap: '광고는 일주일에 세 번까지만 보내요.',
    check_failed: '보내도 되는지 확인하지 못해 보내지 않았어요.',
}

export async function dispatch(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutcome> {
    const { message, audience, approvalMode } = input
    const { store, drivers } = deps
    const now = deps.now ?? (() => new Date())
    const smsEnabled = deps.smsEnabled ?? (process.env.SMS_ENABLED === 'true')
    const makeUnsubscribe = deps.unsubscribeUrl ?? ((userId: string, route: Route) => defaultUnsubscribeUrl(userId, route))

    const isApp = message.channel === 'push' && !!input.appPush && audience === 'self'
    const route: Route = message.channel === 'push' ? (isApp ? 'app_push' : 'web_push') : message.channel
    const def = getTypeDef(input.type)
    const category = def?.category ?? null

    const base: Omit<MessageLogEntry, 'status' | 'error'> = {
        userId: message.userId,
        channel: message.channel,
        toHint: toHint(message.to),
        toHash: message.toHash ?? null,
        subject: isApp ? `[${input.type}] ${message.subject ?? ''}`.trim() : message.subject ?? null,
        permissionRequestId: null,
        msgType: input.type ?? null,
        category,
        route,
        campaignKey: input.campaignKey ?? null,
        dedupeKey: input.dedupe?.key ?? null,
        batchId: null,
        isTest: input.test === true,
    }
    const finish = async (entry: MessageLogEntry, outcome: DispatchOutcome): Promise<DispatchOutcome> => {
        try { await store.log(entry) } catch (e) {
            const why = e instanceof Error ? e.message : e
            // 남에게 실제로 나간 것의 기록이 빠지면 하루 상한(outbound-guard)이 그만큼 덜 센다. 크게 알린다
            if (audience === 'other' && entry.status === 'sent') console.error('[messaging] 남에게 보낸 기록 실패. 하루 상한이 덜 셀 수 있다', why)
            else console.warn('[messaging] 기록 실패(표 없음?)', why)
        }
        return outcome
    }
    const block = (reason: BlockReason, detail?: string) =>
        finish({ ...base, status: 'blocked', error: detail ? `${reason}:${detail}` : reason }, { status: 'blocked', reason, message: REASON_TEXT[reason] })

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

    // 2. 유형 장부
    if (!def || !def.viaGateway) return block('unknown_type')
    // 남에게(other) 유형은 승인 카드 길로만, 캠페인 유형은 캠페인 절차(캠페인 열쇠)로만
    const audienceOk = audience === 'other' ? def.audience === 'other' : def.audience === 'campaign' ? !!input.campaignKey : def.audience === 'self'
    if (!def.routes.includes(route) || !audienceOk) return block('route_not_allowed')
    try {
        if (!effectiveOn(def, await store.getTypeSwitch(def.type))) return block('type_off')
    } catch (e) {
        console.warn('[messaging] 유형 장부 읽기 실패', e instanceof Error ? e.message : e)
        return block('check_failed', 'type')
    }

    // 3. 채널 스위치
    if (message.channel === 'sms' && !smsEnabled) return block('sms_disabled')

    const isAd = category === 'ad'
    const at = now()
    let profile: Awaited<ReturnType<typeof store.getAdProfile>> | null = null

    // 4. 광고 규칙 (모든 채널. 시험도 못 건너뛴다)
    let outMessage = message
    if (isAd) {
        if (audience === 'other') return block('ad_not_allowed')
        if (message.channel === 'sms') return block('sms_ad_disabled')
        if (!hasAdPrefix(message.subject ?? '')) return block('ad_title_prefix')
        if (isAdQuietHour(at)) return block('ad_quiet_hours')
        try {
            profile = await store.getAdProfile(message.userId)
        } catch (e) {
            console.warn('[messaging] 광고 동의 읽기 실패', e instanceof Error ? e.message : e)
            return block('check_failed', 'consent')
        }
        if (!profile.consent[route]) return block('ad_no_consent')
        if (message.channel === 'email') {
            if (!hasUnsubscribePlaceholder(message.body) || (message.html !== undefined && !hasUnsubscribePlaceholder(message.html))) {
                return block('ad_no_unsubscribe')
            }
            const url = makeUnsubscribe(message.userId, 'email')
            if (!url) return block('unsubscribe_unavailable')
            outMessage = { ...message, body: fillUnsubscribe(message.body, url), html: message.html === undefined ? undefined : fillUnsubscribe(message.html, url) }
        } else if (message.channel === 'push') {
            // 앱 푸시는 sendPush 가 같은 꼬리를 붙인다(이미 있으면 그대로라 두 번 붙지 않는다)
            outMessage = { ...message, body: withAdFooter(message.body) }
        }
    }

    // 5. 받지 않을 사람 명단
    try {
        const hashes: string[] = []
        const channels: SuppressionChannel[] = [route, 'all']
        if (message.channel === 'email' && message.to) hashes.push(hashAddress('email', message.to))
        else if (message.channel === 'sms' && message.to) hashes.push(hashAddress('phone', message.to))
        if (audience === 'self') hashes.push(hashAddress('user', message.userId))
        if (profile?.email) hashes.push(hashAddress('email', profile.email))
        if (profile?.phone) hashes.push(hashAddress('phone', profile.phone))
        const rows = hashes.length ? await store.findSuppressions([...new Set(hashes)], channels) : []
        const hit = suppressionApplies(rows, category ?? 'info', profile?.consentAt ?? null)
        if (hit) return block('suppressed', hit)
    } catch (e) {
        console.warn('[messaging] 받지 않을 사람 명단 읽기 실패', e instanceof Error ? e.message : e)
        return block('check_failed', 'suppression')
    }

    const limited = audience === 'self' && def.countsTowardCap && input.test !== true
    try {
        // 6. 겹침
        if (input.dedupe && input.test !== true) {
            const since = input.dedupe.withinMinutes ? new Date(at.getTime() - input.dedupe.withinMinutes * 60_000) : null
            if (await store.hasSent(message.userId, def.type, input.dedupe.key, since)) return block('duplicate')
        }
        // 7. 상한 (채널 다 합쳐서)
        if (limited) {
            const today = kstDayStart(at)
            if (await store.countSent(message.userId, today) >= DAILY_MAX) return block('daily_cap')
            if (isAd) {
                if (await store.countSent(message.userId, today, 'ad') >= AD_DAILY_MAX) return block('ad_daily_cap')
                if (await store.countSent(message.userId, weekWindowStart(at), 'ad') >= AD_WEEKLY_MAX) return block('ad_weekly_cap')
            }
        }
    } catch (e) {
        console.warn('[messaging] 겹침·상한 읽기 실패', e instanceof Error ? e.message : e)
        return block('check_failed', 'cap')
    }

    // 8-1. 앱 푸시 (아이폰·안드로이드). 내게 오는 알림만
    if (isApp) {
        if (!deps.appPush) return block('driver_not_ready')
        const r = await deps.appPush({
            userId: message.userId, type: def.type, category: def.category,
            title: message.subject ?? '큐리AI', body: message.body, deeplink: input.appPush!.deeplink,
            dedupe: input.test ? undefined : input.dedupe, ignoreLimits: input.test === true,
        })
        if ('skipped' in r) return block('driver_not_ready')
        if (r.status === 'blocked' && r.reason === 'no_device') {
            // 앱을 안 깐 사람(대부분)은 일이 생길 때마다 여기로 온다. 기록하지 않는다
            return { status: 'blocked', reason: 'push_rule', pushReason: 'no_device', message: '앱 알림을 받을 기기가 없어요.', push: r }
        }
        if (r.status === 'blocked') {
            return finish({ ...base, status: 'blocked', error: r.reason }, { status: 'blocked', reason: 'push_rule', pushReason: r.reason, message: REASON_TEXT.push_rule, push: r })
        }
        const logged = { ...base, batchId: r.batchId }
        if (r.status === 'sent') {
            return finish({ ...logged, status: 'sent', error: null }, { status: 'sent', id: `apppush:${r.batchId}`, message: '보냈어요.', push: r })
        }
        return finish({ ...logged, status: 'failed', error: `기기 ${r.failed}대 실패` }, { status: 'failed', error: `기기 ${r.failed}대 실패`, message: '보내지 못했어요. 잠시 뒤 다시 해 주세요.', push: r })
    }

    // 8-2. 내 설정 + 조용한 시간 (웹 푸시·메일·문자)
    const prefs = await store.getPrefs(message.userId).catch(() => null)
    if (prefs) {
        if (audience === 'self' && !prefs[message.channel]) return block('channel_off')
        if (message.channel !== 'email' && input.test !== true && isQuietHours(at, prefs.quietFrom, prefs.quietTo)) return block('quiet_hours')
    }

    // 8-3. 드라이버 준비
    const driver = drivers[message.channel]
    if (!driver.ready()) return block('driver_not_ready')

    // 8-4. 보내기
    const r = await driver.send(outMessage)
    if (r.ok) {
        return finish({ ...base, status: 'sent', error: null }, { status: 'sent', id: r.id, message: '보냈어요.' })
    }
    return finish({ ...base, status: 'failed', error: r.error }, { status: 'failed', error: r.error, message: '보내지 못했어요. 잠시 뒤 다시 해 주세요.' })
}
