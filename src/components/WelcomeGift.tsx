'use client'

/**
 * 들어오면 바로 뜨는 환영 창 — 대표 지시 2026-09-15
 * 「들어오면 바로 로그인하고 클로버 받기 띄워. 다음에 할게요도 작게.
 *   전체적으로 톤앤매너, 텍스트 등 UI 는 비글루 따라해라」
 *
 * 비글루가 하는 방식 = 들어오자마자 「+50코인 받기」 한 장을 띄우고,
 * 큰 단추 하나(로그인하고 받기)와 작고 흐린 「다음에 할게요」를 둔다.
 * 고를 것이 둘뿐이고 무게가 확실히 다르다.
 *
 * 로그인한 사람에게는 안 띄운다. 한 번 닫으면 그날은 다시 안 뜬다.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CloverIcon from '@/components/ui/CloverIcon'
import { TRIAL_CLOVERS, SIGNUP_CLOVERS } from '@/domains/trial'
import { TEACHER_COST } from '@/domains/studio/teacher'

const 오늘열쇠 = 'curi.welcomeGift.closedOn'
/** 처음 오신 분 안내(FirstGuide)를 마쳤는지 — 그 안내가 끝난 뒤에 띄운다 */
const 안내끝열쇠 = 'curi_first_guide_done'

export default function WelcomeGift() {
    const router = useRouter()
    const [보임, set보임] = useState(false)

    useEffect(() => {
        let 살아있음 = true
        ;(async () => {
            // 오늘 이미 닫았으면 안 띄운다
            try {
                const 오늘 = new Date().toDateString()
                if (localStorage.getItem(오늘열쇠) === 오늘) return
            } catch {
                // 저장소를 못 읽는 브라우저면 그냥 띄운다
            }

            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!살아있음) return
            if (user) return          // 로그인한 사람에게는 안 띄운다

            // 처음 오신 분 안내가 도는 중이면 기다린다. 둘이 겹치면 무엇을 짚는지 안 보인다.
            const 안내중 = () => {
                try { return !localStorage.getItem(안내끝열쇠) } catch { return false }
            }
            if (안내중()) {
                const 지켜보기 = setInterval(() => {
                    if (!살아있음 || !안내중()) {
                        clearInterval(지켜보기)
                        if (살아있음) setTimeout(() => 살아있음 && set보임(true), 400)
                    }
                }, 500)
                return
            }
            setTimeout(() => 살아있음 && set보임(true), 600)
        })()
        return () => { 살아있음 = false }
    }, [])

    const 닫기 = () => {
        try {
            localStorage.setItem(오늘열쇠, new Date().toDateString())
        } catch {
            // 못 적어도 그냥 닫는다
        }
        set보임(false)
    }

    if (!보임) return null

    return (
        <>
            <div onClick={닫기} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000 }} />
            <div
                role="dialog"
                aria-modal="true"
                style={{
                    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                    width: 'min(400px, calc(100vw - 32px))', zIndex: 3001,
                    background: '#fff', borderRadius: 24,
                    padding: '32px 24px 24px', textAlign: 'center',
                    boxShadow: '0 24px 70px rgba(0,0,0,0.22)',
                }}
            >
                <p style={{ fontSize: 15, color: 'var(--먹연)', margin: '0 0 6px', fontWeight: 700 }}>
                    큐리 AI 에 오신 것을 환영합니다
                </p>
                <h2 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 22px', color: 'var(--먹)' }}>
                    클로버 {TRIAL_CLOVERS}개 받기
                </h2>

                <div style={{
                    width: 132, height: 132, margin: '0 auto 22px',
                    borderRadius: 999, background: '#EAF7EF',
                    display: 'grid', placeItems: 'center',
                }}>
                    <CloverIcon size={74} />
                </div>

                <p style={{ fontSize: 15, color: 'var(--먹연)', margin: '0 0 22px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    로그인하면 클로버 {SIGNUP_CLOVERS}개, 휴대폰 인증까지 하시면 {TRIAL_CLOVERS}개를 더 드려요.
                    <br />
                    사진 {Math.floor((SIGNUP_CLOVERS + TRIAL_CLOVERS) / TEACHER_COST)}장을 그냥 만들어볼 수 있습니다.
                </p>

                <button
                    onClick={() => router.push('/login')}
                    style={{
                        width: '100%', height: 58, borderRadius: 16, border: 'none',
                        background: 'var(--단추)', color: '#fff',
                        fontSize: 17.5, fontWeight: 800, cursor: 'pointer',
                    }}
                >
                    로그인하고 클로버 받기
                </button>

                <button
                    onClick={닫기}
                    style={{
                        width: '100%', height: 42, marginTop: 6,
                        border: 'none', background: 'none',
                        color: '#a1a1aa', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    다음에 할게요
                </button>
            </div>
        </>
    )
}
