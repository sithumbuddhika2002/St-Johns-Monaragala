/* ====================================================
   Class Attend – Core Application Logic
   ==================================================== */

(function () {
  'use strict';

  // ---------- Config ----------
  const API = {
    auth: 'api/auth.php',
    availability: 'api/availability.php',
    admin: 'api/admin.php',
  };

  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_FULL_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // ---------- State ----------
  let currentLang = localStorage.getItem('lang') || 'en';
  let currentTheme = localStorage.getItem('theme') || 'light';

  // ---------- Helpers ----------
  function t(key) {
    return (window.LANG && window.LANG[currentLang] && window.LANG[currentLang][key]) || key;
  }

  async function api(endpoint, options = {}) {
    const opts = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
    };
    if (opts.body && typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(endpoint, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function showToast(msg, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function getWeekDateRange(year, week) {
    const jan1 = new Date(year, 0, 1);
    const days = (week - 1) * 7;
    const start = new Date(jan1);
    start.setDate(jan1.getDate() + days - jan1.getDay() + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(start)} – ${fmt(end)}`;
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    // Update all theme toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('data-tooltip', theme === 'dark' ? t('light_mode') : t('dark_mode'));
    });
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    // Persist to server if logged in
    api(`${API.auth}?action=update_prefs`, {
      method: 'POST',
      body: { theme_pref: currentTheme },
    }).catch(() => {});
  }

  // ---------- Language ----------
  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.querySelectorAll('[data-lang-key]').forEach(el => {
      const key = el.getAttribute('data-lang-key');
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = t(key);
      } else {
        el.textContent = t(key);
      }
    });
    document.querySelectorAll('.lang-toggle').forEach(btn => {
      btn.textContent = lang === 'en' ? 'සිං' : 'EN';
      btn.setAttribute('data-tooltip', t('language'));
    });
  }

  function toggleLang() {
    applyLang(currentLang === 'en' ? 'si' : 'en');
    api(`${API.auth}?action=update_prefs`, {
      method: 'POST',
      body: { lang_pref: currentLang },
    }).catch(() => {});
    // Re-render dynamic content if needed
    if (typeof window.onLangChange === 'function') window.onLangChange();
  }

  // ---------- Init ----------
  function initControls() {
    applyTheme(currentTheme);

    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });
    document.querySelectorAll('.lang-toggle').forEach(btn => {
      btn.addEventListener('click', toggleLang);
    });

    applyLang(currentLang);
  }

  // ---------- Biometric ----------
  function initBiometric() {
    const row = document.getElementById('biometricRow');
    const btn = document.getElementById('biometricToggleBtn');
    if (!row || !btn) return;

    function updateBiometricUI(enabled) {
      if (enabled) {
        btn.textContent = '✅ ' + (t('enabled') || 'Enabled');
        btn.style.background = 'var(--success)';
        btn.style.color = '#fff';
      } else {
        btn.textContent = '🔓 ' + (t('enable') || 'Enable');
        btn.style.background = '';
        btn.style.color = '';
      }
    }

    // Listen for biometric status from Flutter
    window.addEventListener('biometricStatusReady', function(e) {
      if (e.detail && e.detail.available) {
        row.style.display = 'flex';
        updateBiometricUI(e.detail.enabled);
      }
    });

    // Listen for biometric enable/disable results
    window.addEventListener('biometricResult', function(e) {
      if (e.detail) {
        if (e.detail.action === 'enable' && e.detail.success) {
          updateBiometricUI(true);
          showToast(t('biometric_enabled') || 'Biometric login enabled! ✅');
        } else if (e.detail.action === 'enable' && !e.detail.success) {
          updateBiometricUI(false);
          showToast(t('biometric_failed') || 'Biometric verification failed', 'error');
        } else if (e.detail.action === 'disable' && e.detail.success) {
          updateBiometricUI(false);
          showToast(t('biometric_disabled') || 'Biometric login disabled');
        }
      }
    });

    // Toggle button click
    btn.addEventListener('click', function() {
      if (typeof BiometricBridge !== 'undefined') {
        const isEnabled = window.__biometricEnabled || false;
        if (isEnabled) {
          BiometricBridge.postMessage('disable');
        } else {
          BiometricBridge.postMessage('enable');
        }
      }
    });

    // If status is already available (race condition prevention)
    if (window.__isMobileApp && window.__biometricAvailable) {
      row.style.display = 'flex';
      updateBiometricUI(window.__biometricEnabled || false);
    } else if (typeof BiometricBridge !== 'undefined') {
      // Explicitly ask Flutter for status just in case we missed the event
      BiometricBridge.postMessage('check');
    }
  }

  // =============================================
  //   AUTH PAGE
  // =============================================
  function initAuthPage() {
    initControls();

    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        forms.forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(target).classList.add('active');
      });
    });

    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = t('loading');
        try {
          const data = await api(`${API.auth}?action=login`, {
            method: 'POST',
            body: {
              email: loginForm.email.value.trim(),
              password: loginForm.password.value,
            },
          });
          if (data.lang_pref) applyLang(data.lang_pref);
          if (data.theme_pref) applyTheme(data.theme_pref);
          showToast(`${t('login')} ✓`);
          setTimeout(() => {
            window.location.href = data.role === 'admin' ? 'admin.html' : 'student.html';
          }, 500);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = t('login_btn');
        }
      });
    }

    // Register
    const regForm = document.getElementById('registerForm');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = regForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = t('loading');
        try {
          await api(`${API.auth}?action=register`, {
            method: 'POST',
            body: {
              name: regForm.fullname.value.trim(),
              email: regForm.email.value.trim(),
              password: regForm.password.value,
            },
          });
          showToast(`${t('register')} ✓`);
          setTimeout(() => {
            window.location.href = 'student.html';
          }, 500);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = t('register_btn');
        }
      });
    }
  }

  // =============================================
  //   STUDENT PAGE
  // =============================================
  function initStudentPage() {
    initControls();

    const now = new Date();
    let currentYear = now.getFullYear();
    let currentWeek = getWeekNumber(now);
    let days = [0, 0, 0, 0, 0, 0, 0]; // 0=busy, 1=free

    const weekLabel = document.getElementById('weekLabel');
    const grid = document.getElementById('availGrid');
    const saveBtn = document.getElementById('saveBtn');
    const userName = document.getElementById('userName');

    // Check auth
    api(`${API.auth}?action=me`).then(data => {
      if (!data.logged_in) {
        window.location.href = 'index.html';
        return;
      }
      if (userName) userName.textContent = data.name;
      
      const pName = document.getElementById('profileName');
      const pEmail = document.getElementById('profileEmail');
      if (pName) pName.textContent = data.name || '--';
      if (pEmail) pEmail.textContent = data.email || '--';
      
      loadWeek();
    }).catch(() => {
      window.location.href = 'index.html';
    });

    // Tabs / Sidebar Menu
    const tabBtns = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = btn.dataset.tab;
        if (targetTab) document.getElementById(targetTab).classList.add('active');
      });
    });

    function updateWeekLabel() {
      if (weekLabel) {
        weekLabel.textContent = `${t('week')} ${currentWeek} • ${currentYear}  (${getWeekDateRange(currentYear, currentWeek)})`;
      }
    }

    function renderGrid() {
      if (!grid) return;
      grid.innerHTML = '';
      DAY_KEYS.forEach((key, i) => {
        const card = document.createElement('div');
        card.className = `day-card ${days[i] ? 'free' : 'busy'}`;
        card.innerHTML = `
          <div class="day-name" data-lang-key="${key}">${t(key)}</div>
          <div class="day-status">${days[i] ? '✅' : '❌'}</div>
          <div class="day-label">${days[i] ? t('free') : t('busy')}</div>
        `;
        card.addEventListener('click', () => {
          days[i] = days[i] ? 0 : 1;
          renderGrid();
        });
        grid.appendChild(card);
      });
    }

    async function loadWeek() {
      updateWeekLabel();
      try {
        const data = await api(`${API.availability}?action=my&year=${currentYear}&week=${currentWeek}`);
        days = data.days || [0, 0, 0, 0, 0, 0, 0];
      } catch {
        days = [0, 0, 0, 0, 0, 0, 0];
      }
      renderGrid();
    }

    // Week navigation
    document.getElementById('prevWeek')?.addEventListener('click', () => {
      currentWeek--;
      if (currentWeek < 1) { currentYear--; currentWeek = 52; }
      loadWeek();
    });
    document.getElementById('nextWeek')?.addEventListener('click', () => {
      currentWeek++;
      if (currentWeek > 52) { currentYear++; currentWeek = 1; }
      loadWeek();
    });
    document.getElementById('todayWeek')?.addEventListener('click', () => {
      currentYear = now.getFullYear();
      currentWeek = getWeekNumber(now);
      loadWeek();
    });

    // Save
    saveBtn?.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner" style="width:20px;height:20px;border-width:2px;margin:0"></span> ${t('saving')}`;
      try {
        const dayData = days.map((v, i) => ({ day: i, is_free: v }));
        await api(`${API.availability}?action=save`, {
          method: 'POST',
          body: { year: currentYear, week: currentWeek, days: dayData },
        });
        showToast(t('saved_success'));
      } catch (err) {
        showToast(err.message, 'error');
      }
      saveBtn.disabled = false;
      saveBtn.innerHTML = `💾 <span data-lang-key="save">${t('save')}</span>`;
    });

    // Biometric
    initBiometric();

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      // Clear biometric on logout
      if (typeof BiometricBridge !== 'undefined') {
        BiometricBridge.postMessage('disable');
      }
      await api(`${API.auth}?action=logout`);
      window.location.href = 'index.html';
    });

    // Language change handler
    window.onLangChange = () => {
      updateWeekLabel();
      renderGrid();
    };
  }

  // =============================================
  //   ADMIN PAGE
  // =============================================
  function initAdminPage() {
    initControls();

    const now = new Date();
    let currentYear = now.getFullYear();
    let currentWeek = getWeekNumber(now);

    const weekLabel = document.getElementById('weekLabel');
    const userName = document.getElementById('userName');

    // Check auth
    api(`${API.auth}?action=me`).then(data => {
      if (!data.logged_in || data.role !== 'admin') {
        window.location.href = 'index.html';
        return;
      }
      if (userName) userName.textContent = data.name;
      loadAll();
    }).catch(() => {
      window.location.href = 'index.html';
    });

    // Tabs / Sidebar Menu
    const tabBtns = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const globalWeekPicker = document.getElementById('globalWeekPicker');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        
        const targetTab = btn.dataset.tab;
        document.getElementById(targetTab).classList.add('active');

        // Hide week picker on tabs where it's irrelevant
        if (globalWeekPicker) {
          if (targetTab === 'yearlyTab' || targetTab === 'studentsTab' || targetTab === 'settingsTab' || targetTab === 'adminProfileTab') {
            globalWeekPicker.style.display = 'none';
          } else {
            globalWeekPicker.style.display = 'flex';
          }
        }
      });
    });

    // Dropdown toggle logic
    const headerProfileBtn = document.getElementById('headerProfileBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (headerProfileBtn && profileDropdown) {
      headerProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
      });
      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target)) {
          profileDropdown.classList.remove('show');
        }
      });
    }

    // Change Password Form
    const cpForm = document.getElementById('changePasswordForm');
    if (cpForm) {
      cpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = cpForm.querySelector('button');
        const ogText = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = t('loading') || 'Loading...';
        try {
          await api(`${API.auth}?action=change_password`, {
            method: 'POST',
            body: {
              old_password: cpForm.old_password.value,
              new_password: cpForm.new_password.value
            }
          });
          showToast(t('saved_success') || 'Password updated successfully! ✓');
          cpForm.reset();
        } catch (err) {
          showToast(err.message, 'error');
        }
        btn.disabled = false;
        btn.innerHTML = ogText;
      });
    }

    // Add Admin Form
    const aaForm = document.getElementById('addAdminForm');
    if (aaForm) {
      aaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = aaForm.querySelector('button');
        const ogText = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = t('loading') || 'Loading...';
        try {
          await api(`${API.admin}?action=add_admin`, {
            method: 'POST',
            body: {
              name: aaForm.name.value.trim(),
              email: aaForm.email.value.trim(),
              password: aaForm.password.value
            }
          });
          showToast(t('saved_success') || 'Admin created successfully! ✓');
          aaForm.reset();
        } catch (err) {
          showToast(err.message, 'error');
        }
        btn.disabled = false;
        btn.innerHTML = ogText;
      });
    }

    function updateWeekLabel() {
      if (weekLabel) {
        weekLabel.textContent = `${t('week')} ${currentWeek} • ${currentYear}  (${getWeekDateRange(currentYear, currentWeek)})`;
      }
    }

    async function loadAll() {
      updateWeekLabel();
      await Promise.all([loadWeeklyView(), loadBestDay(), loadStudents()]);
    }

    // WEEKLY VIEW
    async function loadWeeklyView() {
      const tableBody = document.getElementById('weeklyTableBody');
      const statsRow = document.getElementById('weeklyStats');
      if (!tableBody) return;

      try {
        const data = await api(`${API.availability}?action=all&year=${currentYear}&week=${currentWeek}`);
        const students = data.students || [];

        if (students.length === 0) {
          tableBody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📭</div><p>${t('no_responses')}</p></td></tr>`;
          if (statsRow) statsRow.innerHTML = '';
          return;
        }

        tableBody.innerHTML = students.map(s => {
          const cells = s.days.map(d =>
            `<td><span class="${d ? 'dot-free' : 'dot-busy'}">${d ? '✓' : '✗'}</span></td>`
          ).join('');
          return `<tr><td>${s.name}</td>${cells}</tr>`;
        }).join('');

        // Stats row
        if (statsRow) {
          const totals = [0, 0, 0, 0, 0, 0, 0];
          students.forEach(s => s.days.forEach((d, i) => totals[i] += d));
          statsRow.innerHTML = `<td><strong>${t('free_count')}</strong></td>` +
            totals.map(c => `<td><strong class="badge badge-success">${c}/${students.length}</strong></td>`).join('');
        }

        // Update stat cards
        const totalEl = document.getElementById('statTotal');
        const respondedEl = document.getElementById('statResponded');
        if (totalEl) totalEl.textContent = students.length;
        if (respondedEl) respondedEl.textContent = students.filter(s => s.days.some(d => d)).length;

      } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="8">${t('error')}</td></tr>`;
      }
    }

    // BEST DAY
    async function loadBestDay() {
      const banner = document.getElementById('bestDayBanner');
      const barList = document.getElementById('bestDayBars');
      if (!banner) return;

      try {
        const data = await api(`${API.admin}?action=best_days&year=${currentYear}&week=${currentWeek}`);
        const days = data.days || [];

        if (days.length === 0) {
          banner.innerHTML = `<span class="best-icon">📊</span><div class="best-info"><h3>${t('best_day_title')}</h3><p>${t('no_responses')}</p></div>`;
          if (barList) barList.innerHTML = '';
          return;
        }

        const best = days[0];
        const dayName = t(DAY_FULL_KEYS[best.day]);
        banner.innerHTML = `
          <span class="best-icon">🏆</span>
          <div class="best-info">
            <h3>${dayName}</h3>
            <p>${best.free_count} ${t('of')} ${best.total} ${t('best_day_desc')} (${best.percentage}%)</p>
          </div>
        `;

        if (barList) {
          barList.innerHTML = days.map(d => `
            <div class="mb-2">
              <div class="flex justify-between items-center mb-1">
                <span style="font-weight:600">${t(DAY_FULL_KEYS[d.day])}</span>
                <span class="badge badge-info">${d.free_count}/${d.total}</span>
              </div>
              <div class="progress-bar">
                <div class="fill" style="width:${d.percentage}%"></div>
              </div>
            </div>
          `).join('');
        }

      } catch (err) {
        banner.innerHTML = `<span class="best-icon">❓</span><div class="best-info"><h3>${t('error')}</h3></div>`;
      }
    }

    // YEARLY HEATMAP
    async function loadYearlyView() {
      const container = document.getElementById('heatmapContainer');
      if (!container) return;

      const yearVal = parseInt(document.getElementById('yearSelect')?.value || currentYear);

      try {
        const data = await api(`${API.admin}?action=yearly_summary&year=${yearVal}`);
        const heatmap = data.heatmap || [];
        const total = data.total_students || 1;

        // Build lookup
        const lookup = {};
        heatmap.forEach(h => { lookup[`${h.week}-${h.day}`] = h.free_count; });

        let html = '';
        // Day labels (rows)
        const shortDays = DAY_KEYS.map(k => t(k));

        for (let day = 0; day < 7; day++) {
          html += `<div class="hm-label">${shortDays[day]}</div>`;
          for (let week = 1; week <= 53; week++) {
            const count = lookup[`${week}-${day}`] || 0;
            const pct = count / total;
            let level = 0;
            if (pct > 0) level = 1;
            if (pct >= 0.25) level = 2;
            if (pct >= 0.5) level = 3;
            if (pct >= 0.75) level = 4;
            if (pct >= 0.9) level = 5;
            html += `<div class="hm-cell" data-level="${level}" data-tooltip="${t('week')} ${week}: ${count}/${total} ${t('free')}"></div>`;
          }
        }

        container.innerHTML = `<div class="heatmap">${html}</div>
          <div class="heatmap-legend">
            <span>${t('less')}</span>
            <div class="swatch" style="background:var(--heatmap-0)"></div>
            <div class="swatch" style="background:var(--heatmap-1)"></div>
            <div class="swatch" style="background:var(--heatmap-2)"></div>
            <div class="swatch" style="background:var(--heatmap-3)"></div>
            <div class="swatch" style="background:var(--heatmap-4)"></div>
            <div class="swatch" style="background:var(--heatmap-5)"></div>
            <span>${t('more')}</span>
          </div>`;
      } catch (err) {
        container.innerHTML = `<p>${t('error')}</p>`;
      }
    }

    // STUDENTS LIST
    async function loadStudents() {
      const list = document.getElementById('studentList');
      if (!list) return;
      try {
        const data = await api(`${API.admin}?action=students`);
        const students = data.students || [];
        if (students.length === 0) {
          list.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>${t('no_students')}</p></div>`;
          return;
        }
        list.innerHTML = `<ul class="student-list">${students.map(s => `
          <li>
            <div class="student-name">
              <div class="student-avatar">${s.name.charAt(0).toUpperCase()}</div>
              <div>
                <div>${s.name}</div>
                <div class="student-email">${s.email}</div>
              </div>
            </div>
            <span class="badge badge-info">${t('joined')} ${new Date(s.created_at).toLocaleDateString()}</span>
          </li>
        `).join('')}</ul>`;

        const countEl = document.getElementById('statTotal');
        if (countEl) countEl.textContent = students.length;
      } catch (err) {
        list.innerHTML = `<p>${t('error')}</p>`;
      }
    }

    // Week navigation
    document.getElementById('prevWeek')?.addEventListener('click', () => {
      currentWeek--;
      if (currentWeek < 1) { currentYear--; currentWeek = 52; }
      loadAll();
    });
    document.getElementById('nextWeek')?.addEventListener('click', () => {
      currentWeek++;
      if (currentWeek > 52) { currentYear++; currentWeek = 1; }
      loadAll();
    });
    document.getElementById('todayWeek')?.addEventListener('click', () => {
      currentYear = now.getFullYear();
      currentWeek = getWeekNumber(now);
      loadAll();
    });

    // Year select for heatmap
    document.getElementById('yearSelect')?.addEventListener('change', loadYearlyView);

    // Tab change handler to load yearly on tab click
    document.querySelector('[data-tab="yearlyTab"]')?.addEventListener('click', loadYearlyView);

    // Biometric
    initBiometric();

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      // Clear biometric on logout
      if (typeof BiometricBridge !== 'undefined') {
        BiometricBridge.postMessage('disable');
      }
      await api(`${API.auth}?action=logout`);
      window.location.href = 'index.html';
    });

    // Language change
    window.onLangChange = () => {
      updateWeekLabel();
      loadAll();
    };
  }

  // =============================================
  //   GOOGLE AUTH HANDLER
  // =============================================
  window.handleGoogleAuth = async (response) => {
    try {
      showToast(t('loading') || 'Loading...', 'info');
      const data = await api(`${API.auth}?action=google_login`, {
        method: 'POST',
        body: { credential: response.credential }
      });
      if (data.lang_pref) applyLang(data.lang_pref);
      if (data.theme_pref) applyTheme(data.theme_pref);
      showToast(`${t('login') || 'Login'} ✓`);
      setTimeout(() => {
        const target = data.role === 'admin' ? 'admin.html' : 'student.html';
        const targetUrlPath = `${window.location.origin}${window.location.pathname.replace('index.html', '')}${target}`;
        
        if (typeof isMobileApp !== 'undefined' && isMobileApp) {
          // Redirect back to app using custom scheme
          window.location.href = `classattend://login-success?url=${encodeURIComponent(targetUrlPath)}`;
        } else {
          window.location.href = target;
        }
      }, 500);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ---------- Page Router ----------
  window.initAuthPage = initAuthPage;
  window.initStudentPage = initStudentPage;
  window.initAdminPage = initAdminPage;

})();
