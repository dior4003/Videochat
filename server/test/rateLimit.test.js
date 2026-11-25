'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createRateLimiter } = require('../src/middleware/rateLimitMiddleware');

function run(limiter, req) {
  let status = 200;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json() { return this; } };
  let passed = false;
  limiter(req, res, () => { passed = true; });
  return { passed, status };
}

test('limitdan oshganda 429 qaytaradi va kalitlar alohida hisoblanadi', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, keyFn: (r) => r.k });
  assert.ok(run(limiter, { k: 'a' }).passed);
  assert.ok(run(limiter, { k: 'a' }).passed);
  const blocked = run(limiter, { k: 'a' });
  assert.strictEqual(blocked.passed, false);
  assert.strictEqual(blocked.status, 429);
  assert.ok(run(limiter, { k: 'b' }).passed);
});

test('oyna tugagach hisob qayta boshlanadi', async () => {
  const limiter = createRateLimiter({ windowMs: 50, max: 1, keyFn: () => 'x' });
  assert.ok(run(limiter, {}).passed);
  assert.strictEqual(run(limiter, {}).passed, false);
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(run(limiter, {}).passed);
});
