// ── AestimAi i18n — språkhantering ──────────────────────────
// Lägg till fler nycklar allt eftersom appen växer.

const LANGUAGES = {
  sv: { flag: '🇸🇪', label: 'Svenska' },
  en: { flag: '🇬🇧', label: 'English' },
  no: { flag: '🇳🇴', label: 'Norsk' },
  de: { flag: '🇩🇪', label: 'Deutsch' },
  fr: { flag: '🇫🇷', label: 'Français' },
};

const TRANSLATIONS = {

  // ── Navigation ──────────────────────────────────────────
  'nav.uci':        { sv: 'UCI Värdering',    en: 'UCI Valuation',    no: 'UCI Verdisetting', de: 'UCI Bewertung',     fr: 'Évaluation UCI'    },
  'nav.dashboard':  { sv: 'UCI Marknadsdata', en: 'UCI Market Data',  no: 'UCI Markedsdata',  de: 'UCI Marktdaten',    fr: 'Données marché UCI' },
  'nav.market':     { sv: 'UCI Bytesmarknad', en: 'UCI Barter Market',no: 'UCI Byttemarknad', de: 'UCI Tauschmarkt',   fr: 'Marché troc UCI'   },
  'nav.pro':        { sv: 'AestimAi Pro',     en: 'AestimAi Pro',     no: 'AestimAi Pro',     de: 'AestimAi Pro',      fr: 'AestimAi Pro'      },
  'nav.idcoop':     { sv: 'AE ID barter or pay', en: 'AE ID barter or pay', no: 'AE ID barter or pay', de: 'AE ID barter or pay', fr: 'AE ID barter or pay' },
  'nav.news':       { sv: 'Nyheter',          en: 'News',             no: 'Nyheter',           de: 'Nachrichten',       fr: 'Actualités'        },

  // ── Badges ──────────────────────────────────────────────
  'badge.free':     { sv: 'Gratis', en: 'Free', no: 'Gratis', de: 'Kostenlos', fr: 'Gratuit' },
  'badge.live':     { sv: 'Live',   en: 'Live', no: 'Live',   de: 'Live',      fr: 'En direct' },
  'badge.new':      { sv: 'Nytt',   en: 'New',  no: 'Nytt',   de: 'Neu',       fr: 'Nouveau' },

  // ── Auth / wallet ────────────────────────────────────────
  'auth.notLoggedIn': { sv: 'Ej inloggad',           en: 'Not logged in',        no: 'Ikke innlogget',       de: 'Nicht angemeldet',     fr: 'Non connecté'         },
  'auth.login':       { sv: 'Logga in med AE ID',    en: 'Sign in with AE ID',   no: 'Logg inn med AE ID',   de: 'Mit AE ID anmelden',   fr: 'Connexion avec AE ID' },

  // ── UCI Värdering ────────────────────────────────────────
  'uci.title':      { sv: 'UCI Värdering',         en: 'UCI Valuation',        no: 'UCI Verdisetting',     de: 'UCI Bewertung',         fr: 'Évaluation UCI'        },
  'uci.desc':       { sv: 'AI-driven värdering med respondentvalidering — ingen inloggning krävs',
                      en: 'AI-driven valuation with respondent validation — no login required',
                      no: 'AI-drevet verdisetting med respondentvalidering — ingen innlogging kreves',
                      de: 'KI-gestützte Bewertung mit Respondenten-Validierung — keine Anmeldung erforderlich',
                      fr: 'Évaluation pilotée par IA avec validation répondants — aucune connexion requise' },
  'uci.placeholder':{ sv: 'Beskriv vad du vill värdera — t.ex. "40 timmars snickeriarbete" eller "iPhone 14 Pro 256GB"',
                      en: 'Describe what you want to value — e.g. "40 hours carpentry work" or "iPhone 14 Pro 256GB"',
                      no: 'Beskriv hva du vil verdisette — f.eks. "40 timers snekkerarbeid" eller "iPhone 14 Pro 256GB"',
                      de: 'Beschreiben Sie, was Sie bewerten möchten — z.B. "40 Stunden Schreinerarbeit" oder "iPhone 14 Pro 256GB"',
                      fr: 'Décrivez ce que vous souhaitez évaluer — ex: "40h de menuiserie" ou "iPhone 14 Pro 256 Go"' },
  'uci.btn.value':  { sv: 'Värdera →',   en: 'Value →',    no: 'Verdisett →',  de: 'Bewerten →',   fr: 'Évaluer →'   },
  'uci.btn.submit': { sv: 'Skicka in',   en: 'Submit',     no: 'Send inn',     de: 'Einreichen',   fr: 'Soumettre'   },

  // ── UCI Marknadsdata ─────────────────────────────────────
  'dash.title':     { sv: 'UCI Marknadsdata',       en: 'UCI Market Data',      no: 'UCI Markedsdata',      de: 'UCI Marktdaten',        fr: 'Données marché UCI'    },
  'dash.desc':      { sv: 'Universal Coin Index — kursutveckling, nyckeltal och valutaparitet',
                      en: 'Universal Coin Index — price history, key metrics and currency parity',
                      no: 'Universal Coin Index — kursutvikling, nøkkeltall og valutaparitet',
                      de: 'Universal Coin Index — Kursentwicklung, Kennzahlen und Währungsparität',
                      fr: 'Universal Coin Index — évolution du cours, indicateurs clés et parité des devises' },
  'dash.updated':   { sv: 'Uppdaterad',  en: 'Updated',    no: 'Oppdatert',    de: 'Aktualisiert', fr: 'Mis à jour'  },

  // ── UCI Bytesmarknad ─────────────────────────────────────
  'market.title':   { sv: 'UCI Bytesmarknad',       en: 'UCI Barter Market',    no: 'UCI Byttemarknad',     de: 'UCI Tauschmarkt',       fr: 'Marché troc UCI'       },
  'market.desc':    { sv: 'Registrera och byt varor, tjänster och tillgångar via UCI',
                      en: 'Register and exchange goods, services and assets via UCI',
                      no: 'Registrer og bytt varer, tjenester og eiendeler via UCI',
                      de: 'Waren, Dienstleistungen und Vermögenswerte über UCI registrieren und tauschen',
                      fr: 'Enregistrer et échanger biens, services et actifs via UCI' },

  // ── Nyheter ──────────────────────────────────────────────
  'news.title':     { sv: 'Nyheter',   en: 'News',      no: 'Nyheter',   de: 'Nachrichten', fr: 'Actualités' },
};

// ── Kärna ────────────────────────────────────────────────────
let currentLang = localStorage.getItem('aestimai_lang') || 'sv';

function t(key) {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  return entry[currentLang] || entry['sv'] || key;
}

function setLanguage(lang) {
  if (!LANGUAGES[lang]) return;
  currentLang = lang;
  localStorage.setItem('aestimai_lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
  updateLangSelector();
}

function applyTranslations() {
  // Alla element med data-i18n-attribut
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const attr = el.dataset.i18nAttr; // valfritt: placeholder, title, etc.
    if (attr) {
      el.setAttribute(attr, t(key));
    } else {
      el.textContent = t(key);
    }
  });
}

function updateLangSelector() {
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = currentLang;

  const btn = document.getElementById('langBtn');
  if (btn) btn.textContent = LANGUAGES[currentLang]?.flag || '🌐';
}

function buildLangDropdown() {
  const wrap = document.getElementById('langSelectorWrap');
  if (!wrap) return;

  const btn = document.createElement('button');
  btn.id = 'langBtn';
  btn.className = 'lang-btn';
  btn.title = 'Välj språk / Select language';
  btn.textContent = LANGUAGES[currentLang]?.flag || '🌐';

  const dropdown = document.createElement('div');
  dropdown.className = 'lang-dropdown';
  dropdown.id = 'langDropdown';

  Object.entries(LANGUAGES).forEach(([code, info]) => {
    const item = document.createElement('button');
    item.className = 'lang-option' + (code === currentLang ? ' active' : '');
    item.dataset.lang = code;
    item.innerHTML = `<span class="lang-flag">${info.flag}</span><span class="lang-name">${info.label}</span>`;
    item.onclick = () => {
      setLanguage(code);
      dropdown.classList.remove('open');
      document.querySelectorAll('.lang-option').forEach(o => o.classList.toggle('active', o.dataset.lang === code));
    };
    dropdown.appendChild(item);
  });

  btn.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  };

  document.addEventListener('click', () => dropdown.classList.remove('open'));

  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
}

// Kör när DOM är klar
document.addEventListener('DOMContentLoaded', () => {
  buildLangDropdown();
  applyTranslations();
  updateLangSelector();
});
