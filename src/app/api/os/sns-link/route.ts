// /api/os/sns-link = 내 SNS, 블로그 링크 연동 (대표 승인 0928 23:29)
// GET  = 저장한 링크 목록과 보너스 받았는지
// POST = { url, source } 링크 저장 + 읽을 수 있으면 공개 글을 읽어 내 봇 자료에 넣기.
//        자료가 1건 이상 들어가면 클로버 50개를 계정당 한 번, 같은 주소 한 계정 (DB 함수가 중복을 막는다)
//        { action: 'paste', url, posts: string[] } = 네이버 블로그, 브런치 대표 글 붙여넣기 (자동 읽기 대신)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { connectSnsLink, pasteSnsPosts } from '@/domains/os/sns-link'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 읽기에 쓰는 시간 (서버 한도 60초 안에서 응답까지 끝나야 한다) */
const READ_BUDGET_MS = 40_000

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET() {
    const user = await me()
    if (!user) return NextResponse.json({ links: [], guest: true })
    const db = createAdminClient()
    const [links, bonus] = await Promise.all([
        db.from('user_sns_links').select('id, url, platform, status, added_count, note, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        db.from('sns_link_bonuses').select('clovers, created_at').eq('user_id', user.id).maybeSingle(),
    ])
    return NextResponse.json({ links: links.data ?? [], bonusGranted: !!bonus.data })
}

export async function POST(req: NextRequest) {
    const started = Date.now()
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const source = body.source === 'onboarding' ? 'onboarding' : 'settings'
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || '주인'
    try {
        if (body.action === 'paste') {
            const r = await pasteSnsPosts(createAdminClient(), { userId: user.id, displayName, url: body.url, posts: body.posts })
            return NextResponse.json(r)
        }
        const r = await connectSnsLink(createAdminClient(), {
            userId: user.id,
            displayName,
            url: body.url,
            source,
            deadline: started + READ_BUDGET_MS,
        })
        return NextResponse.json(r)
    } catch (e) {
        const message = e instanceof Error ? e.message : '링크를 다루지 못했어요'
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
