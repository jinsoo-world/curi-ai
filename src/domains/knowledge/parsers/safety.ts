// 파일 읽기 전 안전 점검: 압축 폭탄, 암호 걸린 파일, 너무 긴 글.
import { createInflateRaw } from 'zlib'
import * as XLSX from 'xlsx'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_TEXT_CHARS = 500_000
export const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024
export const MAX_ZIP_RATIO = 100
const 길어서잘림 = '\n\n[글이 너무 길어 앞부분 50만 자만 읽었어요]'

export class PasswordProtectedError extends Error {
    constructor(message = '암호가 걸린 파일입니다') {
        super(message)
        this.name = 'PasswordProtectedError'
    }
}

export class UnsafeFileError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'UnsafeFileError'
    }
}

/** 뽑은 글이 50만 자를 넘으면 앞부분만 두고 그렇다고 표시한다 */
export function limitText(text: string): { text: string; truncated: boolean } {
    if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false }
    return { text: text.slice(0, MAX_TEXT_CHARS) + 길어서잘림, truncated: true }
}

/**
 * zip(xlsx·docx·pptx·hwpx) 을 파서에 넘기기 전에 실제로 풀어 보며 바이트만 센다.
 * 목차(중앙 디렉터리)에 적힌 풀린 크기는 거짓일 수 있어(408KB 가 400MB 로 풀린 사례) 믿지 않는다.
 * - deflate 항목: 흐름 방식 inflate 로 풀며 세다가 누적이 한도를 넘는 순간 중단 (메모리는 조각 하나만)
 * - stored(무압축) 항목: 압축 크기 그대로
 * - 그 밖의 압축 방식·zip64: 거절
 * 한도: 풀린 크기 합계 200MB, 압축률 100배. zip 이 아니면 아무 일도 안 한다.
 */
export async function assertZipSafe(
    buffer: Buffer,
    opts: { maxUnzipped?: number; maxRatio?: number } = {},
): Promise<void> {
    const maxUnzipped = opts.maxUnzipped ?? MAX_UNZIPPED_BYTES
    const maxRatio = opts.maxRatio ?? MAX_ZIP_RATIO
    if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return
    let eocd = -1
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) return // 목차가 없으면 읽는 쪽 라이브러리가 알아서 실패한다
    const count = buffer.readUInt16LE(eocd + 10)
    let off = buffer.readUInt32LE(eocd + 16)
    let total = 0
    for (let n = 0; n < count; n++) {
        if (off + 46 > buffer.length || buffer.readUInt32LE(off) !== 0x02014b50) break
        const method = buffer.readUInt16LE(off + 10)
        const compSize = buffer.readUInt32LE(off + 20)
        const lho = buffer.readUInt32LE(off + 42)
        off += 46 + buffer.readUInt16LE(off + 28) + buffer.readUInt16LE(off + 30) + buffer.readUInt16LE(off + 32)
        if (compSize === 0xffffffff || lho === 0xffffffff) throw new UnsafeFileError('zip64 파일은 읽지 않습니다')
        if (method === 0) {
            total += compSize
        } else if (method === 8) {
            if (lho + 30 > buffer.length || buffer.readUInt32LE(lho) !== 0x04034b50) throw new UnsafeFileError('깨진 압축 파일입니다')
            const start = lho + 30 + buffer.readUInt16LE(lho + 26) + buffer.readUInt16LE(lho + 28)
            if (start + compSize > buffer.length) throw new UnsafeFileError('깨진 압축 파일입니다')
            total += await countInflated(buffer.subarray(start, start + compSize), maxUnzipped - total)
        } else {
            throw new UnsafeFileError('지원하지 않는 압축 방식입니다')
        }
        if (total > maxUnzipped) throw new UnsafeFileError(`압축을 풀면 ${maxUnzipped / 1048576}MB 를 넘어 너무 큽니다`)
    }
    if (total / Math.max(buffer.length, 1) > maxRatio) throw new UnsafeFileError('압축률이 비정상적으로 높은 파일입니다')
}

/** deflate 조각을 흐름으로 풀어 바이트만 센다. limit 를 넘는 순간 멈추고 limit+1 이상을 돌려준다 */
function countInflated(data: Buffer, limit: number): Promise<number> {
    return new Promise((resolve) => {
        const inflate = createInflateRaw()
        let n = 0
        let done = false
        const finish = (v: number) => { if (!done) { done = true; inflate.destroy(); resolve(v) } }
        inflate.on('data', (c: Buffer) => {
            n += c.length
            if (n > limit) finish(n)
        })
        inflate.on('end', () => finish(n))
        inflate.on('error', () => finish(n)) // 깨진 조각은 읽는 쪽 파서가 실패시킨다
        inflate.end(data)
    })
}

const 암호문구 = /password|passphrase|encrypt|암호/i

/** 읽다 난 오류가 암호 때문이면 PasswordProtectedError 로 바꿔 돌려준다. 아니면 원래 오류 */
export function asPasswordError(err: unknown): unknown {
    if (err instanceof PasswordProtectedError) return err
    const e = err as { name?: string; code?: string; message?: string } | null
    if (e?.name === 'PasswordException' || e?.code === 'ENCRYPTED' || (typeof e?.message === 'string' && 암호문구.test(e.message))) {
        return new PasswordProtectedError()
    }
    return err
}

/**
 * 암호가 걸렸는지 파일 머리만 보고 미리 안다 (업스테이지 비용을 쓰기 전에).
 * - docx·xlsx·pptx: 암호를 걸면 zip 이 아니라 옛 컨테이너(D0CF)에 EncryptedPackage 가 들어간다
 * - doc: 문서 머리 표시의 암호 비트
 * - hwp 5.0: 파일 머리의 암호 비트
 * 그 밖(pdf, xls, hwpx)은 읽다가 나는 오류로 가른다(asPasswordError).
 */
export function detectPasswordProtected(ext: string, buffer: Buffer): boolean {
    const e = ext.toLowerCase()
    const ole = buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0
    if (!ole) return false
    try {
        if (['docx', 'xlsx', 'pptx'].includes(e)) {
            return buffer.includes(Buffer.from('EncryptedPackage', 'utf16le'))
        }
        const cfb = XLSX.CFB.read(buffer, { type: 'buffer' })
        const bytes = (p: string) => {
            const c = (XLSX.CFB.find(cfb, p) as { content?: ArrayLike<number> } | null)?.content
            return c ? Buffer.from(c as Uint8Array) : null
        }
        if (e === 'doc') {
            const w = bytes('WordDocument')
            return !!w && w.length > 12 && (w.readUInt16LE(0x0a) & 0x0100) !== 0
        }
        if (e === 'hwp') {
            const h = bytes('FileHeader')
            return !!h && h.length >= 40 && (h.readUInt32LE(36) & 0x2) !== 0
        }
    } catch {
        return false
    }
    return false
}
