import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('목소리 올리기 — 일레븐랩스 마감 (코드 모양)', () => {
    it('일레븐랩스 두 요청(지우기·클론)에 15초 마감을 건다', () => {
        const src = readFileSync('src/app/api/tts/upload-voice/route.ts', 'utf8')
        expect(src).toContain('const ELEVENLABS_TIMEOUT_MS = 15_000')
        const fetches = src.match(/fetch\(`?'?https:\/\/api\.elevenlabs\.io[^]*?\}\)/g) ?? []
        expect(fetches).toHaveLength(2)
        for (const f of fetches) expect(f).toContain('signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS)')
    })
})
