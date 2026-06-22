/* ── Admin Page ─────────────────────────────────────────────────────── */
const AdminPage = (() => {

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  let user = null;
  let activeTab = 'dashboard';
  let editingPlanId = null;
  let currentOrderId = null;
  let currentUserId = null;
  let currentTicketId = null;
  let allOrders = [];
  let currentOrderFilter = 'all';
  let currentSupportFilter = 'all';

function init(data = {}) {
    user = data.user;
    setupTabs();
    setupActions();
    setupSearch();
    switchTab('orders');
    renderUser();
    initAdminTheme();
    startAdminNotifWatch();
  }

  function renderUser() {
    // Admin identity display — no dedicated header element; no-op unless one is added
  }

  function setupSearch() {
    // Per-tab search bars are wired inside loadOrders() / loadUsers() on first render
  }

  /* ── Tabs ────────────────────────────────────────────────────────── */
  function setupTabs() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.admin-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.admin-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'admin-panel-' + tab));
    loadTab(tab);
  }

  function loadTab(tab) {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'orders')    loadOrders(currentOrderFilter);
    if (tab === 'users')     loadUsers();
    if (tab === 'support')   loadSupport(currentSupportFilter);
    if (tab === 'messages')  loadMessages();
    if (tab === 'riders')    loadRiders();
    if (tab === 'plans')     loadPlans();
    if (tab === 'config')    loadConfig();
  }

  /* ── Actions ─────────────────────────────────────────────────────── */
  function setupActions() {
    document.getElementById('btn-admin-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-admin-theme').addEventListener('click', handleAdminThemeToggle);
    document.getElementById('btn-admin-notif').addEventListener('click', openAdminNotifPanel);
    document.getElementById('btn-admin-notif-close').addEventListener('click', closeAdminNotifPanel);
    document.getElementById('admin-notif-backdrop').addEventListener('click', closeAdminNotifPanel);
    document.getElementById('btn-admin-notif-clear').addEventListener('click', clearAdminNotifs);

    // Dashboard
    document.getElementById('btn-admin-dash-refresh').addEventListener('click', loadDashboard);

    // Orders
    document.getElementById('btn-admin-orders-refresh').addEventListener('click', () =>
      loadOrders(currentOrderFilter));
    document.querySelectorAll('#admin-orders-filter .admin-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        currentOrderFilter = pill.dataset.filter;
        document.querySelectorAll('#admin-orders-filter .admin-filter-pill')
          .forEach(p => p.classList.toggle('active', p === pill));
        renderFilteredOrders();
      });
    });
    document.getElementById('btn-admin-order-close').addEventListener('click', closeOrderDetail);
    document.getElementById('admin-order-backdrop').addEventListener('click', closeOrderDetail);

    // Riders
    document.getElementById('btn-admin-riders-refresh').addEventListener('click', loadRiders);
    document.getElementById('btn-admin-rider-close').addEventListener('click', closeRiderDetail);
    document.getElementById('admin-rider-backdrop').addEventListener('click', closeRiderDetail);
    document.getElementById('btn-admin-rider-toggle-active').addEventListener('click', handleRiderToggleActive);

    // Users
    document.getElementById('btn-admin-users-refresh').addEventListener('click', loadUsers);
    document.getElementById('btn-admin-user-close').addEventListener('click', closeUserDetail);
    document.getElementById('admin-user-backdrop').addEventListener('click', closeUserDetail);

    // Support
    document.getElementById('btn-admin-support-refresh').addEventListener('click', () =>
      loadSupport(currentSupportFilter));
    document.querySelectorAll('#admin-support-filter .admin-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        currentSupportFilter = pill.dataset.filter;
        document.querySelectorAll('#admin-support-filter .admin-filter-pill')
          .forEach(p => p.classList.toggle('active', p === pill));
        loadSupport(currentSupportFilter);
      });
    });
    document.getElementById('btn-admin-ticket-close').addEventListener('click', closeTicket);
    document.getElementById('admin-ticket-backdrop').addEventListener('click', closeTicket);
    document.getElementById('btn-admin-ticket-resolve').addEventListener('click', () =>
      handleTicketStatus('resolved'));
    document.getElementById('btn-admin-ticket-reopen').addEventListener('click', () =>
      handleTicketStatus('open'));
    document.getElementById('btn-admin-ticket-reply').addEventListener('click', handleTicketReply);
    document.getElementById('admin-ticket-reply-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTicketReply(); }
    });

    // Plans
    document.getElementById('btn-admin-add-plan').addEventListener('click', () =>
      openPlanEditor(null));
    document.getElementById('btn-admin-plan-editor-close').addEventListener('click', closePlanEditor);
    document.getElementById('admin-plan-editor-backdrop').addEventListener('click', closePlanEditor);
    document.getElementById('btn-admin-plan-save').addEventListener('click', handlePlanSave);

    // Messages
    document.getElementById('btn-admin-messages-refresh').addEventListener('click', loadMessages);
    document.getElementById('btn-admin-chat-close').addEventListener('click', closeAdminChat);
    document.getElementById('admin-chat-backdrop').addEventListener('click', closeAdminChat);
    document.getElementById('btn-admin-chat-send').addEventListener('click', handleAdminChatSend);
    document.getElementById('admin-chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdminChatSend(); }
    });

    // Config
    document.getElementById('btn-admin-cfg-save').addEventListener('click', handleConfigSave);
    document.getElementById('btn-admin-appearance-save').addEventListener('click', handleAdminAppearanceSave);
    document.getElementById('btn-admin-sync-start').addEventListener('click', handleSyncStart);
    document.getElementById('btn-admin-services-save').addEventListener('click', handleServicesSave);
    document.getElementById('btn-admin-item-pricing-save').addEventListener('click', handleItemPricingSave);
    document.getElementById('btn-admin-legal-save').addEventListener('click', handleLegalSave);
    document.getElementById('btn-admin-promo-add').addEventListener('click', handlePromoAdd);

    // Dashboard extras
    document.getElementById('btn-admin-broadcast-send').addEventListener('click', handleBroadcastSend);
    document.getElementById('btn-admin-export-csv').addEventListener('click', exportOrdersCSV);
    document.getElementById('btn-admin-export-pdf').addEventListener('click', exportOrdersPDF);

    // Order overlay: driver assign
    document.getElementById('btn-admin-driver-assign').addEventListener('click', handleDriverAssign);
    document.getElementById('btn-admin-rider-change')?.addEventListener('click', () => {
      const info = document.getElementById('admin-order-rider-info');
      const form = document.getElementById('admin-order-assign-form');
      if (info) info.style.display = 'none';
      if (form) form.style.display = '';
    });
  }

  function handleLogout() {
    SpaccleDB.logout();
    App.navigate('auth');
  }

  /* ── Dashboard ──────────────────────────────────────────────────── */
  async function loadDashboard() {
    const revEl       = document.getElementById('stat-revenue');
    const subsEl      = document.getElementById('stat-subs');
    const ordMoEl     = document.getElementById('stat-orders-month');
    const tickEl      = document.getElementById('stat-open-tickets');
    const rowsEl      = document.getElementById('admin-stat-rows');
    const recentEl    = document.getElementById('admin-recent-orders');

    [revEl, subsEl, ordMoEl, tickEl].forEach(el => { if (el) el.textContent = '…'; });

    try {
      const [orders, subs, users, tickets] = await Promise.all([
        SpaccleDB.listAllOrders(),
        SpaccleDB.listAllSubscriptions(),
        SpaccleDB.listAllUsers(),
        SpaccleDB.listAllSupportTickets(),
      ]);

      const paygRev  = orders.reduce((s, o) => s + (Number(o.amountPaid) || 0), 0);
      const subRev   = subs.reduce((s, sub) => s + (Number(sub.pricePaid) || 0), 0);
      const totalRev = paygRev + subRev;

      const activeSubs   = subs.filter(s => s.active !== false && s.status !== 'cancelled');
      const openTickets  = tickets.filter(t => t.status !== 'resolved');

      const now = new Date();
      const thisMonthOrders = orders.filter(o => {
        if (!o.createdAt) return false;
        const d = new Date(o.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });

      if (revEl)   revEl.textContent   = `₦${formatNaira(totalRev)}`;
      if (subsEl)  subsEl.textContent  = activeSubs.length;
      if (ordMoEl) ordMoEl.textContent = thisMonthOrders.length;
      if (tickEl)  tickEl.textContent  = openTickets.length;

      if (rowsEl) {
        rowsEl.innerHTML = '';
        [
          ['Total Users',              users.length],
          ['Total Orders (All Time)',  orders.length],
          ['PAYG Revenue',            `₦${formatNaira(paygRev)}`],
          ['Subscription Revenue',    `₦${formatNaira(subRev)}`],
          ['Total Subscriptions',      subs.length],
          ['Resolved Tickets',         tickets.length - openTickets.length],
        ].forEach(([label, value]) => {
          const row = document.createElement('div');
          row.className = 'admin-stat-row';
          row.innerHTML =
            `<span class="admin-stat-row__label">${label}</span>` +
            `<span class="admin-stat-row__value">${value}</span>`;
          rowsEl.appendChild(row);
        });
      }

      if (recentEl) {
        recentEl.innerHTML = '';
        if (!orders.length) {
          recentEl.innerHTML = '<div class="admin-empty">No orders yet.</div>';
        } else {
          orders.slice(0, 10).forEach(o => recentEl.appendChild(buildOrderCard(o)));
        }
      }

      renderRevenueChart(orders, subs);
    } catch {
      [revEl, subsEl, ordMoEl, tickEl].forEach(el => { if (el) el.textContent = 'ERR'; });
    }
  }

  function renderRevenueChart(orders, subs) {
    const el = document.getElementById('admin-revenue-chart');
    if (!el) return;

    const days = 7;
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.push({ label: d.toLocaleDateString('en-NG', { weekday: 'short' }), rev: 0 });
    }

    orders.forEach(o => {
      if (!o.createdAt || !o.amountPaid) return;
      const d   = new Date(o.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays < days) buckets[days - 1 - diffDays].rev += Number(o.amountPaid) || 0;
    });
    subs.forEach(s => {
      if (!s.createdAt || !s.pricePaid) return;
      const d   = new Date(s.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays < days) buckets[days - 1 - diffDays].rev += Number(s.pricePaid) || 0;
    });

    const maxRev = Math.max(...buckets.map(b => b.rev), 1);
    const W = 300, H = 80, bw = Math.floor(W / days) - 4;

    let bars = '';
    let labels = '';
    buckets.forEach((b, i) => {
      const barH = Math.max(2, Math.round((b.rev / maxRev) * H));
      const x    = i * (W / days) + 2;
      const y    = H - barH;
      bars   += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" rx="3" fill="#5B4FBE" opacity="0.8"/>`;
      labels += `<text x="${x + bw / 2}" y="${H + 14}" text-anchor="middle" font-size="9" fill="#888">${b.label}</text>`;
    });

    el.innerHTML =
      `<svg viewBox="0 0 ${W} ${H + 18}" style="width:100%;height:${H + 18}px">` +
      bars + labels + `</svg>`;
  }

  /* ── Orders ─────────────────────────────────────────────────────── */
  let orderSearchTerm = '';

  async function loadOrders(filter) {
    orderSearchTerm = '';
    const searchEl = document.getElementById('admin-orders-search');
    if (searchEl) searchEl.value = '';
    currentOrderFilter = filter || 'all';
    const list = document.getElementById('admin-orders-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';

    const panel = document.getElementById('admin-panel-orders');
    if (panel && !panel.querySelector('.admin-search-bar')) {
      const bar = document.createElement('div');
      bar.className = 'admin-search-bar';
      bar.innerHTML =
        `<input class="form-input" id="admin-orders-search" placeholder="Search by ID, address, notes…" style="margin-bottom:8px">`;
      panel.insertBefore(bar, document.getElementById('admin-orders-filter'));
      let searchDebounce = null;
      document.getElementById('admin-orders-search').addEventListener('input', e => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          orderSearchTerm = e.target.value.toLowerCase();
          renderFilteredOrders();
        }, 200);
      });
    }

    try {
      allOrders = await SpaccleDB.listAllOrders();
      renderFilteredOrders();
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load orders.</div>';
    }
  }

  function renderFilteredOrders() {
    const list = document.getElementById('admin-orders-list');
    let filtered = currentOrderFilter === 'all'
      ? allOrders
      : allOrders.filter(o => o.status === currentOrderFilter);

    if (orderSearchTerm) {
      filtered = filtered.filter(o => {
        const haystack = [
          o.publicId, o._id, o.address, o.notes, o.status, o.service,
        ].join(' ').toLowerCase();
        return haystack.includes(orderSearchTerm);
      });
    }

    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div class="admin-empty">No orders found.</div>';
      return;
    }
    filtered.slice(0, 150).forEach(order => {
      const card = buildOrderCard(order);
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => openOrderDetail(order));
      list.appendChild(card);
    });
    if (filtered.length > 150) {
      const notice = document.createElement('div');
      notice.className = 'admin-empty';
      notice.style.cssText = 'padding:8px 0;font-size:12px;color:var(--text-3)';
      notice.textContent = `Showing first 150 of ${filtered.length} results`;
      list.appendChild(notice);
    }
  }

  function buildOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'admin-card';

    const left = document.createElement('div');
    left.className = 'admin-card__left';

    const title = document.createElement('div');
    title.className = 'admin-card__title';
    title.textContent = order.publicId || order._id.slice(-8).toUpperCase();

    const meta = document.createElement('div');
    meta.className = 'admin-card__meta';
    const modeTag = order.billingMode === 'subscription' ? 'Sub' : 'PAYG';
    const amtTag  = order.amountPaid ? ` · ₦${formatNaira(order.amountPaid)}` : '';
    meta.textContent = `${serviceLabel(order.service)} · ${modeTag}${amtTag} · ${formatTime(order.createdAt)}`;

    const right = document.createElement('div');
    right.className = 'admin-card__right';

    const pill = document.createElement('div');
    pill.className = 'admin-card__pill ' + statusPillClass(order.status);
    pill.textContent = statusLabel(order.status);

    left.appendChild(title);
    left.appendChild(meta);
    right.appendChild(pill);
    card.appendChild(left);
    card.appendChild(right);
    return card;
  }

  function openOrderDetail(order) {
    currentOrderId = order._id;
    document.getElementById('admin-order-title').textContent =
      order.publicId || order._id.slice(-8).toUpperCase();

    const detailEl = document.getElementById('admin-order-details');
    const rows = [
      ['Status',       escapeHtml(statusLabel(order.status))],
      ['Service',      escapeHtml(serviceLabel(order.service))],
      ['Billing',      order.billingMode === 'subscription' ? 'Subscription' : 'Pay As You Go'],
      ['Items',        escapeHtml(String(order.itemsCount || '—'))],
      ['Amount Paid',  order.amountPaid ? `₦${formatNaira(order.amountPaid)}` : '—'],
      ['Paystack Ref', escapeHtml(order.paystackRef || '—')],
      ['Pickup Day',   escapeHtml(order.pickupDay   || '—')],
      ['Pickup Time',  escapeHtml(order.pickupTime  || '—')],
      ['Address',      escapeHtml(order.address     || '—')],
      ['Notes',        escapeHtml(order.notes       || '—')],
      ['Created',      escapeHtml(formatDateTime(order.createdAt))],
    ];
    if (order.exceedsItems)    rows.push(['⚠ Exceeds Plan', `Yes — ${escapeHtml(String(order.extraItemsCount || 0))} extra items`]);
    if (order.recurring)       rows.push(['Recurring',      'Set as recurring pickup']);
    if (order.rating)          rows.push(['Rating', '★'.repeat(order.rating) + ' ' + escapeHtml(order.ratingNote || '')]);
    if (order.assignedDriver)  rows.push(['Driver / Agent', escapeHtml(order.assignedDriver)]);
    else if (order.riderId)    rows.push(['Rider ID',      escapeHtml(order.riderId)]);
    detailEl.innerHTML = rows.map(([l, v]) =>
      `<div class="admin-detail-row">` +
      `<span class="admin-detail-row__label">${escapeHtml(l)}</span>` +
      `<span class="admin-detail-row__value">${v}</span></div>`
    ).join('');

    const actionsEl = document.getElementById('admin-order-status-actions');
    actionsEl.innerHTML = '';
    const btnDefs = [
      { label: 'Confirm Order',        status: 'confirmed',  trigger: ['scheduled'],                                       ghost: false },
      { label: 'Mark Picked Up',       status: 'picked_up',  trigger: ['confirmed', 'assigned'],                          ghost: false },
      { label: 'Mark Processing',      status: 'processing', trigger: ['picked_up'],                                      ghost: false },
      { label: 'Mark Cleaning',        status: 'cleaning',   trigger: ['processing'],                                     ghost: false },
      { label: 'Mark Ready',           status: 'ready',      trigger: ['cleaning', 'processing'],                         ghost: false },
      { label: 'Mark In Transit',      status: 'in_transit', trigger: ['ready'],                                          ghost: false },
      { label: 'Mark Completed',       status: 'completed',  trigger: ['delivered', 'in_transit'],                        ghost: false },
      { label: 'Cancel Order',         status: 'cancelled',  trigger: ['scheduled', 'confirmed', 'assigned', 'picked_up'], ghost: true },
    ];
    btnDefs.forEach(def => {
      if (!def.trigger.includes(order.status)) return;
      const btn = document.createElement('button');
      btn.className = 'btn ' + (def.ghost ? 'btn--ghost' : 'btn--primary') + ' btn--full';
      btn.style.marginBottom = '8px';
      btn.textContent = def.label;
      btn.addEventListener('click', () => handleOrderStatusUpdate(order, def.status, btn));
      actionsEl.appendChild(btn);
    });
    if (!actionsEl.children.length) {
      actionsEl.innerHTML =
        '<div class="admin-empty" style="padding:8px 0;font-size:12px">No further actions available.</div>';
    }

    loadRidersForSelect();

    const hasRider = !!(order.riderId || order.assignedDriver);
    const riderInfo = document.getElementById('admin-order-rider-info');
    const assignForm = document.getElementById('admin-order-assign-form');
    if (riderInfo) {
      if (hasRider) {
        document.getElementById('admin-order-current-rider').textContent =
          'Currently: ' + (order.assignedDriver || order.riderId);
        riderInfo.style.display = '';
        if (assignForm) assignForm.style.display = 'none';
      } else {
        riderInfo.style.display = 'none';
        if (assignForm) assignForm.style.display = '';
      }
    }

    document.getElementById('admin-order-overlay').classList.add('open');
  }

  function closeOrderDetail() {
    document.getElementById('admin-order-overlay').classList.remove('open');
    currentOrderId = null;
  }

  async function handleOrderStatusUpdate(order, newStatus, btn) {
    btn.classList.add('loading');
    try {
      await SpaccleDB.setOrderStatus(order._id, newStatus);
      closeOrderDetail();
      await loadOrders(currentOrderFilter);
      if (activeTab === 'dashboard') loadDashboard();
      showToast('Order marked ' + statusLabel(newStatus));
    } catch {
      showToast('Could not update order status');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function handleDriverAssign() {
    if (!currentOrderId) return;
    const select = document.getElementById('admin-rider-select');
    const input = document.getElementById('admin-driver-input');
    const riderId = select?.value;
    const riderName = input?.value?.trim();
    if (!riderId && !riderName) { showToast('Select or enter a rider'); return; }
    const btn = document.getElementById('btn-admin-driver-assign');
    btn.classList.add('loading');
    try {
      await SpaccleDB.assignRiderToOrder(currentOrderId, riderId || null, riderName || null);
      if (input) input.value = '';
      if (select) select.value = '';
      showToast('Rider assigned');
      closeOrderDetail();
      await loadOrders(currentOrderFilter);
    } catch {
      showToast('Could not assign rider');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function loadRidersForSelect() {
    const select = document.getElementById('admin-rider-select');
    if (!select) return;
    try {
      const riders = await SpaccleDB.listAllRiders();
      select.innerHTML = '<option value="">Select a rider…</option>' +
        riders.map(r => `<option value="${r._id}">${r.name}</option>`).join('');
    } catch {
      select.innerHTML = '<option value="">Select a rider…</option>';
    }
  }

  /* ── Users ──────────────────────────────────────────────────────── */
  async function loadUsers() {
    const list = document.getElementById('admin-users-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      const [users, subs] = await Promise.all([
        SpaccleDB.listAllUsers(),
        SpaccleDB.listAllSubscriptions(),
      ]);
      list.innerHTML = '';
      if (!users.length) {
        list.innerHTML = '<div class="admin-empty">No users found.</div>';
        return;
      }
      const subMap = {};
      subs.forEach(s => { subMap[s.userId] = s; });

      users.forEach(u => {
        const sub  = subMap[u._id];
        const card = document.createElement('div');
        card.className = 'admin-card';

        const left = document.createElement('div');
        left.className = 'admin-card__left';

        const title = document.createElement('div');
        title.className = 'admin-card__title';
        title.textContent = u.name || '(No name)';

        const meta = document.createElement('div');
        meta.className = 'admin-card__meta';
        meta.textContent = (u.email || '') + (u.createdAt ? ' · Joined ' + formatTime(u.createdAt) : '');

        const right = document.createElement('div');
        right.className = 'admin-card__right';

        const pill = document.createElement('div');
        pill.className = 'admin-card__pill';
        if (sub && sub.active !== false) {
          pill.textContent = 'Subscribed';
          pill.style.cssText = 'background:#E8F5E9;color:#2E7D32';
        } else {
          pill.textContent = 'PAYG';
          pill.style.cssText = 'background:#F5F5F5;color:#888';
        }

        left.appendChild(title);
        left.appendChild(meta);
        right.appendChild(pill);
        card.appendChild(left);
        card.appendChild(right);
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => openUserDetail(u, sub));
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load users.</div>';
    }
  }

  async function openUserDetail(u, sub) {
    currentUserId = u._id;
    document.getElementById('admin-user-title').textContent = u.name || u.email || 'User';

    const detailEl = document.getElementById('admin-user-details');
    const rows = [
      ['Name',    escapeHtml(u.name  || '—')],
      ['Email',   escapeHtml(u.email || '—')],
      ['Phone',   escapeHtml(u.phone || '—')],
      ['Role',    escapeHtml(u.role  || 'user')],
      ['Joined',  escapeHtml(formatDateTime(u.createdAt))],
    ];
    if (sub) {
      rows.push(['Plan',        escapeHtml(sub.planId   || '—')]);
      rows.push(['Sub Status',  sub.active !== false ? 'Active' : 'Inactive']);
      rows.push(['Sub Price',   sub.pricePaid ? `₦${escapeHtml(formatNaira(sub.pricePaid))}` : '—']);
      rows.push(['Items Used',  escapeHtml(String(sub.itemsUsed != null ? sub.itemsUsed : '—'))]);
      rows.push(['Sub Started', escapeHtml(formatDateTime(sub.createdAt))]);
    } else {
      rows.push(['Subscription', 'None (Pay As You Go)']);
    }
    detailEl.innerHTML = rows.map(([l, v]) =>
      `<div class="admin-detail-row">` +
      `<span class="admin-detail-row__label">${l}</span>` +
      `<span class="admin-detail-row__value">${v}</span></div>`
    ).join('');

    document.getElementById('admin-user-overlay').classList.add('open');

    const ordersEl = document.getElementById('admin-user-orders');
    ordersEl.innerHTML = '<div class="admin-empty" style="font-size:12px;padding:8px 0">Loading…</div>';
    try {
      const userOrders = await SpaccleDB.getOrdersByUser(u._id);
      ordersEl.innerHTML = '';
      if (!userOrders.length) {
        ordersEl.innerHTML =
          '<div class="admin-empty" style="font-size:12px;padding:8px 0">No orders yet.</div>';
      } else {
        userOrders.slice(0, 10).forEach(o => ordersEl.appendChild(buildOrderCard(o)));
      }
    } catch {
      ordersEl.innerHTML =
        '<div class="admin-empty" style="font-size:12px;padding:8px 0">Failed to load.</div>';
    }
  }

  function closeUserDetail() {
    document.getElementById('admin-user-overlay').classList.remove('open');
    currentUserId = null;
  }

  /* ── Riders ─────────────────────────────────────────────────────── */
  let currentRiderId = null;

  async function loadRiders() {
    const list = document.getElementById('admin-riders-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      const [riders, orders] = await Promise.all([
        SpaccleDB.listAllRiders(),
        SpaccleDB.listAllOrders(),
      ]);

      list.innerHTML = '';
      if (!riders.length) {
        list.innerHTML = '<div class="admin-empty">No riders yet.</div>';
        return;
      }

      riders.forEach(r => {
        const riderOrders = orders.filter(o =>
          o.riderId === r._id || o.assignedDriver === r.name || o.assignedDriver === r._id);
        const completed = riderOrders.filter(o => ['delivered', 'completed'].includes(o.status));
        const active = r.isAvailable !== false;

        const card = document.createElement('div');
        card.className = 'admin-card';
        card.style.cursor = 'pointer';

        const left = document.createElement('div');
        left.className = 'admin-card__left';

        const title = document.createElement('div');
        title.className = 'admin-card__title';
        title.textContent = r.name || '(No name)';

        const meta = document.createElement('div');
        meta.className = 'admin-card__meta';
        meta.textContent = (r.email || '') + ` · ${completed.length} deliveries`;

        const right = document.createElement('div');
        right.className = 'admin-card__right';
        right.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px';

        const statusPill = document.createElement('div');
        statusPill.className = 'admin-card__pill';
        statusPill.textContent = active ? 'Online' : 'Offline';
        statusPill.style.cssText = active
          ? 'background:rgba(6,214,160,0.12);color:#06A07A'
          : 'background:#F5F5F5;color:#999';

        left.appendChild(title);
        left.appendChild(meta);
        right.appendChild(statusPill);
        card.appendChild(left);
        card.appendChild(right);
        card.addEventListener('click', () => openRiderDetail(r, riderOrders));
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load riders.</div>';
    }
  }

  async function openRiderDetail(r, riderOrders) {
    currentRiderId = r._id;
    document.getElementById('admin-rider-title').textContent = r.name || 'Rider';

    const detailEl = document.getElementById('admin-rider-details');
    const completed = (riderOrders || []).filter(o => ['delivered', 'completed'].includes(o.status));
    const totalEarnings = completed.reduce((s, o) => s + (Number(o.riderEarnings || o.deliveryFee) || 0), 0);
    const totalTips = completed.reduce((s, o) => s + (Number(o.tip) || 0), 0);

    detailEl.innerHTML = [
      ['Name',        escapeHtml(r.name  || '—')],
      ['Email',       escapeHtml(r.email || '—')],
      ['Phone',       escapeHtml(r.phone || '—')],
      ['Status',      r.isAvailable !== false ? 'Online' : 'Offline'],
      ['Active',      r.active !== false ? 'Yes' : 'Deactivated'],
      ['Joined',      escapeHtml(formatDateTime(r.createdAt))],
      ['Deliveries',  completed.length],
      ['Total Earned', `₦${formatNaira(totalEarnings)}`],
      ['Total Tips',  `₦${formatNaira(totalTips)}`],
    ].map(([l, v]) =>
      `<div class="admin-detail-row"><span class="admin-detail-row__label">${escapeHtml(l)}</span><span class="admin-detail-row__value">${v}</span></div>`
    ).join('');

    const toggleBtn = document.getElementById('btn-admin-rider-toggle-active');
    if (toggleBtn) {
      toggleBtn.textContent = r.active !== false ? 'Deactivate Rider' : 'Reactivate Rider';
      toggleBtn.dataset.riderId = r._id;
      toggleBtn.dataset.currentActive = r.active !== false ? 'true' : 'false';
    }

    // Recent orders
    const ordersEl = document.getElementById('admin-rider-orders');
    ordersEl.innerHTML = '';
    if (!riderOrders || !riderOrders.length) {
      ordersEl.innerHTML = '<div class="admin-empty" style="font-size:12px;padding:8px 0">No deliveries yet.</div>';
    } else {
      riderOrders.slice(0, 8).forEach(o => ordersEl.appendChild(buildOrderCard(o)));
    }

    // Payout requests
    const payoutsEl = document.getElementById('admin-rider-payouts');
    payoutsEl.removeEventListener('click', handlePayoutAction);
    payoutsEl.addEventListener('click', handlePayoutAction);
    payoutsEl.innerHTML = '<div class="admin-empty" style="font-size:12px;padding:8px 0">Loading…</div>';
    try {
      const payouts = await SpaccleDB.getRiderPayoutRequests(r._id);
      payoutsEl.innerHTML = '';
      if (!payouts.length) {
        payoutsEl.innerHTML = '<div class="admin-empty" style="font-size:12px;padding:8px 0">No payout requests.</div>';
      } else {
        payouts.forEach(p => {
          const row = document.createElement('div');
          row.className = 'admin-detail-row admin-detail-row--payout';
          const statusLabel = p.status === 'approved' ? 'Approved' : p.status === 'paid' ? 'Paid' : p.status === 'rejected' ? 'Rejected' : 'Pending';
          let actionsHtml = '';
          if (!p.status || p.status === 'pending') {
            actionsHtml = `
              <div class="admin-payout-actions">
                <button class="btn btn--sm btn--primary" data-payout-id="${p._id}" data-payout-action="approved">Approve</button>
                <button class="btn btn--sm btn--warn" data-payout-id="${p._id}" data-payout-action="rejected">Reject</button>
              </div>`;
          } else if (p.status === 'approved') {
            actionsHtml = `
              <div class="admin-payout-actions">
                <button class="btn btn--sm btn--primary" data-payout-id="${p._id}" data-payout-action="paid">Mark Paid</button>
              </div>`;
          }
          row.innerHTML =
            `<div class="admin-payout-info">` +
            `<span class="admin-detail-row__label">${formatTime(p.createdAt)}</span>` +
            `<span class="admin-detail-row__value">₦${formatNaira(p.amount)} — <em>${statusLabel}</em></span>` +
            `</div>` +
            actionsHtml;
          payoutsEl.appendChild(row);
        });
      }
    } catch {
      payoutsEl.innerHTML = '<div class="admin-empty" style="font-size:12px;padding:8px 0">Could not load.</div>';
    }

    document.getElementById('admin-rider-overlay').classList.add('open');
  }

  function closeRiderDetail() {
    document.getElementById('admin-rider-overlay').classList.remove('open');
    currentRiderId = null;
  }

  async function handlePayoutAction(e) {
    const btn = e.target.closest('[data-payout-id]');
    if (!btn) return;
    const payoutId = btn.dataset.payoutId;
    const action = btn.dataset.payoutAction;
    if (!payoutId || !action) return;
    btn.disabled = true;
    try {
      await SpaccleDB.updatePayoutStatus(payoutId, action);
      const riderId = currentRiderId;
      if (riderId) {
        const riderDoc = await SpaccleDB.getDocument(riderId);
        const allRiderOrders = await SpaccleDB.getRiderOrders();
        const riderOrders = allRiderOrders.filter(o => o.riderId === riderId || o.assignedDriver === riderId);
        await openRiderDetail(riderDoc, riderOrders);
      }
      showToast(action === 'paid' ? 'Marked as paid' : action === 'approved' ? 'Payout approved' : 'Payout rejected');
    } catch {
      showToast('Could not update payout');
      btn.disabled = false;
    }
  }

  async function handleRiderToggleActive() {
    const btn = document.getElementById('btn-admin-rider-toggle-active');
    const riderId = btn?.dataset.riderId;
    const isCurrentlyActive = btn?.dataset.currentActive === 'true';
    if (!riderId) return;
    btn.classList.add('loading');
    try {
      const doc = await SpaccleDB.getDocument(riderId);
      await SpaccleDB.saveDocument({ ...doc, active: !isCurrentlyActive });
      closeRiderDetail();
      await loadRiders();
      showToast(isCurrentlyActive ? 'Rider deactivated' : 'Rider reactivated');
    } catch {
      showToast('Could not update rider');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Support ────────────────────────────────────────────────────── */
  async function loadSupport(filter) {
    currentSupportFilter = filter || 'all';
    const list = document.getElementById('admin-tickets-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      const all = await SpaccleDB.listAllSupportTickets();
      const filtered = currentSupportFilter === 'all'   ? all
        : currentSupportFilter === 'open'               ? all.filter(t => t.status !== 'resolved')
        :                                                  all.filter(t => t.status === currentSupportFilter);
      list.innerHTML = '';
      if (!filtered.length) {
        list.innerHTML = '<div class="admin-empty">No tickets found.</div>';
        return;
      }
      filtered.slice(0, 100).forEach(t => {
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.style.cursor = 'pointer';

        const left = document.createElement('div');
        left.className = 'admin-card__left';

        const title = document.createElement('div');
        title.className = 'admin-card__title';
        title.textContent = t.subject || 'Support message';

        const meta = document.createElement('div');
        meta.className = 'admin-card__meta';
        const ref = t.orderId ? 'Order: ' + t.orderId : 'No order linked';
        meta.textContent = ref + ' · ' + formatTime(t.createdAt);

        const right = document.createElement('div');
        right.className = 'admin-card__right';

        const pill = document.createElement('div');
        pill.className = 'admin-card__pill ' +
          (t.status === 'resolved' ? 'admin-card__pill--resolved' : 'admin-card__pill--open');
        pill.textContent = t.status === 'resolved' ? 'Resolved' : 'Open';

        left.appendChild(title);
        left.appendChild(meta);
        right.appendChild(pill);
        card.appendChild(left);
        card.appendChild(right);
        card.addEventListener('click', () => openTicket(t));
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load tickets.</div>';
    }
  }

  function openTicket(t) {
    currentTicketId = t._id;
    document.getElementById('admin-ticket-subject').textContent = t.subject || 'Support message';

    const ref = t.orderId ? 'Order: ' + t.orderId.slice(-8).toUpperCase() : 'No order linked';
    document.getElementById('admin-ticket-meta').textContent =
      ref + ' · ' + formatDateTime(t.createdAt);

    const resolveBtn = document.getElementById('btn-admin-ticket-resolve');
    const reopenBtn  = document.getElementById('btn-admin-ticket-reopen');
    resolveBtn.style.display = t.status === 'resolved' ? 'none' : '';
    reopenBtn.style.display  = t.status === 'resolved' ? '' : 'none';

    // Hide reply bar if resolved
    const replyBar = document.getElementById('admin-ticket-reply-bar');
    if (replyBar) replyBar.style.display = t.status === 'resolved' ? 'none' : '';

    document.getElementById('admin-ticket-overlay').classList.add('open');
    loadTicketThread(t);
  }

  async function loadTicketThread(t) {
    const threadEl = document.getElementById('admin-ticket-thread');
    threadEl.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Loading…</div>';
    try {
      const replies = await SpaccleDB.getTicketReplies(t._id);

      threadEl.innerHTML = '';

      // First message (the original ticket)
      threadEl.appendChild(buildTicketBubble({
        text: t.message || '(no message)',
        fromAdmin: false,
        createdAt: t.createdAt,
        isFirst: true,
      }));

      // All replies in chronological order
      replies.forEach(r => threadEl.appendChild(buildTicketBubble(r)));

      threadEl.scrollTop = threadEl.scrollHeight;
    } catch {
      threadEl.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Could not load thread.</div>';
    }
  }

  function buildTicketBubble({ text, fromAdmin, createdAt, isFirst }) {
    const wrap = document.createElement('div');
    wrap.className = 'ticket-bubble-wrap ' + (fromAdmin ? 'ticket-bubble-wrap--admin' : 'ticket-bubble-wrap--user');

    const bubble = document.createElement('div');
    bubble.className = 'ticket-bubble ' + (fromAdmin ? 'ticket-bubble--admin' : 'ticket-bubble--user');

    if (isFirst) {
      const tag = document.createElement('div');
      tag.className = 'ticket-bubble__tag';
      tag.textContent = 'Customer';
      bubble.appendChild(tag);
    }

    const body = document.createElement('div');
    body.textContent = text;
    bubble.appendChild(body);

    const time = document.createElement('div');
    time.className = 'ticket-bubble__time';
    time.textContent = formatDateTime(createdAt);
    bubble.appendChild(time);

    wrap.appendChild(bubble);
    return wrap;
  }

  function closeTicket() {
    document.getElementById('admin-ticket-overlay').classList.remove('open');
    currentTicketId = null;
  }

  async function handleTicketReply() {
    if (!currentTicketId) return;
    const input = document.getElementById('admin-ticket-reply-input');
    const text  = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    const btn = document.getElementById('btn-admin-ticket-reply');
    btn.classList.add('loading');
    try {
      await SpaccleDB.addTicketReply(currentTicketId, { text, fromAdmin: true, userId: user?.userId });
      // Reload thread
      const ticket = await SpaccleDB.getDocument(currentTicketId);
      await loadTicketThread(ticket);
      showToast('Reply sent');
    } catch {
      showToast('Could not send reply');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function handleTicketStatus(status) {
    if (!currentTicketId) return;
    const btn = status === 'resolved'
      ? document.getElementById('btn-admin-ticket-resolve')
      : document.getElementById('btn-admin-ticket-reopen');
    btn.classList.add('loading');
    try {
      await SpaccleDB.setTicketStatus(currentTicketId, status);
      // Update UI without closing
      document.getElementById('btn-admin-ticket-resolve').style.display = status === 'resolved' ? 'none' : '';
      document.getElementById('btn-admin-ticket-reopen').style.display  = status === 'resolved' ? '' : 'none';
      const replyBar = document.getElementById('admin-ticket-reply-bar');
      if (replyBar) replyBar.style.display = status === 'resolved' ? 'none' : '';
      showToast(status === 'resolved' ? 'Ticket resolved' : 'Ticket reopened');
      await loadSupport(currentSupportFilter);
    } catch {
      showToast('Could not update ticket');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Plans ──────────────────────────────────────────────────────── */
  async function loadPlans() {
    const list = document.getElementById('admin-plans-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      const plans = await SpaccleDB.listPlans();
      list.innerHTML = '';
      if (!plans.length) {
        list.innerHTML = '<div class="admin-empty">No plans found.</div>';
        return;
      }
      plans.forEach(plan => {
        const card = document.createElement('div');
        card.className = 'admin-card admin-plan-card';

        const header = document.createElement('div');
        header.className = 'admin-plan-card__header';

        const nameEl = document.createElement('div');
        nameEl.className = 'admin-card__title';
        nameEl.textContent = plan.name;

        const right = document.createElement('div');
        right.style.cssText = 'display:flex;align-items:center;gap:6px';

        if (plan.badge) {
          const badge = document.createElement('span');
          badge.className = 'admin-plan-card__badge';
          badge.textContent = plan.badge;
          right.appendChild(badge);
        }

        const statusPill = document.createElement('span');
        statusPill.className = 'admin-card__pill';
        statusPill.textContent = plan.active !== false ? 'Active' : 'Off';
        statusPill.style.cssText = plan.active !== false
          ? 'background:#E8F5E9;color:#2E7D32'
          : 'background:#F5F5F5;color:#999';
        right.appendChild(statusPill);
        header.appendChild(nameEl);
        header.appendChild(right);

        const priceEl = document.createElement('div');
        priceEl.className = 'admin-plan-card__price';
        priceEl.textContent = `₦${formatNaira(plan.price)}/mo` +
          (plan.waitlistPrice ? `  ·  ₦${formatNaira(plan.waitlistPrice)} waitlist` : '');

        const detail = document.createElement('div');
        detail.className = 'admin-plan-card__detail';
        const parts = [];
        if (plan.includedItems)   parts.push(`Up to ${plan.includedItems} items`);
        if (plan.pickupsPerMonth) parts.push(`${plan.pickupsPerMonth} pickup(s)/mo`);
        if (plan.turnaroundText)  parts.push(plan.turnaroundText);
        if (plan.rolloverItems)   parts.push(`Rollover: ${plan.rolloverItems}`);
        detail.textContent = parts.join('  ·  ');

        const actions = document.createElement('div');
        actions.className = 'admin-plan-card__actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn--ghost btn--sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => openPlanEditor(plan));
        actions.appendChild(editBtn);

        card.appendChild(header);
        card.appendChild(priceEl);
        if (parts.length) card.appendChild(detail);
        card.appendChild(actions);
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load plans.</div>';
    }
  }

  function openPlanEditor(plan) {
    editingPlanId = plan?._id || null;
    document.getElementById('admin-plan-editor-title').textContent = plan ? 'Edit Plan' : 'New Plan';
    document.getElementById('pe-id').value          = plan?._id              || '';
    document.getElementById('pe-name').value        = plan?.name             || '';
    document.getElementById('pe-badge').value       = plan?.badge            || '';
    document.getElementById('pe-price').value       = plan?.price            || '';
    document.getElementById('pe-price-disc').value  = plan?.waitlistPrice    || '';
    document.getElementById('pe-items').value       = plan?.includedItems    || '';
    document.getElementById('pe-pickups').value     = plan?.pickupsPerMonth  || '';
    document.getElementById('pe-turnaround').value  = plan?.turnaroundText   || '';
    document.getElementById('pe-rollover').value    = plan?.rolloverItems    || '';
    document.getElementById('pe-express').value     = plan?.freeExpressPerMonth || '';
    document.getElementById('pe-savings').value     = plan?.savingsText      || '';
    document.getElementById('pe-features').value   = (plan?.features || []).join('\n');
    document.getElementById('pe-active').checked   = plan?.active !== false;
    document.getElementById('admin-plan-editor-overlay').classList.add('open');
  }

  function closePlanEditor() {
    document.getElementById('admin-plan-editor-overlay').classList.remove('open');
    editingPlanId = null;
  }

  async function handlePlanSave() {
    const name = document.getElementById('pe-name').value.trim();
    if (!name) { showToast('Plan name is required'); return; }
    const price = parseFloat(document.getElementById('pe-price').value) || 0;
    if (!price) { showToast('Price is required'); return; }

    const btn = document.getElementById('btn-admin-plan-save');
    btn.classList.add('loading');
    try {
      const features = document.getElementById('pe-features').value
        .split('\n').map(s => s.trim()).filter(Boolean);
      const planData = {
        name,
        badge:               document.getElementById('pe-badge').value.trim()      || null,
        price,
        waitlistPrice:       parseFloat(document.getElementById('pe-price-disc').value) || null,
        includedItems:       parseInt(document.getElementById('pe-items').value)    || null,
        pickupsPerMonth:     parseInt(document.getElementById('pe-pickups').value)  || null,
        turnaroundText:      document.getElementById('pe-turnaround').value.trim()  || null,
        rolloverItems:       parseInt(document.getElementById('pe-rollover').value) || null,
        freeExpressPerMonth: parseInt(document.getElementById('pe-express').value)  || null,
        savingsText:         document.getElementById('pe-savings').value.trim()     || null,
        features,
        active:              document.getElementById('pe-active').checked,
      };
      if (editingPlanId) planData._id = editingPlanId;
      await SpaccleDB.upsertPlan(planData);
      closePlanEditor();
      await loadPlans();
      showToast('Plan saved');
    } catch {
      showToast('Failed to save plan');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Config ─────────────────────────────────────────────────────── */
  async function loadConfig() {
    try {
      const cfg = await SpaccleDB.getPreference('integrations_config', null);
      if (cfg) {
        document.getElementById('admin-cfg-paystack-pk').value = cfg.paystackPublicKey || '';
        document.getElementById('admin-cfg-couch-url').value   = cfg.couchRemoteUrl   || '';
        document.getElementById('admin-cfg-couch-db').value    = cfg.couchDbName      || '';
        document.getElementById('admin-cfg-couch-user').value  = cfg.couchUsername    || '';
        document.getElementById('admin-cfg-couch-pass').value  = cfg.couchPassword    || '';
      } else {
        const s = window.SpaccleConfig || {};
        document.getElementById('admin-cfg-paystack-pk').value = s.paystack?.publicKey || '';
        document.getElementById('admin-cfg-couch-url').value   = s.couchdb?.remoteUrl  || '';
        document.getElementById('admin-cfg-couch-db').value    = s.couchdb?.dbName     || '';
        document.getElementById('admin-cfg-couch-user').value  = s.couchdb?.username   || '';
      }
      updateSyncStatusLabel();
    } catch (e) {
      showToast('Could not load config settings');
      console.error(e);
    }
    try {
      const svcCfg = await SpaccleDB.ensureDefaultServices();
      renderServicePriceForm(svcCfg);
    } catch (e) {
      showToast('Could not load service pricing');
      console.error(e);
    }
    await loadItemPricingForm();
    await loadLegalEditor();
    await loadPromos();
  }

  function renderServicePriceForm(svcCfg) {
    const form = document.getElementById('admin-services-form');
    if (!form || !svcCfg) return;
    form.innerHTML = '';
    Object.entries(svcCfg).forEach(([key, svc]) => {
      const label = document.createElement('label');
      label.className = 'form-label';
      label.textContent = svc.name;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-input';
      input.dataset.serviceKey = key;
      input.value = svc.pricePerItem || 0;
      input.placeholder = '0';
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:11px;color:#888;margin-top:-8px;display:block';
      hint.textContent = 'per ' + svc.unit;
      form.appendChild(label);
      form.appendChild(input);
      form.appendChild(hint);
    });
  }

  async function handleServicesSave() {
    const btn = document.getElementById('btn-admin-services-save');
    btn.classList.add('loading');
    try {
      const existing = await SpaccleDB.getServicesConfig() || await SpaccleDB.ensureDefaultServices();
      const updated = { ...existing };
      document.querySelectorAll('#admin-services-form input[data-service-key]').forEach(input => {
        const key = input.dataset.serviceKey;
        if (updated[key]) {
          const price = parseInt(input.value) || 0;
          updated[key] = {
            ...updated[key],
            pricePerItem: price,
            display: `₦${price.toLocaleString('en-NG')}/${updated[key].unit}`,
          };
        }
      });
      await SpaccleDB.saveServicesConfig(updated);
      showToast('Service prices saved');
    } catch {
      showToast('Failed to save service prices');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function handleConfigSave() {
    const btn = document.getElementById('btn-admin-cfg-save');
    btn.classList.add('loading');
    try {
      const pk       = document.getElementById('admin-cfg-paystack-pk').value.trim();
      const url      = document.getElementById('admin-cfg-couch-url').value.trim();
      const dbName   = document.getElementById('admin-cfg-couch-db').value.trim();
      const username = document.getElementById('admin-cfg-couch-user').value.trim();
      const password = document.getElementById('admin-cfg-couch-pass').value;
      const existing = await SpaccleDB.getPreference('integrations_config', {});
      await SpaccleDB.setPreference('integrations_config', {
        ...existing,
        paystackPublicKey: pk       || existing.paystackPublicKey || '',
        couchRemoteUrl:    url      || existing.couchRemoteUrl    || '',
        couchDbName:       dbName   || existing.couchDbName       || '',
        couchUsername:     username || existing.couchUsername     || '',
        couchPassword:     password || existing.couchPassword     || '',
      });
      if (url) {
        await SpaccleDB.setSyncConfig({
          remoteUrl: url, username, password,
          dbName: dbName || 'spacclelaundry_spaccle',
        });
        SpaccleDB.startSync().catch(() => {});
      }
      showToast('Configuration saved');
    } catch {
      showToast('Failed to save configuration');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function handleSyncStart() {
    const btn = document.getElementById('btn-admin-sync-start');
    btn.classList.add('loading');
    try {
      await SpaccleDB.startSync();
      showToast('Sync started');
      updateSyncStatusLabel();
    } catch {
      showToast('Sync failed to start');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Messages (chat) ────────────────────────────────────────────── */
  let currentChatUserId = null;

  async function loadMessages() {
    const list = document.getElementById('admin-messages-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      const msgs = await SpaccleDB.listAllChatMessages();
      const users = await SpaccleDB.listAllUsers();
      const userMap = {};
      users.forEach(u => { userMap[u._id] = u; });

      // Group by userId, keep latest message per user
      const threads = {};
      msgs.forEach(m => {
        if (!threads[m.userId] || m.createdAt > threads[m.userId].lastAt) {
          threads[m.userId] = { userId: m.userId, lastMsg: m.text, lastAt: m.createdAt, unread: 0 };
        }
        if (!m.read && !m.fromAdmin) threads[m.userId].unread = (threads[m.userId].unread || 0) + 1;
      });

      const threadList = Object.values(threads).sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1));
      list.innerHTML = '';
      if (!threadList.length) {
        list.innerHTML = '<div class="admin-empty">No messages yet.</div>';
        return;
      }
      threadList.forEach(t => {
        const u = userMap[t.userId] || {};
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.style.cursor = 'pointer';
        card.innerHTML =
          `<div class="admin-card__left">` +
          `<div class="admin-card__title">${escapeAdminHtml(u.name || u.email || t.userId)}</div>` +
          `<div class="admin-card__meta">${escapeAdminHtml(t.lastMsg.slice(0, 60))} · ${formatTime(t.lastAt)}</div>` +
          `</div>` +
          (t.unread ? `<div class="admin-card__right"><span class="admin-card__pill admin-card__pill--open">${t.unread} new</span></div>` : '');
        card.addEventListener('click', () => openAdminChat(t.userId, u.name || u.email || 'User'));
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load messages.</div>';
    }
  }

  async function openAdminChat(userId, userName) {
    currentChatUserId = userId;
    document.getElementById('admin-chat-title').textContent = userName;
    document.getElementById('admin-chat-overlay').classList.add('open');
    await loadAdminChatThread(userId);
  }

  async function loadAdminChatThread(userId) {
    const container = document.getElementById('admin-chat-messages');
    container.innerHTML = '';
    try {
      const msgs = await SpaccleDB.getChatHistory(userId);
      if (!msgs.length) {
        container.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">No messages yet.</div>';
        return;
      }
      msgs.forEach(m => {
        const wrap = document.createElement('div');
        wrap.className = 'chat-bubble-wrap ' + (m.fromAdmin ? 'chat-bubble-wrap--admin' : 'chat-bubble-wrap--user');
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ' + (m.fromAdmin ? 'chat-bubble--admin' : 'chat-bubble--user');
        bubble.textContent = m.text;
        const time = document.createElement('div');
        time.className = 'chat-bubble-time';
        time.textContent = formatTime(m.createdAt);
        wrap.appendChild(bubble);
        wrap.appendChild(time);
        container.appendChild(wrap);
      });
      container.scrollTop = container.scrollHeight;
    } catch {
      container.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Could not load.</div>';
    }
  }

  function closeAdminChat() {
    document.getElementById('admin-chat-overlay').classList.remove('open');
    currentChatUserId = null;
  }

  async function handleAdminChatSend() {
    if (!currentChatUserId) return;
    const input = document.getElementById('admin-chat-input');
    const btn = document.getElementById('btn-admin-chat-send');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      await SpaccleDB.createChatMessage({ userId: currentChatUserId, text, fromAdmin: true });
      await loadAdminChatThread(currentChatUserId);
    } catch {
      showToast('Could not send message');
      input.value = text;
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  /* ── Item pricing ────────────────────────────────────────────────── */
  async function loadItemPricingForm() {
    const form = document.getElementById('admin-item-pricing-form');
    if (!form) return;
    form.innerHTML = '';
    try {
      const items = await SpaccleDB.ensureDefaultItemPricing();
      items.forEach(item => {
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = item.name;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-input';
        input.dataset.itemKey = item.key;
        input.value = item.price;
        form.appendChild(label);
        form.appendChild(input);
      });
    } catch (e) {
      showToast('Could not load item pricing');
      console.error(e);
    }
  }

  async function handleItemPricingSave() {
    const btn = document.getElementById('btn-admin-item-pricing-save');
    btn.classList.add('loading');
    try {
      const existing = await SpaccleDB.ensureDefaultItemPricing();
      const updated = existing.map(item => {
        const input = document.querySelector(`#admin-item-pricing-form input[data-item-key="${item.key}"]`);
        return { ...item, price: parseInt(input?.value) || item.price };
      });
      await SpaccleDB.saveItemPricing(updated);
      showToast('Item prices saved');
    } catch {
      showToast('Failed to save item prices');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Legal editor ────────────────────────────────────────────────── */
  async function loadLegalEditor() {
    try {
      const [terms, privacy] = await Promise.all([
        SpaccleDB.getLegalContent('terms'),
        SpaccleDB.getLegalContent('privacy'),
      ]);
      const termsEl   = document.getElementById('admin-legal-terms');
      const privacyEl = document.getElementById('admin-legal-privacy');
      if (termsEl)   termsEl.value   = terms   || '';
      if (privacyEl) privacyEl.value = privacy || '';
    } catch (e) {
      showToast('Could not load legal content');
      console.error(e);
    }
  }

  async function handleLegalSave() {
    const btn = document.getElementById('btn-admin-legal-save');
    btn.classList.add('loading');
    try {
      const terms   = document.getElementById('admin-legal-terms').value;
      const privacy = document.getElementById('admin-legal-privacy').value;
      await Promise.all([
        SpaccleDB.saveLegalContent('terms', terms),
        SpaccleDB.saveLegalContent('privacy', privacy),
      ]);
      showToast('Legal content saved');
    } catch {
      showToast('Failed to save legal content');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Broadcast ──────────────────────────────────────────────────── */
  async function handleBroadcastSend() {
    const title   = (document.getElementById('admin-broadcast-title')?.value  || '').trim();
    const message = (document.getElementById('admin-broadcast-message')?.value || '').trim();
    if (!title || !message) { showToast('Title and message are required'); return; }
    const btn = document.getElementById('btn-admin-broadcast-send');
    btn.classList.add('loading');
    try {
      await SpaccleDB.createBroadcast({ title, message });
      document.getElementById('admin-broadcast-title').value   = '';
      document.getElementById('admin-broadcast-message').value = '';
      showToast('Broadcast sent to all users');
    } catch {
      showToast('Could not send broadcast');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── CSV / PDF Export ───────────────────────────────────────────── */
  async function exportOrdersCSV() {
    const btn = document.getElementById('btn-admin-export-csv');
    btn.classList.add('loading');
    try {
      const orders = allOrders.length ? allOrders : await SpaccleDB.listAllOrders();
      const cols = ['ID', 'Status', 'Service', 'Billing', 'Items', 'Amount (₦)', 'Pickup Day', 'Pickup Time', 'Address', 'Created'];
      const rows = orders.map(o => [
        o.publicId || o._id.slice(-8).toUpperCase(),
        o.status      || '',
        serviceLabel(o.service),
        o.billingMode === 'subscription' ? 'Sub' : 'PAYG',
        o.itemsCount  || '',
        o.amountPaid  || 0,
        o.pickupDay   || '',
        o.pickupTime  || '',
        (o.address    || '').replace(/,/g, ';'),
        o.createdAt   || '',
      ]);
      const csv = [cols, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'spaccle_orders_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('CSV downloaded');
    } catch {
      showToast('Export failed');
    } finally {
      btn.classList.remove('loading');
    }
  }

  function exportOrdersPDF() {
    const orders = allOrders.length ? allOrders : [];
    const rows = orders.slice(0, 200).map(o =>
      `<tr>
        <td>${escapeHtml(o.publicId || o._id.slice(-8).toUpperCase())}</td>
        <td>${escapeHtml(statusLabel(o.status))}</td>
        <td>${escapeHtml(serviceLabel(o.service))}</td>
        <td>${escapeHtml(o.billingMode === 'subscription' ? 'Sub' : 'PAYG')}</td>
        <td>₦${escapeHtml(formatNaira(o.amountPaid || 0))}</td>
        <td>${escapeHtml(formatTime(o.createdAt))}</td>
      </tr>`
    ).join('');
    const win = window.open('', '_blank');
    if (!win) { showToast('Popup blocked — allow popups for this site'); return; }
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Spaccle Orders Export</title>
      <style>
        body { font-family: sans-serif; font-size: 12px; margin: 20px; }
        h1   { font-size: 16px; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f4f4f4; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>
      <h1>Spaccle — Orders Export (${new Date().toLocaleDateString('en-NG')})</h1>
      <table>
        <thead><tr><th>ID</th><th>Status</th><th>Service</th><th>Billing</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  /* ── Promo codes ─────────────────────────────────────────────────── */
  async function handlePromoAdd() {
    const code    = (document.getElementById('admin-promo-code')?.value    || '').trim().toUpperCase();
    const type    = document.getElementById('admin-promo-type')?.value     || 'percent';
    const value   = parseFloat(document.getElementById('admin-promo-value')?.value  || 0);
    const maxUses = parseInt(document.getElementById('admin-promo-max-uses')?.value || 0) || 0;
    const expires = document.getElementById('admin-promo-expires')?.value  || null;

    if (!code)  { showToast('Code is required'); return; }
    if (!value) { showToast('Value must be > 0'); return; }

    const btn = document.getElementById('btn-admin-promo-add');
    btn.classList.add('loading');
    try {
      await SpaccleDB.createPromoCode({
        code,
        type,
        value,
        maxUses,
        expiresAt: expires ? new Date(expires).toISOString() : null,
      });
      document.getElementById('admin-promo-code').value    = '';
      document.getElementById('admin-promo-value').value   = '';
      document.getElementById('admin-promo-expires').value = '';
      showToast('Promo code created: ' + code);
      await loadPromos();
    } catch (err) {
      showToast(err?.message?.includes('conflict') ? 'Code already exists' : 'Could not create promo');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function loadPromos() {
    const list = document.getElementById('admin-promos-list');
    if (!list) return;
    list.innerHTML = '<div class="admin-empty" style="font-size:12px">Loading…</div>';
    try {
      const promos = await SpaccleDB.listAllPromoCodes();
      list.innerHTML = '';
      if (!promos.length) {
        list.innerHTML = '<div class="admin-empty" style="font-size:12px">No promo codes yet.</div>';
        return;
      }
      promos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'admin-card';
        const discountLabel = p.type === 'percent' ? p.value + '% off' : '₦' + formatNaira(p.value) + ' off';
        const usesLabel     = p.maxUses ? `${p.usedCount || 0}/${p.maxUses} uses` : `${p.usedCount || 0} uses`;
        const expLabel      = p.expiresAt ? ' · Exp ' + formatTime(p.expiresAt) : '';
        const active        = p.active !== false;
        card.innerHTML =
          `<div class="admin-card__left">` +
          `<div class="admin-card__title">${escapeAdminHtml(p.code)}</div>` +
          `<div class="admin-card__meta">${discountLabel} · ${usesLabel}${expLabel}</div>` +
          `</div>` +
          `<div class="admin-card__right">` +
          `<button class="btn btn--ghost btn--sm" data-promo-id="${escapeAdminHtml(p._id)}" data-active="${active}">` +
          `${active ? 'Disable' : 'Enable'}</button>` +
          `</div>`;
        card.querySelector('button').addEventListener('click', async function () {
          const id     = this.dataset.promoId;
          const nowOn  = this.dataset.active === 'true';
          try {
            const doc = await SpaccleDB.getDocument(id);
            await SpaccleDB.saveDocument({ ...doc, active: !nowOn });
            showToast((nowOn ? 'Disabled' : 'Enabled') + ': ' + p.code);
            await loadPromos();
          } catch { showToast('Could not update promo'); }
        });
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<div class="admin-empty" style="font-size:12px">Failed to load.</div>';
    }
  }

  /* ── Theme & language (admin) ───────────────────────────────────── */
  function applyAdminDarkMode(on) {
    document.body.classList.toggle('dark', !!on);
    document.querySelectorAll('.theme-icon-sun').forEach(el => { el.style.display = on ? 'none' : ''; });
    document.querySelectorAll('.theme-icon-moon').forEach(el => { el.style.display = on ? '' : 'none'; });
  }

  async function initAdminTheme() {
    try {
      const s = await SpaccleDB.getPreference('app_settings', {});
      const lang = s.language || 'en';
      applyAdminDarkMode(s.darkMode === true);
      if (typeof HomePage !== 'undefined') HomePage.applyLanguage(lang);
      const darkEl = document.getElementById('admin-cfg-dark-mode');
      const langEl = document.getElementById('admin-cfg-language');
      if (darkEl) darkEl.checked = s.darkMode === true;
      if (langEl) langEl.value  = lang;
    } catch { }
  }

  async function handleAdminThemeToggle() {
    const isDark = document.body.classList.contains('dark');
    applyAdminDarkMode(!isDark);
    try {
      const s = await SpaccleDB.getPreference('app_settings', {});
      await SpaccleDB.setPreference('app_settings', { ...s, darkMode: !isDark });
    } catch { }
  }

  async function handleAdminAppearanceSave() {
    const darkMode = document.getElementById('admin-cfg-dark-mode')?.checked || false;
    const language = document.getElementById('admin-cfg-language')?.value    || 'en';
    const btn = document.getElementById('btn-admin-appearance-save');
    btn.classList.add('loading');
    try {
      const s = await SpaccleDB.getPreference('app_settings', {});
      await SpaccleDB.setPreference('app_settings', { ...s, darkMode, language });
      applyAdminDarkMode(darkMode);
      if (typeof HomePage !== 'undefined') HomePage.applyLanguage(language);
      showToast('Appearance saved');
    } catch {
      showToast('Could not save appearance');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Admin notifications ─────────────────────────────────────────── */
  const ADMIN_NOTIF_KEY = 'spaccle_admin_notifications';

  function getAdminNotifs() {
    try { return JSON.parse(localStorage.getItem(ADMIN_NOTIF_KEY) || '[]'); } catch { return []; }
  }

  function storeAdminNotif({ title, body, tab, docId }) {
    const list = getAdminNotifs();
    // Deduplicate: same docId within the last 5 seconds
    if (docId && list.some(n => n.docId === docId)) return;
    list.unshift({
      id: Date.now().toString(),
      docId: docId || null,
      title,
      body,
      tab: tab || null,
      at: new Date().toISOString(),
      read: false,
    });
    if (list.length > 60) list.splice(60);
    localStorage.setItem(ADMIN_NOTIF_KEY, JSON.stringify(list));
  }

  function updateAdminNotifBadge() {
    const unread = getAdminNotifs().filter(n => !n.read).length;
    const badge = document.getElementById('admin-notif-badge');
    if (!badge) return;
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function clearAdminNotifs() {
    localStorage.removeItem(ADMIN_NOTIF_KEY);
    updateAdminNotifBadge();
    renderAdminNotifList();
  }

  function openAdminNotifPanel() {
    // Mark all as read
    const list = getAdminNotifs().map(n => ({ ...n, read: true }));
    localStorage.setItem(ADMIN_NOTIF_KEY, JSON.stringify(list));
    updateAdminNotifBadge();
    renderAdminNotifList();
    document.getElementById('admin-notif-overlay').classList.add('open');
  }

  function closeAdminNotifPanel() {
    document.getElementById('admin-notif-overlay').classList.remove('open');
  }

  function renderAdminNotifList() {
    const listEl  = document.getElementById('admin-notif-list');
    const emptyEl = document.getElementById('admin-notif-empty');
    const notifs  = getAdminNotifs();
    listEl.innerHTML = '';

    if (!notifs.length) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    notifs.forEach(n => {
      const item = document.createElement('div');
      item.className = 'admin-notif-item' + (n.read ? '' : ' admin-notif-item--unread');
      item.innerHTML =
        `<div class="admin-notif-item__icon">${notifIcon(n.tab)}</div>` +
        `<div class="admin-notif-item__body">` +
        `<div class="admin-notif-item__title">${escapeAdminHtml(n.title)}</div>` +
        `<div class="admin-notif-item__sub">${escapeAdminHtml(n.body)}</div>` +
        `<div class="admin-notif-item__time">${formatTime(n.at)}</div>` +
        `</div>`;
      if (n.tab) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
          closeAdminNotifPanel();
          switchTab(n.tab);
        });
      }
      listEl.appendChild(item);
    });
  }

  function notifIcon(tab) {
    if (tab === 'support')  return '🎫';
    if (tab === 'messages') return '💬';
    if (tab === 'orders')   return '📦';
    return '🔔';
  }

  /* ── Live changes watcher ────────────────────────────────────────── */
  function startAdminNotifWatch() {
    SpaccleDB.watchChanges(function (change) {
      const doc = change.doc;
      if (!doc || doc._deleted) return;

      let notif = null;

      if (doc.type === 'support_ticket') {
        notif = {
          title: 'New Support Ticket',
          body:  doc.subject || 'A user submitted a ticket',
          tab:   'support',
          docId: doc._id,
        };
      } else if (doc.type === 'ticket_reply' && !doc.fromAdmin) {
        notif = {
          title: 'Customer Replied to Ticket',
          body:  (doc.text || '').slice(0, 80),
          tab:   'support',
          docId: doc._id,
        };
      } else if (doc.type === 'chat_message' && !doc.fromAdmin) {
        notif = {
          title: 'New Chat Message',
          body:  (doc.text || '').slice(0, 80),
          tab:   'messages',
          docId: doc._id,
        };
      } else if (doc.type === 'order' && doc.status === 'scheduled') {
        notif = {
          title: 'New Order Placed',
          body:  (doc.publicId || '') + ' — ' + serviceLabel(doc.service),
          tab:   'orders',
          docId: doc._id,
        };
      } else if (doc.type === 'payout_request' && doc.status === 'pending') {
        notif = {
          title: 'Payout Request',
          body:  (doc.riderName || 'A rider') + ' requested ₦' + Number(doc.amount).toLocaleString(),
          tab:   'riders',
          docId: doc._id,
        };
      }

      if (notif) {
        storeAdminNotif(notif);
        updateAdminNotifBadge();
        showToast(notif.title + ': ' + notif.body.slice(0, 40));
      }
    });
  }

  function escapeAdminHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateSyncStatusLabel() {
    const el = document.getElementById('admin-sync-status');
    if (!el) return;
    const state = SpaccleDB.getSyncState();
    const labels = {
      idle: 'Sync: idle', active: 'Sync: active',
      paused: 'Sync: paused', error: 'Sync: error', offline: 'Sync: offline',
    };
    el.textContent = labels[state] || ('Sync: ' + state);
  }

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function formatNaira(n) {
    return Number(n || 0).toLocaleString('en-NG');
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function serviceLabel(s) {
    return ({
      'wash-fold':  'Wash, Iron & Fold',
      'dry-clean':  'Dry Cleaning',
      'iron-press': 'Iron & Press',
      'duvet':      'Duvet & Bedding',
      'alteration': 'Alterations',
      'shoe-clean': 'Shoe Cleaning',
    })[s] || s || 'Service';
  }

  function statusLabel(s) {
    return ({
      scheduled:  'Scheduled',
      confirmed:  'Confirmed',
      assigned:   'Assigned to Rider',
      picked_up:  'Picked Up',
      processing: 'Processing',
      cleaning:   'Cleaning',
      ready:      'Ready for Delivery',
      in_transit: 'Out for Delivery',
      delivered:  'Delivered',
      completed:  'Completed',
      cancelled:  'Cancelled',
    })[s] || s || 'Unknown';
  }

  function statusPillClass(s) {
    if (['delivered', 'completed'].includes(s))              return 'admin-card__pill--resolved';
    if (['cancelled'].includes(s))                           return 'admin-card__pill--cancelled';
    if (['scheduled', 'confirmed'].includes(s))              return 'admin-card__pill--open';
    if (['processing', 'cleaning', 'ready'].includes(s))     return 'admin-card__pill--processing';
    if (['assigned', 'picked_up', 'in_transit'].includes(s)) return 'admin-card__pill--transit';
    return '';
  }

  function showToast(msg) {
    const existing = document.getElementById('admin-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'admin-toast';
    t.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:#1C1B3A;color:#fff;padding:10px 20px;border-radius:20px;' +
      'font-size:13px;z-index:9999;pointer-events:none;white-space:nowrap;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  return { init };
})();
