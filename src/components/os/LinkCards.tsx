'use client'
// 봇 답 위에 「읽은 페이지」 작은 카드 줄. 사용자가 대화에 주소를 붙이면 서버(/api/chat)가 읽고
// 마지막 조각에 실어 준다 — 실려 오는 모양이 셋 중 하나일 수 있어 순서대로 본다.
//  1) readUrls (성공·실패까지 확실히 아는 모양) — 있으면 최우선
//  2) sources 중 id 가 주소(http)인 것 — 「이 답에 쓴 자료」와 같은 자리로 얹어 보내는 경우
//  3) 위 둘 다 없고 sources 도 아예 없으면(모델이 답을 못 썼을 때 등) 사용자가 보낸 말에서 주소만 뽑아
//     도메인 이름으로라도 보여준다 — 이땐 정말 읽었는지는 모른다는 뜻으로 ok 표시를 하지 않는다.

export interface ReadUrlItem {
    url: string
    /** 페이지 제목. 없으면 도메인만 보인다 */
    title?: string | null
    /** 못 읽었으면 false. 없으면 성공으로 본다 */
    ok?: boolean
}

interface SourceItem { id: string; title: string }

interface Props {
    readUrls?: ReadUrlItem[]
    sources?: SourceItem[]
    /** 이 답을 부른 사용자 메시지 원문(주소 뽑기용 마지막 수단) */
    userText?: string
    max?: number
}

const URL_RE = /https?:\/\/[^\s<>"'）)]+/g

/** 글 속 주소만 뽑는다(맨 끝 문장부호는 뗀다) */
export function extractUrls(text: string): string[] {
    const found = text.match(URL_RE) ?? []
    const out: string[] = []
    for (const raw of found) {
        const u = raw.replace(/[.,!?;:]+$/, '')
        if (!out.includes(u)) out.push(u)
    }
    return out
}

const isUrl = (s: string) => /^https?:\/\//i.test(s)
const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

export default function LinkCards({ readUrls, sources, userText, max = 5 }: Props) {
    interface Item { url: string; label: string; ok: boolean }
    let items: Item[] = []

    if (readUrls && readUrls.length > 0) {
        items = readUrls.map(r => ({ url: r.url, label: (r.title ?? '').trim() || domain(r.url), ok: r.ok !== false }))
    } else if (sources && sources.length > 0) {
        // 「참고한 자료」 자리에 얹어 온 것 중 진짜 주소만 링크 카드로. 내부 자료(uuid 등)는 여기선 보이지 않는다(줄 두 번 되게 안 한다)
        items = sources.filter(s => isUrl(s.id)).map(s => ({ url: s.id, label: s.title.trim() || domain(s.id), ok: true }))
    } else if (userText) {
        items = extractUrls(userText).map(u => ({ url: u, label: domain(u), ok: true }))
    }

    items = items.slice(0, max)
    if (items.length === 0) return null

    return (
        <div className="os-link-cards" aria-label="읽은 페이지">
            {items.map((it, i) => it.ok ? (
                <a key={`${it.url}-${i}`} className="os-link-card" href={it.url} target="_blank" rel="noopener noreferrer" title={it.url}>
                    <span className="os-link-card-dot" aria-hidden />
                    <span className="os-link-card-title">{it.label}</span>
                </a>
            ) : (
                <span key={`${it.url}-${i}`} className="os-link-card failed" title={it.url}>
                    <span className="os-link-card-dot" aria-hidden />
                    <span className="os-link-card-title">{it.label}</span>
                </span>
            ))}
        </div>
    )
}
