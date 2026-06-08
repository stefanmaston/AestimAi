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
};

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
        document.getElementById('registerGate').classList.toggle('hidden', state.isLoggedIn);
        document.getElementById('registerForm').classList.toggle('hidden', !state.isLoggedIn);
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

// ── Bytesmodal ──────────────────────────────────────
function setupMarketModal() {
  document.addEventListener('click', e => {
    if (e.target.classList.contains('btn-propose')) {
      const card = e.target.closest('.market-card');
      const title = card ? card.querySelector('h3').textContent : '?';
      document.getElementById('proposedItem').textContent = title;
      document.getElementById('modalOverlay').classList.remove('hidden');
    }
  });

  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelPropose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.getElementById('btnConfirmPropose').addEventListener('click', () => {
    if (!state.isLoggedIn) {
      closeModal();
      navigateTo('idcoop');
      return;
    }
    closeModal();
    showToast('Bytesförslag skickat!');
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ── Inloggning / AE ID barter or pay ─────────────────────────────
function setupAuth() {
  document.getElementById('btnLogin').addEventListener('click', simulateLogin);
  document.getElementById('btnActivateCard')?.addEventListener('click', simulateLogin);
  document.getElementById('btnOrderCard')?.addEventListener('click', () => {
    showToast('Kortbeställning öppnas — WebAuthn-enrolment via AE ID barter or pay');
  });
}

function simulateLogin() {
  // Simulerad WebAuthn-inloggning
  showToast('Håll AE ID barter or pay-kortet mot NFC-läsaren…');
  setTimeout(() => {
    state.isLoggedIn = true;
    updateAuthUI();
    showToast('Inloggad! Välkommen till AestimAi.');
  }, 1800);
}

function updateAuthUI() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const btn  = document.getElementById('btnLogin');

  if (state.isLoggedIn) {
    dot.classList.add('active');
    text.textContent = 'Inloggad';
    btn.textContent  = 'Logga ut';
    btn.onclick      = () => { state.isLoggedIn = false; updateAuthUI(); };

    document.getElementById('idcoopUnauth')?.classList.add('hidden');
    document.getElementById('idcoopAuth')?.classList.remove('hidden');
    document.getElementById('proGate')?.classList.add('hidden');
    document.getElementById('proContent')?.classList.remove('hidden');
  } else {
    dot.classList.remove('active');
    text.textContent = 'Ej inloggad';
    btn.textContent  = 'Logga in med AE ID barter or pay';
    btn.onclick      = simulateLogin;

    document.getElementById('idcoopUnauth')?.classList.remove('hidden');
    document.getElementById('idcoopAuth')?.classList.add('hidden');
  }
}

// ── Foton ───────────────────────────────────────────
function setupPhotoUpload() {
  const addBtn   = document.getElementById('addPhotoBtn');
  const photoInput = document.getElementById('photoInput');
  const grid     = document.getElementById('photoGrid');

  addBtn?.addEventListener('click', () => photoInput.click());
  photoInput?.addEventListener('change', e => {
    const files = Array.from(e.target.files).slice(0, 8);
    files.forEach(file => {
      if (grid.querySelectorAll('.photo-slot:not(.add-photo)').length >= 8) return;
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
let uciChart   = null;
let dashLoaded = false;

async function loadMarketDashboard() {
  if (dashLoaded) return;
  try {
    const res  = await fetch(`${UCI_SERVER}/api/uci/history`);
    dashData   = await res.json();
    dashLoaded = true;
    renderDashboard(dashData, 30);
  } catch (e) {
    console.warn('[Dashboard] Kunde inte ladda historik:', e.message);
  }
  loadCommentary();
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

let activeCurrency = 'EUR';

function onDashCurrencyChange() {
  const sel = document.getElementById('dashCurrencySelect');
  if (!sel || !dashData) return;
  activeCurrency = sel.value;
  const activeDaysBtn = document.querySelector('.range-tab.active');
  const days = activeDaysBtn ? parseInt(activeDaysBtn.dataset.days) : 30;
  renderDashboard(dashData, days);
}

function renderDashboard({ history, stats }, days) {
  // Filtrera historik baserat på valt intervall
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

  // Ritning av graf i vald valuta
  renderChart(slice, cur);
}

function setEl(id, text, colorClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (colorClass) el.className = el.className.replace(/\bpos\b|\bneg\b/g, '') + ' ' + colorClass;
}

function renderChart(slice, cur) {
  cur = cur || CURRENCIES[activeCurrency] || CURRENCIES.SEK;
  const ctx = document.getElementById('uciChart');
  if (!ctx) return;

  const labels = slice.map(h => h.date);
  const values = slice.map(h => h[cur.rateKey] || h.rateSEK);
  const first  = values[0];
  const isUp   = values[values.length - 1] >= first;
  const color  = isUp ? '#1D6B4E' : '#BA7517';

  if (uciChart) uciChart.destroy();

  uciChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data:            values,
        borderColor:     color,
        borderWidth:     2,
        pointRadius:     0,
        pointHoverRadius: 4,
        fill:            true,
        backgroundColor: ctx2d => {
          const g = ctx2d.chart.ctx.createLinearGradient(0, 0, 0, 300);
          g.addColorStop(0, isUp ? 'rgba(29,107,78,0.18)' : 'rgba(186,117,23,0.18)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          return g;
        },
        tension: 0.3,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111210',
          titleColor:      '#fff',
          bodyColor:       'rgba(255,255,255,0.7)',
          callbacks: {
            title: items => items[0].label,
            label: item => ` ${item.raw.toFixed(cur.decimals)} ${cur.label}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { color: 'rgba(0,0,0,0.05)', drawTicks: false },
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
          grid:  { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#888780', callback: v => v.toFixed(cur.decimals) + ' ' + cur.label },
          border: { display: false },
        },
      },
    },
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
  setupMarketModal();
  setupAuth();
  setupPhotoUpload();
  setupUciAdjust();
  setupApiKey();
  setupDataModuleLinks();
  setupNews();

  // Survey vote-knapp
  document.getElementById('btnSubmitVote')?.addEventListener('click', submitVote);

  // Dashboard range-tabs
  document.querySelectorAll('.dash-range-tabs .range-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-range-tabs .range-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (dashData) renderDashboard(dashData, parseInt(btn.dataset.days));
    });
  });

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
