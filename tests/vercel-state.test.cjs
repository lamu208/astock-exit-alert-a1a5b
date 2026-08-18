const assert = require('node:assert/strict');
const stateApi = require('../api/state');

assert.deepEqual(stateApi._test.queryParameters({
  watchlist: ['first', 'second'],
  plain: 'value'
}), {
  watchlist: 'first',
  plain: 'value'
});

(async () => {
  const headers = {};
  const response = {
    statusCode: 0,
    ended: false,
    setHeader(name, value) { headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    end() { this.ended = true; return this; },
    send() { throw new Error('OPTIONS response must not send a body'); }
  };

  await stateApi({ method: 'OPTIONS', query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(headers['access-control-allow-origin'], '*');
  console.log('vercel-state: adapter contract passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
