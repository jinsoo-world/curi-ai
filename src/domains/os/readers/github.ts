// domains/os/readers = GitHub 주소를 글로. 공개 API(열쇠 없음)만 쓴다.
//
//   저장소   = 설명, 별, 포크, 주 언어, 라이선스, 주제 + README
//   이슈, PR = 제목, 상태, 본문 + 댓글 앞 10개
//   파일     = raw.githubusercontent.com 원문
// ⚠ 열쇠 없는 API 는 IP 하나당 시간당 60번이다. Vercel 은 IP 를 여럿이 같이 써서 막힐 수 있다.
//   막히면(403, 429) null 을 돌려주고, 부르는 쪽(readers/index.ts)이 github.com 웹페이지 읽기로 되돌아간다.
// 🛡 요청은 전부 fetchPageSafely (주소 검사, 크기, 시간 한도)를 지난다.

import { fetchPageSafely } from '@/domains/agent/fetch-url'
import type { ReadPage } from '@/domains/agent/fetch-url'
import type { GithubTarget } from './router'

const API = 'https://api.github.com'
const API_HEADERS = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

export interface GithubOptions {
    timeoutMs: number
    maxChars: number
    maxBytes: number
}

async function getJson<T>(url: string, o: GithubOptions): Promise<T | null> {
    const r = await fetchPageSafely(url, { timeoutMs: o.timeoutMs, maxBytes: o.maxBytes, headers: API_HEADERS })
    if (!r.ok) return null
    try { return JSON.parse(r.body) as T } catch { return null }
}

interface RepoJson {
    full_name?: string; description?: string | null; stargazers_count?: number; forks_count?: number
    language?: string | null; license?: { spdx_id?: string; name?: string } | null; topics?: string[]
    pushed_at?: string; homepage?: string | null; open_issues_count?: number; archived?: boolean; default_branch?: string
}
interface ReadmeJson { content?: string; encoding?: string }
interface IssueJson {
    title?: string; state?: string; body?: string | null; user?: { login?: string }; comments?: number
    created_at?: string; pull_request?: { merged_at?: string | null }; labels?: { name?: string }[]
}
interface CommentJson { body?: string | null; user?: { login?: string } }

const n = (v?: number) => (typeof v === 'number' ? v.toLocaleString('en-US') : '?')
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '')

function decodeBase64(s: string): string {
    try { return Buffer.from(String(s ?? '').replace(/\s/g, ''), 'base64').toString('utf-8') } catch { return '' }
}

/** GitHub 주소 하나 → 글. 못 읽으면 null (부르는 쪽이 웹페이지 읽기로 되돌아간다) */
export async function readGithub(requestedUrl: string, t: GithubTarget, o: GithubOptions): Promise<ReadPage | null> {
    const base = `https://github.com/${t.owner}/${t.repo}`

    if (t.type === 'blob' && t.ref && t.path) {
        const raw = `https://raw.githubusercontent.com/${t.owner}/${t.repo}/${t.ref}/${t.path}`
        const r = await fetchPageSafely(raw, { timeoutMs: o.timeoutMs, maxBytes: o.maxBytes })
        if (!r.ok) return null
        const head = `[GitHub 파일] ${t.owner}/${t.repo} ${t.path} (${t.ref})\n주소: ${requestedUrl}`
        return page(requestedUrl, `${t.path} | ${t.owner}/${t.repo}`, `${head}\n\n${r.body}`, o.maxChars)
    }

    if ((t.type === 'issue' || t.type === 'pull') && t.number) {
        const [issue, comments] = await Promise.all([
            getJson<IssueJson>(`${API}/repos/${t.owner}/${t.repo}/issues/${t.number}`, o),
            getJson<CommentJson[]>(`${API}/repos/${t.owner}/${t.repo}/issues/${t.number}/comments?per_page=10`, o),
        ])
        if (!issue || !issue.title) return null
        const isPr = !!issue.pull_request || t.type === 'pull'
        const state = isPr && issue.pull_request?.merged_at ? '합쳐짐(merged)' : issue.state === 'closed' ? '닫힘' : '열림'
        const labels = (issue.labels ?? []).map(l => l.name).filter(Boolean).join(', ')
        const head = [
            `[GitHub ${isPr ? 'PR' : '이슈'}] ${t.owner}/${t.repo} #${t.number} ${issue.title}`,
            `상태: ${state} | 작성자: ${issue.user?.login ?? '?'} | 작성일: ${day(issue.created_at)} | 댓글 ${issue.comments ?? 0}개`,
            labels ? `라벨: ${labels}` : '',
            `주소: ${requestedUrl}`,
        ].filter(Boolean).join('\n')
        const cm = (comments ?? []).filter(c => c.body).map(c => `- ${c.user?.login ?? '?'}: ${String(c.body).trim().slice(0, 1_500)}`)
        const text = `${head}\n\n[본문]\n${(issue.body ?? '').trim() || '(본문 없음)'}${cm.length ? `\n\n[댓글]\n${cm.join('\n')}` : ''}`
        return page(requestedUrl, `#${t.number} ${issue.title} | ${t.owner}/${t.repo}`, text, o.maxChars)
    }

    // 저장소 (tree 도 저장소 첫 화면처럼 읽는다)
    const [repo, readme] = await Promise.all([
        getJson<RepoJson>(`${API}/repos/${t.owner}/${t.repo}`, o),
        getJson<ReadmeJson>(`${API}/repos/${t.owner}/${t.repo}/readme`, o),
    ])
    if (!repo || !repo.full_name) return null
    const readmeText = readme?.content && readme.encoding === 'base64' ? decodeBase64(readme.content).trim() : ''
    const license = repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : repo.license?.name
    const head = [
        `[GitHub 저장소] ${repo.full_name}${repo.archived ? ' (보관됨)' : ''}`,
        repo.description ? `설명: ${repo.description}` : '',
        `별: ${n(repo.stargazers_count)} | 포크: ${n(repo.forks_count)} | 열린 이슈: ${n(repo.open_issues_count)}${repo.language ? ` | 주 언어: ${repo.language}` : ''}${license ? ` | 라이선스: ${license}` : ''}`,
        repo.topics?.length ? `주제: ${repo.topics.join(', ')}` : '',
        repo.pushed_at ? `마지막 반영: ${day(repo.pushed_at)}` : '',
        repo.homepage ? `홈페이지: ${repo.homepage}` : '',
        `주소: ${base}`,
    ].filter(Boolean).join('\n')
    const text = `${head}\n\n[README]\n${readmeText || '(README 없음)'}`
    const title = repo.description ? `${repo.full_name}: ${repo.description}` : repo.full_name
    return page(requestedUrl, title, text, o.maxChars)
}

function page(requestedUrl: string, title: string, text: string, maxChars: number): ReadPage {
    return { ok: true, url: requestedUrl, requestedUrl, title: title.slice(0, 120), text: text.slice(0, maxChars), kind: 'web', method: 'github', source: 'github' }
}
