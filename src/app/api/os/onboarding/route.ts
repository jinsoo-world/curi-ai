// /api/os/onboarding = 가입 온보딩 6화면 (대표 승인 0928 23:15)
// GET  = 띄울지(show), 이어서 채울 답, 로그인 때 동의한 약관, 미리 채울 초대 코드, 이름
// POST = 화면 하나의 답 저장 { step, ...답 }. 들어온 길(기기, 운영체제, 앱 여부, utm, referrer)은 서버가 채운다.
// 추천 보상(클로버)은 주지 않는다. 귀속 기록만 남긴다.
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    sanitizeStep, detectClientContext, parseTermsCookie, TERMS_COOKIE, TERMS_VERSION, STEP_ORDER,
    firstJobFor, cleanRefCode,
} from '@/domains/os/onboarding'
import { ensureOnboardingRow, attributeReferral } from '@/domains/os/onboarding-server'

export const dynamic = 'force-dynamic'

async function currentUser() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        return user ?? null
    } catch { return null }
}

const ROW_FIELDS = 'status, step, terms_agreed_at, marketing_agreed, acquisition_source, acquisition_detail, leader_code_entered, referral_code, use_cases, age_band, gender, occupation, runs_class_or_group, audience_size_band, org_name, leader_contact_ok'

export async function GET() {
    const user = await currentUser()
    if (!user) return NextResponse.json({ show: false, guest: true })
    const db = createAdminClient()
    const cookieStore = await cookies()
    let show = false
    try {
        show = await ensureOnboardingRow(db, {
            userId: user.id,
            authCreatedAt: user.created_at,
            refCookie: cookieStore.get('curi_ref')?.value ?? null,
            termsAt: parseTermsCookie(cookieStore.get(TERMS_COOKIE)?.value),
            provider: user.app_metadata?.provider ?? null,
        })
    } catch (e) {
        console.error('[onboarding] 준비 실패:', e instanceof Error ? e.message : e)
        return NextResponse.json({ show: false, error: 'unavailable' })
    }
    const [row, me] = await Promise.all([
        db.from('user_onboarding').select(ROW_FIELDS).eq('user_id', user.id).maybeSingle(),
        db.from('users').select('display_name, referred_by, terms_agreed_at').eq('id', user.id).maybeSingle(),
    ])
    return NextResponse.json({
        show,
        answers: row.data ?? null,
        termsAgreed: !!(row.data?.terms_agreed_at || me.data?.terms_agreed_at),
        refCode: row.data?.referral_code || me.data?.referred_by || cleanRefCode(cookieStore.get('curi_ref')?.value) || null,
        displayName: me.data?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || null,
    })
}

const cut = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

export async function POST(req: NextRequest) {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const parsed = sanitizeStep(body.step, body)
    if (!('step' in parsed)) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { step, fields } = parsed
    const db = createAdminClient()
    const now = new Date().toISOString()

    const { data: existing } = await db.from('user_onboarding').select('status, use_cases, age_agreed_at, age_band').eq('user_id', user.id).maybeSingle()
    if (!existing) return NextResponse.json({ error: '온보딩 대상이 아니에요.' }, { status: 409 })
    // 마치기 = 필수 답(약관, 맡길 일, 나이대)이 다 있어야 한다
    if (step === 'done' && (!existing.age_agreed_at || !(existing.use_cases as string[] | null)?.length || !existing.age_band)) {
        return NextResponse.json({ error: '앞 화면의 필수 답을 먼저 골라 주세요.' }, { status: 400 })
    }

    // 들어온 길 = 기기와 앱 여부는 지금 요청에서, utm 과 referrer 는 이미 쌓고 있는 visit_logs 의 첫 줄에서
    const ua = req.headers.get('user-agent') || ''
    const ctx = detectClientContext(ua, typeof body.nativePlatform === 'string' ? body.nativePlatform : null)
    const anonId = cut(body.anonId, 60)?.replace(/[^0-9A-Za-z_-]/g, '') || null
    let visit: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; referrer: string | null; path: string | null } | null = null
    try {
        const q = db.from('visit_logs').select('utm_source, utm_medium, utm_campaign, referrer, path, created_at')
        const { data } = await (anonId ? q.or(`user_id.eq.${user.id},anon_id.eq.${anonId}`) : q.eq('user_id', user.id))
            .order('created_at', { ascending: true }).limit(1)
        visit = data?.[0] ?? null
    } catch { /* 없으면 비운다 */ }

    const update: Record<string, unknown> = {
        updated_at: now,
        step: STEP_ORDER.indexOf(step) + 1,
        device: ctx.device,
        os: ctx.os,
        app_shell: ctx.app_shell,
        user_agent: ua.slice(0, 300) || null,
        visitor_id: cut(body.visitorId, 60),
        ...(visit ? {
            utm_source: visit.utm_source, utm_medium: visit.utm_medium, utm_campaign: visit.utm_campaign,
            referrer: visit.referrer, landing_path: visit.path,
        } : {}),
    }
    let refOk: boolean | null = null

    if (step === 'terms') {
        const marketing = fields.marketing === true
        Object.assign(update, {
            terms_version: TERMS_VERSION,
            ...(existing.age_agreed_at ? {} : { age_agreed_at: now, terms_agreed_at: now, privacy_agreed_at: now }),
            marketing_agreed: marketing,
            marketing_agreed_at: marketing ? now : null,
        })
        await db.from('users').update({ terms_agreed_at: now }).eq('id', user.id).is('terms_agreed_at', null)
        if (marketing) {
            await db.from('users').update({ marketing_agreed: true, marketing_consent: true, marketing_agreed_at: now }).eq('id', user.id)
        }
    } else if (step === 'profile') {
        Object.assign(update, fields)
        // users.gender 는 'male' | 'female' | 'other' 만 받는다 (DB 검사 규칙)
        const g = fields.gender === 'female' || fields.gender === 'male' ? fields.gender : null
        if (g) await db.from('users').update({ gender: g }).eq('id', user.id).is('gender', null)
    } else if (step === 'done') {
        Object.assign(update, { status: 'done', completed_at: now, first_bot_mentor_id: cut(body.firstBotMentorId, 40)?.match(/^[0-9a-f-]{36}$/i)?.[0] ?? null })
        await db.from('users').update({ onboarding_completed: true }).eq('id', user.id)
    } else {
        Object.assign(update, fields)
    }

    const { error } = await db.from('user_onboarding').update(update).eq('user_id', user.id)
    if (error) {
        console.error('[onboarding] 저장 실패:', error.message)
        return NextResponse.json({ error: '저장하지 못했어요. 다시 눌러 주세요.' }, { status: 500 })
    }
    // 초대 코드 직접 입력 = 링크로 이미 귀속됐으면 덮어쓰지 않는다
    if (step === 'source' && fields.leader_code_entered) {
        refOk = (await attributeReferral(db, user.id, fields.leader_code_entered, 'code')).ok
    }
    const useCases = step === 'uses' ? (fields.use_cases as string[]) : (existing.use_cases as string[] | null)
    return NextResponse.json({ ok: true, refOk, firstJob: firstJobFor(useCases) })
}
