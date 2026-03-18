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
    
    const OPT_DATES = { weekday: 'short', day: 'numeric', month: 'short' };  
    const OPT_DATES_WITH_YEAR = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };  

    // ==================== 5. CACHE OPTIMISÉ DES JOURS WORK/OFF ====================  
    
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

        for (let i = 0; i < decalage;
