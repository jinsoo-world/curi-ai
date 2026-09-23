import { describe, it, expect } from 'vitest'
import {
    pickWorkingStatus, workingStatusPhases, WORKING_PHASE_MS, botWorkingLabel,
} from '../working-status'

describe('working-status — 대기 표지 로테이션', () => {
    it('맨 처음은 오로라 「답장 준비 중」', () => {
        const s = pickWorkingStatus(0, { botName: '글감봇' })
        expect(s.text).toBe('답장 준비 중')
        expect(s.aurora).toBe(true)
        expect(s.kind).toBe('preparing')
    })

    it('시간이 지나면 생각 중 → 이름 작업 중', () => {
        expect(pickWorkingStatus(WORKING_PHASE_MS, { botName: '글감봇' }).text).toBe('생각 중')
        expect(pickWorkingStatus(WORKING_PHASE_MS * 2, { botName: '글감봇' }).text).toBe('글감봇 작업 중')
    })

    it('hasFiles 일 때만 파일을 읽는 중 단계가 생긴다', () => {
        const plain = workingStatusPhases({ botName: '봇' }).map(p => p.text)
        expect(plain).not.toContain('파일을 읽는 중')
        const withFiles = workingStatusPhases({ botName: '봇', hasFiles: true }).map(p => p.text)
        expect(withFiles).toContain('파일을 읽는 중')
    })

    it('가운뎃점·긴 줄표를 쓰지 않는다', () => {
        for (const p of workingStatusPhases({ botName: '컨텐츠봇', hasFiles: true })) {
            expect(p.text).not.toMatch(/[·—]/)
        }
        expect(botWorkingLabel('글감봇')).not.toMatch(/[·—]/)
        expect(botWorkingLabel('글감봇')).toBe('글감봇 작업 중…')
    })
})
