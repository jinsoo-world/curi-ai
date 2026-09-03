// /api/creator/knowledge/process — 업로드된 파일 텍스트 추출 + 임베딩
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'
import { GoogleGenAI } from '@google/genai'

/**
 * VTT 파일 전처리: 타임스탬프 제거, 추임새 제거, 화자별 대화 정리
 */
function parseVttContent(raw: string): { fullText: string; speakers: Record<string, string[]> } {
    const lines = raw.split('\n')
    const speakers: Record<string, string[]> = {}
    const dialogues: string[] = []

    // 추임새/의미없는 발화 패턴
    const FILLER_PATTERNS = [
        /^(네|네네|네네네|예|예예|예예예|응|응응|응응응|어|어어|어어어|아|아아|으음|음|으으|오|오오)\.?$/,
        /^(네 맞아요|네 예예예|어어어|으음 으음|응응응|어 어|네네|아 네|네 네|어 네|아 그래요|아하하|오케이)\.?$/,
        /^(있습니다|그렇습니다|하나님이|그렇구나)\.?$/,
    ]

    let currentSpeaker = ''
    let isTimestamp = false

    for (const line of lines) {
        const trimmed = line.trim()

        // WEBVTT 헤더, 빈 줄, 시퀀스 번호 건너뛰기
        if (!trimmed || trimmed === 'WEBVTT' || /^\d+$/.test(trimmed)) continue

        // 타임스탬프 라인 건너뛰기
        if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}$/.test(trimmed)) {
            isTimestamp = true
            continue
        }

        if (isTimestamp || true) {
            isTimestamp = false

            // 화자 분리: "화자명: 내용" 형식
            const speakerMatch = trimmed.match(/^(.+?):\s*(.+)$/)
            if (speakerMatch) {
                currentSpeaker = speakerMatch[1].trim()
                const content = speakerMatch[2].trim()

                // 추임새 필터링
                if (FILLER_PATTERNS.some(p => p.test(content))) continue

                // 너무 짧은 발화 (2글자 이하) 건너뛰기
                if (content.length <= 2) continue

                if (!speakers[currentSpeaker]) speakers[currentSpeaker] = []
                speakers[currentSpeaker].push(content)
                dialogues.push(`[${currentSpeaker}] ${content}`)
            } else if (trimmed.length > 2) {
                // 화자 없는 라인
                if (!FILLER_PATTERNS.some(p => p.test(trimmed))) {
                    dialogues.push(trimmed)
                }
            }
        }
    }

    return {
        fullText: dialogues.join('\n'),
        speakers,
    }
}

/**
 * Gemini를 사용하여 VTT 텍스트 오탈자/고유명사 보정
 */
async function correctVttWithGemini(text: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
        console.log('[VTT] No GEMINI_API_KEY, skipping correction')
        return text
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

        // 텍스트가 너무 길면 청크로 나눠서 보정 (Gemini 토큰 한도 고려)
        const MAX_CHUNK = 8000
        if (text.length <= MAX_CHUNK) {
            const result = await ai.models.generateContent({
                model: 'gemini-2.0-flash-lite',
                contents: `다음은 줌(Zoom) 녹화 자막에서 추출한 대화 텍스트입니다.
음성 인식 오류로 인한 오탈자와 고유명사 오류를 교정해주세요.

규칙:
1. 문맥상 명백한 오탈자만 수정하세요 (예: "케스님" → "캐스님", "안마의자" → "감마에다가")
2. 대화의 의미나 구조는 절대 변경하지 마세요
3. 새로운 내용을 추가하지 마세요
4. 화자 태그 [이름]은 유지하세요
5. 교정된 텍스트만 출력하세요, 설명은 하지 마세요

텍스트:
${text}`,
            })

            const corrected = result.text?.trim()
            if (corrected && corrected.length > text.length * 0.5) {
                console.log(`[VTT] Gemini correction: ${text.length} → ${corrected.length} chars`)
                return corrected
            }
        } else {
            // 긴 텍스트 — 청크별 보정
            const chunks = []
            for (let i = 0; i < text.length; i += MAX_CHUNK) {
                chunks.push(text.slice(i, i + MAX_CHUNK))
            }
            console.log(`[VTT] Text too long (${text.length}), splitting into ${chunks.length} chunks for correction`)

            const correctedChunks = []
            for (const chunk of chunks) {
                const result = await ai.models.generateContent({
                    model: 'gemini-2.0-flash-lite',
                    contents: `다음은 줌 녹화 자막 텍스트의 일부입니다. 음성 인식 오탈자만 교정하세요.
규칙: 오탈자만 수정, 구조 유지, 설명 없이 교정 텍스트만 출력.

${chunk}`,
                })
                correctedChunks.push(result.text?.trim() || chunk)
            }
            return correctedChunks.join('\n')
        }
    } catch (err) {
        console.error('[VTT] Gemini correction error:', err instanceof Error ? err.message : err)
    }

    return text // 보정 실패 시 원본 반환
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Upstage Document Parse 결과에서 텍스트 추출
 * 응답 형식: content.html에 실제 컨텐츠, text/markdown은 빈 문자열
 */
function extractTextFromUpstage(pd: Record<string, unknown>): string {
    // 0. 최상위 text 키 (Upstage v2 응답 형식)
    if (typeof pd.text === 'string' && pd.text.trim()) {
        console.log('[Upstage] Found top-level text, length:', (pd.text as string).length)
        return (pd.text as string).trim()
    }

    const content = pd.content as Record<string, string> | undefined

    // 1. output_formats에 text를 포함했으면 content.text에 값이 있음
    if (content?.text) return content.text

    // 2. HTML에서 태그 제거하여 텍스트 추출 (기본 응답 형식)
    if (content?.html) {
        return content.html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?(p|div|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    }

    // 3. markdown
    if (content?.markdown) return content.markdown

    // 4. pages 배열에서 텍스트 추출 (Upstage v2)
    if (Array.isArray(pd.pages)) {
        const texts = pd.pages.map((page: Record<string, unknown>) => {
            if (typeof page.text === 'string') return page.text
            const pageContent = page.content as Record<string, string> | undefined
            if (pageContent?.text) return pageContent.text
            if (pageContent?.html) {
                return pageContent.html
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]*>/g, '')
                    .trim()
            }
            return ''
        }).filter(Boolean)
        if (texts.length > 0) {
            console.log('[Upstage] Extracted from pages array:', texts.length, 'pages')
            return texts.join('\n\n')
        }
    }

    // 5. elements 배열 fallback
    if (Array.isArray(pd.elements)) {
        const texts = pd.elements.map((el: Record<string, unknown>) => {
            const elContent = el.content as Record<string, string> | undefined
            if (elContent?.text) return elContent.text
            if (elContent?.html) {
                return (elContent.html)
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]*>/g, '')
                    .trim()
            }
            return ''
        }).filter(Boolean)
        if (texts.length > 0) return texts.join('\n\n')
    }

    return ''
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

        const { sourceId, mentorId } = await req.json()
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const { data: source, error: srcErr } = await admin
            .from('knowledge_sources')
            .select('*')
            .eq('id', sourceId)
            .single()

        if (srcErr || !source) {
            return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 })
        }

        await admin.from('knowledge_sources')
            .update({ processing_status: 'processing' })
            .eq('id', sourceId)

        // Storage에서 파일 다운로드
        const { data: fileData, error: dlError } = await admin.storage
            .from('knowledge-files')
            .download(source.original_url)

        if (dlError || !fileData) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', sourceId)
            return NextResponse.json({ error: '파일 다운로드 실패' }, { status: 500 })
        }

        const ext = source.title?.split('.').pop()?.toLowerCase() || ''
        let textContent = ''

        if (['txt', 'md'].includes(ext)) {
            // 텍스트/마크다운: 직접 읽기
            textContent = await fileData.text()

        } else if (ext === 'vtt') {
            // VTT (줌 녹화 자막): 전처리 + Gemini 보정
            console.log('[Process] Parsing VTT file:', source.title)
            const rawVtt = await fileData.text()
            const { fullText, speakers } = parseVttContent(rawVtt)
            console.log(`[Process] VTT parsed: ${Object.keys(speakers).length} speakers, ${fullText.length} chars (raw: ${rawVtt.length})`)

            // Gemini로 오탈자 보정
            textContent = await correctVttWithGemini(fullText)
            console.log(`[Process] VTT after correction: ${textContent.length} chars`)


        } else if (['hwp', 'hwpx'].includes(ext)) {
            // HWP: @ohah/hwpjs로 마크다운 변환 시도 (무료, 로컬 처리)
            try {
                const { toMarkdown } = await import('@ohah/hwpjs')
                const uint8 = Buffer.from(await fileData.arrayBuffer())
                const result = toMarkdown(uint8, { image: 'base64', useHtml: false })
                textContent = typeof result === 'string' ? result : result.markdown || ''
                console.log('[Process] HWP parsed with hwpjs, text length:', textContent.length)
            } catch (hwpErr) {
                console.error('[Process] HWP hwpjs parse error:', hwpErr instanceof Error ? hwpErr.message : hwpErr)
            }

            // hwpjs가 본문을 못 읽은 경우 (200자 이하 = 메타데이터뿐) → Upstage OCR fallback
            if (textContent.trim().length < 200) {
                console.log('[Process] HWP hwpjs result too short, falling back to Upstage OCR')
                try {
                    const formData = new FormData()
                    formData.append('document', fileData, source.title)
                    formData.append('model', 'ocr')
                    formData.append('ocr', 'force')
                    const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                        body: formData,
                    })
                    if (parseRes.ok) {
                        const pd = await parseRes.json()
                        const ocrText = extractTextFromUpstage(pd)
                        if (ocrText && ocrText.length > textContent.length) {
                            textContent = ocrText
                            console.log('[Process] HWP Upstage OCR fallback OK, text length:', textContent.length)
                        }
                    } else {
                        const errText = await parseRes.text()
                        console.error('[Process] HWP Upstage fallback error:', parseRes.status, errText.slice(0, 500))
                    }
                } catch (ocrErr) {
                    console.error('[Process] HWP OCR fallback error:', ocrErr)
                }
            }

        } else if (['doc', 'docx'].includes(ext)) {
            // DOCX: mammoth로 텍스트 추출 (무료, 로컬 처리)
            try {
                const mammoth = await import('mammoth')
                const buffer = Buffer.from(await fileData.arrayBuffer())
                const result = await mammoth.extractRawText({ buffer })
                textContent = (result.value || '')
                    .replace(/\n{3,}/g, '\n\n')  // 3줄 이상 연속 빈줄 → 2줄로
                    .replace(/[ \t]{2,}/g, ' ')   // 연속 공백 → 1칸으로
                    .trim()
                console.log('[Process] DOCX parsed with mammoth, text length:', textContent.length)
            } catch (docErr) {
                console.error('[Process] DOCX parse error:', docErr)
            }

        } else if (['ppt', 'pptx'].includes(ext)) {
            // PPTX: pptxtojson 로컬 파서로 텍스트 추출
            if (ext === 'pptx') {
                try {
                    console.log('[Process] Parsing PPTX locally with pptxtojson:', source.title)
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const { parse: parsePptx } = require('pptxtojson/dist/index.cjs')
                    const buffer = Buffer.from(await fileData.arrayBuffer())
                    const result = await parsePptx(buffer.buffer)

                    // 슬라이드별 텍스트 추출
                    const slideTexts: string[] = []
                    if (result?.slides) {
                        for (let i = 0; i < result.slides.length; i++) {
                            const slide = result.slides[i]
                            const texts: string[] = []

                            const extractText = (elements: any[]) => {
                                for (const el of elements || []) {
                                    if (el.content) {
                                        // HTML 태그 제거해서 순수 텍스트 추출
                                        const plainText = el.content
                                            .replace(/<[^>]*>/g, ' ')
                                            .replace(/&nbsp;/g, ' ')
                                            .replace(/&amp;/g, '&')
                                            .replace(/&lt;/g, '<')
                                            .replace(/&gt;/g, '>')
                                            .replace(/\s+/g, ' ')
                                            .trim()
                                        if (plainText) texts.push(plainText)
                                    }
                                    if (el.data) {
                                        // 테이블 데이터
                                        for (const row of el.data || []) {
                                            for (const cell of row || []) {
                                                if (cell?.text) texts.push(cell.text)
                                            }
                                        }
                                    }
                                    if (el.elements) {
                                        extractText(el.elements)
                                    }
                                }
                            }

                            extractText(slide.elements || [])
                            extractText(slide.layoutElements || [])

                            if (texts.length > 0) {
                                slideTexts.push(`[슬라이드 ${i + 1}]\n${texts.join('\n')}`)
                            }

                            // 슬라이드 노트
                            if (slide.note) {
                                slideTexts.push(`[슬라이드 ${i + 1} 노트]\n${slide.note}`)
                            }
                        }
                    }

                    textContent = slideTexts.join('\n\n')
                    console.log(`[Process] PPTX parsed: ${result?.slides?.length || 0} slides, ${textContent.length} chars`)
                } catch (pptxErr) {
                    console.error('[Process] PPTX local parse error:', pptxErr)
                    // 로컬 파서 실패 시 Upstage OCR 폴백
                    console.log('[Process] Falling back to Upstage OCR for PPTX')
                    try {
                        const formData = new FormData()
                        formData.append('document', fileData, source.title)
                        formData.append('model', 'ocr')
                        formData.append('ocr', 'force')
                        const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                            body: formData,
                        })
                        if (parseRes.ok) {
                            const pd = await parseRes.json()
                            textContent = extractTextFromUpstage(pd)
                        }
                    } catch (fallbackErr) {
                        console.error('[Process] PPTX fallback error:', fallbackErr)
                    }
                }
            } else {
                // .ppt (구형): Upstage OCR 사용
                try {
                    console.log('[Process] Sending PPT (legacy) to Upstage OCR:', source.title)
                    const formData = new FormData()
                    formData.append('document', fileData, source.title)
                    formData.append('model', 'ocr')
                    formData.append('ocr', 'force')
                    const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                        body: formData,
                    })
                    if (parseRes.ok) {
                        const pd = await parseRes.json()
                        textContent = extractTextFromUpstage(pd)
                    } else {
                        const errText = await parseRes.text()
                        console.error('[Process] Upstage PPT error:', parseRes.status, errText.slice(0, 500))
                    }
                } catch (pptErr) {
                    console.error('[Process] PPT parse error:', pptErr)
                }
            }

        } else if (ext === 'pdf') {
            // PDF: pdf-parse로 텍스트 추출 (무료, 로컬, 페이지 무제한)
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const pdfParse = require('pdf-parse')
                const buffer = Buffer.from(await fileData.arrayBuffer())
                const pdfData = await pdfParse(buffer)
                textContent = (pdfData.text || '')
                    .replace(/\n{3,}/g, '\n\n')
                    .replace(/[ \t]{2,}/g, ' ')
                    .trim()
                console.log('[Process] PDF parsed with pdf-parse, text length:', textContent.length, 'pages:', pdfData.numpages)
            } catch (pdfErr) {
                console.error('[Process] pdf-parse error:', pdfErr instanceof Error ? pdfErr.message : pdfErr)
            }

            // pdf-parse로 텍스트 못 읽은 경우 (스캔 PDF) → Upstage OCR fallback
            if (textContent.trim().length < 200 && process.env.UPSTAGE_API_KEY) {
                console.log('[Process] PDF text too short, falling back to Upstage OCR')
                try {
                    const formData = new FormData()
                    formData.append('document', fileData, source.title)
                    formData.append('model', 'ocr')
                    formData.append('ocr', 'force')
                    const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                        body: formData,
                    })
                    if (parseRes.ok) {
                        const pd = await parseRes.json()
                        const ocrText = extractTextFromUpstage(pd)
                        if (ocrText && ocrText.length > textContent.length) {
                            textContent = ocrText
                            console.log('[Process] PDF Upstage OCR fallback OK, text length:', textContent.length)
                        }
                    } else {
                        const errText = await parseRes.text()
                        console.error('[Process] Upstage PDF fallback error:', parseRes.status, errText.slice(0, 500))
                    }
                } catch (ocrErr) {
                    console.error('[Process] PDF OCR fallback error:', ocrErr)
                }
            }
        } else {
            console.error('[Process] Unsupported file type:', ext)
        }

        if (!textContent.trim()) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', sourceId)
            return NextResponse.json({ error: '텍스트를 추출할 수 없습니다.' }, { status: 400 })
        }

        // 텍스트 → 청크 → 임베딩
        const chunks = splitIntoChunks(textContent)
        console.log(`[Process] Text: ${textContent.length}chars → ${chunks.length} chunks`)
        let successCount = 0

        for (let i = 0; i < chunks.length; i++) {
            try {
                const embedding = await generateEmbedding(chunks[i])
                if (!embedding || embedding.length === 0) {
                    console.error(`[Process] Chunk ${i}: empty embedding returned`)
                    continue
                }
                await admin.from('knowledge_chunks').insert({
                    source_id: sourceId,
                    mentor_id: mentorId,
                    content: chunks[i],
                    embedding,
                    chunk_index: i,
                })
                successCount++
            } catch (embErr) {
                console.error(`[Process] Chunk ${i}/${chunks.length} failed:`, embErr instanceof Error ? embErr.message : embErr)
            }
        }
        console.log(`[Process] Embedding result: ${successCount}/${chunks.length} chunks OK`)

        await admin.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: successCount,
                content: textContent,
            })
            .eq('id', sourceId)

        return NextResponse.json({
            success: true,
            chunksProcessed: successCount,
            totalChunks: chunks.length,
            totalCharacters: textContent.length,
        })
    } catch (error: unknown) {
        console.error('[Process API] Error:', error)
        const message = error instanceof Error ? error.message : '처리 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
