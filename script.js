document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. GESTION DES ONGLETS & CALENDRIER ---
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

    // --- 2. LOGIQUE DES DATES (Sécurisée contre les fuseaux horaires) ---
    function parseDate(str) {
        const [y, m, d] = str.split('-');
        return new Date(y, m - 1, d); // Heure locale minuit garanti
    }
    function formatDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    let tousLesFeries = {};
    let listeDesPonts = [];
    let listeVacances = [];
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
            
            // Vacances (Nouveau !)
            const estEnVacances = listeVacances.some(v => currentDateString >= v.start && currentDateString <= v.end);
            if (estEnVacances) classes += ' vacances';

            // Fériés & Ponts
            if (tousLesFeries[currentDateString]) classes += ' ferie';
            if (listeDesPonts.find(p => p.dateAPoser === currentDateString)) classes += ' pont';

            html += `<div class="${classes}">${jour}</div>`;
        }
        return html + `</div>`;
    }

    function rafraichirCalendrier() {
        document.getElementById('current-month-title').innerText = `${nomsMois[currentDisplayedMonth]} ${currentDisplayedYear}`;
        document.getElementById('month-container').innerHTML = genererMoisHTML(currentDisplayedYear, currentDisplayedMonth);
        
        const yearContainer = document.getElementById('year-container');
        yearContainer.innerHTML = '';
        for (let m = 0; m < 12; m++) {
            const div = document.createElement('div');
            div.className = 'mini-month';
            div.innerHTML = `<h4>${nomsMois[m]}</h4>` + genererMoisHTML(currentDisplayedYear, m);
            yearContainer.appendChild(div);
        }
    }

    // Navigation (Corrigée pour passer à l'année suivante)
    document.getElementById('prev-month').addEventListener('click', () => {
        currentDisplayedMonth--;
        if(currentDisplayedMonth < 0) { currentDisplayedMonth = 11; currentDisplayedYear--; }
        rafraichirCalendrier();
    });
    document.getElementById('next-month').addEventListener('click', () => {
        currentDisplayedMonth++;
        if(currentDisplayedMonth > 11) { currentDisplayedMonth = 0; currentDisplayedYear++; }
        rafraichirCalendrier();
    });

    // --- 4. LISTE & FILTRES ---
    function afficherTimeline(pontsFiltres) {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = ''; 
        if (pontsFiltres.length === 0) {
            timeline.innerHTML = `<p>Aucun pont trouvé pour ce nombre de jours.</p>`;
            return;
        }
        pontsFiltres.forEach(pont => {
            const dateFerie = parseDate(pont.dateFerieStr);
            const dateAPoser = parseDate(pont.dateAPoser);
            timeline.innerHTML += `
                <div class="card">
                    <h3>${pont.nom}</h3>
                    <p><strong>Férié le :</strong> ${dateFerie.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</p>
                    <p>Posez le <strong>${dateAPoser.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</strong>.</p>
                    <p class="highlight">💡 1 jour posé = 4 jours de repos !</p>
                </div>`;
        });
    }

    document.querySelector('.filter-bar .btn-secondary').addEventListener('click', () => {
        const maxJours = parseInt(document.getElementById('jours-dispo').value, 10);
        afficherTimeline(listeDesPonts.filter(p => p.joursAPoser <= maxJours));
    });

    // --- 5. CHARGEMENT DES DONNÉES ---
    async function fetchVacances(zone) {
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=population="Élèves"`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            listeVacances = data.results
                .filter(r => r.zones === `Zone ${zone}`)
                .map(r => ({ start: r.start_date.split('T')[0], end: r.end_date.split('T')[0] }));
            rafraichirCalendrier(); // Met à jour le vert sur le calendrier
        } catch (error) { console.error("Erreur Vacances :", error); }
    }

    async function initData() {
        const annees = [dateAujourdHui.getFullYear(), dateAujourdHui.getFullYear() + 1];
        for (let annee of annees) {
            try {
                const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
                Object.assign(tousLesFeries, await response.json());
            } catch (error) { console.error("Erreur API :", error); }
        }

        for (const [dateStr, nomFerie] of Object.entries(tousLesFeries)) {
            const dateFerie = parseDate(dateStr);
            if (dateFerie < dateAujourdHui) continue;

            const jourSemaine = dateFerie.getDay(); 
            if (jourSemaine === 2 || jourSemaine === 4) { // Mardi (2) ou Jeudi (4)
                const dateAPoser = new Date(dateFerie);
                dateAPoser.setDate(dateFerie.getDate() + (jourSemaine === 2 ? -1 : 1));
                listeDesPonts.push({
                    nom: nomFerie,
                    dateFerieStr: dateStr,
                    dateAPoser: formatDate(dateAPoser),
                    joursAPoser: 1
                });
            }
        }

        // Init Zone
        const zoneSelect = document.getElementById('zone-select');
        let userZone = localStorage.getItem('userZone') || 'A';
        zoneSelect.value = userZone;
        fetchVacances(userZone);

        zoneSelect.addEventListener('change', (e) => {
            localStorage.setItem('userZone', e.target.value);
            fetchVacances(e.target.value);
        });

        rafraichirCalendrier();
        afficherTimeline(listeDesPonts);
        
        if(listeDesPonts.length > 0) {
            const prochain = listeDesPonts[0];
            document.getElementById('next-pont').innerHTML = `
                <h3>${prochain.nom}</h3>
                <p>Posez le <strong>${parseDate(prochain.dateAPoser).toLocaleDateString('fr-FR')}</strong>.</p>
                <p class="highlight">1 jour posé = 4 jours de repos</p>
            `;
        }
    }

    initData();
});
