// /api/billing/revenuecat/webhook — 앱 안 구독(아이폰·안드로이드) 알림을 레비뉴캣에서 받는다 (대표 결정 1002)
//   레비뉴캣 대시보드 → Integrations → Webhooks 에 이 주소와 Authorization 값(= 환경변수 REVENUECAT_WEBHOOK_AUTH)을 넣는다.
//   판단·저장 순서는 domains/os/revenuecat-service.ts. 웹(토스)과 같은 user_plans 표를 쓴다.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRevenueCatWebhook, supabaseRcStore } from '@/domains/os/revenuecat-service'
import { isAuthorized } from '@/domains/os/revenuecat'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH
    const authHeader = req.headers.get('authorization')
    // 열쇠가 틀리면 DB 를 열기 전에 돌려보낸다
    if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    if (!isAuthorized(authHeader, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'bad_body' }, { status: 400 })
    }

    const r = await handleRevenueCatWebhook({ authHeader, body, secret, store: supabaseRcStore(createAdminClient()) })
    return NextResponse.json(r.body, { status: r.status })
}
