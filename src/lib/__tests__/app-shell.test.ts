import { describe, it, expect } from 'vitest'
import { isIosAppUserAgent, IOS_APP_UA_TOKEN, APP_PLAN_NOTE } from '../app-shell'
import { limitReachedMessage } from '@/domains/os/usage'

describe('앱 표시', () => {
    it('앱 껍데기 표시가 있는 요청만 앱으로 본다', () => {
        expect(isIosAppUserAgent(`Mozilla/5.0 (iPhone) AppleWebKit ${IOS_APP_UA_TOKEN}`)).toBe(true)
        expect(isIosAppUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(false)
        expect(isIosAppUserAgent('')).toBe(false)
        expect(isIosAppUserAgent(null)).toBe(false)
    })
    it('앱 안내 한 줄에는 링크, 가격, 가운뎃점, 긴 줄표가 없다', () => {
        expect(APP_PLAN_NOTE).toBe('요금제는 웹사이트에서 확인할 수 있어요')
        expect(APP_PLAN_NOTE).not.toMatch(/https?:|www\.|원|₩|[·—–]/)
    })
    it('한도 안내: 웹은 요금제를 권하고, 앱은 권하지 않는다', () => {
        const at = new Date('2026-11-01T00:00:00+09:00')
        expect(limitReachedMessage(at)).toContain('요금제를 올려 보세요')
        expect(limitReachedMessage(at, { iosApp: true })).not.toContain('요금제')
        expect(limitReachedMessage(at, { iosApp: true })).toContain('다시 채워져요')
    })
})
