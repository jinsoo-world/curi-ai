// domains/push — 아이폰·안드로이드 앱 알림(네이티브 푸시) 타입.
// 웹푸시(domains/messaging/drivers/push.ts)와 따로 간다. 웹푸시는 브라우저 구독, 여기는 앱 기기 번호.

export type Platform = 'ios' | 'android'
export type ApnsEnv = 'sandbox' | 'production'
/** info = 사용자가 기다리는 소식(동의 없이 보냄) / ad = 다시 오라는 권유(광고 동의자만) */
export type PushCategory = 'info' | 'ad'

/** push_devices 한 줄 (보낼 때 필요한 칸만) */
export interface PushDevice {
    id: string
    userId: string
    platform: Platform
    token: string
    apnsEnv: ApnsEnv | null
}

export interface PushInput {
    userId: string
    /** 알림 종류 번호. 설계서 번호(P001 등) 또는 TEST */
    type: string
    category: PushCategory
    title: string
    body: string
    /** 누르면 갈 곳. curiai://bot/{id} · curiai://group/{id} · curiai://home (약속 = deeplink.ts) */
    deeplink?: string | null
    /**
     * 같은 소식 겹침 막기. 같은 사람 + 같은 type + 같은 key 로 이미 보낸 게 있으면 안 보낸다.
     * withinMinutes 가 없으면 기한 없이(평생 1번), 있으면 그 분 안에서만 막는다.
     */
    dedupe?: { key: string; withinMinutes?: number }
    /** 관리자 시험 발송 전용. 하루 상한·조용한 시간·설정 꺼짐을 건너뛴다(광고 규칙은 그대로) */
    ignoreLimits?: boolean
}

export type BlockReason =
    | 'not_configured'      // 열쇠(환경변수)가 없다
    | 'no_device'           // 받을 기기가 없다
    | 'push_off'            // 사용자가 알림 설정에서 푸시를 껐다
    | 'daily_cap'           // 하루 3번을 다 썼다
    | 'ad_daily_cap'        // 광고는 하루 1번
    | 'ad_weekly_cap'       // 광고는 주 3번
    | 'ad_no_consent'       // 광고 수신 동의가 없다
    | 'ad_title_prefix'     // 광고 제목이 「(광고)」로 시작하지 않는다
    | 'ad_quiet_hours'      // 광고는 21:00~08:00 금지 (정보통신망법 제50조)
    | 'quiet_hours'         // 정보 알림도 사용자의 조용한 시간(기본 22:00~08:00)엔 보류
    | 'duplicate'           // 같은 소식을 이미 보냈다

/** 기기 하나에 보낸 결과 */
export type DeliveryResult =
    | { ok: true }
    | { ok: false; error: string; /** 기기 번호가 죽었다 = 그 기기를 끈다 */ disable: boolean }

export interface PushMessage {
    title: string
    body: string
    deeplink: string | null
    type: string
    /** push_sends.id. 앱이 눌렸을 때 /api/push/opened 로 돌려준다 */
    sendId: string
}

/** 실제로 애플·구글에 보내는 것. 시험에서는 가짜로 갈아 끼운다 */
export interface Transport {
    ready(): boolean
    send(device: PushDevice, msg: PushMessage): Promise<DeliveryResult>
}

export interface PushSendRow {
    id: string
    userId: string
    deviceId: string | null
    batchId: string
    pushType: string
    category: PushCategory
    title: string
    body: string
    deeplink: string | null
    dedupeKey: string | null
    status: 'sent' | 'failed' | 'blocked'
    error: string | null
}

/** sendPush 가 DB 에 묻는 것. 시험에서는 가짜로 갈아 끼운다 */
export interface PushStore {
    listDevices(userId: string): Promise<PushDevice[]>
    /** since 이후 「보냄」 묶음(batch) 수. category 를 주면 그 종류만 */
    countSentBatches(userId: string, since: Date, category?: PushCategory): Promise<number>
    /** 같은 type + key 로 보낸 적이 있나(since 가 있으면 그 뒤로만) */
    hasSent(userId: string, type: string, key: string, since: Date | null): Promise<boolean>
    /** users.marketing_consent */
    hasMarketingConsent(userId: string): Promise<boolean>
    /** notification_prefs (없으면 push 켬, 22:00~08:00) */
    getPrefs(userId: string): Promise<{ push: boolean; quietFrom: string | null; quietTo: string | null }>
    insertSends(rows: PushSendRow[]): Promise<void>
    disableDevice(deviceId: string, reason: string): Promise<void>
}

export interface PushDeps {
    store: PushStore
    transports: Record<Platform, Transport>
    now?: () => Date
    newId?: () => string
}

export type PushOutcome =
    | { skipped: 'not_configured' }
    | { status: 'blocked'; reason: BlockReason }
    | { status: 'sent' | 'failed'; batchId: string; delivered: number; failed: number; disabled: number; sendIds: string[] }
