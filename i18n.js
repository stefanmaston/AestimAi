/* AestimAi Web — språk & inställningar (matchar mobilappens 6 språk) */
(function (global) {
  const APP_LANGUAGES = ['sv', 'en', 'de', 'fr', 'it', 'es'];
  const DEFAULT_LANGUAGE = 'sv';
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
      'nav.settings': 'Inställningar',
      'settings.title': 'Inställningar',
      'settings.desc': 'Språk och visningsvaluta för UCI Marknadsdata.',
      'settings.language.title': 'Språk',
      'settings.language.desc': 'Samma språk som i mobilappen. Påverkar AI-värderingar och gränssnittet.',
      'settings.language.saved': 'Språk uppdaterat.',
      'settings.currency.title': 'Visningsvaluta (Marknadsdata)',
      'settings.currency.desc': 'Gäller Search Cap, Verified Cap och liknande summeringar — inte diagrammet.',
      'settings.currency.saved': 'Visningsvaluta uppdaterad.',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Totalt antal värderingar',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Genomförda byten / köp',
      'dash.valuations': 'värderingar',
      'dash.transactions': 'transaktioner',
    },
    en: {
      'nav.settings': 'Settings',
      'settings.title': 'Settings',
      'settings.desc': 'Language and display currency for UCI Market Data.',
      'settings.language.title': 'Language',
      'settings.language.desc': 'Same languages as the mobile app. Affects AI valuations and the interface.',
      'settings.language.saved': 'Language updated.',
      'settings.currency.title': 'Display currency (Market Data)',
      'settings.currency.desc': 'Applies to Search Cap, Verified Cap and similar summaries — not the chart.',
      'settings.currency.saved': 'Display currency updated.',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Total valuations',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Completed trades / purchases',
      'dash.valuations': 'valuations',
      'dash.transactions': 'transactions',
    },
    de: {
      'nav.settings': 'Einstellungen',
      'settings.title': 'Einstellungen',
      'settings.desc': 'Sprache und Anzeigewährung für UCI-Marktdaten.',
      'settings.language.title': 'Sprache',
      'settings.language.desc': 'Gleiche Sprachen wie in der mobilen App. Beeinflusst KI-Bewertungen und die Oberfläche.',
      'settings.language.saved': 'Sprache aktualisiert.',
      'settings.currency.title': 'Anzeigewährung (Marktdaten)',
      'settings.currency.desc': 'Gilt für Search Cap, Verified Cap und ähnliche Summen — nicht für das Diagramm.',
      'settings.currency.saved': 'Anzeigewährung aktualisiert.',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Bewertungen gesamt',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Abgeschlossene Tauschgeschäfte / Käufe',
      'dash.valuations': 'Bewertungen',
      'dash.transactions': 'Transaktionen',
    },
    fr: {
      'nav.settings': 'Paramètres',
      'settings.title': 'Paramètres',
      'settings.desc': 'Langue et devise d\'affichage pour les données de marché UCI.',
      'settings.language.title': 'Langue',
      'settings.language.desc': 'Mêmes langues que l\'application mobile. Affecte les évaluations IA et l\'interface.',
      'settings.language.saved': 'Langue mise à jour.',
      'settings.currency.title': 'Devise d\'affichage (Marché)',
      'settings.currency.desc': 'S\'applique au Search Cap, Verified Cap et résumés similaires — pas au graphique.',
      'settings.currency.saved': 'Devise d\'affichage mise à jour.',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Total des évaluations',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Échanges / achats réalisés',
      'dash.valuations': 'évaluations',
      'dash.transactions': 'transactions',
    },
    it: {
      'nav.settings': 'Impostazioni',
      'settings.title': 'Impostazioni',
      'settings.desc': 'Lingua e valuta di visualizzazione per i dati di mercato UCI.',
      'settings.language.title': 'Lingua',
      'settings.language.desc': 'Stesse lingue dell\'app mobile. Influenza le valutazioni IA e l\'interfaccia.',
      'settings.language.saved': 'Lingua aggiornata.',
      'settings.currency.title': 'Valuta di visualizzazione (Mercato)',
      'settings.currency.desc': 'Si applica a Search Cap, Verified Cap e riepiloghi simili — non al grafico.',
      'settings.currency.saved': 'Valuta di visualizzazione aggiornata.',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Valutazioni totali',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Scambi / acquisti completati',
      'dash.valuations': 'valutazioni',
      'dash.transactions': 'transazioni',
    },
    es: {
      'nav.settings': 'Ajustes',
      'settings.title': 'Ajustes',
      'settings.desc': 'Idioma y moneda de visualización para datos de mercado UCI.',
      'settings.language.title': 'Idioma',
      'settings.language.desc': 'Mismos idiomas que la app móvil. Afecta las valoraciones IA y la interfaz.',
      'settings.language.saved': 'Idioma actualizado.',
      'settings.currency.title': 'Moneda de visualización (Mercado)',
      'settings.currency.desc': 'Aplica a Search Cap, Verified Cap y resúmenes similares — no al gráfico.',
      'settings.currency.saved': 'Moneda de visualización actualizada.',
      'dash.searchCap': 'Search Cap',
      'dash.searchCapSub': 'Valoraciones totales',
      'dash.verifiedCap': 'Verified Cap',
      'dash.verifiedCapSub': 'Intercambios / compras completados',
      'dash.valuations': 'valoraciones',
      'dash.transactions': 'transacciones',
    },
  };

  let currentLang = DEFAULT_LANGUAGE;
  let capDisplayCurrency = 'SEK';
  let onChange = null;

  function isAppLanguage(v) {
    return typeof v === 'string' && APP_LANGUAGES.includes(v);
  }

  function deviceLanguage() {
    const raw = (navigator.language || DEFAULT_LANGUAGE).toLowerCase().replace('_', '-');
    const code = raw.split('-')[0];
    return isAppLanguage(code) ? code : DEFAULT_LANGUAGE;
  }

  function t(key) {
    return STRINGS[currentLang]?.[key] || STRINGS[DEFAULT_LANGUAGE]?.[key] || key;
  }

  function localeTag(lang = currentLang) {
    return LOCALE_TAGS[isAppLanguage(lang) ? lang : DEFAULT_LANGUAGE];
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
  }

  function hydrate() {
    const storedLang = localStorage.getItem(LANG_STORAGE);
    currentLang = isAppLanguage(storedLang) ? storedLang : deviceLanguage();

    const storedCap = localStorage.getItem(CAP_CURRENCY_STORAGE);
    capDisplayCurrency = CAP_CURRENCIES.includes(storedCap) ? storedCap : 'SEK';

    applyTranslations();
  }

  async function setLanguage(lang, opts = {}) {
    if (!isAppLanguage(lang)) return;
    currentLang = lang;
    localStorage.setItem(LANG_STORAGE, lang);
    applyTranslations();
    if (!opts.silent && typeof onChange === 'function') onChange('language', lang);
  }

  async function applyLanguageFromUserMeta(metaLang) {
    if (isAppLanguage(metaLang) && metaLang !== currentLang) {
      await setLanguage(metaLang, { silent: true });
    }
  }

  function setCapDisplayCurrency(code, opts = {}) {
    if (!CAP_CURRENCIES.includes(code)) return;
    capDisplayCurrency = code;
    localStorage.setItem(CAP_CURRENCY_STORAGE, code);
    if (!opts.silent && typeof onChange === 'function') onChange('currency', code);
  }

  function renderLanguageButtons(container) {
    if (!container) return;
    container.innerHTML = APP_LANGUAGES.map(code => `
      <button type="button" class="settings-lang-btn${code === currentLang ? ' active' : ''}" data-lang="${code}">
        ${LANGUAGE_LABELS[code]}
      </button>
    `).join('');
    container.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        setLanguage(btn.dataset.lang);
        container.querySelectorAll('.settings-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  global.AestimI18n = {
    APP_LANGUAGES,
    CAP_CURRENCIES,
    LANGUAGE_LABELS,
    hydrate,
    t,
    localeTag,
    getLanguage: () => currentLang,
    getCapDisplayCurrency: () => capDisplayCurrency,
    setLanguage,
    setCapDisplayCurrency,
    applyLanguageFromUserMeta,
    renderLanguageButtons,
    applyTranslations,
    set onSettingsChange(fn) { onChange = fn; },
  };
})(window);
