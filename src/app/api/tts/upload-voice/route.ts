import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const maxDuration = 60

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
        const mentorName = formData.get('mentorName') as string || 'AI Mentor'

        if (!file) {
            return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
        }
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 1. Supabase Storage에 업로드
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

        const { data: urlData } = admin.storage
            .from('mentor-files')
            .getPublicUrl(fileName)
        const publicUrl = urlData.publicUrl

        // 2. ElevenLabs Voice Clone (Add Voice API)
        let voiceId: string | null = null
        const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY

        if (ELEVENLABS_KEY) {
            console.log('[Voice Upload] ElevenLabs Add Voice 시작')
            try {
                const elForm = new FormData()
                elForm.append('name', `curi-${mentorId}-${Date.now()}`)
                elForm.append('description', `Voice clone for ${mentorName}`)

                // 파일을 Blob으로 변환하여 ElevenLabs에 전송
                const fileBlob = new Blob([buffer], { type: file.type || 'audio/mpeg' })
                elForm.append('files', fileBlob, file.name)

                const elRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ELEVENLABS_KEY,
                    },
                    body: elForm,
                })

                const elData = await elRes.json()
                console.log('[Voice Upload] ElevenLabs 응답:', JSON.stringify({ status: elRes.status, voice_id: elData.voice_id, error: elData.detail }))

                if (elRes.ok && elData.voice_id) {
                    voiceId = elData.voice_id
                    console.log('[Voice Upload] ✅ ElevenLabs voice_id:', voiceId)
                } else {
                    console.error('[Voice Upload] ElevenLabs 실패:', elData.detail || elData)
                }
            } catch (cloneErr) {
                console.error('[Voice Upload] ElevenLabs 에러 (무시):', cloneErr)
            }
        }

        // 3. DB에 voice_id 저장
        if (voiceId && mentorId && mentorId !== 'temp') {
            try {
                await admin
                    .from('mentors')
                    .update({ voice_id: voiceId, voice_sample_url: publicUrl })
                    .eq('id', mentorId)
                console.log('[Voice Upload] ✅ DB voice_id 저장 완료:', mentorId)
            } catch (dbErr) {
                console.error('[Voice Upload] DB 업데이트 실패:', dbErr)
            }
        }

        return NextResponse.json({
            url: publicUrl,
            path: uploadData.path,
            voiceId,
        })
    } catch (error: any) {
        console.error('[Voice Upload Error]', error)
        return NextResponse.json(
            { error: error?.message || '업로드 중 오류 발생' },
            { status: 500 }
        )
    }
}
