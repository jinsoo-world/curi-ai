import { describe, it, expect } from 'vitest'
import { safeNextPath } from '../safe-next'

// 로그인 뒤 돌아갈 주소(next)는 우리 사이트 안의 경로만 허용한다.
describe('safeNextPath — 로그인 뒤 돌아갈 주소 검사', () => {
    it('우리 사이트 경로는 그대로 통과한다', () => {
        expect(safeNextPath('/os')).toBe('/os')
        expect(safeNextPath('/os/chat/abc?demo=1')).toBe('/os/chat/abc?demo=1')
    })

    it('비어 있으면 null', () => {
        expect(safeNextPath(null)).toBeNull()
        expect(safeNextPath(undefined)).toBeNull()
        expect(safeNextPath('')).toBeNull()
        expect(safeNextPath('   ')).toBeNull()
    })

    it('다른 사이트로 새는 주소는 막는다', () => {
        expect(safeNextPath('//evil.com/os')).toBeNull()
        expect(safeNextPath('http://evil.com')).toBeNull()
        expect(safeNextPath('https://evil.com/os')).toBeNull()
        expect(safeNextPath('HTTP://evil.com')).toBeNull()
        expect(safeNextPath('javascript:alert(1)')).toBeNull()
        expect(safeNextPath('/\\evil.com')).toBeNull()
        expect(safeNextPath('os')).toBeNull()          // 슬래시로 시작 안 함
    })

    it('줄바꿈·제어문자가 섞이면 막는다', () => {
        expect(safeNextPath('/os\n')).toBeNull()
        expect(safeNextPath('/os\rSet-Cookie: a=b')).toBeNull()
    })
})
