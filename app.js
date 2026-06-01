/**
 * Invoice Chase - Lightweight PWA
 * Phase 1: Basic structure, camera, UI shell, persistence skeleton, demo canvas
 *
 * All code is vanilla JS, heavily commented, and designed to be easy to modify.
 * No build step required.
 */

(() => {
  'use strict';

  // ============================================
  // CONSTANTS & CONFIG
  // ============================================
  const STORAGE_KEY = 'invoice-chase-v1';
  const CDN = {
    TESSERACT: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    EMAILJS: 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
  };

  // Default reminder schedule (days relative to due date)
  // Only future dates at "start chasing" time are scheduled
  const REMINDER_OFFSETS = [
    { offset: -7, label: 'Friendly heads-up (7 days before)' },
    { offset: 0,  label: 'Due today' },
    { offset: 7,  label: 'First follow-up (7 days late)' },
    { offset: 21, label: 'Second notice (3 weeks late)' }
  ];

  // ============================================
  // STATE
  // ============================================
  let state = {
    invoices: [],
    settings: {
      businessName: '',
      emailjs: {
        publicKey: '',
        serviceId: '',
        templateId: ''
      }
    }
  };

  let currentImageFile = null;      // For OCR
  let currentRawText = '';          // Last OCR result
  let tesseractWorker = null;       // Reused worker
  let deferredInstallPrompt = null;

  // ============================================
  // PERSISTENCE (localStorage)
  // ============================================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Simple migration / defaults
        state.invoices = parsed.invoices || [];
        state.settings = { ...state.settings, ...(parsed.settings || {}) };
      }
    } catch (e) {
      console.warn('[InvoiceChase] Failed to load state', e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        invoices: state.invoices,
        settings: state.settings,
        version: 1
      }));
    } catch (e) {
      console.error('[InvoiceChase] Failed to save state', e);
      showToast('Failed to save data (storage full?)', 'error');
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================
  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    // Update bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Update URL for easier testing with playwright-toolkit (?tab=...)
    const url = new URL(window.location);
    if (viewId === 'invoices-view') {
      url.searchParams.set('tab', 'invoices');
    } else {
      url.searchParams.delete('tab');
    }
    history.replaceState(null, '', url);
  }

  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.style.transition = 'opacity 0.25s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, type === 'error' ? 5200 : 3400);

    // Click to dismiss early
    toast.addEventListener('click', () => toast.remove(), { once: true });
  }

  // ============================================
  // STATS (Home view)
  // ============================================
  function updateStats() {
    const active = state.invoices.filter(i => !i.paid).length;
    const overdue = state.invoices.filter(i => {
      if (i.paid) return false;
      const due = new Date(i.dueDate);
      return due < new Date();
    }).length;

    let totalSent = 0;
    state.invoices.forEach(inv => {
      totalSent += (inv.reminders || []).filter(r => r.sent).length;
    });

    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-overdue').textContent = overdue;
    document.getElementById('stat-sent').textContent = totalSent;
  }

  // ============================================
  // DEMO INVOICE CANVAS (for testing OCR without camera)
  // ============================================
  function generateDemoInvoiceCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1100;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header bar
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, canvas.width, 90);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px system-ui, Arial';
    ctx.fillText('ACME SUPPLIES LTD', 40, 55);
    ctx.font = '16px system-ui';
    ctx.fillText('123 Commerce St, Austin, TX 78701  •  (512) 555-0192', 40, 78);

    // Invoice details
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 26px system-ui';
    ctx.fillText('INVOICE', 40, 150);

    ctx.font = '18px system-ui';
    ctx.fillText('Invoice #: INV-2025-0842', 40, 185);
    ctx.fillText('Date: April 12, 2025', 40, 212);
    ctx.fillText('Due Date: May 12, 2025', 40, 239);

    // Bill To
    ctx.font = 'bold 16px system-ui';
    ctx.fillText('BILL TO:', 520, 150);
    ctx.font = '16px system-ui';
    ctx.fillText('Sunrise Coffee Co.', 520, 175);
    ctx.fillText('Attn: Accounts Payable', 520, 196);
    ctx.fillText('billing@sunrisecoffee.com', 520, 217);
    ctx.fillText('4827 Oak Ave, Dallas, TX 75201', 520, 238);

    // Line items header
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(40, 280, 820, 36);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 15px system-ui';
    ctx.fillText('Description', 52, 304);
    ctx.fillText('Qty', 520, 304);
    ctx.fillText('Unit Price', 620, 304);
    ctx.fillText('Amount', 760, 304);

    // Items
    ctx.fillStyle = '#0f172a';
    ctx.font = '15px system-ui';
    const items = [
      ['Specialty Coffee Beans - 5lb bags', '12', '$28.50', '$342.00'],
      ['Espresso Machine Service Kit', '4', '$89.00', '$356.00'],
      ['Paper Cups (Sleeve of 500)', '8', '$24.75', '$198.00'],
      ['Shipping & Handling', '1', '$87.50', '$87.50']
    ];
    let y = 340;
    items.forEach(row => {
      ctx.fillText(row[0], 52, y);
      ctx.fillText(row[1], 530, y);
      ctx.fillText(row[2], 630, y);
      ctx.fillText(row[3], 770, y);
      y += 32;
    });

    // Totals
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(520, y + 10);
    ctx.lineTo(860, y + 10);
    ctx.stroke();

    ctx.font = '16px system-ui';
    ctx.fillText('Subtotal', 620, y + 40);
    ctx.fillText('$983.50', 770, y + 40);

    ctx.font = 'bold 18px system-ui';
    ctx.fillText('TOTAL DUE', 580, y + 75);
    ctx.fillStyle = '#1e40af';
    ctx.fillText('$1,247.50', 750, y + 75);

    // Footer note
    ctx.fillStyle = '#64748b';
    ctx.font = '14px system-ui';
    ctx.fillText('Thank you for your business! Payment is due within 30 days.', 40, y + 140);
    ctx.fillText('Questions? email: ar@acmesupplies.com', 40, y + 162);

    return canvas;
  }

  // ============================================
  // CAMERA / GALLERY HANDLING (Phase 1)
  // ============================================
  function setupCameraInputs() {
    const cameraInput = document.getElementById('camera-input');
    const galleryInput = document.getElementById('gallery-input');
    const cameraBtn = document.getElementById('camera-btn');
    const galleryBtn = document.getElementById('gallery-btn');

    cameraBtn.addEventListener('click', () => cameraInput.click());
    galleryBtn.addEventListener('click', () => galleryInput.click());

    cameraInput.addEventListener('change', (e) => handleImageSelected(e.target.files[0]));
    galleryInput.addEventListener('change', (e) => handleImageSelected(e.target.files[0]));

    // Retake
    document.getElementById('retake-btn').addEventListener('click', () => {
      document.getElementById('preview-area').classList.add('hidden');
      document.getElementById('capture-area').classList.remove('hidden');
      currentImageFile = null;
    });
  }

  function handleImageSelected(file) {
    if (!file) return;

    currentImageFile = file;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.getElementById('preview-img');
      img.src = ev.target.result;

      document.getElementById('capture-area').classList.add('hidden');
      document.getElementById('preview-area').classList.remove('hidden');
      document.getElementById('ocr-progress').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }

  // ============================================
  // OCR - Real Tesseract.js v5 (Phase 2+)
  // ============================================
  let tesseractScriptLoaded = false;

  async function ensureTesseractLoaded() {
    if (window.Tesseract) return true;
    if (tesseractScriptLoaded) return false;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CDN.TESSERACT;
      script.async = true;
      script.onload = () => {
        tesseractScriptLoaded = true;
        resolve(true);
      };
      script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  async function initTesseractWorker() {
    if (tesseractWorker) return tesseractWorker;

    await ensureTesseractLoaded();

    const statusEl = document.getElementById('ocr-status');
    statusEl.textContent = 'Loading OCR engine (first time ~15MB download)...';

    tesseractWorker = await window.Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        const statusEl = document.getElementById('ocr-status');
        const fillEl = document.getElementById('ocr-progress-fill');
        const detailEl = document.getElementById('ocr-detail');

        if (m.status === 'loading tesseract core' || m.status === 'initializing api') {
          statusEl.textContent = 'Loading OCR engine...';
          fillEl.style.width = Math.min(35, (m.progress || 0) * 35) + '%';
        } else if (m.status === 'loading language traineddata') {
          statusEl.textContent = 'Downloading language data (one time only)...';
          fillEl.style.width = 35 + (m.progress || 0) * 30 + '%';
        } else if (m.status === 'recognizing text') {
          statusEl.textContent = 'Reading invoice text...';
          const pct = 65 + (m.progress || 0) * 35;
          fillEl.style.width = pct + '%';
          detailEl.textContent = `${Math.round((m.progress || 0) * 100)}% complete`;
        }
      }
    });

    return tesseractWorker;
  }

  async function runOCR(imageSource) {
    const progressEl = document.getElementById('ocr-progress');
    const statusEl = document.getElementById('ocr-status');
    const fillEl = document.getElementById('ocr-progress-fill');
    const detailEl = document.getElementById('ocr-detail');

    document.getElementById('preview-area').classList.add('hidden');
    progressEl.classList.remove('hidden');
    fillEl.style.width = '5%';
    statusEl.textContent = 'Preparing OCR...';
    detailEl.textContent = 'This may take longer the very first time.';

    try {
      const worker = await initTesseractWorker();

      // Convert file/blob/canvas to something Tesseract likes (it accepts many things)
      let imageForOCR = imageSource;
      if (imageSource instanceof File || imageSource instanceof Blob) {
        imageForOCR = URL.createObjectURL(imageSource);
      }

      const { data: { text } } = await worker.recognize(imageForOCR);

      currentRawText = text || '';

      // Clean up object URL if we created one
      if (typeof imageForOCR === 'string' && imageForOCR.startsWith('blob:')) {
        URL.revokeObjectURL(imageForOCR);
      }

      fillEl.style.width = '100%';
      statusEl.textContent = 'Done!';
      await sleep(250);

      // Hide scan modal and open review with best-guess extraction
      hideModal('scan-modal');
      const extracted = extractInvoiceData(currentRawText);
      openReviewForm(extracted);

    } catch (err) {
      console.error('[InvoiceChase] OCR failed', err);
      showToast('OCR failed. You can still enter details manually.', 'error');

      // Graceful fallback: open form empty so user can type everything
      hideModal('scan-modal');
      openReviewForm({});
    } finally {
      progressEl.classList.add('hidden');
      fillEl.style.width = '0%';
      document.getElementById('ocr-detail').textContent = 'This may take 10–30 seconds the first time.';
    }
  }

  /**
   * Heuristic extraction from noisy OCR text.
   * Returns best-guess values for the review form.
   */
  function extractInvoiceData(rawText) {
    const text = rawText || '';
    const upper = text.toUpperCase();

    const result = {
      businessName: state.settings.businessName || '',
      customerName: '',
      customerEmail: '',
      invoiceNumber: '',
      amount: '',
      dueDate: ''
    };

    // 1. Email (very reliable)
    const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w{2,}/i);
    if (emailMatch) result.customerEmail = emailMatch[0].toLowerCase();

    // 2. Invoice number (common patterns)
    const invMatch = text.match(/(?:INV(?:OICE)?|BILL|NO\.?|#)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{3,14})/i);
    if (invMatch) result.invoiceNumber = invMatch[1].trim();

    // 3. Amount - look for TOTAL / DUE / AMOUNT / GRAND TOTAL near a money value
    const moneyCandidates = [];
    const moneyRegex = /(?:TOTAL|DUE|AMOUNT|BALANCE|GRAND TOTAL)[\s:]*[$€£]?\s*([0-9]{1,3}(?:[,\s]?[0-9]{3})*(?:\.[0-9]{2})?)/gi;
    let m;
    while ((m = moneyRegex.exec(upper)) !== null) {
      const val = parseFloat(m[1].replace(/[,\s]/g, ''));
      if (!isNaN(val) && val > 0) moneyCandidates.push(val);
    }
    // Also catch any large-looking dollar amounts as fallback
    const anyMoney = text.match(/[$€£]\s*([0-9]{1,3}(?:[,\s]?[0-9]{3})*(?:\.[0-9]{2})?)/g);
    if (anyMoney) {
      anyMoney.forEach(str => {
        const v = parseFloat(str.replace(/[^0-9.]/g, ''));
        if (!isNaN(v) && v > 10) moneyCandidates.push(v);
      });
    }
    if (moneyCandidates.length) {
      result.amount = Math.max(...moneyCandidates).toFixed(2);
    }

    // 4. Due date - prefer dates near the word DUE
    const dueDateRegex = /(?:DUE DATE|DUE|PAY BY|PAYMENT DUE)[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
    let dateMatch = text.match(dueDateRegex);
    if (!dateMatch) {
      // Fallback: any reasonable date in the text
      dateMatch = text.match(/([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/);
    }
    if (dateMatch) {
      try {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          const iso = d.toISOString().split('T')[0];
          result.dueDate = iso;
        }
      } catch (_) {}
    }

    // 5. Customer name - look for common "Bill To" / "Customer" blocks
    const billTo = text.match(/(?:BILL TO|CUSTOMER|CLIENT|TO:)\s*[:\-]?\s*([A-Z][A-Za-z0-9 .,&'-]{3,40})/i);
    if (billTo) {
      result.customerName = billTo[1].trim().split('\n')[0].trim();
    } else {
      // Very rough fallback: first capitalized phrase that looks like a company
      const companyish = text.match(/([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){1,3})/);
      if (companyish) result.customerName = companyish[1];
    }

    return result;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Open review form (prefill optional)
  function openReviewForm(prefill = {}) {
    const form = document.getElementById('review-form');

    // Prefill
    document.getElementById('business-name').value = prefill.businessName || state.settings.businessName || '';
    document.getElementById('customer-name').value = prefill.customerName || '';
    document.getElementById('customer-email').value = prefill.customerEmail || '';
    document.getElementById('invoice-number').value = prefill.invoiceNumber || '';
    document.getElementById('amount').value = prefill.amount || '';
    document.getElementById('due-date').value = prefill.dueDate || '';

    document.getElementById('raw-text').textContent = currentRawText || '(no raw text)';

    showModal('review-modal');

    // One-time submit handler
    form.onsubmit = (e) => {
      e.preventDefault();
      startChasingFromForm();
    };
  }

  function startChasingFromForm() {
    const invoice = {
      id: 'inv_' + Date.now(),
      businessName: document.getElementById('business-name').value.trim(),
      customerName: document.getElementById('customer-name').value.trim(),
      customerEmail: document.getElementById('customer-email').value.trim(),
      invoiceNumber: document.getElementById('invoice-number').value.trim(),
      amount: parseFloat(document.getElementById('amount').value) || 0,
      dueDate: document.getElementById('due-date').value,
      paid: false,
      rawText: currentRawText,
      reminders: [],
      createdAt: new Date().toISOString()
    };

    // Compute reminders (Phase 1 basic version)
    invoice.reminders = computeReminders(invoice.dueDate);

    state.invoices.unshift(invoice);
    saveState();

    hideModal('review-modal');
    document.getElementById('review-form').onsubmit = null;

    // Reset capture state
    currentImageFile = null;
    currentRawText = '';

    showToast('Invoice added! Reminders scheduled.');
    updateStats();
    renderInvoicesList();
    showView('invoices-view');

    // Future: auto-run due check here (Phase 3)
  }

  function computeReminders(dueDateStr) {
    const reminders = [];
    const due = new Date(dueDateStr + 'T00:00:00'); // local midnight
    const now = new Date();

    REMINDER_OFFSETS.forEach((r, idx) => {
      const sendAt = new Date(due);
      sendAt.setDate(sendAt.getDate() + r.offset);

      if (sendAt >= now) { // only future or today
        reminders.push({
          id: 'r_' + idx + '_' + Date.now(),
          label: r.label,
          sendAt: sendAt.toISOString(),
          sent: false,
          sentAt: null
        });
      }
    });

    return reminders;
  }

  // ============================================
  // INVOICES LIST RENDER (Phase 1 basic)
  // ============================================
  function renderInvoicesList(filter = '') {
    const container = document.getElementById('invoices-list');
    const empty = document.getElementById('invoices-empty');
    container.innerHTML = '';

    let filtered = state.invoices;

    if (filter) {
      const q = filter.toLowerCase();
      filtered = filtered.filter(inv =>
        (inv.customerName || '').toLowerCase().includes(q) ||
        (inv.invoiceNumber || '').toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    filtered.forEach(inv => {
      const card = document.createElement('div');
      card.className = 'invoice-card';

      const due = new Date(inv.dueDate);
      const today = new Date();
      const daysDiff = Math.ceil((due - today) / (1000 * 3600 * 24));

      let statusHTML = '';
      if (inv.paid) {
        statusHTML = `<span class="status-badge status-ok">PAID</span>`;
      } else if (daysDiff < 0) {
        statusHTML = `<span class="status-badge status-overdue">OVERDUE ${Math.abs(daysDiff)}d</span>`;
      } else if (daysDiff <= 7) {
        statusHTML = `<span class="status-badge status-due-soon">Due in ${daysDiff}d</span>`;
      } else {
        statusHTML = `<span class="status-badge status-ok">Due ${due.toLocaleDateString()}</span>`;
      }

      const sentCount = (inv.reminders || []).filter(r => r.sent).length;
      const totalRem = (inv.reminders || []).length;

      card.innerHTML = `
        <div class="invoice-card-header">
          <div>
            <div class="customer-name">${escapeHtml(inv.customerName || 'Unknown')}</div>
            <div style="font-size:13px; color:#64748b;">${escapeHtml(inv.invoiceNumber || '')}</div>
          </div>
          <div style="text-align:right;">
            <div class="amount">$${Number(inv.amount || 0).toFixed(2)}</div>
            ${statusHTML}
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; color:#64748b;">
          <div>${inv.customerEmail || ''}</div>
          <div>${sentCount}/${totalRem} reminders sent</div>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary" style="padding:6px 14px; font-size:13px;" data-action="details" data-id="${inv.id}">Details</button>
          <button class="btn btn-secondary" style="padding:6px 14px; font-size:13px;" data-action="send-now" data-id="${inv.id}">Send Now</button>
          <button class="btn" style="padding:6px 14px; font-size:13px; background:#ecfdf5; color:#047857; border:none;" data-action="mark-paid" data-id="${inv.id}">Mark Paid</button>
        </div>
      `;

      container.appendChild(card);
    });

    // Wire action buttons (event delegation would be cleaner in full version)
    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', handleInvoiceAction);
    });
  }

  function handleInvoiceAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const inv = state.invoices.find(i => i.id === id);
    if (!inv) return;

    if (action === 'mark-paid') {
      inv.paid = true;
      saveState();
      renderInvoicesList(document.getElementById('search-input').value);
      updateStats();
      showToast('Marked as paid. Future reminders stopped.');
    } else if (action === 'send-now') {
      // Phase 1: just simulate
      const next = (inv.reminders || []).find(r => !r.sent);
      if (next) {
        next.sent = true;
        next.sentAt = new Date().toISOString();
        saveState();
        renderInvoicesList(document.getElementById('search-input').value);
        showToast(`Demo: Would have sent "${next.label}" to ${inv.customerEmail}`);
      } else {
        showToast('All reminders already sent for this invoice.');
      }
    } else if (action === 'details') {
      showInvoiceDetails(inv);
    }
  }

  function showInvoiceDetails(inv) {
    // Very basic detail view for Phase 1
    const html = `
      <div style="position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:250;display:flex;align-items:flex-end;" onclick="this.remove()">
        <div onclick="event.stopImmediatePropagation()" style="background:white;width:100%;max-width:680px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px 18px 32px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <strong style="font-size:18px;">${escapeHtml(inv.customerName)}</strong>
            <button onclick="this.closest('[style*=\'position:fixed\']').remove()" style="border:none;background:none;font-size:22px;">✕</button>
          </div>
          <div style="font-size:13px;line-height:1.6;color:#334155;">
            <strong>Invoice:</strong> ${escapeHtml(inv.invoiceNumber)}<br>
            <strong>Amount:</strong> $${Number(inv.amount).toFixed(2)}<br>
            <strong>Due:</strong> ${inv.dueDate}<br>
            <strong>Email:</strong> ${escapeHtml(inv.customerEmail)}<br><br>
            <strong>Reminders scheduled:</strong><br>
            ${(inv.reminders || []).map(r => `• ${r.label} — ${r.sent ? 'SENT' : new Date(r.sendAt).toLocaleDateString()}`).join('<br>')}
          </div>
          <div style="margin-top:20px;">
            <button onclick="this.closest('[style*=\'position:fixed\']').remove()" class="btn btn-secondary" style="width:100%;">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  // ============================================
  // SETTINGS + PWA STUB
  // ============================================
  function setupSettings() {
    const modal = document.getElementById('settings-modal');

    document.getElementById('settings-btn').addEventListener('click', () => {
      // Prefill current values
      document.getElementById('settings-business').value = state.settings.businessName || '';
      document.getElementById('settings-emailjs-key').value = state.settings.emailjs?.publicKey || '';
      document.getElementById('settings-emailjs-service').value = state.settings.emailjs?.serviceId || '';
      document.getElementById('settings-emailjs-template').value = state.settings.emailjs?.templateId || '';
      showModal('settings-modal');
    });

    document.getElementById('settings-close').addEventListener('click', () => hideModal('settings-modal'));

    document.getElementById('save-settings').addEventListener('click', () => {
      state.settings.businessName = document.getElementById('settings-business').value.trim();
      state.settings.emailjs = {
        publicKey: document.getElementById('settings-emailjs-key').value.trim(),
        serviceId: document.getElementById('settings-emailjs-service').value.trim(),
        templateId: document.getElementById('settings-emailjs-template').value.trim()
      };
      saveState();
      hideModal('settings-modal');
      showToast('Settings saved');
    });

    document.getElementById('test-emailjs').addEventListener('click', () => {
      const hasKeys = state.settings.emailjs?.publicKey && state.settings.emailjs?.serviceId;
      if (!hasKeys) {
        showToast('Add your EmailJS keys first, then test.', 'error');
        return;
      }
      // In real Phase 3 this would actually call emailjs.send
      showToast('Test email would be sent (demo mode active).');
    });

    // Export / Import / Clear
    document.getElementById('export-btn').addEventListener('click', () => {
      const data = JSON.stringify(state, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-chase-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const importFile = document.getElementById('import-file');
    document.getElementById('import-btn').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (imported.invoices) state.invoices = imported.invoices;
          if (imported.settings) state.settings = { ...state.settings, ...imported.settings };
          saveState();
          updateStats();
          renderInvoicesList();
          showToast('Data imported successfully');
        } catch (err) {
          showToast('Invalid backup file', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('clear-data').addEventListener('click', () => {
      if (!confirm('Delete ALL local data? This cannot be undone.')) return;
      localStorage.removeItem(STORAGE_KEY);
      state.invoices = [];
      state.settings = { businessName: '', emailjs: { publicKey: '', serviceId: '', templateId: '' } };
      updateStats();
      renderInvoicesList();
      showToast('All data cleared');
    });

    // PWA install (stub)
    const installContainer = document.getElementById('install-pwa');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installContainer.classList.remove('hidden');
    });

    document.getElementById('install-btn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') showToast('Thanks for installing!');
      deferredInstallPrompt = null;
      installContainer.classList.add('hidden');
    });
  }

  // ============================================
  // NAV + SEARCH + DEMO BUTTON
  // ============================================
  function setupNavigation() {
    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        showView(item.dataset.view);
      });
    });

    // Main scan button
    document.getElementById('scan-btn').addEventListener('click', () => {
      // Reset previous capture UI
      document.getElementById('capture-area').classList.remove('hidden');
      document.getElementById('preview-area').classList.add('hidden');
      document.getElementById('ocr-progress').classList.add('hidden');
      showModal('scan-modal');
    });

    // Demo button (Phase 1 key feature)
    document.getElementById('demo-btn').addEventListener('click', () => {
      const canvas = generateDemoInvoiceCanvas();
      // Convert canvas to blob/file-like for consistency
      canvas.toBlob((blob) => {
        currentImageFile = new File([blob], 'demo-invoice.png', { type: 'image/png' });
        // Show preview in scan modal
        const img = document.getElementById('preview-img');
        img.src = canvas.toDataURL('image/png');

        document.getElementById('capture-area').classList.add('hidden');
        document.getElementById('preview-area').classList.remove('hidden');
        showModal('scan-modal');

        // Wire the OCR button for demo (still stub in Phase 1)
        const ocrBtn = document.getElementById('ocr-btn');
        ocrBtn.onclick = () => runOCR(currentImageFile);
      }, 'image/png');
    });

    // Close buttons
    document.getElementById('scan-close').addEventListener('click', () => hideModal('scan-modal'));
    document.getElementById('review-close').addEventListener('click', () => hideModal('review-modal'));
    document.getElementById('cancel-review').addEventListener('click', () => hideModal('review-modal'));

    // Search
    const search = document.getElementById('search-input');
    search.addEventListener('input', () => {
      renderInvoicesList(search.value);
    });

    // Sync button (Phase 1 stub)
    document.getElementById('sync-btn').addEventListener('click', () => {
      showToast('Checked for due reminders (demo — nothing sent yet).');
      // Real logic in Phase 3
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    console.log('%c[InvoiceChase] Phase 1 initializing...', 'color:#64748b');

    loadState();

    // Support ?tab=invoices for easier playwright-toolkit captures
    const params = new URLSearchParams(location.search);
    const initialView = params.get('tab') === 'invoices' ? 'invoices-view' : 'home-view';
    showView(initialView);

    setupCameraInputs();
    setupNavigation();
    setupSettings();

    // Wire the real OCR button (currently calls stub)
    const ocrBtn = document.getElementById('ocr-btn');
    ocrBtn.addEventListener('click', () => {
      if (currentImageFile) runOCR(currentImageFile);
    });

    // Initial render
    updateStats();
    renderInvoicesList();

    // PWA service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('[InvoiceChase] SW registration skipped or failed (normal in some dev setups)', err);
      });
    }

    // Keyboard escape for modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
      }
    });

    // Make a couple demo invoices on first ever run (for nice screenshots)
    if (state.invoices.length === 0 && !localStorage.getItem(STORAGE_KEY)) {
      // Seed one example so the gallery and tests have something to look at
      const demoInv = {
        id: 'seed_demo',
        businessName: 'Acme Supplies Ltd',
        customerName: 'Sunrise Coffee Co.',
        customerEmail: 'billing@sunrisecoffee.com',
        invoiceNumber: 'INV-2025-0842',
        amount: 1247.50,
        dueDate: '2025-05-12',
        paid: false,
        rawText: 'Demo seed invoice',
        reminders: computeReminders('2025-05-12'),
        createdAt: new Date().toISOString()
      };
      state.invoices.push(demoInv);
      saveState();
      updateStats();
      renderInvoicesList();
    }

    console.log('%c[InvoiceChase] Phase 1 ready. Open the app and try "Load Demo Invoice".', 'color:#10b981');
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose a tiny debug API (useful during development with toolkit)
  window.InvoiceChase = {
    getState: () => state,
    resetDemo: () => { localStorage.removeItem(STORAGE_KEY); location.reload(); }
  };
})();
