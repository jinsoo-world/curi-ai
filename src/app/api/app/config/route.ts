// GET /api/app/config — 앱(아이폰·안드로이드)이 켜질 때 묻는 창구: 최소 버전 + 점검 안내.
//   { minVersion: { ios, android }, maintenance: { on, message } }
// 환경변수 (Vercel, 바꾸면 다음 배포·캐시 60초 뒤 반영):
//   APP_MIN_VERSION_IOS / APP_MIN_VERSION_ANDROID  이보다 낮은 앱은 「업데이트해 주세요」 (비우면 null = 막지 않음)
//   APP_MAINTENANCE_MESSAGE                         값이 있으면 점검 중(on=true) + 그 문구를 보여 준다
// 로그인 없이 부른다(앱이 로그인 전에 묻는다). 비밀 값은 없다. 캐시 60초.
import { NextResponse } from 'next/server'
import { appConfig } from '@/lib/app-config'

export const dynamic = 'force-dynamic'

export async function GET() {
    return NextResponse.json(appConfig(), {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    })
}
