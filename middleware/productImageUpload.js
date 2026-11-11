const multer = require('multer');

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

module.exports = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024, files: 1, fields: 40 },
    fileFilter(_req, file, callback) {
        if (allowed.has(file.mimetype)) return callback(null, true);
        const error = new Error('Only JPEG, PNG or WebP images are allowed');
        error.code = 'INVALID_IMAGE';
        callback(error);
    },
});
