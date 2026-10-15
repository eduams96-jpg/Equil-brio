'use strict';

// All privileged channels share the same sender policy, including synchronous
// compatibility channels used before renderer scripts have loaded.
function createTrustedIpc(ipcMain, isTrusted) {
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!isTrusted(event)) throw new Error('Origem IPC não autorizada.');
        return handler(event, ...args);
      });
    },
    on(channel, handler) {
      ipcMain.on(channel, (event, ...args) => {
        if (!isTrusted(event)) { event.returnValue = null; return; }
        try { return handler(event, ...args); }
        catch (error) {
          console.error(`IPC ${channel}:`, error);
          event.returnValue = { ok: false, error: error.message || String(error) };
        }
      });
    },
  };
}
module.exports = { createTrustedIpc };
