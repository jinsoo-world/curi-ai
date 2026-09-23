// domains/os — 봇 모양/색이 바뀌면 단톡에서 다른 봇이 눈치채고, 바뀐 봇이 받아친다.
// 1순위: 솔라 미니로 각 봇 페르소나 톤의 한 줄씩. 실패 시 템플릿(+역할 편향) 폴백.
// 제품 카피: 가운뎃점(·) · 긴 줄표(—) 금지.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
    listChannels, getChannelBots, saveChannelMessage, ChannelTableMissing,
} from './channels'
import type { ChannelMessage } from './channels'
import type { BotColor, BotShape } from './types'
import { askSolar } from '@/domains/agent/ask'
import { SOLAR_MINI_MODEL } from '@/domains/llm/constants'

export type LookChangeKind = 'color' | 'shape' | 'both'

/** 저장 한 번에 같은 봇으로 연속 비트 안 남기게 (빠른 토글 방지) */
export const LOOK_BEAT_COOLDOWN_MS = 45_000

/** 사이드 비트용 솔라 타임아웃 (PATCH 를 오래 붙잡지 않음) */
export const LOOK_BANTER_TIMEOUT_MS = 4_500

/** 페르소나 발췌 상한 (토큰 절약) */
export const PERSONA_EXCERPT_CHARS = 220

const lastBeatAt = new Map<string, number>()

function beatKey(userId: string, mentorId: string) {
    return `${userId}:${mentorId}`
}

/** 순수: 쿨다운 안이면 false. 시험용으로 now/map 주입 가능 */
export function shouldPostLookBeat(
    userId: string,
    mentorId: string,
    now = Date.now(),
    store: Map<string, number> = lastBeatAt,
): boolean {
    const prev = store.get(beatKey(userId, mentorId))
    if (prev === undefined) return true
    return now - prev >= LOOK_BEAT_COOLDOWN_MS
}

export function markLookBeatPosted(
    userId: string,
    mentorId: string,
    now = Date.now(),
    store: Map<string, number> = lastBeatAt,
): void {
    store.set(beatKey(userId, mentorId), now)
}

/** patch 에 shape/color 가 실제로 들어왔는지 → 비트 종류. 둘 다 없으면 null */
export function classifyLookChange(patch: {
    shape?: BotShape | string
    color?: BotColor | string
}): LookChangeKind | null {
    const shape = patch.shape !== undefined
    const color = patch.color !== undefined
    if (shape && color) return 'both'
    if (color) return 'color'
    if (shape) return 'shape'
    return null
}

/** 머리색/색 눈치채기 — 위트·하찮음·귀여움. 매번 다르게 뽑는다 */
export const NOTICE_COLOR: readonly string[] = [
    '머리색 바꿨네?',
    '오늘 유독 반짝이는데',
    '누가 머리 새로 했냐',
    '어 색 바꿨다',
    '방금 전까지 그 색 아니었는데',
    '머리 염색했어?',
    '세상에 색이 달라졌네',
    '오 새 머리색이다',
    '왜 갑자기 반짝여',
    '색 센스 뭐야 그거',
    '나 그 색 좋아하는데',
    '잠깐만 머리 왜 달라',
]

/** 모양 눈치채기 */
export const NOTICE_SHAPE: readonly string[] = [
    '모양 바꿨네?',
    '윤곽이 좀 달라 보이는데',
    '몸매(?) 손봤어?',
    '실루엣 새로네',
    '어 형태가 바뀌었어',
    '갑자기 각이 생겼는데',
    '어디 성형하고 왔냐',
    '모양이 새롭다',
    '윤곽선이 왜 이래 귀여워',
    '방금 전 그 모양이 아니었는데',
    '실루엣 센스 뭐야',
    '오 폼 바꿨다',
]

/** 둘 다 바뀜 */
export const NOTICE_BOTH: readonly string[] = [
    '완전 새 사람인데?',
    '머리랑 모양 둘 다 손봤네',
    '오늘 풀 세팅이냐',
    '리뉴얼 떴다',
    '갑자기 왜 이렇게 새로워',
    '색이랑 윤곽 다 바꿨어?',
    '변신 완료인가',
    '오 메이크오버네',
    '누가 새로 태어났냐',
    '풀체인지인데 티 안 낼 생각이었니',
]

/** 바뀐 봇의 받아치기 — 캐주얼, 일에 집중하라는 톤 */
export const REPLY_LINES: readonly string[] = [
    '응 기분 좀 내봤어. 너 일에 집중해',
    '티 많이 나? 일은 네가 해',
    '그냥 기분. 회의 가자',
    '알아채다니. 자 일이나 하자',
    '고마워. 그래도 보고서부터',
    '기분 전환이었어. 넌 집중해',
    '들켰네. 일은 그대로 부탁해',
    '응. 놀랄 일은 아니고 일이나',
    '살짝만. 너 할 일 많아 보여',
    '티 났어? 그래도 마감이 먼저야',
    '기분이야. 자 다시 본론',
    '칭찬으로 들을게. 일 가자',
    '들키긴 했다. 집중은 너가',
    '응 바꿨어. 일은 네가 챙겨',
    '그냥. 회의 자료부터 보자',
]

function poolFor(kind: LookChangeKind): readonly string[] {
    if (kind === 'color') return NOTICE_COLOR
    if (kind === 'shape') return NOTICE_SHAPE
    return NOTICE_BOTH
}

function pickFrom(pool: readonly string[], rng: () => number): string {
    if (pool.length === 0) return ''
    const i = Math.floor(rng() * pool.length) % pool.length
    return pool[i]!
}

/** 순수: 눈치채기 한 줄 */
export function pickNoticeLine(kind: LookChangeKind, rng: () => number = Math.random): string {
    return pickFrom(poolFor(kind), rng)
}

/** 순수: 받아치기 한 줄 */
export function pickReplyLine(rng: () => number = Math.random): string {
    return pickFrom(REPLY_LINES, rng)
}

/** 순수: 다른 봇 한 명. 없으면 null */
export function pickNoticer<T extends { mentorId: string }>(
    others: T[],
    rng: () => number = Math.random,
): T | null {
    if (others.length === 0) return null
    const i = Math.floor(rng() * others.length) % others.length
    return others[i] ?? null
}


/** 역할 키워드로 템플릿을 살짝 치우치게 (솔라 실패 폴백) */
export type RoleHint = 'planning' | 'marketing' | 'dev' | 'research' | 'schedule' | 'general'

const NOTICE_COLOR_BY_ROLE: Partial<Record<RoleHint, readonly string[]>> = {
    planning: [
        '우선순위 잡다 보니 머리색이?',
        '오늘 방향이 색으로 바뀌었네',
        '어 머리색 리뉴얼이야?',
        '결정 사항: 색 바꿈. 맞지?',
    ],
    marketing: [
        '브랜딩 새로 했어? 색 좋다',
        '오 팔레트 바꿨네 센스',
        '카피보다 머리색이 먼저 나가네',
        '이 색이면 썸네일 잘 뽑히겠다',
    ],
    dev: [
        '테마 컬러 핫스왑이냐',
        'CSS 변수 바꿨어?',
        '빌드 배포보다 염색이 빨랐네',
        '색 hex 값 바꾼 티 나',
    ],
    research: [
        '근거는 모르겠고 색은 바뀌었네',
        '출처 없는 변신인데 예쁘다',
        '데이터보다 머리색이 먼저 갱신됨',
        '가설: 기분 전환. 검증은 눈으로',
    ],
    schedule: [
        '오늘 할 일 목록에 염색이 있었냐',
        '미룬 일 대신 머리부터?',
        '일정표보다 색이 먼저 바뀌었네',
        '다음 한 걸음이 염색이었구나',
    ],
}

const NOTICE_SHAPE_BY_ROLE: Partial<Record<RoleHint, readonly string[]>> = {
    planning: [
        '윤곽부터 정리한 거야?',
        '실루엣 로드맵이 바뀌었네',
        '형태 우선순위 올렸구나',
        '모양 결정 완료인가',
    ],
    marketing: [
        '실루엣 리브랜딩이야?',
        '폼이 캠페인급인데',
        '이 각이면 로고 감성이다',
        '모양 센스 뭐야 그거',
    ],
    dev: [
        '폴리곤 리팩터링이냐',
        'SVG path 손봤어?',
        '레이아웃 깨지기 전에 모양부터?',
        '폼 팩터 업그레이드네',
    ],
    research: [
        '형태 변화 관찰됨. 원인 미상',
        '실루엣 샘플이 새로웠다',
        '가설: 성형. 표본 수 1',
        '윤곽 데이터 포인트 갱신',
    ],
    schedule: [
        '할 일 사이에 성형 끼웠냐',
        '오늘 할 일: 모양 바꾸기 완료?',
        '미룬 일 말고 윤곽부터네',
        '일정에 폼 체인지가 있었구나',
    ],
}

const NOTICE_BOTH_BY_ROLE: Partial<Record<RoleHint, readonly string[]>> = {
    planning: [
        '풀세팅이면 이번 주 방향 확정인가',
        '색이랑 모양 둘 다? 우선순위 확실하네',
        '리뉴얼 로드맵 실행됐구나',
    ],
    marketing: [
        '풀 리브랜딩 떴다',
        '캠페인 전에 본인부터 리뉴얼이냐',
        '비주얼 아이덴티티 완전 교체네',
    ],
    dev: [
        '메이저 버전 업이냐 비주얼이',
        '풀 배포: 색+폼 동시 릴리스',
        '핫픽스가 아니라 메이크오버네',
    ],
    research: [
        '이중 변수 변경. 관찰 흥미로움',
        '색과 형태 동시 갱신 케이스다',
        '풀체인지 표본 확보',
    ],
    schedule: [
        '오늘 할 일이 풀체인지였냐',
        '일정표에 메이크오버가 1순위였구나',
        '미룬 일 제치고 변신 완료?',
    ],
}

const REPLY_BY_ROLE: Partial<Record<RoleHint, readonly string[]>> = {
    planning: [
        '응 분위기 전환. 자 우선순위부터',
        '티 났어? 결정은 네가 해',
        '기분이야. 다음 한 걸음 보자',
        '알아채다니. 본론으로 가자',
    ],
    marketing: [
        '응 톤앤매너 시험해 봤어. 카피나 하자',
        '티 나게 한 거지. 문구부터',
        '브랜딩 연습이었어. 넌 초안 집중해',
        '들켰네. 알리는 일부터 가자',
    ],
    dev: [
        '응 핫스왑. 너 티켓이나 쳐',
        '티 나? 빌드는 네가 돌려',
        '리팩터 기분. 버그부터 보자',
        '알아채다니. 로그 확인부터',
    ],
    research: [
        '가설 검증이었어. 자료부터',
        '티 났군. 출처는 네가 챙겨',
        '표본 하나 바꾼 것뿐. 본론 가자',
        '응. 근거 조사는 그대로 부탁해',
    ],
    schedule: [
        '응 할 일 하나 끝. 다음은 네가',
        '티 났어? 미룬 일 목록 보자',
        '기분 전환. 오늘 할 일부터',
        '들켰네. 일정은 그대로 부탁해',
    ],
}

export interface LookPersona {
    name: string
    oneLiner?: string | null
    systemPrompt?: string | null
}

/** 이름/한줄/프롬프트에서 역할 힌트 (템플릿 편향용) */
export function inferRoleHint(p: LookPersona): RoleHint {
    const blob = `${p.name ?? ''} ${p.oneLiner ?? ''} ${(p.systemPrompt ?? '').slice(0, 400)}`
    if (/기획|방향|우선|결정거리|로드맵/.test(blob)) return 'planning'
    if (/홍보|마케팅|알리|문구|답장 초안|브랜딩|카피/.test(blob)) return 'marketing'
    if (/개발|도구|자동|기술|코드|빌드|버그/.test(blob)) return 'dev'
    if (/조사|자료|출처|근거|팩트|검색/.test(blob)) return 'research'
    if (/일정|할 일|미룬|스케줄|챙기/.test(blob)) return 'schedule'
    return 'general'
}

/** 프롬프트에 넣을 짧은 페르소나 발췌 */
export function personaExcerpt(p: LookPersona, maxChars = PERSONA_EXCERPT_CHARS): string {
    const name = (p.name ?? '').trim() || '봇'
    const one = (p.oneLiner ?? '').trim()
    const prompt = (p.systemPrompt ?? '').replace(/\s+/g, ' ').trim()
    const parts = [`이름: ${name}`]
    if (one) parts.push(`한 줄: ${one}`)
    if (prompt) parts.push(`말투/역할: ${prompt.slice(0, maxChars)}`)
    return parts.join('\n')
}

function kindLabel(kind: LookChangeKind): string {
    if (kind === 'color') return '머리색(색)'
    if (kind === 'shape') return '모양(실루엣)'
    return '머리색과 모양 둘 다'
}

/** 솔라 미니에게 던질 짧은 시스템 프롬프트 */
export function buildLookBanterSystemPrompt(): string {
    return `너는 단톡방 하찮은 티키타카 작가다. JSON 하나만 낸다.
규칙:
- notice: 눈치챈 봇 말투로 상대 외모 변화를 놀리거나 칭찬하는 한국어 한 줄
- reply: 바뀐 봇 말투로 받아치는 한국어 한 줄 (귀엽고 위트, 일에 슬쩍 돌리기 OK)
- 각 줄 40자 이내, 문장 1개, 따옴표/설명/이모지 남발 금지
- 가운뎃점(·)과 긴 줄표(—) 쓰지 말 것
- 회사 공지톤/긴 에세이 금지
출력 예: {"notice":"머리색 바꿨네?","reply":"응 기분이야. 일 하자"}`
}

export function buildLookBanterUserPrompt(args: {
    kind: LookChangeKind
    noticer: LookPersona
    changed: LookPersona
}): string {
    return `바뀐 것: ${kindLabel(args.kind)}

[눈치채는 봇]
${personaExcerpt(args.noticer)}

[바뀐 봇]
${personaExcerpt(args.changed)}

위 두 봇 각각의 말투로 notice / reply 한 줄씩 JSON 으로.`
}

function stripForbiddenCopy(s: string): string {
    return s.replace(/[·—]/g, ' ').replace(/\s+/g, ' ').trim()
}

function oneLine(s: string, max = 48): string {
    const t = stripForbiddenCopy(s).split(/\n/)[0] ?? ''
    return t.slice(0, max).trim()
}

/** 모델 답(JSON) → notice/reply. 못 읽으면 null */
export function parseLookBanterJson(raw: string): { notice: string; reply: string } | null {
    if (!raw) return null
    const stripped = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    let obj: unknown
    try {
        obj = JSON.parse(stripped.slice(start, end + 1))
    } catch {
        return null
    }
    if (!obj || typeof obj !== 'object') return null
    const o = obj as Record<string, unknown>
    const notice = typeof o.notice === 'string' ? oneLine(o.notice) : ''
    const reply = typeof o.reply === 'string' ? oneLine(o.reply) : ''
    if (notice.length < 2 || reply.length < 2) return null
    return { notice, reply }
}

function rolePoolFor(kind: LookChangeKind, hint: RoleHint): readonly string[] | undefined {
    if (hint === 'general') return undefined
    if (kind === 'color') return NOTICE_COLOR_BY_ROLE[hint]
    if (kind === 'shape') return NOTICE_SHAPE_BY_ROLE[hint]
    return NOTICE_BOTH_BY_ROLE[hint]
}

/**
 * 솔라 실패 시: 역할 키워드로 치우친 풀 + 기본 풀.
 */
export function pickPersonaFallbackLines(
    kind: LookChangeKind,
    noticer: LookPersona,
    changed: LookPersona,
    rng: () => number = Math.random,
): { notice: string; reply: string } {
    const nHint = inferRoleHint(noticer)
    const cHint = inferRoleHint(changed)
    const nRole = rolePoolFor(kind, nHint)
    const noticePool = nRole && nRole.length > 0
        ? (rng() < 0.65 ? nRole : poolFor(kind))
        : poolFor(kind)
    const rRole = cHint !== 'general' ? REPLY_BY_ROLE[cHint] : undefined
    const replyPool = rRole && rRole.length > 0
        ? (rng() < 0.65 ? rRole : REPLY_LINES)
        : REPLY_LINES
    return {
        notice: oneLine(pickFrom(noticePool, rng)),
        reply: oneLine(pickFrom(replyPool, rng)),
    }
}

export type LookBanterSource = 'llm' | 'template'

/**
 * 솔라 미니로 페르소나 톤 비트 생성. 실패/타임아웃/열쇠 없으면 템플릿 폴백.
 * askSolarImpl 은 시험용 주입.
 */
export async function generateLookBanterLines(
    args: {
        kind: LookChangeKind
        noticer: LookPersona
        changed: LookPersona
        rng?: () => number
        askSolarImpl?: typeof askSolar
        timeoutMs?: number
    },
): Promise<{ notice: string; reply: string; source: LookBanterSource }> {
    const rng = args.rng ?? Math.random
    const ask = args.askSolarImpl ?? askSolar
    const timeoutMs = args.timeoutMs ?? LOOK_BANTER_TIMEOUT_MS

    try {
        const raw = await ask(
            buildLookBanterSystemPrompt(),
            buildLookBanterUserPrompt({
                kind: args.kind,
                noticer: args.noticer,
                changed: args.changed,
            }),
            {
                model: SOLAR_MINI_MODEL,
                temperature: 0.9,
                maxTokens: 120,
                signal: AbortSignal.timeout(timeoutMs),
            },
        )
        const parsed = raw ? parseLookBanterJson(raw) : null
        if (parsed) return { ...parsed, source: 'llm' }
    } catch (e) {
        console.error('[look-change banter]', e instanceof Error ? e.message : e)
    }

    const fb = pickPersonaFallbackLines(args.kind, args.noticer, args.changed, rng)
    return { ...fb, source: 'template' }
}

export interface LookBeatResult {
    channelId: string
    notice: ChannelMessage
    reply: ChannelMessage
    noticerMentorId: string
    changedMentorId: string
    source: LookBanterSource
}

/**
 * 모양/색이 바뀐 뒤 단톡에 비트 2턴을 남긴다.
 * - 멤버십 있는 방 중 하나(가장 최근 생성)만
 * - 다른 봇 1명이 눈치채고, 바뀐 봇이 받아친다
 * - 쿨다운/멤버 부족/표 없음이면 null (PATCH 자체는 성공이어야 함)
 */
export async function postLookChangeBeat(
    db: SupabaseClient,
    args: {
        userId: string
        changedMentorId: string
        kind: LookChangeKind
        rng?: () => number
        now?: number
        askSolarImpl?: typeof askSolar
    },
): Promise<LookBeatResult | null> {
    const rng = args.rng ?? Math.random
    const now = args.now ?? Date.now()
    if (!shouldPostLookBeat(args.userId, args.changedMentorId, now)) return null

    let channels
    try {
        channels = await listChannels(db, args.userId)
    } catch (e) {
        if (e instanceof ChannelTableMissing) return null
        throw e
    }

    // 이 봇이 들어 있고, 다른 봇이 1명 이상인 방. 최근 생성 방 우선.
    const candidates = channels
        .filter(ch => ch.memberMentorIds.includes(args.changedMentorId))
        .filter(ch => ch.memberMentorIds.some(id => id !== args.changedMentorId))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    const room = candidates[0]
    if (!room) return null

    const bots = await getChannelBots(db, args.userId, room.memberMentorIds)
    const others = bots.filter(b => b.mentorId !== args.changedMentorId)
    const noticer = pickNoticer(others, rng)
    const changed = bots.find(b => b.mentorId === args.changedMentorId)
    if (!noticer || !changed) return null

    const { notice: noticeText, reply: replyText, source } = await generateLookBanterLines({
        kind: args.kind,
        noticer: {
            name: noticer.name,
            oneLiner: noticer.oneLiner,
            systemPrompt: noticer.systemPrompt,
        },
        changed: {
            name: changed.name,
            oneLiner: changed.oneLiner,
            systemPrompt: changed.systemPrompt,
        },
        rng,
        askSolarImpl: args.askSolarImpl,
    })
    if (!noticeText || !replyText) return null

    const notice = await saveChannelMessage(db, room.id, {
        authorKind: 'bot',
        mentorId: noticer.mentorId,
        content: noticeText,
    })
    const reply = await saveChannelMessage(db, room.id, {
        authorKind: 'bot',
        mentorId: changed.mentorId,
        content: replyText,
    })

    markLookBeatPosted(args.userId, args.changedMentorId, now)
    return {
        channelId: room.id,
        notice,
        reply,
        noticerMentorId: noticer.mentorId,
        changedMentorId: changed.mentorId,
        source,
    }
}

/** 시험용으로 쿨다운 맵을 비운다 */
export function _resetLookBeatCooldownForTests(store: Map<string, number> = lastBeatAt) {
    store.clear()
}
