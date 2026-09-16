'use client'

/**
 * 도구 공유하기 — 링크 복사 · 카카오톡
 *
 * 대표 지시 2026-09-15
 * 「만들기 각각 공유하기 버튼 어딨냐? 링크 / 카톡 공유하기 있어야지.
 *  그리고 공유했을 때 OG 이미지, 스크립트 잘 뜨게하고.
 *  회원이면 회원 식별자가 공유에 들어가게 해서 추적하고」
 *
 * 회원이면 주소에 그 사람 추천코드(?ref=…)가 붙는다. 그 링크로 누가 들어와 가입하면
 * 추천한 사람에게 클로버가 간다. 비회원이면 코드 없이 나간다.
 * 어디서 눌렀는지도 같이 붙여(utm) 나중에 어느 도구가 잘 퍼지는지 셀 수 있게 한다.
 */
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

declare global {
    interface Window {
        Kakao?: {
            isInitialized: () => boolean
            Share?: { sendDefault: (o: unknown) => void }
        }
    }
}

export default function ShareTool({
    path,
    title,
    description,
    image,
}: {
    /** 이 도구 주소 (예: /tools/id-photo) */
    path: string
    title: string
    description: string
    /** 카톡 말풍선에 들어갈 그림 (예: /og/profile-photo.png) */
    image: string
}) {
    const [추천코드, set추천코드] = useState<string | null>(null)
    const [복사됨, set복사됨] = useState(false)
    const [알림, set알림] = useState<string | null>(null)

    useEffect(() => {
        let 살아있음 = true
        void (async () => {
            const supabase = createClient()
            // 화면을 여는 신원 확인은 getSession 으로 — getUser 는 부를 때마다 서버에 다녀온다(2026-09-16 실측 수 초)
            const { data: { session } } = await supabase.auth.getSession()
            const user = session?.user ?? null
            if (!user) return
            const { data: row } = await supabase.from('users').select('referral_code').eq('id', user.id).single()
            if (살아있음) set추천코드(row?.referral_code ?? null)
        })()
        return () => { 살아있음 = false }
    }, [])

    const 주소만들기 = useCallback((경로: 'copy' | 'kakao') => {
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.curi-ai.com'
        const q = new URLSearchParams()
        if (추천코드) q.set('ref', 추천코드)
        q.set('utm_source', 경로 === 'kakao' ? 'kakao' : 'copy')
        q.set('utm_medium', 'share')
        q.set('utm_campaign', path.replace(/^\/tools\//, '') || 'tool')
        return `${base}${path}?${q.toString()}`
    }, [추천코드, path])

    const 복사 = useCallback(async () => {
        const 주소 = 주소만들기('copy')
        try {
            await navigator.clipboard.writeText(주소)
            set복사됨(true)
            set알림(null)
            setTimeout(() => set복사됨(false), 2200)
        } catch {
            set알림('주소를 복사하지 못했어요. 주소창을 길게 눌러 복사해주세요.')
        }
    }, [주소만들기])

    const 카톡 = useCallback(() => {
        const 주소 = 주소만들기('kakao')
        const K = window.Kakao
        if (!K?.isInitialized?.() || !K.Share?.sendDefault) {
            void 복사()
            set알림('카카오톡이 열리지 않아 주소를 복사했어요.')
            return
        }
        try {
            const base = window.location.origin
            K.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title,
                    description,
                    imageUrl: `${base}${image}`,
                    link: { mobileWebUrl: 주소, webUrl: 주소 },
                },
                buttons: [{ title: '나도 만들어보기', link: { mobileWebUrl: 주소, webUrl: 주소 } }],
            })
        } catch {
            void 복사()
            set알림('카카오톡이 열리지 않아 주소를 복사했어요.')
        }
    }, [주소만들기, 복사, title, description, image])

    const 단추 = {
        flex: 1,
        padding: '13px 10px',
        borderRadius: 13,
        border: '1px solid #e4e4e7',
        background: '#fff',
        fontSize: 15,
        fontWeight: 800,
        color: '#18181b',
        cursor: 'pointer',
    } as const

    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, color: '#71717a', marginBottom: 8, textAlign: 'center' }}>
                이 도구를 친구에게 알려주세요
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={카톡} style={{ ...단추, background: '#FEE500', border: '1px solid #F2DA00' }}>
                    카카오톡으로 보내기
                </button>
                <button type="button" onClick={복사} style={단추}>
                    {복사됨 ? '복사했어요' : '링크 복사'}
                </button>
            </div>
            {추천코드 && (
                <p style={{ fontSize: 13.5, color: '#a1a1aa', margin: '8px 0 0', textAlign: 'center' }}>
                    내 추천코드가 함께 나갑니다. 친구가 가입하면 클로버를 받아요.
                </p>
            )}
            {알림 && (
                <p style={{ fontSize: 15, color: '#b45309', margin: '8px 0 0', textAlign: 'center' }}>{알림}</p>
            )}
        </div>
    )
}
