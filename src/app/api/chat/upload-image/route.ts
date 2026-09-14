// /api/chat/upload-image — 대화에 첨부할 사진 업로드
//
// 사진은 chat-images 버킷에 회원별 폴더로 쌓인다.
// 공개 URL 을 돌려주고, 그 주소가 메시지에 함께 저장돼 나중에 대화를 다시 열어도 보인다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/** 사진 1장 최대 크기 */
const MAX_BYTES = 5 * 1024 * 1024
/** Gemini 가 읽을 수 있는 형식만 받는다 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // 사진은 회원만. 비회원 대화는 저장 자체가 없어서 사진만 남으면 주인이 사라진다.
        if (!user) {
            return NextResponse.json({ error: '사진을 보내려면 로그인이 필요해요.' }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json({ error: '사진을 찾지 못했어요.' }, { status: 400 })
        }
        if (!ALLOWED.includes(file.type)) {
            return NextResponse.json({ error: '사진 파일만 보낼 수 있어요 (JPG·PNG·WEBP).' }, { status: 400 })
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: '사진은 5MB 이하만 보낼 수 있어요.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const buffer = Buffer.from(await file.arrayBuffer())

        const { error: uploadError } = await admin.storage
            .from('chat-images')
            .upload(filePath, buffer, { contentType: file.type, upsert: false })

        if (uploadError) {
            console.error('[Chat Image] Upload error:', uploadError.message)
            return NextResponse.json({ error: '사진을 올리지 못했어요. 다시 시도해 주세요.' }, { status: 500 })
        }

        const { data } = admin.storage.from('chat-images').getPublicUrl(filePath)
        return NextResponse.json({ success: true, url: data.publicUrl })
    } catch (error) {
        console.error('[Chat Image] Error:', error)
        return NextResponse.json({ error: '사진을 올리지 못했어요.' }, { status: 500 })
    }
}
