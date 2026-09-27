const { randomUUID } = require("crypto");
const { getDB } = require("../config/db");

// The three interview modes the app supports. Exported so the controller
// can validate the incoming `mode` field against this list without
// duplicating the values.
const VALID_MODES = ["technical", "deep_dive", "behavioral"];

// Creates a new interview row and returns it. experience and topicsToFocus
// are optional — default to empty string so the columns are never NULL.
const createInterview = ({ anonymousId, mode, role, experience, topicsToFocus, projectId }) => {
    const db = getDB();
    const id = randomUUID();

    db.prepare(
        `INSERT INTO interviews (id, anonymousId, mode, role, experience, topicsToFocus, projectId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, anonymousId, mode, role, experience || "", topicsToFocus || "", projectId || null);

    return getInterviewByIdRaw(id);
};

// Internal helper — no ownership check. Only used right after creation
// where we already know the row belongs to the caller.
const getInterviewByIdRaw = (id) => {
    const db = getDB();
    return db.prepare(`SELECT * FROM interviews WHERE id = ?`).get(id);
};

// Ownership-checked lookup. Returns undefined if the interview doesn't
// belong to this anonymousId (even if it exists for someone else).
const getInterviewById = (id, anonymousId) => {
    const db = getDB();
    return db
        .prepare(`SELECT * FROM interviews WHERE id = ? AND anonymousId = ?`)
        .get(id, anonymousId);
};

// Returns all interviews for a visitor, newest first.
const getInterviewsByAnon = (anonymousId) => {
    const db = getDB();
    return db
        .prepare(`SELECT * FROM interviews WHERE anonymousId = ? ORDER BY createdAt DESC`)
        .all(anonymousId);
};

// Updates the status field (e.g. "active" → "completed") and bumps updatedAt.
// Returns the updated row so callers don't need a second query.
const updateStatus = (id, anonymousId, status) => {
    const db = getDB();
    db.prepare(
        `UPDATE interviews SET status = ?, updatedAt = datetime('now') WHERE id = ? AND anonymousId = ?`
    ).run(status, id, anonymousId);
    return getInterviewById(id, anonymousId);
};

// Appends a message to the transcript and bumps the interview's updatedAt
// so the list view can sort by last activity. Returns the new message row.
const addMessage = (interviewId, role, content) => {
    const db = getDB();
    const id = randomUUID();

    db.prepare(
        `INSERT INTO interview_messages (id, interviewId, role, content) VALUES (?, ?, ?, ?)`
    ).run(id, interviewId, role, content);

    // Touch the parent interview so it floats to the top of "recent" lists.
    db.prepare(`UPDATE interviews SET updatedAt = datetime('now') WHERE id = ?`).run(interviewId);

    return db.prepare(`SELECT * FROM interview_messages WHERE id = ?`).get(id);
};

// Returns the full transcript for an interview in chronological order.
const getMessages = (interviewId) => {
    const db = getDB();
    return db
        .prepare(`SELECT * FROM interview_messages WHERE interviewId = ? ORDER BY createdAt ASC`)
        .all(interviewId);
};

module.exports = {
    VALID_MODES,
    createInterview,
    getInterviewById,
    getInterviewsByAnon,
    updateStatus,
    addMessage,
    getMessages,
};
