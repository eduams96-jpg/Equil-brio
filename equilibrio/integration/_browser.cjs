'use strict';
const fs = require('node:fs');

function requirePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    'playwright-core',
  ].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try { return require(candidate); }
    catch (error) { errors.push(`${candidate}: ${error?.code || error?.message || error}`); }
  }
  const hint = 'Instala Playwright como dependência de desenvolvimento ou define PLAYWRIGHT_MODULE com o caminho do módulo.';
  throw new Error(`Playwright não está disponível. ${hint}\n${errors.join('\n')}`);
}

function browserExecutablePath() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/brave-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function browserLaunchOptions(extra = {}) {
  const executablePath = browserExecutablePath();
  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...extra,
  };
}

const { chromium } = requirePlaywright();
module.exports = { chromium, browserExecutablePath, browserLaunchOptions };
