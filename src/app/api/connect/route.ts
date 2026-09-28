// GET /api/connect → 서비스 14개 + 내가 붙여 둔 것. paste = 토큰 붙여 넣기로 지금 붙일 수 있음. 화면(/os/connect 서비스 탭)이 이걸 하나만 읽는다.
//
// 🔒 로그인 안 했으면 목록만(연결 상태 없이) 준다. 열쇠·토큰은 어떤 칸에도 안 들어간다(계정 힌트 jin@… 만).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROVIDERS, connectorsEnabled, isReadyKind, listConnectors, providerView, type ConnectorView } from '@/domains/connectors'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let mine: ConnectorView[] = []
    if (user) {
        try { mine = await listConnectors(createAdminClient(), user.id) } catch { mine = [] }
    }

    const enabled = connectorsEnabled()
    const services = PROVIDERS.map(p => {
        const c = mine.find(x => x.kind === p.id) ?? null
        const view = providerView(p)
        // 로그인(OAuth) 열쇠는 없지만 토큰을 손으로 붙여 넣어 지금 바로 붙일 수 있는 것(노션)
        const paste = enabled && isReadyKind(p.id) && !view.ready && !view.comingSoon
        return {
            ...view,
            missing: paste ? null : view.missing,
            paste,
            connected: c ? { id: c.id, account: c.secretHint, status: c.status } : null,
        }
    })

    return NextResponse.json({ enabled, loggedIn: !!user, services })
}
