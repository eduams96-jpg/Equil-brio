'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeBufferCompletely(filePath, buffer) {
  const handle = await fs.open(filePath, 'wx');
  try {
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, offset);
      if (!bytesWritten) throw new Error('A gravação não avançou.');
      offset += bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function verifyExactFile(filePath, expectedBuffer, expectedHash = sha256(expectedBuffer)) {
  const stat = await fs.stat(filePath);
  if (stat.size !== expectedBuffer.length) {
    throw new Error(`Tamanho inesperado: ${stat.size} bytes em vez de ${expectedBuffer.length}.`);
  }
  const actual = await fs.readFile(filePath);
  if (actual.length !== expectedBuffer.length || sha256(actual) !== expectedHash) {
    throw new Error('O conteúdo escrito não corresponde ao conteúdo original.');
  }
  return { size: stat.size, sha256: expectedHash };
}

async function writeVerifiedAtomic(destination, content, options = {}) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  const expectedHash = sha256(buffer);
  const retries = Math.max(1, Math.min(5, Number(options.retries) || 3));
  const stageDirectory = path.resolve(options.stageDirectory || path.dirname(destination));
  const destinationDirectory = path.dirname(destination);
  await fs.mkdir(stageDirectory, { recursive: true });
  await fs.mkdir(destinationDirectory, { recursive: true });

  const stagePath = path.join(stageDirectory, `.equilibrio-stage-${crypto.randomUUID()}.tmp`);
  try {
    await writeBufferCompletely(stagePath, buffer);
    await verifyExactFile(stagePath, buffer, expectedHash);

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const tempPath = `${destination}.${crypto.randomUUID()}.tmp`;
      const previousPath = `${destination}.${crypto.randomUUID()}.previous`;
      let previous = null, replaced = false, preservePrevious = false;
      try {
        await fs.copyFile(stagePath, tempPath);
        const tempHandle = await fs.open(tempPath, 'r+');
        try { await tempHandle.sync(); } finally { await tempHandle.close(); }
        await verifyExactFile(tempPath, buffer, expectedHash);
        try { previous = await fs.readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (previous !== null) {
          await writeBufferCompletely(previousPath, previous);
          await verifyExactFile(previousPath, previous);
        }
        await fs.rename(tempPath, destination);
        replaced = true;
        await verifyExactFile(destination, buffer, expectedHash);
        return { ok: true, filePath: destination, size: buffer.length, sha256: expectedHash, attempts: attempt };
      } catch (error) {
        lastError = error;
        if (replaced) {
          try {
            if (previous !== null) { await writeBufferCompletely(tempPath, previous); await verifyExactFile(tempPath, previous); await fs.rename(tempPath, destination); await verifyExactFile(destination, previous); }
            else await fs.rm(destination, { force: true });
          } catch (rollbackError) {
            preservePrevious = true;
            throw new Error('Falha na escrita e na recuperação da cópia anterior: ' + rollbackError.message + '. Proteção: ' + previousPath, { cause: error });
          }
        }
        try { await fs.rm(tempPath, { force: true }); } catch {}
        if (attempt < retries) await sleep(120 * attempt);
      } finally {
        if (!preservePrevious) { try { await fs.rm(previousPath, { force: true }); } catch {} }
      }
    }
    throw lastError || new Error('Não foi possível concluir a gravação verificada.');
  } finally {
    try { await fs.rm(stagePath, { force: true }); } catch {}
  }
}

module.exports = { sha256, writeBufferCompletely, verifyExactFile, writeVerifiedAtomic };

