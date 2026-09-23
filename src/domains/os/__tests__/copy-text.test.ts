import { describe, it, expect } from 'vitest'
import { plainMessageCopyText } from '../copy-text'

describe('plainMessageCopyText', () => {
    it('굵게 표시를 걷어 낸다', () => {
        expect(plainMessageCopyText('안녕 **세계**')).toBe('안녕 세계')
    })

    it('빈 값', () => {
        expect(plainMessageCopyText(null)).toBe('')
        expect(plainMessageCopyText(undefined)).toBe('')
        expect(plainMessageCopyText('')).toBe('')
    })

    it('@멘션은 그대로 둔다', () => {
        expect(plainMessageCopyText('@홍보팀장 초안 부탁')).toBe('@홍보팀장 초안 부탁')
    })
})
