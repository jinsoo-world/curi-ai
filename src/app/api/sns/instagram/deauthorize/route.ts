// POST /api/sns/instagram/deauthorize → 메타 「연결 해제 콜백」. 메타 앱 Instagram 설정에 이 주소를 등록한다.
// 사용자가 인스타그램 설정에서 우리 앱을 지우면 메타가 signed_request(앱 비밀값 HMAC-SHA256 서명)를 보낸다.
// 서명이 맞으면 그 계정의 열쇠를 전부 지운다(배운 글은 남는다. 지우는 건 정보 삭제 요청 쪽).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readInstagramConfig, verifySignedRequest } from '@/domains/os/instagram/core'
import { deauthorizeInstagramUser, InstagramTableMissing } from '@/domains/os/instagram/store'
import { readSignedRequest } from '../signed-request'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
    const cfg = readInstagramConfig()
    if (!cfg) return NextResponse.json({ error: '곧 열려요' }, { status: 503 })
    const sr = verifySignedRequest(await readSignedRequest(req), cfg.appSecret)
    if (!sr) return NextResponse.json({ error: 'bad signed_request' }, { status: 400 })
    try {
        await deauthorizeInstagramUser(createAdminClient(), sr.userId)
        return NextResponse.json({ ok: true })
    } catch (e) {
        if (e instanceof InstagramTableMissing) return NextResponse.json({ ok: true })
        console.error('[sns/instagram/deauthorize]', e instanceof Error ? e.message : 'unknown')
        return NextResponse.json({ error: 'failed' }, { status: 500 })
    }
}
