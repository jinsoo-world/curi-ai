'use client'
// 「내 폴더」 탭 — 내 컴퓨터 폴더를 골라 그 안의 문서를 봇에게 한 번에 넣는다.
//
// 크롬, 엣지, 설치형 앱(PWA) = 폴더 손잡이를 이 기기에 넣어 두고 「다시 훑기」로 새로 생겼거나 바뀐 파일만 골라 준다.
// 사파리, 파이어폭스 = 폴더를 한 번에 올리기만 된다(손잡이를 못 남겨 다시 훑기는 안 된다).
//
// 🔒 폴더 안 파일 이름은 서버에 먼저 보내지 않는다. 사용자가 체크한 파일만 기존 업로드 창구(upload-url → 저장소 → process)로 올라간다.
// ⚠️ 브라우저는 뒤에서 폴더를 계속 지켜볼 수 없다. 「열 때마다 훑기」 토글까지가 한계. 자동 감시는 설치형 데스크톱 앱에서 가능.

import { useCallback, useEffect, useRef, useState } from 'react'
import { osTrack } from '@/domains/os/events'
import {
    FOLDER_MAX_FILES, FOLDER_MAX_FILE_BYTES, 폴더대상확장자,
    applyLimits, pickChanged, walkDirectory, fromFileList,
    readSeen, addSeen, readAutoScan, saveAutoScan, folderNameKey,
    saveDirHandle, loadDirHandle, formatBytes,
    type DirHandleLike, type FolderFile,
} from '@/domains/os/folder'

type Row = FolderFile<File>

interface Props {
    mentorId: string
    /** 자료가 하나 들어갈 때마다 (목록 새로고침용) */
    onAdded: () => void | Promise<void>
    /** 올리는 중인지 부모에게 알린다 (탭·닫기 잠금용) */
    onBusy: (busy: boolean) => void
    /** 전부 다 넣었을 때 (시트 닫기용) */
    onDone: () => void
}

/** 브라우저가 폴더 고르기 창을 여는 함수. 타입 라이브러리에 아직 없어 여기서 작게 적는다 */
type PickerWindow = Window & {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirHandleLike<File>>
}

/**
 * 파일 하나를 봇에게 넣는다. 「파일」 탭과 같은 세 단계 = ①올릴 주소 받기 ②저장소에 바로 올리기 ③글 뽑기.
 * 실패하면 사람 말로 된 Error 를 던진다.
 */
export async function uploadFileToBot(mentorId: string, file: File): Promise<void> {
    const r1 = await fetch('/api/os/knowledge/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId, fileName: file.name, fileSize: file.size }),
    })
    const d1 = await r1.json().catch(() => ({}))
    if (!r1.ok) throw new Error(d1.error || '올릴 자리를 못 만들었어요')

    const up = await fetch(d1.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
    })
    if (!up.ok) throw new Error('파일을 못 올렸어요')

    const r2 = await fetch('/api/creator/knowledge/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: d1.sourceId, mentorId }),
    })
    const d2 = await r2.json().catch(() => ({}))
    if (!r2.ok) throw new Error(d2.error || '봇이 파일을 못 읽었어요')
}

const 날짜 = (ms: number) =>
    new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const store = () => (typeof window === 'undefined' ? null : window.localStorage)

export default function FolderSync({ mentorId, onAdded, onBusy, onDone }: Props) {
    /** 이 브라우저가 폴더 손잡이를 지원하는가 (크롬, 엣지, 설치형 앱). 이 시트는 단추를 눌러야 열리므로 서버에서는 그려지지 않는다 */
    const [canPick] = useState(() => typeof (window as PickerWindow).showDirectoryPicker === 'function')
    const [folderName, setFolderName] = useState<string | null>(() => {
        try { return store()?.getItem(folderNameKey(mentorId)) ?? null } catch { return null }
    })
    const [hasHandle, setHasHandle] = useState(false)
    const [autoScan, setAutoScan] = useState(() => readAutoScan(mentorId, store()))

    const [rows, setRows] = useState<Row[]>([])
    const [checked, setChecked] = useState<Set<string>>(new Set())
    /** 훑은 결과 안내: 이미 올린 것, 너무 큰 것, 상한 넘친 것 */
    const [skipped, setSkipped] = useState({ seen: 0, tooBig: 0, overflow: 0 })
    const [allRows, setAllRows] = useState<Row[] | null>(null)

    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const 잠금 = useCallback((b: boolean) => { setBusy(b); onBusy(b) }, [onBusy])

    /** 훑은 파일에 상한과 「이미 올린 것 빼기」를 적용해 목록으로 만든다 */
    const 목록만들기 = useCallback((found: Row[]) => {
        const 상한 = applyLimits(found)
        const 바뀐것 = pickChanged(상한.kept, readSeen(mentorId, store()))
        setAllRows(상한.kept)
        setRows(바뀐것)
        setChecked(new Set(바뀐것.map(r => r.path)))
        setSkipped({ seen: 상한.kept.length - 바뀐것.length, tooBig: 상한.tooBig.length, overflow: 상한.overflow })
        setMsg(null)
        setErr(found.length === 0 ? `이 폴더에는 넣을 수 있는 문서가 없어요 (${폴더대상확장자.join(', ')})` : null)
    }, [mentorId])

    /** 손잡이로 폴더를 훑는다. 권한이 없으면 다시 묻는다 */
    const 손잡이로훑기 = useCallback(async (handle: DirHandleLike<File>, 권한묻기: boolean) => {
        let 권한: PermissionState = 'granted'
        if (handle.queryPermission) 권한 = await handle.queryPermission({ mode: 'read' })
        if (권한 !== 'granted' && 권한묻기 && handle.requestPermission) 권한 = await handle.requestPermission({ mode: 'read' })
        if (권한 !== 'granted') {
            setErr('폴더를 다시 읽을 권한이 필요해요. 「다시 훑기」를 눌러 허용해 주세요')
            return
        }
        setMsg('폴더를 훑는 중이에요…'); setErr(null)
        try {
            const found = await walkDirectory(handle)
            목록만들기(found)
        } catch {
            setMsg(null)
            setErr('폴더를 읽지 못했어요. 폴더를 다시 골라 주세요')
        }
    }, [목록만들기])

    // 처음 열릴 때: 넣어 둔 손잡이가 있는지 본다. 「열 때마다 훑기」가 켜져 있고 권한이 살아 있으면 바로 훑는다
    useEffect(() => {
        if (!canPick) return
        let 살아있음 = true
        void (async () => {
            const h = await loadDirHandle<DirHandleLike<File>>(mentorId)
            if (!살아있음 || !h) return
            setHasHandle(true)
            if (readAutoScan(mentorId, store())) await 손잡이로훑기(h, false)
        })()
        return () => { 살아있음 = false }
    }, [mentorId, canPick, 손잡이로훑기])

    const 폴더고르기 = async () => {
        const w = window as PickerWindow
        if (!w.showDirectoryPicker) return
        let handle: DirHandleLike<File>
        try {
            handle = await w.showDirectoryPicker({ mode: 'read', id: 'curi-os-folder' })
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return   // 창을 그냥 닫았다
            setErr('폴더 고르기 창을 열 수 없어요'); return
        }
        await saveDirHandle(mentorId, handle)
        setHasHandle(true)
        setFolderName(handle.name)
        try { store()?.setItem(folderNameKey(mentorId), handle.name) } catch { /* 무시 */ }
        await 손잡이로훑기(handle, true)
    }

    const 다시훑기 = async () => {
        const h = await loadDirHandle<DirHandleLike<File>>(mentorId)
        if (!h) { setHasHandle(false); setErr('넣어 둔 폴더가 없어요. 폴더를 다시 골라 주세요'); return }
        await 손잡이로훑기(h, true)
    }

    // 사파리, 파이어폭스: input 에 webkitdirectory 를 붙인다 (React 속성 이름으로는 못 넣는다)
    useEffect(() => {
        const el = inputRef.current
        if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', '') }
    }, [canPick])

    const 입력으로받기 = (list: FileList | null) => {
        if (!list || list.length === 0) return
        const found = fromFileList(Array.from(list))
        const 첫경로 = list[0].webkitRelativePath
        setFolderName(첫경로 ? 첫경로.split('/')[0] : null)
        목록만들기(found)
    }

    const 토글 = () => {
        const next = saveAutoScan(mentorId, !autoScan, store())
        setAutoScan(next)
    }

    const 체크바꾸기 = (path: string) => setChecked(prev => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path); else next.add(path)
        return next
    })
    const 전부 = (on: boolean) => setChecked(on ? new Set(rows.map(r => r.path)) : new Set())

    /** 이미 올린 파일도 목록에 다시 넣는다 (체크는 꺼진 채로) */
    const 이미올린것도보기 = () => {
        if (!allRows) return
        setRows(allRows)
        setSkipped(s => ({ ...s, seen: 0 }))
    }

    /** 체크한 파일을 차례로 넣는다. 실패한 파일만 목록에 남겨 다시 시도할 수 있게 한다 */
    const 넣기 = async () => {
        const 대상 = rows.filter(r => checked.has(r.path))
        if (대상.length === 0) return
        잠금(true); setErr(null)
        const 성공: Row[] = []
        const 실패: { row: Row; why: string }[] = []
        for (const [i, row] of 대상.entries()) {
            setMsg(`${대상.length}개 중 ${i + 1}번째를 넣는 중이에요… (${row.name})`)
            try {
                await uploadFileToBot(mentorId, row.file)
                성공.push(row)
                osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'folder' })
                await onAdded()
            } catch (e) {
                실패.push({ row, why: e instanceof Error ? e.message : '넣지 못했어요' })
            }
        }
        if (성공.length > 0) addSeen(mentorId, 성공, store())
        잠금(false)
        if (실패.length === 0) {
            setRows([]); setChecked(new Set())
            setMsg(`${성공.length}개 다 넣었어요`)
            setTimeout(onDone, 700)
            return
        }
        const 남은 = 실패.map(f => f.row)
        setRows(남은)
        setChecked(new Set(남은.map(r => r.path)))
        setMsg(성공.length > 0 ? `${대상.length}개 중 ${성공.length}개 넣었어요` : null)
        setErr(`${실패.length}개는 못 넣었어요. 남긴 파일만 다시 「넣기」를 눌러 주세요. (${실패[0].why})`)
    }

    const 고른수 = rows.filter(r => checked.has(r.path)).length

    return (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                선택한 파일만 봇에게 올라가요. 폴더 목록은 이 기기에만 남아요.
            </div>

            {canPick ? (
                <>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="os-btn primary" style={{ flex: 1 }} disabled={busy} onClick={() => void 폴더고르기()}>
                            {folderName && hasHandle ? '다른 폴더 고르기' : '폴더 고르기'}
                        </button>
                        {hasHandle && (
                            <button type="button" className="os-btn" style={{ flex: 1 }} disabled={busy} onClick={() => void 다시훑기()}>
                                다시 훑기
                            </button>
                        )}
                    </div>
                    {hasHandle && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {folderName ? `폴더: ${folderName}` : '넣어 둔 폴더'}
                            </span>
                            <span style={{ color: 'var(--os-글-흐림)', fontSize: 13 }}>열 때마다 훑기</span>
                            <button type="button" className="os-routine-switch" role="switch" aria-checked={autoScan} aria-label="열 때마다 훑기"
                                data-on={autoScan ? 'true' : 'false'} disabled={busy} onClick={토글}><span /></button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
                        onChange={e => { 입력으로받기(e.target.files); e.target.value = '' }} />
                    <button type="button" className="os-btn primary" style={{ width: '100%' }} disabled={busy} onClick={() => inputRef.current?.click()}>
                        폴더 고르기
                    </button>
                    <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                        이 브라우저는 폴더를 한 번에 올리기만 돼요. 새 파일만 골라 주는 「다시 훑기」는 크롬이나 엣지에서 할 수 있어요.
                    </div>
                </>
            )}

            <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                하위 폴더까지 훑어요. {폴더대상확장자.join(', ')} 파일만, 하나 {formatBytes(FOLDER_MAX_FILE_BYTES)} 까지, 한 번에 {FOLDER_MAX_FILES}개까지 보여요.
            </div>

            {(skipped.seen > 0 || skipped.tooBig > 0 || skipped.overflow > 0) && (
                <div style={{ color: 'var(--os-글-연)', fontSize: 13, lineHeight: 1.6 }}>
                    {skipped.seen > 0 && (
                        <div>
                            이미 올린 {skipped.seen}개는 뺐어요.{' '}
                            <button type="button" className="os-linkbtn" style={{ width: 'auto', padding: 0, fontSize: 13 }} disabled={busy} onClick={이미올린것도보기}>이미 올린 것도 보기</button>
                        </div>
                    )}
                    {skipped.tooBig > 0 && <div>{formatBytes(FOLDER_MAX_FILE_BYTES)} 넘는 파일 {skipped.tooBig}개는 못 넣어요.</div>}
                    {skipped.overflow > 0 && <div>{FOLDER_MAX_FILES}개가 넘어 최근에 고친 것부터 보여요. 나머지 {skipped.overflow}개는 다음에 다시 훑어 주세요.</div>}
                </div>
            )}

            {rows.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                        <span style={{ flex: 1 }}>{rows.length}개 중 {고른수}개 골랐어요</span>
                        <button type="button" className="os-linkbtn" style={{ width: 'auto', padding: 0, fontSize: 13 }} disabled={busy} onClick={() => 전부(true)}>전부 선택</button>
                        <button type="button" className="os-linkbtn" style={{ width: 'auto', padding: 0, fontSize: 13 }} disabled={busy} onClick={() => 전부(false)}>전부 해제</button>
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {rows.map(r => (
                            <label key={r.path} className="os-source" style={{ cursor: busy ? 'default' : 'pointer' }}>
                                <input type="checkbox" checked={checked.has(r.path)} disabled={busy} onChange={() => 체크바꾸기(r.path)}
                                    aria-label={`${r.path} 넣기`} style={{ width: 18, height: 18, flex: '0 0 auto' }} />
                                <span className="os-source-title" title={r.path}>{r.path}</span>
                                <span className="os-source-state">{formatBytes(r.size)}, {날짜(r.lastModified)}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {msg && <div className="os-notice" style={{ margin: 0, background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{msg}</div>}
            {err && <div className="os-notice" style={{ margin: 0 }}>{err}</div>}

            {rows.length > 0 && (
                <button type="button" className="os-btn primary" style={{ width: '100%' }} disabled={busy || 고른수 === 0} onClick={() => void 넣기()}>
                    {busy ? '넣는 중…' : `고른 파일 넣기 (${고른수}개)`}
                </button>
            )}
        </div>
    )
}
