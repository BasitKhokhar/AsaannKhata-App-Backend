const multer = require('multer');

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 40 },
  fileFilter(_req, file, callback) {
    if (allowed.has(file.mimetype)) return callback(null, true);
    const error = new Error('Only JPEG, PNG, WebP or GIF images are allowed');
    error.code = 'INVALID_IMAGE';
    callback(error);
  },
});
