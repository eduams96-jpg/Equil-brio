'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const FORMAT = 'equilibrio-encrypted-backup';
const VERSION = 1;
const KDF = 'scrypt-N32768-r8-p1';
const MAX_PLAINTEXT_BYTES = 64 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = 96 * 1024 * 1024;
const AAD = Buffer.from(`${FORMAT}:v${VERSION}`, 'utf8');
const SCRYPT_OPTIONS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function requirePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024)
    throw new Error('A frase-passe deve ter entre 12 e 1024 caracteres.');
}

function decodeBase64(value, expectedLength = null) {
  if (typeof value !== 'string' || !value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('Formato da cópia encriptada inválido.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (expectedLength !== null && bytes.length !== expectedLength))
    throw new Error('Formato da cópia encriptada inválido.');
  return bytes;
}

async function encryptBackup(content, passphrase) {
  requirePassphrase(passphrase);
  if (typeof content !== 'string' || !content.trim()) throw new Error('A cópia está vazia.');
  const plaintext = Buffer.from(content, 'utf8');
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error('A cópia excede o limite de 64 MB.');
  try { JSON.parse(content); } catch { throw new Error('A cópia JSON é inválida.'); }
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const key = await scrypt(passphrase, salt, 32, SCRYPT_OPTIONS);
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return JSON.stringify({
      format: FORMAT,
      version: VERSION,
      cipher: 'AES-256-GCM',
      kdf: KDF,
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

async function decryptBackup(raw, passphrase) {
  requirePassphrase(passphrase);
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_ENVELOPE_BYTES)
    throw new Error('Formato da cópia encriptada inválido.');
  let envelope;
  try { envelope = JSON.parse(raw); } catch { throw new Error('Formato da cópia encriptada inválido.'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      envelope.format !== FORMAT || envelope.version !== VERSION ||
      envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== KDF)
    throw new Error('Formato ou versão da cópia encriptada inválido.');
  const salt = decodeBase64(envelope.salt, 16);
  const nonce = decodeBase64(envelope.nonce, 12);
  const tag = decodeBase64(envelope.tag, 16);
  const ciphertext = decodeBase64(envelope.ciphertext);
  if (ciphertext.length > MAX_PLAINTEXT_BYTES) throw new Error('A cópia excede o limite de 64 MB.');
  const key = await scrypt(passphrase, salt, 32, SCRYPT_OPTIONS);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    try {
      const content = plaintext.toString('utf8');
      JSON.parse(content);
      return content;
    } finally { plaintext.fill(0); }
  } catch {
    throw new Error('Frase-passe incorreta ou cópia danificada.');
  } finally { key.fill(0); }
}

module.exports = { encryptBackup, decryptBackup, FORMAT, VERSION };
