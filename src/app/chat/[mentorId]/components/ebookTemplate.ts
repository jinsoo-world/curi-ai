// 전자책 JSON → HTML 변환 템플릿
// html2pdf.js에서 사용할 디자인된 HTML을 생성

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
 */
export function generateEbookHtml(ebook: EbookData, mentorName: string): string {
    const coverHtml = `
        <div style="
            page-break-after: always;
            width: 100%;
            min-height: 250mm;
            background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #2563eb 100%);
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
                    color: #ffffff;
                    line-height: 1.3;
                    margin: 0 0 20px 0;
                    letter-spacing: -0.5px;
                    word-break: keep-all;
                ">${escapeHtml(ebook.cover.title)}</h1>
                
                <p style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    font-size: 14pt;
                    color: rgba(186, 230, 253, 0.9);
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
                        color: rgba(255,255,255,0.8);
                        margin: 0;
                    ">by ${escapeHtml(ebook.cover.author || mentorName)}</p>
                </div>
            </div>
        </div>
    `

    const pagesHtml = ebook.pages.map((page, idx) => {
        const isLastPage = idx === ebook.pages.length - 1
        const pageBreak = isLastPage ? '' : 'page-break-after: always;'

        // 이미지 가이드 박스
        const imageGuideHtml = page.imageGuide ? `
            <div style="
                margin: 16px 0;
                padding: 14px 18px;
                border: 2px dashed #cbd5e1;
                border-radius: 8px;
                background: #f8fafc;
                text-align: center;
            ">
                <span style="font-size: 9pt; color: #94a3b8;">🖼️ ${escapeHtml(page.imageGuide)}</span>
            </div>
        ` : ''

        // 인용구
        const quoteHtml = page.quote ? `
            <div style="
                margin: 20px 0;
                padding: 16px 20px;
                border-left: 4px solid #6366f1;
                background: linear-gradient(135deg, #eef2ff, #f8fafc);
                border-radius: 0 8px 8px 0;
            ">
                <p style="
                    font-size: 11pt;
                    color: #4338ca;
                    font-style: italic;
                    margin: 0;
                    line-height: 1.7;
                ">💡 ${escapeHtml(page.quote)}</p>
            </div>
        ` : ''

        // 체크리스트 (Page 5용)
        const checklistHtml = page.checklist?.length ? `
            <div style="
                margin: 20px 0;
                padding: 18px 22px;
                background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
                border: 1px solid #86efac;
                border-radius: 10px;
            ">
                <p style="font-size: 11pt; font-weight: 700; color: #166534; margin: 0 0 10px 0;">✅ 당장 해야 할 첫 번째 미션</p>
                ${page.checklist.map(item => `
                    <p style="font-size: 10.5pt; color: #15803d; margin: 6px 0; line-height: 1.6;">
                        ☐ ${escapeHtml(item)}
                    </p>
                `).join('')}
            </div>
        ` : ''

        // CTA
        const ctaHtml = page.cta ? `
            <div style="
                margin: 20px 0;
                padding: 18px 22px;
                background: linear-gradient(135deg, #1e3a5f, #2563eb);
                border-radius: 10px;
                text-align: center;
            ">
                <p style="
                    font-size: 12pt;
                    color: #ffffff;
                    font-weight: 700;
                    margin: 0;
                    line-height: 1.6;
                ">${escapeHtml(page.cta)}</p>
            </div>
        ` : ''

        // 본문 콘텐츠 처리 (줄바꿈 → <br>)
        const contentHtml = escapeHtml(page.content)
            .replace(/\n\n/g, '</p><p style="margin: 0 0 12px 0; line-height: 1.85; font-size: 10.5pt; color: #334155;">')
            .replace(/\n/g, '<br/>')

        return `
            <div style="${pageBreak} padding: 30px 25px; min-height: 250mm; box-sizing: border-box; position: relative;">
                <!-- 페이지 헤더 -->
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #e2e8f0;
                ">
                    <span style="font-size: 8pt; color: #94a3b8; font-family: 'Pretendard', sans-serif;">
                        ${escapeHtml(ebook.cover.title)}
                    </span>
                    <span style="
                        font-size: 8pt;
                        color: #ffffff;
                        background: #2563eb;
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-family: 'Pretendard', sans-serif;
                    ">Page ${page.pageNum}</span>
                </div>

                <!-- 섹션 제목 -->
                <h2 style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    font-size: 18pt;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0 0 16px 0;
                    line-height: 1.4;
                    word-break: keep-all;
                ">${escapeHtml(page.title)}</h2>

                ${imageGuideHtml}

                <!-- 본문 -->
                <p style="
                    font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
                    margin: 0 0 12px 0;
                    line-height: 1.85;
                    font-size: 10.5pt;
                    color: #334155;
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
