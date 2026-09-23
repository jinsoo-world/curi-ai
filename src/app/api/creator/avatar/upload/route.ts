// /api/creator/avatar/upload — 멘토 프로필 이미지 업로드 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'

/** 올릴 수 있는 사진 종류 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

/** 파일 맨 앞을 보고 진짜 사진인지 판별한다 (대화 사진 업로드와 같은 방식) */
function looksLikeImage(buf: Buffer): boolean {
    if (buf.length < 12) return false
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true
    return false
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
        }

        // 브라우저가 준 파일 이름을 그대로 경로에 붙이면 ../남의회원번호/avatar.png 같은
        // 이름으로 남의 사진을 덮어쓸 수 있다. 이름은 우리가 짓는다.
        if (!ALLOWED.includes(file.type)) {
            return NextResponse.json({ error: '사진 파일만 올릴 수 있어요 (JPG·PNG·WEBP).' }, { status: 400 })
        }

        // 5MB 제한
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: '이미지 크기는 5MB 이하여야 합니다.' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        if (!looksLikeImage(buffer)) {
            return NextResponse.json({ error: '사진 파일이 아니에요.' }, { status: 400 })
        }

        // 아바타는 1024 정사각 JPEG 로 맞춰 용량을 줄인다 (미리보기에서 이미 잘랐어도 한 번 더 안전하게)
        let outBuf: Buffer = buffer
        let outType = file.type
        let ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
        try {
            outBuf = await sharp(buffer, { failOn: 'none' })
                .rotate()
                .resize({ width: 1024, height: 1024, fit: 'cover', withoutEnlargement: true })
                .jpeg({ quality: 88, mozjpeg: true })
                .toBuffer()
            outType = 'image/jpeg'
            ext = 'jpg'
        } catch (e) {
            console.warn('[Avatar] resize skip:', e instanceof Error ? e.message : e)
        }

        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // mentor-avatars 버킷에 업로드
        const filePath = `${user.id}/${fileName}`

        const { error: uploadError } = await admin.storage
            .from('mentor-avatars')
            .upload(filePath, outBuf, {
                contentType: outType,
                upsert: true,
            })

        if (uploadError) {
            console.error('[Avatar] Upload error:', uploadError.message)
            return NextResponse.json({ error: '업로드 실패' }, { status: 500 })
        }

        // Public URL 생성
        const { data } = admin.storage
            .from('mentor-avatars')
            .getPublicUrl(filePath)

        return NextResponse.json({ success: true, url: data.publicUrl })
    } catch (error) {
        console.error('[Avatar] Error:', error)
        return NextResponse.json({ error: '서버 오류' }, { status: 500 })
    }
}
