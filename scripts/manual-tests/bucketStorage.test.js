const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('uploads use random names and reject non-image content', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'asaankhata-upload-'));
  process.env.BUCKET_PATH = directory;
  process.env.BUCKET_BASE_URL = 'https://example.test/uploads';
  const { uploadImageFromBuffer } = require('../../utils/bucketStorage');
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const url = await uploadImageFromBuffer(png, 'image/png', '../../outside.png');
    assert.match(url, /^https:\/\/example\.test\/uploads\/[\w-]+\.png$/);
    assert.deepEqual(await fs.readFile(path.join(directory, path.basename(url))), png);
    await assert.rejects(uploadImageFromBuffer(Buffer.from('<script/>'), 'image/png', 'fake.png'), /Unsupported image type/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
