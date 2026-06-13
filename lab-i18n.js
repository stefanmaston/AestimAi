/* AestimAi Lab — page copy (merged into i18n.js STRINGS) */
(function (global) {
  const ENGINE = {
    sv: `<div class="lab-engine-intro">
          <p class="lab-engine-lead">AestimAi Lab baseras på en kontinuerlig utveckling av en avancerad AI-arkitektur för agentisk, retrieval-grundad och kalibrerad värdering med gradvis självförbättrande (autodidaktisk) precision.</p>
          <p>Inom AestimAi Lab har vi avsikten att uppnå Universal Coin Index (UCI) — ett universellt giltigt värdeindex som kan användas i många olika tillämpningar, både privat och publikt.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Kärnskifte</h2>
          <p>Dagens lösning bygger på att AestimAi-modellen själv ”gissar” ett pris utifrån en beskrivning och eventuella bilder, men den gör detta med ”Big-Data”-inferens i bakgrunden och ett slags adaptivt regelsystem. Målet är att ersätta de traditionella värderingsmodellerna med en agentisk, retrieval-grundad och kalibrerad värderingsmotor, där modellen resonerar över verkliga marknadsdata snarare än att estimera med olika fördefinierade antaganden och uppskattningar.</p>
          <p>Detta höjer precisionen, ger trovärdiga osäkerhetsintervall och gör systemet granskningsbart — vilket är centralt för UCI som ett juridiskt definierat värderingsindexmått.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Arkitektur — lager för lager</h2>
          <article class="lab-layer"><h3>1. Multimodal perception</h3><ul><li>AestimAi vision analysis module stödjer högupplösta bilder (upp till 2576 px), vilket markant förbättrar objektidentifiering och skickbedömning från foto.</li><li>Bilder laddas upp via Files API — en gång, och kan sedan återanvändas i flera anrop utan ny uppladdning, vilket minskar latens och kostnad.</li></ul><p class="lab-layer-desc">Detta lager hanterar all visuell indata från användaren (foton på objekt, dokumentation, skick) och omvandlar den till strukturerad information som senare lager kan resonera kring.</p></article>
          <article class="lab-layer"><h3>2. Retrieval-Augmented Valuation (RAG)</h3><ul><li>Värderingen grundas i faktiska jämförbara försäljningar (Tradera, Blocket, auktioner, eBay) via en vektordatabas i kombination med strukturerade comparables (“comps”).</li><li><code>web_search_20260209</code> med dynamisk filtrering (inbyggt i AestimAi) används för att hämta färska marknadspriser utan att förorena kontextfönstret med onödigt brus.</li></ul><p class="lab-layer-desc">Genom att modellen aktivt hämtar och resonerar över verkliga, färska prisdata från jämförbara objekt, övergår systemet från ren språkmodell-gissning till en evidensbaserad värdering — analogt med hur en mänsklig värderingsman använder marknadsdata och jämförelseobjekt.</p></article>
          <article class="lab-layer"><h3>3. Agentisk orkestrering (tool use)</h3><ul><li>En agent-loop planerar och exekverar stegen: identifiera objekt → hämta comps → köra hedonisk ML-modell → ställa kontrollfrågor → fusionera resultat → motivera värderingen.</li><li>Kan implementeras som en egen tool-use-loop i UCI-servern, eller via Managed Agents i AestimAi som sköter loopen och sandlådan.</li></ul><p class="lab-layer-desc">Detta lager gör värderingen till en process snarare än ett enskilt anrop. Genom att bryta upp uppgiften i delsteg som kan verifieras och loggas separat, blir hela flödet både mer robust och mer transparent — en förutsättning för UCI:s krav på verifierad motprestation och spårbarhet.</p></article>
          <article class="lab-layer"><h3>4. Ensemble + Bayesiansk fusion</h3><ul><li>Flera skattare kombineras till en posterior-fördelning: (a) LLM-estimatet, (b) en gradient-boosted hedonisk modell (XGBoost/LightGBM) för datatäta kategorier, (c) hämtade comps, (d) respondent-/crowd-röster.</li></ul><p class="lab-layer-desc">Genom att kombinera flera oberoende värderingskällor med Bayesiansk viktning minskar systemets känslighet för enskilda felkällor. Detta är ”Bayesian voting” gjort på ett statistiskt korrekt sätt, i stället för en enkel medelvärdesbildning.</p></article>
          <article class="lab-layer"><h3>5. Kalibrerad osäkerhet — conformal prediction</h3><ul><li>Det nuvarande heuristiska 90&nbsp;%-intervallet ersätts med conformal prediction, vilket ger ett konfidensintervall med garanterad täckningsgrad.</li></ul><p class="lab-layer-desc">Conformal prediction är en statistiskt välgrundad metod för prediktionsintervall vars täckningsgrad (t.ex. 90&nbsp;%) håller över tid. För UCI innebär det att osäkerhetsintervallen får en verifierbar, snarare än godtycklig, statistisk grund.</p></article>
          <article class="lab-layer"><h3>6. Adaptiv intelligens (kostnad/kvalitet)</h3><ul><li>Adaptive thinking tillsammans med effort-parametern gör att modellen tänker hårdare på svåra eller tvetydiga objekt, och billigare på enkla.</li><li>Prompt caching på den stora värderingssystemprompten och kategoritaxonomin ger cirka 90&nbsp;% lägre kostnad och snabbare svarstider per anrop.</li><li>Structured outputs gör att JSON-schemat för värderingsresultatet (<code>uci_value</code>, intervall, <code>reasoning</code>, <code>key_factors</code>) alltid blir giltigt och maskinläsbart.</li></ul><p class="lab-layer-desc">Detta lager optimerar resursanvändningen dynamiskt utifrån hur svårt värderingsfallet är, samtidigt som strukturerade utdata garanterar att resultaten alltid kan konsumeras av nedströmssystem utan parsningsfel.</p></article>
          <article class="lab-layer"><h3>7. Federated / continual learning</h3><ul><li>Systemet lär av användarnas värderingar utan att centralisera rådata — federated learning-pelaren i arkitekturen.</li></ul><p class="lab-layer-desc">Genom att träna lokalt på användardata och endast dela modelluppdateringar (inte rå användardata) bibehålls integriteten samtidigt som värderingsmotorn blir bättre över tid.</p></article>
          <article class="lab-layer"><h3>8. Eval, drift &amp; förtroende</h3><ul><li>LLM-as-judge och backtesting mot kända slutpriser används för kontinuerlig kvalitetskontroll, tillsammans med övervakning av modelldrift över tid.</li><li>Batches API (50&nbsp;% lägre kostnad) används för massvärdering eller omvärdering av större bestånd.</li><li>On-chain-förankring av indexvärdena (UCIIndex på Base Sepolia) ger granskningsbarhet och transparens i linje med UCI:s hash-anchoring-arkitektur.</li></ul><p class="lab-layer-desc">Detta lager säkerställer att systemets prestanda kan mätas objektivt över tid, att kostnaderna hålls nere vid storskalig drift, och att värderingar förblir spårbara och manipulationssäkra — i linje med UCI:s status som ett icke-tokeniserat mätinstrument utanför MiCA-scope.</p></article>
        </div>
        <div class="lab-engine-cta"><p>Vill du testa värderingsmotorn i praktiken?</p><button type="button" class="btn-primary" onclick="navigateTo(\'uci\')">Starta UCI Värdering →</button></div>`,

    en: `<div class="lab-engine-intro">
          <p class="lab-engine-lead">AestimAi Lab is built on continuous development of an advanced AI architecture for agentic, retrieval-grounded and calibrated valuation with gradually self-improving (autodidactic) precision.</p>
          <p>Within AestimAi Lab we aim to achieve Universal Coin Index (UCI) — a universally valid value index that can be used in many different applications, both private and public.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Core shift</h2>
          <p>Today’s approach relies on the AestimAi model “guessing” a price from a description and optional images, backed by big-data inference and an adaptive rule system. The goal is to replace traditional valuation models with an agentic, retrieval-grounded and calibrated valuation engine where the model reasons over real market data rather than estimating from predefined assumptions.</p>
          <p>This raises precision, provides credible uncertainty intervals and makes the system auditable — central to UCI as a legally defined valuation index measure.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Architecture — layer by layer</h2>
          <article class="lab-layer"><h3>1. Multimodal perception</h3><ul><li>The AestimAi vision analysis module supports high-resolution images (up to 2576 px), greatly improving object identification and condition assessment from photos.</li><li>Images are uploaded via the Files API once and can be reused across calls without re-upload, reducing latency and cost.</li></ul><p class="lab-layer-desc">This layer handles all visual input from the user (object photos, documentation, condition) and converts it into structured information for later layers to reason over.</p></article>
          <article class="lab-layer"><h3>2. Retrieval-Augmented Valuation (RAG)</h3><ul><li>Valuation is grounded in actual comparable sales (Tradera, Blocket, auctions, eBay) via a vector database combined with structured comparables (“comps”).</li><li><code>web_search_20260209</code> with dynamic filtering (built into AestimAi) fetches fresh market prices without polluting the context window with noise.</li></ul><p class="lab-layer-desc">By actively retrieving and reasoning over real, fresh price data from comparable items, the system moves from pure language-model guessing to evidence-based valuation — similar to how a human appraiser uses market data and comps.</p></article>
          <article class="lab-layer"><h3>3. Agentic orchestration (tool use)</h3><ul><li>An agent loop plans and executes steps: identify object → fetch comps → run hedonic ML model → ask clarifying questions → fuse results → justify the valuation.</li><li>Can be implemented as a dedicated tool-use loop in the UCI server, or via Managed Agents in AestimAi that handle the loop and sandbox.</li></ul><p class="lab-layer-desc">This layer turns valuation into a process rather than a single call. Breaking the task into verifiable, logged sub-steps makes the flow more robust and transparent — required for UCI’s verified consideration and traceability.</p></article>
          <article class="lab-layer"><h3>4. Ensemble + Bayesian fusion</h3><ul><li>Multiple estimators are combined into a posterior distribution: (a) LLM estimate, (b) gradient-boosted hedonic model (XGBoost/LightGBM) for data-rich categories, (c) retrieved comps, (d) respondent/crowd votes.</li></ul><p class="lab-layer-desc">Combining independent valuation sources with Bayesian weighting reduces sensitivity to single points of failure. This is statistically correct “Bayesian voting”, not simple averaging.</p></article>
          <article class="lab-layer"><h3>5. Calibrated uncertainty — conformal prediction</h3><ul><li>The current heuristic 90&nbsp;% interval is replaced with conformal prediction, providing confidence intervals with guaranteed coverage.</li></ul><p class="lab-layer-desc">Conformal prediction is a statistically grounded method for prediction intervals whose coverage (e.g. 90&nbsp;%) holds over time. For UCI, uncertainty intervals gain a verifiable rather than arbitrary statistical basis.</p></article>
          <article class="lab-layer"><h3>6. Adaptive intelligence (cost/quality)</h3><ul><li>Adaptive thinking with the effort parameter makes the model think harder on difficult or ambiguous items, and cheaper on simple ones.</li><li>Prompt caching on the large valuation system prompt and category taxonomy gives ~90&nbsp;% lower cost and faster response times per call.</li><li>Structured outputs ensure the JSON schema for valuation results (<code>uci_value</code>, interval, <code>reasoning</code>, <code>key_factors</code>) is always valid and machine-readable.</li></ul><p class="lab-layer-desc">This layer optimizes resource use dynamically based on case difficulty while structured outputs guarantee downstream systems can consume results without parsing errors.</p></article>
          <article class="lab-layer"><h3>7. Federated / continual learning</h3><ul><li>The system learns from user valuations without centralizing raw data — the federated learning pillar of the architecture.</li></ul><p class="lab-layer-desc">Training locally on user data and sharing only model updates (not raw user data) preserves privacy while the valuation engine improves over time.</p></article>
          <article class="lab-layer"><h3>8. Eval, drift &amp; trust</h3><ul><li>LLM-as-judge and backtesting against known final prices provide continuous quality control, with model drift monitoring over time.</li><li>Batches API (50&nbsp;% lower cost) is used for bulk valuation or revaluation of large portfolios.</li><li>On-chain anchoring of index values (UCIIndex on Base Sepolia) provides auditability and transparency aligned with UCI’s hash-anchoring architecture.</li></ul><p class="lab-layer-desc">This layer ensures performance can be measured objectively over time, costs stay low at scale, and valuations remain traceable and tamper-resistant — aligned with UCI as a non-tokenised measurement instrument outside MiCA scope.</p></article>
        </div>
        <div class="lab-engine-cta"><p>Want to try the valuation engine in practice?</p><button type="button" class="btn-primary" onclick="navigateTo(\'uci\')">Start UCI Valuation →</button></div>`,

    de: `<div class="lab-engine-intro">
          <p class="lab-engine-lead">AestimAi Lab basiert auf der kontinuierlichen Entwicklung einer fortgeschrittenen KI-Architektur für agentische, retrieval-basierte und kalibrierte Bewertung mit schrittweise selbstverbessernder (autodidaktischer) Präzision.</p>
          <p>In AestimAi Lab streben wir den Universal Coin Index (UCI) an — einen universell gültigen Werteindex, der in vielen Anwendungen — privat und öffentlich — genutzt werden kann.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Kernwandel</h2>
          <p>Die heutige Lösung basiert darauf, dass das AestimAi-Modell einen Preis aus Beschreibung und optionalen Bildern „schätzt“, unterstützt durch Big-Data-Inferenz und ein adaptives Regelsystem. Ziel ist es, traditionelle Bewertungsmodelle durch eine agentische, retrieval-basierte und kalibrierte Bewertungsengine zu ersetzen, die über echte Marktdaten reasoniert statt vordefinierte Annahmen zu schätzen.</p>
          <p>Das erhöht die Präzision, liefert glaubwürdige Unsicherheitsintervalle und macht das System prüfbar — zentral für UCI als rechtlich definiertes Bewertungsindex-Maß.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Architektur — Schicht für Schicht</h2>
          <article class="lab-layer"><h3>1. Multimodale Wahrnehmung</h3><ul><li>Das AestimAi Vision-Analysemodul unterstützt hochauflösende Bilder (bis 2576 px) und verbessert Objekterkennung und Zustandsbeurteilung aus Fotos deutlich.</li><li>Bilder werden einmal über die Files API hochgeladen und in mehreren Aufrufen wiederverwendet — weniger Latenz und Kosten.</li></ul><p class="lab-layer-desc">Diese Schicht verarbeitet visuelle Eingaben (Objektfotos, Dokumentation, Zustand) und wandelt sie in strukturierte Information für nachfolgende Schichten um.</p></article>
          <article class="lab-layer"><h3>2. Retrieval-Augmented Valuation (RAG)</h3><ul><li>Die Bewertung stützt sich auf vergleichbare Verkäufe (Tradera, Blocket, Auktionen, eBay) via Vektordatenbank und strukturierte Comparables („Comps“).</li><li><code>web_search_20260209</code> mit dynamischer Filterung (in AestimAi integriert) holt frische Marktpreise ohne Kontextfenster mit Rauschen zu belasten.</li></ul><p class="lab-layer-desc">Durch aktives Abrufen und Reasoning über frische Preisdaten vergleichbarer Objekte geht das System von reiner Sprachmodell-Schätzung zu evidenzbasierter Bewertung über.</p></article>
          <article class="lab-layer"><h3>3. Agentische Orchestrierung (Tool Use)</h3><ul><li>Eine Agent-Schleife plant und führt aus: Objekt identifizieren → Comps holen → hedonic ML-Modell → Rückfragen → Ergebnisse fusionieren → Bewertung begründen.</li><li>Implementierbar als Tool-Use-Loop im UCI-Server oder via Managed Agents in AestimAi.</li></ul><p class="lab-layer-desc">Diese Schicht macht Bewertung zu einem Prozess statt einem einzelnen Aufruf — robuster und transparenter für UCI-Anforderungen an Nachweis und Nachverfolgbarkeit.</p></article>
          <article class="lab-layer"><h3>4. Ensemble + Bayes'sche Fusion</h3><ul><li>Mehrere Schätzer werden zu einer Posterior-Verteilung kombiniert: (a) LLM-Schätzung, (b) gradient-boosted hedonic Modell, (c) Comps, (d) Respondent-/Crowd-Stimmen.</li></ul><p class="lab-layer-desc">Bayes'sche Gewichtung unabhängiger Quellen reduziert Abhängigkeit von Einzelfehlern — statistisch korrektes „Bayesian Voting“ statt einfachem Mittel.</p></article>
          <article class="lab-layer"><h3>5. Kalibrierte Unsicherheit — Conformal Prediction</h3><ul><li>Das heuristische 90&nbsp;%-Intervall wird durch Conformal Prediction ersetzt — Konfidenzintervalle mit garantierter Abdeckung.</li></ul><p class="lab-layer-desc">Conformal Prediction liefert statistisch fundierte Intervalle deren Abdeckung (z. B. 90&nbsp;%) über die Zeit hält — verifizierbare Grundlage für UCI-Unsicherheitsintervalle.</p></article>
          <article class="lab-layer"><h3>6. Adaptive Intelligenz (Kosten/Qualität)</h3><ul><li>Adaptive Thinking mit Effort-Parameter: mehr Denkarbeit bei schwierigen Objekten, günstiger bei einfachen.</li><li>Prompt Caching auf Systemprompt und Kategorietaxonomie: ~90&nbsp;% niedrigere Kosten und schnellere Antworten.</li><li>Structured Outputs garantieren gültiges, maschinenlesbares JSON (<code>uci_value</code>, Intervall, <code>reasoning</code>, <code>key_factors</code>).</li></ul><p class="lab-layer-desc">Dynamische Ressourcenoptimierung je nach Schwierigkeit bei garantiert parse-freien Downstream-Ergebnissen.</p></article>
          <article class="lab-layer"><h3>7. Federated / Continual Learning</h3><ul><li>Das System lernt aus Nutzerbewertungen ohne Rohdaten zu zentralisieren — Federated-Learning-Säule der Architektur.</li></ul><p class="lab-layer-desc">Lokales Training und nur Modell-Updates (keine Rohdaten) schützen die Privatsphäre und verbessern die Engine über die Zeit.</p></article>
          <article class="lab-layer"><h3>8. Eval, Drift &amp; Vertrauen</h3><ul><li>LLM-as-judge und Backtesting gegen bekannte Endpreise für kontinuierliche Qualitätskontrolle und Drift-Monitoring.</li><li>Batches API (50&nbsp;% günstiger) für Massenbewertung großer Bestände.</li><li>On-Chain-Verankerung (UCIIndex auf Base Sepolia) für Prüfbarkeit gemäß UCI Hash-Anchoring.</li></ul><p class="lab-layer-desc">Objektive Leistungsmessung, niedrige Skalenkosten und manipulationssichere, nachverfolgbare Bewertungen — UCI als nicht-tokenisiertes Messinstrument außerhalb MiCA.</p></article>
        </div>
        <div class="lab-engine-cta"><p>Möchten Sie die Bewertungsengine praktisch testen?</p><button type="button" class="btn-primary" onclick="navigateTo(\'uci\')">UCI-Bewertung starten →</button></div>`,

    fr: `<div class="lab-engine-intro">
          <p class="lab-engine-lead">AestimAi Lab repose sur le développement continu d'une architecture IA avancée pour une valorisation agentique, fondée sur la retrieval et calibrée, avec une précision auto-améliorante progressive.</p>
          <p>Dans AestimAi Lab, nous visons l'Universal Coin Index (UCI) — un indice de valeur universel utilisable dans de nombreuses applications, privées et publiques.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Changement de cap</h2>
          <p>La solution actuelle repose sur une « estimation » du prix par le modèle AestimAi à partir d'une description et d'images, avec inférence big data et règles adaptatives. L'objectif est de remplacer les modèles traditionnels par un moteur agentique qui raisonne sur des données de marché réelles.</p>
          <p>Cela améliore la précision, fournit des intervalles d'incertitude crédibles et rend le système auditable — essentiel pour l'UCI comme mesure d'index juridiquement définie.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Architecture — couche par couche</h2>
          <article class="lab-layer"><h3>1. Perception multimodale</h3><ul><li>Le module d'analyse visuelle AestimAi prend en charge des images haute résolution (jusqu'à 2576 px) pour une meilleure identification et évaluation de l'état.</li><li>Images téléversées une fois via l'API Files, réutilisables sans nouveau upload — moins de latence et de coût.</li></ul><p class="lab-layer-desc">Cette couche transforme les entrées visuelles en informations structurées pour les couches suivantes.</p></article>
          <article class="lab-layer"><h3>2. Retrieval-Augmented Valuation (RAG)</h3><ul><li>Valorisation fondée sur des ventes comparables (Tradera, Blocket, enchères, eBay) via base vectorielle et comparables structurés.</li><li><code>web_search_20260209</code> avec filtrage dynamique intégré à AestimAi pour des prix frais sans bruit dans le contexte.</li></ul><p class="lab-layer-desc">Récupération active de prix réels — passage de la pure estimation LLM à une valorisation fondée sur des preuves.</p></article>
          <article class="lab-layer"><h3>3. Orchestration agentique (tool use)</h3><ul><li>Boucle agent : identifier → comps → modèle ML hédonique → questions → fusion → justification.</li><li>Implémentable en boucle tool-use sur le serveur UCI ou via Managed Agents AestimAi.</li></ul><p class="lab-layer-desc">La valorisation devient un processus vérifiable et traçable — requis par l'UCI.</p></article>
          <article class="lab-layer"><h3>4. Ensemble + fusion bayésienne</h3><ul><li>Plusieurs estimateurs combinés : (a) LLM, (b) modèle hédonique gradient-boosted, (c) comps, (d) votes crowd/respondent.</li></ul><p class="lab-layer-desc">Pondération bayésienne de sources indépendantes — vote bayésien statistiquement correct, pas une simple moyenne.</p></article>
          <article class="lab-layer"><h3>5. Incertitude calibrée — conformal prediction</h3><ul><li>L'intervalle heuristique 90&nbsp;% est remplacé par la conformal prediction — couverture garantie.</li></ul><p class="lab-layer-desc">Méthode statistiquement fondée pour des intervalles dont la couverture (ex. 90&nbsp;%) se maintient dans le temps.</p></article>
          <article class="lab-layer"><h3>6. Intelligence adaptive (coût/qualité)</h3><ul><li>Adaptive thinking + paramètre effort : plus de réflexion sur les cas difficiles, moins cher sur les simples.</li><li>Prompt caching : ~90&nbsp;% de coût en moins et réponses plus rapides.</li><li>Structured outputs : JSON toujours valide (<code>uci_value</code>, intervalle, <code>reasoning</code>, <code>key_factors</code>).</li></ul><p class="lab-layer-desc">Optimisation dynamique des ressources selon la difficulté, avec sorties structurées sans erreur de parsing.</p></article>
          <article class="lab-layer"><h3>7. Federated / continual learning</h3><ul><li>Apprentissage des valorisations utilisateur sans centraliser les données brutes.</li></ul><p class="lab-layer-desc">Entraînement local et partage de mises à jour de modèle uniquement — confidentialité préservée, moteur amélioré.</p></article>
          <article class="lab-layer"><h3>8. Eval, drift &amp; confiance</h3><ul><li>LLM-as-judge et backtesting sur prix finaux connus ; surveillance de la dérive du modèle.</li><li>Batches API (50&nbsp;% moins cher) pour valorisation de masse.</li><li>Ancrage on-chain (UCIIndex sur Base Sepolia) aligné sur l'architecture hash-anchoring UCI.</li></ul><p class="lab-layer-desc">Mesure objective, coûts maîtrisés à l'échelle, valorisations traçables — UCI comme instrument de mesure non tokenisé hors MiCA.</p></article>
        </div>
        <div class="lab-engine-cta"><p>Vous voulez tester le moteur en pratique ?</p><button type="button" class="btn-primary" onclick="navigateTo(\'uci\')">Lancer l'évaluation UCI →</button></div>`,

    it: `<div class="lab-engine-intro">
          <p class="lab-engine-lead">AestimAi Lab si basa sullo sviluppo continuo di un'architettura IA avanzata per valutazioni agentiche, retrieval-based e calibrate, con precisione auto-migliorante progressiva.</p>
          <p>In AestimAi Lab puntiamo all'Universal Coin Index (UCI) — un indice di valore universalmente valido utilizzabile in molte applicazioni, private e pubbliche.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Cambio di paradigma</h2>
          <p>L'approccio attuale fa « indovinare » un prezzo al modello AestimAi da descrizione e immagini, con inferenza big data e regole adattive. L'obiettivo è sostituire i modelli tradizionali con un motore agentico che ragiona su dati di mercato reali.</p>
          <p>Questo aumenta la precisione, fornisce intervalli di incertezza credibili e rende il sistema verificabile — centrale per l'UCI come misura di indice legalmente definita.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Architettura — strato per strato</h2>
          <article class="lab-layer"><h3>1. Percezione multimodale</h3><ul><li>Il modulo vision AestimAi supporta immagini ad alta risoluzione (fino a 2576 px) per migliore identificazione e valutazione dello stato.</li><li>Immagini caricate una volta via Files API, riutilizzabili — meno latenza e costo.</li></ul><p class="lab-layer-desc">Gestisce l'input visivo e lo converte in informazioni strutturate per i layer successivi.</p></article>
          <article class="lab-layer"><h3>2. Retrieval-Augmented Valuation (RAG)</h3><ul><li>Valutazione basata su vendite comparabili (Tradera, Blocket, aste, eBay) via database vettoriale e comps strutturati.</li><li><code>web_search_20260209</code> con filtraggio dinamico integrato in AestimAi per prezzi freschi senza rumore.</li></ul><p class="lab-layer-desc">Recupero attivo di prezzi reali — da pura stima LLM a valutazione basata su evidenze.</p></article>
          <article class="lab-layer"><h3>3. Orchestrazione agentica (tool use)</h3><ul><li>Loop agente: identifica oggetto → comps → modello ML edonico → domande → fusione → motivazione.</li><li>Implementabile come loop tool-use nel server UCI o via Managed Agents AestimAi.</li></ul><p class="lab-layer-desc">La valutazione diventa un processo verificabile e tracciabile — richiesto dall'UCI.</p></article>
          <article class="lab-layer"><h3>4. Ensemble + fusione bayesiana</h3><ul><li>Più stimatori combinati: (a) LLM, (b) modello edonico gradient-boosted, (c) comps, (d) voti crowd/respondent.</li></ul><p class="lab-layer-desc">Ponderazione bayesiana di fonti indipendenti — voto bayesiano statisticamente corretto.</p></article>
          <article class="lab-layer"><h3>5. Incertezza calibrata — conformal prediction</h3><ul><li>L'intervallo euristico 90&nbsp;% è sostituito dalla conformal prediction — copertura garantita.</li></ul><p class="lab-layer-desc">Metodo statisticamente fondato per intervalli la cui copertura (es. 90&nbsp;%) si mantiene nel tempo.</p></article>
          <article class="lab-layer"><h3>6. Intelligenza adattiva (costo/qualità)</h3><ul><li>Adaptive thinking + parametro effort: più ragionamento su casi difficili, più economico su quelli semplici.</li><li>Prompt caching: ~90&nbsp;% costo in meno e risposte più rapide.</li><li>Structured outputs: JSON sempre valido (<code>uci_value</code>, intervallo, <code>reasoning</code>, <code>key_factors</code>).</li></ul><p class="lab-layer-desc">Ottimizzazione dinamica delle risorse con output strutturati senza errori di parsing.</p></article>
          <article class="lab-layer"><h3>7. Federated / continual learning</h3><ul><li>Apprendimento dalle valutazioni utente senza centralizzare dati grezzi.</li></ul><p class="lab-layer-desc">Training locale e solo aggiornamenti del modello — privacy preservata, motore migliorato nel tempo.</p></article>
          <article class="lab-layer"><h3>8. Eval, drift &amp; fiducia</h3><ul><li>LLM-as-judge e backtesting su prezzi finali noti; monitoraggio drift del modello.</li><li>Batches API (50&nbsp;% meno costoso) per valutazioni di massa.</li><li>Ancoraggio on-chain (UCIIndex su Base Sepolia) allineato all'architettura hash-anchoring UCI.</li></ul><p class="lab-layer-desc">Misurazione oggettiva, costi contenuti su scala, valutazioni tracciabili — UCI come strumento di misura non tokenizzato fuori MiCA.</p></article>
        </div>
        <div class="lab-engine-cta"><p>Vuoi provare il motore di valutazione?</p><button type="button" class="btn-primary" onclick="navigateTo(\'uci\')">Avvia valutazione UCI →</button></div>`,

    es: `<div class="lab-engine-intro">
          <p class="lab-engine-lead">AestimAi Lab se basa en el desarrollo continuo de una arquitectura IA avanzada para valoración agéntica, basada en retrieval y calibrada, con precisión auto-mejorante gradual.</p>
          <p>En AestimAi Lab buscamos el Universal Coin Index (UCI) — un índice de valor universalmente válido utilizable en muchas aplicaciones, privadas y públicas.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Cambio fundamental</h2>
          <p>La solución actual hace que el modelo AestimAi « adivine » un precio a partir de descripción e imágenes, con inferencia big data y reglas adaptativas. El objetivo es sustituir modelos tradicionales por un motor agéntico que razona sobre datos de mercado reales.</p>
          <p>Esto mejora la precisión, ofrece intervalos de incertidumbre creíbles y hace el sistema auditable — central para UCI como medida de índice legalmente definida.</p>
        </div>
        <div class="lab-engine-section">
          <h2>Arquitectura — capa por capa</h2>
          <article class="lab-layer"><h3>1. Percepción multimodal</h3><ul><li>El módulo de visión AestimAi admite imágenes de alta resolución (hasta 2576 px) para mejor identificación y evaluación del estado.</li><li>Imágenes subidas una vez vía Files API, reutilizables — menos latencia y coste.</li></ul><p class="lab-layer-desc">Procesa la entrada visual y la convierte en información estructurada para capas posteriores.</p></article>
          <article class="lab-layer"><h3>2. Retrieval-Augmented Valuation (RAG)</h3><ul><li>Valoración basada en ventas comparables (Tradera, Blocket, subastas, eBay) vía base vectorial y comps estructurados.</li><li><code>web_search_20260209</code> con filtrado dinámico integrado en AestimAi para precios frescos sin ruido.</li></ul><p class="lab-layer-desc">Recuperación activa de precios reales — de pura estimación LLM a valoración basada en evidencia.</p></article>
          <article class="lab-layer"><h3>3. Orquestación agéntica (tool use)</h3><ul><li>Bucle agente: identificar → comps → modelo ML hedónico → preguntas → fusión → justificación.</li><li>Implementable como bucle tool-use en el servidor UCI o vía Managed Agents AestimAi.</li></ul><p class="lab-layer-desc">La valoración se convierte en un proceso verificable y trazable — requerido por UCI.</p></article>
          <article class="lab-layer"><h3>4. Ensemble + fusión bayesiana</h3><ul><li>Varios estimadores combinados: (a) LLM, (b) modelo hedónico gradient-boosted, (c) comps, (d) votos crowd/respondent.</li></ul><p class="lab-layer-desc">Ponderación bayesiana de fuentes independientes — voto bayesiano estadísticamente correcto.</p></article>
          <article class="lab-layer"><h3>5. Incertidumbre calibrada — conformal prediction</h3><ul><li>El intervalo heurístico 90&nbsp;% se sustituye por conformal prediction — cobertura garantizada.</li></ul><p class="lab-layer-desc">Método estadísticamente fundamentado cuya cobertura (p. ej. 90&nbsp;%) se mantiene en el tiempo.</p></article>
          <article class="lab-layer"><h3>6. Inteligencia adaptativa (coste/calidad)</h3><ul><li>Adaptive thinking + parámetro effort: más razonamiento en casos difíciles, más barato en simples.</li><li>Prompt caching: ~90&nbsp;% menos coste y respuestas más rápidas.</li><li>Structured outputs: JSON siempre válido (<code>uci_value</code>, intervalo, <code>reasoning</code>, <code>key_factors</code>).</li></ul><p class="lab-layer-desc">Optimización dinámica de recursos con salidas estructuradas sin errores de parsing.</p></article>
          <article class="lab-layer"><h3>7. Federated / continual learning</h3><ul><li>Aprende de valoraciones de usuarios sin centralizar datos brutos.</li></ul><p class="lab-layer-desc">Entrenamiento local y solo actualizaciones del modelo — privacidad preservada, motor mejorado.</p></article>
          <article class="lab-layer"><h3>8. Eval, drift &amp; confianza</h3><ul><li>LLM-as-judge y backtesting contra precios finales conocidos; monitorización de deriva del modelo.</li><li>Batches API (50&nbsp;% más barato) para valoración masiva.</li><li>Anclaje on-chain (UCIIndex en Base Sepolia) alineado con hash-anchoring UCI.</li></ul><p class="lab-layer-desc">Medición objetiva, costes bajos a escala, valoraciones trazables — UCI como instrumento de medida no tokenizado fuera de MiCA.</p></article>
        </div>
        <div class="lab-engine-cta"><p>¿Quieres probar el motor de valoración?</p><button type="button" class="btn-primary" onclick="navigateTo(\'uci\')">Iniciar valoración UCI →</button></div>`,
  };

  const PAPER_LINKS = [
    {
      catKey: 'standards',
      title: 'IFRS 13 — Fair Value Measurement',
      descKey: 'ifrs13',
      href: 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-13-fair-value-measurement/',
    },
    {
      catKey: 'standards',
      title: 'International Valuation Standards (IVS)',
      descKey: 'ivs',
      href: 'https://www.ivsc.org/standards/',
    },
    {
      catKey: 'method',
      title: 'Rosen (1974) — Hedonic Prices and Implicit Markets',
      descKey: 'rosen',
      href: 'https://www.journals.uchicago.edu/doi/10.1086/260169',
    },
    {
      catKey: 'method',
      title: 'OECD — Valuation Guidance for Infrastructure and Other Assets',
      descKey: 'oecd',
      href: 'https://www.oecd.org/en/publications/oecd-valuation-guidance_9789264319975-en.htm',
    },
    {
      catKey: 'ai',
      title: 'Lewis et al. (2020) — Retrieval-Augmented Generation',
      descKey: 'rag',
      href: 'https://arxiv.org/abs/2005.11401',
    },
    {
      catKey: 'ai',
      title: 'Angelopoulos & Bates (2021) — Conformal Prediction',
      descKey: 'conformal',
      href: 'https://arxiv.org/abs/2107.07511',
    },
    {
      catKey: 'method',
      title: 'Appraisal Institute — Automated Valuation Models (AVMs)',
      descKey: 'avm',
      href: 'https://www.appraisalinstitute.org/professional-practice/automated-valuation-models/',
    },
    {
      catKey: 'coop',
      title: 'ICA — Statement on the Co-operative Identity',
      descKey: 'ica',
      href: 'https://www.ica.coop/en/coops-cooperation/cooperative-identity',
    },
    {
      catKey: 'legal',
      title: 'EU MiCA Regulation (2023/1114)',
      descKey: 'mica',
      href: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114',
    },
    {
      catKey: 'legal',
      title: 'ISO/IEC 18013-5 — Mobile driving licence (mDL)',
      descKey: 'mdl',
      href: 'https://www.iso.org/standard/69081.html',
    },
  ];

  function buildPapersHtml(lang) {
    const labels = {
      sv: {
        intro: 'Forskning och referenslitteratur kring UCI, AI-assisterad värdering och mätning av verkligt bytevärde — oberoende av valuta.',
        featured: 'Utvald artikel',
        draft: 'Manuskriptutkast',
        author: 'Stefan Larsson-Mastonstråle · AestimAi',
        readPdf: 'Läs hela PDF →',
        outline: 'Innehåll',
        further: 'Vidare läsning — värdering av tillgångar',
        furtherDesc: 'Externa standarder, metoder och forskning som ligger nära UCI:s design.',
        cat: { standards: 'Standarder', method: 'Metodik', ai: 'AI & ML', coop: 'Kooperativ ekonomi', legal: 'Regler & identitet' },
        linkDesc: {
          ifrs13: 'Internationell redovisningsstandard för verkligt värde — relevant för fastigheter, finansiella instrument och immateriella tillgångar.',
          ivs: 'Globala värderingsstandarder för fastigheter, företag och finansiella tillgångar.',
          rosen: 'Klassisk hedonisk prissättning — grund för att modellera pris utifrån objektattribut.',
          oecd: 'OECD:s vägledning för värdering av infrastruktur och andra tillgångar i offentlig sektor.',
          rag: 'Retrieval-augmented generation — evidensbaserad AI som hämtar jämförbara marknadsdata.',
          conformal: 'Conformal prediction — statistiskt kalibrerade konfidensintervall kring värderingar.',
          avm: 'Automatiserade värderingsmodeller (AVM) inom fastighetsvärdering och massappraisal.',
          ica: 'Internationella kooperativa principer — demokratisk styrning och medlemsägande.',
          mica: 'EU:s regelverk för krypto-tillgångar — relevant för UCI:s icke-tokeniserade mätinstrument.',
          mdl: 'ISO-standard för mobilt körkort — identitetsankare för verifierad motprestation.',
        },
      },
      en: {
        intro: 'Research and reference literature on UCI, AI-assisted valuation and measuring real trade value — independent of currency.',
        featured: 'Featured article',
        draft: 'Draft manuscript',
        author: 'Stefan Larsson-Mastonstråle · AestimAi',
        readPdf: 'Read full PDF →',
        outline: 'Contents',
        further: 'Further reading — valuation of assets',
        furtherDesc: 'External standards, methods and research aligned with the UCI design.',
        cat: { standards: 'Standards', method: 'Methodology', ai: 'AI & ML', coop: 'Cooperative economics', legal: 'Regulation & identity' },
        linkDesc: {
          ifrs13: 'International accounting standard for fair value — relevant for property, financial instruments and intangibles.',
          ivs: 'Global valuation standards for real estate, businesses and financial assets.',
          rosen: 'Classic hedonic pricing — foundation for modelling price from object attributes.',
          oecd: 'OECD guidance on valuing infrastructure and other assets in the public sector.',
          rag: 'Retrieval-augmented generation — evidence-based AI that retrieves comparable market data.',
          conformal: 'Conformal prediction — statistically calibrated confidence intervals around valuations.',
          avm: 'Automated Valuation Models (AVMs) in property appraisal and mass appraisal.',
          ica: 'International cooperative principles — democratic governance and member ownership.',
          mica: 'EU crypto-asset regulation — relevant to UCI as a non-tokenised measurement instrument.',
          mdl: 'ISO mobile driving licence standard — identity anchor for verified counterperformance.',
        },
      },
      de: {
        intro: 'Forschung und Referenzliteratur zu UCI, KI-gestützter Bewertung und Messung echten Tauschwerts — unabhängig von Währung.',
        featured: 'Ausgewählter Artikel', draft: 'Manuskriptentwurf', author: 'Stefan Larsson-Mastonstråle · AestimAi',
        readPdf: 'Vollständiges PDF lesen →', outline: 'Inhalt',
        further: 'Weiterführende Literatur — Bewertung von Vermögenswerten',
        furtherDesc: 'Externe Standards, Methoden und Forschung im Anschluss an das UCI-Design.',
        cat: { standards: 'Standards', method: 'Methodik', ai: 'KI & ML', coop: 'Genossenschaftliche Wirtschaft', legal: 'Regulierung & Identität' },
        linkDesc: {
          ifrs13: 'Internationaler Rechnungslegungsstandard für beizulegenden Zeitwert.',
          ivs: 'Globale Bewertungsstandards für Immobilien, Unternehmen und Finanzanlagen.',
          rosen: 'Klassische hedonische Preisbildung — Grundlage für attributbasierte Preismodelle.',
          oecd: 'OECD-Leitfaden zur Bewertung von Infrastruktur und anderen Vermögenswerten.',
          rag: 'Retrieval-Augmented Generation — evidenzbasierte KI mit vergleichbaren Marktdaten.',
          conformal: 'Conformal Prediction — statistisch kalibrierte Konfidenzintervalle.',
          avm: 'Automated Valuation Models (AVM) in der Immobilienbewertung.',
          ica: 'Internationale Genossenschaftsprinzipien — demokratische Governance.',
          mica: 'EU-Krypto-Asset-Regulierung — relevant für UCI als nicht-tokenisiertes Messinstrument.',
          mdl: 'ISO-Standard für mobiles Führerscheindokument — Identitätsanker.',
        },
      },
      fr: {
        intro: 'Recherche et références sur l\'UCI, la valorisation assistée par IA et la mesure de la valeur d\'échange réelle — indépendamment de la monnaie.',
        featured: 'Article en vedette', draft: 'Manuscrit provisoire', author: 'Stefan Larsson-Mastonstråle · AestimAi',
        readPdf: 'Lire le PDF complet →', outline: 'Sommaire',
        further: 'Pour aller plus loin — valorisation des actifs',
        furtherDesc: 'Normes, méthodes et recherches externes alignées sur la conception UCI.',
        cat: { standards: 'Normes', method: 'Méthodologie', ai: 'IA & ML', coop: 'Économie coopérative', legal: 'Réglementation & identité' },
        linkDesc: {
          ifrs13: 'Norme comptable internationale sur la juste valeur.',
          ivs: 'Normes internationales de valorisation pour l\'immobilier et les actifs financiers.',
          rosen: 'Tarification hédonique classique — modélisation du prix par attributs.',
          oecd: 'Guide OCDE sur la valorisation des infrastructures et autres actifs.',
          rag: 'Génération augmentée par retrieval — IA fondée sur des comparables.',
          conformal: 'Prédiction conforme — intervalles de confiance calibrés statistiquement.',
          avm: 'Modèles de valorisation automatisés (AVM) pour l\'immobilier.',
          ica: 'Principes coopératifs internationaux — gouvernance démocratique.',
          mica: 'Réglementation européenne MiCA — pertinente pour l\'UCI non tokenisé.',
          mdl: 'Norme ISO pour permis de conduire mobile — ancrage d\'identité.',
        },
      },
      it: {
        intro: 'Ricerca e letteratura di riferimento su UCI, valutazione assistita da IA e misura del valore di scambio reale — indipendente dalla valuta.',
        featured: 'Articolo in evidenza', draft: 'Bozza di manoscritto', author: 'Stefan Larsson-Mastonstråle · AestimAi',
        readPdf: 'Leggi PDF completo →', outline: 'Contenuti',
        further: 'Letture consigliate — valutazione degli asset',
        furtherDesc: 'Standard, metodi e ricerca esterni allineati al design UCI.',
        cat: { standards: 'Standard', method: 'Metodologia', ai: 'IA & ML', coop: 'Economia cooperativa', legal: 'Regolamentazione & identità' },
        linkDesc: {
          ifrs13: 'Standard contabile internazionale sul fair value.',
          ivs: 'Standard globali di valutazione per immobili e asset finanziari.',
          rosen: 'Pricing edonico classico — modellazione del prezzo dagli attributi.',
          oecd: 'Guida OCSE alla valutazione di infrastrutture e altri asset.',
          rag: 'Retrieval-augmented generation — IA basata su comparables di mercato.',
          conformal: 'Conformal prediction — intervalli di confidenza calibrati statisticamente.',
          avm: 'Automated Valuation Models (AVM) nella valutazione immobiliare.',
          ica: 'Principi cooperativi internazionali — governance democratica.',
          mica: 'Regolamento UE MiCA — rilevante per UCI come strumento di misura non tokenizzato.',
          mdl: 'Standard ISO per patente di guida mobile — ancoraggio identitario.',
        },
      },
      es: {
        intro: 'Investigación y bibliografía sobre UCI, valoración asistida por IA y medición del valor de intercambio real — independiente de la moneda.',
        featured: 'Artículo destacado', draft: 'Borrador de manuscrito', author: 'Stefan Larsson-Mastonstråle · AestimAi',
        readPdf: 'Leer PDF completo →', outline: 'Contenido',
        further: 'Lecturas recomendadas — valoración de activos',
        furtherDesc: 'Estándares, métodos e investigación externos alineados con el diseño UCI.',
        cat: { standards: 'Estándares', method: 'Metodología', ai: 'IA & ML', coop: 'Economía cooperativa', legal: 'Regulación & identidad' },
        linkDesc: {
          ifrs13: 'Norma contable internacional sobre valor razonable.',
          ivs: 'Estándares globales de valoración para inmuebles y activos financieros.',
          rosen: 'Precios hedónicos clásicos — modelado del precio por atributos.',
          oecd: 'Guía OCDE para valorar infraestructura y otros activos.',
          rag: 'Generación aumentada por retrieval — IA basada en comparables de mercado.',
          conformal: 'Predicción conformal — intervalos de confianza calibrados estadísticamente.',
          avm: 'Modelos de valoración automatizados (AVM) en tasación inmobiliaria.',
          ica: 'Principios cooperativos internacionales — gobernanza democrática.',
          mica: 'Regulación europea MiCA — relevante para UCI como instrumento de medida no tokenizado.',
          mdl: 'Estándar ISO para permiso de conducir móvil — ancla de identidad.',
        },
      },
    };
    const L = labels[lang] || labels.en;

    const linksHtml = PAPER_LINKS.map(item => `
      <a class="lab-paper-link" href="${item.href}" target="_blank" rel="noopener noreferrer">
        <span class="lab-paper-link-cat">${L.cat[item.catKey]}</span>
        <strong>${item.title}</strong>
        <p>${L.linkDesc[item.descKey]}</p>
      </a>`).join('');

    return `<div class="lab-papers">
      <p class="lab-papers-intro">${L.intro}</p>
      <article class="lab-paper-featured">
        <span class="lab-paper-badge">${L.featured}</span>
        <h2>AestimAi and the Universal Coin Index (UCI): A Cooperative, AI-Assisted Architecture for Non-Monetary Value Measurement</h2>
        <p class="lab-paper-meta">${L.author} · <span class="lab-paper-draft">${L.draft}</span></p>
        <p class="lab-paper-abstract">This article introduces AestimAi and the Universal Coin Index (UCI) — a valuation index measure designed explicitly as a non-monetary instrument that quantifies verified counterperformance rather than representing currency or a financial instrument under EU law. It describes the separation of measurement from settlement, a three-layer institutional architecture (technology company, cooperative association, identity layer), an agentic retrieval-grounded AI valuation engine, hash-anchoring for tamper-evidence without tokenization, and positioning outside MiCA scope.</p>
        <p class="lab-paper-keywords"><strong>Keywords:</strong> cooperative economics; non-monetary value measurement; valuation index; artificial intelligence; retrieval-augmented generation; digital identity; hash-anchoring; MiCA; barter exchange; sustainable development</p>
        <div class="lab-paper-actions">
          <a class="btn-primary" href="/papers/aestimai-uci-journal-article.pdf" target="_blank" rel="noopener">${L.readPdf}</a>
        </div>
        <div class="lab-paper-outline">
          <h3>${L.outline}</h3>
          <ol>
            <li>Introduction — separating measurement from settlement</li>
            <li>Background and motivation (LETS, time banks, cooperative governance)</li>
            <li>Conceptual design: the Universal Coin Index (UCI)</li>
            <li>Institutional architecture (Tech AB · Economic Association · AE ID)</li>
            <li>The AI-assisted valuation engine (8 integrated layers)</li>
            <li>Legal and regulatory positioning (PSD2, EMD2, MiFID II, MiCA)</li>
            <li>Cooperative governance and ICA principles</li>
            <li>Prospective societal benefits and applications</li>
            <li>Discussion and open questions</li>
            <li>Conclusion</li>
          </ol>
        </div>
      </article>
      <section class="lab-papers-section">
        <h2>${L.further}</h2>
        <p class="lab-papers-section-desc">${L.furtherDesc}</p>
        <div class="lab-paper-list">${linksHtml}</div>
      </section>
    </div>`;
  }

  function labStrings(lang) {
    return {
      'lab.title': {
        sv: 'AestimAi Lab',
        en: 'AestimAi Lab',
        de: 'AestimAi Lab',
        fr: 'AestimAi Lab',
        it: 'AestimAi Lab',
        es: 'AestimAi Lab',
      }[lang],
      'lab.desc': {
        sv: 'Forskning, värderingsmotor och hårdvara för mätning av verkligt värde',
        en: 'Research, valuation engine and hardware for measuring real value',
        de: 'Forschung, Bewertungsengine und Hardware zur Messung echten Werts',
        fr: 'Recherche, moteur de valorisation et matériel pour mesurer la valeur réelle',
        it: 'Ricerca, motore di valutazione e hardware per misurare il valore reale',
        es: 'Investigación, motor de valoración y hardware para medir el valor real',
      }[lang],
      'lab.badge': {
        sv: '⊙ UCI-kompatibel',
        en: '⊙ UCI-compatible',
        de: '⊙ UCI-kompatibel',
        fr: '⊙ Compatible UCI',
        it: '⊙ Compatibile UCI',
        es: '⊙ Compatible con UCI',
      }[lang],
      'lab.tab.engine': {
        sv: 'UCI Värderingsmotor', en: 'UCI Valuation Engine', de: 'UCI-Bewertungsengine',
        fr: 'Moteur de valorisation UCI', it: 'Motore di valutazione UCI', es: 'Motor de valoración UCI',
      }[lang],
      'lab.tab.papers': {
        sv: 'Vetenskapliga artiklar och publikationer',
        en: 'Scientific papers and Articles',
        de: 'Wissenschaftliche Artikel und Publikationen',
        fr: 'Articles et publications scientifiques',
        it: 'Articoli e pubblicazioni scientifiche',
        es: 'Artículos y publicaciones científicas',
      }[lang],
      'lab.engineBody': ENGINE[lang] || ENGINE.en,
      'lab.papersBody': buildPapersHtml(lang),
      'panel.ucilab': {
        sv: '<h4>AestimAi Lab</h4><p>Forskning kring UCI-värderingsmotorn — agentisk, retrieval-grundad och kalibrerad värdering.</p><p>Under <strong>Vetenskapliga artiklar</strong> hittar du vår UCI-artikel och vidare läsning.</p>',
        en: '<h4>AestimAi Lab</h4><p>Research on the UCI valuation engine — agentic, retrieval-grounded and calibrated valuation.</p><p>Under <strong>Scientific papers and Articles</strong> you will find our UCI paper and further reading.</p>',
        de: '<h4>AestimAi Lab</h4><p>Forschung zur UCI-Bewertungsengine — agentische, retrieval-basierte und kalibrierte Bewertung.</p><p>Unter <strong>Wissenschaftliche Artikel</strong> finden Sie unser UCI-Paper und weiterführende Literatur.</p>',
        fr: '<h4>AestimAi Lab</h4><p>Recherche sur le moteur de valorisation UCI — valorisation agentique, fondée sur la retrieval et calibrée.</p><p>Sous <strong>Articles scientifiques</strong>, notre article UCI et lectures complémentaires.</p>',
        it: '<h4>AestimAi Lab</h4><p>Ricerca sul motore di valutazione UCI — valutazione agentica, retrieval-based e calibrata.</p><p>Sotto <strong>Articoli scientifici</strong> trovi il nostro paper UCI e letture consigliate.</p>',
        es: '<h4>AestimAi Lab</h4><p>Investigación sobre el motor de valoración UCI — valoración agéntica, basada en retrieval y calibrada.</p><p>En <strong>Artículos científicos</strong> encontrarás nuestro artículo UCI y lecturas recomendadas.</p>',
      }[lang],
    };
  }

  global.LAB_I18N = {
    sv: labStrings('sv'),
    en: labStrings('en'),
    de: labStrings('de'),
    fr: labStrings('fr'),
    it: labStrings('it'),
    es: labStrings('es'),
  };
})(window);
