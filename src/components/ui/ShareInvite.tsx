'use client'

/**
 * 친구 부르기 — 추천코드가 붙은 주소를 카톡으로 보낸다
 *
 * 대표 지시 2026-09-15
 * 「어필리에이트도 만들자. 아까 회원추천코드」
 * 「카톡으로 공유 시, 고유식별코드를 url에 붙일 수 있도록 해」
 *
 * 왜 이걸 따로 만드나 = 큐리어스에서 이미 겪은 일이다. 쉬운 공유 길(카톡)에 코드가 안 붙어
 * 추천 몫이 새어나갔다(0820 기록). 그래서 카톡 버튼과 복사 버튼 둘 다 같은 주소를 쓰게 한다.
 */
import { useCallback, useState } from 'react'
import CloverIcon from '@/components/ui/CloverIcon'
import { REFERRER_REWARD, TRIAL_CLOVERS, TRIAL_DAYS } from '@/domains/trial'

declare global {
    interface Window {
        Kakao?: {
            isInitialized: () => boolean
            Share?: { sendDefault: (o: unknown) => void }
        }
    }
}

export default function ShareInvite({ code, compact = false }: { code: string; compact?: boolean }) {
    const [복사됨, set복사됨] = useState(false)
    const [알림, set알림] = useState<string | null>(null)

    const 주소 =
        typeof window !== 'undefined'
            ? `${window.location.origin}/mentors?ref=${encodeURIComponent(code)}`
            : `https://curi-ai.com/mentors?ref=${encodeURIComponent(code)}`

    const 복사 = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(주소)
            set복사됨(true)
            setTimeout(() => set복사됨(false), 2000)
        } catch {
            set알림('주소를 복사하지 못했어요. 길게 눌러 복사해주세요.')
        }
    }, [주소])

    const 카톡 = useCallback(() => {
        const K = window.Kakao
        if (!K?.isInitialized?.() || !K.Share?.sendDefault) {
            void 복사()
            set알림('카카오톡이 열리지 않아 주소를 복사했어요.')
            return
        }
        try {
            K.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: `큐리 AI 무료 체험권 ${TRIAL_DAYS}일`,
                    description: `내 사진 한 장으로 프로필 사진을 만들어요. 체험권을 받으면 클로버 ${TRIAL_CLOVERS}개도 같이 드려요.`,
                    imageUrl: `${window.location.origin}/samples/after-man.webp`,
                    link: { mobileWebUrl: 주소, webUrl: 주소 },
                },
                buttons: [
                    { title: '체험권 받기', link: { mobileWebUrl: 주소, webUrl: 주소 } },
                ],
            })
        } catch {
            void 복사()
            set알림('카카오톡이 열리지 않아 주소를 복사했어요.')
        }
    }, [주소, 복사])

    return (
        <div style={{ background: compact ? 'var(--종이)' : '#fff', borderRadius: 16, padding: compact ? '16px' : '20px 20px 18px', border: compact ? 'none' : '1px solid var(--선)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>친구에게 체험권 보내기</div>
            <p style={{ fontSize: 13.5, color: 'var(--먹연)', margin: '0 0 12px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                친구가 이 주소로 체험권을 받으면 나에게 클로버 {REFERRER_REWARD}개를 드려요. 친구도 {TRIAL_CLOVERS}개를 받습니다.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <code
                    style={{
                        flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--먹연)',
                        background: '#fff', border: '1px solid var(--선)', borderRadius: 10,
                        padding: '11px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                >
                    {주소}
                </code>
                <button
                    type="button"
                    onClick={복사}
                    style={{
                        flexShrink: 0, height: 42, padding: '0 14px', borderRadius: 10,
                        border: '1px solid var(--선)', background: '#fff',
                        fontSize: 14, fontWeight: 700, color: 'var(--먹)', cursor: 'pointer',
                    }}
                >
                    {복사됨 ? '복사됨' : '복사'}
                </button>
            </div>

            <button
                type="button"
                onClick={카톡}
                style={{
                    width: '100%', height: 50, borderRadius: 12, border: 'none',
                    background: '#FEE500', color: '#191600',
                    fontSize: 15.5, fontWeight: 800, cursor: 'pointer',
                }}
            >
                카카오톡으로 보내기
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12.5, color: 'var(--진초록)', fontWeight: 700 }}>
                <CloverIcon size={14} /> 내 추천코드 {code}
            </div>

            {알림 && <p style={{ fontSize: 12.5, color: 'var(--먹연)', marginTop: 8 }}>{알림}</p>}
        </div>
    )
}
