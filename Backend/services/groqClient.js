const Groq = require("groq-sdk");

// Single shared Groq client. Every feature (AI questions, resume parsing,
// GitHub summary, interview, feedback) imports this rather than constructing
// its own instance — keeps API key handling in one place.
//
// Switched from Gemini to Groq (July 2026): OpenAI-compatible API, faster
// inference on their own hardware, more generous free-tier limits.

if (!process.env.GROQ_API_KEY) {
    console.warn(
        "WARNING: GROQ_API_KEY is not set. AI features will fail until it is configured in .env"
    );
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Model ID lives in an env var so it can be swapped without a code change
// when Groq deprecates a model. Check console.groq.com/docs/deprecations
// before assuming the default below is still current.
const DEFAULT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/**
 * Calls Groq with a prompt and returns parsed JSON.
 * Uses Groq's JSON mode so the model is constrained to valid JSON
 * server-side. We still defensively strip markdown fences in case a model
 * wraps output despite JSON mode being set.
 */
const generateJSON = async (prompt, model = DEFAULT_MODEL) => {
    const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });

    const rawText = completion.choices[0]?.message?.content || "";

    // Guard against an empty response before attempting to parse — an empty
    // string passed to JSON.parse throws a SyntaxError with a confusing
    // message that hides the real problem (model returned nothing).
    if (!rawText.trim()) {
        throw new Error("Groq returned an empty response. The model may have refused the prompt.");
    }

    // Strip markdown code fences in case the model wraps JSON in ```json ... ```
    const cleanedText = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```$/, "")
        .trim();

    return JSON.parse(cleanedText);
};

module.exports = { groq, generateJSON, DEFAULT_MODEL };
