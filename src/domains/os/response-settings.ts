// domains/os — 봇 「답변 설정」(델파이 Response Settings 급).
//
// 봇마다: 목적 한 줄 / 추가 지침(최대 3개) / 말투 / 첫 인사 / 자료 없을 때 할 말 /
//        길이(Intelligent·Concise·Explanatory·Custom) / 창의성(Strict·Adaptive·Creative) /
//        출처 카드 on/off / 안내문 / 최신성(구글 검색) on/off.
//
// 기본값(설정을 안 만졌을 때) = 대표 확정:
//   내 팀 봇(chief·helper)     = Adaptive
//   트윈·리더 봇(마켓 공개 봇) = Strict + 출처 on
// DB 표(bot_response_settings)가 아직 없어도(마이그레이션 전) 이 파일은 기본값으로 그대로 동작한다.
//
// 이 파일 아래쪽 절반(순수 함수)은 DB·네트워크를 만지지 않는다 — 테스트가 그 절반을 확인한다.
// 위쪽 절반(DB 읽기·쓰기)만 SupabaseClient 를 받는다.

import type { SupabaseClient } from '@supabase/supabase-js'

/** 표가 아직 DB 에 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

export class ResponseSettingsTableMissing extends Error {
    constructor() { super('bot_response_settings 표가 아직 없다. supabase/migrations/20261001_bot_response_settings.sql 을 실행해야 한다') }
}

/* ────────────────────────── 타입 ────────────────────────── */

export const RESPONSE_LENGTHS = ['intelligent', 'concise', 'explanatory', 'custom'] as const
export type ResponseLength = typeof RESPONSE_LENGTHS[number]

export const RESPONSE_CREATIVITY = ['strict', 'adaptive', 'creative'] as const
export type ResponseCreativity = typeof RESPONSE_CREATIVITY[number]

/** 이 봇을 「내 팀 봇(개인용)」으로 볼지 「트윈·리더 봇(마켓 공개봇)」으로 볼지 — 기본값이 갈린다 */
export type BotKind = 'personal' | 'public'

export interface ResponseSettings {
    purpose: string | null
    /** 최대 3개, 항목당 최대 300자 */
    customInstructions: string[]
    style: string | null
    initialMessage: string | null
    noAnswerText: string
    length: ResponseLength
    /** length === 'custom' 일 때만 쓰는 글자수 목표(50~4000) */
    customLength: number | null
    creativity: ResponseCreativity
    citationsOn: boolean
    disclaimer: string | null
    recencyOn: boolean
}

/** DB 원본 행 모양(스네이크 케이스) */
export interface ResponseSettingsRow {
    mentor_id?: string
    user_id?: string
    purpose?: string | null
    custom_instructions?: string[] | null
    style?: string | null
    initial_message?: string | null
    no_answer_text?: string | null
    length?: string | null
    custom_length?: number | null
    creativity?: string | null
    citations_on?: boolean | null
    disclaimer?: string | null
    recency_on?: boolean | null
}

/** 화면·API 에서 받는 입력(카멜케이스, 사람이 직접 입력한 값이라 아무거나 올 수 있다) */
export interface ResponseSettingsInput {
    purpose?: unknown
    customInstructions?: unknown
    style?: unknown
    initialMessage?: unknown
    noAnswerText?: unknown
    length?: unknown
    customLength?: unknown
    creativity?: unknown
    citationsOn?: unknown
    disclaimer?: unknown
    recencyOn?: unknown
}

/** 대화 한 턴에 실제로 적용할 값들(프롬프트에 얹을 글, 길이 상한 토큰 등까지 미리 계산) */
export interface ResolvedResponseSettings {
    settings: ResponseSettings
    kind: BotKind
    /** Length 설정을 토큰 상한으로 바꾼 값. generateChatStream 의 maxOutputTokens 로 그대로 넘긴다 */
    maxOutputTokens: number
    recencyOn: boolean
    citationsOn: boolean
    noAnswerText: string
    initialMessage: string | null
}

/* ────────────────────────── 글자수 한도 (DB CHECK 와 같은 값) ────────────────────────── */

export const MAX_CUSTOM_INSTRUCTIONS = 3
export const MAX_INSTRUCTION_CHARS = 300
export const MAX_PURPOSE_CHARS = 200
export const MAX_STYLE_CHARS = 500
export const MAX_INITIAL_MESSAGE_CHARS = 300
export const MAX_NO_ANSWER_CHARS = 300
export const MAX_DISCLAIMER_CHARS = 300
export const MIN_CUSTOM_LENGTH_CHARS = 50
export const MAX_CUSTOM_LENGTH_CHARS = 4000

/** 자료에 없을 때 봇이 할 말의 기본값 */
// 짧은 한 줄. 「잘 모르겠」 표현이 들어 있어 「답 못 한 질문」 기록(detectTopicGap)에도 걸린다 (대표 승인 1005)
export const DEFAULT_NO_ANSWER_TEXT = '자료에 없어서 잘 모르겠어요.'

/* ────────────────────────── 순수 함수 ────────────────────────── */

/** 표에 줄이 없을 때 쓰는 기본값. kind 에 따라 creativity 만 갈린다(대표 확정) */
export function defaultResponseSettings(kind: BotKind): ResponseSettings {
    return {
        purpose: null,
        customInstructions: [],
        style: null,
        initialMessage: null,
        noAnswerText: DEFAULT_NO_ANSWER_TEXT,
        length: 'intelligent',
        customLength: null,
        creativity: kind === 'public' ? 'strict' : 'adaptive',
        citationsOn: true,
        disclaimer: null,
        // 기본 꺼짐: 켜면 유료 구글 검색이 붙는다. 켜는 건 리더 선택 (대표 승인 1005 03:23)
        recencyOn: false,
    }
}

function 다듬은글(v: unknown, max: number): string | null {
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : null
}

/** 추가 지침 목록을 정리한다 — 문자열만, 빈 줄 제거, 항목당 300자, 최대 3개 */
export function clampCustomInstructions(list: unknown): string[] {
    if (!Array.isArray(list)) return []
    return list
        .map(x => String(x ?? '').trim().slice(0, MAX_INSTRUCTION_CHARS))
        .filter(Boolean)
        .slice(0, MAX_CUSTOM_INSTRUCTIONS)
}

function 유효한Length(v: unknown, fallback: ResponseLength): ResponseLength {
    return (RESPONSE_LENGTHS as readonly string[]).includes(String(v)) ? (v as ResponseLength) : fallback
}

function 유효한Creativity(v: unknown, fallback: ResponseCreativity): ResponseCreativity {
    return (RESPONSE_CREATIVITY as readonly string[]).includes(String(v)) ? (v as ResponseCreativity) : fallback
}

function clampCustomLength(v: unknown, fallback: number): number {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
    return Math.min(MAX_CUSTOM_LENGTH_CHARS, Math.max(MIN_CUSTOM_LENGTH_CHARS, n))
}

/** DB 에서 읽은 행(없을 수 있다) + 기본 kind → 실제 쓸 설정. 칸이 비어 있으면 기본값을 채운다 */
export function mergeResponseSettings(row: ResponseSettingsRow | null | undefined, kind: BotKind): ResponseSettings {
    const base = defaultResponseSettings(kind)
    if (!row) return base
    return {
        purpose: 다듬은글(row.purpose, MAX_PURPOSE_CHARS) ?? base.purpose,
        customInstructions: row.custom_instructions ? clampCustomInstructions(row.custom_instructions) : base.customInstructions,
        style: 다듬은글(row.style, MAX_STYLE_CHARS) ?? base.style,
        initialMessage: 다듬은글(row.initial_message, MAX_INITIAL_MESSAGE_CHARS) ?? base.initialMessage,
        noAnswerText: 다듬은글(row.no_answer_text, MAX_NO_ANSWER_CHARS) ?? base.noAnswerText,
        length: 유효한Length(row.length, base.length),
        customLength: typeof row.custom_length === 'number' ? clampCustomLength(row.custom_length, row.custom_length) : base.customLength,
        creativity: 유효한Creativity(row.creativity, base.creativity),
        citationsOn: typeof row.citations_on === 'boolean' ? row.citations_on : base.citationsOn,
        disclaimer: 다듬은글(row.disclaimer, MAX_DISCLAIMER_CHARS) ?? base.disclaimer,
        recencyOn: typeof row.recency_on === 'boolean' ? row.recency_on : base.recencyOn,
    }
}

/** 화면·API 입력을 저장해도 안전한 값으로 다듬는다(길이 자르기, 모르는 값은 기본값) */
export function sanitizeResponseSettingsInput(input: ResponseSettingsInput, kind: BotKind): ResponseSettings {
    const base = defaultResponseSettings(kind)
    const length = 유효한Length(input.length, base.length)
    return {
        purpose: 다듬은글(input.purpose, MAX_PURPOSE_CHARS),
        customInstructions: clampCustomInstructions(input.customInstructions),
        style: 다듬은글(input.style, MAX_STYLE_CHARS),
        initialMessage: 다듬은글(input.initialMessage, MAX_INITIAL_MESSAGE_CHARS),
        noAnswerText: 다듬은글(input.noAnswerText, MAX_NO_ANSWER_CHARS) ?? base.noAnswerText,
        length,
        customLength: length === 'custom' ? clampCustomLength(input.customLength, 800) : null,
        creativity: 유효한Creativity(input.creativity, base.creativity),
        citationsOn: typeof input.citationsOn === 'boolean' ? input.citationsOn : base.citationsOn,
        disclaimer: 다듬은글(input.disclaimer, MAX_DISCLAIMER_CHARS),
        recencyOn: typeof input.recencyOn === 'boolean' ? input.recencyOn : base.recencyOn,
    }
}

/** 한국어 기준 대략 글자당 토큰 비율(러프 추정치). 정확한 토크나이저를 안 쓰는 대신 넉넉히 잡는다 */
const CHARS_PER_TOKEN_KO = 1.7

/** Length 설정별 답 길이 상한(토큰). Gemini 는 이 값을 그대로 쓴다 */
export const LENGTH_MAX_TOKENS = { concise: 220, intelligent: 900, explanatory: 1800 } as const

/**
 * 솔라만 쓰는 상한. 같은 설정에서 솔라가 Gemini 보다 1.5배쯤 길게 써서(실측 0929: 평균 378자 대 253자) 줄였다.
 * 짧게(220)는 그대로, 기본 900 → 500, 자세히는 같은 비율로 1800 → 1000. 글자 수를 직접 정한 봇(custom)은 손대지 않는다.
 */
export const SOLAR_LENGTH_MAX_TOKENS = { concise: 220, intelligent: 500, explanatory: 1000 } as const

/** Length 설정 → 실제 모델 호출의 max_tokens. 화면 문구(길이)와 숫자(토큰)를 여기 한 곳에서만 잇는다 */
export function resolveMaxOutputTokens(settings: Pick<ResponseSettings, 'length' | 'customLength'>): number {
    switch (settings.length) {
        case 'concise': return LENGTH_MAX_TOKENS.concise
        case 'explanatory': return LENGTH_MAX_TOKENS.explanatory
        case 'custom': return Math.max(64, Math.min(4096, Math.round((settings.customLength ?? 800) / CHARS_PER_TOKEN_KO)))
        case 'intelligent':
        default: return LENGTH_MAX_TOKENS.intelligent
    }
}

/**
 * 대화 API 가 넘긴 상한(Gemini 기준 숫자)을 솔라용으로 바꾼다.
 * 기본(900)과 자세히(1800)만 줄이고, 짧게와 글자 수 지정(custom), 상한을 안 준 호출은 그대로 둔다.
 */
export function solarMaxOutputTokens(requested: number | undefined): number | undefined {
    if (requested === LENGTH_MAX_TOKENS.intelligent) return SOLAR_LENGTH_MAX_TOKENS.intelligent
    if (requested === LENGTH_MAX_TOKENS.explanatory) return SOLAR_LENGTH_MAX_TOKENS.explanatory
    return requested
}

function lengthInstruction(settings: ResponseSettings): string {
    switch (settings.length) {
        case 'concise': return '답은 짧고 간결하게, 꼭 필요한 말만 2~3문장 이내로 해라.'
        case 'explanatory': return '필요하면 충분히 자세하게, 예시를 곁들여 설명해도 좋다.'
        case 'custom': return `답은 대략 ${settings.customLength ?? 800}자 안팎으로 맞춰라.`
        case 'intelligent':
        default: return '기본은 짧게, 5문장 안으로 답하라. 사용자가 자세히 알려 달라고 할 때만 길게 답하라.'
    }
}

function creativityInstruction(settings: ResponseSettings): string {
    switch (settings.creativity) {
        case 'strict':
            return '반드시 위에서 준 자료 안의 내용만 근거로 답하라. 자료에 없는 내용은 추측하거나 지어내지 말고, 자료에 없으면 일반 지식으로 답하지 말고, 짧게 한 줄로 모르겠다고만 말하라.'
        case 'creative':
            return '자료를 참고하되, 자료에 없는 내용도 자유롭게 상상하거나 일반 지식으로 보태 답해도 좋다.'
        case 'adaptive':
        default:
            return '자료가 있으면 자료를 우선 활용하고, 자료에 없는 내용은 일반 지식으로 답하되 자료에 없는 내용이라는 걸 자연스럽게 알려줘라.'
    }
}

/**
 * 시스템 프롬프트 조립 직후에 한 번 부른다. 목적·추가 지침·말투·길이·창의성·안내문을 한 덩어리로 얹는다.
 * (자료 삽입·스킬 삽입은 route.ts 의 다른 자리에서 그대로 한다 — 여기서는 건드리지 않는다)
 */
export function applyResponseSettingsToPrompt(systemPrompt: string, resolved: Pick<ResolvedResponseSettings, 'settings'>): string {
    const { settings } = resolved
    const lines: string[] = []
    if (settings.purpose) lines.push(`이 봇의 목적: ${settings.purpose}`)
    if (settings.customInstructions.length > 0) {
        lines.push('추가 지침:')
        settings.customInstructions.forEach((c, i) => lines.push(`${i + 1}. ${c}`))
    }
    if (settings.style) lines.push(`말투: ${settings.style}`)
    lines.push(lengthInstruction(settings))
    lines.push(creativityInstruction(settings))
    // 서식(굵게, 목록)은 공통 규칙(domains/mentor/answer-rules ANSWER_FORMAT_RULE) 한 곳에서만 말한다. 두 곳이 서로 달라 부딪쳤었다(0929)
    if (settings.disclaimer) lines.push(`답을 마칠 때 다음 안내문을 자연스럽게 덧붙여라: "${settings.disclaimer}"`)
    if (lines.length === 0) return systemPrompt
    return `${systemPrompt}\n\n[⚙️ 답변 설정]\n${lines.join('\n')}`
}

/** Strict 모드에서 「모델을 부를지」를 가르는 문턱. 기본 검색 문턱(0.7)보다 살짝 높게 잡아 애매한 매치는 no-answer 로 보낸다 */
export const STRICT_MIN_SIMILARITY = 0.72

/**
 * 모델을 불러도 되는가.
 * Strict 가 아니면 항상 true. Strict 인데 자료가 하나도 없거나(봇에 자료가 없거나 전부 문턱 미만) 전부 관련도가 낮으면 false —
 * 이때는 모델을 부르지 않고 noAnswerText 를 그대로 돌려준다(비용도 아끼고, 지어낸 답도 막는다).
 */
export function shouldAnswerFromKnowledge(
    settings: Pick<ResponseSettings, 'creativity'>,
    matches: { similarity?: number | null }[] | null | undefined,
): boolean {
    if (settings.creativity !== 'strict') return true
    if (!matches || matches.length === 0) return false
    return matches.some(m => (m.similarity ?? 0) >= STRICT_MIN_SIMILARITY)
}

/* ────────────────────────── DB 읽기·쓰기 (서버에서만 부른다) ────────────────────────── */

/** 이 봇이 트윈(디지털 나)이거나 크리에이터가 만든 마켓 공개 봇이면 'public', 내 팀의 개인용 chief·helper 봇이면 'personal' */
export async function classifyBotKind(
    db: SupabaseClient,
    mentorId: string,
    mentor: { creator_id?: string | null } | null | undefined,
    userId?: string | null,
): Promise<BotKind> {
    if (mentor?.creator_id) return 'public'
    if (userId) {
        const { data } = await db.from('team_bots').select('role').eq('user_id', userId).eq('mentor_id', mentorId).maybeSingle()
        const role = (data as { role?: string } | null)?.role
        if (role && role !== 'twin') return 'personal'
        if (role === 'twin') return 'public'
    }
    // 모르는 봇(내 팀도 아니고 크리에이터 봇도 아닌 경우)은 신중한 쪽(Strict)을 기본으로 삼는다
    return 'public'
}

/**
 * 이 봇에 「쓸 수 있는」 자료가 하나라도 있나 = 검색에 걸릴 조각(knowledge_chunks)이 한 개라도 있나.
 * 파일을 올렸어도 처리에 실패했거나 조각이 0개면 자료 없음이다.
 * (실측 0929: 열정진 봇은 처리 실패한 PDF 한 개 때문에 「자료 있음」으로 세져 Strict 가 켜졌고,
 *  모델을 부르지도 않고 모든 질문에 「자료에 없어요」만 돌려줄 상태였다)
 * 못 세면 false = 모델이 답하게 둔다(아무 질문에나 「자료에 없어요」가 나가는 쪽보다 낫다).
 */
export async function botHasKnowledge(db: SupabaseClient, mentorId: string): Promise<boolean> {
    try {
        const { data, error } = await db.from('knowledge_chunks').select('id').eq('mentor_id', mentorId).limit(1)
        if (error) return false
        return Array.isArray(data) && data.length > 0
    } catch {
        return false
    }
}

/** bot_response_settings 한 줄 읽기. 표가 아직 없으면(마이그레이션 전) null (기본값으로 동작) */
export async function fetchResponseSettingsRow(db: SupabaseClient, mentorId: string): Promise<ResponseSettingsRow | null> {
    const { data, error } = await db.from('bot_response_settings').select('*').eq('mentor_id', mentorId).maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) return null
        throw new Error(error.message)
    }
    return data as ResponseSettingsRow | null
}

/**
 * 대화 API 가 시스템 프롬프트 조립 직후 한 번 부르는 진입점.
 * kind 판정 + DB 행 읽기 + 기본값 병합 + (길이→토큰, Strict 여부 등) 미리 계산까지 한 번에 끝낸다.
 */
export async function loadResponseSettingsForChat(
    db: SupabaseClient,
    mentorId: string,
    mentor: { creator_id?: string | null } | null | undefined,
    userId?: string | null,
): Promise<ResolvedResponseSettings> {
    const kind = await classifyBotKind(db, mentorId, mentor, userId)
    const row = await fetchResponseSettingsRow(db, mentorId)
    let settings = mergeResponseSettings(row, kind)
    // 「자료 안에서만」(strict)인데 쓸 자료가 하나도 없으면 모델을 부르지 않고 「모르겠어요」 한 줄로 답한다 (대표 승인 1005).
    // 예외: 리더가 고른 게 아니라 기본값으로 strict 가 된 「리더가 만든 게 아닌 봇」(공식 팀장, 손님 시연 봇)은
    //       자료를 안 올렸어도 대화가 돼야 하므로 Adaptive 로 답한다.
    const 직접골랐다 = row?.creativity === 'strict'
    const 리더봇 = !!mentor?.creator_id
    if (settings.creativity === 'strict' && !직접골랐다 && !리더봇 && !(await botHasKnowledge(db, mentorId))) {
        settings = { ...settings, creativity: 'adaptive' }
    }
    return {
        settings,
        kind,
        maxOutputTokens: resolveMaxOutputTokens(settings),
        recencyOn: settings.recencyOn,
        citationsOn: settings.citationsOn,
        noAnswerText: settings.noAnswerText,
        initialMessage: settings.initialMessage,
    }
}

/** 화면(답변 설정 시트)이 부르는 조회 — 병합된 값 + 어느 kind 로 기본값을 잡았는지까지 돌려준다 */
export async function getResponseSettingsForOwner(
    db: SupabaseClient,
    mentorId: string,
    mentor: { creator_id?: string | null } | null | undefined,
    userId: string,
): Promise<{ settings: ResponseSettings; kind: BotKind }> {
    const kind = await classifyBotKind(db, mentorId, mentor, userId)
    const row = await fetchResponseSettingsRow(db, mentorId)
    return { settings: mergeResponseSettings(row, kind), kind }
}

/** 답변 설정 저장(만들기·고치기 겸용) */
export async function saveResponseSettings(
    db: SupabaseClient,
    mentorId: string,
    userId: string,
    settings: ResponseSettings,
): Promise<void> {
    const { error } = await db.from('bot_response_settings').upsert({
        mentor_id: mentorId,
        user_id: userId,
        purpose: settings.purpose,
        custom_instructions: settings.customInstructions,
        style: settings.style,
        initial_message: settings.initialMessage,
        no_answer_text: settings.noAnswerText,
        length: settings.length,
        custom_length: settings.customLength,
        creativity: settings.creativity,
        citations_on: settings.citationsOn,
        disclaimer: settings.disclaimer,
        recency_on: settings.recencyOn,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'mentor_id' })
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new ResponseSettingsTableMissing()
        throw new Error(error.message)
    }
}
