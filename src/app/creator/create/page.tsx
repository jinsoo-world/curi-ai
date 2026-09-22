'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import AppSidebar from '@/components/AppSidebar'
import { createClient } from '@/lib/supabase/client'
import { 올릴수있는파일, 고르기필터 } from '@/domains/knowledge/files'

interface UploadedFile {
    id: string
    fileName: string
    fileSize: number
    status: 'uploading' | 'processing' | 'completed' | 'failed'
    content?: string
}

type Step = 'basic' | 'personality' | 'greeting' | 'knowledge' | 'advanced'

export default function CreatorCreatePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [toast, setToast] = useState<string | null>(null)
    const [currentStep, setCurrentStep] = useState<Step>('basic')

    // 기본 정보
    const [name, setName] = useState('')
    const [title, setTitle] = useState('')
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

    // 새 필드
    const [category, setCategory] = useState<string | null>(null)
    const [expertise, setExpertise] = useState<string[]>([])
    const [personaTemplate, setPersonaTemplate] = useState<string | null>(null)
    const [organization, setOrganization] = useState('')

    // AI 성격 → 에이전트 프롬프트
    const [systemPrompt, setSystemPrompt] = useState('')

    // 인사말 / 예시 질문
    const [greetingMessage, setGreetingMessage] = useState('')
    const [sampleQuestions, setSampleQuestions] = useState('')

    // 지식 (선택)
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
    const [previewSource, setPreviewSource] = useState<{ title: string; content: string; summary?: string; sourceId?: string } | null>(null)
    const [previewTab, setPreviewTab] = useState<'summary' | 'text'>('text')
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)
    const [mentorIdForUpload, setMentorIdForUpload] = useState<string | null>(null)

    // 미리보기 디바이스 모드
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

    // 프리미엄 탭 상태 (로컬 — 생성 시 함께 저장)
    const [isPremium, setIsPremium] = useState(false)
    const [monthlyPrice, setMonthlyPrice] = useState(9900)
    const [freeTrialChats, setFreeTrialChats] = useState(3)
    const [freeTrialDays, setFreeTrialDays] = useState(7)
    const [customHandle, setCustomHandle] = useState('')

    // 음성 클로닝
    const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null)
    const [voiceSamplePreviewUrl, setVoiceSamplePreviewUrl] = useState<string | null>(null)
    const [voiceSampleUploading, setVoiceSampleUploading] = useState(false)
    const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null)
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
                const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' })

                setVoiceSampleFile(file)
                const url = URL.createObjectURL(blob)
                setVoiceSamplePreviewUrl(url)
            }

            mediaRecorder.start()
            setIsRecording(true)
            setRecordingSeconds(0)

            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(prev => prev + 1)
            }, 1000)
        } catch (err) {
            setError('마이크 접근 권한이 필요합니다.')
        }
    }, [])

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current)
                recordingTimerRef.current = null
            }
        }
    }, [isRecording])

    const handleVoiceSampleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const maxSize = 10 * 1024 * 1024
        if (file.size > maxSize) {
            setError('음성 파일은 10MB 이하만 업로드 가능합니다.')
            return
        }

        setVoiceSampleFile(file)

        const url = URL.createObjectURL(file)
        setVoiceSamplePreviewUrl(url)
    }, [])

    const uploadVoiceSample = useCallback(async () => {
        if (!voiceSampleFile || !mentorIdForUpload) {
            setError('먼저 AI를 생성해야 음성을 업로드할 수 있습니다.')
            return
        }

        setVoiceSampleUploading(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('file', voiceSampleFile)
            formData.append('mentorId', mentorIdForUpload)

            const res = await fetch('/api/creator/voice/upload', {
                method: 'POST',
                body: formData,
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '음성 업로드 실패')

            setVoiceSampleUrl(data.voiceUrl)
            setToast('✅ 음성 샘플이 업로드되었습니다!')
            setTimeout(() => setToast(null), 3000)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '음성 업로드 중 오류가 발생했습니다.')
        } finally {
            setVoiceSampleUploading(false)
        }
    }, [voiceSampleFile, mentorIdForUpload])

    const testVoice = useCallback(async () => {
        if (!voiceSampleUrl || !mentorIdForUpload) {
            setError('먼저 음성 샘플을 업로드해주세요.')
            return
        }

        setVoiceTestLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/creator/voice/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mentorId: mentorIdForUpload,
                    text: '안녕하세요! 저는 AI입니다. 이렇게 말하는 것이 자연스러운가요?',
                }),
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '음성 테스트 실패')

            setVoiceTestAudioUrl(data.audioUrl)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '음성 테스트 중 오류가 발생했습니다.')
        } finally {
            setVoiceTestLoading(false)
        }
    }, [voiceSampleUrl, mentorIdForUpload])

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const maxSize = 7 * 1024 * 1024
        if (file.size > maxSize) {
            setError('프로필 사진은 7MB 이하만 업로드 가능합니다.')
            return
        }

        setAvatarFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setAvatarPreview(reader.result as string)
        reader.readAsDataURL(file)
    }

    async function handleSubmit() {
        if (!name.trim() || !title.trim()) {
            setError('AI 이름과 한줄 소개는 필수입니다.')
            return
        }

        setLoading(true)
        setError(null)

        try {
            // Step 1: 기본 정보
            const step1Res = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 1,
                    name: name.trim(),
                    title: title.trim(),
                    description: '',
                    expertise: expertise.filter(Boolean),
                    category: category || undefined,
                    organization: organization.trim() || undefined,
                }),
            })

            const step1Data = await step1Res.json()
            if (!step1Res.ok) throw new Error(step1Data.error)

            const mentorId = step1Data.mentor.id
            setMentorIdForUpload(mentorId)

            // Step 2: 프롬프트 / 인사말
            const step2Res = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 2,
                    mentorId,
                    mentorName: name.trim(),
                    systemPrompt: systemPrompt.trim() || undefined,
                    greetingMessage: greetingMessage.trim() || `안녕하세요! ${name}입니다 😊 무엇이 궁금하세요?`,
                    sampleQuestions: sampleQuestions.split('\n').map(s => s.trim()).filter(Boolean),
                }),
            })

            const step2Data = await step2Res.json()
            if (!step2Res.ok) throw new Error(step2Data.error)

            // Step 3: 프로필 사진 업로드
            if (avatarFile) {
                const formData = new FormData()
                formData.append('file', avatarFile)
                formData.append('mentorId', mentorId)

                const avatarRes = await fetch('/api/creator/avatar', {
                    method: 'POST',
                    body: formData,
                })

                if (!avatarRes.ok) {
                    const avatarError = await avatarRes.json()
                    throw new Error(avatarError.error || '프로필 사진 업로드 실패')
                }
            }

            // Step 4: 프리미엄 / 커스텀 핸들 (선택)
            if (isPremium || customHandle.trim()) {
                await fetch('/api/creator/mentor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 3,
                        mentorId,
                        isPremium,
                        monthlyPrice: isPremium ? monthlyPrice : undefined,
                        freeTrialChats: isPremium ? freeTrialChats : undefined,
                        freeTrialDays: isPremium ? freeTrialDays : undefined,
                        customHandle: customHandle.trim() || undefined,
                    }),
                })
            }

            // Step 5: 음성 샘플 업로드 (있으면)
            if (voiceSampleFile && !voiceSampleUrl) {
                await uploadVoiceSample()
            }

            setToast('✅ AI 생성 완료!')
            setTimeout(() => {
                router.push('/creator/manage')
            }, 1500)

        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'AI 생성에 실패했습니다.')
        } finally {
            setLoading(false)
        }
    }

    async function handleFileUpload(fileList: FileList | null) {
        if (!fileList || fileList.length === 0) return

        const mid = mentorIdForUpload
        if (!mid) {
            setError('파일을 업로드하려면 먼저 기본 정보를 저장해야 합니다.')
            return
        }

        const newFilesArr = Array.from(fileList)
        if (uploadedFiles.length + newFilesArr.length > 10) {
            setError('최대 10개 파일까지만 업로드할 수 있습니다.')
            return
        }

        const totalSize = [...uploadedFiles, ...newFilesArr].reduce((sum, f) => sum + ('size' in f ? f.size : f.fileSize), 0)
        if (totalSize > 50 * 1024 * 1024) {
            setError('전체 파일 크기가 50MB를 초과할 수 없습니다.')
            return
        }

        setUploading(true)
        setError(null)

        const allowedExtensions = 올릴수있는파일.map(ext => ext.slice(1))

        try {
            for (const file of newFilesArr) {
                const ext = file.name.split('.').pop()?.toLowerCase() || ''
                if (!allowedExtensions.includes(ext)) {
                    setError(`지원하지 않는 형식: ${file.name}`)
                    continue
                }

                const urlRes = await fetch('/api/creator/knowledge/upload-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mentorId: mid,
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                    }),
                })
                let urlData
                try {
                    urlData = await urlRes.json()
                } catch {
                    throw new Error(`업로드 준비 실패 (${urlRes.status}): 서버 응답을 처리할 수 없습니다.`)
                }
                if (!urlRes.ok) throw new Error(urlData.error)

                const sourceId = urlData.source.id

                const uploadRes = await fetch(urlData.signedUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file,
                })

                if (!uploadRes.ok) {
                    throw new Error(`파일 업로드 실패: ${file.name}`)
                }

                setUploadedFiles(prev => [...prev, {
                    id: sourceId,
                    fileName: urlData.source.fileName,
                    fileSize: urlData.source.fileSize,
                    status: 'processing' as const,
                }])

                fetch('/api/creator/knowledge/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceId,
                        mentorId: mid,
                    }),
                }).then(async (r) => {
                    const result = await r.json()
                    if (r.ok) {
                        setUploadedFiles(prev => prev.map(f => f.id === sourceId ? { ...f, status: 'completed' as const } : f))
                        setToast(`✅ ${file.name} — AI 학습 완료!`)
                    } else {
                        setUploadedFiles(prev => prev.map(f => f.id === sourceId ? { ...f, status: 'failed' as const } : f))
                        setToast(`⚠️ ${file.name} 처리 실패: ${result.error}`)
                    }
                    setTimeout(() => setToast(null), 4000)
                }).catch(() => {
                    setUploadedFiles(prev => prev.map(f => f.id === sourceId ? { ...f, status: 'failed' as const } : f))
                })
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '업로드 실패')
        }
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    }

    const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [previewInput, setPreviewInput] = useState('')
    const [previewLoading, setPreviewLoading] = useState(false)
    const previewEndRef = useRef<HTMLDivElement>(null)

    async function handlePreviewSend(msg?: string) {
        const text = msg || previewInput.trim()
        if (!text || previewLoading) return

        let mid = mentorIdForUpload
        if (!mid) {
            if (!name.trim() || !title.trim()) {
                setError('미리보기를 사용하려면 먼저 AI 이름과 소개를 입력해주세요.')
                return
            }
            try {
                const draftRes = await fetch('/api/creator/mentor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 1,
                        name: name.trim(),
                        title: title.trim(),
                        description: '',
                        expertise: [],
                    }),
                })
                const draftData = await draftRes.json()
                if (!draftRes.ok) throw new Error(draftData.error)
                mid = draftData.mentor.id
                setMentorIdForUpload(mid)

                if (systemPrompt.trim()) {
                    await fetch('/api/creator/mentor', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            step: 2,
                            mentorId: mid,
                            mentorName: name,
                            systemPrompt: systemPrompt.trim(),
                            greetingMessage: greetingMessage.trim() || `안녕하세요! ${name}입니다 😊 무엇이 궁금하세요?`,
                            sampleQuestions: sampleQuestions.split('\n').map(s => s.trim()).filter(Boolean),
                        }),
                    })
                }
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Draft 멘토 생성에 실패했습니다.')
                return
            }
        }

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
                    mentorId: mid,
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

    const steps: { key: Step; label: string; icon: string }[] = [
        { key: 'basic', label: '기본정보', icon: '📝' },
        { key: 'personality', label: '성격·프롬프트', icon: '🎭' },
        { key: 'greeting', label: '인사·예시질문', icon: '💬' },
        { key: 'knowledge', label: '지식파일', icon: '📚' },
        { key: 'advanced', label: '고급설정', icon: '⚙️' },
    ]

    const canProceed = (step: Step): boolean => {
        if (step === 'basic') return name.trim().length > 0 && title.trim().length > 0
        if (step === 'personality') return true
        if (step === 'greeting') return true
        if (step === 'knowledge') return true
        if (step === 'advanced') return true
        return false
    }

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />

            <div className="sidebar-content" style={{ minHeight: '100dvh', paddingTop: 24, paddingBottom: 80 }}>
                {/* Header */}
                <div style={{
                    maxWidth: 960,
                    margin: '0 auto',
                    padding: '0 20px 32px',
                    borderBottom: '1px solid var(--선)',
                }}>
                    <h1 style={{
                        fontSize: 32,
                        fontWeight: 800,
                        color: 'var(--먹)',
                        marginBottom: 8,
                    }}>
                        AI 만들기
                    </h1>
                    <p style={{
                        fontSize: 16,
                        color: 'var(--먹연)',
                        lineHeight: 1.6,
                    }}>
                        나만의 AI를 만들어보세요. 단계별로 설정하면 완성됩니다.
                    </p>
                </div>

                {/* Step Progress */}
                <div style={{
                    maxWidth: 960,
                    margin: '32px auto 0',
                    padding: '0 20px',
                }}>
                    <div style={{
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        scrollbarWidth: 'none',
                        paddingBottom: 12,
                    }}>
                        {steps.map((step, idx) => {
                            const isActive = step.key === currentStep
                            const isPast = steps.findIndex(s => s.key === currentStep) > idx
                            return (
                                <button
                                    key={step.key}
                                    onClick={() => setCurrentStep(step.key)}
                                    style={{
                                        flex: '0 0 auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '12px 20px',
                                        borderRadius: 12,
                                        border: isActive ? '2px solid #FF6B35' : '1px solid var(--선)',
                                        background: isActive ? '#FFF4F0' : isPast ? '#F0FDF4' : '#FFFFFF',
                                        color: isActive ? '#FF6B35' : isPast ? '#16A34A' : 'var(--먹연)',
                                        fontSize: 15,
                                        fontWeight: isActive ? 700 : 600,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <span style={{ fontSize: 20 }}>{step.icon}</span>
                                    <span>{step.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Error Toast */}
                {error && (
                    <div style={{
                        maxWidth: 960,
                        margin: '16px auto 0',
                        padding: '0 20px',
                    }}>
                        <div style={{
                            padding: '16px 20px',
                            background: '#FEE2E2',
                            border: '1px solid #DC2626',
                            borderRadius: 12,
                            color: '#DC2626',
                            fontSize: 15,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <span>{error}</span>
                            <button
                                onClick={() => setError(null)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#DC2626',
                                    fontSize: 18,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* Success Toast */}
                {toast && (
                    <div style={{
                        position: 'fixed',
                        bottom: 100,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '16px 24px',
                        background: '#16A34A',
                        color: '#FFFFFF',
                        borderRadius: 12,
                        fontSize: 15,
                        fontWeight: 700,
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                        zIndex: 1000,
                    }}>
                        {toast}
                    </div>
                )}

                {/* Step Content */}
                <div style={{
                    maxWidth: 960,
                    margin: '32px auto 0',
                    padding: '0 20px',
                }}>
                    {/* Step 1: Basic Info */}
                    {currentStep === 'basic' && (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 20,
                            padding: 40,
                        }}>
                            <h2 style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: 'var(--먹)',
                                marginBottom: 24,
                            }}>
                                📝 기본정보
                            </h2>

                            {/* Avatar */}
                            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                                <div
                                    onClick={() => avatarInputRef.current?.click()}
                                    style={{
                                        width: 120,
                                        height: 120,
                                        borderRadius: '50%',
                                        border: '3px dashed #D1D5DB',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        background: '#F9FAFB',
                                        transition: 'border-color 200ms',
                                    }}
                                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#FF6B35')}
                                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#D1D5DB')}
                                >
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#9CA3AF' }}>
                                            <div style={{ fontSize: 48 }}>📷</div>
                                            <div style={{ fontSize: 13, marginTop: 4 }}>프로필 사진</div>
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
                                <p style={{ fontSize: 13, color: 'var(--먹연)', marginTop: 12 }}>
                                    클릭하여 프로필 사진 업로드 (1:1 정방형 권장, 7MB 이내)
                                </p>
                            </div>

                            {/* Name */}
                            <div style={{ marginBottom: 24 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    AI 이름 *
                                </label>
                                <input
                                    type="text"
                                    placeholder="예: 커피마스터, 영어선생님"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    maxLength={20}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        fontSize: 16,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        outline: 'none',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#FF6B35'}
                                    onBlur={e => e.target.style.borderColor = 'var(--선)'}
                                />
                                <p style={{ fontSize: 13, color: 'var(--먹연)', marginTop: 6 }}>
                                    {name.length}/20
                                </p>
                            </div>

                            {/* Title */}
                            <div style={{ marginBottom: 24 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    한줄 소개 *
                                </label>
                                <input
                                    type="text"
                                    placeholder="예: 바리스타 경력 10년, 커피 로스팅 전문가"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    maxLength={50}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        fontSize: 16,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        outline: 'none',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#FF6B35'}
                                    onBlur={e => e.target.style.borderColor = 'var(--선)'}
                                />
                                <p style={{ fontSize: 13, color: 'var(--먹연)', marginTop: 6 }}>
                                    {title.length}/50
                                </p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
                                <button
                                    onClick={() => setCurrentStep('personality')}
                                    disabled={!canProceed('basic')}
                                    style={{
                                        padding: '14px 32px',
                                        background: canProceed('basic') ? '#FF6B35' : '#D1D5DB',
                                        color: '#FFFFFF',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: 'none',
                                        borderRadius: 12,
                                        cursor: canProceed('basic') ? 'pointer' : 'not-allowed',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => {
                                        if (canProceed('basic')) (e.target as HTMLElement).style.background = '#E8552C'
                                    }}
                                    onMouseLeave={e => {
                                        if (canProceed('basic')) (e.target as HTMLElement).style.background = '#FF6B35'
                                    }}
                                >
                                    다음 단계 →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Personality */}
                    {currentStep === 'personality' && (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 20,
                            padding: 40,
                        }}>
                            <h2 style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: 'var(--먹)',
                                marginBottom: 24,
                            }}>
                                🎭 AI 성격 및 프롬프트
                            </h2>

                            <div style={{ marginBottom: 24 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    에이전트 프롬프트
                                </label>
                                <p style={{
                                    fontSize: 14,
                                    color: 'var(--먹연)',
                                    marginBottom: 12,
                                    lineHeight: 1.6,
                                }}>
                                    AI의 성격, 말투, 전문성을 정의합니다. 비워두면 기본 설정이 적용됩니다.
                                </p>
                                <textarea
                                    placeholder="예: 당신은 마케팅 전문가입니다. 데이터 기반 분석과 실전 사례를 통해 조언합니다."
                                    value={systemPrompt}
                                    onChange={e => setSystemPrompt(e.target.value)}
                                    maxLength={10000}
                                    rows={10}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        fontSize: 15,
                                        fontFamily: 'monospace',
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        outline: 'none',
                                        resize: 'vertical',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#FF6B35'}
                                    onBlur={e => e.target.style.borderColor = 'var(--선)'}
                                />
                                <p style={{
                                    fontSize: 13,
                                    color: systemPrompt.length > 2700 ? '#F59E0B' : 'var(--먹연)',
                                    marginTop: 6,
                                    textAlign: 'right',
                                }}>
                                    {systemPrompt.length.toLocaleString()}/10,000
                                </p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32 }}>
                                <button
                                    onClick={() => setCurrentStep('basic')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FFFFFF',
                                        color: 'var(--먹)',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--샌드)'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FFFFFF'}
                                >
                                    ← 이전
                                </button>
                                <button
                                    onClick={() => setCurrentStep('greeting')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FF6B35',
                                        color: '#FFFFFF',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: 'none',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = '#E8552C'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FF6B35'}
                                >
                                    다음 단계 →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Greeting */}
                    {currentStep === 'greeting' && (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 20,
                            padding: 40,
                        }}>
                            <h2 style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: 'var(--먹)',
                                marginBottom: 24,
                            }}>
                                💬 인사말 및 예시 질문
                            </h2>

                            <div style={{ marginBottom: 24 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    인사말 (선택)
                                </label>
                                <input
                                    type="text"
                                    placeholder={`안녕하세요! ${name || 'AI'}입니다 😊`}
                                    value={greetingMessage}
                                    onChange={e => setGreetingMessage(e.target.value)}
                                    maxLength={200}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        fontSize: 16,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        outline: 'none',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#FF6B35'}
                                    onBlur={e => e.target.style.borderColor = 'var(--선)'}
                                />
                                <p style={{
                                    fontSize: 13,
                                    color: greetingMessage.length > 180 ? '#F59E0B' : 'var(--먹연)',
                                    marginTop: 6,
                                }}>
                                    {greetingMessage.length}/200
                                </p>
                            </div>

                            <div style={{ marginBottom: 24 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    예시 질문 (선택)
                                </label>
                                <p style={{
                                    fontSize: 14,
                                    color: 'var(--먹연)',
                                    marginBottom: 12,
                                    lineHeight: 1.6,
                                }}>
                                    줄바꿈으로 구분 — 대화 시작 시 추천 질문으로 표시됩니다
                                </p>
                                <textarea
                                    placeholder={"질문 1\n질문 2\n질문 3"}
                                    value={sampleQuestions}
                                    onChange={e => setSampleQuestions(e.target.value)}
                                    maxLength={300}
                                    rows={4}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        fontSize: 15,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        outline: 'none',
                                        resize: 'vertical',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#FF6B35'}
                                    onBlur={e => e.target.style.borderColor = 'var(--선)'}
                                />
                                <p style={{
                                    fontSize: 13,
                                    color: sampleQuestions.length > 270 ? '#F59E0B' : 'var(--먹연)',
                                    marginTop: 6,
                                    textAlign: 'right',
                                }}>
                                    {sampleQuestions.length}/300
                                </p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32 }}>
                                <button
                                    onClick={() => setCurrentStep('personality')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FFFFFF',
                                        color: 'var(--먹)',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--샌드)'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FFFFFF'}
                                >
                                    ← 이전
                                </button>
                                <button
                                    onClick={() => setCurrentStep('knowledge')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FF6B35',
                                        color: '#FFFFFF',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: 'none',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = '#E8552C'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FF6B35'}
                                >
                                    다음 단계 →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Knowledge */}
                    {currentStep === 'knowledge' && (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 20,
                            padding: 40,
                        }}>
                            <h2 style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: 'var(--먹)',
                                marginBottom: 24,
                            }}>
                                📚 지식 파일 추가
                            </h2>

                            <p style={{
                                fontSize: 14,
                                color: 'var(--먹연)',
                                marginBottom: 24,
                                lineHeight: 1.6,
                            }}>
                                AI가 참고할 문서를 업로드하세요. 선택사항이며, 나중에도 추가할 수 있습니다.
                            </p>

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => {
                                    e.preventDefault()
                                    setDragOver(false)
                                    handleFileUpload(e.dataTransfer.files)
                                }}
                                style={{
                                    padding: 48,
                                    border: dragOver ? '2px dashed #FF6B35' : '2px dashed var(--선)',
                                    borderRadius: 16,
                                    background: dragOver ? '#FFF4F0' : '#F9FAFB',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    transition: 'all 200ms',
                                }}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={고르기필터}
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={e => handleFileUpload(e.target.files)}
                                />
                                <div style={{ fontSize: 48, marginBottom: 12 }}>{uploading ? '⏳' : '📄'}</div>
                                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--먹)', marginBottom: 8 }}>
                                    {uploading ? '업로드 중...' : '클릭하거나 드래그하여 파일 추가'}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    justifyContent: 'center',
                                    gap: 8,
                                    marginTop: 16,
                                }}>
                                    {[
                                        { ext: 'HWP', color: '#2563EB', bg: '#DBEAFE' },
                                        { ext: 'PDF', color: '#DC2626', bg: '#FEE2E2' },
                                        { ext: 'PPT', color: '#EA580C', bg: '#FFEDD5' },
                                        { ext: 'DOCX', color: '#2563EB', bg: '#DBEAFE' },
                                        { ext: 'XLSX', color: '#15803D', bg: '#DCFCE7' },
                                        { ext: 'CSV', color: '#15803D', bg: '#DCFCE7' },
                                        { ext: 'TXT', color: '#6B7280', bg: '#F3F4F6' },
                                        { ext: 'VTT', color: '#7C3AED', bg: '#EDE9FE' },
                                    ].map(f => (
                                        <span key={f.ext} style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: f.color,
                                            background: f.bg,
                                            padding: '4px 10px',
                                            borderRadius: 6,
                                        }}>
                                            .{f.ext}
                                        </span>
                                    ))}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--먹연)', marginTop: 12 }}>
                                    최대 10개 · 합산 50MB
                                </div>
                            </div>

                            {uploadedFiles.length > 0 && (
                                <div style={{ marginTop: 24 }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--먹)', marginBottom: 12 }}>
                                        업로드된 파일 ({uploadedFiles.length})
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {uploadedFiles.map(file => (
                                            <div
                                                key={file.id}
                                                style={{
                                                    padding: '12px 16px',
                                                    background: '#F9FAFB',
                                                    border: '1px solid var(--선)',
                                                    borderRadius: 12,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--먹)', marginBottom: 4 }}>
                                                        {file.fileName}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--먹연)' }}>
                                                        {formatFileSize(file.fileSize)}
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    color: file.status === 'completed' ? '#16A34A' : file.status === 'failed' ? '#DC2626' : '#F59E0B',
                                                }}>
                                                    {file.status === 'completed' ? '✅ 완료' : file.status === 'failed' ? '❌ 실패' : '⏳ 처리중'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32 }}>
                                <button
                                    onClick={() => setCurrentStep('greeting')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FFFFFF',
                                        color: 'var(--먹)',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--샌드)'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FFFFFF'}
                                >
                                    ← 이전
                                </button>
                                <button
                                    onClick={() => setCurrentStep('advanced')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FF6B35',
                                        color: '#FFFFFF',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: 'none',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = '#E8552C'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FF6B35'}
                                >
                                    다음 단계 →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Advanced */}
                    {currentStep === 'advanced' && (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 20,
                            padding: 40,
                        }}>
                            <h2 style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: 'var(--먹)',
                                marginBottom: 24,
                            }}>
                                ⚙️ 고급 설정
                            </h2>

                            <p style={{
                                fontSize: 14,
                                color: 'var(--먹연)',
                                marginBottom: 24,
                                lineHeight: 1.6,
                            }}>
                                프리미엄 설정 및 음성 클로닝 등 고급 기능입니다. 선택사항입니다.
                            </p>

                            {/* Premium Toggle */}
                            <div style={{ marginBottom: 32, padding: 24, background: '#F9FAFB', borderRadius: 12 }}>
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    cursor: 'pointer',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isPremium}
                                        onChange={e => setIsPremium(e.target.checked)}
                                        style={{
                                            width: 20,
                                            height: 20,
                                            cursor: 'pointer',
                                        }}
                                    />
                                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--먹)' }}>
                                        프리미엄 AI로 설정
                                    </span>
                                </label>

                                {isPremium && (
                                    <div style={{ marginTop: 16, paddingLeft: 32 }}>
                                        <div style={{ marginBottom: 16 }}>
                                            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--먹)', marginBottom: 6, display: 'block' }}>
                                                월 구독료 (원)
                                            </label>
                                            <input
                                                type="number"
                                                value={monthlyPrice}
                                                onChange={e => setMonthlyPrice(parseInt(e.target.value) || 0)}
                                                min={0}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 14px',
                                                    fontSize: 15,
                                                    border: '1px solid var(--선)',
                                                    borderRadius: 8,
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                        <div style={{ marginBottom: 16 }}>
                                            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--먹)', marginBottom: 6, display: 'block' }}>
                                                무료 체험 대화 수
                                            </label>
                                            <input
                                                type="number"
                                                value={freeTrialChats}
                                                onChange={e => setFreeTrialChats(parseInt(e.target.value) || 0)}
                                                min={0}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 14px',
                                                    fontSize: 15,
                                                    border: '1px solid var(--선)',
                                                    borderRadius: 8,
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                        <div style={{ marginBottom: 16 }}>
                                            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--먹)', marginBottom: 6, display: 'block' }}>
                                                무료 체험 기간 (일)
                                            </label>
                                            <input
                                                type="number"
                                                value={freeTrialDays}
                                                onChange={e => setFreeTrialDays(parseInt(e.target.value) || 0)}
                                                min={0}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 14px',
                                                    fontSize: 15,
                                                    border: '1px solid var(--선)',
                                                    borderRadius: 8,
                                                    outline: 'none',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Custom Handle */}
                            <div style={{ marginBottom: 32 }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    커스텀 URL (선택)
                                </label>
                                <input
                                    type="text"
                                    placeholder="예: my-ai"
                                    value={customHandle}
                                    onChange={e => setCustomHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    maxLength={30}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        fontSize: 16,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        outline: 'none',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#FF6B35'}
                                    onBlur={e => e.target.style.borderColor = 'var(--선)'}
                                />
                                {customHandle && (
                                    <p style={{ fontSize: 13, color: 'var(--먹연)', marginTop: 6 }}>
                                        URL: /chat/{customHandle}
                                    </p>
                                )}
                            </div>

                            {/* Voice Cloning */}
                            <div style={{ marginBottom: 32, padding: 24, background: '#F9FAFB', borderRadius: 12 }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--먹)', marginBottom: 12 }}>
                                    🎤 음성 클로닝 (선택)
                                </h3>
                                <p style={{ fontSize: 14, color: 'var(--먹연)', marginBottom: 16, lineHeight: 1.6 }}>
                                    30초 이상의 음성 샘플을 업로드하면 AI가 해당 목소리로 말할 수 있습니다.
                                </p>

                                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                    <button
                                        onClick={() => voiceInputRef.current?.click()}
                                        style={{
                                            padding: '12px 20px',
                                            background: '#FFFFFF',
                                            color: 'var(--먹)',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            border: '1px solid var(--선)',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        📁 파일 선택
                                    </button>
                                    <button
                                        onClick={isRecording ? stopRecording : startRecording}
                                        style={{
                                            padding: '12px 20px',
                                            background: isRecording ? '#DC2626' : '#FFFFFF',
                                            color: isRecording ? '#FFFFFF' : 'var(--먹)',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            border: isRecording ? 'none' : '1px solid var(--선)',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {isRecording ? `🔴 녹음 중... ${recordingSeconds}초` : '🎙️ 마이크 녹음'}
                                    </button>
                                </div>

                                <input
                                    ref={voiceInputRef}
                                    type="file"
                                    accept="audio/*"
                                    style={{ display: 'none' }}
                                    onChange={handleVoiceSampleChange}
                                />

                                {voiceSamplePreviewUrl && (
                                    <div style={{ marginTop: 16 }}>
                                        <audio controls src={voiceSamplePreviewUrl} style={{ width: '100%', marginBottom: 12 }} />
                                        <button
                                            onClick={uploadVoiceSample}
                                            disabled={voiceSampleUploading}
                                            style={{
                                                padding: '10px 20px',
                                                background: voiceSampleUploading ? '#D1D5DB' : '#16A34A',
                                                color: '#FFFFFF',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                border: 'none',
                                                borderRadius: 8,
                                                cursor: voiceSampleUploading ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {voiceSampleUploading ? '업로드 중...' : '음성 업로드'}
                                        </button>
                                    </div>
                                )}

                                {voiceSampleUrl && (
                                    <div style={{ marginTop: 16 }}>
                                        <p style={{ fontSize: 14, color: '#16A34A', marginBottom: 8 }}>✅ 음성 샘플 업로드 완료</p>
                                        <button
                                            onClick={testVoice}
                                            disabled={voiceTestLoading}
                                            style={{
                                                padding: '10px 20px',
                                                background: voiceTestLoading ? '#D1D5DB' : '#2563EB',
                                                color: '#FFFFFF',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                border: 'none',
                                                borderRadius: 8,
                                                cursor: voiceTestLoading ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {voiceTestLoading ? '생성 중...' : '🔊 음성 테스트'}
                                        </button>
                                    </div>
                                )}

                                {voiceTestAudioUrl && (
                                    <div style={{ marginTop: 16 }}>
                                        <p style={{ fontSize: 14, color: 'var(--먹)', marginBottom: 8 }}>테스트 음성:</p>
                                        <audio controls src={voiceTestAudioUrl} style={{ width: '100%' }} />
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32 }}>
                                <button
                                    onClick={() => setCurrentStep('knowledge')}
                                    style={{
                                        padding: '14px 32px',
                                        background: '#FFFFFF',
                                        color: 'var(--먹)',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        border: '1px solid var(--선)',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--샌드)'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.background = '#FFFFFF'}
                                >
                                    ← 이전
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Bottom CTA */}
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: '#FFFFFF',
                    borderTop: '1px solid var(--선)',
                    padding: '16px 20px',
                    zIndex: 100,
                }}>
                    <div style={{
                        maxWidth: 960,
                        margin: '0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                    }}>
                        <div>
                            <p style={{ fontSize: 14, color: 'var(--먹연)', marginBottom: 4 }}>
                                {currentStep === 'basic' && '기본 정보를 입력하고 다음 단계로 이동하세요'}
                                {currentStep === 'personality' && 'AI의 성격을 정의해주세요 (선택사항)'}
                                {currentStep === 'greeting' && '인사말과 예시 질문을 설정해주세요 (선택사항)'}
                                {currentStep === 'knowledge' && '지식 파일을 추가해주세요 (선택사항)'}
                                {currentStep === 'advanced' && '고급 설정을 완료하고 AI를 생성하세요'}
                            </p>
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={!canProceed('basic') || loading}
                            style={{
                                padding: '14px 40px',
                                background: (canProceed('basic') && !loading) ? '#FF6B35' : '#D1D5DB',
                                color: '#FFFFFF',
                                fontSize: 16,
                                fontWeight: 700,
                                border: 'none',
                                borderRadius: 12,
                                cursor: (canProceed('basic') && !loading) ? 'pointer' : 'not-allowed',
                                transition: 'all 200ms',
                                whiteSpace: 'nowrap',
                                boxShadow: (canProceed('basic') && !loading) ? '0 2px 12px rgba(255, 107, 53, 0.25)' : 'none',
                            }}
                            onMouseEnter={e => {
                                if (canProceed('basic') && !loading) (e.target as HTMLElement).style.background = '#E8552C'
                            }}
                            onMouseLeave={e => {
                                if (canProceed('basic') && !loading) (e.target as HTMLElement).style.background = '#FF6B35'
                            }}
                        >
                            {loading ? '생성 중...' : '🚀 AI 생성하기'}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @media (max-width: 768px) {
                    .sidebar-content {
                        padding-bottom: 160px !important;
                    }
                }
            `}</style>
        </div>
    )
}
