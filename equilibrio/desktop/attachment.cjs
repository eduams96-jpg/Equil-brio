'use strict';
function decodeAttachment(attachment = {}) {
  const match = String(attachment?.data || '').match(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('Comprovativo inválido ou formato não suportado.');
  const mime = match[1];
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  const limit = (mime === 'application/pdf' ? 8 : 10) * 1024 * 1024;
  if (!buffer.length || buffer.length > limit) throw new Error('O comprovativo é inválido ou demasiado grande.');
  const ext = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  return { mime, buffer, ext };
}
module.exports = { decodeAttachment };
