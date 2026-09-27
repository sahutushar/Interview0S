// pdf-parse v2 exports a named class { PDFParse }.
// Usage: new PDFParse(buffer).getText() — getText() returns a Promise
// that resolves to { text, numpages, numrender, info, metadata, version }.
const { PDFParse } = require("pdf-parse");

/**
 * Extracts plain text from a PDF file buffer.
 * Throws if the buffer isn't a parseable PDF (e.g. corrupt file, or a
 * scanned/image-only PDF with no text layer — pdf-parse doesn't do OCR).
 */
const extractTextFromPDF = async (buffer) => {
    const result = await new PDFParse(new Uint8Array(buffer)).getText();

    let text = (result.text || "").trim();

    // pdf-parse inserts page-separator markers like "-- 1 of 3 --" between
    // pages; strip them since they're not part of the resume content.
    text = text.replace(/^--\s*\d+\s+of\s+\d+\s*--$/gm, "").trim();

    if (!text) {
        throw new Error(
            "No extractable text found in this PDF. It may be a scanned image without a text layer."
        );
    }

    return text;
};

module.exports = { extractTextFromPDF };
