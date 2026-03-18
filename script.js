document.addEventListener('DOMContentLoaded', () => {

    // ==================== 1. GESTION DES ONGLETS ====================
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

    // ==================== 2. VUES CALENDRIER (Mois/Année) ====================
    const btnMensuel = document.getElementById('btn-mensuel');
    const btnAnnuel = document.getElementById('btn-annuel');
    const vueMensuelle = document.getElementById('vue-mensuelle');
    const vueAnnuelle = document.getElementById('vue-annuelle');

    btnMensuel.addEventListener('click', () => {
        btnMensuel.classList.add('active'); btnAnnuel.classList.remove('active');
        vueMensuelle.classList.add('active'); vueAnnuelle.classList.remove('active');
    });

    btnAnnuel.addEventListener('click', () => {
        btnAnnuel.classList.add('active'); btnMensuel.classList.remove('active');
        vueAnnuelle.classList.add('active'); vueMensuelle.classList.remove('active');
    });

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
        DEFAULT_JOURS_POSER: 4,
        DEFAULT_NB_OBJECTIFS: 5
    };

    state.dateAujourdHui.setHours(0, 0, 0, 0);
    state.currentDisplayedYear = state.dateAujourdHui.getFullYear();
    state.currentDisplayedMonth = state.dateAujourdHui.getMonth();

    const parseDate = (str) => { const [y, m, d] = str.split('-'); return new Date(y, m - 1, d); };
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const OPT_DATES_WITH_YEAR = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

    // ==================== 4. CACHE OPTIMISÉ (Jours Travaillés/Chômés) ====================
    function genererCacheJours2Ans() {
        const cache = new Map();
        let dateInitiale = new Date(state.dateAujourdHui);
        dateInitiale.setDate(dateInitiale.getDate() - 10); // Marge pour la veille
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);

        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            const key = formatDate(d);
            const day = d.getDay();
            const isOff = (day === 0 || day === 6) || !!state.tousLesFeries[key];
            cache.set(key, isOff);
        }
        return cache;
    }

    const estJourOff = (dateObj) => state.jours2ans?.get(formatDate(dateObj)) ?? false;

    // ==================== 5. SÉCURITÉ : THROTTLE POUR LES COMPTEURS ====================
    let throttleTimer = null;
    const throttledCalcul = () => {
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
            try {
                calculerPontsDynamiques();
            } catch (error) {
                console.error("Erreur de calcul des ponts:", error);
            } finally {
                throttleTimer = null; // GARANTIT que le bouton ne se bloque jamais
            }
        }, 150);
    };

    // --- Compteur 1 : Jours à poser (Onglet Ponts) ---
    const inputJours = document.getElementById('jours-dispo');
    inputJours.value = state.DEFAULT_JOURS_POSER;

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

    // --- Compteur 2 : Nombre d'objectifs (Onglet Accueil) ---
    const inputObj = document.getElementById('obj-dispo');
    inputObj.value = state.DEFAULT_NB_OBJECTIFS;

    document.getElementById('btn-obj-plus').addEventListener('click', () => {
        if (parseInt(inputObj.value) < 20) { 
            inputObj.value = parseInt(inputObj.value) + 1; 
            mettreAJourAccueil(); // Ne demande pas de refaire les maths, juste l'affichage
        }
    });
    document.getElementById('btn-obj-minus').addEventListener('click', () => {
        if (parseInt(inputObj.value) > 1) { 
            inputObj.value = parseInt(inputObj.value) - 1; 
            mettreAJourAccueil(); 
        }
    });

    // ==================== 6. LE CERVEAU INTELLIGENT (CORRIGÉ) ====================
    function calculerPontsDynamiques() {
        const maxJoursAPoser = parseInt(inputJours.value, 10) || 4;
        state.jours2ans = genererCacheJours2Ans();
        state.cacheCalendrier.clear(); 

        let dateInitiale = new Date(state.dateAujourdHui);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);
        let bestPonts = {}; 

        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            
            // Une fenêtre de repos doit se glisser entre deux jours travaillés
            let hier = new Date(d); hier.setDate(hier.getDate() - 1);
            if (estJourOff(hier)) continue; 

            for (let longueur = 3; longueur <= 16; longueur++) {
                let dateFinFenetre = new Date(d);
                dateFinFenetre.setDate(dateFinFenetre.getDate() + (longueur - 1));

                let demain = new Date(dateFinFenetre); demain.setDate(demain.getDate() + 1);
                if (estJourOff(demain)) continue;

                let nbJoursPoses = 0;
                let contientFerie = false;
                let joursAPoserListe = [];
                let nomsFeries = new Set();

                for (let cursor = new Date(d); cursor <= dateFinFenetre; cursor.setDate(cursor.getDate() + 1)) {
                    const cursorStr = formatDate(cursor);
                    
                    if (state.tousLesFeries[cursorStr]) {
                        contientFerie = true;
                        nomsFeries.add(state.tousLesFeries[cursorStr]);
                    }
                    if (!estJourOff(cursor)) {
                        nbJoursPoses++;
                        joursAPoserListe.push(cursorStr);
                    }
                }

                if (contientFerie && nbJoursPoses > 0 && nbJoursPoses <= maxJoursAPoser) {
                    const nomCombinaison = Array.from(nomsFeries).join(' + ');
                    const anneeDuPont = d.getFullYear();
                    
                    // L'IDENTIFIANT UNIQUE : Différencie 2026 de 2027 pour ne plus écraser la liste !
                    const identifiantUnique = `${nomCombinaison}_${anneeDuPont}`;
                    
                    const proposition = {
                        nom: nomCombinaison,
                        annee: anneeDuPont,
                        debut: new Date(d),
                        fin: new Date(dateFinFenetre),
                        joursAPoserListe: joursAPoserListe,
                        nbJoursPoses: nbJoursPoses,
                        gain: longueur
                    };

                    if (!bestPonts[identifiantUnique]) {
                        bestPonts[identifiantUnique] = proposition;
                    } else if (proposition.gain > bestPonts[identifiantUnique].gain) {
                        bestPonts[identifiantUnique] = proposition;
                    } else if (proposition.gain === bestPonts[identifiantUnique].gain && proposition.nbJoursPoses < bestPonts[identifiantUnique].nbJoursPoses) {
                        bestPonts[identifiantUnique] = proposition;
                    }
                }
            }
        }

        state.listeDesPonts = Object.values(bestPonts);
        state.listeDesPonts.sort((a, b) => a.debut - b.debut);

        afficherTimelineDynamique();
        mettreAJourAccueil();
        rafraichirCalendrier();
    }

    // ==================== 7. AFFICHAGE (ONGLET PONTS) ====================
    function afficherTimelineDynamique() {
        const timeline = document.getElementById('timeline');
        if (!timeline) return;
        timeline.innerHTML = '';
        const maxJours = parseInt(inputJours.value, 10) || 4;

        if (state.listeDesPonts.length === 0) {
            timeline.innerHTML = `
                <div style="animation: fadeIn 0.3s ease;">
                    <p class="text-muted" style="text-align:center; padding: 20px;">
                        Aucune combinaison trouvée pour ${maxJours} jour(s).<br>
                        Essayez d'augmenter votre budget !
                    </p>
                </div>`;
            return;
        }

        state.listeDesPonts.forEach(pont => {
            const listeDatesPoser = pont.joursAPoserListe.map(d => {
                let dateStr = parseDate(d).toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR);
                return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            }).join(', ');

            const debutStr = pont.debut.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR);
            const finStr = pont.fin.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR);

            // Ajout d'une animation "fadeIn" pour voir l'interface réagir au clic !
            timeline.innerHTML += `
                <div class="card" style="animation: fadeIn 0.4s ease;">
                    <h3>Autour de : ${pont.nom} (${pont.annee})</h3>
                    <p class="text-muted" style="margin-bottom: 12px;">Période off : du ${debutStr} au ${finStr}</p>
                    <p style="font-size: 0.95rem;"><strong>Dates à poser (${pont.nbJoursPoses}) :</strong><br>${listeDatesPoser}</p>
                    <div style="margin-top: 15px;">
                        <span class="pont-tag">🎁 ${pont.nbJoursPoses} jour(s) posé(s) = ${pont.gain} jours de repos !</span>
                    </div>
                </div>`;
        });
    }

    // ==================== 8. AFFICHAGE DU TABLEAU DE BORD (ONGLET ACCUEIL) ====================
    function mettreAJourAccueil() {
        const homeContainer = document.getElementById('next-ponts-container');
        if (!homeContainer) return;

        homeContainer.innerHTML = '';
        const nbObjectifs = parseInt(inputObj.value, 10) || 5;

        if (state.listeDesPonts.length > 0) {
            const topPonts = state.listeDesPonts.slice(0, nbObjectifs);

            topPonts.forEach((pont, index) => {
                const isFirst = index === 0;
                const cardClass = isFirst ? 'highlight-card card' : 'card';
                const tagStyle = isFirst ? 'background: rgba(255,255,255,0.2); color: white; box-shadow: none;' : '';
                const textStyle = isFirst ? 'color: rgba(255,255,255,0.9);' : 'color: var(--text-muted);';

                homeContainer.innerHTML += `
                    <div class="${cardClass}" style="animation: fadeIn 0.4s ease;">
                        <h3>${pont.nom} (${pont.annee})</h3>
                        <p style="${textStyle} margin-bottom: 12px;">
                            Du ${pont.debut.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR)} 
                            au ${pont.fin.toLocaleDateString('fr-FR', OPT_DATES_WITH_YEAR)}
                        </p>
                        <div style="margin-top: 15px;">
                            <span class="pont-tag" style="${tagStyle}">
                                🎁 ${pont.nbJoursPoses} jour(s) posé(s) = ${pont.gain} jours de repos
                            </span>
                        </div>
                    </div>
                `;
            });
        } else {
            homeContainer.innerHTML = `<div class="card" style="animation: fadeIn 0.3s ease;"><h3 style="text-align:center;">Aucun pont en vue</h3></div>`;
        }
    }

    // ==================== 9. MOTEUR DU CALENDRIER ====================
    function genererMoisHTML(year, month) {
        const cacheKey = `${year}-${month}`;
        if (state.cacheCalendrier.has(cacheKey)) return state.cacheCalendrier.get(cacheKey);

        let html = `<div class="month-grid">`;
        JOURS_SEMAINE.forEach(jour => { html += `<div class="day-header">${jour}</div>`; });

        const premierJour = new Date(year, month, 1).getDay();
        const decalage = premierJour === 0 ? 6 : premierJour - 1;
        const joursDansLeMois = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < decalage; i++) { html += `<div class="day-cell empty"></div>`; }

        for (let jour = 1; jour <= joursDansLeMois; jour++) {
            const currentDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            let classes = 'day-cell';
            
            if (state.listeVacances.some(v => currentDateString >= v.start && currentDateString <= v.end)) classes += ' vacances';
            if (state.tousLesFeries[currentDateString]) classes += ' ferie';
            if (state.listeDesPonts.some(p => p.joursAPoserListe.includes(currentDateString))) classes += ' pont';

            html += `<div class="${classes}">${jour}</div>`;
        }

        html += `</div>`;
        state.cacheCalendrier.set(cacheKey, html);
        return html;
    }

    function rafraichirCalendrier() {
        document.getElementById('current-month-title').innerText = `${NOMS_MOIS[state.currentDisplayedMonth]} ${state.currentDisplayedYear}`;
        document.getElementById('month-container').innerHTML = genererMoisHTML(state.currentDisplayedYear, state.currentDisplayedMonth);
        
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

        if (state.currentDisplayedMonth < 0) { state.currentDisplayedMonth = 11; state.currentDisplayedYear--; }
        if (state.currentDisplayedMonth > 11) { state.currentDisplayedMonth = 0; state.currentDisplayedYear++; }

        if (!state.anneesChargees.has(state.currentDisplayedYear)) {
            await chargerFeriesDynamique(state.currentDisplayedYear);
            calculerPontsDynamiques(); 
        } else {
            rafraichirCalendrier();
        }
    }

    document.getElementById('prev-month').addEventListener('click', () => changerDate(0, -1));
    document.getElementById('next-month').addEventListener('click', () => changerDate(0, 1));
    document.getElementById('prev-year').addEventListener('click', () => changerDate(-1, 0));
    document.getElementById('next-year').addEventListener('click', () => changerDate(1, 0));

    // ==================== 10. API FETCH (VACANCES / FÉRIÉS) ====================
    async function fetchVacances(zone) {
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=population="Élèves"`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            
            state.listeVacances = data.results ? data.results
                .filter(r => r.zones === `Zone ${zone}`)
                .map(r => ({ start: r.start_date.split('T')[0], end: r.end_date.split('T')[0] })) : [];

            state.cacheCalendrier.clear();
            rafraichirCalendrier();
        } catch (error) { console.error("Erreur API Vacances :", error); state.listeVacances = []; }
    }

    async function chargerFeriesDynamique(annee) {
        if (state.anneesChargees.has(annee)) return;
        try {
            const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
            if (response.ok) {
                Object.assign(state.tousLesFeries, await response.json());
                state.anneesChargees.add(annee);
            }
        } catch (error) { console.error(`Erreur chargement fériés ${annee}:`, error); }
    }

    // ==================== 11. INITIALISATION DU PROJET ====================
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
            afficherVueMensuelle(); 
        } catch (error) {
            console.error("Erreur critique d'initialisation:", error);
        }
    }

    initData();
});
