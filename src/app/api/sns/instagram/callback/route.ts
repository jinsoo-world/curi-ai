// GET /api/sns/instagram/callback → 인스타그램이 code 를 들고 돌려보낸 자리. 메타 앱 「Instagram 로그인」 돌아오는 주소로 등록한다.
//
//  1) state 서명 확인(10분, 사용자·봇·출처) + 1회용 번호 쓰기(두 번째는 거절)
//  2) 봇 주인 다시 확인. 웹이면 지금 로그인한 사람이 state 의 사람과 같아야 한다
//  3) code → 짧은 열쇠 → 60일 열쇠 → 프로필(프로페셔널 계정만)
//  4) 웹: 바로 잠가 저장 → /os/settings?sns=instagram&result=connected
//     앱: 잠가 임시 표(5분)에 두고 curiai://connect?handoff=…&provider=instagram (앱이 POST ./finish { handoff, appSecret } 로 마무리)
//  실패는 이유 코드만 (토큰·열쇠 문구 없음): not_ready, bad_state, denied, login, not_owner, not_professional, too_many, token, table, save
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readConnectorKey } from '@/domains/connectors/crypto'
import { consumeAppNonce, putAppPending, appReturnUrl } from '@/domains/connectors/app-state'
import { ConnectorTableMissing } from '@/domains/connectors/store'
import { BotNotMine, assertBotOwned } from '@/domains/os/knowledge'
import { FeedTableMissing } from '@/domains/os/feeds'
import { readInstagramConfig, verifyIgState, IG_PENDING_KIND } from '@/domains/os/instagram/core'
import { completeInstagramLogin, InstagramApiError, NotProfessionalAccount } from '@/domains/os/instagram/api'
import { saveInstagramConnection, InstagramTableMissing, InstagramTooManyFeeds } from '@/domains/os/instagram/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

export async function GET(req: NextRequest) {
    const base = appUrl(req)
    const q = req.nextUrl.searchParams
    const web = (result: string) => NextResponse.redirect(`${base}/os/settings?sns=instagram&${result}`)
    const webFail = (reason: string) => web(`result=error&reason=${reason}`)

    const cfg = readInstagramConfig()
    const key = readConnectorKey()
    if (!cfg || !key) return webFail('not_ready')
    const s = verifyIgState(q.get('state'), key)
    if (!s) return webFail('bad_state')
    const fail = (reason: string) => s.src === 'app' ? NextResponse.redirect(appReturnUrl({ error: reason, provider: 'instagram' })) : webFail(reason)

    try {
        const db = createAdminClient({ longRunning: true })
        // 「허용 안 함」을 눌러도 번호는 쓴 것으로 친다
        if (!(await consumeAppNonce(db, s.n, s.u))) return fail('bad_state')
        if (q.get('error')) return fail('denied')
        const code = (q.get('code') ?? '').replace(/#_$/, '')
        if (!code || code.length > 2048) return fail('bad_state')

        if (s.src === 'web') {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return fail('login')
            if (user.id !== s.u) return fail('bad_state')     // 남이 시작한 주소를 내가 마무리하지 못하게
        }
        await assertBotOwned(db, s.u, s.m)

        const login = await completeInstagramLogin(cfg, code)
        if (s.src === 'web') {
            await saveInstagramConnection(db, key, { userId: s.u, mentorId: s.m, login })
            return web('result=connected')
        }
        const handoff = await putAppPending(db, key, {
            userId: s.u, proofHash: String(s.pr), kind: IG_PENDING_KIND,
            tokenJson: JSON.stringify(login), meta: { mentorId: s.m },
        })
        return NextResponse.redirect(appReturnUrl({ handoff, provider: 'instagram' }))
    } catch (e) {
        if (e instanceof BotNotMine) return fail('not_owner')
        if (e instanceof NotProfessionalAccount) return fail('not_professional')
        if (e instanceof InstagramTooManyFeeds) return fail('too_many')
        if (e instanceof InstagramApiError) { console.error('[sns/instagram/callback] token', e.status, e.code); return fail('token') }
        if (e instanceof ConnectorTableMissing || e instanceof InstagramTableMissing || e instanceof FeedTableMissing) return fail('table')
        console.error('[sns/instagram/callback]', e instanceof Error ? e.message : 'unknown')
        return fail('save')
    }
}
