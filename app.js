/* ===================================================
   AestimAi — Applikationslogik
   =================================================== */

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
    });
  } catch (e) {
    console.warn('[Spara] kunde inte spara värdering:', e && e.message);
  }
}

// (Gamla lokala UCI-tabeller är ersatta av Claude API)

// ── Navigation ─────────────────────────────────────
function navigateTo(moduleId) {
  document.querySelectorAll('.module').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const mod = document.getElementById('module-' + moduleId);
  if (mod) mod.classList.remove('hidden');

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
}

function updatePanelHelp(moduleId) {
  const helpTexts = {
    uci: '<h4>Om UCI-värdering</h4><p>UCI (Universal Coin Index) mäter verkligt bytevärde baserat på nyttighet, skick och marknadsdata — oberoende av valuta.</p><p>Ingen inloggning behövs. Värderingen är alltid gratis.</p>',
    market: '<h4>Om UCI Bytesmarknaden</h4><p>Byt varor, tjänster och tillgångar direkt med andra — utan valuta. Bytet bekräftas kryptografiskt med AE ID barter or pay-kort.</p><p>Kräver AE ID barter or pay-kort (engångskostnad €15–25).</p>',
    pro: '<h4>AestimAi Pro</h4><p>Professionell värdering för fastigheter, energianläggningar och portföljer. Rapporter signeras med AE ID barter or pay DS-certifikat.</p><p>€75/mån — kräver AE ID barter or pay-kort.</p>',
    idcoop: '<h4>Om AE ID barter or pay</h4><p>AE ID barter or pay-kortet är en fysisk NFC/USB-smartkort som fungerar som din identitet och signatur — oberoende av telefon eller internet.</p>',
    news: '<h4>AestimAi Nyheter</h4><p>Nyheter om värdering, byteshandel, energi och kooperativ ekonomi. Uppdateras dagligen.</p><p>Annonsplatser i höger kolumn är reserverade för relevanta aktörer inom cirkulär ekonomi och fintech.</p>',
  };
  const el = document.getElementById('panelHelp');
  if (el) el.innerHTML = helpTexts[moduleId] || helpTexts.uci;
}

// ── UCI Värdering (Claude API) ──────────────────────
async function runUciValuation() {
  const input    = document.getElementById('uciInput').value.trim();
  const category = document.getElementById('uciCategory').value;
  const cond     = state.selectedCondition;

  if (!input && !category) {
    document.getElementById('uciInput').focus();
    return;
  }

  // Visa laddning
  setUciLoading(true);

  try {
    const res = await fetch(`${UCI_SERVER}/api/uci/value`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description: input, category, condition: cond }),
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
      showToast('Värdering misslyckades: ' + err.message);
    }
  }
}

function setUciLoading(on) {
  const btn     = document.getElementById('btnUciValue');
  const loading = document.getElementById('uciLoading');
  const result  = document.getElementById('uciResult');
  btn.disabled  = on;
  document.getElementById('btnUciText').textContent = on ? 'Analyserar…' : 'Värdera';
  loading.classList.toggle('hidden', !on);
  if (on) result.classList.add('hidden');
}

function renderUciResult(data) {
  setUciLoading(false);

  state.currentItemId   = data.itemId;
  state.currentUciPrior = data.uci_value;
  state.hasVoted        = false;

  // Huvud-siffror
  document.getElementById('uciValue').textContent = data.uci_value.toLocaleString('sv-SE');
  document.getElementById('convSEK').textContent  = (data.sek_approx || Math.round(data.uci_value * state.uciRateToSEK)).toLocaleString('sv-SE') + ' kr';
  document.getElementById('convEUR').textContent  = (data.eur_approx || Math.round(data.uci_value * state.uciRateToEUR)).toLocaleString('sv-SE') + ' €';
  document.getElementById('convUSD').textContent  = (data.usd_approx || Math.round(data.uci_value * state.uciRateToUSD)).toLocaleString('sv-SE') + ' $';

  // Konfidens
  const conf = data.confidence_pct || 70;
  document.getElementById('confBar').style.width   = conf + '%';
  document.getElementById('confPct').textContent   = conf + '% konfidens';
  document.getElementById('confRange').textContent =
    `${data.uci_low?.toLocaleString('sv-SE')} – ${data.uci_high?.toLocaleString('sv-SE')} UCI (90% intervall)`;

  // AI-analys
  document.getElementById('reasoningText').textContent = data.reasoning || '';
  const kf = document.getElementById('keyFactors');
  kf.innerHTML = (data.key_factors || []).map(f => `<span class="factor-tag">${f}</span>`).join('');

  // Jämförelseobjekt
  const cl = document.getElementById('comparablesList');
  cl.innerHTML = (data.comparables || []).map(c =>
    `<div class="comparable-row">
       <span class="comp-name">${c.name}</span>
       <span class="comp-uci">${c.uci?.toLocaleString('sv-SE')} UCI</span>
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
        <span class="mc-label">Marknadsprisankar</span>
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
  if (autoVal) autoVal.textContent = data.uci_value.toLocaleString('sv-SE');

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
    reasoning:       'Estimat baserat på lokal modell (AI-servern är inte nåbar). Starta uci-server.js för full AI-analys.',
    key_factors:     ['Kategori: ' + (category || 'Okänd'), 'Skick: ' + cond + '/5'],
    comparables:     [],
    depreciation_note: '',
    survey_question: 'Vad är din bedömning av värdet?',
    itemId:          null,
  });
}

// ── Survey / Respondentvalidering ───────────────────
function setupSurvey(priorUci, question) {
  const slider  = document.getElementById('surveySlider');
  const anchor  = document.getElementById('sliderAnchor');
  const preview = document.getElementById('sliderPreview');
  const qEl     = document.getElementById('surveyQuestion');

  if (qEl)     qEl.textContent  = question || 'Vad är din bedömning av värdet?';
  if (anchor)  anchor.textContent = priorUci.toLocaleString('sv-SE') + ' UCI (AI)';

  // Slider: 1–100 → 20%–500% av prior
  slider.value = 50;
  updateSliderPreview();

  document.getElementById('surveyN').textContent       = '0 svar';
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
  if (preview) preview.textContent = uci.toLocaleString('sv-SE');
}

async function submitVote() {
  if (state.hasVoted) { showToast('Du har redan röstat på detta objekt.'); return; }

  const sliderVal = parseInt(document.getElementById('surveySlider').value);
  const voteUci   = sliderToUci(sliderVal);

  if (!state.currentItemId) {
    showToast('Ingen aktiv värderingssession — värdera ett objekt först.');
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
    document.getElementById('btnSubmitVote').textContent = '✓ Röst registrerad';

    renderBayesianResult(data);
    showToast('Tack! Din bedömning är registrerad.');

  } catch (err) {
    showToast('Kunde inte skicka röst: ' + err.message);
  }
}

function renderBayesianResult(data) {
  const n    = data.n || 0;
  const nEl  = document.getElementById('surveyN');
  const sig  = document.getElementById('surveySig');
  const box  = document.getElementById('bayesianResult');

  nEl.textContent = n + (n === 1 ? ' svar' : ' svar');
  if (n >= 20) sig.classList.remove('hidden');

  document.getElementById('bayesValue').textContent = data.mean?.toLocaleString('sv-SE') || '—';
  document.getElementById('bayesRange').textContent =
    `${data.low?.toLocaleString('sv-SE')} – ${data.high?.toLocaleString('sv-SE')} UCI`;

  const shift    = data.mean - state.currentUciPrior;
  const shiftPct = Math.round((shift / state.currentUciPrior) * 100);
  const dir      = shift > 0 ? '▲' : shift < 0 ? '▼' : '—';
  const col      = shift > 0 ? 'var(--green)' : shift < 0 ? '#b84040' : 'var(--gray-500)';

  document.getElementById('bayesMeta').innerHTML =
    `<span style="color:${col};font-weight:700">${dir} ${Math.abs(shiftPct)}% från AI-estimat</span>
     &nbsp;·&nbsp; ${n} respondent${n !== 1 ? 'er' : ''}
     &nbsp;·&nbsp; Konfidens: ${data.confidence}%`;

  // Uppdatera även huvud-UCI-siffran om vi har nog med svar
  if (n >= 5) {
    document.getElementById('uciValue').textContent = data.mean?.toLocaleString('sv-SE');
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

// ── Höger panel ─────────────────────────────────────
function setupPanel() {
  const btn   = document.getElementById('btnTogglePanel');
  const close = document.getElementById('btnClosePanel');

  btn.addEventListener('click', () => {
    document.body.classList.toggle('panel-open');
    btn.textContent = document.body.classList.contains('panel-open') ? '›' : '‹';
  });

  close.addEventListener('click', () => {
    document.body.classList.remove('panel-open');
    btn.textContent = '‹';
  });
}

// ── Inloggning (riktig Supabase-auth, e-post/lösenord) ──────────
let authMode = 'login';            // 'login' | 'signup'
let authResolve = null;            // promise-resolver när inloggning krävs i ett flöde

function isRealUser(user) {
  return !!(user && user.is_anonymous !== true);
}

function setupAuth() {
  // Sidopanelens login-knapp får sitt beteende i updateAuthUI() (onclick).
  document.getElementById('btnActivateCard')?.addEventListener('click', () => openAuthModal());
  document.getElementById('btnOrderCard')?.addEventListener('click', () => {
    showToast('Kortbeställning öppnas snart.');
  });
  document.getElementById('btnRegisterLogin')?.addEventListener('click', () =>
    openAuthModal({ intro: 'Skapa konto eller logga in för att registrera objekt.' }));
  document.getElementById('btnMyItemsLogin')?.addEventListener('click', () =>
    openAuthModal({ intro: 'Logga in för att se och publicera dina objekt.' }));

  // Auth-modalens kontroller
  document.getElementById('btnCloseAuth').addEventListener('click', closeAuthModal);
  document.getElementById('btnAuthToggle').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    applyAuthMode();
  });
  document.getElementById('btnAuthSubmit').addEventListener('click', submitAuth);
  document.getElementById('authModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('authModalOverlay')) closeAuthModal();
  });
  document.getElementById('authPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });

  updateAuthUI();   // sätter sidopanelens onclick
  peekSession();    // optimistisk status utan att ladda SDK vid sidladdning
}

/** Snabb koll av befintlig session i localStorage – laddar inte supabase-js. */
function peekSession() {
  try {
    const raw = localStorage.getItem('sb-vaxtylcqnscnflsucyiv-auth-token');
    if (!raw) return;
    const obj = JSON.parse(raw);
    const u = obj?.user || obj?.currentSession?.user || obj?.[0];
    if (u && u.is_anonymous !== true) {
      state.user = u;
      state.isLoggedIn = true;
      updateAuthUI();
    }
  } catch (_) {}
}

function openAuthModal(opts = {}) {
  authMode = opts.mode || 'login';
  if (opts.intro) document.getElementById('authIntro').textContent = opts.intro;
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('authError').classList.add('hidden');
  applyAuthMode();
  document.getElementById('authModalOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('authEmail').focus(), 50);
  return new Promise(resolve => { authResolve = resolve; });
}

function closeAuthModal() {
  document.getElementById('authModalOverlay').classList.add('hidden');
  if (authResolve) { authResolve(false); authResolve = null; }
}

function applyAuthMode() {
  const isLogin = authMode === 'login';
  document.getElementById('authTitle').textContent     = isLogin ? 'Logga in' : 'Skapa konto';
  document.getElementById('btnAuthSubmit').textContent = isLogin ? 'Logga in' : 'Skapa konto';
  document.getElementById('btnAuthToggle').textContent = isLogin ? 'Inget konto? Skapa ett' : 'Har du redan konto? Logga in';
  document.getElementById('authPassword').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function submitAuth() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { showAuthError('Fyll i e-post och lösenord.'); return; }
  if (password.length < 6)  { showAuthError('Lösenordet måste vara minst 6 tecken.'); return; }

  const btn = document.getElementById('btnAuthSubmit');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '…';
  try {
    const sb = await getSb();
    const { data: { user: existing } } = await sb.auth.getUser();

    if (authMode === 'signup') {
      if (existing && existing.is_anonymous) {
        // Uppgradera anonym session → behåll historiken (som mobilappen)
        const { error } = await sb.auth.updateUser({ email, password });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }

    await refreshAuth();
    closeAuthModal();
    showToast(authMode === 'signup' ? 'Konto skapat — välkommen!' : 'Inloggad!');
    if (authResolve) { authResolve(isRealUser(state.user)); authResolve = null; }
    afterAuthChange();
  } catch (e) {
    showAuthError(e?.message || 'Något gick fel. Försök igen.');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function refreshAuth() {
  try {
    const sb = await getSb();
    const { data: { user } } = await sb.auth.getUser();
    state.user = user || null;
    state.isLoggedIn = isRealUser(user);
    updateAuthUI();
  } catch (_) {}
}

async function signOut() {
  try { const sb = await getSb(); await sb.auth.signOut(); } catch (_) {}
  state.user = null;
  state.isLoggedIn = false;
  updateAuthUI();
  afterAuthChange();
  showToast('Utloggad.');
}

/** Säkerställer en riktig (icke-anonym) session. Öppnar annars auth-modalen. */
async function requireRealUser(intro) {
  await refreshAuth();
  if (isRealUser(state.user)) return state.user;
  const ok = await openAuthModal({ intro: intro || 'Logga in för att fortsätta.' });
  return ok ? state.user : null;
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
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const btn  = document.getElementById('btnLogin');

  if (state.isLoggedIn) {
    dot.classList.add('active');
    text.textContent = state.user?.email || 'Inloggad';
    btn.textContent  = 'Logga ut';
    btn.onclick      = signOut;

    document.getElementById('idcoopUnauth')?.classList.add('hidden');
    document.getElementById('idcoopAuth')?.classList.remove('hidden');
    document.getElementById('proGate')?.classList.add('hidden');
    document.getElementById('proContent')?.classList.remove('hidden');
  } else {
    dot.classList.remove('active');
    text.textContent = 'Ej inloggad';
    btn.textContent  = 'Logga in';
    btn.onclick      = () => openAuthModal();

    document.getElementById('idcoopUnauth')?.classList.remove('hidden');
    document.getElementById('idcoopAuth')?.classList.add('hidden');
    document.getElementById('proGate')?.classList.remove('hidden');
    document.getElementById('proContent')?.classList.add('hidden');
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
    showToast('API-nyckel kopierad!');
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
let newsCache = {};    // cat → { articles, fetchedAt }
let newsLoaded = false;

function setupNews() {
  const dateEl = document.getElementById('newsDate');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString('sv-SE', {
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

// Hämta nyheter — anropas första gången modulen visas
async function loadNews(cat = 'all') {
  // Använd cache om färskare än 10 min
  const cached = newsCache[cat];
  if (cached && Date.now() - cached.fetchedAt < 600_000) {
    renderNews(cached.articles, cat);
    return;
  }

  setNewsLoading(true);

  try {
    const res  = await fetch(`${NEWS_PROXY}?cat=${cat}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    newsCache[cat] = { articles: data.articles, fetchedAt: Date.now() };
    renderNews(data.articles, cat);
  } catch (err) {
    console.warn('[AestimAi news] Proxy inte nåbar — visar demo-innehåll:', err.message);
    setNewsLoading(false);
    // Faller tillbaka på det hårdkodade HTML-innehållet
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
      spinner.innerHTML = '<div class="news-loading">Hämtar nyheter…</div>';
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
  if (articles.length === 0) return '<div class="news-loading">Inga artiklar hittades för denna kategori.</div>';

  const lead      = articles[0];
  const grid1     = articles.slice(1, 4);
  const feature   = articles[4];
  const grid2     = articles.slice(5, 8);
  const briefs    = articles.slice(8);

  const CAT_LABELS = {
    valuation:      'Värdering',
    energy:         'Energi',
    coop:           'Kooperativ',
    market:         'Marknad',
    tech:           'Fintech',
    sustainability: 'Hållbarhet',
    resources:      'Resurser',
    all:            'Nyheter',
  };
  const label = (a) => {
    const c = a.cat || cat;
    return `<span class="news-section-label ${c}">${CAT_LABELS[c] || 'Nyheter'}</span>`;
  };
  const byline = (a) => {
    const time = a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('sv-SE') : '';
    return `<div class="news-byline">
      <span class="news-author">${escHtml(a.source || a.author || 'Okänd källa')}</span>
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
    grid.innerHTML = '<div class="commentary-loading">Kommentarer ej tillgängliga just nu.</div>';
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

let activeCurrency = 'SEK'; // Stats-sektionen visas alltid i SEK

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
  setEl('dsVolumeToday',  stats.volumeToday + ' st');
  setEl('dsVolumeTotal',  stats.volumeTotal + ' st');
  setEl('dsSurveys',    stats.activeSurveys + ' aktiva');

  // Search Cap & Verified Cap — omräknat till vald valuta
  const capFmt = (sek) => {
    const val = sek / fxRate;
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + ' M' + cur.label;
    if (val >= 1_000)     return (val / 1_000).toFixed(1)     + ' t' + cur.label;
    return val.toFixed(cur.decimals) + ' ' + cur.label;
  };
  setEl('dsSearchCapSEK',    capFmt(stats.searchCap || 0));
  setEl('dsSearchCapCount',  (stats.totalSearches || 0).toLocaleString('sv-SE') + ' värderingar');
  setEl('dsVerifiedCapSEK',  capFmt(stats.verifiedCap || 0));
  setEl('dsVerifiedCapCount',(stats.totalVerified  || 0).toLocaleString('sv-SE') + ' transaktioner');

  setEl('dashLastUpdate', 'Uppdaterad: ' + new Date().toLocaleString('sv-SE'));

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
      <tr class="${c.code === activeCurrency ? 'fx-row-active' : ''}"
          onclick="document.getElementById('dashCurrencySelect').value='${c.code}';onDashCurrencyChange()"
          style="cursor:pointer">
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
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid:  { color: 'rgba(255,255,255,0.05)', drawTicks: false },
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
        grid:     { color: 'rgba(255,255,255,0.05)' },
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
    backgroundColor: '#111210', titleColor: '#fff',
    bodyColor: 'rgba(255,255,255,0.7)',
    callbacks: {
      title: items => items[0].label,
      label: item => item.dataset.label === '⊙ UCI (referens)'
        ? ` ⊙ UCI: 100 (referens)`
        : ` ${item.dataset.label}: ${item.raw.toFixed(1)}`,
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
    borderColor:      'rgba(255,255,255,0.55)',
    borderWidth:      2,
    borderDash:       [7, 4],
    pointRadius:      0,
    pointHoverRadius: 0,
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
  let el = document.getElementById('chartLegend');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chartLegend';
    el.className = 'chart-legend';
    document.querySelector('.dash-chart-wrap')?.after(el);
  }
  if (!series || series.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = series.map(s =>
    `<span class="legend-item">
       <span class="legend-dot" style="background:${s.color}"></span>
       <span class="legend-label">${s.label}</span>
     </span>`
  ).join('') +
  `<span class="legend-item legend-ref">
     <span class="legend-dash"></span>
     <span class="legend-label">⊙ UCI (referens = 100)</span>
   </span>`;
}

// ════════════════════════════════════════════════════
//  UCI BYTESMARKNAD
// ════════════════════════════════════════════════════

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

const COND_LABELS = { 1: '1 — Dåligt', 2: '2 — Slitet', 3: '3 — OK', 4: '4 — Bra', 5: '5 — Utmärkt' };

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
    title:     mk.title || od.title || (od.description ? String(od.description).slice(0, 60) : 'Objekt'),
    category:  od.category || '',
    location:  mk.location || '',
    uci:       (uci !== null && !isNaN(uci)) ? uci : null,
    condition: condRaw != null ? (COND_LABELS[condRaw] || condRaw) : '',
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
  grid.innerHTML = '<div class="market-loading">Laddar Bytesmarknaden…</div>';

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

    if (countEl) countEl.textContent = `${rows.length} ${rows.length === 1 ? 'objekt' : 'objekt'}`;

    if (!rows.length) {
      grid.innerHTML = '<div class="market-empty">Inga publika objekt matchar. Var först — registrera och publicera ditt objekt!</div>';
      return;
    }
    grid.innerHTML = rows.map(marketCardHTML).join('');
  } catch (e) {
    console.warn('[market] sök misslyckades:', e?.message);
    grid.innerHTML = `<div class="market-error">Kunde inte ladda Bytesmarknaden: ${escHtml(e?.message || 'okänt fel')}</div>`;
  }
}

function marketCardHTML(v) {
  const img = v.image
    ? `<div class="card-image" style="background-image:url('${escHtml(v.image)}')"></div>`
    : '<div class="card-image placeholder-img">📷</div>';
  const kindLabel = v.kind === 'wanted' ? 'Efterlyses' : 'Erbjuds';
  return `<div class="market-card" data-id="${escHtml(v.id)}">
    <a class="card-image-link" href="/m/${escHtml(v.id)}">${img}</a>
    <div class="card-body">
      <span class="card-kind kind-${escHtml(v.kind)}">${kindLabel}</span>
      <h3><a href="/m/${escHtml(v.id)}">${escHtml(v.title)}</a></h3>
      <p class="card-cat">${escHtml(v.category)}${v.location ? ' · ' + escHtml(v.location) : ''}</p>
      <div class="card-uci">
        <span class="uci-badge">${v.uci != null ? v.uci.toLocaleString('sv-SE') + ' UCI' : '— UCI'}</span>
        ${v.verified ? '<span class="card-verified">✓ AE ID</span>' : ''}
      </div>
      ${v.condition ? `<p class="card-condition">Skick: ${escHtml(v.condition)}</p>` : ''}
      <button class="btn-secondary btn-contact" data-id="${escHtml(v.id)}" data-title="${escHtml(v.title)}">Kontakta</button>
    </div>
  </div>`;
}

// ── Registrera objekt ───────────────────────────────
async function fetchValuation(input) {
  try {
    const res = await fetch(`${UCI_SERVER}/api/uci/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
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
  if (!desc) { showToast('Skriv en beskrivning först.'); return; }

  const btn = document.getElementById('btnValueListing');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Värderar…';
  const data = await fetchValuation({ description: desc, category, condition });
  btn.disabled = false; btn.textContent = orig;

  if (data && data.uci_value != null) {
    state.listingValuation = data;
    document.getElementById('uciAutoValue').textContent = Number(data.uci_value).toLocaleString('sv-SE');
  } else {
    showToast('AI-värdering misslyckades — du kan ange ett UCI-värde manuellt.');
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

async function submitListing() {
  const user = await requireRealUser('Logga in för att registrera och spara objekt.');
  if (!isRealUser(user)) return;

  const kind      = document.getElementById('itemKind').value || 'offer';
  const title     = document.getElementById('itemTitle').value.trim();
  const desc      = document.getElementById('itemDesc').value.trim();
  const category  = document.getElementById('itemCategory').value;
  const condition = parseInt(document.getElementById('itemCondition').value) || 3;
  const location  = document.getElementById('itemLocation').value.trim();
  const manualUci = parseFloat(document.getElementById('itemUciPrice').value);
  const publishNow = document.getElementById('publishNow').checked;

  if (!title) { showToast('Ange en titel.'); document.getElementById('itemTitle').focus(); return; }
  if (!desc)  { showToast('Beskriv objektet eller tjänsten.'); document.getElementById('itemDesc').focus(); return; }

  const btn = document.getElementById('btnPublishListing');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sparar…';

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

    const row = {
      user_id:      user.id,
      object_data,
      result,
      source:       'manual',
      kind,
      marketplace,
      is_public:    publishNow,
      published_at: publishNow ? new Date().toISOString() : null,
      image_url:    images[0] || null,
    };

    const sb = await getSb();
    const { error } = await sb.from('aestimai_valuations').insert(row);
    if (error) throw error;

    showToast(publishNow ? 'Publicerat i Bytesmarknad!' : 'Sparat under Mina objekt.');
    resetRegisterForm();
    switchMarketTab('my-items');
  } catch (e) {
    showToast('Kunde inte spara: ' + (e?.message || 'okänt fel'));
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
  container.innerHTML = '<div class="market-loading">Laddar dina objekt…</div>';

  await refreshAuth();
  if (!isRealUser(state.user)) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⇄</div>
        <h2>Logga in för att se dina objekt</h2>
        <p>Här samlas allt du har värderat — välj med en knapp vilka som ska visas i Bytesmarknaden.</p>
        <button class="btn-primary" id="btnMyItemsLogin2">Logga in / Skapa konto</button>
      </div>`;
    document.getElementById('btnMyItemsLogin2')?.addEventListener('click', async () => {
      const ok = await openAuthModal({ intro: 'Logga in för att se och publicera dina objekt.' });
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
          <h2>Inga objekt än</h2>
          <p>Registrera ditt första objekt eller gör en värdering — det dyker upp här.</p>
          <button class="btn-primary" id="btnGoRegister">Registrera objekt</button>
        </div>`;
      document.getElementById('btnGoRegister')?.addEventListener('click', () => switchMarketTab('register'));
      return;
    }

    const header = `<div class="my-items-header"><h2>Mina objekt</h2>
      <p>Tryck <strong>Visa i Bytesmarknad</strong> för att göra ett objekt publikt och sökbart.</p></div>`;
    container.innerHTML = header + '<div class="my-items-list">' + data.map(myItemRowHTML).join('') + '</div>';
  } catch (e) {
    container.innerHTML = `<div class="market-error">Kunde inte hämta dina objekt: ${escHtml(e?.message || 'okänt fel')}</div>`;
  }
}

function myItemRowHTML(row) {
  const v = listingView(row);
  const pub = !!row.is_public;
  return `<div class="my-item" data-id="${escHtml(row.id)}">
    <div class="my-item-info">
      <h3>${escHtml(v.title)}</h3>
      <p class="card-cat">${escHtml(v.category)}${v.uci != null ? ' · ' + v.uci.toLocaleString('sv-SE') + ' UCI' : ''}</p>
      <span class="status-pill ${pub ? 'pill-public' : 'pill-private'}">${pub ? 'Publik i Bytesmarknad' : 'Ej publik'}</span>
    </div>
    <div class="my-item-actions">
      <select class="mi-kind" data-id="${escHtml(row.id)}">
        <option value="offer"${v.kind === 'offer' ? ' selected' : ''}>Erbjuds</option>
        <option value="wanted"${v.kind === 'wanted' ? ' selected' : ''}>Efterlyses</option>
      </select>
      <button class="btn-primary mi-toggle" data-id="${escHtml(row.id)}" data-public="${pub ? '1' : '0'}">${pub ? 'Dölj' : 'Visa i Bytesmarknad'}</button>
      ${pub ? `<a class="btn-text" href="/m/${escHtml(row.id)}" target="_blank" rel="noopener">Visa sida</a>` : ''}
      <button class="btn-text mi-delete" data-id="${escHtml(row.id)}">Radera</button>
    </div>
  </div>`;
}

async function toggleMyItem(id, makePublic) {
  const kindSel = document.querySelector(`.mi-kind[data-id="${id}"]`);
  const kind = kindSel ? kindSel.value : 'offer';
  const patch = { is_public: makePublic, kind };
  if (makePublic) patch.published_at = new Date().toISOString();
  try {
    const sb = await getSb();
    const { error } = await sb.from('aestimai_valuations').update(patch).eq('id', id);
    if (error) throw error;
    showToast(makePublic ? 'Publicerat i Bytesmarknad!' : 'Dolt från Bytesmarknad.');
    marketLoaded = false; // tvinga ny laddning av söklistan nästa gång
    loadMyItems();
  } catch (e) {
    showToast('Gick inte att uppdatera: ' + (e?.message || 'okänt fel'));
  }
}

async function deleteMyItem(id) {
  if (!window.confirm('Radera detta objekt permanent?')) return;
  try {
    const sb = await getSb();
    const { error } = await sb.from('aestimai_valuations').delete().eq('id', id);
    if (error) throw error;
    showToast('Objektet raderat.');
    loadMyItems();
  } catch (e) {
    showToast('Gick inte att radera: ' + (e?.message || 'okänt fel'));
  }
}

// ── Kontaktformulär ─────────────────────────────────
let contactCtx = null;

function openContactModal(id, title) {
  contactCtx = { id, title };
  document.getElementById('contactItem').textContent = title || 'objektet';
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
    errEl.textContent = 'Fyll i din e-post och ett meddelande.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btnSendContact');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Skickar…';
  try {
    const res = await fetch('/api/market/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: contactCtx?.id, fromEmail: email, name, message, hp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Kunde inte skicka meddelandet.');
    closeContactModal();
    showToast('Meddelandet skickat till annonsören!');
  } catch (e) {
    errEl.textContent = e?.message || 'Något gick fel.';
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

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar-navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.module));
  });

  // UCI Värdering
  document.getElementById('btnUciValue').addEventListener('click', runUciValuation);
  document.getElementById('uciInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') runUciValuation();
  });

  setupConditionButtons();
  setupMarketTabs();
  setupProTabs();
  setupPanel();
  setupMarketplace();
  setupAuth();
  setupPhotoUpload();
  setupUciAdjust();
  setupApiKey();
  setupDataModuleLinks();
  setupNews();

  // Survey vote-knapp
  document.getElementById('btnSubmitVote')?.addEventListener('click', submitVote);

  // Dashboard range-tabs hanteras nu av delegering i loadMarketDashboard()

  // Initial hjälptext
  updatePanelHelp('uci');

  // Navigering från URL-hash
  const hash = location.hash.replace('#', '');
  if (hash && document.getElementById('module-' + hash)) {
    navigateTo(hash);
  }
});

// Exponera globalt (används av inline oninput)
window.updateSliderPreview = updateSliderPreview;
