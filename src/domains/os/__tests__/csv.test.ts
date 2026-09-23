import { describe, it, expect } from 'vitest'
import { parseQaCsv } from '../csv'

describe('parseQaCsv — 질문,답 CSV 읽기', () => {
    it('평범한 쉼표 CSV', () => {
        const rows = parseQaCsv('환불 어떻게 하나요,마이페이지에서 신청하면 됩니다\n영수증 주세요,이메일로 보내드려요')
        expect(rows).toEqual([
            { question: '환불 어떻게 하나요', answer: '마이페이지에서 신청하면 됩니다' },
            { question: '영수증 주세요', answer: '이메일로 보내드려요' },
        ])
    })

    it('머리글 줄(질문,답)은 건너뛴다', () => {
        const rows = parseQaCsv('질문,답\n환불 되나요,됩니다')
        expect(rows).toEqual([{ question: '환불 되나요', answer: '됩니다' }])
    })

    it('영문 머리글(question,answer)도 건너뛴다', () => {
        const rows = parseQaCsv('Question,Answer\nHi,Hello')
        expect(rows).toEqual([{ question: 'Hi', answer: 'Hello' }])
    })

    it('따옴표 안 쉼표·줄바꿈·이스케이프 따옴표를 그대로 읽는다', () => {
        const csv = '"가격이, 얼마죠?","1번, 2번 있고\n""1번""을 추천해요"\n다른질문,다른답'
        const rows = parseQaCsv(csv)
        expect(rows).toEqual([
            { question: '가격이, 얼마죠?', answer: '1번, 2번 있고\n"1번"을 추천해요' },
            { question: '다른질문', answer: '다른답' },
        ])
    })

    it('빈 줄, 질문이나 답이 빈 줄은 버린다', () => {
        const rows = parseQaCsv('\n질문만,\n,답만\n\n진짜질문,진짜답\n')
        expect(rows).toEqual([{ question: '진짜질문', answer: '진짜답' }])
    })

    it('CRLF 줄바꿈도 읽는다', () => {
        const rows = parseQaCsv('질문1,답1\r\n질문2,답2\r\n')
        expect(rows).toEqual([
            { question: '질문1', answer: '답1' },
            { question: '질문2', answer: '답2' },
        ])
    })

    it('한글·이모지도 그대로 옮긴다', () => {
        const rows = parseQaCsv('큐리어스가 뭐예요?,AI 코스와 커뮤니티를 만드는 회사예요 😊')
        expect(rows).toEqual([{ question: '큐리어스가 뭐예요?', answer: 'AI 코스와 커뮤니티를 만드는 회사예요 😊' }])
    })

    it('셋째 칸부터는 무시한다', () => {
        const rows = parseQaCsv('질문,답,메모\nq1,a1,안 씀')
        expect(rows).toEqual([{ question: 'q1', answer: 'a1' }])
    })

    it('빈 글은 빈 목록', () => {
        expect(parseQaCsv('')).toEqual([])
        expect(parseQaCsv('   \n  \n')).toEqual([])
    })
})
