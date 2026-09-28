// .env.local 을 읽어 process.env 에 넣는다 (이미 있으면 그대로)
import fs from 'node:fs'
export function loadEnv(file = '.env.local') {
    if (!fs.existsSync(file)) return
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
}
