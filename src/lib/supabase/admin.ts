import { createClient } from '@supabase/supabase-js'
import { timeoutFetch, DB_TIMEOUT_MS, DB_LONG_TIMEOUT_MS } from './timeout-fetch'

/**
 * Supabase Admin 클라이언트 (Service Role Key 사용)
 * - RLS를 완전히 우회합니다
 * - 서버사이드 API 라우트에서만 사용하세요
 * - 절대 클라이언트에 노출하지 마세요
 * - 모든 요청에 마감이 걸린다: 기본 5초. 저장소 업로드·대량 쓰기처럼 오래 걸리는 일은 { longRunning: true } (60초)
 */
export function createAdminClient(opts: { longRunning?: boolean } = {}) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. ' +
            'Supabase 대시보드 → Settings → API → service_role key를 .env.local에 추가하세요.'
        )
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global: { fetch: timeoutFetch(opts.longRunning ? DB_LONG_TIMEOUT_MS : DB_TIMEOUT_MS) },
    })
}
