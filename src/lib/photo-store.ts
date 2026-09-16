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
        const admin = createAdminClient()
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
export async function 만료된것_지우기(): Promise<{ 지움: number }> {
    const admin = createAdminClient()
    const { data: rows } = await admin
        .from('tool_photos')
        .select('id, path')
        .lt('expires_at', new Date().toISOString())
        .limit(500)

    if (!rows?.length) return { 지움: 0 }

    await admin.storage.from(버킷).remove(rows.map((r) => r.path))
    await admin.from('tool_photos').delete().in('id', rows.map((r) => r.id))
    return { 지움: rows.length }
}
