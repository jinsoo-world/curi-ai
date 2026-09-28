import { describe, it, expect } from 'vitest'
import { removeMentionBeforeCaret } from '../mentions'

const names = ['기획팀장', '홍보팀장']

describe('removeMentionBeforeCaret: 지우기 한 번에 칩 통째로', () => {
    it('칩 뒤 한 칸 뒤에서 지우면 「@이름 」 이 통째로 빠진다', () => {
        expect(removeMentionBeforeCaret('@기획팀장 ', 6, names)).toEqual({ text: '', cursor: 0 })
    })
    it('칩 바로 뒤에서 지워도 통째로 빠지고 뒤 글은 남는다', () => {
        expect(removeMentionBeforeCaret('안녕 @기획팀장 오늘', 8, names)).toEqual({ text: '안녕 오늘', cursor: 3 })
    })
    it('칩과 상관없는 자리면 null (평소처럼 한 글자)', () => {
        expect(removeMentionBeforeCaret('@기획팀장 안녕', 8, names)).toBeNull()
        expect(removeMentionBeforeCaret('그냥 글', 4, names)).toBeNull()
    })
    it('봇 이름이 아닌 @글자는 건드리지 않는다', () => {
        expect(removeMentionBeforeCaret('@아무개 ', 5, names)).toBeNull()
    })
})
