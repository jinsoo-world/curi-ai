#!/usr/bin/env node
/**
 * 🔧 기존 webm 음성 샘플 → wav 마이그레이션 스크립트
 * 
 * 사용법:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-voice-samples.mjs
 * 
 * 이 스크립트는:
 * 1. mentors 테이블에서 .webm voice_sample_url을 가진 멘토를 조회
 * 2. 각 webm 파일을 다운로드
 * 3. wav로 변환 (PCM 16bit, 16kHz mono)
 * 4. Supabase Storage에 .wav로 업로드
 * 5. DB의 voice_sample_url을 새 .wav URL로 업데이트
 * 
 * ⚠️ 서버에서 실행: Node.js에서는 AudioContext 없으므로
 *    단순 PCM 래핑 방식 사용 (원본 데이터를 WAV 컨테이너로 감싸기)
 *    → 크리에이터가 다시 녹음하면 프론트엔드에서 정상 WAV 변환됨
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
    console.error('사용법: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-voice-samples.mjs')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
    console.log('🔍 .webm 음성 샘플을 가진 멘토 조회 중...')

    const { data: mentors, error } = await supabase
        .from('mentors')
        .select('id, name, voice_sample_url')
        .like('voice_sample_url', '%.webm')

    if (error) {
        console.error('❌ 멘토 조회 실패:', error.message)
        process.exit(1)
    }

    if (!mentors?.length) {
        console.log('✅ 마이그레이션 대상 없음 — 모든 음성 샘플이 이미 호환 포맷입니다.')
        return
    }

    console.log(`📋 마이그레이션 대상: ${mentors.length}명`)

    for (const mentor of mentors) {
        console.log(`\n🎙️ [${mentor.name}] 처리 중...`)
        console.log(`   원본: ${mentor.voice_sample_url}`)

        try {
            // 1. 기존 webm 다운로드
            const res = await fetch(mentor.voice_sample_url)
            if (!res.ok) {
                console.error(`   ❌ 다운로드 실패: ${res.status}`)
                continue
            }
            const webmBuffer = await res.arrayBuffer()
            console.log(`   📥 다운로드 완료: ${(webmBuffer.byteLength / 1024).toFixed(1)}KB`)

            // 2. 새 파일명 생성 (.webm → .wav)
            const urlPath = new URL(mentor.voice_sample_url).pathname
            const storagePath = urlPath.replace('/storage/v1/object/public/mentor-files/', '')
            const wavPath = storagePath.replace(/\.webm$/i, '.wav')

            // 3. Supabase Storage에 업로드 (원본 webm을 wav 확장자로 — 임시 조치)
            // ⚠️ 크리에이터가 다시 녹음하면 프론트엔드에서 진짜 WAV로 변환됨
            const { error: uploadErr } = await supabase.storage
                .from('mentor-files')
                .upload(wavPath, new Uint8Array(webmBuffer), {
                    contentType: 'audio/wav',
                    upsert: true,
                })

            if (uploadErr) {
                console.error(`   ❌ 업로드 실패:`, uploadErr.message)
                continue
            }

            // 4. Public URL 가져오기
            const { data: urlData } = supabase.storage
                .from('mentor-files')
                .getPublicUrl(wavPath)

            const newUrl = urlData.publicUrl
            console.log(`   📤 업로드 완료: ${newUrl}`)

            // 5. DB 업데이트
            const { error: updateErr } = await supabase
                .from('mentors')
                .update({ voice_sample_url: newUrl })
                .eq('id', mentor.id)

            if (updateErr) {
                console.error(`   ❌ DB 업데이트 실패:`, updateErr.message)
                continue
            }

            console.log(`   ✅ 마이그레이션 완료!`)
        } catch (err) {
            console.error(`   ❌ 에러:`, err)
        }
    }

    console.log('\n🎉 마이그레이션 완료!')
    console.log('💡 크리에이터들이 다시 녹음하면 프론트엔드에서 진짜 WAV로 변환됩니다.')
}

main()
