import { createClient } from '@supabase/supabase-js'

/**
 * Supabase Admin 클라이언트 (Service Role Key 사용)
 * - RLS를 완전히 우회합니다
 * - 서버사이드 API 라우트에서만 사용하세요
 * - 절대 클라이언트에 노출하지 마세요
 */
export function createAdminClient() {
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
    })
}
