import { describe, it, expect } from 'vitest'
import { wantsWebSearch, WEB_SEARCH_PROMPT, SEARCH_OFFER_PROMPT } from '../search-intent'

describe('wantsWebSearch — 검색이 필요한 말인가 (0930 「리서치 검색 안되니?」)', () => {
    it.each([
        'instinct 라는 곳 투자 엄청 받았던데 살펴봐줄래?',
        '뭔가 매력있는 구조가 필요한데... 리서치 좀 해줘',
        '꾸그 검색해서 알려줘',
        '요즘 크리에이터 시장 최신 소식 알아봐 줘',
        '이 회사 찾아봐',
        '경쟁사 조사해 줘',
        '관련 뉴스 있어?',
        '구글링 해줘',
        '서치 좀 해줘',
        '최신 소식 있어?',
    ])('검색한다: %s', text => {
        expect(wantsWebSearch(text)).toBe(true)
    })
    it.each([
        '메타 광고비를 줄였거든',
        '참.. 사람들을 모으는 게 쉽지 않네',
        '멤버십에 있어야 하는 기능들은 뭐가 있을까?',
        '뉴스레터 구독자 늘리는 법',
        '검색엔진 최적화 어떻게 해?',
        '인스타 검색 노출 늘리려면',
        '알아보기 쉽게 정리해줘',
        '찾아보니까 다들 그렇대',
        '살펴보면 좋을 포인트',
        '최신순으로 정렬해 줘',
        '설문조사 해볼까',
        '내 마음 좀 알아줘',
        '검색해서 들어오는 고객 늘리려면',
        '검색하고 나서 이탈이 많아',
        '뉴스 기사 스타일로 써줘',
        '시장조사 해야 할까',
        '같이 찾아봐요',
        '',
    ])('검색하지 않는다: %s', text => {
        expect(wantsWebSearch(text)).toBe(false)
    })
})

describe('SEARCH_OFFER_PROMPT — 검색이 되는 봇에서만 붙인다', () => {
    it('「찾아봐 줘」라고 하면 검색한다고 안내한다', () => {
        expect(SEARCH_OFFER_PROMPT).toContain('찾아봐 줘')
    })
})

describe('WEB_SEARCH_PROMPT', () => {
    it('출처를 붙이고, 못 찾으면 못 찾았다고 말하게 한다', () => {
        expect(WEB_SEARCH_PROMPT).toContain('출처')
        expect(WEB_SEARCH_PROMPT).toContain('못 찾았')
    })
})
