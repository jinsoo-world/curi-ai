// domains/mentor — 멘토 데이터 조회

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MentorCardData } from './types'
import { createAdminClient } from '@/lib/supabase/admin'
import { findFallbackMentor as findFallback } from '@/lib/mentors-data'
import { PUBLIC_MENTOR_FIELDS, PRIVATE_MENTOR_FIELDS } from './public-fields'

const PUBLIC_SELECT = PUBLIC_MENTOR_FIELDS.join(', ')
const PRIVATE_SELECT = PRIVATE_MENTOR_FIELDS.join(', ')

/** 예전 select('*') 결과와 같은 느슨한 모양. 호출부가 칸 이름으로 바로 읽는다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MentorRow = any

/**
 * 비밀 칸(지시문 등)을 관리자 열쇠로 붙인다. 서버 안에서만 쓰는 값이다.
 * DB 칸 권한상 로그인 세션/손님 열쇠로는 비밀 칸을 못 읽는다(20261021_mentors_column_lockdown.sql).
 * 관리자 열쇠가 없으면(로컬 등) 공개 칸만 돌려준다.
 */
async function withPrivateFields(row: MentorRow, admin?: SupabaseClient): Promise<MentorRow> {
    let db: SupabaseClient
    try {
        db = admin ?? createAdminClient()
    } catch {
        return row
    }
    const { data } = await db.from('mentors').select(PRIVATE_SELECT).eq('id', row.id).maybeSingle()
    return data ? { ...row, ...(data as unknown as MentorRow) } : row
}

/**
 * 활성 멘토 목록 조회 (Admin 클라이언트 우선)
 */
export async function getActiveMentors(): Promise<MentorCardData[]> {
    let db: SupabaseClient

    try {
        db = createAdminClient()
    } catch {
        // service_role key 없으면 일반 클라이언트는 호출측에서 전달
        console.warn('[Mentor Queries] Admin client unavailable, returning empty')
        return []
    }

    const { data, error } = await db
        .from('mentors')
        .select('id, name, title, description, avatar_url, expertise, greeting_message, sample_questions, voice_sample_url, voice_id, sort_order, creator_id')
        .eq('is_active', true)
        .not('slug', 'like', 'os-demo-%')   // 손님 시연용 팀장 4명은 마켓에 안 보인다
        .order('sort_order', { ascending: true })

    if (error) {
        console.error('[Mentor Queries] getActiveMentors error:', JSON.stringify(error))
        return []
    }
    return (data as MentorCardData[]) || []
}

/**
 * ID 또는 slug로 멘토 조회 (DB → slug → 폴백 순서)
 *
 * db 가 로그인 세션 클라이언트여도 된다: 볼 수 있는 봇인지는 db(행 정책)로 공개 칸만 읽어 정하고,
 * 그 봇의 비밀 칸(지시문 등)은 관리자 열쇠로 따로 붙인다. 돌려준 값은 서버 안에서만 쓴다
 * (화면·응답으로 낼 땐 toPublicMentor 로 거른다).
 */
export async function getMentorById(
    db: SupabaseClient,
    mentorId: string,
): Promise<MentorRow | null> {
    // 1) ID로 조회
    const { data: byId, error } = await db
        .from('mentors')
        .select(PUBLIC_SELECT)
        .eq('id', mentorId)
        .single()

    if (byId && !error) return withPrivateFields(byId as unknown as MentorRow)

    // 2) slug로 재시도
    const { data: bySlug } = await db
        .from('mentors')
        .select(PUBLIC_SELECT)
        .eq('slug', mentorId)
        .single()

    if (bySlug) return withPrivateFields(bySlug as unknown as MentorRow)

    // 3) 폴백 데이터
    const fallback = findFallback(mentorId)
    if (fallback) {
        console.log(`[Mentor Queries] 폴백 멘토 데이터 사용: ${mentorId}`)
        return fallback as unknown as MentorRow
    }

    return null
}

/**
 * 공개 멘토 상세 조회 (목록과 같은 기준)
 *
 * 목록(getActiveMentors)은 관리자 권한 + is_active=true 로 뽑는데
 * 상세는 사용자 권한으로 뽑아, 목록엔 보이지만 누르면 404 인 카드가 생겼다.
 * (2026-09-04 실측: 「구글 문서 치트키」 등 2개. 줄은 살아 있고 is_active=true 인데
 *  사용자 권한 조회만 0행이었다.) 두 화면 기준을 하나로 맞춘다.
 */
export async function getPublicMentorById(mentorId: string, opts: { withPrivate?: boolean } = {}): Promise<MentorRow | null> {
    let db: SupabaseClient
    try {
        db = createAdminClient()
    } catch {
        return null
    }

    // 화면(소개·마켓·공유 그림)은 공개 칸만. 대화 창구만 withPrivate 로 지시문까지 읽는다
    const { data: byId } = await db
        .from('mentors')
        .select(PUBLIC_SELECT)
        .eq('id', mentorId)
        .eq('is_active', true)
        .maybeSingle()
    const { data: bySlug } = byId ? { data: null } : await db
        .from('mentors')
        .select(PUBLIC_SELECT)
        .eq('slug', mentorId)
        .eq('is_active', true)
        .maybeSingle()
    const row = (byId ?? bySlug ?? null) as unknown as MentorRow | null
    if (!row) return null
    return opts.withPrivate ? withPrivateFields(row, db) : row
}

/**
 * AI 주소(handle)로 공개 멘토 찾기
 *
 * 리더가 수정 화면 프리미엄 탭에서 정하는 주소는 mentors.handle 에 저장된다.
 * 그런데 curi-ai.com/{주소} 화면은 users.handle 만 찾아서, 리더가 정한
 * AI 주소로 들어가면 404 였다(2026-09-04 확인). 그 통로를 잇는다.
 */
export async function getPublicMentorByHandle(handle: string) {
    let db: SupabaseClient
    try {
        db = createAdminClient()
    } catch {
        return null
    }

    const { data } = await db
        .from('mentors')
        .select('id, name, handle, is_active')
        .eq('handle', handle)
        .eq('is_active', true)
        .maybeSingle()

    return data ?? null
}

/**
 * 크리에이터(유저)가 만든 활성 멘토 목록 조회
 */
export async function getMentorsByCreator(
    db: SupabaseClient,
    userId: string,
): Promise<MentorCardData[]> {
    // creator_profiles에서 해당 유저의 creator_id 조회 후 멘토 목록
    const { data: creatorProfile } = await db
        .from('creator_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

    if (!creatorProfile) return []

    const { data, error } = await db
        .from('mentors')
        .select('id, name, title, description, avatar_url, expertise, greeting_message, sample_questions, voice_sample_url, voice_id')
        .eq('creator_id', creatorProfile.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[Mentor Queries] getMentorsByCreator error:', JSON.stringify(error))
        return []
    }
    return (data as MentorCardData[]) || []
}

/**
 * 멘토 프로필 상세 조회 (프로필 페이지용)
 * mentor + knowledge_sources + session count + creator info
 */
export async function getMentorProfile(mentorId: string) {
    const db = createAdminClient()

    // 1) 멘토 기본 정보
    const mentor = await getMentorById(db, mentorId)
    if (!mentor) return null

    // 2) 학습 지식 소스 (활성 + 처리 완료된 것만)
    const { data: knowledgeSources } = await db
        .from('knowledge_sources')
        .select('id, file_name, source_type, char_count, summary, status, created_at')
        .eq('mentor_id', mentor.id)
        .in('status', ['processed', 'active'])
        .order('created_at', { ascending: false })

    // 3) 대화 수 (sessions count)
    const { count: sessionCount } = await db
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('mentor_id', mentor.id)

    // 4) 크리에이터 정보
    let creatorInfo = null
    if (mentor.creator_id) {
        const { data: creator } = await db
            .from('creator_profiles')
            .select('user_id, display_name, bio, expertise, organization, job_title')
            .eq('id', mentor.creator_id)
            .single()

        if (creator) {
            // users 테이블에서 아바타
            const { data: userData } = await db
                .from('users')
                .select('avatar_url, email')
                .eq('id', creator.user_id)
                .single()

            creatorInfo = {
                ...creator,
                avatar_url: userData?.avatar_url || null,
            }
        }
    }

    return {
        mentor,
        knowledgeSources: knowledgeSources || [],
        sessionCount: sessionCount || 0,
        creatorInfo,
    }
}
