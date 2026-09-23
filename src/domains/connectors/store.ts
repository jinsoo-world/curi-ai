// domains/connectors — 연결 목록 읽고 쓰기 (connectors 표).
//
// 규칙 셋 (permissions.ts 와 같다)
//  1) 서버는 service_role 로 DB 를 만지므로 **모든 질의에 user_id 를 건다**.
//  2) 열쇠(secret)는 잠근 채로만 넣고, 밖으로 나가는 모양(ConnectorView)에는 절대 담지 않는다.
//  3) 표가 아직 없으면 「연결 없음」으로 본다 — 화면이 죽지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret, encryptSecret, maskSecret, requireConnectorKey } from './crypto'
import { extractAccessToken } from './oauth'
import { cleanKind, type ConnectorKind, type ConnectorStatus, type ConnectorView } from './types'

/** 표가 아직 DB 에 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

/** 한 사람이 같은 종류를 여러 개 붙일 수 있는 최대 개수 */
export const MAX_PER_KIND = 3

export class ConnectorTableMissing extends Error {
    constructor() { super('connectors 표가 아직 없다. supabase/migrations/20260928_connectors.sql 을 실행해야 한다') }
}
export class ConnectorNotMine extends Error {
    constructor() { super('내 연결이 아니다') }
}

type Raw = {
    id: string; kind: ConnectorKind; label: string
    secret_encrypted: string; meta: Record<string, unknown> | null
    status: ConnectorStatus; created_at: string; last_used_at: string | null
}

const SELECT = 'id, kind, label, secret_encrypted, meta, status, created_at, last_used_at'

function toView(r: Raw): ConnectorView {
    return {
        id: r.id,
        kind: r.kind,
        label: r.label,
        status: r.status,
        secretHint: String((r.meta ?? {}).hint ?? '••••'),
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
    }
}

/** 내 연결 목록 (열쇠는 빼고) */
export async function listConnectors(db: SupabaseClient, userId: string): Promise<ConnectorView[]> {
    const { data, error } = await db.from('connectors').select(SELECT)
        .eq('user_id', userId).order('created_at', { ascending: true })
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) return []
        throw new Error(error.message)
    }
    return ((data ?? []) as Raw[]).map(toView)
}

/** 이 사람이 붙여 둔 그 종류의 첫 연결 (대화에서 「노션에서 찾아줘」 할 때 쓴다) */
export async function findConnector(db: SupabaseClient, userId: string, kind: ConnectorKind): Promise<ConnectorView | null> {
    const { data, error } = await db.from('connectors').select(SELECT)
        .eq('user_id', userId).eq('kind', kind).eq('status', 'connected')
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) return null
        throw new Error(error.message)
    }
    return data ? toView(data as Raw) : null
}

/** 연결 하나 붙이기. 열쇠는 잠가서 넣는다 */
export async function createConnector(
    db: SupabaseClient, userId: string,
    input: { kind: ConnectorKind; label: string; secret: string; meta?: Record<string, unknown> },
): Promise<ConnectorView> {
    const key = requireConnectorKey()
    const kind = cleanKind(input.kind)
    if (!kind) throw new Error('우리가 아는 연결 종류가 아니에요')
    const secret = String(input.secret ?? '').trim()
    if (!secret) throw new Error('붙여 넣을 열쇠가 비어 있어요')

    const { count } = await db.from('connectors').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('kind', kind)
    if ((count ?? 0) >= MAX_PER_KIND) throw new Error(`${kind} 연결은 ${MAX_PER_KIND}개까지 붙일 수 있어요`)

    const { data, error } = await db.from('connectors').insert({
        user_id: userId,
        kind,
        label: (String(input.label ?? '').trim() || '내 연결').slice(0, 60),
        secret_encrypted: encryptSecret(secret, key),
        // hint 는 끝 4자 가림이 기본. OAuth 로 붙일 땐 계정 힌트(jin@…)를 넣어 오므로 그쪽이 이긴다
        meta: { hint: maskSecret(secret), ...(input.meta ?? {}) },
        status: 'connected',
    }).select(SELECT).single()
    if (error || !data) {
        if ((error?.code === TABLE_MISSING || error?.code === TABLE_MISSING_REST)) throw new ConnectorTableMissing()
        throw new Error(error?.message ?? '연결을 붙이지 못했어요')
    }
    return toView(data as Raw)
}

/** 같은 종류를 하나만 두고 갈아 끼운다(본인 계정 로그인으로 붙이는 연결은 공급자마다 1개) */
export async function replaceConnector(
    db: SupabaseClient, userId: string,
    input: { kind: ConnectorKind; label: string; secret: string; meta?: Record<string, unknown> },
): Promise<ConnectorView> {
    const { error } = await db.from('connectors').delete().eq('user_id', userId).eq('kind', input.kind)
    if (error && error.code !== TABLE_MISSING) throw new Error(error.message)
    return createConnector(db, userId, input)
}

/** 내 연결의 열쇠를 푼다. 도구를 실제로 쓸 때만 부른다 */
export async function readConnectorSecret(
    db: SupabaseClient, userId: string, id: string,
): Promise<{ view: ConnectorView; secret: string }> {
    const { data, error } = await db.from('connectors').select(SELECT)
        .eq('id', id).eq('user_id', userId).maybeSingle()     // 🔒 남의 연결 번호를 적어 보내도 안 나온다
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    if (!data) throw new ConnectorNotMine()
    const row = data as Raw
    // 로그인(OAuth)으로 붙인 건 토큰 JSON 이 잠겨 있다. 도구가 쓰기 좋게 access_token 만 꺼내 준다
    return { view: toView(row), secret: extractAccessToken(decryptSecret(row.secret_encrypted, requireConnectorKey())) }
}

/**
 * 내 연결의 토큰을 **그대로**(access_token 만 꺼내지 않고) 푼다. 갈래 G 동기화가 refresh_token 을 쓰려고 부른다.
 * 손으로 붙여 넣은 옛길(노션 통합 토큰 등)은 JSON 이 아니므로 { access_token: 그 값 } 모양으로 감싸서 돌려준다.
 */
export async function readConnectorTokenJson(
    db: SupabaseClient, userId: string, id: string,
): Promise<{ view: ConnectorView; token: Record<string, unknown> }> {
    const { data, error } = await db.from('connectors').select(SELECT)
        .eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    if (!data) throw new ConnectorNotMine()
    const row = data as Raw
    const plain = decryptSecret(row.secret_encrypted, requireConnectorKey())
    let token: Record<string, unknown>
    try {
        const parsed = plain.startsWith('{') ? JSON.parse(plain) : null
        token = parsed && typeof parsed === 'object' ? parsed : { access_token: plain }
    } catch {
        token = { access_token: plain }
    }
    return { view: toView(row), token }
}

/** 새로고침한 토큰(access_token 이 바뀐 것)을 다시 잠가 넣는다. refresh_token 이 새로 안 오면 옛 것을 이어서 넣어 준다 */
export async function updateConnectorToken(
    db: SupabaseClient, userId: string, id: string, token: Record<string, unknown>,
): Promise<void> {
    const key = requireConnectorKey()
    const { error } = await db.from('connectors')
        .update({ secret_encrypted: encryptSecret(JSON.stringify(token), key), status: 'connected' })
        .eq('id', id).eq('user_id', userId)
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
}

/** 연결 하나 떼기 */
export async function deleteConnector(db: SupabaseClient, userId: string, id: string): Promise<void> {
    const { error, count } = await db.from('connectors').delete({ count: 'exact' })
        .eq('id', id).eq('user_id', userId)
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    if (!count) throw new ConnectorNotMine()
}

/** 방금 썼다, 고장 났다 표시 */
export async function markConnector(
    db: SupabaseClient, userId: string, id: string, status: ConnectorStatus,
): Promise<void> {
    await db.from('connectors')
        .update({ status, last_used_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId)
}
