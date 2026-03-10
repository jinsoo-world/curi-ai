'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CreditClaimModalProps {
    isOpen: boolean
    onClose: () => void
    onComplete: () => void
}

export default function CreditClaimModal({ isOpen, onClose, onComplete }: CreditClaimModalProps) {
    const [phone, setPhone] = useState('')
    const [gender, setGender] = useState('')
    const [birthYear, setBirthYear] = useState('')
    const [marketingAgreed, setMarketingAgreed] = useState(true) // 기본 체크
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    if (!isOpen) return null

    const formatPhone = (value: string) => {
        const nums = value.replace(/\D/g, '').slice(0, 11)
        if (nums.length <= 3) return nums
        if (nums.length <= 7) return `${nums.slice(0, 3)}-${nums.slice(3)}`
        return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7)}`
    }

    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 80 }, (_, i) => currentYear - 14 - i)

    const canSubmit = phone.replace(/\D/g, '').length >= 10 && gender && birthYear

    const handleSubmit = async () => {
        if (!canSubmit) return
        setIsSubmitting(true)
        setError('')

        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                setError('로그인 정보를 찾을 수 없습니다.')
                setIsSubmitting(false)
                return
            }

            // CRM 데이터 저장
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    phone: phone.replace(/\D/g, ''),
                    gender,
                    birth_year: parseInt(birthYear),
                    marketing_agreed: marketingAgreed,
                })
                .eq('id', user.id)

            if (updateError) {
                console.error('Update error:', updateError)
                // phone/marketing_agreed 컬럼이 아직 없을 수 있음 — 기본 필드만 업데이트
                const { error: fallbackError } = await supabase
                    .from('users')
                    .update({
                        gender,
                        birth_year: parseInt(birthYear),
                    })
                    .eq('id', user.id)

                if (fallbackError) throw fallbackError
            }

            // 1만원 크레딧 지급 시도
            try {
                await supabase.from('credits').insert({
                    user_id: user.id,
                    amount: 10000,
                    type: 'welcome_bonus',
                    description: '가입 축하 크레딧',
                })
            } catch {
                // credits 테이블이 아직 없으면 무시
                console.log('Credits table not ready yet')
            }

            onComplete()
        } catch (err: any) {
            console.error('Submit error:', err)
            setError('저장 중 오류가 발생했습니다. 다시 시도해주세요.')
            setIsSubmitting(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            padding: 24,
        }}>
            <div style={{
                width: '100%', maxWidth: 420,
                background: '#fff',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
                animation: 'modalIn 0.3s ease',
            }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                    padding: '32px 28px 24px',
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>🎁</div>
                    <h2 style={{
                        fontSize: 22, fontWeight: 800, color: '#15803d',
                        letterSpacing: '-0.02em', marginBottom: 6,
                    }}>
                        1만원 무료 크레딧을 받으세요!
                    </h2>
                    <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
                        간단한 정보를 입력하시면<br />
                        바로 크레딧이 지급됩니다
                    </p>
                </div>

                {/* Form */}
                <div style={{ padding: '24px 28px 28px' }}>
                    {error && (
                        <div style={{
                            padding: '10px 14px', marginBottom: 16,
                            background: '#fef2f2', color: '#991b1b',
                            borderRadius: 10, fontSize: 13,
                        }}>
                            {error}
                        </div>
                    )}

                    {/* 휴대폰 번호 */}
                    <div style={{ marginBottom: 18 }}>
                        <label style={{
                            display: 'block', fontSize: 14, fontWeight: 600,
                            color: '#374151', marginBottom: 6,
                        }}>
                            📱 휴대폰 번호 <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                            type="tel"
                            placeholder="010-0000-0000"
                            value={phone}
                            onChange={(e) => setPhone(formatPhone(e.target.value))}
                            style={{
                                width: '100%', padding: '14px 16px',
                                fontSize: 16, borderRadius: 12,
                                border: '1.5px solid #e5e7eb',
                                outline: 'none', transition: 'border-color 200ms',
                                boxSizing: 'border-box',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#22c55e'}
                            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        />
                    </div>

                    {/* 성별 + 출생년도 */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: 12, marginBottom: 20,
                    }}>
                        {/* 성별 */}
                        <div>
                            <label style={{
                                display: 'block', fontSize: 14, fontWeight: 600,
                                color: '#374151', marginBottom: 6,
                            }}>
                                👤 성별 <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[
                                    { value: 'male', label: '남성' },
                                    { value: 'female', label: '여성' }
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setGender(opt.value)}
                                        style={{
                                            flex: 1, padding: '12px 0',
                                            borderRadius: 10, fontSize: 14, fontWeight: 600,
                                            border: `1.5px solid ${gender === opt.value ? '#22c55e' : '#e5e7eb'}`,
                                            background: gender === opt.value ? '#f0fdf4' : '#fff',
                                            color: gender === opt.value ? '#15803d' : '#6b7280',
                                            cursor: 'pointer',
                                            transition: 'all 150ms',
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 출생년도 */}
                        <div>
                            <label style={{
                                display: 'block', fontSize: 14, fontWeight: 600,
                                color: '#374151', marginBottom: 6,
                            }}>
                                🎂 출생년도 <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <select
                                value={birthYear}
                                onChange={(e) => setBirthYear(e.target.value)}
                                style={{
                                    width: '100%', padding: '12px 14px',
                                    fontSize: 14, borderRadius: 10,
                                    border: '1.5px solid #e5e7eb',
                                    outline: 'none', background: '#fff',
                                    color: birthYear ? '#18181b' : '#9ca3af',
                                    cursor: 'pointer',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <option value="">선택</option>
                                {years.map((y) => (
                                    <option key={y} value={y}>{y}년</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 마케팅 수신 동의 */}
                    <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        marginBottom: 20, cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={marketingAgreed}
                            onChange={() => setMarketingAgreed(!marketingAgreed)}
                            style={{
                                width: 16, height: 16, marginTop: 2,
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>
                            (선택) 마케팅 정보 수신에 동의합니다.
                            <br />
                            <span style={{ fontSize: 12, color: '#d1d5db' }}>
                                새로운 AI 멘토, 이벤트, 할인 등의 소식을 받아보세요.
                            </span>
                        </span>
                    </label>

                    {/* 크레딧 받기 버튼 */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit || isSubmitting}
                        style={{
                            width: '100%', padding: '16px',
                            fontSize: 17, fontWeight: 700,
                            borderRadius: 14, border: 'none',
                            background: canSubmit
                                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                : '#e5e7eb',
                            color: canSubmit ? '#fff' : '#9ca3af',
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            transition: 'all 200ms',
                            boxShadow: canSubmit ? '0 4px 14px rgba(34,197,94,0.3)' : 'none',
                        }}
                    >
                        {isSubmitting ? '처리 중...' : '🎉 크레딧 잠금 해제'}
                    </button>

                    {/* 나중에 받기 */}
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: '100%', padding: 14,
                            marginTop: 8,
                            fontSize: 14, fontWeight: 500,
                            background: 'transparent', border: 'none',
                            color: '#9ca3af', cursor: 'pointer',
                        }}
                    >
                        나중에 받기
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    )
}
