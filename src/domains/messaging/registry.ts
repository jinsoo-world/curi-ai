// domains/messaging — 유형 장부 (메시지엔진 설계서 1002 4-2).
//
// 밖으로 나가는 메시지는 전부 여기 적힌 유형 중 하나다. 장부에 없는 유형은 관문이 막는다(unknown_type).
// 정보/광고는 이 장부의 category 칸 하나로만 정한다(상한·동의 판정이 이 칸을 본다. 설계서 2장 16번).
//
// 켬/끔:
//   - 기본값(defaultOn)은 「이미 운영에서 나가고 있던 것」만 켬이다. 나머지는 전부 꺼짐.
//   - 대표가 관리자 화면 /admin/os/messages 에서 켜고 끈다. 그 값은 message_types 표에 한 줄로 남고 기본값보다 앞선다.
//   - 자동 알림은 「유형을 켜는 순간」이 대표 승인이다. 캠페인(여러 명에게 한 번에)은 매번 따로 승인한다(campaign.ts).

export type Route = 'app_push' | 'web_push' | 'email' | 'sms'
export type Category = 'info' | 'ad'

export const ROUTES: Route[] = ['app_push', 'web_push', 'email', 'sms']

export interface MessageTypeDef {
    type: string
    /** 관리자 화면에 보이는 이름 */
    name: string
    category: Category
    /** 이 유형이 쓸 수 있는 채널(순서 = 고르는 순서) */
    routes: Route[]
    /** self = 회원 본인에게 / other = 봇이 남에게(승인 카드) / campaign = 여러 명에게 한 번에(캠페인 절차) */
    audience: 'self' | 'other' | 'campaign'
    /** 처음 값. 운영에서 이미 나가던 것만 true */
    defaultOn: boolean
    /** 1인 하루 3번에 들어가나. 시험·인증번호는 안 들어간다 */
    countsTowardCap: boolean
    /** 관리자 화면에서 끌 수 있나. 인증번호처럼 끄면 가입이 막히는 것은 false */
    toggleable: boolean
    /** 관문(dispatch)을 지나나. false 면 그 자리에서 직접 보낸다(이유를 note 에) */
    viaGateway: boolean
    /** 어디서 나가나 / 왜 이렇게 했나 */
    note: string
}

const def = (d: Partial<MessageTypeDef> & Pick<MessageTypeDef, 'type' | 'name' | 'category' | 'routes' | 'note'>): MessageTypeDef => ({
    audience: 'self', defaultOn: false, countsTowardCap: true, toggleable: true, viaGateway: true, ...d,
})

export const MESSAGE_TYPES: readonly MessageTypeDef[] = [
    // ── 이미 운영에서 나가던 것 = 켬 ──
    def({ type: 'P001', name: '매일 루틴 결과', category: 'info', routes: ['app_push'], defaultOn: true, note: '루틴 성공 시 cron/routines → notifyNative. 하루 1번' }),
    def({ type: 'P014', name: '봇 글 허락 기다림', category: 'info', routes: ['app_push'], defaultOn: true, note: '승인 카드 생김. 10분 안 여러 건은 1개' }),
    def({ type: 'P025', name: '단체방 답 도착', category: 'info', routes: ['app_push'], defaultOn: true, note: '방마다 10분 1개' }),
    def({ type: 'P033', name: '공개 봇 검사 통과', category: 'info', routes: ['app_push'], defaultOn: true, note: 'publish-gate. 봇마다 1번' }),
    def({ type: 'P034', name: '공개 전 한 번 더 확인 중', category: 'info', routes: ['app_push'], defaultOn: true, note: 'publish-gate. 봇마다 1번' }),
    def({ type: 'P035', name: '공개하려면 고칠 곳', category: 'info', routes: ['app_push'], defaultOn: true, note: 'publish-gate. 검사 1번당 1번' }),
    def({ type: 'P089', name: '3일 안부', category: 'ad', routes: ['app_push'], defaultOn: true, note: '광고. cron/push-checkin 매일 서울 10시. 7일에 1번' }),
    def({ type: 'P042', name: '내 봇을 팀에 들임', category: 'info', routes: ['web_push', 'app_push'], defaultOn: true, note: 'team-link 웹 푸시(이미 운영 중). 하루 묶음은 2차' }),
    def({ type: 'OWNER_NOTIFY', name: '봇이 나에게 보내는 알림', category: 'info', routes: ['web_push', 'email', 'sms'], defaultOn: true, note: '/api/os/messages/notify-me. 받는 곳은 내 것만. 문자는 SMS_ENABLED 꺼짐' }),
    def({ type: 'BOT_OUTBOUND', name: '봇이 남에게 보내는 메일', category: 'info', routes: ['email', 'sms', 'web_push'], audience: 'other', defaultOn: true, countsTowardCap: false, note: '/api/os/messages/send. 승인 카드 + 하루 20통·새 사람 5명 잠금(#32). 문자는 꺼짐. 웹 푸시는 카드 주인 기기로만 간다(예전 그대로)' }),
    def({ type: 'TEST', name: '관리자 시험 알림', category: 'info', routes: ['app_push'], defaultOn: true, countsTowardCap: false, note: '/api/admin/push/test. 상한에 안 들어간다' }),
    def({ type: 'SUPPORT_NOTIFY', name: '고객센터 문의 도착(회사 메일함)', category: 'info', routes: ['email'], defaultOn: true, countsTowardCap: false, viaGateway: false, note: '회원이 아니라 회사 메일함으로 간다. 관문 대신 그 자리에서 이 장부의 켬/끔만 본다' }),
    def({ type: 'AUTH_OTP', name: '무료체험 휴대폰 인증번호', category: 'info', routes: ['sms'], defaultOn: true, countsTowardCap: false, toggleable: false, viaGateway: false, note: '본인이 방금 요청한 인증번호. 끄면 가입이 막혀 끌 수 없다. 관문 밖(trial/send-code)' }),

    // ── 앱 푸시 1차 15종 중 아직 안 만든 것 = 꺼짐 ──
    def({ type: 'P002', name: '루틴을 못 했어요', category: 'info', routes: ['app_push'], note: '1차 후보. 아직 보내는 코드 없음' }),
    def({ type: 'P058', name: '자료를 다 읽음', category: 'info', routes: ['app_push'], note: '1차 후보. 아직 보내는 코드 없음' }),
    def({ type: 'P072', name: '결제 완료', category: 'info', routes: ['app_push', 'email'], note: '1차 후보. 아직 보내는 코드 없음' }),
    def({ type: 'P073', name: '정기결제 실패', category: 'info', routes: ['app_push', 'email'], note: '1차 후보. 아직 보내는 코드 없음' }),
    def({ type: 'P078', name: '이달 대화를 다 씀', category: 'info', routes: ['app_push'], note: '1차 후보. 아직 보내는 코드 없음' }),
    def({ type: 'P092', name: '30일, 알림을 쉬어 감', category: 'info', routes: ['app_push'], note: '1차 후보. 아직 보내는 코드 없음' }),
    def({ type: 'P124', name: '알림이 잘 와요', category: 'info', routes: ['app_push', 'web_push'], note: '1차 후보. 아직 보내는 코드 없음' }),

    // ── 캠페인(여러 명에게 한 번에) = 꺼짐. 켜도 매번 시험 → 대표 승인 절차를 지난다 ──
    def({ type: 'CAMPAIGN_AD_PUSH', name: '광고 캠페인(앱·웹 푸시)', category: 'ad', routes: ['app_push', 'web_push'], audience: 'campaign', note: '캠페인 절차 전용' }),
    def({ type: 'CAMPAIGN_AD_EMAIL', name: '광고 캠페인(메일)', category: 'ad', routes: ['email'], audience: 'campaign', note: '캠페인 절차 전용. 메일 채널 개통(1차 7번) 전에는 열쇠가 없어 나가지 않는다' }),
    def({ type: 'CAMPAIGN_INFO', name: '공지 캠페인(정보)', category: 'info', routes: ['app_push', 'web_push', 'email'], audience: 'campaign', note: '캠페인 절차 전용. 대상은 회원 번호 목록으로만' }),
]

const BY_TYPE = new Map(MESSAGE_TYPES.map(t => [t.type, t]))

export function getTypeDef(type: string | null | undefined): MessageTypeDef | null {
    return type ? BY_TYPE.get(type) ?? null : null
}

/** 켬/끔 = 표에 적힌 값(있으면) → 없으면 기본값. 끌 수 없는 유형은 늘 켬 */
export function effectiveOn(d: MessageTypeDef, override: boolean | null | undefined): boolean {
    if (!d.toggleable) return true
    return typeof override === 'boolean' ? override : d.defaultOn
}

/** 운영에서 처음부터 켜져 있는 유형 (PR 본문·관리자 화면용) */
export function defaultOnTypes(): string[] {
    return MESSAGE_TYPES.filter(t => t.defaultOn).map(t => t.type)
}
