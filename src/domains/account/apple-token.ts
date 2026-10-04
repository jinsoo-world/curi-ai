// 애플 로그인(웹) 때 한 번 받는 refresh token 을 잠가서 보관한다. 탈퇴할 때 애플 쪽 연결을 끊는 데 쓴다 (앱스토어 5.1.1(v)).
// 잠글 열쇠(CONNECTOR_SECRET_KEY)가 없으면 아무것도 저장하지 않는다(평문 저장 금지). 로그인은 절대 막지 않는다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret, readConnectorKey } from '@/domains/connectors/crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

/** 웹 로그인에 쓰는 애플 Services ID. 없으면 앱 번들 ID(APPLE_SIWA_CLIENT_ID)로 본다 */
export function appleWebClientId(env: NodeJS.ProcessEnv = process.env): string | null {
    return env.APPLE_SIWA_WEB_CLIENT_ID?.trim() || env.APPLE_SIWA_CLIENT_ID?.trim() || null
}

/** 로그인 직후 불린다. 어떤 실패도 던지지 않는다 */
export async function saveAppleRefreshToken(db: Db, userId: string, refreshToken: string | null | undefined, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
    try {
        if (!refreshToken) return false
        const key = readConnectorKey(env.CONNECTOR_SECRET_KEY)
        const clientId = appleWebClientId(env)
        if (!key || !clientId) return false
        const { error } = await db.from('apple_login_tokens').upsert(
            { user_id: userId, refresh_token_encrypted: encryptSecret(refreshToken, key), client_id: clientId, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
        )
        if (error) { console.warn('[apple-token] 저장 실패:', error.code, error.message); return false }
        return true
    } catch (e) {
        console.warn('[apple-token] 저장 오류:', e instanceof Error ? e.message : e)
        return false
    }
}

/** 탈퇴할 때 읽는다. 없거나 못 풀면 null */
export async function readAppleRefreshToken(db: Db, userId: string, env: NodeJS.ProcessEnv = process.env): Promise<{ refreshToken: string; clientId: string } | null> {
    try {
        const key = readConnectorKey(env.CONNECTOR_SECRET_KEY)
        if (!key) return null
        const { data, error } = await db.from('apple_login_tokens').select('refresh_token_encrypted, client_id').eq('user_id', userId).maybeSingle()
        if (error || !data) return null
        const row = data as { refresh_token_encrypted: string; client_id: string }
        return { refreshToken: decryptSecret(row.refresh_token_encrypted, key), clientId: row.client_id }
    } catch (e) {
        console.warn('[apple-token] 읽기 오류:', e instanceof Error ? e.message : e)
        return null
    }
}
