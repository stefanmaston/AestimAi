/* ===================================================
   AestimAi — Applikationslogik
   =================================================== */

// ── License agreement (User License Agreement v2026-06-11) ──
const LICENSE_AGREEMENT = {
  version: '2026-06-11',
  id:      'aestimai-user-license-v2026-06-11',
  pdfUrl:  '/legal/aestimai-user-license-agreement-v2026-06-11.pdf',
  pageUrl: '/legal/',
};

function buildLicenseAcceptanceMetadata() {
  return {
    license_agreement_version: LICENSE_AGREEMENT.version,
    license_agreement_id:      LICENSE_AGREEMENT.id,
    license_accepted_at:       new Date().toISOString(),
    license_tier:              'general',
  };
}

function formatLicenseAcceptance(user) {
  const i18n = window.AestimI18n;
  const tr = (k, fb) => i18n?.t?.(k) || fb;
  const ver = user?.user_metadata?.license_agreement_version;
  const at  = user?.user_metadata?.license_accepted_at;
  if (!ver) return tr('legal.notRecorded', 'Not recorded');
  const locale = i18n?.localeTag?.() || 'en-US';
  const dateStr = at ? new Date(at).toLocaleDateString(locale) : '';
  return dateStr ? `${ver} (${dateStr})` : ver;
}

window.LICENSE_AGREEMENT = LICENSE_AGREEMENT;

function str(key, vars, fb) {
  let s = window.AestimI18n?.t?.(key) || fb || key;
  if (vars && s) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
  return s;
}
function appLocale() {
  return window.AestimI18n?.localeTag?.() || 'en-US';
}

window.str = str;

// ── State ──────────────────────────────────────────
const state = {
  currentModule:     'uci',
  isLoggedIn:        false,
  selectedCondition: 3,
  uciRateToSEK:      62.40,
  uciRateToEUR:      5.52,
  uciRateToUSD:      5.98,
  currentItemId:     null,   // aktiv survey-session
  currentUciPrior:   null,   // Claude-estimat (prior)
  hasVoted:          false,
  user:              null,   // Supabase-användare (när inloggad)
  listingFiles:      [],     // valda bildfiler i registrera-formuläret
  listingValuation:  null,   // senaste AI-värdering i registrera-formuläret
  labTab:            'engine', // ucilab: engine | papers | shop
};

let marketLoaded = false;    // har Bytesmarknaden laddats första gången?

// I produktion (Vercel) används relativa sökvägar — Vercel proxar till backend.
// Lokalt pekar vi direkt på Node-servrarna.
const IS_LOCAL   = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const UCI_SERVER = IS_LOCAL ? 'http://localhost:3004' : '';

// ── Supabase (samma databas som mobilappen) ────────
// Laddas LAZY – först när en värdering faktiskt ska sparas, aldrig vid
// sidladdning. Då kan det inte påverka att sidan öppnas.
const SUPABASE_URL = 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
let _sb = null;

async function getSb() {
  if (_sb) return _sb;
  if (!(window.supabase && window.supabase.createClient)) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

/** Sparar en webbvärdering i databasen (tyst – stör aldrig värderingsflödet). */
async function saveWebValuation(objectData, result) {
  try {
    const sb = await getSb();
    let { data: { user } } = await sb.auth.getUser();
    if (!user) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }
    await sb.from('aestimai_valuations').insert({
      user_id:     user.id,
      object_data: objectData,
      result,
      source:      'manual',
      locale:      window.AestimI18n?.getLanguage?.() || 'en',
    });
  } catch (e) {
    console.warn('[Spara] kunde inte spara värdering:', e && e.message);
  }
}

// (Gamla lokala UCI-tabeller är ersatta av Claude API)

// ── Navigation ─────────────────────────────────────
function navigateTo(moduleId) {
  document.querySelector('style[data-module-boot]')?.remove();

  if (moduleId === 'account' && !isRealUser(currentUser)) {
    openAuthModal('login');
    moduleId = 'uci';
  }

  closeMobileSidebar?.();

  document.querySelectorAll('.module').forEach(m => {
    m.classList.add('hidden');
    m.hidden = true;
  });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const mod = document.getElementById('module-' + moduleId);
  if (mod) {
    mod.classList.remove('hidden');
    mod.hidden = false;
  } else {
    console.warn('[navigateTo] Okänd modul:', moduleId, '— faller tillbaka till uci');
    moduleId = 'uci';
    const fallback = document.getElementById('module-uci');
    if (fallback) {
      fallback.classList.remove('hidden');
      fallback.hidden = false;
    }
  }

  const navBtn = document.querySelector(`.nav-item[data-module="${moduleId}"]`);
  if (navBtn) navBtn.classList.add('active');

  state.currentModule = moduleId;
  updatePanelHelp(moduleId);

  // Ladda nyheter första gången
  if (moduleId === 'news' && !newsLoaded) {
    loadNews('all');
  }

  // Ladda dashboard första gången
  if (moduleId === 'dashboard' && !dashLoaded) {
    loadMarketDashboard();
  }

  // Ladda Bytesmarknaden första gången
  if (moduleId === 'market' && !marketLoaded) {
    marketLoaded = true;
    searchMarket();
  }

  // Ladda AestimAi Lab shop första gången shop-fliken öppnas
  if (moduleId === 'ucilab') {
    const tab = state.labTab || 'engine';
    switchLabTab(tab, { skipHash: true });
  }

  // Uppdatera konto-sidan när den öppnas
  if (moduleId === 'account') {
    refreshAccountSection();
  }

  if (moduleId === 'settings') {
    initSettingsPanel();
  }

  syncModuleHash(moduleId);
}

function syncModuleHash(moduleId) {
  let hash = '#' + moduleId;
  if (moduleId === 'ucilab') {
    const tab = state.labTab || 'engine';
    hash = tab === 'shop' ? '#ucilab-shop' : tab === 'papers' ? '#ucilab-papers' : '#ucilab';
  }
  if (location.hash !== hash) {
    history.replaceState(null, '', location.pathname + location.search + hash);
  }
}

function updatePanelHelp(moduleId) {
  const i18n = window.AestimI18n;
  const panelKey = 'panel.' + moduleId;
  const el = document.getElementById('panelHelp');
  if (!el) return;
  if (i18n?.t?.(panelKey) && i18n.t(panelKey) !== panelKey) {
    el.innerHTML = i18n.t(panelKey);
    return;
  }
  const helpTexts = {
    uci: str('panel.uci', null, '<h4>About UCI valuation</h4><p>UCI measures real trade value — no login required.</p>'),
    market: str('panel.market', null, '<h4>About UCI Marketplace</h4><p>Trade goods and services without currency.</p>'),
    pro: str('panel.pro', null, '<h4>AestimAi Pro</h4><p>Professional valuation for property and portfolios.</p>'),
    ucilab: str('panel.ucilab', null, '<h4>AestimAi Lab</h4><p>Research on the UCI valuation engine.</p>'),
    idcoop: str('panel.about', null, '<h4>About AestimAi</h4><p>Universal Coin Index for fairer trades.</p>'),
    news: str('panel.news', null, '<h4>AestimAi News</h4><p>News on valuation, trade and energy.</p>'),
    settings: str('panel.settings', null, '<h4>Settings</h4><p>Choose language and display currency.</p>'),
    dashboard: str('panel.dashboard', null, '<h4>UCI Market Data</h4><p>Live rate and key metrics.</p>'),
    pricing: str('panel.pricing', null, '<h4>Pricing & Account</h4><p>Freemium, Pro and Enterprise plans.</p>'),
    about: str('panel.about', null, '<h4>About AestimAi</h4><p>Building the missing measure of value.</p>'),
    account: str('panel.pricing', null, '<h4>Pricing & Account</h4><p>Manage your subscription.</p>'),
  };
  el.innerHTML = helpTexts[moduleId] || helpTexts.uci;
}

// ── UCI Värdering (Claude API) ──────────────────────
// Räknare för anonyma sökningar (återställs per session)
let _anonSearchCount = parseInt(sessionStorage.getItem('anonSearchCount') || '0', 10);
const ANON_SEARCH_LIMIT = 3;

async function runUciValuation() {
  const input    = document.getElementById('uciInput').value.trim();
  const category = document.getElementById('uciCategory').value;
  const cond     = state.selectedCondition;

  if (!input && !category) {
    document.getElementById('uciInput').focus();
    return;
  }

  // Auth-gate efter 3 anonyma sökningar
  if (!currentUser) {
    _anonSearchCount++;
    sessionStorage.setItem('anonSearchCount', _anonSearchCount);
    if (_anonSearchCount > ANON_SEARCH_LIMIT) {
      openAuthModal('register');
      return;
    }
  }

  // Visa laddning
  setUciLoading(true);

  try {
    const res = await fetch(`${UCI_SERVER}/api/uci/value`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        description: input,
        category,
        condition: cond,
        language:  window.AestimI18n?.getLanguage?.() || 'en',
        ..._valImageBase64 ? { imageBase64: _valImageBase64 } : {},
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API-fel');

    renderUciResult(data);

    // Spara värderingen i databasen (samma som mobilappen)
    saveWebValuation({ description: input, category, condition: cond }, data);

  } catch (err) {
    setUciLoading(false);
    // Fallback till lokal beräkning om servern inte är igång
    if (err.message.includes('fetch') || err.message.includes('Failed')) {
      console.warn('[UCI] Server ej nåbar — använder lokal fallback');
      renderUciFallback(input, category, cond);
    } else {
      showToast(str('uci.toast.valuationFailed', { msg: err.message }, 'Valuation failed: ' + err.message));
    }
  }
}

function setUciLoading(on) {
  const btn     = document.getElementById('btnUciValue');
  const loading = document.getElementById('uciLoading');
  const result  = document.getElementById('uciResult');
  const i18n    = window.AestimI18n;
  btn.disabled  = on;
  document.getElementById('btnUciText').textContent = on
    ? (i18n?.t?.('uci.btnLoading') || 'Analyzing…')
    : (i18n?.t?.('uci.btnValuate') || 'Valuate');
  loading.classList.toggle('hidden', !on);
  if (on) result.classList.add('hidden');
}

function renderUciResult(data) {
  setUciLoading(false);
  const locale = marketLocaleTag();

  state.currentItemId   = data.itemId;
  state.currentUciPrior = data.uci_value;
  state.hasVoted        = false;

  document.getElementById('uciValue').textContent = data.uci_value.toLocaleString(locale);
  document.getElementById('convSEK').textContent  = (data.sek_approx || Math.round(data.uci_value * state.uciRateToSEK)).toLocaleString(locale) + ' kr';
  document.getElementById('convEUR').textContent  = (data.eur_approx || Math.round(data.uci_value * state.uciRateToEUR)).toLocaleString(locale) + ' €';
  document.getElementById('convUSD').textContent  = (data.usd_approx || Math.round(data.uci_value * state.uciRateToUSD)).toLocaleString(locale) + ' $';

  const conf = data.confidence_pct || 70;
  document.getElementById('confBar').style.width   = conf + '%';
  document.getElementById('confPct').textContent   = str('uci.result.confidencePct', { pct: conf }, conf + '% confidence');
  document.getElementById('confRange').textContent =
    str('uci.result.confidenceRange', {
      low: data.uci_low?.toLocaleString(locale),
      high: data.uci_high?.toLocaleString(locale),
    }, `${data.uci_low?.toLocaleString(locale)} – ${data.uci_high?.toLocaleString(locale)} UCI`);

  // AI-analys
  document.getElementById('reasoningText').textContent = data.reasoning || '';
  const kf = document.getElementById('keyFactors');
  kf.innerHTML = (data.key_factors || []).map(f => `<span class="factor-tag">${f}</span>`).join('');

  // Jämförelseobjekt
  const cl = document.getElementById('comparablesList');
  cl.innerHTML = (data.comparables || []).map(c =>
    `<div class="comparable-row">
       <span class="comp-name">${c.name}</span>
       <span class="comp-uci">${c.uci?.toLocaleString(locale)} UCI</span>
     </div>`
  ).join('');

  // Avskrivning
  const dep = document.getElementById('depreciationNote');
  dep.textContent = data.depreciation_note || '';
  dep.style.display = data.depreciation_note ? 'block' : 'none';

  // Marknadsprisankar-kort
  const mc = data.market_context;
  let mcEl = document.getElementById('marketContextCard');
  if (mc && mc.typical_price_low_sek) {
    if (!mcEl) {
      mcEl = document.createElement('div');
      mcEl.id = 'marketContextCard';
      mcEl.className = 'market-context-card';
      document.getElementById('uciResult').insertBefore(mcEl, document.getElementById('uciResult').firstChild);
    }
    const lo = mc.typical_price_low_sek.toLocaleString('sv-SE');
    const hi = mc.typical_price_high_sek.toLocaleString('sv-SE');
    mcEl.innerHTML = `
      <div class="mc-header">
        <span class="mc-icon">⊛</span>
        <span class="mc-label">${str('uci.result.marketAnchor', null, 'Market price anchor')}</span>
        <span class="mc-category">${mc.category_label || ''}</span>
      </div>
      <div class="mc-range">${lo} – ${hi} SEK</div>
      <div class="mc-basis">${mc.price_basis || ''}</div>`;
    mcEl.style.display = 'block';
  } else if (mcEl) {
    mcEl.style.display = 'none';
  }

  // Survey
  setupSurvey(data.uci_value, data.survey_question);

  // Föreslå UCI-pris i registrering
  const autoVal = document.getElementById('uciAutoValue');
  if (autoVal) autoVal.textContent = data.uci_value.toLocaleString(locale);

  document.getElementById('uciResult').classList.remove('hidden');
  document.getElementById('uciResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Lokal fallback om UCI-servern inte är igång
function renderUciFallback(input, category, cond) {
  const bases = {
    'Fastighet': 45000, 'Fordon': 800, 'Verktyg': 120, 'Elektronik': 350,
    'Kläder': 40, 'Möbler': 180, 'Värdemetaller': 1200,
    'Tjänster / Tid': 60, 'Energiutrustning': 2000, '': 200,
  };
  const mult = { 1: 0.35, 2: 0.6, 3: 0.85, 4: 1.0, 5: 1.2 };
  const base = bases[category] || 200;
  const uci  = Math.round(base * (mult[cond] || 1) * (0.85 + Math.random() * 0.3));

  renderUciResult({
    uci_value:       uci,
    uci_low:         Math.round(uci * 0.85),
    uci_high:        Math.round(uci * 1.15),
    confidence_pct:  55,
    sek_approx:      Math.round(uci * state.uciRateToSEK),
    eur_approx:      Math.round(uci * state.uciRateToEUR),
    usd_approx:      Math.round(uci * state.uciRateToUSD),
    reasoning:       str('uci.result.fallbackReasoning', null, 'Estimate from local model.'),
    key_factors:     ['Category: ' + (category || 'Unknown'), 'Condition: ' + cond + '/5'],
    comparables:     [],
    depreciation_note: '',
    survey_question: str('uci.result.surveyQuestionDefault', null, 'What is your assessment of the value?'),
    itemId:          null,
  });
}

// ── Survey / Respondentvalidering ───────────────────
function setupSurvey(priorUci, question) {
  const slider  = document.getElementById('surveySlider');
  const anchor  = document.getElementById('sliderAnchor');
  const preview = document.getElementById('sliderPreview');
  const qEl     = document.getElementById('surveyQuestion');

  if (qEl)     qEl.textContent  = question || str('uci.result.surveyQuestionDefault', null, 'What is your assessment of the value?');
  if (anchor)  anchor.textContent = str('uci.result.sliderAnchor', { value: priorUci.toLocaleString(marketLocaleTag()) }, priorUci.toLocaleString(marketLocaleTag()) + ' UCI (AI)');

  // Slider: 1–100 → 20%–500% av prior
  slider.value = 50;
  updateSliderPreview();

  document.getElementById('surveyN').textContent       = str('uci.result.surveyAnswers', { n: 0 }, '0 responses');
  document.getElementById('surveySig').classList.add('hidden');
  document.getElementById('bayesianResult').classList.add('hidden');
  document.getElementById('btnSubmitVote').disabled = false;
}

function sliderToUci(sliderVal) {
  const prior = state.currentUciPrior || 100;
  // Icke-linjär skala: mitt (50) = prior, 1 = 20% av prior, 100 = 500% av prior
  const ratio = sliderVal <= 50
    ? 0.2 + (sliderVal / 50) * 0.8
    : 1.0 + ((sliderVal - 50) / 50) * 4.0;
  return Math.round(prior * ratio);
}

function updateSliderPreview() {
  const val     = parseInt(document.getElementById('surveySlider').value);
  const uci     = sliderToUci(val);
  const preview = document.getElementById('sliderPreview');
  if (preview) preview.textContent = uci.toLocaleString(marketLocaleTag());
}

async function submitVote() {
  if (state.hasVoted) { showToast(str('uci.toast.alreadyVoted', null, 'You have already voted on this item.')); return; }

  const sliderVal = parseInt(document.getElementById('surveySlider').value);
  const voteUci   = sliderToUci(sliderVal);

  if (!state.currentItemId) {
    showToast(str('uci.toast.noSession', null, 'No active valuation session — value an item first.'));
    return;
  }

  try {
    const res  = await fetch(`${UCI_SERVER}/api/uci/vote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ itemId: state.currentItemId, vote: voteUci }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.hasVoted = true;
    document.getElementById('btnSubmitVote').disabled = true;
    document.getElementById('btnSubmitVote').textContent = str('uci.result.voteRegistered', null, '✓ Vote recorded');

    renderBayesianResult(data);
    showToast(str('uci.toast.voteThanks', null, 'Thank you! Your assessment has been recorded.'));

  } catch (err) {
    showToast(str('uci.toast.voteFailed', { msg: err.message }, 'Could not submit vote: ' + err.message));
  }
}

function renderBayesianResult(data) {
  const n    = data.n || 0;
  const locale = marketLocaleTag();
  const nEl  = document.getElementById('surveyN');
  const sig  = document.getElementById('surveySig');
  const box  = document.getElementById('bayesianResult');

  nEl.textContent = str('uci.result.surveyAnswers', { n }, `${n} responses`);
  if (n >= 20) sig.classList.remove('hidden');

  document.getElementById('bayesValue').textContent = data.mean?.toLocaleString(locale) || '—';
  document.getElementById('bayesRange').textContent =
    `${data.low?.toLocaleString(locale)} – ${data.high?.toLocaleString(locale)} UCI`;

  const shift    = data.mean - state.currentUciPrior;
  const shiftPct = Math.round((shift / state.currentUciPrior) * 100);
  const dir      = shift > 0 ? '▲' : shift < 0 ? '▼' : '—';
  const col      = shift > 0 ? 'var(--green)' : shift < 0 ? '#b84040' : 'var(--gray-500)';
  const respondents = n === 1
    ? str('uci.result.bayesianRespondentsOne', { n }, `${n} respondent`)
    : str('uci.result.bayesianRespondentsMany', { n }, `${n} respondents`);

  document.getElementById('bayesMeta').innerHTML =
    `<span style="color:${col};font-weight:700">${str('uci.result.bayesianShift', { dir, pct: Math.abs(shiftPct) }, `${dir} ${Math.abs(shiftPct)}% from AI estimate`)}</span>
     &nbsp;·&nbsp; ${respondents}
     &nbsp;·&nbsp; ${str('uci.result.bayesianConfidence', { pct: data.confidence }, `Confidence: ${data.confidence}%`)}`;

  if (n >= 5) {
    document.getElementById('uciValue').textContent = data.mean?.toLocaleString(locale);
    document.getElementById('uciSourceBadge').innerHTML =
      `<span class="badge-crowd">⊙ ${n} respondenter</span>`;
  }

  box.classList.remove('hidden');
}

// ── Skick-knappar ───────────────────────────────────
function setupConditionButtons() {
  document.querySelectorAll('.cond-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cond-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCondition = parseInt(btn.dataset.cond);
    });
  });
}

// ── Marknadstabs ────────────────────────────────────
function setupMarketTabs() {
  document.querySelectorAll('.market-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.market-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = 'tab-' + btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      const target = document.getElementById(tabId);
      if (target) target.classList.remove('hidden');

      if (btn.dataset.tab === 'register') {
        refreshAuth().then(() => {
          document.getElementById('registerGate').classList.toggle('hidden', state.isLoggedIn);
          document.getElementById('registerForm').classList.toggle('hidden', !state.isLoggedIn);
          refreshListingQuotaHint();
        });
      } else if (btn.dataset.tab === 'search') {
        searchMarket();
      } else if (btn.dataset.tab === 'my-items') {
        loadMyItems();
      }
    });
  });
}

// ── Pro-tabs ────────────────────────────────────────
function setupProTabs() {
  document.querySelectorAll('.pro-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pro-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = 'pro-tab-' + btn.dataset.proTab;
      document.querySelectorAll('.pro-tab-content').forEach(t => t.classList.add('hidden'));
      const target = document.getElementById(tabId);
      if (target) target.classList.remove('hidden');
    });
  });
}

// ── Mobil/tablet-navigation ───────────────────────────────────────
let closeMobileSidebar = null;

function setupMobileNav() {
  const btn = document.getElementById('btnMobileMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!btn) return;

  const close = () => {
    document.body.classList.remove('sidebar-open');
    backdrop?.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    document.body.classList.add('sidebar-open');
    backdrop?.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', () => {
    document.body.classList.contains('sidebar-open') ? close() : open();
  });
  backdrop?.addEventListener('click', close);
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) close();
  });
  closeMobileSidebar = close;
}

// ── Höger panel ─────────────────────────────────────
function setupPanel() {
  const btn   = document.getElementById('btnTogglePanel');
  const close = document.getElementById('btnClosePanel');
  if (!btn || !close) return;

  btn.addEventListener('click', () => {
    document.body.classList.toggle('panel-open');
    btn.textContent = document.body.classList.contains('panel-open') ? '›' : '‹';
  });

  close.addEventListener('click', () => {
    document.body.classList.remove('panel-open');
    btn.textContent = '‹';
  });
}

// ── Inloggning (Supabase, e-post/lösenord) ───────────────────────
let currentUser = null;
let authResolve = null;

function isRealUser(user) {
  return !!(user && user.is_anonymous !== true);
}

function syncAuthState(user) {
  const real = isRealUser(user) ? user : null;
  state.user = real;
  state.isLoggedIn = !!real;
  currentUser = real;
  updateAuthUI();
  if (real?.user_metadata?.preferred_language) {
    window.AestimI18n?.applyLanguageFromUserMeta?.(real.user_metadata.preferred_language);
  }
}

function mapAuthError(msg) {
  if (!msg) return str('auth.errGeneric', null, 'Something went wrong. Try again.');
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return str('auth.errInvalidCredentials', null, 'Invalid email or password.');
  if (m.includes('user already registered')) return str('auth.errUserExists', null, 'An account with this email already exists.');
  if (m.includes('email not confirmed')) return str('auth.errEmailNotConfirmed', null, 'Confirm your email before logging in.');
  if (m.includes('password should be at least')) return str('auth.errPasswordWeak', null, 'Password does not meet requirements.');
  if (m.includes('rate limit') || m.includes('too many requests')) return str('auth.errRateLimit', null, 'Too many attempts. Wait and try again.');
  if (m.includes('new email should be different')) return str('auth.errSameEmail', null, 'The new email is the same as the current one.');
  return msg;
}

function setupAuth() {
  document.getElementById('btnActivateCard')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btnOrderCard')?.addEventListener('click', () => {
    showToast(str('common.cardOrderSoon', null, 'Card ordering opens soon.'));
  });
  document.getElementById('btnRegisterLogin')?.addEventListener('click', () =>
    openAuthModal({ panel: 'register', intro: str('auth.requireLoginMarketRegister', null, 'Create an account or log in to list items.') }));
  document.getElementById('btnMyItemsLogin')?.addEventListener('click', () =>
    openAuthModal({ panel: 'login', intro: str('auth.requireLoginMyItems', null, 'Log in to view and publish your items.') }));

  peekSession();
  updateAuthUI();
}

/** Snabb koll av befintlig session i localStorage – laddar inte supabase-js. */
function peekSession() {
  try {
    const raw = localStorage.getItem('sb-vaxtylcqnscnflsucyiv-auth-token');
    if (!raw) return;
    const obj = JSON.parse(raw);
    const u = obj?.user || obj?.currentSession?.user || obj?.[0];
    if (isRealUser(u)) syncAuthState(u);
  } catch (_) {}
}

async function refreshAuth() {
  try {
    const sb = await getSb();
    const { data: { user } } = await sb.auth.getUser();
    if (isRealUser(user)) syncAuthState(user);
    else syncAuthState(null);
  } catch (_) {}
}

/** Säkerställer en riktig (icke-anonym) session. Öppnar annars auth-modalen. */
async function requireRealUser(intro) {
  await refreshAuth();
  if (isRealUser(currentUser)) return currentUser;
  await openAuthModal(typeof intro === 'string'
    ? { panel: 'login', intro }
    : { panel: 'login', intro: str('auth.requireLoginIntro', null, 'Log in to continue.') });
  return isRealUser(currentUser) ? currentUser : null;
}

function afterAuthChange() {
  const reg = document.getElementById('tab-register');
  if (reg && !reg.classList.contains('hidden')) {
    document.getElementById('registerGate').classList.toggle('hidden', state.isLoggedIn);
    document.getElementById('registerForm').classList.toggle('hidden', !state.isLoggedIn);
  }
  const mi = document.getElementById('tab-my-items');
  if (mi && !mi.classList.contains('hidden')) loadMyItems();
}

function updateAuthUI() {
  if (state.isLoggedIn && currentUser) {
    document.getElementById('proGate')?.classList.add('hidden');
    document.getElementById('proContent')?.classList.remove('hidden');
    document.getElementById('topbarGuest')?.classList.add('hidden');
    document.getElementById('topbarAccount')?.classList.remove('hidden');
    const emailEl = document.getElementById('topbarEmail');
    if (emailEl) {
      const name = currentUser.user_metadata?.full_name || currentUser.email || str('auth.loggedInLabel', null, 'Signed in');
      emailEl.textContent = name;
    }
  } else {
    document.getElementById('proGate')?.classList.remove('hidden');
    document.getElementById('proContent')?.classList.add('hidden');
    document.getElementById('topbarGuest')?.classList.remove('hidden');
    document.getElementById('topbarAccount')?.classList.add('hidden');
  }
}

// ── Foton ───────────────────────────────────────────
function setupPhotoUpload() {
  const addBtn   = document.getElementById('addPhotoBtn');
  const photoInput = document.getElementById('photoInput');
  const grid     = document.getElementById('photoGrid');

  addBtn?.addEventListener('click', () => photoInput.click());
  photoInput?.addEventListener('change', e => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (state.listingFiles.length >= 8) return;
      state.listingFiles.push(file);
      const reader = new FileReader();
      reader.onload = ev => {
        const slot = document.createElement('div');
        slot.className = 'photo-slot';
        slot.style.backgroundImage = `url(${ev.target.result})`;
        slot.style.backgroundSize  = 'cover';
        slot.style.backgroundPosition = 'center';
        grid.insertBefore(slot, addBtn);
      };
      reader.readAsDataURL(file);
    });
    photoInput.value = '';
  });
}

/** Tömmer fotouppladdningen (efter att ett objekt sparats). */
function resetPhotoGrid() {
  state.listingFiles = [];
  const grid = document.getElementById('photoGrid');
  grid?.querySelectorAll('.photo-slot:not(.add-photo)').forEach(s => s.remove());
}

// ── Bildup­pladdning för UCI Värdering ──────────────────────────────────────
let _valImageBase64 = null;   // base64-sträng för aktuell värderingsbild

function setupValImage() {
  const addBtn = document.getElementById('valAddPhotoBtn');
  const input  = document.getElementById('valPhotoInput');
  const grid   = document.getElementById('valPhotoGrid');
  if (!addBtn || !input || !grid) return;

  addBtn.addEventListener('click', () => input.click());

  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    // Ta bort eventuell tidigare bild
    grid.querySelectorAll('.photo-slot:not(.add-photo)').forEach(s => s.remove());
    _valImageBase64 = null;

    const reader = new FileReader();
    reader.onload = ev => {
      _valImageBase64 = ev.target.result; // data:image/...;base64,...

      // Visa miniatyr
      const slot = document.createElement('div');
      slot.className = 'photo-slot val-photo-slot';
      slot.style.backgroundImage    = `url(${ev.target.result})`;
      slot.style.backgroundSize     = 'cover';
      slot.style.backgroundPosition = 'center';
      // Klick på miniatyr tar bort bilden
      slot.title = str('uci.removeImage', null, 'Click to remove');
      slot.addEventListener('click', () => {
        slot.remove();
        _valImageBase64 = null;
        input.value = '';
      });
      grid.insertBefore(slot, addBtn);
    };
    reader.readAsDataURL(file);
    input.value = '';
  });
}

// ── UCI-justering ────────────────────────────────────
function setupUciAdjust() {
  document.getElementById('btnAdjustUci')?.addEventListener('click', () => {
    document.getElementById('uciAdjustGroup').classList.toggle('hidden');
  });
}

// ── API-nyckel ───────────────────────────────────────
function setupApiKey() {
  document.getElementById('btnRevealKey')?.addEventListener('click', () => {
    const f = document.getElementById('apiKeyField');
    f.type = f.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('btnCopyKey')?.addEventListener('click', () => {
    navigator.clipboard.writeText('aestim_sk_demo_1234567890abcdef');
    showToast(str('common.apiKeyCopied', null, 'API key copied!'));
  });
}

// ── data-module-knappar ──────────────────────────────
function setupDataModuleLinks() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-module]');
    if (btn && !btn.classList.contains('nav-item')) {
      navigateTo(btn.dataset.module);
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && !tabBtn.classList.contains('tab-btn')) {
      const tabTrigger = document.querySelector(`.market-tabs .tab-btn[data-tab="${tabBtn.dataset.tab}"]`);
      if (tabTrigger) tabTrigger.click();
    }
  });
}

// ── Toast-notis ──────────────────────────────────────
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: var(--green); color: #fff; padding: 0.75rem 1.5rem;
    border-radius: 999px; font-size: 0.95rem; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18); z-index: 999;
    animation: fadeIn 0.2s ease;
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Nyheter ──────────────────────────────────────────
const NEWS_PROXY = IS_LOCAL ? 'http://localhost:3002/api/news' : '/api/news';
const NEWS_TTL_MS = 60 * 60 * 1000; // 1 timme — matchar server-cache
const NEWS_STORAGE_KEY = 'aestimai_news_v1';
let newsCache = {};    // cat → { articles, fetchedAt }
let newsLoaded = false;
let newsPrefetchStarted = false;

function restoreNewsCache() {
  try {
    const raw = sessionStorage.getItem(NEWS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.fetchedAt && Date.now() - parsed.fetchedAt < NEWS_TTL_MS) {
      newsCache = parsed.items || {};
    }
  } catch (_) {}
}

function persistNewsCache() {
  try {
    sessionStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify({
      fetchedAt: Date.now(),
      items: newsCache,
    }));
  } catch (_) {}
}

function setupNews() {
  restoreNewsCache();
  prefetchNews();

  const dateEl = document.getElementById('newsDate');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString(appLocale(), {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  document.querySelectorAll('.news-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.news-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadNews(btn.dataset.cat);
    });
  });
}

/** Förladdar nyheter i bakgrunden — högst 1 gång/timme per session. */
function prefetchNews() {
  if (newsPrefetchStarted) return;
  newsPrefetchStarted = true;
  if (newsCache.all && Date.now() - newsCache.all.fetchedAt < NEWS_TTL_MS) return;
  fetchNewsFromServer('all', { silent: true }).catch(() => {});
}

async function fetchNewsFromServer(cat, opts = {}) {
  const res = await fetch(`${NEWS_PROXY}?cat=${encodeURIComponent(cat)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const fetchedAt = data.cachedAt ? Date.parse(data.cachedAt) : Date.now();
  newsCache[cat] = { articles: data.articles || [], fetchedAt };
  persistNewsCache();
  return newsCache[cat];
}

// Hämta nyheter — anropas första gången modulen visas
async function loadNews(cat = 'all') {
  restoreNewsCache();
  const cached = newsCache[cat];
  if (cached && Date.now() - cached.fetchedAt < NEWS_TTL_MS) {
    renderNews(cached.articles, cat);
    return;
  }

  setNewsLoading(true);

  try {
    const entry = await fetchNewsFromServer(cat);
    renderNews(entry.articles, cat);
  } catch (err) {
    console.warn('[AestimAi news] Proxy inte nåbar — visar demo-innehåll:', err.message);
    setNewsLoading(false);
    filterNewsStatic(cat);
  }
}

function setNewsLoading(on) {
  const main = document.querySelector('.news-main');
  if (!main) return;
  let spinner = document.getElementById('newsSpinner');
  if (on) {
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'newsSpinner';
      spinner.innerHTML = `<div class="news-loading">${str('news.loading', null, 'Loading news…')}</div>`;
      main.prepend(spinner);
    }
  } else {
    spinner?.remove();
  }
}

function renderNews(articles, cat) {
  setNewsLoading(false);
  if (!articles || articles.length === 0) {
    filterNewsStatic(cat);
    return;
  }

  const main = document.querySelector('.news-main');
  if (!main) return;

  // Töm och ersätt med live-innehåll
  main.innerHTML = buildNewsHTML(articles, cat);
  newsLoaded = true;
}

function buildNewsHTML(articles, cat) {
  if (articles.length === 0) return `<div class="news-loading">${str('news.empty', null, 'No articles found for this category.')}</div>`;

  const lead      = articles[0];
  const grid1     = articles.slice(1, 4);
  const feature   = articles[4];
  const grid2     = articles.slice(5, 8);
  const briefs    = articles.slice(8);

  const CAT_LABELS = {
    valuation:      str('news.cat.valuation', null, 'Valuation'),
    energy:         str('news.cat.energy', null, 'Energy'),
    coop:           str('news.cat.coop', null, 'Cooperative'),
    market:         str('news.cat.market', null, 'Market'),
    tech:           str('news.cat.tech', null, 'Fintech'),
    sustainability: str('news.cat.sustainability', null, 'Sustainability'),
    resources:      str('news.cat.resources', null, 'Resources'),
    all:            str('news.cat.all', null, 'News'),
  };
  const label = (a) => {
    const c = a.cat || cat;
    return `<span class="news-section-label ${c}">${CAT_LABELS[c] || CAT_LABELS.all}</span>`;
  };
  const byline = (a) => {
    const time = a.publishedAt ? new Date(a.publishedAt).toLocaleDateString(appLocale()) : '';
    return `<div class="news-byline">
      <span class="news-author">${escHtml(a.source || a.author || str('news.unknownSource', null, 'Unknown source'))}</span>
      ${time ? `<span class="news-dot">·</span><span class="news-time">${time}</span>` : ''}
    </div>`;
  };
  const imgOrPlaceholder = (a, cls) => {
    if (a.urlToImage) {
      return `<img src="${escHtml(a.urlToImage)}" class="news-img-real ${cls}" alt="" loading="lazy" onerror="this.replaceWith(makePlaceholder('${cls}'))">`;
    }
    return `<div class="news-img-placeholder ${cls}"><span class="img-icon">📰</span></div>`;
  };

  let html = '';

  // Ledarartikeln
  html += `<article class="news-lead" data-cat="${lead.cat || cat}" onclick="window.open('${escHtml(lead.url)}','_blank')">
    <div class="news-lead-img">${imgOrPlaceholder(lead, 'news-img-large')}</div>
    <div class="news-lead-body">
      ${label(lead)}
      <h2 class="news-lead-headline">${escHtml(lead.title)}</h2>
      <p class="news-lead-deck">${escHtml(lead.description || '')}</p>
      ${byline(lead)}
    </div>
  </article>
  <hr class="news-divider">`;

  // Grid rad 1
  if (grid1.length) {
    html += `<div class="news-grid-row">`;
    grid1.forEach(a => {
      html += `<article class="news-card" data-cat="${a.cat || cat}" onclick="window.open('${escHtml(a.url)}','_blank')">
        ${imgOrPlaceholder(a, 'news-img-small')}
        <div class="news-card-body">
          ${label(a)}
          <h3 class="news-card-headline">${escHtml(a.title)}</h3>
          ${a.description ? `<p class="news-card-deck">${escHtml(a.description.substring(0, 100))}…</p>` : ''}
          ${byline(a)}
        </div>
      </article>`;
    });
    html += `</div><hr class="news-divider">`;
  }

  // Feature-artikel
  if (feature) {
    html += `<article class="news-feature" data-cat="${feature.cat || cat}" onclick="window.open('${escHtml(feature.url)}','_blank')">
      ${imgOrPlaceholder(feature, 'news-img-medium')}
      <div class="news-feature-body">
        ${label(feature)}
        <h3 class="news-feature-headline">${escHtml(feature.title)}</h3>
        <p class="news-feature-deck">${escHtml(feature.description || '')}</p>
        ${byline(feature)}
      </div>
    </article>
    <hr class="news-divider">`;
  }

  // Grid rad 2
  if (grid2.length) {
    html += `<div class="news-grid-row">`;
    grid2.forEach(a => {
      html += `<article class="news-card" data-cat="${a.cat || cat}" onclick="window.open('${escHtml(a.url)}','_blank')">
        <div class="news-card-body no-img">
          ${label(a)}
          <h3 class="news-card-headline">${escHtml(a.title)}</h3>
          ${byline(a)}
        </div>
      </article>`;
    });
    html += `</div><hr class="news-divider">`;
  }

  // Kortnotiser
  if (briefs.length) {
    html += `<div class="news-briefs"><h4 class="news-briefs-title">Fler nyheter</h4>`;
    briefs.forEach(a => {
      html += `<div class="news-brief-item" data-cat="${a.cat || cat}" onclick="window.open('${escHtml(a.url)}','_blank')" style="cursor:pointer">
        ${label(a)}
        <p><strong>${escHtml(a.source || '')}</strong> — ${escHtml(a.title)}</p>
        <span class="news-time">${a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('sv-SE') : ''}</span>
      </div>`;
    });
    html += `</div>`;
  }

  return html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fallback: filtrera det hårdkodade demo-innehållet
function filterNewsStatic(cat) {
  const articles = document.querySelectorAll('#module-news [data-cat]');
  articles.forEach(el => {
    if (cat === 'all' || el.dataset.cat === cat) {
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  });
  document.querySelectorAll('.news-grid-row').forEach(row => {
    const visible = row.querySelectorAll('[data-cat]:not([hidden])').length;
    row.style.display = visible ? '' : 'none';
  });
  document.querySelectorAll('.news-briefs').forEach(section => {
    const visible = section.querySelectorAll('.news-brief-item:not([hidden])').length;
    section.style.display = visible ? '' : 'none';
  });
}

// ── UCI DASHBOARD ────────────────────────────────────

let dashData   = null;
let uciChart    = null;
let dashLoaded  = false;
let activeRange = '1Y';
let activeCat   = 'currencies';   // default: Valutor

async function loadMarketDashboard() {
  if (dashLoaded) return;
  try {
    const res = await fetch(`${UCI_SERVER}/api/uci/history`);
    dashData  = await res.json();
    dashLoaded = true;
    renderDashboard(dashData, 365);   // stats-korten
  } catch (e) {
    console.warn('[Dashboard] Kunde inte ladda historik:', e.message);
  }
  loadCommentary();

  // Kategori-dropdown
  document.getElementById('dashCatSelect')?.addEventListener('change', onDashCatChange);

  // Tidsintervall-knappar
  document.querySelector('.dash-range-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.range-tab');
    if (!btn) return;
    document.querySelectorAll('.range-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRange = btn.dataset.range;
    loadChartForCat();
  });

  // Starta med default (Valutor, 1Å)
  loadChartForCat();
}

function onDashCatChange() {
  const sel = document.getElementById('dashCatSelect');
  if (sel) activeCat = sel.value;
  loadChartForCat();
}

async function loadChartForCat() {
  const wrap = document.querySelector('.dash-chart-wrap');
  if (wrap) wrap.style.opacity = '0.4';
  try {
    const r    = await fetch(`${UCI_SERVER}/api/uci/assets?cat=${activeCat}&range=${activeRange}`);
    const data = await r.json();
    renderAssetChart(data.labels, data.series);
    renderChartLegend(data.series);
    // Visa datakälla i footern
    const src = document.getElementById('dashLastUpdate');
    if (src) src.textContent = data.source ? `Källa: ${data.source}` : 'Simulerad data';
  } catch (e) {
    console.warn('[Assets] Kunde inte ladda:', e.message);
  }
  if (wrap) wrap.style.opacity = '1';
}

// ── Daglig UCI-kommentar (8 teman) ───────────────────
async function loadCommentary() {
  const grid = document.getElementById('commentaryGrid');
  if (!grid) return;
  try {
    const res  = await fetch(`${UCI_SERVER}/api/uci/commentary`);
    const data = await res.json();
    if (!res.ok || !data.items) throw new Error(data.error || 'inga kommentarer');

    const dateEl = document.getElementById('commentaryDate');
    if (dateEl && data.date) dateEl.textContent = data.date;

    grid.innerHTML = data.items.map(item => `
      <div class="commentary-card">
        <h4 class="commentary-title">${escHtml(item.title)}</h4>
        <p class="commentary-text">${escHtml(item.text)}</p>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="commentary-loading">${str('dash.commentaryUnavailable', null, 'Commentary unavailable right now.')}</div>`;
    console.warn('[Commentary] Kunde inte ladda:', e.message);
  }
}

// Valuta-konfiguration
const CURRENCIES = {
  UCI: { label: 'UCI', decimals: 2, rateKey: 'rateUCI', statsKey: 'UCI' },
  SEK: { label: 'SEK', decimals: 2, rateKey: 'rateSEK', statsKey: 'SEK' },
  EUR: { label: 'EUR', decimals: 2, rateKey: 'rateEUR', statsKey: 'EUR' },
  USD: { label: 'USD', decimals: 2, rateKey: 'rateUSD', statsKey: 'USD' },
  GBP: { label: 'GBP', decimals: 2, rateKey: 'rateGBP', statsKey: 'GBP' },
  NOK: { label: 'NOK', decimals: 2, rateKey: 'rateNOK', statsKey: 'NOK' },
  DKK: { label: 'DKK', decimals: 2, rateKey: 'rateDKK', statsKey: 'DKK' },
  CHF: { label: 'CHF', decimals: 2, rateKey: 'rateCHF', statsKey: 'CHF' },
  JPY: { label: 'JPY', decimals: 1, rateKey: 'rateJPY', statsKey: 'JPY' },
};

// FX mot SEK (för omräkning av cap-värden). UCI = 1 (basenhet — allt annat omräknas via SEK-kursen)
const FX_TO_SEK = { UCI: null, SEK:1, EUR:11.28, USD:10.44, GBP:13.20, NOK:5.89, DKK:1.51, CHF:12.15, JPY:0.069 };

let activeCurrency = 'SEK'; // Diagramkort & nyckeltal (caps använder inställning separat)

function capFxRate(stats, currency) {
  const isUCI = currency === 'UCI';
  const uciRate = stats.current.SEK;
  return isUCI ? uciRate : (FX_TO_SEK[currency] || 1);
}

function formatCapAmount(sek, stats, currency) {
  const cur = CURRENCIES[currency] || CURRENCIES.SEK;
  const fxRate = capFxRate(stats, currency);
  const val = sek / fxRate;
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + ' M' + cur.label;
  if (val >= 1_000)     return (val / 1_000).toFixed(1)     + ' t' + cur.label;
  return val.toFixed(cur.decimals) + ' ' + cur.label;
}

function renderDashboardCaps(stats) {
  const i18n = window.AestimI18n;
  const capCur = i18n?.getCapDisplayCurrency?.() || 'SEK';
  const tag = i18n?.localeTag?.() || 'sv-SE';
  const t = (k) => i18n?.t?.(k) || k;

  setEl('dsSearchCapSEK',   formatCapAmount(stats.searchCap || 0, stats, capCur));
  setEl('dsVerifiedCapSEK', formatCapAmount(stats.verifiedCap || 0, stats, capCur));
  setEl('dsSearchCapCount',  (stats.totalSearches || 0).toLocaleString(tag) + ' ' + t('dash.valuations'));
  setEl('dsVerifiedCapCount', (stats.totalVerified || 0).toLocaleString(tag) + ' ' + t('dash.transactions'));
  i18n?.applyTranslations?.();
}

function refreshDashboardCaps() {
  if (!dashData?.stats) return;
  renderDashboardCaps(dashData.stats);
}

function renderDashboard({ history, stats }, days) {
  // Stats-korten använder alltid SEK
  const slice = days === -1 ? history
              : days === 0  ? history.filter(h => h.date >= `${new Date().getFullYear()}-01-01`)
              : history.slice(-days);

  const cur      = CURRENCIES[activeCurrency] || CURRENCIES.SEK;
  const isUCI    = activeCurrency === 'UCI';
  const sign     = v => v >= 0 ? '+' : '';
  const fmt      = (v, d = cur.decimals) => v.toFixed(d);
  // UCI-läge: allt uttrycks i antal UCI-enheter (SEK-värde / aktuell UCI-kurs)
  const uciRate  = stats.current.SEK;  // SEK per 1 UCI
  const curRate  = isUCI ? 1 : stats.current[cur.statsKey];
  const fxRate   = isUCI ? uciRate : (FX_TO_SEK[activeCurrency] || 1);

  // Ticker (alltid SEK i tickern)
  setEl('dtSEK',   stats.current.SEK.toFixed(2));
  setEl('dtEUR',   stats.current.EUR.toFixed(2));
  setEl('dtUSD',   stats.current.USD.toFixed(2));
  setEl('dtGBP',   stats.current.GBP.toFixed(2));
  setEl('dtNOK',   stats.current.NOK.toFixed(2));
  setEl('dtCHF',   stats.current.CHF.toFixed(2));
  setEl('dtVol',   stats.volatility30d + '%');

  const chg24El = document.getElementById('dtChg24h');
  if (chg24El) {
    chg24El.textContent = `${sign(stats.change24h)}${stats.change24h.toFixed(2)}%`;
    chg24El.className   = 'dash-tick-chg ' + (stats.change24h >= 0 ? 'pos' : 'neg');
  }

  // Stor prislapp — i vald valuta
  setEl('dashPriceBig', fmt(curRate));
  setEl('dashPriceCurrency', cur.label + ' / UCI');
  const chgEl = document.getElementById('dashPriceChange');
  if (chgEl) {
    const prevSEK = history[history.length - 2]?.rateSEK || stats.current.SEK;
    const prevCur = prevSEK / fxRate;
    const abs = (curRate - prevCur).toFixed(cur.decimals);
    chgEl.textContent = `${sign(stats.change24h)}${abs} (${sign(stats.change24h)}${stats.change24h.toFixed(2)}%) idag`;
    chgEl.className   = 'dash-price-change ' + (stats.change24h >= 0 ? 'pos' : 'neg');
  }

  // Nyckeltal — procentförändringar är valutaoberoende
  const statFmt = v => `${sign(v)}${v.toFixed(2)}%`;
  setEl('dsStat24h',    statFmt(stats.change24h), stats.change24h >= 0 ? 'pos' : 'neg');
  setEl('dsStat7d',     statFmt(stats.change7d),  stats.change7d  >= 0 ? 'pos' : 'neg');
  setEl('dsStat30d',    statFmt(stats.change30d), stats.change30d >= 0 ? 'pos' : 'neg');
  setEl('dsStatYTD',    statFmt(stats.changeYTD), stats.changeYTD >= 0 ? 'pos' : 'neg');
  // High/Low/ATH i vald valuta
  const toC = sek => (sek / fxRate).toFixed(cur.decimals);
  setEl('dsHigh',       toC(stats.high52w)     + ' ' + cur.label);
  setEl('dsLow',        toC(stats.low52w)      + ' ' + cur.label);
  setEl('dsATH',        toC(stats.allTimeHigh) + ' ' + cur.label);
  setEl('dsVolatility', stats.volatility30d + '%');
  setEl('dsVolumeToday',  str('dash.unitCount', { n: stats.volumeToday }, String(stats.volumeToday)));
  setEl('dsVolumeTotal',  str('dash.unitCount', { n: stats.volumeTotal }, String(stats.volumeTotal)));
  setEl('dsSurveys',    str('dash.surveysActive', { n: stats.activeSurveys }, String(stats.activeSurveys)));

  // Search Cap & Verified Cap — visningsvaluta från Inställningar (ej diagrammet)
  renderDashboardCaps(stats);

  setEl('dashLastUpdate', str('dash.updated', { date: new Date().toLocaleString(appLocale()) }, 'Updated: ' + new Date().toLocaleString(appLocale())));

  // Valutatabell — markera aktiv rad
  const currencies = [
    { pair: 'UCI',     val: 1,                  c24: 0,               c7: 0,               code: 'UCI', isBase: true },
    { pair: 'UCI/SEK', val: stats.current.SEK,  c24: stats.change24h, c7: stats.change7d,  code: 'SEK' },
    { pair: 'UCI/EUR', val: stats.current.EUR,  c24: stats.change24h, c7: stats.change7d,  code: 'EUR' },
    { pair: 'UCI/USD', val: stats.current.USD,  c24: stats.change24h, c7: stats.change7d,  code: 'USD' },
    { pair: 'UCI/GBP', val: stats.current.GBP,  c24: stats.change24h, c7: stats.change7d,  code: 'GBP' },
    { pair: 'UCI/NOK', val: stats.current.NOK,  c24: stats.change24h, c7: stats.change7d,  code: 'NOK' },
    { pair: 'UCI/DKK', val: stats.current.DKK,  c24: stats.change24h, c7: stats.change7d,  code: 'DKK' },
    { pair: 'UCI/CHF', val: stats.current.CHF,  c24: stats.change24h, c7: stats.change7d,  code: 'CHF' },
    { pair: 'UCI/JPY', val: stats.current.JPY,  c24: stats.change24h, c7: stats.change7d,  code: 'JPY' },
  ];
  const tbody = document.getElementById('dashFxTable');
  if (tbody) {
    tbody.innerHTML = currencies.map(c => `
      <tr class="${c.code === activeCurrency ? 'fx-row-active' : ''}">
        <td class="fx-pair">${c.pair}</td>
        <td class="fx-val">${c.val.toFixed(c.pair.includes('JPY') ? 1 : 2)}</td>
        <td class="fx-chg ${c.c24 >= 0 ? 'pos' : 'neg'}">${sign(c.c24)}${c.c24.toFixed(2)}%</td>
        <td class="fx-chg ${c.c7  >= 0 ? 'pos' : 'neg'}">${sign(c.c7)}${c.c7.toFixed(2)}%</td>
      </tr>`).join('');
  }

}

function setEl(id, text, colorClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (colorClass) el.className = el.className.replace(/\bpos\b|\bneg\b/g, '') + ' ' + colorClass;
}

// ── Gemensamma Chart.js-inställningar ─────────────────
function chartBaseOptions(labels) {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    // nearest utan axis = Euclidean avstånd → bara närmaste serie visas
    interaction: { mode: 'nearest', intersect: false },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid:  { color: 'rgba(255,255,255,0.07)', drawTicks: false },
        ticks: {
          color: '#888780', maxTicksLimit: 8, maxRotation: 0,
          callback: (_, i, arr) => {
            if (i === 0 || i === arr.length - 1 || i % Math.ceil(arr.length / 6) === 0)
              return labels[i];
          },
        },
        border: { display: false },
      },
      y: {
        position: 'right',
        grid:     { color: 'rgba(255,255,255,0.07)' },
        border:   { display: false },
        ticks:    { color: '#888780' },
      },
    },
  };
}

// Multi-serie asset-diagram (indexerat till 100) — UCI-linjen alltid platt vid 100
function renderAssetChart(labels, series) {
  const ctx = document.getElementById('uciChart');
  if (!ctx) return;
  if (uciChart) uciChart.destroy();

  const opts = chartBaseOptions(labels);
  opts.plugins.tooltip = {
    backgroundColor: '#111210',
    titleColor:      '#fff',
    bodyColor:       'rgba(255,255,255,0.85)',
    padding:         10,
    filter: item => item.dataset.label !== '⊙ UCI (referens)',
    callbacks: {
      title: items => items.length ? items[0].label : '',
      label: item => ` ${item.dataset.label}: ${Number(item.raw).toFixed(1)}`,
    },
  };
  opts.scales.y.ticks.callback = v => v.toFixed(0);

  const datasets = series.map(s => ({
    label:            s.label,
    data:             s.data,
    borderColor:      s.color,
    borderWidth:      1.8,
    pointRadius:      0,
    pointHoverRadius: 4,
    fill:             false,
    tension:          0.25,
    order: 2,
  }));

  // UCI = konstant referenslinje vid 100. Det är "metern" — rör sig aldrig.
  datasets.push({
    label:            '⊙ UCI (referens)',
    data:             labels.map(() => 100),
    borderColor:      'rgba(0,0,0,0.35)',
    borderWidth:      2,
    borderDash:       [7, 4],
    pointRadius:      0,
    pointHoverRadius: 0,
    hoverBorderWidth: 0,
    fill:             false,
    tension:          0,
    order: 1,
  });

  uciChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: opts,
  });
}

// Förklaring (legend) under diagrammet
function renderChartLegend(series) {
  const el = document.getElementById('chartLegend');
  if (!el) return;
  if (!series || series.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = series.map(s =>
    `<span class="legend-item">
       <span class="legend-dot" style="background:${s.color}"></span>
       <span class="legend-label">${s.label}</span>
     </span>`
  ).join('') +
  `<span class="legend-item legend-ref">
     <span class="legend-dash"></span>
     <span class="legend-label">${str('dash.chartLegendRef', null, '⊙ UCI (reference = 100)')}</span>
   </span>`;
}

// ════════════════════════════════════════════════════
//  UCI BYTESMARKNAD
// ════════════════════════════════════════════════════

function mtr(key, vars, fb) {
  let s = window.AestimI18n?.t?.(key) || fb || key;
  if (vars && s) {
    Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
  }
  return s;
}

function translateMarketCategory(cat) {
  if (!cat) return '';
  const key = window.MARKET_CAT_I18N_KEYS?.[cat];
  return key ? mtr(key, null, cat) : cat;
}

function marketCondLabel(n) {
  return mtr(`uci.cond${n}`, null, COND_LABELS[n]);
}

function marketLocaleTag() {
  return window.AestimI18n?.localeTag?.() || 'en-US';
}

// Kategorifilter (sök) → synonymer i de fritextkategorier som sparas på objekt.
const CAT_SYNONYMS = {
  vardagssaker: ['vardagssaker', 'vardag'],
  verktyg:      ['verktyg'],
  elektronik:   ['elektronik'],
  'kläder':     ['kläder', 'klader'],
  'möbler':     ['möbler', 'mobler'],
  fordon:       ['fordon'],
  fastigheter:  ['fastighet', 'nyttjanderätt'],
  metaller:     ['metall'],
  juveler:      ['juvel'],
  energi:       ['energi'],
  ip:           ['immateriell', 'rättighet'],
  'tjänster':   ['tjänst', 'tid'],
  tokeniserade: ['token'],
};

const COND_LABELS = { 1: '1 — Poor', 2: '2 — Worn', 3: '3 — OK', 4: '4 — Good', 5: '5 — Excellent' };

function categoryMatches(rowCat, filterVal) {
  if (!filterVal) return true;
  const c = String(rowCat || '').toLowerCase();
  const syns = CAT_SYNONYMS[filterVal] || [filterVal];
  return syns.some(s => c.includes(s));
}

/** Normaliserar en databasrad till de fält marknadsvyn behöver. */
function listingView(row) {
  const od = row.object_data || {};
  const r  = row.result || {};
  const mk = row.marketplace || {};
  const uciRaw = r.uci_value;
  const uci = (uciRaw === null || uciRaw === undefined || uciRaw === '') ? null : Number(uciRaw);
  const condRaw = od.condition;
  return {
    id:        row.id,
    kind:      row.kind || 'offer',
    title:     mk.title || od.title || (od.description ? String(od.description).slice(0, 60) : mtr('market.defaultTitle', null, 'Item')),
    category:  od.category || '',
    location:  mk.location || '',
    uci:       (uci !== null && !isNaN(uci)) ? uci : null,
    condition: condRaw != null ? (marketCondLabel(condRaw) || condRaw) : '',
    image:     (Array.isArray(mk.images) && mk.images[0]) || row.image_url || '',
    verified:  !!mk.is_verified,
    desc:      od.description || '',
  };
}

// ── Sök / bläddra ───────────────────────────────────
async function searchMarket() {
  const grid = document.getElementById('marketGrid');
  const countEl = document.getElementById('marketCount');
  if (!grid) return;
  grid.innerHTML = `<div class="market-loading">${mtr('market.loading', null, 'Loading marketplace…')}</div>`;

  const text     = document.getElementById('marketSearch')?.value.trim() || '';
  const cat      = document.getElementById('marketCatFilter')?.value || '';
  const kind     = document.getElementById('marketKindFilter')?.value || '';
  const uciMin   = parseFloat(document.getElementById('uciMin')?.value);
  const uciMax   = parseFloat(document.getElementById('uciMax')?.value);
  const verified = document.getElementById('filterVerified')?.checked;

  try {
    const sb = await getSb();
    let q = sb.from('aestimai_valuations')
      .select('id,object_data,result,marketplace,kind,image_url,created_at,published_at')
      .eq('is_public', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (kind) q = q.eq('kind', kind);
    if (text) q = q.textSearch('search', text, { type: 'websearch', config: 'swedish' });

    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map(listingView);
    if (cat)               rows = rows.filter(v => categoryMatches(v.category, cat));
    if (!isNaN(uciMin))    rows = rows.filter(v => v.uci != null && v.uci >= uciMin);
    if (!isNaN(uciMax))    rows = rows.filter(v => v.uci != null && v.uci <= uciMax);
    if (verified)          rows = rows.filter(v => v.verified);

    if (countEl) countEl.textContent = mtr('market.count', { n: rows.length }, `${rows.length} items`);

    if (!rows.length) {
      grid.innerHTML = `<div class="market-empty">${mtr('market.empty', null, 'No public listings match.')}</div>`;
      return;
    }
    grid.innerHTML = rows.map(marketCardHTML).join('');
  } catch (e) {
    console.warn('[market] sök misslyckades:', e?.message);
    grid.innerHTML = `<div class="market-error">${mtr('market.errorLoad', { msg: escHtml(e?.message || mtr('market.unknownError', null, 'unknown error')) }, 'Could not load marketplace.')}</div>`;
  }
}

function marketCardHTML(v) {
  const img = v.image
    ? `<div class="card-image" style="background-image:url('${escHtml(v.image)}')"></div>`
    : '<div class="card-image placeholder-img">📷</div>';
  const kindLabel = v.kind === 'wanted'
    ? mtr('market.kindWanted', null, 'Wanted')
    : mtr('market.kindOffer', null, 'Offered');
  const catLabel = translateMarketCategory(v.category);
  const locale = marketLocaleTag();
  return `<div class="market-card" data-id="${escHtml(v.id)}">
    <a class="card-image-link" href="/m/${escHtml(v.id)}">${img}</a>
    <div class="card-body">
      <span class="card-kind kind-${escHtml(v.kind)}">${kindLabel}</span>
      <h3><a href="/m/${escHtml(v.id)}">${escHtml(v.title)}</a></h3>
      <p class="card-cat">${escHtml(catLabel)}${v.location ? ' · ' + escHtml(v.location) : ''}</p>
      <div class="card-uci">
        <span class="uci-badge">${v.uci != null ? v.uci.toLocaleString(locale) + ' UCI' : '— UCI'}</span>
        ${v.verified ? '<span class="card-verified">✓ AE ID</span>' : ''}
      </div>
      ${v.condition ? `<p class="card-condition">${mtr('market.condition', null, 'Condition:')} ${escHtml(v.condition)}</p>` : ''}
      <button class="btn-secondary btn-contact" data-id="${escHtml(v.id)}" data-title="${escHtml(v.title)}">${mtr('market.contact', null, 'Contact')}</button>
    </div>
  </div>`;
}

// ── Registrera objekt ───────────────────────────────
async function fetchValuation(input) {
  try {
    const res = await fetch(`${UCI_SERVER}/api/uci/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        language: window.AestimI18n?.getLanguage?.() || 'en',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API-fel');
    return data;
  } catch (e) {
    console.warn('[market] värdering:', e?.message);
    return null;
  }
}

async function valueListing() {
  const desc      = document.getElementById('itemDesc').value.trim();
  const category  = document.getElementById('itemCategory').value;
  const condition = parseInt(document.getElementById('itemCondition').value) || 3;
  if (!desc) { showToast(mtr('market.toastNeedDesc', null, 'Write a description first.')); return; }

  const btn = document.getElementById('btnValueListing');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = mtr('market.toastValuating', null, 'Valuating…');
  const data = await fetchValuation({ description: desc, category, condition });
  btn.disabled = false; btn.textContent = orig;

  if (data && data.uci_value != null) {
    state.listingValuation = data;
    document.getElementById('uciAutoValue').textContent = Number(data.uci_value).toLocaleString(marketLocaleTag());
  } else {
    showToast(mtr('market.toastValuationFailed', null, 'AI valuation failed.'));
  }
}

async function uploadListingImages(userId) {
  const files = state.listingFiles || [];
  if (!files.length) return [];
  const sb = await getSb();
  const urls = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from('listing-images')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) { console.warn('[market] bilduppladdning:', error.message); continue; }
    const { data } = sb.storage.from('listing-images').getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
}

// ── Bytesmarknad — annonsgränser & betalning ───────────
const LISTING_LIMITS = { free: 1, pro: 50, enterprise: Infinity };

const PLAN_LABELS = { free: 'Freemium', pro: 'Pro', enterprise: 'Enterprise' };

function getUserPlan(user) {
  return user?.user_metadata?.plan || 'free';
}

function planDisplayName(plan) {
  const key = { free: 'account.planFree', pro: 'account.planPro', enterprise: 'account.planEnterprise' }[plan];
  return key ? str(key, null, PLAN_LABELS[plan] || PLAN_LABELS.free) : PLAN_LABELS.free;
}

function listingLimitForPlan(plan) {
  return LISTING_LIMITS[plan] ?? LISTING_LIMITS.free;
}

function extraListingConfirmMessage(user) {
  const plan = getUserPlan(user);
  const limit = listingLimitForPlan(plan);
  const label = planDisplayName(plan);
  if (limit === 1) {
    return mtr('market.confirmExtraListingOne', { plan: label }, `${label} includes 1 active listing. Publishing costs €1.`);
  }
  return mtr('market.confirmExtraListingMany', { plan: label, limit }, `${label} includes ${limit} active listings. Publishing costs €1.`);
}

async function countPublicListings(userId) {
  const sb = await getSb();
  const { count, error } = await sb
    .from('aestimai_valuations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_public', true);
  if (error) throw error;
  return count || 0;
}

async function needsExtraListingPayment(user, additionalPublic = 1) {
  const limit = listingLimitForPlan(getUserPlan(user));
  if (!Number.isFinite(limit)) return false;
  const current = await countPublicListings(user.id);
  return (current + additionalPublic) > limit;
}

async function refreshListingQuotaHint() {
  const hint = document.getElementById('listingQuotaHint');
  const btn  = document.getElementById('btnPublishListing');
  const publishNow = document.getElementById('publishNow');
  if (!hint || !btn) return;

  await refreshAuth();
  if (!isRealUser(state.user)) {
    hint.classList.add('hidden');
    btn.textContent = mtr('market.btnSave', null, 'Save item');
    return;
  }

  try {
    const limit = listingLimitForPlan(getUserPlan(state.user));
    const used  = await countPublicListings(state.user.id);
    const publishChecked = publishNow?.checked !== false;
    const suffix = limit === 1
      ? mtr('market.quotaSuffixOne', null, '')
      : mtr('market.quotaSuffixMany', null, 's');

    if (!Number.isFinite(limit)) {
      hint.classList.add('hidden');
      btn.textContent = mtr('market.btnSave', null, 'Save item');
      return;
    }

    if (used >= limit) {
      hint.innerHTML = mtr('market.quotaAtLimit', { used, limit, suffix }, `You have ${used}/${limit} active listings. Next costs €1.`);
      hint.classList.remove('hidden');
      btn.textContent = publishChecked
        ? mtr('market.btnPayPublish', null, 'Pay €1 and publish')
        : mtr('market.btnSave', null, 'Save item');
    } else if (publishChecked && used + 1 > limit) {
      hint.innerHTML = mtr('market.quotaExtra', null, 'Extra publication — €1 on publish.');
      hint.classList.remove('hidden');
      btn.textContent = mtr('market.btnPayPublish', null, 'Pay €1 and publish');
    } else {
      const label = planDisplayName(getUserPlan(state.user));
      const extra = limit === 1 ? mtr('market.quotaExtraNote', null, '') : '';
      hint.innerHTML = mtr('market.quotaIncluded', { plan: label, used, limit, suffix, extra }, `${label}: ${used}/${limit} included.`);
      hint.classList.remove('hidden');
      btn.textContent = publishChecked
        ? mtr('market.btnSavePublish', null, 'Save and publish')
        : mtr('market.btnSave', null, 'Save item');
    }
  } catch (_) {
    hint.classList.add('hidden');
    btn.textContent = mtr('market.btnSave', null, 'Save item');
  }
}
window.refreshListingQuotaHint = refreshListingQuotaHint;

async function startListingCheckout(listingId) {
  const sb = await getSb();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) {
    showToast(str('common.sessionExpired', null, 'Your session has expired. Log in again.'));
    openAuthModal('login');
    return false;
  }

  const res = await fetch('/api/market/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ listingId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    showToast(data.error || str('common.paymentStartFailed', null, 'Could not start payment.'));
    return false;
  }
  window.location.href = data.url;
  return true;
}

async function confirmListingPayment(sessionId, listingId) {
  try {
    const sb = await getSb();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error(str('common.loginRequired', null, 'Login required'));

    const res = await fetch('/api/market/confirm-listing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ sessionId, listingId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || str('common.confirmFailed', null, 'Confirmation failed'));

    showToast(str('common.paymentConfirmedListing', null, 'Payment received — listing published!'));
    marketLoaded = false;
    switchMarketTab('my-items');
    loadMyItems();
  } catch (e) {
    showToast(e?.message || str('common.paymentConfirmFailed', null, 'Could not confirm payment.'));
  }
}

function cleanCheckoutQuery(hash) {
  const params = new URLSearchParams(window.location.search);
  params.delete('checkout');
  params.delete('listing');
  params.delete('session_id');
  const q = params.toString();
  history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + hash);
}

async function handleListingCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  const listingId = params.get('listing');
  if (!checkout || !listingId) return;

  if (checkout === 'listing-success') {
    const sessionId = params.get('session_id');
    if (sessionId) await confirmListingPayment(sessionId, listingId);
  } else if (checkout === 'listing-cancel') {
    showToast(str('common.paymentCancelledListing', null, 'Payment cancelled — item saved without publishing.'));
    switchMarketTab('my-items');
  }

  cleanCheckoutQuery('#market');
  navigateTo('market');
}

async function startProCheckout() {
  const sb = await getSb();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) {
    showToast(str('common.sessionExpired', null, 'Your session has expired. Log in again.'));
    openAuthModal('login');
    return false;
  }

  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    showToast(data.error || str('common.proPaymentStartFailed', null, 'Could not start Pro payment.'));
    return false;
  }
  window.location.href = data.url;
  return true;
}

async function confirmProPayment(sessionId) {
  const sb = await getSb();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error(str('common.loginRequired', null, 'Login required'));

  const res = await fetch('/api/billing/confirm-pro', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || str('common.confirmFailed', null, 'Confirmation failed'));

  await sb.auth.refreshSession();
  const { data: { user } } = await sb.auth.getUser();
  if (user) onSignIn(user);
}

async function openBillingPortal() {
  const sb = await getSb();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) {
    openAuthModal('login');
    return;
  }

  const res = await fetch('/api/billing/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    showToast(data.error || str('common.billingPortalFailed', null, 'Could not open billing portal.'));
    return;
  }
  window.location.href = data.url;
}

async function handleProCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  if (checkout !== 'pro-success' && checkout !== 'pro-cancel') return;

  if (checkout === 'pro-success') {
    const sessionId = params.get('session_id');
    if (sessionId) {
      try {
        await confirmProPayment(sessionId);
        showToast(str('common.proWelcome', null, 'Welcome to AestimAi Pro!'));
      } catch (e) {
        showToast(e?.message || str('common.proActivateFailed', null, 'Could not activate Pro subscription.'));
      }
    }
  } else {
    showToast(str('common.proUpgradeCancelled', null, 'Pro upgrade cancelled.'));
  }

  cleanCheckoutQuery('#pricing');
  navigateTo('pricing');
}

async function submitListing() {
  const user = await requireRealUser(str('auth.requireLoginSaveItem', null, 'Log in to register and save items.'));
  if (!isRealUser(user)) return;

  const kind      = document.getElementById('itemKind').value || 'offer';
  const title     = document.getElementById('itemTitle').value.trim();
  const desc      = document.getElementById('itemDesc').value.trim();
  const category  = document.getElementById('itemCategory').value;
  const condition = parseInt(document.getElementById('itemCondition').value) || 3;
  const location  = document.getElementById('itemLocation').value.trim();
  const manualUci = parseFloat(document.getElementById('itemUciPrice').value);
  const publishNow = document.getElementById('publishNow').checked;

  if (!title) { showToast(mtr('market.toastNeedTitle', null, 'Enter a title.')); document.getElementById('itemTitle').focus(); return; }
  if (!desc)  { showToast(mtr('market.toastNeedDescFull', null, 'Describe the item or service.')); document.getElementById('itemDesc').focus(); return; }

  const btn = document.getElementById('btnPublishListing');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = mtr('market.toastSaving', null, 'Saving…');

  try {
    // Värdering: använd cachad AI-värdering, hämta ny, eller manuellt värde.
    let result = state.listingValuation;
    if (!result) result = await fetchValuation({ description: desc, category, condition });
    if (!result) result = {};
    if (!isNaN(manualUci)) result = { ...result, uci_value: manualUci };

    let images = [];
    try { images = await uploadListingImages(user.id); }
    catch (e) { console.warn('[market] bilder:', e?.message); }

    const object_data = { description: desc, category, condition, title };
    const marketplace = { title };
    if (location)      marketplace.location = location;
    if (images.length) marketplace.images = images;

    const needsPay = publishNow && await needsExtraListingPayment(user, 1);

    const row = {
      user_id:      user.id,
      object_data,
      result,
      source:       'manual',
      kind,
      marketplace,
      is_public:    publishNow && !needsPay,
      published_at: publishNow && !needsPay ? new Date().toISOString() : null,
      image_url:    images[0] || null,
    };

    const sb = await getSb();
    const { data: inserted, error } = await sb
      .from('aestimai_valuations')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;

    if (needsPay) {
      showToast(mtr('market.toastSavedPay', null, 'Item saved — redirecting to payment…'));
      resetRegisterForm();
      await startListingCheckout(inserted.id);
      return;
    }

    showToast(publishNow
      ? mtr('market.toastPublished', null, 'Published on marketplace!')
      : mtr('market.toastSaved', null, 'Saved under My items.'));
    resetRegisterForm();
    switchMarketTab('my-items');
  } catch (e) {
    showToast(mtr('market.toastUpdateFailed', { msg: e?.message || mtr('market.unknownError', null, 'unknown error') }, 'Could not save.'));
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function resetRegisterForm() {
  ['itemTitle', 'itemDesc', 'itemLocation', 'itemUciPrice'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('uciAutoValue').textContent = '—';
  state.listingValuation = null;
  resetPhotoGrid();
}

/** Aktiverar en marknadstabb programmatiskt (klickar på dess knapp). */
function switchMarketTab(tab) {
  const btn = document.querySelector(`.market-tabs .tab-btn[data-tab="${tab}"]`);
  if (btn) btn.click();
}

// ── Mina objekt ─────────────────────────────────────
async function loadMyItems() {
  const container = document.getElementById('myItemsContent');
  if (!container) return;
  container.innerHTML = `<div class="market-loading">${mtr('market.myItemsLoading', null, 'Loading your items…')}</div>`;

  await refreshAuth();
  if (!isRealUser(state.user)) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⇄</div>
        <h2>${mtr('market.myItemsLoginTitle', null, 'Log in to see your items')}</h2>
        <p>${mtr('market.myItemsLoginDesc', null, '')}</p>
        <button class="btn-primary" id="btnMyItemsLogin2">${mtr('market.loginRegisterBtn', null, 'Log in / Create account')}</button>
      </div>`;
    document.getElementById('btnMyItemsLogin2')?.addEventListener('click', async () => {
      const ok = await openAuthModal({ intro: mtr('market.myItemsLoginDesc', null, '') });
      if (ok) loadMyItems();
    });
    return;
  }

  try {
    const sb = await getSb();
    const { data, error } = await sb.from('aestimai_valuations')
      .select('id,object_data,result,marketplace,kind,is_public,image_url,created_at,published_at')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    if (!data.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⇄</div>
          <h2>${mtr('market.myItemsEmptyTitle', null, 'No items yet')}</h2>
          <p>${mtr('market.myItemsEmptyDesc', null, '')}</p>
          <button class="btn-primary" id="btnGoRegister">${mtr('market.btnRegisterItem', null, 'Register item')}</button>
        </div>`;
      document.getElementById('btnGoRegister')?.addEventListener('click', () => switchMarketTab('register'));
      return;
    }

    const header = `<div class="my-items-header"><h2>${mtr('market.myItemsHeaderTitle', null, 'My items')}</h2>
      <p>${mtr('market.myItemsHeaderDesc', null, '')}</p></div>`;
    container.innerHTML = header + '<div class="my-items-list">' + data.map(myItemRowHTML).join('') + '</div>';
  } catch (e) {
    container.innerHTML = `<div class="market-error">${mtr('market.myItemsError', { msg: escHtml(e?.message || mtr('market.unknownError', null, 'unknown error')) }, 'Could not load items.')}</div>`;
  }
}

function myItemRowHTML(row) {
  const v = listingView(row);
  const pub = !!row.is_public;
  const locale = marketLocaleTag();
  const dateStr = row.created_at
    ? new Date(row.created_at).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const catLabel = translateMarketCategory(v.category);
  return `<div class="my-item" data-id="${escHtml(row.id)}">
    <div class="my-item-info">
      <h3>${escHtml(v.title)}</h3>
      <p class="card-cat">${escHtml(catLabel)}${v.uci != null ? ' · ' + v.uci.toLocaleString(locale) + ' UCI' : ''}</p>
      ${dateStr ? `<p class="my-item-date">${mtr('market.valuedOn', { date: escHtml(dateStr) }, `Valued ${dateStr}`)}</p>` : ''}
      <span class="status-pill ${pub ? 'pill-public' : 'pill-private'}">${pub ? mtr('market.statusPublic', null, 'Public') : mtr('market.statusPrivate', null, 'Not public')}</span>
    </div>
    <div class="my-item-actions">
      <select class="mi-kind" data-id="${escHtml(row.id)}">
        <option value="offer"${v.kind === 'offer' ? ' selected' : ''}>${mtr('market.kindOffer', null, 'Offered')}</option>
        <option value="wanted"${v.kind === 'wanted' ? ' selected' : ''}>${mtr('market.kindWanted', null, 'Wanted')}</option>
      </select>
      <button class="btn-primary mi-toggle" data-id="${escHtml(row.id)}" data-public="${pub ? '1' : '0'}">${pub ? mtr('market.btnHide', null, 'Hide') : mtr('market.btnShow', null, 'Show on marketplace')}</button>
      ${pub ? `<a class="btn-text" href="/m/${escHtml(row.id)}" target="_blank" rel="noopener">${mtr('market.btnViewPage', null, 'View page')}</a>` : ''}
      <button class="btn-text mi-delete" data-id="${escHtml(row.id)}">${mtr('market.btnDelete', null, 'Delete')}</button>
    </div>
  </div>`;
}

async function toggleMyItem(id, makePublic) {
  const kindSel = document.querySelector(`.mi-kind[data-id="${id}"]`);
  const kind = kindSel ? kindSel.value : 'offer';

  if (makePublic) {
    await refreshAuth();
    if (!isRealUser(state.user)) return;
    if (await needsExtraListingPayment(state.user, 1)) {
      const ok = window.confirm(extraListingConfirmMessage(state.user));
      if (!ok) return;
      await startListingCheckout(id);
      return;
    }
  }

  const patch = { is_public: makePublic, kind };
  if (makePublic) patch.published_at = new Date().toISOString();
  try {
    const sb = await getSb();
    const { error } = await sb.from('aestimai_valuations').update(patch).eq('id', id);
    if (error) throw error;
    showToast(makePublic
      ? mtr('market.toastPublishedShort', null, 'Published on marketplace!')
      : mtr('market.toastHidden', null, 'Hidden from marketplace.'));
    marketLoaded = false;
    loadMyItems();
  } catch (e) {
    showToast(mtr('market.toastUpdateFailed', { msg: e?.message || mtr('market.unknownError', null, 'unknown error') }, 'Could not update.'));
  }
}

async function deleteMyItem(id) {
  if (!window.confirm(mtr('market.confirmDelete', null, 'Delete this item permanently?'))) return;
  try {
    const sb = await getSb();
    const { error } = await sb.from('aestimai_valuations').delete().eq('id', id);
    if (error) throw error;
    showToast(mtr('market.toastDeleted', null, 'Item deleted.'));
    loadMyItems();
  } catch (e) {
    showToast(mtr('market.toastDeleteFailed', { msg: e?.message || mtr('market.unknownError', null, 'unknown error') }, 'Could not delete.'));
  }
}

// ── Kontaktformulär ─────────────────────────────────
let contactCtx = null;

function openContactModal(id, title) {
  contactCtx = { id, title };
  document.getElementById('contactItem').textContent = title || str('listing.defaultItem', null, 'the item');
  ['contactName', 'contactEmail', 'contactMessage', 'contactCompany'].forEach(i => {
    const el = document.getElementById(i); if (el) el.value = '';
  });
  document.getElementById('contactError').classList.add('hidden');
  document.getElementById('contactModalOverlay').classList.remove('hidden');
}

function closeContactModal() {
  document.getElementById('contactModalOverlay').classList.add('hidden');
}

async function sendContact() {
  const name    = document.getElementById('contactName').value.trim();
  const email   = document.getElementById('contactEmail').value.trim();
  const message = document.getElementById('contactMessage').value.trim();
  const hp      = document.getElementById('contactCompany').value;   // honeypot
  const errEl   = document.getElementById('contactError');

  if (!email || !message) {
    errEl.textContent = str('listing.errRequired', null, 'Enter your email and a message.');
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btnSendContact');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = str('listing.btnSending', null, 'Sending…');
  try {
    const res = await fetch('/api/market/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: contactCtx?.id, fromEmail: email, name, message, hp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || str('listing.errSendFailed', null, 'Could not send the message.'));
    closeContactModal();
    showToast(str('listing.toastSent', null, 'Message sent to the seller!'));
  } catch (e) {
    errEl.textContent = e?.message || str('listing.errGeneric', null, 'Something went wrong.');
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

// ── Marknadens evenemang ────────────────────────────
function setupMarketplace() {
  document.getElementById('btnMarketSearch')?.addEventListener('click', searchMarket);
  document.getElementById('marketSearch')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchMarket();
  });
  ['marketCatFilter', 'marketKindFilter', 'filterVerified'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', searchMarket);
  });

  document.getElementById('btnValueListing')?.addEventListener('click', valueListing);
  document.getElementById('btnPublishListing')?.addEventListener('click', submitListing);
  document.getElementById('publishNow')?.addEventListener('change', refreshListingQuotaHint);

  // Kontakt via kort (delegering)
  document.getElementById('marketGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-contact');
    if (btn) {
      e.preventDefault();
      openContactModal(btn.dataset.id, btn.dataset.title);
    }
  });

  // Mina objekt-åtgärder (delegering)
  document.getElementById('myItemsContent')?.addEventListener('click', e => {
    const toggle = e.target.closest('.mi-toggle');
    if (toggle) { toggleMyItem(toggle.dataset.id, toggle.dataset.public !== '1'); return; }
    const del = e.target.closest('.mi-delete');
    if (del) { deleteMyItem(del.dataset.id); return; }
  });

  // Kontaktmodal
  document.getElementById('btnCloseContact')?.addEventListener('click', closeContactModal);
  document.getElementById('btnCancelContact')?.addEventListener('click', closeContactModal);
  document.getElementById('btnSendContact')?.addEventListener('click', sendContact);
  document.getElementById('contactModalOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('contactModalOverlay')) closeContactModal();
  });
}

// ── Inställningar (språk + cap-valuta) ───────────────────────────
let settingsBound = false;

async function syncLanguageToSupabase(lang) {
  if (!isRealUser(currentUser)) return;
  try {
    const sb = await getSb();
    await sb.auth.updateUser({ data: { preferred_language: lang } });
  } catch (_) {}
}

function initSettingsPanel() {
  const i18n = window.AestimI18n;
  if (!i18n) return;
  const grid = document.getElementById('settingsLangGrid');
  i18n.bindLanguageGrid(grid);
  i18n.syncLanguageButtonStates(grid);
  const capSel = document.getElementById('settingsCapCurrency');
  if (capSel) capSel.value = i18n.getCapDisplayCurrency();
  i18n.applyTranslations();
  updatePanelHelp('settings');
}

function setupSettings() {
  const i18n = window.AestimI18n;
  if (!i18n || settingsBound) return;
  settingsBound = true;

  i18n.hydrate();
  i18n.bindLanguageGrid(document.getElementById('settingsLangGrid'));

  i18n.onSettingsChange = (kind, value) => {
    if (kind === 'language') {
      showToast(i18n.t('settings.language.saved'));
      syncLanguageToSupabase(value);
      updatePanelHelp(state.currentModule);
      refreshDashboardCaps();
      if (labShopLoaded) renderLabProducts();
      if (marketLoaded) searchMarket();
      if (state.currentModule === 'market') loadMyItems();
      if (state.currentModule === 'account' && currentUser) refreshAccountSection();
      if (state.currentModule === 'news') {
        const active = document.querySelector('.news-cat-btn.active');
        if (active) loadNews(active.dataset.cat);
      }
      i18n.applyTranslations();
    } else if (kind === 'currency') {
      showToast(i18n.t('settings.currency.saved'));
      refreshDashboardCaps();
    }
  };

  document.getElementById('settingsCapCurrency')?.addEventListener('change', e => {
    i18n.setCapDisplayCurrency(e.target.value);
  });

  refreshAuth().catch(() => {});
}

/** Endast hash-länkar som ska öppnas vid sidladdning (inte sparad nav-state som #ucilab). */
const STARTUP_HASH_MODULES = new Set(['pricing']);

function resolveStartupModule() {
  const hash = location.hash.replace(/^#/, '');
  if (STARTUP_HASH_MODULES.has(hash)) return hash;
  return 'uci';
}

function resolveLabTabFromHash() {
  const hash = location.hash.replace(/^#/, '');
  if (hash === 'ucilab-shop') return 'shop';
  if (hash === 'ucilab-papers') return 'papers';
  return 'engine';
}

function applyStartupNavigation() {
  const params = new URLSearchParams(location.search);
  const hash = location.hash.replace(/^#/, '');

  // Stripe shop — avbruten checkout (cancel_url pekar hit)
  if (params.get('checkout') === 'cancel' && hash === 'ucilab-shop') {
    state.labTab = 'shop';
    navigateTo('ucilab');
    cleanCheckoutQuery('#ucilab-shop');
    return;
  }

  // Standard: UCI Valuation. Endast #pricing (och checkout-flöden nedan) överstyr.
  const module = resolveStartupModule();
  navigateTo(module);
}

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Visa rätt modul direkt — innan övrig init som kan kasta fel
  applyStartupNavigation();

  setupSettings();
  // Sidebar-navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.module === 'ucilab') state.labTab = 'engine';
      navigateTo(btn.dataset.module);
    });
  });

  // UCI Värdering
  document.getElementById('btnUciValue')?.addEventListener('click', runUciValuation);
  document.getElementById('uciInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') runUciValuation();
  });

  setupConditionButtons();
  setupMarketTabs();
  setupProTabs();
  setupPanel();
  setupMobileNav();
  setupMarketplace();
  setupAuth();
  setupPhotoUpload();
  setupValImage();
  setupUciAdjust();
  setupApiKey();
  setupDataModuleLinks();
  setupNews();

  // Survey vote-knapp
  document.getElementById('btnSubmitVote')?.addEventListener('click', submitVote);

  // Dashboard range-tabs hanteras nu av delegering i loadMarketDashboard()

  // Initial hjälptext
  updatePanelHelp('uci');

  // Navigering från URL-hash hanteras redan i applyStartupNavigation()
  handleListingCheckoutReturn();
  handleProCheckoutReturn();
});

// Exponera globalt (används av inline oninput)
window.updateSliderPreview = updateSliderPreview;

// ─── AestimAi Lab ─────────────────────────────────────────────────────────────

const BADGE_CLASS = {
  energy:   'lab-badge-energy',
  nfc:      'lab-badge-nfc',
  compute:  'lab-badge-compute',
  iot:      'lab-badge-iot',
  security: 'lab-badge-security',
};

let labProducts   = [];
let labActiveCat  = 'all';
let labShopLoaded = false;

function switchLabTab(tab, opts = {}) {
  state.labTab = tab;
  document.querySelectorAll('.lab-subnav .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.labTab === tab);
  });
  document.getElementById('lab-panel-engine')?.classList.toggle('hidden', tab !== 'engine');
  document.getElementById('lab-panel-papers')?.classList.toggle('hidden', tab !== 'papers');
  document.getElementById('lab-panel-shop')?.classList.toggle('hidden', tab !== 'shop');

  if (tab === 'shop' && !labShopLoaded) {
    labShopLoaded = true;
    loadLabProducts();
  }

  if (!opts.skipHash) {
    const hashMap = { shop: '#ucilab-shop', papers: '#ucilab-papers', engine: '#ucilab' };
    const hash = hashMap[tab] || '#ucilab';
    if (location.hash !== hash) {
      history.replaceState(null, '', location.pathname + location.search + hash);
    }
  }
}

async function loadLabProducts() {
  const area = document.getElementById('labShopArea');
  if (!area) return;
  const tr = (k, fb) => window.AestimI18n?.t?.(k) || fb;

  try {
    const res  = await fetch('/api/shop/products');
    const data = await res.json();
    labProducts = data.products || [];
    renderLabProducts();
  } catch (err) {
    area.innerHTML = `<div class="lab-error">${tr('lab.shop.error', 'Could not load products. Try again later.')}</div>`;
  }
}

function renderLabProducts() {
  const area = document.getElementById('labShopArea');
  if (!area || !labProducts.length) return;
  const tr = (k, fb) => window.AestimI18n?.t?.(k) || fb;

  const visible = labActiveCat === 'all'
    ? labProducts
    : labProducts.filter(p => p.category === labActiveCat);

  if (!visible.length) {
    area.innerHTML = `<div class="lab-empty">${tr('lab.shop.empty', 'No products in this category.')}</div>`;
    return;
  }

  const buyLabel = tr('lab.shop.buyAmazon', 'Buy on Amazon →');
  const buyTitleTpl = tr('lab.shop.buyTitle', 'Buy {name} on Amazon');

  area.innerHTML = visible.map(p => {
    const badgeCls = BADGE_CLASS[p.category] || '';
    const specs    = (p.specs || []).map(s => `<li>${s}</li>`).join('');
    const buyTitle = buyTitleTpl.replace('{name}', p.name);
    return `
      <div class="lab-product-row" data-cat="${p.category}">
        <div class="lab-product-thumb">${p.icon || '📦'}</div>
        <div class="lab-product-info">
          <span class="lab-badge ${badgeCls}">${p.categoryLabel}</span>
          <h3>${p.name}</h3>
          <p>${p.description}</p>
          <ul class="lab-specs">${specs}</ul>
        </div>
        <div class="lab-buy-area">
          <div class="lab-price-block">
            <span class="lab-price-sek">${p.priceSEK} kr</span>
            <span class="lab-price-uci">≈ ${p.priceUCI} ⊙</span>
          </div>
          <a class="btn-buy-amazon"
             href="${p.buyUrl}"
             target="_blank"
             rel="noopener sponsored"
             title="${buyTitle}">
            ${buyLabel}
          </a>
        </div>
      </div>`;
  }).join('');
}

function filterLab(cat) {
  labActiveCat = cat;
  document.querySelectorAll('.lab-cat-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.cat === cat)
  );
  renderLabProducts();
}

window.filterLab = filterLab;
window.switchLabTab = switchLabTab;

// ─── Auth & Konto ─────────────────────────────────────────────────────────────

function onSignIn(user) {
  if (!isRealUser(user)) return;
  syncAuthState(user);
  document.getElementById('authOverlay')?.classList.add('hidden');
  _anonSearchCount = 0;
  sessionStorage.setItem('anonSearchCount', '0');
  document.getElementById('topbarGuest')?.classList.add('hidden');
  document.getElementById('topbarAccount')?.classList.remove('hidden');
  const emailEl = document.getElementById('topbarEmail');
  if (emailEl) {
    const name = user.user_metadata?.full_name || user.email || str('auth.loggedInLabel', null, 'Signed in');
    emailEl.textContent = name;
  }
  refreshAccountSection();
  afterAuthChange();
  refreshListingQuotaHint();
  if (authResolve) { authResolve(true); authResolve = null; }
}

function onSignOut() {
  syncAuthState(null);
  document.getElementById('topbarGuest')?.classList.remove('hidden');
  document.getElementById('topbarAccount')?.classList.add('hidden');
  if (state.currentModule === 'account') navigateTo('uci');
  afterAuthChange();
}

function refreshAccountSection() {
  if (!currentUser) return;
  const u    = currentUser;
  const name = u.user_metadata?.full_name || '';
  const email = u.email || '—';
  const since = u.created_at ? new Date(u.created_at).toLocaleDateString(appLocale()) : '—';
  const fullId = u.id || '—';

  const avatarEl = document.getElementById('acctAvatar');
  if (avatarEl) avatarEl.textContent = (name || email).charAt(0).toUpperCase();

  const heroName = document.getElementById('acctName');
  if (heroName) heroName.textContent = name || email;
  const heroEmail = document.getElementById('acctEmail');
  if (heroEmail) heroEmail.textContent = email;

  const nameRow = document.getElementById('acctNameRow');
  if (nameRow) nameRow.textContent = name || '—';
  const emailRow = document.getElementById('acctEmailRow');
  if (emailRow) emailRow.textContent = email;
  const sinceEl = document.getElementById('acctSince');
  if (sinceEl) sinceEl.textContent = since;
  const idEl = document.getElementById('acctId');
  if (idEl) idEl.textContent = fullId;

  const plan = getUserPlan(u);
  const planLabel = planDisplayName(plan);
  const planBadge = document.getElementById('acctPlan');
  if (planBadge) planBadge.textContent = planLabel;
  const activePlan = document.getElementById('acctActivePlan');
  if (activePlan) activePlan.textContent = planLabel;
  const nextBill = document.getElementById('acctNextBill');
  if (nextBill) {
    const periodEnd = u.user_metadata?.plan_period_end;
    nextBill.textContent = (plan === 'pro' && periodEnd)
      ? new Date(periodEnd).toLocaleDateString(appLocale())
      : '—';
  }
  const licenseEl = document.getElementById('acctLicense');
  if (licenseEl) licenseEl.textContent = formatLicenseAcceptance(u);
  const upgradeBtn = document.getElementById('btnUpgradePlan');
  if (upgradeBtn) {
    if (plan === 'pro') {
      upgradeBtn.textContent = str('account.btnManage', null, 'Manage subscription →');
      upgradeBtn.onclick = () => openBillingPortal();
    } else if (plan === 'enterprise') {
      upgradeBtn.textContent = str('account.btnContactSupport', null, 'Contact support →');
      upgradeBtn.onclick = () => { window.location.href = 'mailto:kontakt@aestimai.org?subject=Enterprise'; };
    } else {
      upgradeBtn.textContent = str('account.btnUpgrade', null, 'Upgrade plan →');
      upgradeBtn.onclick = () => navigateTo('pricing');
    }
  }
}

function openEditAccount() {
  if (!currentUser) { openAuthModal('login'); return; }
  const n = document.getElementById('editName');
  const e = document.getElementById('editEmail');
  if (n) n.value = currentUser.user_metadata?.full_name || '';
  if (e) e.value = currentUser.email || '';
  setAuthError('editError', '');
  openAuthModal('edit');
}

async function doEditAccount() {
  const name  = document.getElementById('editName').value.trim();
  const email = document.getElementById('editEmail').value.trim();
  setAuthError('editError', '');
  if (!name)  return setAuthError('editError', str('auth.errNameRequired', null, 'Enter your name.'));
  if (!email) return setAuthError('editError', str('auth.errEmailRequired', null, 'Enter an email address.'));
  const btn = document.getElementById('btnEditAccount');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const sb = await getSb();
    const emailChanged = email !== (currentUser?.email || '');
    const updates = { data: { full_name: name } };
    if (emailChanged) updates.email = email;
    const { data, error } = await sb.auth.updateUser(updates);
    if (error) return setAuthError('editError', mapAuthError(error.message));
    if (data?.user) onSignIn(data.user);
    closeAuthModal(null, true);
    showToast(emailChanged
      ? str('auth.toastEditEmailConfirm', null, 'Saved. Confirm your new email via the link we sent.')
      : str('auth.toastEditSaved', null, 'Details updated.'));
  } catch (e) {
    setAuthError('editError', str('auth.errGeneric', null, 'Something went wrong.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = str('auth.btnEditSave', null, 'Save'); }
  }
}

function openAuthModal(panelOrOpts = 'login') {
  let panel = 'login';
  let intro = null;
  if (typeof panelOrOpts === 'object') {
    panel = panelOrOpts.panel || (panelOrOpts.mode === 'signup' ? 'register' : 'login');
    intro = panelOrOpts.intro || null;
  } else {
    panel = panelOrOpts;
  }

  const loginSub = document.getElementById('loginIntro');
  if (loginSub) {
    loginSub.textContent = intro || str('auth.loginIntro', null, 'Welcome back to AestimAi');
  }

  document.getElementById('authOverlay').classList.remove('hidden');
  switchPanel(panel);

  if (panel === 'forgot' && currentUser?.email) {
    const fe = document.getElementById('forgotEmail');
    if (fe) fe.value = currentUser.email;
  }

  setTimeout(() => {
    const focusMap = {
      login: 'loginEmail',
      register: 'regName',
      forgot: 'forgotEmail',
      edit: 'editName',
      reset: 'resetPassword',
    };
    document.getElementById(focusMap[panel] || 'loginEmail')?.focus();
  }, 50);
  return new Promise(resolve => { authResolve = resolve; });
}

function closeAuthModal(e, force = false) {
  if (!currentUser && _anonSearchCount > ANON_SEARCH_LIMIT && !force) return;
  if (!force && e && e.target !== document.getElementById('authOverlay')) return;
  document.getElementById('authOverlay').classList.add('hidden');
  if (authResolve) { authResolve(isRealUser(currentUser)); authResolve = null; }
}

function switchPanel(name) {
  ['login','register','forgot','confirm','edit','reset'].forEach(p => {
    document.getElementById('panel' + p.charAt(0).toUpperCase() + p.slice(1))
      ?.classList.add('hidden');
  });
  const target = document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1));
  if (target) target.classList.remove('hidden');
  if (name === 'register') {
    const lic = document.getElementById('regAcceptLicense');
    if (lic) lic.checked = false;
  }
}

function setAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  setAuthError('loginError', '');
  if (!email || !pass) return setAuthError('loginError', str('auth.errFillEmailPassword', null, 'Enter email and password.'));
  const btn = document.getElementById('btnLogin');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const sb = await getSb();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) return setAuthError('loginError', mapAuthError(error.message));
    if (data?.user) onSignIn(data.user);
    closeAuthModal(null, true);
    showToast(str('auth.toastLoggedIn', null, 'Logged in!'));
  } catch (e) {
    setAuthError('loginError', str('auth.errGeneric', null, 'Something went wrong.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = str('auth.btnLogin', null, 'Log in'); }
  }
}

async function doRegister() {
  const i18n  = window.AestimI18n;
  const tr    = (k, fb) => i18n?.t?.(k) || fb;
  const name  = document.getElementById('regName')?.value.trim() || '';
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPassword2').value;
  setAuthError('regError', '');
  if (!name)  return setAuthError('regError', str('auth.errNameRequired', null, 'Enter your name.'));
  if (!email) return setAuthError('regError', str('auth.errEmailRequired', null, 'Enter an email address.'));
  if (pass.length < 8) return setAuthError('regError', str('auth.errPasswordMin8', null, 'Password must be at least 8 characters.'));
  if (pass !== pass2) return setAuthError('regError', str('auth.errPasswordMismatch', null, 'Passwords do not match.'));
  if (!document.getElementById('regAcceptLicense')?.checked) {
    return setAuthError('regError', str('auth.licenseRequired', null, 'You must accept the User License Agreement.'));
  }
  const licenseMeta = buildLicenseAcceptanceMetadata();
  const btn = document.getElementById('btnRegister');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const sb = await getSb();
    const { data: { user: existing } } = await sb.auth.getUser();

    if (existing?.is_anonymous) {
      const { data, error } = await sb.auth.updateUser({
        email,
        password: pass,
        data: { full_name: name, ...licenseMeta },
      });
      if (error) return setAuthError('regError', mapAuthError(error.message));
      if (data?.user) onSignIn(data.user);
      closeAuthModal(null, true);
      showToast(str('auth.toastAccountCreated', null, 'Account created — welcome!'));
      return;
    }

    const { data, error } = await sb.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name, ...licenseMeta } },
    });
    if (error) return setAuthError('regError', mapAuthError(error.message));
    if (data?.user && !data.user.email_confirmed_at && data.session === null) {
      document.getElementById('confirmMsg').textContent =
        str('auth.confirmEmailSent', { email }, `We sent a confirmation email to ${email}.`);
      switchPanel('confirm');
    } else if (data?.user) {
      onSignIn(data.user);
      closeAuthModal(null, true);
      showToast(str('auth.toastAccountCreated', null, 'Account created — welcome!'));
    }
  } catch (e) {
    setAuthError('regError', str('auth.errGeneric', null, 'Something went wrong.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = str('auth.btnRegister', null, 'Create account'); }
  }
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  setAuthError('forgotError', '');
  if (!email) return setAuthError('forgotError', str('auth.errForgotEmailRequired', null, 'Enter your email address.'));
  const btn = document.querySelector('#panelForgot .btn-plan');
  if (btn) { btn.disabled = true; btn.textContent = str('auth.btnSending', null, 'Sending…'); }
  try {
    const sb = await getSb();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname + '?reset=1',
    });
    if (error) return setAuthError('forgotError', mapAuthError(error.message));
    document.getElementById('confirmMsg').textContent =
      str('auth.confirmResetSent', { email }, `Reset link sent to ${email}.`);
    switchPanel('confirm');
  } catch (e) {
    setAuthError('forgotError', str('auth.errGeneric', null, 'Something went wrong.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = str('auth.btnForgot', null, 'Send reset link'); }
  }
}

async function doResetPassword() {
  const pass  = document.getElementById('resetPassword').value;
  const pass2 = document.getElementById('resetPassword2').value;
  setAuthError('resetError', '');
  if (pass.length < 8) return setAuthError('resetError', str('auth.errPasswordMin8', null, 'Password must be at least 8 characters.'));
  if (pass !== pass2) return setAuthError('resetError', str('auth.errPasswordMismatch', null, 'Passwords do not match.'));
  const btn = document.getElementById('btnResetPassword');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const sb = await getSb();
    const { data, error } = await sb.auth.updateUser({ password: pass });
    if (error) return setAuthError('resetError', mapAuthError(error.message));
    if (data?.user) onSignIn(data.user);
    history.replaceState(null, '', location.pathname + location.hash);
    closeAuthModal(null, true);
    showToast(str('auth.toastPasswordUpdated', null, 'Password updated.'));
  } catch (e) {
    setAuthError('resetError', str('auth.errGeneric', null, 'Something went wrong.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = str('auth.btnReset', null, 'Save new password'); }
  }
}

async function signOut() {
  try {
    const sb = await getSb();
    await sb.auth.signOut();
  } catch (e) {}
  onSignOut();
  showToast(str('auth.toastSignedOut', null, 'Signed out.'));
}

async function confirmDeleteAccount() {
  if (!currentUser) return;
  const ok = confirm(str('account.confirmDelete', null, 'Are you sure you want to delete your account?'));
  if (!ok) return;

  try {
    const sb = await getSb();
    const userId = currentUser.id;
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) {
      alert(str('account.alertSessionExpired', null, 'Your session has expired. Log in again and retry.'));
      openAuthModal('login');
      return;
    }

    const { error: anonErr } = await sb
      .from('aestimai_valuations')
      .update({ user_id: null })
      .eq('user_id', userId);
    if (anonErr) console.warn('[Delete] Anonymisering misslyckades:', anonErr.message);

    const res = await fetch('/api/auth/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      console.warn('[Delete] Server-radering misslyckades, loggar ut.');
      await sb.auth.signOut();
      alert(str('account.alertAnonymized', null, 'Your personal data is anonymized. Contact support@aestimai.org for final auth account deletion.'));
      onSignOut();
      return;
    }

    await sb.auth.signOut();
    onSignOut();
    alert(str('account.alertDeleted', null, 'Your account has been closed. Thank you for using AestimAi.'));
  } catch (e) {
    alert(str('account.alertDeleteFailed', null, 'Something went wrong. Contact support@aestimai.org if the problem persists.'));
  }
}

async function selectPlan(plan) {
  if (plan === 'enterprise') {
    window.location.href = 'mailto:kontakt@aestimai.org?subject=Enterprise';
    return;
  }
  if (plan === 'free') {
    if (!currentUser) openAuthModal('register');
    return;
  }
  if (plan === 'pro') {
    const user = await requireRealUser(str('auth.requireLoginPro', null, 'Log in or create an account to choose Pro.'));
    if (!user) return;
    if (getUserPlan(user) === 'pro') {
      await openBillingPortal();
      return;
    }
    if (getUserPlan(user) === 'enterprise') {
      showToast(str('common.enterpriseManual', null, 'Enterprise is handled manually — contact support.'));
      return;
    }
    await startProCheckout();
  }
}

function checkPasswordRecoveryLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (hash.get('type') === 'recovery') {
    openAuthModal('reset');
    return true;
  }
  return false;
}

async function initAuth() {
  try {
    const sb = await getSb();
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user && isRealUser(session.user)) onSignIn(session.user);

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        openAuthModal('reset');
        return;
      }
      if (session?.user && isRealUser(session.user)) onSignIn(session.user);
      else if (!session?.user) onSignOut();
    });

    checkPasswordRecoveryLink();
  } catch (e) { /* Supabase ej tillgänglig */ }
}

document.addEventListener('DOMContentLoaded', () => { initAuth(); });

window.openAuthModal      = openAuthModal;
window.closeAuthModal     = closeAuthModal;
window.switchPanel        = switchPanel;
window.doLogin            = doLogin;
window.doRegister         = doRegister;
window.doForgot           = doForgot;
window.doResetPassword    = doResetPassword;
window.signOut            = signOut;
window.confirmDeleteAccount = confirmDeleteAccount;
window.selectPlan         = selectPlan;
window.openBillingPortal  = openBillingPortal;
window.openEditAccount    = openEditAccount;
window.doEditAccount      = doEditAccount;
window.navigateTo         = navigateTo;

// ── Kontaktformulär ───────────────────────────────────────────────────────────
async function submitContact() {
  const i18n    = window.AestimI18n;
  const tr      = (k, fb) => i18n?.t?.(k) || fb;
  const name    = document.getElementById('cfName').value.trim();
  const email   = document.getElementById('cfEmail').value.trim();
  const subject = document.getElementById('cfSubject').value;
  const message = document.getElementById('cfMessage').value.trim();
  const hp      = document.getElementById('cfHp').value;
  const errEl   = document.getElementById('cfError');
  const okEl    = document.getElementById('cfSuccess');
  const btn     = document.getElementById('btnCfSubmit');
  const btnTxt  = document.getElementById('btnCfText');

  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (hp) return; // honeypot — trolig bot
  if (!name)    { errEl.textContent = tr('contact.errName', 'Please enter your name.');          errEl.classList.remove('hidden'); return; }
  if (!email)   { errEl.textContent = tr('contact.errEmail', 'Please enter your email address.'); errEl.classList.remove('hidden'); return; }
  if (!message) { errEl.textContent = tr('contact.errMessage', 'Please write a message.');    errEl.classList.remove('hidden'); return; }

  btn.disabled = true; btnTxt.textContent = tr('contact.btnSending', 'Sending…');

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, subject, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || tr('contact.errSend', 'Could not send.'));

    document.getElementById('cfName').value    = '';
    document.getElementById('cfEmail').value   = '';
    document.getElementById('cfMessage').value = '';
    okEl.textContent = tr('contact.success', '✓ Your message has been sent!');
    okEl.classList.remove('hidden');
  } catch (e) {
    errEl.textContent = e.message || tr('contact.errSend', 'Could not send. Try again or email kontakt@aestimai.org.');
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btnTxt.textContent = tr('contact.btnSubmit', 'Send message');
  }
}
window.submitContact = submitContact;
