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

  /** API category values (Swedish) → i18n label keys */
  const UCI_CATEGORY_KEYS = {
    '': 'uci.categoryPlaceholder',
    Fastighet: 'uci.cat.realEstate',
    Fordon: 'uci.cat.vehicle',
    Verktyg: 'uci.cat.tools',
    Elektronik: 'uci.cat.electronics',
    Kläder: 'uci.cat.clothing',
    Möbler: 'uci.cat.furniture',
    Värdemetaller: 'uci.cat.preciousMetals',
    'Tjänster / Tid': 'uci.cat.services',
    Energiutrustning: 'uci.cat.energy',
    'Tokeniserade tillgångar': 'uci.cat.tokenized',
    Övrigt: 'uci.cat.other',
  };

  /** API subject values (Swedish) → i18n label keys */
  const CONTACT_SUBJECT_KEYS = {
    'Allmän fråga': 'contact.subject.general',
    'Värdering & UCI': 'contact.subject.valuation',
    Bytesmarknad: 'contact.subject.marketplace',
    'Enterprise & partnerskap': 'contact.subject.enterprise',
    'Teknisk support': 'contact.subject.support',
    Övrigt: 'contact.subject.other',
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
      'uci.title': 'UCI Värdering',
      'uci.desc': 'AI-driven värdering med respondentvalidering — inloggning krävs för >3 sökningar',
      'uci.placeholder': 'Beskriv vad du vill värdera, ju mer detaljer desto bättre…',
      'uci.categoryPlaceholder': 'Välj kategori',
      'uci.cat.realEstate': 'Fastighet',
      'uci.cat.vehicle': 'Fordon',
      'uci.cat.tools': 'Verktyg',
      'uci.cat.electronics': 'Elektronik',
      'uci.cat.clothing': 'Kläder',
      'uci.cat.furniture': 'Möbler',
      'uci.cat.preciousMetals': 'Värdemetaller',
      'uci.cat.services': 'Tjänster / Tid',
      'uci.cat.energy': 'Energiutrustning',
      'uci.cat.tokenized': 'Tokeniserade tillgångar',
      'uci.cat.other': 'Övrigt',
      'uci.conditionLabel': 'Skick:',
      'uci.cond1': '1 — Dåligt',
      'uci.cond2': '2 — Slitet',
      'uci.cond3': '3 — OK',
      'uci.cond4': '4 — Bra',
      'uci.cond5': '5 — Utmärkt',
      'uci.removeImage': 'Klicka för att ta bort',
      'uci.photoLabel': 'Bild:',
      'uci.photoHint': 'Valfritt — förbättrar precisionen',
      'uci.photoAddTitle': 'Lägg till bild',
      'uci.btnValuate': 'Värdera',
      'uci.btnLoading': 'Analyserar…',
      'uci.loadingText': 'AestimAi analyserar objektet…',
      'contact.title': 'Kontakta oss',
      'contact.sub': 'Har du frågor om AestimAi, värderingsmodeller, partnerskap eller enterprise-lösningar? Vi svarar inom 1–2 arbetsdagar.',
      'contact.channelEmail': 'E-post',
      'contact.channelEnterprise': 'Enterprise & partnerskap',
      'contact.channelSupport': 'Teknisk support',
      'contact.formTitle': 'Skicka ett meddelande',
      'contact.labelName': 'Ditt namn',
      'contact.labelEmail': 'E-postadress',
      'contact.labelSubject': 'Ämne',
      'contact.labelMessage': 'Meddelande',
      'contact.placeholderName': 'Förnamn Efternamn',
      'contact.placeholderEmail': 'din@epost.se',
      'contact.placeholderMessage': 'Beskriv ditt ärende…',
      'contact.success': '✓ Ditt meddelande har skickats! Vi återkommer inom 1–2 arbetsdagar.',
      'contact.btnSubmit': 'Skicka meddelande',
      'contact.btnSending': 'Skickar…',
      'contact.errName': 'Ange ditt namn.',
      'contact.errEmail': 'Ange din e-postadress.',
      'contact.errMessage': 'Skriv ett meddelande.',
      'contact.errSend': 'Kunde inte skicka. Försök igen eller mejla kontakt@aestimai.org.',
      'contact.subject.general': 'Allmän fråga',
      'contact.subject.valuation': 'Värdering & UCI',
      'contact.subject.marketplace': 'Bytesmarknad',
      'contact.subject.enterprise': 'Enterprise & partnerskap',
      'contact.subject.support': 'Teknisk support',
      'contact.subject.other': 'Övrigt',
      'panel.contact': '<h4>Kontakt</h4><p>Frågor om värdering, bytesmarknad, enterprise eller teknisk support — vi svarar inom 1–2 arbetsdagar.</p>',
      'auth.login': 'Logga in',
      'auth.register': 'Skapa konto',
      'auth.myAccount': 'Mitt konto',
      'auth.signOut': 'Logga ut',
      'auth.licenseAccept': 'Jag har läst och godkänner <a href="/legal/" target="_blank" rel="noopener">AestimAi User License Agreement</a> (version 2026-06-11).',
      'auth.licenseRequired': 'Du måste godkänna licensavtalet för att skapa konto.',
      'legal.acceptedLabel': 'Licensavtal',
      'legal.viewAgreement': 'Visa User License Agreement',
      'legal.notRecorded': 'Ej registrerat',
      'legal.settingsTitle': 'Juridiskt',
      'legal.settingsDesc': 'User License Agreement för AestimAi-plattformen och UCI.',
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
      'uci.title': 'UCI Valuation',
      'uci.desc': 'AI-driven valuation with respondent validation — login required after 3 searches',
      'uci.placeholder': 'Describe what you want to value — the more detail, the better…',
      'uci.categoryPlaceholder': 'Select category',
      'uci.cat.realEstate': 'Real estate',
      'uci.cat.vehicle': 'Vehicle',
      'uci.cat.tools': 'Tools',
      'uci.cat.electronics': 'Electronics',
      'uci.cat.clothing': 'Clothing',
      'uci.cat.furniture': 'Furniture',
      'uci.cat.preciousMetals': 'Precious metals',
      'uci.cat.services': 'Services / Time',
      'uci.cat.energy': 'Energy equipment',
      'uci.cat.tokenized': 'Tokenized assets',
      'uci.cat.other': 'Other',
      'uci.conditionLabel': 'Condition:',
      'uci.cond1': '1 — Poor',
      'uci.cond2': '2 — Worn',
      'uci.cond3': '3 — OK',
      'uci.cond4': '4 — Good',
      'uci.cond5': '5 — Excellent',
      'uci.removeImage': 'Click to remove',
      'uci.photoLabel': 'Photo:',
      'uci.photoHint': 'Optional — improves accuracy',
      'uci.photoAddTitle': 'Add photo',
      'uci.btnValuate': 'Valuate',
      'uci.btnLoading': 'Analyzing…',
      'uci.loadingText': 'AestimAi is analyzing the item…',
      'contact.title': 'Contact us',
      'contact.sub': 'Questions about AestimAi, valuation models, partnerships or enterprise solutions? We reply within 1–2 business days.',
      'contact.channelEmail': 'Email',
      'contact.channelEnterprise': 'Enterprise & partnerships',
      'contact.channelSupport': 'Technical support',
      'contact.formTitle': 'Send a message',
      'contact.labelName': 'Your name',
      'contact.labelEmail': 'Email address',
      'contact.labelSubject': 'Subject',
      'contact.labelMessage': 'Message',
      'contact.placeholderName': 'First name Last name',
      'contact.placeholderEmail': 'you@example.com',
      'contact.placeholderMessage': 'Describe your inquiry…',
      'contact.success': '✓ Your message has been sent! We will get back to you within 1–2 business days.',
      'contact.btnSubmit': 'Send message',
      'contact.btnSending': 'Sending…',
      'contact.errName': 'Please enter your name.',
      'contact.errEmail': 'Please enter your email address.',
      'contact.errMessage': 'Please write a message.',
      'contact.errSend': 'Could not send. Try again or email kontakt@aestimai.org.',
      'contact.subject.general': 'General inquiry',
      'contact.subject.valuation': 'Valuation & UCI',
      'contact.subject.marketplace': 'Marketplace',
      'contact.subject.enterprise': 'Enterprise & partnerships',
      'contact.subject.support': 'Technical support',
      'contact.subject.other': 'Other',
      'panel.contact': '<h4>Contact</h4><p>Questions about valuation, marketplace, enterprise or technical support — we reply within 1–2 business days.</p>',
      'auth.login': 'Log in',
      'auth.register': 'Create account',
      'auth.myAccount': 'My account',
      'auth.signOut': 'Log out',
      'auth.licenseAccept': 'I have read and agree to the <a href="/legal/" target="_blank" rel="noopener">AestimAi User License Agreement</a> (version 2026-06-11).',
      'auth.licenseRequired': 'You must accept the User License Agreement to create an account.',
      'legal.acceptedLabel': 'License agreement',
      'legal.viewAgreement': 'View User License Agreement',
      'legal.notRecorded': 'Not recorded',
      'legal.settingsTitle': 'Legal',
      'legal.settingsDesc': 'User License Agreement for the AestimAi platform and UCI.',
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
      'uci.title': 'UCI-Bewertung',
      'uci.desc': 'KI-gestützte Bewertung mit Respondentenvalidierung — Anmeldung nach 3 Suchen erforderlich',
      'uci.placeholder': 'Beschreiben Sie den Gegenstand — je mehr Details, desto besser…',
      'uci.categoryPlaceholder': 'Kategorie wählen',
      'uci.cat.realEstate': 'Immobilie',
      'uci.cat.vehicle': 'Fahrzeug',
      'uci.cat.tools': 'Werkzeuge',
      'uci.cat.electronics': 'Elektronik',
      'uci.cat.clothing': 'Kleidung',
      'uci.cat.furniture': 'Möbel',
      'uci.cat.preciousMetals': 'Edelmetalle',
      'uci.cat.services': 'Dienstleistungen / Zeit',
      'uci.cat.energy': 'Energieausrüstung',
      'uci.cat.tokenized': 'Tokenisierte Vermögenswerte',
      'uci.cat.other': 'Sonstiges',
      'uci.conditionLabel': 'Zustand:',
      'uci.cond1': '1 — Schlecht',
      'uci.cond2': '2 — Abgenutzt',
      'uci.cond3': '3 — OK',
      'uci.cond4': '4 — Gut',
      'uci.cond5': '5 — Ausgezeichnet',
      'uci.photoLabel': 'Foto:',
      'uci.photoHint': 'Optional — verbessert die Genauigkeit',
      'uci.photoAddTitle': 'Foto hinzufügen',
      'uci.btnValuate': 'Bewerten',
      'uci.btnLoading': 'Analysiere…',
      'uci.loadingText': 'AestimAi analysiert den Gegenstand…',
      'contact.title': 'Kontakt',
      'contact.sub': 'Fragen zu AestimAi, Bewertungsmodellen, Partnerschaften oder Enterprise-Lösungen? Wir antworten innerhalb von 1–2 Werktagen.',
      'contact.channelEmail': 'E-Mail',
      'contact.channelEnterprise': 'Enterprise & Partnerschaften',
      'contact.channelSupport': 'Technischer Support',
      'contact.formTitle': 'Nachricht senden',
      'contact.labelName': 'Ihr Name',
      'contact.labelEmail': 'E-Mail-Adresse',
      'contact.labelSubject': 'Betreff',
      'contact.labelMessage': 'Nachricht',
      'contact.placeholderName': 'Vorname Nachname',
      'contact.placeholderEmail': 'ihre@email.de',
      'contact.placeholderMessage': 'Beschreiben Sie Ihr Anliegen…',
      'contact.success': '✓ Ihre Nachricht wurde gesendet! Wir melden uns innerhalb von 1–2 Werktagen.',
      'contact.btnSubmit': 'Nachricht senden',
      'contact.btnSending': 'Wird gesendet…',
      'contact.errName': 'Bitte geben Sie Ihren Namen ein.',
      'contact.errEmail': 'Bitte geben Sie Ihre E-Mail-Adresse ein.',
      'contact.errMessage': 'Bitte schreiben Sie eine Nachricht.',
      'contact.errSend': 'Senden fehlgeschlagen. Versuchen Sie es erneut oder mailen Sie kontakt@aestimai.org.',
      'contact.subject.general': 'Allgemeine Anfrage',
      'contact.subject.valuation': 'Bewertung & UCI',
      'contact.subject.marketplace': 'Marktplatz',
      'contact.subject.enterprise': 'Enterprise & Partnerschaften',
      'contact.subject.support': 'Technischer Support',
      'contact.subject.other': 'Sonstiges',
      'panel.contact': '<h4>Kontakt</h4><p>Fragen zu Bewertung, Marktplatz, Enterprise oder Support — Antwort innerhalb von 1–2 Werktagen.</p>',
      'auth.login': 'Anmelden',
      'auth.register': 'Konto erstellen',
      'auth.myAccount': 'Mein Konto',
      'auth.signOut': 'Abmelden',
      'auth.licenseAccept': 'Ich habe das <a href="/legal/" target="_blank" rel="noopener">AestimAi User License Agreement</a> gelesen und akzeptiere es (Version 2026-06-11).',
      'auth.licenseRequired': 'Sie müssen die Lizenzvereinbarung akzeptieren, um ein Konto zu erstellen.',
      'legal.acceptedLabel': 'Lizenzvereinbarung',
      'legal.viewAgreement': 'User License Agreement anzeigen',
      'legal.notRecorded': 'Nicht erfasst',
      'legal.settingsTitle': 'Rechtliches',
      'legal.settingsDesc': 'User License Agreement für die AestimAi-Plattform und UCI.',
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
      'uci.title': 'Évaluation UCI',
      'uci.desc': 'Évaluation IA avec validation par répondants — connexion requise après 3 recherches',
      'uci.placeholder': 'Décrivez ce que vous voulez évaluer — plus de détails, mieux c\'est…',
      'uci.categoryPlaceholder': 'Choisir une catégorie',
      'uci.cat.realEstate': 'Immobilier',
      'uci.cat.vehicle': 'Véhicule',
      'uci.cat.tools': 'Outils',
      'uci.cat.electronics': 'Électronique',
      'uci.cat.clothing': 'Vêtements',
      'uci.cat.furniture': 'Meubles',
      'uci.cat.preciousMetals': 'Métaux précieux',
      'uci.cat.services': 'Services / Temps',
      'uci.cat.energy': 'Équipement énergétique',
      'uci.cat.tokenized': 'Actifs tokenisés',
      'uci.cat.other': 'Autre',
      'uci.conditionLabel': 'État :',
      'uci.cond1': '1 — Mauvais',
      'uci.cond2': '2 — Usé',
      'uci.cond3': '3 — OK',
      'uci.cond4': '4 — Bon',
      'uci.cond5': '5 — Excellent',
      'uci.photoLabel': 'Photo :',
      'uci.photoHint': 'Facultatif — améliore la précision',
      'uci.photoAddTitle': 'Ajouter une photo',
      'uci.btnValuate': 'Évaluer',
      'uci.btnLoading': 'Analyse…',
      'uci.loadingText': 'AestimAi analyse l\'objet…',
      'contact.title': 'Contactez-nous',
      'contact.sub': 'Des questions sur AestimAi, les modèles de valorisation, les partenariats ou l\'enterprise ? Réponse sous 1–2 jours ouvrés.',
      'contact.channelEmail': 'E-mail',
      'contact.channelEnterprise': 'Enterprise & partenariats',
      'contact.channelSupport': 'Support technique',
      'contact.formTitle': 'Envoyer un message',
      'contact.labelName': 'Votre nom',
      'contact.labelEmail': 'Adresse e-mail',
      'contact.labelSubject': 'Objet',
      'contact.labelMessage': 'Message',
      'contact.placeholderName': 'Prénom Nom',
      'contact.placeholderEmail': 'vous@exemple.com',
      'contact.placeholderMessage': 'Décrivez votre demande…',
      'contact.success': '✓ Votre message a été envoyé ! Nous vous répondrons sous 1–2 jours ouvrés.',
      'contact.btnSubmit': 'Envoyer le message',
      'contact.btnSending': 'Envoi…',
      'contact.errName': 'Veuillez indiquer votre nom.',
      'contact.errEmail': 'Veuillez indiquer votre adresse e-mail.',
      'contact.errMessage': 'Veuillez écrire un message.',
      'contact.errSend': 'Échec de l\'envoi. Réessayez ou écrivez à kontakt@aestimai.org.',
      'contact.subject.general': 'Question générale',
      'contact.subject.valuation': 'Valorisation & UCI',
      'contact.subject.marketplace': 'Marché',
      'contact.subject.enterprise': 'Enterprise & partenariats',
      'contact.subject.support': 'Support technique',
      'contact.subject.other': 'Autre',
      'panel.contact': '<h4>Contact</h4><p>Questions sur la valorisation, le marché, l\'enterprise ou le support — réponse sous 1–2 jours ouvrés.</p>',
      'auth.login': 'Se connecter',
      'auth.register': 'Créer un compte',
      'auth.myAccount': 'Mon compte',
      'auth.signOut': 'Se déconnecter',
      'auth.licenseAccept': 'J\'ai lu et j\'accepte le <a href="/legal/" target="_blank" rel="noopener">AestimAi User License Agreement</a> (version 2026-06-11).',
      'auth.licenseRequired': 'Vous devez accepter le contrat de licence pour créer un compte.',
      'legal.acceptedLabel': 'Contrat de licence',
      'legal.viewAgreement': 'Voir le User License Agreement',
      'legal.notRecorded': 'Non enregistré',
      'legal.settingsTitle': 'Juridique',
      'legal.settingsDesc': 'User License Agreement pour la plateforme AestimAi et l\'UCI.',
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
      'uci.title': 'Valutazione UCI',
      'uci.desc': 'Valutazione IA con validazione dei rispondenti — login richiesto dopo 3 ricerche',
      'uci.placeholder': 'Descrivi cosa vuoi valutare — più dettagli, meglio è…',
      'uci.categoryPlaceholder': 'Seleziona categoria',
      'uci.cat.realEstate': 'Immobile',
      'uci.cat.vehicle': 'Veicolo',
      'uci.cat.tools': 'Utensili',
      'uci.cat.electronics': 'Elettronica',
      'uci.cat.clothing': 'Abbigliamento',
      'uci.cat.furniture': 'Mobili',
      'uci.cat.preciousMetals': 'Metalli preziosi',
      'uci.cat.services': 'Servizi / Tempo',
      'uci.cat.energy': 'Attrezzatura energetica',
      'uci.cat.tokenized': 'Asset tokenizzati',
      'uci.cat.other': 'Altro',
      'uci.conditionLabel': 'Condizione:',
      'uci.cond1': '1 — Scarso',
      'uci.cond2': '2 — Consumato',
      'uci.cond3': '3 — OK',
      'uci.cond4': '4 — Buono',
      'uci.cond5': '5 — Eccellente',
      'uci.photoLabel': 'Foto:',
      'uci.photoHint': 'Facoltativo — migliora la precisione',
      'uci.photoAddTitle': 'Aggiungi foto',
      'uci.btnValuate': 'Valuta',
      'uci.btnLoading': 'Analisi…',
      'uci.loadingText': 'AestimAi sta analizzando l\'oggetto…',
      'contact.title': 'Contattaci',
      'contact.sub': 'Domande su AestimAi, modelli di valutazione, partnership o soluzioni enterprise? Rispondiamo entro 1–2 giorni lavorativi.',
      'contact.channelEmail': 'E-mail',
      'contact.channelEnterprise': 'Enterprise & partnership',
      'contact.channelSupport': 'Supporto tecnico',
      'contact.formTitle': 'Invia un messaggio',
      'contact.labelName': 'Il tuo nome',
      'contact.labelEmail': 'Indirizzo e-mail',
      'contact.labelSubject': 'Oggetto',
      'contact.labelMessage': 'Messaggio',
      'contact.placeholderName': 'Nome Cognome',
      'contact.placeholderEmail': 'tu@esempio.com',
      'contact.placeholderMessage': 'Descrivi la tua richiesta…',
      'contact.success': '✓ Il tuo messaggio è stato inviato! Ti risponderemo entro 1–2 giorni lavorativi.',
      'contact.btnSubmit': 'Invia messaggio',
      'contact.btnSending': 'Invio…',
      'contact.errName': 'Inserisci il tuo nome.',
      'contact.errEmail': 'Inserisci il tuo indirizzo e-mail.',
      'contact.errMessage': 'Scrivi un messaggio.',
      'contact.errSend': 'Invio non riuscito. Riprova o scrivi a kontakt@aestimai.org.',
      'contact.subject.general': 'Domanda generale',
      'contact.subject.valuation': 'Valutazione & UCI',
      'contact.subject.marketplace': 'Mercato',
      'contact.subject.enterprise': 'Enterprise & partnership',
      'contact.subject.support': 'Supporto tecnico',
      'contact.subject.other': 'Altro',
      'panel.contact': '<h4>Contatto</h4><p>Domande su valutazione, mercato, enterprise o supporto — risposta entro 1–2 giorni lavorativi.</p>',
      'auth.login': 'Accedi',
      'auth.register': 'Crea account',
      'auth.myAccount': 'Il mio account',
      'auth.signOut': 'Esci',
      'auth.licenseAccept': 'Ho letto e accetto il <a href="/legal/" target="_blank" rel="noopener">AestimAi User License Agreement</a> (versione 2026-06-11).',
      'auth.licenseRequired': 'Devi accettare il contratto di licenza per creare un account.',
      'legal.acceptedLabel': 'Contratto di licenza',
      'legal.viewAgreement': 'Visualizza User License Agreement',
      'legal.notRecorded': 'Non registrato',
      'legal.settingsTitle': 'Legale',
      'legal.settingsDesc': 'User License Agreement per la piattaforma AestimAi e UCI.',
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
      'uci.title': 'Valoración UCI',
      'uci.desc': 'Valoración con IA y validación por encuestados — inicio de sesión tras 3 búsquedas',
      'uci.placeholder': 'Describe lo que quieres valorar — cuantos más detalles, mejor…',
      'uci.categoryPlaceholder': 'Elegir categoría',
      'uci.cat.realEstate': 'Inmueble',
      'uci.cat.vehicle': 'Vehículo',
      'uci.cat.tools': 'Herramientas',
      'uci.cat.electronics': 'Electrónica',
      'uci.cat.clothing': 'Ropa',
      'uci.cat.furniture': 'Muebles',
      'uci.cat.preciousMetals': 'Metales preciosos',
      'uci.cat.services': 'Servicios / Tiempo',
      'uci.cat.energy': 'Equipamiento energético',
      'uci.cat.tokenized': 'Activos tokenizados',
      'uci.cat.other': 'Otros',
      'uci.conditionLabel': 'Estado:',
      'uci.cond1': '1 — Malo',
      'uci.cond2': '2 — Desgastado',
      'uci.cond3': '3 — OK',
      'uci.cond4': '4 — Bueno',
      'uci.cond5': '5 — Excelente',
      'uci.photoLabel': 'Foto:',
      'uci.photoHint': 'Opcional — mejora la precisión',
      'uci.photoAddTitle': 'Añadir foto',
      'uci.btnValuate': 'Valorar',
      'uci.btnLoading': 'Analizando…',
      'uci.loadingText': 'AestimAi está analizando el objeto…',
      'contact.title': 'Contáctanos',
      'contact.sub': '¿Preguntas sobre AestimAi, modelos de valoración, partnerships o enterprise? Respondemos en 1–2 días laborables.',
      'contact.channelEmail': 'Correo electrónico',
      'contact.channelEnterprise': 'Enterprise y partnerships',
      'contact.channelSupport': 'Soporte técnico',
      'contact.formTitle': 'Enviar un mensaje',
      'contact.labelName': 'Tu nombre',
      'contact.labelEmail': 'Correo electrónico',
      'contact.labelSubject': 'Asunto',
      'contact.labelMessage': 'Mensaje',
      'contact.placeholderName': 'Nombre Apellido',
      'contact.placeholderEmail': 'tu@ejemplo.com',
      'contact.placeholderMessage': 'Describe tu consulta…',
      'contact.success': '✓ ¡Tu mensaje ha sido enviado! Te responderemos en 1–2 días laborables.',
      'contact.btnSubmit': 'Enviar mensaje',
      'contact.btnSending': 'Enviando…',
      'contact.errName': 'Introduce tu nombre.',
      'contact.errEmail': 'Introduce tu correo electrónico.',
      'contact.errMessage': 'Escribe un mensaje.',
      'contact.errSend': 'No se pudo enviar. Inténtalo de nuevo o escribe a kontakt@aestimai.org.',
      'contact.subject.general': 'Consulta general',
      'contact.subject.valuation': 'Valoración y UCI',
      'contact.subject.marketplace': 'Mercado',
      'contact.subject.enterprise': 'Enterprise y partnerships',
      'contact.subject.support': 'Soporte técnico',
      'contact.subject.other': 'Otros',
      'panel.contact': '<h4>Contacto</h4><p>Preguntas sobre valoración, mercado, enterprise o soporte — respuesta en 1–2 días laborables.</p>',
      'auth.login': 'Iniciar sesión',
      'auth.register': 'Crear cuenta',
      'auth.myAccount': 'Mi cuenta',
      'auth.signOut': 'Cerrar sesión',
      'auth.licenseAccept': 'He leído y acepto el <a href="/legal/" target="_blank" rel="noopener">AestimAi User License Agreement</a> (versión 2026-06-11).',
      'auth.licenseRequired': 'Debes aceptar el acuerdo de licencia para crear una cuenta.',
      'legal.acceptedLabel': 'Acuerdo de licencia',
      'legal.viewAgreement': 'Ver User License Agreement',
      'legal.notRecorded': 'No registrado',
      'legal.settingsTitle': 'Legal',
      'legal.settingsDesc': 'User License Agreement para la plataforma AestimAi y UCI.',
    },
  };

  APP_LANGUAGES.forEach(lang => {
    if (global.LAB_I18N?.[lang]) Object.assign(STRINGS[lang], global.LAB_I18N[lang]);
  });
  APP_LANGUAGES.forEach(lang => {
    if (global.MARKET_I18N?.[lang]) Object.assign(STRINGS[lang], global.MARKET_I18N[lang]);
  });
  APP_LANGUAGES.forEach(lang => {
    if (global.SITE_I18N?.[lang]) Object.assign(STRINGS[lang], global.SITE_I18N[lang]);
  });
  APP_LANGUAGES.forEach(lang => {
    if (global.ABOUT_I18N?.[lang]) Object.assign(STRINGS[lang], global.ABOUT_I18N[lang]);
  });
  APP_LANGUAGES.forEach(lang => {
    if (global.PRO_I18N?.[lang]) Object.assign(STRINGS[lang], global.PRO_I18N[lang]);
  });

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

  function updateUciCategoryOptions() {
    const sel = document.getElementById('uciCategory');
    if (!sel) return;
    sel.querySelectorAll('option').forEach(opt => {
      const key = UCI_CATEGORY_KEYS[opt.value];
      if (key) opt.textContent = t(key);
    });
  }

  function updateContactSubjectOptions() {
    const sel = document.getElementById('cfSubject');
    if (!sel) return;
    sel.querySelectorAll('option').forEach(opt => {
      const key = CONTACT_SUBJECT_KEYS[opt.value];
      if (key) opt.textContent = t(key);
    });
  }

  function updateUciDynamicLabels() {
    const btn = document.getElementById('btnUciValue');
    const btnText = document.getElementById('btnUciText');
    if (btnText && btn && !btn.disabled) btnText.textContent = t('uci.btnValuate');

    const loadingP = document.querySelector('#uciLoading p');
    if (loadingP) loadingP.textContent = t('uci.loadingText');

    const addPhoto = document.getElementById('valAddPhotoBtn');
    if (addPhoto) addPhoto.title = t('uci.photoAddTitle');
  }

  function updateContactDynamicLabels() {
    const btn = document.getElementById('btnCfSubmit');
    const btnTxt = document.getElementById('btnCfText');
    if (btnTxt && btn && !btn.disabled) btnTxt.textContent = t('contact.btnSubmit');
  }

  function updateMarketSelectLabels() {
    document.querySelectorAll('#marketCatFilter option[data-i18n], #itemCategory option[data-i18n]').forEach(opt => {
      const key = opt.getAttribute('data-i18n');
      if (key) opt.textContent = t(key);
    });
    document.querySelectorAll('#marketKindFilter option[data-i18n], #itemKind option[data-i18n]').forEach(opt => {
      const key = opt.getAttribute('data-i18n');
      if (key) opt.textContent = t(key);
    });
    document.querySelectorAll('#itemCondition option[data-i18n]').forEach(opt => {
      const key = opt.getAttribute('data-i18n');
      if (key) opt.textContent = t(key);
    });
  }

  function updateMarketDynamicLabels() {
    if (typeof window.refreshListingQuotaHint === 'function') window.refreshListingQuotaHint();
  }

  function updateDashSelectLabels() {
    const sel = document.getElementById('dashCatSelect');
    if (!sel) return;
    sel.querySelectorAll('option[data-i18n]').forEach(opt => {
      const key = opt.getAttribute('data-i18n');
      if (key) opt.textContent = t(key);
    });
  }

  function updateWalletStaticLabels() {
    const connect = document.getElementById('btnConnectWallet');
    if (connect && !connect.disabled) {
      const icon = connect.querySelector('.wallet-icon');
      const label = t('wallet.connect');
      if (icon) connect.innerHTML = `<span class="wallet-icon">⬡</span> ${label}`;
      else connect.textContent = label;
    }
    const sw = document.getElementById('btnSwitchNetwork');
    if (sw && !sw.disabled) sw.textContent = t('wallet.switchNetwork');
    const disc = document.getElementById('btnDisconnectWallet');
    if (disc) disc.title = t('wallet.disconnectTitle');
    const refresh = document.getElementById('btnRefreshChain');
    if (refresh && !refresh.disabled) refresh.textContent = t('wallet.refreshChain');
  }

  function applyTranslations() {
    document.documentElement.lang = localeTag();
    document.title = t('site.title');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', t(key));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });
    updateCurrencySelectLabels();
    updateUciCategoryOptions();
    updateContactSubjectOptions();
    updateUciDynamicLabels();
    updateContactDynamicLabels();
    updateMarketSelectLabels();
    updateMarketDynamicLabels();
    updateDashSelectLabels();
    updateWalletStaticLabels();
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
    if (!container) return;
    if (container.querySelector('[data-lang]')) return;
    container.innerHTML = APP_LANGUAGES.map(code => `
      <button type="button" class="settings-lang-btn" data-lang="${code}">
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
    if (!container) return;
    mountLanguageGrid(container);
    syncLanguageButtonStates(container);
    if (container.dataset.bound) return;
    container.dataset.bound = '1';
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-lang]');
      if (!btn) return;
      e.preventDefault();
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
