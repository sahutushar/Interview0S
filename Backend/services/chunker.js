// Splits text into overlapping chunks for embedding. Uses simple
// character-based splitting rather than sentence/AST-aware chunking —
// good enough for MVP scale and language-agnostic (works the same for
// Python, Go, README markdown, etc. without per-language parsers).

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 100;

/**
 * Splits `text` into overlapping fixed-size chunks.
 *
 * @param {string} text - The raw text to split.
 * @param {{ source: string, chunkSize?: number, overlap?: number }} options
 *   source  - Label stored with each chunk (e.g. "readme", "file:src/index.js").
 *   chunkSize - Max characters per chunk (default 800).
 *   overlap   - How many characters the next chunk re-uses from the end of
 *               the previous one (default 100). Overlap helps the embedder
 *               capture context that would otherwise be cut at a boundary.
 * @returns {{ source: string, content: string }[]}
 */
const chunkText = (text, { source, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP }) => {
    const chunks = [];
    if (!text || !text.trim()) return chunks;

    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const content = text.slice(start, end).trim();
        if (content) {
            chunks.push({ source, content });
        }
        // Stop once we've reached the end of the text.
        if (end >= text.length) break;
        // Step forward by (chunkSize - overlap) so the next chunk shares
        // `overlap` characters with this one.
        start = end - overlap;
    }

    return chunks;
};

module.exports = { chunkText };
