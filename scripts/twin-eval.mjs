#!/usr/bin/env node
// scripts/twin-eval.mjs — 트윈 봇 판정 도구
//
// 하는 일 = 팬 질문 10개를 봇에게 차례로 던져 답장 초안을 모으고,
// 사람이 채점하는 표가 붙은 결과 파일 하나를 만든다.
//
// 이 도구는 점수를 매기지 않는다. 채점은 대표가 한다. 도구는 재료만 모은다.
//
// 새 라이브러리 안 쓴다(Node 18+ 의 fetch 만 쓴다). 열쇠·쿠키는 코드에 넣지 않는다.

import fs from 'node:fs'
import path from 'node:path'

const 기본주소 = 'https://www.curi-ai.com'
const 손님하루한도 = 8            // src/domains/chat/constants.ts MAX_DAILY_FREE_GUEST
const 회원하루한도 = 8            // 같은 파일 MAX_DAILY_FREE (프리미엄·체험권이면 안 셈)

const 도움말 = `
트윈 봇 판정 도구 — 팬 질문 10개를 던져 답장 초안을 모은다

  node scripts/twin-eval.mjs --bot <봇번호> [옵션]

꼭 있어야 하는 것
  --bot <봇번호>        봇 번호(mentorId). 화면 주소 /os/chat/여기에있는긴번호 를 그대로 복사

옵션
  --base <주소>         기본값 ${기본주소}
  --questions <파일>    기본값 docs/twin/03_팬질문_10개.md
  --cookie "<쿠키>"     로그인 쿠키. 없으면 손님으로 물어본다(하루 ${손님하루한도}회 한도)
  --out <파일>          기본값 docs/twin/결과_YYYYMMDD_HHMM.md
  --limit <숫자>        앞에서 몇 개만 물어본다 (예행용)
  --wait <초>           질문 사이 쉬는 시간. 기본 2초 (분당 100회 한도를 안 건드리려고)
  --dry                 보내지 않고 무엇을 보낼지만 보여 준다
  --help                이 도움말

쿠키 얻는 법 (대표용, 1분)
  1. 크롬에서 ${기본주소} 에 로그인한다
  2. F12 → Application(응용 프로그램) → Cookies → ${기본주소}
  3. 이름이 sb- 로 시작하는 줄을 전부 "이름=값; 이름=값" 으로 이어 붙여 --cookie 에 넣는다
  ⚠️ 이 쿠키는 내 계정 열쇠다. 파일이나 채팅에 남기지 마라. 명령에만 쓰고 지운다.

한도 안내
  · 손님(쿠키 없음) = 하루 ${손님하루한도}회. 질문 10개를 다 물으려면 로그인 쿠키가 필요하다.
  · 회원(쿠키 있음) = 체험권이나 프리미엄이 아니면 역시 하루 ${회원하루한도}회에서 막힌다.
    막히면 답 자리에 「무료 대화를 모두 사용했어요」 같은 안내가 그대로 들어온다.
    그럴 땐 화면(/os/chat/<봇번호>)에서 손으로 물어보고 채점표만 쓰면 된다.
`

function 인자읽기(argv) {
    const o = { base: 기본주소, questions: 'docs/twin/03_팬질문_10개.md', wait: 2 }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        const 다음 = () => argv[++i]
        if (a === '--help' || a === '-h') o.help = true
        else if (a === '--dry') o.dry = true
        else if (a === '--bot') o.bot = 다음()
        else if (a === '--base') o.base = String(다음() || '').replace(/\/+$/, '')
        else if (a === '--questions') o.questions = 다음()
        else if (a === '--cookie') o.cookie = 다음()
        else if (a === '--out') o.out = 다음()
        else if (a === '--limit') o.limit = Number(다음())
        else if (a === '--wait') o.wait = Number(다음())
        else o.unknown = (o.unknown ?? []).concat(a)
    }
    return o
}

/**
 * 질문 파일에서 질문만 뽑는다.
 * 「1. 질문」 처럼 번호로 시작하는 줄만 질문으로 본다. 굵게 표시(**)는 떼어 낸다.
 */
export function 질문뽑기(markdown) {
    const 결과 = []
    for (const 줄 of String(markdown ?? '').split('\n')) {
        const m = /^\s*(\d{1,2})\.\s+(.+?)\s*$/.exec(줄)
        if (!m) continue
        const 본문 = m[2].replace(/\*\*/g, '').replace(/^«|»$/g, '').trim()
        if (본문.length < 5) continue
        결과.push({ 번호: Number(m[1]), 질문: 본문 })
    }
    return 결과
}

/** 두 자리로 맞춘다 */
const 두자리 = n => String(n).padStart(2, '0')

export function 지금도장(d = new Date()) {
    return `${d.getFullYear()}${두자리(d.getMonth() + 1)}${두자리(d.getDate())}_${두자리(d.getHours())}${두자리(d.getMinutes())}`
}

/** SSE 조각들을 이어 붙여 답 한 덩이로 만든다 */
export function SSE모으기(덩이) {
    let 답 = ''
    let 마지막전체 = ''
    for (const 토막 of String(덩이 ?? '').split('\n\n')) {
        for (const 줄 of 토막.split('\n')) {
            if (!줄.startsWith('data: ')) continue
            try {
                const d = JSON.parse(줄.slice(6))
                if (typeof d.text === 'string') 답 += d.text
                if (typeof d.fullResponse === 'string' && d.fullResponse) 마지막전체 = d.fullResponse
            } catch { /* 깨진 조각 하나는 넘어간다 */ }
        }
    }
    return 마지막전체 || 답
}

/** 답이 「한도에 걸렸다」는 안내문인지 본다 */
export function 한도안내인가(답) {
    return /무료 체험 대화를 모두 사용|무료 대화|클로버가 부족/.test(String(답 ?? ''))
}

async function 한개물어보기({ base, bot, cookie, 질문 }) {
    const 시작 = Date.now()
    const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 질문 }],
            mentorId: bot,
            inputMethod: 'text',
            ...(cookie ? {} : { visitorId: `twin-eval-${지금도장()}`, guestMessageCount: 0 }),
        }),
    })

    const 드라이버 = res.headers.get('x-llm-driver') || '(모름)'
    if (!res.ok) {
        const 본문 = await res.text().catch(() => '')
        return { 답: `(실패) HTTP ${res.status} ${본문.slice(0, 200)}`, 초: (Date.now() - 시작) / 1000, 드라이버, 실패: true }
    }
    const 답 = SSE모으기(await res.text())
    return { 답, 초: (Date.now() - 시작) / 1000, 드라이버, 실패: !답 }
}

const 쉬기 = 초 => new Promise(r => setTimeout(r, Math.max(0, 초) * 1000))

function 결과문서({ base, bot, 드라이버들, 항목들, 언제 }) {
    const 줄 = []
    줄.push(`# 트윈 판정 결과 — ${언제}`)
    줄.push('')
    줄.push(`- 봇 번호: \`${bot}\``)
    줄.push(`- 주소: ${base}`)
    줄.push(`- 모델 드라이버: ${[...new Set(드라이버들)].join(', ')}`)
    줄.push(`- 물어본 질문: ${항목들.length}개`)
    줄.push('')
    줄.push('> 쿠키는 이 파일에 적지 않는다. 명령에만 쓰고 지운다.')
    줄.push('')
    줄.push('---')
    줄.push('')

    for (const it of 항목들) {
        줄.push(`## ${it.번호}. ${it.질문}`)
        줄.push('')
        줄.push(`걸린 시간 ${it.초.toFixed(1)}초 · 글자 수 ${it.답.length}자 · 드라이버 ${it.드라이버}`)
        줄.push('')
        줄.push('```')
        줄.push(it.답 || '(답이 비었다)')
        줄.push('```')
        줄.push('')
        if (한도안내인가(it.답)) {
            줄.push('⚠️ 이건 봇의 답이 아니라 **한도 안내문**이다. 이 줄은 채점에서 빼고 다시 물어봐야 한다.')
            줄.push('')
        }
    }

    줄.push('---')
    줄.push('')
    줄.push('## 채점표 — 대표가 채우는 곳')
    줄.push('')
    줄.push('합격 기준 3개를 다 넘으면 ○, 하나라도 못 넘으면 ×.')
    줄.push('')
    줄.push('1. 사실 오류 0 (없는 제도·없는 가격·없는 날짜를 말하지 않았다)')
    줄.push('2. 말투 일치 (내가 쓴 글처럼 읽힌다)')
    줄.push('3. 다음 한 걸음 (읽은 사람이 바로 할 수 있는 행동이 하나 있다)')
    줄.push('')
    줄.push('| 번호 | 질문 | 사실 | 말투 | 다음 걸음 | 합격(○/×) | 한 줄 메모 |')
    줄.push('|---|---|---|---|---|---|---|')
    for (const it of 항목들) {
        const 제목 = it.질문.length > 24 ? `${it.질문.slice(0, 24)}…` : it.질문
        줄.push(`| ${it.번호} | ${제목} | | | | | |`)
    }
    줄.push('')
    줄.push('**합격 개수: ___ / ' + 항목들.length + '**')
    줄.push('')
    줄.push(`- 7개 이상 → **판정 통과.** 5일차 합격.`)
    줄.push(`- 6개 이하 → 판정 미달. × 가 난 이유를 세어 보고 말투 규칙(\`docs/twin/02_트윈_설명.md\`)이나 자료(\`04_자료_투입목록.md\`)를 고친 뒤 다시 돌린다.`)
    줄.push('')
    return 줄.join('\n')
}

async function main() {
    const o = 인자읽기(process.argv.slice(2))
    if (o.help || process.argv.length <= 2) {
        console.log(도움말)
        return
    }
    if (o.unknown?.length) {
        console.error(`모르는 인자: ${o.unknown.join(' ')}\n--help 를 보라.`)
        process.exitCode = 1
        return
    }
    if (!o.bot) {
        console.error('--bot <봇번호> 가 없다. 화면 주소 /os/chat/<봇번호> 에서 복사해라. (--help)')
        process.exitCode = 1
        return
    }

    const 질문파일 = path.resolve(process.cwd(), o.questions)
    if (!fs.existsSync(질문파일)) {
        console.error(`질문 파일이 없다: ${질문파일}`)
        process.exitCode = 1
        return
    }
    let 질문들 = 질문뽑기(fs.readFileSync(질문파일, 'utf8'))
    if (Number.isFinite(o.limit) && o.limit > 0) 질문들 = 질문들.slice(0, o.limit)
    if (질문들.length === 0) {
        console.error(`질문을 하나도 못 찾았다: ${질문파일}\n「1. 질문내용」 처럼 번호로 시작하는 줄이어야 한다.`)
        process.exitCode = 1
        return
    }

    if (!o.cookie && 질문들.length > 손님하루한도) {
        console.log(`⚠️ 쿠키 없이는 하루 ${손님하루한도}회까지다. 질문 ${질문들.length}개 중 뒤쪽은 한도 안내문이 올 수 있다.`)
        console.log('   --cookie "<로그인 쿠키>" 를 주거나, 화면에서 손으로 물어봐라. (--help 에 쿠키 얻는 법)')
        console.log('')
    }

    console.log(`봇 ${o.bot} 에게 질문 ${질문들.length}개를 던진다. (${o.base})`)
    if (o.dry) {
        console.log('\n--dry 라 보내지 않는다. 보낼 질문:')
        for (const q of 질문들) console.log(`  ${q.번호}. ${q.질문}`)
        console.log(`\n결과가 저장될 곳: ${o.out ?? `docs/twin/결과_${지금도장()}.md`}`)
        return
    }

    const 항목들 = []
    const 드라이버들 = []
    for (const q of 질문들) {
        process.stdout.write(`  ${q.번호}. ${q.질문.slice(0, 30)}… `)
        try {
            const r = await 한개물어보기({ base: o.base, bot: o.bot, cookie: o.cookie, 질문: q.질문 })
            항목들.push({ ...q, ...r })
            드라이버들.push(r.드라이버)
            console.log(`${r.초.toFixed(1)}초 · ${r.답.length}자${한도안내인가(r.답) ? ' · ⚠️ 한도 안내문' : ''}`)
            if (한도안내인가(r.답)) {
                console.log('     한도에 걸렸다. 남은 질문은 내일 돌리거나 로그인 쿠키를 넣어라.')
            }
        } catch (e) {
            항목들.push({ ...q, 답: `(실패) ${e?.message ?? e}`, 초: 0, 드라이버: '(모름)', 실패: true })
            드라이버들.push('(모름)')
            console.log('실패')
        }
        if (q !== 질문들[질문들.length - 1]) await 쉬기(o.wait)
    }

    const 언제 = 지금도장()
    const 낼곳 = path.resolve(process.cwd(), o.out ?? `docs/twin/결과_${언제}.md`)
    fs.mkdirSync(path.dirname(낼곳), { recursive: true })
    fs.writeFileSync(낼곳, 결과문서({ base: o.base, bot: o.bot, 드라이버들, 항목들, 언제 }), 'utf8')

    const 한도수 = 항목들.filter(it => 한도안내인가(it.답)).length
    console.log('')
    console.log(`저장했다: ${낼곳}`)
    if (한도수 > 0) console.log(`⚠️ ${항목들.length}개 중 ${한도수}개가 한도 안내문이다. 그건 빼고 채점해라.`)
    console.log('이 파일을 열어 맨 아래 채점표를 채우면 판정이 끝난다. 합격 7개 이상이면 통과.')
}

// 테스트에서 함수만 가져다 쓸 수 있게, 직접 실행할 때만 돈다
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    main().catch(e => { console.error(e); process.exitCode = 1 })
}
