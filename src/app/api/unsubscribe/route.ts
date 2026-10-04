// /api/unsubscribe?t=<서명> — 로그인 없이 광고 수신 거부 (정보통신망법 제50조: 거부에 로그인·본인인증을 요구하면 안 된다).
// GET  = 「광고 그만 받기」 버튼이 있는 화면만 보여 준다(메일 프로그램이 링크를 미리 열어 봐도 거부되지 않게)
// POST = 실제로 거부한다. 메일 머리말 원클릭(List-Unsubscribe-Post: List-Unsubscribe=One-Click)도 이 POST 로 온다
// 서명 열쇠(MSG_UNSUBSCRIBE_SECRET)가 없으면 503. 서명이 틀리면 400.
// 거부하면: 그 채널 광고 동의 칸을 끄고(전체면 네 칸) + 받지 않을 사람 명단에 지문을 남긴다(광고만 막는다. 정보 알림은 그대로).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONSENT_COLUMN, unsubscribeSecret, verifyUnsubscribe, type UnsubscribeTarget } from '@/domains/messaging/consent'
import { addSuppressions, type SuppressionInput } from '@/domains/messaging/suppressions'
import { ROUTES } from '@/domains/messaging/registry'

export const dynamic = 'force-dynamic'

const LABEL: Record<UnsubscribeTarget, string> = {
    email: '메일', sms: '문자', app_push: '앱 알림', web_push: '웹 알림', all: '모든 채널',
}

function page(title: string, body: string, status = 200, form?: string) {
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:-apple-system,Pretendard,sans-serif;background:#f5f6f8;color:#111;margin:0;padding:48px 16px}main{max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:28px}h1{font-size:20px;margin:0 0 12px}p{line-height:1.6;color:#444}button{width:100%;padding:14px;border:0;border-radius:10px;background:#111;color:#fff;font-size:16px;cursor:pointer}</style></head>
<body><main><h1>${title}</h1><p>${body}</p>${form ?? ''}</main></body></html>`
    return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
}

function readToken(req: Request): { ok: true; userId: string; target: UnsubscribeTarget; token: string } | { ok: false; res: NextResponse } {
    const secret = unsubscribeSecret()
    if (!secret) return { ok: false, res: page('잠시 뒤 다시 해 주세요', '수신 거부 기능을 준비하고 있어요. 고객센터(/support)로 알려 주시면 바로 처리해 드릴게요.', 503) }
    const token = new URL(req.url).searchParams.get('t') ?? ''
    const v = verifyUnsubscribe(token, secret)
    if (!v) return { ok: false, res: page('링크가 올바르지 않아요', '받으신 메일의 수신 거부 링크를 다시 눌러 주세요. 계속 안 되면 고객센터(/support)로 알려 주세요.', 400) }
    return { ok: true, userId: v.userId, target: v.target, token }
}

export async function GET(req: Request) {
    const t = readToken(req)
    if (!t.ok) return t.res
    const form = `<form method="post" action="/api/unsubscribe?t=${encodeURIComponent(t.token)}"><button type="submit">광고 그만 받기</button></form>`
    return page('큐리AI 광고 수신 거부', `${LABEL[t.target]}로 오는 광고를 그만 받으시겠어요? 봇이 일을 마쳤다는 소식 같은 안내는 계속 받으실 수 있어요.`, 200, form)
}

export async function POST(req: Request) {
    const t = readToken(req)
    if (!t.ok) return t.res
    const db = createAdminClient()
    const routes = t.target === 'all' ? ROUTES : [t.target]
    const patch = Object.fromEntries(routes.map(r => [CONSENT_COLUMN[r], false]))
    const { data: user, error } = await db.from('users').update(patch).eq('id', t.userId).select('id, email, phone').maybeSingle()
    if (error) {
        console.error('[unsubscribe] 동의 칸 끄기 실패', error.code, error.message)
        return page('잠시 뒤 다시 해 주세요', '처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.', 500)
    }
    // 이미 탈퇴한 분이면 지울 동의도 없다. 그래도 거부는 끝난 것으로 안내한다
    if (user) {
        const u = user as { id: string; email: string | null; phone: string | null }
        const items: SuppressionInput[] = []
        if (t.target === 'email' || t.target === 'all') if (u.email) items.push({ kind: 'email', address: u.email, channel: t.target === 'all' ? 'all' : 'email', reason: 'unsubscribe', source: 'unsubscribe_link' })
        if (t.target === 'sms' || t.target === 'all') if (u.phone) items.push({ kind: 'phone', address: u.phone, channel: t.target === 'all' ? 'all' : 'sms', reason: 'unsubscribe', source: 'unsubscribe_link' })
        if (t.target === 'app_push' || t.target === 'web_push' || t.target === 'all') items.push({ kind: 'user', address: u.id, channel: t.target === 'all' ? 'all' : t.target, reason: 'unsubscribe', source: 'unsubscribe_link' })
        try { await addSuppressions(db, items) } catch (e) {
            // 동의 칸은 이미 꺼졌다 = 광고는 안 간다. 명단은 덤
            console.warn('[unsubscribe] 명단 기록 실패', e instanceof Error ? e.message : e)
        }
    }
    console.log(`[unsubscribe] 완료 target=${t.target} found=${!!user}`)
    return page('수신 거부를 마쳤어요', `${LABEL[t.target]}로 오는 광고를 더 보내지 않을게요. 다시 받고 싶으시면 앱의 내 정보에서 광고 수신 동의를 켜 주세요.`)
}
