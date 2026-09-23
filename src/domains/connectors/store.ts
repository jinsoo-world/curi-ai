// domains/connectors — 연결 목록 읽고 쓰기 (connectors 표).
//
// 규칙 셋 (permissions.ts 와 같다)
//  1) 서버는 service_role 로 DB 를 만지므로 **모든 질의에 user_id 를 건다**.
//  2) 열쇠(secret)는 잠근 채로만 넣고, 밖으로 나가는 모양(ConnectorView)에는 절대 담지 않는다.
//  3) 표가 아직 없으면 「연결 없음」으로 본다 — 화면이 죽지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret, encryptSecret, maskSecret, requireConnectorKey } from './crypto'
import { cleanKind, type ConnectorKind, type ConnectorStatus, type ConnectorView } from './types'

/** 표가 아직 DB 에 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'

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
        if (error.code === TABLE_MISSING) return []
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
        if (error.code === TABLE_MISSING) return null
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
        meta: { ...(input.meta ?? {}), hint: maskSecret(secret) },
        status: 'connected',
    }).select(SELECT).single()
    if (error || !data) {
        if (error?.code === TABLE_MISSING) throw new ConnectorTableMissing()
        throw new Error(error?.message ?? '연결을 붙이지 못했어요')
    }
    return toView(data as Raw)
}

/** 내 연결의 열쇠를 푼다. 도구를 실제로 쓸 때만 부른다 */
export async function readConnectorSecret(
    db: SupabaseClient, userId: string, id: string,
): Promise<{ view: ConnectorView; secret: string }> {
    const { data, error } = await db.from('connectors').select(SELECT)
        .eq('id', id).eq('user_id', userId).maybeSingle()     // 🔒 남의 연결 번호를 적어 보내도 안 나온다
    if (error) {
        if (error.code === TABLE_MISSING) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    if (!data) throw new ConnectorNotMine()
    const row = data as Raw
    return { view: toView(row), secret: decryptSecret(row.secret_encrypted, requireConnectorKey()) }
}

/** 연결 하나 떼기 */
export async function deleteConnector(db: SupabaseClient, userId: string, id: string): Promise<void> {
    const { error, count } = await db.from('connectors').delete({ count: 'exact' })
        .eq('id', id).eq('user_id', userId)
    if (error) {
        if (error.code === TABLE_MISSING) throw new ConnectorTableMissing()
        throw new Error(error.message)
    }
    if (!count) throw new ConnectorNotMine()
}

/** 방금 썼다·고장 났다 표시 */
export async function markConnector(
    db: SupabaseClient, userId: string, id: string, status: ConnectorStatus,
): Promise<void> {
    await db.from('connectors')
        .update({ status, last_used_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId)
}
