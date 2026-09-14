// /api/chat/upload-image — 대화에 첨부할 사진 업로드
//
// 사진은 chat-images 버킷에 회원별 폴더로 쌓인다.
// 공개 URL 을 돌려주고, 그 주소가 메시지에 함께 저장돼 나중에 대화를 다시 열어도 보인다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/** 사진 1장 최대 크기.
 *  Vercel 이 요청 본문을 4.5MB 에서 잘라버려서, 5MB 로 두면 우리 코드에 닿기도 전에
 *  끊기고 고객은 원인을 알 수 없는 오류만 본다. 여유를 두고 4MB. */
const MAX_BYTES = 4 * 1024 * 1024
/** Gemini 가 읽을 수 있는 형식만 받는다 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/** 파일 맨 앞을 보고 진짜 사진인지 판별한다 */
function looksLikeImage(buf: Buffer): boolean {
    if (buf.length < 12) return false
    // JPEG = FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
    // PNG = 89 50 4E 47 0D 0A 1A 0A
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true
    // WEBP = 'RIFF' .... 'WEBP'
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true
    // HEIC/HEIF = .... 'ftyp'
    if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return true
    return false
}

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
            return NextResponse.json({ error: '사진 파일만 보낼 수 있어요 (JPG·PNG·WEBP·HEIC).' }, { status: 400 })
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: '사진은 4MB 이하만 보낼 수 있어요.' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        // 브라우저가 알려주는 종류는 마음대로 적어 보낼 수 있다.
        // 파일 맨 앞 몇 바이트를 직접 보고 진짜 사진인지 확인한다.
        if (!looksLikeImage(buffer)) {
            return NextResponse.json({ error: '사진 파일이 아니에요.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

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
