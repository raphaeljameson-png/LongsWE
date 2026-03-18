document.addEventListener('DOMContentLoaded', () => {
    
    // ==================== 1. GESTION DES ONGLETS PRINCIPAUX ====================
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.getAttribute('data-target')).classList.add('active');
        });
    });

    // ==================== 2. GESTION DES VUES CALENDRIER (Mois/Année) ====================
    const btnMensuel = document.getElementById('btn-mensuel');
    const btnAnnuel = document.getElementById('btn-annuel');
    const vueMensuelle = document.getElementById('vue-mensuelle');
    const vueAnnuelle = document.getElementById('vue-annuelle');

    function afficherVueMensuelle() {
        btnMensuel.classList.add('active'); 
        btnAnnuel.classList.remove('active');
        vueMensuelle.classList.add('active'); 
        vueAnnuelle.classList.remove('active');
    }

    function afficherVueAnnuelle() {
        btnAnnuel.classList.add('active'); 
        btnMensuel.classList.remove('active');
        vueAnnuelle.classList.add('active'); 
        vueMensuelle.classList.remove('active');
    }

    btnMensuel.addEventListener('click', afficherVueMensuelle);
    btnAnnuel.addEventListener('click', afficherVueAnnuelle);

    // ==================== 3. STATE MANAGEMENT ====================
    const state = {
        tousLesFeries: {},
        listeDesPonts: [],
        listeVacances: [],
        anneesChargees: new Set(),
        dateAujourdHui: new Date(),
        currentDisplayedYear: null,
        currentDisplayedMonth: null,
        cacheCalendrier: new Map(),
        jours2ans: null, // Cache global pour les jours ouvrés/fériés sur 2 ans
        DEFAULT_JOURS: 1,
    };

    state.dateAujourdHui.setHours(0, 0, 0, 0); // Réinitialiser l'heure pour éviter les décalages de date
    state.currentDisplayedYear = state.dateAujourdHui.getFullYear();
    state.currentDisplayedMonth = state.dateAujourdHui.getMonth();

    // ==================== 4. UTILITAIRES DE DATES ====================
    const parseDate = (str) => {
        const [y, m, d] = str.split('-');
        return new Date(y, m - 1, d);
    };

    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    // ✅ FIX: Ajout de l'année au formatage des dates pour les ponts
    const OPT_DATES = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

    // ==================== 5. CACHE OPTIMISÉ DES JOURS WORK/OFF ====================
    
    /**
     * ⚡ PRÉ-GÉNÈRE UNE MAP: "YYYY-MM-DD" => estJourOff (boolean)
     * Accès O(1) au lieu de vérifier week-end + fériés à chaque fois.
     * Génère un cache pour l'année en cours + 2 ans.
     */
    function genererCacheJours2Ans() {
        const cache = new Map();
        let dateInitiale = new Date(state.dateAujourdHui);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31); // Jusqu'à la fin de l'année + 2

        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            const key = formatDate(d);
            const day = d.getDay(); // 0 pour dimanche, 6 pour samedi
            
            // Est "off" si: week-end (0=dim, 6=sam) OU férié
            const isOff = (day === 0 || day === 6) || !!state.tousLesFeries[key];
            cache.set(key, isOff);
        }
        return cache;
    }

    /**
     * Lookup O(1) pour savoir si une date est jour off (week-end ou férié).
     */
    const estJourOff = (dateObj) => {
        const key = formatDate(dateObj);
        // Utilise le cache pré-généré, sinon assume que ce n'est pas un jour off (fallback)
        return state.jours2ans?.get(key) ?? false;
    };

    // ==================== 6. STEPPER AVEC THROTTLE & INITIALISATION ====================
    const inputJours = document.getElementById('jours-dispo');
    let throttleTimer = null;

    // 🎯 INITIALISER AVEC LA VALEUR PAR DÉFAUT
    inputJours.value = state.DEFAULT_JOURS;

    const throttledCalcul = () => {
        if (throttleTimer) return; // Si un calcul est déjà en attente, ne rien faire
        throttleTimer = setTimeout(() => {
            calculerPontsDynamiques();
            throttleTimer = null; // Réinitialiser le timer après l'exécution
        }, 150); // Délai court pour éviter les recalculs à chaque clic rapide
    };

    document.getElementById('btn-plus').addEventListener('click', () => {
        if (inputJours.value < 16) { // Limite supérieure fixée à 16 jours
            inputJours.value++;
            throttledCalcul();
        }
    });

    document.getElementById('btn-minus').addEventListener('click', () => {
        if (inputJours.value > 1) { // Limite inférieure fixée à 1 jour
            inputJours.value--;
            throttledCalcul();
        }
    });

    // ==================== 7. GÉNÉRATION CALENDRIER AVEC CACHE ====================
    
    function genererMoisHTML(year, month) {
        const cacheKey = `${year}-${month}`;
        if (state.cacheCalendrier.has(cacheKey)) {
            return state.cacheCalendrier.get(cacheKey);
        }

        let html = `<div class="month-grid">`;
        // En-têtes des jours de la semaine
        JOURS_SEMAINE.forEach(jour => { 
            html += `<div class="day-header">${jour}</div>`; 
        });

        const premierJour = new Date(year, month, 1).getDay(); // Jour de la semaine du 1er du mois (0=dimanche, 6=samedi)
        // Calcul du décalage pour aligner le 1er jour sur le bon jour de la semaine (lundi=0)
        const decalage = premierJour === 0 ? 6 : premierJour - 1; 
        const joursDansLeMois = new Date(year, month + 1, 0).getDate(); // Nombre de jours dans le mois

        // Jours vides au début du mois
        for (let i = 0; i < decalage; i++) { 
            html += `<div class="day-cell empty"></div>`; 
        }

        // Jours du mois
        for (let jour = 1; jour <= joursDansLeMois; jour++) {
            const currentDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            let classes = 'day-cell';
            
            // Vacances scolaires
            const estEnVacances = state.listeVacances.some(
                v => currentDateString >= v.start && currentDateString <= v.end
            );
            if (estEnVacances) classes += ' vacances';

            // Fériés
            if (state.tousLesFeries[currentDateString]) classes += ' ferie';
            
            // Jours à poser (pont)
            if (state.listeDesPonts.some(p => p.joursAPoserListe.includes(currentDateString))) {
                classes += ' pont';
            }

            html += `<div class="${classes}">${jour}</div>`;
        }

        html += `</div>`;
        state.cacheCalendrier.set(cacheKey, html); // Mettre en cache le HTML généré
        return html;
    }

    function rafraichirCalendrier() {
        document.getElementById('current-month-title').innerText = 
            `${NOMS_MOIS[state.currentDisplayedMonth]} ${state.currentDisplayedYear}`;
        document.getElementById('month-container').innerHTML = 
            genererMoisHTML(state.currentDisplayedYear, state.currentDisplayedMonth);
        
        document.getElementById('current-year-title').innerText = state.currentDisplayedYear;
        const yearContainer = document.getElementById('year-container');
        yearContainer.innerHTML = '';
        
        for (let m = 0; m < 12; m++) {
            const div = document.createElement('div');
            div.className = 'mini-month';
            div.innerHTML = `<h4>${NOMS_MOIS[m]}</h4>` + genererMoisHTML(state.currentDisplayedYear, m);
            yearContainer.appendChild(div);
        }
    }

    async function changerDate(deltaAnnee, deltaMois = 0) {
        state.currentDisplayedYear += deltaAnnee;
        state.currentDisplayedMonth += deltaMois;

        if (state.currentDisplayedMonth < 0) { 
            state.currentDisplayedMonth = 11; 
            state.currentDisplayedYear--; 
        }
        if (state.currentDisplayedMonth > 11) { 
            state.currentDisplayedMonth = 0; 
            state.currentDisplayedYear++; 
        }

        // Charger les fériés de l'année si ce n'est pas déjà fait
        if (!state.anneesChargees.has(state.currentDisplayedYear)) {
            await chargerFeriesDynamique(state.currentDisplayedYear);
        }

        // Invalider le cache du calendrier pour cette année affichée
        for (let m = 0; m < 12; m++) {
            state.cacheCalendrier.delete(`${state.currentDisplayedYear}-${m}`);
        }
        
        rafraichirCalendrier();
    }

    document.getElementById('prev-month').addEventListener('click', () => changerDate(0, -1));
    document.getElementById('next-month').addEventListener('click', () => changerDate(0, 1));
    document.getElementById('prev-year').addEventListener('click', () => changerDate(-1, 0));
    document.getElementById('next-year').addEventListener('click', () => changerDate(1, 0));

    // ==================== 8. ALGORITHME OPTIMISÉ DE CALCUL DES PONTS ====================
    
    /**
     * ⚡ ALGORITHME INTELLIGENT DE CALCUL DE PONTS
     * 
     * Optimisations:
     * 1. Cache des jours work/off (O(1) lookup au lieu de O(n))
     * 2. Break précoce si hier/demain = off
     * 3. Pas de recalcul inutile avec throttle (150ms)
     * 4. Valeur par défaut: 1 jour, max: 16 jours
     * 5. Pas de mutation directe des dates dans les boucles (crée de nouvelles instances)
     */
    function calculerPontsDynamiques() {
        const maxJoursAPoser = parseInt(inputJours.value, 10);
        state.listeDesPonts = [];
        
        // Reconstruire le cache si les données ont changé (ex: nouveaux fériés chargés)
        state.jours2ans = genererCacheJours2Ans();

        let dateInitiale = new Date(state.dateAujourdHui);
        // Recherche sur 2 ans à partir d'aujourd'hui
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31); 

        let signatures = new Set(); // Pour éviter les doublons de ponts

        // Itérer jour par jour
        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            
            // Règle 1: Le jour PRECEDENT la période doit être un jour de TRAVAIL
            let hier = new Date(d);
            hier.setDate(hier.getDate() - 1);
            if (estJourOff(hier)) continue; // Si hier est off (WE ou férié), pas de pont possible

            // Règle 2: Tester des longueurs de ponts de 3 à 16 jours
            for (let longueur = 3; longueur <= 16; longueur++) {
                let dateFinFenetre = new Date(d);
                dateFinFenetre.setDate(dateFinFenetre.getDate() + (longueur - 1));

                // Règle 3: Le jour SUIVANT la période doit être un jour de TRAVAIL
                let demain = new Date(dateFinFenetre);
                demain.setDate(demain.getDate() + 1);
                if (estJourOff(demain)) continue; // Si demain est off, pas de pont possible

                // Analyser l'intérieur du bloc de jours potentiels
                let nbJoursPoses = 0;
                let contientFerie = false;
                let joursAPoserListe = [];
                let nomsFeries = new Set();

                // ⚠️ FIX: NE PAS muter le curseur directement - créer une nouvelle instance
                for (let cursor = new Date(d); cursor <= dateFinFenetre; cursor = new Date(cursor.getTime() + 86400000)) {
                    const cursorStr = formatDate(cursor);
                    const isFerie = !!state.tousLesFeries[cursorStr];
                    
                    if (isFerie) {
                        contientFerie = true;
                        nomsFeries.add(state.tousLesFeries[cursorStr]);
                    }
                    
                    // Si ce n'est PAS un jour off (c'est donc un jour de travail)
                    if (!state.jours2ans.get(cursorStr)) { 
                        nbJoursPoses++;
                        joursAPoserListe.push(cursorStr);
                    }
                }

                // Validation: La période doit contenir au moins un férié, 
                // avoir des jours à poser, et respecter le budget max
                if (contientFerie && nbJoursPoses > 0 && nbJoursPoses <= maxJoursAPoser) {
                    // Créer une signature unique pour éviter d'ajouter le même pont plusieurs fois
                    const signature = d.getTime() + '-' + dateFinFenetre.getTime();
                    if (!signatures.has(signature)) {
                        signatures.add(signature);
                        
                        state.listeDesPonts.push({
                            nom: Array.from(nomsFeries).join(' + '), // Nom du férié (ou des fériés)
                            debut: new Date(d),
                            fin: new Date(dateFinFenetre),
                            joursAPoserListe: joursAPoserListe, // Liste des dates à poser
                            nbJoursPoses: nbJoursPoses, // Nombre total de jours à poser
                            gain: longueur // Durée totale du "congé"
                        });
                    }
                }
            }
        }

        // Trier les ponts par date de début
        state.listeDesPonts.sort((a, b) => a.debut - b.debut);

        afficherTimelineDynamique();
        rafraichirCalendrier();
    }

    // ==================== 9. AFFICHAGE TIMELINE ====================
    function afficherTimelineDynamique() {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = '';
        const maxJours = parseInt(inputJours.value, 10);

        if (state.listeDesPonts.length === 0) {
            timeline.innerHTML = `
                <p class="text-muted" style="text-align:center; padding: 20px;">
                    Aucune combinaison magique trouvée pour ${maxJours} jour(s).<br>
                    Essayez d'augmenter votre budget !
                </p>`;
            return;
        }

        state.listeDesPonts.forEach(pont => {
            // ✅ FIX: Les dates incluent maintenant l'année
            const listeDatesPoser = pont.joursAPoserListe.map(d => {
                let dateStr = parseDate(d).toLocaleDateString('fr-FR', OPT_DATES);
                return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            }).join(', ');

            const debutStr = pont.debut.toLocaleDateString('fr-FR', OPT_DATES);
            const finStr = pont.fin.toLocaleDateString('fr-FR', OPT_DATES);

            timeline.innerHTML += `
                <div class="card">
                    <h3>Autour de : ${pont.nom}</h3>
                    <p class="text-muted" style="margin-bottom: 12px;">
                        Période off : du ${debutStr} au ${finStr}
                    </p>
                    <p style="font-size: 0.95rem;">
                        <strong>Dates à poser (${pont.nbJoursPoses}) :</strong><br>
                        ${listeDatesPoser}
                    </p>
                    <div style="margin-top: 15px;">
                        <span class="pont-tag">
                            🎁 ${pont.nbJoursPoses} jour(s) posé(s) = ${pont.gain} jours de vacances !
                        </span>
                    </div>
                </div>`;
        });
        
        // Mettre à jour l'accueil avec le prochain pont
        if (state.listeDesPonts.length > 0) {
            const prochain = state.listeDesPonts[0];
            document.getElementById('next-pont').innerHTML = `
                <h3>${prochain.nom}</h3>
                <p>Du ${prochain.debut.toLocaleDateString('fr-FR', OPT_DATES)} 
                   au ${prochain.fin.toLocaleDateString('fr-FR', OPT_DATES)}</p>
                <p style="font-weight:bold; margin-top:10px;">
                    ${prochain.nbJoursPoses} jour(s) posé(s) = ${prochain.gain} jours de repos
                </p>
            `;
        } else {
            document.getElementById('next-pont').innerHTML = `<h3>Aucun pont en vue</h3>`;
        }
    }

    // ==================== 10. FETCH AVEC GESTION D'ERREUR ====================
    async function fetchVacances(zone) {
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=population="Élèves"`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (!data.results) {
                console.warn('Format API Vacances inattendu: "results" manquant');
                state.listeVacances = [];
                return;
            }

            state.listeVacances = data.results
                .filter(r => r.zones === `Zone ${zone}`)
                .map(r => ({ 
                    start: r.start_date.split('T')[0], // Prend seulement la date (YYYY-MM-DD)
                    end: r.end_date.split('T')[0] 
                }));

            state.cacheCalendrier.clear(); // Invalider le cache du calendrier après changement de vacances
            rafraichirCalendrier();
        } catch (error) {
            console.error("Erreur de récupération des vacances scolaires :", error);
            state.listeVacances = []; // S'assurer que la liste est vide en cas d'erreur
        }
    }

    async function chargerFeriesDynamique(annee) {
        if (state.anneesChargees.has(annee)) return; // Si l'année est déjà chargée, ne rien faire

        try {
            const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            Object.assign(state.tousLesFeries, data); // Ajoute les nouveaux fériés à la liste existante
            state.anneesChargees.add(annee); // Marque l'année comme chargée

            // ✅ FIX: Invalider le cache des jours ouvrés/fériés pour qu'il soit reconstruit
            state.jours2ans = null; 
            state.cacheCalendrier.clear(); // Invalider le cache du calendrier
        } catch (error) {
            console.error(`Erreur de chargement des jours fériés pour l'année ${annee}:`, error);
        }
    }

    // ==================== 11. INITIALISATION DE L'APPLICATION ====================
    async function initData() {
        try {
            // Charger les fériés pour l'année en cours et l'année suivante
            await chargerFeriesDynamique(state.dateAujourdHui.getFullYear());
            await chargerFeriesDynamique(state.dateAujourdHui.getFullYear() + 1);

            const zoneSelect = document.getElementById('zone-select');
            let userZone = localStorage.getItem('userZone') || 'A'; // Récupérer la zone utilisateur ou 'A' par défaut
            zoneSelect.value = userZone;
            
            await fetchVacances(userZone); // Charger les vacances en fonction de la zone

            // Écouter les changements de zone
            zoneSelect.addEventListener('change', async (e) => {
                localStorage.setItem('userZone', e.target.value);
                await fetchVacances(e.target.value);
            });

            calculerPontsDynamiques(); // Calculer les ponts une première fois
            afficherVueMensuelle();    // ✅ FIX: Afficher la vue mensuelle par défaut au démarrage
        } catch (error) {
            console.error("Erreur lors de l'initialisation de l'application:", error);
            // Afficher un message d'erreur à l'utilisateur si l'init échoue
            document.getElementById('timeline').innerHTML = `<p class="text-muted" style="text-align:center; padding: 20px; color: #FF3B30;">Impossible de charger les données. Veuillez vérifier votre connexion internet.</p>`;
        }
    }

    initData();
});
