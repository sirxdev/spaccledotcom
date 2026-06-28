/* ── Staff Page ──────────────────────────────────────────────────── */
const StaffPage = (() => {

  let user = null;
  let initialized = false;

  function showToast(msg) {
    const el = document.getElementById('staff-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  function renderUser() {
    const nameEl = document.getElementById('staff-greeting-name');
    const letterEl = document.getElementById('staff-avatar-letter');
    if (nameEl) nameEl.textContent = user?.name || 'Staff';
    if (letterEl) letterEl.textContent = (user?.name || 'S').charAt(0).toUpperCase();
  }

  function stopAutoRefresh() {
    if (window._staffRefresh) { clearInterval(window._staffRefresh); window._staffRefresh = null; }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    window._staffRefresh = setInterval(() => loadOrders(), 15000);
  }

  /* ── Tab switching ── */
  function switchStaffTab(tab) {
    document.querySelectorAll('.staff-tab').forEach(t => t.classList.toggle('active', t.dataset.staffTab === tab));
    document.querySelectorAll('.staff-tab-content').forEach(c => c.classList.toggle('active', c.id === `staff-tab-${tab}`));
  }

  /* ── Load orders ── */
  async function loadOrders() {
    try {
      const orders = await SpaccleDB.listFacilityOrders();
      const ready = orders.filter(o => o.status === 'picked_up');
      const processing = orders.filter(o => o.status === 'processing');
      renderReadyOrders(ready);
      renderProcessingOrders(processing);
    } catch { }
  }

  function renderReadyOrders(orders) {
    const list = document.getElementById('staff-ready-list');
    const empty = document.getElementById('staff-ready-empty');
    if (!list) return;
    if (!orders.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = orders.map(o => buildCard(o, 'ready')).join('');
  }

  function renderProcessingOrders(orders) {
    const list = document.getElementById('staff-processing-list');
    const empty = document.getElementById('staff-processing-empty');
    if (!list) return;
    if (!orders.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = orders.map(o => buildCard(o, 'processing')).join('');
  }

  function buildCard(order, section) {
    const id = order.publicId || order._id || '—';
    const items = order.itemsCount || 0;
    const address = order.address || '—';
    const notes = order.notes || '';
    const statusClass = section === 'ready' ? 'staff-card__status--ready' : 'staff-card__status--processing';
    const statusLabel = section === 'ready' ? 'Ready' : 'Processing';

    let breakdownHtml = '';
    if (order.itemsBreakdown) {
      const catLabels = { shirts:'Shirts', trousers:'Trousers', dresses:'Dresses', suits:'Suits', bedsheets:'Bedsheets', towels:'Towels', other:'Other', 'everyday-clothing':'Everyday Clothing', 'dresses-gowns':'Dresses & Gowns', 'bedding':'Bedding', 'underwear':'Underwear', 'shoes':'Shoes', 'bags':'Bags', 'curtains':'Curtains', 'rugs':'Rugs', 'other-specialty':'Other Specialty', 'iron-items':'Iron Only' };
      const parts = Object.entries(order.itemsBreakdown).filter(([,c]) => c > 0).map(([k,c]) => `${catLabels[k]||k}: ${c}`);
      if (parts.length) breakdownHtml = `<div class="staff-card__row">📦 ${parts.join(', ')}</div>`;
    }

    const actionHtml = section === 'ready'
      ? `<button class="btn btn--primary btn--sm btn--full btn-start-processing" data-order-id="${order._id}">Start Processing</button>`
      : `<button class="btn btn--primary btn--sm btn--full btn-mark-ready" data-order-id="${order._id}">Mark Ready</button>`;

    const processedByHtml = order.processedByName
      ? `<div class="staff-card__row">👤 Started by ${escapeHtml(order.processedByName)}</div>`
      : '';

    return `
      <div class="staff-card" data-order-id="${order._id}">
        <div class="staff-card__header">
          <span class="staff-card__id">${escapeHtml(id)}</span>
          <span class="staff-card__status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="staff-card__row">📍 ${escapeHtml(address)}</div>
        <div class="staff-card__row">👕 ${items} item${items !== 1 ? 's' : ''}</div>
        ${notes ? `<div class="staff-card__row">📝 ${escapeHtml(notes)}</div>` : ''}
        ${processedByHtml}
        ${breakdownHtml}
        <div class="staff-card__actions">
          ${actionHtml}
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Actions ── */
  async function handleStartProcessing(orderId) {
    try {
      const btn = document.querySelector(`.btn-start-processing[data-order-id="${orderId}"]`);
      if (btn) btn.disabled = true;
      const staffId = user?.userId || user?._id;
      await SpaccleDB.setOrderStatus(orderId, 'processing', { processedBy: staffId, processedByName: user?.name || 'Staff' });
      showToast('Processing started');
      await loadOrders();
    } catch (err) {
      showToast('Could not start processing');
    }
  }

  async function handleMarkReady(orderId) {
    try {
      const btn = document.querySelector(`.btn-mark-ready[data-order-id="${orderId}"]`);
      if (btn) btn.disabled = true;
      await SpaccleDB.setOrderStatus(orderId, 'ready');
      showToast('Order ready for delivery');
      await loadOrders();
    } catch (err) {
      showToast('Could not mark as ready');
    }
  }

  function setupActions() {
    document.querySelectorAll('.staff-tab').forEach(tab => {
      tab.addEventListener('click', () => switchStaffTab(tab.dataset.staffTab));
    });

    // Delegated clicks on order cards
    document.getElementById('page-staff').addEventListener('click', e => {
      const startBtn = e.target.closest('.btn-start-processing');
      if (startBtn) { handleStartProcessing(startBtn.dataset.orderId); return; }
      const readyBtn = e.target.closest('.btn-mark-ready');
      if (readyBtn) { handleMarkReady(readyBtn.dataset.orderId); return; }
    });

    // Avatar dropdown
    document.getElementById('btn-staff-avatar').addEventListener('click', () => {
      const dd = document.getElementById('staff-dropdown');
      if (dd) dd.classList.toggle('show');
    });
    document.getElementById('btn-staff-logout')?.addEventListener('click', () => {
      SpaccleDB.logout();
      stopAutoRefresh();
      window.location.reload();
    });
  }

  /* ── Init ── */
  async function init(data = {}) {
    try {
      user = data.user || SpaccleDB.getSession();
      stopAutoRefresh();
      renderUser();
      if (!initialized) {
        setupActions();
        initialized = true;
      }
      switchStaffTab('ready');
      await loadOrders();
      startAutoRefresh();
    } catch (e) {
      console.error('StaffPage init error:', e);
    }
  }

  return { init };
})();
