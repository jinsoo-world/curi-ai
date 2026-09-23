// domains/os/folder — 「내 폴더」 연동에서 쓰는 「셈만 하는」 함수들.
//
// 대표 지시(2026-09-23) 「내 폴더 연동하는 기능도 추가해. 클로드코드처럼.
// 그 폴더 내의 파일들을 자동으로 탐색해서 긁어오는 게 필요해.」
//
// 여기는 브라우저를 직접 만지지 않는다. 폴더 손잡이(핸들)·파일 목록은 화면(FolderSync.tsx)이 넘겨 주고,
// 여기서는 「어느 파일을 올릴지」「무엇이 새로 생겼거나 바뀌었는지」「몇 개까지인지」만 정한다.
// 시험에서는 가짜 손잡이·가짜 창고를 넘긴다.
//
// 🔒 개인정보: 폴더 안 파일 이름은 서버에 먼저 보내지 않는다. 사용자가 체크한 파일만 기존 업로드 창구로 올라간다.
//    「본 파일 지문」도 이 기기(localStorage)에만 남는다.

import { 올릴수있는파일 } from '@/domains/knowledge/files'

/* ────────────────────────── 대상 파일 ────────────────────────── */

/**
 * 폴더에서 긁어올 확장자. 대표 지시 목록(md txt pdf docx hwp hwpx pptx xlsx csv html) 중
 * 서버(`올릴수있는파일`)가 실제로 글자를 뽑을 수 있는 것만 남긴다.
 * html 은 서버가 아직 못 읽어 빠진다. 서버가 배우면 여기서 자동으로 살아난다.
 */
const 희망목록 = ['md', 'txt', 'pdf', 'docx', 'hwp', 'hwpx', 'pptx', 'xlsx', 'csv', 'html'] as const
export const 폴더대상확장자: readonly string[] = 희망목록.filter(e => (올릴수있는파일 as readonly string[]).includes(e))

/** 파일 하나 상한. 서버 업로드 창구(upload-url)가 10MB 에서 막으므로 그보다 크게 잡지 않는다 */
export const FOLDER_MAX_FILE_BYTES = 10 * 1024 * 1024
/** 한 번에 보여 주는 파일 수 상한 */
export const FOLDER_MAX_FILES = 200

/** 훑지 않는 폴더 이름 (숨김 폴더, 코드 창고) */
const 건너뛸폴더 = new Set(['node_modules', '__pycache__', '.git', 'dist', 'build'])

export function 확장자(name: string): string {
    const 점 = name.lastIndexOf('.')
    return 점 > 0 ? name.slice(점 + 1).toLowerCase() : ''
}

/** 이 파일을 봇에게 올릴 후보로 볼 것인가 (숨김 파일 제외, 대상 확장자만) */
export function isTargetFile(name: string): boolean {
    if (!name || name.startsWith('.') || name.startsWith('~$')) return false
    return 폴더대상확장자.includes(확장자(name))
}

/** 이 폴더는 들어가지 않는다 (숨김 폴더, node_modules 같은 코드 창고) */
export function shouldSkipDir(name: string): boolean {
    return name.startsWith('.') || 건너뛸폴더.has(name)
}

/* ────────────────────────── 파일 한 줄 ────────────────────────── */

/** 브라우저 File 에서 우리가 쓰는 부분만. 시험에서는 이 모양의 가짜를 넘긴다 */
export interface FileLike {
    name: string
    size: number
    lastModified: number
}

/** 훑어서 나온 파일 한 줄. `path` 는 고른 폴더 기준 상대 경로(예: 강의/8월.md) */
export interface FolderFile<F extends FileLike = FileLike> {
    path: string
    name: string
    size: number
    lastModified: number
    file: F
}

/** 「같은 파일인가, 바뀌었는가」를 판별하는 지문. 경로 + 크기 + 수정 시각 */
export function fingerprint(f: Pick<FolderFile, 'path' | 'size' | 'lastModified'>): string {
    return `${f.path}|${f.size}|${f.lastModified}`
}

/** 지문에서 경로만 되찾는다 (뒤의 「|크기|시각」 두 칸을 뗀다) */
export function pathOfFingerprint(fp: string): string {
    return fp.replace(/\|\d+\|\d+$/, '')
}

/** 지난번에 본 지문 목록과 대조해 새로 생겼거나 바뀐 파일만 남긴다 */
export function pickChanged<F extends FileLike>(files: FolderFile<F>[], seen: Iterable<string>): FolderFile<F>[] {
    const 본것 = seen instanceof Set ? seen : new Set(seen)
    return files.filter(f => !본것.has(fingerprint(f)))
}

/** 상한을 적용한 결과 */
export interface LimitResult<F extends FileLike> {
    kept: FolderFile<F>[]
    /** 너무 커서 뺀 파일 */
    tooBig: FolderFile<F>[]
    /** 개수 상한에 걸려 뒤로 밀린 개수 */
    overflow: number
}

/** 파일당 크기 상한과 총 개수 상한을 적용한다. 최근에 고친 파일이 앞에 온다 */
export function applyLimits<F extends FileLike>(
    files: FolderFile<F>[],
    maxBytes = FOLDER_MAX_FILE_BYTES,
    maxFiles = FOLDER_MAX_FILES,
): LimitResult<F> {
    const tooBig = files.filter(f => f.size > maxBytes)
    const 후보 = files.filter(f => f.size <= maxBytes).sort((a, b) => b.lastModified - a.lastModified)
    return {
        kept: 후보.slice(0, maxFiles),
        tooBig,
        overflow: Math.max(0, 후보.length - maxFiles),
    }
}

/* ────────────────────────── 폴더 훑기 ────────────────────────── */

/**
 * 브라우저 File System Access API 손잡이 중 우리가 쓰는 부분.
 * (타입 라이브러리에 `values()`·`requestPermission()` 이 아직 없어 여기서 작게 적는다)
 */
export interface FileHandleLike<F extends FileLike = FileLike> {
    kind: 'file'
    name: string
    getFile(): Promise<F>
}
export interface DirHandleLike<F extends FileLike = FileLike> {
    kind: 'directory'
    name: string
    values(): AsyncIterable<FileHandleLike<F> | DirHandleLike<F>>
    queryPermission?(opts?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission?(opts?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

/**
 * 폴더를 하위 폴더까지 재귀로 훑어 대상 파일만 모은다.
 * 개수 상한의 3배까지만 읽고 멈춘다(수천 개 폴더를 끝까지 읽어 굳지 않게).
 */
export async function walkDirectory<F extends FileLike>(
    root: DirHandleLike<F>,
    opts: { maxDepth?: number; hardStop?: number } = {},
): Promise<FolderFile<F>[]> {
    const maxDepth = opts.maxDepth ?? 8
    const hardStop = opts.hardStop ?? FOLDER_MAX_FILES * 3
    const out: FolderFile<F>[] = []

    async function 들어가기(dir: DirHandleLike<F>, prefix: string, depth: number) {
        if (depth > maxDepth || out.length >= hardStop) return
        for await (const h of dir.values()) {
            if (out.length >= hardStop) return
            if (h.kind === 'directory') {
                if (!shouldSkipDir(h.name)) await 들어가기(h, `${prefix}${h.name}/`, depth + 1)
                continue
            }
            if (!isTargetFile(h.name)) continue
            const file = await h.getFile()
            out.push({ path: `${prefix}${h.name}`, name: h.name, size: file.size, lastModified: file.lastModified, file })
        }
    }

    await 들어가기(root, '', 0)
    return out
}

/**
 * `<input type="file" webkitdirectory>` 로 받은 파일 목록을 같은 모양으로 바꾼다 (사파리·파이어폭스 대체 경로).
 * 상대 경로는 `webkitRelativePath` 에서 오고, 없으면 파일 이름만 쓴다.
 */
export function fromFileList<F extends FileLike & { webkitRelativePath?: string }>(files: Iterable<F>): FolderFile<F>[] {
    const out: FolderFile<F>[] = []
    for (const f of files) {
        const rel = f.webkitRelativePath || f.name
        // 맨 앞 조각은 고른 폴더 이름이라 뗀다(폴더 손잡이 경로와 모양을 맞춘다)
        const 조각 = rel.split('/')
        const path = 조각.length > 1 ? 조각.slice(1).join('/') : rel
        const 폴더들 = 조각.slice(1, -1)
        if (폴더들.some(shouldSkipDir)) continue
        if (!isTargetFile(f.name)) continue
        out.push({ path, name: f.name, size: f.size, lastModified: f.lastModified, file: f })
    }
    return out
}

/* ────────────────────────── 이 기기에 남기는 기억 ────────────────────────── */

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** 지난번에 올린 파일 지문 열쇠 (봇마다 따로) */
export const seenKey = (mentorId: string) => `curi_os_folder_seen:${mentorId}`
/** 「열 때마다 훑기」 토글 열쇠 */
export const autoScanKey = (mentorId: string) => `curi_os_folder_auto:${mentorId}`
/** 지난번 고른 폴더 이름 (화면에 보여 주기용) */
export const folderNameKey = (mentorId: string) => `curi_os_folder_name:${mentorId}`

/** 지난번에 올린 파일 지문을 읽는다. 저장이 막혀 있어도(사파리 비공개) 빈 목록으로 산다 */
export function readSeen(mentorId: string, store?: Store | null): Set<string> {
    try {
        const raw = store?.getItem(seenKey(mentorId))
        const arr = raw ? JSON.parse(raw) : []
        return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
    } catch {
        return new Set()
    }
}

/** 올린 파일 지문을 더해 저장한다. 같은 경로의 옛 지문은 새 지문으로 바꾼다 */
export function addSeen(mentorId: string, uploaded: Pick<FolderFile, 'path' | 'size' | 'lastModified'>[], store?: Store | null): Set<string> {
    const 지금 = readSeen(mentorId, store)
    const 새경로 = new Set(uploaded.map(f => f.path))
    // 같은 경로의 옛 지문 제거 (수정된 파일은 지문이 바뀌므로 옛 것을 남기면 목록이 계속 자란다)
    for (const fp of Array.from(지금)) {
        if (새경로.has(pathOfFingerprint(fp))) 지금.delete(fp)
    }
    for (const f of uploaded) 지금.add(fingerprint(f))
    try {
        store?.setItem(seenKey(mentorId), JSON.stringify(Array.from(지금)))
    } catch { /* 저장이 막혀도 이번 화면에는 적용된다 */ }
    return 지금
}

export function readAutoScan(mentorId: string, store?: Store | null): boolean {
    try { return store?.getItem(autoScanKey(mentorId)) === '1' } catch { return false }
}
export function saveAutoScan(mentorId: string, on: boolean, store?: Store | null): boolean {
    try { store?.setItem(autoScanKey(mentorId), on ? '1' : '0') } catch { /* 무시 */ }
    return on
}

/* ────────────────────────── 폴더 손잡이 보관 (IndexedDB, 라이브러리 없이) ────────────────────────── */

const DB_NAME = 'curi_os_folder'
const STORE = 'handles'

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1)
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

/** 폴더 손잡이를 이 기기에 넣어 둔다. 실패해도 조용히 false (다음에 다시 고르면 된다) */
export async function saveDirHandle(mentorId: string, handle: unknown, idb: IDBFactory | undefined = globalThis.indexedDB): Promise<boolean> {
    if (!idb) return false
    try {
        const db = await openDb(idb)
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).put(handle, mentorId)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
        db.close()
        return true
    } catch {
        return false
    }
}

/** 넣어 둔 폴더 손잡이를 꺼낸다. 없거나 막혀 있으면 null */
export async function loadDirHandle<T = unknown>(mentorId: string, idb: IDBFactory | undefined = globalThis.indexedDB): Promise<T | null> {
    if (!idb) return null
    try {
        const db = await openDb(idb)
        const v = await new Promise<unknown>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly')
            const req = tx.objectStore(STORE).get(mentorId)
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
        db.close()
        return (v as T) ?? null
    } catch {
        return null
    }
}

/** 크기를 사람 말로 (1.2MB, 340KB) */
export function formatBytes(n: number): string {
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
    if (n >= 1024) return `${Math.round(n / 1024)}KB`
    return `${n}B`
}
