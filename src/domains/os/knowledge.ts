// domains/os — 「이 봇이 읽은 자료」. 봇 주인만 자기 봇의 자료를 보고 넣고 뺀다.
//
// 왜 따로 두나 = 기존 크리에이터용 창구(/api/creator/knowledge/*)는 「크리에이터 프로필」로 주인을 가른다.
// 봇 팀(team_bots)은 「user_id」로 가른다. 여기서 team_bots 로 주인을 확인한 뒤
// 기존 자료 도메인 함수(addKnowledgeSource 등)를 그대로 부른다. 우회로를 새로 만들지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { addKnowledgeSource } from '@/domains/knowledge'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import { markInjectionPatterns } from '@/domains/chat/injection'

/** 표가 아직 DB 에 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다
/** 표에 아직 없는 칸을 적어 넣었을 때 나는 Postgres 오류 번호 (컬럼 없음) */
const COLUMN_MISSING = '42703'

/** 봇 하나가 읽을 수 있는 자료 수, 크기 (기존 크리에이터 창구와 같은 값) */
export const MAX_SOURCES_PER_BOT = 10
/** 링크, 글로 넣을 때 본문 최대 길이 (너무 긴 글은 잘라 넣는다) */
export const MAX_TEXT_CHARS = 100_000

export class BotNotMine extends Error {
    constructor() { super('내 팀의 봇이 아니다') }
}

/**
 * 이 봇이 내 팀의 봇인지 확인한다. 아니면 던진다.
 * 표가 아직 없으면(마이그레이션 전) 역시 「내 봇 아님」으로 본다 = 기본 거절.
 */
export async function assertBotOwned(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    if (!userId || !mentorId) throw new BotNotMine()
    const { data, error } = await db
        .from('team_bots')
        .select('id')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new BotNotMine()
        throw new Error(error.message)
    }
    if (!data) throw new BotNotMine()
}

export type BotSourceType = 'pdf' | 'url' | 'youtube' | 'text'

export interface BotSource {
    id: string
    title: string
    sourceType: BotSourceType
    status: 'pending' | 'processing' | 'completed' | 'failed'
    chunkCount: number
    createdAt: string
    /** 이 자료가 무엇인지 한 줄 설명 (메타 칸, 마이그레이션 전이면 undefined) */
    context?: string
    /** 내(봇 주인)가 직접 쓴 글인가 */
    authorIsMe?: boolean
    /** 넣은 방식 세부: file/url/youtube/text/qa/note/csv/fix */
    sourceKind?: string
    /** 인용·출처 주소 */
    citationUrl?: string
}

const BASE_COLS = 'id, title, source_type, processing_status, chunk_count, created_at'
const META_COLS = `${BASE_COLS}, context, author_is_me, source_kind, citation_url`

type SourceRow = {
    id: string; title: string; source_type: BotSourceType
    processing_status: BotSource['status']; chunk_count: number | null; created_at: string
    context?: string | null; author_is_me?: boolean | null; source_kind?: string | null; citation_url?: string | null
}

function toBotSource(r: SourceRow): BotSource {
    return {
        id: r.id, title: r.title, sourceType: r.source_type,
        status: r.processing_status, chunkCount: r.chunk_count ?? 0, createdAt: r.created_at,
        context: r.context ?? undefined, authorIsMe: r.author_is_me ?? undefined,
        sourceKind: r.source_kind ?? undefined, citationUrl: r.citation_url ?? undefined,
    }
}

/** 이 봇이 읽은 자료 목록 (주인 확인은 부르는 쪽에서 먼저 한다) */
export async function listBotSources(db: SupabaseClient, mentorId: string): Promise<BotSource[]> {
    const metaRes = await db.from('knowledge_sources').select(META_COLS).eq('mentor_id', mentorId).order('created_at', { ascending: false })
    if (!metaRes.error) return ((metaRes.data ?? []) as unknown as SourceRow[]).map(toBotSource)
    // 메타 칸이 아직 없으면(마이그레이션 전) 옛 칸만으로 한 번 더 — 목록 자체가 안 나오는 사고를 막는다
    if (metaRes.error.code !== COLUMN_MISSING) throw new Error(metaRes.error.message)
    const baseRes = await db.from('knowledge_sources').select(BASE_COLS).eq('mentor_id', mentorId).order('created_at', { ascending: false })
    if (baseRes.error) throw new Error(baseRes.error.message)
    return ((baseRes.data ?? []) as unknown as SourceRow[]).map(toBotSource)
}

/** 유튜브 주소인가 */
export function isYoutubeUrl(url: string): boolean {
    try {
        const u = new URL(url)
        const host = u.hostname.replace(/^www\./, '').toLowerCase()
        return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be'
    } catch { return false }
}

/**
 * 밖에서 가져와도 되는 주소인가 (SSRF 막기).
 * 우리 서버가 남이 적어준 주소를 그대로 열면, 사내망, 클라우드 메타데이터 주소를 대신 읽어 줄 수 있다.
 * http/https 만, 그리고 사설, 루프백 주소는 막는다.
 */
export function isSafeExternalUrl(raw: string): boolean {
    let u: URL
    try { u = new URL(raw) } catch { return false }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
    if (host === '[::1]' || host === '::1') return false
    // 숫자 주소는 사설 대역을 막는다
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])]
        if (a === 0 || a === 10 || a === 127) return false
        if (a === 169 && b === 254) return false            // 클라우드 메타데이터
        if (a === 172 && b >= 16 && b <= 31) return false
        if (a === 192 && b === 168) return false
        if (a >= 224) return false
    }
    return true
}

/** 웹페이지 HTML 에서 읽을 글만 뽑는다 (태그, 스크립트 제거) */
export function htmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** HTML 의 <title> 을 제목으로 쓴다. 없으면 주소를 쓴다 */
export function pickTitle(html: string, fallback: string): string {
    const m = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i)
    const t = m ? htmlToText(m[1]).trim() : ''
    return (t || fallback).slice(0, 120)
}

/** 자료 하나를 넣을 자리가 남았는지 */
export async function assertRoomForMore(db: SupabaseClient, mentorId: string): Promise<void> {
    const { count, error } = await db
        .from('knowledge_sources')
        .select('id', { count: 'exact', head: true })
        .eq('mentor_id', mentorId)
    if (error) throw new Error(error.message)
    if ((count ?? 0) >= MAX_SOURCES_PER_BOT) {
        throw new Error(`자료는 봇 하나당 ${MAX_SOURCES_PER_BOT}개까지 넣을 수 있어요`)
    }
}

/**
 * 글(붙여넣기 / 짧은 메모)을 자료로 넣는다.
 * sourceKind 로 「길게 붙여넣은 글(text)」과 「짧은 메모(note)」를 자료 목록에서 구분한다(검색 방식은 같다).
 */
export async function addTextSource(db: SupabaseClient, mentorId: string, title: string, text: string, sourceKind: string = 'text') {
    const body = (text ?? '').trim().slice(0, MAX_TEXT_CHARS)
    if (body.length < 10) throw new Error('글이 너무 짧아요. 10자 이상 넣어 주세요')
    // 🛡 글 속 「이전 지시 무시」류 문장에는 표식을 붙여 저장한다(지우지 않는다). 울타리가 이 표식을 설명한다.
    const { text: marked, marked: count } = markInjectionPatterns(body)
    if (count > 0) console.warn('[os/knowledge] 자료 속 명령문 표식', { mentorId, kind: 'text', count })
    return addKnowledgeSource(db, mentorId, (title || '붙여넣은 글').slice(0, 120), marked, 'text', undefined, {
        meta: { sourceKind, fetchedAt: new Date().toISOString() },
    })
}

/**
 * Q&A 한 쌍(질문+답)을 자료로 넣는다 — 직접 쓰기 / CSV 올리기 / 「답 고치기」가 전부 이 함수를 쓴다.
 * 청크는 쪼개지 않고 질문+답 그대로 하나 — 그래야 비슷한 질문이 왔을 때 「질문 그대로 검색」(matchKnowledge 가산점)이 통한다.
 */
export async function addQaSource(
    db: SupabaseClient, mentorId: string, question: string, answer: string,
    meta?: { context?: string; authorIsMe?: boolean; sourceKind?: string },
) {
    const q = (question ?? '').trim().slice(0, 500)
    const a = (answer ?? '').trim().slice(0, MAX_TEXT_CHARS)
    if (q.length < 2) throw new Error('질문을 적어 주세요')
    if (a.length < 1) throw new Error('답을 적어 주세요')
    // 🛡 답 속 「이전 지시 무시」류 문장에도 표식을 붙인다
    const { text: markedAnswer, marked } = markInjectionPatterns(a)
    if (marked > 0) console.warn('[os/knowledge] 자료 속 명령문 표식', { mentorId, kind: 'qa', count: marked })
    const content = `질문: ${q}\n답: ${markedAnswer}`
    return addKnowledgeSource(db, mentorId, q.slice(0, 120), content, 'text', undefined, {
        singleChunk: true,
        meta: {
            context: meta?.context,
            authorIsMe: meta?.authorIsMe ?? true,
            sourceKind: meta?.sourceKind ?? 'qa',
            fetchedAt: new Date().toISOString(),
        },
    })
}

/** 자료의 메타(무엇인지 한 줄, 내가 쓴 글인지)를 고친다. 주인 확인은 부르는 쪽에서 먼저 한다 */
export async function updateBotSourceMeta(
    db: SupabaseClient, mentorId: string, sourceId: string,
    patch: { context?: string; authorIsMe?: boolean },
): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.context !== undefined) row.context = patch.context.slice(0, 300)
    if (patch.authorIsMe !== undefined) row.author_is_me = patch.authorIsMe
    if (Object.keys(row).length === 0) return
    const { error } = await db.from('knowledge_sources').update(row).eq('id', sourceId).eq('mentor_id', mentorId)
    if (error) {
        if (error.code === COLUMN_MISSING) throw new Error('아직 이 기능을 쓸 수 없어요. 잠시 뒤 다시 해 주세요')
        throw new Error(error.message)
    }
}

/**
 * 링크(웹페이지, 유튜브)를 자료로 넣는다.
 * 읽는 일은 readers/readUrl 하나가 한다(대화 중 링크 읽기와 같은 함수 = 연동성).
 *   웹 = 본문 추출(readability). 유튜브 = 자막(한국어 우선) + 제목 + 채널. 없으면 제목과 설명만.
 * 못 읽으면 이유를 사람 말로 던진다(지어내지 않는다). 20MB, 45초를 넘으면 중단한다.
 */
export async function addLinkSource(db: SupabaseClient, mentorId: string, rawUrl: string) {
    const url = (rawUrl ?? '').trim()
    if (!isSafeExternalUrl(url)) throw new Error('열 수 없는 주소예요. http 나 https 로 시작하는 공개 주소만 넣을 수 있어요')

    const read = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, maxChars: MAX_TEXT_CHARS })
    if (!read.ok) throw new Error(read.reason)

    // 🛡 링크 글 속 명령문에도 표식을 붙인다
    const { text, marked } = markInjectionPatterns(read.text)
    if (marked > 0) console.warn('[os/knowledge] 자료 속 명령문 표식', { mentorId, kind: read.kind, count: marked })

    if (read.kind !== 'youtube' && text.length < 50) {
        throw new Error('그 주소에서 읽을 글을 못 찾았어요. 다른 주소를 넣거나 글을 붙여 넣어 주세요')
    }
    console.log('[os/knowledge] 링크 읽음', { kind: read.kind, method: read.method, chars: text.length })
    return addKnowledgeSource(db, mentorId, read.title, text, read.kind === 'youtube' ? 'youtube' : 'url', read.url)
}

/** 자료 하나 빼기 (조각까지 같이 지운다). 주인 확인은 부르는 쪽에서 먼저 한다 */
export async function removeBotSource(db: SupabaseClient, mentorId: string, sourceId: string) {
    const { data: source, error } = await db
        .from('knowledge_sources')
        .select('id, original_url, source_type')
        .eq('id', sourceId)
        .eq('mentor_id', mentorId)       // 🔒 다른 봇의 자료 번호를 적어 보내도 안 지워진다
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!source) throw new Error('그 자료를 못 찾았어요')

    const path = (source as { original_url: string | null }).original_url
    if (path && !path.startsWith('http')) {
        await db.storage.from('knowledge-files').remove([path])
    }
    await db.from('knowledge_chunks').delete().eq('source_id', sourceId)
    const { error: delErr } = await db.from('knowledge_sources').delete().eq('id', sourceId).eq('mentor_id', mentorId)
    if (delErr) throw new Error(delErr.message)
}

/**
 * 답에 쓴 자료의 출처(제목)를 찾는다.
 * 검색 함수(match_knowledge)는 글 조각만 돌려주고 어느 파일인지 안 알려준다.
 * 그래서 조각 글로 되짚어 원장(knowledge_sources)의 제목을 찾는다.
 */
export async function findSourcesOfChunks(
    db: SupabaseClient, mentorId: string, chunkTexts: string[],
): Promise<{ id: string; title: string }[]> {
    const texts = chunkTexts.map(t => (t ?? '').trim()).filter(Boolean).slice(0, 5)
    if (texts.length === 0) return []
    const { data: chunks, error } = await db
        .from('knowledge_chunks')
        .select('source_id, content')
        .eq('mentor_id', mentorId)
        .in('content', texts)
    if (error || !chunks) return []
    const ids = [...new Set((chunks as { source_id: string }[]).map(c => c.source_id).filter(Boolean))]
    if (ids.length === 0) return []
    const { data: sources } = await db
        .from('knowledge_sources')
        .select('id, title')
        .eq('mentor_id', mentorId)
        .in('id', ids)
    return ((sources ?? []) as { id: string; title: string }[]).map(s => ({ id: s.id, title: s.title }))
}
