'use strict';

const http = require('node:http');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

// Give each pipe its own HTTP connection pool. Otherwise a keep-alive
// connection to the previous test can be reused after its server closes.
let fixturePort = 18000;

// A separate server per test. Only the socket changes; Node still parses the
// HTTP requests, response bodies, headers and actual connection resets.
async function listenForTest(t, server, listenTcp) {
  if (process.env.EQUILIBRIO_TEST_TRANSPORT !== 'ipc') return listenTcp();

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-ipc-'));
  t.after(() => fs.rmSync(folder, { recursive:true, force:true }));
  const socketPath = process.platform === 'win32'
    ? '\\\\.\\pipe\\equilibrio-' + randomUUID()
    : path.join(folder, 'server.sock');

  const listening = once(server, 'listening');
  server.listen(socketPath);
  await listening;
  // Route only this fixture's HTTP connections. Other tests have their own
  // process and the test runner restores this hook when the test ends.
  const port = ++fixturePort;
  const origin = 'http://127.0.0.1:' + port;
  const originalConnect = http.globalAgent.createConnection;
  t.mock.method(http.globalAgent, 'createConnection', function (options, callback) {
    if (options.host === '127.0.0.1' && Number(options.port) === port) {
      return net.createConnection({path:socketPath});
    }
    return originalConnect.call(this, options, callback);
  });
  return origin;
}

module.exports = { listenForTest };
