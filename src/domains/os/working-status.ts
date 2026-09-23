// domains/os — 답 기다리는 동안 보여주는 작업 표지 (그록식 짧은 상태 줄)
// 가짜 도구/커넥터 이름은 쓰지 않는다. 제품 카피: 가운뎃점(·)·긴 줄표(—) 금지.

export type WorkingStatusKind = 'preparing' | 'thinking' | 'working' | 'reading'

export interface WorkingStatus {
    kind: WorkingStatusKind
    text: string
    aurora: boolean
}

export const WORKING_PHASE_MS = 2_200

export interface WorkingStatusOpts {
    botName?: string
    hasFiles?: boolean
}

export function workingStatusPhases(opts: WorkingStatusOpts = {}): WorkingStatus[] {
    const name = (opts.botName ?? '').trim()
    const phases: WorkingStatus[] = [
        { kind: 'preparing', text: '답장 준비 중', aurora: true },
        { kind: 'thinking', text: '생각 중', aurora: false },
        { kind: 'working', text: name ? `${name} 작업 중` : '작업 중', aurora: false },
    ]
    if (opts.hasFiles) {
        phases.push({ kind: 'reading', text: '파일을 읽는 중', aurora: false })
    }
    return phases
}

export function pickWorkingStatus(elapsedMs: number, opts: WorkingStatusOpts = {}): WorkingStatus {
    const phases = workingStatusPhases(opts)
    const i = Math.floor(Math.max(0, elapsedMs) / WORKING_PHASE_MS) % phases.length
    return phases[i]!
}

export function botWorkingLabel(name: string): string {
    const n = (name ?? '').trim() || '봇'
    return `${n} 작업 중…`
}
