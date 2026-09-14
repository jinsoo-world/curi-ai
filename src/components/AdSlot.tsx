'use client'

// 구글 애드센스 광고 자리 — 대표 확정 2026-09-15
// 무료·테스트 화면에만 쓴다. 유료·회원·결제 화면엔 절대 넣지 않는다.
// layout.tsx 의 애드센스 스크립트(215줄 부근)는 여기서 건드리지 않는다. 그건 사이트 전체 1회 로딩용이고,
// 이 컴포넌트는 "이 자리에 광고 하나 넣어라"라는 표시(ins 태그)만 만든다.
import { useEffect, useRef } from 'react'

declare global {
    interface Window {
        adsbygoogle: unknown[]
    }
}

type AdSlotProps = {
    /** 광고 단위 ID. 안 주면 자동 광고 형식(전면 지정 없이 구글이 알아서 채움)으로 뜬다. */
    slot?: string
    className?: string
}

export default function AdSlot({ slot, className }: AdSlotProps) {
    // React 18/19 StrictMode(개발 모드)에서는 effect 가 두 번 돈다.
    // push 를 두 번 하면 애드센스가 콘솔에 에러를 찍으므로, ref 로 "이미 한 번 밀었다"를 기억해 두 번째는 건너뛴다.
    const 이미밀었음 = useRef(false)

    useEffect(() => {
        if (이미밀었음.current) return
        이미밀었음.current = true
        try {
            ;(window.adsbygoogle = window.adsbygoogle || []).push({})
        } catch {
            // 심사 대기 중이거나 스크립트가 아직 안 붙었을 때 여기로 온다.
            // 화면이 깨지면 안 되니 조용히 넘어간다(사용자에게 에러를 보여줄 필요 없음).
        }
    }, [])

    return (
        <div className={`curi-ad-slot ${className ?? ''}`} style={{ width: '100%', textAlign: 'center' }}>
            {/* "광고" 라벨 — 5060 고객이 우리 콘텐츠와 헷갈리지 않게. 작고 연한 회색으로 눈에 안 띄게 */}
            <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 4, textAlign: 'left' }}>광고</div>
            <ins
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client="ca-pub-2184886903448753"
                data-ad-slot={slot}
                data-ad-format="auto"
                data-full-width-responsive="true"
            />
            {/*
              심사 대기 중이거나 채울 광고가 없으면 구글이 ins 태그에 data-ad-status="unfilled" 를 붙인다.
              ⚠️ 이때 ins 만 접으면 "광고" 라벨 글자만 덩그러니 남는다(2026-09-15에 실제로 그럴 뻔했다).
              그래서 ins 가 아니라 **라벨을 포함한 상자 전체**를 접는다.
            */}
            <style>{`
                .curi-ad-slot:has(ins.adsbygoogle[data-ad-status="unfilled"]) {
                    display: none !important;
                }
                /* :has() 를 모르는 낡은 브라우저 대비 — 최소한 빈 사각형은 안 남게 */
                ins.adsbygoogle[data-ad-status="unfilled"] {
                    display: none !important;
                }
            `}</style>
        </div>
    )
}
