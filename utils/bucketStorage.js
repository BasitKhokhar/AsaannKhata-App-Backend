const fs = require("fs");
const path = require("path");
const { randomUUID } = require('node:crypto');
require("dotenv").config();

const BUCKET_PATH = process.env.BUCKET_PATH;
const BUCKET_BASE_URL = process.env.BUCKET_BASE_URL;

const uploadImageFromBuffer = async (buffer, mimetype, filename) => {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Invalid image size');
    let extension;
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) extension = 'jpg';
    else if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) extension = 'png';
    else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
    else if (['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) extension = 'gif';
    else throw new Error('Unsupported image type');
    if (!BUCKET_PATH || !BUCKET_BASE_URL) throw new Error('BUCKET_PATH and BUCKET_BASE_URL must be configured');
    const safeFilename = `${randomUUID()}.${extension}`;
    try {

        // Ensure bucket folder exists
        if (!fs.existsSync(BUCKET_PATH)) {
            fs.mkdirSync(BUCKET_PATH, { recursive: true });
        }

        const filePath = path.join(BUCKET_PATH, safeFilename);

        // Save file
        await fs.promises.writeFile(filePath, buffer);

        // Return public URL
        const fileUrl = `${BUCKET_BASE_URL.replace(/\/$/, '')}/${safeFilename}`;

        return fileUrl;

    } catch (error) {
        console.error("Bucket Upload Error:", error);
        throw error;
    }
};

module.exports = {
    uploadImageFromBuffer
};
