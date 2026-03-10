'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'

import { MembershipBanner } from '@/components/MembershipBanner'
import AppSidebar from '@/components/AppSidebar'

export default function ProfilePage() {
    const router = useRouter()
    const supabase = createClient()
    const [user, setUser] = useState<any>(null)
    const [profile, setProfile] = useState<any>(null)
    const [googleName, setGoogleName] = useState<string>('')
    const [googleAvatar, setGoogleAvatar] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState('')
    const [payments, setPayments] = useState<any[]>([])
    const [subscription, setSubscription] = useState<any>(null)
    const [showPayments, setShowPayments] = useState(false)
    const [showCancelModal, setShowCancelModal] = useState(false)
    const [isCanceling, setIsCanceling] = useState(false)
    const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null)
    const [uploadingPhoto, setUploadingPhoto] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)

    // 편집용 상태
    const [editName, setEditName] = useState('')
    const [editInterests, setEditInterests] = useState<string[]>([])
    const [editGender, setEditGender] = useState('')
    const [editBirthYear, setEditBirthYear] = useState('')

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (user) {
                // Google 메타데이터에서 이름/사진
                setGoogleName(user.user_metadata?.full_name || user.user_metadata?.name || '')
                setGoogleAvatar(user.user_metadata?.avatar_url || '')

                // 서버 API로 프로필 조회
                try {
                    const res = await fetch('/api/profile')
                    const data = await res.json()
                    if (data.profile) {
                        setProfile(data.profile)
                        setEditName(data.profile.display_name || '')
                        setEditInterests(data.profile.interests || [])
                        setEditGender(data.profile.gender || '')
                        setEditBirthYear(data.profile.birth_year?.toString() || '')
                    }
                    if (data.subscription) setSubscription(data.subscription)
                    if (data.google_name) setGoogleName(data.google_name)
                    if (data.google_avatar) setGoogleAvatar(data.google_avatar)
                } catch (err) {
                    // API 실패 시 직접 조회
                    const { data } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', user.id)
                        .single()
                    setProfile(data)
                    if (data) {
                        setEditName(data.display_name || '')
                        setEditInterests(data.interests || [])
                        setEditGender(data.gender || '')
                        setEditBirthYear(data.birth_year?.toString() || '')
                    }
                }

                // 어드민 여부 확인
                if (user.email === 'jin@mission-driven.kr') {
                    setIsAdmin(true)
                }
            }
            setIsLoading(false)
        }
        loadProfile()
    }, [])

    // 표시용 이름: display_name > Google 이름 > '회원'
    const displayName = profile?.display_name || googleName || '회원'
    const avatarUrl = profile?.avatar_url || googleAvatar

    const handleLogout = async () => {
        if (!confirm('로그아웃 하시겠습니까?')) return
        await supabase.auth.signOut()
        router.push('/login')
    }

    const handleCancelSubscription = async () => {
        setIsCanceling(true)
        try {
            const res = await fetch('/api/billing/cancel', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                setCancelResult({ success: true, message: data.message || '구독이 취소되었습니다.' })
            } else {
                setCancelResult({ success: false, message: data.error || '구독 취소에 실패했습니다.' })
            }
        } catch {
            setCancelResult({ success: false, message: '오류가 발생했습니다.' })
        } finally {
            setIsCanceling(false)
        }
    }

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !user) return
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 업로드할 수 있습니다.')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('5MB 이하의 이미지만 업로드할 수 있습니다.')
            return
        }
        setUploadingPhoto(true)
        try {
            const ext = file.name.split('.').pop() || 'jpg'
            const path = `avatars/${user.id}.${ext}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(path, file, { upsert: true })
            if (uploadError) throw uploadError
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
            const avatarUrl = urlData.publicUrl + '?t=' + Date.now()
            await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar_url: avatarUrl }),
            })
            setProfile((prev: any) => ({ ...prev, avatar_url: avatarUrl }))
            setSaveMessage('프로필 사진이 변경되었습니다 ✓')
            setTimeout(() => setSaveMessage(''), 3000)
        } catch (err: any) {
            console.error('Photo upload error:', err)
            alert('사진 업로드에 실패했습니다: ' + (err.message || ''))
        } finally {
            setUploadingPhoto(false)
        }
    }

    const handleStartEdit = () => {
        setEditName(profile?.display_name || googleName || '')
        setEditInterests(profile?.interests || [])
        setEditGender(profile?.gender || '')
        setEditBirthYear(profile?.birth_year?.toString() || '')
        setIsEditing(true)
        setSaveMessage('')
    }

    const handleCancelEdit = () => {
        setIsEditing(false)
        setSaveMessage('')
    }

    const handleToggleInterest = (key: string) => {
        setEditInterests(prev =>
            prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]
        )
    }

    const handleSave = async () => {
        if (!user) return
        setIsSaving(true)
        setSaveMessage('')

        try {
            const response = await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: editName.trim() || null,
                    interests: editInterests,
                    gender: editGender || null,
                    birth_year: editBirthYear ? parseInt(editBirthYear) : null,
                }),
            })

            const result = await response.json()

            if (!response.ok) {
                console.error('Profile update error:', result)
                setSaveMessage('저장에 실패했습니다. 다시 시도해주세요.')
            } else {
                setProfile((prev: any) => ({
                    ...prev,
                    display_name: editName.trim(),
                    interests: editInterests,
                    gender: editGender,
                    birth_year: editBirthYear ? parseInt(editBirthYear) : null,
                }))
                setIsEditing(false)
                setSaveMessage('저장되었습니다 ✓')
                setTimeout(() => setSaveMessage(''), 3000)
            }
        } catch (err) {
            console.error('Profile save error:', err)
            setSaveMessage('저장에 실패했습니다.')
        } finally {
            setIsSaving(false)
        }
    }

    const INTEREST_OPTIONS: { key: string; label: string; emoji: string }[] = [
        { key: 'content', label: '콘텐츠 제작', emoji: '🎬' },
        { key: 'branding', label: '퍼스널 브랜딩', emoji: '✨' },
        { key: 'monetize', label: '수익화', emoji: '💰' },
        { key: 'career', label: '커리어 전환', emoji: '🚀' },
        { key: 'business', label: '1인 사업', emoji: '🏠' },
        { key: 'marketing', label: '마케팅', emoji: '📢' },
        { key: 'writing', label: '글쓰기', emoji: '✍️' },
        { key: 'coaching', label: '코칭/컨설팅', emoji: '🎯' },
    ]

    const INTEREST_LABELS: Record<string, string> = Object.fromEntries(
        INTEREST_OPTIONS.map(o => [o.key, o.label])
    )

    const sectionStyle: React.CSSProperties = {
        background: '#fff', borderRadius: 20,
        border: '1px solid #f0f0f0',
        padding: '28px 28px',
        marginBottom: 16,
    }

    const labelStyle: React.CSSProperties = {
        fontSize: 13, fontWeight: 700, color: '#6b7280',
        marginBottom: 10, textTransform: 'uppercase',
        letterSpacing: '0.06em',
    }

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <AppSidebar />

            <div className="sidebar-content" style={{ marginLeft: 240, minHeight: '100dvh' }}>
                <MembershipBanner />

                {/* Content */}
                <section style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
                    {isLoading ? (
                        <div>
                            {/* 프로필 카드 스켈레톤 */}
                            <div style={{
                                background: '#fff', borderRadius: 20, border: '1px solid #f0f0f0',
                                padding: '28px', marginBottom: 16,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out infinite' }} />
                                    <div>
                                        <div style={{ width: 100, height: 20, borderRadius: 10, background: '#e4e4e7', marginBottom: 8, animation: 'pulseSkeleton 1.5s ease-in-out infinite' }} />
                                        <div style={{ width: 160, height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.3s infinite' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ width: 120, height: 12, borderRadius: 6, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.2s infinite' }} />
                                    <div style={{ width: '70%', height: 16, borderRadius: 8, background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out 0.4s infinite' }} />
                                    <div style={{ width: 80, height: 12, borderRadius: 6, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.5s infinite' }} />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <div style={{ width: 80, height: 32, borderRadius: 100, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.6s infinite' }} />
                                        <div style={{ width: 60, height: 32, borderRadius: 100, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.7s infinite' }} />
                                    </div>
                                </div>
                            </div>
                            {/* 계정 정보 스켈레톤 */}
                            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f0f0f0', padding: '28px', marginBottom: 16 }}>
                                <div style={{ width: 70, height: 12, borderRadius: 6, background: '#f0f0f0', marginBottom: 16, animation: 'pulseSkeleton 1.5s ease-in-out 0.3s infinite' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div style={{ width: 40, height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.5s infinite' }} />
                                    <div style={{ width: 100, height: 14, borderRadius: 7, background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out 0.6s infinite' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <div style={{ width: 30, height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.7s infinite' }} />
                                    <div style={{ width: 40, height: 14, borderRadius: 7, background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out 0.8s infinite' }} />
                                </div>
                            </div>
                        </div>
                    ) : !user ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            background: '#fff', borderRadius: 20,
                            border: '1px solid #f0f0f0',
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 8 }}>
                                로그인이 필요합니다
                            </h3>
                            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 24 }}>
                                프로필을 확인하려면 로그인해주세요
                            </p>
                            <Link
                                href="/login"
                                style={{
                                    display: 'inline-block',
                                    padding: '14px 32px',
                                    borderRadius: 14,
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff', textDecoration: 'none',
                                    fontWeight: 600, fontSize: 16,
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                }}
                            >
                                로그인하기
                            </Link>
                        </div>
                    ) : (
                        <div>
                            {/* 저장 완료 메시지 */}
                            {saveMessage && (
                                <div style={{
                                    padding: '12px 20px', marginBottom: 16,
                                    borderRadius: 12, fontSize: 14, fontWeight: 600,
                                    textAlign: 'center',
                                    background: saveMessage.includes('✓') ? '#f0fdf4' : '#fef2f2',
                                    color: saveMessage.includes('✓') ? '#16a34a' : '#ef4444',
                                    border: `1px solid ${saveMessage.includes('✓') ? '#dcfce7' : '#fecaca'}`,
                                }}>
                                    {saveMessage}
                                </div>
                            )}

                            {/* Profile Card + Edit Toggle */}
                            <div style={sectionStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                        {/* 프로필 사진 */}
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <label style={{ cursor: 'pointer', display: 'block' }}>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handlePhotoUpload}
                                                    style={{ display: 'none' }}
                                                />
                                                {avatarUrl ? (
                                                    <img
                                                        src={avatarUrl}
                                                        alt="프로필"
                                                        referrerPolicy="no-referrer"
                                                        style={{
                                                            width: 64, height: 64, borderRadius: '50%',
                                                            objectFit: 'cover',
                                                            border: '3px solid #dcfce7',
                                                            opacity: uploadingPhoto ? 0.5 : 1,
                                                            transition: 'opacity 200ms',
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width: 64, height: 64, borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 28, color: '#fff', fontWeight: 800,
                                                        opacity: uploadingPhoto ? 0.5 : 1,
                                                    }}>
                                                        {displayName[0]?.toUpperCase() || '?'}
                                                    </div>
                                                )}
                                                <div style={{
                                                    position: 'absolute', bottom: -2, right: -2,
                                                    width: 24, height: 24, borderRadius: '50%',
                                                    background: '#fff', border: '2px solid #e4e4e7',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 12,
                                                }}>
                                                    {uploadingPhoto ? '⏳' : '📷'}
                                                </div>
                                            </label>
                                        </div>
                                        <div>
                                            <h2 style={{
                                                fontSize: 24, fontWeight: 800, color: '#18181b',
                                                margin: '0 0 4px', letterSpacing: '-0.02em',
                                            }}>
                                                {displayName}
                                            </h2>
                                            <p style={{ fontSize: 15, color: '#9ca3af', margin: 0 }}>
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                    {!isEditing && (
                                        <button
                                            onClick={handleStartEdit}
                                            style={{
                                                padding: '8px 18px', borderRadius: 10,
                                                border: '1px solid #e4e4e7', background: '#fff',
                                                fontSize: 14, fontWeight: 600, color: '#16a34a',
                                                cursor: 'pointer', transition: 'all 200ms',
                                                flexShrink: 0,
                                            }}
                                        >
                                            ✏️ 편집
                                        </button>
                                    )}
                                </div>

                                {/* --- 읽기 모드 --- */}
                                {!isEditing && (
                                    <>
                                        {/* 닉네임 */}
                                        <div style={{ marginBottom: 20 }}>
                                            <div style={labelStyle}>닉네임</div>
                                            <div style={{ fontSize: 16, color: '#18181b', fontWeight: 500 }}>
                                                {profile?.display_name || googleName || <span style={{ color: '#d1d5db' }}>미설정</span>}
                                            </div>
                                        </div>

                                        {/* 관심사 */}
                                        <div style={{ marginBottom: 20 }}>
                                            <div style={labelStyle}>관심사</div>
                                            {profile?.interests && profile.interests.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    {profile.interests.map((interest: string) => (
                                                        <span
                                                            key={interest}
                                                            style={{
                                                                fontSize: 14, color: '#16a34a',
                                                                background: '#f0fdf4', borderRadius: 100,
                                                                padding: '6px 14px', border: '1px solid #dcfce7',
                                                                fontWeight: 500,
                                                            }}
                                                        >
                                                            {INTEREST_LABELS[interest] || interest}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{ fontSize: 15, color: '#d1d5db' }}>미설정</span>
                                            )}
                                        </div>

                                        {/* 성별 */}
                                        <div style={{ marginBottom: 20 }}>
                                            <div style={labelStyle}>성별</div>
                                            <div style={{ fontSize: 15, color: '#18181b' }}>
                                                {profile?.gender === 'female' ? '👩 여성' : profile?.gender === 'male' ? '👨 남성' : profile?.gender === 'other' ? '😊 기타' : <span style={{ color: '#d1d5db' }}>미설정</span>}
                                            </div>
                                        </div>

                                        {/* 출생 연도 */}
                                        <div>
                                            <div style={labelStyle}>출생 연도</div>
                                            <div style={{ fontSize: 15, color: '#18181b' }}>
                                                {profile?.birth_year ? `${profile.birth_year}년` : <span style={{ color: '#d1d5db' }}>미설정</span>}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* --- 편집 모드 --- */}
                                {isEditing && (
                                    <>
                                        {/* 닉네임 편집 */}
                                        <div style={{ marginBottom: 24 }}>
                                            <div style={labelStyle}>닉네임</div>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                placeholder={googleName || '닉네임을 입력하세요'}
                                                style={{
                                                    width: '100%', padding: '12px 16px',
                                                    borderRadius: 12, border: '2px solid #e4e4e7',
                                                    fontSize: 16, outline: 'none',
                                                    transition: 'border-color 200ms',
                                                    boxSizing: 'border-box',
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = '#22c55e'}
                                                onBlur={(e) => e.target.style.borderColor = '#e4e4e7'}
                                            />
                                        </div>

                                        {/* 관심사 편집 */}
                                        <div style={{ marginBottom: 24 }}>
                                            <div style={labelStyle}>관심사 (복수 선택 가능)</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {INTEREST_OPTIONS.map((opt) => {
                                                    const selected = editInterests.includes(opt.key)
                                                    return (
                                                        <button
                                                            key={opt.key}
                                                            onClick={() => handleToggleInterest(opt.key)}
                                                            style={{
                                                                padding: '8px 16px', borderRadius: 100,
                                                                border: `2px solid ${selected ? '#22c55e' : '#e4e4e7'}`,
                                                                background: selected ? '#f0fdf4' : '#fff',
                                                                color: selected ? '#16a34a' : '#6b7280',
                                                                fontSize: 14, fontWeight: selected ? 600 : 500,
                                                                cursor: 'pointer', transition: 'all 200ms',
                                                            }}
                                                        >
                                                            {opt.emoji} {opt.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* 성별 편집 */}
                                        <div style={{ marginBottom: 24 }}>
                                            <div style={labelStyle}>성별</div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {[{ id: 'female', label: '여성', emoji: '👩' }, { id: 'male', label: '남성', emoji: '👨' }, { id: 'other', label: '기타', emoji: '😊' }].map((opt) => {
                                                    const selected = editGender === opt.id
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            onClick={() => setEditGender(opt.id)}
                                                            style={{
                                                                flex: 1, padding: '10px 0', borderRadius: 12,
                                                                border: `2px solid ${selected ? '#22c55e' : '#e4e4e7'}`,
                                                                background: selected ? '#f0fdf4' : '#fff',
                                                                color: selected ? '#16a34a' : '#6b7280',
                                                                fontSize: 14, fontWeight: selected ? 600 : 500,
                                                                cursor: 'pointer', transition: 'all 200ms',
                                                            }}
                                                        >
                                                            {opt.emoji} {opt.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* 출생 연도 편집 */}
                                        <div style={{ marginBottom: 24 }}>
                                            <div style={labelStyle}>출생 연도</div>
                                            <input
                                                type="number"
                                                value={editBirthYear}
                                                onChange={(e) => setEditBirthYear(e.target.value)}
                                                placeholder="예: 1990"
                                                min="1940"
                                                max={new Date().getFullYear()}
                                                style={{
                                                    width: '100%', padding: '12px 16px',
                                                    borderRadius: 12, border: '2px solid #e4e4e7',
                                                    fontSize: 16, outline: 'none',
                                                    transition: 'border-color 200ms',
                                                    boxSizing: 'border-box',
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = '#22c55e'}
                                                onBlur={(e) => e.target.style.borderColor = '#e4e4e7'}
                                            />
                                        </div>

                                        {/* 저장/취소 버튼 */}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <button
                                                onClick={handleCancelEdit}
                                                disabled={isSaving}
                                                style={{
                                                    flex: 1, padding: '14px 0',
                                                    borderRadius: 14, border: '1px solid #e4e4e7',
                                                    background: '#fff', fontSize: 16,
                                                    fontWeight: 600, color: '#6b7280',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                disabled={isSaving}
                                                style={{
                                                    flex: 2, padding: '14px 0',
                                                    borderRadius: 14, border: 'none',
                                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                    fontSize: 16, fontWeight: 700, color: '#fff',
                                                    cursor: isSaving ? 'not-allowed' : 'pointer',
                                                    opacity: isSaving ? 0.7 : 1,
                                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                                    transition: 'opacity 200ms',
                                                }}
                                            >
                                                {isSaving ? '저장 중...' : '저장하기'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 계정 정보 */}
                            {!isEditing && (
                                <div style={sectionStyle}>
                                    <div style={labelStyle}>계정 정보</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                                            <span style={{ color: '#6b7280' }}>가입일</span>
                                            <span style={{ color: '#18181b', fontWeight: 500 }}>
                                                {new Date(user.created_at).toLocaleDateString('ko-KR', {
                                                    year: 'numeric', month: 'long', day: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                                            <span style={{ color: '#6b7280' }}>구독</span>
                                            <span style={{
                                                color: profile?.subscription_tier === 'premium' ? '#16a34a'
                                                    : profile?.subscription_tier === 'free' ? '#3b82f6'
                                                    : profile?.subscription_tier === 'free_trial' ? '#7c3aed'
                                                    : '#6b7280',
                                                fontWeight: 600,
                                                background: profile?.subscription_tier === 'premium' ? '#f0fdf4'
                                                    : profile?.subscription_tier === 'free' ? '#eff6ff'
                                                    : profile?.subscription_tier === 'free_trial' ? '#f5f3ff'
                                                    : '#f4f4f5',
                                                borderRadius: 100,
                                                padding: '2px 12px',
                                            }}>
                                                {profile?.subscription_tier === 'premium' ? '✨ 프리미엄'
                                                    : profile?.subscription_tier === 'free' ? '🎫 프리'
                                                    : profile?.subscription_tier === 'free_trial' ? '🎁 무료 체험'
                                                    : '기본'}
                                            </span>
                                        </div>
                                        {/* 프리미엄 구독 상세 */}
                                        {profile?.subscription_tier === 'premium' && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                                    <span style={{ color: '#9ca3af' }}>구독 플랜</span>
                                                    <span style={{ color: '#18181b', fontWeight: 600 }}>
                                                        {subscription?.plan_type === 'annual' ? '연간 플랜' : '월간 플랜'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                                    <span style={{ color: '#9ca3af' }}>구독료</span>
                                                    <span style={{ color: '#18181b', fontWeight: 600 }}>
                                                        {subscription?.plan_type === 'annual' ? '₩99,000/년' : '₩9,900/월'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                                    <span style={{ color: '#9ca3af' }}>다음 결제일</span>
                                                    <span style={{ color: '#18181b', fontWeight: 500 }}>
                                                        {subscription?.current_period_end
                                                            ? new Date(subscription.current_period_end).toLocaleDateString('ko-KR', {
                                                                year: 'numeric', month: 'long', day: 'numeric'
                                                            })
                                                            : '-'
                                                        }
                                                    </span>
                                                </div>
                                                {subscription?.status === 'canceled' && (
                                                    <div style={{
                                                        padding: '10px 14px', borderRadius: 10,
                                                        background: '#fef3c7', border: '1px solid #fde68a',
                                                        fontSize: 13, color: '#92400e', marginTop: 4,
                                                    }}>
                                                        ⚠️ 구독 취소 예정 — {subscription?.current_period_end
                                                            ? new Date(subscription.current_period_end).toLocaleDateString('ko-KR')
                                                            : ''} 까지 이용 가능
                                                    </div>
                                                )}
                                                {subscription?.status === 'active' && (
                                                    <button
                                                        onClick={() => setShowCancelModal(true)}
                                                        style={{
                                                            padding: '10px', borderRadius: 10, border: '1px solid #e4e4e7',
                                                            background: '#fff', color: '#6b7280', fontSize: 14,
                                                            fontWeight: 500, cursor: 'pointer', marginTop: 4,
                                                        }}
                                                    >
                                                        구독 취소
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {/* 무료 체험 사용자 */}
                                        {profile?.subscription_tier === 'free_trial' && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15 }}>
                                                    <span style={{ color: '#6b7280' }}>대화 횟수</span>
                                                    <span style={{ fontWeight: 600, fontSize: 14, color: '#7c3aed' }}>
                                                        무제한
                                                    </span>
                                                </div>
                                                <div style={{
                                                    padding: '14px 16px', borderRadius: 12, marginTop: 4,
                                                    background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                                                    border: '1px solid #ddd6fe',
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontSize: 18 }}>🎁</span>
                                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#5b21b6' }}>
                                                            무료 체험 기간
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 13, color: '#6d28d9', lineHeight: 1.5 }}>
                                                        <strong>2026년 4월 30일</strong>까지 모든 기능을 무료로 이용할 수 있습니다.
                                                        대화 횟수 제한 없이 마음껏 사용하세요! ✨
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            {!isEditing && (
                                <div style={{
                                    background: '#fff', borderRadius: 20,
                                    border: '1px solid #f0f0f0',
                                    overflow: 'hidden',
                                }}>
                                    <Link
                                        href="/creator/create"
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '18px 24px',
                                            textDecoration: 'none', color: '#18181b',
                                            fontSize: 16, fontWeight: 500,
                                            borderBottom: '1px solid #f0f0f0',
                                        }}
                                    >
                                        <span>✨ 내 AI 만들기</span>
                                        <span style={{ color: '#d1d5db' }}>→</span>
                                    </Link>
                                    <Link
                                        href="/creator/manage"
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '18px 24px',
                                            textDecoration: 'none', color: '#18181b',
                                            fontSize: 16, fontWeight: 500,
                                            borderBottom: '1px solid #f0f0f0',
                                        }}
                                    >
                                        <span>📊 내 AI 관리</span>
                                        <span style={{ color: '#d1d5db' }}>→</span>
                                    </Link>
                                    <Link
                                        href="/chats"
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '18px 24px',
                                            textDecoration: 'none', color: '#18181b',
                                            fontSize: 16, fontWeight: 500,
                                            borderBottom: '1px solid #f0f0f0',
                                        }}
                                    >
                                        <span>💬 대화 내역</span>
                                        <span style={{ color: '#d1d5db' }}>→</span>
                                    </Link>
                                    {/* 결제 내역 */}
                                    <button
                                        onClick={async () => {
                                            if (!showPayments && payments.length === 0) {
                                                try {
                                                    const res = await fetch('/api/billing/history')
                                                    const data = await res.json()
                                                    if (data.payments) setPayments(data.payments)
                                                    if (data.subscription) setSubscription(data.subscription)
                                                } catch (e) { console.error(e) }
                                            }
                                            setShowPayments(!showPayments)
                                        }}
                                        style={{
                                            width: '100%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '18px 24px',
                                            background: 'none', border: 'none',
                                            fontSize: 16, fontWeight: 500,
                                            color: '#18181b', cursor: 'pointer',
                                            textAlign: 'left',
                                            borderBottom: '1px solid #f0f0f0',
                                        }}
                                    >
                                        <span>🧾 결제 내역</span>
                                        <span style={{ color: '#d1d5db', transform: showPayments ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }}>→</span>
                                    </button>
                                    {showPayments && (
                                        <div style={{ padding: '0 24px 16px', background: '#fafafa' }}>
                                            {payments.length === 0 ? (
                                                <p style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
                                                    결제 내역이 없습니다.
                                                </p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
                                                    {payments.map((p: any) => (
                                                        <div key={p.id} style={{
                                                            background: '#fff', borderRadius: 12,
                                                            padding: '14px 16px', border: '1px solid #f0f0f0',
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                                <span style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>
                                                                    ₩{p.amount?.toLocaleString()}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: 12, fontWeight: 600,
                                                                    color: p.status === 'done' ? '#16a34a' : '#ef4444',
                                                                    background: p.status === 'done' ? '#f0fdf4' : '#fef2f2',
                                                                    padding: '2px 8px', borderRadius: 6,
                                                                }}>
                                                                    {p.status === 'done' ? '결제 완료' : p.status === 'canceled' ? '취소됨' : '실패'}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: 12, color: '#9ca3af' }}>
                                                                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString('ko-KR', {
                                                                        year: 'numeric', month: 'long', day: 'numeric',
                                                                        hour: '2-digit', minute: '2-digit',
                                                                    }) : ''}
                                                                </span>
                                                                {p.receipt_url && (
                                                                    <a
                                                                        href={p.receipt_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            fontSize: 12, fontWeight: 600,
                                                                            color: '#3b82f6', textDecoration: 'none',
                                                                        }}
                                                                    >
                                                                        🧾 영수증
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {subscription && (
                                                <div style={{
                                                    marginTop: 12, padding: '12px 14px', borderRadius: 10,
                                                    background: '#f0fdf4', border: '1px solid #dcfce7',
                                                    fontSize: 13, color: '#16a34a',
                                                }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>현재 구독 정보</div>
                                                    <div>상태: {subscription.status === 'active' ? '✅ 활성' : subscription.status === 'canceled' ? '⏸️ 취소 예정' : subscription.status}</div>
                                                    <div>다음 결제일: {new Date(subscription.current_period_end).toLocaleDateString('ko-KR')}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        onClick={handleLogout}
                                        style={{
                                            width: '100%',
                                            display: 'flex', alignItems: 'center',
                                            padding: '18px 24px',
                                            background: 'none', border: 'none',
                                            fontSize: 16, fontWeight: 500,
                                            color: '#ef4444', cursor: 'pointer',
                                            textAlign: 'left',
                                        }}
                                    >
                                        🚪 로그아웃
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* 구독 해지 확인 모달 */}
                {showCancelModal && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 24,
                    }} onClick={() => { if (!isCanceling) { setShowCancelModal(false); setCancelResult(null) } }}>
                        <div
                            style={{
                                background: '#fff', borderRadius: 24,
                                padding: '36px 28px', maxWidth: 400, width: '100%',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                                animation: 'modalIn 200ms ease-out',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            {!cancelResult ? (
                                <>
                                    <div style={{
                                        width: 64, height: 64, margin: '0 auto 20px',
                                        borderRadius: '50%', background: '#fef3c7',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 32,
                                    }}>⚠️</div>
                                    <h3 style={{
                                        fontSize: 20, fontWeight: 800, color: '#18181b',
                                        textAlign: 'center', margin: '0 0 8px',
                                    }}>구독을 취소하시겠어요?</h3>
                                    <p style={{
                                        fontSize: 14, color: '#6b7280', textAlign: 'center',
                                        margin: '0 0 20px', lineHeight: 1.6,
                                    }}>
                                        취소해도 현재 결제 기간이 끝날 때까지<br />
                                        프리미엄 기능을 계속 이용할 수 있어요.
                                    </p>
                                    <div style={{
                                        background: '#f8fafc', borderRadius: 14, padding: '16px 18px',
                                        marginBottom: 24, border: '1px solid #f0f0f0',
                                    }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginBottom: 10 }}>
                                            취소 시 변경사항
                                        </div>
                                        {[
                                            { icon: '📅', text: `${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString('ko-KR') : ''} 까지 프리미엄 유지` },
                                            { icon: '🔄', text: '자동 갱신이 중지됩니다' },
                                            { icon: '📉', text: '만료 후 하루 20회 무료 대화로 전환' },
                                            { icon: '💡', text: '언제든 다시 구독할 수 있어요' },
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < 3 ? 8 : 0, fontSize: 13, color: '#4b5563' }}>
                                                <span>{item.icon}</span>
                                                <span>{item.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button
                                            onClick={() => { setShowCancelModal(false); setCancelResult(null) }}
                                            disabled={isCanceling}
                                            style={{
                                                flex: 1, padding: '14px 0', borderRadius: 14,
                                                border: '1px solid #e4e4e7', background: '#fff',
                                                fontSize: 15, fontWeight: 600, color: '#18181b',
                                                cursor: 'pointer',
                                            }}
                                        >유지하기</button>
                                        <button
                                            onClick={handleCancelSubscription}
                                            disabled={isCanceling}
                                            style={{
                                                flex: 1, padding: '14px 0', borderRadius: 14,
                                                border: 'none', background: '#ef4444',
                                                fontSize: 15, fontWeight: 600, color: '#fff',
                                                cursor: isCanceling ? 'not-allowed' : 'pointer',
                                                opacity: isCanceling ? 0.7 : 1,
                                            }}
                                        >{isCanceling ? '처리 중...' : '구독 취소'}</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{
                                        width: 64, height: 64, margin: '0 auto 20px',
                                        borderRadius: '50%',
                                        background: cancelResult.success ? '#f0fdf4' : '#fef2f2',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 32,
                                    }}>{cancelResult.success ? '👋' : '😥'}</div>
                                    <h3 style={{
                                        fontSize: 20, fontWeight: 800, color: '#18181b',
                                        textAlign: 'center', margin: '0 0 12px',
                                    }}>{cancelResult.success ? '구독이 취소되었습니다' : '취소 실패'}</h3>
                                    <p style={{
                                        fontSize: 14, color: '#6b7280', textAlign: 'center',
                                        margin: '0 0 24px', lineHeight: 1.6,
                                    }}>{cancelResult.message}</p>
                                    <button
                                        onClick={() => {
                                            setShowCancelModal(false)
                                            setCancelResult(null)
                                            if (cancelResult.success) window.location.reload()
                                        }}
                                        style={{
                                            width: '100%', padding: '14px 0', borderRadius: 14,
                                            border: 'none', fontSize: 15, fontWeight: 600,
                                            background: cancelResult.success ? '#22c55e' : '#18181b',
                                            color: '#fff', cursor: 'pointer',
                                        }}
                                    >확인</button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                @keyframes pulseSkeleton { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                }
            `}</style>
            </div>
        </div>
    )
}

