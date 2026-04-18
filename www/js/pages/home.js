/* ── Home Page ───────────────────────────────────────────────────── */
const HomePage = (() => {

  let activeTab = 'home';
  let user = null;
  let initialized = false;
  let selectedService = 'wash-fold';
  let selectedPlanId = null;
  let selectedSubPlanId = null;
  let billingMode = 'payg';
  let selectedOrderId = null;
  let supportOrderId = null;
  let editingPlanId = null;
  let subscription = null;
  let refreshTimer = null;
  let unsubscribeSync = null;
  let selectedPickupDate = null;
  let servicesConfig = null;

  function init(data = {}) {
    user = data.user || SpaccleDB.getSession();
    renderUser();
    if (!initialized) {
      setupBottomNav();
      setupActions();
      setupSheets();
      initialized = true;
    }
    switchTab('home');
    bootstrapData();
    refresh();
    startAutoRefresh();
    requestNotificationPermission();
  }

  async function bootstrapData() {
    await initConfigDefaults();
    try {
      servicesConfig = await SpaccleDB.ensureDefaultServices();
      renderServiceCardPrices();
    } catch { }
    try {
      await SpaccleDB.ensureDefaultPlans();
      await renderPlansUI();
    } catch { }

    bindSyncUI();
  }

  function renderServiceCardPrices() {
    if (!servicesConfig) return;
    document.querySelectorAll('.service-card[data-service]').forEach(card => {
      const svc = servicesConfig[card.dataset.service];
      if (!svc) return;
      const priceEl = card.querySelector('.service-card__price');
      if (priceEl) priceEl.textContent = svc.display;
    });
  }

  function getConfig() {
    return window.SpaccleConfig || {};
  }

  async function initConfigDefaults() {
    const cfg = getConfig();

    try {
      const existing = await SpaccleDB.getPreference('integrations_config', null);
      if (!existing) {
        await SpaccleDB.setPreference('integrations_config', {
          mapsApiKey: cfg.googleMaps?.apiKey || '',
          paystackPublicKey: cfg.paystack?.publicKey || '',
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Fill in any missing keys from config.js without overwriting saved values
        const merged = {
          mapsApiKey: existing.mapsApiKey || cfg.googleMaps?.apiKey || '',
          paystackPublicKey: existing.paystackPublicKey || cfg.paystack?.publicKey || '',
          updatedAt: existing.updatedAt,
        };
        if (merged.mapsApiKey !== existing.mapsApiKey || merged.paystackPublicKey !== existing.paystackPublicKey) {
          await SpaccleDB.setPreference('integrations_config', { ...merged, updatedAt: new Date().toISOString() });
        }
      }
    } catch { }

    try {
      if (cfg.couchdb?.remoteUrl) {
        const dbName = normalizeDbName(cfg.couchdb.dbName || 'spacclelaundry_spaccle');
        await SpaccleDB.setSyncConfig({
          remoteUrl: cfg.couchdb.remoteUrl,
          username: cfg.couchdb.username || '',
          password: cfg.couchdb.password || '',
          dbName,
        });
        try { await SpaccleDB.startSync(); } catch { }
      }
    } catch { }
  }

  /* ── User rendering ─────────────────────────────────────────── */
  function renderUser() {
    if (!user) return;
    const firstName = (user.name || '').split(' ')[0] || 'there';
    const initial = firstName[0].toUpperCase();

    document.getElementById('home-greeting-sub').textContent = getGreeting() + ',';
    document.getElementById('home-greeting-name').textContent = firstName;
    document.getElementById('home-avatar-letter').textContent = initial;
    document.getElementById('profile-avatar-lg').textContent = initial;
    document.getElementById('profile-name').textContent = user.name || firstName;
    document.getElementById('profile-email').textContent = user.email || '';
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /* ── Bottom nav ──────────────────────────────────────────────── */
  function setupBottomNav() {
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === 'new-order') {
          handleNewOrder();
        } else {
          switchTab(tab);
        }
      });
    });
  }

  function switchTab(tabName) {
    if (!['home', 'orders', 'track', 'profile'].includes(tabName)) return;
    activeTab = tabName;

    // Update tab panels
    document.querySelectorAll('.home-tab').forEach(t => {
      t.classList.toggle('active', t.id === 'tab-' + tabName);
    });

    // Update nav items
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Scroll active tab to top
    const panel = document.getElementById('tab-' + tabName);
    if (panel) {
      const scroll = panel.querySelector('.home-scroll');
      if (scroll) scroll.scrollTop = 0;
    }

    refresh();
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  function setupActions() {
    document.getElementById('btn-schedule-pickup').addEventListener('click', handleNewOrder);
    document.getElementById('btn-home-notify').addEventListener('click', handleNotifications);
    document.getElementById('btn-home-avatar').addEventListener('click', () => switchTab('profile'));
    document.getElementById('btn-view-orders').addEventListener('click', () => switchTab('orders'));
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-open-support').addEventListener('click', () => openSupport());
    document.getElementById('btn-orders-new').addEventListener('click', handleNewOrder);
    document.getElementById('btn-orders-empty-cta').addEventListener('click', handleNewOrder);
    document.getElementById('btn-track-empty-cta').addEventListener('click', handleNewOrder);
    document.getElementById('btn-track-support').addEventListener('click', () => openSupport());
    document.getElementById('btn-track-details').addEventListener('click', () => {
      if (selectedOrderId) openOrderSheet(selectedOrderId);
    });
    document.getElementById('btn-track-map').addEventListener('click', toggleTrackMap);
    document.getElementById('btn-track-advance').addEventListener('click', handleAdvanceStatus);

    document.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', () => handleServiceTap(card.dataset.service));
    });

    document.getElementById('btn-open-profile-info').addEventListener('click', openProfileInfo);
    document.getElementById('btn-open-profile-addresses').addEventListener('click', openProfileAddresses);
    document.getElementById('btn-open-profile-payment').addEventListener('click', () => openSheet('sheet-profile-payment'));
    document.getElementById('btn-open-profile-notifications').addEventListener('click', openProfileNotifications);
    document.getElementById('btn-open-profile-settings').addEventListener('click', openProfileSettings);

    const ordersList = document.getElementById('orders-list');
    ordersList.addEventListener('click', e => {
      const btn = e.target.closest('.order-item');
      if (!btn) return;
      const orderId = btn.dataset.orderId;
      if (orderId) openOrderSheet(orderId);
    });
  }

  async function handleNewOrder() {
    supportOrderId = null;
    billingMode = 'payg';
    buildDatePicker();
    updateBillingUI();
    openSheet('sheet-schedule');
    try {
      const s = await SpaccleDB.getPreference('app_settings', {});
      if (s.autofillAddr !== false && user) {
        const addrs = await SpaccleDB.getAddresses(user.userId);
        const def = addrs.find(a => a.isDefault) || addrs[0];
        if (def) {
          const el = document.getElementById('pickup-address');
          if (el && !el.value) el.value = `${def.street}, ${def.city}`;
        }
      }
    } catch { }
  }

  function buildDatePicker() {
    const picker = document.getElementById('date-picker');
    if (!picker) return;
    picker.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'date-chip' + (i === 0 ? ' active' : '');
      btn.dataset.dateValue = iso;
      btn.innerHTML = `
        <span class="date-chip__day">${i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS[d.getDay()]}</span>
        <span class="date-chip__num">${d.getDate()}</span>
        <span class="date-chip__month">${MONTHS[d.getMonth()]}</span>`;

      btn.addEventListener('click', () => {
        picker.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        selectedPickupDate = iso;
      });
      picker.appendChild(btn);
    }
    selectedPickupDate = today.toISOString().split('T')[0];
  }

  function handleNotifications() {
    const badge = document.getElementById('home-notify-badge');
    if (badge) badge.textContent = '';
    requestNotificationPermission();
    showToast('Notifications cleared');
  }

  function handleServiceTap(service) {
    selectedService = service;
    document.querySelectorAll('.service-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.service === service);
    });
    showToast(serviceName(service) + ' — tap Schedule Pickup to add');
  }

  async function handleLogout() {
    stopAutoRefresh();
    closeAllSheets();
    if (unsubscribeSync) {
      unsubscribeSync();
      unsubscribeSync = null;
    }
    SpaccleDB.logout();
    initialized = false;
    user = null;
    App.navigate('auth');
  }

  function setupSheets() {
    const overlay = document.getElementById('sheet-overlay');
    overlay.addEventListener('click', closeAllSheets);

    document.getElementById('btn-schedule-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-order-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-support-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-subscription-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-subscribe-cancel').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-info-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-addresses-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-payment-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-notifications-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-settings-close').addEventListener('click', closeAllSheets);

    document.querySelectorAll('.service-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        selectedService = pill.dataset.service;
        document.querySelectorAll('.service-pill').forEach(p => p.classList.toggle('active', p === pill));
      });
    });

    document.getElementById('btn-schedule-confirm').addEventListener('click', handleScheduleConfirm);
    document.getElementById('btn-billing-payg').addEventListener('click', () => setBillingMode('payg'));
    document.getElementById('btn-billing-sub').addEventListener('click', () => setBillingMode('subscription'));
    document.getElementById('btn-open-subscribe').addEventListener('click', openSubscriptionSheet);
    document.getElementById('btn-subscribe-pay').addEventListener('click', handleSubscribePay);

    document.getElementById('btn-order-track').addEventListener('click', () => {
      closeAllSheets();
      switchTab('track');
    });

    document.getElementById('btn-order-support').addEventListener('click', () => {
      closeAllSheets();
      openSupport(selectedOrderId);
    });

    document.getElementById('btn-support-send').addEventListener('click', handleSupportSend);
    document.getElementById('btn-copy-support-email').addEventListener('click', copySupportEmail);

    document.getElementById('btn-profile-info-save').addEventListener('click', handleProfileInfoSave);
    document.getElementById('btn-addr-add').addEventListener('click', showAddressForm);
    document.getElementById('btn-addr-cancel').addEventListener('click', hideAddressForm);
    document.getElementById('btn-addr-save').addEventListener('click', handleAddressSave);
    document.getElementById('btn-notif-save').addEventListener('click', handleNotifSave);
    document.getElementById('btn-settings-save').addEventListener('click', handleSettingsSave);

  }

  function openSheet(sheetId) {
    const overlay = document.getElementById('sheet-overlay');
    const sheets = document.querySelectorAll('.sheet');
    sheets.forEach(s => {
      s.classList.toggle('active', s.id === sheetId);
      s.setAttribute('aria-hidden', s.id === sheetId ? 'false' : 'true');
    });
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAllSheets() {
    document.getElementById('sheet-overlay').classList.remove('active');
    document.getElementById('sheet-overlay').setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.sheet').forEach(s => {
      s.classList.remove('active');
      s.setAttribute('aria-hidden', 'true');
    });
  }

  function openSupport(orderId = null) {
    supportOrderId = orderId;
    openSheet('sheet-support');
  }

  async function copySupportEmail() {
    const email = document.getElementById('support-email').textContent.trim();
    try {
      await navigator.clipboard.writeText(email);
      showToast('Support email copied');
    } catch {
      showToast(email);
    }
  }

  function setButtonLoading(btn, isLoading) {
    btn.classList.toggle('loading', isLoading);
  }

  async function handleScheduleConfirm() {
    if (!user) return;
    const btn = document.getElementById('btn-schedule-confirm');
    const day = selectedPickupDate || new Date().toISOString().split('T')[0];
    const time = document.getElementById('pickup-time').value;
    const addressEl = document.getElementById('pickup-address');
    const notes = document.getElementById('pickup-notes').value.trim();
    const address = addressEl.value.trim();
    const itemsRaw = document.getElementById('pickup-items') ? document.getElementById('pickup-items').value : '';
    const itemsCount = Math.floor(Number(String(itemsRaw).replace(/[^0-9.]/g, '')) || 0);

    if (!address) {
      addressEl.focus();
      showToast('Please enter a pickup address');
      return;
    }

    if (!itemsCount || itemsCount <= 0) {
      const el = document.getElementById('pickup-items');
      if (el) el.focus();
      showToast('Enter number of items');
      return;
    }

    if (billingMode === 'subscription') {
      subscription = await SpaccleDB.getSubscription(user.userId);
      if (!subscription || subscription.status !== 'active') {
        showToast('Please subscribe to a monthly plan');
        await openSubscriptionSheet();
        return;
      }
    }

    setButtonLoading(btn, true);
    try {
      if (billingMode === 'subscription') {
        await SpaccleDB.consumeSubscription({ userId: user.userId, itemsCount });
        await placeOrder({ userId: user.userId, day, time, address, notes, itemsCount });
        return;
      }

      // PAYG: collect Paystack deposit first
      const cfg = await SpaccleDB.getPreference('integrations_config', null);
      const pk = (cfg?.paystackPublicKey || getConfig().paystack?.publicKey || '').trim();
      if (!pk) {
        showToast('Payment not configured — contact support');
        return;
      }

      await loadPaystack();
      const reference = `SPACCLE_PICKUP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      const svcCfg = servicesConfig?.[selectedService] || {};
      const pricePerItem = svcCfg.pricePerItem || 900;
      const amountKobo = itemsCount * pricePerItem * 100;

      const handler = window.PaystackPop.setup({
        key: pk,
        email: user.email || 'guest@spaccle.com',
        amount: amountKobo,
        currency: 'NGN',
        ref: reference,
        label: `Pickup — ${itemsCount} item${itemsCount !== 1 ? 's' : ''}`,
        callback: function() {
          placeOrder({ userId: user.userId, day, time, address, notes, itemsCount, paystackRef: reference })
            .catch(function() { showToast('Order save failed — contact support'); });
        },
        onClose: function() {
          showToast('Payment cancelled');
          setButtonLoading(btn, false);
        },
      });
      handler.openIframe();
      return; // button loading cleared in callback/onClose
    } catch (err) {
      showToast('Could not schedule: ' + (err?.message || 'unknown error'));
    } finally {
      setButtonLoading(btn, false);
    }
  }

  async function placeOrder({ userId, day, time, address, notes, itemsCount, paystackRef = null }) {
    const svcCfg = servicesConfig?.[selectedService] || {};
    const pricePerItem = svcCfg.pricePerItem || 900;
    const amountPaid = billingMode === 'payg' ? (Number(itemsCount) || 0) * pricePerItem : null;

    const order = await SpaccleDB.createOrder({
      userId,
      service: selectedService,
      billingMode,
      planId: billingMode === 'subscription' ? subscription?.planId : null,
      itemsCount: Number(itemsCount) || null,
      pickupDay: day,
      pickupTime: time,
      address,
      notes,
      paystackRef,
      amountPaid,
    });

    const btn = document.getElementById('btn-schedule-confirm');
    document.getElementById('pickup-address').value = '';
    document.getElementById('pickup-notes').value = '';
    if (document.getElementById('pickup-items')) document.getElementById('pickup-items').value = '';
    closeAllSheets();
    showToast('Pickup scheduled');
    selectedOrderId = order._id;
    switchTab('track');
    setButtonLoading(btn, false);
    await refresh();
    return order;
  }

  async function handleSupportSend() {
    if (!user) return;
    const btn = document.getElementById('btn-support-send');
    const subjectEl = document.getElementById('support-subject');
    const messageEl = document.getElementById('support-message');
    const subject = subjectEl.value.trim();
    const message = messageEl.value.trim();

    if (!subject) {
      subjectEl.focus();
      showToast('Please add a subject');
      return;
    }
    if (!message) {
      messageEl.focus();
      showToast('Please add a message');
      return;
    }

    setButtonLoading(btn, true);
    try {
      await SpaccleDB.createSupportTicket({
        userId: user.userId,
        subject,
        message,
        orderId: supportOrderId,
      });
      subjectEl.value = '';
      messageEl.value = '';
      closeAllSheets();
      showToast('Message sent to support');
    } catch (err) {
      const msg = err?.message === 'MISSING_USER' ? 'Session error — please log out and back in' : 'Could not send message';
      showToast(msg);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function serviceName(service) {
    const names = {
      'wash-fold': 'Wash & Fold',
      'dry-clean': 'Dry Cleaning',
      'iron-press': 'Iron & Press',
      'duvet': 'Duvet & Bedding',
      'alteration': 'Clothes Alteration / Repair',
      'shoe-clean': 'Shoe Cleaning',
    };
    return names[service] || 'Laundry Service';
  }

  function statusLabel(status) {
    const labels = {
      scheduled: 'Scheduled',
      picked_up: 'Picked Up',
      cleaning: 'Cleaning',
      ready: 'Ready',
      delivered: 'Delivered',
    };
    return labels[status] || 'In Progress';
  }

  function statusSub(status) {
    const subs = {
      scheduled: 'We’ll arrive within your pickup window.',
      picked_up: 'Your laundry is on the way to our facility.',
      cleaning: 'We’re cleaning, pressing, and quality-checking.',
      ready: 'Your laundry is ready — delivery is next.',
      delivered: 'Delivered to your address.',
    };
    return subs[status] || '';
  }

  function statusTitle(status) {
    const titles = {
      scheduled: 'Pickup Scheduled',
      picked_up: 'Picked Up',
      cleaning: 'Cleaning',
      ready: 'Ready',
      delivered: 'Delivered',
    };
    return titles[status] || 'In Progress';
  }

  function isActive(order) {
    return order && !['delivered', 'cancelled'].includes(order.status);
  }

  function simulatedDesiredStatus(order) {
    if (!order || !order.simulated) return order?.status;
    const created = Date.parse(order.createdAt || '');
    if (!created) return order.status;
    const elapsed = Date.now() - created;
    if (elapsed < 10_000) return 'scheduled';
    if (elapsed < 30_000) return 'picked_up';
    if (elapsed < 60_000) return 'cleaning';
    if (elapsed < 90_000) return 'ready';
    return 'delivered';
  }

  async function ensureSimulatedProgress(order) {
    if (!order || !order.simulated) return order;
    let current = order.status;
    const desired = simulatedDesiredStatus(order);
    if (desired === current) return order;
    const flow = ['scheduled', 'picked_up', 'cleaning', 'ready', 'delivered'];
    const idxCurrent = flow.indexOf(current);
    const idxDesired = flow.indexOf(desired);
    if (idxCurrent === -1 || idxDesired === -1) return order;

    let updated = order;
    for (let i = idxCurrent + 1; i <= idxDesired; i++) {
      updated = await SpaccleDB.setOrderStatus(updated._id, flow[i], { simulated: true });
    }
    return updated;
  }

  async function refresh() {
    if (!user) return;
    const activeOrder = await SpaccleDB.getActiveOrder(user.userId);
    const progressed = await ensureSimulatedProgress(activeOrder);
    const orders = await SpaccleDB.listOrders(user.userId);

    renderHomeActiveOrder(progressed);
    renderOrders(orders);
    renderTracking(progressed);

    selectedOrderId = progressed?._id || selectedOrderId;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(() => {
      refresh();
    }, 3_000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function renderHomeActiveOrder(order) {
    const empty = document.getElementById('order-empty-state');
    const card = document.getElementById('order-active-card');

    if (!order || !isActive(order)) {
      empty.style.display = '';
      card.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    card.style.display = '';

    document.getElementById('order-status-label').textContent = statusLabel(order.status);
    document.getElementById('order-id-val').textContent = '#' + (order.publicId || 'SP-000000');
    document.getElementById('order-pickup-val').textContent = `${order.pickupDay || '—'}, ${order.pickupTime || '—'}`;
    document.getElementById('order-items-val').textContent = serviceName(order.service);

    const steps = Array.from(card.querySelectorAll('.order-track-step'));
    const map = {
      scheduled: 0,
      picked_up: 0,
      cleaning: 1,
      ready: 2,
      delivered: 3,
    };
    const activeIdx = map[order.status] ?? 0;
    steps.forEach((s, idx) => {
      s.classList.toggle('done', idx < activeIdx);
      s.classList.toggle('active', idx === activeIdx);
    });

    checkOrderStatusChange(order).catch(() => {});
  }

  function renderOrders(orders) {
    const empty = document.getElementById('orders-empty');
    const list = document.getElementById('orders-list');
    const hasOrders = Array.isArray(orders) && orders.length > 0;
    empty.style.display = hasOrders ? 'none' : '';
    list.innerHTML = '';
    if (!hasOrders) return;

    orders.forEach(order => {
      const btn = document.createElement('button');
      btn.className = 'order-item';
      btn.dataset.orderId = order._id;

      const left = document.createElement('div');
      left.className = 'order-item__left';

      const id = document.createElement('div');
      id.className = 'order-item__id';
      id.textContent = order.publicId || 'SP-000000';

      const title = document.createElement('div');
      title.className = 'order-item__title';
      title.textContent = serviceName(order.service);

      const meta = document.createElement('div');
      meta.className = 'order-item__meta';
      meta.textContent = `${order.pickupDay || '—'}, ${order.pickupTime || '—'}`;

      left.appendChild(id);
      left.appendChild(title);
      left.appendChild(meta);

      const pill = document.createElement('div');
      pill.className = `status-pill status-pill--${order.status || 'scheduled'}`;
      pill.textContent = statusLabel(order.status);

      btn.appendChild(left);
      btn.appendChild(pill);
      list.appendChild(btn);
    });
  }

  async function openOrderSheet(orderId) {
    selectedOrderId = orderId;
    try {
      const order = await SpaccleDB.getOrder(orderId);
      const title = document.getElementById('order-sheet-title');
      title.textContent = order.publicId || 'SP-000000';
      const detail = document.getElementById('order-detail');
      detail.innerHTML = renderOrderDetailHtml(order);
      openSheet('sheet-order');
    } catch {
      showToast('Could not open order');
    }
  }

  function renderOrderDetailHtml(order) {
    const events = Array.isArray(order.events) ? order.events : [];
    const timeline = events
      .slice()
      .reverse()
      .map(ev => {
        const when = formatTime(ev.at);
        return `
          <div class="timeline-item ${ev.status === order.status ? 'active' : 'done'}">
            <div class="timeline-dot"></div>
            <div class="timeline-body">
              <div class="timeline-title">${statusLabel(ev.status)}</div>
              <div class="timeline-sub">${when}</div>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="order-detail__row"><strong>Service:</strong> ${escapeHtml(serviceName(order.service))}</div>
      <div class="order-detail__row"><strong>Pickup:</strong> ${escapeHtml(`${order.pickupDay || '—'}, ${order.pickupTime || '—'}`)}</div>
      <div class="order-detail__row"><strong>Address:</strong> ${escapeHtml(order.address || '—')}</div>
      <div class="order-detail__row"><strong>Status:</strong> ${escapeHtml(statusLabel(order.status))}</div>
      <div style="height:12px"></div>
      ${timeline}
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function renderTracking(order) {
    const empty = document.getElementById('track-empty');
    const card = document.getElementById('track-card');
    if (!order || !isActive(order)) {
      empty.style.display = '';
      card.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    card.style.display = '';

    document.getElementById('track-order-id').textContent = order.publicId || 'SP-000000';
    document.getElementById('track-status-title').textContent = statusTitle(order.status);
    document.getElementById('track-status-sub').textContent = statusSub(order.status);
    document.getElementById('track-status-pill').textContent = statusLabel(order.status);
    document.getElementById('track-pickup').textContent = `${order.pickupDay || '—'}, ${order.pickupTime || '—'}`;
    document.getElementById('track-ready').textContent = estimateReady(order);

    selectedOrderId = order._id;

    const timelineEl = document.getElementById('track-timeline');
    timelineEl.innerHTML = '';
    const flow = [
      { status: 'scheduled', label: 'Scheduled', sub: 'Pickup window confirmed.' },
      { status: 'picked_up', label: 'Picked up', sub: 'Driver collected your laundry.' },
      { status: 'cleaning', label: 'Cleaning', sub: 'Cleaning + quality check.' },
      { status: 'ready', label: 'Ready', sub: 'Ready for delivery.' },
      { status: 'delivered', label: 'Delivered', sub: 'Delivered to your address.' },
    ];
    const idx = flow.findIndex(s => s.status === order.status);

    flow.forEach((step, i) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      if (i < idx) item.classList.add('done');
      if (i === idx) item.classList.add('active');

      const dot = document.createElement('div');
      dot.className = 'timeline-dot';

      const body = document.createElement('div');
      body.className = 'timeline-body';

      const title = document.createElement('div');
      title.className = 'timeline-title';
      title.textContent = step.label;

      const sub = document.createElement('div');
      sub.className = 'timeline-sub';
      sub.textContent = step.sub;

      body.appendChild(title);
      body.appendChild(sub);
      item.appendChild(dot);
      item.appendChild(body);
      timelineEl.appendChild(item);
    });
  }

  function estimateReady(order) {
    if (!order?.createdAt) return '—';
    const created = Date.parse(order.createdAt);
    if (!created) return '—';
    const readyAt = new Date(created + 60_000);
    return readyAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function handleAdvanceStatus() {
    if (!selectedOrderId) return;
    const btn = document.getElementById('btn-track-advance');
    setButtonLoading(btn, true);
    try {
      const updated = await SpaccleDB.advanceOrder(selectedOrderId);
      await refresh();
      if (updated.status === 'ready') showToast('Your laundry is ready');
      if (updated.status === 'delivered') showToast('Delivered');
    } catch {
      showToast('Could not update status');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function setBillingMode(mode) {
    billingMode = mode === 'subscription' ? 'subscription' : 'payg';
    updateBillingUI();
  }

  async function updateBillingUI() {
    const paygBtn = document.getElementById('btn-billing-payg');
    const subBtn = document.getElementById('btn-billing-sub');
    const subBlock = document.getElementById('subscription-block');
    const itemsGroup = document.getElementById('items-count-group');
    const required = document.getElementById('subscription-required');

    if (paygBtn && subBtn) {
      paygBtn.classList.toggle('active', billingMode === 'payg');
      subBtn.classList.toggle('active', billingMode === 'subscription');
    }

    if (subBlock) subBlock.style.display = billingMode === 'subscription' ? '' : 'none';
    if (itemsGroup) itemsGroup.style.display = '';
    const rateHint = document.getElementById('items-payg-rate');
    if (rateHint) {
      rateHint.style.display = billingMode === 'payg' ? '' : 'none';
      const svcCfg = servicesConfig?.[selectedService] || {};
      rateHint.textContent = svcCfg.display || '₦900/item';
    }
    const itemsLabel = document.getElementById('items-count-label');
    if (itemsLabel) itemsLabel.textContent = billingMode === 'subscription' ? 'Estimated items count' : 'Number of items';

    if (billingMode === 'subscription' && user) {
      subscription = await SpaccleDB.getSubscription(user.userId);
      const active = !!(subscription && subscription.status === 'active');
      if (required) required.style.display = active ? 'none' : '';
      await renderPlansUI();
    } else {
      if (required) required.style.display = 'none';
    }
  }

  async function renderPlansUI() {
    const wrap = document.getElementById('plan-cards');
    if (!wrap) return;
    const allPlans = await SpaccleDB.listPlans({ includeInactive: false });
    const plans = allPlans.filter(p => p.kind === 'subscription');
    wrap.innerHTML = '';

    if (!plans.length) {
      const empty = document.createElement('div');
      empty.className = 'tab-subtitle';
      empty.textContent = 'No plans available.';
      wrap.appendChild(empty);
      selectedPlanId = null;
      return;
    }

    const sorted = plans.slice().sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));
    const subPlanId = subscription?.planId || null;
    const defaultId = subPlanId && sorted.some(p => p._id === subPlanId) ? subPlanId : sorted[0]._id;
    selectedPlanId = defaultId;

    sorted.forEach(plan => {
      const btn = document.createElement('button');
      btn.className = 'plan-card';
      btn.classList.toggle('active', plan._id === selectedPlanId);
      btn.dataset.planId = plan._id;

      const left = document.createElement('div');
      left.className = 'plan-card__left';
      const name = document.createElement('div');
      name.className = 'plan-card__name';
      name.textContent = plan.name || 'Plan';
      const desc = document.createElement('div');
      desc.className = 'plan-card__desc';
      desc.textContent = plan.description || '';
      left.appendChild(name);
      left.appendChild(desc);

      const right = document.createElement('div');
      right.className = 'plan-card__right';
      const price = document.createElement('div');
      price.className = 'plan-card__price';
      price.textContent = `₦${formatNaira(plan.price)}`;
      const unit = document.createElement('div');
      unit.className = 'plan-card__unit';
      unit.textContent = 'per month';
      right.appendChild(price);
      right.appendChild(unit);

      btn.appendChild(left);
      btn.appendChild(right);

      btn.addEventListener('click', () => {
        if (billingMode !== 'subscription') return;
        if (!subscription || subscription.status !== 'active') {
          openSubscriptionSheet();
          return;
        }
        showToast('Plan can be changed from Subscription');
      });

      wrap.appendChild(btn);
    });
  }

  function formatNaira(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString('en-NG');
  }

  async function openSubscriptionSheet() {
    if (!user) return;
    subscription = await SpaccleDB.getSubscription(user.userId);
    await renderSubscriptionSheet();
    openSheet('sheet-subscription');
  }

  async function renderSubscriptionSheet() {
    const current = document.getElementById('sub-current');
    const wrap = document.getElementById('sub-plan-cards');
    if (!wrap) return;
    const allPlans = await SpaccleDB.listPlans({ includeInactive: false });
    const plans = allPlans.filter(p => p.kind === 'subscription').sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999));
    wrap.innerHTML = '';

    if (subscription && subscription.status === 'active') {
      if (current) {
        const ren = subscription.renewAt ? formatTime(subscription.renewAt) : '';
        const picks = subscription.pickupsRemaining == null ? 'Unlimited' : String(subscription.pickupsRemaining);
        current.textContent = `Active: ${subscription.planId} • Items left: ${subscription.itemsRemaining + subscription.rolloverRemaining} • Pickups left: ${picks} • Renew: ${ren}`;
      }
    } else {
      if (current) current.textContent = 'No active subscription.';
    }

    if (!plans.length) {
      const empty = document.createElement('div');
      empty.className = 'tab-subtitle';
      empty.textContent = 'No plans available.';
      wrap.appendChild(empty);
      selectedSubPlanId = null;
      return;
    }

    selectedSubPlanId = selectedSubPlanId && plans.some(p => p._id === selectedSubPlanId) ? selectedSubPlanId : plans[0]._id;

    plans.forEach(plan => {
      const btn = document.createElement('button');
      btn.className = 'plan-card';
      btn.classList.toggle('active', plan._id === selectedSubPlanId);
      btn.dataset.planId = plan._id;

      const left = document.createElement('div');
      left.className = 'plan-card__left';
      const name = document.createElement('div');
      name.className = 'plan-card__name';
      name.textContent = plan.name || 'Plan';
      const desc = document.createElement('div');
      desc.className = 'plan-card__desc';
      const picks = plan.pickupsPerMonth == null ? 'Unlimited pickups' : `${plan.pickupsPerMonth} pickups/month`;
      desc.textContent = `${plan.includedItems || 0} items • ${picks} • ${plan.turnaroundText || ''}`;
      left.appendChild(name);
      left.appendChild(desc);

      const right = document.createElement('div');
      right.className = 'plan-card__right';
      const price = document.createElement('div');
      price.className = 'plan-card__price';
      const p = plan.waitlistPrice || plan.price;
      price.textContent = `₦${formatNaira(p)}`;
      const unit = document.createElement('div');
      unit.className = 'plan-card__unit';
      unit.textContent = 'per month';
      right.appendChild(price);
      right.appendChild(unit);

      btn.appendChild(left);
      btn.appendChild(right);
      btn.addEventListener('click', () => {
        selectedSubPlanId = plan._id;
        Array.from(wrap.querySelectorAll('.plan-card')).forEach(x => x.classList.toggle('active', x.dataset.planId === selectedSubPlanId));
      });
      wrap.appendChild(btn);
    });
  }

  async function handleSubscribePay() {
    if (!user) return;
    const btn = document.getElementById('btn-subscribe-pay');
    setButtonLoading(btn, true);
    try {
      const allPlans = await SpaccleDB.listPlans({ includeInactive: false });
      const selected = allPlans.find(p => p._id === selectedSubPlanId);
      if (!selected) {
        showToast('Select a plan');
        return;
      }

      const cfg = await SpaccleDB.getPreference('integrations_config', null);
      const pk = (cfg?.paystackPublicKey || getConfig().paystack?.publicKey || '').trim();
      if (!pk) {
        showToast('Paystack key missing');
        return;
      }

      await loadPaystack();
      const email = user?.email || 'test@example.com';
      const reference = `SPACCLE_SUB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      const amountNaira = selected.waitlistPrice || selected.price;
      const amountKobo = Math.round(Number(amountNaira) * 100);

      const handler = window.PaystackPop.setup({
        key: pk,
        email,
        amount: amountKobo,
        currency: 'NGN',
        ref: reference,
        callback: function() {
          SpaccleDB.setSubscription({ userId: user.userId, planId: selected._id, useWaitlistPrice: true })
            .then(function() { return SpaccleDB.getSubscription(user.userId); })
            .then(function(sub) {
              subscription = sub;
              closeAllSheets();
              showToast('Subscription active!');
              billingMode = 'subscription';
              updateBillingUI();
            })
            .catch(function() { showToast('Subscribed but could not update UI — please restart'); });
        },
        onClose: function() {
          showToast('Payment closed');
        },
      });
      handler.openIframe();
    } catch (err) {
      showToast('Could not subscribe: ' + (err?.message || 'unknown error'));
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function normalizeDbName(name) {
    const trimmed = String(name || '').trim();
    const prefix = 'spacclelaundry';
    if (!trimmed) return 'spacclelaundry_spaccle';
    if (trimmed.startsWith(prefix)) return trimmed;
    return 'spacclelaundry_spaccle';
  }

  function bindSyncUI() {
    SpaccleDB.getSyncConfig().then(cfg => {
      if (cfg && cfg.remoteUrl) SpaccleDB.startSync().catch(() => { });
    });
  }

  function toggleTrackMap() {
    ensureMapLoadedAndShown(false);
  }

  async function ensureMapLoadedAndShown(forceShow) {
    const mapEl = document.getElementById('track-map');
    if (!mapEl) return;
    const showing = mapEl.style.display !== 'none';
    if (showing && !forceShow) {
      mapEl.style.display = 'none';
      return;
    }
    await ensureMapLoadedAndShownInternal(mapEl);
  }

  async function ensureMapLoadedAndShownInternal(mapEl) {
    const cfg = await SpaccleDB.getPreference('integrations_config', null);
    const key = (cfg?.mapsApiKey || getConfig().googleMaps?.apiKey || '').trim();
    if (!key) {
      showToast('Add your Maps API key in Integrations');
      openIntegrations();
      return;
    }

    try {
      await loadGoogleMaps(key);
    } catch {
      showToast('Google Maps failed to load');
      return;
    }

    mapEl.style.display = '';
    if (mapEl.dataset.ready === 'true') return;

    const lagos = { lat: 6.5244, lng: 3.3792 };
    const pickup = { lat: 6.5340, lng: 3.3700 };
    const facility = { lat: 6.5150, lng: 3.3900 };

    const map = new window.google.maps.Map(mapEl, {
      center: lagos,
      zoom: 13,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    });

    new window.google.maps.Marker({ position: pickup, map, title: 'Pickup' });
    new window.google.maps.Marker({ position: facility, map, title: 'Laundry Facility' });

    new window.google.maps.Polyline({
      path: [pickup, facility],
      geodesic: true,
      strokeColor: '#5B4FBE',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      map,
    });

    mapEl.dataset.ready = 'true';
  }

  function loadGoogleMaps(apiKey) {
    if (window.google?.maps) return Promise.resolve(true);
    if (window._spaccleMapsPromise) return window._spaccleMapsPromise;

    window._spaccleMapsPromise = new Promise((resolve, reject) => {
      const callbackName = '_spaccleMapsInit_' + Math.random().toString(36).slice(2, 9);
      window[callbackName] = () => {
        try { delete window[callbackName]; } catch { }
        resolve(true);
      };

      const script = document.createElement('script');
      const encodedKey = encodeURIComponent(apiKey);
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodedKey}&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => reject(new Error('MAPS_LOAD_FAILED'));
      document.head.appendChild(script);
    });

    return window._spaccleMapsPromise;
  }

  function loadPaystack() {
    // paystack_inline.js is bundled in index.html — should already be available
    if (window.PaystackPop) return Promise.resolve(true);
    // Fallback: try loading remotely (browser/dev mode)
    if (window._spacclePaystackPromise) return window._spacclePaystackPromise;
    window._spacclePaystackPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/paystack_inline.js';
      script.onload = () => { if (window.PaystackPop) resolve(true); else reject(new Error('PaystackPop not defined after load')); };
      script.onerror = () => reject(new Error('Paystack script failed to load'));
      document.head.appendChild(script);
    });
    return window._spacclePaystackPromise;
  }

  /* ── Profile — Personal Information ─────────────────────────── */
  async function openProfileInfo() {
    if (!user) return;
    const profile = await SpaccleDB.getUserProfile(user.userId);
    document.getElementById('pi-name').value = profile?.name || user.name || '';
    document.getElementById('pi-email').value = profile?.email || user.email || '';
    document.getElementById('pi-phone').value = profile?.phone || '';
    openSheet('sheet-profile-info');
  }

  async function handleProfileInfoSave() {
    if (!user) return;
    const btn = document.getElementById('btn-profile-info-save');
    const name = document.getElementById('pi-name').value.trim();
    const phone = document.getElementById('pi-phone').value.trim();
    if (!name) { document.getElementById('pi-name').focus(); showToast('Name is required'); return; }
    setButtonLoading(btn, true);
    try {
      const updated = await SpaccleDB.updateUserProfile(user.userId, { name, phone });
      user = SpaccleDB.getSession();
      document.getElementById('profile-name').textContent = updated.name;
      document.getElementById('home-greeting-name').textContent = (updated.name || '').split(' ')[0];
      document.getElementById('home-avatar-letter').textContent = updated.name[0].toUpperCase();
      document.getElementById('profile-avatar-lg').textContent = updated.name[0].toUpperCase();
      closeAllSheets();
      showToast('Profile updated');
    } catch {
      showToast('Could not save profile');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /* ── Profile — Saved Addresses ───────────────────────────────── */
  async function openProfileAddresses() {
    if (!user) return;
    hideAddressForm();
    await renderAddressList();
    openSheet('sheet-profile-addresses');
  }

  async function renderAddressList() {
    const list = await SpaccleDB.getAddresses(user.userId);
    const container = document.getElementById('addresses-list');
    container.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'tab-subtitle';
      empty.style.margin = '12px 0';
      empty.textContent = 'No saved addresses yet.';
      container.appendChild(empty);
      return;
    }
    list.forEach(addr => {
      const item = document.createElement('div');
      item.className = 'address-item';
      item.innerHTML = `
        <div class="address-item__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="#06D6A0" stroke-width="1.8" fill="none"/><circle cx="12" cy="10" r="3" stroke="#06D6A0" stroke-width="1.8"/></svg>
        </div>
        <div class="address-item__body">
          <div class="address-item__label">${escHtml(addr.label || 'Address')}</div>
          <div class="address-item__street">${escHtml(addr.street || '')}${addr.city ? ', ' + escHtml(addr.city) : ''}</div>
          ${addr.isDefault ? '<div class="address-item__default">Default</div>' : ''}
        </div>
        <button class="address-item__delete" data-addr-id="${escHtml(addr.id)}" aria-label="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>`;
      item.querySelector('.address-item__delete').addEventListener('click', async e => {
        const id = e.currentTarget.dataset.addrId;
        await SpaccleDB.deleteAddress(user.userId, id);
        await renderAddressList();
      });
      container.appendChild(item);
    });
  }

  function showAddressForm() {
    document.getElementById('address-add-form').style.display = '';
    document.getElementById('btn-addr-add').style.display = 'none';
    document.getElementById('addr-label').value = '';
    document.getElementById('addr-street').value = '';
    document.getElementById('addr-city').value = 'Lagos';
    document.getElementById('addr-default').checked = false;
  }

  function hideAddressForm() {
    document.getElementById('address-add-form').style.display = 'none';
    document.getElementById('btn-addr-add').style.display = '';
  }

  async function handleAddressSave() {
    if (!user) return;
    const btn = document.getElementById('btn-addr-save');
    const label = document.getElementById('addr-label').value.trim();
    const street = document.getElementById('addr-street').value.trim();
    const city = document.getElementById('addr-city').value.trim() || 'Lagos';
    const isDefault = document.getElementById('addr-default').checked;
    if (!street) { document.getElementById('addr-street').focus(); showToast('Enter a street address'); return; }
    setButtonLoading(btn, true);
    try {
      await SpaccleDB.saveAddress(user.userId, { label: label || 'Home', street, city, isDefault });
      hideAddressForm();
      await renderAddressList();
      showToast('Address saved');
    } catch {
      showToast('Could not save address');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /* ── Profile — Notifications ─────────────────────────────────── */
  async function openProfileNotifications() {
    const prefs = await SpaccleDB.getPreference('notification_prefs', {});
    document.getElementById('notif-order-updates').checked = prefs.orderUpdates !== false;
    document.getElementById('notif-order-ready').checked = prefs.orderReady !== false;
    document.getElementById('notif-promos').checked = prefs.promos === true;
    document.getElementById('notif-sub-reminders').checked = prefs.subReminders !== false;
    openSheet('sheet-profile-notifications');
  }

  async function handleNotifSave() {
    const btn = document.getElementById('btn-notif-save');
    setButtonLoading(btn, true);
    try {
      await SpaccleDB.setPreference('notification_prefs', {
        orderUpdates: document.getElementById('notif-order-updates').checked,
        orderReady: document.getElementById('notif-order-ready').checked,
        promos: document.getElementById('notif-promos').checked,
        subReminders: document.getElementById('notif-sub-reminders').checked,
      });
      closeAllSheets();
      showToast('Notification preferences saved');
    } catch {
      showToast('Could not save preferences');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /* ── Notifications ──────────────────────────────────────────── */
  let _lastKnownOrderStatus = null;

  function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  async function fireOrderNotification(title, body) {
    const prefs = await SpaccleDB.getPreference('notification_prefs', {});
    if (prefs.orderUpdates === false && prefs.orderReady === false) return;

    // In-app badge
    const badge = document.getElementById('home-notify-badge');
    if (badge) badge.textContent = '1';

    // OS notification (browser / Cordova WebView with permission)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: 'img/icon.png' });
      } catch { }
    }
  }

  async function checkOrderStatusChange(order) {
    if (!order) return;
    const prefs = await SpaccleDB.getPreference('notification_prefs', {});
    if (_lastKnownOrderStatus === order.status) return;
    const prev = _lastKnownOrderStatus;
    _lastKnownOrderStatus = order.status;
    if (!prev) return; // first load — don't fire

    const messages = {
      picked_up: { title: 'Order Picked Up', body: `Your laundry (#${order.publicId || 'SP-000000'}) has been collected.` },
      cleaning:  { title: 'Cleaning in Progress', body: `Your laundry (#${order.publicId || 'SP-000000'}) is being cleaned.` },
      ready:     { title: 'Ready for Delivery 🎉', body: `Your laundry (#${order.publicId || 'SP-000000'}) is ready!` },
      delivered: { title: 'Delivered', body: `Your laundry (#${order.publicId || 'SP-000000'}) has been delivered.` },
    };

    const msg = messages[order.status];
    if (!msg) return;
    if (order.status === 'ready' && prefs.orderReady === false) return;
    if (order.status !== 'ready' && prefs.orderUpdates === false) return;
    await fireOrderNotification(msg.title, msg.body);
  }

  /* ── Profile — App Settings ──────────────────────────────────── */
  async function openProfileSettings() {
    const s = await SpaccleDB.getPreference('app_settings', {});
    document.getElementById('setting-show-prices').checked = s.showPrices !== false;
    document.getElementById('setting-compact-list').checked = s.compactList === true;
    document.getElementById('setting-confirm-schedule').checked = s.confirmSchedule !== false;
    document.getElementById('setting-autofill-addr').checked = s.autofillAddr !== false;
    openSheet('sheet-profile-settings');
  }

  async function handleSettingsSave() {
    const btn = document.getElementById('btn-settings-save');
    setButtonLoading(btn, true);
    try {
      await SpaccleDB.setPreference('app_settings', {
        showPrices: document.getElementById('setting-show-prices').checked,
        compactList: document.getElementById('setting-compact-list').checked,
        confirmSchedule: document.getElementById('setting-confirm-schedule').checked,
        autofillAddr: document.getElementById('setting-autofill-addr').checked,
      });
      closeAllSheets();
      showToast('Settings saved');
    } catch {
      showToast('Could not save settings');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Toast ───────────────────────────────────────────────────── */
  function showToast(message) {
    let toast = document.getElementById('spaccle-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'spaccle-toast';
      toast.style.cssText = `
        position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%) translateY(20px);
        background: #1C1B3A; color: white; font-size: 13px; font-weight: 500;
        padding: 11px 20px; border-radius: 999px; z-index: 9999;
        opacity: 0; transition: opacity 0.25s, transform 0.25s; white-space: nowrap;
        pointer-events: none; max-width: calc(100vw - 40px);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    clearTimeout(toast._timer);
    // show
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2600);
  }

  return { init };
})();
