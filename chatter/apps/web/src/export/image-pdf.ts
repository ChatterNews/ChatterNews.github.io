export interface PdfImagePage {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  pageWidth: number;
  pageHeight: number;
}

const encoder = new TextEncoder();

function text(value: string): Uint8Array {
  return encoder.encode(value);
}

function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let at = 0;
  for (const part of parts) { result.set(part, at); at += part.byteLength; }
  return result;
}

/** Make a standards-compliant, multi-page PDF with one full-bleed JPEG per page. */
export function imagePagesPdf(pages: PdfImagePage[]): Uint8Array {
  if (!pages.length) throw new Error('A PDF needs at least one page.');
  const objectCount = 2 + pages.length * 3;
  const objects = new Map<number, Uint8Array>();
  const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  objects.set(1, text('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, text(`<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs}] >>`));

  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    objects.set(pageId, text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.set(imageId, join([
      text(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>\nstream\n`),
      page.jpeg,
      text('\nendstream'),
    ]));
    const commands = text(`q\n${page.pageWidth} 0 0 ${page.pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
    objects.set(contentId, join([text(`<< /Length ${commands.byteLength} >>\nstream\n`), commands, text('endstream')]));
  });

  const chunks: Uint8Array[] = [text('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')];
  const offsets = [0];
  let length = chunks[0]!.byteLength;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = length;
    const chunk = join([text(`${id} 0 obj\n`), objects.get(id)!, text('\nendobj\n')]);
    chunks.push(chunk); length += chunk.byteLength;
  }
  const xrefOffset = length;
  const rows = offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(text(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return join(chunks);
}
