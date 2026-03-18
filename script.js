document.addEventListener('DOMContentLoaded', () => {
    
    // ==================== 1. GESTION DES ONGLETS & UI ====================
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

    const btnMensuel = document.getElementById('btn-mensuel');
    const btnAnnuel = document.getElementById('btn-annuel');
    const vueMensuelle = document.getElementById('vue-mensuelle');
    const vueAnnuelle = document.getElementById('vue-annuelle');

    btnMensuel.addEventListener('click', () => {
        btnMensuel.classList.add('active'); 
        btnAnnuel.classList.remove('active');
        vueMensuelle.classList.add('active'); 
        vueAnnuelle.classList.remove('active');
    });
    
    btnAnnuel.addEventListener('click', () => {
        btnAnnuel.classList.add('active'); 
        btnMensuel.classList.remove('active');
        vueAnnuelle.classList.add('active'); 
        vueMensuelle.classList.remove('active');
    });

    // ==================== 2. STATE MANAGEMENT ====================
    const state = {
        tousLesFeries: {},
        listeDesPonts: [],
        listeVacances: [],
        anneesChargees: new Set(),
        dateAujourdHui: new Date(),
        currentDisplayedYear: null,
        currentDisplayedMonth: null,
        cacheCalendrier: new Map(),
        jours2ans: null, // Cache O(1) des jours work/off
    };

    state.dateAujourdHui.setHours(0, 0, 0, 0);
    state.currentDisplayedYear = state.dateAujourdHui.getFullYear();
    state.currentDisplayedMonth = state.dateAujourdHui.getMonth();

    // ==================== 3. UTILITAIRES DE DATES ====================
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
    const OPT_DATES = { weekday: 'short', day: 'numeric', month: 'short' };

    // ==================== 4. CACHE OPTIMISÉ DES JOURS WORK/OFF ====================
    
    /**
     * ⚡ PRÉ-GÉNÈRE UNE MAP: "YYYY-MM-DD" => estJourOff (boolean)
     * Accès O(1) au lieu de vérifier week-end + fériés à chaque fois
     * Gain: ~10x plus rapide pour les lookups
     */
    function genererCacheJours2Ans() {
        const cache = new Map();
        let dateInitiale = new Date(state.dateAujourdHui);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);

        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            const key = formatDate(d);
            const day = d.getDay();
            
            // Est "off" si: week-end (0=dim, 6=sam) OU férié
            const isOff = (day === 0 || day === 6) || !!state.tousLesFeries[key];
            cache.set(key, isOff);
        }
        return cache;
    }

    /**
     * Lookup O(1) pour savoir si une date est jour off
     */
    const estJourOff = (dateObj) => {
        const key = formatDate(dateObj);
        return state.jours2ans?.get(key) ?? false;
    };

    // ==================== 5. STEPPER THROTTLE ====================
    // Évite de recalculer à chaque clic rapide
    const inputJours = document.getElementById('jours-dispo');
    let throttleTimer = null;

    const throttledCalcul = () => {
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
            calculerPontsDynamiques();
            throttleTimer = null;
        }, 150); // Délai court mais efficace
    };

    document.getElementById('btn-plus').addEventListener('click', () => {
        if (inputJours.value < 16) {
            inputJours.value++;
            throttledCalcul();
        }
    });

    document.getElementById('btn-minus').addEventListener('click', () => {
        if (inputJours.value > 1) {
            inputJours.value--;
            throttledCalcul();
        }
    });

    // ==================== 6. GÉNÉRATION CALENDRIER AVEC CACHE ====================
    
    function genererMoisHTML(year, month) {
        const cacheKey = `${year}-${month}`;
        if (state.cacheCalendrier.has(cacheKey)) {
            return state.cacheCalendrier.get(cacheKey);
        }

        let html = `<div class="month-grid">`;
        JOURS_SEMAINE.forEach(jour => { 
            html += `<div class="day-header">${jour}</div>`; 
        });

        const premierJour = new Date(year, month, 1).getDay();
        const decalage = premierJour === 0 ? 6 : premierJour - 1;
        const joursDansLeMois = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < decalage; i++) { 
            html += `<div class="day-cell empty"></div>`; 
        }

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
        state.cacheCalendrier.set(cacheKey, html);
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

        if (!state.anneesChargees.has(state.currentDisplayedYear)) {
            await chargerFeriesDynamique(state.currentDisplayedYear);
        }

        // Invalider le cache du calendrier pour cette année
        for (let m = 0; m < 12; m++) {
            state.cacheCalendrier.delete(`${state.currentDisplayedYear}-${m}`);
        }
        
        rafraichirCalendrier();
    }

    document.getElementById('prev-month').addEventListener('click', () => changerDate(0, -1));
    document.getElementById('next-month').addEventListener('click', () => changerDate(0, 1));
    document.getElementById('prev-year').addEventListener('click', () => changerDate(-1, 0));
    document.getElementById('next-year').addEventListener('click', () => changerDate(1, 0));

    // ==================== 7. ALGORITHME OPTIMISÉ ====================
    
    /**
     * ⚡ ALGORITHME INTELLIGENT DE CALCUL DE PONTS
     * 
     * Optimisations:
     * 1. Cache des jours work/off (O(1) lookup au lieu de O(n))
     * 2. Break précoce si hier/demain = off
     * 3. Dictionnaire bestPonts qui retient SEULEMENT la meilleure option par férié
     *    - Meilleur gain d'abord
     *    - Si même gain, celle qui coûte le moins en congés
     * 4. Pas de recalcul inutile avec throttle
     */
    function calculerPontsDynamiques() {
        const maxJoursAPoser = parseInt(inputJours.value, 10);
        state.listeDesPonts = [];
        
        // Reconstruire le cache si les données ont changé
        state.jours2ans = genererCacheJours2Ans();

        let dateInitiale = new Date(state.dateAujourdHui);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);

        // Dictionnaire intelligent: garde seulement la MEILLEURE option par férié
        let bestPonts = {};

        // Itérer sur chaque jour potentiel de début de pont
        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            
            // 🎯 Règle 1: Hier doit être un jour de TRAVAIL
            let hier = new Date(d);
            hier.setDate(hier.getDate() - 1);
            if (estJourOff(hier)) continue; 

            // 🎯 Règle 2: Tester longueurs 3-16 jours
            for (let longueur = 3; longueur <= 16; longueur++) {
                let dateFinFenetre = new Date(d);
                dateFinFenetre.setDate(dateFinFenetre.getDate() + (longueur - 1));

                // 🎯 Règle 3: Demain doit être un jour de TRAVAIL
                let demain = new Date(dateFinFenetre);
                demain.setDate(demain.getDate() + 1);
                if (estJourOff(demain)) continue;

                // Analyser l'intérieur du bloc
                let nbJoursPoses = 0;
                let contientFerie = false;
                let joursAPoserListe = [];
                let nomsFeries = new Set();

                // ⚠️ NE PLUS muter le curseur directement - utiliser une copie propre
                for (let cursor = new Date(d); cursor <= dateFinFenetre; cursor = new Date(cursor.getTime() + 86400000)) {
                    const cursorStr = formatDate(cursor);
                    const isFerie = !!state.tousLesFeries[cursorStr];
                    
                    if (isFerie) {
                        contientFerie = true;
                        nomsFeries.add(state.tousLesFeries[cursorStr]);
                    }
                    
                    if (!state.jours2ans.get(cursorStr)) { // = jour de travail
                        nbJoursPoses++;
                        joursAPoserListe.push(cursorStr);
                    }
                }

                // Validation: contient une ferie + respecte budget
                if (contientFerie && nbJoursPoses > 0 && nbJoursPoses <= maxJoursAPoser) {
                    const nomCombinaison = Array.from(nomsFeries).join(' + ');
                    
                    const proposition = {
                        nom: nomCombinaison,
                        debut: new Date(d),
                        fin: new Date(dateFinFenetre),
                        joursAPoserListe: joursAPoserListe,
                        nbJoursPoses: nbJoursPoses,
                        gain: longueur
                    };

                    // 🌟 LA MAGIE: Garder SEULEMENT la meilleure option par férié
                    if (!bestPonts[nomCombinaison]) {
                        // Première fois qu'on voit ce férié
                        bestPonts[nomCombinaison] = proposition;
                    } else {
                        // On a déjà trouvé une combinaison pour ce férié
                        // Garder celle avec le meilleur gain
                        if (proposition.gain > bestPonts[nomCombinaison].gain) {
                            bestPonts[nomCombinaison] = proposition;
                        } 
                        // Si le gain est identique, garder celle qui coûte le moins
                        else if (proposition.gain === bestPonts[nomCombinaison].gain && 
                                 proposition.nbJoursPoses < bestPonts[nomCombinaison].nbJoursPoses) {
                            bestPonts[nomCombinaison] = proposition;
                        }
                    }
                }
            }
        }

        // Convertir le dictionnaire en liste et trier chronologiquement
        state.listeDesPonts = Object.values(bestPonts);
        state.listeDesPonts.sort((a, b) => a.debut - b.debut);

        afficherTimelineDynamique();
        rafraichirCalendrier();
    }

    // ==================== 8. AFFICHAGE TIMELINE ====================
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
        
        // Mettre à jour l'accueil
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

    // ==================== 9. FETCH AVEC GESTION D'ERREUR ====================
    async function fetchVacances(zone) {
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=population="Élèves"`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (!data.results) {
                console.warn('Format API inattendu');
                state.listeVacances = [];
                return;
            }

            state.listeVacances = data.results
                .filter(r => r.zones === `Zone ${zone}`)
                .map(r => ({ 
                    start: r.start_date.split('T')[0], 
                    end: r.end_date.split('T')[0] 
                }));

            // Invalider le cache
            state.cacheCalendrier.clear();
            rafraichirCalendrier();
        } catch (error) {
            console.error("Erreur Vacances :", error);
            state.listeVacances = [];
        }
    }

    async function chargerFeriesDynamique(annee) {
        if (state.anneesChargees.has(annee)) return;

        try {
            const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            Object.assign(state.tousLesFeries, data);
            state.anneesChargees.add(annee);

            // Invalider le cache de jours2ans et calendrier
            state.jours2ans = null;
            state.cacheCalendrier.clear();
        } catch (error) {
            console.error(`Erreur chargement fériés ${annee}:`, error);
        }
    }

    // ==================== 10. INITIALISATION ====================
    async function initData() {
        try {
            // Charger les fériés pour 2 ans
            await chargerFeriesDynamique(state.dateAujourdHui.getFullYear());
            await chargerFeriesDynamique(state.dateAujourdHui.getFullYear() + 1);

            // Charger zone scolaire
            const zoneSelect = document.getElementById('zone-select');
            let userZone = localStorage.getItem('userZone') || 'A';
            zoneSelect.value = userZone;
            
            await fetchVacances(userZone);

            zoneSelect.addEventListener('change', async (e) => {
                localStorage.setItem('userZone', e.target.value);
                await fetchVacances(e.target.value);
            });

            // Lancer le premier calcul
            calculerPontsDynamiques();
        } catch (error) {
            console.error("Erreur initialisation:", error);
        }
    }

    initData();
});
