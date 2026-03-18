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

    const inputJours = document.getElementById('jours-dispo');
    document.getElementById('btn-plus').addEventListener('click', () => {
        if(inputJours.value < 10) { inputJours.value++; filtrerTimeline(); }
    });
    document.getElementById('btn-minus').addEventListener('click', () => {
        if(inputJours.value > 1) { inputJours.value--; filtrerTimeline(); }
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
    let listeDesPonts = [];
    let listeVacances = [];
    let anneesChargees = []; // Historique des années téléchargées
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
            if (listeDesPonts.some(p => p.joursAPoserListe.includes(currentDateString))) classes += ' pont';

            html += `<div class="${classes}">${jour}</div>`;
        }
        return html + `</div>`;
    }

    function rafraichirCalendrier() {
        // Mise à jour de la vue mensuelle
        document.getElementById('current-month-title').innerText = `${nomsMois[currentDisplayedMonth]} ${currentDisplayedYear}`;
        document.getElementById('month-container').innerHTML = genererMoisHTML(currentDisplayedYear, currentDisplayedMonth);
        
        // Mise à jour de la vue annuelle
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

    // Navigation dynamique pour recharger les données si besoin
    async function changerDate(deltaAnnee, deltaMois = 0) {
        currentDisplayedYear += deltaAnnee;
        currentDisplayedMonth += deltaMois;

        if(currentDisplayedMonth < 0) { currentDisplayedMonth = 11; currentDisplayedYear--; }
        if(currentDisplayedMonth > 11) { currentDisplayedMonth = 0; currentDisplayedYear++; }

        // Si l'année n'a jamais été chargée, on va la chercher sur le serveur du gouvernement
        if (!anneesChargees.includes(currentDisplayedYear)) {
            await chargerFeriesDynamique(currentDisplayedYear);
        }
        
        rafraichirCalendrier();
    }

    document.getElementById('prev-month').addEventListener('click', () => changerDate(0, -1));
    document.getElementById('next-month').addEventListener('click', () => changerDate(0, 1));
    
    // Nouveaux boutons pour l'année
    document.getElementById('prev-year').addEventListener('click', () => changerDate(-1, 0));
    document.getElementById('next-year').addEventListener('click', () => changerDate(1, 0));

    // --- 4. LISTE & FILTRES ---
    function filtrerTimeline() {
        const maxJours = parseInt(inputJours.value, 10);
        const pontsFiltres = listeDesPonts.filter(p => p.nbJoursPoses <= maxJours);
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = ''; 

        if (pontsFiltres.length === 0) {
            timeline.innerHTML = `<p class="text-muted" style="text-align:center;">Aucun pont trouvé pour ${maxJours} jour(s).<br>Augmentez le nombre de jours !</p>`;
            return;
        }

        pontsFiltres.forEach(pont => {
            const dFerie = parseDate(pont.dateFerieStr);
            timeline.innerHTML += `
                <div class="card">
                    <h3>${pont.nom}</h3>
                    <p class="text-muted">Férié le ${dFerie.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</p>
                    <p>${pont.description}</p>
                    <span class="pont-tag">${pont.nbJoursPoses} jour(s) posé(s) = ${pont.gain} jours de repos !</span>
                </div>`;
        });
    }

    // --- 5. CHARGEMENT & ALGORYTHME ---
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
                calculerPontsGlobaux(); // On recalcule les ponts avec les nouvelles données
            }
        } catch (error) { console.log("Erreur chargement année " + annee); }
    }

    function calculerPontsGlobaux() {
        listeDesPonts = []; // On vide pour recalculer propre
        
        for (const [dateStr, nomFerie] of Object.entries(tousLesFeries)) {
            const dateFerie = parseDate(dateStr);
            if (dateFerie < dateAujourdHui) continue;

            const jSemaine = dateFerie.getDay(); 
            
            // 1. PONT CLASSIQUE
            if (jSemaine === 2 || jSemaine === 4) { 
                const dateAPoser = new Date(dateFerie);
                dateAPoser.setDate(dateFerie.getDate() + (jSemaine === 2 ? -1 : 1));
                listeDesPonts.push({
                    nom: `Pont : ${nomFerie}`,
                    dateFerieStr: dateStr,
                    joursAPoserListe: [formatDate(dateAPoser)],
                    nbJoursPoses: 1, gain: 4,
                    description: `Posez le ${jSemaine===2?'Lundi':'Vendredi'} ${dateAPoser.getDate()}`
                });

                // Option Grand Chelem
                const gcLundi = new Date(dateFerie); gcLundi.setDate(dateFerie.getDate() - (jSemaine-1));
                let gcJours = [];
                for(let i=0; i<5; i++) {
                    const d = new Date(gcLundi); d.setDate(gcLundi.getDate() + i);
                    if(formatDate(d) !== dateStr) gcJours.push(formatDate(d)); 
                }
                listeDesPonts.push({
                    nom: `Grand Chelem : ${nomFerie}`,
                    dateFerieStr: dateStr,
                    joursAPoserListe: gcJours,
                    nbJoursPoses: 4, gain: 9,
                    description: `Posez le reste de la semaine pour rafler 9 jours.`
                });
            }

            // 2. LE VIADUC
            if (jSemaine === 3) {
                const j1 = new Date(dateFerie); j1.setDate(dateFerie.getDate() + 1);
                const j2 = new Date(dateFerie); j2.setDate(dateFerie.getDate() + 2);
                listeDesPonts.push({
                    nom: `Viaduc : ${nomFerie}`,
                    dateFerieStr: dateStr,
                    joursAPoserListe: [formatDate(j1), formatDate(j2)],
                    nbJoursPoses: 2, gain: 5,
                    description: `Posez le Jeudi et le Vendredi qui suivent.`
                });
            }
        }
        filtrerTimeline();
    }

    async function initData() {
        // On charge l'année en cours et l'année suivante au démarrage
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

        rafraichirCalendrier();
        
        if(listeDesPonts.length > 0) {
            listeDesPonts.sort((a,b) => parseDate(a.dateFerieStr) - parseDate(b.dateFerieStr));
            const prochain = listeDesPonts[0];
            document.getElementById('next-pont').innerHTML = `
                <h3>${prochain.nom}</h3>
                <p>${prochain.description}</p>
                <p style="font-weight:bold; margin-top:10px;">${prochain.nbJoursPoses} jour(s) posé(s) = ${prochain.gain} jours de repos</p>
            `;
        }
    }

    initData();
});
