import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const mentorId = formData.get('mentorId') as string || 'temp'

        if (!file) {
            return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
        }

        // 파일 크기 10MB 제한
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다.' }, { status: 400 })
        }

        // 오디오 파일 유효성 검사
        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm', 'audio/mp3']
        if (!validTypes.some(t => file.type.includes(t.split('/')[1])) && !file.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)) {
            return NextResponse.json({ error: '오디오 파일만 업로드 가능합니다.' }, { status: 400 })
        }

        // Supabase Storage에 업로드
        const ext = file.name.split('.').pop() || 'mp3'
        const fileName = `voice-samples/${user.id}/${mentorId}-${Date.now()}.${ext}`

        const buffer = Buffer.from(await file.arrayBuffer())

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('mentor-files')
            .upload(fileName, buffer, {
                contentType: file.type || 'audio/mpeg',
                upsert: true,
            })

        if (uploadError) {
            console.error('[Voice Upload Error]', uploadError)
            return NextResponse.json({ error: '업로드 실패' }, { status: 500 })
        }

        // Public URL 생성
        const { data: urlData } = supabase.storage
            .from('mentor-files')
            .getPublicUrl(fileName)

        return NextResponse.json({
            url: urlData.publicUrl,
            path: uploadData.path,
        })
    } catch (error: any) {
        console.error('[Voice Upload Error]', error)
        return NextResponse.json(
            { error: error?.message || '업로드 중 오류 발생' },
            { status: 500 }
        )
    }
}
