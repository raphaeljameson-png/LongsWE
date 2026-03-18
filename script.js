document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. GESTION DE LA NAVIGATION ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));

            button.classList.add('active');
            const targetId = button.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- 2. GESTION DE LA ZONE SCOLAIRE ---
    const zoneSelect = document.getElementById('zone-select');
    let userZone = localStorage.getItem('userZone') || 'A';
    zoneSelect.value = userZone;

    zoneSelect.addEventListener('change', (e) => {
        userZone = e.target.value;
        localStorage.setItem('userZone', userZone);
        fetchVacancesScolaires(userZone);
    });

    // --- 3. API : VACANCES SCOLAIRES ---
    async function fetchVacancesScolaires(zone) {
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=population="Élèves"`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            const aujourdHui = new Date();
            
            const vacances = data.results
                .filter(record => record.zones === `Zone ${zone}`)
                .filter(record => new Date(record.end_date) > aujourdHui)
                .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

            console.log(`✅ Vacances Zone ${zone} récupérées !`);
            return vacances;
        } catch (error) {
            console.error("❌ Erreur API Vacances :", error);
        }
    }

    // --- 4. LE GÉNÉRATEUR DE PONTS ---
    async function genererPonts() {
        const anneeActuelle = new Date().getFullYear();
        const annees = [anneeActuelle, anneeActuelle + 1];
        let tousLesFeries = {};

        // Récupération des jours fériés sur 2 ans
        for (let annee of annees) {
            const url = `https://calendrier.api.gouv.fr/jours-feries/metropole/${annee}.json`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                Object.assign(tousLesFeries, data);
            } catch (error) {
                console.error(`❌ Erreur API Jours Fériés ${annee} :`, error);
            }
        }

        let listeDesPonts = [];
        const aujourdHui = new Date();

        // Analyse des dates
        for (const [dateStr, nomFerie] of Object.entries(tousLesFeries)) {
            const dateFerie = new Date(dateStr);
            if (dateFerie < aujourdHui) continue;

            const jourDeLaSemaine = dateFerie.getDay(); 

            if (jourDeLaSemaine === 2) { // Mardi
                listeDesPonts.push({
                    nom: nomFerie,
                    dateFerie: dateFerie,
                    description: `Férié un mardi. Posez le lundi précédent.`,
                    gain: `1 jour posé = 4 jours de week-end !`
                });
            } else if (jourDeLaSemaine === 4) { // Jeudi
                listeDesPonts.push({
                    nom: nomFerie,
                    dateFerie: dateFerie,
                    description: `Férié un jeudi. Posez le vendredi suivant.`,
                    gain: `1 jour posé = 4 jours de week-end !`
                });
            }
            // Bonus : on pourrait ajouter une règle pour le lundi/vendredi (week-ends prolongés de 3 jours sans rien poser)
        }

        afficherPonts(listeDesPonts);
    }

    // --- 5. AFFICHAGE DANS L'APPLICATION ---
    function afficherPonts(ponts) {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = ''; // On vide le texte de chargement

        if (ponts.length === 0) {
            timeline.innerHTML = `<p>Aucun pont à l'horizon pour le moment.</p>`;
            return;
        }

        // On affiche le tout premier pont dans l'onglet "Accueil"
        const nextPont = ponts[0];
        const dateProchain = nextPont.dateFerie.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('next-pont').innerHTML = `
            <h3>${nextPont.nom}</h3>
            <p><strong>Férié le :</strong> ${dateProchain}</p>
            <p class="highlight">${nextPont.gain}</p>
            <button class="btn-primary" onclick="alert('Partage via WhatsApp bientôt disponible !')">Partager à mes amis</button>
        `;

        // On affiche toute la liste dans l'onglet "Explorateur"
        ponts.forEach(pont => {
            const dateFormatee = pont.dateFerie.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${pont.nom}</h3>
                <p><strong>Férié le :</strong> ${dateFormatee}</p>
                <p>${pont.description}</p>
                <p class="highlight">💡 ${pont.gain}</p>
            `;
            timeline.appendChild(card);
        });
    }

    // --- Lancement au démarrage ---
    fetchVacancesScolaires(userZone);
    genererPonts();
});
