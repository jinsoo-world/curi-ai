'use client'

/**
 * 처음 들어온 분에게 세 가지만 짚어준다 — 대표 지시 2026-09-15
 * 「처음에 들어올 때 온보딩도 해줘. 주요 기능 3개 정도 화면 어두워지고 집중 안내하는 거」
 *
 * 만드는 법 = 화면 전체를 어둡게 덮고, 짚어줄 자리 하나만 구멍을 내서 밝게 둔다.
 * 구멍은 그 자리 크기만큼 그림자를 아주 크게 줘서 만든다(box-shadow 0 0 0 9999px).
 *
 * 중장년 기준으로 잡은 것
 *  - 세 걸음만. 그 이상은 읽지 않고 닫는다
 *  - 글자는 크게(17~19px), 단추도 크게
 *  - 「건너뛰기」는 작고 흐리게 두되 늘 보이게. 갇힌 느낌을 주면 안 된다
 *  - 한 번 보고 나면 다시 안 뜬다(이 브라우저에 기억)
 */
import { useEffect, useState, useCallback } from 'react'
import { GUEST_CLOVERS, SIGNUP_CLOVERS } from '@/domains/trial'
import { TEACHER_COST } from '@/domains/studio/teacher'

const 본적있음키 = 'curi_first_guide_done'

interface 걸음 {
    표: string
    제목: string
    설명: string
}

const 걸음들: 걸음[] = [
    {
        표: 'guide-upload',
        제목: '사진 한 장만 올리면 됩니다',
        설명: '여기에 얼굴이 잘 보이는 사진을 올려주세요. 휴대폰으로 바로 찍으셔도 돼요.',
    },
    {
        표: 'guide-tools',
        제목: '무엇을 만들지 고르세요',
        설명: '강사 프로필, 배우 프로필, 사진 화질 개선, 콘텐츠 썸네일까지 여기서 고릅니다.',
    },
    {
        표: 'guide-clover',
        제목: '클로버로 만듭니다',
        설명: `지금도 클로버 ${GUEST_CLOVERS}개로 사진 ${Math.floor(GUEST_CLOVERS / TEACHER_COST)}장을 만들 수 있어요. 가입하시면 ${SIGNUP_CLOVERS}개를 더 드립니다.`,
    },
]

interface 자리 { top: number; left: number; width: number; height: number }

export default function FirstGuide() {
    const [걸음, set걸음] = useState(-1)
    const [자리, set자리] = useState<자리 | null>(null)

    useEffect(() => {
        try {
            if (localStorage.getItem(본적있음키)) return
        } catch {
            return
        }
        // 화면이 다 그려진 뒤에 자리를 잰다
        const t = setTimeout(() => set걸음(0), 900)
        return () => clearTimeout(t)
    }, [])

    const 자리재기 = useCallback(() => {
        if (걸음 < 0 || 걸음 >= 걸음들.length) return
        const el = document.querySelector(`[data-guide="${걸음들[걸음].표}"]`)
        if (!el) { set자리(null); return }
        const r = el.getBoundingClientRect()
        const 여백 = 8
        set자리({
            top: r.top - 여백,
            left: r.left - 여백,
            width: r.width + 여백 * 2,
            height: r.height + 여백 * 2,
        })
    }, [걸음])

    useEffect(() => {
        if (걸음 < 0) return
        // 짚어줄 자리가 화면 밖이면 먼저 데려온다
        const el = document.querySelector(`[data-guide="${걸음들[걸음]?.표}"]`)
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        const t = setTimeout(자리재기, 400)
        window.addEventListener('resize', 자리재기)
        window.addEventListener('scroll', 자리재기, true)
        return () => {
            clearTimeout(t)
            window.removeEventListener('resize', 자리재기)
            window.removeEventListener('scroll', 자리재기, true)
        }
    }, [걸음, 자리재기])

    const 끝내기 = useCallback(() => {
        try { localStorage.setItem(본적있음키, '1') } catch {}
        set걸음(-1)
        set자리(null)
    }, [])

    if (걸음 < 0 || 걸음 >= 걸음들.length) return null

    const 지금 = 걸음들[걸음]
    const 마지막 = 걸음 === 걸음들.length - 1

    // 설명 상자를 구멍 아래에 둘지 위에 둘지
    const 아래에둘까 = !자리 || 자리.top + 자리.height < window.innerHeight * 0.62

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="처음 오신 분 안내"
            style={{ position: 'fixed', inset: 0, zIndex: 4000 }}
        >
            {/* 어두운 덮개 — 짚어줄 자리만 구멍이 난다 */}
            {자리 ? (
                <div
                    style={{
                        position: 'fixed',
                        top: 자리.top,
                        left: 자리.left,
                        width: 자리.width,
                        height: 자리.height,
                        borderRadius: 18,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
                        pointerEvents: 'none',
                        transition: 'all 220ms ease',
                    }}
                />
            ) : (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)' }} />
            )}

            {/* 설명 상자 */}
            <div
                style={{
                    position: 'fixed',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    ...(자리 && 아래에둘까
                        ? { top: Math.min(자리.top + 자리.height + 16, window.innerHeight - 250) }
                        : 자리
                            ? { top: Math.max(16, 자리.top - 230) }
                            : { top: '32%' }),
                    width: 'min(420px, calc(100vw - 32px))',
                    background: '#fff',
                    borderRadius: 20,
                    padding: '22px 20px 18px',
                    boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
                }}
            >
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {걸음들.map((_, i) => (
                        <span
                            key={i}
                            style={{
                                height: 4,
                                flex: 1,
                                borderRadius: 999,
                                background: i <= 걸음 ? '#1C2321' : '#E4E4E7',
                            }}
                        />
                    ))}
                </div>

                <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em', wordBreak: 'keep-all' }}>
                    {지금.제목}
                </h2>
                <p style={{ fontSize: 16.5, color: '#52525b', margin: '0 0 18px', lineHeight: 1.65, wordBreak: 'keep-all' }}>
                    {지금.설명}
                </p>

                <button
                    type="button"
                    onClick={() => (마지막 ? 끝내기() : set걸음(걸음 + 1))}
                    style={{
                        width: '100%',
                        padding: 16,
                        borderRadius: 14,
                        border: 'none',
                        background: '#1C2321',
                        color: '#fff',
                        fontSize: 17,
                        fontWeight: 800,
                        cursor: 'pointer',
                    }}
                >
                    {마지막 ? '알겠습니다' : '다음'}
                </button>

                <button
                    type="button"
                    onClick={끝내기}
                    style={{
                        width: '100%',
                        marginTop: 8,
                        padding: 10,
                        border: 'none',
                        background: 'none',
                        color: '#a1a1aa',
                        fontSize: 14.5,
                        cursor: 'pointer',
                    }}
                >
                    건너뛰기
                </button>
            </div>
        </div>
    )
}
