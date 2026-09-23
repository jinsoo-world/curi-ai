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

    it('시간이 지나면 생각 중 → 찾아보는 중 → 이름 작업 중', () => {
        expect(pickWorkingStatus(WORKING_PHASE_MS, { botName: '글감봇' }).text).toBe('생각 중')
        expect(pickWorkingStatus(WORKING_PHASE_MS * 2, { botName: '글감봇' }).text).toBe('찾아보는 중')
        expect(pickWorkingStatus(WORKING_PHASE_MS * 3, { botName: '글감봇' }).text).toBe('글감봇 작업 중')
    })

    it('연결 중·실행 중 단계를 포함하고 이름과 자연스럽게 붙인다', () => {
        const texts = workingStatusPhases({ botName: '개발팀장' }).map(p => p.text)
        expect(texts).toContain('개발팀장 작업 중')
        expect(texts).toContain('개발팀장에 연결 중')
        expect(texts).toContain('개발팀장 실행 중')
        expect(texts).toContain('찾아보는 중')
        expect(texts).toContain('생각 중')
        expect(texts).toContain('답장 준비 중')
    })

    it('이름이 없으면 연결 중·실행 중·작업 중으로 떨어진다', () => {
        const texts = workingStatusPhases({}).map(p => p.text)
        expect(texts).toContain('작업 중')
        expect(texts).toContain('연결 중')
        expect(texts).toContain('실행 중')
        expect(texts).not.toContain('에 연결 중')
    })

    it('모든 단계는 오로라를 켠다', () => {
        for (const p of workingStatusPhases({ botName: '봇', hasFiles: true })) {
            expect(p.aurora).toBe(true)
        }
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

    it('가짜 도구/커넥터 제품명을 넣지 않는다', () => {
        const blob = workingStatusPhases({ botName: '개발팀장', hasFiles: true }).map(p => p.text).join(' ')
        expect(blob).not.toMatch(/Gmail|Slack|Notion|Drive|Jira|GitHub/i)
    })
})
