const { searchSimilar } = require("./embeddingService");
const knowledgeChunkModel = require("../models/knowledgeChunkModel");

// Cap how many characters of retrieved context we inject into a prompt.
// Groq's context window is large, but shorter prompts are cheaper and faster.
// 3000 chars is roughly 750 tokens — enough for 3-5 meaningful code chunks.
const MAX_CONTEXT_CHARS = 3000;

/**
 * Retrieves the most relevant knowledge chunks for a project given a query
 * string, then formats them into a single context block ready to drop into
 * a prompt. Each chunk is prefixed with its source label so the LLM knows
 * which file or section the content came from.
 *
 * Returns "" if the project has no chunks yet (e.g. analysis hasn't run).
 */
const getProjectContext = async (projectId, anonymousId, queryText, topK = 5) => {
    const chunks = knowledgeChunkModel.getChunksByProject(projectId, anonymousId);
    if (!chunks.length) return "";

    // Rank chunks by cosine similarity to the query embedding.
    const results = await searchSimilar(queryText, chunks, topK);

    // Concatenate chunks until we hit the character budget. We stop rather
    // than truncate mid-chunk so the LLM always sees complete code snippets.
    let context = "";
    for (const result of results) {
        const piece = `[${result.source}]\n${result.content}\n\n`;
        if (context.length + piece.length > MAX_CONTEXT_CHARS) break;
        context += piece;
    }
    return context.trim();
};

module.exports = { getProjectContext };
