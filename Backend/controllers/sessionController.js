const sessionModel = require("../models/sessionModel");
const questionModel = require("../models/questionModel");

// @desc Create a new session and optionally attach an initial batch of questions.
// The frontend calls this right after generating questions via /api/ai so the
// session and its questions are created in one round trip.
// @route POST /api/sessions/create
// @access Public, scoped to the visitor's anonymous ID
exports.createSession = async (req, res) => {
    try {
        const { role, experience, topicsToFocus, description, questions } = req.body;
        const { anonymousId } = req;

        if (!role || !experience || !topicsToFocus) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const session = sessionModel.createSession({
            anonymousId,
            role,
            experience,
            topicsToFocus,
            description,
        });

        // Questions are optional at creation time — the caller may add them
        // later via POST /api/questions/add. Default to an empty array so the
        // response shape is always consistent.
        let createdQuestions = [];
        if (Array.isArray(questions) && questions.length > 0) {
            createdQuestions = questionModel.createManyQuestions(session.id, anonymousId, questions) || [];
        }

        res.status(201).json({
            success: true,
            session: { ...session, questions: createdQuestions },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @desc Get all sessions belonging to this visitor, each with its questions.
// @route GET /api/sessions/my-sessions
// @access Public, scoped to the visitor's anonymous ID
exports.getMySessions = async (req, res) => {
    try {
        // Hydrate each session with its questions in a single pass.
        // For MVP scale (dozens of sessions) this N+1 pattern is fine;
        // replace with a JOIN if session counts grow large.
        const sessions = sessionModel.getAllSessions(req.anonymousId).map((session) => ({
            ...session,
            questions: questionModel.getQuestionsBySession(session.id),
        }));
        res.status(200).json(sessions);
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @desc Get a single session by ID with its questions.
// Returns 404 if the session doesn't exist or belongs to a different visitor.
// @route GET /api/sessions/:id
// @access Public, scoped to the visitor's anonymous ID
exports.getSessionById = async (req, res) => {
    try {
        const session = sessionModel.getSessionById(req.params.id, req.anonymousId);

        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found" });
        }

        const questions = questionModel.getQuestionsBySession(session.id);
        res.status(200).json({ success: true, session: { ...session, questions } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @desc Delete a session and all its questions.
// The FK cascade in the DB would handle question deletion automatically, but
// we call deleteQuestionsBySession explicitly for clarity.
// @route DELETE /api/sessions/:id
// @access Public, scoped to the visitor's anonymous ID
exports.deleteSession = async (req, res) => {
    try {
        const session = sessionModel.getSessionById(req.params.id, req.anonymousId);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        questionModel.deleteQuestionsBySession(session.id);
        sessionModel.deleteSession(session.id, req.anonymousId);

        res.status(200).json({ message: "Session deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
