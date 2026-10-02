'use client'
/** 공유 링크로 온 손님에게 — 대화 중간에 「3초 만에 가입」 카드. 가입 뒤 같은 봇 대화로 돌아온다(next 에 ?ref= 까지 담는다) */
import { buildGuestLoginUrl, GUEST_SIGNUP_COPY } from '@/domains/share/guestSignup'

export default function GuestSignupCard({ botName, variant = 'inline' }: { botName?: string; variant?: 'inline' | 'modal' }) {
    const go = (provider: 'kakao' | 'google') => {
        const here = window.location.pathname + window.location.search
        window.location.href = buildGuestLoginUrl(provider, here)
    }
    const btn = { width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer' } as const
    return (
        <div role="group" aria-label="가입 안내" style={{
            margin: variant === 'inline' ? '12px auto' : 0, maxWidth: 380, width: '100%', padding: variant === 'inline' ? 20 : 0,
            borderRadius: 20, background: '#fff', border: variant === 'inline' ? '1px solid #d1fadf' : 'none', textAlign: 'center',
            boxShadow: variant === 'inline' ? '0 6px 20px rgba(3,193,36,0.12)' : 'none',
        }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-neutral-900)', marginBottom: 6 }}>{GUEST_SIGNUP_COPY.title}</div>
            <div style={{ fontSize: 14, color: 'var(--color-neutral-500)', marginBottom: 16, lineHeight: 1.6 }}>
                {botName ? `가입하면 ${botName}와(과) 계속 이야기할 수 있어요` : GUEST_SIGNUP_COPY.body}
            </div>
            <button type="button" onClick={() => go('kakao')} style={{ ...btn, background: '#FEE500', color: 'var(--color-neutral-900)', marginBottom: 8 }}>{GUEST_SIGNUP_COPY.kakao}</button>
            <button type="button" onClick={() => go('google')} style={{ ...btn, background: '#fff', color: 'var(--color-neutral-900)', border: '1px solid var(--color-neutral-200)' }}>{GUEST_SIGNUP_COPY.google}</button>
        </div>
    )
}
