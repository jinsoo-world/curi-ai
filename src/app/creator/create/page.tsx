'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import AppSidebar from '@/components/AppSidebar'
import { createClient } from '@/lib/supabase/client'
// PERSONA_TEMPLATES import removed — agent prompt now directly entered

interface UploadedFile {
    id: string
    fileName: string
    fileSize: number
    status: 'uploading' | 'processing' | 'completed' | 'failed'
    content?: string
}

export default function CreatorCreatePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [toast, setToast] = useState<string | null>(null)

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

    // 크리에이터 탭 (AI 설정 / 파일 학습)
    const [creatorTab, setCreatorTab] = useState<'settings' | 'files' | 'premium'>('settings')

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
                setVoiceSamplePreviewUrl(URL.createObjectURL(blob))

                // 서버 업로드
                setVoiceSampleUploading(true)
                try {
                    const formData = new FormData()
                    formData.append('file', file)
                    formData.append('mentorId', mentorIdForUpload || 'temp')
                    const res = await fetch('/api/tts/upload-voice', { method: 'POST', body: formData })
                    if (res.ok) {
                        const data = await res.json()
                        setVoiceSampleUrl(data.url)
                        setToast('🎙️ 녹음 업로드 완료!')
                        setTimeout(() => setToast(null), 3000)
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
                    if (s >= 29) { stopRecording(); return 30 }
                    return s + 1
                })
            }, 1000)
        } catch {
            setError('마이크 접근 권한이 필요합니다.')
        }
    }, [mentorIdForUpload])

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

    // 공개/비공개 선택 모달
    const [showPublishModal, setShowPublishModal] = useState(false)

    // 로그인 상태 체크
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsLoggedIn(!!user)
        })
    }, [])

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

    function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setError('이미지 파일만 업로드 가능합니다.')
            return
        }
        if (file.size > 7 * 1024 * 1024) {
            setError('프로필 이미지는 7MB 이하로 업로드해주세요.')
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

    async function handleCreate(isPublic: boolean = true) {
        setLoading(true)
        setError(null)

        try {
            // 프로필 이미지 업로드 (있는 경우)
            let avatarUrl = ''
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

            // Step 1: 기본 정보 생성 (이미 draft가 있으면 스킵)
            let mentorId = mentorIdForUpload
            if (!mentorId) {
                const res1 = await fetch('/api/creator/mentor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 1,
                        name: name.trim(),
                        title: title.trim(),
                        description: '',
                        expertise,
                        avatarUrl,
                        category,
                        organization: organization.trim() || null,
                    }),
                })
                const data1 = await res1.json()
                if (!res1.ok) throw new Error(data1.error)
                mentorId = data1.mentor.id
            } else {
                // draft 멘토가 있으면 이름/소개/아바타만 업데이트
                await fetch('/api/creator/mentor/update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mentorId,
                        name: name.trim(),
                        title: title.trim(),
                        expertise,
                        category,
                        organization: organization.trim() || null,
                        ...(avatarUrl && { avatarUrl }),
                    }),
                })
            }

            // Step 2: 페르소나 설정
            const fullPrompt = systemPrompt.trim()

            const res2 = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 2,
                    mentorId,
                    mentorName: name,
                    template: personaTemplate,
                    systemPrompt: fullPrompt,
                    greetingMessage: greetingMessage.trim() ||
                        `안녕하세요! ${name}입니다 😊 무엇이 궁금하세요?`,
                    sampleQuestions: sampleQuestions
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                }),
            })
            const data2 = await res2.json()
            if (!res2.ok) throw new Error(data2.error)

            // Step 3: 지식 (생략 — 이제 파일만 지원)

            // Publish (선택한 공개 여부 반영)
            const pubRes = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 'publish', mentorId, isPublic }),
            })
            const pubData = await pubRes.json()
            if (!pubRes.ok) throw new Error(pubData.error)

            // 성공 → 미션 보상 페이지로 (2회 이하일 때만 보상 애니메이션)
            const aiCount = pubData.aiCount || 0
            if (aiCount <= 2) {
                router.push('/missions?reward_earned=ai_create&amount=25')
            } else {
                router.push('/missions')
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
        } finally {
            setLoading(false)
            setShowPublishModal(false)
        }
    }

    // 파일 업로드 (mentorId 필요 → 먼저 draft 생성)
    async function handleFileUpload(files: FileList | null) {
        if (!files || files.length === 0) return

        // 최대 파일 수 검증 (10개)
        const newFilesArr = Array.from(files)
        if (uploadedFiles.length + newFilesArr.length > 10) {
            setError('파일은 최대 10개까지 등록할 수 있습니다.')
            return
        }

        // 개별 파일 크기 검증 (10MB)
        const MAX_SINGLE = 10 * 1024 * 1024
        const tooBig = newFilesArr.find(f => f.size > MAX_SINGLE)
        if (tooBig) {
            const sizeMB = (tooBig.size / 1024 / 1024).toFixed(1)
            setError(`"${tooBig.name}" 파일이 너무 큽니다 (${sizeMB}MB). 파일 1개당 최대 10MB까지 업로드할 수 있어요.`)
            return
        }

        // 합산 용량 검증 (50MB)
        const existingSize = uploadedFiles.reduce((sum, f) => sum + f.fileSize, 0)
        const newSize = newFilesArr.reduce((sum, f) => sum + f.size, 0)
        if (existingSize + newSize > 50 * 1024 * 1024) {
            const totalMB = ((existingSize + newSize) / 1024 / 1024).toFixed(1)
            setError(`모든 파일 합산 ${totalMB}MB로 50MB를 초과합니다. 일부 파일을 삭제 후 다시 시도해주세요.`)
            return
        }

        setUploading(true)
        setError(null)

        try {
            // mentorId가 아직 없으면 draft 먼저 생성
            let mid = mentorIdForUpload
            if (!mid) {
                if (!name.trim() || !title.trim()) {
                    setError('파일 업로드 전에 AI 이름과 한줄 소개를 입력해주세요.')
                    setUploading(false)
                    return
                }
                const res = await fetch('/api/creator/mentor', {
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
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)
                mid = data.mentor.id
                setMentorIdForUpload(mid)
            }

            const allowedExtensions = ['pdf', 'txt', 'md', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']

            for (const file of newFilesArr) {
                const ext = file.name.split('.').pop()?.toLowerCase() || ''
                if (!allowedExtensions.includes(ext)) {
                    setError(`지원하지 않는 형식: ${file.name}`)
                    continue
                }

                // 1) 서버에서 Signed Upload URL 받기 (파일 자체는 전송 안 함)
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

                // 2) 클라이언트에서 직접 Supabase Storage에 업로드 (Vercel body limit 우회)
                const uploadRes = await fetch(urlData.signedUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file,
                })

                if (!uploadRes.ok) {
                    // Storage 업로드 실패 시 DB 레코드 정리 시도
                    throw new Error(`파일 업로드 실패: ${file.name}`)
                }

                setUploadedFiles(prev => [...prev, {
                    id: sourceId,
                    fileName: urlData.source.fileName,
                    fileSize: urlData.source.fileSize,
                    status: 'processing' as const,
                }])

                // 3) 파일 텍스트 추출 + 임베딩 트리거 (모든 파일)
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

    // ── 미리보기 채팅 ──
    const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [previewInput, setPreviewInput] = useState('')
    const [previewLoading, setPreviewLoading] = useState(false)
    const previewEndRef = useRef<HTMLDivElement>(null)

    async function handlePreviewSend(msg?: string) {
        const text = msg || previewInput.trim()
        if (!text || previewLoading) return

        // 미리보기 시 draft 멘토가 없으면 자동 생성
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

                // 프롬프트 설정도 바로 반영
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

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <AppSidebar />

            <div className="sidebar-content" style={{ marginLeft: 240, minHeight: '100dvh' }}>
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
                        padding: '16px 20px 80px',
                        overflowY: 'auto',
                        height: '100dvh',
                        boxSizing: 'border-box',
                    }}>
                        {/* 헤더 */}
                        <div style={{ marginBottom: 0 }}>
                            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#18181b' }}>
                                🤖 나만의 AI 만들기
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                AI에 반영되는 설정만 표시됩니다
                            </p>
                        </div>

                        {/* 로그인 필요 — 전면 유도 화면 */}
                        {isLoggedIn === false && (
                            <div style={{
                                position: 'fixed', inset: 0, zIndex: 100,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(255,255,255,0.92)',
                                backdropFilter: 'blur(8px)',
                                padding: 24,
                            }}>
                                <div style={{
                                    textAlign: 'center', maxWidth: 400,
                                    background: '#fff',
                                    borderRadius: 24,
                                    padding: '48px 32px 40px',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
                                    animation: 'fadeIn 0.4s ease',
                                }}>
                                    <div style={{ fontSize: 56, marginBottom: 16 }}>🔐</div>
                                    <h2 style={{
                                        fontSize: 22, fontWeight: 800, color: '#18181b',
                                        marginBottom: 8, letterSpacing: '-0.02em',
                                    }}>
                                        로그인이 필요합니다
                                    </h2>
                                    <p style={{
                                        fontSize: 15, color: '#6b7280', lineHeight: 1.6,
                                        marginBottom: 28,
                                    }}>
                                        AI를 만들려면 먼저 로그인해주세요.<br />
                                        간편하게 로그인하고 시작할 수 있습니다.
                                    </p>
                                    <Link
                                        href="/login"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 10,
                                            padding: '14px 36px',
                                            borderRadius: 14,
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            color: '#fff', textDecoration: 'none',
                                            fontWeight: 700, fontSize: 16,
                                            boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                            transition: 'transform 150ms',
                                        }}
                                    >
                                        🚀 로그인하기
                                    </Link>
                                    <div style={{ marginTop: 16 }}>
                                        <Link
                                            href="/mentors"
                                            style={{
                                                fontSize: 14, color: '#9ca3af',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            ← AI 둘러보기
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ GNB 탭 ═══ */}
                        <div style={{
                            display: 'flex', gap: 0,
                            borderBottom: '2px solid #f0f0f0',
                            marginBottom: 16, marginTop: 12,
                        }}>
                            {[
                                { key: 'settings' as const, label: '🎯 AI 설정' },
                                { key: 'files' as const, label: '📁 파일 학습' },
                                { key: 'premium' as const, label: '💎 프리미엄' },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setCreatorTab(tab.key)}
                                    style={{
                                        flex: 1,
                                        padding: '10px 0',
                                        fontSize: 14,
                                        fontWeight: creatorTab === tab.key ? 700 : 500,
                                        color: creatorTab === tab.key ? '#18181b' : '#9ca3af',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: creatorTab === tab.key ? '2px solid #22c55e' : '2px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'all 150ms',
                                        marginBottom: -2,
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* 에러 */}
                        {error && (
                            <div style={styles.errorBox}>
                                {error}
                                <button
                                    onClick={() => setError(null)}
                                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', marginLeft: 8, fontWeight: 600 }}
                                >✕</button>
                            </div>
                        )}

                        {creatorTab === 'settings' && (<>
                        {/* ── 기본 정보 ── */}
                        <div style={styles.card}>
                            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: 12 }}>
                                <div
                                    onClick={() => avatarInputRef.current?.click()}
                                    style={{
                                        width: 64, height: 64, borderRadius: '50%',
                                        border: '3px dashed #d1d5db', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        overflow: 'hidden', background: '#f9fafb',
                                        transition: 'border-color 200ms',
                                    }}
                                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#22c55e')}
                                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#d1d5db')}
                                >
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                                    클릭하여 프로필 사진 업로드 (1:1 정방형 권장, 7MB 이내)
                                </span>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>AI 이름 *</label>
                                <input
                                    style={styles.input}
                                    placeholder="예: 커피마스터, 영어코치"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    maxLength={20}
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>한줄 소개 *</label>
                                <input
                                    style={styles.input}
                                    placeholder="예: 바리스타 경력 10년, 커피 로스팅 전문가"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    maxLength={50}
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
                                    placeholder="예: 당신은 마케팅 전문가입니다. 데이터 기반 분석과 실전 사례를 통해 조언합니다."
                                    rows={8}
                                />
                                <div style={{ textAlign: 'right' as const, fontSize: 11, color: systemPrompt.length > 2700 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                    {systemPrompt.length}/3,000
                                </div>
                            </div>
                        </div>

                        {/* ── 인사말 / 예시 질문 ── */}
                        <div style={styles.card}>
                            <div style={styles.field}>
                                <label style={styles.label}>👋 인사말 (선택)</label>
                                <input
                                    style={styles.input}
                                    placeholder={`안녕하세요! ${name || 'AI'}입니다 😊`}
                                    value={greetingMessage}
                                    onChange={e => setGreetingMessage(e.target.value)}
                                    maxLength={200}
                                />
                                <div style={{ textAlign: 'right' as const, fontSize: 11, color: greetingMessage.length > 180 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                    {greetingMessage.length}/200
                                </div>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>💬 예시 질문 (선택)</label>
                                <p style={styles.hint}>줄바꿈으로 구분 — 대화 시작 시 추천 질문으로 표시</p>
                                <textarea
                                    style={styles.textarea}
                                    placeholder={"질문 1\n질문 2\n질문 3"}
                                    value={sampleQuestions}
                                    onChange={e => setSampleQuestions(e.target.value)}
                                    maxLength={300}
                                    rows={3}
                                />
                                <div style={{ textAlign: 'right' as const, fontSize: 11, color: sampleQuestions.length > 270 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                    {sampleQuestions.length}/300
                                </div>
                            </div>
                        </div>
                        </>)}

                        {creatorTab === 'files' && (<>
                        {/* ── 지식 추가 ── */}
                        <div style={styles.card}>
                            <label style={{ ...styles.label, marginBottom: 4, fontSize: 15 }}>📚 지식 파일 추가</label>
                            <p style={styles.hint}>AI가 참고할 문서를 업로드하세요</p>

                            <div
                                style={{
                                    ...styles.dropZone,
                                    ...(dragOver ? styles.dropZoneActive : {}),
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
                                <div style={{ fontSize: 28, marginBottom: 4 }}>{uploading ? '⏳' : '📄'}</div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                                    {uploading ? '업로드 중...' : '클릭하거나 드래그'}
                                </div>
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                                    gap: 6, marginTop: 10,
                                }}>
                                    {[
                                        { ext: 'HWP', color: '#2563eb', bg: '#dbeafe' },
                                        { ext: 'PDF', color: '#dc2626', bg: '#fee2e2' },
                                        { ext: 'PPT', color: '#ea580c', bg: '#ffedd5' },
                                        { ext: 'DOCX', color: '#2563eb', bg: '#dbeafe' },
                                        { ext: 'TXT', color: '#6b7280', bg: '#f3f4f6' },
                                        { ext: 'VTT', color: '#7c3aed', bg: '#ede9fe' },
                                    ].map(f => (
                                        <span key={f.ext} style={{
                                            fontSize: 10, fontWeight: 700,
                                            color: f.color, background: f.bg,
                                            padding: '3px 8px', borderRadius: 6,
                                            letterSpacing: '0.02em',
                                        }}>
                                            .{f.ext}
                                        </span>
                                    ))}
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                                    최대 10개 · 합산 50MB
                                </div>
                            </div>

                            {uploadedFiles.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                                    {uploadedFiles.map(f => (
                                        <div key={f.id} style={{
                                            padding: '14px 16px', borderRadius: 14,
                                            background: f.status === 'completed' ? '#f9fafb' :
                                                        f.status === 'failed' ? '#fef2f2' : '#fffbeb',
                                            border: '1px solid #f0f0f0',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    {f.status === 'processing' ? <span>⏳</span> : f.status === 'failed' ? <span>❌</span> : (() => { const ext = f.fileName?.split('.').pop()?.toLowerCase(); const iconMap: Record<string, string> = { pdf: '/file-icons/pdf.png', hwp: '/file-icons/hwp.png', docx: '/file-icons/docx.png', doc: '/file-icons/doc.png', ppt: '/file-icons/ppt.png', pptx: '/file-icons/ppt.png', txt: '/file-icons/txt.png' }; const iconSrc = ext ? iconMap[ext] : null; return iconSrc ? <img src={iconSrc} alt={ext} style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <span>📁</span> })()}
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 500, color: '#18181b' }}>{f.fileName}</div>
                                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                            {formatFileSize(f.fileSize)}
                                                            {f.status === 'completed' && ' · ✅ AI가 학습 완료'}
                                                            {f.status === 'processing' && ' · 📄 파일 읽는 중...'}
                                                            {f.status === 'failed' && ' · ❌ 처리 실패'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                                                    background: f.status === 'completed' ? '#dcfce7' :
                                                                f.status === 'failed' ? '#fee2e2' : '#fef3c7',
                                                    color: f.status === 'completed' ? '#16a34a' :
                                                           f.status === 'failed' ? '#dc2626' : '#d97706',
                                                }}>
                                                    {f.status === 'processing' ? '⏳ 읽는 중...' :
                                                     f.status === 'completed' ? '✅ 완료' :
                                                     f.status === 'failed' ? '❌ 실패' : '업로드 중...'}
                                                </span>
                                            </div>
                                            {/* 내용 보기 / 삭제 버튼 */}
                                            {(f.status === 'completed' || f.status === 'failed') && (
                                                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                                    {f.status === 'completed' && (
                                                        <button
                                                            onClick={async () => {
                                                                if (f.content) {
                                                                    setPreviewSource({ title: f.fileName, content: f.content, sourceId: f.id })
                                                                } else if (mentorIdForUpload) {
                                                                    try {
                                                                        const res = await fetch(`/api/creator/knowledge/list?mentorId=${mentorIdForUpload}`)
                                                                        const data = await res.json()
                                                                        const found = data.sources?.find((s: any) => s.id === f.id)
                                                                        if (found?.content) {
                                                                            setPreviewSource({ title: f.fileName, content: found.content, sourceId: f.id })
                                                                            setUploadedFiles(prev => prev.map(p => p.id === f.id ? { ...p, content: found.content } : p))
                                                                        } else {
                                                                            setToast('파일 내용을 불러올 수 없습니다.')
                                                                            setTimeout(() => setToast(null), 3000)
                                                                        }
                                                                    } catch {
                                                                        setToast('파일 내용을 불러올 수 없습니다.')
                                                                        setTimeout(() => setToast(null), 3000)
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
                                                    <button
                                                        onClick={async () => {
                                                            if (!mentorIdForUpload) return
                                                            if (!confirm(`"${f.fileName}" 파일을 삭제하시겠습니까?`)) return
                                                            try {
                                                                const res = await fetch('/api/creator/knowledge/delete', {
                                                                    method: 'DELETE',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ sourceId: f.id, mentorId: mentorIdForUpload }),
                                                                })
                                                                if (res.ok) {
                                                                    setUploadedFiles(prev => prev.filter(p => p.id !== f.id))
                                                                    setToast(`🗑️ ${f.fileName} 삭제 완료`)
                                                                    setTimeout(() => setToast(null), 3000)
                                                                } else {
                                                                    setToast('삭제에 실패했습니다.')
                                                                    setTimeout(() => setToast(null), 3000)
                                                                }
                                                            } catch {
                                                                setToast('삭제에 실패했습니다.')
                                                                setTimeout(() => setToast(null), 3000)
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '5px 12px', borderRadius: 8,
                                                            border: '1px solid #e5e7eb', background: '#fff',
                                                            color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                        }}
                                                    >🗑️ 삭제</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── 음성 클로닝 ── */}
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
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                if (file.size > 10 * 1024 * 1024) {
                                                    setError('음성 파일은 10MB 이하만 가능합니다.')
                                                    return
                                                }
                                                setVoiceSampleFile(file)
                                                setVoiceSamplePreviewUrl(URL.createObjectURL(file))
                                                setVoiceSampleUploading(true)
                                                try {
                                                    const formData = new FormData()
                                                    formData.append('file', file)
                                                    formData.append('mentorId', mentorIdForUpload || 'temp')
                                                    const res = await fetch('/api/tts/upload-voice', { method: 'POST', body: formData })
                                                    if (res.ok) {
                                                        const data = await res.json()
                                                        setVoiceSampleUrl(data.url)
                                                        setToast('🎙️ 음성 샘플 업로드 완료!')
                                                        setTimeout(() => setToast(null), 3000)
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
                                                    {voiceSampleFile?.name || '음성 샘플'}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                                                    {voiceSampleUploading ? '⏳ 업로드 중...' : voiceSampleUrl ? '✅ 학습 준비 완료' : '처리 중...'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setVoiceSampleFile(null)
                                                setVoiceSamplePreviewUrl(null)
                                                setVoiceSampleUrl(null)
                                                setVoiceTestAudioUrl(null)
                                            }}
                                            style={{
                                                padding: '5px 12px', borderRadius: 8,
                                                border: '1px solid #e5e7eb', background: '#fff',
                                                color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            }}
                                        >🗑️ 삭제</button>
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
                                                try {
                                                    const res = await fetch('/api/tts', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            text: greetingMessage || `안녕하세요! ${name || 'AI'}입니다. 만나서 반가워요!`,
                                                            mentorName: name,
                                                            voiceSampleUrl: voiceSampleUrl,
                                                        }),
                                                    })
                                                if (res.ok) {
                                                        const data = await res.json()
                                                        setVoiceTestAudioUrl(data.audioUrl)
                                                    } else {
                                                        const errData = await res.json().catch(() => ({}))
                                                        setError(errData.error || '테스트 음성 생성에 실패했습니다.')
                                                    }
                                                } catch {
                                                    setError('테스트 음성 생성에 실패했습니다.')
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
                                    onClick={() => setIsPremium(!isPremium)}
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
                                        onChange={e => setMonthlyPrice(Number(e.target.value))}
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
                                            onClick={() => setMonthlyPrice(price)}
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
                                        onChange={e => setFreeTrialChats(Number(e.target.value))}
                                        style={{ ...styles.input, width: '100%' }}
                                    >
                                        {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}회</option>)}
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' }}>무료 체험 기간</label>
                                    <select
                                        value={freeTrialDays}
                                        onChange={e => setFreeTrialDays(Number(e.target.value))}
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
                                        value={customHandle}
                                        onChange={e => setCustomHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                        placeholder="my-ai-name"
                                        style={{
                                            ...styles.input,
                                            borderRadius: '0 10px 10px 0',
                                            flex: 1,
                                        }}
                                    />
                                </div>
                                {customHandle && (
                                    <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>✓ curi-ai.com/{customHandle}</div>
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
                        </>)}

                        {/* ── 하단 버튼 ── */}
                        <div style={{ paddingBottom: 20 }}>
                            {uploadedFiles.some(f => f.status === 'processing' || f.status === 'uploading') && (
                                <div style={{
                                    fontSize: 12, color: '#d97706', textAlign: 'center' as const,
                                    marginBottom: 6, fontWeight: 500,
                                }}>
                                    ⏳ 파일 처리 중... 완료되면 공개할 수 있어요
                                </div>
                            )}
                            <button
                                style={{
                                    ...styles.createBtn,
                                    opacity: (loading || uploadedFiles.some(f => f.status === 'processing' || f.status === 'uploading')) ? 0.5 : 1,
                                }}
                                onClick={() => {
                                    // 유효성 검사
                                    if (!name.trim()) { setError('AI 이름을 입력해주세요.'); return }
                                    if (!title.trim()) { setError('한줄 소개를 입력해주세요.'); return }
                                    const processingFiles = uploadedFiles.filter(f => f.status === 'uploading' || f.status === 'processing')
                                    if (processingFiles.length > 0) { setError(`파일 ${processingFiles.length}개가 처리 중입니다.`); return }
                                    setShowPublishModal(true)
                                }}
                                disabled={loading || uploadedFiles.some(f => f.status === 'processing' || f.status === 'uploading')}
                            >
                                {loading ? '생성 중...' :
                                 uploadedFiles.some(f => f.status === 'processing') ? '⏳ 파일 처리 중...' :
                                 '🚀 AI 공개하기'}
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
                                            background: avatarPreview ? '#f3f4f6' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 24, fontWeight: 700,
                                            margin: '0 auto 8px',
                                            overflow: 'hidden',
                                            border: avatarPreview ? '1px solid #e5e7eb' : 'none',
                                        }}>
                                            {avatarPreview ? (
                                                <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <img
                                                    src="/logo.png"
                                                    alt="큐리"
                                                    style={{ width: 48, height: 48, objectFit: 'contain', opacity: 0.3 }}
                                                />
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
                                                    background: avatarPreview ? '#f3f4f6' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    overflow: 'hidden',
                                                    border: avatarPreview ? '1px solid #e5e7eb' : 'none',
                                                    marginTop: 2,
                                                }}>
                                                    {avatarPreview ? (
                                                        <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <img
                                                            src="/logo.png"
                                                            alt="큐리"
                                                            style={{ width: 36, height: 36, objectFit: 'contain', opacity: 0.3 }}
                                                        />
                                                    )}
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

                                            {/* 예시 질문 버튼 */}
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

                        {/* 미리보기 없을 때 안내 오버레이 */}
                        {!name.trim() && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexDirection: 'column', gap: 8, zIndex: 10,
                            }}>
                                <div style={{ fontSize: 40 }}>💬</div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>미리보기</div>
                                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' as const, maxWidth: 200 }}>
                                    AI 이름을 입력하면<br />미리보기가 시작됩니다
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* 파일 내용 미리보기 모달 */}
                {previewSource && (
                    <div
                        onClick={() => setPreviewSource(null)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9998,
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 24,
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: '#fff', borderRadius: 20, width: '100%', maxWidth: 700,
                                maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                                animation: 'slideDown 0.3s ease', overflow: 'hidden',
                            }}
                        >
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
                            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
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
                                            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            fontFamily: 'inherit',
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
                {/* 토스트 */}
                {toast && (
                    <div
                        style={{
                            position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                            background: '#18181b', color: '#fff', padding: '10px 20px',
                            borderRadius: 10, fontSize: 14, zIndex: 9999,
                            animation: 'slideDown 0.3s ease',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        }}
                        onClick={() => setToast(null)}
                    >
                        {toast}
                    </div>
                )}

                {/* 반응형 CSS */}
                <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes previewDot {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                }
                .preview-markdown p:last-child { margin-bottom: 0 !important; }
                @media (min-width: 640px) {
                    .template-grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                    }
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
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
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

            {/* ══════ 공개/비공개 선택 모달 ══════ */}
            {showPublishModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 20,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 20,
                        padding: '28px 24px', maxWidth: 380, width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                        animation: 'fadeInUp 200ms ease-out',
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>🚀</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#18181b' }}>
                                AI 공개 설정
                            </div>
                            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                                공개 범위를 선택해주세요
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* 전체 공개 */}
                            <button
                                onClick={() => handleCreate(true)}
                                disabled={loading}
                                style={{
                                    padding: '16px 18px', borderRadius: 14,
                                    border: '2px solid #22c55e', background: '#f0fdf4',
                                    cursor: loading ? 'wait' : 'pointer',
                                    textAlign: 'left', transition: 'all 150ms',
                                    opacity: loading ? 0.6 : 1,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 24 }}>🌍</span>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                                            {loading ? '생성 중...' : '전체 공개'}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                            누구나 내 AI와 대화할 수 있어요
                                        </div>
                                    </div>
                                </div>
                            </button>

                            {/* 비공개 */}
                            <button
                                onClick={() => handleCreate(false)}
                                disabled={loading}
                                style={{
                                    padding: '16px 18px', borderRadius: 14,
                                    border: '1px solid #e5e7eb', background: '#fff',
                                    cursor: loading ? 'wait' : 'pointer',
                                    textAlign: 'left', transition: 'all 150ms',
                                    opacity: loading ? 0.6 : 1,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 24 }}>🔒</span>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>
                                            {loading ? '생성 중...' : '비공개 (나만 보기)'}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                                            나만 대화할 수 있어요 · 나중에 변경 가능
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </div>

                        <button
                            onClick={() => setShowPublishModal(false)}
                            disabled={loading}
                            style={{
                                width: '100%', marginTop: 12, padding: '10px 0',
                                border: 'none', background: 'transparent',
                                color: '#9ca3af', fontSize: 13, cursor: 'pointer',
                            }}
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}
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
    errorBox: {
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        color: '#dc2626',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 14,
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    templateGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
    },
    templateCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '14px 8px',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        background: '#fafafa',
        cursor: 'pointer',
        transition: 'all 0.2s',
        color: '#4b5563',
        textAlign: 'center',
    },
    templateCardSelected: {
        border: '2px solid #22c55e',
        background: '#f0fdf4',
        color: '#14532d',
    },
    dropZone: {
        border: '2px dashed #d1d5db',
        borderRadius: 12,
        padding: '20px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        transition: 'all 0.2s',
        background: '#fafafa',
    },
    dropZoneActive: {
        border: '2px dashed #22c55e',
        background: '#f0fdf4',
    },
    fileItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderRadius: 8,
        background: '#f0fdf4',
        fontSize: 13,
    },
    createBtn: {
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
}

