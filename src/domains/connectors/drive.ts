// domains/connectors — 구글 드라이브 읽기(갈래 G, drive.readonly).
//
// 여기는 순수한 REST 호출만 한다(googleapis 같은 무거운 SDK를 새로 넣지 않는다 — 이 파일들처럼 raw fetch).
// 「폴더를 고른다 → 그 폴더(하위 폴더 포함) 안 문서를 훑는다 → 지원하는 파일만 내려받는다」 세 단계.
//
// 구글 문서(Docs·Sheets·Slides)는 원본 파일이 없어 파일 그대로 못 받는다. export 로 우리가 이미
// 읽을 수 있는 모양(txt·csv·pdf)으로 바꿔 받는다. 나머지(pdf·docx 등 이미 올라와 있는 파일)는 그대로 받는다.

const API = 'https://www.googleapis.com/drive/v3'
const TIMEOUT_MS = 15_000

/** 한 번에 훑는 폴더(하위 포함) 파일 수 상한. 「내 폴더」 동기화(folder.ts)와 같은 값 */
export const DRIVE_MAX_FILES = 200
/** 폴더 깊이 상한(무한 재귀 방지) */
export const DRIVE_MAX_DEPTH = 8
/** 파일 하나 상한. 서버 처리 파이프라인(process 라우트)과 같은 값 */
export const DRIVE_MAX_FILE_BYTES = 10 * 1024 * 1024

export class DriveAuthExpired extends Error {
    constructor() { super('구글 드라이브 로그인이 끊겼어요') }
}
export class DriveApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message) }
}

export interface DriveFolder {
    id: string
    name: string
}

export interface DriveFile {
    id: string
    /** 폴더 기준 상대 경로 (예: 강의자료/8월.pdf) */
    path: string
    name: string
    mimeType: string
    /** ISO 문자열 */
    modifiedTime: string
    size: number
}

/** 구글 문서류를 우리가 읽을 수 있는 모양으로 내보낼 때 쓰는 표 */
const GOOGLE_NATIVE_EXPORT: Record<string, { mimeType: string; ext: string }> = {
    'application/vnd.google-apps.document': { mimeType: 'text/plain', ext: 'txt' },
    'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', ext: 'csv' },
    'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', ext: 'pdf' },
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'
/** 구글 자체 문서인데 우리가 아직 못 읽는 것(폼, 도면, 사이트 등) */
const isUnsupportedGoogleNative = (mimeType: string) => mimeType.startsWith('application/vnd.google-apps.') && mimeType !== FOLDER_MIME && !GOOGLE_NATIVE_EXPORT[mimeType]

function extOf(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * 지원 형식 판정 — 이 드라이브 파일을 봇 자료로 받을 수 있나.
 * 구글 문서류(Docs·Sheets·Slides)는 export 가능한 것만, 그 외 폴더는 항상 제외, 나머지는 원래 확장자가
 * 서버가 실제로 글자를 뽑을 수 있는 목록(files.ts 의 `올릴수있는파일`)에 있을 때만 받는다.
 * 받을 수 있으면 저장할 때 쓸 확장자를, 아니면 null 을 돌려준다(폴더는 별도로 'FOLDER' 를 돌려준다).
 */
export function resolveDriveExt(mimeType: string, fileName: string, 올릴수있는파일: readonly string[]): string | null | 'FOLDER' {
    if (mimeType === FOLDER_MIME) return 'FOLDER'
    if (isUnsupportedGoogleNative(mimeType)) return null
    const native = GOOGLE_NATIVE_EXPORT[mimeType]
    const ext = native ? native.ext : extOf(fileName)
    return 올릴수있는파일.includes(ext) ? ext : null
}

async function driveFetch(token: string, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
    const res = await fetchImpl(`${API}${path}`, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
    if (res.status === 401) throw new DriveAuthExpired()
    if (!res.ok) throw new DriveApiError(res.status, `드라이브와 이야기하지 못했어요(응답 ${res.status})`)
    return res
}

/** 내가 접근할 수 있는 폴더 목록(고르기 화면용). 하위 폴더까지 다 보여 주지 않고 평평하게 최근 것부터 */
export async function listDriveFolders(token: string, limit = 100, fetchImpl: typeof fetch = fetch): Promise<DriveFolder[]> {
    const q = encodeURIComponent(`mimeType='${FOLDER_MIME}' and trashed=false`)
    const fields = encodeURIComponent('files(id,name)')
    const res = await driveFetch(token, `/files?q=${q}&fields=${fields}&pageSize=${Math.min(limit, 200)}&orderBy=name`, {}, fetchImpl)
    const data = await res.json() as { files?: { id: string; name: string }[] }
    return (data.files ?? []).map(f => ({ id: f.id, name: f.name }))
}

/**
 * 폴더 하나(하위 폴더 포함)를 훑어 지원하는 파일만 모은다.
 * 구글 문서류는 export 가능한 것만 남기고(ext 를 export 결과 기준으로 바꿔서), 나머지는 원래 확장자로 거른다.
 */
export async function listDriveFilesInFolder(
    token: string, folderId: string, 올릴수있는파일: readonly string[],
    opts: { maxFiles?: number; maxDepth?: number; fetchImpl?: typeof fetch } = {},
): Promise<DriveFile[]> {
    const maxFiles = opts.maxFiles ?? DRIVE_MAX_FILES
    const maxDepth = opts.maxDepth ?? DRIVE_MAX_DEPTH
    const fetchImpl = opts.fetchImpl ?? fetch
    const out: DriveFile[] = []

    async function 폴더훑기(id: string, prefix: string, depth: number): Promise<void> {
        if (depth > maxDepth || out.length >= maxFiles) return
        const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,size,trashed)')
        let pageToken = ''
        do {
            const q = encodeURIComponent(`'${id}' in parents and trashed=false`)
            const res = await driveFetch(token, `/files?q=${q}&fields=${fields}&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`, {}, fetchImpl)
            const data = await res.json() as { files?: { id: string; name: string; mimeType: string; modifiedTime: string; size?: string }[]; nextPageToken?: string }
            for (const f of data.files ?? []) {
                if (out.length >= maxFiles) return
                const ext = resolveDriveExt(f.mimeType, f.name, 올릴수있는파일)
                if (ext === 'FOLDER') {
                    await 폴더훑기(f.id, `${prefix}${f.name}/`, depth + 1)
                    continue
                }
                if (!ext) continue
                out.push({
                    id: f.id,
                    path: `${prefix}${f.name}`,
                    name: f.name,
                    mimeType: f.mimeType,
                    modifiedTime: f.modifiedTime,
                    size: Number(f.size ?? 0),
                })
            }
            pageToken = data.nextPageToken ?? ''
        } while (pageToken && out.length < maxFiles)
    }

    await 폴더훑기(folderId, '', 0)
    return out
}

export interface DriveFileContent {
    buffer: Buffer
    /** 저장할 때 쓸 확장자(구글 문서는 export 결과 기준) */
    ext: string
    /** 저장할 때 쓸 파일 이름(확장자 포함) */
    fileName: string
}

/** 파일 하나의 내용을 받는다. 구글 문서류는 export, 그 외는 alt=media 로 그대로 */
export async function fetchDriveFileContent(
    token: string, file: Pick<DriveFile, 'id' | 'name' | 'mimeType'>, fetchImpl: typeof fetch = fetch,
): Promise<DriveFileContent> {
    const native = GOOGLE_NATIVE_EXPORT[file.mimeType]
    const path = native
        ? `/files/${file.id}/export?mimeType=${encodeURIComponent(native.mimeType)}`
        : `/files/${file.id}?alt=media`
    const res = await driveFetch(token, path, {}, fetchImpl)
    const buffer = Buffer.from(await res.arrayBuffer())
    const ext = native ? native.ext : extOf(file.name)
    const baseName = native ? file.name.replace(/\.[^.]+$/, '') : file.name.replace(new RegExp(`\\.${ext}$`, 'i'), '')
    return { buffer, ext, fileName: `${baseName || file.name}.${ext}` }
}
