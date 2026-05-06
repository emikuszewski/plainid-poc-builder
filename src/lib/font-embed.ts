import JSZip from 'jszip';

import manropeRegularUrl from '../assets/fonts/Manrope-Regular.ttf?url';
import manropeSemiBoldUrl from '../assets/fonts/Manrope-SemiBold.ttf?url';
import manropeBoldUrl from '../assets/fonts/Manrope-Bold.ttf?url';

/**
 * Embed Manrope into a docx Blob produced by docx-js.
 *
 * Why this exists: docx-js doesn't expose font embedding through its public
 * API. We let docx-js build the document with `font: 'Manrope'` runs (which
 * reference the font by name in the OOXML), then post-process the resulting
 * zip to add the actual TTF binaries plus the OOXML metadata Word looks for
 * when deciding whether to use an embedded font.
 *
 * What Word expects for embedded fonts:
 *   - Each font weight as a separate file in `word/fonts/` named `fontN.odttf`
 *   - The `.odttf` is the original `.ttf` with the first 32 bytes XOR'd
 *     against a per-file GUID-derived key (Word's "obfuscation"). Modern Word
 *     accepts plain TTF too, but obfuscated is the safer compatibility path.
 *   - `[Content_Types].xml` declares `application/vnd.openxmlformats-officedocument.obfuscatedFont`
 *     for `.odttf` files.
 *   - `word/_rels/fontTable.xml.rels` adds relationships pointing at each font.
 *   - `word/fontTable.xml` describes the font family and references the
 *     relationships via `w:embedRegular` / `w:embedBold` etc.
 *   - `word/settings.xml` includes `<w:embedTrueTypeFonts/>`.
 *
 * If anything fails (asset fetch, zip operation), we return the original
 * blob untouched — the docx is still valid, just without embedded fonts
 * (Word falls back to the user's installed font matching "Manrope" or the
 * system default).
 */

interface FontFile {
  url: string; // resolved Vite asset URL
  // Word's font-embedding XML calls these `embedRegular`, `embedBold`,
  // `embedItalic`, `embedBoldItalic`. We map weight to the right tag below.
  weightTag: 'embedRegular' | 'embedBold';
  // For semi-bold, Word doesn't have a dedicated tag — it gets embedded
  // and referenced by name only. We use a custom font NAME for it (a
  // distinct registration in fontTable.xml) so docx-js runs that say
  // `font: 'Manrope SemiBold'` resolve correctly.
  fontFamilyName: string;
}

const FONT_FILES: FontFile[] = [
  { url: manropeRegularUrl, weightTag: 'embedRegular', fontFamilyName: 'Manrope' },
  // SemiBold gets registered as a distinct family so we can target it directly
  // from runs without relying on bold synthesis.
  { url: manropeSemiBoldUrl, weightTag: 'embedRegular', fontFamilyName: 'Manrope SemiBold' },
  { url: manropeBoldUrl, weightTag: 'embedBold', fontFamilyName: 'Manrope' },
];

export async function embedManropeIntoDocx(input: Blob): Promise<Blob> {
  try {
    const fontBuffers = await Promise.all(
      FONT_FILES.map(async (f) => {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`Could not fetch ${f.url}`);
        return new Uint8Array(await res.arrayBuffer());
      }),
    );

    const zip = await JSZip.loadAsync(input);

    // Obfuscate and inject each TTF
    const fontEntries: { fontIndex: number; relId: string; key: string; spec: FontFile }[] = [];
    for (let i = 0; i < FONT_FILES.length; i++) {
      const spec = FONT_FILES[i];
      const idx = i + 1;
      const guid = generateGuid();
      const obfuscated = obfuscateTtf(fontBuffers[i], guid);
      zip.file(`word/fonts/font${idx}.odttf`, obfuscated);
      fontEntries.push({
        fontIndex: idx,
        relId: `rIdFont${idx}`,
        key: guidToWordEmbedKey(guid),
        spec,
      });
    }

    // 1) [Content_Types].xml — add Default for .odttf
    const ct = await zip.file('[Content_Types].xml')?.async('string');
    if (ct && !ct.includes('Extension="odttf"')) {
      const updated = ct.replace(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>',
      );
      zip.file('[Content_Types].xml', updated);
    }

    // 2) word/_rels/fontTable.xml.rels — must exist and reference each font
    const relsXml = buildFontTableRels(fontEntries);
    zip.file('word/_rels/fontTable.xml.rels', relsXml);

    // 3) word/fontTable.xml — describe each embedded font
    const fontTableXml = buildFontTable(fontEntries);
    zip.file('word/fontTable.xml', fontTableXml);

    // 4) word/settings.xml — add <w:embedTrueTypeFonts/>
    const settings = await zip.file('word/settings.xml')?.async('string');
    if (settings && !settings.includes('embedTrueTypeFonts')) {
      const updated = settings.replace(
        /<w:settings\b([^>]*)>/,
        '<w:settings$1><w:embedTrueTypeFonts/>',
      );
      zip.file('word/settings.xml', updated);
    }

    // 5) Ensure fontTable relationship is declared in document.xml.rels.
    // docx-js may not emit a relationship to fontTable.xml if no embedding was
    // declared at build time. Word will look for the fontTable via its standard
    // relationship type — usually it's already present. We add it if missing.
    const docRels = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (docRels && !docRels.includes('fontTable.xml')) {
      const updated = docRels.replace(
        '</Relationships>',
        `<Relationship Id="rIdFontTable" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>`,
      );
      zip.file('word/_rels/document.xml.rels', updated);
    }

    return await zip.generateAsync({ type: 'blob' });
  } catch (err) {
    console.warn('Font embedding failed; serving doc with font-name references only', err);
    return input;
  }
}

// ============================================================
// Word's obfuscated-font format
//
// Algorithm: take the file's GUID (assigned at embed time), reverse it to
// produce a 16-byte XOR mask, then XOR the first 32 bytes of the TTF with
// that mask repeated twice. The rest of the file is unchanged.
//
// The same GUID gets serialized into the fontTable.xml entry so Word can
// reverse the transform at load time.
// ============================================================

function generateGuid(): string {
  // RFC 4122 v4 GUID
  const rand = () => Math.floor(Math.random() * 16);
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) out += '-';
    if (i === 12) out += '4'; // version
    else if (i === 16) out += (8 + Math.floor(Math.random() * 4)).toString(16); // variant
    else out += rand().toString(16);
  }
  return out;
}

function obfuscateTtf(data: Uint8Array, guid: string): Uint8Array {
  // Build the XOR key: parse GUID into bytes in REVERSE order (Word's
  // little-endian quirk). The GUID is "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".
  const hex = guid.replace(/-/g, '');
  const keyBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    // Reverse order: byte 15 of key = byte 0 of GUID hex
    keyBytes[15 - i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const out = new Uint8Array(data.length);
  out.set(data);
  // XOR first 32 bytes with key (16 bytes) twice
  for (let i = 0; i < 32; i++) {
    out[i] = data[i] ^ keyBytes[i % 16];
  }
  return out;
}

function guidToWordEmbedKey(guid: string): string {
  // Word stores the GUID in the fontTable in the form "{XXXXXXXX-XXXX-...}"
  return `{${guid.toUpperCase()}}`;
}

// ============================================================
// fontTable.xml + rels generators
// ============================================================

function buildFontTableRels(entries: { fontIndex: number; relId: string }[]): string {
  const relLines = entries
    .map(
      (e) =>
        `<Relationship Id="${e.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font${e.fontIndex}.odttf"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relLines}</Relationships>`;
}

function buildFontTable(
  entries: { fontIndex: number; relId: string; key: string; spec: FontFile }[],
): string {
  // Group entries by font family name. For "Manrope", we may have both
  // a regular and bold entry; for "Manrope SemiBold", just one.
  const byFamily = new Map<string, typeof entries>();
  for (const e of entries) {
    const fam = e.spec.fontFamilyName;
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(e);
  }

  const fontXml: string[] = [];
  for (const [familyName, items] of byFamily) {
    const embedTags = items
      .map(
        (e) =>
          `<w:${e.spec.weightTag} r:id="${e.relId}" w:fontKey="${e.key}"/>`,
      )
      .join('');
    fontXml.push(
      `<w:font w:name="${familyName}"><w:panose1 w:val="020B0604030504040204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/><w:sig w:usb0="A00002EF" w:usb1="4000205B" w:usb2="00000000" w:usb3="00000000" w:csb0="0000019F" w:csb1="00000000"/>${embedTags}</w:font>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${fontXml.join('')}</w:fonts>`;
}
