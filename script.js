document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. GESTION DES ONGLETS & UI ---
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
        btnMensuel.classList.add('active'); btnAnnuel.classList.remove('active');
        vueMensuelle.classList.add('active'); vueAnnuelle.classList.remove('active');
    });
    btnAnnuel.addEventListener('click', () => {
        btnAnnuel.classList.add('active'); btnMensuel.classList.remove('active');
        vueAnnuelle.classList.add('active'); vueMensuelle.classList.remove('active');
    });

    // Stepper (Filtre Jours) - Il relance l'algorithme à chaque clic !
    const inputJours = document.getElementById('jours-dispo');
    document.getElementById('btn-plus').addEventListener('click', () => {
        if(inputJours.value < 10) { 
            inputJours.value++; 
            calculerPontsDynamiques(); 
        }
    });
    document.getElementById('btn-minus').addEventListener('click', () => {
        if(inputJours.value > 1) { 
            inputJours.value--; 
            calculerPontsDynamiques(); 
        }
    });

    // --- 2. LOGIQUE DES DATES ---
    function parseDate(str) {
        const [y, m, d] = str.split('-');
        return new Date(y, m - 1, d);
    }
    function formatDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    let tousLesFeries = {};
    let listeDesPonts = []; // La liste qui se recréera à chaque clic
    let listeVacances = [];
    let anneesChargees = []; 
    const dateAujourdHui = new Date();
    
    let currentDisplayedYear = dateAujourdHui.getFullYear();
    let currentDisplayedMonth = dateAujourdHui.getMonth(); 

    // --- 3. GÉNÉRATION DU CALENDRIER ---
    const joursSemaine = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    function genererMoisHTML(year, month) {
        let html = `<div class="month-grid">`;
        joursSemaine.forEach(jour => { html += `<div class="day-header">${jour}</div>`; });

        const premierJour = new Date(year, month, 1).getDay();
        const decalage = premierJour === 0 ? 6 : premierJour - 1; 
        const joursDansLeMois = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < decalage; i++) { html += `<div class="day-cell empty"></div>`; }

        for (let jour = 1; jour <= joursDansLeMois; jour++) {
            const currentDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            let classes = 'day-cell';
            
            const estEnVacances = listeVacances.some(v => currentDateString >= v.start && currentDateString <= v.end);
            if (estEnVacances) classes += ' vacances';

            if (tousLesFeries[currentDateString]) classes += ' ferie';
            
            // On colore en bleu si la date fait partie des jours à poser du MEILLEUR pont trouvé
            if (listeDesPonts.some(p => p.joursAPoserListe.includes(currentDateString))) classes += ' pont';

            html += `<div class="${classes}">${jour}</div>`;
        }
        return html + `</div>`;
    }

    function rafraichirCalendrier() {
        document.getElementById('current-month-title').innerText = `${nomsMois[currentDisplayedMonth]} ${currentDisplayedYear}`;
        document.getElementById('month-container').innerHTML = genererMoisHTML(currentDisplayedYear, currentDisplayedMonth);
        
        document.getElementById('current-year-title').innerText = currentDisplayedYear;
        const yearContainer = document.getElementById('year-container');
        yearContainer.innerHTML = '';
        for (let m = 0; m < 12; m++) {
            const div = document.createElement('div');
            div.className = 'mini-month';
            div.innerHTML = `<h4>${nomsMois[m]}</h4>` + genererMoisHTML(currentDisplayedYear, m);
            yearContainer.appendChild(div);
        }
    }

    async function changerDate(deltaAnnee, deltaMois = 0) {
        currentDisplayedYear += deltaAnnee;
        currentDisplayedMonth += deltaMois;

        if(currentDisplayedMonth < 0) { currentDisplayedMonth = 11; currentDisplayedYear--; }
        if(currentDisplayedMonth > 11) { currentDisplayedMonth = 0; currentDisplayedYear++; }

        if (!anneesChargees.includes(currentDisplayedYear)) {
            await chargerFeriesDynamique(currentDisplayedYear);
        }
        rafraichirCalendrier();
    }

    document.getElementById('prev-month').addEventListener('click', () => changerDate(0, -1));
    document.getElementById('next-month').addEventListener('click', () => changerDate(0, 1));
    document.getElementById('prev-year').addEventListener('click', () => changerDate(-1, 0));
    document.getElementById('next-year').addEventListener('click', () => changerDate(1, 0));

    // --- 4. L'ALGORITHME DYNAMIQUE DE RECHERCHE DE PONTS ---
    
    // Fonction utilitaire : est-ce qu'une date est chômée de base ? (Week-end ou Férié)
    function estJourOff(dateObj) {
        const day = dateObj.getDay();
        if (day === 0 || day === 6) return true; // Dimanche (0) ou Samedi (6)
        if (tousLesFeries[formatDate(dateObj)]) return true; // Férié
        return false;
    }

    function calculerPontsDynamiques() {
        const maxJoursAPoser = parseInt(inputJours.value, 10);
        listeDesPonts = []; // On réinitialise à zéro
        let signatures = new Set(); // Pour éviter les doublons

        let dateInitiale = new Date(dateAujourdHui);
        dateInitiale.setHours(0,0,0,0);
        let dateFin = new Date(dateInitiale.getFullYear() + 2, 11, 31);

        // On teste CHAQUE jour des 2 prochaines années comme début potentiel de vacances
        for (let d = new Date(dateInitiale); d <= dateFin; d.setDate(d.getDate() + 1)) {
            
            // Règle 1: Un bloc de vacances optimisé commence toujours APRÈS un jour de travail.
            // Si hier était déjà un week-end ou férié, on passe (le bloc aurait dû commencer avant).
            let hier = new Date(d);
            hier.setDate(hier.getDate() - 1);
            if (estJourOff(hier)) continue; 

            // Règle 2: On teste des blocs de vacances de 3 à 16 jours de long
            for (let longueur = 3; longueur <= 16; longueur++) {
                let dateFinFenetre = new Date(d);
                dateFinFenetre.setDate(dateFinFenetre.getDate() + (longueur - 1));

                // Règle 3: Un bloc optimisé se termine toujours AVANT un jour de travail.
                let demain = new Date(dateFinFenetre);
                demain.setDate(demain.getDate() + 1);
                if (estJourOff(demain)) continue;

                // Analysons ce qui se passe à l'intérieur de ce bloc
                let nbJoursPoses = 0;
                let contientFerie = false;
                let joursAPoserListe = [];
                let nomsFeries = new Set();

                for (let cursor = new Date(d); cursor <= dateFinFenetre; cursor.setDate(cursor.getDate() + 1)) {
                    const isFerie = !!tousLesFeries[formatDate(cursor)];
                    if (isFerie) {
                        contientFerie = true;
                        nomsFeries.add(tousLesFeries[formatDate(cursor)]);
                    }
                    if (!estJourOff(cursor)) {
                        nbJoursPoses++;
                        joursAPoserListe.push(formatDate(cursor));
                    }
                }

                // Règle Finale : On valide SI ça englobe un jour férié ET que le coût respecte le budget de l'utilisateur
                if (contientFerie && nbJoursPoses > 0 && nbJoursPoses <= maxJoursAPoser) {
                    const signature = d.getTime() + '-' + dateFinFenetre.getTime();
                    if (!signatures.has(signature)) {
                        signatures.add(signature);
                        
                        listeDesPonts.push({
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

        // On trie par date de début
        listeDesPonts.sort((a, b) => a.debut - b.debut);

        afficherTimelineDynamique();
        rafraichirCalendrier();
    }

    function afficherTimelineDynamique() {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = ''; 
        const maxJours = parseInt(inputJours.value, 10);

        if (listeDesPonts.length === 0) {
            timeline.innerHTML = `<p class="text-muted" style="text-align:center; padding: 20px;">Aucune combinaison magique trouvée pour ${maxJours} jour(s).<br>Essayez d'augmenter votre budget !</p>`;
            return;
        }

        // Options pour afficher les dates joliment (ex: "Jeu. 1 Mai")
        const optDates = { weekday:'short', day:'numeric', month:'short' };

        listeDesPonts.forEach(pont => {
            const listeDatesPoser = pont.joursAPoserListe.map(d => {
                let dateStr = parseDate(d).toLocaleDateString('fr-FR', optDates);
                return dateStr.charAt(0).toUpperCase() + dateStr.slice(1); // Majuscule
            }).join(', ');

            const debutStr = pont.debut.toLocaleDateString('fr-FR', optDates);
            const finStr = pont.fin.toLocaleDateString('fr-FR', optDates);

            timeline.innerHTML += `
                <div class="card">
                    <h3>Autour de : ${pont.nom}</h3>
                    <p class="text-muted" style="margin-bottom: 12px;">Période off : du ${debutStr} au ${finStr}</p>
                    <p style="font-size: 0.95rem;"><strong>Dates à poser (${pont.nbJoursPoses}) :</strong><br>${listeDatesPoser}</p>
                    <div style="margin-top: 15px;">
                        <span class="pont-tag">🎁 ${pont.nbJoursPoses} posé(s) = ${pont.gain} jours de vacances !</span>
                    </div>
                </div>`;
        });
        
        // Mettre à jour l'accueil avec le prochain gros coup à jouer
        if(listeDesPonts.length > 0) {
            const prochain = listeDesPonts[0];
            document.getElementById('next-pont').innerHTML = `
                <h3>${prochain.nom}</h3>
                <p>Du ${prochain.debut.toLocaleDateString('fr-FR', optDates)} au ${prochain.fin.toLocaleDateString('fr-FR', optDates)}</p>
                <p style="font-weight:bold; margin-top:10px;">${prochain.nbJoursPoses} jour(s) posé(s) = ${prochain.gain} jours de repos</p>
            `;
        } else {
            document.getElementById('next-pont').innerHTML = `<h3>Aucun pont en vue</h3>`;
        }
    }

    // --- 5. INITIALISATION DES DONNÉES ---
    async function fetchVacances(zone) {
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=population="Élèves"`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            listeVacances = data.results
                .filter(r => r.zones === `Zone ${zone}`)
                .map(r => ({ start: r.start_date.split('T')[0], end: r.end_date.split('T')[0] }));
            rafraichirCalendrier();
        } catch (error) { console.error("Erreur Vacances :", error); }
    }

    async function chargerFeriesDynamique(annee) {
        try {
            const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
            if (response.ok) {
                Object.assign(tousLesFeries, await response.json());
                anneesChargees.push(annee);
            }
        } catch (error) { console.log("Erreur chargement année " + annee); }
    }

    async function initData() {
        await chargerFeriesDynamique(dateAujourdHui.getFullYear());
        await chargerFeriesDynamique(dateAujourdHui.getFullYear() + 1);

        const zoneSelect = document.getElementById('zone-select');
        let userZone = localStorage.getItem('userZone') || 'A';
        zoneSelect.value = userZone;
        fetchVacances(userZone);

        zoneSelect.addEventListener('change', (e) => {
            localStorage.setItem('userZone', e.target.value);
            fetchVacances(e.target.value);
        });

        // Lancement du calcul dynamique !
        calculerPontsDynamiques();
    }

    initData();
});
