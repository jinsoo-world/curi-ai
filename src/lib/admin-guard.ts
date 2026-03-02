import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

// 허용된 admin 이메일 목록 (환경변수 또는 하드코딩)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)

/**
 * 서버 컴포넌트에서 admin 인증 확인
 * admin이 아니면 /mentors로 리다이렉트
 */
export async function requireAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // 방법 1: 환경변수의 허용 이메일 목록 체크
    if (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(user.email || '')) {
        return user
    }

    // 방법 2: DB의 role 컬럼 체크
    const adminClient = createAdminClient()
    const { data: userData } = await adminClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (userData?.role === 'admin') {
        return user
    }

    // admin이 아니면 홈으로
    redirect('/mentors')
}

/**
 * API 라우트에서 admin 인증 확인
 * admin이 아니면 401 반환
 */
export async function requireAdminAPI() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Unauthorized', status: 401, user: null }
    }

    // 이메일 체크
    if (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(user.email || '')) {
        return { error: null, status: 200, user }
    }

    // DB role 체크
    const adminClient = createAdminClient()
    const { data: userData } = await adminClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (userData?.role === 'admin') {
        return { error: null, status: 200, user }
    }

    return { error: 'Forbidden', status: 403, user: null }
}
