/* ── Spaccle DB ──────────────────────────────────────────────────── *
 * PouchDB wrapper — local-first, ready for CouchDB sync later.
 * Handles user storage, session management, and password recovery.
 * ──────────────────────────────────────────────────────────────── */

const SpaccleDB = (() => {
  const db = new PouchDB('spaccle');
  const SESSION_KEY = 'spaccle_session';

  /* ── Crypto helpers ─────────────────────────────────────────── */
  async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + password);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  /* ── Recovery answer normalization ──────────────────────────── *
   * Strips case, punctuation, extra spaces, and leading articles
   * so "St. Louis" = "st louis" = "St Louis" = "saint louis" ≈ pass.
   * ──────────────────────────────────────────────────────────── */
  function normalizeAnswer(answer) {
    return answer
      .toLowerCase()
      .trim()
      .replace(/[.,\-'"`!?;:()]/g, '')   // strip punctuation
      .replace(/\s+/g, ' ')              // collapse whitespace
      .replace(/^(the |a |an )/, '');    // drop leading articles
  }

  /* ── Levenshtein distance ────────────────────────────────────── *
   * Used for fuzzy answer comparison to absorb single-char typos.
   * ──────────────────────────────────────────────────────────── */
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  /* Allow edit distance proportional to answer length:
   *  ≤ 4 chars  → must be exact
   *  5–8 chars  → 1 typo ok
   *  9–14 chars → 2 typos ok
   *  15+ chars  → 3 typos ok                               */
  function answerMatches(stored, entered) {
    const a = normalizeAnswer(stored);
    const b = normalizeAnswer(entered);
    if (a === b) return true;
    const len = Math.max(a.length, b.length);
    const threshold = len <= 4 ? 0 : len <= 8 ? 1 : len <= 14 ? 2 : 3;
    return levenshtein(a, b) <= threshold;
  }

  /* ── User operations ────────────────────────────────────────── */
  async function createUser({ name, email, phone, password, recoveryQuestion, recoveryAnswer, role }) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const userId = generateId();
    const now = new Date().toISOString();

    const userDoc = {
      _id: userId,
      type: 'user',
      role: role || 'customer',
      name: name.trim(),
      email: emailLower,
      phone: (phone || '').trim(),
      passwordHash,
      salt,
      recoveryQuestion,
      recoveryAnswerNorm: normalizeAnswer(recoveryAnswer || ''),
      createdAt: now,
      updatedAt: now,
    };

    const indexDoc = {
      _id: existingId,
      type: 'user_index',
      userId,
      email: emailLower,
    };

    try {
      await db.put(indexDoc);
    } catch (e) {
      if (e.status === 409) throw new Error('EMAIL_TAKEN');
      throw e;
    }
    try {
      await db.put(userDoc);
    } catch (e) {
      await db.remove(indexDoc).catch(() => {});
      throw e;
    }
    return { _id: userId, name: userDoc.name, email: emailLower };
  }

  async function deleteUser(userId) {
    const doc = await db.get(userId);
    const emailNorm = (doc.email || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    const indexId = 'user_email_' + emailNorm;
    try {
      const indexDoc = await db.get(indexId);
      await db.bulkDocs([{ ...doc, _deleted: true }, { ...indexDoc, _deleted: true }]);
    } catch {
      await db.put({ ...doc, _deleted: true });
    }
  }

  async function loginUser({ email, password }) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');

    let indexDoc;
    try {
      indexDoc = await db.get(existingId);
    } catch {
      throw new Error('INVALID_CREDENTIALS');
    }

    const userDoc = await db.get(indexDoc.userId);
    const hash = await hashPassword(password, userDoc.salt);

    if (hash !== userDoc.passwordHash) throw new Error('INVALID_CREDENTIALS');

    const session = {
      userId: userDoc._id,
      name: userDoc.name,
      email: userDoc.email,
      role: userDoc.role || 'customer',
      loginAt: new Date().toISOString(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

async function ensureAdminUser({ email, password, name }) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');
    try {
      const idx = await db.get(existingId);
      const userDoc = await db.get(idx.userId);
      if (userDoc.role !== 'admin') {
        await db.put({ ...userDoc, role: 'admin', updatedAt: new Date().toISOString() });
      }
    } catch (e) {
      if (e.status !== 404) return;
      try {
        await createUser({ name: name || 'Admin', email: emailLower, phone: '', password, recoveryQuestion: '', recoveryAnswer: '', role: 'admin' });
      } catch {}
    }
  }

  async function ensureRiderUser({ email, password, name, phone }) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');
    try {
      const idx = await db.get(existingId);
      const userDoc = await db.get(idx.userId);
      if (userDoc.role !== 'rider') {
        await db.put({ ...userDoc, role: 'rider', updatedAt: new Date().toISOString() });
      }
    } catch (e) {
      if (e.status !== 404) return;
      try {
        await createUser({ name: name || 'Rider', email: emailLower, phone: phone || '', password, recoveryQuestion: '', recoveryAnswer: '', role: 'rider' });
      } catch {}
    }
  }

  async function ensureStaffUser({ email, password, name }) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');
    try {
      const idx = await db.get(existingId);
      const userDoc = await db.get(idx.userId);
      if (userDoc.role !== 'staff') {
        await db.put({ ...userDoc, role: 'staff', updatedAt: new Date().toISOString() });
      }
    } catch (e) {
      if (e.status !== 404) return;
      try {
        await createUser({ name: name || 'Staff', email: emailLower, phone: '', password, recoveryQuestion: '', recoveryAnswer: '', role: 'staff' });
      } catch {}
    }
  }

  /* ── Recovery flow ──────────────────────────────────────────── */
  async function getRecoveryQuestion(email) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');
    try {
      const idx = await db.get(existingId);
      const user = await db.get(idx.userId);
      return user.recoveryQuestion || null;
    } catch {
      // Return null either way — don't leak whether email exists
      return null;
    }
  }

  async function verifyRecoveryAnswer(email, answer) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');
    try {
      const idx = await db.get(existingId);
      const user = await db.get(idx.userId);
      if (!user.recoveryAnswerNorm) return false;
      return answerMatches(user.recoveryAnswerNorm, answer);
    } catch {
      return false;
    }
  }

  async function resetPassword(email, newPassword) {
    const emailLower = email.toLowerCase().trim();
    const existingId = 'user_email_' + emailLower.replace(/[^a-z0-9]/g, '_');
    const idx = await db.get(existingId);
    const user = await db.get(idx.userId);
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    await db.put({
      ...user,
      passwordHash: newHash,
      salt: newSalt,
      updatedAt: new Date().toISOString(),
    });
  }

  /* ── Session helpers ────────────────────────────────────────── */
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* ── App preferences ────────────────────────────────────────── */
  async function setPreference(key, value) {
    const docId = 'pref_' + key;
    try {
      const existing = await db.get(docId);
      await db.put({ ...existing, value, updatedAt: new Date().toISOString() });
    } catch (e) {
      if (e.status === 404) {
        await db.put({ _id: docId, type: 'preference', value, updatedAt: new Date().toISOString() });
      } else throw e;
    }
  }

  async function getPreference(key, defaultValue = null) {
    try {
      const doc = await db.get('pref_' + key);
      return doc.value;
    } catch {
      return defaultValue;
    }
  }

  function generateOrderId(userId) {
    return `order_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function generateTicketId(userId) {
    return `ticket_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function formatOrderPublicId(orderId) {
    const parts = String(orderId).split('_');
    const stamp = parts[2] || '';
    const short = stamp ? stamp.slice(-6) : Math.random().toString(36).slice(2, 8).toUpperCase();
    return `SP-${short.toUpperCase()}`;
  }

  async function createOrder({ userId, service, billingMode = 'payg', planId = null, itemsCount = null, itemsBreakdown = null, pickupDay, pickupTime, address, deliveryAddress, notes, paystackRef = null, amountPaid = null, exceedsItems = false, extraItemsCount = null, recurring = false }) {
    if (!userId) throw new Error('MISSING_USER');
    const nowIso = new Date().toISOString();
    const _id = generateOrderId(userId);
    const publicId = formatOrderPublicId(_id);

    const [zones] = await Promise.all([listZones()]);
    const zoneId = matchZone(address, zones);

    const doc = {
      _id,
      type: 'order',
      userId,
      publicId,
      service,
      planId,
      billingMode,
      itemsCount,
      itemsBreakdown,
      amountPaid,
      paystackRef,
      currency: 'NGN',
      city: 'Lagos',
      zoneId,
      pickupDay,
      pickupTime,
      address,
      deliveryAddress,
      notes,
      exceedsItems,
      extraItemsCount,
      recurring,
      status: 'scheduled',
      events: [{ status: 'scheduled', at: nowIso }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.put(doc);
    const rider = await autoAssignRider(_id).catch(() => null);
    return rider ? db.get(_id) : doc;
  }

  async function getOrder(orderId) {
    return db.get(orderId);
  }

  async function listOrders(userId) {
    if (!userId) return [];
    const prefix = `order_${userId}_`;
    const res = await db.allDocs({ include_docs: true, startkey: prefix + '\uffff', endkey: prefix, descending: true });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  async function listAllOrders() {
    const res = await db.allDocs({ include_docs: true, startkey: 'order_\uffff', endkey: 'order_', descending: true });
    return res.rows.map(r => r.doc).filter(d => d && d.type === 'order');
  }

  async function listFacilityOrders() {
    const all = await listAllOrders();
    return all.filter(o => o.status === 'picked_up' || o.status === 'processing');
  }

async function listAllUsers() {
    const res = await db.allDocs({ include_docs: true });
    return res.rows.map(r => r.doc).filter(d => d && d.type === 'user');
  }

  async function listAllRiders() {
    const users = await listAllUsers();
    return users.filter(u => u.role === 'rider');
  }

  async function listAllStaff() {
    const users = await listAllUsers();
    return users.filter(u => u.role === 'staff');
  }

  async function listAllSubscriptions() {
    const res = await db.allDocs({ include_docs: true, startkey: 'subscription_', endkey: 'subscription_\uffff' });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  async function getOrdersByUser(userId) {
    if (!userId) return [];
    const prefix = `order_${userId}_`;
    const res = await db.allDocs({ include_docs: true, startkey: prefix + '\uffff', endkey: prefix, descending: true });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  async function getRiderOrders() {
    const res = await db.allDocs({ include_docs: true, startkey: 'order_\uffff', endkey: 'order_', descending: true });
    const orders = res.rows.map(r => r.doc).filter(d => d && d.type === 'order');
    return orders;
  }

  async function updateOrderStatus(orderId, status, meta = {}) {
    const doc = await db.get(orderId);
    if (['completed', 'cancelled'].includes(doc.status)) return doc;
    const nowIso = new Date().toISOString();
    const events = Array.isArray(doc.events) ? doc.events.slice() : [];
    events.push({ status, at: nowIso, ...meta });
    const base = { events, updatedAt: nowIso, ...meta };
    const updated = { ...doc, status, ...base };
    const result = await db.put(updated);

    if (status === 'delivered') {
      events.push({ status: 'completed', at: nowIso });
      const completed = { ...updated, _rev: result.rev, status: 'completed', events, updatedAt: nowIso };
      const final = await db.put(completed);
      return { ...completed, _rev: final.rev };
    }

    if (status === 'ready') {
      try { await autoAssignDeliveryRider(orderId); } catch (e) { console.warn('auto-assign delivery rider', e); }
    }

    return { ...updated, _rev: result.rev };
  }

  async function addTip(orderId, amount) {
    const doc = await db.get(orderId);
    const nowIso = new Date().toISOString();
    const updated = { ...doc, tip: amount, tipAt: nowIso, updatedAt: nowIso };
    await db.put(updated);
    return updated;
  }

  async function assignRider(orderId, riderId, role = 'both') {
    const nowIso = new Date().toISOString();
    const updated = await updateOrderStatus(orderId, 'assigned', { riderId, assignedAt: nowIso });
    if (updated.riderId !== riderId) {
      const patched = {
        ...updated,
        riderId: role !== 'delivery' ? riderId : updated.riderId,
        pickupRiderId: role !== 'delivery' ? riderId : updated.pickupRiderId,
        deliveryRiderId: role !== 'pickup' ? riderId : updated.deliveryRiderId,
        assignedAt: nowIso,
        updatedAt: nowIso,
      };
      await db.put(patched).catch(() => {});
      return patched;
    }
    return updated;
  }

  async function listAllSupportTickets() {
    const res = await db.allDocs({ include_docs: true, startkey: 'ticket_\uffff', endkey: 'ticket_', descending: true });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  async function setTicketStatus(ticketId, status) {
    const doc = await db.get(ticketId);
    await db.put({ ...doc, status, updatedAt: new Date().toISOString() });
  }

  function isOrderActive(order) {
    return order && !['delivered', 'completed', 'cancelled'].includes(order.status);
  }

  async function getActiveOrder(userId) {
    const orders = await listOrders(userId);
    return orders.find(isOrderActive) || null;
  }

  function nextStatus(current) {
    const flow = ['scheduled', 'assigned', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered', 'completed'];
    const idx = flow.indexOf(current);
    if (idx === -1) return current;
    return flow[Math.min(idx + 1, flow.length - 1)];
  }

  async function setOrderStatus(orderId, status, meta = {}) {
    const doc = await db.get(orderId);
    if (['completed', 'cancelled'].includes(doc.status)) return doc;
    const nowIso = new Date().toISOString();
    const events = Array.isArray(doc.events) ? doc.events.slice() : [];
    events.push({ status, at: nowIso, ...meta });
    const base = { events, updatedAt: nowIso, ...meta };
    const updated = { ...doc, status, ...base };
    const result = await db.put(updated);

    if (status === 'delivered') {
      events.push({ status: 'completed', at: nowIso });
      const completed = { ...updated, _rev: result.rev, status: 'completed', events, updatedAt: nowIso };
      const final = await db.put(completed);
      return { ...completed, _rev: final.rev };
    }

    if (status === 'ready') {
      try { await autoAssignDeliveryRider(orderId); } catch (e) { console.warn('auto-assign delivery rider', e); }
    }

    return { ...updated, _rev: result.rev };
  }

  async function advanceOrder(orderId) {
    const doc = await db.get(orderId);
    if (['completed', 'cancelled'].includes(doc.status)) {
      throw new Error('ORDER_IS_TERMINAL');
    }
    const status = nextStatus(doc.status);
    if (status === doc.status) return doc;
    return setOrderStatus(orderId, status);
  }

  async function createSupportTicket({ userId, subject, message, orderId = null }) {
    if (!userId) throw new Error('MISSING_USER');
    const nowIso = new Date().toISOString();
    const _id = generateTicketId(userId);
    const doc = {
      _id,
      type: 'support_ticket',
      userId,
      subject,
      message,
      orderId,
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await db.put(doc);
    return doc;
  }

  async function getUserProfile(userId) {
    if (!userId) return null;
    try { return await db.get(userId); } catch { return null; }
  }

  async function updateUserProfile(userId, { name, phone }) {
    if (!userId) throw new Error('MISSING_USER');
    const userDoc = await db.get(userId);
    const updated = { ...userDoc, updatedAt: new Date().toISOString() };
    if (name !== undefined && String(name).trim()) updated.name = String(name).trim();
    if (phone !== undefined) updated.phone = String(phone).trim();
    await db.put(updated);
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session.userId === userId) {
          session.name = updated.name;
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
      }
    } catch {}
    return updated;
  }

  async function getAddresses(userId) {
    if (!userId) return [];
    return getPreference(`addresses_${userId}`, []);
  }

  async function saveAddress(userId, address) {
    if (!userId) throw new Error('MISSING_USER');
    const list = await getAddresses(userId);
    const id = address.id || `addr_${Date.now()}`;
    const entry = { ...address, id };
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      if (entry.isDefault) list.forEach(a => { a.isDefault = false; });
      list.push(entry);
    }
    await setPreference(`addresses_${userId}`, list);
    return list;
  }

  async function deleteAddress(userId, addressId) {
    if (!userId) throw new Error('MISSING_USER');
    const list = (await getAddresses(userId)).filter(a => a.id !== addressId);
    await setPreference(`addresses_${userId}`, list);
    return list;
  }

  function generatePlanId() {
    return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async function upsertPlan(plan) {
    const nowIso = new Date().toISOString();
    const base = {
      type: 'plan',
      currency: 'NGN',
      city: 'Lagos',
      updatedAt: nowIso,
    };

    if (plan._id) {
      try {
        const existing = await db.get(plan._id);
        const merged = { ...existing, ...base, ...plan, updatedAt: nowIso };
        await db.put(merged);
        return merged;
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }

    const _id = plan._id || generatePlanId();
    const doc = { _id, ...base, ...plan, createdAt: nowIso, updatedAt: nowIso };
    await db.put(doc);
    return doc;
  }

  async function listPlans({ includeInactive = false } = {}) {
    const res = await db.allDocs({ include_docs: true, startkey: 'plan_', endkey: 'plan_\uffff' });
    const docs = res.rows.map(r => r.doc).filter(Boolean);
    const lagos = docs.filter(d => d.type === 'plan' && d.currency === 'NGN' && d.city === 'Lagos');
    return includeInactive ? lagos : lagos.filter(p => p.active !== false);
  }

  async function ensureDefaultPlans() {
    const alreadySeeded = await getPreference('plans_seeded_v3', false);
    if (alreadySeeded) return;

    const fixed = [
      {
        _id: 'plan_basic',
        kind: 'subscription',
        name: 'Basic',
        badge: 'Most Popular',
        description: 'Up to 20 items • 1–2 pickups/month • 3–5 days turnaround',
        price: 18000,
        waitlistPrice: 15300,
        billingPeriod: 'month',
        includedItems: 20,
        pickupsPerMonth: 2,
        turnaroundText: '3–5 Days',
        savingsText: '20–25% vs PAYG',
        rolloverItems: 5,
        freeExpressPerMonth: 0,
        active: true,
        sort: 10,
      },
      {
        _id: 'plan_standard',
        kind: 'subscription',
        name: 'Standard',
        badge: 'Popular',
        description: 'Up to 40 items • 2 pickups/month • 48–72 hours turnaround',
        price: 32000,
        waitlistPrice: 27200,
        billingPeriod: 'month',
        includedItems: 40,
        pickupsPerMonth: 2,
        turnaroundText: '48–72 Hours',
        savingsText: '20–25%',
        rolloverItems: 10,
        freeExpressPerMonth: 1,
        active: true,
        sort: 20,
      },
      {
        _id: 'plan_family',
        kind: 'subscription',
        name: 'Family',
        badge: null,
        description: 'Up to 80 items • Unlimited pickups • Priority turnaround',
        price: 63000,
        waitlistPrice: 53550,
        billingPeriod: 'month',
        includedItems: 80,
        pickupsPerMonth: null,
        turnaroundText: 'Priority',
        savingsText: '35–40%',
        rolloverItems: 20,
        freeExpressPerMonth: 2,
        active: true,
        sort: 30,
      },
    ];

    for (const plan of fixed) {
      try {
        const existing = await db.get(plan._id);
        // Plan exists from old seed — patch in new fields without overwriting admin edits
        const patched = { ...existing };
        if (!patched.badge && plan.badge) patched.badge = plan.badge;
        if (!patched.turnaroundText) patched.turnaroundText = plan.turnaroundText;
        if (!patched.savingsText) patched.savingsText = plan.savingsText;
        patched.updatedAt = new Date().toISOString();
        await db.put(patched);
      } catch {
        // Doesn't exist, create it fresh
        await upsertPlan(plan);
      }
    }

    await setPreference('plans_seeded_v3', true);
  }

  async function ensureDefaultServices() {
    const existing = await getPreference('services_config', null);
    const defaults = {
      'regular-laundry':    { name: 'Regular Laundry',          pricePerItem: null, unit: 'item', display: 'From ₦900' },
      'specialty-dry-clean':{ name: 'Specialty Dry Cleaning',    pricePerItem: null, unit: 'item', display: 'From ₦1,500' },
      'iron-only':          { name: 'Iron Only',                pricePerItem: 600,  unit: 'item', display: '₦600/item' },
      'specialty-items':    { name: 'Specialty Items',          pricePerItem: null, unit: 'item', display: 'Varies' },
    };
    const oldKeys = ['wash-fold', 'dry-clean', 'iron-press', 'duvet', 'alteration', 'shoe-clean'];
    if (existing) {
      const hasOld = Object.keys(existing).some(k => oldKeys.includes(k));
      if (hasOld) {
        await setPreference('services_config', defaults);
        return defaults;
      }
      return existing;
    }
    await setPreference('services_config', defaults);
    return defaults;
  }

  async function getServicesConfig() {
    return getPreference('services_config', null);
  }

  async function saveServicesConfig(config) {
    return setPreference('services_config', config);
  }

  /* ── Item pricing guide (pricing groups) ──────────────────────── */
  async function ensureDefaultItemPricing() {
    const existing = await getPreference('item_pricing', null);
    const defaults = [
      { key: 'everyday-clothing', name: 'Everyday Clothing',      price: 900,  unit: 'item' },
      { key: 'dresses-gowns',     name: 'Dresses & Gowns',        price: 2500, unit: 'item' },
      { key: 'bedding',           name: 'Bedding',                price: 1500, unit: 'item' },
      { key: 'shoes',             name: 'Shoes',                  price: 2000, unit: 'pair' },
      { key: 'bags',              name: 'Bags',                   price: 3500, unit: 'item' },
      { key: 'curtains',          name: 'Curtains',               price: 3000, unit: 'panel' },
      { key: 'rugs',              name: 'Rugs',                   price: 5000, unit: 'item' },
      { key: 'other-specialty',   name: 'Other Specialty Items',  price: 2000, unit: 'item' },
    ];
    const oldKeys = ['suit', 'bedsheet', 'towel', 'ladies-dress', 'extra-item', 'express-24hr', 'stain-remover'];
    if (existing) {
      const hasOld = existing.some(i => oldKeys.includes(i.key));
      if (hasOld) {
        await setPreference('item_pricing', defaults);
        return defaults;
      }
      return existing;
    }
    await setPreference('item_pricing', defaults);
    return defaults;
  }
  async function getItemPricing()         { return getPreference('item_pricing', null); }
  async function saveItemPricing(items)   { return setPreference('item_pricing', items); }

  /* ── Price calculation helper ────────────────────────────────── */
  async function calculateEstimatedPrice({ service, itemsBreakdown }) {
    const pricing = await ensureDefaultItemPricing();
    const priceMap = {};
    pricing.forEach(p => { priceMap[p.key] = p.price; });
    let total = 0;
    if (itemsBreakdown && typeof itemsBreakdown === 'object') {
      Object.entries(itemsBreakdown).forEach(([key, qty]) => {
        const unitPrice = priceMap[key] || 0;
        total += (Number(qty) || 0) * unitPrice;
      });
    }
    return total;
  }

  /* ── Recurring pickup ───────────────────────────────────────────── */
  async function setRecurringPickup(userId, schedule) {
    if (!userId) throw new Error('MISSING_USER');
    const docId = subscriptionDocId(userId);
    let sub;
    try {
      sub = await db.get(docId);
    } catch (e) {
      if (e.status === 404) {
        sub = { _id: docId, type: 'subscription', userId };
      } else {
        throw e;
      }
    }
    await db.put({ ...sub, recurringPickup: schedule, updatedAt: new Date().toISOString() });
  }

  /* ── Order rating ───────────────────────────────────────────────── */
  async function rateOrder(orderId, stars, note = '') {
    const doc = await db.get(orderId);
    await db.put({ ...doc, rating: stars, ratingNote: note, ratedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  /* ── Chat messages ──────────────────────────────────────────────── */
  function chatMsgId(userId) {
    return `chat_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  async function createChatMessage({ userId, text, fromAdmin = false }) {
    if (!userId || !text) throw new Error('INVALID_CHAT_MSG');
    const nowIso = new Date().toISOString();
    const doc = {
      _id: chatMsgId(userId), type: 'chat_message',
      userId, text, fromAdmin, read: false,
      createdAt: nowIso, updatedAt: nowIso,
    };
    await db.put(doc);
    return doc;
  }

  async function getChatHistory(userId) {
    if (!userId) return [];
    const prefix = `chat_${userId}_`;
    const res = await db.allDocs({ include_docs: true, startkey: prefix, endkey: prefix + '\uffff' });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  async function listAllChatMessages() {
    const res = await db.allDocs({ include_docs: true, startkey: 'chat_\uffff', endkey: 'chat_', descending: true });
    return res.rows.map(r => r.doc).filter(d => d && d.type === 'chat_message');
  }

  async function markChatRead(userId) {
    const msgs = await getChatHistory(userId);
    const unread = msgs.filter(m => !m.read && m.fromAdmin);
    for (const m of unread) {
      await db.put({ ...m, read: true, updatedAt: new Date().toISOString() }).catch(() => {});
    }
  }

  /* ── Legal content ──────────────────────────────────────────────── */
  async function getLegalContent(type) {
    const defaults = {
      terms: '<h2>Terms of Service</h2><p>By using Spaccle, you agree to our service terms. We will pick up, clean, and return your laundry as agreed. Pricing is as displayed and subject to change with notice.</p>',
      privacy: '<h2>Privacy Policy</h2><p>We collect only the data needed to provide our service (name, email, address). Your data is never sold to third parties. You may request deletion at any time by contacting support.</p>',
    };
    return getPreference(`legal_${type}`, defaults[type] || '');
  }
  async function saveLegalContent(type, html) { return setPreference(`legal_${type}`, html); }

  /* ── Subscription cancellation & renewal ───────────────────────── */
  async function cancelSubscription(userId) {
    if (!userId) throw new Error('MISSING_USER');
    const docId = subscriptionDocId(userId);
    const sub = await db.get(docId);
    await db.put({ ...sub, status: 'cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  async function checkSubscriptionRenewal(userId) {
    if (!userId) return null;
    const sub = await getSubscription(userId);
    if (!sub) return null;
    if (sub.status !== 'active') return null;
    const renewAt = new Date(sub.renewAt);
    const now = new Date();
    if (renewAt > now) return null;
    return sub; // expired — caller should prompt renewal
  }

  /* ── Password change ────────────────────────────────────────────── */
  async function changePassword(userId, currentPassword, newPassword) {
    if (!userId) throw new Error('MISSING_USER');
    const doc = await db.get(userId);
    const currentHash = await hashPassword(currentPassword, doc.salt);
    if (currentHash !== doc.passwordHash) throw new Error('WRONG_PASSWORD');
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    await db.put({ ...doc, passwordHash: newHash, salt: newSalt, updatedAt: new Date().toISOString() });
  }

  /* ── Promo / discount codes ─────────────────────────────────────── */
  async function createPromoCode({ code, type = 'flat', value, maxUses = null, expiresAt = null }) {
    const id = `promo_${code.trim().toUpperCase()}`;
    const nowIso = new Date().toISOString();
    try { await db.get(id); throw new Error('PROMO_EXISTS'); } catch (e) { if (e.message === 'PROMO_EXISTS') throw e; }
    const doc = { _id: id, type: 'promo_code', code: code.trim().toUpperCase(), discountType: type, value: Number(value), maxUses, usedCount: 0, expiresAt, active: true, createdAt: nowIso, updatedAt: nowIso };
    await db.put(doc);
    return doc;
  }

  async function validatePromoCode(code) {
    if (!code) return null;
    try {
      const doc = await db.get(`promo_${code.trim().toUpperCase()}`);
      if (!doc.active) return null;
      if (doc.maxUses != null && doc.usedCount >= doc.maxUses) return null;
      if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
      return doc;
    } catch { return null; }
  }

  async function redeemPromoCode(code) {
    const doc = await validatePromoCode(code);
    if (!doc) throw new Error('INVALID_PROMO');
    await db.put({ ...doc, usedCount: (doc.usedCount || 0) + 1, updatedAt: new Date().toISOString() });
    return doc;
  }

  async function listAllPromoCodes() {
    const res = await db.allDocs({ include_docs: true, startkey: 'promo_', endkey: 'promo_\uffff' });
    return res.rows.map(r => r.doc).filter(d => d && d.type === 'promo_code');
  }

  /* ── Driver/rider assignment ────────────────────────────────── */
  async function assignDriver(orderId, driverName) {
    const nowIso = new Date().toISOString();
    // Record driver assignment in the event history
    const updated = await updateOrderStatus(orderId, 'assigned', { assignedDriver: driverName || null, assignedAt: nowIso });
    if (updated.assignedDriver !== driverName) {
      const patched = { ...updated, assignedDriver: driverName || null, updatedAt: nowIso };
      await db.put(patched).catch(() => {});
      return patched;
    }
    return updated;
  }

  async function assignRiderToOrder(orderId, pickupRiderId = null, deliveryRiderId = null, riderName = null) {
    const doc = await db.get(orderId);
    const nowIso = new Date().toISOString();
    const hasPickup = !!pickupRiderId;
    const hasDelivery = !!deliveryRiderId;
    const newStatus = (hasPickup || hasDelivery || riderName) ? 'assigned' : doc.status;
    const updated = await updateOrderStatus(orderId, newStatus, {
      riderId: hasPickup ? pickupRiderId : doc.riderId,
      assignedDriver: riderName || null,
      assignedAt: nowIso,
    });

    const needsPatch = (
      (pickupRiderId && updated.pickupRiderId !== pickupRiderId) ||
      (deliveryRiderId && updated.deliveryRiderId !== deliveryRiderId) ||
      (riderName && updated.assignedDriver !== riderName)
    );
    if (needsPatch) {
      const patched = {
        ...updated,
        riderId: pickupRiderId || updated.riderId,
        pickupRiderId: pickupRiderId || updated.pickupRiderId,
        deliveryRiderId: deliveryRiderId || updated.deliveryRiderId,
        assignedDriver: riderName || null,
        updatedAt: nowIso,
      };
      await db.put(patched).catch(() => {});
    }

    if (pickupRiderId) {
      await createNotification({
        title: 'New Order Assigned',
        message: `You have been assigned pickup for order ${doc.publicId || orderId.slice(-6)}. Tap to view details.`,
        riderId: pickupRiderId
      });
    }
    if (deliveryRiderId) {
      await createNotification({
        title: 'Delivery Assigned',
        message: `You have been assigned delivery for order ${doc.publicId || orderId.slice(-6)}. Tap to view details.`,
        riderId: deliveryRiderId
      });
    }
  }

  async function unassignRider(orderId, role = 'both') {
    const doc = await db.get(orderId);
    const nowIso = new Date().toISOString();
    const events = Array.isArray(doc.events) ? doc.events.slice() : [];
    events.push({ status: 'scheduled', at: nowIso, note: 'Rider unassigned (' + role + ')' });
    const patch = {
      ...doc,
      events,
      updatedAt: nowIso,
    };
    if (role === 'pickup') {
      patch.pickupRiderId = null;
      if (doc.riderId === doc.pickupRiderId) patch.riderId = doc.deliveryRiderId || null;
    } else if (role === 'delivery') {
      patch.deliveryRiderId = null;
      if (doc.riderId === doc.deliveryRiderId) patch.riderId = doc.pickupRiderId || null;
    } else {
      patch.riderId = null;
      patch.pickupRiderId = null;
      patch.deliveryRiderId = null;
      patch.assignedDriver = null;
      patch.assignedAt = null;
      patch.status = 'scheduled';
    }
    await db.put(patch);
    return patch;
  }

  async function autoAssignRider(orderId) {
    const [riders, order, allOrders] = await Promise.all([
      listAllRiders(),
      db.get(orderId).catch(() => null),
      listAllOrders(),
    ]);
    if (!order) return null;
    const online = riders.filter(r => r.isAvailable !== false);
    if (!online.length) {
      await createNotification({
        title: 'No Riders Available',
        message: `Order ${order.publicId || orderId.slice(-6)} has no available riders.`,
        orderId,
      });
      return null;
    }

    const pendingCounts = {};
    allOrders.forEach(o => {
      if (o.riderId && !['delivered', 'completed', 'cancelled'].includes(o.status)) {
        pendingCounts[o.riderId] = (pendingCounts[o.riderId] || 0) + 1;
      }
    });

    const orderZoneId = order.zoneId;
    let candidates = online;
    if (orderZoneId) {
      const zoned = online.filter(r => r.zoneIds && r.zoneIds.includes(orderZoneId));
      if (zoned.length) candidates = zoned;
    }

    candidates.sort((a, b) => (pendingCounts[a._id] || 0) - (pendingCounts[b._id] || 0));

    const rider = candidates[0];
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const attempts = (order.assignmentAttempts || 0) + 1;

    await db.put({
      ...order,
      pendingRiderId: rider._id,
      pendingExpiresAt: expiresAt,
      assignmentAttempts: attempts,
      updatedAt: nowIso,
    });

    await createNotification({
      title: 'New Order Available',
      message: `Order ${order.publicId || order._id.slice(-6)} is available. Tap to accept.`,
      riderId: rider._id,
      orderId,
    });

    return rider;
  }

  async function acceptAssignment(orderId, riderId) {
    const order = await db.get(orderId);
    if (order.pendingRiderId !== riderId) throw new Error('NOT_PENDING_FOR_RIDER');
    if (order.pendingExpiresAt && new Date(order.pendingExpiresAt) < new Date()) throw new Error('ASSIGNMENT_EXPIRED');
    const nowIso = new Date().toISOString();
    const events = Array.isArray(order.events) ? order.events.slice() : [];
    events.push({ status: 'assigned', at: nowIso, riderId, assignedAt: nowIso });
    const updated = {
      ...order,
      status: 'assigned',
      riderId,
      pickupRiderId: riderId,
      assignedAt: nowIso,
      pendingRiderId: null,
      pendingExpiresAt: null,
      events,
      updatedAt: nowIso,
    };
    const result = await db.put(updated);
    await createNotification({
      title: 'New Order Assigned',
      message: `You have been assigned to order ${order.publicId || orderId.slice(-6)}. Tap to view details.`,
      riderId,
      orderId,
    });
    return { ...updated, _rev: result.rev };
  }

  async function declineAssignment(orderId, riderId) {
    const order = await db.get(orderId);
    if (order.pendingRiderId !== riderId) return order;
    const attempts = (order.assignmentAttempts || 0);
    const nowIso = new Date().toISOString();

    await db.put({
      ...order,
      pendingRiderId: null,
      pendingExpiresAt: null,
      updatedAt: nowIso,
    });

    if (attempts >= 3) {
      await createNotification({
        title: 'Assignment Failed',
        message: `Order ${order.publicId || orderId.slice(-6)} could not be assigned after ${attempts} attempts.`,
        orderId,
      });
      return order;
    }

    return tryNextCandidate(orderId, riderId);
  }

  async function tryNextCandidate(orderId, excludeRiderId) {
    const [riders, order] = await Promise.all([
      listAllRiders(),
      db.get(orderId),
    ]);
    const online = riders.filter(r => r.isAvailable !== false && r._id !== excludeRiderId);
    if (!online.length) {
      await createNotification({
        title: 'No Riders Available',
        message: `Order ${order.publicId || orderId.slice(-6)} has no available riders.`,
        orderId,
      });
      return null;
    }

    const orderZoneId = order.zoneId;
    let candidates = online;
    if (orderZoneId) {
      const zoned = online.filter(r => r.zoneIds && r.zoneIds.includes(orderZoneId));
      if (zoned.length) candidates = zoned;
    }

    const rider = candidates[0];
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const attempts = (order.assignmentAttempts || 0) + 1;

    await db.put({
      ...order,
      pendingRiderId: rider._id,
      pendingExpiresAt: expiresAt,
      assignmentAttempts: attempts,
      updatedAt: nowIso,
    });

    await createNotification({
      title: 'New Order Available',
      message: `Order ${order.publicId || order._id.slice(-6)} is available. Tap to accept.`,
      riderId: rider._id,
      orderId,
    });

    return rider;
  }

  /* ── Delivery rider assignment ──────────────────────────────── */

  async function autoAssignDeliveryRider(orderId) {
    const [riders, order, allOrders] = await Promise.all([
      listAllRiders(),
      db.get(orderId).catch(() => null),
      listAllOrders(),
    ]);
    if (!order) return null;
    if (order.deliveryRiderId) return null;
    const online = riders.filter(r => r.isAvailable !== false);
    if (!online.length) {
      await createNotification({
        title: 'No Riders Available',
        message: `Delivery for order ${order.publicId || orderId.slice(-6)} has no available riders.`,
        orderId,
      });
      return null;
    }

    const pendingCounts = {};
    allOrders.forEach(o => {
      if (o.deliveryRiderId && !['delivered', 'completed', 'cancelled'].includes(o.status)) {
        pendingCounts[o.deliveryRiderId] = (pendingCounts[o.deliveryRiderId] || 0) + 1;
      }
    });

    const orderZoneId = order.zoneId;
    let candidates = online;
    if (orderZoneId) {
      const zoned = online.filter(r => r.zoneIds && r.zoneIds.includes(orderZoneId));
      if (zoned.length) candidates = zoned;
    }

    candidates.sort((a, b) => (pendingCounts[a._id] || 0) - (pendingCounts[b._id] || 0));

    const rider = candidates[0];
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const attempts = (order.deliveryAssignmentAttempts || 0) + 1;

    await db.put({
      ...order,
      pendingDeliveryRiderId: rider._id,
      pendingDeliveryExpiresAt: expiresAt,
      deliveryAssignmentAttempts: attempts,
      updatedAt: nowIso,
    });

    await createNotification({
      title: 'Delivery Available',
      message: `Order ${order.publicId || order._id.slice(-6)} is ready for delivery. Tap to accept.`,
      riderId: rider._id,
      orderId,
    });

    return rider;
  }

  async function acceptDeliveryAssignment(orderId, riderId) {
    const order = await db.get(orderId);
    if (order.pendingDeliveryRiderId !== riderId) throw new Error('NOT_PENDING_FOR_RIDER');
    if (order.pendingDeliveryExpiresAt && new Date(order.pendingDeliveryExpiresAt) < new Date()) throw new Error('ASSIGNMENT_EXPIRED');
    const nowIso = new Date().toISOString();
    const events = Array.isArray(order.events) ? order.events.slice() : [];
    const updated = {
      ...order,
      deliveryRiderId: riderId,
      riderId: riderId,
      pendingDeliveryRiderId: null,
      pendingDeliveryExpiresAt: null,
      events,
      updatedAt: nowIso,
    };
    const result = await db.put(updated);
    await createNotification({
      title: 'Delivery Assigned',
      message: `You have been assigned delivery for order ${order.publicId || orderId.slice(-6)}. Tap to view details.`,
      riderId,
      orderId,
    });
    return { ...updated, _rev: result.rev };
  }

  async function declineDeliveryAssignment(orderId, riderId) {
    const order = await db.get(orderId);
    if (order.pendingDeliveryRiderId !== riderId) return order;
    const attempts = (order.deliveryAssignmentAttempts || 0);
    const nowIso = new Date().toISOString();

    await db.put({
      ...order,
      pendingDeliveryRiderId: null,
      pendingDeliveryExpiresAt: null,
      updatedAt: nowIso,
    });

    if (attempts >= 3) {
      await createNotification({
        title: 'Delivery Assignment Failed',
        message: `Delivery for order ${order.publicId || orderId.slice(-6)} could not be assigned after ${attempts} attempts.`,
        orderId,
      });
      return order;
    }

    return tryNextDeliveryCandidate(orderId, riderId);
  }

  async function tryNextDeliveryCandidate(orderId, excludeRiderId) {
    const [riders, order] = await Promise.all([
      listAllRiders(),
      db.get(orderId),
    ]);
    const online = riders.filter(r => r.isAvailable !== false && r._id !== excludeRiderId);
    if (!online.length) {
      await createNotification({
        title: 'No Riders Available',
        message: `Delivery for order ${order.publicId || orderId.slice(-6)} has no available riders.`,
        orderId,
      });
      return null;
    }

    const orderZoneId = order.zoneId;
    let candidates = online;
    if (orderZoneId) {
      const zoned = online.filter(r => r.zoneIds && r.zoneIds.includes(orderZoneId));
      if (zoned.length) candidates = zoned;
    }

    const rider = candidates[0];
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const attempts = (order.deliveryAssignmentAttempts || 0) + 1;

    await db.put({
      ...order,
      pendingDeliveryRiderId: rider._id,
      pendingDeliveryExpiresAt: expiresAt,
      deliveryAssignmentAttempts: attempts,
      updatedAt: nowIso,
    });

    await createNotification({
      title: 'Delivery Available',
      message: `Order ${order.publicId || order._id.slice(-6)} is ready for delivery. Tap to accept.`,
      riderId: rider._id,
      orderId,
    });

    return rider;
  }

  /* ── Broadcasts ─────────────────────────────────────────────────── */
  async function createBroadcast({ title, message, riderId = null }) {
    const id = `broadcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const doc = { _id: id, type: 'broadcast', title, message, riderId, createdAt: new Date().toISOString() };
    await db.put(doc);
    return doc;
  }

  async function createNotification({ title, message, riderId = null, orderId = null }) {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const doc = { _id: id, type: 'notification', title, message, riderId, orderId, read: false, createdAt: new Date().toISOString() };
    await db.put(doc);
    return doc;
  }

  async function listAllNotifications() {
    const res = await db.allDocs({ include_docs: true, startkey: 'notif_\uffff', endkey: 'notif_', descending: true });
    return res.rows.map(r => r.doc).filter(d => d && d.type === 'notification');
  }

  async function markNotificationRead(notifId) {
    try {
      const doc = await db.get(notifId);
      await db.put({ ...doc, read: true });
    } catch {}
  }

  async function listNewBroadcasts(sinceIso) {
    const res = await db.allDocs({ include_docs: true, startkey: 'broadcast_', endkey: 'broadcast_\uffff' });
    const all = res.rows.map(r => r.doc).filter(Boolean);
    return sinceIso ? all.filter(b => b.createdAt > sinceIso) : all;
  }

  async function markBroadcastSeen(id) {
    const SEEN_KEY = 'spaccle_broadcast_seen';
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    if (!seen.includes(id)) { seen.push(id); localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); }
  }

  /* ── Ticket replies ─────────────────────────────────────────────── */
  function ticketReplyId(ticketId) {
    return `ticket_reply_${ticketId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  async function addTicketReply(ticketId, { text, fromAdmin = false, userId }) {
    if (!ticketId || !text) throw new Error('INVALID_REPLY');
    const nowIso = new Date().toISOString();
    const doc = {
      _id: ticketReplyId(ticketId),
      type: 'ticket_reply',
      ticketId,
      userId,
      text,
      fromAdmin,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await db.put(doc);
    // Mark ticket as having a new reply and bump updatedAt
    try {
      const ticket = await db.get(ticketId);
      await db.put({
        ...ticket,
        updatedAt: nowIso,
        lastReplyAt: nowIso,
        hasAdminReply: fromAdmin ? true : (ticket.hasAdminReply || false),
        hasUserReply:  !fromAdmin ? true : (ticket.hasUserReply || false),
      });
    } catch { }
    return doc;
  }

  async function getTicketReplies(ticketId) {
    if (!ticketId) return [];
    const prefix = `ticket_reply_${ticketId}_`;
    const res = await db.allDocs({ include_docs: true, startkey: prefix, endkey: prefix + '\uffff' });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  /* ── User support tickets ───────────────────────────────────────── */
  async function listTicketsByUser(userId) {
    if (!userId) return [];
    const prefix = `ticket_${userId}_`;
    const res = await db.allDocs({ include_docs: true, startkey: prefix + '\uffff', endkey: prefix, descending: true });
    return res.rows.map(r => r.doc).filter(Boolean);
  }

  function subscriptionDocId(userId) {
    return `subscription_${userId}`;
  }

  async function getSubscription(userId) {
    if (!userId) return null;
    try {
      return await db.get(subscriptionDocId(userId));
    } catch {
      return null;
    }
  }

  async function setSubscription({ userId, planId, useWaitlistPrice = false }) {
    if (!userId) throw new Error('MISSING_USER');
    const plan = await db.get(planId);
    const nowIso = new Date().toISOString();
    const startAt = nowIso;
    const renewAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const base = {
      _id: subscriptionDocId(userId),
      type: 'subscription',
      userId,
      planId,
      status: 'active',
      currency: 'NGN',
      city: 'Lagos',
      pricePaid: useWaitlistPrice && plan.waitlistPrice ? plan.waitlistPrice : plan.price,
      includedItems: plan.includedItems,
      rolloverItems: plan.rolloverItems,
      pickupsPerMonth: plan.pickupsPerMonth,
      freeExpressPerMonth: plan.freeExpressPerMonth || 0,
      itemsRemaining: plan.includedItems,
      rolloverRemaining: plan.rolloverItems,
      pickupsRemaining: plan.pickupsPerMonth == null ? null : plan.pickupsPerMonth,
      startAt,
      renewAt,
      updatedAt: nowIso,
      createdAt: nowIso,
    };

    try {
      const existing = await db.get(base._id);
      const merged = { ...existing, ...base, updatedAt: nowIso };
      await db.put(merged);
      return merged;
    } catch {
      await db.put(base);
      return base;
    }
  }

  async function consumeSubscription({ userId, itemsCount = 0 }) {
    if (!userId) throw new Error('MISSING_USER');
    const sub = await db.get(subscriptionDocId(userId));
    if (sub.status !== 'active') throw new Error('SUBSCRIPTION_INACTIVE');
    const count = Math.max(0, Math.floor(Number(itemsCount) || 0));

    const itemsRemaining = Number(sub.itemsRemaining) || 0;
    const rolloverRemaining = Number(sub.rolloverRemaining) || 0;
    const totalAvailable = itemsRemaining + rolloverRemaining;
    if (count > totalAvailable) throw new Error('NOT_ENOUGH_ITEMS');

    const pickupsRemaining = sub.pickupsRemaining == null ? null : Number(sub.pickupsRemaining) || 0;
    if (pickupsRemaining != null && pickupsRemaining <= 0) throw new Error('NO_PICKUPS_LEFT');

    let newItemsRemaining = itemsRemaining;
    let newRolloverRemaining = rolloverRemaining;
    let toUse = count;
    if (toUse > 0) {
      const fromMain = Math.min(newItemsRemaining, toUse);
      newItemsRemaining -= fromMain;
      toUse -= fromMain;
    }
    if (toUse > 0) {
      const fromRollover = Math.min(newRolloverRemaining, toUse);
      newRolloverRemaining -= fromRollover;
      toUse -= fromRollover;
    }

    const next = {
      ...sub,
      itemsRemaining: newItemsRemaining,
      rolloverRemaining: newRolloverRemaining,
      pickupsRemaining: pickupsRemaining == null ? null : Math.max(0, pickupsRemaining - 1),
      updatedAt: new Date().toISOString(),
    };

    await db.put(next);
    return next;
  }

  const DEFAULT_REMOTE_DB = 'spacclelaundry_spaccle';
  let syncHandler = null;
  let syncState = { status: 'idle', online: typeof navigator !== 'undefined' ? navigator.onLine : true, error: null };
  const syncListeners = new Set();

  function emitSyncState(next) {
    syncState = { ...syncState, ...next };
    syncListeners.forEach(fn => {
      try { fn(syncState); } catch {}
    });
  }

  async function setSyncConfig({ remoteUrl, username = '', password = '', dbName = DEFAULT_REMOTE_DB }) {
    const config = {
      remoteUrl: String(remoteUrl || '').trim(),
      username: String(username || '').trim(),
      password: String(password || ''),
      dbName: String(dbName || DEFAULT_REMOTE_DB).trim() || DEFAULT_REMOTE_DB,
      updatedAt: new Date().toISOString(),
    };
    await setPreference('sync_config', config);
    return config;
  }

  async function getSyncConfig() {
    const cfg = await getPreference('sync_config', null);
    if (!cfg) return null;
    if (!cfg.dbName) cfg.dbName = DEFAULT_REMOTE_DB;
    return cfg;
  }

  function onSyncStateChange(listener) {
    syncListeners.add(listener);
    try { listener(syncState); } catch {}
    return () => syncListeners.delete(listener);
  }

  function getSyncState() {
    return syncState;
  }

  function stopSync() {
    if (syncHandler && typeof syncHandler.cancel === 'function') {
      syncHandler.cancel();
    }
    syncHandler = null;
    emitSyncState({ status: 'idle', error: null });
  }

  async function startSync() {
    const cfg = await getSyncConfig();
    if (!cfg || !cfg.remoteUrl) throw new Error('MISSING_SYNC_CONFIG');
    if (syncHandler) return;

    const remoteBase = cfg.remoteUrl.replace(/\/+$/, '');
    const remoteDbUrl = `${remoteBase}/${encodeURIComponent(cfg.dbName)}`;
    const hasAuth = !!(cfg.username && cfg.password);
    const remoteDb = new PouchDB(remoteDbUrl, hasAuth ? { auth: { username: cfg.username, password: cfg.password } } : {});

    emitSyncState({ status: 'connecting', error: null });

    syncHandler = db.sync(remoteDb, { live: true, retry: true, heartbeat: 10_000 })
      .on('change', () => emitSyncState({ status: 'syncing' }))
      .on('paused', () => emitSyncState({ status: 'idle' }))
      .on('active', () => emitSyncState({ status: 'syncing' }))
      .on('denied', err => emitSyncState({ status: 'error', error: err ? String(err) : 'denied' }))
      .on('error', err => emitSyncState({ status: 'error', error: err ? String(err) : 'error' }));

    return true;
  }

  function bindOnlineOffline() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => emitSyncState({ online: true }));
    window.addEventListener('offline', () => emitSyncState({ online: false }));
  }

  async function getDocument(id) {
    return db.get(id);
  }

  async function saveDocument(doc) {
    return db.put(doc);
  }

  /* ── Service zones ──────────────────────────────────────────────── */
  async function listZones() {
    try {
      const doc = await db.get('zone_config');
      return Array.isArray(doc.zones) ? doc.zones : [];
    } catch {
      return [];
    }
  }

  async function saveZones(zones) {
    if (!Array.isArray(zones)) throw new Error('INVALID_ZONES');
    try {
      const existing = await db.get('zone_config');
      await db.put({ ...existing, zones, updatedAt: new Date().toISOString() });
    } catch {
      await db.put({ _id: 'zone_config', type: 'zone_config', zones, updatedAt: new Date().toISOString() });
    }
  }

  function matchZone(address, zones) {
    if (!address || !zones || !zones.length) return null;
    const lower = address.toLowerCase();
    for (const z of zones) {
      if (!z.keywords || !z.keywords.length) continue;
      for (const kw of z.keywords) {
        if (lower.includes(kw.toLowerCase().trim())) return z._id || z.name;
      }
    }
    return null;
  }

  /* ── Rider payout requests ──────────────────────────────────────── */
  function payoutId(riderId) {
    return `payout_${riderId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  async function createPayoutRequest({ riderId, riderName, amount }) {
    if (!riderId) throw new Error('MISSING_RIDER');
    if (!amount || amount < 1) throw new Error('INVALID_AMOUNT');
    const nowIso = new Date().toISOString();
    const doc = {
      _id: payoutId(riderId),
      type: 'payout_request',
      riderId,
      riderName: riderName || '',
      amount: Number(amount),
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await db.put(doc);
    return doc;
  }

  async function getRiderPayoutRequests(riderId) {
    if (!riderId) return [];
    const prefix = `payout_${riderId}_`;
    const res = await db.allDocs({ include_docs: true, startkey: prefix + '￿', endkey: prefix, descending: true });
    return res.rows.map(r => r.doc).filter(d => d && d.type === 'payout_request');
  }

  async function updatePayoutStatus(payoutId, status) {
    const doc = await db.get(payoutId);
    const updated = { ...doc, status, updatedAt: new Date().toISOString() };
    await db.put(updated);
    return updated;
  }

  /* ── Live changes feed ──────────────────────────────────────────── */
  let _changesHandler = null;

  function watchChanges(callback) {
    if (_changesHandler) { try { _changesHandler.cancel(); } catch { } }
    _changesHandler = db.changes({ live: true, since: 'now', include_docs: true });
    _changesHandler.on('change', callback);
    _changesHandler.on('error', () => { });
    return _changesHandler;
  }

  function stopWatchChanges() {
    if (_changesHandler) { try { _changesHandler.cancel(); } catch { } _changesHandler = null; }
  }

  bindOnlineOffline();

  return {
    createUser,
    loginUser,
    ensureAdminUser,
    ensureRiderUser,
    getSession,
    logout,
    getRecoveryQuestion,
    verifyRecoveryAnswer,
    resetPassword,
    setPreference,
    getPreference,
    getUserProfile,
    updateUserProfile,
    getAddresses,
    saveAddress,
    deleteAddress,
    createOrder,
    getOrder,
    listOrders,
    listAllOrders,
    listFacilityOrders,
    getActiveOrder,
    setOrderStatus,
    advanceOrder,
    createSupportTicket,
    listAllSupportTickets,
    setTicketStatus,
    listAllUsers,
    listAllRiders,
    listAllStaff,
    ensureStaffUser,
    listAllSubscriptions,
    getOrdersByUser,
    getRiderOrders,
    updateOrderStatus,
    addTip,
    assignRider,
    onSyncStateChange,
    upsertPlan,
    listPlans,
    ensureDefaultPlans,
    ensureDefaultServices,
    getServicesConfig,
    saveServicesConfig,
    getSubscription,
    setSubscription,
    consumeSubscription,
    setSyncConfig,
    getSyncConfig,
    startSync,
    stopSync,
    getSyncState,
    ensureDefaultItemPricing,
    getItemPricing,
    saveItemPricing,
    setRecurringPickup,
    rateOrder,
    createChatMessage,
    getChatHistory,
    listAllChatMessages,
    markChatRead,
    getLegalContent,
    saveLegalContent,
    cancelSubscription,
    checkSubscriptionRenewal,
    changePassword,
    createPromoCode,
    validatePromoCode,
    redeemPromoCode,
    listAllPromoCodes,
    assignDriver,
    assignRiderToOrder,
    unassignRider,
    autoAssignRider,
    acceptAssignment,
    declineAssignment,
    autoAssignDeliveryRider,
    acceptDeliveryAssignment,
    declineDeliveryAssignment,
    listZones,
    saveZones,
    matchZone,
    createBroadcast,
    createNotification,
    listAllNotifications,
    markNotificationRead,
    listNewBroadcasts,
    markBroadcastSeen,
    listTicketsByUser,
    addTicketReply,
    getTicketReplies,
    watchChanges,
    stopWatchChanges,
    getDocument,
    saveDocument,
    deleteUser,
    createPayoutRequest,
    getRiderPayoutRequests,
    updatePayoutStatus,
  };
})();
