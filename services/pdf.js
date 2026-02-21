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
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({ buffer, pageCount: doc.bufferedPageRange().count });
    });
    doc.on('error', reject);

    doc.fontSize(12).font('Helvetica').text(text, { lineGap: 4 });
    doc.end();
  });
}

module.exports = { generateLetterPdf };
