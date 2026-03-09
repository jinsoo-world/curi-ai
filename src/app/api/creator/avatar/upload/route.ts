// /api/creator/avatar/upload — 멘토 프로필 이미지 업로드 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File
        const fileName = formData.get('fileName') as string

        if (!file || !fileName) {
            return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
        }

        // 5MB 제한
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: '이미지 크기는 5MB 이하여야 합니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // mentor-avatars 버킷에 업로드
        const filePath = `${user.id}/${fileName}`
        const buffer = Buffer.from(await file.arrayBuffer())

        const { error: uploadError } = await admin.storage
            .from('mentor-avatars')
            .upload(filePath, buffer, {
                contentType: file.type,
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
