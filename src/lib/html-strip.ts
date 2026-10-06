// HTML 에서 통째로 버릴 블록(script, style, noscript, svg, 주석)을 앞으로만 한 번 훑어 지운다 (보안 재검토 PR #53).
// 예전 정규식(<script[\s\S]*?<\/script>)은 닫는 태그가 없는 큰 입력에서 여는 태그마다 끝까지 다시 훑어 제곱 시간이 걸렸다(400KB 69초).
// 닫는 태그가 없으면 그 뒤는 전부 블록 안이라 버린다. 지운 자리는 띄어쓰기 하나.
// 밖에 나가지 않는 순수 함수라 화면, 서버 어디서 불러도 된다.

const BLOCK_TAGS = ['script', 'style', 'noscript', 'svg'] as const

export function stripHtmlBlocks(html: string, opts: { comments?: boolean; tags?: readonly string[] } = {}): string {
    const tags = opts.tags ?? BLOCK_TAGS
    const open = new RegExp(`<(${tags.join('|')})(?=[\\s/>])${opts.comments ? '|<!--' : ''}`, 'gi')
    let out = ''
    let pos = 0
    for (;;) {
        open.lastIndex = pos
        const m = open.exec(html)
        if (!m) break
        out += html.slice(pos, m.index) + ' '
        if (m[0] === '<!--') {
            const end = html.indexOf('-->', m.index + 4)
            if (end < 0) return out
            pos = end + 3
            continue
        }
        const close = new RegExp(`</${m[1]}\\s*>`, 'gi')
        close.lastIndex = m.index + m[0].length
        const c = close.exec(html)
        if (!c) return out
        pos = c.index + c[0].length
    }
    return out + html.slice(pos)
}
