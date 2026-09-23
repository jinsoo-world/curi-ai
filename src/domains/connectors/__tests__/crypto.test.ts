// 연결 열쇠 잠그기 — 인터넷·DB 없이 확인한다.
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import {
    ConnectorKeyMissing, connectorsEnabled, decryptSecret, encryptSecret,
    maskSecret, readConnectorKey, requireConnectorKey,
} from '../crypto'
import { isSlackWebhookUrl, slackWebhookHint } from '../slack'
import { looksLikeNotionToken, normalizeNotionId, notionBlocksToText, notionPageTitle } from '../notion'
import { cleanKind, isReadyKind } from '../types'

const 자물쇠 = randomBytes(32)

describe('열쇠 잠그기·풀기 (AES-256-GCM)', () => {
    it('잠근 것을 그대로 되돌린다', () => {
        const 토큰 = 'ntn_비밀토큰_1234567890'
        const 잠김 = encryptSecret(토큰, 자물쇠)
        expect(잠김).not.toContain('비밀토큰')       // DB 에 원문이 안 남는다
        expect(잠김.startsWith('v1.')).toBe(true)
        expect(decryptSecret(잠김, 자물쇠)).toBe(토큰)
    })

    it('같은 글을 두 번 잠가도 결과가 다르다(같은 열쇠인지 눈으로 못 알아본다)', () => {
        const a = encryptSecret('같은 글', 자물쇠)
        const b = encryptSecret('같은 글', 자물쇠)
        expect(a).not.toBe(b)
        expect(decryptSecret(a, 자물쇠)).toBe(decryptSecret(b, 자물쇠))
    })

    it('중간에 한 글자라도 고쳐졌거나 다른 자물쇠면 풀리지 않는다', () => {
        const 잠김 = encryptSecret('열쇠 하나', 자물쇠)
        const 고친것 = 잠김.slice(0, -2) + (잠김.endsWith('A') ? 'BB' : 'AA')
        expect(() => decryptSecret(고친것, 자물쇠)).toThrow()
        expect(() => decryptSecret(잠김, randomBytes(32))).toThrow()
        expect(() => decryptSecret('아무 글', 자물쇠)).toThrow('잠긴 내용의 모양이 아니다')
    })

    it('자물쇠가 없거나 길이가 틀리면 기능이 꺼진다 (잠그지 않고 저장하는 길은 없다)', () => {
        expect(readConnectorKey('')).toBeNull()
        expect(readConnectorKey('짧은열쇠')).toBeNull()
        expect(connectorsEnabled('')).toBe(false)
        expect(connectorsEnabled(randomBytes(32).toString('base64'))).toBe(true)
        expect(() => requireConnectorKey('')).toThrow(ConnectorKeyMissing)
    })

    it('화면에는 끝 4자만 보여 준다', () => {
        expect(maskSecret('ntn_abcdefgh1234')).toBe('••••1234')
        expect(maskSecret('12')).toBe('••••')
    })
})

describe('슬랙 웹훅 주소 확인', () => {
    it('슬랙이 준 진짜 주소만 받는다 (아무 주소나 받으면 우리 서버가 남을 대신 두드린다)', () => {
        expect(isSlackWebhookUrl('https://hooks.slack.com/services/T000/B000/abcdefghijkl')).toBe(true)
        expect(isSlackWebhookUrl('https://hooks.slack.com.남의서버.com/services/x')).toBe(false)
        expect(isSlackWebhookUrl('http://hooks.slack.com/services/T000/B000/abcdefghijkl')).toBe(false)
        expect(isSlackWebhookUrl('https://example.com/webhook')).toBe(false)
        expect(isSlackWebhookUrl('')).toBe(false)
    })

    it('화면에는 끝 4자만', () => {
        expect(slackWebhookHint('https://hooks.slack.com/services/T000/B000/abcdefghijkl')).toBe('••••ijkl')
    })
})

describe('노션 값 다루기', () => {
    it('토큰처럼 생겼는지 미리 본다', () => {
        expect(looksLikeNotionToken('ntn_1234567890abcdefghijklmnop')).toBe(true)
        expect(looksLikeNotionToken('secret_1234567890abcdefghijklmnop')).toBe(true)
        expect(looksLikeNotionToken('그냥 아무 글')).toBe(false)
    })

    it('문서 주소를 통째로 넣어도 번호만 꺼낸다', () => {
        expect(normalizeNotionId('https://www.notion.so/내문서-1234567890abcdef1234567890abcdef'))
            .toBe('12345678-90ab-cdef-1234-567890abcdef')
        expect(normalizeNotionId('12345678-90ab-cdef-1234-567890abcdef'))
            .toBe('12345678-90ab-cdef-1234-567890abcdef')
        expect(normalizeNotionId('번호 없음')).toBe('')
    })

    it('제목 칸 이름이 문서마다 달라도 찾는다', () => {
        expect(notionPageTitle({ properties: { 이름: { type: 'title', title: [{ plain_text: '9월 회고' }] } } })).toBe('9월 회고')
        expect(notionPageTitle({ properties: { 상태: { type: 'select' } } })).toBe('제목 없는 문서')
        expect(notionPageTitle(null)).toBe('제목 없는 문서')
    })

    it('블록에서 사람이 읽는 글만 뽑는다', () => {
        const text = notionBlocksToText([
            { type: 'heading_1', heading_1: { rich_text: [{ plain_text: '머리글' }] } },
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: '본문 한 줄' }] } },
            { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: '목록' }] } },
            { type: 'to_do', to_do: { rich_text: [{ plain_text: '할 일' }], checked: true } },
            { type: 'image', image: {} },
        ])
        expect(text).toContain('머리글')
        expect(text).toContain('- 목록')
        expect(text).toContain('- [x] 할 일')
        expect(notionBlocksToText([])).toBe('')
    })
})

describe('연결 종류', () => {
    it('지금 붙일 수 있는 것은 노션·슬랙뿐이다', () => {
        expect(cleanKind('notion')).toBe('notion')
        expect(cleanKind('트위터')).toBeNull()
        expect(isReadyKind('notion')).toBe(true)
        expect(isReadyKind('slack')).toBe(true)
        expect(isReadyKind('kakao')).toBe(false)
        expect(isReadyKind('instagram')).toBe(false)
        expect(isReadyKind('curious')).toBe(false)
    })
})
