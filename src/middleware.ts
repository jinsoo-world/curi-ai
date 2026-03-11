import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
    const response = await updateSession(request)

    // ?ref= 쿼리 파라미터가 있으면 쿠키에 저장 (초대 코드 추적)
    const ref = request.nextUrl.searchParams.get('ref')
    if (ref && ref.length > 0) {
        const res = response ?? NextResponse.next()
        res.cookies.set('curi_ref', ref, {
            maxAge: 60 * 60 * 24 * 365, // 1년
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
        })
        return res
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
