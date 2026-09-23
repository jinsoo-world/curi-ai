// GET /api/connect → 서비스 13개 + 내가 붙여 둔 것. 화면(/os/connect 서비스 탭)이 이걸 하나만 읽는다.
//
// 🔒 로그인 안 했으면 목록만(연결 상태 없이) 준다. 열쇠·토큰은 어떤 칸에도 안 들어간다(계정 힌트 jin@… 만).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROVIDERS, connectorsEnabled, listConnectors, providerView, type ConnectorView } from '@/domains/connectors'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let mine: ConnectorView[] = []
    if (user) {
        try { mine = await listConnectors(createAdminClient(), user.id) } catch { mine = [] }
    }

    const services = PROVIDERS.map(p => {
        const c = mine.find(x => x.kind === p.id) ?? null
        return {
            ...providerView(p),
            connected: c ? { id: c.id, account: c.secretHint, status: c.status } : null,
        }
    })

    return NextResponse.json({ enabled: connectorsEnabled(), loggedIn: !!user, services })
}
