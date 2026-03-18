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
        console.log('🗓️ Affichage vue Mensuelle');
        btnMensuel.classList.add('active');
        btnAnnuel.classList.remove('active');
        vueMensuelle.classList.add('active');
        vueAnnuelle.classList.remove('active');
    }

    function afficherVueAnnuelle() {
        console.log('📆 Affichage vue Annuelle');
        btnAnnuel.classList.add('active');
        btnMensuel.classList.remove('active');
        vueAnnuelle.classList.add('active');
        vueMensuelle.classList.remove('active');
    }

    btnMensuel.addEventListener('click', afficherVueMensuelle);
    btnAnnuel.addEventListener('click', afficherVueAnnuelle);

    // Initialiser avec la vue mensuelle
    // afficherVueMensuelle(); // <-- Cette ligne a été commentée/supprimée

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
        jours2ans: null,
        DEFAULT_JOURS: 1,
    };

    state.dateAujourdHui.setHours(0, 0, 0, 0);
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
    
    // Ancien format d'options sans année
    const OPT_DATES = { weekday: 'short', day: 'numeric', month: 'short' };
    
    // NOUVELLES OPTIONS DE FORMATAGE AVEC L'ANNÉE
    const OPT_DATES_WITH_YEAR = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

    // ==================== 5. CACHE OPTIMISÉ DES JOURS WORK/OFF ====================
    
    /**
     * ⚡ PRÉ-GÉNÈRE UNE MAP: "YYYY-MM-DD" => estJourOff (boolean)
     * Accès O(1) au lieu de vérifier week-end + fériés à chaque fois
     */
    function genererCacheJours2Ans() {
        const cache = new Map();
        let dateInitiale = new Date(state.dateAujourdHui);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);

        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            const key = formatDate(d);
            const day = d.getDay();
            
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

    // ==================== 6. STEPPER AVEC THROTTLE & INITIALISATION ====================
    const inputJours = document.getElementById('jours-dispo');
    let throttleTimer = null;

    inputJours.value = state.DEFAULT_JOURS;

    const throttledCalcul = () => {
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
            calculerPontsDynamiques();
            throttleTimer = null;
        }, 150);
    };

    document.getElementById('btn-plus').addEventListener('click', () => {
        if (parseInt(inputJours.value) < 16) {
            inputJours.value = parseInt(inputJours.value) + 1;
            throttledCalcul();
        }
    });

    document.getElementById('btn-minus').addEventListener('click', () => {
        if (parseInt(inputJours.value) > 1) {
            inputJours.value = parseInt(inputJours.value) - 1;
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
            
            const estEnVacances = state.listeVacances.some(
                v => currentDateString >= v.start && currentDateString <= v.end
            );
            if (estEnVacances) classes += ' vacances';

            if (state.tousLesFeries[currentDateString]) classes += ' ferie';
            
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

        for (let m = 0; m < 12; m++) {
            state.cacheCalendrier.delete(`${state.currentDisplayedYear}-${m}`);
        }
        
        rafraichirCalendrier();
    }

    document.getElementById('prev-month').addEventListener('click', () => changerDate(0, -1));
    document.getElementById('next-month').addEventListener('click', () => changerDate(0, 1));
    document.getElementById('prev-year').addEventListener('click', () => changerDate(-1, 0));
    document.getElementById('next-year').addEventListener('click', () => changerDate(1, 0));

    // ==================== 8. ALGORITHME OPTIMISÉ ====================
    
    /**
     * ⚡ ALGORITHME INTELLIGENT DE CALCUL DE PONTS
     */
    function calculerPontsDynamiques() {
        const maxJoursAPoser = parseInt(inputJours.value, 10);
        state.listeDesPonts = [];
        
        state.jours2ans = genererCacheJours2Ans();

        let dateInitiale = new Date(state.dateAujourdHui);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);

        let signatures = new Set();

        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            
            let hier = new Date(d);
            hier.setDate(hier.getDate() - 1);
            if (estJourOff(hier)) continue; 

            for (let longueur = 3; longueur <= 16; longueur++) {
                let dateFinFenetre = new Date(d);
                dateFinFenetre.setDate(dateFinFenetre.getDate() + (longueur - 1));

                let demain = new Date(dateFinFenetre);
                demain.setDate(demain.getDate() + 1);
                if (estJourOff(demain)) continue;

                let nbJoursPoses = 0;
                let contientFerie = false;
                let joursAPoserListe = [];
                let nomsFeries = new Set();

                // CORRECTION APPLIQUÉE ICI: Le curseur est correctement incrémenté.
                for (let cursor = new Date(d); cursor <= dateFinFenetre; cursor = new Date(cursor.getTime() + 86400000)) {
                    const cursorStr = formatDate(cursor);
                    const isFerie = !!state.tousLesFeries[cursorStr];
                    
                    if (isFerie) {
                        contientFerie = true;
                        nomsFeries.add(state.tousLesFeries[cursorStr]);
                    }
                    
                    if (!state.jours2ans.get(cursorStr)) {
                        nbJoursPoses++;
                        joursAPoserListe.push(cursorStr);
                    }
                }

                if (contientFerie && nbJoursPoses > 0 && nbJoursPoses <= maxJoursAPoser) {
                    const signature = d.getTime() + '-' + dateFinFenetre.getTime();
                    if (!signatures.has(signature)) {
                        signatures.add(signature);
                        
                        state.listeDesPonts.push({
                            nom: Array.from(nomsFeries).join(' + '),
                            debut: new Date(d),
                            fin: new Date(dateFinFenetre),
                            joursAPoserListe: joursAPoserListe,
                            nbJoursPoses: nbJoursPoses,
                            gain: longueur
                        });
                    }
                }
            }
        }

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
            const listeDatesPoser = pont.joursAPoserListe.map(d => {
                // MODIFICATION ICI: Utilisation de OPT_DATES_WITH_YEAR
                let dateStr = parseDate(d).toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR);
                return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            }).join(', ');

            // MODIFICATION ICI: Utilisation de OPT_DATES_WITH_YEAR
            const debutStr = pont.debut.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR);
            // MODIFICATION ICI: Utilisation de OPT_DATES_WITH_YEAR
            const finStr = pont.fin.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR);
            
            // ✅ NOUVEAU: Extraction de l'année du pont
            const annee = pont.debut.getFullYear();

            timeline.innerHTML += `
                <div class="card">
                    <h3>Autour de : ${pont.nom} (${annee})</h3>
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
        
        // Mise à jour de l'accueil
        if (state.listeDesPonts.length > 0) {
            const prochain = state.listeDesPonts[0];
            document.getElementById('next-pont').innerHTML = `
                <h3>${prochain.nom}</h3>
                <p>Du ${prochain.debut.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR)} 
                   au ${prochain.fin.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR)}</p>
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

            state.jours2ans = null;
            state.cacheCalendrier.clear();
        } catch (error) {
            console.error(`Erreur chargement fériés ${annee}:`, error);
        }
    }

    // ==================== 11. INITIALISATION ====================
    async function initData() {
        try {
            await chargerFeriesDynamique(state.dateAujourdHui.getFullYear());
            await chargerFeriesDynamique(state.dateAujourdHui.getFullYear() + 1);

            const zoneSelect = document.getElementById('zone-select');
            let userZone = localStorage.getItem('userZone') || 'A';
            zoneSelect.value = userZone;
            
            await fetchVacances(userZone);

            zoneSelect.addEventListener('change', async (e) => {
                localStorage.setItem('userZone', e.target.value);
                await fetchVacances(e.target.value);
            });

            calculerPontsDynamiques();
            afficherVueMensuelle(); // <-- Cette ligne a été ajoutée ici
        } catch (error) {
            console.error("Erreur initialisation:", error);
        }
    }

    initData();
});
