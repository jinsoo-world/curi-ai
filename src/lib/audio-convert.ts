/**
 * 🔧 WebM → WAV 변환 유틸 (네이티브 AudioContext 사용)
 * 외부 의존성 없이 브라우저 네이티브 API만 사용
 * 업로드 시점에 1회 실행 → MiniMax voice-cloning 호환 보장
 */

/**
 * AudioBuffer → WAV Blob 변환
 * 표준 RIFF/WAVE 헤더를 DataView로 직접 작성
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = 1 // mono (음성 클로닝에 최적)
    const sampleRate = 16000 // 16kHz (음성 클로닝 표준)
    const bitsPerSample = 16

    // 원본 AudioBuffer에서 mono 채널 추출
    const originalData = buffer.getChannelData(0)

    // 리샘플링: 원본 sampleRate → 16kHz
    const ratio = buffer.sampleRate / sampleRate
    const newLength = Math.round(originalData.length / ratio)
    const resampledData = new Float32Array(newLength)
    for (let i = 0; i < newLength; i++) {
        const srcIdx = Math.min(Math.round(i * ratio), originalData.length - 1)
        resampledData[i] = originalData[srcIdx]
    }

    // Float32 → Int16 PCM 변환
    const bytesPerSample = bitsPerSample / 8
    const dataLength = resampledData.length * bytesPerSample
    const headerLength = 44
    const totalLength = headerLength + dataLength

    const arrayBuffer = new ArrayBuffer(totalLength)
    const view = new DataView(arrayBuffer)

    // ── RIFF 헤더 ──
    writeString(view, 0, 'RIFF')
    view.setUint32(4, totalLength - 8, true) // file size - 8
    writeString(view, 8, 'WAVE')

    // ── fmt 청크 ──
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true) // chunk size
    view.setUint16(20, 1, true) // PCM format
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true) // byte rate
    view.setUint16(32, numChannels * bytesPerSample, true) // block align
    view.setUint16(34, bitsPerSample, true)

    // ── data 청크 ──
    writeString(view, 36, 'data')
    view.setUint32(40, dataLength, true)

    // PCM 데이터 쓰기
    let offset = 44
    for (let i = 0; i < resampledData.length; i++) {
        const sample = Math.max(-1, Math.min(1, resampledData[i]))
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        view.setInt16(offset, int16, true)
        offset += 2
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/** DataView에 ASCII 문자열 쓰기 */
function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
    }
}

/**
 * WebM/OGG 오디오 파일을 WAV로 변환
 * 브라우저 네이티브 AudioContext.decodeAudioData() 사용
 */
export async function convertWebmToWav(file: File): Promise<File> {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''

    // 이미 MiniMax 호환 포맷이면 변환 불필요
    if (['wav', 'mp3', 'm4a'].includes(ext)) {
        return file
    }

    console.log(`[AudioConvert] ${ext} → wav 변환 시작 (${(file.size / 1024).toFixed(1)}KB)`)

    const arrayBuffer = await file.arrayBuffer()
    const AudioCtx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext
    if (!AudioCtx) throw new Error('AudioContext 미지원 브라우저')
    const audioCtx = new AudioCtx({ sampleRate: 16000 })

    try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        const wavBlob = audioBufferToWav(audioBuffer)

        const baseName = file.name.replace(/\.[^.]+$/, '')
        const wavFile = new File([wavBlob], `${baseName}.wav`, { type: 'audio/wav' })

        console.log(`[AudioConvert] 변환 완료: ${(wavFile.size / 1024).toFixed(1)}KB`)
        return wavFile
    } finally {
        await audioCtx.close()
    }
}

/** MiniMax voice-cloning 미지원 포맷 여부 확인 */
export function needsConversion(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    return ['webm', 'ogg', 'opus', 'weba'].includes(ext)
}
