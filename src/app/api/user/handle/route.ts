// Handle 설정/검증 API
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { setUserHandle, validateHandle } from '@/domains/user'
import { isHandleAvailable } from '@/domains/user'

/**
 * GET /api/user/handle?handle=xxx — handle 중복 체크
 */
export async function GET(request: NextRequest) {
    const handle = request.nextUrl.searchParams.get('handle')
    if (!handle) {
        return NextResponse.json({ error: 'handle 파라미터가 필요합니다.' }, { status: 400 })
    }

    // 형식 검증
    const validation = validateHandle(handle)
    if (!validation.valid) {
        return NextResponse.json({ available: false, error: validation.error })
    }

    // 중복 체크
    const db = createAdminClient()
    const available = await isHandleAvailable(db, handle.toLowerCase().trim())

    return NextResponse.json({ available })
}

/**
 * POST /api/user/handle — handle 설정
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { handle } = await request.json()
        if (!handle) {
            return NextResponse.json({ error: 'handle을 입력해주세요.' }, { status: 400 })
        }

        const db = createAdminClient()
        const normalized = await setUserHandle(db, user.id, handle)

        return NextResponse.json({ handle: normalized })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
