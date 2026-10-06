import { describe, it, expect } from 'vitest'
import { GET } from '../route'
import { appConfig } from '@/lib/app-config'

describe('앱 점검·최소 버전 창구 /api/app/config', () => {
    it('환경변수가 없으면 막지 않는다', () => {
        expect(appConfig({})).toEqual({ minVersion: { ios: null, android: null }, maintenance: { on: false, message: null } })
    })
    it('최소 버전·점검 문구를 그대로 준다(버전 모양이 이상하면 null)', () => {
        expect(appConfig({ APP_MIN_VERSION_IOS: '1.2.0', APP_MIN_VERSION_ANDROID: 'abc', APP_MAINTENANCE_MESSAGE: ' 10시까지 점검해요 ' }))
            .toEqual({ minVersion: { ios: '1.2.0', android: null }, maintenance: { on: true, message: '10시까지 점검해요' } })
    })
    it('캐시 60초', async () => {
        const res = await GET()
        expect(res.headers.get('cache-control')).toContain('max-age=60')
        expect(await res.json()).toHaveProperty('minVersion')
    })
})
