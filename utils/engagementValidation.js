function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function youtubeId(value) {
  const safe = httpsUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (url.hostname === 'youtu.be') id = parts[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    id = url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null);
  }
  return /^[\w-]{11}$/.test(id || '') ? id : null;
}

function text(value, max, name) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name} must be at most ${max} characters.`);
  return value.trim();
}

function optionalUrl(value, name) {
  if (value == null || value === '') return null;
  const safe = httpsUrl(value);
  if (!safe) throw new Error(`${name} must be a valid HTTPS URL without credentials.`);
  return safe;
}

function validatePopup(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('A popup object is required.');
  if (!['image', 'image_link', 'video'].includes(body.type)) throw new Error('Choose image, image_link or video.');
  if (typeof body.active !== 'boolean') throw new Error('Active must be true or false.');
  const result = {
    type: body.type,
    active: body.active,
    title: text(body.title, 160, 'Title'),
    message: text(body.message, 1000, 'Message'),
    buttonLabel: text(body.buttonLabel, 60, 'Button label'),
    imageUrl: optionalUrl(body.imageUrl, 'Image URL'),
    videoUrl: optionalUrl(body.videoUrl, 'Video URL'),
    actionUrl: optionalUrl(body.actionUrl, 'Action URL'),
  };
  if (result.type !== 'video' && !result.imageUrl) throw new Error('An image URL is required.');
  if (result.type === 'image_link' && !result.actionUrl) throw new Error('An action URL is required.');
  if (result.type === 'video' && (!result.videoUrl || (!youtubeId(result.videoUrl) && !/\.(mp4|webm)$/i.test(new URL(result.videoUrl).pathname)))) {
    throw new Error('Use a YouTube video link or a direct HTTPS .mp4/.webm URL.');
  }
  if (result.type === 'image') { result.actionUrl = null; result.buttonLabel = ''; }
  if (result.type !== 'video') result.videoUrl = null;
  return result;
}

module.exports = { httpsUrl, youtubeId, validatePopup };
