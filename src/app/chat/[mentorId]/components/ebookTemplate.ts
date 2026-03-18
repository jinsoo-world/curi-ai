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

export function generateEbookHtml(ebook: EbookData, mentorName: string, theme?: string): string {
    const t = PDF_THEMES[theme || 'gradient'] || PDF_THEMES.gradient
    const coverBg = t.cover.includes('gradient') ? `background: ${t.cover};` : `background: ${t.cover};`

    const coverHtml = `
        <div style="
            page-break-after: always;
            width: 100%;
            min-height: 250mm;
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
                margin-top: 60px;
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
                margin-top: auto;
                margin-bottom: 60px;
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
                margin: 32px 0;
                padding: 22px 26px;
                border-left: 5px solid #6366f1;
                background: linear-gradient(135deg, #eef2ff, #f8fafc);
                border-radius: 0 8px 8px 0;
            ">
                <p style="
                    font-size: 18pt;
                    color: #4338ca;
                    font-style: italic;
                    margin: 0;
                    line-height: 1.8;
                ">💡 ${escapeHtml(page.quote)}</p>
            </div>
        ` : ''

        // 체크리스트
        const checklistHtml = page.checklist?.length ? `
            <div style="
                margin: 28px 0;
                padding: 24px 28px;
                background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
                border: 1px solid #86efac;
                border-radius: 12px;
            ">
                <p style="font-size: 16pt; font-weight: 700; color: #166534; margin: 0 0 14px 0;">✅ 당장 해야 할 첫 번째 미션</p>
                ${page.checklist.map(item => `
                    <p style="font-size: 16pt; color: #15803d; margin: 10px 0; line-height: 1.7;">
                        ☐ ${escapeHtml(item)}
                    </p>
                `).join('')}
            </div>
        ` : ''

        // CTA (뷰어 스타일과 동일)
        const ctaHtml = page.cta ? `
            <div style="
                margin: 28px 0;
                padding: 24px 28px;
                background: linear-gradient(135deg, #1e3a5f, #2563eb);
                border-radius: 12px;
                text-align: center;
            ">
                <p style="
                    font-size: 18pt;
                    color: #ffffff;
                    font-weight: 700;
                    margin: 0;
                    line-height: 1.7;
                ">${escapeHtml(page.cta)}</p>
            </div>
        ` : ''

        // ★ 본문 콘텐츠: 뷰어와 일치하도록 20pt로 확대
        const contentHtml = escapeHtml(page.content)
            .replace(/\n\n/g, '</p><p style="margin: 0 0 28px 0; line-height: 1.9; font-size: 20pt; color: #334155;">')
            .replace(/\n/g, '<br/>')

        return `
            <div style="${pageBreak} padding: 50px 40px; box-sizing: border-box; position: relative;">
                <!-- 페이지 헤더 -->
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #e2e8f0;
                ">
                    <span style="font-size: 12pt; color: #94a3b8; font-family: 'Pretendard', sans-serif; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(ebook.cover.title)}
                    </span>
                    <span style="
                        font-size: 11pt;
                        color: #ffffff;
                        background: #6366f1;
                        padding: 4px 14px;
                        border-radius: 10px;
                        font-family: 'Pretendard', sans-serif;
                        font-weight: 600;
                    ">Page ${page.pageNum}</span>
                </div>

                <!-- 섹션 제목 -->
                <h2 style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    font-size: 32pt;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0 0 28px 0;
                    line-height: 1.4;
                    word-break: keep-all;
                ">${escapeHtml(page.title)}</h2>

                <!-- 본문 -->
                <p style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    margin: 0 0 28px 0;
                    line-height: 1.9;
                    font-size: 20pt;
                    color: #334155;
                    word-break: keep-all;
                ">${contentHtml}</p>

                ${quoteHtml}
                ${ctaHtml}
                ${checklistHtml}
            </div>
        `
    }).join('')

    return `
        <div style="
            font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            width: 210mm;
            background: #ffffff;
            color: #1e293b;
        ">
            ${coverHtml}
            ${pagesHtml}
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
