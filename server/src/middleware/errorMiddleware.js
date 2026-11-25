'use strict';

function notFound(_req, res) {
  res.status(404).json({ error: 'Topilmadi' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;

  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'So‘rov hajmi juda katta' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Noto‘g‘ri JSON' });
  }
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Bunday yozuv allaqachon mavjud' });
  }
  if (err && err.status && err.expose) {
    return res.status(err.status).json({ error: err.message });
  }

  // Ichki xatolarni mijozga ko'rsatmaymiz – faqat logga yozamiz.
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Ichki server xatosi' });
}

module.exports = { notFound, errorHandler };
