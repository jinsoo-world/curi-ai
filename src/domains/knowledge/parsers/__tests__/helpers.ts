// 시험용 파일을 코드로 만든다 (저장소가 공개라 실제 문서 샘플은 깃에 두지 않는다).
// 실제 파일 시험은 test/fixtures-local/ (깃 제외, 원본은 드라이브 03_CTO/2_큐리AI/진행중/1006_문서읽기_시험샘플/) 가 있을 때만 돈다.
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import JSZip from 'jszip'

const 로컬폴더 = path.resolve(__dirname, '../../../../../test/fixtures-local')

export const 로컬샘플있음 = (하위: string, 이름: string) => existsSync(path.join(로컬폴더, 하위, 이름))
export const 로컬샘플 = (하위: string, 이름: string) => readFileSync(path.join(로컬폴더, 하위, 이름))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export async function 만든docx(문단: string[]): Promise<Buffer> {
    const z = new JSZip()
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${문단.map(p => `<w:p><w:r><w:t>${esc(p)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`)
    return Buffer.from(await z.generateAsync({ type: 'uint8array' }))
}

/** 슬라이드마다 글 상자 하나, 표(선택) 하나 */
export async function 만든pptx(슬라이드: Array<{ 글: string; 표칸?: string }>): Promise<Buffer> {
    const z = new JSZip()
    const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
    const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`
    const rels = (...r: string[]) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`
    z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${슬라이드.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`)
    z.file('_rels/.rels', rels(rel('rId1', 'officeDocument', 'ppt/presentation.xml')))
    z.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${슬라이드.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)
    z.file('ppt/_rels/presentation.xml.rels', rels(rel('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'), ...슬라이드.map((_, i) => rel(`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`))))
    const tree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>'
    z.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ${ns}>${tree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`)
    z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels(rel('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'), rel('rId2', 'theme', '../theme/theme1.xml')))
    z.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${ns} type="blank">${tree}</p:sldLayout>`)
    z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels(rel('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')))
    const c = (n: string, v: string) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`
    z.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="t"><a:themeElements><a:clrScheme name="c">${c('dk1', '000000')}${c('lt1', 'FFFFFF')}${c('dk2', '1F497D')}${c('lt2', 'EEECE1')}${['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(n => c(n, '4F81BD')).join('')}</a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="x"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`)
    슬라이드.forEach((s, i) => {
        const 상자 = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text ${i}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="6000000" cy="800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR"/><a:t>${esc(s.글)}</a:t></a:r></a:p></p:txBody></p:sp>`
        const 표 = s.표칸 === undefined ? '' : `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="457200" y="1800000"/><a:ext cx="4000000" cy="600000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="4000000"/></a:tblGrid><a:tr h="600000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR"/><a:t>${esc(s.표칸)}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
        z.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${상자}${표}</p:spTree></p:cSld></p:sld>`)
        z.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels(rel('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')))
    })
    return Buffer.from(await z.generateAsync({ type: 'uint8array' }))
}

/** 글자가 있는 한 쪽짜리 PDF (영문 기본 글꼴. 한글 PDF 는 실제 파일로 로컬에서만 시험) */
export function 만든pdf(글: string): Buffer {
    const 내용 = `BT /F1 18 Tf 50 150 Td (${글}) Tj ET`
    const 개체 = [
        '<</Type/Catalog/Pages 2 0 R>>',
        '<</Type/Pages/Kids[3 0 R]/Count 1>>',
        '<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
        `<</Length ${내용.length}>>\nstream\n${내용}\nendstream`,
        '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    ]
    let pdf = '%PDF-1.4\n'
    const 위치: number[] = []
    개체.forEach((o, i) => { 위치.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = pdf.length
    pdf += `xref\n0 ${개체.length + 1}\n0000000000 65535 f \n${위치.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${개체.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
    return Buffer.from(pdf, 'latin1')
}

/** 가장 작은 hwpx (글 문단 몇 개). kordoc 가 읽는지 시험용 */
export async function 만든hwpx(문단: string[]): Promise<Buffer> {
    const z = new JSZip()
    z.file('mimetype', 'application/hwp+zip')
    z.file('version.xml', '<?xml version="1.0" encoding="UTF-8"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="0" os="1" xmlVersion="1.4" application="x" appVersion="1"/>')
    z.file('Contents/content.hpf', '<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="" unique-identifier="" id=""><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0"/></opf:spine></opf:package>')
    z.file('Contents/header.xml', '<?xml version="1.0" encoding="UTF-8"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4" secCnt="1"><hh:refList><hh:charProperties itemCnt="1"><hh:charPr id="0" height="1000"/></hh:charProperties><hh:paraProperties itemCnt="1"><hh:paraPr id="0"/></hh:paraProperties></hh:refList></hh:head>')
    z.file('Contents/section0.xml', `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">${문단.map((p, i) => `<hp:p id="${i}" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${esc(p)}</hp:t></hp:run></hp:p>`).join('')}</hs:sec>`)
    return Buffer.from(await z.generateAsync({ type: 'uint8array' }))
}
