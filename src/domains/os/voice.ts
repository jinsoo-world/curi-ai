// domains/os — 말투 추출기
//
// 주인이 실제로 쓴 글 몇 편을 넣으면 「말투 특징」을 숫자로 뽑는다.
// 그 숫자를 사람이 읽는 문단(말투 규칙)으로 바꿔 봇 설명에 붙인다.
//
// 왜 필요한가 = 「내 말투로 써 줘」라고만 하면 모델은 자기 평소 말투로 쓴다.
// 문장이 몇 글자인지, 존댓말인지, 어떤 낱말을 자주 쓰는지, 이모지를 쓰는지를
// 숫자로 못 박아야 답장 초안이 주인 글처럼 읽힌다.
//
// 규칙: 순수 함수만 둔다(바깥을 부르지 않는다). 새 라이브러리 안 쓴다.

/** 말투 특징 한 묶음 */
export interface VoiceProfile {
    /** 넣은 글 편 수 */
    sampleCount: number
    /** 문장 수 */
    sentenceCount: number
    /** 평균 문장 길이 (공백 포함 글자 수, 소수 첫째 자리) */
    avgSentenceLength: number
    /** 제일 긴 문장 길이 */
    maxSentenceLength: number
    /** 존댓말 문장 비율 0~1 (소수 둘째 자리) */
    politeRatio: number
    /** 이모지를 쓰는가 */
    usesEmoji: boolean
    /** 느낌표로 끝나는 문장 비율 0~1 */
    exclamationRatio: number
    /** 물음표로 끝나는 문장 비율 0~1 */
    questionRatio: number
    /** 자주 쓰는 낱말 상위 10 (조사 뗀 뒤) */
    topWords: { word: string; count: number }[]
    /** 문장 끝 패턴 상위 6 (예: 「~요」 「~습니다」 「~다」) */
    endings: { ending: string; count: number }[]
}

/** 존댓말로 보는 문장 끝. 긴 것부터 본다 */
const POLITE_ENDINGS = [
    '습니다', 'ㅂ니다', '입니다', '합니다', '됩니다', '십시오', '세요', '예요', '이에요',
    '에요', '네요', '어요', '아요', '해요', '지요', '죠', '요',
]

/** 세는 데서 빼는 흔한 말 (뜻이 없어 말투를 설명해 주지 못한다) */
const STOPWORDS = new Set([
    '그리고', '그런데', '하지만', '그래서', '그러면', '그냥', '정말', '진짜', '너무',
    '이것', '저것', '그것', '여기', '거기', '저기', '무엇', '어떤', '어떻게', '이런', '그런', '저런',
    '있다', '없다', '하다', '되다', '같다', '한다', '있는', '없는', '하는', '되는', '같은',
    '제가', '저는', '저희', '우리', '내가', '나는', '당신', '여러분',
    '것', '수', '등', '때', '더', '잘', '안', '못', '좀', '또', '이제', '그', '저', '이', '단',
    '위해', '대한', '통해', '많이', '조금', '항상', '가장', '다시', '먼저', '함께', '바로',
])

/** 낱말 뒤에 붙어 뜻을 안 바꾸는 조사. 긴 것부터 뗀다 */
const PARTICLES = [
    '으로는', '에서는', '에게는', '이라는', '라는', '이라고', '라고',
    '으로', '에서', '에게', '한테', '까지', '부터', '보다', '처럼', '마다', '조차', '마저',
    '이나', '나마', '이야', '이랑', '하고',
    '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '과', '와', '랑', '로', '야',
]

const EMOJI_RE = /\p{Extended_Pictographic}/u

/** 문장 끝 기호, 따옴표, 괄호를 떼고 알맹이만 남긴다 */
function stripTail(s: string): string {
    return s.replace(/[.!?~…, "'”’)\]』」】\s]+$/u, '')
}

/** 글을 문장으로 나눈다. 마침표, 물음표, 느낌표, 줄바꿈이 경계다 */
export function splitSentences(text: string): string[] {
    return String(text ?? '')
        .replace(/\r/g, '')
        .split(/(?<=[.!?…])\s+|\n+/u)
        .map(s => s.trim())
        .filter(s => s.replace(/[^\p{L}\p{N}]/gu, '').length > 0)
}

/**
 * 조사처럼 끝나지만 조사가 아닌 낱말. 여기 있는 건 손대지 않는다.
 * 예: 「그대로」에서 「로」를 떼면 「그대」가 되어 뜻이 사라진다.
 */
const NEVER_STRIP = new Set([
    '그대로', '이대로', '제대로', '바로', '서로', '따로', '새로', '주로', '별로',
    '스스로', '저절로', '실제로', '정말로', '앞으로', '뒤로', '대신', '때문',
])

/** 낱말 하나에서 조사를 뗀다. 두 글자 미만으로 줄어들면 원래 것을 쓴다 */
export function stripParticle(word: string): string {
    if (NEVER_STRIP.has(word)) return word
    for (const p of PARTICLES) {
        if (word.length > p.length + 1 && word.endsWith(p)) {
            return word.slice(0, -p.length)
        }
    }
    return word
}

/** 이 문장이 존댓말인가 */
export function isPolite(sentence: string): boolean {
    const core = stripTail(sentence)
    return POLITE_ENDINGS.some(e => core.endsWith(e))
}

/** 문장 끝 패턴 한 개 (보이는 말로) */
function endingOf(sentence: string): string {
    const core = stripTail(sentence)
    for (const e of POLITE_ENDINGS) {
        if (core.endsWith(e)) return `~${e}`
    }
    // 존댓말이 아니면 마지막 두 글자를 패턴으로 본다
    const tail = core.slice(-2)
    return tail ? `~${tail}` : '~'
}

function round(n: number, digits: number): number {
    const f = 10 ** digits
    return Math.round(n * f) / f
}

function topOf(map: Map<string, number>, limit: number): { word: string; count: number }[] {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
        .slice(0, limit)
        .map(([word, count]) => ({ word, count }))
}

/** 글 샘플 여러 편 → 말투 특징 */
export function analyzeVoice(samples: string[]): VoiceProfile {
    const texts = (samples ?? []).map(s => String(s ?? '')).filter(s => s.trim().length > 0)
    const sentences = texts.flatMap(splitSentences)
    const n = sentences.length

    const empty: VoiceProfile = {
        sampleCount: texts.length, sentenceCount: 0, avgSentenceLength: 0, maxSentenceLength: 0,
        politeRatio: 0, usesEmoji: false, exclamationRatio: 0, questionRatio: 0,
        topWords: [], endings: [],
    }
    if (n === 0) return empty

    let polite = 0, bang = 0, ask = 0, totalLen = 0, maxLen = 0
    const wordMap = new Map<string, number>()
    const endMap = new Map<string, number>()

    for (const s of sentences) {
        totalLen += s.length
        if (s.length > maxLen) maxLen = s.length
        if (isPolite(s)) polite += 1
        if (/[!]\s*$/.test(s)) bang += 1
        if (/[?]\s*$/.test(s)) ask += 1

        const end = endingOf(s)
        endMap.set(end, (endMap.get(end) ?? 0) + 1)

        for (const raw of s.split(/\s+/u)) {
            const cleaned = raw.replace(/[^\p{L}\p{N}]/gu, '')
            if (cleaned.length < 2) continue
            const word = stripParticle(cleaned)
            if (word.length < 2) continue
            if (STOPWORDS.has(word)) continue
            wordMap.set(word, (wordMap.get(word) ?? 0) + 1)
        }
    }

    return {
        sampleCount: texts.length,
        sentenceCount: n,
        avgSentenceLength: round(totalLen / n, 1),
        maxSentenceLength: maxLen,
        politeRatio: round(polite / n, 2),
        usesEmoji: texts.some(t => EMOJI_RE.test(t)),
        exclamationRatio: round(bang / n, 2),
        questionRatio: round(ask / n, 2),
        topWords: topOf(wordMap, 10),
        endings: topOf(endMap, 6).map(({ word, count }) => ({ ending: word, count })),
    }
}

/**
 * 말투 특징 → 봇 설명에 그대로 붙이는 「말투 규칙」 문단.
 * 숫자를 그대로 적는다. 「자연스럽게」 같은 말은 모델이 못 지킨다.
 */
export function buildVoiceGuide(profile: VoiceProfile): string {
    if (profile.sentenceCount === 0) {
        return `[말투 규칙]
- 아직 주인이 쓴 글 샘플이 없다. 짧은 존댓말로, 결론을 먼저 말하고, 어려운 말은 쉬운 말로 푼다.`
    }

    const avg = Math.round(profile.avgSentenceLength)
    const lo = Math.max(8, avg - 10)
    const hi = avg + 10
    const lines: string[] = []

    lines.push(`- 문장은 짧게. 평균 ${avg}자 안팎으로 쓴다(대략 ${lo}~${hi}자). ${profile.maxSentenceLength}자를 넘는 문장은 두 개로 쪼갠다.`)

    if (profile.politeRatio >= 0.7) {
        lines.push(`- 존댓말로 쓴다(주인 글의 ${Math.round(profile.politeRatio * 100)}%가 존댓말이다).`)
    } else if (profile.politeRatio <= 0.3) {
        lines.push(`- 주인은 평어(반말체 서술)로 쓴다(존댓말이 ${Math.round(profile.politeRatio * 100)}%뿐이다). 단 팬에게 보내는 답장은 존댓말로 바꾼다.`)
    } else {
        lines.push(`- 존댓말과 평어를 섞어 쓴다(존댓말 ${Math.round(profile.politeRatio * 100)}%). 팬에게 보내는 답장은 존댓말 쪽으로 기운다.`)
    }

    if (profile.endings.length > 0) {
        lines.push(`- 자주 쓰는 문장 끝: ${profile.endings.map(e => `「${e.ending}」`).join(' ')}. 이 끝맺음을 그대로 쓴다.`)
    }
    if (profile.topWords.length > 0) {
        lines.push(`- 주인이 자주 쓰는 낱말: ${profile.topWords.map(w => w.word).join(', ')}. 같은 뜻이면 이 낱말을 고른다.`)
    }

    lines.push(profile.usesEmoji
        ? `- 이모지를 쓴다. 다만 한 답장에 1개까지.`
        : `- 이모지를 쓰지 않는다. 하나도 넣지 않는다.`)

    lines.push(profile.exclamationRatio >= 0.15
        ? `- 느낌표를 쓴다(문장의 ${Math.round(profile.exclamationRatio * 100)}%). 한 답장에 1~2개까지.`
        : `- 느낌표는 거의 쓰지 않는다. 한 답장에 많아야 1개.`)

    if (profile.questionRatio >= 0.15) {
        lines.push(`- 되묻는 문장을 쓴다(문장의 ${Math.round(profile.questionRatio * 100)}%). 답장 끝에 질문 하나를 붙여도 좋다.`)
    }

    // 사람이 아니라 기계가 쓴 티가 나는 것들을 못 박아 막는다 (대표 지시 「AI 티 제로」)
    lines.push(`- 줄표(—)와 중간점(, )으로 낱말을 늘어놓지 않는다. 담백한 평문과 줄바꿈으로 쓴다.`)
    lines.push(`- 「먼저」「또한」「마지막으로」처럼 번호 매기는 말버릇을 쓰지 않는다.`)

    return `[말투 규칙 — 주인이 실제로 쓴 글 ${profile.sampleCount}편, 문장 ${profile.sentenceCount}개에서 뽑았다]\n${lines.join('\n')}`
}
