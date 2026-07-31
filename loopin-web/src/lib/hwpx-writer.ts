import JSZip from "jszip";

/**
 * HWPX(OWPML · KS X 6101) 최소 문서 생성기.
 * 한글이 문서를 열려면 mimetype이 첫 엔트리·무압축이어야 하고,
 * header.xml의 각 refList가 itemCnt와 일치해야 하며,
 * section0.xml 첫 문단 첫 run에 secPr(용지·여백)이 있어야 한다.
 */

export type HwpxParagraphStyle =
  | "title"
  | "meta"
  | "heading"
  | "instruction"
  | "body"
  | "spacer";

export type HwpxParagraph = {
  style: HwpxParagraphStyle;
  text: string;
};

export type HwpxDocumentPage = {
  paragraphs: HwpxParagraph[];
};

/** style → header.xml의 charPr / paraPr id */
const STYLE_REF: Record<HwpxParagraphStyle, { charPr: number; paraPr: number }> =
  {
    title: { charPr: 2, paraPr: 1 },
    meta: { charPr: 3, paraPr: 0 },
    heading: { charPr: 4, paraPr: 1 },
    instruction: { charPr: 3, paraPr: 0 },
    body: { charPr: 0, paraPr: 0 },
    spacer: { charPr: 0, paraPr: 0 },
  };

const OWPML_NS = [
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"',
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"',
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"',
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"',
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"',
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"',
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"',
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:opf="http://www.idpf.org/2007/opf/"',
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"',
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"',
  'xmlns:epub="http://www.idpf.org/2007/ops"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
].join(" ");

const XML_DECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const MIMETYPE = "application/hwp+zip";

const VERSION_XML = `${XML_DECL}
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Loopin" appVersion="1, 0, 0, 0 WIN32LEWindows_10"/>`;

const SETTINGS_XML = `${XML_DECL}
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>`;

const CONTAINER_XML = `${XML_DECL}
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
    <ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>
    <ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>
  </ocf:rootfiles>
</ocf:container>`;

const CONTAINER_RDF = `${XML_DECL}
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`;

const MANIFEST_XML = `${XML_DECL}
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`;

function contentHpf(title: string): string {
  return `${XML_DECL}
<opf:package ${OWPML_NS} version="" unique-identifier="" id="">
  <opf:metadata>
    <opf:title>${escapeXml(title)}</opf:title>
    <opf:language>ko</opf:language>
    <opf:meta name="creator" content="Loopin"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
    <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="yes"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>`;
}

const FONT_GOTHIC = "함초롬돋움";
const FONT_BATANG = "함초롬바탕";

function fontFace(lang: string): string {
  return `      <hh:fontface lang="${lang}" fontCnt="2">
        <hh:font id="0" face="${FONT_GOTHIC}" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
        <hh:font id="1" face="${FONT_BATANG}" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_MYUNGJO" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>
      </hh:fontface>`;
}

function charPr(
  id: number,
  height: number,
  opts?: { bold?: boolean; fontRef?: 0 | 1; color?: string },
): string {
  const fontRef = opts?.fontRef ?? 0;
  const color = opts?.color ?? "#000000";
  return `      <hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">
        <hh:fontRef hangul="${fontRef}" latin="${fontRef}" hanja="${fontRef}" japanese="${fontRef}" other="${fontRef}" symbol="${fontRef}" user="${fontRef}"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${
          opts?.bold ? "\n        <hh:bold/>" : ""
        }
        <hh:underline type="NONE" shape="SOLID" color="#000000"/>
        <hh:strikeout shape="NONE" color="#000000"/>
        <hh:outline type="NONE"/>
        <hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>
      </hh:charPr>`;
}

function paraMarginBlock(prev: number): string {
  const margin = `            <hh:margin>
              <hc:intent value="0" unit="HWPUNIT"/>
              <hc:left value="0" unit="HWPUNIT"/>
              <hc:right value="0" unit="HWPUNIT"/>
              <hc:prev value="${prev}" unit="HWPUNIT"/>
              <hc:next value="0" unit="HWPUNIT"/>
            </hh:margin>
            <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>`;
  return `        <hp:switch>
          <hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">
${margin}
          </hp:case>
          <hp:default>
${margin}
          </hp:default>
        </hp:switch>`;
}

function paraPr(id: number, prev: number): string {
  return `      <hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">
        <hh:align horizontal="LEFT" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
${paraMarginBlock(prev)}
        <hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`;
}

const HEADER_XML = `${XML_DECL}
<hh:head ${OWPML_NS} version="1.5" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="7">
${["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
  .map(fontFace)
  .join("\n")}
    </hh:fontfaces>
    <hh:borderFills itemCnt="2">
      <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
      </hh:borderFill>
      <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
        <hc:fillBrush>
          <hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/>
        </hc:fillBrush>
      </hh:borderFill>
    </hh:borderFills>
    <hh:charProperties itemCnt="5">
${charPr(0, 1000, { fontRef: 1 })}
${charPr(1, 1000, { fontRef: 1, bold: true })}
${charPr(2, 1500, { fontRef: 0, bold: true })}
${charPr(3, 900, { fontRef: 0, color: "#4B5563" })}
${charPr(4, 1200, { fontRef: 0, bold: true })}
    </hh:charProperties>
    <hh:tabProperties itemCnt="3">
      <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
      <hh:tabPr id="1" autoTabLeft="1" autoTabRight="0"/>
      <hh:tabPr id="2" autoTabLeft="0" autoTabRight="1"/>
    </hh:tabProperties>
    <hh:numberings itemCnt="1">
      <hh:numbering id="1" start="0">
        <hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead>
        <hh:paraHead start="1" level="2" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE" charPrIDRef="4294967295" checkable="0">^2.</hh:paraHead>
        <hh:paraHead start="1" level="3" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^3)</hh:paraHead>
        <hh:paraHead start="1" level="4" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE" charPrIDRef="4294967295" checkable="0">^4)</hh:paraHead>
        <hh:paraHead start="1" level="5" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">(^5)</hh:paraHead>
        <hh:paraHead start="1" level="6" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_SYLLABLE" charPrIDRef="4294967295" checkable="0">(^6)</hh:paraHead>
        <hh:paraHead start="1" level="7" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="CIRCLED_DIGIT" charPrIDRef="4294967295" checkable="1">^7</hh:paraHead>
        <hh:paraHead start="1" level="8" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="CIRCLED_HANGUL_SYLLABLE" charPrIDRef="4294967295" checkable="1">^8</hh:paraHead>
        <hh:paraHead start="1" level="9" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="HANGUL_JAMO" charPrIDRef="4294967295" checkable="0"/>
        <hh:paraHead start="1" level="10" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="ROMAN_SMALL" charPrIDRef="4294967295" checkable="1"/>
      </hh:numbering>
    </hh:numberings>
    <hh:paraProperties itemCnt="2">
${paraPr(0, 0)}
${paraPr(1, 600)}
    </hh:paraProperties>
    <hh:styles itemCnt="2">
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
      <hh:style id="1" type="PARA" name="개요 1" engName="Outline 1" paraPrIDRef="1" charPrIDRef="4" nextStyleIDRef="1" langID="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
  <hh:compatibleDocument targetProgram="HWP201X">
    <hh:layoutCompatibility/>
  </hh:compatibleDocument>
  <hh:docOption>
    <hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/>
  </hh:docOption>
  <hh:metaTag>{"name":""}</hh:metaTag>
  <hh:trackchageConfig flags="56"/>
</hh:head>`;

const SEC_PR = `      <hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY">
          <hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>
        </hp:pagePr>
        <hp:footNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="EACH_COLUMN" beneathText="0"/>
        </hp:footNotePr>
        <hp:endNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
        </hp:endNotePr>
        <hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
      </hp:secPr>
      <hp:ctrl>
        <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
      </hp:ctrl>`;

function paragraphXml(
  paragraph: HwpxParagraph,
  id: number,
  opts: { pageBreak: boolean; withSecPr: boolean },
): string {
  const ref = STYLE_REF[paragraph.style];
  const text = escapeXml(
    paragraph.text.replace(/[\r\n\t]+/g, " ").replace(/\s+$/, ""),
  );
  const runs: string[] = [];
  if (opts.withSecPr) {
    runs.push(`    <hp:run charPrIDRef="${ref.charPr}">\n${SEC_PR}\n    </hp:run>`);
  }
  runs.push(
    `    <hp:run charPrIDRef="${ref.charPr}">${
      text ? `<hp:t>${text}</hp:t>` : "<hp:t/>"
    }</hp:run>`,
  );

  return `  <hp:p id="${id}" paraPrIDRef="${ref.paraPr}" styleIDRef="0" pageBreak="${
    opts.pageBreak ? 1 : 0
  }" columnBreak="0" merged="0">
${runs.join("\n")}
  </hp:p>`;
}

function sectionXml(pages: HwpxDocumentPage[]): string {
  const paragraphs: string[] = [];
  let id = 1;
  let first = true;

  for (const [pageIndex, page] of pages.entries()) {
    const lines =
      page.paragraphs.length > 0
        ? page.paragraphs
        : [{ style: "body" as const, text: "" }];
    for (const [lineIndex, paragraph] of lines.entries()) {
      paragraphs.push(
        paragraphXml(paragraph, id, {
          pageBreak: lineIndex === 0 && pageIndex > 0,
          withSecPr: first,
        }),
      );
      first = false;
      id += 1;
    }
  }

  return `${XML_DECL}
<hs:sec ${OWPML_NS}>
${paragraphs.join("\n")}
</hs:sec>`;
}

function previewText(pages: HwpxDocumentPage[]): string {
  return pages
    .map((page) => page.paragraphs.map((p) => p.text).join("\r\n"))
    .join("\r\n\r\n");
}

export type HwpxEntry = {
  path: string;
  content: string;
  /** mimetype은 무압축(STORE)으로 저장해야 한다 */
  store?: boolean;
};

/** 패키지 엔트리 — 순서가 곧 ZIP 엔트리 순서(mimetype이 첫 번째) */
export function buildHwpxEntries(
  pages: HwpxDocumentPage[],
  title: string,
): HwpxEntry[] {
  return [
    { path: "mimetype", content: MIMETYPE, store: true },
    { path: "version.xml", content: VERSION_XML },
    { path: "settings.xml", content: SETTINGS_XML },
    { path: "META-INF/container.xml", content: CONTAINER_XML },
    { path: "META-INF/container.rdf", content: CONTAINER_RDF },
    { path: "META-INF/manifest.xml", content: MANIFEST_XML },
    { path: "Contents/content.hpf", content: contentHpf(title) },
    { path: "Contents/header.xml", content: HEADER_XML },
    { path: "Contents/section0.xml", content: sectionXml(pages) },
    { path: "Preview/PrvText.txt", content: previewText(pages) },
  ];
}

export function createHwpxZip(entries: HwpxEntry[]): JSZip {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, entry.content, {
      compression: entry.store ? "STORE" : "DEFLATE",
    });
  }
  return zip;
}

export async function buildHwpxBlob(
  pages: HwpxDocumentPage[],
  title: string,
): Promise<Blob> {
  const zip = createHwpxZip(buildHwpxEntries(pages, title));
  return zip.generateAsync({
    type: "blob",
    mimeType: MIMETYPE,
    compression: "DEFLATE",
  });
}
