/**
 * 문서 파싱 API — Inngest 이벤트 트리거
 * POST /api/creator/knowledge/parse
 * 
 * 크리에이터 AI 만들기에서 HWP/PDF 업로드 시 호출
 * → Inngest를 통해 비동기로 Upstage 파싱 + 임베딩 처리
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { inngest } from '@/inngest/client'

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json()
        const { mentor_id, file_url, file_name, file_type } = body

        if (!mentor_id || !file_url || !file_name) {
            return NextResponse.json(
                { error: 'mentor_id, file_url, file_name은 필수입니다.' },
                { status: 400 }
            )
        }

        // 지원 포맷 확인
        const supportedTypes = ['hwp', 'hwpx', 'pdf', 'docx']
        const ext = file_type?.toLowerCase() || file_name.split('.').pop()?.toLowerCase()
        if (!supportedTypes.includes(ext)) {
            return NextResponse.json(
                { error: `지원하지 않는 파일 형식입니다. (지원: ${supportedTypes.join(', ')})` },
                { status: 400 }
            )
        }

        // Inngest 이벤트 전송 → 비동기 처리
        await inngest.send({
            name: 'document/parse',
            data: {
                mentor_id,
                file_url,
                file_name,
                file_type: ext,
                user_id: user.id,
            },
        })

        return NextResponse.json({
            success: true,
            message: '문서 파싱이 시작되었습니다. 완료 시 알림을 보내드립니다.',
        })
    } catch (error) {
        console.error('Document parse API error:', error)
        return NextResponse.json({ error: '서버 오류' }, { status: 500 })
    }
}
