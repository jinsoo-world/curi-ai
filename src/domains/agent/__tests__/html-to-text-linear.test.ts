// 보안 재검토(PR #53): HTML → 글 바꾸기가 큰 입력에서 제곱 시간(400KB 69초)이던 것 = 앞으로만 지우기 + 입구 300KB
import { describe, it, expect } from 'vitest'
import { htmlToText, HTML_TO_TEXT_MAX_INPUT } from '@/domains/agent/fetch-url'
import { curiousHtmlToText } from '@/domains/knowledge/curious-reader'

const fast = (fn: () => unknown, ms = 1_000) => { const t = Date.now(); fn(); return Date.now() - t < ms }

describe('htmlToText, curiousHtmlToText = 큰 입력도 선형', () => {
    for (const [name, f] of [['htmlToText', htmlToText], ['curiousHtmlToText', curiousHtmlToText]] as const) {
        it(`${name}: 닫는 태그 없는 <script>, 끝나지 않은 < 가 400KB 여도 1초 안`, () => {
            expect(fast(() => f('<script>'.repeat(50_000)))).toBe(true)
            expect(fast(() => f('<style '.repeat(60_000)))).toBe(true)
            expect(fast(() => f('<a'.repeat(200_000)))).toBe(true)
            expect(fast(() => f('<svg><noscript>'.repeat(30_000)))).toBe(true)
            expect(fast(() => f('<!--'.repeat(100_000)))).toBe(true)
        })
        it(`${name}: script, style 블록은 지우고 닫는 태그가 없으면 그 뒤를 버린다`, () => {
            expect(f('<p>앞</p><script>alert(1)</script><p>뒤</p>')).toBe('앞\n뒤')
            expect(f('<p>앞</p><SCRIPT type="x">a<b</SCRIPT ><style>.a{}</style><p>뒤</p>')).toBe('앞\n뒤')
            expect(f('<p>앞</p><script>끝나지 않음 <p>뒤</p>')).toBe('앞')
        })
    }

    it('htmlToText 입구는 300KB 까지만 본다', () => {
        expect(HTML_TO_TEXT_MAX_INPUT).toBe(300 * 1024)
        const out = htmlToText('가'.repeat(HTML_TO_TEXT_MAX_INPUT + 50_000))
        expect(out.length).toBe(HTML_TO_TEXT_MAX_INPUT)
    })

    it('보통 HTML 은 예전과 같이 (줄바꿈, 글자 되살리기, 주석, svg, noscript)', () => {
        expect(htmlToText('<div>하나<br/>둘</div><!-- 숨김 --><svg><path/></svg><noscript>x</noscript><p>셋 &amp; 넷&#33;</p>')).toBe('하나\n둘\n셋 & 넷!')
        expect(curiousHtmlToText('<ul><li>가</li><li>나</li></ul><p>a&nbsp;&nbsp;b</p>')).toBe('- 가\n- 나\na b')
    })
})
