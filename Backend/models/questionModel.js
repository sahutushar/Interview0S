const { randomUUID } = require("crypto");
const { getDB } = require("../config/db");

// Questions don't carry their own anonymousId — they inherit ownership from
// their parent session. Every write here first confirms the session belongs
// to the caller, so one visitor can't pin/note/delete another visitor's
// questions even if they somehow learned a question ID.

// Returns true if the given session belongs to the given visitor.
const sessionBelongsTo = (sessionId, anonymousId) => {
    const db = getDB();
    return !!db
        .prepare(`SELECT 1 FROM sessions WHERE id = ? AND anonymousId = ?`)
        .get(sessionId, anonymousId);
};

// Inserts multiple questions in a single transaction. Returns null if the
// session doesn't belong to this visitor (ownership check).
const createManyQuestions = (sessionId, anonymousId, questions) => {
    if (!sessionBelongsTo(sessionId, anonymousId)) return null;

    const db = getDB();
    const insert = db.prepare(
        `INSERT INTO questions (id, sessionId, question, answer) VALUES (?, ?, ?, ?)`
    );

    const insertMany = db.transaction((items) => {
        const ids = [];
        for (const q of items) {
            const id = randomUUID();
            insert.run(id, sessionId, q.question, q.answer || "");
            ids.push(id);
        }
        return ids;
    });

    const ids = insertMany(questions);
    return ids.map(getQuestionById);
};

const getQuestionById = (id) => {
    const db = getDB();
    return db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id);
};

const getQuestionsBySession = (sessionId) => {
    const db = getDB();
    return db
        .prepare(
            `SELECT * FROM questions WHERE sessionId = ? ORDER BY isPinned DESC, createdAt ASC`
        )
        .all(sessionId);
};

// Checks ownership by joining through the question's parent session rather
// than requiring the caller to pass sessionId separately.
const questionOwnedBy = (questionId, anonymousId) => {
    const db = getDB();
    return !!db
        .prepare(
            `SELECT 1 FROM questions q
             JOIN sessions s ON s.id = q.sessionId
             WHERE q.id = ? AND s.anonymousId = ?`
        )
        .get(questionId, anonymousId);
};

// Toggles the isPinned flag. Returns null if the question doesn't belong to
// this visitor. Guards against a missing question row before toggling.
const togglePin = (id, anonymousId) => {
    if (!questionOwnedBy(id, anonymousId)) return null;

    const db = getDB();
    const question = getQuestionById(id);

    // Guard: if the question disappeared between the ownership check and this
    // read (shouldn't happen in normal use, but be safe), return null.
    if (!question) return null;

    const newValue = question.isPinned ? 0 : 1;

    db.prepare(
        `UPDATE questions SET isPinned = ?, updatedAt = datetime('now') WHERE id = ?`
    ).run(newValue, id);

    return getQuestionById(id);
};

// Updates the note text for a question. Treats undefined/null note as an
// empty string so the column is never set to NULL.
const updateNote = (id, anonymousId, note) => {
    if (!questionOwnedBy(id, anonymousId)) return null;

    const db = getDB();
    db.prepare(
        `UPDATE questions SET note = ?, updatedAt = datetime('now') WHERE id = ?`
    ).run(note || "", id);

    return getQuestionById(id);
};

// Deletes all questions for a session. Called before deleting the session
// itself (the FK cascade would handle it, but being explicit is clearer).
const deleteQuestionsBySession = (sessionId) => {
    const db = getDB();
    db.prepare(`DELETE FROM questions WHERE sessionId = ?`).run(sessionId);
};

module.exports = {
    createManyQuestions,
    getQuestionById,
    getQuestionsBySession,
    togglePin,
    updateNote,
    deleteQuestionsBySession,
    sessionBelongsTo,
};
