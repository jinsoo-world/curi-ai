'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter, useParams } from 'next/navigation'
import { convertWebmToWav, needsConversion } from '@/lib/audio-convert'
import Link from 'next/link'
import Image from 'next/image'
import { MENTOR_IMAGES } from '@/domains/mentor/constants'

export default function CreatorEditPage() {
    const router = useRouter()
    const params = useParams()
    const mentorId = params.id as string

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    // AI에 반영되는 필드만
    const [name, setName] = useState('')
    const [title, setTitle] = useState('')
    const [systemPrompt, setSystemPrompt] = useState('')
    const [greetingMessage, setGreetingMessage] = useState('')
    const [sampleQuestions, setSampleQuestions] = useState('')
    const [isActive, setIsActive] = useState(true)

    // 탭 상태
    const [creatorTab, setCreatorTab] = useState<'settings' | 'files' | 'premium'>('settings')

    // ── 프리미엄 탭 상태 ──
    const [isPremium, setIsPremium] = useState(false)
    const [monthlyPrice, setMonthlyPrice] = useState(9900)
    const [freeTrialChats, setFreeTrialChats] = useState(3)
    const [freeTrialDays, setFreeTrialDays] = useState(7)
    const [mentorHandle, setMentorHandle] = useState('')
    const [handleError, setHandleError] = useState<string | null>(null)
    const [premiumSaving, setPremiumSaving] = useState(false)
    const [premiumLoaded, setPremiumLoaded] = useState(false)
    const premiumSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

    // 새 필드 (create 페이지와 통일)
    const [category, setCategory] = useState<string | null>(null)
    const [expertise, setExpertise] = useState<string[]>([])
    const [personaTemplate, setPersonaTemplate] = useState<string | null>(null)
    const [organization, setOrganization] = useState('')
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
    const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)
    const [knowledgeSources, setKnowledgeSources] = useState<{ id: string; title: string; source_type: string; processing_status: string; chunk_count: number; content?: string; file_size?: number; created_at: string }[]>([])
    const [previewSource, setPreviewSource] = useState<{ title: string; content: string; summary?: string; sourceId?: string } | null>(null)
    const [previewTab, setPreviewTab] = useState<'summary' | 'text'>('text')
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── 목소리 학습 ──
    const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null)
    const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null)
    const [voiceSamplePreviewUrl, setVoiceSamplePreviewUrl] = useState<string | null>(null)
    const [voiceSampleUploading, setVoiceSampleUploading] = useState(false)
    const [voiceTestLoading, setVoiceTestLoading] = useState(false)
    const [voiceTestAudioUrl, setVoiceTestAudioUrl] = useState<string | null>(null)
    const voiceInputRef = useRef<HTMLInputElement>(null)
    const [isRecording, setIsRecording] = useState(false)
    const [recordingSeconds, setRecordingSeconds] = useState(0)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
    const audioChunksRef = useRef<Blob[]>([])

    // 마이크 녹음 시작
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data)
            }

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                let file: File = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' })

                setVoiceSampleFile(file)
                setVoiceSamplePreviewUrl(URL.createObjectURL(blob))

                setVoiceSampleUploading(true)
                try {
                    // 🔧 webm → wav 변환 (MiniMax voice-cloning 호환)
                    if (needsConversion(file)) {
                        setToast({ type: 'success', message: '🔄 음성 최적화 중...' })
                        file = await convertWebmToWav(file)
                    }
                    const formData = new FormData()
                    formData.append('file', file)
                    formData.append('mentorId', mentorId || 'temp')
                    const res = await fetch('/api/tts/upload-voice', { method: 'POST', body: formData })
                    if (res.ok) {
                        const data = await res.json()
                        setVoiceSampleUrl(data.url)
                        setToast({ type: 'success', message: '🎙️ 녹음 업로드 완료!' })
                    } else {
                        setError('녹음 업로드에 실패했습니다.')
                    }
                } catch {
                    setError('녹음 업로드에 실패했습니다.')
                } finally {
                    setVoiceSampleUploading(false)
                }
            }

            mediaRecorder.start()
            setIsRecording(true)
            setRecordingSeconds(0)
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(s => {
                    if (s >= 19) { stopRecording(); return 20 }
                    return s + 1
                })
            }, 1000)
        } catch {
            setError('마이크 접근 권한이 필요합니다.')
        }
    }, [mentorId])

    // 녹음 중지
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        setIsRecording(false)
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current)
            recordingTimerRef.current = null
        }
    }, [])

    // ── 미리보기 채팅 ──
    const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [previewInput, setPreviewInput] = useState('')
    const [previewLoading, setPreviewLoading] = useState(false)
    const previewEndRef = useRef<HTMLDivElement>(null)

    // 미리보기 디바이스 모드
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

    useEffect(() => {
        fetchMentor()
    }, [mentorId])

    // previewSource 열리면 요약 자동 로드
    useEffect(() => {
        if (!previewSource || previewSource.summary) return
        setPreviewTab('text')
        setSummaryLoading(true)
        fetch('/api/creator/knowledge/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId: previewSource.sourceId, content: previewSource.content }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.summary) {
                    setPreviewSource(prev => prev ? { ...prev, summary: data.summary } : prev)
                }
            })
            .catch(() => {})
            .finally(() => setSummaryLoading(false))
    }, [previewSource?.sourceId])

    // 토스트 자동 숨김
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    async function fetchMentor() {
        try {
            const res = await fetch(`/api/creator/mentor/detail?id=${mentorId}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            const m = data.mentor
            setName(m.name || '')
            setTitle(m.title || '')
            setSystemPrompt(m.system_prompt || '')
            setGreetingMessage(m.greeting_message || '')
            setSampleQuestions((m.sample_questions || []).join('\n'))
            setIsActive(m.is_active)
            setCategory(m.category || null)
            setExpertise(m.expertise || [])
            setPersonaTemplate(m.persona_template || null)
            setOrganization(m.organization || '')
            if (m.avatar_url) {
                setCurrentAvatarUrl(m.avatar_url)
                setAvatarPreview(m.avatar_url)
            } else if (MENTOR_IMAGES[m.name]) {
                // DB에 avatar_url이 없는 기본 멘토 → 하드코딩 이미지 폴백
                setAvatarPreview(MENTOR_IMAGES[m.name])
            }
            if (m.voice_sample_url) {
                setVoiceSampleUrl(m.voice_sample_url)
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '멘토 정보를 불러올 수 없습니다.')
        } finally {
            setLoading(false)
        }

        // 지식 파일 목록 로드
        try {
            const kRes = await fetch(`/api/creator/knowledge/list?mentorId=${mentorId}`)
            const kData = await kRes.json()
            if (kRes.ok) setKnowledgeSources(kData.sources || [])
        } catch { /* ignore */ }
    }

    // ── 프리미엄 데이터 로드 ──
    async function fetchMonetization() {
        if (premiumLoaded) return
        try {
            const res = await fetch(`/api/creator/monetization?mentorId=${mentorId}`)
            const data = await res.json()
            if (res.ok) {
                const m = data.monetization
                setIsPremium(m.is_premium || false)
                setMonthlyPrice(m.monthly_price || 9900)
                setFreeTrialChats(m.free_trial_chats || 3)
                setFreeTrialDays(m.free_trial_days || 7)
                if (data.handle) setMentorHandle(data.handle)
                setPremiumLoaded(true)
            }
        } catch { /* ignore */ }
    }

    // 프리미엄 탭 진입 시 데이터 로드
    useEffect(() => {
        if (creatorTab === 'premium' && !premiumLoaded) {
            fetchMonetization()
        }
    }, [creatorTab])

    // ── 프리미엄 자동저장 (디바운스) ──
    function debounceSavePremium(overrides: Record<string, unknown> = {}) {
        if (premiumSaveTimerRef.current) clearTimeout(premiumSaveTimerRef.current)
        premiumSaveTimerRef.current = setTimeout(async () => {
            setPremiumSaving(true)
            try {
                const res = await fetch('/api/creator/monetization', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mentorId,
                        isPremium: overrides.isPremium !== undefined ? overrides.isPremium : isPremium,
                        monthlyPrice: overrides.monthlyPrice !== undefined ? overrides.monthlyPrice : monthlyPrice,
                        freeTrialChats: overrides.freeTrialChats !== undefined ? overrides.freeTrialChats : freeTrialChats,
                        freeTrialDays: overrides.freeTrialDays !== undefined ? overrides.freeTrialDays : freeTrialDays,
                        handle: overrides.handle !== undefined ? overrides.handle : undefined,
                    }),
                })
                const data = await res.json()
                if (!res.ok) {
                    if (res.status === 409) {
                        setHandleError(data.error || '이미 사용 중인 URL입니다.')
                    } else {
                        setToast({ type: 'error', message: data.error || '저장 실패' })
                    }
                }
            } catch {
                setToast({ type: 'error', message: '프리미엄 설정 저장 실패' })
            } finally {
                setPremiumSaving(false)
            }
        }, 500)
    }

    // 파일 업로드
    async function handleFileUpload(files: FileList | null) {
        if (!files || files.length === 0) return

        // 최대 파일 수 검증 (10개)
        const newFilesArr = Array.from(files)
        if (knowledgeSources.length + newFilesArr.length > 10) {
            setToast({ type: 'error', message: '파일은 최대 10개까지 등록할 수 있습니다.' })
            return
        }

        setUploading(true)
        try {
            const allowedExtensions = ['pdf', 'txt', 'md', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']
            for (const file of newFilesArr) {
                const ext = file.name.split('.').pop()?.toLowerCase() || ''
                if (!allowedExtensions.includes(ext)) {
                    setToast({ type: 'error', message: `지원하지 않는 형식: ${file.name}` })
                    continue
                }
                const formData = new FormData()
                formData.append('file', file)
                formData.append('mentorId', mentorId)
                const res = await fetch('/api/creator/knowledge/upload', { method: 'POST', body: formData })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)

                const sourceId = data.source.id
                setKnowledgeSources(prev => [...prev, {
                    id: sourceId, title: data.source.fileName, source_type: ext,
                    processing_status: 'processing', chunk_count: 0, created_at: new Date().toISOString(),
                }])

                // 파일 텍스트 추출
                fetch('/api/creator/knowledge/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourceId, mentorId }),
                }).then(async (r) => {
                    const result = await r.json()
                    if (r.ok) {
                        setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                            ? { ...s, processing_status: 'completed', chunk_count: result.chunksProcessed }
                            : s
                        ))
                        setToast({ type: 'success', message: `✅ ${file.name} — AI 학습 완료!` })
                    } else {
                        setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                            ? { ...s, processing_status: 'failed' } : s))
                        setToast({ type: 'error', message: `${file.name} 처리 실패` })
                    }
                }).catch(() => {
                    setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                        ? { ...s, processing_status: 'failed' } : s))
                })
            }
        } catch (err: unknown) {
            setToast({ type: 'error', message: err instanceof Error ? err.message : '업로드 실패' })
        }
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // 실패한 파일 재처리
    async function handleReprocess(sourceId: string) {
        setKnowledgeSources(prev => prev.map(s => s.id === sourceId
            ? { ...s, processing_status: 'processing' } : s))
        try {
            const res = await fetch('/api/creator/knowledge/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId, mentorId }),
            })
            const result = await res.json()
            if (res.ok) {
                // 재처리 완료 → 지식 목록을 다시 불러와서 content도 갱신
                try {
                    const listRes = await fetch(`/api/creator/knowledge/list?mentorId=${mentorId}`)
                    if (listRes.ok) {
                        const { sources } = await listRes.json()
                        setKnowledgeSources(sources)
                    }
                } catch {
                    // fallback: chunk count만 업데이트
                    setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                        ? { ...s, processing_status: 'completed', chunk_count: result.chunksProcessed }
                        : s
                    ))
                }
                setToast({ type: 'success', message: `✅ 재처리 완료! ${result.totalCharacters?.toLocaleString() ?? 0}자 추출, AI 학습 완료` })
            } else {
                setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                    ? { ...s, processing_status: 'failed' } : s))
                setToast({ type: 'error', message: `재처리 실패: ${result.error}` })
            }
        } catch {
            setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                ? { ...s, processing_status: 'failed' } : s))
        }
    }

    async function handleDeleteSource(sourceId: string, title: string) {
        if (!confirm(`"${title}" 파일을 삭제하시겠습니까?`)) return
        try {
            const res = await fetch('/api/creator/knowledge/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId, mentorId }),
            })
            if (res.ok) {
                setKnowledgeSources(prev => prev.filter(s => s.id !== sourceId))
                setToast({ type: 'success', message: `🗑️ "${title}" 삭제 완료` })
            } else {
                const data = await res.json()
                setToast({ type: 'error', message: `삭제 실패: ${data.error}` })
            }
        } catch {
            setToast({ type: 'error', message: '삭제 중 오류가 발생했습니다.' })
        }
    }

    function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setToast({ type: 'error', message: '이미지 파일만 업로드 가능합니다.' })
            return
        }
        if (file.size > 7 * 1024 * 1024) {
            setToast({ type: 'error', message: '프로필 이미지는 7MB 이하로 업로드해주세요.' })
            return
        }
        // 1:1 정방형 권장 안내
        const img = document.createElement('img')
        img.onload = () => {
            if (Math.abs(img.width - img.height) > img.width * 0.1) {
                alert('💡 프로필 사진은 1:1 정방형 이미지를 권장합니다.\n현재 이미지가 정방형이 아닐 수 있습니다.')
            }
        }
        img.src = URL.createObjectURL(file)
        setAvatarFile(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    async function handleSave() {
        setSaving(true)
        setToast(null)

        try {
            // 프로필 이미지 업로드 (새로 선택한 경우만)
            let avatarUrl: string | undefined = undefined
            if (avatarFile) {
                const ext = avatarFile.name.split('.').pop()
                const fileName = `mentor-avatar-${Date.now()}.${ext}`
                const formData = new FormData()
                formData.append('file', avatarFile)
                formData.append('fileName', fileName)
                formData.append('bucket', 'mentor-avatars')

                const avatarRes = await fetch('/api/creator/avatar/upload', {
                    method: 'POST',
                    body: formData,
                })
                if (avatarRes.ok) {
                    const avatarData = await avatarRes.json()
                    avatarUrl = avatarData.url
                }
            }
            const res = await fetch('/api/creator/mentor/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mentorId,
                    name,
                    title,
                    systemPrompt,
                    greetingMessage,
                    sampleQuestions: sampleQuestions.split('\n').map(s => s.trim()).filter(Boolean),
                    isActive,
                    category,
                    expertise,
                    personaTemplate,
                    organization,
                    ...(avatarUrl !== undefined && { avatarUrl }),
                    ...(voiceSampleUrl !== undefined && { voiceSampleUrl }),
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            setToast({ type: 'success', message: '✅ 저장 완료!' })
        } catch (err: unknown) {
            setToast({ type: 'error', message: err instanceof Error ? err.message : '저장 실패' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div style={styles.container}><div style={styles.emptyState}>불러오는 중...</div></div>
    }

    if (error && !name) {
        return (
            <div style={styles.container}>
                <div style={styles.emptyState}>
                    <div style={{ fontSize: 48 }}>❌</div>
                    <div>{error}</div>
                    <button style={styles.backBtn} onClick={() => router.back()}>← 돌아가기</button>
                </div>
            </div>
        )
    }

    // ── 미리보기 채팅 ──

    async function handlePreviewSend(msg?: string) {
        const text = msg || previewInput.trim()
        if (!text || previewLoading) return

        const newMessages = [...previewMessages, { role: 'user' as const, content: text }]
        setPreviewMessages(newMessages)
        setPreviewInput('')
        setPreviewLoading(true)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    mentorId,
                }),
            })

            const reader = res.body?.getReader()
            if (!reader) return

            let fullText = ''
            setPreviewMessages(prev => [...prev, { role: 'assistant', content: '' }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = new TextDecoder().decode(value)
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.text) {
                            fullText = data.fullResponse || (fullText + data.text)
                            setPreviewMessages(prev => {
                                const updated = [...prev]
                                updated[updated.length - 1] = { role: 'assistant', content: fullText }
                                return updated
                            })
                        }
                    } catch { /* skip */ }
                }
            }
        } catch {
            setPreviewMessages(prev => [...prev, { role: 'assistant', content: '미리보기 응답을 가져올 수 없습니다.' }])
        }
        setPreviewLoading(false)
        setTimeout(() => previewEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }

    const effectiveGreeting = greetingMessage.trim() || `안녕하세요! ${name || 'AI'}입니다 😊 무엇이 궁금하세요?`
    const sampleQArr = sampleQuestions.split('\n').map(s => s.trim()).filter(Boolean)

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            {/* ── 2컬럼 레이아웃 ── */}
            <div className="creator-layout" style={{
                display: 'flex',
                gap: 0,
                minHeight: '100dvh',
            }}>
                {/* ══════ 좌측: 설정 폼 ══════ */}
                <div className="creator-form-col" style={{
                    flex: '1 1 0',
                    maxWidth: 640,
                    padding: '24px 20px 120px',
                    overflowY: 'auto',
                    height: '100dvh',
                    boxSizing: 'border-box',
                }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <button
                            style={styles.backBtn}
                            onClick={() => router.back()}
                        >←</button>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#18181b' }}>
                                ✏️ {name || 'AI'} 수정
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                AI 설정과 지식 파일을 관리하세요
                            </p>
                        </div>
                    </div>

                    {/* ── 2탭 네비게이션 ── */}
                    <div style={{
                        display: 'flex', gap: 4, background: '#f3f4f6',
                        borderRadius: 12, padding: 4, marginBottom: 16,
                    }}>
                        {[
                            { id: 'settings' as const, label: '🎯 AI 설정' },
                            { id: 'files' as const, label: '📁 파일 학습' },
                            { id: 'premium' as const, label: '💎 프리미엄' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setCreatorTab(tab.id)}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 10,
                                    border: 'none', fontSize: 14, fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    background: creatorTab === tab.id ? '#fff' : 'transparent',
                                    boxShadow: creatorTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    color: creatorTab === tab.id ? '#18181b' : '#9ca3af',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {creatorTab === 'settings' && (<>
                    {/* ── 기본 정보 ── */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: 20 }}>
                            <div
                                onClick={() => avatarInputRef.current?.click()}
                                style={{
                                    width: 80, height: 80, borderRadius: '50%',
                                    border: '3px dashed #d1d5db', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', background: '#f9fafb',
                                    transition: 'border-color 200ms',
                                }}
                                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#22c55e')}
                                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#d1d5db')}
                            >
                                {(avatarPreview || currentAvatarUrl) ? (
                                    <img src={avatarPreview || currentAvatarUrl || ''} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ textAlign: 'center' as const, color: '#9ca3af' }}>
                                        <div style={{ fontSize: 24 }}>📷</div>
                                        <div style={{ fontSize: 10 }}>프로필</div>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={avatarInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleAvatarChange}
                            />
                            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                                클릭하여 프로필 사진 변경 (1:1 정방형 권장, 7MB 이내)
                            </span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>AI 이름</label>
                            <input
                                style={styles.input}
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="예: 맥주대왕"
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>한줄 소개</label>
                            <input
                                style={styles.input}
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="멘토 카드에 표시될 소개"
                            />
                        </div>
                    </div>



                    {/* ── 에이전트 프롬프트 ── */}
                    <div style={styles.card}>
                        <div style={styles.field}>
                            <label style={{ ...styles.label, fontSize: 15 }}>🎭 에이전트 프롬프트</label>
                            <p style={styles.hint}>AI의 성격, 말투, 전문성을 정의합니다</p>
                            <textarea
                                style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 13 }}
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                maxLength={3000}
                                rows={12}
                            />
                            <div style={{ textAlign: 'right' as const, fontSize: 11, color: systemPrompt.length > 2700 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                {systemPrompt.length}/3,000
                            </div>
                        </div>
                    </div>

                    {/* ── 인사말 / 예시 질문 ── */}
                    <div style={styles.card}>
                        <div style={styles.field}>
                            <label style={styles.label}>👋 인사 메시지</label>
                            <p style={styles.hint}>대화 시작 시 첫 번째로 보여줄 메시지</p>
                            <textarea
                                style={styles.textarea}
                                value={greetingMessage}
                                onChange={e => setGreetingMessage(e.target.value)}
                                maxLength={200}
                                rows={3}
                            />
                            <div style={{ textAlign: 'right' as const, fontSize: 11, color: greetingMessage.length > 180 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                {greetingMessage.length}/200
                            </div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>💬 예시 질문</label>
                            <p style={styles.hint}>줄바꿈으로 구분 — 대화 시작 시 추천 질문으로 표시</p>
                            <textarea
                                style={styles.textarea}
                                value={sampleQuestions}
                                onChange={e => setSampleQuestions(e.target.value)}
                                maxLength={300}
                                placeholder={"질문 1\n질문 2\n질문 3"}
                                rows={4}
                            />
                            <div style={{ textAlign: 'right' as const, fontSize: 11, color: sampleQuestions.length > 270 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                {sampleQuestions.length}/300
                            </div>
                        </div>
                    </div>
                    </>)}

                    {creatorTab === 'files' && (<>

                    {/* ── 지식 파일 관리 ── */}
                    <div style={styles.card}>
                        <label style={{ ...styles.label, marginBottom: 4, fontSize: 15 }}>📚 등록된 지식 파일</label>
                        <p style={styles.hint}>이 AI가 참고하는 파일 목록입니다</p>

                        <div
                            style={{
                                border: `2px dashed ${dragOver ? '#22c55e' : '#d1d5db'}`,
                                borderRadius: 12, padding: '14px 12px',
                                display: 'flex', flexDirection: 'column' as const,
                                alignItems: 'center', gap: 4,
                                cursor: 'pointer', transition: 'all 0.2s',
                                background: dragOver ? '#f0fdf4' : '#fafafa',
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={e => {
                                e.preventDefault()
                                setDragOver(false)
                                handleFileUpload(e.dataTransfer.files)
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.txt,.md,.doc,.docx,.hwp,.hwpx,.ppt,.pptx,.vtt"
                                multiple
                                style={{ display: 'none' }}
                                onChange={e => handleFileUpload(e.target.files)}
                            />
                            <div style={{ fontSize: 22 }}>{uploading ? '⏳' : '➕'}</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                                {uploading ? '업로드 중...' : '파일 추가 (클릭 또는 드래그)'}
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                HWP, PDF, PPT, DOCX, TXT, VTT · 최대 10개 · 합산 50MB
                            </div>
                        </div>

                        {knowledgeSources.length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center' as const, color: '#9ca3af', fontSize: 14, background: '#f9fafb', borderRadius: 12 }}>
                                등록된 지식 파일이 없습니다
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                                {knowledgeSources.map((src) => (
                                    <div key={src.id} style={{
                                        padding: '12px 16px', borderRadius: 12,
                                        background: src.processing_status === 'completed' ? '#f9fafb' :
                                                    src.processing_status === 'failed' ? '#fef2f2' : '#fffbeb',
                                        border: '1px solid #f0f0f0',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                {src.processing_status === 'processing' ? <span>⏳</span> : src.processing_status === 'failed' ? <span>❌</span> : (() => { const ext = src.title?.split('.').pop()?.toLowerCase(); const iconMap: Record<string, string> = { pdf: '/file-icons/pdf.png', hwp: '/file-icons/hwp.png', docx: '/file-icons/docx.png', doc: '/file-icons/doc.png', ppt: '/file-icons/ppt.png', pptx: '/file-icons/ppt.png', txt: '/file-icons/txt.png' }; const iconSrc = ext ? iconMap[ext] : null; return iconSrc ? <img src={iconSrc} alt={ext} style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <span>📁</span> })()}
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 500, color: '#18181b' }}>{src.title}</div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                        {src.file_size ? `${src.file_size >= 1048576 ? (src.file_size / 1048576).toFixed(1) + 'MB' : (src.file_size / 1024).toFixed(0) + 'KB'} · ` : ''}{src.processing_status === 'processing' ? '📄 파일 읽는 중...' :
                                                         src.processing_status === 'completed' ? '✅ AI가 학습 완료' :
                                                         src.processing_status === 'failed' ? '텍스트 추출에 실패했습니다' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                                                background: src.processing_status === 'completed' ? '#dcfce7' :
                                                            src.processing_status === 'processing' ? '#fef3c7' : '#fee2e2',
                                                color: src.processing_status === 'completed' ? '#16a34a' :
                                                       src.processing_status === 'processing' ? '#d97706' : '#dc2626',
                                            }}>
                                                {src.processing_status === 'completed' ? '✅ 완료' :
                                                 src.processing_status === 'processing' ? '⏳ 읽는 중...' :
                                                 src.processing_status === 'pending' ? '⏳ 대기중' : '❌ 실패'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                            {src.processing_status === 'completed' && (src.content || src.chunk_count > 0) && (
                                                <button
                                                    onClick={async () => {
                                                        if (src.content) {
                                                            setPreviewSource({ title: src.title, content: src.content, sourceId: src.id })
                                                        } else {
                                                            try {
                                                                const res = await fetch(`/api/creator/knowledge/list?mentorId=${mentorId}`)
                                                                const data = await res.json()
                                                                const found = data.sources?.find((s: any) => s.id === src.id)
                                                                if (found?.content) {
                                                                    setPreviewSource({ title: src.title, content: found.content, sourceId: src.id })
                                                                    setKnowledgeSources(prev => prev.map(p => p.id === src.id ? { ...p, content: found.content } : p))
                                                                } else {
                                                                    setToast({ type: 'error', message: '파일 내용을 불러올 수 없습니다.' })
                                                                }
                                                            } catch {
                                                                setToast({ type: 'error', message: '파일 내용을 불러올 수 없습니다.' })
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: 8,
                                                        border: '1px solid #e5e7eb', background: '#fff',
                                                        color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                    }}
                                                >📄 내용 보기</button>
                                            )}
                                            {src.processing_status === 'failed' && (
                                                <button
                                                    onClick={() => handleReprocess(src.id)}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: 8,
                                                        border: '1px solid #fca5a5', background: '#fff',
                                                        color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                    }}
                                                >🔄 재처리</button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteSource(src.id, src.title)}
                                                style={{
                                                    padding: '5px 12px', borderRadius: 8,
                                                    border: '1px solid #e5e7eb', background: '#fff',
                                                    color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                }}
                                            >🗑️ 삭제</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── 🎙️ 내 목소리 학습 ── */}
                    <div style={styles.card}>
                        <label style={{ ...styles.label, marginBottom: 4, fontSize: 15 }}>🎙️ 내 목소리 학습</label>
                        <p style={styles.hint}>3초 이상의 음성 파일을 업로드하면 AI가 목소리를 학습합니다</p>

                        {!voiceSampleFile && !voiceSampleUrl ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* 🎤 마이크 녹음 */}
                                {!isRecording ? (
                                    <div
                                        style={{
                                            border: '2px dashed #7c3aed',
                                            borderRadius: 16,
                                            padding: '24px 20px',
                                            textAlign: 'center' as const,
                                            cursor: 'pointer',
                                            transition: 'all 200ms',
                                            background: '#faf5ff',
                                        }}
                                        onClick={startRecording}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.background = '#f3e8ff' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.background = '#faf5ff' }}
                                    >
                                        <div style={{ fontSize: 32, marginBottom: 6 }}>🎤</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>마이크로 바로 녹음</div>
                                        <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 4 }}>클릭하면 녹음 시작 · 3~30초</div>
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            border: '2px solid #ef4444',
                                            borderRadius: 16,
                                            padding: '24px 20px',
                                            textAlign: 'center' as const,
                                            cursor: 'pointer',
                                            background: '#fef2f2',
                                            animation: 'voicePulse 1.5s ease-in-out infinite',
                                        }}
                                        onClick={stopRecording}
                                    >
                                        <div style={{ fontSize: 32, marginBottom: 6 }}>⏺️</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>
                                            녹음 중... {recordingSeconds}초
                                        </div>
                                        <div style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>클릭하면 녹음 종료</div>
                                        {/* 파형 애니메이션 */}
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 12 }}>
                                            {[0, 1, 2, 3, 4, 5, 6].map(i => (
                                                <div key={i} style={{
                                                    width: 4, borderRadius: 2,
                                                    background: '#ef4444',
                                                    animation: `voiceBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                                                }} />
                                            ))}
                                        </div>
                                        <style>{`
                                            @keyframes voicePulse {
                                                0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
                                                50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
                                            }
                                            @keyframes voiceBar {
                                                from { height: 8px; }
                                                to { height: ${20 + Math.random() * 16}px; }
                                            }
                                        `}</style>
                                    </div>
                                )}

                                {/* 구분선 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>또는</span>
                                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                </div>

                                {/* 📁 파일 업로드 */}
                                <div
                                    style={{
                                        border: '2px dashed #d1d5db',
                                        borderRadius: 16,
                                        padding: '20px',
                                        textAlign: 'center' as const,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                        background: '#fafafa',
                                    }}
                                    onClick={() => voiceInputRef.current?.click()}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#f0fdf4' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#fafafa' }}
                                >
                                    <input
                                        ref={voiceInputRef}
                                        type="file"
                                        accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            let file = e.target.files?.[0]
                                            if (!file) return
                                            if (file.size > 10 * 1024 * 1024) {
                                                setError('음성 파일은 10MB 이하만 가능합니다.')
                                                return
                                            }
                                            setVoiceSampleFile(file)
                                            setVoiceSamplePreviewUrl(URL.createObjectURL(file))
                                            setVoiceSampleUploading(true)
                                            try {
                                                // 🔧 webm/ogg → wav 변환 (MiniMax voice-cloning 호환)
                                                if (needsConversion(file)) {
                                                    setToast({ type: 'success', message: '🔄 음성 최적화 중...' })
                                                    file = await convertWebmToWav(file)
                                                }
                                                const formData = new FormData()
                                                formData.append('file', file)
                                                formData.append('mentorId', mentorId || 'temp')
                                                const res = await fetch('/api/tts/upload-voice', { method: 'POST', body: formData })
                                                if (res.ok) {
                                                    const data = await res.json()
                                                    setVoiceSampleUrl(data.url)
                                                    setToast({ type: 'success', message: '🎙️ 음성 샘플 업로드 완료!' })
                                                } else {
                                                    setError('음성 파일 업로드에 실패했습니다.')
                                                }
                                            } catch {
                                                setError('음성 파일 업로드에 실패했습니다.')
                                            } finally {
                                                setVoiceSampleUploading(false)
                                            }
                                        }}
                                    />
                                    <div style={{ fontSize: 24, marginBottom: 4 }}>📁</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>파일 업로드</div>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                                        {['MP3', 'WAV', 'M4A'].map(ext => (
                                            <span key={ext} style={{
                                                fontSize: 9, fontWeight: 700,
                                                color: '#7c3aed', background: '#ede9fe',
                                                padding: '2px 6px', borderRadius: 4,
                                            }}>.{ext}</span>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>최대 10MB</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                padding: '16px',
                                borderRadius: 14,
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 20 }}>🎙️</span>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>
                                                {voiceSampleFile?.name || '저장된 음성 샘플'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                                                {voiceSampleUploading ? '⏳ 업로드 중...' : voiceSampleUrl ? '✅ 학습 준비 완료' : '처리 중...'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            onClick={() => {
                                                setVoiceSampleFile(null)
                                                setVoiceSamplePreviewUrl(null)
                                                setVoiceSampleUrl(null)
                                                setVoiceTestAudioUrl(null)
                                                setTimeout(() => startRecording(), 100)
                                            }}
                                            style={{
                                                padding: '5px 10px', borderRadius: 8,
                                                border: '1px solid #bbf7d0', background: '#f0fdf4',
                                                color: '#16a34a', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >🎙️ 다시녹음</button>
                                        <label style={{
                                            padding: '5px 10px', borderRadius: 8,
                                            border: '1px solid #e5e7eb', background: '#fff',
                                            color: '#6b7280', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
                                        }}>
                                            📁 파일 교체
                                            <input
                                                type="file"
                                                accept=".mp3,.wav,.m4a,.ogg,.webm"
                                                style={{ display: 'none' }}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0]
                                                    if (!file) return
                                                    setVoiceSampleFile(file)
                                                    setVoiceSamplePreviewUrl(URL.createObjectURL(file))
                                                    setVoiceSampleUploading(true)
                                                    try {
                                                        const formData = new FormData()
                                                        formData.append('file', file)
                                                        formData.append('mentorId', mentorId || 'temp')
                                                        const res = await fetch('/api/tts/upload-voice', { method: 'POST', body: formData })
                                                        if (res.ok) {
                                                            const data = await res.json()
                                                            setVoiceSampleUrl(data.url)
                                                            setToast({ type: 'success', message: '✅ 파일 교체 완료!' })
                                                            setTimeout(() => setToast(null), 3000)
                                                        }
                                                    } catch { /* ignore */ } finally {
                                                        setVoiceSampleUploading(false)
                                                    }
                                                }}
                                            />
                                        </label>
                                        <button
                                            onClick={() => {
                                                setVoiceSampleFile(null)
                                                setVoiceSamplePreviewUrl(null)
                                                setVoiceSampleUrl(null)
                                                setVoiceTestAudioUrl(null)
                                            }}
                                            style={{
                                                padding: '5px 10px', borderRadius: 8,
                                                border: '1px solid #e5e7eb', background: '#fff',
                                                color: '#9ca3af', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >🗑️ 삭제</button>
                                    </div>
                                </div>

                                {/* 미리듣기 */}
                                {voiceSamplePreviewUrl && (
                                    <audio controls src={voiceSamplePreviewUrl} style={{ width: '100%', height: 36, marginBottom: 10 }} />
                                )}

                                {/* 테스트 음성 생성 */}
                                {voiceSampleUrl && (
                                    <button
                                        onClick={async () => {
                                            setVoiceTestLoading(true)
                                            setError('')
                                            try {
                                                console.log('[Voice Test] 요청 시작:', { voiceSampleUrl, name, greetingMessage })
                                                const res = await fetch('/api/tts', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        text: greetingMessage || `안녕하세요! ${name || 'AI'}입니다. 만나서 반가워요!`,
                                                        mentorName: name,
                                                        voiceSampleUrl: voiceSampleUrl,
                                                    }),
                                                })
                                                const data = await res.json()
                                                console.log('[Voice Test] 응답:', res.status, data)
                                                if (res.ok && data.audioUrl) {
                                                    setVoiceTestAudioUrl(data.audioUrl)
                                                    setToast({ type: 'success', message: '🔊 음성 생성 완료!' })
                                                    setTimeout(() => setToast(null), 3000)
                                                } else {
                                                    const errMsg = data.error || '음성 생성 실패'
                                                    console.error('[Voice Test] 실패:', errMsg)
                                                    setToast({ type: 'error', message: `❌ ${errMsg}` })
                                                    setTimeout(() => setToast(null), 5000)
                                                }
                                            } catch (err: any) {
                                                console.error('[Voice Test] 예외:', err)
                                                setToast({ type: 'error', message: `❌ 네트워크 오류: ${err?.message || '알 수 없는 오류'}` })
                                                setTimeout(() => setToast(null), 5000)
                                            } finally {
                                                setVoiceTestLoading(false)
                                            }
                                        }}
                                        disabled={voiceTestLoading}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: 10,
                                            border: '1px solid #bbf7d0',
                                            background: voiceTestLoading ? '#f0fdf4' : '#fff',
                                            color: '#16a34a',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            cursor: voiceTestLoading ? 'wait' : 'pointer',
                                            transition: 'all 150ms',
                                        }}
                                    >
                                        {voiceTestLoading ? '⏳ 음성 생성 중...' : '🔊 학습된 목소리로 테스트'}
                                    </button>
                                )}

                                {/* 테스트 결과 재생 */}
                                {voiceTestAudioUrl && (
                                    <div style={{ marginTop: 10 }}>
                                        <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>🔊 생성된 음성:</div>
                                        <audio controls src={voiceTestAudioUrl} style={{ width: '100%', height: 36 }} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    </>)}

                    {/* ══════ 프리미엄 탭 ══════ */}
                    {creatorTab === 'premium' && (<>
                    {/* ── 유료 전환 토글 ── */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>🔓 이 AI를 유료로 전환하기</div>
                                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>구독자만 대화할 수 있도록 설정합니다</div>
                            </div>
                            <button
                                onClick={() => {
                                    const next = !isPremium
                                    setIsPremium(next)
                                    debounceSavePremium({ isPremium: next })
                                }}
                                style={{
                                    width: 52, height: 28, borderRadius: 14,
                                    border: 'none', cursor: 'pointer',
                                    background: isPremium ? '#22c55e' : '#d1d5db',
                                    position: 'relative' as const,
                                    transition: 'background 200ms',
                                }}
                            >
                                <div style={{
                                    width: 22, height: 22, borderRadius: '50%',
                                    background: '#fff', position: 'absolute' as const,
                                    top: 3, left: isPremium ? 27 : 3,
                                    transition: 'left 200ms',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </button>
                        </div>
                    </div>

                    {/* ── 토글 ON 시 세부 설정 ── */}
                    {isPremium && (<>
                    {/* 구독료 슬라이더 */}
                    <div style={styles.card}>
                        <div style={styles.field}>
                            <label style={{ ...styles.label, fontSize: 15 }}>💰 월 구독료</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
                                <input
                                    type="range"
                                    min={1000}
                                    max={99000}
                                    step={100}
                                    value={monthlyPrice}
                                    onChange={e => {
                                        setMonthlyPrice(Number(e.target.value))
                                    }}
                                    onMouseUp={() => debounceSavePremium({ monthlyPrice })}
                                    onTouchEnd={() => debounceSavePremium({ monthlyPrice })}
                                    className="premium-range-slider"
                                    style={{
                                        flex: 1, cursor: 'pointer',
                                        accentColor: '#22c55e',
                                    }}
                                />
                                <div style={{
                                    minWidth: 90, textAlign: 'right' as const,
                                    fontSize: 20, fontWeight: 800, color: '#18181b',
                                }}>
                                    ₩{monthlyPrice.toLocaleString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                {[3900, 9900, 19900].map(price => (
                                    <button
                                        key={price}
                                        onClick={() => {
                                            setMonthlyPrice(price)
                                            debounceSavePremium({ monthlyPrice: price })
                                        }}
                                        style={{
                                            flex: 1, padding: '8px 0', borderRadius: 8,
                                            border: monthlyPrice === price ? '2px solid #22c55e' : '1px solid #e5e7eb',
                                            background: monthlyPrice === price ? '#f0fdf4' : '#fff',
                                            color: monthlyPrice === price ? '#16a34a' : '#6b7280',
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                            transition: 'all 150ms',
                                        }}
                                    >
                                        ₩{price.toLocaleString()}
                                        {price === 9900 && <span style={{ fontSize: 10, display: 'block', color: '#22c55e' }}>인기</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 수익 시뮬레이션 */}
                    <div style={{
                        ...styles.card,
                        background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
                        border: '1px solid #bbf7d0',
                    }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', marginBottom: 12 }}>📊 예상 수익 시뮬레이션</div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {[10, 50, 100].map(subs => (
                                <div key={subs} style={{
                                    flex: 1, textAlign: 'center' as const,
                                    padding: '12px 8px', borderRadius: 10,
                                    background: '#fff', border: '1px solid #d1fae5',
                                }}>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>구독자 {subs}명</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
                                        ₩{Math.floor(monthlyPrice * subs * 0.8).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>수수료 20% 제외</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 무료 체험 설정 */}
                    <div style={styles.card}>
                        <label style={{ ...styles.label, fontSize: 15 }}>🎁 무료 체험 설정</label>
                        <p style={styles.hint}>유료 전환 전, 무료로 체험할 수 있는 범위를 정합니다</p>
                        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' }}>무료 대화 횟수</label>
                                <select
                                    value={freeTrialChats}
                                    onChange={e => {
                                        const v = Number(e.target.value)
                                        setFreeTrialChats(v)
                                        debounceSavePremium({ freeTrialChats: v })
                                    }}
                                    style={{ ...styles.input, width: '100%' }}
                                >
                                    {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}회</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' }}>무료 체험 기간</label>
                                <select
                                    value={freeTrialDays}
                                    onChange={e => {
                                        const v = Number(e.target.value)
                                        setFreeTrialDays(v)
                                        debounceSavePremium({ freeTrialDays: v })
                                    }}
                                    style={{ ...styles.input, width: '100%' }}
                                >
                                    {[3, 7, 14, 30].map(n => <option key={n} value={n}>{n}일</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    </>)}

                    {/* ── 커스텀 URL ── */}
                    <div style={styles.card}>
                        <div style={styles.field}>
                            <label style={{ ...styles.label, fontSize: 15 }}>🔗 커스텀 URL</label>
                            <p style={styles.hint}>이 AI만의 고유 링크를 설정하세요</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8 }}>
                                <span style={{
                                    padding: '10px 12px', background: '#f3f4f6', borderRadius: '10px 0 0 10px',
                                    border: '1px solid #e5e7eb', borderRight: 'none',
                                    fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' as const,
                                }}>curi-ai.com/</span>
                                <input
                                    type="text"
                                    value={mentorHandle}
                                    onChange={e => {
                                        const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                                        setMentorHandle(v)
                                        setHandleError(null)
                                    }}
                                    onBlur={() => {
                                        if (mentorHandle) debounceSavePremium({ handle: mentorHandle })
                                    }}
                                    placeholder="my-ai-name"
                                    style={{
                                        ...styles.input,
                                        borderRadius: '0 10px 10px 0',
                                        flex: 1,
                                        borderColor: handleError ? '#ef4444' : '#e5e7eb',
                                    }}
                                />
                            </div>
                            {handleError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{handleError}</div>}
                            {mentorHandle && !handleError && (
                                <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>✓ curi-ai.com/{mentorHandle}</div>
                            )}
                        </div>
                    </div>

                    {/* 베타 안내 */}
                    <div style={{
                        padding: '12px 16px', borderRadius: 10,
                        background: '#fef3c7', border: '1px solid #fcd34d',
                        fontSize: 13, color: '#92400e',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <span>⚠️</span>
                        <span>현재 베타 테스트 중입니다. 유료 전환은 정식 출시 시 활성화됩니다.</span>
                    </div>

                    {premiumSaving && (
                        <div style={{ textAlign: 'center' as const, fontSize: 12, color: '#9ca3af', marginTop: 4 }}>자동 저장 중...</div>
                    )}
                    </>)}

                    {/* ── 저장 버튼 ── */}
                    <div style={{ paddingBottom: 20 }}>
                        <button
                            style={{
                                ...styles.saveBtn,
                                opacity: saving ? 0.6 : 1,
                            }}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? '저장 중...' : '💾 변경사항 저장'}
                        </button>
                    </div>
                </div>

                    {/* ══════ 우측: 미리보기 채팅 ══════ */}
                    <div className="creator-preview-col" style={{
                        flex: '1 1 0',
                        borderLeft: '1px solid #e5e7eb',
                        background: previewDevice !== 'desktop' ? '#f0f0f0' : '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100dvh',
                        position: 'sticky',
                        top: 0,
                        transition: 'background 0.2s',
                    }}>
                        {/* 미리보기 헤더: 디바이스 전환 버튼 */}
                        <div style={{
                            padding: '10px 20px',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#fff',
                        }}>
                            <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
                                {(['desktop', 'tablet', 'mobile'] as const).map(device => (
                                    <button
                                        key={device}
                                        onClick={() => setPreviewDevice(device)}
                                        title={device === 'desktop' ? 'PC' : device === 'tablet' ? '태블릿' : '모바일'}
                                        style={{
                                            padding: '6px 10px', borderRadius: 6, border: 'none',
                                            background: previewDevice === device ? '#fff' : 'transparent',
                                            boxShadow: previewDevice === device ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.15s',
                                            color: previewDevice === device ? '#18181b' : '#9ca3af',
                                            fontSize: 16,
                                        }}
                                    >
                                        {device === 'desktop' ? '🖥️' : device === 'tablet' ? '📱' : '📲'}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 12, color: '#9ca3af' }}>미리보기</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#16a34a' : '#9ca3af' }}>{isActive ? '배포 ON' : '배포 OFF'}</span>
                                {/* 활성화 토글 */}
                                <div
                                    onClick={async () => {
                                        const newVal = !isActive
                                        setIsActive(newVal)
                                        try {
                                            await fetch('/api/creator/mentor/update', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ mentorId, isActive: newVal }),
                                            })
                                            setToast({ type: 'success', message: newVal ? '✅ 배포 ON — 큐리AI에 공개됩니다' : '⏸️ 배포 OFF — 비공개 상태입니다' })
                                        } catch {
                                            setIsActive(!newVal) // 롤백
                                            setToast({ type: 'error', message: '상태 변경 실패' })
                                        }
                                    }}
                                    title={isActive ? '활성화됨 — 멘토 목록에 노출' : '비활성화 — 멘토 목록에서 숨김'}
                                    style={{
                                        width: 44, height: 24, borderRadius: 12,
                                        background: isActive ? '#22c55e' : '#d1d5db',
                                        cursor: 'pointer', transition: 'background 0.2s',
                                        display: 'flex', alignItems: 'center', padding: '0 3px',
                                        flexShrink: 0,
                                    }}
                                >
                                    <div style={{
                                        width: 18, height: 18, borderRadius: '50%',
                                        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                        transition: 'transform 0.2s',
                                        transform: isActive ? 'translateX(20px)' : 'translateX(0)',
                                    }} />
                                </div>
                            </div>
                        </div>

                        {/* 디바이스 프레임 외부 래퍼 */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            padding: previewDevice !== 'desktop' ? '20px 16px' : 0,
                        }}>
                            {/* 디바이스 프레임 */}
                            <div style={{
                                width: previewDevice === 'mobile' ? 375 : previewDevice === 'tablet' ? 768 : '100%',
                                maxWidth: '100%',
                                background: '#fff',
                                borderRadius: previewDevice !== 'desktop' ? 16 : 0,
                                boxShadow: previewDevice !== 'desktop' ? '0 4px 24px rgba(0,0,0,0.12)' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                transition: 'width 0.3s ease, border-radius 0.3s ease',
                                height: '100%',
                            }}>
                                {/* 채팅 스크롤 영역 */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '20px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12,
                                }}>
                                    {/* AI 프로필 카드 */}
                                    <div style={{
                                        textAlign: 'center' as const,
                                        padding: '16px 12px',
                                        borderRadius: 16,
                                        background: '#f9fafb',
                                        marginBottom: 8,
                                    }}>
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%',
                                            background: avatarPreview ? 'transparent' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 24, fontWeight: 700,
                                            margin: '0 auto 8px',
                                            overflow: 'hidden',
                                        }}>
                                            {avatarPreview ? (
                                                <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                name ? name[0] : '🤖'
                                            )}
                                        </div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                                            {name || 'AI 이름'}
                                        </div>
                                        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                                            {title || '한줄 소개'}
                                        </div>
                                    </div>

                                    {/* 인사말 */}
                                    {previewMessages.length === 0 && (
                                        <>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                                    background: avatarPreview ? 'transparent' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 14, fontWeight: 700, overflow: 'hidden',
                                                    marginTop: 2,
                                                }}>
                                                    {avatarPreview ? (
                                                        <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (name ? name[0] : '🤖')}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{name || 'AI'}</div>
                                                    <div style={{
                                                        padding: '4px 0', fontSize: 14, color: '#1e293b',
                                                        lineHeight: 1.7,
                                                    }}>
                                                        {effectiveGreeting}
                                                    </div>
                                                </div>
                                            </div>

                                            {sampleQArr.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 40 }}>
                                                    {sampleQArr.map((q, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => handlePreviewSend(q)}
                                                            style={{
                                                                padding: '8px 14px', borderRadius: 20,
                                                                border: '1px solid #d1fae5', background: '#ecfdf5',
                                                                color: '#065f46', fontSize: 13, cursor: 'pointer',
                                                                transition: 'all 0.15s',
                                                            }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#d1fae5' }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ecfdf5' }}
                                                        >
                                                            {q}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* 대화 메시지 */}
                                    {previewMessages.map((m, i) => (
                                        <div key={i} style={{
                                            display: 'flex',
                                            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                                            alignItems: 'flex-start',
                                            gap: 10,
                                        }}>
                                            {m.role === 'assistant' && (
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 14, fontWeight: 700, overflow: 'hidden',
                                                    marginTop: 2,
                                                }}>
                                                    {avatarPreview ? (
                                                        <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (name ? name[0] : '🤖')}
                                                </div>
                                            )}
                                            <div style={{
                                                display: 'flex', flexDirection: 'column',
                                                maxWidth: m.role === 'user' ? '75%' : '80%',
                                            }}>
                                                {m.role === 'assistant' && (
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{name || 'AI'}</div>
                                                )}
                                                <div style={{
                                                    ...(m.role === 'user' ? {
                                                        padding: '12px 18px',
                                                        borderRadius: '20px 20px 6px 20px',
                                                        background: '#22c55e',
                                                        color: '#fff',
                                                        fontSize: 14,
                                                        lineHeight: 1.7,
                                                    } : {
                                                        padding: '4px 0',
                                                        color: '#1e293b',
                                                        fontSize: 14,
                                                        lineHeight: 1.7,
                                                    }),
                                                }}>
                                                {!m.content && previewLoading && i === previewMessages.length - 1 ? (
                                                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
                                                        {[0, 1, 2].map(d => (
                                                            <span key={d} style={{
                                                                width: 7, height: 7, borderRadius: '50%',
                                                                background: '#94a3b8',
                                                                animation: `previewDot 1.4s ease-in-out ${d * 0.2}s infinite`,
                                                            }} />
                                                        ))}
                                                    </span>
                                                ) : m.role === 'user' ? (
                                                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                                                ) : (
                                                    <div className="preview-markdown">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                                            p: ({ children }) => <p style={{ margin: '0 0 8px 0', lineHeight: 1.7 }}>{children}</p>,
                                                            strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#1e293b' }}>{children}</strong>,
                                                            ul: ({ children }) => <ul style={{ margin: '4px 0 8px 0', paddingLeft: 18 }}>{children}</ul>,
                                                            ol: ({ children }) => <ol style={{ margin: '4px 0 8px 0', paddingLeft: 18 }}>{children}</ol>,
                                                            li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.6 }}>{children}</li>,
                                                            code: ({ children, className }) => {
                                                                const isInline = !className
                                                                return isInline ? (
                                                                    <code style={{ background: '#e5e7eb', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em' }}>{children}</code>
                                                                ) : (
                                                                    <code style={{ display: 'block', background: '#f8fafc', border: '1px solid #e2e8f0', padding: 10, borderRadius: 8, fontSize: '0.85em', overflowX: 'auto', margin: '6px 0' }}>{children}</code>
                                                                )
                                                            },
                                                            blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #22c55e', paddingLeft: 12, margin: '6px 0', color: '#64748b' }}>{children}</blockquote>,
                                                        }}>
                                                            {m.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={previewEndRef} />
                                </div>

                                {/* 입력창 */}
                                <div style={{
                                    padding: '12px 16px',
                                    borderTop: '1px solid #f0f0f0',
                                    display: 'flex',
                                    gap: 8,
                                }}>
                                    <input
                                        style={{
                                            flex: 1, padding: '10px 14px',
                                            borderRadius: 24, border: '1px solid #e5e7eb',
                                            background: '#fafafa', fontSize: 14, outline: 'none',
                                        }}
                                        placeholder="메시지를 입력하세요..."
                                        value={previewInput}
                                        onChange={e => setPreviewInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePreviewSend() } }}
                                        disabled={previewLoading}
                                    />
                                    <button
                                        onClick={() => handlePreviewSend()}
                                        disabled={previewLoading || !previewInput.trim()}
                                        style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            border: 'none', background: '#22c55e', color: '#fff',
                                            fontSize: 18, cursor: 'pointer',
                                            opacity: previewLoading || !previewInput.trim() ? 0.5 : 1,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'opacity 0.15s',
                                        }}
                                    >↑</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/* 토스트 */}
            {toast && (
                <div
                    style={{
                        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                        zIndex: 9999, padding: '14px 28px', borderRadius: 14,
                        fontSize: 15, fontWeight: 600,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        animation: 'slideDown 0.3s ease',
                        ...(toast.type === 'success'
                            ? { background: '#22c55e', color: '#fff' }
                            : { background: '#ef4444', color: '#fff' }),
                    }}
                    onClick={() => setToast(null)}
                >
                    {toast.message}
                </div>
            )}

            {/* 파일 내용 미리보기 모달 */}
            {previewSource && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20, animation: 'fadeIn 0.2s ease',
                    }}
                    onClick={() => setPreviewSource(null)}
                >
                    <div
                        style={{
                            background: '#fff', borderRadius: 20,
                            maxWidth: 700, width: '100%',
                            maxHeight: '80dvh', overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                            display: 'flex', flexDirection: 'column' as const,
                            animation: 'scaleIn 0.2s ease',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                                    📄 파일에서 읽어온 내용
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                    {previewSource.title}
                                </p>
                            </div>
                            <button
                                onClick={() => setPreviewSource(null)}
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    border: 'none', background: '#f3f4f6',
                                    fontSize: 16, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >✕</button>
                        </div>
                        <div style={{ padding: '16px 20px', overflowY: 'auto' as const, flex: 1 }}>
                            {/* 탭 전환 */}
                            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
                                <button
                                    onClick={() => setPreviewTab('text')}
                                    style={{
                                        flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                                        background: previewTab === 'text' ? '#fff' : 'transparent',
                                        boxShadow: previewTab === 'text' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        color: previewTab === 'text' ? '#18181b' : '#9ca3af',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >📄 원본 텍스트</button>
                                <button
                                    onClick={() => setPreviewTab('summary')}
                                    style={{
                                        flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                                        background: previewTab === 'summary' ? '#fff' : 'transparent',
                                        boxShadow: previewTab === 'summary' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        color: previewTab === 'summary' ? '#18181b' : '#9ca3af',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >✨ AI 요약</button>
                            </div>

                            {/* 원본 텍스트 탭 */}
                            {previewTab === 'text' && (
                            <div style={{ background: '#f9fafb', borderRadius: 12, padding: 16, border: '1px solid #f0f0f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, color: '#6b7280',
                                        background: '#e5e7eb', padding: '2px 8px', borderRadius: 6,
                                    }}>
                                        📄 전체 글자수: {previewSource.content.length.toLocaleString()}자
                                    </span>
                                    {previewSource.content.length > 5000 && (
                                        <span style={{ fontSize: 11, color: '#d97706', fontWeight: 500 }}>
                                            앞부분 5,000자만 보여드려요 (AI는 전체를 참고해요)
                                        </span>
                                    )}
                                    {previewSource.content.length <= 5000 && (
                                        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
                                            ✅ 전체 내용 표시
                                        </span>
                                    )}
                                </div>
                                <pre style={{
                                    margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                                    fontFamily: 'var(--font-noto-sans-kr), Pretendard, monospace',
                                    fontSize: 13, lineHeight: 1.7, color: '#374151',
                                }}>
                                    {previewSource.content.length > 5000
                                        ? previewSource.content.slice(0, 5000) + '\n\n--- ✂️ 여기까지만 보여드려요 (전체 ' + previewSource.content.length.toLocaleString() + '자) ---'
                                        : previewSource.content}
                                </pre>
                            </div>
                            )}

                            {/* AI 요약 탭 */}
                            {previewTab === 'summary' && (
                                <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfeff)', borderRadius: 14, padding: 20, border: '1px solid #d1fae5' }}>
                                    {summaryLoading ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
                                            <div style={{ width: 32, height: 32, border: '3px solid #d1fae5', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                            <div style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>큐리 AI가 분석중...</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>파일 내용을 요약하고 있어요</div>
                                        </div>
                                    ) : previewSource.summary ? (
                                        <div style={{ fontSize: 14, lineHeight: 2, color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                                            {previewSource.summary.replace(/\*\*/g, '')}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>
                                            <div style={{ fontSize: 14 }}>요약을 생성할 수 없습니다</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setPreviewSource(null)}
                                style={{
                                    padding: '8px 20px', borderRadius: 10,
                                    border: 'none', background: '#22c55e', color: '#fff',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                }}
                            >닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 반응형 CSS */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes previewDot {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                }
                .preview-markdown p:last-child { margin-bottom: 0 !important; }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @media (max-width: 1023px) {
                    .creator-preview-col {
                        display: none !important;
                    }
                    .creator-form-col {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                }
                /* 구독료 슬라이더 — 모바일 터치 영역 확대 */
                .premium-range-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    height: 8px;
                    border-radius: 4px;
                    background: linear-gradient(to right, #22c55e, #16a34a);
                    outline: none;
                }
                .premium-range-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #22c55e;
                    cursor: pointer;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    border: 3px solid #fff;
                }
                .premium-range-slider::-moz-range-thumb {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #22c55e;
                    cursor: pointer;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    border: 3px solid #fff;
                }
                @media (max-width: 768px) {
                    .premium-range-slider {
                        height: 12px;
                        border-radius: 6px;
                    }
                    .premium-range-slider::-webkit-slider-thumb {
                        width: 36px;
                        height: 36px;
                    }
                    .premium-range-slider::-moz-range-thumb {
                        width: 36px;
                        height: 36px;
                    }
                }
            `}</style>
        </div>
    )
}


const styles: Record<string, React.CSSProperties> = {
    card: {
        background: '#fff',
        borderRadius: 16,
        padding: '18px 16px',
        border: '1px solid #f0f0f0',
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    label: {
        fontSize: 14,
        fontWeight: 600,
        color: '#374151',
    },
    hint: {
        fontSize: 12,
        color: '#9ca3af',
        margin: '0 0 4px',
    },
    input: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fafafa',
        color: '#18181b',
        fontSize: 15,
        outline: 'none',
        boxSizing: 'border-box',
    },
    textarea: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fafafa',
        color: '#18181b',
        fontSize: 15,
        outline: 'none',
        resize: 'vertical',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    },
    backBtn: {
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fff',
        color: '#6b7280',
        fontSize: 16,
        cursor: 'pointer',
    },
    saveBtn: {
        width: '100%',
        padding: '16px 24px',
        borderRadius: 14,
        border: 'none',
        background: '#22c55e',
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        boxShadow: '0 2px 12px rgba(34,197,94,0.3)',
    },
    emptyState: {
        textAlign: 'center',
        padding: '80px 20px',
        color: '#6b7280',
        fontSize: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
    },
}

