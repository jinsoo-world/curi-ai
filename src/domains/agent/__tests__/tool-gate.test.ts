import { describe, it, expect } from 'vitest'
import { gateTool, SAFE_TOOLS, IRREVERSIBLE_TOOLS } from '../tool-gate'

describe('agent/tool-gate — 승인선은 「되돌릴 수 있나」', () => {
    it.each([...SAFE_TOOLS])('안전한 도구는 그냥 통과: %s', (tool) => {
        expect(gateTool({ tool })).toEqual({ allowed: true, needsApproval: false })
    })

    it.each(Object.keys(IRREVERSIBLE_TOOLS))('되돌릴 수 없는 도구는 승인 카드 없이 못 간다: %s', (tool) => {
        const r = gateTool({ tool })
        expect(r.allowed).toBe(false)
        expect(r.needsApproval).toBe(true)
        if (r.needsApproval) expect(r.actionType).toBe(IRREVERSIBLE_TOOLS[tool])
    })

    it('승인 카드를 들고 오면 통과한다', () => {
        expect(gateTool({ tool: 'send_message', approvedRequestId: 'req-1' })).toEqual({ allowed: true, needsApproval: false })
    })

    it('초안만 만드는 봇(draft_only)은 승인이 있어도 밖으로 못 보낸다', () => {
        const r = gateTool({ tool: 'send_message', approvalMode: 'draft_only', approvedRequestId: 'req-1' })
        expect(r.allowed).toBe(false)
        expect(r.needsApproval).toBe(false)
    })

    it('목록에 없는 도구는 기본 거절(화이트리스트)', () => {
        const r = gateTool({ tool: 'run_shell' })
        expect(r.allowed).toBe(false)
        expect(r.needsApproval).toBe(false)
    })

    it('승인 카드가 있어도 모르는 도구는 열리지 않는다', () => {
        expect(gateTool({ tool: 'format_disk', approvedRequestId: 'req-9' }).allowed).toBe(false)
    })
})
