// domains/messaging — 타입. 채널 3개(푸시·문자·이메일)가 같은 모양으로 보낸다.

import type { ApprovalMode } from '@/domains/agent/tool-gate'
import type { PushInput, PushOutcome, BlockReason as PushBlockReason } from '@/domains/push/types'
import type { Category, Route } from './registry'
import type { SuppressionChannel, SuppressionRow } from './consent'

export type Channel = 'push' | 'sms' | 'email'

/** 밖으로 나가는 메시지 하나 */
export interface OutboundMessage {
    channel: Channel
    /** 이 메시지의 주인(우리 사용자). 푸시 구독·설정·기록이 이 사람 기준이다 */
    userId: string
    /** 받는 곳. 문자 = 전화번호, 이메일 = 주소. 푸시는 비움(주인의 기기 전부) */
    to?: string
    /** 받는 주소 지문(sha256). 남에게 보낸 메일의 하루 상한을 세는 데 쓴다. 주소 자체는 기록하지 않는다 */
    toHash?: string
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
    /** 받는 주소 지문. 칸이 없는 DB 에서는 빼고 적는다 */
    toHash?: string | null
    subject: string | null
    status: 'sent' | 'failed' | 'blocked'
    permissionRequestId: string | null
    error: string | null
    /** 유형 장부 번호(P001·OWNER_NOTIFY…). 칸이 없는 DB 에서는 빼고 적는다 */
    msgType?: string | null
    category?: Category | null
    /** app_push · web_push · email · sms */
    route?: Route | null
    campaignKey?: string | null
    dedupeKey?: string | null
    /** 앱 푸시 묶음 번호 = push_sends.batch_id (기기별 줄과 잇는다) */
    batchId?: string | null
    /** 시험 발송. 하루 상한 셈에서 뺀다 */
    isTest?: boolean
}

/** 광고 판정에 쓰는 회원 정보 */
export interface AdProfile {
    consent: Record<Route, boolean>
    /** 광고 동의를 마지막으로 바꾼 시각 */
    consentAt: string | null
    email: string | null
    phone: string | null
}

/** 관문이 DB 에 묻는 것 셋. 시험에서는 가짜로 갈아 끼운다 */
export interface MessagingStore {
    /** status 가 allowed / edited_allowed 이고 이 사용자 것인 카드만 돌려준다. 아니면 null */
    getApprovedRequest(id: string, userId: string): Promise<{ id: string; userId: string } | null>
    /** 없으면 기본값 */
    getPrefs(userId: string): Promise<NotificationPrefs>
    log(entry: MessageLogEntry): Promise<void>
    /** 유형 장부 켬/끔 표(message_types)의 값. 줄이 없거나 표가 없으면 null(기본값을 쓴다). 읽기 실패는 던진다 */
    getTypeSwitch(type: string): Promise<boolean | null>
    /** 채널별 광고 동의 + 지문 만들 주소. 읽기 실패는 던진다 */
    getAdProfile(userId: string): Promise<AdProfile>
    /** 받지 않을 사람 명단에서 이 지문들 + 이 채널들에 걸린 줄. 표가 없으면 [] . 읽기 실패는 던진다 */
    findSuppressions(hashes: string[], channels: SuppressionChannel[]): Promise<SuppressionRow[]>
    /** since 이후 이 회원에게 「보냄」 기록 수(시험·남에게 보낸 것 제외). category 를 주면 그 종류만. 읽기 실패는 던진다 */
    countSent(userId: string, since: Date, category?: Category): Promise<number>
    /** 같은 유형 + 같은 겹침 열쇠로 「보냄」이 있나(since 가 있으면 그 뒤로만) */
    hasSent(userId: string, type: string, key: string, since: Date | null): Promise<boolean>
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
    | 'push_rule'          // 앱 푸시 드라이버(sendPush) 규칙에 걸림. 자세한 이유는 pushReason
    // ── 메시지엔진 1차: 모든 채널이 같이 지나는 규칙 ──
    | 'unknown_type'       // 유형 장부에 없는 유형
    | 'type_off'           // 유형 장부에서 꺼진 유형
    | 'route_not_allowed'  // 이 유형이 쓰지 않는 채널, 또는 받는 사람 종류(self/other)가 다르다
    | 'ad_not_allowed'     // 광고를 남에게(승인 카드) 보내려 했다
    | 'sms_ad_disabled'    // 광고 문자는 1차에 보내지 않는다
    | 'ad_title_prefix'    // 광고 제목이 「(광고)」로 시작하지 않는다
    | 'ad_quiet_hours'     // 광고는 21:00~08:00 금지 (모든 채널)
    | 'ad_no_consent'      // 그 채널의 광고 동의 칸이 꺼져 있다
    | 'ad_no_unsubscribe'  // 광고 메일 본문에 수신 거부 자리표시({{unsubscribe_url}})가 없다
    | 'unsubscribe_unavailable' // 수신 거부 서명 열쇠(MSG_UNSUBSCRIBE_SECRET)가 없어 거부 주소를 못 만든다
    | 'suppressed'         // 받지 않을 사람 명단에 있다
    | 'duplicate'          // 같은 소식을 이미 보냈다
    | 'daily_cap'          // 하루 3번(채널 다 합쳐서)을 다 썼다
    | 'ad_daily_cap'       // 광고 하루 1번
    | 'ad_weekly_cap'      // 광고 주 3번
    | 'check_failed'       // 규칙을 확인하지 못했다(DB 읽기 실패). 모르면 보내지 않는다

export interface DispatchInput {
    message: OutboundMessage
    audience: Audience
    /** 유형 장부 번호(registry.ts). 장부에 없거나 꺼진 유형은 막힌다 */
    type: string
    /** 같은 소식 겹침 막기(같은 사람 + 같은 type + 같은 key). withinMinutes 가 없으면 평생 1번 */
    dedupe?: { key: string; withinMinutes?: number }
    /** 캠페인 열쇠 {YYMMDD}_{짧은이름}. 기록에 남는다 */
    campaignKey?: string
    /** 관리자·캠페인 시험 발송. 하루 3번·조용한 시간·겹침을 건너뛰고 상한 셈에도 안 들어간다(광고 규칙·동의·명단은 그대로) */
    test?: boolean
    /** audience=other 일 때 필수. permission_requests.id */
    permissionRequestId?: string | null
    /** 보내는 봇의 승인 모드(team_bots.approval_mode). 모르면 always_ask */
    approvalMode?: ApprovalMode
    /**
     * 아이폰·안드로이드 앱 알림으로 보낸다(channel=push, audience=self 일 때만).
     * 있으면 웹푸시 대신 앱 푸시 드라이버(domains/push sendPush)로 간다.
     * 유형·정보/광고·겹침·시험 여부는 위 칸(type·dedupe·test)과 유형 장부에서 가져간다.
     */
    appPush?: {
        deeplink: string | null
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
    /** 광고 메일·문자 꼬리의 수신 거부 주소. null = 열쇠 없음. 기본 = consent.ts unsubscribeUrl */
    unsubscribeUrl?: (userId: string, route: Route) => string | null
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
