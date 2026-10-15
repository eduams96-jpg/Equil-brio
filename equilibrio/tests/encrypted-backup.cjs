const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptBackup, decryptBackup } = require('../desktop/encrypted-backup.cjs');

const phrase = 'uma frase-passe longa e privada';
const payload = JSON.stringify({ format: 'equilibrio-spaces', spaces: [{ name: 'Família', data: { accounts: [], transactions: [] } }] });

test('cópia encriptada recupera o conteúdo e usa sal e nonce novos', async () => {
  const first = await encryptBackup(payload, phrase);
  const second = await encryptBackup(payload, phrase);
  assert.equal(await decryptBackup(first, phrase), payload);
  assert.notEqual(first, second);
  assert.equal(first.includes('Família'), false);
  assert.equal(first.includes(phrase), false);
});

test('frase-passe errada não entrega conteúdo', async () => {
  const sealed = await encryptBackup(payload, phrase);
  await assert.rejects(decryptBackup(sealed, 'uma frase-passe diferente'), /Frase-passe incorreta ou cópia danificada/);
});

test('adulteração do conteúdo, nonce ou tag é rejeitada', async () => {
  const sealed = JSON.parse(await encryptBackup(payload, phrase));
  for (const field of ['ciphertext', 'nonce', 'tag']) {
    const altered = { ...sealed, [field]: Buffer.from(sealed[field], 'base64').map((byte, index) => index === 0 ? byte ^ 1 : byte).toString('base64') };
    await assert.rejects(decryptBackup(JSON.stringify(altered), phrase), /Frase-passe incorreta ou cópia danificada/);
  }
  await assert.rejects(decryptBackup(JSON.stringify({ ...sealed, version: 999 }), phrase), /versão.*inválido/);
});

test('frase-passe curta, formato errado e JSON inválido são recusados', async () => {
  await assert.rejects(encryptBackup(payload, 'curta'), /12/);
  await assert.rejects(encryptBackup('{', phrase), /JSON é inválida/);
  await assert.rejects(decryptBackup('{', phrase), /Formato/);
});
