// domains/os/readers = 네이버 뉴스, 네이버 블로그 본문을 정확히 뽑는다.
//
// readability 로도 대개 읽히지만, 사진 설명이 본문 맨 앞에 섞이고(뉴스) 글쓴이, 날짜가 빠진다.
// 두 곳 다 본문 칸 이름이 정해져 있어서 그 칸만 집어 온다. 칸을 못 찾으면 null = readability 로 되돌아간다.
//   뉴스   = #dic_area (예전 기사는 #articleBodyContents, #articeBody)
//   블로그 = .se-main-container (스마트에디터 ONE), 예전 글은 #postViewArea, .se_component_wrap

import { parseHTML } from 'linkedom'
import { htmlToText, pickMeta } from '@/domains/agent/fetch-url'
import { stripNoise } from './article'

export interface NaverArticle {
    title: string
    text: string
}

/** 이 글자 수보다 짧으면 본문을 못 찾은 것으로 본다 */
const MIN_BODY = 30

function tidy(s: string): string {
    return String(s ?? '')
        .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
        .split('\n')
        .map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

type Doc = ReturnType<typeof parseHTML>['document']

function textOf(doc: Doc, selector: string): string {
    const el = doc.querySelector(selector)
    return el ? tidy(String(el.textContent ?? '')) : ''
}

/** 칸 하나의 속 HTML 을 글로 (줄바꿈 <br>, 문단을 살린다). 빼야 할 칸은 먼저 지운다 */
function bodyOf(doc: Doc, selectors: string[], drop: string[]): string {
    for (const sel of selectors) {
        const el = doc.querySelector(sel)
        if (!el) continue
        for (const d of drop) el.querySelectorAll(d).forEach((n: { remove: () => void }) => n.remove())
        const text = stripNoise(tidy(htmlToText(String(el.innerHTML ?? ''))))
        if (text.length >= MIN_BODY) return text
    }
    return ''
}

/** 네이버 뉴스 기사 HTML → 본문. 칸을 못 찾으면 null */
export function extractNaverNews(html: string): NaverArticle | null {
    let doc: Doc
    try { doc = parseHTML(String(html ?? '')).document } catch { return null }
    const body = bodyOf(doc,
        ['#dic_area', '#newsct_article', '#articleBodyContents', '#articeBody', '#newsEndContents'],
        ['.img_desc', '.end_photo_org', '.vod_player_wrap', '.nbd_table', 'script', 'style', '.link_news', '.artical-btm'])
    if (!body) return null
    const title = (textOf(doc, '#title_area') || textOf(doc, 'h2.media_end_head_headline') || pickMeta(html, 'og:title')).slice(0, 120)
    const press = (pickMeta(html, 'og:article:author') || '').replace(/\s*\|\s*네이버.*$/, '').trim()
        || String(doc.querySelector('.media_end_head_top_logo img')?.getAttribute('alt') ?? '').trim()
    const when = String(doc.querySelector('.media_end_head_info_datestamp_time')?.getAttribute('data-date-time') ?? '').trim()
    const reporter = textOf(doc, '.media_end_head_journalist_name') || textOf(doc, '.byline_s')
    const head = [
        `[네이버 뉴스] ${title}`,
        press ? `언론사: ${press}` : '',
        when ? `입력: ${when}` : '',
        reporter ? `기자: ${reporter}` : '',
    ].filter(Boolean).join('\n')
    return { title: press ? `${title} | ${press}`.slice(0, 120) : title, text: `${head}\n\n${body}` }
}

/** 네이버 블로그 글(PostView) HTML → 본문. 칸을 못 찾으면 null */
export function extractNaverBlog(html: string): NaverArticle | null {
    let doc: Doc
    try { doc = parseHTML(String(html ?? '')).document } catch { return null }
    const titleFromDoc = textOf(doc, '.se-title-text') || textOf(doc, '.se_title .se_textarea') || textOf(doc, '.pcol1 .htitle')
    const body = bodyOf(doc,
        ['.se-main-container', '#postViewArea', '.se_component_wrap.sect_dsc', '.post_ct'],
        ['script', 'style', '.se-oglink-info', '.se-module-map-text', '.se-sticker', '.se-placesMap'])
    if (!body) return null
    const title = (titleFromDoc || pickMeta(html, 'og:title')).replace(/\s*:\s*네이버 블로그\s*$/, '').slice(0, 120)
    const nick = Array.from(doc.querySelectorAll('.nick'))
        .map((n: { textContent: string | null }) => tidy(String(n.textContent ?? '')))
        .find(t => t && !t.includes('{=')) ?? ''
    const when = textOf(doc, '.se_publishDate') || textOf(doc, '.date')
    const head = [
        `[네이버 블로그] ${title}`,
        nick ? `글쓴이: ${nick}` : '',
        when ? `작성: ${when}` : '',
    ].filter(Boolean).join('\n')
    // 본문 맨 앞에 제목이 한 번 더 나오면 뺀다
    const cleanBody = body.startsWith(title) ? body.slice(title.length).trim() : body
    return { title: title || '네이버 블로그 글', text: `${head}\n\n${cleanBody || body}` }
}

/** 블로그 PostView 주소 → 모바일 글 주소 (PostView 가 막히면 두 번째로 시도) */
export function naverBlogMobileUrl(raw: string): string | null {
    try {
        const u = new URL(raw)
        const blogId = u.searchParams.get('blogId')
        const logNo = u.searchParams.get('logNo')
        if (blogId && logNo) return `https://m.blog.naver.com/${blogId}/${logNo}`
        const m = u.pathname.match(/^\/([A-Za-z0-9_-]{1,40})\/(\d{5,})/)
        return m ? `https://m.blog.naver.com/${m[1]}/${m[2]}` : null
    } catch { return null }
}
