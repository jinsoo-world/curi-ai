import { describe, it, expect } from 'vitest'
import { GET } from '../route'
import { appConfig } from '@/lib/app-config'

describe('앱 점검·최소 버전 창구 /api/app/config', () => {
    it('환경변수가 없으면 막지 않는다', () => {
        expect(appConfig({})).toEqual({ minVersion: { ios: null, android: null }, maintenance: { on: false, message: null }, instagramConnect: false })
    })
    it('최소 버전·점검 문구를 그대로 준다(버전 모양이 이상하면 null)', () => {
        expect(appConfig({ APP_MIN_VERSION_IOS: '1.2.0', APP_MIN_VERSION_ANDROID: 'abc', APP_MAINTENANCE_MESSAGE: ' 10시까지 점검해요 ' }))
            .toEqual({ minVersion: { ios: '1.2.0', android: null }, maintenance: { on: true, message: '10시까지 점검해요' }, instagramConnect: false })
    })
    it('인스타그램 연결은 앱 설정 3개 + 연결 자물쇠가 다 있을 때만 켠다', () => {
        const ig = {
            INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's', INSTAGRAM_REDIRECT_URI: 'https://www.curi-ai.com/api/sns/instagram/callback',
            CONNECTOR_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
        }
        expect(appConfig(ig).instagramConnect).toBe(true)
        expect(appConfig({ ...ig, INSTAGRAM_APP_SECRET: '' }).instagramConnect).toBe(false)
        expect(appConfig({ ...ig, CONNECTOR_SECRET_KEY: '' }).instagramConnect).toBe(false)
        expect(JSON.stringify(appConfig(ig))).not.toContain('"s"')   // 비밀값은 안 나간다
    })
    it('캐시 60초', async () => {
        const res = await GET()
        expect(res.headers.get('cache-control')).toContain('max-age=60')
        expect(await res.json()).toHaveProperty('minVersion')
    })
})
