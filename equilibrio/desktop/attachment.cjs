'use strict';
function hasMagicBytes(mime, buffer) {
  if (mime === 'application/pdf') {
    return buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D;
  }
  if (mime === 'image/png') {
    return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 && buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
  }
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (mime === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}
function decodeAttachment(attachment = {}) {
  const match = String(attachment?.data || '').match(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('Comprovativo inválido ou formato não suportado.');
  const mime = match[1];
  const limit = (mime === 'application/pdf' ? 8 : 10) * 1024 * 1024;
  const cleaned = match[2].replace(/\s+/g, '');
  if (!cleaned || cleaned.length > Math.ceil(limit * 4 / 3) + 8) throw new Error('O comprovativo é inválido ou demasiado grande.');
  const buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length || buffer.length > limit || !hasMagicBytes(mime, buffer)) throw new Error('O comprovativo é inválido ou demasiado grande.');
  const ext = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  return { mime, buffer, ext };
}
module.exports = { decodeAttachment };
