// domains/messaging — 타입. 채널 3개(푸시·문자·이메일)가 같은 모양으로 보낸다.

import type { ApprovalMode } from '@/domains/agent/tool-gate'
import type { PushCategory, PushInput, PushOutcome, BlockReason as PushBlockReason } from '@/domains/push/types'

export type Channel = 'push' | 'sms' | 'email'

/** 밖으로 나가는 메시지 하나 */
export interface OutboundMessage {
    channel: Channel
    /** 이 메시지의 주인(우리 사용자). 푸시 구독·설정·기록이 이 사람 기준이다 */
    userId: string
    /** 받는 곳. 문자 = 전화번호, 이메일 = 주소. 푸시는 비움(주인의 기기 전부) */
    to?: string
    /** 푸시 제목 / 이메일 제목 */
    subject?: string
    /** 본문(글) */
    body: string
    /** 이메일 HTML 본문. 없으면 body 를 그대로 감싼다 */
    html?: string
    /** 이메일 답장 주소(Reply-To). 고객센터 알림에서 문의한 분 주소 */
    replyTo?: string
    /** 푸시를 누르면 열 주소. 기본 /os */
    url?: string
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string }

/** 드라이버 = 채널 하나를 실제로 보내는 것. 셋이 같은 모양 */
export interface Driver {
    /** 열쇠·설정이 있어 보낼 수 있나 */
    ready(): boolean
    send(msg: OutboundMessage): Promise<SendResult>
}

/** notification_prefs 한 줄 */
export interface NotificationPrefs {
    push: boolean
    sms: boolean
    email: boolean
    /** 'HH:MM' 또는 'HH:MM:SS'. 비우면 기본값 */
    quietFrom: string | null
    quietTo: string | null
}

export const DEFAULT_PREFS: NotificationPrefs = {
    push: true,
    sms: false,       // 돈 드는 채널. 사용자가 켜야 한다
    email: true,
    quietFrom: '22:00',
    quietTo: '08:00',
}

/** message_log 한 줄 (받는 곳은 끝 4자만) */
export interface MessageLogEntry {
    userId: string
    channel: Channel
    toHint: string
    subject: string | null
    status: 'sent' | 'failed' | 'blocked'
    permissionRequestId: string | null
    error: string | null
}

/** 관문이 DB 에 묻는 것 셋. 시험에서는 가짜로 갈아 끼운다 */
export interface MessagingStore {
    /** status 가 allowed / edited_allowed 이고 이 사용자 것인 카드만 돌려준다. 아니면 null */
    getApprovedRequest(id: string, userId: string): Promise<{ id: string; userId: string } | null>
    /** 없으면 기본값 */
    getPrefs(userId: string): Promise<NotificationPrefs>
    log(entry: MessageLogEntry): Promise<void>
}

/** 누구에게 가는 메시지인가 */
export type Audience =
    | 'self'    // 주인(나)에게 오는 알림 — 루틴 결과·승인 요청 도착·클로버 부족
    | 'other'   // 봇이 남에게 보내는 메시지 — 승인 카드 필수

export type BlockReason =
    | 'no_permission'      // 남에게 보내는데 allowed 카드가 없다
    | 'draft_only'         // 초안만 만드는 봇
    | 'channel_off'        // 사용자가 이 채널을 꺼 두었다
    | 'sms_disabled'       // SMS_ENABLED 가 없다(대표 사전승인 전)
    | 'quiet_hours'        // 조용한 시간
    | 'driver_not_ready'   // 열쇠 없음
    | 'push_rule'          // 앱 푸시 규칙(하루 3번·광고 동의·광고 시간·겹침 등)에 걸림. 자세한 이유는 error

export interface DispatchInput {
    message: OutboundMessage
    audience: Audience
    /** audience=other 일 때 필수. permission_requests.id */
    permissionRequestId?: string | null
    /** 보내는 봇의 승인 모드(team_bots.approval_mode). 모르면 always_ask */
    approvalMode?: ApprovalMode
    /**
     * 아이폰·안드로이드 앱 알림으로 보낸다(channel=push, audience=self 일 때만).
     * 있으면 웹푸시 대신 앱 푸시 드라이버(domains/push sendPush)로 간다.
     * TODO(메시지엔진 설계 1002 4-1): 상한·광고 규칙을 이 관문 본체로 올리고 웹푸시·메일에도 걸기. 지금은 앱 푸시만
     */
    appPush?: {
        type: string
        category: PushCategory
        deeplink: string | null
        dedupe?: PushInput['dedupe']
        ignoreLimits?: boolean
    }
}

export interface DispatchDeps {
    store: MessagingStore
    drivers: Record<Channel, Driver>
    /** 시험용 시계 */
    now?: () => Date
    /** 문자 채널 스위치. 기본 = process.env.SMS_ENABLED === 'true' */
    smsEnabled?: boolean
    /** 앱 푸시 드라이버 (domains/push sendPush). 없으면 앱 푸시는 driver_not_ready */
    appPush?: (input: PushInput) => Promise<PushOutcome>
}

export interface DispatchOutcome {
    status: 'sent' | 'failed' | 'blocked'
    reason?: BlockReason
    /** 사람에게 보여줄 한 줄 */
    message: string
    error?: string
    id?: string
    /** 앱 푸시로 갔을 때 그 결과(기기 수, sendId, 막힌 이유) */
    push?: PushOutcome
    pushReason?: PushBlockReason
}
