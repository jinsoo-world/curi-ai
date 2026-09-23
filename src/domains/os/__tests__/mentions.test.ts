import { describe, it, expect, beforeEach } from 'vitest'
import {
    detectMentionQuery,
    resolveMentionCursor,
    filterMentionBots,
    applyMentionInsertion,
    stripMentionToken,
    decidePersonalMentionRoute,
    handoffAckLine,
    stashPendingMentionSend,
    takePendingMentionSend,
    addBotCallUnread,
    clearBotCallUnread,
    readBotCallUnread,
} from '../mentions'

const 팀 = [
    { mentorId: 'm1', name: '비서실장' },
    { mentorId: 'm2', name: '글감봇' },
    { mentorId: 'm3', name: '요약봇' },
]

describe('detectMentionQuery', () => {
    it('@ 만 치면 빈 검색어로 연다', () => {
        expect(detectMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    })

    it('bare @ 도 연다 (커서 = 길이)', () => {
        expect(detectMentionQuery('@', '@'.length)).toEqual({ start: 0, query: '' })
    })

    it('전각 ＠ 도 @ 처럼 연다', () => {
        expect(detectMentionQuery('＠', 1)).toEqual({ start: 0, query: '' })
        expect(detectMentionQuery('＠글', 2)).toEqual({ start: 0, query: '글' })
        expect(detectMentionQuery('안녕 ＠요', 5)).toEqual({ start: 3, query: '요' })
    })

    it('@글 치면 검색어를 뽑는다', () => {
        expect(detectMentionQuery('@글', 2)).toEqual({ start: 0, query: '글' })
    })

    it('문장 중간 공백 뒤 @ 만 연다', () => {
        expect(detectMentionQuery('안녕 @요', 5)).toEqual({ start: 3, query: '요' })
    })

    it('이메일 안의 @ 는 안 연다', () => {
        expect(detectMentionQuery('a@b.com', 3)).toBeNull()
    })

    it('커서가 @ 앞이면 안 연다', () => {
        expect(detectMentionQuery('@글감', 0)).toBeNull()
    })

    it('공백을 치면 닫힌다', () => {
        expect(detectMentionQuery('@글 ', 3)).toBeNull()
    })
})

describe('resolveMentionCursor', () => {
    it('커서 0 인데 끝이 @ 이면 끝으로 고친다 (모바일 selectionStart=0)', () => {
        expect(resolveMentionCursor('@', 0)).toBe(1)
        expect(detectMentionQuery('@', resolveMentionCursor('@', 0))).toEqual({ start: 0, query: '' })
    })

    it('커서 0 인데 끝이 전각 ＠ 이면 끝으로 고친다', () => {
        expect(resolveMentionCursor('＠', 0)).toBe(1)
        expect(detectMentionQuery('＠', resolveMentionCursor('＠', 0))).toEqual({ start: 0, query: '' })
    })

    it('커서 0 이고 @검색어가 끝이면 길이로 고친다', () => {
        expect(resolveMentionCursor('@글', 0)).toBe(2)
        expect(detectMentionQuery('@글', resolveMentionCursor('@글', 0))).toEqual({ start: 0, query: '글' })
    })

    it('진짜로 커서 0 이고 @ 가 아니면 0 유지', () => {
        expect(resolveMentionCursor('안녕', 0)).toBe(0)
        expect(resolveMentionCursor('', 0)).toBe(0)
    })

    it('커서가 이미 뒤에 있으면 그대로', () => {
        expect(resolveMentionCursor('@글', 2)).toBe(2)
        expect(resolveMentionCursor('안녕 @', 4)).toBe(4)
    })
})

describe('filterMentionBots', () => {
    it('빈 검색어면 전부', () => {
        expect(filterMentionBots(팀, '')).toHaveLength(3)
    })

    it('이름으로 걸러 낸다', () => {
        expect(filterMentionBots(팀, '글').map(b => b.name)).toEqual(['글감봇'])
        expect(filterMentionBots(팀, '봇').map(b => b.mentorId)).toEqual(['m2', 'm3'])
    })

    it('이름 없는 항목은 뺀다', () => {
        expect(filterMentionBots([{ mentorId: 'x', name: '' }], '')).toEqual([])
    })
})

describe('applyMentionInsertion', () => {
    it('@검색어를 @이름 으로 바꾼다', () => {
        expect(applyMentionInsertion('@글', 0, 2, '글감봇')).toEqual({
            text: '@글감봇 ',
            cursor: '@글감봇 '.length,
        })
    })

    it('앞뒤 글을 지킨다', () => {
        expect(applyMentionInsertion('안녕 @요 부탁', 3, 5, '요약봇')).toEqual({
            text: '안녕 @요약봇  부탁',
            cursor: '안녕 @요약봇 '.length,
        })
    })
})

describe('stripMentionToken', () => {
    it('@이름을 떼어 낸다', () => {
        expect(stripMentionToken('@글감봇 내일 초안', '글감봇')).toBe('내일 초안')
        expect(stripMentionToken('내일 @글감봇 초안', '글감봇')).toBe('내일 초안')
    })

    it('멘션만 있으면 빈 문자열', () => {
        expect(stripMentionToken('@글감봇', '글감봇')).toBe('')
        expect(stripMentionToken('@글감봇   ', '글감봇')).toBe('')
    })
})

describe('decidePersonalMentionRoute — 1:1 넘기기(채널 유지)', () => {
    it('멘션 없으면 stay', () => {
        expect(decidePersonalMentionRoute('안녕하세요', 팀, 'm1')).toEqual({ action: 'stay' })
    })

    it('지금 봇을 @하면 stay (평소 대화)', () => {
        expect(decidePersonalMentionRoute('@비서실장 일정 알려줘', 팀, 'm1')).toEqual({ action: 'stay' })
    })

    it('다른 봇 @만 있으면 handoff (방 이동 없음)', () => {
        expect(decidePersonalMentionRoute('@글감봇', 팀, 'm1')).toEqual({
            action: 'handoff', mentorId: 'm2', name: '글감봇', message: '',
        })
        expect(decidePersonalMentionRoute('@글감봇   ', 팀, 'm1')).toEqual({
            action: 'handoff', mentorId: 'm2', name: '글감봇', message: '',
        })
    })

    it('다른 봇 @ + 내용이면 handoff (메시지 포함, 방 이동 없음)', () => {
        expect(decidePersonalMentionRoute('@요약봇 이 문단 줄여 줘', 팀, 'm1')).toEqual({
            action: 'handoff', mentorId: 'm3', name: '요약봇', message: '이 문단 줄여 줘',
        })
    })

    it('빈 말·빈 팀이면 stay', () => {
        expect(decidePersonalMentionRoute('', 팀, 'm1')).toEqual({ action: 'stay' })
        expect(decidePersonalMentionRoute('@글감봇', [], 'm1')).toEqual({ action: 'stay' })
    })
})

describe('handoffAckLine', () => {
    it('자연스러운 한국어 안내', () => {
        expect(handoffAckLine('글감봇')).toBe('글감봇에게도 전달할게요.')
    })
})

describe('bot call unread', () => {
    let mem: Record<string, string>
    let storage: Storage
    beforeEach(() => {
        mem = {}
        storage = {
            get length() { return Object.keys(mem).length },
            clear: () => { mem = {} },
            getItem: (k: string) => mem[k] ?? null,
            setItem: (k: string, v: string) => { mem[k] = v },
            removeItem: (k: string) => { delete mem[k] },
            key: () => null,
        } as Storage
    })
    it('더하고 빼면 비운다', () => {
        expect(addBotCallUnread(storage, 'm2')).toEqual(['m2'])
        expect(readBotCallUnread(storage)).toEqual(['m2'])
        expect(clearBotCallUnread(storage, 'm2')).toEqual([])
        expect(readBotCallUnread(storage)).toEqual([])
    })
})

describe('pending mention send (세션 저장소)', () => {
    let mem: Record<string, string>
    let storage: Storage

    beforeEach(() => {
        mem = {}
        storage = {
            get length() { return Object.keys(mem).length },
            clear: () => { mem = {} },
            getItem: (k: string) => mem[k] ?? null,
            setItem: (k: string, v: string) => { mem[k] = v },
            removeItem: (k: string) => { delete mem[k] },
            key: () => null,
        } as Storage
    })

    it('같은 봇이면 말을 꺼내고 지운다', () => {
        stashPendingMentionSend(storage, 'm2', '초안 부탁')
        expect(takePendingMentionSend(storage, 'm2')).toBe('초안 부탁')
        expect(takePendingMentionSend(storage, 'm2')).toBeNull()
    })

    it('다른 봇이면 null (키는 남겨 둔다)', () => {
        stashPendingMentionSend(storage, 'm2', '초안')
        expect(takePendingMentionSend(storage, 'm1')).toBeNull()
        expect(takePendingMentionSend(storage, 'm2')).toBe('초안')
    })

    it('빈 말·잘못된 저장은 무시', () => {
        stashPendingMentionSend(storage, 'm2', '   ')
        expect(storage.getItem('curi:pending-mention-send')).toBeNull()
        storage.setItem('curi:pending-mention-send', '{')
        expect(takePendingMentionSend(storage, 'm2')).toBeNull()
    })
})
