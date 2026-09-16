// 내가 만든 사진 목록 — 전수조사 29번 (다시 올 이유)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ photos: [] })

    const admin = createAdminClient()
    const { data: rows } = await admin
        .from('tool_photos')
        .select('id, kind, path, created_at, expires_at, options')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(60)

    const photos = (rows ?? []).map((r) => ({
        id: r.id,
        kind: r.kind,
        options: r.options ?? null,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        url: admin.storage.from('tool-photos').getPublicUrl(r.path).data.publicUrl,
    }))
    return NextResponse.json({ photos })
}
