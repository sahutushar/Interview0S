const path = require("path");
const multer = require("multer");

// Use an absolute path for the upload destination so the server works
// regardless of which directory it's started from. A relative "uploads/"
// would resolve against process.cwd(), which breaks when the process is
// launched from outside the Backend folder (e.g. from the repo root).
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    // Prefix with timestamp to avoid filename collisions when two visitors
    // upload a file with the same name at the same time.
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

// Reject anything that isn't a PDF at the multer layer so we never write
// non-PDF bytes to disk in the first place.
const fileFilter = (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
        cb(null, true);
    } else {
        cb(new Error("Only PDF resumes are supported"), false);
    }
};

// Limit file size to 10 MB — large enough for any real resume, small enough
// to prevent someone from uploading a 500 MB file and stalling the server.
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;
