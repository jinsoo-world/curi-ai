import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const maxDuration = 60 // Voice clone에 충분한 시간

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

        // 서비스 롤 클라이언트 (RLS 우회)
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // Supabase Storage에 업로드
        const ext = file.name.split('.').pop() || 'mp3'
        const fileName = `voice-samples/${user.id}/${mentorId}-${Date.now()}.${ext}`
        const buffer = Buffer.from(await file.arrayBuffer())

        const { data: uploadData, error: uploadError } = await admin.storage
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
        const { data: urlData } = admin.storage
            .from('mentor-files')
            .getPublicUrl(fileName)

        const publicUrl = urlData.publicUrl

        // ⚡ Pre-clone: 업로드 직후 Voice Clone API 호출 → voice_id 반환
        let voiceId: string | null = null
        const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN

        if (REPLICATE_TOKEN) {
            console.log('[Voice Upload] Pre-clone 시작:', publicUrl)
            try {
                const cloneRes = await fetch('https://api.replicate.com/v1/models/minimax/voice-cloning/predictions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'wait',
                    },
                    body: JSON.stringify({
                        input: { voice_file: publicUrl },
                    }),
                })
                const cloneData = await cloneRes.json()
                console.log('[Voice Upload] Clone 결과:', JSON.stringify({ status: cloneData.status, output: cloneData.output, error: cloneData.error }))

                if (cloneData.status === 'succeeded' && cloneData.output) {
                    voiceId = typeof cloneData.output === 'string'
                        ? cloneData.output
                        : (cloneData.output as any).voice_id || (cloneData.output as any).id || null
                    console.log('[Voice Upload] ✅ Pre-clone 성공! voice_id:', voiceId)
                }
            } catch (cloneErr) {
                console.error('[Voice Upload] Pre-clone 실패 (무시):', cloneErr)
            }
        }

        // voice_id가 있으면 멘토 DB에도 저장
        if (voiceId && mentorId && mentorId !== 'temp') {
            try {
                await admin
                    .from('mentors')
                    .update({ voice_id: voiceId, voice_sample_url: publicUrl })
                    .eq('id', mentorId)
                console.log('[Voice Upload] ✅ DB voice_id 저장 완료:', mentorId)
            } catch (dbErr) {
                console.error('[Voice Upload] DB 업데이트 실패 (무시):', dbErr)
            }
        }

        return NextResponse.json({
            url: publicUrl,
            path: uploadData.path,
            voiceId, // 프론트에서도 사용 가능
        })
    } catch (error: any) {
        console.error('[Voice Upload Error]', error)
        return NextResponse.json(
            { error: error?.message || '업로드 중 오류 발생' },
            { status: 500 }
        )
    }
}
