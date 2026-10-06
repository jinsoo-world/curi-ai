import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMentorById, getPublicMentorById, toPublicMentor } from '@/domains/mentor'
import { assertBotOwned } from '@/domains/os/knowledge'

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ mentorId: string }> }
) {
    const { mentorId } = await params

    try {
        const supabase = await createClient()

        // domains/mentor — ID → slug → 폴백 순서로 조회
        // 사용자 권한으로 안 보이면 목록과 같은 기준(공개+활성)으로 다시 본다
        const mentor = (await getMentorById(supabase, mentorId)) ?? (await getPublicMentorById(mentorId))

        if (!mentor) {
            // 목록(관리자 권한)에는 보이는데 상세(사용자 권한)에서 안 보이는 카드가 있다.
            // 어긋나는 이유를 서버 기록에 남긴다.
            try {
                const { data: row } = await createAdminClient()
                    .from('mentors')
                    .select('id, name, is_active, creator_id')
                    .eq('id', mentorId)
                    .maybeSingle()
                console.warn('[Mentors API] 상세 404 진단:', JSON.stringify({
                    mentorId,
                    관리자권한으로보임: !!row,
                    이름: row?.name ?? null,
                    is_active: row?.is_active ?? null,
                    크리에이터있음: !!row?.creator_id,
                }))
            } catch (diagErr) {
                console.warn('[Mentors API] 상세 404 진단 실패:', diagErr)
            }
            return NextResponse.json(
                { error: '멘토를 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        // 🔒 지시문(system_prompt) 등은 봇 주인에게만. 손님, 남에게는 공개 칸만 내보낸다
        const row = mentor as Record<string, unknown>
        const { data: { user } } = await supabase.auth.getUser()
        let isOwner = false
        if (user && typeof row.id === 'string' && row.creator_id) {
            try {
                await assertBotOwned(createAdminClient(), user.id, row.id)
                isOwner = true
            } catch {
                isOwner = false
            }
        }

        return NextResponse.json(
            { mentor: isOwner ? mentor : toPublicMentor(row) },
            { headers: { 'Cache-Control': 'private, no-store' } },   // 주인 응답이 공용 캐시에 남지 않게
        )
    } catch (e) {
        console.error('[Mentors API] GET error:', e)
        return NextResponse.json(
            { error: '서버 오류' },
            { status: 500 }
        )
    }
}

// 🔒 음성 삭제 시 voice_id/voice_sample_url 초기화 + ElevenLabs Voice 삭제
//    회원 열쇠로는 mentors 를 못 고친다(20261021 잠금). 주인 확인 뒤 관리자 열쇠로 고친다.
//    voice_id 는 비우기(null)만 받는다. 남의 복제 목소리 id 를 내 봇에 붙여 쓰지 못하게.
const ALLOWED_FIELDS = ['voice_id', 'voice_sample_url', 'voice_test_url']

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ mentorId: string }> }
) {
    const { mentorId } = await params
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

        const body = await request.json()
        const updates: Record<string, string | null> = {}
        for (const key of ALLOWED_FIELDS) {
            if (key in body) updates[key] = body[key]
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })
        }
        if ('voice_id' in updates && updates.voice_id !== null) {
            return NextResponse.json({ error: '목소리는 녹음으로만 바꿀 수 있어요' }, { status: 400 })
        }

        const admin = createAdminClient()
        try {
            await assertBotOwned(admin, user.id, mentorId)
        } catch {
            return NextResponse.json({ error: '내 봇이 아니에요' }, { status: 403 })
        }

        // 🗑️ voice_id를 null로 바꾸는 경우 → ElevenLabs에서도 삭제
        if ('voice_id' in updates) {
            const { data: mentor } = await admin
                .from('mentors')
                .select('voice_id')
                .eq('id', mentorId)
                .single()

            if (mentor?.voice_id) {
                const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY
                if (ELEVENLABS_KEY) {
                    try {
                        const delRes = await fetch(`https://api.elevenlabs.io/v1/voices/${mentor.voice_id}`, {
                            method: 'DELETE',
                            headers: { 'xi-api-key': ELEVENLABS_KEY },
                        })
                        console.log(`[Mentor PATCH] 🗑️ ElevenLabs Voice 삭제: ${mentor.voice_id} → ${delRes.status}`)
                    } catch (e) {
                        console.error('[Mentor PATCH] ElevenLabs 삭제 실패 (무시):', e)
                    }
                }
            }
        }

        const { error } = await admin
            .from('mentors')
            .update(updates)
            .eq('id', mentorId)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[Mentors API] PATCH error:', e)
        return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 })
    }
}
