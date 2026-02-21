const PDFDocument = require('pdfkit');

/**
 * Generate a simple PDF letter from plain text.
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

    doc.fontSize(12).font('Helvetica').text(text, { lineGap: 4 });
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
