// 앱 점검·최소 버전 값 읽기 (창구 = app/api/app/config). 라우트 파일은 GET 등만 내보낼 수 있어 여기 둔다.
// instagramConnect = 「내 SNS」 인스타그램 연결 버튼을 켤까 (INSTAGRAM_APP_ID·SECRET·REDIRECT_URI + CONNECTOR_SECRET_KEY 가 다 있을 때만)
import { instagramConnectEnabled } from '@/domains/os/instagram/core'

const VERSION_RE = /^\d+(\.\d+){0,3}$/

export function appConfig(env: Record<string, string | undefined> = process.env) {
    const ver = (v: string | undefined) => {
        const t = (v ?? '').trim()
        return VERSION_RE.test(t) ? t : null
    }
    const message = (env.APP_MAINTENANCE_MESSAGE ?? '').trim()
    return {
        minVersion: { ios: ver(env.APP_MIN_VERSION_IOS), android: ver(env.APP_MIN_VERSION_ANDROID) },
        maintenance: { on: message.length > 0, message: message ? message.slice(0, 500) : null },
        instagramConnect: instagramConnectEnabled(env),
    }
}
