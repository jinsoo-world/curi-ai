// 전자책 JSON → HTML 변환 템플릿
// html2pdf.js에서 사용할 디자인된 HTML을 생성
// ★ EbookViewer.tsx 스타일과 동일하게 맞춤

interface EbookPage {
    pageNum: number
    title: string
    imageGuide?: string
    content: string
    quote?: string
    cta?: string
    checklist?: string[]
}

interface EbookData {
    cover: {
        title: string
        subtitle: string
        author: string
        imageGuide?: string
    }
    pages: EbookPage[]
}

/**
 * 전자책 JSON 데이터를 디자인된 HTML로 변환
 * 뷰어(EbookViewer.tsx)와 동일한 스타일 적용
 */

const PDF_THEMES: Record<string, {
    cover: string; titleColor: string; subtitleColor: string; authorColor: string;
}> = {
    gradient: {
        cover: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 30%, #6366f1 70%, #818cf8 100%)',
        titleColor: '#fff', subtitleColor: 'rgba(199,210,254,0.9)', authorColor: 'rgba(255,255,255,0.6)',
    },
    minimal: {
        cover: '#fafaf9',
        titleColor: '#0c0a09', subtitleColor: '#57534e', authorColor: '#a8a29e',
    },
    sunset: {
        cover: 'linear-gradient(180deg, #1c1917 0%, #451a03 30%, #92400e 60%, #d97706 100%)',
        titleColor: '#fff', subtitleColor: 'rgba(254,243,199,0.8)', authorColor: 'rgba(255,255,255,0.5)',
    },
    classic: {
        cover: 'linear-gradient(160deg, #1a2e1a 0%, #14532d 40%, #166534 100%)',
        titleColor: '#fbbf24', subtitleColor: 'rgba(255,255,255,0.75)', authorColor: 'rgba(253,224,71,0.6)',
    },
}

export function generateEbookHtml(ebook: EbookData, mentorName: string, theme?: string, ctaLinks?: string[]): string {
    const t = PDF_THEMES[theme || 'gradient'] || PDF_THEMES.gradient
    const coverBg = t.cover.includes('gradient') ? `background: ${t.cover};` : `background: ${t.cover};`

    const coverHtml = `
        <div style="
            page-break-after: always;
            width: 100%;
            height: 297mm;
            ${coverBg}
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 40px 30px;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
        ">
            <!-- 장식 요소 -->
            <div style="
                position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 4px;
            "></div>
            <div style="
                position: absolute; top: 30px; left: 30px; right: 30px; bottom: 30px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 2px;
            "></div>

            <!-- 메인 타이틀 -->
            <div style="
                text-align: center;
                padding: 0 20px;
            ">
                <h1 style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    font-size: 32pt;
                    font-weight: 800;
                    color: ${t.titleColor};
                    line-height: 1.3;
                    margin: 0 0 20px 0;
                    letter-spacing: -0.5px;
                    word-break: keep-all;
                ">${escapeHtml(ebook.cover.title)}</h1>
                
                <p style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    font-size: 14pt;
                    color: ${t.subtitleColor};
                    line-height: 1.6;
                    margin: 0;
                    word-break: keep-all;
                ">${escapeHtml(ebook.cover.subtitle)}</p>
            </div>

            <!-- 저자명 -->
            <div style="
                margin-top: 40px;
                margin-bottom: 40px;
                text-align: center;
            ">
                <div style="
                    display: inline-block;
                    padding: 10px 30px;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 2px;
                ">
                    <p style="
                        font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                        font-size: 11pt;
                        color: ${t.authorColor};
                        margin: 0;
                    ">by ${escapeHtml(ebook.cover.author || mentorName)}</p>
                </div>
            </div>
        </div>
    `

    const pagesHtml = ebook.pages.map((page, idx) => {
        const isLastPage = idx === ebook.pages.length - 1
        const pageBreak = isLastPage ? '' : 'page-break-after: always;'

        // ★ imageGuide는 PDF에서 표시하지 않음 (뷰어와 동일)

        // 인용구 (뷰어 스타일과 동일)
        const quoteHtml = page.quote ? `
            <div style="
                margin: 24px 0;
                padding: 18px 22px;
                border-left: 5px solid #6366f1;
                background: linear-gradient(135deg, #eef2ff, #f8fafc);
                border-radius: 0 8px 8px 0;
            ">
                <p style="
                    font-size: 14pt;
                    color: #4338ca;
                    font-style: italic;
                    margin: 0;
                    line-height: 1.7;
                ">💡 ${escapeHtml(page.quote)}</p>
            </div>
        ` : ''

        // 체크리스트
        const checklistHtml = page.checklist?.length ? `
            <div style="
                margin: 20px 0;
                padding: 20px 24px;
                background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
                border: 1px solid #86efac;
                border-radius: 12px;
            ">
                <p style="font-size: 13pt; font-weight: 700; color: #166534; margin: 0 0 12px 0;">✅ 당장 해야 할 첫 번째 미션</p>
                ${page.checklist.map(item => `
                    <p style="font-size: 13pt; color: #15803d; margin: 8px 0; line-height: 1.6;">
                        ☐ ${escapeHtml(item)}
                    </p>
                `).join('')}
            </div>
        ` : ''

        // CTA (뷰어 스타일과 동일)
        const ctaHtml = page.cta ? `
            <div style="
                margin: 20px 0;
                padding: 20px 24px;
                background: linear-gradient(135deg, #1e3a5f, #2563eb);
                border-radius: 12px;
                text-align: center;
            ">
                <p style="
                    font-size: 14pt;
                    color: #ffffff;
                    font-weight: 700;
                    margin: 0;
                    line-height: 1.6;
                ">${escapeHtml(page.cta)}</p>
            </div>
        ` : ''

        // ★ 본문 콘텐츠: PDF용 15pt (A4 기준 적정 크기)
        const contentHtml = escapeHtml(page.content)
            .replace(/\n\n/g, '</p><p style="margin: 0 0 20px 0; line-height: 1.85; font-size: 15pt; color: #334155;">')
            .replace(/\n/g, '<br/>')

        return `
            <div style="${pageBreak} padding: 60px 40px 50px; box-sizing: border-box; position: relative;">
                <!-- 페이지 헤더 -->
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #e2e8f0;
                ">
                    <span style="font-size: 10pt; color: #94a3b8; font-family: 'Pretendard', sans-serif; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(ebook.cover.title)}
                    </span>
                    <span style="
                        font-size: 9pt;
                        color: #ffffff;
                        background: #6366f1;
                        padding: 3px 12px;
                        border-radius: 10px;
                        font-family: 'Pretendard', sans-serif;
                        font-weight: 600;
                    ">Page ${page.pageNum}</span>
                </div>

                <!-- 섹션 제목 -->
                <h2 style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    font-size: 24pt;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0 0 20px 0;
                    line-height: 1.4;
                    word-break: keep-all;
                ">${escapeHtml(page.title)}</h2>

                <!-- 본문 -->
                <p style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    margin: 0 0 20px 0;
                    line-height: 1.85;
                    font-size: 15pt;
                    color: #334155;
                    word-break: keep-all;
                ">${contentHtml}</p>

                ${quoteHtml}
                ${ctaHtml}
                ${checklistHtml}
            </div>
        `
    }).join('')

    // CTA 링크 페이지 (채팅에서 추출된 URL이 있을 때)
    const ctaPageHtml = ctaLinks && ctaLinks.length > 0 ? `
        <div style="page-break-before: always; padding: 60px 40px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 200mm;">
            <div style="text-align: center; max-width: 480px;">
                <div style="font-size: 48px; margin-bottom: 20px;">🔗</div>
                <h2 style="
                    font-family: 'Pretendard', sans-serif;
                    font-size: 22pt;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0 0 10px 0;
                ">더 알아보기</h2>
                <p style="font-size: 12pt; color: #64748b; margin: 0 0 32px 0; line-height: 1.6;">
                    아래 링크에서 더 자세한 내용을 확인하세요.
                </p>
                ${ctaLinks.map((url, i) => `
                    <a href="${url}" target="_blank" style="
                        display: block;
                        margin: 10px auto;
                        padding: 16px 32px;
                        background: linear-gradient(135deg, #6366f1, #4f46e5);
                        color: #ffffff;
                        text-decoration: none;
                        border-radius: 12px;
                        font-size: 13pt;
                        font-weight: 600;
                        font-family: 'Pretendard', sans-serif;
                        max-width: 400px;
                        word-break: break-all;
                    ">${url.replace(/^https?:\/\//, '').split('/')[0]} →</a>
                `).join('')}
            </div>
        </div>
    ` : ''

    return `
        <div style="
            font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            width: 210mm;
            background: #ffffff;
            color: #1e293b;
        ">
            ${coverHtml}
            ${pagesHtml}
            ${ctaPageHtml}
        </div>
    `
}

function escapeHtml(text: string | undefined): string {
    if (!text) return ''
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
