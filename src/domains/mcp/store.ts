// domains/mcp — 내 MCP 서버 목록 읽고 쓰기 (mcp_servers 표)
//
// 규칙 (connectors/store.ts 와 같다)
//  1) 서버는 service_role 로 DB 를 만지므로 **모든 질의에 user_id 를 건다**.
//  2) 인증 값은 connectors/crypto 로 잠근 채로만 넣고, 밖으로 나가는 모양(McpServerView)에는 절대 담지 않는다.
//  3) 표가 아직 없으면 목록은 빈 것으로, 쓰기는 McpTableMissing 으로.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret, encryptSecret, maskSecret, requireConnectorKey } from '@/domains/connectors/crypto'
import { checkHeaderName, checkMcpUrl, normalizeAuthValue } from './url'
import { MAX_BOTS_PER_SERVER } from './limits'
import type { McpAuth } from './client'

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])
const SELECT = 'id, name, url, auth_header_name, auth_encrypted, auth_hint, enabled, bot_ids, status, last_error, tool_count, last_checked_at, created_at, updated_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class McpTableMissing extends Error {
    constructor() { super('mcp_servers 표가 아직 없다. supabase/migrations/20261018_mcp_servers.sql 을 실행해야 한다') }
}
export class McpNotMine extends Error {
    constructor() { super('내 MCP 서버가 아니다') }
}
export class McpInputError extends Error {}
export class McpLimitReached extends Error {
    constructor(public limit: number) { super(`MCP 서버는 지금 요금제에서 ${limit}개까지 붙일 수 있어요`) }
}

export type McpStatus = 'unknown' | 'ok' | 'error'

type Raw = {
    id: string; name: string; url: string; auth_header_name: string; auth_encrypted: string | null; auth_hint: string | null
    enabled: boolean; bot_ids: string[] | null; status: McpStatus; last_error: string | null; tool_count: number | null
    last_checked_at: string | null; created_at: string; updated_at: string
}

/** 밖으로 나가는 모양. 인증 값 원문·암호문은 없다 */
export interface McpServerView {
    id: string
    name: string
    url: string
    authHeaderName: string
    hasAuth: boolean
    authHint: string | null
    enabled: boolean
    /** null = 내 봇 전체 */
    botIds: string[] | null
    status: McpStatus
    lastError: string | null
    toolCount: number | null
    lastCheckedAt: string | null
    createdAt: string
    updatedAt: string
}

export function toView(r: Raw): McpServerView {
    return {
        id: r.id,
        name: r.name,
        url: r.url,
        authHeaderName: r.auth_header_name,
        hasAuth: !!r.auth_encrypted,
        authHint: r.auth_encrypted ? (r.auth_hint ?? '••••') : null,
        enabled: r.enabled,
        botIds: r.bot_ids,
        status: r.status,
        lastError: r.last_error,
        toolCount: r.tool_count,
        lastCheckedAt: r.last_checked_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }
}

function isMissing(error: { code?: string } | null | undefined): boolean {
    return !!error?.code && TABLE_MISSING.has(error.code)
}

/** 봇 목록 칸 다듬기. null/'all' = 전체 */
export function cleanBotIds(raw: unknown): string[] | null {
    if (raw === null || raw === undefined || raw === 'all') return null
    if (!Array.isArray(raw)) throw new McpInputError('봇 목록 모양이 틀렸어요')
    const ids = [...new Set(raw.map(v => String(v ?? '').trim()))]
    if (ids.some(id => !UUID.test(id))) throw new McpInputError('봇 번호 모양이 틀렸어요')
    if (ids.length > MAX_BOTS_PER_SERVER) throw new McpInputError(`봇은 ${MAX_BOTS_PER_SERVER}개까지 고를 수 있어요`)
    if (ids.length === 0) throw new McpInputError('봇을 하나 이상 고르거나 「전체」로 두세요')
    return ids
}

function cleanName(raw: unknown): string {
    const name = String(raw ?? '').trim().slice(0, 60)
    if (!name) throw new McpInputError('이름을 넣어 주세요')
    return name
}

export interface McpServerInput {
    name?: unknown
    url?: unknown
    authHeaderName?: unknown
    /** 문자열 = 새 값, null/'' = 지우기, undefined = 그대로 */
    authValue?: unknown
    enabled?: unknown
    botIds?: unknown
}

/** 내 MCP 서버 목록 */
export async function listMcpServers(db: SupabaseClient, userId: string): Promise<McpServerView[]> {
    const { data, error } = await db.from('mcp_servers').select(SELECT)
        .eq('user_id', userId).order('created_at', { ascending: true })
    if (error) {
        if (isMissing(error)) return []
        throw new Error(error.message)
    }
    return ((data ?? []) as Raw[]).map(toView)
}

export async function countMcpServers(db: SupabaseClient, userId: string): Promise<number> {
    const { count, error } = await db.from('mcp_servers').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    if (error) {
        if (isMissing(error)) throw new McpTableMissing()
        throw new Error(error.message)
    }
    return count ?? 0
}

/** 하나 붙이기. limit = 요금제 한도 */
export async function createMcpServer(db: SupabaseClient, userId: string, input: McpServerInput, limit: number): Promise<McpServerView> {
    const name = cleanName(input.name)
    const url = checkMcpUrl(input.url)
    if (!url.ok) throw new McpInputError(url.reason)
    const headerName = checkHeaderName(input.authHeaderName)
    if (!headerName) throw new McpInputError('인증 머리글 이름을 쓸 수 없어요')
    const botIds = cleanBotIds(input.botIds)
    const enabled = input.enabled === undefined ? true : input.enabled === true
    let authValue: string | null
    try { authValue = normalizeAuthValue(headerName, input.authValue) } catch (e) { throw new McpInputError((e as Error).message) }

    if ((await countMcpServers(db, userId)) >= limit) throw new McpLimitReached(limit)

    const row: Record<string, unknown> = {
        user_id: userId, name, url: url.url, auth_header_name: headerName, enabled, bot_ids: botIds,
        auth_encrypted: authValue ? encryptSecret(authValue, requireConnectorKey()) : null,
        auth_hint: authValue ? maskSecret(authValue) : null,
        status: 'unknown',
    }
    const { data, error } = await db.from('mcp_servers').insert(row).select(SELECT).single()
    if (error || !data) {
        if (isMissing(error)) throw new McpTableMissing()
        throw new Error(error?.message ?? 'MCP 서버를 붙이지 못했어요')
    }
    return toView(data as Raw)
}

/** 고치기. 주소나 인증이 바뀌면 상태를 「모름」으로 되돌린다 */
export async function updateMcpServer(db: SupabaseClient, userId: string, id: string, input: McpServerInput): Promise<McpServerView> {
    if (!UUID.test(id)) throw new McpNotMine()
    const { data: cur, error: readErr } = await db.from('mcp_servers').select(SELECT).eq('id', id).eq('user_id', userId).maybeSingle()
    if (readErr) {
        if (isMissing(readErr)) throw new McpTableMissing()
        throw new Error(readErr.message)
    }
    if (!cur) throw new McpNotMine()
    const current = cur as Raw

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) patch.name = cleanName(input.name)
    if (input.url !== undefined) {
        const url = checkMcpUrl(input.url)
        if (!url.ok) throw new McpInputError(url.reason)
        if (url.url !== current.url) Object.assign(patch, { url: url.url, status: 'unknown', last_error: null, tool_count: null })
    }
    let headerName = current.auth_header_name
    if (input.authHeaderName !== undefined) {
        const h = checkHeaderName(input.authHeaderName)
        if (!h) throw new McpInputError('인증 머리글 이름을 쓸 수 없어요')
        headerName = h
        patch.auth_header_name = h
    }
    if (input.authValue !== undefined) {
        let v: string | null
        try { v = normalizeAuthValue(headerName, input.authValue) } catch (e) { throw new McpInputError((e as Error).message) }
        Object.assign(patch, {
            auth_encrypted: v ? encryptSecret(v, requireConnectorKey()) : null,
            auth_hint: v ? maskSecret(v) : null,
            status: 'unknown', last_error: null,
        })
    }
    if (input.enabled !== undefined) {
        if (typeof input.enabled !== 'boolean') throw new McpInputError('켜짐/꺼짐 값이 틀렸어요')
        patch.enabled = input.enabled
    }
    if (input.botIds !== undefined) patch.bot_ids = cleanBotIds(input.botIds)

    const { data, error } = await db.from('mcp_servers').update(patch).eq('id', id).eq('user_id', userId).select(SELECT).maybeSingle()
    if (error) {
        if (isMissing(error)) throw new McpTableMissing()
        throw new Error(error.message)
    }
    if (!data) throw new McpNotMine()
    return toView(data as Raw)
}

export async function deleteMcpServer(db: SupabaseClient, userId: string, id: string): Promise<void> {
    if (!UUID.test(id)) throw new McpNotMine()
    const { error, count } = await db.from('mcp_servers').delete({ count: 'exact' }).eq('id', id).eq('user_id', userId)
    if (error) {
        if (isMissing(error)) throw new McpTableMissing()
        throw new Error(error.message)
    }
    if (!count) throw new McpNotMine()
}

/** 서버 하나 + 풀린 인증 값. 실제로 붙을 때만 부른다. 밖으로 내보내지 마라 */
export async function readMcpServerForUse(db: SupabaseClient, userId: string, id: string): Promise<{ view: McpServerView; auth: McpAuth | null }> {
    if (!UUID.test(id)) throw new McpNotMine()
    const { data, error } = await db.from('mcp_servers').select(SELECT).eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) {
        if (isMissing(error)) throw new McpTableMissing()
        throw new Error(error.message)
    }
    if (!data) throw new McpNotMine()
    const row = data as Raw
    return { view: toView(row), auth: unlockAuth(row) }
}

function unlockAuth(row: Raw): McpAuth | null {
    if (!row.auth_encrypted) return null
    return { headerName: row.auth_header_name, value: decryptSecret(row.auth_encrypted, requireConnectorKey()) }
}

/** 이 봇 대화에 쓸 내 서버들 (켜진 것 + 봇 전체 또는 이 봇이 목록에 있는 것) */
export async function serversForBot(db: SupabaseClient, userId: string, botId: string): Promise<{ view: McpServerView; auth: McpAuth | null }[]> {
    const { data, error } = await db.from('mcp_servers').select(SELECT)
        .eq('user_id', userId).eq('enabled', true).order('created_at', { ascending: true })
    if (error) {
        if (isMissing(error)) return []
        throw new Error(error.message)
    }
    const out: { view: McpServerView; auth: McpAuth | null }[] = []
    for (const row of (data ?? []) as Raw[]) {
        if (row.bot_ids && !row.bot_ids.includes(botId)) continue
        try { out.push({ view: toView(row), auth: unlockAuth(row) }) } catch { /* 못 풀면 그 서버는 건너뛴다 */ }
    }
    return out
}

/** 시험·사용 결과 기록 */
export async function markMcpServer(db: SupabaseClient, userId: string, id: string, r: { status: McpStatus; error?: string | null; toolCount?: number | null }): Promise<void> {
    const patch: Record<string, unknown> = { status: r.status, last_error: r.error ? r.error.slice(0, 300) : null, last_checked_at: new Date().toISOString() }
    if (r.toolCount !== undefined) patch.tool_count = r.toolCount
    await db.from('mcp_servers').update(patch).eq('id', id).eq('user_id', userId)
}
