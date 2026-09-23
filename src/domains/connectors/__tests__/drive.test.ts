// 구글 드라이브 읽기(갈래 G) — 지원 형식 판정, 목록 훑기, 파일 받기. 전부 가짜 fetch 로 인터넷 없이 확인한다.
import { describe, it, expect } from 'vitest'
import {
    resolveDriveExt, listDriveFolders, listDriveFilesInFolder, fetchDriveFileContent, DriveAuthExpired, DriveApiError,
} from '../drive'
import { 올릴수있는파일 } from '@/domains/knowledge/files'

describe('resolveDriveExt — 지원 형식 판정', () => {
    it('폴더는 FOLDER', () => {
        expect(resolveDriveExt('application/vnd.google-apps.folder', '아무이름', 올릴수있는파일)).toBe('FOLDER')
    })

    it('구글 문서류는 우리가 읽을 수 있는 모양으로 바꿔서 받는다', () => {
        expect(resolveDriveExt('application/vnd.google-apps.document', '기획서', 올릴수있는파일)).toBe('txt')
        expect(resolveDriveExt('application/vnd.google-apps.spreadsheet', '정산표', 올릴수있는파일)).toBe('csv')
        expect(resolveDriveExt('application/vnd.google-apps.presentation', '발표자료', 올릴수있는파일)).toBe('pdf')
    })

    it('구글 폼, 도면 같은 아직 못 읽는 구글 문서는 뺀다', () => {
        expect(resolveDriveExt('application/vnd.google-apps.form', '설문', 올릴수있는파일)).toBeNull()
        expect(resolveDriveExt('application/vnd.google-apps.drawing', '도면', 올릴수있는파일)).toBeNull()
    })

    it('보통 파일은 확장자가 목록에 있을 때만 받는다', () => {
        expect(resolveDriveExt('application/pdf', '강의자료.pdf', 올릴수있는파일)).toBe('pdf')
        expect(resolveDriveExt('application/octet-stream', '사진.png', 올릴수있는파일)).toBeNull()
        expect(resolveDriveExt('text/plain', '메모', 올릴수있는파일)).toBeNull() // 확장자가 없다
    })
})

/** 호출된 주소를 기록하는 가짜 fetch */
function 가짜fetch(status: number, body: unknown, onCall?: (url: string) => void): typeof fetch {
    return (async (url: string | URL) => {
        onCall?.(String(url))
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
            arrayBuffer: async () => (body instanceof Uint8Array ? body.buffer : new TextEncoder().encode(String(body)).buffer),
        } as Response
    }) as typeof fetch
}

describe('listDriveFolders', () => {
    it('폴더만 달라는 질의를 보내고, id/name 만 남긴다', async () => {
        let 본주소 = ''
        const fetchImpl = 가짜fetch(200, { files: [{ id: 'f1', name: '강의자료' }] }, url => { 본주소 = url })
        const out = await listDriveFolders('token', 100, fetchImpl)
        expect(out).toEqual([{ id: 'f1', name: '강의자료' }])
        expect(본주소).toContain('mimeType')
        expect(decodeURIComponent(본주소)).toContain("mimeType='application/vnd.google-apps.folder'")
    })

    it('401 이면 DriveAuthExpired', async () => {
        await expect(listDriveFolders('token', 100, 가짜fetch(401, {}))).rejects.toBeInstanceOf(DriveAuthExpired)
    })

    it('다른 오류는 DriveApiError', async () => {
        await expect(listDriveFolders('token', 100, 가짜fetch(500, {}))).rejects.toBeInstanceOf(DriveApiError)
    })
})

describe('listDriveFilesInFolder', () => {
    it('하위 폴더까지 들어가 지원하는 파일만 상대 경로로 모은다', async () => {
        const calls: string[] = []
        const fetchImpl = (async (url: string | URL) => {
            const u = decodeURIComponent(String(url))
            calls.push(u)
            if (u.includes("'root' in parents")) {
                return { ok: true, status: 200, json: async () => ({ files: [
                    { id: 'sub', name: '하위폴더', mimeType: 'application/vnd.google-apps.folder' },
                    { id: 'a', name: '강의.pdf', mimeType: 'application/pdf', modifiedTime: '2026-09-01T00:00:00Z', size: '100' },
                    { id: 'b', name: '사진.png', mimeType: 'image/png', modifiedTime: '2026-09-01T00:00:00Z', size: '100' },
                ] }) } as Response
            }
            return { ok: true, status: 200, json: async () => ({ files: [
                { id: 'c', name: '8월정리.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedTime: '2026-09-02T00:00:00Z', size: '200' },
            ] }) } as Response
        }) as typeof fetch

        const out = await listDriveFilesInFolder('token', 'root', 올릴수있는파일, { fetchImpl })
        expect(out.map(f => f.path).sort()).toEqual(['강의.pdf', '하위폴더/8월정리.docx'])
        expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    it('개수 상한을 넘기지 않는다', async () => {
        const many = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: `파일${i}.txt`, mimeType: 'text/plain', modifiedTime: '2026-09-01T00:00:00Z', size: '1' }))
        const fetchImpl = 가짜fetch(200, { files: many })
        const out = await listDriveFilesInFolder('token', 'root', 올릴수있는파일, { fetchImpl, maxFiles: 3 })
        expect(out).toHaveLength(3)
    })
})

describe('fetchDriveFileContent', () => {
    it('구글 문서는 export 주소로 받고, ext/파일이름을 export 결과 기준으로 붙인다', async () => {
        let 본주소 = ''
        const fetchImpl = 가짜fetch(200, '내용', url => { 본주소 = url })
        const out = await fetchDriveFileContent('token', { id: 'x', name: '기획서', mimeType: 'application/vnd.google-apps.document' }, fetchImpl)
        expect(본주소).toContain('/export')
        expect(out.ext).toBe('txt')
        expect(out.fileName).toBe('기획서.txt')
        expect(out.buffer.toString()).toBe('내용')
    })

    it('보통 파일은 alt=media 로 그대로 받는다', async () => {
        let 본주소 = ''
        const fetchImpl = 가짜fetch(200, '바이너리', url => { 본주소 = url })
        const out = await fetchDriveFileContent('token', { id: 'x', name: '강의.pdf', mimeType: 'application/pdf' }, fetchImpl)
        expect(본주소).toContain('alt=media')
        expect(out.ext).toBe('pdf')
        expect(out.fileName).toBe('강의.pdf')
    })
})
