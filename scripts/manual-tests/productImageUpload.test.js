const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const productImageUpload = require('../../middleware/productImageUpload');

function multipartBody(fileSize) {
    const boundary = 'image-upload-test-boundary';
    const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="product.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const image = Buffer.alloc(fileSize);
    image.set([0xff, 0xd8, 0xff]);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
        boundary,
        body: Buffer.concat([header, image, footer]),
    };
}

test('product image upload accepts at most 50 KiB', async (t) => {
    const app = express();
    app.post('/image', productImageUpload.single('image'), (req, res) => res.sendStatus(201));
    app.use((err, _req, res, _next) => {
        res.sendStatus(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
    }));

    const address = server.address();
    const upload = async (size) => {
        const { boundary, body } = multipartBody(size);
        return fetch(`http://127.0.0.1:${address.port}/image`, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body,
        });
    };

    assert.equal((await upload(50 * 1024)).status, 201);
    assert.equal((await upload(50 * 1024 + 1)).status, 413);
});
