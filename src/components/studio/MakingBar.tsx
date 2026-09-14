'use client'

/**
 * 만드는 동안 보여주는 진행 막대
 *
 * 대표 지시 2026-09-14 = 「만드는 거 너무 시각적으로 안보여. 프로그레스바」
 *
 * 진짜 진행률은 알 수 없다(그림 만드는 쪽이 중간 상태를 안 준다). 그래서
 * 걸리는 시간을 예상치로 잡고 막대를 채우되, 끝에서 멈춰 서서 기다린다.
 * 다 되면 100% 로 튄다. 빈 화면에 글자만 바뀌는 것보다 기다리는 체감이 짧다.
 */
import { useEffect, useState } from 'react'

const 단계 = [
    '사진을 살펴보고 있어요',
    '얼굴을 그대로 옮기는 중이에요',
    '옷과 배경을 입히는 중이에요',
    '마지막으로 다듬는 중이에요',
]

export default function MakingBar({ 예상초 = 30 }: { 예상초?: number }) {
    const [퍼센트, set퍼센트] = useState(3)
    const [남은초, set남은초] = useState(예상초)

    useEffect(() => {
        const 시작 = Date.now()
        const t = setInterval(() => {
            const 지난 = (Date.now() - 시작) / 1000
            // 예상 시간의 92% 까지만 차오르고 그 뒤로는 아주 천천히 기어간다
            const 기본 = Math.min(92, (지난 / 예상초) * 92)
            const 덤 = 지난 > 예상초 ? Math.min(6, (지난 - 예상초) * 0.4) : 0
            set퍼센트(Math.max(3, 기본 + 덤))
            set남은초(Math.max(0, Math.ceil(예상초 - 지난)))
        }, 200)
        return () => clearInterval(t)
    }, [예상초])

    const 지금단계 = 단계[Math.min(단계.length - 1, Math.floor((퍼센트 / 100) * 단계.length))]

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                background: '#fff',
                border: '1px solid var(--선)',
                borderRadius: 16,
                padding: '18px 18px 16px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--먹)' }}>{지금단계}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--연두)' }}>{Math.round(퍼센트)}%</span>
            </div>

            <div style={{ height: 10, borderRadius: 999, background: '#EDEFEC', overflow: 'hidden' }}>
                <div
                    style={{
                        height: '100%',
                        width: `${퍼센트}%`,
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                        transition: 'width 240ms linear',
                    }}
                />
            </div>

            {/* 대표 지적 0915 「중장년은 20초면 고장난 줄 안다」 — 남은 시간을 숫자로 센다 */}
            <p style={{ fontSize: 15, color: 'var(--먹연)', marginTop: 10, lineHeight: 1.5 }}>
                {남은초 > 0
                    ? `보통 ${예상초}초쯤 걸려요. 약 ${남은초}초 남았습니다.`
                    : '거의 다 됐어요. 조금만 더 기다려 주세요.'}
                <br />이 화면을 닫지 말아 주세요.
            </p>
        </div>
    )
}
