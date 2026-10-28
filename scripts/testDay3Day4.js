import http from 'http';
import app from '../app.js';

const runTests = async () => {
  console.log('====================================================');
  console.log('   DAY 3 & DAY 4 BACKEND FOUNDATION & AUTH TESTS    ');
  console.log('====================================================\n');

  const testServer = http.createServer(app);
  await new Promise(resolve => testServer.listen(0, resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  const assert = (condition, message) => {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(message);
    }
    passed++;
    console.log(`  ✓ ${message}`);
  };

  try {
    // -----------------------------------------------------------------
    // TEST 1: GET /health endpoint (Day 3)
    // -----------------------------------------------------------------
    console.log('[1/4] Testing GET /health endpoint & response structure...');
    const healthRes = await fetch(`${baseUrl}/health`);
    assert(healthRes.status === 200, 'GET /health returns HTTP 200 OK');
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok', 'healthData.status is "ok"');
    assert(typeof healthData.uptime === 'string', 'healthData.uptime is provided');
    assert(typeof healthData.timestamp === 'string', 'healthData.timestamp is an ISO string');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 2: 404 Handler for undefined routes (Day 3)
    // -----------------------------------------------------------------
    console.log('[2/4] Testing 404 Not Found Handler...');
    const notFoundRes = await fetch(`${baseUrl}/unknown-route-12345`);
    assert(notFoundRes.status === 404, 'Undefined route returns HTTP 404');
    const notFoundData = await notFoundRes.json();
    assert(notFoundData.message && notFoundData.message.includes('Route not found'), '404 handler returns clean JSON error message');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 3: Zod Request Validation & Auth Routes (Day 4)
    // -----------------------------------------------------------------
    console.log('[3/4] Testing Zod validation on POST /auth/register & /auth/login...');
    
    // Test register with missing body
    const badRegisterRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(badRegisterRes.status === 400, 'POST /auth/register with empty body returns HTTP 400 Bad Request');
    const badRegisterData = await badRegisterRes.json();
    assert(Array.isArray(badRegisterData.errors), 'Response contains structured validation errors list');

    // Test register with invalid email
    const invalidEmailRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        email: 'invalid-email',
        password: 'short'
      })
    });
    assert(invalidEmailRes.status === 400, 'POST /auth/register with invalid email & short password returns 400');
    const invalidEmailData = await invalidEmailRes.json();
    assert(invalidEmailData.errors.some(e => e.field === 'email'), 'Validation error flags invalid email field');
    assert(invalidEmailData.errors.some(e => e.field === 'password'), 'Validation error flags short password field');

    // Test login with missing password
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' })
    });
    assert(badLoginRes.status === 400, 'POST /auth/login with missing password returns HTTP 400');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 4: Verify /me route is removed & /api prefix is removed
    // -----------------------------------------------------------------
    console.log('[4/4] Verifying /me route is strictly removed and routes use /auth...');
    const meRes = await fetch(`${baseUrl}/auth/me`);
    assert(meRes.status === 404, 'GET /auth/me returns 404 (strictly removed as requested)');

    const apiMeRes = await fetch(`${baseUrl}/api/auth/me`);
    assert(apiMeRes.status === 404, 'GET /api/auth/me returns 404 (/api prefix removed as requested)');

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' });
    assert(logoutRes.status === 200, 'POST /auth/logout returns HTTP 200 OK');
    const logoutData = await logoutRes.json();
    assert(logoutData.message === 'Logged out successfully', 'POST /auth/logout returns success message');
    console.log('');

    console.log('====================================================');
    console.log(`  ALL ${passed}/${total} DAY 3 & DAY 4 TESTS PASSED!`);
    console.log('  Aligned strictly with package.json dependencies.');
    console.log('====================================================');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    testServer.close();
    process.exit(0);
  }
};

runTests();
