'use client'
/** 대화 화면 안 한 번만 뜨는 카드 — 누르면 ＋ 개인봇 창을 「내 링크로 만들기」 칸으로 연다 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readHomeDraft } from '@/domains/home/draft-store'
import { shouldShowTwinStartCard, TWIN_START_CARD_KEY, TWIN_START_COPY } from '@/domains/os/twin-start-card'

export default function TwinStartCard({ guest, demo, onOpen }: { guest: boolean; demo: boolean; onOpen: () => void }) {
    const [show, setShow] = useState(false)

    useEffect(() => {
        if (guest || demo) return
        let alive = true
        void (async () => {
            try {
                const done = !!localStorage.getItem(TWIN_START_CARD_KEY)
                const hasHomeDraft = !!readHomeDraft(window.localStorage)
                if (done || hasHomeDraft) return
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.user) return
                const { data: creator } = await supabase.from('creator_profiles').select('id').eq('user_id', session.user.id).maybeSingle()
                let hasOwnBot = false
                if (creator?.id) {
                    const { data: bots } = await supabase.from('mentors').select('id').eq('creator_id', creator.id).limit(1)
                    hasOwnBot = (bots ?? []).length > 0
                }
                if (hasOwnBot) { try { localStorage.setItem(TWIN_START_CARD_KEY, '1') } catch { /* 막힌 브라우저 */ } }
                if (alive) setShow(shouldShowTwinStartCard({ guest, demo, hasHomeDraft, hasOwnBot, done }))
            } catch { /* 조용히 안 띄운다 */ }
        })()
        return () => { alive = false }
    }, [guest, demo])

    if (!show) return null
    const finish = () => { try { localStorage.setItem(TWIN_START_CARD_KEY, '1') } catch { /* 막힌 브라우저 */ } setShow(false) }
    return (
        <div className="os-chat-info" role="group" aria-label={TWIN_START_COPY.title} style={{ border: '1px solid #d1fadf', borderRadius: 18, padding: 18, margin: '8px auto 12px', maxWidth: 420 }}>
            <div className="os-chat-info-name" style={{ fontSize: 18 }}>{TWIN_START_COPY.title}</div>
            <div className="os-chat-info-line">{TWIN_START_COPY.body}</div>
            <div className="os-chat-info-actions" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button type="button" className="os-cta" onClick={() => { finish(); onOpen() }}>{TWIN_START_COPY.cta}</button>
                <button type="button" className="os-btn" onClick={finish}>{TWIN_START_COPY.close}</button>
            </div>
        </div>
    )
}
