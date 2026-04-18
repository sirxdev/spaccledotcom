/* ── Admin Page ─────────────────────────────────────────────────────── */
const AdminPage = (() => {

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
    user = data.user || SpaccleDB.getSession();
    const sub = document.getElementById('admin-topbar-sub');
    if (sub) sub.textContent = user?.email || 'Administrator';
    setupTabs();
    setupActions();
    loadTab('dashboard');
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
    if (tab === 'plans')     loadPlans();
    if (tab === 'config')    loadConfig();
  }

  /* ── Actions ─────────────────────────────────────────────────────── */
  function setupActions() {
    document.getElementById('btn-admin-logout').addEventListener('click', handleLogout);

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

    // Plans
    document.getElementById('btn-admin-add-plan').addEventListener('click', () =>
      openPlanEditor(null));
    document.getElementById('btn-admin-plan-editor-close').addEventListener('click', closePlanEditor);
    document.getElementById('admin-plan-editor-backdrop').addEventListener('click', closePlanEditor);
    document.getElementById('btn-admin-plan-save').addEventListener('click', handlePlanSave);

    // Config
    document.getElementById('btn-admin-cfg-save').addEventListener('click', handleConfigSave);
    document.getElementById('btn-admin-sync-start').addEventListener('click', handleSyncStart);
    document.getElementById('btn-admin-services-save').addEventListener('click', handleServicesSave);
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
    } catch {
      [revEl, subsEl, ordMoEl, tickEl].forEach(el => { if (el) el.textContent = 'ERR'; });
    }
  }

  /* ── Orders ─────────────────────────────────────────────────────── */
  async function loadOrders(filter) {
    currentOrderFilter = filter || 'all';
    const list = document.getElementById('admin-orders-list');
    list.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      allOrders = await SpaccleDB.listAllOrders();
      renderFilteredOrders();
    } catch {
      list.innerHTML = '<div class="admin-empty">Failed to load orders.</div>';
    }
  }

  function renderFilteredOrders() {
    const list = document.getElementById('admin-orders-list');
    const filtered = currentOrderFilter === 'all'
      ? allOrders
      : allOrders.filter(o => o.status === currentOrderFilter);
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
    detailEl.innerHTML = [
      ['Status',       statusLabel(order.status)],
      ['Service',      serviceLabel(order.service)],
      ['Billing',      order.billingMode === 'subscription' ? 'Subscription' : 'Pay As You Go'],
      ['Items',        order.itemsCount || '—'],
      ['Amount Paid',  order.amountPaid ? `₦${formatNaira(order.amountPaid)}` : '—'],
      ['Paystack Ref', order.paystackRef || '—'],
      ['Pickup Day',   order.pickupDay   || '—'],
      ['Pickup Time',  order.pickupTime  || '—'],
      ['Address',      order.address     || '—'],
      ['Notes',        order.notes       || '—'],
      ['Created',      formatDateTime(order.createdAt)],
    ].map(([l, v]) =>
      `<div class="admin-detail-row">` +
      `<span class="admin-detail-row__label">${l}</span>` +
      `<span class="admin-detail-row__value">${v}</span></div>`
    ).join('');

    const actionsEl = document.getElementById('admin-order-status-actions');
    actionsEl.innerHTML = '';
    const btnDefs = [
      { label: 'Confirm Pick Up',  status: 'picked_up',  trigger: ['scheduled', 'confirmed'],       ghost: false },
      { label: 'Mark Processing',  status: 'processing', trigger: ['picked_up'],                    ghost: false },
      { label: 'Mark Ready',       status: 'ready',      trigger: ['processing', 'cleaning'],        ghost: false },
      { label: 'Mark Delivered',   status: 'delivered',  trigger: ['ready'],                        ghost: false },
      { label: 'Cancel Order',     status: 'cancelled',  trigger: ['scheduled', 'confirmed', 'picked_up'], ghost: true },
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
      ['Name',    u.name  || '—'],
      ['Email',   u.email || '—'],
      ['Phone',   u.phone || '—'],
      ['Role',    u.role  || 'user'],
      ['Joined',  formatDateTime(u.createdAt)],
    ];
    if (sub) {
      rows.push(['Plan',        sub.planId   || '—']);
      rows.push(['Sub Status',  sub.active !== false ? 'Active' : 'Inactive']);
      rows.push(['Sub Price',   sub.pricePaid ? `₦${formatNaira(sub.pricePaid)}` : '—']);
      rows.push(['Items Used',  sub.itemsUsed != null ? sub.itemsUsed : '—']);
      rows.push(['Sub Started', formatDateTime(sub.createdAt)]);
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

    const metaEl = document.getElementById('admin-ticket-meta');
    const ref = t.orderId ? 'Order: ' + t.orderId : 'No order linked';
    metaEl.textContent = ref + ' · ' + formatDateTime(t.createdAt) +
      ' · ' + (t.status === 'resolved' ? 'Resolved' : 'Open');

    document.getElementById('admin-ticket-message').textContent = t.message || '(no message body)';

    const resolveBtn = document.getElementById('btn-admin-ticket-resolve');
    const reopenBtn  = document.getElementById('btn-admin-ticket-reopen');
    resolveBtn.style.display = t.status === 'resolved' ? 'none' : '';
    reopenBtn.style.display  = t.status === 'resolved' ? '' : 'none';

    document.getElementById('admin-ticket-overlay').classList.add('open');
  }

  function closeTicket() {
    document.getElementById('admin-ticket-overlay').classList.remove('open');
    currentTicketId = null;
  }

  async function handleTicketStatus(status) {
    if (!currentTicketId) return;
    const btn = status === 'resolved'
      ? document.getElementById('btn-admin-ticket-resolve')
      : document.getElementById('btn-admin-ticket-reopen');
    btn.classList.add('loading');
    try {
      await SpaccleDB.setTicketStatus(currentTicketId, status);
      closeTicket();
      await loadSupport(currentSupportFilter);
      showToast(status === 'resolved' ? 'Ticket resolved' : 'Ticket reopened');
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
    } catch {}
    try {
      const svcCfg = await SpaccleDB.ensureDefaultServices();
      renderServicePriceForm(svcCfg);
    } catch {}
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
      'wash-fold':  'Wash & Fold',
      'dry-clean':  'Dry Cleaning',
      'iron-press': 'Iron & Press',
      'duvet':      'Duvet & Bedding',
      'alteration': 'Alterations',
      'shoe-clean': 'Shoe Cleaning',
    })[s] || s || 'Service';
  }

  function statusLabel(s) {
    return ({
      scheduled: 'Scheduled', confirmed: 'Confirmed', picked_up: 'Picked Up',
      processing: 'Processing', cleaning: 'Cleaning', ready: 'Ready',
      delivered: 'Delivered', cancelled: 'Cancelled',
    })[s] || s || 'Unknown';
  }

  function statusPillClass(s) {
    if (['delivered'].includes(s))             return 'admin-card__pill--resolved';
    if (['cancelled'].includes(s))             return 'admin-card__pill--cancelled';
    if (['scheduled', 'confirmed'].includes(s)) return 'admin-card__pill--open';
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
