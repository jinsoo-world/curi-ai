/**
 * 인스타그램 글의 구조 (올린 시각, 좋아요, 댓글, 해시태그, 사진 주소, 릴스 여부) 를 knowledge_social_posts 에 둔다.
 * 봇이 배우는 글은 knowledge_sources 한 줄 그대로. 이 표는 더하기만이고, 저장이 안 되어도 자료 저장은 막지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SocialPost } from './readers/social-post'

export function toSocialRows(mentorId: string, sourceId: string, platform: 'instagram' | 'threads', posts: readonly SocialPost[]) {
    return posts.slice(0, 30).map(p => ({
        source_id: sourceId,
        mentor_id: mentorId,
        platform,
        post_code: p.code ?? null,
        post_url: p.url ?? null,
        caption: p.text.slice(0, 20_000),
        hashtags: p.hashtags.slice(0, 60),
        mentions: p.mentions.slice(0, 60),
        posted_at: p.postedAt ?? null,
        like_count: p.likes ?? null,
        comment_count: p.comments ?? null,
        view_count: p.views ?? null,
        media_type: p.mediaType ?? null,
        is_reel: p.isReel === true,
        image_urls: p.imageUrls.slice(0, 10),
        image_expires_at: p.imageExpiresAt ?? null,
        image_note: p.imageNote ? [p.imageNote.description, p.imageNote.text ? `사진 속 글자: ${p.imageNote.text}` : ''].filter(Boolean).join('\n') || null : null,
    }))
}

/** 같은 자료의 옛 줄을 지우고 새로 넣는다 (다시 읽을 때 좋아요 수가 바뀌므로). 실패해도 던지지 않는다 */
export async function saveSocialPosts(
    db: SupabaseClient, mentorId: string, sourceId: string | undefined,
    social: { platform: 'instagram' | 'threads'; posts: readonly SocialPost[] } | undefined,
): Promise<number> {
    if (!sourceId || !social || social.posts.length === 0) return 0
    try {
        const rows = toSocialRows(mentorId, sourceId, social.platform, social.posts)
        await db.from('knowledge_social_posts').delete().eq('source_id', sourceId)
        const { error } = await db.from('knowledge_social_posts').insert(rows)
        if (error) { console.warn('[os/social-store] 글 구조 저장 실패', { mentorId, reason: error.message }); return 0 }
        return rows.length
    } catch (e) {
        console.warn('[os/social-store] 글 구조 저장 실패', { mentorId, reason: e instanceof Error ? e.message : e })
        return 0
    }
}
