/* ── Home Page ───────────────────────────────────────────────────── */
const HomePage = (() => {

  let activeTab = 'home';
  let user = null;
  let initialized = false;
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
  let selectedPickupTime = '2:00 PM – 4:00 PM';
  let servicesConfig = null;
  let itemPricing = null;
  let pendingItemsBreakdown = null;

  const CATEGORY_SECTIONS = [
    { name: 'Laundry', groups: ['everyday-clothing', 'dresses-gowns', 'bedding', 'underwear'] },
    { name: 'Specialty Items', groups: ['shoes', 'bags', 'curtains', 'rugs', 'other-specialty'] },
  ];
  const ALL_PRICING_GROUP_KEYS = CATEGORY_SECTIONS.flatMap(s => s.groups);

  const GROUP_HELP = {
    'everyday-clothing': 'T-shirts, polos, shirts, blouses, trousers, jeans, shorts, skirts, hoodies, jackets.',
    'dresses-gowns': 'Evening gowns, bridal wear, cocktail dresses, and formal dresses.',
    'bedding': 'Bedsheets, pillowcases, duvet covers, and blankets.',
    'underwear': 'Boxers, briefs, panties, bras, singlets, and socks.',
    'shoes': 'Sneakers, loafers, heels, flats, and boots. Shine and care included.',
    'bags': 'Handbags, totes, backpacks, and luggage.',
    'curtains': 'Curtain panels, drapes, and sheers.',
    'rugs': 'Area rugs, mats, and runners.',
    'other-specialty': 'Items not listed above. Contact support if unsure.',
  };

  function init(data = {}) {
    user = data.user || SpaccleDB.getSession();
    // Reset per-session state so a different user logging in starts clean
    selectedOrderId = null;
    supportOrderId = null;
    selectedPlanId = null;
    selectedSubPlanId = null;
    subscription = null;
    _lastKnownOrderStatus = null;
    selectedRating = 0;
    currentTicket = null;
    appliedPromo = null;
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
    updateNotifBadge();
  }

  async function bootstrapData() {
    await initConfigDefaults();
    await initTheme();
    try {
      servicesConfig = await SpaccleDB.ensureDefaultServices();
      renderServiceCardPrices();
    } catch { }
    try {
      itemPricing = await SpaccleDB.ensureDefaultItemPricing();
    } catch { }
    try {
      await SpaccleDB.ensureDefaultPlans();
      await renderPlansUI();
    } catch { }
    bindSyncUI();
    checkSubscriptionRenewal();
    checkBroadcasts();
    checkNewAdminMessages();
    setupOfflineIndicator();
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
    document.getElementById('btn-home-theme').addEventListener('click', handleQuickThemeToggle);
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


    document.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', handleNewOrder);
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
    appliedPromo = null;
    const promoInput = document.getElementById('promo-input');
    if (promoInput) promoInput.value = '';
    const promoStatus = document.getElementById('promo-status');
    if (promoStatus) promoStatus.textContent = '';
    buildDatePicker();
    buildTimeChips();
    goToWizardStep(1);
    const hasActiveSubscription = user && await hasActiveSub();
    if (hasActiveSubscription) {
      billingMode = 'subscription';
      subscription = await SpaccleDB.getSubscription(user.userId);
    }
    updateBillingUI();
    openSheet('sheet-schedule');
    loadSavedAddresses();
    // Eagerly load Google Places for address autocomplete
    const mapsKey = getConfig().googleMaps?.apiKey;
    if (mapsKey) loadGoogleMaps(mapsKey).catch(() => {});
  }

  async function hasActiveSub() {
    const sub = await SpaccleDB.getSubscription(user?.userId);
    return !!(sub && sub.status === 'active');
  }

  async function loadSavedAddresses() {
    const pillsEl = document.getElementById('saved-address-pills');
    let addrInput = document.getElementById('pickup-address');
    const saveBtn = document.getElementById('btn-save-address');
    if (!pillsEl || !addrInput) return;

    try {
      const addrs = await SpaccleDB.getAddresses(user?.userId || user?._id);

      if (addrs && addrs.length) {
        pillsEl.style.display = 'flex';
        pillsEl.innerHTML = '';
        addrs.slice(0, 5).forEach(a => {
          const label = a.label || `${a.street}, ${a.city}`.slice(0, 30);
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'saved-address-pill';
          pill.textContent = label;
          pill.addEventListener('click', () => {
            addrInput.value = `${a.street}, ${a.city}`;
            pillsEl.querySelectorAll('.saved-address-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            if (saveBtn) saveBtn.style.display = 'none';
          });
          pillsEl.appendChild(pill);
        });

        // Pre-fill default
        const def = addrs.find(a => a.isDefault) || addrs[0];
        if (def && addrInput && !addrInput.value) {
          addrInput.value = `${def.street}, ${def.city}`;
        }
      } else {
        pillsEl.style.display = 'none';
      }
    } catch { pillsEl.style.display = 'none'; }

    // Show "Save address" button when user types something not already saved
    // Clone to remove any previously-attached listeners from earlier sheet opens
    const freshInput = addrInput.cloneNode(true);
    addrInput.replaceWith(freshInput);
    addrInput = freshInput;
    initPlaceAutocomplete(addrInput);
    freshInput.addEventListener('input', () => {
      if (saveBtn) saveBtn.style.display = freshInput.value.trim() ? '' : 'none';
    });

    if (saveBtn) {
      saveBtn.onclick = async () => {
        const raw = freshInput.value.trim();
        if (!raw) return;
        const parts = raw.split(',').map(s => s.trim());
        try {
          await SpaccleDB.saveAddress(user?.userId || user?._id, {
            street: parts[0] || raw,
            city: parts.slice(1).join(', ') || '',
            label: raw.slice(0, 30),
            isDefault: false,
          });
          saveBtn.style.display = 'none';
          showToast('Address saved');
          loadSavedAddresses();
        } catch { showToast('Could not save address'); }
      };
    }
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
        buildTimeChips();
      });
      picker.appendChild(btn);
    }
    selectedPickupDate = today.toISOString().split('T')[0];
  }

  /* ── Time chip picker ───────────────────────────────────────── */
  const MIN_LEAD_HOURS = 2;
  const TIME_SLOTS = [
    { label: '8:00 AM – 10:00 AM', startHour: 8,  endHour: 10 },
    { label: '10:00 AM – 12:00 PM', startHour: 10, endHour: 12 },
    { label: '12:00 PM – 2:00 PM',  startHour: 12, endHour: 14 },
    { label: '2:00 PM – 4:00 PM',   startHour: 14, endHour: 16 },
    { label: '4:00 PM – 6:00 PM',   startHour: 16, endHour: 18 },
  ];

  function buildTimeChips() {
    const container = document.getElementById('time-chips');
    if (!container) return;
    const now = new Date();
    const selectedDate = selectedPickupDate ? new Date(selectedPickupDate + 'T12:00:00') : new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    let availableSlots;
    if (isToday) {
      const cutoff = new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000);
      availableSlots = TIME_SLOTS.filter(slot => {
        const slotEnd = new Date(now);
        slotEnd.setHours(slot.endHour, 0, 0, 0);
        return slotEnd > cutoff;
      });
      // If no slots remain today, auto-advance to tomorrow
      if (availableSlots.length === 0) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowIso = tomorrow.toISOString().split('T')[0];
        selectedPickupDate = tomorrowIso;
        // Update date picker selection
        const picker = document.getElementById('date-picker');
        if (picker) {
          picker.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
          const nextChip = picker.querySelector(`[data-date-value="${tomorrowIso}"]`);
          if (nextChip) nextChip.classList.add('active');
        }
        availableSlots = TIME_SLOTS;
      }
    } else {
      availableSlots = TIME_SLOTS;
    }

    container.innerHTML = '';
    // Re-select the first available slot if current selection is no longer valid
    if (!availableSlots.some(s => s.label === selectedPickupTime)) {
      selectedPickupTime = availableSlots[0]?.label || selectedPickupTime;
    }
    availableSlots.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-chip' + (slot.label === selectedPickupTime ? ' active' : '');
      btn.textContent = slot.label;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        selectedPickupTime = slot.label;
      });
      container.appendChild(btn);
    });
  }

  function handleNotifications() {
    requestNotificationPermission();
    openNotificationPanel();
  }

  async function handleLogout() {
    stopAutoRefresh();
    closeAllSheets();
    if (unsubscribeSync) {
      unsubscribeSync();
      unsubscribeSync = null;
    }
    SpaccleDB.logout();
    user = null;
    App.navigate('auth');
  }

  function setupSheets() {
    // Hide all sheets at init so inactive ones never bleed through on mobile WebViews
    document.querySelectorAll('.sheet').forEach(s => { s.style.display = 'none'; });

    const overlay = document.getElementById('sheet-overlay');
    overlay.addEventListener('click', closeAllSheets);

    document.getElementById('btn-schedule-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-order-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-support-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-subscription-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-subscribe-cancel').addEventListener('click', handleCancelSubscription);
    document.getElementById('btn-profile-info-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-addresses-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-payment-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-notifications-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-profile-settings-close').addEventListener('click', closeAllSheets);

    document.getElementById('btn-schedule-confirm').addEventListener('click', handleScheduleConfirm);
    document.getElementById('deliver-back-checkbox').addEventListener('change', e => {
      const group = document.getElementById('delivery-address-group');
      if (group) {
        group.style.display = e.target.checked ? 'none' : '';
        if (!e.target.checked) {
          initPlaceAutocomplete(document.getElementById('delivery-address'));
        }
      }
    });
    document.getElementById('btn-billing-payg').addEventListener('click', () => setBillingMode('payg'));
    document.getElementById('btn-billing-sub').addEventListener('click', () => setBillingMode('subscription'));
    document.getElementById('btn-open-subscribe').addEventListener('click', openSubscriptionSheet);
    document.getElementById('btn-sub-upsell')?.addEventListener('click', openSubscriptionSheet);
    document.getElementById('btn-subscribe-pay').addEventListener('click', handleSubscribePay);

    document.getElementById('btn-order-track').addEventListener('click', () => {
      closeAllSheets();
      switchTab('track');
    });

    document.getElementById('btn-order-track-map').addEventListener('click', openOrderMap);
    document.getElementById('btn-order-map-close').addEventListener('click', closeOrderMap);
    document.getElementById('btn-order-chat-rider').addEventListener('click', () => {
      closeOrderMap();
      openChatSheet();
    });

    document.getElementById('btn-order-support').addEventListener('click', () => {
      closeAllSheets();
      openSupport(selectedOrderId);
    });

    document.getElementById('btn-support-send').addEventListener('click', handleSupportSend);
    document.getElementById('btn-copy-support-email').addEventListener('click', copySupportEmail);
    document.getElementById('support-issue-pills')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-issue]');
      if (btn) {
        document.getElementById('support-subject').value = btn.dataset.issue;
        document.getElementById('support-message').focus();
      }
    });

    document.getElementById('btn-profile-info-save').addEventListener('click', handleProfileInfoSave);
    document.getElementById('btn-addr-add').addEventListener('click', showAddressForm);
    document.getElementById('btn-addr-cancel').addEventListener('click', hideAddressForm);
    document.getElementById('btn-addr-save').addEventListener('click', handleAddressSave);
    document.getElementById('btn-notif-save').addEventListener('click', handleNotifSave);
    document.getElementById('btn-settings-save').addEventListener('click', handleSettingsSave);

    // Notification panel
    document.getElementById('btn-notif-panel-close').addEventListener('click', closeNotificationPanel);
    document.getElementById('btn-notif-clear-all').addEventListener('click', clearAllNotifications);

    // Rating
    document.getElementById('btn-rating-close').addEventListener('click', closeRatingSheet);
    document.getElementById('btn-rating-submit').addEventListener('click', handleRatingSubmit);
    document.querySelectorAll('.rating-star').forEach(btn => {
      btn.addEventListener('click', () => selectRatingStar(parseInt(btn.dataset.star)));
    });

    // Chat
    document.getElementById('btn-open-chat').addEventListener('click', openChatSheet);
    document.getElementById('btn-home-chat-quick').addEventListener('click', openChatSheet);
    document.getElementById('btn-chat-close').addEventListener('click', () => { stopChatRefresh(); closeAllSheets(); });
    document.getElementById('btn-chat-send').addEventListener('click', handleChatSend);
    document.getElementById('chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
    });
    document.getElementById('btn-custom-plan-chat').addEventListener('click', openChatSheet);

    // Legal
    document.getElementById('btn-open-terms').addEventListener('click', () => openLegalSheet('terms'));
    document.getElementById('btn-open-privacy').addEventListener('click', () => openLegalSheet('privacy'));
    document.getElementById('btn-legal-close').addEventListener('click', closeAllSheets);

    // Price guide
    document.getElementById('btn-open-pricing-guide').addEventListener('click', openPricingGuide);
    document.getElementById('btn-pricing-guide-close').addEventListener('click', closeAllSheets);

    // Promo code
    document.getElementById('btn-apply-promo').addEventListener('click', handleApplyPromo);
    document.getElementById('promo-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo(); }
    });

    // Wizard navigation
    document.querySelectorAll('.wizard-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = parseInt(btn.dataset.next) - 1;
        if (validateStep(current)) goToWizardStep(parseInt(btn.dataset.next));
      });
    });
    document.querySelectorAll('.wizard-back').forEach(btn => {
      btn.addEventListener('click', () => goToWizardStep(parseInt(btn.dataset.prev)));
    });
    // Click completed step indicators to jump back
    document.querySelectorAll('.wizard-step').forEach(step => {
      step.addEventListener('click', () => {
        const sNum = parseInt(step.dataset.step);
        // Only allow jumping to completed or current steps
        if (step.classList.contains('completed') || step.classList.contains('active')) {
          goToWizardStep(sNum);
        }
      });
      step.style.cursor = 'pointer';
    });

    // Change password
    document.getElementById('btn-open-change-password').addEventListener('click', () => openSheet('sheet-change-password'));
    document.getElementById('btn-change-password-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-change-password-save').addEventListener('click', handleChangePassword);

    // Support tickets list
    document.getElementById('btn-open-my-tickets').addEventListener('click', openMyTickets);
    document.getElementById('btn-my-tickets-close').addEventListener('click', closeAllSheets);
    document.getElementById('btn-ticket-thread-back').addEventListener('click', openMyTickets);
    document.getElementById('btn-ticket-reply-send').addEventListener('click', handleUserTicketReply);
    document.getElementById('ticket-reply-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserTicketReply(); }
    });

    // Help icon tooltip toggle (tap on mobile)
    document.addEventListener('click', e => {
      const icon = e.target.closest('.help-icon');
      // Close all other tooltips
      document.querySelectorAll('.help-icon.show').forEach(el => {
        if (el !== icon) el.classList.remove('show');
      });
      if (icon) {
        e.preventDefault();
        icon.classList.toggle('show');
      }
    });
  }

  function openSheet(sheetId) {
    const overlay = document.getElementById('sheet-overlay');
    document.querySelectorAll('.sheet').forEach(s => {
      if (s.id === sheetId) {
        s.style.display = '';                    // restore display before animating in
        requestAnimationFrame(() => {            // one frame so display change registers
          s.classList.add('active');
          s.setAttribute('aria-hidden', 'false');
        });
      } else {
        const wasActive = s.classList.contains('active');
        s.classList.remove('active');
        s.setAttribute('aria-hidden', 'true');
        if (wasActive) {
          setTimeout(() => { if (!s.classList.contains('active')) s.style.display = 'none'; }, 400);
        } else {
          s.style.display = 'none';
        }
      }
    });
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAllSheets() {
    stopChatRefresh();
    document.getElementById('sheet-overlay').classList.remove('active');
    document.getElementById('sheet-overlay').setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.sheet').forEach(s => {
      s.classList.remove('active');
      s.setAttribute('aria-hidden', 'true');
      setTimeout(() => { if (!s.classList.contains('active')) s.style.display = 'none'; }, 400);
    });
  }

  async function openOrderMap() {
    const order = selectedOrderId ? await SpaccleDB.getDocument(selectedOrderId) : null;
    if (!order) { showToast('No active order'); return; }
    
    openSheet('sheet-order-map');
    const mapEl = document.getElementById('order-map');
    const loading = document.getElementById('order-map-loading');
    const empty = document.getElementById('order-map-empty');
    const pickupAddr = document.getElementById('order-map-pickup');
    const deliveryAddr = document.getElementById('order-map-delivery');
    
    pickupAddr.textContent = order.pickupAddress || order.address || '-';
    deliveryAddr.textContent = order.deliveryAddress || '-';
    
    loading.style.display = 'flex';
    mapEl.style.display = 'none';
    empty.style.display = 'none';
    
    try {
      const cfg = await SpaccleDB.getPreference('integrations_config', null);
      const key = (cfg?.mapsApiKey || getConfig().googleMaps?.apiKey || '').trim();
      if (!key) {
        loading.style.display = 'none';
        empty.style.display = 'flex';
        return;
      }
      
      await loadGoogleMaps(key);
      
      const defaultCenter = { lat: 6.5244, lng: 3.3792 };
      const map = new window.google.maps.Map(mapEl, {
        center: defaultCenter,
        zoom: 13,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
      
      let markers = [];
      
      if (order.pickupLat && order.pickupLng) {
        const pickupMarker = new window.google.maps.Marker({
          position: { lat: order.pickupLat, lng: order.pickupLng },
          map,
          title: 'Pickup Location',
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#4A90E2', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
        });
        markers.push(pickupMarker);
      }
      
      if (order.deliveryLat && order.deliveryLng) {
        const deliveryMarker = new window.google.maps.Marker({
          position: { lat: order.deliveryLat, lng: order.deliveryLng },
          map,
          title: 'Delivery Location',
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#06D6A0', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
        });
        markers.push(deliveryMarker);
      }
      
      if (order.riderLat && order.riderLng && (order.status === 'picked_up' || order.status === 'out_for_delivery')) {
        const riderMarker = new window.google.maps.Marker({
          position: { lat: order.riderLat, lng: order.riderLng },
          map,
          title: 'Your Rider',
          icon: { path: 'M12 2L4 11h3v8h10v-8h3L12 2z', scale: 1.2, fillColor: '#5B4FBE', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1 }
        });
        markers.push(riderMarker);
      }
      
      if (markers.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        markers.forEach(m => bounds.extend(m.getPosition()));
        map.fitBounds(bounds);
      }
      
      mapEl.dataset.ready = 'true';
      loading.style.display = 'none';
      mapEl.style.display = '';
    } catch (err) {
      console.error('Map error:', err);
      loading.style.display = 'none';
      empty.style.display = 'flex';
    }
  }

  function closeOrderMap() {
    closeAllSheets();
  }

  function openSupport(orderId = null) {
    supportOrderId = orderId;
    const pills = document.getElementById('support-issue-pills');
    if (pills) pills.style.display = orderId ? '' : 'none';
    document.getElementById('support-subject').value = '';
    document.getElementById('support-message').value = '';
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

  /* ── Pricing groups ──────────────────────────────────────────── */
  function getPricingMap() {
    const map = {};
    if (itemPricing) itemPricing.forEach(p => { map[p.key] = p.price; });
    return map;
  }

  function buildSectionRow(key) {
    const p = itemPricing?.find(x => x.key === key);
    if (!p) return null;
    const row = document.createElement('div');
    row.className = 'pricing-group';
    const help = GROUP_HELP[key];
    row.innerHTML = `
      <div class="pricing-group__info">
        <div class="pricing-group__name-wrap">
          <span class="pricing-group__name">${p.name}</span>
          ${help ? `<button type="button" class="help-icon" aria-label="More info about ${p.name}"><span>(i)</span><span class="help-tooltip">${help}</span></button>` : ''}
        </div>
        <div class="pricing-group__price">₦${Number(p.price).toLocaleString('en-NG')}/${p.unit}</div>
      </div>
      <div class="pricing-group__stepper">
        <button class="stepper-btn stepper-btn--minus" data-minus="${key}">−</button>
        <span class="stepper-value" data-value="${key}">0</span>
        <button class="stepper-btn stepper-btn--plus" data-plus="${key}">+</button>
      </div>
      <span class="pricing-group__subtotal" data-subtotal="${key}">₦0</span>`;
    row.querySelector(`[data-minus="${key}"]`).addEventListener('click', () => {
      const valEl = row.querySelector(`[data-value="${key}"]`);
      const v = Math.max(0, (parseInt(valEl.textContent) || 0) - 1);
      valEl.textContent = v;
      updateGroupSubtotal(key, v, p.price);
      onPricingChange();
    });
    row.querySelector(`[data-plus="${key}"]`).addEventListener('click', () => {
      const valEl = row.querySelector(`[data-value="${key}"]`);
      const v = (parseInt(valEl.textContent) || 0) + 1;
      valEl.textContent = v;
      updateGroupSubtotal(key, v, p.price);
      onPricingChange();
    });
    return row;
  }

  function renderPricingGroups() {
    const container = document.getElementById('pricing-groups');
    if (!container) return;
    container.innerHTML = '';

    CATEGORY_SECTIONS.forEach(section => {
      const hasGroup = section.groups.some(k => itemPricing?.some(p => p.key === k));
      if (!hasGroup) return;
      const header = document.createElement('div');
      header.className = 'pricing-section__header';
      header.textContent = section.name;
      container.appendChild(header);
      section.groups.forEach(key => {
        const row = buildSectionRow(key);
        if (row) container.appendChild(row);
      });
    });

    // Iron Only — flat rate stepper
    const ironSection = document.createElement('div');
    ironSection.className = 'pricing-section__header';
    ironSection.innerHTML = 'Iron Only <button type="button" class="help-icon" aria-label="More info about Iron Only"><span>(i)</span><span class="help-tooltip">For pre-washed items that only need pressing and folding.</span></button>';
    container.appendChild(ironSection);
    const ironWrap = document.createElement('div');
    ironWrap.className = 'iron-only-stepper';
    ironWrap.innerHTML = `
      <button class="stepper-btn stepper-btn--minus" data-iron-minus>-</button>
      <span class="stepper-value" id="iron-count">0</span>
      <button class="stepper-btn stepper-btn--plus" data-iron-plus>+</button>
      <span style="font-size:13px;color:var(--text-2);margin-left:8px">× ₦600/item</span>`;
    ironWrap.querySelector('[data-iron-minus]').addEventListener('click', () => {
      const el = document.getElementById('iron-count');
      const v = Math.max(0, (parseInt(el.textContent) || 0) - 1);
      el.textContent = v;
      onPricingChange();
    });
    ironWrap.querySelector('[data-iron-plus]').addEventListener('click', () => {
      const el = document.getElementById('iron-count');
      el.textContent = (parseInt(el.textContent) || 0) + 1;
      onPricingChange();
    });
    container.appendChild(ironWrap);
    restorePendingBreakdown();
  }

  function restorePendingBreakdown() {
    if (!pendingItemsBreakdown) return;
    const bd = pendingItemsBreakdown;
    pendingItemsBreakdown = null;

    // Restore iron count
    if (bd['iron-items']) {
      const el = document.getElementById('iron-count');
      if (el) el.textContent = bd['iron-items'];
    }
    // Restore pricing group steppers
    Object.entries(bd).forEach(([key, count]) => {
      if (count <= 0 || key === 'iron-items') return;
      const valEl = document.querySelector(`[data-value="${key}"]`);
      if (!valEl) return;
      valEl.textContent = count;
      const p = itemPricing?.find(x => x.key === key);
      if (p) updateGroupSubtotal(key, count, p.price);
    });
    computeItemsBreakdown();
  }

  function updateGroupSubtotal(key, qty, price) {
    const el = document.querySelector(`[data-subtotal="${key}"]`);
    if (el) el.textContent = `₦${(qty * price).toLocaleString('en-NG')}`;
  }

  function computeItemsBreakdown() {
    const breakdown = {};
    let total = 0;

    ALL_PRICING_GROUP_KEYS.forEach(key => {
      const valEl = document.querySelector(`[data-value="${key}"]`);
      const count = valEl ? (parseInt(valEl.textContent) || 0) : 0;
      breakdown[key] = count;
      total += count;
    });
    const ironCount = parseInt(document.getElementById('iron-count')?.textContent) || 0;
    if (ironCount > 0) {
      breakdown['iron-items'] = ironCount;
      total += ironCount;
    }
    return { breakdown, total };
  }

  function computePriceFromGroups(breakdown) {
    const priceMap = getPricingMap();
    let total = 0;
    Object.entries(breakdown || {}).forEach(([key, qty]) => {
      const unitPrice = key === 'iron-items' ? 600 : (priceMap[key] || 0);
      total += (Number(qty) || 0) * unitPrice;
    });
    return total;
  }

  function deriveServiceCategories(breakdown) {
    const cats = [];
    if (!breakdown) return cats;
    // Check Laundry section
    const laundryGroups = CATEGORY_SECTIONS[0].groups;
    if (laundryGroups.some(k => (breakdown[k] || 0) > 0)) cats.push('laundry');
    // Check Specialty Items section
    const specialtyGroups = CATEGORY_SECTIONS[1].groups;
    if (specialtyGroups.some(k => (breakdown[k] || 0) > 0)) cats.push('specialty-items');
    // Check Iron Only
    if ((breakdown['iron-items'] || 0) > 0) cats.push('iron-only');
    return cats;
  }

  function onPricingChange() {
    computeItemsBreakdown();
    if (document.getElementById('wizard-panel-3')?.style.display !== 'none') renderOrderSummary();
  }

  function clearStepErrors() {
    document.querySelectorAll('.validation-error').forEach(el => { el.style.display = 'none'; el.textContent = ''; });
  }

  function validateStep(step) {
    clearStepErrors();
    if (step === 1) {
      const { total } = computeItemsBreakdown();
      if (total <= 0) {
        document.getElementById('step1-error').textContent = 'Add at least one item to continue.';
        document.getElementById('step1-error').style.display = '';
        return false;
      }
    }
    if (step === 2) {
      const addr = document.getElementById('pickup-address')?.value.trim();
      if (!addr) {
        document.getElementById('step2-error').textContent = 'Enter a pickup address to continue.';
        document.getElementById('step2-error').style.display = '';
        return false;
      }
      if (!selectedPickupTime) {
        document.getElementById('step2-error').textContent = 'Select a pickup time slot to continue.';
        document.getElementById('step2-error').style.display = '';
        return false;
      }
    }
    return true;
  }

  function goToWizardStep(step) {
    document.querySelectorAll('.wizard-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById(`wizard-panel-${step}`);
    if (panel) panel.style.display = '';

    document.querySelectorAll('.wizard-step').forEach(s => {
      const sNum = parseInt(s.dataset.step);
      s.classList.toggle('active', sNum === step);
      s.classList.toggle('completed', sNum < step);
    });

    // Render pricing groups when reaching step 1, order summary on step 3
    if (step === 1) renderPricingGroups();
    if (step === 3) renderOrderSummary();
  }

  /* ── Order summary ──────────────────────────────────────────────── */
  function renderOrderSummary() {
    const wrap = document.getElementById('order-summary');
    if (!wrap) return;

    const day = selectedPickupDate || new Date().toISOString().split('T')[0];
    const time = selectedPickupTime;
    const address = document.getElementById('pickup-address')?.value.trim() || '';
    const deliveryMode = document.getElementById('deliver-back-checkbox')?.checked;
    const deliveryAddr = deliveryMode
      ? address
      : (document.getElementById('delivery-address')?.value.trim() || address);
    const notes = document.getElementById('pickup-notes')?.value.trim() || '';
    const dateLabel = new Date(day + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    const { breakdown, total: itemsCount } = computeItemsBreakdown();
    const priceMap = getPricingMap();
    const isSub = billingMode === 'subscription';

    const categories = deriveServiceCategories(breakdown);
    const catLabel = serviceName(categories);

    let breakdownHtml = '';
    let subtotal = 0;
    if (itemsCount > 0) {
      const rows = Object.entries(breakdown)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => {
          const p = key === 'iron-items' ? null : itemPricing?.find(x => x.key === key);
          const label = key === 'iron-items' ? 'Iron Only' : (p?.name || key);
          const unitPrice = key === 'iron-items' ? 600 : (p?.price || priceMap[key] || 0);
          const linePrice = count * unitPrice;
          subtotal += linePrice;
          return `<div class="order-summary__item-cat"><span>${label}</span><span>${count} × ₦${unitPrice.toLocaleString('en-NG')} = ₦${linePrice.toLocaleString('en-NG')}</span></div>`;
        })
        .join('');
      breakdownHtml = `<div class="order-summary__items-breakdown">${rows}</div>`;
    }

    const total = isSub ? 0 : applyPromoDiscount(subtotal);

    wrap.innerHTML = `
      <div class="order-summary__row">
        <span class="order-summary__label">Categories</span>
        <span class="order-summary__value">${catLabel}</span>
      </div>
      <div class="order-summary__row">
        <span class="order-summary__label">Date &amp; Time</span>
        <span class="order-summary__value">${dateLabel}<br>${time}</span>
      </div>
      <div class="order-summary__row">
        <span class="order-summary__label">Pickup</span>
        <span class="order-summary__value">${address || '—'}</span>
      </div>
      <div class="order-summary__row">
        <span class="order-summary__label">Delivery</span>
        <span class="order-summary__value">${deliveryAddr || '—'}</span>
      </div>
      ${notes ? `<div class="order-summary__row"><span class="order-summary__label">Notes</span><span class="order-summary__value">${notes}</span></div>` : ''}
      <div class="order-summary__row">
        <span class="order-summary__label">Billing</span>
        <span class="order-summary__value">${isSub ? 'Monthly Plan' : 'Pay As You Go'}${isSub && itemsCount ? ` · ${itemsCount} items` : ''}</span>
      </div>
      ${!isSub ? `
      ${breakdownHtml}
      ${appliedPromo ? `
      <div class="order-summary__row">
        <span class="order-summary__label">Discount</span>
        <span class="order-summary__value" style="color:#2E7D32">
          ${appliedPromo.discountType === 'percent' ? `${appliedPromo.value}% off` : `-₦${Number(appliedPromo.value).toLocaleString('en-NG')}`}
        </span>
      </div>` : ''}
      <div class="order-summary__row order-summary__row--total">
        <span class="order-summary__label">Estimated Total</span>
        <span class="order-summary__value">₦${total.toLocaleString('en-NG')}</span>
      </div>` : ''}
    `;
  }

  async function handleScheduleConfirm() {
    if (!user) return;
    const btn = document.getElementById('btn-schedule-confirm');
    const day = selectedPickupDate || new Date().toISOString().split('T')[0];
    const time = selectedPickupTime;
    const addressEl = document.getElementById('pickup-address');
    const notes = document.getElementById('pickup-notes').value.trim();
    const address = addressEl.value.trim();
    const deliverBackCheckbox = document.getElementById('deliver-back-checkbox');
    const deliveryAddress = deliverBackCheckbox && deliverBackCheckbox.checked
      ? address
      : (document.getElementById('delivery-address')?.value.trim() || address);
    const { breakdown: itemsBreakdown, total: itemsCount } = computeItemsBreakdown();

    if (!address) {
      addressEl.focus();
      showToast('Please enter a pickup address');
      return;
    }

    if (!time) {
      showToast('Please select a pickup time');
      return;
    }

    if (billingMode === 'payg' && (!itemsCount || itemsCount <= 0)) {
      showToast('Add at least one item');
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

    if (billingMode === 'subscription') {
      let order;
      try {
        order = await SpaccleDB.createOrder({
          userId: user.userId,
          serviceCategories: deriveServiceCategories(itemsBreakdown),
          billingMode,
          planId: subscription?.planId,
          itemsCount: Number(itemsCount) || null,
          itemsBreakdown,
          pickupDay: day,
          pickupTime: time,
          address,
          deliveryAddress,
          notes,
          amountPaid: null,
        });
      } catch (createErr) {
        showToast('Could not schedule: ' + (createErr?.message || 'unknown error'));
        setButtonLoading(btn, false);
        return;
      }
      try {
        await SpaccleDB.consumeSubscription({ userId: user.userId, itemsCount });
      } catch (consumeErr) {
        if (consumeErr.message === 'NOT_ENOUGH_ITEMS') {
          showToast('Not enough items remaining in your plan — reduce the count or upgrade your plan');
        } else {
          console.warn('Order created but subscription consumption failed — admin may need to debit manually');
        }
      }
      document.getElementById('pickup-address').value = '';
      document.getElementById('pickup-notes').value = '';
      closeAllSheets();
      showToast('Pickup scheduled');
      selectedOrderId = order._id;
      switchTab('track');
      setButtonLoading(btn, false);
      await refresh();
      return;
    }

    // PAYG: collect Paystack deposit first
    let pk, amountKobo, handler;
    try {
      const cfg = await SpaccleDB.getPreference('integrations_config', null);
      pk = (cfg?.paystackPublicKey || getConfig().paystack?.publicKey || '').trim();
      if (!pk) {
        showToast('Payment not configured — contact support');
        return;
      }

      await loadPaystack();
      const reference = `SPACCLE_PICKUP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      const amount = computePriceFromGroups(itemsBreakdown);
      amountKobo = applyPromoDiscount(amount) * 100;

      if (amountKobo <= 0) {
        // Free order path
        if (appliedPromo?.code) {
          try { await SpaccleDB.redeemPromoCode(appliedPromo.code, user.userId); } catch {}
        }
        appliedPromo = null;
        const pi = document.getElementById('promo-code');
        const ps = document.getElementById('promo-status');
        if (pi) pi.value = '';
        if (ps) ps.textContent = '';
        await placeOrder({ userId: user.userId, day, time, address, deliveryAddress, notes, itemsCount });
        return;
      }

      handler = window.PaystackPop.setup({
        key: pk,
        email: user.email || 'guest@spaccle.com',
        amount: amountKobo,
        currency: 'NGN',
        ref: reference,
        label: `Pickup — ${itemsCount} item${itemsCount !== 1 ? 's' : ''}`,
        callback: function() {
          if (appliedPromo) {
            SpaccleDB.redeemPromoCode(appliedPromo.code).catch(() => {});
            appliedPromo = null;
            const statusEl = document.getElementById('promo-status');
            if (statusEl) statusEl.textContent = '';
          }
          placeOrder({ userId: user.userId, day, time, address, deliveryAddress, notes, itemsCount, paystackRef: reference })
            .catch(function() { showToast('Order save failed — contact support'); });
        },
        onClose: function() {
          showToast('Payment cancelled');
          setButtonLoading(btn, false);
        },
      });
    } catch (err) {
      showToast('Could not schedule: ' + (err?.message || 'unknown error'));
      setButtonLoading(btn, false);
      return;
    }

    // Open iframe OUTSIDE try/finally so finally does not run here
    handler.openIframe();
    // button loading cleared in callback/onClose
  }

  async function placeOrder({ userId, day, time, address, deliveryAddress, notes, itemsCount, paystackRef = null }) {
    const { breakdown: itemsBreakdown } = computeItemsBreakdown();
    const amountPaid = billingMode === 'payg' ? computePriceFromGroups(itemsBreakdown) : null;

    const order = await SpaccleDB.createOrder({
      userId,
      serviceCategories: deriveServiceCategories(itemsBreakdown),
      billingMode,
      planId: billingMode === 'subscription' ? subscription?.planId : null,
      itemsCount: Number(itemsCount) || null,
      itemsBreakdown,
      pickupDay: day,
      pickupTime: time,
      address,
      deliveryAddress,
      notes,
      paystackRef,
      amountPaid,
    });

    const btn = document.getElementById('btn-schedule-confirm');
    document.getElementById('pickup-address').value = '';
    document.getElementById('pickup-notes').value = '';
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
      'regular-laundry':    'Regular Laundry',
      'specialty-dry-clean':'Specialty Dry Cleaning',
      'iron-only':          'Iron Only',
      'specialty-items':    'Specialty Items',
      'laundry':            'Laundry',
    };
    if (Array.isArray(service)) {
      return service.map(s => names[s] || s).join(', ') || 'Items';
    }
    return names[service] || 'Regular Laundry';
  }

  function statusLabel(status) {
    const labels = {
      scheduled:  "Scheduled",
      confirmed:  "Confirmed (legacy)",
      assigned:   "Rider Assigned",
      picked_up:  "Picked Up",
      processing: "Processing",
      cleaning:   "Cleaning (legacy)",
      ready:      "Ready for Delivery",
      out_for_delivery: "Out for Delivery",
      delivered:  "Delivered",
      completed:  "Completed",
      cancelled:  "Cancelled",
    };
    return labels[status] || "In Progress";
  }

  function statusSub(status) {
    const subs = {
      scheduled:  "We'll arrive within your pickup window.",
      confirmed:  "Your order is scheduled — we'll pick it up soon.",
      assigned:   "A rider has been assigned and will collect your laundry.",
      picked_up:  "Your laundry is on the way to our facility.",
      processing: "Your items are being sorted, cleaned, and prepared.",
      cleaning:   "Your items are being cleaned and prepared.",
      ready:      "Your laundry is ready — delivery is next.",
      out_for_delivery: "Your clean laundry is on the way to you!",
      delivered:  "Delivered to your address. Enjoy fresh laundry!",
      completed:  "Order complete. Thank you for using Spaccle.",
      cancelled:  "This order has been cancelled.",
    };
    return subs[status] || "";
  }

  function statusTitle(status) {
    const titles = {
      scheduled:  "Pickup Scheduled",
      confirmed:  "Order Confirmed (legacy)",
      assigned:   "Rider Assigned",
      picked_up:  "Picked Up",
      processing: "At Facility",
      cleaning:   "Cleaning (legacy)",
      ready:      "Ready for Delivery",
      out_for_delivery: "Out for Delivery",
      delivered:  "Delivered",
      completed:  "Completed",
      cancelled:  "Cancelled",
    };
    return titles[status] || "In Progress";
  }

  function isActive(order) {
    return order && !['delivered', 'completed', 'cancelled'].includes(order.status);
  }

  async function refresh() {
    if (!user) return;
    const activeOrder = await SpaccleDB.getActiveOrder(user.userId);
    const orders = await SpaccleDB.listOrders(user.userId);

    renderHomeActiveOrder(activeOrder);
    renderOrders(orders);
    renderTracking(activeOrder);
    renderSubscriptionUsageBar();

    if (!document.getElementById('sheet-order')?.classList.contains('active')) {
      selectedOrderId = activeOrder?._id || selectedOrderId;
    }
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
    document.getElementById('order-items-val').textContent = serviceName(order.serviceCategories || order.service);

    const steps = Array.from(card.querySelectorAll('.order-track-step'));
    const map = {
      scheduled:  0,
      assigned:   1,
      picked_up:  1,
      processing: 2,
      ready:      3,
      out_for_delivery: 3,
      delivered:  4,
      completed:  4,
      cancelled:  0,
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
      title.textContent = serviceName(order.serviceCategories || order.service);

      const meta = document.createElement('div');
      meta.className = 'order-item__meta';
      meta.textContent = `Ordered ${formatTime(order.createdAt)}`;

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
      const title = document.getElementById('sheet-order-title');
      title.textContent = order.publicId || 'SP-000000';
      const detail = document.getElementById('order-detail');
      detail.innerHTML = renderOrderDetailHtml(order);

      const cancelBtn = document.getElementById('btn-order-cancel');
      const reorderBtn = document.getElementById('btn-order-reorder');
      const cancellable = ['scheduled'].includes(order.status);
      if (cancelBtn) {
        cancelBtn.style.display = cancellable ? '' : 'none';
        cancelBtn.onclick = () => handleCancelOrder(order._id);
      }
      if (reorderBtn) {
        reorderBtn.style.display = ['delivered', 'completed'].includes(order.status) ? '' : 'none';
        reorderBtn.onclick = () => handleReorder(order);
      }
      const rateBtn = document.getElementById('btn-order-rate');
      if (rateBtn) {
        const canRate = ['delivered', 'completed'].includes(order.status) && !order.rating;
        rateBtn.style.display = canRate ? '' : 'none';
        rateBtn.onclick = () => openRatingSheet(order);
      }
      const supportBtn = document.getElementById('btn-order-support');
      if (supportBtn) {
        const isDelivered = ['delivered', 'completed'].includes(order.status);
        supportBtn.textContent = isDelivered ? 'Report Issue' : 'Support';
      }

      // Resolve rider IDs to names
      const pickupRiderEl = document.getElementById('order-detail-pickup-rider');
      const deliveryRiderEl = document.getElementById('order-detail-delivery-rider');
      async function resolveRider(id) {
        if (!id || id.startsWith('user_')) {
          const profile = id ? await SpaccleDB.getUserProfile(id).catch(() => null) : null;
          return profile?.name || id || '—';
        }
        return id;
      }
      if (pickupRiderEl) {
        resolveRider(order.assignedDriver || order.pickupRiderId).then(name => { pickupRiderEl.textContent = name; });
      }
      if (deliveryRiderEl && order.deliveryRiderId) {
        resolveRider(order.deliveryRiderId).then(name => { deliveryRiderEl.textContent = name; });
      }
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
      <div class="order-detail__row"><strong>Service:</strong> ${escapeHtml(serviceName(order.serviceCategories || order.service))}</div>
      <div class="order-detail__row"><strong>Pickup:</strong> ${escapeHtml(`${order.pickupDay || '—'}, ${order.pickupTime || '—'}`)}</div>
      <div class="order-detail__row"><strong>Address:</strong> ${escapeHtml(order.address || '—')}</div>
      <div class="order-detail__row"><strong>Delivery:</strong> ${escapeHtml(order.deliveryAddress || order.address || '—')}</div>
      <div class="order-detail__row"><strong>Items:</strong> ${escapeHtml(String(order.itemsCount || '—'))}</div>
      <div class="order-detail__row"><strong>Amount:</strong> ${order.amountPaid ? '₦' + Number(order.amountPaid).toLocaleString() : '—'}</div>
      <div class="order-detail__row"><strong>Pickup Rider:</strong> <span id="order-detail-pickup-rider">${escapeHtml(order.assignedDriver || order.pickupRiderId || '—')}</span></div>
      ${order.deliveryRiderId ? `<div class="order-detail__row"><strong>Delivery Rider:</strong> <span id="order-detail-delivery-rider">${escapeHtml(order.deliveryRiderId || '—')}</span></div>` : ''}
      <div class="order-detail__row"><strong>Status:</strong> ${escapeHtml(statusLabel(order.status))}</div>
      <div class="order-detail__row"><strong>Ordered:</strong> ${escapeHtml(formatTime(order.createdAt))}</div>
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
    const pillEl = document.getElementById('track-status-pill');
    if (pillEl) {
      pillEl.textContent = statusLabel(order.status);
      pillEl.className = 'track-card__pill status-pill status-pill--' + (order.status || 'scheduled');
    }
    document.getElementById('track-pickup').textContent = `${order.pickupDay || '—'}, ${order.pickupTime || '—'}`;
    document.getElementById('track-ready').textContent = estimateReady(order);

    selectedOrderId = order._id;

    const timelineEl = document.getElementById('track-timeline');
    timelineEl.innerHTML = '';
    const flow = [
      { statuses: ['scheduled'],                           label: 'Scheduled',   sub: 'Pickup window confirmed.' },
      { statuses: ['assigned', 'picked_up'],               label: 'Picked Up',   sub: 'Driver collected your laundry.' },
      { statuses: ['processing'],              label: 'At Facility', sub: 'Your items are being processed.' },
      { statuses: ['ready', 'out_for_delivery'],                 label: 'Out for Delivery', sub: 'On the way to you.' },
      { statuses: ['delivered', 'completed'],              label: 'Delivered',   sub: 'Delivered to your address.' },
    ];
    const idx = flow.findIndex(s => s.statuses.includes(order.status));

    function stepTime(statuses) {
      if (!order.events) return null;
      let latest = null;
      for (const ev of order.events) {
        if (statuses.includes(ev.status)) {
          if (!latest || ev.timestamp > latest.timestamp) latest = ev;
        }
      }
      return latest ? latest.timestamp : null;
    }

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

      // Show timestamp for completed/active steps
      if (i <= idx) {
        const ts = stepTime(step.statuses);
        if (ts) {
          const timeEl = document.createElement('div');
          timeEl.className = 'timeline-time';
          timeEl.textContent = new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          body.appendChild(timeEl);
        }
      }
      item.appendChild(dot);
      item.appendChild(body);
      timelineEl.appendChild(item);
    });
  }

  function estimateReady(order) {
    if (!order?.createdAt) return '—';
    const created = Date.parse(order.createdAt);
    if (!created) return '—';
    const readyAt = new Date(created + 24 * 60 * 60 * 1000);
    return readyAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  async function setBillingMode(mode) {
    billingMode = mode === 'subscription' ? 'subscription' : 'payg';
    await updateBillingUI();
  }

  async function updateBillingUI() {
    const paygBtn = document.getElementById('btn-billing-payg');
    const subBtn = document.getElementById('btn-billing-sub');
    const subBlock = document.getElementById('subscription-block');
    const tabsContainer = document.getElementById('billing-tabs');
    const itemsGroup = document.getElementById('items-count-group');
    const required = document.getElementById('subscription-required');

    const activeSub = user && await hasActiveSub();

    if (tabsContainer) tabsContainer.style.display = activeSub ? 'none' : '';

    if (paygBtn && subBtn) {
      paygBtn.classList.toggle('active', billingMode === 'payg');
      subBtn.classList.toggle('active', billingMode === 'subscription');
    }

    if (activeSub) {
      billingMode = 'subscription';
      subscription = await SpaccleDB.getSubscription(user.userId);
    }

    if (subBlock) subBlock.style.display = billingMode === 'subscription' ? '' : 'none';

    const isSub = billingMode === 'subscription';
    // For subscription users items count is optional (no validation), for PAYG it's required
    if (itemsGroup) itemsGroup.style.display = '';

    // Subscription upsell — visible only for non-subscribed users
    const upsell = document.getElementById('sub-upsell');
    if (upsell) upsell.style.display = isSub ? 'none' : '';

    // Promo visible only for PAYG
    const promoGroup = document.getElementById('promo-group');
    if (promoGroup) promoGroup.style.display = isSub ? 'none' : '';

    computeItemsBreakdown();

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
        const planName = subscription.planName || subscription.planId?.replace(/^plan_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Plan';
        const itemsLeft = (Number(subscription.itemsRemaining) || 0) + (Number(subscription.rolloverRemaining) || 0);
        current.textContent = `Active: ${planName} • Items left: ${itemsLeft} • Pickups left: ${picks} • Renew: ${ren}`;
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
    const freshSub = await SpaccleDB.getSubscription(user.userId);
    if (freshSub?.status === 'active') { showToast('You already have an active subscription'); return; }
    const btn = document.getElementById('btn-subscribe-pay');
    setButtonLoading(btn, true);

    let handler;
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

      handler = window.PaystackPop.setup({
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
              setTimeout(() => openSheet('sheet-schedule'), 400);
            })
            .catch(function() { showToast('Subscribed but could not update UI — please restart'); });
        },
        onClose: function() {
          showToast('Payment closed');
          setButtonLoading(btn, false);
        },
      });
    } catch (err) {
      showToast('Could not subscribe: ' + (err?.message || 'unknown error'));
      setButtonLoading(btn, false);
      return;
    }

    // Open iframe OUTSIDE try/finally so finally does not immediately re-enable the button
    handler.openIframe();
    // button loading cleared in callback/onClose
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
      showToast('Add your Maps API key in Admin → Config');
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

  function initPlaceAutocomplete(inputEl) {
    if (!inputEl || !window.google?.maps?.places) return;
    const autocomplete = new google.maps.places.Autocomplete(inputEl, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'NG' },
      fields: ['formatted_address', 'address_components'],
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place?.formatted_address) {
        inputEl.value = place.formatted_address;
        inputEl.dispatchEvent(new Event('input'));
      }
    });
  }

  function loadGoogleMaps(apiKey, libraries = 'places') {
    if (window.google?.maps?.places && libraries?.includes('places')) return Promise.resolve(true);
    if (window.google?.maps && !libraries) return Promise.resolve(true);
    if (window._spaccleMapsPromise && !libraries) return window._spaccleMapsPromise;

    window._spaccleMapsPromise = new Promise((resolve, reject) => {
      const callbackName = '_spaccleMapsInit_' + Math.random().toString(36).slice(2, 9);
      window[callbackName] = () => {
        try { delete window[callbackName]; } catch { }
        resolve(true);
      };

      const script = document.createElement('script');
      const encodedKey = encodeURIComponent(apiKey);
      const libs = libraries ? `&libraries=${encodeURIComponent(libraries)}` : '';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodedKey}&callback=${callbackName}${libs}`;
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
      if (updated.name?.length) {
        document.getElementById('home-avatar-letter').textContent = updated.name[0].toUpperCase();
        document.getElementById('profile-avatar-lg').textContent = updated.name[0].toUpperCase();
      }
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

  const NOTIF_KEY = 'spaccle_notifications';

  function getStoredNotifications() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
  }

  function storeNotification(title, body) {
    const list = getStoredNotifications();
    list.unshift({ id: Date.now().toString(), title, body, at: new Date().toISOString(), read: false });
    if (list.length > 50) list.splice(50);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    updateNotifBadge();
  }

  function updateNotifBadge() {
    const unread = getStoredNotifications().filter(n => !n.read).length;
    const badge = document.getElementById('home-notify-badge');
    if (badge) badge.textContent = unread > 0 ? (unread > 9 ? '9+' : String(unread)) : '';
  }

  async function fireOrderNotification(title, body) {
    const prefs = await SpaccleDB.getPreference('notification_prefs', {});
    if (prefs.orderUpdates === false && prefs.orderReady === false) return;

    storeNotification(title, body);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: 'img/icon.png' }); } catch { }
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

      ready:     { title: 'Ready for Delivery 🎉', body: `Your laundry (#${order.publicId || 'SP-000000'}) is ready!` },
      delivered: { title: 'Delivered', body: `Your laundry (#${order.publicId || 'SP-000000'}) has been delivered.` },
    };

    const msg = messages[order.status];
    if (!msg) return;
    if (order.status === 'ready' && prefs.orderReady === false) return;
    if (order.status !== 'ready' && prefs.orderUpdates === false) return;
    await fireOrderNotification(msg.title, msg.body);

    if (order.status === 'delivered' && !order.rating) {
      setTimeout(() => openRatingSheet(order), 1500);
    }
  }

  /* ── Profile — App Settings ──────────────────────────────────── */
  async function openProfileSettings() {
    const s = await SpaccleDB.getPreference('app_settings', {});
    document.getElementById('setting-show-prices').checked = s.showPrices !== false;
    document.getElementById('setting-compact-list').checked = s.compactList === true;
    document.getElementById('setting-confirm-schedule').checked = s.confirmSchedule !== false;
    document.getElementById('setting-autofill-addr').checked = s.autofillAddr !== false;
    document.getElementById('setting-dark-mode').checked = s.darkMode === true;
    const langEl = document.getElementById('setting-language');
    if (langEl) langEl.value = s.language || 'en';
    openSheet('sheet-profile-settings');
  }

  async function handleSettingsSave() {
    const btn = document.getElementById('btn-settings-save');
    setButtonLoading(btn, true);
    try {
      const darkMode = document.getElementById('setting-dark-mode').checked;
      const language = document.getElementById('setting-language')?.value || 'en';
      await SpaccleDB.setPreference('app_settings', {
        showPrices: document.getElementById('setting-show-prices').checked,
        compactList: document.getElementById('setting-compact-list').checked,
        confirmSchedule: document.getElementById('setting-confirm-schedule').checked,
        autofillAddr: document.getElementById('setting-autofill-addr').checked,
        darkMode,
        language,
      });
      applyDarkMode(darkMode);
      applyLanguage(language);
      closeAllSheets();
      showToast('Settings saved');
    } catch {
      showToast('Could not save settings');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /* ── Dark mode ───────────────────────────────────────────────── */
  function applyDarkMode(on) {
    document.body.classList.toggle('dark', !!on);
    // Sync sun/moon icons in all topbars
    document.querySelectorAll('.theme-icon-sun').forEach(el => { el.style.display = on ? 'none' : ''; });
    document.querySelectorAll('.theme-icon-moon').forEach(el => { el.style.display = on ? '' : 'none'; });
  }

  async function initTheme() {
    try {
      const s = await SpaccleDB.getPreference('app_settings', {});
      applyDarkMode(s.darkMode === true);
      applyLanguage(s.language || 'en');
    } catch { }
  }

  async function handleQuickThemeToggle() {
    const isDark = document.body.classList.contains('dark');
    applyDarkMode(!isDark);
    try {
      const s = await SpaccleDB.getPreference('app_settings', {});
      await SpaccleDB.setPreference('app_settings', { ...s, darkMode: !isDark });
    } catch { }
  }

  /* ── Language / i18n ─────────────────────────────────────────── */
  const TRANSLATIONS = {
    yo: {
      /* ── Home tab ── */
      'Free pickup & delivery':                      'Gbígbà àti fíránṣẹ́ lọ́fẹ̀',
      'Ready for fresh laundry today?':              'Ṣé o ṣetán fún aṣọ tútù lónì?',
      'Schedule Pickup':                             'Ṣeto Gbígbà',
      'Active Order':                                'Àṣẹ tó Ṣiṣẹ',
      'View all':                                    'Wo gbogbo rẹ',
      'No active orders':                            'Kò sí àṣẹ tó ṣiṣẹ',
      "Schedule a pickup and we'll handle the rest": 'Ṣeto gbígbà, a ó ṣe iyókù',
      'Order ID':                                    'Nọ́mbà Àṣẹ',
      'Pickup':                                      'Gbígbà',
      'Service':                                     'Iṣẹ',
      'Picked up':                                   'Ti Gbà',
      'Cleaning':                                    'Ìmọ̀tótó',
      'Ready':                                       'Ṣetán',
      'Delivered':                                   'Ti Ranṣẹ',
      'Our Services':                                'Àwọn Iṣẹ Wa',
      'Wash, Iron & Fold':                           'Fọ, Irò &amp; Pín',
      'Dry Cleaning':                                'Ìmọ̀tótó Gbígbẹ',
      'Iron & Press':                                'Irò &amp; Tẹ',
      'Duvet & Bedding':                             'Ibòrí &amp; Àṣọ-ibùsùn',
      'Alterations':                                 'Àtúnṣe',
      'Shoe Cleaning':                               'Ìmọ̀tótó Bàtà',
      'New customer offer':                          'Ìgbàdí onibàárà tuntun',
      'First order 20% off':                         'Àṣẹ àkọ́kọ́ 20% ẹ̀san',
      'How It Works':                                'Bí Ó Ṣe Ń Ṣiṣẹ',
      'Schedule':                                    'Ṣeto',
      'Pick a time that works for you':              'Yan àkókò tó bá ọ mu',
      'We collect':                                  'A Gba',
      'Door-to-door pickup at your chosen time':     'Gbígbà lẹ́nu ọ̀nà rẹ ní àkókò tí o yàn',
      'We clean':                                    'A Wẹ',
      'Expert care for every garment':               'Ìtọ́jú àgbèjọrò fún aṣọ kọ̀ọ̀kan',
      'Back at your door, fresh and folded':         'Padà sí ọ tútù àti pín',
      'Chat with Us':                                'Bá Wa Sọ̀rọ̀',
      "Questions? We're here to help":               'Ìbéèrè? A wà níbí láti ràn ọ́ lọ́wọ́',
      /* ── Orders tab ── */
      'Orders':                                      'Àwọn Àṣẹ',
      'Track your laundry from pickup to delivery.': 'Tẹ̀lé aṣọ rẹ láti gbígbà sí fíránṣẹ́.',
      'New Order':                                   'Àṣẹ Tuntun',
      'No orders yet':                               'Kò sí àṣẹ síbẹ̀',
      'Schedule a pickup and your orders will show up here.': 'Ṣeto gbígbà, àṣẹ rẹ yóò farahàn níbí.',
      /* ── Track tab ── */
      'Tracking':                                    'Ìtẹ̀lé',
      'See when your laundry will be ready.':        'Rí ìgbà tí aṣọ rẹ yóò ṣetán.',
      'Support':                                     'Ìrànlọ́wọ́',
      'No active order':                             'Kò sí àṣẹ tó ṣiṣẹ',
      'Once you schedule a pickup, tracking will appear here.': 'Bí o bá ṣeto gbígbà, ìtẹ̀lé yóò farahàn níbí.',
      'View Details':                                'Wo Àlàyé',
      'Est. ready':                                  'Àsọtẹ́lẹ̀ ṣetán',
      /* ── Profile tab ── */
      'Home':                                        'Ilé',
      'Track':                                       'Tẹ̀lé',
      'Profile':                                     'Àkọsílẹ̀',
      'Account':                                     'Àkáǹtì',
      'Preferences':                                 'Àwọn Yàn',
      'Legal':                                       'Òfin',
      'Personal Information':                        'Ìsọfúnni Tàbítì',
      'Saved Addresses':                             'Àdírẹ́sì Tí A Tọ́jú',
      'Payment Methods':                             'Ọ̀nà Ìsanwó',
      'Change Password':                             'Yí Ọ̀rọ̀ Àṣírí Padà',
      'Notifications':                               'Àwọn Ìfitónilétí',
      'App Settings':                                'Ìtọ́nà App',
      'Help & Support':                              'Ìrànlọ́wọ́',
      'My Support Tickets':                          'Àwọn Tikẹ́tì Atilẹ̀yìn Mi',
      'Price Guide':                                 'Ìtọ́sọ̀nà Iye',
      'Terms of Service':                            'Àwọn Ìlànà Iṣẹ́',
      'Privacy Policy':                              'Òfin Ìkọ̀kọ̀',
      'Sign Out':                                    'Jáde',
      /* ── Sheet ── */
      'Billing':                                     'Ìsanwó',
      'Pay As You Go':                               'Sanwó Bí O Bá Lọ',
      'Monthly Plan':                                'Ètò Oṣooṣu',
      'Bedding':                                     'Àṣọ-ibùsùn',
      'Shoes':                                       'Bàtà',
      'Confirm Pickup':                              'Jẹ́rìí Gbígbà',
    },
    ig: {
      /* ── Home tab ── */
      'Free pickup & delivery':                      'Nweta na nneweta n\'efu',
      'Ready for fresh laundry today?':              'I dị njikere maka akwa ọhụrụ taa?',
      'Schedule Pickup':                             'Hazie Nweta',
      'Active Order':                                'Iwu Na-arụ Ọrụ',
      'View all':                                    'Lee ha niile',
      'No active orders':                            'Enweghị iwu na-arụ ọrụ',
      "Schedule a pickup and we'll handle the rest": 'Hazie nweta, anyị ga-elekọta ihe fọdụrụ',
      'Order ID':                                    'Nọmba Iwu',
      'Pickup':                                      'Nweta',
      'Service':                                     'Ọrụ',
      'Picked up':                                   'Atọla',
      'Cleaning':                                    'Ịsa Ọcha',
      'Ready':                                       'Dị Njikere',
      'Delivered':                                   'Ebugharịla',
      'Our Services':                                'Ọrụ Anyị',
      'Wash, Iron & Fold':                           'Saa, Ayị &amp; Kọkọba',
      'Dry Cleaning':                                'Ịsa Ọcha Ọkọrọ',
      'Iron & Press':                                'Ayị &amp; Pịa',
      'Duvet & Bedding':                             'Duvet &amp; Akwa Ụlọ Ụra',
      'Alterations':                                 'Mgbanwe',
      'Shoe Cleaning':                               'Ịsa Ọkpụkpụ',
      'New customer offer':                          'Nkwado ndị ahịa ọhụrụ',
      'First order 20% off':                         'Iwu mbụ 20% mbelata',
      'How It Works':                                'Otu O Si Arụ Ọrụ',
      'Schedule':                                    'Hazie',
      'Pick a time that works for you':              'Họrọ oge dị mma maka gị',
      'We collect':                                  'Anyị Anakọta',
      'Door-to-door pickup at your chosen time':     'Nweta n\'ụzọ n\'ụzọ n\'oge ị họọrọ',
      'We clean':                                    'Anyị Asacha',
      'Expert care for every garment':               'Nlekọta nke ọma maka uwe ọ bụla',
      'Back at your door, fresh and folded':         'Laghachi n\'ụzọ gị, ọhụrụ ma tụkpụọ',
      'Chat with Us':                                'Kpọọ Anyị Okwu',
      "Questions? We're here to help":               'Ajụjụ ọ dị? Anyị nọ ebe a inyere aka',
      /* ── Orders tab ── */
      'Orders':                                      'Iwu',
      'Track your laundry from pickup to delivery.': 'Leso akwa gị site na nweta ruo n\'nneweta.',
      'New Order':                                   'Iwu Ọhụrụ',
      'No orders yet':                               'Enweghị iwu ọ bụla',
      'Schedule a pickup and your orders will show up here.': 'Hazie nweta, iwu gị ga-apụtakwa ebe a.',
      /* ── Track tab ── */
      'Tracking':                                    'Ịleso',
      'See when your laundry will be ready.':        'Hụ mgbe akwa gị ga-adị njikere.',
      'Support':                                     'Enyemaka',
      'No active order':                             'Enweghị iwu na-arụ ọrụ',
      'Once you schedule a pickup, tracking will appear here.': 'Mgbe ị haziere nweta, ịleso ga-apụtakwa ebe a.',
      'View Details':                                'Lee Nkọwa',
      'Est. ready':                                  'Oge a tụrụ anya',
      /* ── Profile tab ── */
      'Home':                                        'Ụlọ',
      'Track':                                       'Śle',
      'Profile':                                     'Profaịlụ',
      'Account':                                     'Akaụntụ',
      'Preferences':                                 'Nhọrọ',
      'Legal':                                       'Iwu',
      'Personal Information':                        'Ozi Nkeonwe',
      'Saved Addresses':                             'Adreesị Echekwara',
      'Payment Methods':                             'Ụzọ Ịkwụ Ụgwọ',
      'Change Password':                             'Gbanwee Paswọọdụ',
      'Notifications':                               'Ọkwa',
      'App Settings':                                'Ntọala App',
      'Help & Support':                              'Enyemaka',
      'My Support Tickets':                          'Tiketi Nkwado M',
      'Price Guide':                                 'Nduzi Ọnụ Ahịa',
      'Terms of Service':                            'Usoro Ọrụ',
      'Privacy Policy':                              'Iwu Nzuzo',
      'Sign Out':                                    'Pụọ',
      /* ── Sheet ── */
      'Billing':                                     'Ịkwụ Ụgwọ',
      'Pay As You Go':                               'Kwụọ Ụgwọ Ka Ị Gaa',
      'Monthly Plan':                                'Atụmatụ Ọnwa',
      'Bedding':                                     'Akwa Ụlọ Ụra',
      'Shoes':                                       'Ọkpụkpụ',
      'Confirm Pickup':                              'Nwekwaa Nweta',
    },
    ha: {
      /* ── Home tab ── */
      'Free pickup & delivery':                      'Tattarawa da isarwa kyauta',
      'Ready for fresh laundry today?':              'Shin kana shirye don sabbin tufafi yau?',
      'Schedule Pickup':                             'Tsara Karɓawa',
      'Active Order':                                'Umurnin da Ke Gudana',
      'View all':                                    'Duba duka',
      'No active orders':                            'Babu umurnin da ke gudana',
      "Schedule a pickup and we'll handle the rest": 'Tsara karɓawa, za mu sarrafa sauran',
      'Order ID':                                    'Lambar Umarni',
      'Pickup':                                      'Karɓawa',
      'Service':                                     'Aiki',
      'Picked up':                                   'An Karɓa',
      'Cleaning':                                    'Wanki',
      'Ready':                                       'Shirye',
      'Delivered':                                   'An Isar',
      'Our Services':                                'Ayyukanmu',
      'Wash, Iron & Fold':                           'Wanke, Ƙone &amp; Naɗa',
      'Dry Cleaning':                                'Bushewar Wanki',
      'Iron & Press':                                'Ƙone &amp; Latsa',
      'Duvet & Bedding':                             'Duvet &amp; Kayan Gado',
      'Alterations':                                 'Gyarawa',
      'Shoe Cleaning':                               'Tsaftace Takalmi',
      'New customer offer':                          'Tayin sabon abokin ciniki',
      'First order 20% off':                         'Umarni na farko ragi 20%',
      'How It Works':                                'Yadda Yake Aiki',
      'Schedule':                                    'Tsara',
      'Pick a time that works for you':              'Zaɓi lokaci da ya dace maka',
      'We collect':                                  'Mun Tattara',
      'Door-to-door pickup at your chosen time':     'Tattarawa daga ƙofa a lokacin da ka zaɓa',
      'We clean':                                    'Mun Wanke',
      'Expert care for every garment':               'Kulawa ta ƙwararru ga kowane riga',
      'Back at your door, fresh and folded':         'Baya ga ƙofarka, sabo kuma laƙe',
      'Chat with Us':                                'Yi Hira da Mu',
      "Questions? We're here to help":               'Tambayoyi? Muna nan don taimako',
      /* ── Orders tab ── */
      'Orders':                                      'Umarni',
      'Track your laundry from pickup to delivery.': 'Bi tufafinka daga karɓawa zuwa isar da su.',
      'New Order':                                   'Sabon Umarni',
      'No orders yet':                               'Babu umarni tukuna',
      'Schedule a pickup and your orders will show up here.': 'Tsara karɓawa, umurninku za su bayyana anan.',
      /* ── Track tab ── */
      'Tracking':                                    'Bin Didigi',
      'See when your laundry will be ready.':        'Duba lokacin da tufafinka za su shiryu.',
      'Support':                                     'Taimako',
      'No active order':                             'Babu umurnin da ke gudana',
      'Once you schedule a pickup, tracking will appear here.': 'Da zarar ka tsara karɓawa, bin didigi zai bayyana anan.',
      'View Details':                                'Duba Cikakkun Bayanai',
      'Est. ready':                                  'Ƙididdigan shirye',
      /* ── Profile tab ── */
      'Home':                                        'Gida',
      'Track':                                       'Bi',
      'Profile':                                     'Bayanai',
      'Account':                                     'Asusun',
      'Preferences':                                 'Zaɓuɓɓuka',
      'Legal':                                       'Doka',
      'Personal Information':                        'Bayanan Sirri',
      'Saved Addresses':                             'Adireshi da aka Adana',
      'Payment Methods':                             'Hanyoyin Biyan Kuɗi',
      'Change Password':                             'Canza Kalmar Sirri',
      'Notifications':                               'Sanarwa',
      'App Settings':                                'Saitunan App',
      'Help & Support':                              'Taimako',
      'My Support Tickets':                          'Tikitocin Taimako Na',
      'Price Guide':                                 'Jagoran Farashi',
      'Terms of Service':                            'Sharuɗɗan Sabis',
      'Privacy Policy':                              'Manufar Keɓantawa',
      'Sign Out':                                    'Fita',
      /* ── Sheet ── */
      'Billing':                                     'Biyan Kuɗi',
      'Pay As You Go':                               'Biya Yayin da Kake Tafiya',
      'Monthly Plan':                                'Shirin Wata',
      'Bedding':                                     'Kayan Gado',
      'Shoes':                                       'Takalmi',
      'Confirm Pickup':                              'Tabbatar Karɓawa',
    },
  };

  function t(key, lang) {
    const l = lang || document.documentElement.lang || 'en';
    return (TRANSLATIONS[l] && TRANSLATIONS[l][key]) || key;
  }

  function applyLanguage(lang) {
    document.documentElement.lang = lang;
    // Capture original innerHTML on first call so English can always be restored
    if (!applyLanguage._captured) {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.dataset.originalHtml = el.innerHTML;
      });
      applyLanguage._captured = true;
    }
    const map = lang === 'en' ? null : (TRANSLATIONS[lang] || {});
    document.querySelectorAll('[data-i18n]').forEach(el => {
      if (lang === 'en') {
        el.innerHTML = el.dataset.originalHtml;
      } else {
        const key = el.dataset.i18n;
        const translated = map[key];
        if (translated) el.textContent = translated;
      }
    });
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

  /* ── Cancel order (customer) ────────────────────────────────────── */
  async function handleCancelOrder(orderId) {
    if (!await showConfirm('Cancel this order? This cannot be undone.')) return;
    try {
      await SpaccleDB.setOrderStatus(orderId, 'cancelled');
      closeAllSheets();
      showToast('Order cancelled');
      await refresh();
    } catch {
      showToast('Could not cancel order');
    }
  }

  /* ── Cancel subscription ─────────────────────────────────────────── */
  async function handleCancelSubscription() {
    if (!user) { closeAllSheets(); return; }
    if (!subscription || subscription.status !== 'active') { closeAllSheets(); return; }
    if (!await showConfirm('Cancel your subscription? You will lose access at the end of this billing period.')) return;
    try {
      await SpaccleDB.cancelSubscription(user.userId);
      subscription = null;
      closeAllSheets();
      showToast('Subscription cancelled');
      billingMode = 'payg';
      updateBillingUI();
    } catch {
      showToast('Could not cancel subscription');
    }
  }

  /* ── Subscription renewal check ─────────────────────────────────── */
  async function checkSubscriptionRenewal() {
    if (!user) return;
    try {
      const expired = await SpaccleDB.checkSubscriptionRenewal(user.userId);
      if (!expired) return;
      const renew = await showConfirm('Your subscription has expired. Renew now to keep your monthly benefits?');
      if (renew) await openSubscriptionSheet();
    } catch { }
  }

  /* ── Re-order ────────────────────────────────────────────────────── */
  function handleReorder(order) {
    appliedPromo = null;
    const pi2 = document.getElementById('promo-code');
    const ps2 = document.getElementById('promo-status');
    if (pi2) pi2.value = '';
    if (ps2) ps2.textContent = '';
    closeAllSheets();
    billingMode = order.billingMode || 'payg';
    pendingItemsBreakdown = order.itemsBreakdown || null;
    buildDatePicker();
    updateBillingUI();
    openSheet('sheet-schedule');
    goToWizardStep(1);
    loadSavedAddresses();
    setTimeout(() => {
      const addrEl = document.getElementById('pickup-address');
      if (addrEl && order.address) addrEl.value = order.address;
      if (order.pickupTime) {
        selectedPickupTime = order.pickupTime;
        buildTimeChips();
      }
    }, 100);
  }

  /* ── Subscription usage bar ─────────────────────────────────────── */
  async function renderSubscriptionUsageBar() {
    const bar = document.getElementById('sub-usage-bar-wrap');
    if (!bar || !user) return;
    try {
      const sub = await SpaccleDB.getSubscription(user.userId);
      if (!sub || sub.status !== 'active') { bar.style.display = 'none'; return; }
      const included = Number(sub.includedItems) || 0;
      if (!included) { bar.style.display = 'none'; return; }
      const used = included - (Number(sub.itemsRemaining) || 0);
      const pct = Math.min(100, Math.round((used / included) * 100));
      const colour = pct >= 90 ? '#E53935' : pct >= 70 ? '#FB8C00' : '#5B4FBE';
      bar.style.display = '';
      bar.innerHTML = `
        <div class="sub-usage-label">
          <span>Plan items used</span>
          <span style="font-weight:700;color:${colour}">${used} / ${included}</span>
        </div>
        <div class="sub-usage-track">
          <div class="sub-usage-fill" style="transform:scaleX(${pct / 100});background:${colour}"></div>
        </div>`;
    } catch { }
  }

  /* ── Promo / discount codes ─────────────────────────────────────── */
  let appliedPromo = null;

  async function handleApplyPromo() {
    const input = document.getElementById('promo-input');
    const code = input?.value.trim().toUpperCase();
    const statusEl = document.getElementById('promo-status');
    if (!code) return;
    try {
      const promo = await SpaccleDB.validatePromoCode(code);
      if (!promo) {
        if (statusEl) { statusEl.textContent = 'Invalid or expired code'; statusEl.style.color = '#E53935'; }
        appliedPromo = null;
        return;
      }
      appliedPromo = promo;
      const discountText = promo.discountType === 'percent'
        ? `${promo.value}% off`
        : `₦${Number(promo.value).toLocaleString('en-NG')} off`;
      if (statusEl) { statusEl.textContent = `✓ ${discountText} applied`; statusEl.style.color = '#2E7D32'; }
      renderOrderSummary();
      showToast(`Promo applied — ${discountText}`);
    } catch {
      if (statusEl) { statusEl.textContent = 'Could not validate code'; statusEl.style.color = '#E53935'; }
    }
  }

  function applyPromoDiscount(amount) {
    if (!appliedPromo) return amount;
    if (appliedPromo.discountType === 'percent') return Math.round(amount * (1 - appliedPromo.value / 100));
    return Math.max(0, amount - appliedPromo.value);
  }

  /* ── Change password ─────────────────────────────────────────────── */
  async function handleChangePassword() {
    if (!user) return;
    const current = document.getElementById('change-pw-current').value;
    const newPw    = document.getElementById('change-pw-new').value;
    const confirm2 = document.getElementById('change-pw-confirm').value;
    if (!current) { showToast('Enter your current password'); return; }
    if (newPw.length < 8) { showToast('New password must be at least 8 characters'); return; }
    if (newPw !== confirm2) { showToast('Passwords do not match'); return; }
    const btn = document.getElementById('btn-change-password-save');
    btn.classList.add('loading');
    try {
      await SpaccleDB.changePassword(user.userId, current, newPw);
      document.getElementById('change-pw-current').value = '';
      document.getElementById('change-pw-new').value = '';
      document.getElementById('change-pw-confirm').value = '';
      closeAllSheets();
      showToast('Password changed successfully');
    } catch (err) {
      showToast(err?.message === 'WRONG_PASSWORD' ? 'Current password is incorrect' : 'Could not change password');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Broadcast notifications ─────────────────────────────────────── */
  async function checkBroadcasts() {
    try {
      const SEEN_KEY = 'spaccle_broadcast_seen';
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      const all = await SpaccleDB.listNewBroadcasts(null);
      const unseen = all.filter(b => !seen.includes(b._id));
      if (!unseen.length) return;
      const latest = unseen[unseen.length - 1];
      storeNotification(latest.title || 'Spaccle Update', latest.message || '');
      SpaccleDB.markBroadcastSeen(latest._id).catch(() => {});
    } catch { }
  }

  /* ── Check for new admin chat replies ───────────────────────────── */
  const CHAT_SEEN_KEY = 'spaccle_chat_last_seen';

  async function checkNewAdminMessages() {
    if (!user) return;
    try {
      const msgs = await SpaccleDB.getChatHistory(user.userId);
      const lastSeen = localStorage.getItem(CHAT_SEEN_KEY + '_' + user.userId) || '';
      const newAdminMsgs = msgs.filter(m => m.fromAdmin && !m.read && m.createdAt > lastSeen);
      if (newAdminMsgs.length) {
        storeNotification('Spaccle Support', newAdminMsgs[newAdminMsgs.length - 1].text);
        const latest = newAdminMsgs.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
        localStorage.setItem(CHAT_SEEN_KEY + '_' + user.userId, latest.createdAt);
      }
    } catch { }
  }

  /* ── Offline indicator ───────────────────────────────────────────── */
  function setupOfflineIndicator() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const update = () => { banner.style.display = navigator.onLine ? 'none' : ''; };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  /* ── My support tickets ──────────────────────────────────────────── */
  let currentTicket = null;

  async function openMyTickets() {
    if (!user) return;
    openSheet('sheet-my-tickets');
    const list = document.getElementById('my-tickets-list');
    list.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:24px 0">Loading…</div>';
    try {
      const tickets = await SpaccleDB.listTicketsByUser(user.userId);
      list.innerHTML = '';
      if (!tickets.length) {
        list.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:24px 0">No tickets yet. Use Help & Support to submit one.</div>';
        return;
      }
      tickets.forEach(t => {
        const item = document.createElement('div');
        item.className = 'admin-card';
        item.style.cssText = 'margin-bottom:10px;cursor:pointer';
        const isResolved = t.status === 'resolved';
        const hasReply   = t.hasAdminReply;
        item.innerHTML = `
          <div class="admin-card__left">
            <div class="admin-card__title">${escapeHtml(t.subject || 'Support message')}</div>
            <div class="admin-card__meta">${formatTime(t.createdAt)}${hasReply ? ' · Admin replied' : ''}</div>
          </div>
          <div class="admin-card__right">
            <span class="admin-card__pill ${isResolved ? 'admin-card__pill--resolved' : 'admin-card__pill--open'}">
              ${isResolved ? 'Resolved' : 'Open'}
            </span>
          </div>`;
        item.addEventListener('click', () => openTicketThread(t));
        list.appendChild(item);
      });
    } catch {
      list.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Could not load.</div>';
    }
  }

  async function openTicketThread(ticket) {
    currentTicket = ticket;
    document.getElementById('sheet-ticket-thread-title').textContent = ticket.subject || 'Support Ticket';
    document.getElementById('ticket-thread-status').textContent =
      ticket.status === 'resolved' ? '✓ This ticket has been resolved.' : 'Status: Open';

    const replyBar = document.getElementById('ticket-reply-bar');
    if (replyBar) replyBar.style.display = ticket.status === 'resolved' ? 'none' : '';

    openSheet('sheet-ticket-thread');
    await loadUserTicketThread(ticket);
  }

  async function loadUserTicketThread(ticket) {
    const threadEl = document.getElementById('ticket-thread-messages');
    threadEl.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Loading…</div>';
    try {
      const replies = await SpaccleDB.getTicketReplies(ticket._id);
      threadEl.innerHTML = '';

      // Original message
      threadEl.appendChild(buildUserTicketBubble({
        text: ticket.message || '',
        fromAdmin: false,
        createdAt: ticket.createdAt,
        isFirst: true,
      }));

      // Replies
      replies.forEach(r => threadEl.appendChild(buildUserTicketBubble(r)));
      threadEl.scrollTop = threadEl.scrollHeight;
    } catch {
      threadEl.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Could not load thread.</div>';
    }
  }

  function buildUserTicketBubble({ text, fromAdmin, createdAt, isFirst }) {
    const wrap = document.createElement('div');
    wrap.className = 'ticket-bubble-wrap ' + (fromAdmin ? 'ticket-bubble-wrap--admin' : 'ticket-bubble-wrap--user');

    const bubble = document.createElement('div');
    bubble.className = 'ticket-bubble ' + (fromAdmin ? 'ticket-bubble--admin' : 'ticket-bubble--user');

    if (fromAdmin && isFirst !== true) {
      const tag = document.createElement('div');
      tag.className = 'ticket-bubble__tag';
      tag.textContent = 'Spaccle Support';
      bubble.appendChild(tag);
    }

    const body = document.createElement('div');
    body.textContent = text;
    bubble.appendChild(body);

    const time = document.createElement('div');
    time.className = 'ticket-bubble__time';
    time.textContent = formatTime(createdAt);
    bubble.appendChild(time);

    wrap.appendChild(bubble);
    return wrap;
  }

  async function handleUserTicketReply() {
    if (!currentTicket || !user) return;
    const input = document.getElementById('ticket-reply-input');
    const text  = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    const btn = document.getElementById('btn-ticket-reply-send');
    setButtonLoading(btn, true);
    try {
      await SpaccleDB.addTicketReply(currentTicket._id, { text, fromAdmin: false, userId: user.userId });
      await loadUserTicketThread(currentTicket);
      // Refresh the tickets list in background
      const fresh = await SpaccleDB.listTicketsByUser(user.userId);
      currentTicket = fresh.find(t => t._id === currentTicket._id) || currentTicket;
    } catch {
      showToast('Could not send reply');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /* ── Notification panel ──────────────────────────────────────────── */
  function openNotificationPanel() {
    const list = getStoredNotifications();
    const listEl = document.getElementById('notif-list');
    const emptyEl = document.getElementById('notif-empty');
    listEl.innerHTML = '';
    if (!list.length) {
      emptyEl.style.display = '';
    } else {
      emptyEl.style.display = 'none';
      list.forEach(n => {
        const item = document.createElement('div');
        item.className = 'notif-item' + (n.read ? '' : ' notif-item--unread');
        item.innerHTML = `
          <div class="notif-item__body">
            <div class="notif-item__title">${escapeHtml(n.title)}</div>
            <div class="notif-item__sub">${escapeHtml(n.body)}</div>
            <div class="notif-item__time">${formatTime(n.at)}</div>
          </div>
          <button class="notif-item__dismiss" data-id="${n.id}" aria-label="Dismiss">✕</button>
        `;
        item.querySelector('.notif-item__dismiss').addEventListener('click', e => {
          e.stopPropagation();
          dismissNotification(n.id);
          item.remove();
          if (!listEl.children.length) emptyEl.style.display = '';
          updateNotifBadge();
        });
        listEl.appendChild(item);
      });
    }
    // Mark all as read
    const stored = getStoredNotifications().map(n => ({ ...n, read: true }));
    localStorage.setItem(NOTIF_KEY, JSON.stringify(stored));
    updateNotifBadge();
    openSheet('sheet-notifications');
  }

  function closeNotificationPanel() { closeAllSheets(); }

  function dismissNotification(id) {
    const stored = getStoredNotifications().filter(n => n.id !== id);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(stored));
  }

  function clearAllNotifications() {
    localStorage.removeItem(NOTIF_KEY);
    updateNotifBadge();
    const listEl = document.getElementById('notif-list');
    const emptyEl = document.getElementById('notif-empty');
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
  }

  /* ── Rating sheet ────────────────────────────────────────────────── */
  let selectedRating = 0;

  function openRatingSheet(order) {
    selectedRating = 0;
    document.getElementById('rating-order-id').value = order._id;
    document.getElementById('rating-note').value = '';
    document.querySelectorAll('.rating-star').forEach(b => b.classList.remove('active'));
    openSheet('sheet-rating');
  }

  function closeRatingSheet() { closeAllSheets(); }

  function selectRatingStar(n) {
    selectedRating = n;
    document.querySelectorAll('.rating-star').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.star) <= n));
  }

  async function handleRatingSubmit() {
    if (!selectedRating) { showToast('Please select a star rating'); return; }
    const orderId = document.getElementById('rating-order-id').value;
    const note = document.getElementById('rating-note').value.trim();
    const btn = document.getElementById('btn-rating-submit');
    btn.classList.add('loading');
    try {
      await SpaccleDB.rateOrder(orderId, selectedRating, note);
      closeAllSheets();
      showToast('Thank you for your rating!');
    } catch {
      showToast('Could not save rating');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ── Chat sheet ──────────────────────────────────────────────────── */
  let _chatRefreshTimer = null;

  async function openChatSheet() {
    openSheet('sheet-chat');
    await loadChatMessages();
    // Auto-refresh every 8s while chat is open so admin replies appear
    stopChatRefresh();
    _chatRefreshTimer = setInterval(async () => {
      const sheet = document.getElementById('sheet-chat');
      if (!sheet || !sheet.classList.contains('active')) { stopChatRefresh(); return; }
      await loadChatMessages();
    }, 8000);
  }

  function stopChatRefresh() {
    clearInterval(_chatRefreshTimer);
    _chatRefreshTimer = null;
  }

  async function loadChatMessages() {
    if (!user) return;
    const container = document.getElementById('chat-messages');
    try {
      await SpaccleDB.markChatRead(user.userId);
      const msgs = await SpaccleDB.getChatHistory(user.userId);
      container.innerHTML = '';
      if (!msgs.length) {
        container.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:24px 0">👋 Hi! How can we help you?</div>';
        return;
      }
      msgs.forEach(m => container.appendChild(buildChatBubble(m)));
      container.scrollTop = container.scrollHeight;
    } catch {
      container.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:16px">Could not load messages.</div>';
    }
  }

  function buildChatBubble(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-bubble-wrap ' + (msg.fromAdmin ? 'chat-bubble-wrap--admin' : 'chat-bubble-wrap--user');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (msg.fromAdmin ? 'chat-bubble--admin' : 'chat-bubble--user');
    bubble.textContent = msg.text;
    const time = document.createElement('div');
    time.className = 'chat-bubble-time';
    time.textContent = formatTime(msg.createdAt);
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    return wrap;
  }

  async function handleChatSend() {
    if (!user) return;
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    const btn = document.getElementById('btn-chat-send');
    btn.disabled = true;
    input.value = '';
    try {
      const msg = await SpaccleDB.createChatMessage({ userId: user.userId, text, fromAdmin: false });
      const container = document.getElementById('chat-messages');
      container.appendChild(buildChatBubble(msg));
      container.scrollTop = container.scrollHeight;
    } catch {
      showToast('Could not send message');
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Legal reader ────────────────────────────────────────────────── */
  async function openLegalSheet(type) {
    const titleEl = document.getElementById('sheet-legal-title');
    const contentEl = document.getElementById('legal-content');
    titleEl.textContent = type === 'terms' ? 'Terms of Service' : 'Privacy Policy';
    contentEl.innerHTML = '<p style="color:#aaa;font-size:13px">Loading…</p>';
    openSheet('sheet-legal');
    try {
      const html = await SpaccleDB.getLegalContent(type);
      contentEl.innerHTML = html || '<p>Content not yet available.</p>';
    } catch {
      contentEl.innerHTML = '<p>Could not load content.</p>';
    }
  }

  /* ── Pricing guide ───────────────────────────────────────────────── */
  async function openPricingGuide() {
    openSheet('sheet-pricing-guide');
    const svcEl   = document.getElementById('pricing-guide-services');
    const itemsEl = document.getElementById('pricing-guide-items');
    svcEl.innerHTML = '<div style="font-size:13px;color:#aaa;padding:8px">Loading…</div>';
    itemsEl.innerHTML = '';
    try {
      const [svcCfg, itemPricing] = await Promise.all([
        SpaccleDB.ensureDefaultServices(),
        SpaccleDB.ensureDefaultItemPricing(),
      ]);
      svcEl.innerHTML = '';
      Object.values(svcCfg).forEach(svc => {
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.style.cursor = 'default';
        card.innerHTML = `<div class="admin-card__left"><div class="admin-card__title">${escapeHtml(svc.name)}</div></div><div class="admin-card__right"><span class="admin-card__pill">${escapeHtml(svc.display)}</span></div>`;
        svcEl.appendChild(card);
      });
      itemsEl.innerHTML = '';
      itemPricing.forEach(item => {
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.style.cursor = 'default';
        card.innerHTML = `<div class="admin-card__left"><div class="admin-card__title">${escapeHtml(item.name)}</div></div><div class="admin-card__right"><span class="admin-card__pill">₦${Number(item.price).toLocaleString('en-NG')}</span></div>`;
        itemsEl.appendChild(card);
      });
    } catch {
      svcEl.innerHTML = '<div style="font-size:13px;color:#aaa;padding:8px">Could not load pricing.</div>';
    }
  }

  return { init, updateNotifBadge, applyLanguage };
})();
