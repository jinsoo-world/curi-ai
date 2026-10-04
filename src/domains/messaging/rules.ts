// domains/messaging — 보내는 규칙 (메시지엔진 설계서 1002 2장·4-1, 결정로그 2026-10-02).
//   앱 푸시에서 시작한 규칙을 모든 채널(앱 푸시·웹 푸시·메일·문자)이 같이 쓴다.
//   1인 하루 최대 3번(정보+광고, 채널 다 합쳐서), 광고 하루 1번·주 3번
//   광고 = 그 채널의 광고 수신 동의 칸이 켜진 사람만, 제목 앞 「(광고)」, 본문에 수신 거부 방법
//   광고 21:00~08:00 금지(정보통신망법 제50조). 정보 알림은 사용자 조용한 시간(기본 22:00~08:00) 보류
// 「하루」는 서울 자정 기준이다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export const DAILY_MAX = 3
export const AD_DAILY_MAX = 1
export const AD_WEEKLY_MAX = 3

export const AD_PREFIX = '(광고)'
/** 수신 거부에 로그인·본인인증을 요구하면 안 된다(정보통신망법 제50조 제5항). 설정 화면 한 곳이면 된다 */
export const AD_FOOTER = '수신 거부: 설정 > 알림'

/** 그 시각이 속한 서울 날의 자정(UTC 시각으로) */
export function kstDayStart(now: Date): Date {
    const shifted = now.getTime() + KST_OFFSET_MS
    const midnight = shifted - (((shifted % 86_400_000) + 86_400_000) % 86_400_000)
    return new Date(midnight - KST_OFFSET_MS)
}

/** 서울 날짜 'YYYY-MM-DD' */
export function kstDate(now: Date): string {
    return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 주 상한은 지난 7일(이 시각부터 거꾸로) */
export function weekWindowStart(now: Date): Date {
    return new Date(now.getTime() - 7 * 86_400_000)
}

export function kstHour(now: Date): number {
    return new Date(now.getTime() + KST_OFFSET_MS).getUTCHours()
}

/** 광고 금지 시간 = 서울 21:00 이상 또는 08:00 전 */
export function isAdQuietHour(now: Date): boolean {
    const h = kstHour(now)
    return h >= 21 || h < 8
}

export function hasAdPrefix(title: string): boolean {
    return title.trim().startsWith(AD_PREFIX)
}

/** 광고 본문 끝에 수신 거부 방법을 붙인다(이미 있으면 그대로) */
export function withAdFooter(body: string): string {
    const b = body.trim()
    return b.endsWith(AD_FOOTER) ? b : `${b}\n${AD_FOOTER}`
}

/** 광고 메일 본문에 꼭 있어야 하는 수신 거부 자리표시. 관문이 로그인 없이 누르는 거부 주소로 바꾼다 */
export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}'

export function hasUnsubscribePlaceholder(text: string | null | undefined): boolean {
    return !!text && text.includes(UNSUBSCRIBE_PLACEHOLDER)
}

export function fillUnsubscribe(text: string, url: string): string {
    return text.split(UNSUBSCRIBE_PLACEHOLDER).join(url)
}
