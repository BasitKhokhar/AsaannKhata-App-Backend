const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePopup } = require('../../utils/engagementValidation');

test('normalizes a safe image-link popup', () => {
  assert.deepEqual(validatePopup({
    type: 'image_link',
    active: true,
    title: '  New guide  ',
    message: 'Learn the updated billing flow.',
    imageUrl: 'https://cdn.example.com/guide.jpg',
    actionUrl: 'https://example.com/guide',
    buttonLabel: 'Open guide',
  }), {
    type: 'image_link',
    active: true,
    title: 'New guide',
    message: 'Learn the updated billing flow.',
    buttonLabel: 'Open guide',
    imageUrl: 'https://cdn.example.com/guide.jpg',
    videoUrl: null,
    actionUrl: 'https://example.com/guide',
  });
});

test('rejects insecure media and unsupported video URLs', () => {
  assert.throws(() => validatePopup({ type: 'image', active: false, imageUrl: 'http://example.com/a.jpg' }), /HTTPS/);
  assert.throws(() => validatePopup({ type: 'video', active: false, videoUrl: 'https://example.com/page' }), /YouTube/);
});

test('does not accept credentials embedded in an action URL', () => {
  assert.throws(() => validatePopup({
    type: 'image_link', active: false,
    imageUrl: 'https://cdn.example.com/a.jpg',
    actionUrl: 'https://user:password@example.com/private',
  }), /HTTPS/);
});
