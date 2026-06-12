/* AestimAi Web — språk & inställningar (matchar mobilappens 6 språk) */
(function (global) {
  const APP_LANGUAGES = ['sv', 'en', 'de', 'fr', 'it', 'es'];
  const DEFAULT_LANGUAGE = 'en';
  const DEFAULT_CAP_CURRENCY = 'EUR';
  const LANG_STORAGE = '@aestimai/preferred_language';
  const CAP_CURRENCY_STORAGE = '@aestimai/cap_display_currency';
  const CAP_CURRENCIES = ['SEK', 'EUR', 'USD'];

  const LOCALE_TAGS = {
    sv: 'sv-SE', en: 'en-US', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', es: 'es-ES',
  };

  const LANGUAGE_LABELS = {
    sv: 'Svenska', en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español',
  };

  const STRINGS = {
    sv: {
      'nav.uci': 'UCI Värdering',
      'nav.market': 'UCI Bytesmarknad',
      'nav.dashboard': 'UCI Marknadsdata',
      'nav.pro': 'AestimAi Pro',
      'nav.ucilab': 'AestimAi Lab',
      'nav.news': 'Nyheter',
      'nav.pricing': 'Priser & Konto',
      'nav.about': 'Om AestimAi',
      'nav.settings': 'Inställningar',
      'nav.contact': 'Kontakt',
      'settings.title': 'Inställningar',
      'settings.desc': 'Språk och visningsvaluta för UCI Marknadsdata.',
      'settings.language.title': 'Språk',
      'settings.language.desc': 'Samma språk som i mobilappen. Påverkar AI-värderingar och menyn.',
      'settings.language.saved': 'Språk uppdaterat.',
      'settings.currency.title': 'Visningsvaluta (Marknadsdata)',
      'settings.currency.desc': 'Gäller Search Cap, Verified Cap och liknande summeringar — inte diagrammet.',
      'settings.currency.saved': 'Visningsvaluta uppdaterad.',
      'settings.currency.sek': 'SEK — Svenska kronor',
      'settings.currency.eur': 'EUR — Euro',
      'settings.currency.usd': 'USD — US-dollar',
      'panel.settings': '<h4>Inställningar</h4><p>Välj språk och visningsvaluta för UCI Marknadsdata. Språket sparas i webbläsaren och synkas till ditt konto när du är inloggad.</p>',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Totalt antal värderingar',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Genomförda byten / köp',
      'dash.valuations': 'värderingar',
      'dash.transactions': 'transaktioner',
    },
    en: {
      'nav.uci': 'UCI Valuation',
      'nav.market': 'UCI Marketplace',
      'nav.dashboard': 'UCI Market Data',
      'nav.pro': 'AestimAi Pro',
      'nav.ucilab': 'AestimAi Lab',
      'nav.news': 'News',
      'nav.pricing': 'Pricing & Account',
      'nav.about': 'About AestimAi',
      'nav.settings': 'Settings',
      'nav.contact': 'Contact',
      'settings.title': 'Settings',
      'settings.desc': 'Language and display currency for UCI Market Data.',
      'settings.language.title': 'Language',
      'settings.language.desc': 'Same languages as the mobile app. Affects AI valuations and the menu.',
      'settings.language.saved': 'Language updated.',
      'settings.currency.title': 'Display currency (Market Data)',
      'settings.currency.desc': 'Applies to Search Cap, Verified Cap and similar summaries — not the chart.',
      'settings.currency.saved': 'Display currency updated.',
      'settings.currency.sek': 'SEK — Swedish kronor',
      'settings.currency.eur': 'EUR — Euro',
      'settings.currency.usd': 'USD — US dollar',
      'panel.settings': '<h4>Settings</h4><p>Choose language and display currency for UCI Market Data. Your choice is saved in the browser and synced to your account when logged in.</p>',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Total valuations',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Completed trades / purchases',
      'dash.valuations': 'valuations',
      'dash.transactions': 'transactions',
    },
    de: {
      'nav.uci': 'UCI-Bewertung',
      'nav.market': 'UCI-Marktplatz',
      'nav.dashboard': 'UCI-Marktdaten',
      'nav.pro': 'AestimAi Pro',
      'nav.ucilab': 'AestimAi Lab',
      'nav.news': 'Nachrichten',
      'nav.pricing': 'Preise & Konto',
      'nav.about': 'Über AestimAi',
      'nav.settings': 'Einstellungen',
      'nav.contact': 'Kontakt',
      'settings.title': 'Einstellungen',
      'settings.desc': 'Sprache und Anzeigewährung für UCI-Marktdaten.',
      'settings.language.title': 'Sprache',
      'settings.language.desc': 'Gleiche Sprachen wie in der mobilen App. Beeinflusst KI-Bewertungen und das Menü.',
      'settings.language.saved': 'Sprache aktualisiert.',
      'settings.currency.title': 'Anzeigewährung (Marktdaten)',
      'settings.currency.desc': 'Gilt für Search Cap, Verified Cap und ähnliche Summen — nicht für das Diagramm.',
      'settings.currency.saved': 'Anzeigewährung aktualisiert.',
      'settings.currency.sek': 'SEK — Schwedische Kronen',
      'settings.currency.eur': 'EUR — Euro',
      'settings.currency.usd': 'USD — US-Dollar',
      'panel.settings': '<h4>Einstellungen</h4><p>Sprache und Anzeigewährung für UCI-Marktdaten wählen. Die Einstellung wird im Browser gespeichert und mit Ihrem Konto synchronisiert.</p>',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Bewertungen gesamt',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Abgeschlossene Tauschgeschäfte / Käufe',
      'dash.valuations': 'Bewertungen',
      'dash.transactions': 'Transaktionen',
    },
    fr: {
      'nav.uci': 'Évaluation UCI',
      'nav.market': 'Marché UCI',
      'nav.dashboard': 'Données de marché UCI',
      'nav.pro': 'AestimAi Pro',
      'nav.ucilab': 'AestimAi Lab',
      'nav.news': 'Actualités',
      'nav.pricing': 'Tarifs & Compte',
      'nav.about': 'À propos d\'AestimAi',
      'nav.settings': 'Paramètres',
      'nav.contact': 'Contact',
      'settings.title': 'Paramètres',
      'settings.desc': 'Langue et devise d\'affichage pour les données de marché UCI.',
      'settings.language.title': 'Langue',
      'settings.language.desc': 'Mêmes langues que l\'application mobile. Affecte les évaluations IA et le menu.',
      'settings.language.saved': 'Langue mise à jour.',
      'settings.currency.title': 'Devise d\'affichage (Marché)',
      'settings.currency.desc': 'S\'applique au Search Cap, Verified Cap et résumés similaires — pas au graphique.',
      'settings.currency.saved': 'Devise d\'affichage mise à jour.',
      'settings.currency.sek': 'SEK — Couronnes suédoises',
      'settings.currency.eur': 'EUR — Euro',
      'settings.currency.usd': 'USD — Dollar US',
      'panel.settings': '<h4>Paramètres</h4><p>Choisissez la langue et la devise d\'affichage pour les données de marché UCI. Enregistré dans le navigateur et synchronisé avec votre compte.</p>',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Total des évaluations',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Échanges / achats réalisés',
      'dash.valuations': 'évaluations',
      'dash.transactions': 'transactions',
    },
    it: {
      'nav.uci': 'Valutazione UCI',
      'nav.market': 'Mercato UCI',
      'nav.dashboard': 'Dati di mercato UCI',
      'nav.pro': 'AestimAi Pro',
      'nav.ucilab': 'AestimAi Lab',
      'nav.news': 'Notizie',
      'nav.pricing': 'Prezzi & Account',
      'nav.about': 'Informazioni su AestimAi',
      'nav.settings': 'Impostazioni',
      'nav.contact': 'Contatto',
      'settings.title': 'Impostazioni',
      'settings.desc': 'Lingua e valuta di visualizzazione per i dati di mercato UCI.',
      'settings.language.title': 'Lingua',
      'settings.language.desc': 'Stesse lingue dell\'app mobile. Influenza le valutazioni IA e il menu.',
      'settings.language.saved': 'Lingua aggiornata.',
      'settings.currency.title': 'Valuta di visualizzazione (Mercato)',
      'settings.currency.desc': 'Si applica a Search Cap, Verified Cap e riepiloghi simili — non al grafico.',
      'settings.currency.saved': 'Valuta di visualizzazione aggiornata.',
      'settings.currency.sek': 'SEK — Corone svedesi',
      'settings.currency.eur': 'EUR — Euro',
      'settings.currency.usd': 'USD — Dollaro USA',
      'panel.settings': '<h4>Impostazioni</h4><p>Scegli lingua e valuta di visualizzazione per i dati di mercato UCI. Salvato nel browser e sincronizzato con il tuo account.</p>',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Valutazioni totali',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Scambi / acquisti completati',
      'dash.valuations': 'valutazioni',
      'dash.transactions': 'transazioni',
    },
    es: {
      'nav.uci': 'Valoración UCI',
      'nav.market': 'Mercado UCI',
      'nav.dashboard': 'Datos de mercado UCI',
      'nav.pro': 'AestimAi Pro',
      'nav.ucilab': 'AestimAi Lab',
      'nav.news': 'Noticias',
      'nav.pricing': 'Precios y cuenta',
      'nav.about': 'Acerca de AestimAi',
      'nav.settings': 'Ajustes',
      'nav.contact': 'Contacto',
      'settings.title': 'Ajustes',
      'settings.desc': 'Idioma y moneda de visualización para datos de mercado UCI.',
      'settings.language.title': 'Idioma',
      'settings.language.desc': 'Mismos idiomas que la app móvil. Afecta las valoraciones IA y el menú.',
      'settings.language.saved': 'Idioma actualizado.',
      'settings.currency.title': 'Moneda de visualización (Mercado)',
      'settings.currency.desc': 'Aplica a Search Cap, Verified Cap y resúmenes similares — no al gráfico.',
      'settings.currency.saved': 'Moneda de visualización actualizada.',
      'settings.currency.sek': 'SEK — Coronas suecas',
      'settings.currency.eur': 'EUR — Euro',
      'settings.currency.usd': 'USD — Dólar estadounidense',
      'panel.settings': '<h4>Ajustes</h4><p>Elige idioma y moneda de visualización para los datos de mercado UCI. Se guarda en el navegador y se sincroniza con tu cuenta.</p>',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Valoraciones totales',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Intercambios / compras completados',
      'dash.valuations': 'valoraciones',
      'dash.transactions': 'transacciones',
    },
  };

  let currentLang = DEFAULT_LANGUAGE;
  let capDisplayCurrency = DEFAULT_CAP_CURRENCY;
  let onChange = null;

  function isAppLanguage(v) {
    return typeof v === 'string' && APP_LANGUAGES.includes(v);
  }

  function hasStoredLanguage() {
    return isAppLanguage(localStorage.getItem(LANG_STORAGE));
  }

  function t(key) {
    return STRINGS[currentLang]?.[key] || STRINGS[DEFAULT_LANGUAGE]?.[key] || key;
  }

  function localeTag(lang = currentLang) {
    return LOCALE_TAGS[isAppLanguage(lang) ? lang : DEFAULT_LANGUAGE];
  }

  function updateCurrencySelectLabels() {
    const sel = document.getElementById('settingsCapCurrency');
    if (!sel) return;
    const map = { SEK: 'settings.currency.sek', EUR: 'settings.currency.eur', USD: 'settings.currency.usd' };
    sel.querySelectorAll('option').forEach(opt => {
      const key = map[opt.value];
      if (key) opt.textContent = t(key);
    });
    sel.value = capDisplayCurrency;
  }

  function applyTranslations() {
    document.documentElement.lang = localeTag();
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });
    updateCurrencySelectLabels();
  }

  function hydrate() {
    const storedLang = localStorage.getItem(LANG_STORAGE);
    currentLang = isAppLanguage(storedLang) ? storedLang : DEFAULT_LANGUAGE;

    const storedCap = localStorage.getItem(CAP_CURRENCY_STORAGE);
    capDisplayCurrency = CAP_CURRENCIES.includes(storedCap) ? storedCap : DEFAULT_CAP_CURRENCY;

    applyTranslations();
  }

  async function setLanguage(lang, opts = {}) {
    if (!isAppLanguage(lang)) return;
    currentLang = lang;
    localStorage.setItem(LANG_STORAGE, lang);
    applyTranslations();
    syncLanguageButtonStates(document.getElementById('settingsLangGrid'));
    if (!opts.silent && typeof onChange === 'function') onChange('language', lang);
  }

  async function applyLanguageFromUserMeta(metaLang) {
    if (hasStoredLanguage()) return;
    if (isAppLanguage(metaLang)) await setLanguage(metaLang, { silent: true });
  }

  function setCapDisplayCurrency(code, opts = {}) {
    if (!CAP_CURRENCIES.includes(code)) return;
    capDisplayCurrency = code;
    localStorage.setItem(CAP_CURRENCY_STORAGE, code);
    const sel = document.getElementById('settingsCapCurrency');
    if (sel) sel.value = code;
    if (!opts.silent && typeof onChange === 'function') onChange('currency', code);
  }

  function mountLanguageGrid(container) {
    if (!container || container.dataset.mounted) return;
    container.dataset.mounted = '1';
    container.innerHTML = APP_LANGUAGES.map(code => `
      <button type="button" class="settings-lang-btn${code === currentLang ? ' active' : ''}" data-lang="${code}">
        ${LANGUAGE_LABELS[code]}
      </button>
    `).join('');
  }

  function syncLanguageButtonStates(container) {
    if (!container) return;
    container.querySelectorAll('[data-lang]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }

  function bindLanguageGrid(container) {
    mountLanguageGrid(container);
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-lang]');
      if (!btn) return;
      setLanguage(btn.dataset.lang);
    });
  }

  global.AestimI18n = {
    APP_LANGUAGES,
    CAP_CURRENCIES,
    DEFAULT_LANGUAGE,
    DEFAULT_CAP_CURRENCY,
    LANGUAGE_LABELS,
    LANG_STORAGE,
    hydrate,
    t,
    localeTag,
    getLanguage: () => currentLang,
    getCapDisplayCurrency: () => capDisplayCurrency,
    setLanguage,
    setCapDisplayCurrency,
    applyLanguageFromUserMeta,
    bindLanguageGrid,
    syncLanguageButtonStates,
    applyTranslations,
    set onSettingsChange(fn) { onChange = fn; },
  };
})(window);
