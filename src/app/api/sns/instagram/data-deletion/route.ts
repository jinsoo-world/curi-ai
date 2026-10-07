// 메타 「정보 삭제 요청 콜백」. 메타 앱 Instagram 설정에 이 주소를 등록한다.
//
// POST /api/sns/instagram/data-deletion  (signed_request, 앱 비밀값 서명)
//   → 그 계정의 열쇠·아이디를 바로 지우고, 배운 인스타그램 자료는 삭제 대기로 접수(매일 크론이 지운다)
//   → { url: 상태 화면 주소, confirmation_code } (메타가 요구하는 모양)
// GET  /api/sns/instagram/data-deletion?code=…  → 상태 화면 (접수됨 / 삭제 끝)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readInstagramConfig, verifySignedRequest } from '@/domains/os/instagram/core'
import { requestInstagramDataDeletion, readInstagramDeletion } from '@/domains/os/instagram/store'
import { readSignedRequest } from '../signed-request'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function statusBase(redirectUri: string, req: NextRequest): string {
    try { return new URL(redirectUri).origin } catch { return req.nextUrl.origin }
}

export async function POST(req: NextRequest) {
    const cfg = readInstagramConfig()
    if (!cfg) return NextResponse.json({ error: '곧 열려요' }, { status: 503 })
    const sr = verifySignedRequest(await readSignedRequest(req), cfg.appSecret)
    if (!sr) return NextResponse.json({ error: 'bad signed_request' }, { status: 400 })
    try {
        const code = await requestInstagramDataDeletion(createAdminClient(), sr.userId)
        return NextResponse.json({ url: `${statusBase(cfg.redirectUri, req)}/api/sns/instagram/data-deletion?code=${code}`, confirmation_code: code })
    } catch (e) {
        console.error('[sns/instagram/data-deletion]', e instanceof Error ? e.message : 'unknown')
        return NextResponse.json({ error: 'failed' }, { status: 500 })
    }
}

const page = (title: string, body: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#111;line-height:1.6}h1{font-size:20px}p{color:#444}code{background:#f3f3f3;padding:2px 6px;border-radius:4px}</style></head>
<body><h1>${title}</h1>${body}</body></html>`

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code') ?? ''
    let r: Awaited<ReturnType<typeof readInstagramDeletion>> = null
    try { r = await readInstagramDeletion(createAdminClient(), code) } catch { r = null }
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    if (!r) {
        return new NextResponse(page('삭제 요청을 찾지 못했어요', '<p>접수 번호를 다시 확인해 주세요. We could not find this deletion request.</p>'), { status: 404, headers })
    }
    const safe = code.replace(/[^0-9a-f]/g, '')
    const body = r.status === 'done'
        ? `<p>큐리AI에 남아 있던 인스타그램 연결 정보와 배운 게시물 글을 모두 지웠어요.</p><p>Your Instagram data has been deleted from Curi AI.</p>`
        : `<p>삭제 요청을 받았어요. 연결 열쇠와 계정 정보는 바로 지웠고, 배운 게시물 글은 24시간 안에 지워요.</p><p>We received your request. Your access token and account info were deleted immediately; learned post captions will be deleted within 24 hours.</p>`
    return new NextResponse(page(r.status === 'done' ? '삭제가 끝났어요' : '삭제 요청을 받았어요', `${body}<p>접수 번호 Confirmation code: <code>${safe}</code></p>`), { status: 200, headers })
}
