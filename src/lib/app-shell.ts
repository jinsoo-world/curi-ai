// 아이폰 앱 안에서 열렸는지 알아보기 (2026-10-05).
// 애플 앱스토어 3.1.1: 앱 안에서는 웹 카드결제(토스)나 가격을 밀어 주는 결제 안내를 보이면 안 된다.
// 앱 껍데기(Capacitor, ios/)는 두 가지 표시를 남긴다.
//   1) 화면 쪽: window.Capacitor.getPlatform() === 'ios'  (앱을 새로 빌드하지 않아도 이미 있다)
//   2) 서버 쪽: 요청의 User-Agent 에 「CuriAIApp/ios」 (capacitor.config.ts 의 ios.appendUserAgent. 앱을 다시 빌드해야 붙는다)
// 웹 브라우저에서는 둘 다 없으므로 웹 화면은 하나도 안 바뀐다.

export const IOS_APP_UA_TOKEN = 'CuriAIApp/ios'

/** 서버에서: 이 요청이 아이폰 앱 안에서 왔나 */
export function isIosAppUserAgent(ua: string | null | undefined): boolean {
    return typeof ua === 'string' && ua.includes(IOS_APP_UA_TOKEN)
}

type CapacitorLike = { getPlatform?: () => string }

/** 화면에서: 아이폰 앱 안인가 (브라우저에서만 부른다) */
export function isIosAppClient(): boolean {
    if (typeof window === 'undefined') return false
    try {
        const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor
        if (cap?.getPlatform?.() === 'ios') return true
    } catch { /* 없으면 웹 */ }
    return isIosAppUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '')
}

/** 앱 안에서 결제 자리에 대신 보이는 한 줄. 링크도 가격도 없다 */
export const APP_PLAN_NOTE = '요금제는 웹사이트에서 확인할 수 있어요'
