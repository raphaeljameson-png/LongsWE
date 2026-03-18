document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. GESTION DES ONGLETS ---
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

    // Bascule Mois/Année du calendrier
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

    // --- 2. VARIABLES GLOBALES ---
    let tousLesFeries = {};
    let listeDesPonts = [];
    const dateAujourdHui = new Date();
    const currentYear = dateAujourdHui.getFullYear();
    let currentDisplayedMonth = dateAujourdHui.getMonth(); 

    // --- 3. LE GÉNÉRATEUR DE CALENDRIER ---
    const joursSemaine = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    function genererMoisHTML(year, month, isMini = false) {
        let html = `<div class="month-grid">`;
        joursSemaine.forEach(jour => { html += `<div class="day-header">${jour}</div>`; });

        const premierJour = new Date(year, month, 1).getDay();
        const decalage = premierJour === 0 ? 6 : premierJour - 1; 
        const joursDansLeMois = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < decalage; i++) { html += `<div class="day-cell empty"></div>`; }

        for (let jour = 1; jour <= joursDansLeMois; jour++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            let classes = 'day-cell';
            
            if (tousLesFeries[dateString]) classes += ' ferie';
            if (listeDesPonts.find(p => p.dateAPoser === dateString)) classes += ' pont';

            html += `<div class="${classes}">${jour}</div>`;
        }
        return html + `</div>`;
    }

    function afficherVueMensuelle() {
        document.getElementById('current-month-title').innerText = `${nomsMois[currentDisplayedMonth]} ${currentYear}`;
        document.getElementById('month-container').innerHTML = genererMoisHTML(currentYear, currentDisplayedMonth);
    }

    function afficherVueAnnuelle() {
        const container = document.getElementById('year-container');
        container.innerHTML = '';
        for (let m = 0; m < 12; m++) {
            const divMois = document.createElement('div');
            divMois.className = 'mini-month';
            divMois.innerHTML = `<h4>${nomsMois[m]}</h4>` + genererMoisHTML(currentYear, m, true);
            container.appendChild(divMois);
        }
    }

    document.getElementById('prev-month').addEventListener('click', () => {
        if(currentDisplayedMonth > 0) { currentDisplayedMonth--; afficherVueMensuelle(); }
    });
    document.getElementById('next-month').addEventListener('click', () => {
        if(currentDisplayedMonth < 11) { currentDisplayedMonth++; afficherVueMensuelle(); }
    });

    // --- 4. AFFICHAGE DE LA LISTE (EXPLORATEUR) ET DU FILTRE ---
    function afficherTimeline(pontsFiltres) {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = ''; 

        if (pontsFiltres.length === 0) {
            timeline.innerHTML = `<p>Aucun pont trouvé pour ce nombre de jours. Soyez plus généreux ! 😉</p>`;
            return;
        }

        pontsFiltres.forEach(pont => {
            const dateFerieFormat = pont.dateFerie.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            const datePoserFormat = new Date(pont.dateAPoser).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            
            timeline.innerHTML += `
                <div class="card">
                    <h3>${pont.nom}</h3>
                    <p><strong>Férié le :</strong> ${dateFerieFormat}</p>
                    <p>Posez le <strong>${datePoserFormat}</strong>.</p>
                    <p class="highlight">💡 ${pont.joursAPoser} jour posé = 4 jours de week-end !</p>
                </div>
            `;
        });
    }

    // Activer le bouton de filtre !
    const btnFiltrer = document.querySelector('.filter-bar .btn-secondary');
    const inputJours = document.getElementById('jours-dispo');
    
    btnFiltrer.addEventListener('click', () => {
        const maxJours = parseInt(inputJours.value, 10);
        // On filtre la liste globale pour ne garder que ceux qui demandent moins ou autant de jours que souhaité
        const resultats = listeDesPonts.filter(pont => pont.joursAPoser <= maxJours);
        afficherTimeline(resultats);
    });


    // --- 5. RÉCUPÉRATION DES DONNÉES & ALGORITHME ---
    async function initData() {
        const annees = [currentYear, currentYear + 1];

        // 1. Récupérer les jours fériés sur 2 ans
        for (let annee of annees) {
            try {
                const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`);
                const data = await response.json();
                Object.assign(tousLesFeries, data);
            } catch (error) { console.error("Erreur API :", error); }
        }

        // 2. Calculer les ponts
        for (const [dateStr, nomFerie] of Object.entries(tousLesFeries)) {
            const dateFerie = new Date(dateStr);
            if (dateFerie < dateAujourdHui) continue; // On ignore le passé

            const jourDeLaSemaine = dateFerie.getDay(); 

            if (jourDeLaSemaine === 2) { // Mardi
                const dateAPoser = new Date(dateFerie);
                dateAPoser.setDate(dateFerie.getDate() - 1);
                listeDesPonts.push({
                    nom: nomFerie,
                    dateFerie: dateFerie,
                    dateAPoser: dateAPoser.toISOString().split('T')[0],
                    joursAPoser: 1 // Nouvelle donnée pour faire marcher le filtre
                });
            } else if (jourDeLaSemaine === 4) { // Jeudi
                const dateAPoser = new Date(dateFerie);
                dateAPoser.setDate(dateFerie.getDate() + 1);
                listeDesPonts.push({
                    nom: nomFerie,
                    dateFerie: dateFerie,
                    dateAPoser: dateAPoser.toISOString().split('T')[0],
                    joursAPoser: 1 // Nouvelle donnée pour faire marcher le filtre
                });
            }
        }

        // 3. Mise à jour de l'interface
        afficherVueMensuelle();
        afficherVueAnnuelle();
        afficherTimeline(listeDesPonts); // On affiche tout par défaut
        
        // Mettre à jour l'accueil
        if(listeDesPonts.length > 0) {
            const prochain = listeDesPonts[0];
            document.getElementById('next-pont').innerHTML = `
                <h3>${prochain.nom}</h3>
                <p>Posez le <strong>${new Date(prochain.dateAPoser).toLocaleDateString('fr-FR')}</strong>.</p>
                <p class="highlight">1 jour posé = 4 jours de repos</p>
            `;
        }
    }

    initData();
});
