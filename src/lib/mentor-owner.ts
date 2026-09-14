// 멘토(AI) 주인 확인 — 남의 AI 를 건드리지 못하게 막는 공용 관문
//
// 왜 필요했나 = 크리에이터용 창구 여러 곳이 "어느 AI 인지"를 브라우저가 적어 보내는
// 대로 믿고, 그게 그 사람 것인지 확인하지 않았다. 게다가 전부 최고권한 열쇠를 써서
// DB 자체의 보호장치도 걸리지 않았다. 로그인만 하면 남의 AI 의 이름·성격·가격·
// 학습자료·목소리를 바꾸거나 지울 수 있었다. (2026-09-14 전수조사)
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/** 어드민 계정 — 전체 멘토를 다룰 수 있다 */
const ADMIN_EMAIL = 'jin@mission-driven.kr'

export type MentorOwnerOk = {
    ok: true
    userId: string
    userEmail: string
    creatorId: string | null
    isAdmin: boolean
    mentor: { id: string; creator_id: string | null; mentor_type: string | null }
    admin: SupabaseClient
}
export type MentorOwnerFail = { ok: false; error: string; status: number }

/**
 * 로그인한 사람이 이 멘토의 주인인지 확인한다.
 * 통과하면 최고권한 클라이언트(admin)까지 같이 돌려줘서 호출부가 그대로 이어 쓸 수 있다.
 */
export async function requireMentorOwner(
    mentorId: unknown,
): Promise<MentorOwnerOk | MentorOwnerFail> {
    if (typeof mentorId !== 'string' || !mentorId) {
        return { ok: false, error: '멘토 ID는 필수입니다.', status: 400 }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false, error: '로그인이 필요합니다.', status: 401 }
    }

    const admin = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: creator } = await admin
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

    const { data: mentor } = await admin
        .from('mentors')
        .select('id, creator_id, mentor_type')
        .eq('id', mentorId)
        .single()

    if (!mentor) {
        return { ok: false, error: '멘토를 찾을 수 없습니다.', status: 404 }
    }

    const isAdmin = user.email === ADMIN_EMAIL
    const creatorId = creator?.id ?? null

    // 주인이 아니면 여기서 끝. 어드민만 예외.
    if (!isAdmin && (!creatorId || mentor.creator_id !== creatorId)) {
        return { ok: false, error: '권한이 없습니다.', status: 403 }
    }

    return {
        ok: true,
        userId: user.id,
        userEmail: user.email || '',
        creatorId,
        isAdmin,
        mentor,
        admin,
    }
}
