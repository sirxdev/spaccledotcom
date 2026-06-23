#!/usr/bin/env node
/**
 * Step 3 E2E validation — exercises the full order lifecycle via SpaccleDB
 * (same code path as the browser app). Run: node scripts/e2e-validation.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import PouchDB from 'pouchdb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spaccle-e2e-'));

const results = [];

function pass(id, msg) {
  results.push({ id, status: 'PASS', msg });
  console.log(`  ✓ [${id}] ${msg}`);
}

function fail(id, msg) {
  results.push({ id, status: 'FAIL', msg });
  console.error(`  ✗ [${id}] ${msg}`);
}

function assert(id, condition, msg) {
  if (condition) pass(id, msg);
  else fail(id, msg);
  return condition;
}

function hasEvent(order, status, metaCheck) {
  const events = order.events || [];
  return events.some(e => {
    if (e.status !== status) return false;
    if (metaCheck && !metaCheck(e)) return false;
    return true;
  });
}

function loadSpaccleDB() {
  const store = {};
  const localStorage = {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  };

  function PouchFactory(name) {
    return new PouchDB(path.join(tmpDir, name));
  }
  PouchFactory.plugin = (...args) => PouchDB.plugin(...args);
  PouchFactory.defaults = (...args) => PouchDB.defaults(...args);

  const win = {
    addEventListener() {},
    removeEventListener() {},
  };

  const sandbox = {
    PouchDB: PouchFactory,
    localStorage,
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    console,
    navigator: { onLine: true },
    window: win,
    setTimeout,
    clearTimeout,
  };

  const code = fs.readFileSync(path.join(ROOT, 'www/js/db.js'), 'utf8') + '\nthis.SpaccleDB = SpaccleDB;';
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { SpaccleDB: sandbox.SpaccleDB, localStorage };
}

async function run() {
  console.log('\n=== Spaccle Step 3 E2E Validation ===\n');
  console.log(`Temp DB: ${tmpDir}\n`);

  const { SpaccleDB } = loadSpaccleDB();

  // Seed users (mirrors app.js boot)
  await SpaccleDB.ensureAdminUser({
    email: 'admin@spaccle.com',
    password: 'Spaccle@Admin2025!',
    name: 'Spaccle Admin',
  });
  await SpaccleDB.ensureRiderUser({
    email: 'rider@spaccle.com',
    password: 'Spaccle@Rider2025!',
    name: 'Quick Rider',
    phone: '+234 800 123 4567',
  });

  // 1 — Customer creates order
  const customer = await SpaccleDB.createUser({
    name: 'Test Customer',
    email: 'customer-e2e@test.com',
    phone: '+234 800 000 0001',
    password: 'TestPass123!',
    recoveryQuestion: 'What was the name of your first pet?',
    recoveryAnswer: 'fluffy',
    role: 'customer',
  });

  const order = await SpaccleDB.createOrder({
    userId: customer._id,
    service: 'wash-fold',
    billingMode: 'subscription',
    itemsCount: 5,
    pickupDay: '2026-06-20',
    pickupTime: '10:00',
    address: '12 Test Street, Lagos',
    notes: 'E2E test order',
  });

  // Order is auto-assigned during creation; status may be 'assigned' if rider available
  assert('1', order.status === 'assigned', `Order created and auto-assigned (got ${order.status})`);
  assert('1b', hasEvent(order, 'scheduled'), 'events contains scheduled entry');

  // 2 — Order auto-assigned during creation (no admin confirm needed)
  let updated = await SpaccleDB.getOrder(order._id);
  const riders = await SpaccleDB.listAllRiders();
  const rider = riders.find(r => r.email === 'rider@spaccle.com');

  assert('2', updated.status === 'assigned', `Order auto-assigned → assigned (got ${updated.status})`);
  assert('2b', !!updated.riderId, 'order doc has riderId');
  assert('2c', !!updated.assignedAt, 'order doc has assignedAt');
  assert('2d', hasEvent(updated, 'assigned'), 'events contains assigned entry');

  const notifs = await SpaccleDB.listAllNotifications();
  assert('2e', notifs.some(n => n.riderId === rider._id && n.title === 'New Order Assigned'), 'rider assignment notification created');

  // 4 — Rider picks up
  updated = await SpaccleDB.updateOrderStatus(order._id, 'picked_up');
  assert('4', updated.status === 'picked_up', `Rider pickup → picked_up (got ${updated.status})`);
  assert('4b', hasEvent(updated, 'picked_up'), 'events contains picked_up entry');

  // Verify rider sees the order
  const riderOrders = (await SpaccleDB.getRiderOrders()).filter(
    o => o.riderId === rider._id || o.assignedDriver === rider.name
  );
  assert('4c', riderOrders.some(o => o._id === order._id), 'assigned order visible in rider order list');

  // 5 — Admin facility steps
  for (const status of ['processing', 'cleaning', 'ready']) {
    updated = await SpaccleDB.setOrderStatus(order._id, status);
    assert(`5-${status}`, updated.status === status && hasEvent(updated, status), `Admin → ${status} with event`);
  }

  // 6 — Rider delivery
  updated = await SpaccleDB.updateOrderStatus(order._id, 'in_transit');
  assert('6a', updated.status === 'in_transit', `Rider start delivery → in_transit (got ${updated.status})`);

  updated = await SpaccleDB.updateOrderStatus(order._id, 'delivered', { deliveryNote: 'Left with security' });
  assert('6b', updated.status === 'delivered', `Rider delivered → delivered (got ${updated.status})`);
  assert('6c', hasEvent(updated, 'delivered', e => e.deliveryNote === 'Left with security'), 'delivered event has deliveryNote');

  // 7 — Admin completes
  updated = await SpaccleDB.setOrderStatus(order._id, 'completed');
  assert('7', updated.status === 'completed', `Admin complete → completed (got ${updated.status})`);
  assert('7b', hasEvent(updated, 'completed'), 'events contains completed entry');

  // 8 — Customer view (list orders + active check)
  const customerOrders = await SpaccleDB.listOrders(customer._id);
  const finalOrder = customerOrders.find(o => o._id === order._id);
  assert('8', !!finalOrder && finalOrder.status === 'completed', 'customer listOrders shows completed order');

  // Post-scenario: chronological events
  const events = finalOrder.events || [];
  const chronological = events.every((e, i) => i === 0 || e.at >= events[i - 1].at);
  assert('post-events', events.length >= 9, `events array has ${events.length} entries (expected ≥9)`);
  assert('post-chrono', chronological, 'events are chronologically ordered');

  const expectedFlow = ['scheduled', 'assigned', 'picked_up', 'processing', 'cleaning', 'ready', 'in_transit', 'delivered', 'completed'];
  const eventStatuses = events.map(e => e.status);
  const flowOk = expectedFlow.every(s => eventStatuses.includes(s));
  assert('post-flow', flowOk, `events cover full lifecycle (${eventStatuses.join(' → ')})`);

  // Admin login smoke
  const adminSession = await SpaccleDB.loginUser({ email: 'admin@spaccle.com', password: 'Spaccle@Admin2025!' });
  assert('admin-login', adminSession.role === 'admin', 'admin login returns role admin');

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('E2E validation crashed:', err);
  process.exit(1);
});
