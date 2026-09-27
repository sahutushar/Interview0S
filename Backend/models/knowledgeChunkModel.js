const { randomUUID } = require("crypto");
const { getDB } = require("../config/db");

/**
 * Inserts all chunks for a project in a single SQLite transaction.
 * Using a transaction means either all chunks land or none do — no partial
 * corpus that would silently produce bad RAG results.
 *
 * @param {string} projectId
 * @param {string} anonymousId
 * @param {{source: string, content: string, embedding: number[]}[]} chunks
 * @returns {string[]} Array of inserted row IDs
 */
const insertChunks = (projectId, anonymousId, chunks) => {
    if (!chunks.length) return [];

    const db = getDB();
    const insert = db.prepare(
        `INSERT INTO knowledge_chunks (id, anonymousId, projectId, source, content, embedding)
         VALUES (?, ?, ?, ?, ?, ?)`
    );

    // Wrap in a transaction — better-sqlite3 transactions are synchronous and
    // significantly faster than individual inserts for bulk operations.
    const insertMany = db.transaction((items) => {
        const ids = [];
        for (const chunk of items) {
            const id = randomUUID();
            // Embeddings are float arrays; SQLite has no native array type so
            // we JSON-encode them. They're decoded back in getChunksByProject.
            insert.run(id, anonymousId, projectId, chunk.source, chunk.content, JSON.stringify(chunk.embedding));
            ids.push(id);
        }
        return ids;
    });

    return insertMany(chunks);
};

/**
 * Returns all chunks for a project with embeddings parsed back into number[],
 * ready for cosine-similarity search. Ownership-checked via anonymousId so
 * one visitor can't read another visitor's corpus even if they know the projectId.
 */
const getChunksByProject = (projectId, anonymousId) => {
    const db = getDB();
    return db
        .prepare(`SELECT * FROM knowledge_chunks WHERE projectId = ? AND anonymousId = ?`)
        .all(projectId, anonymousId)
        .map((row) => ({ ...row, embedding: JSON.parse(row.embedding) }));
};

module.exports = { insertChunks, getChunksByProject };
