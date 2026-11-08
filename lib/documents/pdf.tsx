/*
 * Print-ready PDF for a commercial document, in TileSPEC's brand: slate, teal and white, Barlow
 * Condensed headings and DM Sans text (both SIL Open Font Licence, embedded and subset).
 * Server only. The renderer is loaded on demand because it is an ES module the test runner and
 * Next.js both load natively that way.
 */
import path from "node:path";
import React from "react";
import type { Block, DocumentModel, Tone } from "./model";

const ink = "#0F2A3A", deep = "#0B202C", teal = "#7FB8B0", tealText = "#2F6B65", tealTint = "#EDF5F3", grey = "#7B8790", line = "#D9E1E4",
  panel = "#F3F6F7", muted = "#5A6A73", white = "#FFFFFF";
const fontDirectory = () => path.join(process.cwd(), "lib", "documents", "fonts");
let registered = false;

type Renderer = typeof import("@react-pdf/renderer");
async function renderer(): Promise<Renderer> {
  const pdf = await import("@react-pdf/renderer");
  if (!registered) {
    const dir = fontDirectory();
    pdf.Font.register({ family: "DM Sans", fonts: [
      { src: path.join(dir, "dm-sans-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "dm-sans-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "dm-sans-latin-500-normal.woff"), fontWeight: 500 },
      { src: path.join(dir, "dm-sans-latin-700-normal.woff"), fontWeight: 700 }] });
    pdf.Font.register({ family: "Barlow Condensed", fonts: [
      { src: path.join(dir, "barlow-condensed-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(dir, "barlow-condensed-latin-700-normal.woff"), fontWeight: 700 }] });
    // Words are never broken across lines with a hyphen; references and amounts stay whole.
    pdf.Font.registerHyphenationCallback(word => [word]);
    registered = true;
  }
  return pdf;
}

const toneStyle = (tone: Tone | undefined) => {
  switch (tone) {
    case "muted": return { color: muted };
    case "subtotal": return { fontWeight: 700 as const, borderTopWidth: 0.6, borderTopColor: ink };
    case "total": return { fontWeight: 700 as const, borderTopWidth: 1, borderTopColor: ink, backgroundColor: panel };
    case "grand": return { fontWeight: 700 as const, color: white, backgroundColor: ink };
    case "deduction": return {};
    case "heading": return { fontWeight: 700 as const, color: tealText };
    default: return {};
  }
};

/** The PDF bytes for a document model. */
export async function renderDocumentPdf(model: DocumentModel): Promise<Buffer> {
  const pdf = await renderer();
  const { Document, Page, Text, View, Svg, Polygon, StyleSheet, renderToBuffer } = pdf;
  const s = StyleSheet.create({
    page: { fontFamily: "DM Sans", fontSize: 8.6, color: ink, paddingTop: 34, paddingBottom: 64, paddingHorizontal: 40, lineHeight: 1.35, backgroundColor: white },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    brand: { flexDirection: "row", alignItems: "center" },
    wordmark: { marginLeft: 7 },
    wordLine: { fontSize: 24, lineHeight: 1 },
    wordTile: { fontFamily: "Helvetica-Bold", fontSize: 24, color: ink, letterSpacing: -0.6 },
    wordSpec: { fontFamily: "Helvetica", fontSize: 24, color: ink, letterSpacing: -0.6 },
    tagline: { fontFamily: "Helvetica-Bold", fontSize: 5.6, color: "#596671", letterSpacing: 1.05, marginTop: 1 },
    titleBlock: { alignItems: "flex-end", maxWidth: 270 },
    eyebrow: { fontSize: 6.8, fontWeight: 700, color: tealText, letterSpacing: 1.6, textTransform: "uppercase" },
    title: { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 25, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1, marginTop: 2, textAlign: "right" },
    reference: { fontSize: 10, fontWeight: 700, color: tealText, marginTop: 4 },
    pill: { marginTop: 5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 2, fontSize: 6.6, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" },
    rule: { flexDirection: "row", marginTop: 14, marginBottom: 14 },
    parties: { flexDirection: "row", marginBottom: 12 },
    party: { flex: 1, paddingRight: 12 },
    partyLabel: { fontSize: 6.6, fontWeight: 700, color: tealText, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 3 },
    partyName: { fontWeight: 700, fontSize: 9.2 },
    facts: { flexDirection: "row", flexWrap: "wrap", backgroundColor: panel, borderLeftWidth: 3, borderLeftColor: teal, paddingVertical: 7, paddingHorizontal: 9, marginBottom: 12 },
    fact: { width: "25%", paddingVertical: 3, paddingRight: 6 },
    factLabel: { fontSize: 6.4, color: muted, textTransform: "uppercase", letterSpacing: 0.8 },
    factValue: { fontSize: 8.6, fontWeight: 700, marginTop: 1 },
    headline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: ink, paddingVertical: 9, paddingHorizontal: 12,
      marginBottom: 14, minHeight: 50 },
    headlineLabel: { color: teal, fontSize: 7.2, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase" },
    headlineDetail: { color: "#B9CBD1", fontSize: 7, marginTop: 2 },
    headlineValue: { color: white, fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 24, letterSpacing: 0.3, lineHeight: 1.15 },
    blockHeading: { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.5, color: ink, marginBottom: 4 },
    block: { marginBottom: 13 },
    intro: { fontSize: 7.6, color: muted, marginBottom: 4 },
    th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: ink, paddingBottom: 3 },
    thText: { fontSize: 6.5, fontWeight: 700, color: muted, letterSpacing: 0.7, textTransform: "uppercase" },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: line, paddingVertical: 3.6 },
    cell: { paddingRight: 6 },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: line },
    summaryLabel: { flex: 1, paddingRight: 10 },
    detail: { fontSize: 7, color: muted, marginTop: 1, fontWeight: 400 },
    amount: { width: 110, textAlign: "right" },
    legal: { fontSize: 7.2, color: muted, marginBottom: 3.5, lineHeight: 1.4 },
    pairs: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 0.5, borderTopColor: line, paddingTop: 4 },
    pair: { width: "33%", paddingVertical: 2, paddingRight: 8 },
    runningLeft: { position: "absolute", top: 16, left: 40, right: 40, fontSize: 6.8, color: muted },
    runningRight: { position: "absolute", top: 16, left: 40, right: 40, fontSize: 6.8, color: muted, textAlign: "right" },
    footerRule: { position: "absolute", bottom: 44, left: 40, right: 40, height: 0.8, backgroundColor: teal },
    footerLeft: { position: "absolute", bottom: 18, left: 40, width: 360, height: 22, fontSize: 6.4, color: muted, lineHeight: 1.4 },
    // Anchored from the top: react-pdf misplaces page-numbered text anchored to the bottom.
    footerRight: { position: "absolute", top: 803, left: 40, right: 40, textAlign: "right", fontSize: 6.4, color: muted },
    watermark: { position: "absolute", top: 380, left: 40, right: 40, textAlign: "center", fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 70,
      color: teal, opacity: 0.16, transform: "rotate(-30deg)", letterSpacing: 3 },
  });
  const pillColours = model.mode === "issued" ? { backgroundColor: tealTint, color: tealText }
    : model.mode === "sample" ? { backgroundColor: "#FFF4DC", color: "#7A5300" } : { backgroundColor: "#FBE9E7", color: "#9A2B1E" };
  const status = model.superseded ? "Superseded" : model.mode === "issued" ? `Issued ${model.issuedOn ? model.issuedOn.split("-").reverse().join("/") : ""}`
    : model.mode === "sample" ? "Sample: dummy figures" : "Draft: not issued";
  const watermark = model.superseded ? "SUPERSEDED" : model.mode === "sample" ? "SAMPLE" : model.mode === "preview" ? "DRAFT · NOT ISSUED" : null;

  const Mark = ({ size }: { size: number }) => <Svg width={size} height={size * 0.98} viewBox="40 52 456 474">
    <Polygon points="268,52 496,160 268,268 40,160" fill={ink} />
    <Polygon points="40,221 268,329 496,221 496,289 268,397 40,289" fill={grey} />
    <Polygon points="40,350 268,458 496,350 496,418 268,526 40,418" fill={teal} />
  </Svg>;

  const table = (b: Extract<Block, { type: "table" }>) => <View style={s.block} wrap={!b.keepTogether}>
    {b.heading && <Text style={s.blockHeading} minPresenceAhead={40}>{b.heading}</Text>}
    {b.intro && <Text style={s.intro}>{b.intro}</Text>}
    <View style={s.th} fixed={false}>{b.columns.map((c, i) => <Text key={i} style={[s.thText, s.cell, { width: `${c.width}%`, textAlign: c.align ?? "left" }]}>{c.label}</Text>)}</View>
    {b.rows.map((r, i) => <View key={i} style={[s.tr, toneStyle(r.tone)]} wrap={false}>
      {r.cells.map((cell, j) => <Text key={j} style={[s.cell, { width: `${b.columns[j]?.width ?? 10}%`, textAlign: b.columns[j]?.align ?? "left",
        paddingLeft: j === 0 && (r.tone === "total" || r.tone === "grand") ? 4 : 0 }]}>{cell}</Text>)}
    </View>)}
    {b.note && <Text style={[s.intro, { marginTop: 3 }]}>{b.note}</Text>}
  </View>;
  const summary = (b: Extract<Block, { type: "summary" }>) => <View style={s.block} wrap={false}>
    {b.heading && <Text style={s.blockHeading}>{b.heading}</Text>}
    <View style={{ borderTopWidth: 1, borderTopColor: ink }}>
      {b.rows.map((r, i) => <View key={i} style={[s.summaryRow, toneStyle(r.tone)]}>
        <View style={s.summaryLabel}><Text>{r.label}</Text>{r.detail && <Text style={[s.detail, r.tone === "grand" ? { color: "#C9D8DC" } : {}]}>{r.detail}</Text>}</View>
        <Text style={[s.amount, r.tone === "grand" ? { fontSize: 10 } : {}]}>{r.value}</Text>
      </View>)}
    </View>
  </View>;
  const textBlock = (b: Extract<Block, { type: "text" }>) => <View style={s.block} wrap={b.tone !== "legal" || b.paragraphs.join("").length > 2400}>
    {b.heading && <Text style={s.blockHeading}>{b.heading}</Text>}
    {b.paragraphs.map((p, i) => <Text key={i} style={b.tone === "legal" ? s.legal : { marginBottom: 5 }}>{p}</Text>)}
  </View>;
  const pairs = (b: Extract<Block, { type: "pairs" }>) => <View style={s.block} wrap={false}>
    {b.heading && <Text style={s.blockHeading}>{b.heading}</Text>}
    <View style={s.pairs}>{b.items.map((p, i) => <View key={i} style={s.pair}><Text style={s.factLabel}>{p.label}</Text><Text style={s.factValue}>{p.value}</Text></View>)}</View>
  </View>;

  const issuerParty = { label: "From", lines: [model.issuer.name, ...(model.issuer.tradingAs ? [`Trading as ${model.issuer.tradingAs}`] : []), ...model.issuer.lines] };
  const legalLine = [...model.issuer.legal, model.issuer.footer].filter(Boolean).join("  ·  ");
  const doc = <Document title={`${model.title} ${model.reference}`} author={model.issuer.name} creator="TileSPEC" producer="TileSPEC" subject={model.title}>
    <Page size="A4" style={s.page}>
      {watermark && <Text style={s.watermark} fixed>{watermark}</Text>}
      <Text style={s.runningLeft} fixed render={({ pageNumber }) => pageNumber > 1 ? model.issuer.name : ""} />
      <Text style={s.runningRight} fixed render={({ pageNumber }) => pageNumber > 1 ? `${model.title} · ${model.reference}` : ""} />
      <View style={s.headerRow}>
        <View style={s.brand}>
          <Mark size={40} />
          <View style={s.wordmark}>
            <Text style={s.wordLine}><Text style={s.wordTile}>Tile</Text><Text style={s.wordSpec}>SPEC</Text></Text>
            <Text style={s.tagline}>WALL & FLOOR TILING CONTRACTORS</Text>
          </View>
        </View>
        <View style={s.titleBlock}>
          <Text style={s.eyebrow}>{model.revision ?? "Commercial document"}</Text>
          <Text style={s.title}>{model.title}</Text>
          <Text style={s.reference}>{model.reference}</Text>
          <Text style={[s.pill, pillColours]}>{status}</Text>
        </View>
      </View>
      <View style={s.rule}><View style={{ height: 3, flex: 5, backgroundColor: ink }} /><View style={{ height: 3, flex: 1, backgroundColor: grey }} />
        <View style={{ height: 3, flex: 1, backgroundColor: teal }} /></View>
      <View style={s.parties}>
        {[issuerParty, ...model.parties].map((p, i) => <View key={i} style={s.party}>
          <Text style={s.partyLabel}>{p.label}</Text>
          {p.lines.length ? p.lines.map((l, j) => <Text key={j} style={j === 0 ? s.partyName : {}}>{l}</Text>) : <Text style={{ color: muted }}>Not recorded</Text>}
        </View>)}
      </View>
      <View style={s.facts}>{model.facts.map((f, i) => <View key={i} style={s.fact}><Text style={s.factLabel}>{f.label}</Text><Text style={s.factValue}>{f.value}</Text></View>)}</View>
      {model.headline && <View style={s.headline} wrap={false}>
        <View><Text style={s.headlineLabel}>{model.headline.label}</Text>{model.headline.detail && <Text style={s.headlineDetail}>{model.headline.detail}</Text>}</View>
        <Text style={s.headlineValue}>{model.headline.value}</Text>
      </View>}
      {model.blocks.map((b, i) => <React.Fragment key={i}>
        {b.type === "table" ? table(b) : b.type === "summary" ? summary(b) : b.type === "text" ? textBlock(b) : pairs(b)}</React.Fragment>)}
      <View style={s.footerRule} fixed />
      <Text style={s.footerLeft} fixed>{legalLine || model.issuer.name}{model.checksum ? `\nIssued record ${model.checksum.slice(0, 16)}` : ""}</Text>
      <Text style={s.footerRight} fixed render={({ pageNumber, totalPages }) => `${model.reference}  ·  Page ${pageNumber} of ${totalPages}`} />
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, flexDirection: "row" }} fixed>
        <View style={{ flex: 6, backgroundColor: deep }} /><View style={{ flex: 1, backgroundColor: teal }} /></View>
    </Page>
  </Document>;
  return renderToBuffer(doc);
}
