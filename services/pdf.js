const PDFDocument = require('pdfkit');

/**
 * Strip HTML tags and decode basic entities, preserving line breaks.
 * Handles Quill's output (bold/italic/underline/lists) by flattening to
 * structured plain text suitable for PDFKit rendering.
 */
function htmlToPlainText(html) {
  if (!html || !html.includes('<')) return html || '';

  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  \u2022 ')
    .replace(/<\/?(ol|ul)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Generate a PDF letter from text (plain or HTML from Quill).
 * Returns { buffer: Buffer, pageCount: number }.
 */
function generateLetterPdf(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true,
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const range = doc.bufferedPageRange();
      resolve({ buffer, pageCount: Math.max(range.count, 1) });
    });
    doc.on('error', reject);

    const plainText = htmlToPlainText(text);
    doc.fontSize(12).font('Helvetica').text(plainText, { lineGap: 4 });
    doc.flushPages();
    doc.end();
  });
}

/**
 * Count pages in a PDF buffer by scanning for /Type /Page entries.
 * Avoids pulling in a heavy dependency for a simple count.
 */
function countPdfPages(buffer) {
  const str = buffer.toString('latin1');
  const matches = str.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 1;
}

module.exports = { generateLetterPdf, countPdfPages };
