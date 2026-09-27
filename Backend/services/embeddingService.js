const { pipeline } = require("@xenova/transformers");

// Groq has no embeddings endpoint, so embeddings run locally via a small
// transformer model (all-MiniLM-L6-v2, ~90 MB) executed in-process with
// ONNX Runtime. No API key, no external call, no per-embedding cost.
//
// The model weights are downloaded from Hugging Face Hub on first use and
// cached locally after that. That first run needs network access to
// huggingface.co; subsequent runs are fully offline.

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// Lazily initialise the pipeline once and reuse it for every call.
// Storing the Promise (not the resolved value) means concurrent callers
// all await the same single initialisation rather than each starting their
// own download.
let embedderPromise = null;
const getEmbedder = () => {
    if (!embedderPromise) {
        embedderPromise = pipeline("feature-extraction", MODEL_NAME);
    }
    return embedderPromise;
};

/**
 * Embeds a single piece of text into a fixed-length float vector.
 */
const embed = async (text) => {
    const embedder = await getEmbedder();
    // mean pooling + L2 normalisation gives unit vectors, which makes
    // cosine similarity equivalent to a dot product and slightly faster.
    const output = await embedder(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
};

/**
 * Embeds many texts sequentially.
 * Sequential rather than Promise.all — the underlying ONNX session isn't
 * safe for unbounded concurrent calls, and for MVP-scale chunk counts
 * (dozens, not thousands) sequential is fast enough.
 */
const embedMany = async (texts) => {
    const results = [];
    for (const text of texts) {
        results.push(await embed(text));
    }
    return results;
};

/**
 * Standard cosine similarity between two equal-length vectors.
 * Returns 0 if either vector is the zero vector (avoids division by zero).
 */
const cosineSimilarity = (a, b) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Given a query string and a list of {..., embedding} chunks, returns the
 * topK most similar chunks by cosine similarity.
 *
 * Uses a flat linear scan — fine for MVP-scale corpora (a handful of repos,
 * dozens of chunks each). Swap for a real vector index (e.g. pgvector) if
 * the corpus grows significantly.
 */
const searchSimilar = async (queryText, chunks, topK = 5) => {
    const queryEmbedding = await embed(queryText);
    return chunks
        .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
};

module.exports = { embed, embedMany, cosineSimilarity, searchSimilar };
