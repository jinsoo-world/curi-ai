#!/usr/bin/env node
// 큐리어스 간이 CLI (대표 지시 1005). 큐리어스 화면 주소나 「종류 번호」를 넣으면 공개 정보를 글이나 JSON 으로 보여 준다.
// 읽는 일은 src/domains/knowledge/curious-reader.ts 가 한다 (큐리AI 링크 읽기와 같은 함수). 로그인, 쓰기 요청 없음.
//
//   node scripts/curious-cli.mjs https://curious-500.com/v2/membership/explore/95
//   node scripts/curious-cli.mjs study 4962            (종류: membership, study, leader, digital-content, post, community)
//   node scripts/curious-cli.mjs community --json      (JSON 으로)
//   node scripts/curious-cli.mjs leader 7 --images     (이미지 주소만)
//
// Node 23.6 이상은 .ts 를 바로 읽는다. 22.6 이상 23.6 미만은 --experimental-strip-types 를 붙여 다시 실행한다.
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
const native = major > 23 || (major === 23 && minor >= 6)
if (!native && !process.execArgv.includes('--experimental-strip-types')) {
    if (major < 22 || (major === 22 && minor < 6)) {
        console.error('Node 22.6 이상이 필요해요 (지금 ' + process.versions.node + ')')
        process.exit(2)
    }
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' })
    process.exit(r.status ?? 1)
}

// .ts 를 바로 읽을 때 나오는 「package.json 에 type 이 없다」 알림은 감춘다 (package.json 은 앱 빌드 때문에 안 바꾼다)
const emitWarning = process.emitWarning.bind(process)
process.emitWarning = (w, ...a) => {
    const text = `${typeof w === 'string' ? w : w?.message ?? ''} ${a.map(x => (typeof x === 'string' ? x : x?.code ?? '')).join(' ')}`
    if (/MODULE_TYPELESS_PACKAGE_JSON|Module type of|Type Stripping/i.test(text)) return
    emitWarning(w, ...a)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const mod = await import(pathToFileURL(path.join(here, '../src/domains/knowledge/curious-reader.ts')).href)

const args = process.argv.slice(2).filter(a => a !== '--')
const flags = new Set(args.filter(a => a.startsWith('--')))
const rest = args.filter(a => !a.startsWith('--'))
if (rest.length === 0 || flags.has('--help')) {
    console.log('쓰는 법: node scripts/curious-cli.mjs <큐리어스 주소 | 종류 번호> [--json] [--images]\n종류: membership, study, leader, digital-content, post, community')
    process.exit(rest.length === 0 ? 1 : 0)
}
const target = mod.parseCuriousInput(rest[0], rest[1])
if (!target) {
    console.error('큐리어스 주소나 「종류 번호」를 알아보지 못했어요: ' + rest.join(' '))
    process.exit(1)
}
const started = Date.now()
const r = await mod.readCurious(target, { timeoutMs: 15_000 })
if (!r.ok) {
    if (flags.has('--json')) console.log(JSON.stringify({ ok: false, target, reason: r.reason, code: r.code }, null, 2))
    else console.error(`못 읽었어요 (${r.code}): ${r.reason}`)
    process.exit(1)
}
if (flags.has('--json')) {
    console.log(JSON.stringify({ ok: true, target, chars: r.doc.text.length, ms: Date.now() - started, ...r.doc }, null, 2))
} else if (flags.has('--images')) {
    for (const i of r.doc.images) console.log(`${i.label}\t${i.url}`)
} else {
    console.log(r.doc.text)
    console.error(`\n(${r.doc.title} | ${r.doc.text.length}자 | 이미지 ${r.doc.images.length}개 | ${Date.now() - started}ms)`)
}
