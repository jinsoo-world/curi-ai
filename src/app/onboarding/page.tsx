'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface OnboardingData {
    display_name: string
    birth_year: string
    gender: string
    interests: string[]
}

const INTEREST_OPTIONS = [
    { id: 'content', label: '콘텐츠 제작', emoji: '📝' },
    { id: 'branding', label: '퍼스널 브랜딩', emoji: '✨' },
    { id: 'monetize', label: '수익화', emoji: '💰' },
    { id: 'career', label: '커리어 전환', emoji: '🔄' },
    { id: 'business', label: '1인 사업', emoji: '🚀' },
    { id: 'marketing', label: '마케팅', emoji: '📣' },
    { id: 'writing', label: '글쓰기', emoji: '✍️' },
    { id: 'coaching', label: '코칭/컨설팅', emoji: '🎯' },
]

const GENDER_OPTIONS = [
    { id: 'female', label: '여성', emoji: '👩' },
    { id: 'male', label: '남성', emoji: '👨' },
    { id: 'other', label: '기타', emoji: '😊' },
]

export default function OnboardingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-dvh flex items-center justify-center" style={{ background: '#f8f9fa' }}>
                <div style={{
                    width: 32, height: 32,
                    border: '3px solid #e4e4e7',
                    borderTop: '3px solid #22c55e',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        }>
            <OnboardingContent />
        </Suspense>
    )
}

function OnboardingContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const [step, setStep] = useState(0)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [data, setData] = useState<OnboardingData>({
        display_name: '',
        birth_year: '',
        gender: '',
        interests: [],
    })

    // resume 모드: 기존 데이터 로드 & 미입력 필드만 표시
    const isResume = searchParams.get('resume') === 'true'
    const missingParam = searchParams.get('missing') || ''
    const [stepsToShow, setStepsToShow] = useState<number[]>([0, 1, 2])

    useEffect(() => {
        async function loadExistingData() {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) {
                    setIsLoading(false)
                    return
                }

                // Google 이름을 기본값으로
                const googleName = user.user_metadata?.full_name || user.user_metadata?.name || ''

                if (isResume) {
                    // 기존 프로필 데이터 로드
                    const { data: profile } = await supabase
                        .from('users')
                        .select('display_name, interests, birth_year, gender')
                        .eq('id', user.id)
                        .single()

                    if (profile) {
                        setData({
                            display_name: profile.display_name || googleName,
                            birth_year: profile.birth_year?.toString() || '',
                            gender: profile.gender || '',
                            interests: profile.interests || [],
                        })
                    }

                    // 미입력 필드 파악
                    const missing = missingParam.split(',').filter(Boolean)

                    // 미입력 필드에 해당하는 스텝만 표시
                    const steps: number[] = []
                    if (missing.includes('name')) steps.push(0)
                    if (missing.includes('gender') || missing.includes('birth_year')) steps.push(1)
                    if (missing.includes('interests')) steps.push(2)
                    setStepsToShow(steps.length > 0 ? steps : [0, 1, 2])
                    setStep(steps.length > 0 ? steps[0] : 0)
                } else {
                    // 첫 온보딩: Google 이름 기본값
                    setData(prev => ({
                        ...prev,
                        display_name: googleName,
                    }))
                }
            } catch (err) {
                console.error('Load existing data error:', err)
            } finally {
                setIsLoading(false)
            }
        }
        loadExistingData()
    }, [])

    const totalSteps = stepsToShow.length

    const toggleInterest = (id: string) => {
        setData((prev) => ({
            ...prev,
            interests: prev.interests.includes(id)
                ? prev.interests.filter((i) => i !== id)
                : [...prev.interests, id],
        }))
    }

    const goToNextStep = () => {
        const currentIdx = stepsToShow.indexOf(step)
        if (currentIdx < stepsToShow.length - 1) {
            setStep(stepsToShow[currentIdx + 1])
        }
    }

    const goToPrevStep = () => {
        const currentIdx = stepsToShow.indexOf(step)
        if (currentIdx > 0) {
            setStep(stepsToShow[currentIdx - 1])
        }
    }

    const isLastStep = () => {
        const currentIdx = stepsToShow.indexOf(step)
        return currentIdx === stepsToShow.length - 1
    }

    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            const response = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: data.display_name,
                    interests: data.interests,
                    birth_year: data.birth_year,
                    gender: data.gender,
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                console.error('Onboarding API error:', JSON.stringify(result), 'Status:', response.status)
            } else {
                console.log('Onboarding saved successfully')
                // 가입 크레딧 보너스 지급 (실패해도 온보딩은 정상 진행)
                try {
                    await fetch('/api/credits/signup-bonus', { method: 'POST' })
                } catch (e) {
                    console.error('Signup bonus error:', e)
                }
            }

            router.push('/mentors')
        } catch (err) {
            console.error('Onboarding error:', err)
            router.push('/mentors')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: '#f8f9fa' }}>
                <div style={{
                    width: 32, height: 32,
                    border: '3px solid #e4e4e7',
                    borderTop: '3px solid #22c55e',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        )
    }

    const currentStepIndex = stepsToShow.indexOf(step)

    // 생년 범위 생성 (1940 ~ 현재년도)
    const currentYear = new Date().getFullYear()
    const yearOptions = Array.from({ length: currentYear - 1940 + 1 }, (_, i) => currentYear - i)

    return (
        <div
            className="min-h-dvh flex flex-col items-center justify-center px-6 relative"
            style={{ background: '#f8f9fa' }}
        >
            {/* Background decoration */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute rounded-full"
                    style={{
                        width: 320, height: 320, top: -100, right: -80,
                        background: 'rgba(187, 247, 208, 0.25)', filter: 'blur(80px)',
                    }}
                />
                <div
                    className="absolute rounded-full"
                    style={{
                        width: 260, height: 260, bottom: -80, left: -60,
                        background: 'rgba(220, 252, 231, 0.3)', filter: 'blur(80px)',
                    }}
                />
            </div>

            {/* Card */}
            <div
                className="relative z-10 w-full max-w-md bg-white rounded-3xl animate-fade-in"
                style={{
                    padding: '40px 32px 36px',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)',
                }}
            >
                {/* Resume 안내 */}
                {isResume && (
                    <div style={{
                        padding: '10px 14px', marginBottom: 16,
                        borderRadius: 12, background: '#f0fdf4',
                        fontSize: 14, color: '#16a34a', fontWeight: 500,
                        border: '1px solid #dcfce7',
                    }}>
                        ✨ 몇 가지만 더 알려주시면 맞춤 멘토링이 가능해요
                    </div>
                )}

                {/* Progress bar */}
                <div className="flex gap-2 mb-8">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-full"
                            style={{
                                height: 4,
                                backgroundColor: i <= currentStepIndex ? '#22c55e' : '#e5e7eb',
                                transition: 'background-color 300ms ease',
                            }}
                        />
                    ))}
                </div>

                {/* Step indicator */}
                <div
                    className="mb-6"
                    style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}
                >
                    STEP {currentStepIndex + 1} / {totalSteps}
                </div>

                {/* Step 1: 이름 */}
                {step === 0 && (
                    <div className="animate-slide-up">
                        <div
                            className="inline-flex items-center justify-center rounded-2xl mb-5"
                            style={{
                                width: 56, height: 56,
                                background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                            }}
                        >
                            <span style={{ fontSize: 28 }}>👋</span>
                        </div>
                        <h2
                            className="font-bold text-gray-900"
                            style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}
                        >
                            {isResume ? '뭐라고 불러드릴까요?' : '반갑습니다!'}
                        </h2>
                        <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
                            멘토가 불러드릴 이름을 알려주세요
                        </p>
                        <input
                            type="text"
                            value={data.display_name}
                            onChange={(e) =>
                                setData({ ...data, display_name: e.target.value })
                            }
                            placeholder="예: 지은"
                            className="w-full outline-none"
                            style={{
                                padding: '16px 20px',
                                borderRadius: 16,
                                border: '1.5px solid #e5e7eb',
                                fontSize: 18,
                                background: '#fafafa',
                                transition: 'border-color 200ms, box-shadow 200ms',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#22c55e'
                                e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e5e7eb'
                                e.target.style.boxShadow = 'none'
                            }}
                            autoFocus
                        />
                        <button
                            onClick={isLastStep() ? handleSubmit : goToNextStep}
                            disabled={!data.display_name.trim() || isSubmitting}
                            className="w-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                                marginTop: 24,
                                padding: '16px',
                                borderRadius: 16,
                                border: 'none',
                                fontSize: 17,
                                fontWeight: 600,
                                color: '#fff',
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                transition: 'transform 200ms, box-shadow 200ms',
                            }}
                        >
                            {isLastStep() ? (isSubmitting ? '저장 중...' : '멘토 만나러 가기 🎓') : '다음'}
                        </button>
                    </div>
                )}

                {/* Step 2: 성별 + 생년월일 */}
                {step === 1 && (
                    <div className="animate-slide-up">
                        <div
                            className="inline-flex items-center justify-center rounded-2xl mb-5"
                            style={{
                                width: 56, height: 56,
                                background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                            }}
                        >
                            <span style={{ fontSize: 28 }}>🎂</span>
                        </div>
                        <h2
                            className="font-bold text-gray-900"
                            style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}
                        >
                            {data.display_name ? `${data.display_name}님에 대해 알려주세요` : '기본 정보를 알려주세요'}
                        </h2>
                        <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
                            맞춤 멘토링을 위해 필요해요
                        </p>

                        {/* 성별 선택 */}
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', marginBottom: 10 }}>
                                성별
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                {GENDER_OPTIONS.map((option) => {
                                    const isSelected = data.gender === option.id
                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => setData({ ...data, gender: option.id })}
                                            className="cursor-pointer"
                                            style={{
                                                flex: 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 6,
                                                padding: '14px 0',
                                                borderRadius: 14,
                                                fontSize: 15,
                                                fontWeight: 500,
                                                border: isSelected ? '2px solid #22c55e' : '1.5px solid #e5e7eb',
                                                background: isSelected ? '#f0fdf4' : '#fff',
                                                color: isSelected ? '#15803d' : '#4b5563',
                                                boxShadow: isSelected ? '0 2px 8px rgba(34,197,94,0.12)' : 'none',
                                                transition: 'all 200ms ease',
                                            }}
                                        >
                                            <span>{option.emoji}</span>
                                            {option.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* 생년 선택 */}
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', marginBottom: 10 }}>
                                출생 연도
                            </div>
                            <select
                                value={data.birth_year}
                                onChange={(e) => setData({ ...data, birth_year: e.target.value })}
                                className="w-full outline-none"
                                style={{
                                    padding: '16px 20px',
                                    borderRadius: 16,
                                    border: '1.5px solid #e5e7eb',
                                    fontSize: 16,
                                    background: '#fafafa',
                                    color: data.birth_year ? '#18181b' : '#9ca3af',
                                    transition: 'border-color 200ms, box-shadow 200ms',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 16px center',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#22c55e'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)'
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = '#e5e7eb'
                                    e.target.style.boxShadow = 'none'
                                }}
                            >
                                <option value="">출생 연도를 선택하세요</option>
                                {yearOptions.map((year) => (
                                    <option key={year} value={year}>{year}년</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-3" style={{ marginTop: 24 }}>
                            {currentStepIndex > 0 && (
                                <button
                                    onClick={goToPrevStep}
                                    className="cursor-pointer"
                                    style={{
                                        padding: '16px 24px',
                                        borderRadius: 16,
                                        border: '1.5px solid #e5e7eb',
                                        background: '#fff',
                                        fontSize: 16,
                                        color: '#6b7280',
                                        fontWeight: 500,
                                        transition: 'background 200ms',
                                    }}
                                >
                                    이전
                                </button>
                            )}
                            <button
                                onClick={isLastStep() ? handleSubmit : goToNextStep}
                                disabled={(!data.gender && !data.birth_year) || isSubmitting}
                                className="flex-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    padding: '16px',
                                    borderRadius: 16,
                                    border: 'none',
                                    fontSize: 17,
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                    transition: 'transform 200ms, box-shadow 200ms',
                                }}
                            >
                                {isLastStep() ? (isSubmitting ? '저장 중...' : '멘토 만나러 가기 🎓') : '다음'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: 관심사 선택 */}
                {step === 2 && (
                    <div className="animate-slide-up">
                        <div
                            className="inline-flex items-center justify-center rounded-2xl mb-5"
                            style={{
                                width: 56, height: 56,
                                background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                            }}
                        >
                            <span style={{ fontSize: 28 }}>💡</span>
                        </div>
                        <h2
                            className="font-bold text-gray-900"
                            style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}
                        >
                            {data.display_name ? `${data.display_name}님의 관심사는?` : '관심사를 선택해주세요'}
                        </h2>
                        <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
                            여러 개 선택할 수 있어요 (최소 1개)
                        </p>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 12,
                            }}
                        >
                            {INTEREST_OPTIONS.map((option) => {
                                const isSelected = data.interests.includes(option.id)
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => toggleInterest(option.id)}
                                        className="cursor-pointer"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '14px 16px',
                                            borderRadius: 14,
                                            fontSize: 15,
                                            fontWeight: 500,
                                            border: isSelected ? '2px solid #22c55e' : '1.5px solid #e5e7eb',
                                            background: isSelected ? '#f0fdf4' : '#fff',
                                            color: isSelected ? '#15803d' : '#4b5563',
                                            boxShadow: isSelected ? '0 2px 8px rgba(34,197,94,0.12)' : 'none',
                                            transition: 'all 200ms ease',
                                        }}
                                    >
                                        <span>{option.emoji}</span>
                                        {option.label}
                                    </button>
                                )
                            })}
                        </div>
                        <div className="flex gap-3" style={{ marginTop: 24 }}>
                            {currentStepIndex > 0 && (
                                <button
                                    onClick={goToPrevStep}
                                    className="cursor-pointer"
                                    style={{
                                        padding: '16px 24px',
                                        borderRadius: 16,
                                        border: '1.5px solid #e5e7eb',
                                        background: '#fff',
                                        fontSize: 16,
                                        color: '#6b7280',
                                        fontWeight: 500,
                                        transition: 'background 200ms',
                                    }}
                                >
                                    이전
                                </button>
                            )}
                            <button
                                onClick={handleSubmit}
                                disabled={data.interests.length === 0 || isSubmitting}
                                className="flex-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    padding: '16px',
                                    borderRadius: 16,
                                    border: 'none',
                                    fontSize: 17,
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                    transition: 'transform 200ms, box-shadow 200ms',
                                }}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div
                                            className="rounded-full animate-spin-slow"
                                            style={{
                                                width: 18, height: 18,
                                                border: '2px solid rgba(255,255,255,0.3)',
                                                borderTopColor: '#fff',
                                            }}
                                        />
                                        저장 중...
                                    </span>
                                ) : (
                                    '멘토 만나러 가기 🎓'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
