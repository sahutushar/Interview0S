const { Octokit } = require("@octokit/rest");

// GITHUB_TOKEN is optional — public repos work without one, but GitHub's
// unauthenticated rate limit is only 60 requests/hour vs. 5,000/hour with a
// personal access token. Set it in .env for anything beyond occasional testing.
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN || undefined });

// Directories we never want to crawl — they're either generated artifacts,
// dependency trees, or VCS internals that add noise without useful signal.
const EXCLUDED_DIR_SEGMENTS = [
    "node_modules/", ".git/", "dist/", "build/", "vendor/",
    "__pycache__/", ".next/", "coverage/", ".venv/", "venv/",
];

// Only pull files with these extensions — we want source code and config,
// not images, compiled binaries, lock files, etc.
const CODE_EXTENSIONS = new Set([
    ".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java", ".rb", ".php",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".rs", ".swift", ".kt", ".md",
    ".json", ".yml", ".yaml",
]);

// These filenames get sorted to the front of the file list so they're always
// included within the MAX_FILES cap — they tell us the most about the stack.
const PRIORITY_FILENAMES = new Set([
    "package.json", "requirements.txt", "go.mod", "pom.xml", "Cargo.toml",
]);

// Hard cap on how many files we fetch per repo. Keeps the crawl fast and
// the embedding step from running for minutes on large monorepos.
const MAX_FILES = 25;

// Skip files larger than this — they're almost always generated code or data
// dumps that would flood the embedding corpus with low-signal content.
const MAX_FILE_BYTES = 50_000;

/**
 * Parses a GitHub repo URL in any common format into { owner, repo }.
 * Accepts: full https URLs, SSH URLs, www-prefixed, /tree/branch suffixes,
 * ?tab= query strings, #readme hashes, and bare "owner/repo" shorthands.
 * Throws a descriptive error if the input can't be parsed.
 */
const parseGithubUrl = (input) => {
    let cleaned = input.trim();

    // Strip wrapping characters people sometimes paste with a link
    // (markdown angle brackets, quotes copied from chat or docs).
    cleaned = cleaned.replace(/^[<"'\s]+|[>"'\s]+$/g, "");

    // Drop query string and hash — common when copying from the browser bar
    // (e.g. "?tab=readme-ov-file", "#readme", "#L10-L20").
    cleaned = cleaned.split("?")[0].split("#")[0];

    // Drop trailing slash and .git suffix.
    cleaned = cleaned.replace(/\/+$/, "").replace(/\.git$/i, "");

    // Match github.com/owner/repo in any URL variant (https, SSH, www).
    const urlMatch = cleaned.match(/github\.com[:/]+([^/\s]+)\/([^/\s]+)/i);
    // Match a bare "owner/repo" shorthand with nothing else attached.
    const shorthandMatch = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
    const match = urlMatch || shorthandMatch;

    // Both capture groups must be non-empty strings. A profile URL like
    // https://github.com/username has no repo segment, so match[2] would
    // be undefined — catch that here with a clear message.
    if (!match || !match[1] || !match[2]) {
        throw new Error(
            `Could not parse a GitHub owner/repo from "${input}". Paste a repo URL like https://github.com/owner/repo, not a profile URL.`
        );
    }

    return { owner: match[1], repo: match[2] };
};

// Returns true if the file path contains any excluded directory segment.
const isExcluded = (path) => EXCLUDED_DIR_SEGMENTS.some((seg) => path.includes(seg));

// Returns true if a tree item is a file we want to fetch and embed.
const isCandidateFile = (item) => {
    if (item.type !== "blob") return false;
    if (item.size && item.size > MAX_FILE_BYTES) return false;
    if (isExcluded(item.path)) return false;
    const lastDot = item.path.lastIndexOf(".");
    if (lastDot === -1) return false;
    return CODE_EXTENSIONS.has(item.path.slice(lastDot));
};

/**
 * Crawls a public GitHub repository and returns:
 *   - repo metadata (name, description, stars, default branch)
 *   - README text
 *   - up to MAX_FILES source files (priority files first)
 *   - last 10 commits
 *   - the first dependency manifest found (for the Groq summary prompt)
 *
 * Throws on invalid input, private/nonexistent repos, or rate-limit errors.
 * Error messages are already descriptive enough to surface directly to the UI.
 */
const crawlRepository = async (repoUrlOrShorthand) => {
    const { owner, repo } = parseGithubUrl(repoUrlOrShorthand);

    const { data: repoMeta } = await octokit.repos.get({ owner, repo });

    // README is optional — many repos have one, but missing it isn't fatal.
    let readme = "";
    try {
        const { data } = await octokit.repos.getReadme({
            owner,
            repo,
            mediaType: { format: "raw" },
        });
        readme = typeof data === "string" ? data : "";
    } catch {
        readme = "";
    }

    // Fetch the full recursive file tree in one API call rather than
    // walking directories one level at a time (saves many round trips).
    const { data: tree } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: repoMeta.default_branch,
        recursive: "1",
    });

    // Filter to candidate files, then sort so priority files come first.
    const candidates = (tree.tree || []).filter(isCandidateFile);
    candidates.sort((a, b) => {
        const aName = a.path.split("/").pop();
        const bName = b.path.split("/").pop();
        const aPriority = PRIORITY_FILENAMES.has(aName) ? 0 : 1;
        const bPriority = PRIORITY_FILENAMES.has(bName) ? 0 : 1;
        return aPriority - bPriority;
    });

    const selected = candidates.slice(0, MAX_FILES);

    // Fetch each file's content via the blob API. Skip any that fail
    // (binary files, files that are oversized after base64 decode, etc.).
    const files = [];
    for (const item of selected) {
        try {
            const { data: blob } = await octokit.git.getBlob({
                owner,
                repo,
                file_sha: item.sha,
            });
            const content = Buffer.from(blob.content, blob.encoding).toString("utf-8");
            files.push({ path: item.path, content });
        } catch {
            // Silently skip unreadable files — not worth aborting the whole crawl.
        }
    }

    // Grab the 10 most recent commits for display in the UI.
    let commits = [];
    try {
        const { data } = await octokit.repos.listCommits({ owner, repo, per_page: 10 });
        commits = data.map((c) => ({
            sha: c.sha.slice(0, 7),
            message: (c.commit.message || "").split("\n")[0], // first line only
            author: c.commit.author?.name || "unknown",
            date: c.commit.author?.date || null,
        }));
    } catch {
        commits = [];
    }

    // Find the first dependency manifest to include in the Groq summary prompt.
    // Slice to 3000 chars so we don't blow the prompt budget on a huge lock file.
    const dependencyFile = files.find((f) => PRIORITY_FILENAMES.has(f.path.split("/").pop())) || null;

    return {
        owner,
        repo,
        fullName: repoMeta.full_name,
        description: repoMeta.description || "",
        defaultBranch: repoMeta.default_branch,
        stars: repoMeta.stargazers_count,
        readme,
        files,
        commits,
        dependencyFile: dependencyFile
            ? { path: dependencyFile.path, content: dependencyFile.content.slice(0, 3000) }
            : null,
    };
};

module.exports = { crawlRepository, parseGithubUrl };
