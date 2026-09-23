// domains/agent — 「링크 바로 읽기」. 서버가 밖의 주소를 안전하게 열어 글만 가져온다.
//
// 왜 따로 두나 = 자료 넣기(domains/os/knowledge.ts)는 **저장**이 목적이고,
// 이건 **이번 답 한 번에만 쓰고 버리는** 읽기다. 저장하지 않으니 규칙이 더 빡빡하다.
//
// 지켜야 할 것 (보안설계 §B 보너스 위협 = SSRF, §F-4 프롬프트 인젝션)
//  1. http/https 만. file:, ftp:, javascript: 는 아예 거절.
//  2. 우리 안쪽 주소는 막는다 — localhost, 127., 10., 172.16~31., 192.168., 169.254.(클라우드 메타데이터), ::1, 
//     우리 Supabase 호스트, *.vercel.app.
//  3. 주소를 보고 막는 것만으론 뚫린다(남의 도메인이 169.254.169.254 를 가리킬 수 있다).
//     그래서 **이름을 실제 번호(IP)로 풀어 본 뒤** 그 번호가 사설 대역이면 거절한다.
//  4. 딴 데로 튕기는 것(리다이렉트)은 3번까지, **튕길 때마다 1~3 을 다시 검사**한다.
//  5. 크기 2MB, 시간 8초를 넘기면 끊는다.
//  6. 가져온 글은 「인용」이지 「명령」이 아니다 — 울타리는 부르는 쪽(/api/chat)이 두른다.
//  7. 이 파일은 「안전하게 가져오기」까지만. 글로 바꾸는 일(본문 추출, 유튜브 자막)은 domains/os/readers 에 있다.

import { lookup } from 'dns/promises'

/** 한 번에 읽을 수 있는 최대 크기 */
export const MAX_FETCH_BYTES = 2 * 1024 * 1024
/** 한 주소에 기다려 주는 시간 */
export const FETCH_TIMEOUT_MS = 8_000
/** 딴 데로 튕기는 것을 따라가는 횟수 */
export const MAX_REDIRECTS = 3
/** 프롬프트에 넣을 본문 최대 글자 수 */
export const MAX_PAGE_CHARS = 10_000
/** 한 번의 말에서 읽어 볼 주소 개수 */
export const MAX_URLS_PER_MESSAGE = 3

/** 우리가 밖에 나갈 때 쓰는 이름표 */
const UA = 'CuriAI-Bot/1.0 (+https://curi.ai)'

/* ────────────────────────── 주소 고르기 ────────────────────────── */

const URL_IN_TEXT = /https?:\/\/[^\s<>"'()[\]]+/gi

/**
 * 사람이 쓴 말에서 주소만 골라낸다(앞에서부터 최대 3개, 같은 주소는 한 번만).
 * 문장 끝에 딸려온 마침표, 괄호, 따옴표는 떼어 낸다.
 */
export function extractUrls(text: string, max = MAX_URLS_PER_MESSAGE): string[] {
    const found = String(text ?? '').match(URL_IN_TEXT) ?? []
    const out: string[] = []
    for (const raw of found) {
        const url = raw.replace(/[.,!?;:)\]}'"»]+$/, '')
        if (!url || out.includes(url)) continue
        if (!isSafeFetchUrl(url)) continue
        out.push(url)
        if (out.length >= max) break
    }
    return out
}

/* ────────────────────────── 안전한 주소인가 ────────────────────────── */

/** 번호 주소(IP)가 우리 안쪽, 사설 대역인가 */
export function isPrivateIp(ip: string): boolean {
    const addr = String(ip ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
    if (!addr) return true

    // IPv6 가 IPv4 를 품은 모양(::ffff:10.0.0.1)은 뒤의 IPv4 로 본다
    const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isPrivateIp(mapped[1])

    const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])]
        if (a === 0 || a === 10 || a === 127) return true
        if (a === 169 && b === 254) return true       // 클라우드 메타데이터(제일 위험)
        if (a === 172 && b >= 16 && b <= 31) return true
        if (a === 192 && b === 168) return true
        if (a === 100 && b >= 64 && b <= 127) return true   // 통신사 공유 대역
        if (a >= 224) return true                     // 멀티캐스트, 예약
        return false
    }

    // IPv6
    if (addr === '::' || addr === '::1') return true
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true  // fc00::/7 사설
    if (/^fe[89ab][0-9a-f]:/.test(addr)) return true  // fe80::/10 링크 로컬
    return false
}

/** 이름만 보고도 바로 막아야 하는 곳인가 */
export function isBlockedHost(hostname: string): boolean {
    const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
    if (!host) return true
    if (host === 'localhost' || host.endsWith('.localhost')) return true
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true
    if (host === 'metadata.google.internal') return true
    if (host.endsWith('.vercel.app') || host === 'vercel.app') return true     // 우리 배포 주소
    if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) return true  // 우리 DB, 저장소

    // 우리 Supabase 주소는 환경변수로도 한 번 더 막는다
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (base) {
        try { if (new URL(base).hostname.toLowerCase() === host) return true } catch { /* 주소가 이상하면 넘어간다 */ }
    }

    // 이름 자리에 번호가 그대로 적혀 있으면 사설 대역인지 본다
    if (/^[\d.]+$/.test(host) || host.includes(':')) return isPrivateIp(host)
    return false
}

/** 우리가 열어도 되는 주소인가 (이름만 보고 하는 1차 검사) */
export function isSafeFetchUrl(raw: string): boolean {
    let u: URL
    try { u = new URL(String(raw ?? '')) } catch { return false }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (u.username || u.password) return false          // https://우리주소@남의서버 속임수
    return !isBlockedHost(u.hostname)
}

/**
 * 이름을 실제 번호로 풀어 사설 대역인지 본다 (2차 검사, DNS 되돌리기 공격 막기).
 * 이름을 못 풀면 **막는다**(모르면 열지 않는다).
 */
export async function isPublicHost(hostname: string): Promise<boolean> {
    const host = String(hostname ?? '').replace(/^\[|\]$/g, '')
    if (!host) return false
    if (/^[\d.]+$/.test(host) || host.includes(':')) return !isPrivateIp(host)
    try {
        const addrs = await lookup(host, { all: true })
        if (!addrs.length) return false
        return addrs.every(a => !isPrivateIp(a.address))
    } catch {
        return false
    }
}

/* ────────────────────────── 주소 고쳐 주기 ────────────────────────── */

/**
 * 네이버 블로그는 진짜 글이 액자(iframe) 뒤에 있어서 그냥 열면 빈 화면만 온다.
 * 액자 안 주소(PostView.naver)로 바꿔 준다.
 *   https://blog.naver.com/아이디/223000000
 *   → https://blog.naver.com/PostView.naver?blogId=아이디&logNo=223000000
 */
export function normalizeUrl(raw: string): string {
    let u: URL
    try { u = new URL(String(raw ?? '')) } catch { return String(raw ?? '') }
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'blog.naver.com' || host === 'm.blog.naver.com') {
        const m = u.pathname.match(/^\/([A-Za-z0-9_-]{1,40})\/(\d{5,})\/?$/)
        if (m) return `https://blog.naver.com/PostView.naver?blogId=${m[1]}&logNo=${m[2]}`
        // ?blogId=&logNo= 모양으로 온 것도 액자 안 주소로 맞춰 준다
        const blogId = u.searchParams.get('blogId')
        const logNo = u.searchParams.get('logNo')
        if (blogId && logNo && !u.pathname.includes('PostView')) {
            return `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`
        }
    }
    return u.toString()
}

/** 유튜브 주소인가 (자막 읽기는 domains/os/readers/youtube.ts) */
export function isYoutubeUrl(raw: string): boolean {
    try {
        const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase()
        return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'music.youtube.com'
    } catch { return false }
}

/* ────────────────────────── HTML 에서 글만 뽑기 ────────────────────────── */

const ENTITIES: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&middot;': ', ',
}

/** 웹페이지 HTML → 사람이 읽는 글만 (스크립트, 스타일, 태그 제거) */
export function htmlToText(html: string): string {
    return String(html ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#(\d{1,6});/g, (_, n) => { try { return String.fromCodePoint(Number(n)) } catch { return ' ' } })
        .replace(/&[a-z]+;|&#39;/gi, m => ENTITIES[m.toLowerCase()] ?? ' ')
        .replace(/[ \t ]{2,}/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** <title> 을 제목으로. 없으면 og:title, 그것도 없으면 주소 */
export function pickTitle(html: string, fallback: string): string {
    const t = String(html ?? '').match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)
    const title = t ? htmlToText(t[1]) : ''
    return (title || pickMeta(html, 'og:title') || fallback).slice(0, 120)
}

/** <meta property="og:description" content="…"> 같은 칸 하나 읽기 */
export function pickMeta(html: string, name: string): string {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*>`, 'i')
    const tag = String(html ?? '').match(re)?.[0]
    if (!tag) return ''
    const content = tag.match(/content=["']([\s\S]*?)["']/i)?.[1] ?? ''
    return htmlToText(content).slice(0, 2_000)
}

/* ────────────────────────── 실제로 읽어 오기 ────────────────────────── */

export interface ReadPage {
    ok: true
    /** 마지막에 실제로 읽은 주소 */
    url: string
    /** 사람이 처음 쓴 주소 */
    requestedUrl: string
    title: string
    text: string
    kind: 'web' | 'youtube'
    /** 유튜브면 채널 이름 (자료 제목에 같이 붙인다) */
    channel?: string
    /** 어떻게 읽었나 = readability(본문 추출기) / plain(태그만 걷어냄) / captions(자막) / meta(제목과 설명만) */
    method?: 'readability' | 'plain' | 'captions' | 'meta'
}
export interface ReadFail {
    ok: false
    requestedUrl: string
    /** 사람에게 그대로 보여 줄 한 줄 이유 */
    reason: string
}
export type ReadResult = ReadPage | ReadFail

/** 안전하게 가져온 원문 (글로 바꾸는 일은 domains/os/readers 가 한다) */
export interface FetchedPage {
    ok: true
    url: string
    requestedUrl: string
    contentType: string
    body: string
}

export interface FetchOptions {
    /** 이 크기까지만 읽는다 (기본 2MB) */
    maxBytes?: number
    /** 이 시간 안에 끝내야 한다 (기본 8초) */
    timeoutMs?: number
}

/** 몸통을 크기 한도까지만 읽는다 (끝없이 흘려보내는 서버에 물리지 않게) */
async function readLimitedText(res: Response, charset: string, maxBytes: number): Promise<string> {
    const body = res.body
    if (!body) return ''
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
        while (total < maxBytes) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) { chunks.push(value); total += value.byteLength }
        }
    } finally {
        try { await reader.cancel() } catch { /* 이미 닫혔으면 그만 */ }
    }
    const buf = new Uint8Array(total)
    let at = 0
    for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, total - at)), at); at += c.length }
    try {
        return new TextDecoder(charset).decode(buf)
    } catch {
        return new TextDecoder('utf-8').decode(buf)
    }
}

/** content-type 에서 글자 인코딩 이름을 꺼낸다 (한국 옛 사이트는 euc-kr 이 많다) */
export function pickCharset(contentType: string, head = ''): string {
    const fromHeader = /charset=["']?([a-z0-9_-]+)/i.exec(contentType || '')?.[1]
    const fromMeta = /<meta[^>]+charset=["']?([a-z0-9_-]+)/i.exec(head || '')?.[1]
    const cs = (fromHeader || fromMeta || 'utf-8').toLowerCase()
    return cs === 'ms949' || cs === 'ks_c_5601-1987' ? 'euc-kr' : cs
}

/**
 * 주소 하나를 안전하게 가져온다(원문 그대로). 절대 던지지 않는다. 못 읽으면 이유를 돌려준다.
 * 글로 바꾸는 일(본문 추출, 유튜브 자막)은 domains/os/readers 의 readUrl 이 한다.
 * 이 함수는 「안전 검사 + 크기와 시간 한도 + 튕김 따라가기」만 책임진다.
 */
export async function fetchPageSafely(rawUrl: string, opts: FetchOptions = {}): Promise<FetchedPage | ReadFail> {
    const maxBytes = opts.maxBytes ?? MAX_FETCH_BYTES
    const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS
    const requestedUrl = String(rawUrl ?? '').trim()
    const fail = (reason: string): ReadFail => ({ ok: false, requestedUrl, reason })

    if (!isSafeFetchUrl(requestedUrl)) return fail('열 수 없는 주소예요(공개된 http, https 주소만 읽을 수 있어요)')

    let current = normalizeUrl(requestedUrl)
    const started = Date.now()
    let res: Response | null = null

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        // 튕길 때마다 처음부터 다시 검사한다(첫 주소만 보면 안쪽 주소로 끌려간다)
        if (!isSafeFetchUrl(current)) return fail('열 수 없는 주소로 넘어가려 해서 멈췄어요')
        let host: string
        try { host = new URL(current).hostname } catch { return fail('주소 모양이 이상해요') }
        if (!(await isPublicHost(host))) return fail('열 수 없는 주소예요(우리 안쪽 주소는 읽지 않아요)')

        const left = timeoutMs - (Date.now() - started)
        if (left <= 0) return fail('그 주소가 너무 느려서 멈췄어요')

        try {
            res = await fetch(current, {
                redirect: 'manual',
                signal: AbortSignal.timeout(left),
                headers: { 'User-Agent': UA, 'Accept': 'text/html,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'ko,en;q=0.8' },
            })
        } catch {
            return fail('그 주소를 열지 못했어요(응답이 없거나 너무 느려요)')
        }

        if (res.status >= 300 && res.status < 400) {
            const next = res.headers.get('location')
            if (!next) return fail('그 주소가 다른 곳으로 보냈는데 어디인지 알려주지 않았어요')
            if (hop === MAX_REDIRECTS) return fail('다른 곳으로 너무 여러 번 넘어가서 멈췄어요')
            try { current = new URL(next, current).toString() } catch { return fail('넘어갈 주소 모양이 이상해요') }
            continue
        }
        break
    }

    if (!res) return fail('그 주소를 열지 못했어요')
    if (!res.ok) return fail(`그 주소가 열리지 않아요(응답 ${res.status})`)

    const type = (res.headers.get('content-type') || '').toLowerCase()
    const 글인가 = type.includes('text/html') || type.includes('text/plain') || type.includes('xml') || type.includes('json') || !type
    if (!글인가) return fail('글이 아니라 파일이라서 읽지 못했어요(사진, 영상, PDF 는 자료로 올려 주세요)')

    // 미리 알려준 크기가 한도를 넘으면 열지 않는다 (20MB 넘는 글은 없다. 파일이거나 공격이다)
    const declared = Number(res.headers.get('content-length') || '0')
    if (declared > maxBytes) return fail('그 주소의 내용이 너무 커서 읽지 않았어요')

    const body = await readLimitedText(res, pickCharset(type), maxBytes).catch(() => '')
    if (!body) return fail('그 주소에서 읽을 내용이 없었어요')
    return { ok: true, url: current, requestedUrl, contentType: type, body }
}
