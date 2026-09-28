'use client'

/**
 * 첫 봇을 만든 분께 한 번만 — 「내 봇 링크를 수강생에게 보내 보세요」
 * 어떤 길로 만들었든, 내 봇이 딱 하나이고 지금 그 봇 대화면 띄운다. 띄운 뒤엔 다시 안 뜬다(localStorage).
 */
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildBotShareUrl, shouldShowFirstBotCard, FIRST_BOT_CARD_KEY } from '@/domains/share/botLink'

export default function FirstBotShareCard({ botId, botName }: { botId: string; botName: string }) {
    const [주소, set주소] = useState<string | null>(null)
    const [알림, set알림] = useState<string | null>(null)

    useEffect(() => {
        let 살아있음 = true
        void (async () => {
            try {
                if (localStorage.getItem(FIRST_BOT_CARD_KEY)) return
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                const user = session?.user
                if (!user) return
                const { data: creator } = await supabase.from('creator_profiles').select('id').eq('user_id', user.id).maybeSingle()
                if (!creator?.id) return
                const { data: bots } = await supabase.from('mentors').select('id').eq('creator_id', creator.id).limit(2)
                const ids = (bots ?? []).map((b: { id: string }) => b.id)
                if (!shouldShowFirstBotCard({ myBotIds: ids, currentBotId: botId, alreadyShown: false })) return
                const { data: me } = await supabase.from('users').select('referral_code').eq('id', user.id).maybeSingle()
                const code = me?.referral_code ?? null
                if (!살아있음) return
                set주소(buildBotShareUrl({ origin: window.location.origin, botId, ownerCode: code, sharerCode: code }))
                localStorage.setItem(FIRST_BOT_CARD_KEY, '1')
            } catch { /* 못 띄우면 그냥 넘어간다 */ }
        })()
        return () => { 살아있음 = false }
    }, [botId])

    const 복사 = useCallback(async () => {
        if (!주소) return
        try { await navigator.clipboard.writeText(주소); set알림('주소를 복사했어요.') }
        catch { set알림('복사하지 못했어요. 주소를 길게 눌러 복사해주세요.') }
    }, [주소])

    const 보내기 = useCallback(async () => {
        if (!주소) return
        if (typeof navigator.share === 'function') {
            try { await navigator.share({ title: botName, text: `${botName}에게 물어보세요`, url: 주소 }) } catch { /* 닫음 */ }
            return
        }
        void 복사()
    }, [주소, botName, 복사])

    if (!주소) return null
    const 단추 = { flex: 1, height: 48, borderRadius: 12, fontSize: 15.5, fontWeight: 800, cursor: 'pointer' } as const
    return (
        <div style={{ margin: '12px 16px', background: '#fff', border: '1px solid var(--선, #e5e7eb)', borderRadius: 16, padding: '16px 18px' }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>내 봇 링크를 수강생에게 보내 보세요</p>
            <p style={{ fontSize: 13, color: 'var(--먹연, #6b7280)', margin: '0 0 12px', wordBreak: 'break-all' }}>{주소}</p>
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={복사} style={{ ...단추, border: '1px solid #e5e7eb', background: '#fff' }}>링크 복사</button>
                <button type="button" onClick={보내기} style={{ ...단추, border: 'none', background: '#FEE500', color: '#191600' }}>보내기</button>
            </div>
            {알림 && <p style={{ fontSize: 12.5, color: 'var(--먹연, #6b7280)', margin: '8px 0 0' }}>{알림}</p>}
        </div>
    )
}
