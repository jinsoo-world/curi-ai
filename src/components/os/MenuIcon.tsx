// 세부칸 여닫는 단추 안의 그림. 글자 ≡ 나 ✕ 는 글꼴, 글자 크기에 따라 굵기와 자리가 흔들려서 20px 선 그림으로 고정한다.
// 열기 = ≡ (햄버거, 대표 0923), 닫기 = ✕ (서랍 안 맨 위, 대표 0923 폰 실측 「닫는 단추가 없다」).
export default function MenuIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

export function CloseIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

/** 서랍을 오른쪽으로 쓸어 닫기. 손가락이 60px 넘게 오른쪽으로 갔고 위아래로는 크게 안 움직였을 때만 */
export function swipeToClose(onClose: () => void) {
    let x0 = 0, y0 = 0
    return {
        onTouchStart: (e: React.TouchEvent) => { x0 = e.touches[0]?.clientX ?? 0; y0 = e.touches[0]?.clientY ?? 0 },
        onTouchEnd: (e: React.TouchEvent) => {
            const t = e.changedTouches[0]
            if (!t) return
            if (t.clientX - x0 > 60 && Math.abs(t.clientY - y0) < 80) onClose()
        },
    }
}
