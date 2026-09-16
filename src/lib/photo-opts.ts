/**
 * 보관함에 「어떤 옵션으로 만들었는지」를 남긴다 — 대표 지시 2026-09-16
 *
 * 사진 기록표(tool_photos)에는 옵션을 넣을 칸이 없다. 칸을 새로 만들려면 데이터베이스를 손봐야 해서
 * 지금은 만든 그 브라우저에 적어둔다. 사진 주소(공개 주소라 늘 같다)를 열쇠로 쓴다.
 *
 * 한계 = 다른 기기에서 보관함을 열면 이 줄은 안 보인다(사진과 이름은 그대로 보인다).
 *        기기를 넘겨 보이게 하려면 tool_photos 에 칸 하나(options text)를 더해야 한다.
 * 사진은 48시간 뒤 사라지므로 적어둔 것도 그때 함께 지운다.
 */
const 열쇠 = 'curi:photo-opts'
const 보관시간 = 48 * 3600 * 1000

type 표 = Record<string, { t: string; e: number }>

function 읽기(): 표 {
    try {
        const raw = localStorage.getItem(열쇠)
        if (!raw) return {}
        const d = JSON.parse(raw) as 표
        const 지금 = Date.now()
        let 바뀜 = false
        for (const k of Object.keys(d)) {
            if (!d[k]?.e || d[k].e < 지금) { delete d[k]; 바뀜 = true }
        }
        if (바뀜) localStorage.setItem(열쇠, JSON.stringify(d))
        return d
    } catch { return {} }
}

/** 만들기에 성공했을 때 부른다. 값이 없으면 아무 일도 하지 않는다. */
export function 옵션기억(url: string | null | undefined, 요약: string) {
    if (!url || !요약) return
    try {
        const d = 읽기()
        d[url] = { t: 요약, e: Date.now() + 보관시간 }
        localStorage.setItem(열쇠, JSON.stringify(d))
    } catch { /* 저장이 막힌 브라우저면 그냥 넘어간다 */ }
}

/** 보관함에서 부른다. 없으면 null */
export function 옵션읽기(url: string): string | null {
    try { return 읽기()[url]?.t ?? null } catch { return null }
}

/** 고른 것들을 「A · B · C」 한 줄로. 빈 값은 빠진다 */
export function 요약만들기(...조각: (string | null | undefined)[]) {
    return 조각.filter(Boolean).join(' · ')
}
