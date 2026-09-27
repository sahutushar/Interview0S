const { generateJSON } = require("../services/groqClient");
const { questionAnswerPrompt, conceptExplainPrompt } = require("../utils/prompts");

// @desc Generate interview questions and answers using Groq
// @route POST /api/ai/generate-questions
// @access Public, scoped to the visitor's anonymous ID
// @note Rate-limited (see routes/aiRoutes.js) — this calls Groq.
const generateInterviewQuestions = async (req, res) => {
    try {
        const { role, experience, topicsToFocus, numberOfQuestions } = req.body;

        if (!role || !experience || !topicsToFocus || !numberOfQuestions) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const prompt = questionAnswerPrompt(role, experience, topicsToFocus, numberOfQuestions);
        const data = await generateJSON(prompt);

        // The prompt asks for {"questions": [...]} because Groq's JSON mode
        // requires a top-level object, not a bare array. Unwrap it here so
        // the external API contract stays a plain array.
        res.status(200).json(data.questions || []);
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate questions",
            error: error.message,
        });
    }
};

// @desc Generate a detailed explanation for a single interview question
// @route POST /api/ai/generate-explanation
// @access Public, scoped to the visitor's anonymous ID
// @note Rate-limited — this calls Groq.
const generateConceptExplanation = async (req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const prompt = conceptExplainPrompt(question);
        const data = await generateJSON(prompt);

        // Returns { title, explanation } — pass through as-is.
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({
            message: "Failed to generate explanation",
            error: error.message,
        });
    }
};

module.exports = { generateInterviewQuestions, generateConceptExplanation };
