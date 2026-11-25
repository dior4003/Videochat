'use strict';
// Tashqi paketlarsiz (express/mysql2/ws o'rnatilmagan bo'lsa ham) barcha modullar bir-biriga to'g'ri ulanganini tekshiradi:
// import qilingan nomlar mavjudligi va har bir route handler funksiya ekanligi.
process.env.JWT_SECRET = 'y'.repeat(48);
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const stubs = {};
function installStubs() {
  const origLoad = Module._load;
  const registered = [];
  const router = {};
  for (const m of ['get', 'post', 'put', 'delete']) {
    router[m] = (path, ...handlers) => {
      assert.ok(handlers.length > 0, `${m} ${path}: handler yo‘q`);
      handlers.forEach((h, i) => assert.strictEqual(typeof h, 'function', `${m.toUpperCase()} ${path}: ${i}-handler funksiya emas`));
      registered.push(`${m.toUpperCase()} ${path}`);
    };
  }
  router.param = () => {};
  const express = () => ({});
  express.Router = () => router;
  express.json = () => () => {};
  stubs.express = express;
  stubs.mysql2 = { createPool: () => ({}), createConnection: async () => ({}), escapeId: (s) => s };
  Module._load = function (request, ...rest) {
    if (request === 'express') return express;
    if (request === 'mysql2/promise') return stubs.mysql2;
    return origLoad.call(this, request, ...rest);
  };
  return { registered, restore: () => { Module._load = origLoad; } };
}

test('barcha route handler’lar funksiya va barcha controller’lar yuklanadi', () => {
  const { registered, restore } = installStubs();
  try {
    require('../src/routes/apiRoutes');
    require('../src/config/migrations');
    assert.ok(registered.length > 30, `kutilganidan kam route: ${registered.length}`);
    for (const must of ['POST /auth/login', 'GET /ice', 'POST /ws-ticket', 'POST /media', 'GET /media/:name/link', 'POST /friends/block']) {
      assert.ok(registered.includes(must), `${must} route yo‘q`);
    }
  } finally {
    restore();
  }
});
