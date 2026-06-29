/* ── Rider Page ──────────────────────────────────────────────────── */
const RiderPage = (() => {

  let user = null;
  let initialized = false;
  let activeOrder = null;
  let refreshTimer = null;
  let availableEarnings = 0;

  const ORDER_STATUS = {
    SCHEDULED:  'scheduled',

    ASSIGNED:   'assigned',
    PICKED_UP:  'picked_up',
    PROCESSING: 'processing',
    READY:      'ready',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    DELIVERED:  'delivered',
    COMPLETED:  'completed',
    CANCELLED:  'cancelled',
  };

  async function init(data = {}) {
    try {
      console.log('RiderPage: init starting...');
      user = data.user || SpaccleDB.getSession();
      activeOrder = null;
      stopAutoRefresh();
      console.log('RiderPage: user =', user);
      renderUser();
      if (!initialized) {
        setupBottomNav();
        setupActions();
        setupSheets();
        setupPayouts();
        initialized = true;
      }
      switchTab('orders');
      await bootstrapData();
      startAutoRefresh();
      console.log('RiderPage: init done');
    } catch(e) {
      console.error('RiderPage init error:', e);
    }
  }

  function renderUser() {
    if (!user) return;
    const firstName = (user.name || '').split(' ')[0] || 'there';
    const initial = firstName[0].toUpperCase();

    // Add null checks for all elements
    try {
      const el1 = document.getElementById('rider-greeting-sub');
      const el2 = document.getElementById('rider-greeting-name');
      const el3 = document.getElementById('rider-avatar-letter');
      if (el1) el1.textContent = getGreeting() + ',';
      if (el2) el2.textContent = firstName;
      if (el3) el3.textContent = initial;
    } catch(e) { console.error('renderUser error:', e); }
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  async function bootstrapData() {
    await loadAvailability();
    await renderOrders();
    await renderEarnings();
    await renderPayoutHistory();
    await renderProfile();
    await renderSettings();
    await loadNotifications();
    bindSyncUI();
    checkNewAdminMessages();
  }

  /* ── Bottom nav ─────────────────────────────────────────────────── */
  function setupBottomNav() {
    try {
      document.querySelectorAll('.rider-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab || btn.dataset.tabBack;
          if (tab === 'profile') {
            switchToMainNav();
            return;
          }
          switchTab(tab);
        });
      });
    } catch(e) { console.error('setupBottomNav error:', e); }
  }

  function switchTab(tab) {
    try {
      document.querySelectorAll('.rider-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
      });
      document.querySelectorAll('.rider-tab').forEach(t => {
        if (t) t.classList.toggle('active', t.id === 'rider-tab-' + tab);
      });
    } catch(e) {}
  }

  function switchToSettings() {
    try {
      const el1 = document.getElementById('rider-bottom-nav');
      const el2 = document.getElementById('rider-nav-back');
      if (el1) el1.style.display = 'none';
      if (el2) el2.style.display = 'flex';
      switchTab('settings');
    } catch(e) {}
  }

  function switchToNotifications() {
    try {
      const el1 = document.getElementById('rider-bottom-nav');
      const el2 = document.getElementById('rider-nav-back');
      if (el1) el1.style.display = 'none';
      if (el2) el2.style.display = 'flex';
      switchTab('notifications');
    } catch(e) {}
  }

  function switchToMainNav() {
    try {
      const el1 = document.getElementById('rider-bottom-nav');
      const el2 = document.getElementById('rider-nav-back');
      if (el1) el1.style.display = 'flex';
      if (el2) el2.style.display = 'none';
      switchTab('profile');
    } catch(e) {}
  }

  /* ── Profile rendering ────────────────────────────────────────── */
  async function renderProfile() {
    if (!user) return;
    const firstName = (user.name || '').split(' ')[0] || 'Rider';
    const initial = firstName[0].toUpperCase();

    const el = (id, val) => {
      const e = document.getElementById(id);
      if (e) e.textContent = val;
    };
    el('rider-profile-avatar', initial);
    el('rider-profile-name', user.name || 'Rider');
    el('rider-profile-email', user.email || '');
    el('rider-profile-phone', user.phone || 'No phone');
  }

  async function renderSettings() {
    if (!user) return;
    const e = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '-';
    };
    e('rider-setting-name', user.name);
    e('rider-setting-email', user.email);
    e('rider-setting-phone', user.phone);
  }

  async function loadNotifications() {
    try {
      const notifs = await SpaccleDB.listAllNotifications();
      const riderNotifs = notifs.filter(n => n.riderId === user.userId || !n.riderId);
      renderNotifications(riderNotifs);
      updateNotifBadge(riderNotifs.length);
    } catch {
      renderNotifications([]);
    }
  }

  function renderNotifications(notifs) {
    const list = document.getElementById('rider-notif-list');
    if (!list) return;

    if (notifs.length === 0) {
      list.innerHTML = `
        <div class="rider-notif-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.5"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <p>No notifications yet</p>
        </div>`;
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="rider-notif-item">
        <div class="rider-notif-item__icon" style="background:${n.read ? 'var(--bg)' : 'rgba(91,79,190,0.1)'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="var(--primary)" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="rider-notif-item__body">
          <span class="rider-notif-item__title">${n.title || 'Notification'}</span>
          <span class="rider-notif-item__desc">${n.message || ''}</span>
          <span class="rider-notif-item__time">${formatDateTime(n.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  function updateNotifBadge(count) {
    const badge = document.getElementById('rider-notif-badge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

/* ── Actions ────────────────────────────────────────────────────────── */
  function setupActions() {
    try {
      const el = (id) => document.getElementById(id);
      el('btn-rider-logout')?.addEventListener('click', handleLogout);
      el('btn-rider-avatar')?.addEventListener('click', () => switchTab('profile'));
      el('btn-rider-settings')?.addEventListener('click', switchToSettings);
      el('btn-rider-notifications')?.addEventListener('click', switchToNotifications);
      el('btn-settings-back')?.addEventListener('click', switchToMainNav);
      el('btn-notif-back')?.addEventListener('click', switchToMainNav);
      el('btn-rider-support')?.addEventListener('click', openSupport);
      el('btn-rider-support-close')?.addEventListener('click', closeSupportSheet);
      el('btn-rider-support-send')?.addEventListener('click', sendSupportMessage);
      el('rider-support-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSupportMessage(); }
      });
      el('btn-rider-availability')?.addEventListener('click', toggleAvailability);
      el('btn-rider-accept-order')?.addEventListener('click', handleAcceptOrder);
      el('btn-rider-decline-order')?.addEventListener('click', handleDeclineOrder);
    } catch(e) { console.error('setupActions error:', e); }
  }

  /* ── Availability toggle ─────────────────────────────────── */
  let isAvailable = true;

  async function loadAvailability() {
    try {
      const saved = await SpaccleDB.getPreference('rider_availability', 'online');
      isAvailable = saved !== 'offline';
      applyAvailabilityUI(isAvailable);
    } catch(e) {}
  }

  async function toggleAvailability() {
    isAvailable = !isAvailable;
    applyAvailabilityUI(isAvailable);
    try {
      await SpaccleDB.setPreference('rider_availability', isAvailable ? 'online' : 'offline');
      if (user) {
        const doc = await SpaccleDB.getDocument(user.userId).catch(() => null);
        if (doc) await SpaccleDB.saveDocument({ ...doc, isAvailable });
      }
    } catch(e) {}
    showToast(isAvailable ? 'You are now Online' : 'You are now Offline');
  }

  function applyAvailabilityUI(online) {
    const btn = document.getElementById('btn-rider-availability');
    const label = document.getElementById('rider-availability-label');
    if (!btn) return;
    btn.classList.toggle('rider-availability-toggle--offline', !online);
    if (label) label.textContent = online ? 'Online' : 'Offline';
  }

  /* ── Support chat ────────────────────────────────────────── */
  function openSupport() {
    document.getElementById('rider-support-sheet').classList.add('open');
    loadSupportThread();
  }

  function closeSupportSheet() {
    document.getElementById('rider-support-sheet').classList.remove('open');
  }

  async function loadSupportThread() {
    const thread = document.getElementById('rider-support-thread');
    if (!thread || !user) return;
    thread.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Loading…</div>';
    try {
      const msgs = await SpaccleDB.getChatHistory(user.userId);
      if (!msgs.length) {
        thread.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:24px">No messages yet. Send us a message below.</div>';
        return;
      }
      thread.innerHTML = '';
      msgs.forEach(m => {
        const wrap = document.createElement('div');
        wrap.className = 'rider-support-bubble-wrap ' + (m.fromAdmin ? 'rider-support-bubble-wrap--admin' : 'rider-support-bubble-wrap--rider');
        const bubble = document.createElement('div');
        bubble.className = 'rider-support-bubble ' + (m.fromAdmin ? 'rider-support-bubble--admin' : 'rider-support-bubble--rider');
        bubble.textContent = m.text;
        const time = document.createElement('div');
        time.className = 'rider-support-bubble__time';
        time.textContent = formatDateTime(m.createdAt);
        wrap.appendChild(bubble);
        wrap.appendChild(time);
        thread.appendChild(wrap);
      });
      thread.scrollTop = thread.scrollHeight;
    } catch {
      thread.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Could not load messages.</div>';
    }
  }

  async function sendSupportMessage() {
    const input = document.getElementById('rider-support-input');
    const text = (input?.value || '').trim();
    if (!text || !user) return;
    input.value = '';
    try {
      await SpaccleDB.createChatMessage({ userId: user.userId, text, fromAdmin: false });
      await loadSupportThread();
    } catch {
      showToast('Could not send message');
    }
  }

function setupSheets() {
    try {
      const el = (id) => document.getElementById(id);
      el('rider-order-sheet')?.addEventListener('click', e => {
        if (e.target.id === 'rider-order-sheet') closeOrderSheet();
      });
      el('btn-rider-order-close')?.addEventListener('click', closeOrderSheet);
      el('rider-tip-sheet')?.addEventListener('click', e => {
        if (e.target.id === 'rider-tip-sheet') closeTipSheet();
      });
      el('btn-rider-tip-close')?.addEventListener('click', closeTipSheet);
      el('btn-rider-tip-add')?.addEventListener('click', submitTip);
      // Wire quick-amount buttons to update hidden input and highlight selection
      document.querySelectorAll('.rider-tip-amount[data-amount]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.rider-tip-amount[data-amount]')
            .forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const hidden = document.getElementById('rider-tip-amount');
          if (hidden) hidden.value = btn.dataset.amount;
          const customInput = document.getElementById('rider-tip-input');
          if (customInput) customInput.value = '';
        });
      });
      el('btn-rider-msg-customer')?.addEventListener('click', toggleMsgCompose);
      el('btn-rider-msg-send')?.addEventListener('click', sendMessageToCustomer);
    } catch(e) { console.error('setupSheets error:', e); }
  }

  function toggleMsgCompose() {
    const compose = document.getElementById('rider-msg-compose');
    if (!compose) return;
    const isOpen = compose.style.display !== 'none';
    compose.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) document.getElementById('rider-msg-input')?.focus();
  }

  async function sendMessageToCustomer() {
    const text = (document.getElementById('rider-msg-input')?.value || '').trim();
    if (!text || !activeOrder) return;
    try {
      await SpaccleDB.createChatMessage({
        userId: activeOrder.userId || activeOrder.customerId,
        text: `Rider update: ${text}`,
        fromAdmin: true,
        riderNote: true,
        orderId: activeOrder._id,
      });
      document.getElementById('rider-msg-input').value = '';
      document.getElementById('rider-msg-compose').style.display = 'none';
      showToast('Message sent to customer');
    } catch {
      showToast('Could not send message');
    }
  }

  async function handleLogout() {
    if (!await showConfirm('Sign out of your rider account?')) return;
    await SpaccleDB.logout();
    App.navigate('roleSelect');
  }

  function riderRole(order) {
    const isPickup = order.pickupRiderId === user.userId || order.riderId === user.userId;
    const isDelivery = order.deliveryRiderId === user.userId;
    if (isPickup && isDelivery) return 'Both';
    if (isPickup) return 'Pickup';
    if (isDelivery) return 'Delivery';
    return '';
  }

  /* ── Orders rendering ────────────────────────────────────────── */
  async function renderOrders() {
    try {
      const orders = await SpaccleDB.getRiderOrders();
      const riderOrders = orders.filter(o => o.riderId === user.userId || o.pickupRiderId === user.userId || o.deliveryRiderId === user.userId || o.assignedDriver === user.name || o.assignedDriver === user.userId);
      const pendingAssignments = orders.filter(o => o.pendingRiderId === user.userId && o.status === 'scheduled' && !o.riderId);
      const deliveryPendingAssignments = orders.filter(o => o.pendingDeliveryRiderId === user.userId && o.status === 'ready' && !o.deliveryRiderId);
      const allActive = [...pendingAssignments, ...deliveryPendingAssignments, ...riderOrders];
      const pending = allActive.filter(o => o.status === ORDER_STATUS.ASSIGNED || o.status === ORDER_STATUS.PICKED_UP || o.status === ORDER_STATUS.READY || o.status === ORDER_STATUS.OUT_FOR_DELIVERY || o.status === ORDER_STATUS.PROCESSING || (o.pendingRiderId === user.userId && !o.riderId) || (o.pendingDeliveryRiderId === user.userId && !o.deliveryRiderId));
      const completed = riderOrders.filter(o => o.status === ORDER_STATUS.COMPLETED || o.status === ORDER_STATUS.DELIVERED);
      const today = riderOrders.filter(o => isToday(o.updatedAt));

      renderOrdersList('rider-pending-list', pending);
      renderOrdersList('rider-completed-list', completed);
      renderStats(today.length, pending.length, completed.length);

      if (pending.length > 0) {
        activeOrder = pending[0];
        renderActiveOrder(pending[0]);
        const eyebrow = document.querySelector('.rider-active-card__eyebrow');
        if (eyebrow) eyebrow.textContent = pending.length > 1 ? `${pending.length} Active Orders` : 'Active Order';
      } else {
        clearActiveOrder();
      }

      document.getElementById('rider-orders-empty').style.display = pending.length === 0 && completed.length === 0 ? 'flex' : 'none';
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
  }

  function renderOrdersList(elId, orders) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';

    if (!orders || !orders.length) return;
    
    orders.forEach(order => {
      if (!order) return;
      const item = document.createElement('div');
      if (!item) return;
      item.className = 'rider-order-item';
      item.dataset.orderId = order._id;
      const role = riderRole(order);
      const isDelivPending = order.pendingDeliveryRiderId === user.userId && !order.deliveryRiderId;
      const isPickupPending = order.pendingRiderId === user.userId && !order.riderId;
      let roleBadge = '';
      if (isDelivPending) roleBadge = '<span class="role-badge role-badge--delivery">Delivery</span>';
      else if (isPickupPending) roleBadge = '<span class="role-badge role-badge--pickup">Pickup</span>';
      else if (role) roleBadge = `<span class="role-badge role-badge--${role.toLowerCase()}">${role}</span>`;
      item.innerHTML = `
        <div class="rider-order-item__status">
          <span class="rider-order-item__status-dot ${order.status}"></span>
          <span class="rider-order-item__status-label">${isDelivPending ? 'Delivery Available' : isPickupPending ? 'Awaiting Acceptance' : formatStatus(order.status)} ${roleBadge}</span>
        </div>
        <div class="rider-order-item__info">
          <div class="rider-order-item__row">
            <span class="rider-order-item__label">Order ID</span>
            <span class="rider-order-item__val">${order.publicId || order.orderId || order._id.slice(-6)}</span>
          </div>
          <div class="rider-order-item__row">
            <span class="rider-order-item__label">Date</span>
            <span class="rider-order-item__val">${order.pickupDay || '—'}</span>
          </div>
          <div class="rider-order-item__row">
            <span class="rider-order-item__label">Time</span>
            <span class="rider-order-item__val">${order.pickupTime || '—'}</span>
          </div>
          <div class="rider-order-item__row">
            <span class="rider-order-item__label">Items</span>
            <span class="rider-order-item__val">${order.itemsCount || 0} items</span>
          </div>
        </div>
      `;
      item.addEventListener('click', () => openOrderSheet(order));
      el.appendChild(item);
    });
  }

  function renderStats(todayCount, pendingCount, completedCount) {
    document.getElementById('rider-stat-today').textContent = todayCount;
    document.getElementById('rider-stat-pending').textContent = pendingCount;
    document.getElementById('rider-stat-completed').textContent = completedCount;
  }

  function renderActiveOrder(order) {
    const isPending = order.pendingRiderId === user.userId && !order.riderId;
    const isDeliveryPending = order.pendingDeliveryRiderId === user.userId && !order.deliveryRiderId;
    document.getElementById('rider-active-card').style.display = 'flex';
    document.getElementById('rider-no-active-card').style.display = 'none';

    document.getElementById('rider-active-id').textContent = order.publicId || order.orderId || order._id.slice(-6);
    document.getElementById('rider-active-status').textContent = isDeliveryPending ? 'Delivery Available' : isPending ? 'Awaiting Acceptance' : formatStatus(order.status);
    document.getElementById('rider-active-pickup').textContent = order.address || order.pickupAddress || 'N/A';
    document.getElementById('rider-active-delivery').textContent = order.deliveryAddress || order.address || 'N/A';
    document.getElementById('rider-active-items').textContent = (order.itemsCount || 0) + ' items';

    const atFacility = order.status === ORDER_STATUS.PROCESSING;
    const pickupRow = document.getElementById('rider-active-pickup-row');
    const deliveryRow = document.getElementById('rider-active-delivery-row');
    if (pickupRow) pickupRow.style.display = atFacility || isPending || isDeliveryPending ? 'none' : '';
    if (deliveryRow) deliveryRow.style.display = atFacility || isPending || isDeliveryPending ? 'none' : '';

    const progressEl = document.getElementById('rider-active-progress');
    if (progressEl) progressEl.style.display = isPending || isDeliveryPending ? 'none' : '';

    if (isPending) {
      startPendingTimer(order);
    }
  }

  function clearActiveOrder() {
    stopPendingTimer();
    document.getElementById('rider-active-card').style.display = 'none';
    document.getElementById('rider-no-active-card').style.display = 'flex';
  }

  let pendingTimerInterval = null;

  function startPendingTimer(order) {
    stopPendingTimer();
    const pendingEl = document.getElementById('rider-active-pending');
    const timerEl = document.getElementById('rider-pending-timer');
    if (!pendingEl || !timerEl) return;
    pendingEl.style.display = '';

    const isDeliveryPending = order.pendingDeliveryRiderId === user.userId && !order.deliveryRiderId;
    const expiresAt = new Date(isDeliveryPending ? order.pendingDeliveryExpiresAt : order.pendingExpiresAt).getTime();
    const now = Date.now();
    let remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

    timerEl.textContent = remaining + 's';
    if (remaining <= 0) {
      handleDeclineOrder();
      return;
    }

    pendingTimerInterval = setInterval(() => {
      remaining--;
      timerEl.textContent = remaining + 's';
      if (remaining <= 0) {
        stopPendingTimer();
        handleDeclineOrder();
      }
    }, 1000);
  }

  function stopPendingTimer() {
    if (pendingTimerInterval) {
      clearInterval(pendingTimerInterval);
      pendingTimerInterval = null;
    }
    const pendingEl = document.getElementById('rider-active-pending');
    if (pendingEl) pendingEl.style.display = 'none';
  }

  async function handleAcceptOrder() {
    if (!activeOrder) return;
    stopPendingTimer();
    const isDeliveryPending = activeOrder.pendingDeliveryRiderId === user.userId && !activeOrder.deliveryRiderId;
    try {
      if (isDeliveryPending) {
        await SpaccleDB.acceptDeliveryAssignment(activeOrder._id, user.userId);
      } else {
        await SpaccleDB.acceptAssignment(activeOrder._id, user.userId);
      }
      showToast(isDeliveryPending ? 'Delivery accepted!' : 'Order accepted!');
      await renderOrders();
    } catch (err) {
      if (err?.message === 'ASSIGNMENT_EXPIRED') {
        showToast('Offer expired — order has been reassigned');
      } else {
        showToast('Could not accept');
      }
      await renderOrders();
    }
  }

  async function handleDeclineOrder() {
    if (!activeOrder) return;
    stopPendingTimer();
    const isDeliveryPending = activeOrder.pendingDeliveryRiderId === user.userId && !activeOrder.deliveryRiderId;
    try {
      if (isDeliveryPending) {
        await SpaccleDB.declineDeliveryAssignment(activeOrder._id, user.userId);
      } else {
        await SpaccleDB.declineAssignment(activeOrder._id, user.userId);
      }
      showToast(isDeliveryPending ? 'Delivery declined' : 'Order declined');
      await renderOrders();
    } catch {
      showToast('Could not decline');
      await renderOrders();
    }
  }

  function renderOrderProgress(order, containerId, noteId) {
    const status = order.status;
    const steps = [
      { id: ORDER_STATUS.ASSIGNED,   label: 'Accepted' },
      { id: ORDER_STATUS.PICKED_UP,  label: 'Picked Up' },
      { id: 'facility',              label: 'At Facility' },
      { id: ORDER_STATUS.READY,      label: 'Ready' },
      { id: ORDER_STATUS.OUT_FOR_DELIVERY, label: 'Delivering' },
      { id: ORDER_STATUS.DELIVERED,  label: 'Delivered' },
    ];

    const statusOrder = [
      ORDER_STATUS.ASSIGNED,
      ORDER_STATUS.PICKED_UP,
      ORDER_STATUS.PROCESSING,
      ORDER_STATUS.READY,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.COMPLETED,
    ];

    const stepIndex = (s) => {
      const map = {
        [ORDER_STATUS.ASSIGNED]:   0,
        [ORDER_STATUS.PICKED_UP]:  1,
        [ORDER_STATUS.PROCESSING]: 2,
        [ORDER_STATUS.READY]:      3,
        [ORDER_STATUS.OUT_FOR_DELIVERY]: 4,
        [ORDER_STATUS.DELIVERED]:  5,
        [ORDER_STATUS.COMPLETED]:  5,
      };
      return map[s] ?? 0;
    };
    const activeStepIndex = stepIndex(status);

    const progressEl = document.getElementById(containerId || 'rider-active-progress');
    if (!progressEl) return;

    function stepEventTime(stepId) {
      if (!order.events) return null;
      let latest = null;
      for (const ev of order.events) {
        if (ev.status === stepId || (stepId === 'facility' && ev.status === ORDER_STATUS.PROCESSING)) {
          if (!latest || ev.timestamp > latest.timestamp) latest = ev;
        }
      }
      return latest ? latest.timestamp : null;
    }

    progressEl.innerHTML = steps.map((step, i) => {
      const isActive = Math.floor(activeStepIndex) === i;
      const isDone = activeStepIndex > i;
      const ts = isDone || isActive ? stepEventTime(step.id) : null;
      const timeStr = ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `
        <div class="rider-progress-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}">
          <div class="rider-progress-step__dot"></div>
          <span>${step.label}</span>
          ${timeStr ? `<div class="rider-progress-step__time">${timeStr}</div>` : ''}
        </div>
      `;
    }).join('');

    // Show a facility status note when laundry is being processed
    const facilityStatuses = [ORDER_STATUS.PROCESSING];
    const noteEl = document.getElementById(noteId || 'rider-facility-note');
    if (noteEl) {
      noteEl.style.display = facilityStatuses.includes(status) ? '' : 'none';
      noteEl.textContent = 'At the facility — you\'ll be notified when ready for delivery';
    }
  }

  /* ── Order actions ────────────────────────────────────────── */
  function openOrderSheet(order) {
    const isPending = order.pendingRiderId === user.userId && !order.riderId;
    const isDeliveryPending = order.pendingDeliveryRiderId === user.userId && !order.deliveryRiderId;
    activeOrder = order;
    document.getElementById('rider-sheet-order-id').textContent = order.publicId || order.orderId || order._id.slice(-6);
    document.getElementById('rider-sheet-order-status').textContent = isDeliveryPending ? 'Delivery Available' : isPending ? 'Awaiting Acceptance' : formatStatus(order.status);
    document.getElementById('rider-sheet-pickup').textContent = order.address || order.pickupAddress || 'N/A';
    document.getElementById('rider-sheet-delivery').textContent = order.deliveryAddress || order.address || 'N/A';
    document.getElementById('rider-sheet-items').textContent = (order.itemsCount || 0) + ' items';
    document.getElementById('rider-sheet-date').textContent = order.pickupDay || '-';
    document.getElementById('rider-sheet-time').textContent = order.pickupTime || '-';
    document.getElementById('rider-sheet-notes').textContent = order.notes || '-';

    // Fetch customer info from user doc
    SpaccleDB.getUserProfile(order.userId).then(u => {
      if (u) {
        document.getElementById('rider-sheet-customer').textContent = u.name || 'N/A';
        document.getElementById('rider-sheet-phone').textContent = formatPhone(u.phone);
      }
    }).catch(() => {});
    document.getElementById('rider-sheet-service').textContent = serviceLabel(order.service);
    document.getElementById('rider-sheet-billing').textContent = order.billingMode === 'subscription' ? 'Subscription' : 'Pay As You Go';
    document.getElementById('rider-sheet-amount').textContent = order.amountPaid ? '₦' + formatNaira(order.amountPaid) : '-';
    document.getElementById('rider-sheet-created').textContent = formatDateTime(order.createdAt);

    // Items breakdown
    const breakdownEl = document.getElementById('rider-sheet-row-breakdown');
    const breakdownVal = document.getElementById('rider-sheet-breakdown');
    if (breakdownEl && breakdownVal && order.itemsBreakdown) {
      const catLabels = { 'tops': 'Tops', 'bottoms': 'Bottoms', 'underwear': 'Underwear', 'jackets': 'Jackets', 'suits': 'Suits', 'dresses': 'Dresses', 'beddings': 'Beddings', 'towels': 'Towels', 'shoes': 'Shoes', 'traditional': 'Traditional', 'others': 'Others' };
      const parts = Object.entries(order.itemsBreakdown).filter(([,c]) => c > 0).map(([k,c]) => (catLabels[k]||k) + ': ' + c);
      if (parts.length) {
        breakdownVal.textContent = parts.join('  ');
        breakdownEl.style.display = '';
      }
    }

    // Delivery code
    const codeRow = document.getElementById('rider-sheet-row-delivery-code');
    const codeVal = document.getElementById('rider-sheet-delivery-code');
    if (codeRow && codeVal && order.deliveryCode) {
      codeVal.textContent = order.deliveryCode;
      codeRow.style.display = '';
    }

    const pickupStage = ['assigned', 'picked_up'].includes(order.status);
    const deliveryStage = ['ready', 'out_for_delivery'].includes(order.status);
    const doneStage = ['delivered', 'completed'].includes(order.status);
    const anyPending = isPending || isDeliveryPending;

    const pickupAddr = document.getElementById('rider-sheet-addr-pickup');
    const deliveryAddr = document.getElementById('rider-sheet-addr-delivery');
    pickupAddr.style.opacity = '';
    deliveryAddr.style.opacity = '';
    document.getElementById('rider-sheet-pickup').style.fontWeight = '';
    document.getElementById('rider-sheet-delivery').style.fontWeight = '';

    pickupAddr.style.display = !anyPending ? '' : 'none';
    deliveryAddr.style.display = !anyPending ? '' : 'none';
    document.getElementById('rider-sheet-row-time').style.display = pickupStage && !anyPending ? '' : 'none';
    document.getElementById('rider-sheet-row-notes').style.display = pickupStage && !anyPending ? '' : 'none';

    if (pickupStage) pickupAddr.style.opacity = '1';
    if (deliveryStage) deliveryAddr.style.opacity = '1';

    renderOrderProgress(order, 'rider-sheet-progress', 'rider-facility-note');
    renderOrderActions(order);

    document.getElementById('rider-order-sheet').classList.add('open');
  }

  function closeOrderSheet() {
    document.getElementById('rider-order-sheet').classList.remove('open');
  }

  function renderOrderActions(order) {
    const isPending = order.pendingRiderId === user.userId && !order.riderId;
    const isDeliveryPending = order.pendingDeliveryRiderId === user.userId && !order.deliveryRiderId;
    const actionsEl = document.getElementById('rider-sheet-actions');
    if (!actionsEl) return;

    if (isPending || isDeliveryPending) {
      const label = isDeliveryPending ? 'Accept Delivery' : 'Accept Order';
      const expiresKey = isDeliveryPending ? 'pendingDeliveryExpiresAt' : 'pendingExpiresAt';
      actionsEl.innerHTML = `
        <div style="text-align:center;padding:8px 0;font-size:13px;color:var(--text-2,#666)">${isDeliveryPending ? 'Accept delivery within' : 'Accept or decline within'} <strong id="rider-sheet-timer"></strong></div>
        <button class="btn btn--primary btn--lg btn--full" id="btn-rider-sheet-accept" style="margin-bottom:8px">${label}</button>
        <button class="btn btn--warn btn--lg btn--full" id="btn-rider-sheet-decline">Decline</button>
      `;
      document.getElementById('btn-rider-sheet-accept').addEventListener('click', handleAcceptOrder);
      document.getElementById('btn-rider-sheet-decline').addEventListener('click', handleDeclineOrder);
      const timerEl = document.getElementById('rider-sheet-timer');
      if (timerEl && order[expiresKey]) {
        const remaining = Math.max(0, Math.floor((new Date(order[expiresKey]).getTime() - Date.now()) / 1000));
        timerEl.textContent = remaining + 's';
      }
      return;
    }

    const actions = [];
    const s = order.status;

    if (s === ORDER_STATUS.ASSIGNED) {
      actions.push({ id: 'pickup', label: 'Mark Picked Up from Customer', style: 'primary' });
      actions.push({ id: 'cancel', label: 'Decline Order', style: 'danger' });
    } else if (s === ORDER_STATUS.PICKED_UP) {
      actions.push({ id: 'facility', label: 'Dropped at Facility', style: 'primary' });
    } else if (s === ORDER_STATUS.PROCESSING) {
      actionsEl.innerHTML = `
        <div class="rider-sheet-waiting">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--primary)" stroke-width="1.8"/>
            <path d="M12 6v6l4 2" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span>Laundry is at the facility. You'll be notified when it's ready for delivery.</span>
        </div>`;
      return;
    } else if (s === ORDER_STATUS.READY) {
      actions.push({ id: 'transit', label: 'Start Delivery to Customer', style: 'primary' });
    } else if (s === ORDER_STATUS.OUT_FOR_DELIVERY) {
      actions.push({ id: 'delivered', label: 'Mark Delivered', style: 'primary' });
    } else if (s === ORDER_STATUS.DELIVERED || s === ORDER_STATUS.COMPLETED) {
      actions.push({ id: 'tip', label: 'View / Add Tip', style: 'accent' });
    }

    if (!actions.length) {
      const statusLabel = s === ORDER_STATUS.CANCELLED ? 'Order Cancelled'
        : s === ORDER_STATUS.SCHEDULED ? 'Awaiting Confirmation'
        : s === ORDER_STATUS.SCHEDULED ? 'Waiting for Rider'
        : 'No Actions Available';
      actionsEl.innerHTML = `<p class="rider-sheet-waiting">${statusLabel}</p>`;
      return;
    }

    actionsEl.innerHTML = actions.map(a => `
      <button class="btn btn--${a.style} btn--lg btn--full" id="btn-rider-action-${a.id}">
        ${a.label}
      </button>
    `).join('');

    actions.forEach(a => {
      document.getElementById('btn-rider-action-' + a.id)
        .addEventListener('click', () => handleOrderAction(a.id, order));
    });
  }

  async function handleOrderAction(action, order) {
    const statusMap = {
      pickup:    ORDER_STATUS.PICKED_UP,
      facility:  ORDER_STATUS.PROCESSING,
      transit:   ORDER_STATUS.OUT_FOR_DELIVERY,
      delivered: ORDER_STATUS.DELIVERED,
    };

    if (action === 'tip') {
      openTipSheet(order);
      return;
    }

    if (action === 'cancel') {
      if (!await showConfirm('Decline this order?')) return;
      try {
        await SpaccleDB.unassignRider(order._id);
        closeOrderSheet();
        await renderOrders();
        showToast('Order declined');
      } catch {
        showToast('Failed to decline order');
      }
      return;
    }

    // Proof of delivery — require a note before marking delivered
    if (action === 'delivered') {
      openDeliveryConfirm(order);
      return;
    }

    const newStatus = statusMap[action];
    if (!newStatus) return;

    try {
      await SpaccleDB.updateOrderStatus(order._id, newStatus);
      closeOrderSheet();
      await renderOrders();
      showToast('Order updated');
    } catch (err) {
      showToast('Failed to update order');
    }
  }

  /* ── Proof of delivery ───────────────────────────────────── */
  function openDeliveryConfirm(order) {
    const existing = document.getElementById('rider-delivery-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rider-delivery-confirm-overlay';
    overlay.className = 'rider-delivery-confirm-overlay';
    const hasCode = !!order.deliveryCode;
    overlay.innerHTML = `
      <div class="rider-delivery-confirm">
        <h3 class="rider-delivery-confirm__title">Confirm Delivery</h3>
        <p class="rider-delivery-confirm__sub">Order #${order.publicId || order.orderId || order._id.slice(-6)}</p>
        ${hasCode ? `
        <label class="rider-delivery-confirm__label">Enter delivery code from customer</label>
        <input id="rider-delivery-code-input" class="rider-delivery-code-input" type="text" inputmode="numeric"
          maxlength="4" placeholder="0000" autocomplete="off">
        ` : ''}
        <label class="rider-delivery-confirm__label">Delivery note (optional)</label>
        <textarea id="rider-delivery-note" class="rider-msg-textarea" rows="2"
          placeholder="E.g. Left with security, handed to resident, placed at door…"></textarea>
        <div class="rider-delivery-confirm__actions">
          <button class="btn btn--ghost btn--full" id="btn-delivery-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="btn-delivery-confirm">Mark Delivered</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('btn-delivery-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('btn-delivery-confirm').addEventListener('click', async () => {
      if (hasCode) {
        const entered = (document.getElementById('rider-delivery-code-input')?.value || '').trim();
        if (entered !== order.deliveryCode) {
          showToast('Incorrect delivery code');
          return;
        }
      }
      const note = (document.getElementById('rider-delivery-note')?.value || '').trim();
      const meta = {};
      if (note) meta.deliveryNote = note;
      try {
        await SpaccleDB.updateOrderStatus(order._id, ORDER_STATUS.DELIVERED, meta);
        overlay.remove();
        closeOrderSheet();
        await renderOrders();
        showToast('Delivery confirmed');
      } catch {
        showToast('Failed to update order');
      }
    });
  }

  /* ── Tips ─────────────────────────────────────────────────────── */
  function openTipSheet(order) {
    activeOrder = order;
    document.getElementById('rider-tip-order-id').textContent = order.publicId || order.orderId || order._id.slice(-6);
    document.getElementById('rider-tip-customer').textContent = order.customerName || 'Customer';
    document.getElementById('rider-tip-input').value = '';
    document.getElementById('rider-tip-amount').value = '200';
    document.querySelectorAll('.rider-tip-amount[data-amount]').forEach(b =>
      b.classList.toggle('active', b.dataset.amount === '200'));
    document.getElementById('rider-tip-sheet').classList.add('open');
  }

  function closeTipSheet() {
    document.getElementById('rider-tip-sheet').classList.remove('open');
  }

  async function submitTip() {
    const customAmount = document.getElementById('rider-tip-input').value;
    const quickAmount = document.getElementById('rider-tip-amount').value;
    const amount = customAmount || quickAmount;

    if (!amount || Number(amount) < 50) {
      showToast('Enter a valid tip amount');
      return;
    }

    if (!activeOrder) return;

    try {
      await SpaccleDB.addTip(activeOrder._id, Number(amount));
      closeTipSheet();
      closeOrderSheet();
      await renderOrders();
      showToast('Tip added successfully!');
    } catch (err) {
      showToast('Failed to add tip');
    }
  }

  /* ── Earnings ─────────────────────────────────────────────── */
  async function renderEarnings() {
    try {
      const orders = await SpaccleDB.getRiderOrders();
      const completed = orders.filter(o =>
        (o.status === ORDER_STATUS.COMPLETED || o.status === ORDER_STATUS.DELIVERED) &&
        (o.riderId === user.userId || o.pickupRiderId === user.userId || o.deliveryRiderId === user.userId || o.assignedDriver === user.name || o.assignedDriver === user.userId)
      );

      let totalEarnings = 0;
      let totalTips = 0;
      let todayEarnings = 0;

      completed.forEach(o => {
        const earnings = o.riderEarnings || o.deliveryFee || 0;
        const tips = o.tip || 0;
        totalEarnings += earnings;
        totalTips += tips;
        if (isToday(o.updatedAt)) {
          todayEarnings += earnings + tips;
        }
      });

      availableEarnings = totalEarnings + totalTips;
      document.getElementById('rider-earnings-total').textContent = '₦' + totalEarnings.toLocaleString();
      document.getElementById('rider-earnings-tips').textContent = '₦' + totalTips.toLocaleString();
      document.getElementById('rider-earnings-today').textContent = '₦' + todayEarnings.toLocaleString();
    } catch (err) {
      console.error('Failed to load earnings:', err);
    }
  }

  /* ── Admin messages check ────────────────────────────────── */
  async function checkNewAdminMessages() {
    try {
      if (!user) return;
      const msgs = await SpaccleDB.getChatHistory(user.userId);
      const unread = msgs.filter(m => m.fromAdmin && !m.read);
      if (unread.length > 0) {
        const badge = document.getElementById('rider-notif-badge');
        if (badge) {
          badge.textContent = unread.length;
          badge.style.display = 'flex';
        }
        showToast(`${unread.length} new message${unread.length > 1 ? 's' : ''} from Spaccle`);
      }
    } catch (e) {
      console.warn('checkNewAdminMessages error:', e);
    }
  }

  /* ── Payouts ──────────────────────────────────────────────── */
  function setupPayouts() {
    const btn = document.getElementById('btn-rider-payout-request');
    if (btn) btn.addEventListener('click', handlePayoutRequest);
  }

  async function handlePayoutRequest() {
    const amountEl = document.getElementById('rider-payout-amount');
    const amount = parseFloat(amountEl?.value || 0);
    if (!amount || amount < 500) {
      showToast('Minimum payout request is ₦500');
      return;
    }
    if (amount > availableEarnings) {
      showToast(`Amount exceeds available balance of ₦${availableEarnings.toLocaleString()}`);
      return;
    }
    const btn = document.getElementById('btn-rider-payout-request');
    if (btn) btn.classList.add('loading');
    try {
      await SpaccleDB.createPayoutRequest({ riderId: user.userId, riderName: user.name, amount });
      if (amountEl) amountEl.value = '';
      showToast('Payout request submitted');
      renderPayoutHistory();
    } catch {
      showToast('Could not submit payout request');
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  }

  async function renderPayoutHistory() {
    const el = document.getElementById('rider-payout-history');
    if (!el || !user) return;
    try {
      const payouts = await SpaccleDB.getRiderPayoutRequests(user.userId);
      if (!payouts.length) {
        el.innerHTML = '<p style="font-size:13px;color:var(--text-3);margin-bottom:16px">No payout requests yet.</p>';
        return;
      }
      el.innerHTML = payouts.map(p => `
        <div class="rider-payout-row">
          <span class="rider-payout-row__amount">₦${Number(p.amount).toLocaleString()}</span>
          <span class="rider-payout-row__status rider-payout-row__status--${p.status || 'pending'}">${p.status || 'Pending'}</span>
          <span class="rider-payout-row__date">${formatDateTime(p.createdAt)}</span>
        </div>`).join('');
    } catch {
      el.innerHTML = '';
    }
  }

  /* ── Sync ─────────────────────────────────────────────────── */
  function bindSyncUI() {
    const syncEl = document.getElementById('rider-sync-status');
    if (syncEl) {
      SpaccleDB.onSyncStateChange((state) => {
        const syncing = state.status === 'syncing';
        const error = !!state.error;
        syncEl.textContent = syncing ? 'Syncing...' : (error ? 'Sync error' : 'Synced');
        syncEl.className = 'rider-sync-status ' + (syncing ? 'syncing' : (error ? 'error' : 'synced'));
      });
    }
  }

  /* ── Auto refresh ────────────────────────────────────────── */
  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(refresh, 30000);
    startLiveWatch();
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  async function refresh() {
    await renderOrders();
    await renderEarnings();
  }

  let watchRefreshTimer;

  function debouncedRefresh() {
    clearTimeout(watchRefreshTimer);
    watchRefreshTimer = setTimeout(() => refresh(), 500);
  }

  function startLiveWatch() {
    try {
      SpaccleDB.watchChanges(function(change) {
        const doc = change.doc;
        if (!doc || doc._deleted || !user) return;

        // New order assigned to this rider
        if (doc.type === 'order' && (doc.status === ORDER_STATUS.ASSIGNED || doc.pendingDeliveryRiderId === user.userId)) {
          const isForMe = doc.riderId === user.userId ||
            doc.pickupRiderId === user.userId ||
            doc.deliveryRiderId === user.userId ||
            doc.pendingDeliveryRiderId === user.userId ||
            doc.assignedDriver === user.name ||
            doc.assignedDriver === user.userId;
          if (!isForMe) return;
          showNewOrderAlert(doc);
          debouncedRefresh();
          return;
        }

        // Order status updated for an order belonging to this rider
        if (doc.type === 'order') {
          const isForMe = doc.riderId === user.userId ||
            doc.pickupRiderId === user.userId ||
            doc.deliveryRiderId === user.userId ||
            doc.assignedDriver === user.name ||
            doc.assignedDriver === user.userId;
          if (!isForMe) return;
          // Refresh silently when admin moves an order to READY
          if (doc.status === ORDER_STATUS.READY) {
            showToast('An order is ready for delivery!');
            debouncedRefresh();
            return;
          }
          // Refresh on any other order change (completed, cancellation, etc.)
          debouncedRefresh();
        }
      });
    } catch(e) {
      console.warn('startLiveWatch error:', e);
    }
  }

  function showNewOrderAlert(order) {
    const existing = document.getElementById('rider-new-order-alert');
    if (existing) existing.remove();
    const isDeliveryPending = order.pendingDeliveryRiderId === user.userId && !order.deliveryRiderId;

    const alert = document.createElement('div');
    alert.id = 'rider-new-order-alert';
    alert.className = 'rider-new-order-alert';
    alert.innerHTML = `
      <div class="rider-new-order-alert__icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L8 6H5l1 14h12L19 6h-3L12 2z" stroke="white" stroke-width="2"/>
        </svg>
      </div>
      <div class="rider-new-order-alert__body">
        <strong>${isDeliveryPending ? 'Delivery Available!' : 'New Order Assigned!'}</strong>
        <span>${isDeliveryPending ? '' : '#'}${order.publicId || order.orderId || order._id.slice(-6)} — ${isDeliveryPending ? 'Ready for delivery' : (order.address || order.pickupAddress || 'Pickup ready')}</span>
      </div>
      <button class="rider-new-order-alert__close" aria-label="Dismiss">✕</button>`;
    document.getElementById('page-rider')?.appendChild(alert);

    alert.querySelector('.rider-new-order-alert__close').addEventListener('click', () => alert.remove());
    setTimeout(() => alert?.remove(), 8000);
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function serviceLabel(s) {
    return ({
      'wash-fold':  'Wash, Iron & Fold',
      'dry-clean':  'Dry Cleaning',
      'iron-press': 'Iron & Press',
      'duvet':      'Duvet & Bedding',
      'alteration': 'Alterations',
      'shoe-clean': 'Shoe Cleaning',
    })[s] || s || 'Laundry Service';
  }

  function formatNaira(n) {
    return Number(n || 0).toLocaleString('en-NG');
  }

  function formatStatus(status) {
    const labels = {
      [ORDER_STATUS.SCHEDULED]:  'Scheduled',
      [ORDER_STATUS.CONFIRMED]:  'Confirmed (legacy)',
      [ORDER_STATUS.ASSIGNED]:   'Assigned to You',
      [ORDER_STATUS.PICKED_UP]:  'Picked Up',
      [ORDER_STATUS.PROCESSING]: 'At Facility',
      [ORDER_STATUS.READY]:      'Ready for Delivery',
      [ORDER_STATUS.OUT_FOR_DELIVERY]: 'Out for Delivery',
      [ORDER_STATUS.DELIVERED]:  'Delivered',
      [ORDER_STATUS.COMPLETED]:  'Completed',
      [ORDER_STATUS.CANCELLED]:  'Cancelled',
    };
    return labels[status] || status;
  }

  function formatDateTime(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function formatPhone(phone) {
    if (!phone) return 'N/A';
    return phone.replace(/(\+?234)/, '0');
  }

  function isToday(date) {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }

  function showToast(message) {
    const toast = document.getElementById('rider-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function showConfirm(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'spaccle-confirm-overlay';
      overlay.innerHTML =
        `<div class="spaccle-confirm-box">` +
        `<p class="spaccle-confirm-msg">${message}</p>` +
        `<div class="spaccle-confirm-row">` +
        `<button class="btn btn--ghost spaccle-confirm-cancel">Cancel</button>` +
        `<button class="btn btn--warn spaccle-confirm-ok">Confirm</button>` +
        `</div></div>`;
      document.body.appendChild(overlay);
      const cleanup = val => { overlay.remove(); resolve(val); };
      overlay.querySelector('.spaccle-confirm-ok').addEventListener('click', () => cleanup(true));
      overlay.querySelector('.spaccle-confirm-cancel').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    });
  }

  return { init };
})();