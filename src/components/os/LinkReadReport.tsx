'use client'
// 링크 읽은 결과 (읽은 것 한 줄, 못 읽은 것과 이유 한 줄, 「다시 시도」, 글 붙여넣기 칸). 대표 지시 1005 「입구마다 따로 놀던 것」을 한 곳으로.
// OsMake, 옛 만들기 창, 설정이 같은 모양을 쓴다. 문구는 link-rules.ts. 한도 숫자는 보여 주지 않는다.
import { RETRY_LABEL, TOO_SHORT_LINE, canPaste, canRetry, enoughText, linkLabelOf, type UnreadLink } from '@/domains/os/link-rules'

export interface LinkReadReportProps {
    /** 읽은 결과 한 줄 (예: 인스타 글 5개를 읽었어요) */
    summary?: string
    unread: UnreadLink[]
    /** 지금 다시 읽는 중인 링크 */
    retrying?: string | null
    onRetry?: (url: string) => void
    /** 주면 글 붙여넣기 칸을 같은 자리에 보여 준다 */
    pasteValue?: string
    onPasteChange?: (v: string) => void
    disabled?: boolean
}

export default function LinkReadReport({ summary, unread, retrying = null, onRetry, pasteValue, onPasteChange, disabled }: LinkReadReportProps) {
    const showPaste = !!onPasteChange && unread.some(u => canPaste(u.code))
    return (
        <div className="os-link-report" role="status" aria-live="polite" style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
            {summary && <p style={{ margin: 0, fontWeight: 600 }}>{summary}</p>}
            {unread.map(u => (
                <div key={u.url} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{linkLabelOf(u.url)}</div>
                        <div style={{ fontSize: 14, color: 'var(--os-글-흐림)', wordBreak: 'keep-all' }}>{u.reason}</div>
                    </div>
                    {onRetry && canRetry(u.code) && (
                        <button type="button" className="os-btn" disabled={disabled || retrying !== null} onClick={() => onRetry(u.url)}>
                            {retrying === u.url ? '읽는 중' : RETRY_LABEL}
                        </button>
                    )}
                </div>
            ))}
            {showPaste && (
                <label style={{ display: 'grid', gap: 6 }}>
                    <span className="os-field-label">글을 붙여넣어 주세요</span>
                    <textarea className="os-textarea" rows={5} maxLength={20000} value={pasteValue ?? ''} disabled={disabled}
                        onChange={e => onPasteChange?.(e.target.value)} placeholder="여기에 내 글을 붙여넣어 주세요" />
                    {!!pasteValue?.trim() && !enoughText(pasteValue) && <span style={{ fontSize: 13, color: 'var(--os-글-흐림)' }}>{TOO_SHORT_LINE}</span>}
                </label>
            )}
        </div>
    )
}
