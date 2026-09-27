const { crawlRepository } = require("../services/githubCrawler");
const { chunkText } = require("../services/chunker");
const { embedMany } = require("../services/embeddingService");
const { generateJSON } = require("../services/groqClient");
const { githubProjectSummaryPrompt } = require("../utils/prompts");
const githubProjectModel = require("../models/githubProjectModel");
const knowledgeChunkModel = require("../models/knowledgeChunkModel");

// @desc Crawl a GitHub repo, build a local RAG corpus, summarize via Groq, store everything.
// Pipeline: crawl → chunk → embed (local) → summarize (Groq) → persist.
// @route POST /api/github/analyze
// @access Public, scoped to the visitor's anonymous ID
// @note Rate-limited (see routes/githubRoutes.js) — makes one Groq call for
// the summary. The embedding step is fully local (no external call, no cost).
const analyzeRepository = async (req, res) => {
    try {
        const { repoUrl } = req.body;

        if (!repoUrl) {
            return res.status(400).json({ message: "repoUrl is required" });
        }

        // Step 1: Crawl — fetch metadata, README, source files, and commits.
        const crawled = await crawlRepository(repoUrl);

        // Step 2: Chunk — split README and each source file into overlapping
        // fixed-size chunks. Each chunk carries a source label so we know
        // which file it came from when we inject it into a prompt later.
        const rawChunks = [];
        if (crawled.readme) {
            rawChunks.push(...chunkText(crawled.readme, { source: "readme" }));
        }
        for (const file of crawled.files) {
            rawChunks.push(...chunkText(file.content, { source: `file:${file.path}` }));
        }

        // Step 3: Embed — run all chunks through the local transformer model.
        // Sequential, no external API call, no cost.
        const embeddings = await embedMany(rawChunks.map((c) => c.content));
        const embeddedChunks = rawChunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] }));

        // Step 4: Summarize — one Groq call to extract technologies,
        // architecture layers, and a plain-language project summary.
        const fileList = crawled.files.map((f) => f.path);
        const prompt = githubProjectSummaryPrompt(
            crawled.fullName,
            crawled.readme,
            fileList,
            crawled.dependencyFile
        );
        const summary = await generateJSON(prompt);

        // Step 5: Persist — store the project row and all embedded chunks.
        const project = githubProjectModel.createProject({
            anonymousId: req.anonymousId,
            repoUrl,
            repoFullName: crawled.fullName,
            name: crawled.repo,
            description: crawled.description,
            technologies: summary.technologies,
            architectureLayers: summary.architectureLayers,
            summary: summary.summary,
            commits: crawled.commits,
        });

        knowledgeChunkModel.insertChunks(project.id, req.anonymousId, embeddedChunks);

        res.status(201).json({
            success: true,
            project,
            chunkCount: embeddedChunks.length,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to analyze repository",
            error: error.message,
        });
    }
};

// @desc Get all GitHub projects analyzed by this visitor
// @route GET /api/github/projects
// @access Public, scoped to the visitor's anonymous ID
const getProjects = async (req, res) => {
    try {
        const projects = githubProjectModel.getProjectsByAnon(req.anonymousId);
        res.status(200).json(projects);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc Get a single analyzed project by ID
// @route GET /api/github/projects/:id
// @access Public, scoped to the visitor's anonymous ID
const getProject = async (req, res) => {
    try {
        const project = githubProjectModel.getProjectById(req.params.id, req.anonymousId);

        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        res.status(200).json({ success: true, project });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

module.exports = { analyzeRepository, getProjects, getProject };
