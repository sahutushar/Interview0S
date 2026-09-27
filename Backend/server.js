require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { connectDB } = require("./config/db");
const { requireAnonId } = require("./middlewares/anonMiddleware");

const sessionRoutes = require("./routes/sessionRoutes");
const questionRoutes = require("./routes/questionRoutes");
const aiRoutes = require("./routes/aiRoutes");
const resumeRoutes = require("./routes/resumeRoutes");
const githubRoutes = require("./routes/githubRoutes");
const interviewRoutes = require("./routes/interviewRoutes");

const app = express();

// CORS: restrict to the frontend origin in production via the
// ALLOWED_ORIGIN env var. Falls back to "*" for local dev convenience,
// but you should set ALLOWED_ORIGIN on any public deployment.
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(
    cors({
        origin: allowedOrigin,
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Anon-Id"],
    })
);
app.use(express.json());

// Connect to SQLite and run CREATE TABLE IF NOT EXISTS migrations.
connectDB();

// Ensure the uploads directory exists. multer's diskStorage won't create it
// automatically and will throw if it's missing on first upload.
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Health check — exempt from the anon-ID requirement, used for uptime
// monitors (e.g. Render's health check ping).
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// All data routes require a valid anonymous visitor ID. The ID is generated
// once per browser (see frontend/src/lib/anonId.ts) and sent on every
// request via X-Anon-Id. This scopes each visitor's data without accounts.
app.use("/api/sessions", requireAnonId, sessionRoutes);
app.use("/api/questions", requireAnonId, questionRoutes);
app.use("/api/ai", requireAnonId, aiRoutes);
app.use("/api/resume", requireAnonId, resumeRoutes);
app.use("/api/github", requireAnonId, githubRoutes);
app.use("/api/interviews", requireAnonId, interviewRoutes);

// Serve the uploads folder statically (not used after resume processing
// since we delete the file, but kept for any future static asset needs).
app.use("/uploads", express.static(uploadsDir));

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
