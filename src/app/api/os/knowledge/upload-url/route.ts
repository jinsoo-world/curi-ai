// POST /api/os/knowledge/upload-url — 봇에게 파일(PDF 등)을 넣을 때 쓰는 「직접 올리는 주소」
//
// 흐름 = ①여기서 주소를 받고 ②브라우저가 그 주소로 파일을 바로 올리고
//        ③`/api/creator/knowledge/process` 가 글을 뽑아 조각으로 저장한다.
// 파일이 우리 서버(Vercel)를 안 지나가므로 4.5MB 벽에 안 걸린다.
//
// 🔒 첫 줄은 「내 팀 봇인가」 확인. 남의 봇 이름표를 적어 보내도 여기서 막힌다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBotOwned, assertRoomForMore, BotNotMine } from '@/domains/os/knowledge'
import { 올릴수있는파일 } from '@/domains/knowledge/files'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024   // 파일 하나 10MB

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const fileName = String(body.fileName ?? '')
    const fileSize = Number(body.fileSize ?? 0)

    if (!fileName || !fileSize) return NextResponse.json({ error: '파일 이름과 크기가 필요해요' }, { status: 400 })

    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (!(올릴수있는파일 as readonly string[]).includes(ext)) {
        return NextResponse.json({ error: `이 파일은 못 읽어요. ${올릴수있는파일.join('·')} 만 넣을 수 있어요` }, { status: 400 })
    }
    if (fileSize > MAX_FILE_SIZE) return NextResponse.json({ error: '파일은 10MB 까지 넣을 수 있어요' }, { status: 400 })

    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        await assertRoomForMore(db, mentorId)

        // ⚠️ 저장소 키에 한글을 넣으면 거부된다(InvalidKey, 실측 2026-09-04).
        //    보이는 이름은 title 에 원본 그대로 넣으니 사람 눈에는 한글 그대로 보인다.
        const 점 = fileName.lastIndexOf('.')
        const 확장자 = 점 > 0 ? fileName.slice(점 + 1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : ''
        const 본이름 = (점 > 0 ? fileName.slice(0, 점) : fileName)
            .replace(/[^a-zA-Z0-9._-]/g, '').replace(/^[._-]+/, '').slice(0, 40)
        const filePath = `${mentorId}/${Date.now()}-${본이름 || 'file'}${확장자 ? '.' + 확장자 : ''}`

        const { data: signed, error: signErr } = await db.storage
            .from('knowledge-files')
            .createSignedUploadUrl(filePath)
        if (signErr || !signed) {
            console.error('[os/knowledge/upload-url] sign:', signErr?.message)
            return NextResponse.json({ error: '올릴 자리를 못 만들었어요' }, { status: 500 })
        }

        // 상태값은 DB 가 허용하는 4개(pending/processing/completed/failed)만 쓴다
        const { data: source, error: dbErr } = await db
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                source_type: ext === 'pdf' ? 'pdf' : 'text',
                title: fileName.slice(0, 120),
                file_size: fileSize,
                original_url: filePath,
                processing_status: 'pending',
            })
            .select('id')
            .single()
        if (dbErr || !source) {
            await db.storage.from('knowledge-files').remove([filePath])
            console.error('[os/knowledge/upload-url] db:', dbErr?.message)
            return NextResponse.json({ error: '자료 칸을 못 만들었어요' }, { status: 500 })
        }

        return NextResponse.json({
            signedUrl: signed.signedUrl,
            token: signed.token,
            path: signed.path,
            sourceId: (source as { id: string }).id,
        })
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        const message = e instanceof Error ? e.message : '올릴 자리를 못 만들었어요'
        console.error('[os/knowledge/upload-url]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
