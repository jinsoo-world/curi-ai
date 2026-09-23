// domains/os/cloudsync — 「드라이브・노션에서 가져오기」(갈래 G).
//
// 「내 폴더」(folder.ts)는 브라우저가 훑고 사용자가 파일을 직접 올린다.
// 여기는 서버가 사용자 본인 계정(OAuth, domains/connectors)으로 구글 드라이브・노션을 대신 훑어
// 하루에 한 번(또는 화면에서 「지금 가져오기」) 새로 생겼거나 바뀐 것만 봇 자료로 넣는다.
//
// 등록(knowledge_syncs) = 「이 폴더/이 페이지를 계속 지켜봐라」는 표시일 뿐이고,
// 실제 글은 기존 자료 창구(domains/knowledge, os/knowledge, /api/creator/knowledge/process)를 그대로 쓴다.
//
// 🔒 첫 줄은 항상 「내 팀 봇인가」(assertBotOwned) 확인. 그다음 「내 연결인가」(findConnector) 확인.
// ⚠️ 알려진 한계: 한 파일이 여러 번 바뀌어도 knowledge_syncs 는 폴더・페이지 단위 커서(last_synced_at)만
//    가진다. 파일마다 예전 자료를 지우고 새로 넣는 게 아니라 매번 새로 추가한다 — 오래 쓰면 같은 파일의
//    옛 버전이 자료 목록에 남을 수 있다. 봇 하나당 10개 상한(MAX_SOURCES_PER_BOT)이 안전판이다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { addKnowledgeSource } from '@/domains/knowledge'
import { 올릴수있는파일 } from '@/domains/knowledge/files'
import { markInjectionPatterns } from '@/domains/chat/injection'
import { assertBotOwned, assertRoomForMore } from '@/domains/os/knowledge'
import {
    findConnector, findProvider, markConnector, readConnectorTokenJson, refreshAccessToken, updateConnectorToken,
    notionListPages, notionPageMeta, notionReadPage,
    listDriveFolders, listDriveFilesInFolder, fetchDriveFileContent, DriveAuthExpired,
    DRIVE_MAX_FILE_BYTES, type TokenJson,
} from '@/domains/connectors'

/** 표가 아직 DB 에 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
/** 한 번 실행에서 새로 넣는 파일・문서 수 상한(시간 초과 방지, cron/routines 와 같은 생각) */
const MAX_PER_SYNC_RUN = 20

export type CloudProvider = 'google_drive' | 'notion'

export function cleanCloudProvider(v: unknown): CloudProvider | null {
    return v === 'google_drive' || v === 'notion' ? v : null
}

export class SyncTableMissing extends Error {
    constructor() { super('knowledge_syncs 표가 아직 없다. supabase/migrations/20261001_drive_sync.sql 을 실행해야 한다') }
}
export class CloudNotConnected extends Error {
    constructor(provider: CloudProvider) { super(provider === 'google_drive' ? '구글 드라이브가 연결돼 있지 않아요' : '노션이 연결돼 있지 않아요') }
}

/* ────────────────────────── 고르기 화면: 폴더/페이지 목록 ────────────────────────── */

export interface CloudPickItem { id: string; name: string }

/**
 * 토큰 갱신 분기 — access_token 이 끊겼을 때(401) 다시 로그인을 시도해도 되나.
 * refresh_token 이 있고, 그 공급자 열쇠(클라이언트 아이디・비밀)가 다 있어야만 시도한다.
 * 하나라도 없으면 다시 시도해 봐야 또 실패할 뿐이라, 시도하지 않고 바로 「연결이 끊겼다」로 넘어간다.
 */
export function canAttemptRefresh(args: {
    refreshToken: string; provider: ReturnType<typeof findProvider>; clientId: string | undefined; clientSecret: string | undefined
}): boolean {
    return !!(args.refreshToken && args.provider && args.clientId && args.clientSecret)
}

/** 구글 refresh_token 으로 다시 로그인하고, 한 번만 다시 시도한다. 실패하면 연결을 「끊김」으로 표시한다 */
async function withGoogleDriveAuth<T>(
    db: SupabaseClient, userId: string, connectorId: string, fn: (accessToken: string) => Promise<T>,
): Promise<T> {
    const { token } = await readConnectorTokenJson(db, userId, connectorId)
    const access = typeof token.access_token === 'string' ? token.access_token : ''
    if (!access) throw new Error('구글 드라이브 연결이 이상해요. 연결을 다시 해 주세요')
    try {
        return await fn(access)
    } catch (e) {
        if (!(e instanceof DriveAuthExpired)) throw e
        const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token : ''
        const p = findProvider('google_drive')
        const clientId = p ? process.env[p.envClientId]?.trim() : ''
        const clientSecret = p ? process.env[p.envClientSecret]?.trim() : ''
        if (!canAttemptRefresh({ refreshToken, provider: p, clientId, clientSecret }) || !p || !clientId || !clientSecret) {
            await markConnector(db, userId, connectorId, 'error')
            throw new Error('구글 드라이브 로그인이 끊겼어요. 연결을 다시 해 주세요')
        }
        let refreshed: TokenJson
        try {
            refreshed = await refreshAccessToken(p, { refreshToken, clientId, clientSecret })
        } catch {
            await markConnector(db, userId, connectorId, 'error')
            throw new Error('구글 드라이브 로그인이 끊겼어요. 연결을 다시 해 주세요')
        }
        const merged: Record<string, unknown> = {
            ...token, ...refreshed,
            // 구글은 새로고침 응답에 refresh_token 을 다시 안 주는 게 보통이다 — 옛 것을 이어서 쓴다
            refresh_token: typeof refreshed.refresh_token === 'string' ? refreshed.refresh_token : refreshToken,
            obtained_at: new Date().toISOString(),
        }
        await updateConnectorToken(db, userId, connectorId, merged)
        const newAccess = typeof refreshed.access_token === 'string' ? refreshed.access_token : ''
        if (!newAccess) throw new Error('구글 드라이브 로그인이 끊겼어요. 연결을 다시 해 주세요')
        return await fn(newAccess)
    }
}

/** 고르기 화면 — 이 사람이 붙여 둔 그 서비스에서 고를 수 있는 폴더(드라이브)/페이지(노션) 목록 */
export async function listCloudItems(db: SupabaseClient, userId: string, provider: CloudProvider): Promise<CloudPickItem[]> {
    const connector = await findConnector(db, userId, provider)
    if (!connector) throw new CloudNotConnected(provider)

    if (provider === 'google_drive') {
        return withGoogleDriveAuth(db, userId, connector.id, async token =>
            (await listDriveFolders(token)).map(f => ({ id: f.id, name: f.name })))
    }

    const { token } = await readConnectorTokenJson(db, userId, connector.id)
    const access = typeof token.access_token === 'string' ? token.access_token : ''
    if (!access) throw new Error('노션 연결이 이상해요. 연결을 다시 해 주세요')
    const pages = await notionListPages(access)
    return pages.map(p => ({ id: p.id, name: p.title || '제목 없는 문서' }))
}

/* ────────────────────────── 등록(knowledge_syncs) ────────────────────────── */

export interface CloudSyncView {
    id: string
    provider: CloudProvider
    folderOrPageId: string
    name: string
    status: 'pending' | 'ok' | 'error'
    lastError: string | null
    itemCount: number
    lastSyncedAt: string | null
    createdAt: string
}

type SyncRaw = {
    id: string; provider: CloudProvider; folder_or_page_id: string; name: string
    status: CloudSyncView['status']; last_error: string | null; item_count: number
    last_synced_at: string | null; created_at: string
}
const SELECT = 'id, provider, folder_or_page_id, name, status, last_error, item_count, last_synced_at, created_at'
const toView = (r: SyncRaw): CloudSyncView => ({
    id: r.id, provider: r.provider, folderOrPageId: r.folder_or_page_id, name: r.name,
    status: r.status, lastError: r.last_error, itemCount: r.item_count ?? 0,
    lastSyncedAt: r.last_synced_at, createdAt: r.created_at,
})

/** 고른 폴더/페이지를 「계속 지켜봐라」로 등록한다. 이미 등록된 건 이름만 새로 고친다. 등록된 줄을 그대로 돌려준다(바로 첫 동기화를 돌리려고) */
export async function registerCloudSyncs(
    db: SupabaseClient, userId: string, mentorId: string, provider: CloudProvider, items: CloudPickItem[],
): Promise<{ id: string; folderOrPageId: string; name: string }[]> {
    await assertBotOwned(db, userId, mentorId)
    if (items.length === 0) throw new Error('고른 것이 없어요')
    const out: { id: string; folderOrPageId: string; name: string }[] = []
    for (const it of items.slice(0, 20)) {
        const name = (it.name || '').slice(0, 120)
        const { data, error } = await db.from('knowledge_syncs').upsert({
            user_id: userId, mentor_id: mentorId, provider,
            folder_or_page_id: it.id, name, status: 'pending',
        }, { onConflict: 'user_id,mentor_id,provider,folder_or_page_id' }).select('id').single()
        if (error) {
            if (error.code === TABLE_MISSING) throw new SyncTableMissing()
            throw new Error(error.message)
        }
        out.push({ id: (data as { id: string }).id, folderOrPageId: it.id, name })
    }
    return out
}

/** 이 봇에 등록된 동기화 목록 */
export async function listCloudSyncs(db: SupabaseClient, userId: string, mentorId: string): Promise<CloudSyncView[]> {
    await assertBotOwned(db, userId, mentorId)
    const { data, error } = await db.from('knowledge_syncs').select(SELECT)
        .eq('user_id', userId).eq('mentor_id', mentorId).order('created_at', { ascending: false })
    if (error) {
        if (error.code === TABLE_MISSING) return []
        throw new Error(error.message)
    }
    return ((data ?? []) as SyncRaw[]).map(toView)
}

/** 동기화 등록 하나 떼기(다시 지켜보지 않는다. 이미 넣은 자료는 그대로 남는다) */
export async function deleteCloudSync(db: SupabaseClient, userId: string, syncId: string): Promise<void> {
    const { error, count } = await db.from('knowledge_syncs').delete({ count: 'exact' }).eq('id', syncId).eq('user_id', userId)
    if (error) {
        if (error.code === TABLE_MISSING) throw new SyncTableMissing()
        throw new Error(error.message)
    }
    if (!count) throw new Error('그 동기화를 못 찾았어요')
}

/**
 * 수정시각 비교 — 「새로 바뀐 것만」의 핵심 판정 하나.
 * 커서(마지막으로 다 봤다고 표시한 시각)보다 이 파일/문서의 수정시각이 뒤라면 다시 읽는다.
 * 커서가 없으면(한 번도 동기화한 적 없음) 항상 「바뀌었다」로 본다.
 * 모양이 이상한 시각(파싱 실패)은 안전하게 「바뀌었다」로 본다 — 놓치는 것보다 중복이 낫다.
 */
export function isChangedSince(modifiedIso: string | null | undefined, cursorIso: string | null): boolean {
    if (!cursorIso) return true
    const cursor = new Date(cursorIso).getTime()
    if (Number.isNaN(cursor)) return true
    const modified = modifiedIso ? new Date(modifiedIso).getTime() : NaN
    if (Number.isNaN(modified)) return true
    return modified > cursor
}

/* ────────────────────────── 실제로 가져오기 ────────────────────────── */

interface SyncRow {
    id: string; userId: string; mentorId: string; provider: CloudProvider
    folderOrPageId: string; name: string; lastSyncedAt: string | null
}

/** 내 것인지 확인하고 돌릴 수 있는 모양으로 행 하나를 가져온다. 「지금 가져오기」 단추가 부른다 */
export async function getCloudSyncRow(db: SupabaseClient, userId: string, syncId: string): Promise<SyncRow | null> {
    const { data, error } = await db.from('knowledge_syncs')
        .select('id, user_id, mentor_id, provider, folder_or_page_id, name, last_synced_at')
        .eq('id', syncId).eq('user_id', userId).maybeSingle()
    if (error) {
        if (error.code === TABLE_MISSING) return null
        throw new Error(error.message)
    }
    if (!data) return null
    const r = data as { id: string; user_id: string; mentor_id: string; provider: CloudProvider; folder_or_page_id: string; name: string; last_synced_at: string | null }
    return { id: r.id, userId: r.user_id, mentorId: r.mentor_id, provider: r.provider, folderOrPageId: r.folder_or_page_id, name: r.name, lastSyncedAt: r.last_synced_at }
}

/** 확장자에 맞는 업로드 저장 타입(대충이어도 된다 — process 라우트는 title 의 확장자로 읽는 법을 정한다) */
const CONTENT_TYPE: Record<string, string> = {
    txt: 'text/plain', csv: 'text/csv', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** 저장소 키에 넣을 이름(영문・숫자만. 한글을 넣으면 저장소가 거부한다 — upload-url 라우트와 같은 규칙) */
function sanitizeStorageBase(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '').replace(/^[._-]+/, '').slice(0, 40)
}

async function runDriveSync(db: SupabaseClient, row: SyncRow, connectorId: string, baseUrl: string): Promise<number> {
    return withGoogleDriveAuth(db, row.userId, connectorId, async token => {
        const files = await listDriveFilesInFolder(token, row.folderOrPageId, 올릴수있는파일)
        const changed = files
            .filter(f => isChangedSince(f.modifiedTime, row.lastSyncedAt) && f.size <= DRIVE_MAX_FILE_BYTES)
            .slice(0, MAX_PER_SYNC_RUN)

        let count = 0
        for (const f of changed) {
            try {
                await assertRoomForMore(db, row.mentorId)
            } catch {
                break // 자료 칸(봇 하나당 10개)이 다 찼다. 이번 실행은 여기까지
            }
            const content = await fetchDriveFileContent(token, f)
            const baseName = sanitizeStorageBase(content.fileName.replace(/\.[^.]+$/, '')) || 'file'
            const storageKey = `${row.mentorId}/${Date.now()}-drive-${baseName}.${content.ext}`

            const { error: upErr } = await db.storage.from('knowledge-files')
                .upload(storageKey, content.buffer, { contentType: CONTENT_TYPE[content.ext] ?? 'application/octet-stream', upsert: true })
            if (upErr) { console.error('[cloudsync] 드라이브 파일 올리기 실패', f.path, upErr.message); continue }

            const { data: source, error: insErr } = await db.from('knowledge_sources').insert({
                mentor_id: row.mentorId,
                source_type: content.ext === 'pdf' ? 'pdf' : 'text',
                title: content.fileName.slice(0, 120),
                file_size: content.buffer.length,
                original_url: storageKey,
                processing_status: 'pending',
            }).select('id').single()
            if (insErr || !source) {
                await db.storage.from('knowledge-files').remove([storageKey])
                console.error('[cloudsync] 드라이브 자료 칸 못 만듦', f.path, insErr?.message)
                continue
            }

            try {
                const res = await fetch(`${baseUrl}/api/creator/knowledge/process`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourceId: (source as { id: string }).id, mentorId: row.mentorId }),
                })
                if (!res.ok) { console.error('[cloudsync] 드라이브 파일 못 읽음', f.path, res.status); continue }
                count++
            } catch (e) {
                console.error('[cloudsync] 드라이브 파일 처리 요청 실패', f.path, e instanceof Error ? e.message : e)
            }
        }
        return count
    })
}

async function runNotionSync(db: SupabaseClient, row: SyncRow, connectorId: string): Promise<number> {
    const { token } = await readConnectorTokenJson(db, row.userId, connectorId)
    const access = typeof token.access_token === 'string' ? token.access_token : ''
    if (!access) throw new Error('노션 연결이 이상해요. 연결을 다시 해 주세요')

    const meta = await notionPageMeta(access, row.folderOrPageId)
    if (!isChangedSince(meta.lastEditedTime, row.lastSyncedAt)) return 0 // 그동안 안 바뀌었다 — 「새 것만」

    try {
        await assertRoomForMore(db, row.mentorId)
    } catch {
        return 0 // 자료 칸이 다 찼다
    }

    const text = await notionReadPage(access, row.folderOrPageId)
    if (!text || text.trim().length < 20) return 0

    const { text: marked, marked: hits } = markInjectionPatterns(text)
    if (hits > 0) console.warn('[cloudsync] 자료 속 명령문 표식', { mentorId: row.mentorId, kind: 'notion', hits })
    await addKnowledgeSource(db, row.mentorId, meta.title || row.name || '노션 문서', marked, 'text', meta.url || undefined)
    return 1
}

/** 등록 하나를 실제로 돌린다. 실패해도 던지지 않는다 — 결과를 knowledge_syncs 에 사람 말로 남긴다 */
export async function runCloudSync(db: SupabaseClient, row: SyncRow, baseUrl: string): Promise<{ ok: boolean; itemCount: number }> {
    const connector = await findConnector(db, row.userId, row.provider)
    if (!connector) {
        await 결과기록(db, row.id, 'error', '연결이 끊겼어요. 다시 연결해 주세요', 0, false)
        return { ok: false, itemCount: 0 }
    }
    try {
        const itemCount = row.provider === 'google_drive'
            ? await runDriveSync(db, row, connector.id, baseUrl)
            : await runNotionSync(db, row, connector.id)
        await 결과기록(db, row.id, 'ok', null, itemCount, true)
        return { ok: true, itemCount }
    } catch (e) {
        const message = e instanceof Error ? e.message : '동기화하지 못했어요'
        console.error('[cloudsync] 실패', row.provider, row.folderOrPageId, message)
        await 결과기록(db, row.id, 'error', message, 0, false)
        return { ok: false, itemCount: 0 }
    }
}

/** 결과를 knowledge_syncs 에 남긴다. 성공했을 때만 커서(last_synced_at)를 지금 시각으로 민다 */
async function 결과기록(
    db: SupabaseClient, syncId: string, status: 'ok' | 'error', lastError: string | null, itemCount: number, advanceCursor: boolean,
): Promise<void> {
    const patch: Record<string, unknown> = { status, last_error: lastError, item_count: itemCount, updated_at: new Date().toISOString() }
    if (advanceCursor) patch.last_synced_at = new Date().toISOString()
    await db.from('knowledge_syncs').update(patch).eq('id', syncId)
}

/** cron 이 부르는 「지금 돌 것 전부」. 오래 안 돈 것부터, 한 번에 너무 많이 돌지 않게 상한을 둔다 */
export async function listDueCloudSyncs(db: SupabaseClient, limit = 30): Promise<SyncRow[]> {
    const { data, error } = await db.from('knowledge_syncs')
        .select('id, user_id, mentor_id, provider, folder_or_page_id, name, last_synced_at')
        .order('last_synced_at', { ascending: true, nullsFirst: true })
        .limit(limit)
    if (error) {
        if (error.code === TABLE_MISSING) return []
        throw new Error(error.message)
    }
    return ((data ?? []) as { id: string; user_id: string; mentor_id: string; provider: CloudProvider; folder_or_page_id: string; name: string; last_synced_at: string | null }[])
        .map(r => ({ id: r.id, userId: r.user_id, mentorId: r.mentor_id, provider: r.provider, folderOrPageId: r.folder_or_page_id, name: r.name, lastSyncedAt: r.last_synced_at }))
}
