import { describe, it, expect } from 'vitest'
import {
    폴더대상확장자, FOLDER_MAX_FILE_BYTES, FOLDER_MAX_FILES,
    isTargetFile, shouldSkipDir, fingerprint, pathOfFingerprint, pickChanged, applyLimits,
    walkDirectory, fromFileList, readSeen, addSeen, readAutoScan, saveAutoScan, seenKey, formatBytes,
    type DirHandleLike, type FileHandleLike, type FolderFile,
} from '../folder'

/** 저장이 되는 가짜 브라우저 창고 */
function 창고(초기: Record<string, string> = {}) {
    const 속 = { ...초기 }
    return {
        속,
        getItem: (k: string) => (k in 속 ? 속[k] : null),
        setItem: (k: string, v: string) => { 속[k] = v },
    }
}
const 막힌창고 = {
    getItem: () => { throw new Error('막힘') },
    setItem: () => { throw new Error('막힘') },
}

type F = { name: string; size: number; lastModified: number }
const 파일 = (path: string, size = 100, lastModified = 1000): FolderFile<F> => {
    const name = path.split('/').pop()!
    return { path, name, size, lastModified, file: { name, size, lastModified } }
}

/** 가짜 폴더 손잡이 */
function 폴더(name: string, 안: (DirHandleLike<F> | FileHandleLike<F>)[]): DirHandleLike<F> {
    return {
        kind: 'directory', name,
        async *values() { for (const h of 안) yield h },
    }
}
function 파일손잡이(name: string, size = 100, lastModified = 1000): FileHandleLike<F> {
    return { kind: 'file', name, getFile: async () => ({ name, size, lastModified }) }
}

describe('확장자 필터', () => {
    it('대표 지시 목록 중 서버가 읽는 것만 대상이다', () => {
        for (const e of ['md', 'txt', 'pdf', 'docx', 'hwp', 'hwpx', 'pptx', 'xlsx', 'csv']) {
            expect(폴더대상확장자, e).toContain(e)
            expect(isTargetFile(`강의.${e}`)).toBe(true)
        }
        // html 은 서버가 아직 못 읽어 빠진다
        expect(폴더대상확장자).not.toContain('html')
    })
    it('이미지, 영상, 코드, 숨김 파일은 뺀다', () => {
        for (const n of ['a.png', 'b.jpg', 'c.mp4', 'd.ts', 'e.py', '.DS_Store', '.env.md', '~$임시.docx', 'README', 'x.PDF.exe']) {
            expect(isTargetFile(n), n).toBe(false)
        }
        expect(isTargetFile('대문자.PDF')).toBe(true)
    })
    it('숨김 폴더와 node_modules 는 들어가지 않는다', () => {
        expect(shouldSkipDir('node_modules')).toBe(true)
        expect(shouldSkipDir('.git')).toBe(true)
        expect(shouldSkipDir('.obsidian')).toBe(true)
        expect(shouldSkipDir('강의자료')).toBe(false)
    })
})

describe('상한', () => {
    it('10MB 넘는 파일은 따로 빼고, 200개 넘으면 최근 것부터 남긴다', () => {
        const 많이 = Array.from({ length: 250 }, (_, i) => 파일(`f${i}.md`, 10, i))
        const 큰것 = 파일('큰.pdf', FOLDER_MAX_FILE_BYTES + 1, 99999)
        const r = applyLimits([...많이, 큰것])
        expect(r.tooBig).toEqual([큰것])
        expect(r.kept.length).toBe(FOLDER_MAX_FILES)
        expect(r.overflow).toBe(50)
        // 가장 최근에 고친 것이 앞에
        expect(r.kept[0].path).toBe('f249.md')
        expect(r.kept.map(f => f.path)).not.toContain('f0.md')
    })
    it('딱 상한만큼은 그대로 통과한다', () => {
        const r = applyLimits([파일('a.md', FOLDER_MAX_FILE_BYTES)])
        expect(r.tooBig).toEqual([])
        expect(r.kept.length).toBe(1)
        expect(r.overflow).toBe(0)
    })
})

describe('변경 감지 지문', () => {
    it('지문은 경로, 크기, 수정 시각으로 만들고 경로를 되찾을 수 있다', () => {
        const f = 파일('강의/8월.md', 123, 456)
        expect(fingerprint(f)).toBe('강의/8월.md|123|456')
        expect(pathOfFingerprint(fingerprint(f))).toBe('강의/8월.md')
        expect(pathOfFingerprint(fingerprint(파일('이상한|이름.md', 1, 2)))).toBe('이상한|이름.md')
    })
    it('새로 생겼거나 수정된 파일만 남긴다', () => {
        const 그대로 = 파일('a.md', 100, 1000)
        const 수정됨 = 파일('b.md', 120, 2000)
        const 새것 = 파일('c.md')
        const seen = new Set([fingerprint(그대로), fingerprint(파일('b.md', 100, 1000))])
        expect(pickChanged([그대로, 수정됨, 새것], seen).map(f => f.path)).toEqual(['b.md', 'c.md'])
    })
    it('올린 지문을 저장하면 다음 훑기에서 빠지고, 같은 경로의 옛 지문은 새 것으로 바뀐다', () => {
        const s = 창고()
        addSeen('m1', [파일('a.md', 100, 1000)], s)
        expect(readSeen('m1', s).has('a.md|100|1000')).toBe(true)
        addSeen('m1', [파일('a.md', 130, 3000)], s)
        const 지금 = readSeen('m1', s)
        expect(지금.has('a.md|100|1000')).toBe(false)
        expect(지금.has('a.md|130|3000')).toBe(true)
        expect(지금.size).toBe(1)
        expect(s.속[seenKey('m1')]).toContain('a.md|130|3000')
        // 봇마다 따로
        expect(readSeen('m2', s).size).toBe(0)
    })
    it('저장이 막혀 있어도 죽지 않는다', () => {
        expect(() => addSeen('m', [파일('a.md')], 막힌창고)).not.toThrow()
        expect(readSeen('m', 막힌창고).size).toBe(0)
        expect(readSeen('m', 창고({ [seenKey('m')]: '이상한 글' })).size).toBe(0)
        expect(readAutoScan('m', 막힌창고)).toBe(false)
    })
    it('열 때마다 훑기 토글을 기억한다', () => {
        const s = 창고()
        expect(readAutoScan('m', s)).toBe(false)
        saveAutoScan('m', true, s)
        expect(readAutoScan('m', s)).toBe(true)
        saveAutoScan('m', false, s)
        expect(readAutoScan('m', s)).toBe(false)
    })
})

describe('폴더 훑기', () => {
    it('하위 폴더까지 재귀로 훑고 대상 파일만 상대 경로로 모은다', async () => {
        const root = 폴더('내폴더', [
            파일손잡이('정리.md', 10, 1),
            파일손잡이('사진.png'),
            폴더('강의', [파일손잡이('8월.pdf', 20, 2), 폴더('.숨김', [파일손잡이('x.md')])]),
            폴더('node_modules', [파일손잡이('readme.md')]),
        ])
        const r = await walkDirectory(root)
        expect(r.map(f => f.path).sort()).toEqual(['강의/8월.pdf', '정리.md'])
        expect(r.find(f => f.path === '강의/8월.pdf')).toMatchObject({ name: '8월.pdf', size: 20, lastModified: 2 })
    })
    it('너무 깊거나 너무 많으면 멈춘다', async () => {
        const 깊은 = 폴더('a', [폴더('b', [폴더('c', [파일손잡이('깊다.md')])])])
        expect((await walkDirectory(깊은, { maxDepth: 1 })).length).toBe(0)
        const 많은 = 폴더('r', Array.from({ length: 30 }, (_, i) => 파일손잡이(`f${i}.md`)))
        expect((await walkDirectory(많은, { hardStop: 5 })).length).toBe(5)
    })
    it('webkitdirectory 파일 목록도 같은 모양으로 바꾼다 (맨 앞 폴더 이름은 뗀다)', () => {
        const list = [
            { name: '정리.md', size: 1, lastModified: 1, webkitRelativePath: '내폴더/정리.md' },
            { name: '8월.pdf', size: 2, lastModified: 2, webkitRelativePath: '내폴더/강의/8월.pdf' },
            { name: 'x.md', size: 3, lastModified: 3, webkitRelativePath: '내폴더/node_modules/x.md' },
            { name: 'a.png', size: 4, lastModified: 4, webkitRelativePath: '내폴더/a.png' },
            { name: '홀로.txt', size: 5, lastModified: 5 },
        ]
        expect(fromFileList(list).map(f => f.path)).toEqual(['정리.md', '강의/8월.pdf', '홀로.txt'])
    })
})

describe('크기 표기', () => {
    it('사람 말로 보인다', () => {
        expect(formatBytes(500)).toBe('500B')
        expect(formatBytes(2048)).toBe('2KB')
        expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB')
    })
})
