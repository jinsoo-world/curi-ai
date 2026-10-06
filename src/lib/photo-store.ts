/**
 * 만든 사진 보관함 — 전수조사 3·2·20·29번
 *
 * 대표 지시 2026-09-15 = 「새로 생성한 거 다운로드는 48시간 이내까지 다운 가능. 그 이후에는 없어진다」
 *
 * 그동안 만든 사진은 브라우저 안에만 있었다. 그래서
 *  - 창을 닫으면 사라졌고 (대표에게 알린 구멍)
 *  - 비회원이 흐린 사진을 보고 로그인하면 방금 만든 것이 통째로 날아갔다 (돈이 새던 자리)
 *  - 글자로 주고받느라 실제보다 1.33배 무거웠다
 *
 * 이제 서버가 저장소에 올리고 주소만 돌려준다.
 * 비회원 것도 선명한 원본을 올려두고 「찾아가는 표(claim_token)」를 준다.
 * 로그인하면 그 표로 소유권을 넘겨받아 바로 내려받는다.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

export const 보관시간 = 48 // 시간

const 버킷 = 'tool-photos'

export interface 보관결과 {
    /** 바로 볼 수 있는 주소 */
    url: string
    /** 비회원일 때만 준다. 로그인 뒤 이 표로 사진을 찾아간다 */
    claimToken?: string
    id: string
}

/**
 * @param kind 어느 도구에서 나왔나 (id-photo, teacher-photo …)
 * @param userId 회원이면 그 사람, 비회원이면 null
 */
export async function 사진보관(
    base64: string,
    kind: string,
    userId: string | null,
    ext: 'png' | 'jpeg' = 'png',
    /** 어떤 옵션으로 만들었나 — 보관함에 한 줄로 보여준다 (대표 지시 2026-09-16) */
    options?: string | null,
): Promise<보관결과 | null> {
    try {
        const admin = createAdminClient({ longRunning: true })
        const 언제 = Date.now()
        const 폴더 = userId ?? 'guest'
        const path = `${폴더}/${언제}-${randomUUID().slice(0, 8)}.${ext}`

        const { error: upErr } = await admin.storage
            .from(버킷)
            .upload(path, Buffer.from(base64, 'base64'), {
                contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
                upsert: false,
            })
        if (upErr) {
            console.error('[보관함] 올리기 실패', upErr.message)
            return null
        }

        const claimToken = userId ? null : randomUUID()
        const { data: row, error: dbErr } = await admin
            .from('tool_photos')
            .insert({
                user_id: userId,
                kind,
                path,
                options: options || null,
                claim_token: claimToken,
                expires_at: new Date(언제 + 보관시간 * 3600_000).toISOString(),
            })
            .select('id')
            .single()
        if (dbErr) {
            console.error('[보관함] 기록 실패', dbErr.message)
            return null
        }

        const { data: pub } = admin.storage.from(버킷).getPublicUrl(path)
        return { url: pub.publicUrl, claimToken: claimToken ?? undefined, id: row.id }
    } catch (e) {
        // 보관에 실패해도 사진은 만들어졌다. 서비스를 막지 않는다.
        console.error('[보관함]', e instanceof Error ? e.message : e)
        return null
    }
}

/** 48시간 지난 것을 지운다 — 크론이 부른다 */
/** 한 번에 지우는 사진 수. 저장소 삭제 한 번에 너무 많이 넣으면 느려지고 실패하면 통째로 남는다 */
export const 지우기_묶음 = 100

/**
 * 48시간 지난 사진을 100개씩 지운다. 마감(deadlineMs)까지 남은 것이 없을 때까지 돈다.
 * 저장소 삭제가 실패한 묶음은 DB 줄도 남긴다(다음 날 다시 시도 = 파일만 남는 고아가 생기지 않게).
 * 오류는 던지지 않고 세어서 돌려준다 → 부른 쪽이 알림을 보낸다.
 */
export async function 만료된것_지우기(opts: { db?: ReturnType<typeof createAdminClient>; deadlineMs?: number; now?: Date } = {}): Promise<{ 지움: number; 오류: number; 첫오류: string | null }> {
    const admin = opts.db ?? createAdminClient({ longRunning: true })
    const deadline = opts.deadlineMs ?? Date.now() + 50_000
    const cut = (opts.now ?? new Date()).toISOString()
    let 지움 = 0, 오류 = 0
    let 첫오류: string | null = null
    const 실패 = (m: string) => { 오류++; if (!첫오류) 첫오류 = m.slice(0, 200) }
    const 건너뛸: string[] = []   // 이번 실행에서 저장소 삭제가 실패한 줄 (같은 묶음을 계속 다시 잡지 않게)

    while (Date.now() < deadline) {
        let q = admin.from('tool_photos').select('id, path').lt('expires_at', cut).order('expires_at').limit(지우기_묶음)
        if (건너뛸.length) q = q.not('id', 'in', `(${건너뛸.join(',')})`)
        const { data: rows, error } = await q
        if (error) { 실패(`목록 읽기: ${error.message}`); break }
        if (!rows?.length) break

        const { error: rmErr } = await admin.storage.from(버킷).remove(rows.map((r) => r.path))
        if (rmErr) { 실패(`저장소 삭제: ${rmErr.message}`); 건너뛸.push(...rows.map((r) => r.id)); if (건너뛸.length >= 1000) break; continue }
        const { error: delErr } = await admin.from('tool_photos').delete().in('id', rows.map((r) => r.id))
        if (delErr) { 실패(`DB 삭제: ${delErr.message}`); break }
        지움 += rows.length
        if (rows.length < 지우기_묶음) break
    }
    return { 지움, 오류, 첫오류 }
}
