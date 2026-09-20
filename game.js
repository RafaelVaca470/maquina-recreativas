// =======================================================
// FIRE SHOT BAR - UNIDESA RECREATIVO ENTRE AMIGOS (CRÉDITOS VIRTUALES)
// 1 € = 100 Créditos Recreativos (CR)
// Multijugador: Turno Único, Cola de Espera, Modo Espectador y Control de Caja
// Clave Administrador Única: R22v03a1965
// =======================================================

const ADMIN_PASSWORD = "R22v03a1965";
function isAnyAdminPassword(pass) {
    if (!pass) return false;
    return String(pass).trim() === ADMIN_PASSWORD;
}

// Configuración de Símbolos y Jerarquía Personalizada
const SYMBOLS = [
    { id: 'MARY', label: 'MARY', prob: 7, multi: 0, type: 'wild' }, // Comodín
    { id: 'RAFAEL', label: 'RAFAEL', prob: 18, multi: 0, type: 'fireshot' }, // Bola de fuego
    { id: 'MAYTE', label: 'MAYTE', prob: 5, multi: 0, type: 'flower' }, // Scatter
    { id: 'CHARI', label: 'CHARI', prob: 21, multi: 0, type: 'std' }, 
    { id: 'SUSANA', label: 'SUSANA', prob: 21, multi: 0, type: 'std' }, 
    { id: 'FRAN', label: 'FRAN', prob: 21, multi: 0, type: 'std' }, 
    { id: 'ROBER', label: 'ROBER', prob: 21, multi: 0, type: 'std' }, 
    { id: 'EVA', label: 'EVA', prob: 21, multi: 0, type: 'std' }, 
    { id: 'AURORA', label: 'AURORA', prob: 21, multi: 0, type: 'std' }, 
    { id: 'ANTONIO', label: 'ANTONIO', prob: 21, multi: 0, type: 'std' }, 
    { id: 'ISABEL', label: 'ISABEL', prob: 21, multi: 0, type: 'std' }, 
    { id: 'CARMEN', label: 'CARMEN', prob: 21, multi: 0, type: 'std' }
];

// Tabla de Pagos Base (x Apuesta de 20 Créditos). Para otras apuestas, se ajusta proporcionalmente.
const PAYTABLE = {
    'MARY': { 3: 0, 4: 0, 5: 0 }, 
    'SUSANA': { 3: 40, 4: 100, 5: 250 }, 
    'CHARI': { 3: 10, 4: 30, 5: 100 },
    'FRAN': { 3: 10, 4: 30, 5: 100 },
    'ROBER': { 3: 10, 4: 30, 5: 100 },
    'EVA': { 3: 10, 4: 30, 5: 100 },
    'AURORA': { 3: 10, 4: 30, 5: 100 },
    'ANTONIO': { 3: 10, 4: 30, 5: 100 },
    'ISABEL': { 3: 10, 4: 30, 5: 100 },
    'CARMEN': { 3: 10, 4: 30, 5: 100 }
};

// Ocultamos la declaración original


// Opciones de Apuesta en Créditos (1 € = 100 Créditos)
// 5 = 0.05€ | 10 = 0.10€ | 20 = 0.20€ | 50 = 0.50€ | 100 = 1.00€ | 200 = 2.00€
const BET_LEVELS = [5, 10, 20, 50, 100, 200];
let currentBet = 20; // Default a 20 Créditos

// Estado del juego local
let balance = 0; // CRÉDITOS
let bankAmount = 0; // BANCO
let pointsAmount = 0; // PUNTOS
let reservaAmount = 0; // RESERVA
let currentWonAmount = 0; // Lo ganado pendiente de acumular
let isSpinning = false;
let isAutoPlaying = false;
let autoInterval = null;
let isAudioMuted = false;
let totalBetsSession = 0;
let isFreeSpinsMode = false;
let freeSpinsTotal = 10;
let freeSpinsCurrent = 0;
let isBonusMode = false;
let freeSpinsTotalWon = 0;

// Banderas para forzar bonus (exclusivas del Administrador)
let forceRafaelBonusNextSpin = false;
let forceMayteBonusNextSpin = false;

// Jackpots en Créditos (Mega: 50.000, Super: ~26.940, Grand: 2.500, Major: 1.250, Minor: 500)
let superJackpotAccum = 20000;

// Estado del usuario y multijugador
let currentUser = null; // { username, city, zip, pin, credits }
let currentMachineState = {
    activeUser: null,
    allowSpectators: false,
    isPaused: false,
    remainingSeconds: 0,
    isExpiringSoon: false,
    queue: [],
    currentBalance: 0,
    lastSpin: null
};
let statusPollingInterval = null;
let lastRenderedSpinTime = 0;
let warningBeepInterval = null;

const USER_STORAGE_KEY = 'fire_shot_bar_current_user_v2';

// -------------------------------------------------------------
// AUDIO SINTETIZADO (WEB AUDIO API)
// -------------------------------------------------------------
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, type, duration, vol = 0.15) {
    if (isAudioMuted || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

let spinAudioInterval = null;

function playSpinSound() {
    if (isAudioMuted || !audioCtx) return;
    if (spinAudioInterval) clearInterval(spinAudioInterval);
    playTone(420, 'triangle', 0.05, 0.15);
    
    let i = 0;
    spinAudioInterval = setInterval(() => {
        if (isAudioMuted || !audioCtx || (!isSpinning && i > 5)) {
            clearInterval(spinAudioInterval);
            return;
        }
        playTone(320 + (i % 2) * 40, 'sine', 0.03, 0.06);
        i++;
    }, 70);
}

function playBonusSpinSound() {
    if (isAudioMuted || !audioCtx) return;
    playTone(520, 'triangle', 0.05, 0.16);
    for (let i = 0; i < 18; i++) {
        setTimeout(() => {
            if (isAudioMuted || !audioCtx || !isBonusMode) return;
            playTone(280 + (i % 3) * 60, 'sawtooth', 0.04, 0.08);
        }, (i + 1) * 55);
    }
}

function playReelStopSound(index) {
    if (isAudioMuted || !audioCtx) return;
    playTone(150, 'square', 0.04, 0.2); 
    playTone(300, 'triangle', 0.06, 0.1); 
}

function playCoinSound() {
    playTone(980, 'sine', 0.08, 0.12);
    setTimeout(() => playTone(1320, 'sine', 0.25, 0.15), 60);
}

function playWinSound() {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, index) => {
        setTimeout(() => playTone(freq, 'triangle', 0.18, 0.2), index * 90);
    });
}

function playBigWinSound() {
    const fanfare = [440, 554.37, 659.25, 880, 783.99, 880, 1108.73];
    fanfare.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'sine', 0.22, 0.25), idx * 110);
    });
}

function playButtonClickSound() {
    playTone(700, 'sine', 0.03, 0.08);
}

function playFireShotJingle() {
    const chords = [392, 493.88, 587.33, 783.99];
    chords.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25, 0.18), idx * 70);
    });
}

function playAccumulateSound() {
    playTone(400, 'square', 0.04, 0.1);
    setTimeout(() => playTone(800, 'square', 0.08, 0.14), 40);
    setTimeout(() => playTone(1200, 'square', 0.12, 0.18), 90);
}

// Pitido de advertencia de 15 segundos restantes
function playWarningBeep() {
    if (isAudioMuted || !audioCtx) return;
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
    } catch(e) { alert('Error de conexión o de servidor: ' + e.message); }
}

// -------------------------------------------------------------
// SELECTORES DOM
// -------------------------------------------------------------
const balanceEl = document.getElementById('balance');
const bankEl = document.getElementById('bank-val');
const pointsEl = document.getElementById('points-val');
const winEl = document.getElementById('win');
const betDisplay = document.getElementById('bet-display');
const physBetVal = document.getElementById('phys-bet-val');
const totalBetsDisplay = document.getElementById('total-bets-display');
const tickerEl = document.getElementById('ticker-text');
const lineWinAnnouncement = document.getElementById('line-win-announcement');
const lineWinText = document.getElementById('line-win-text');

// Consola Física
const btnPhysCobrar = document.getElementById('btn-phys-cobrar');
const btnPhysBanco = document.getElementById('btn-phys-banco');
const btnPhysAuto = document.getElementById('btn-phys-auto');
const btnPhysApuesta = document.getElementById('btn-phys-apuesta');
const btnPhysPausa = document.getElementById('btn-phys-pausa');
const btnPhysInfo = document.getElementById('btn-phys-info');
const btnPhysSpin = document.getElementById('btn-phys-spin');
const cobrarSubTxt = document.getElementById('cobrar-sub-txt');
const pausaSubTxt = document.getElementById('pausa-sub-txt');
const mainSpinTitle = document.getElementById('main-spin-title');
const mainSpinSub = document.getElementById('main-spin-sub');

// Botones auxiliares
const btnMaxBet = document.getElementById('btn-max-bet');
const btnJuegosSaldo = document.getElementById('btn-juegos-saldo');
const infoBtn = document.getElementById('info-btn');
const soundBtn = document.getElementById('sound-btn');
const rechargeBtn = document.getElementById('recharge-btn');

// Free Spins & Bonus DOM
const promoBadgesBar = document.getElementById('promo-badges-bar');
const freeSpinsOverlay = document.getElementById('free-spins-overlay');
const fsLeftEl = document.getElementById('fs-left');
const reelFrameContainer = document.getElementById('reel-frame-container');
const bonusModal = document.getElementById('bonus-game');
const bonusSpinsLeftEl = document.getElementById('bonus-spins-left');
const bonusWinAmountEl = document.getElementById('bonus-win-amount');
const bonusSpinBtn = document.getElementById('bonus-spin-btn');

// Modales
const pinModal = document.getElementById('pin-modal');
const pinCancel = document.getElementById('pin-cancel');
const winModal = document.getElementById('win-modal');
const winAmountEl = document.getElementById('win-amount');
const collectBtn = document.getElementById('collect-btn');
const infoModal = document.getElementById('info-modal');
const infoClose = document.getElementById('info-close');
const paytableContent = document.getElementById('paytable-content');

// Modales Multijugador
const registerModal = document.getElementById('register-modal');
const registerForm = document.getElementById('register-form');
const regUsernameInput = document.getElementById('reg-username');
const regCityInput = document.getElementById('reg-city');
const regZipInput = document.getElementById('reg-zip');
const regPinInput = document.getElementById('reg-pin');
const regErrorMsg = document.getElementById('reg-error-msg');
const turnPromptModal = document.getElementById('turn-prompt-modal');
const btnAllowSpectators = document.getElementById('btn-allow-spectators');
const btnDenySpectators = document.getElementById('btn-deny-spectators');
const pauseModal = document.getElementById('pause-modal');
const pauseTimerVal = document.getElementById('pause-timer-val');
const btnResumeGame = document.getElementById('btn-resume-game');
const spectatorBlockedModal = document.getElementById('spectator-blocked-modal');
const privatePlayerName = document.getElementById('private-player-name');
const btnJoinQueuePrivate = document.getElementById('btn-join-queue-private');
const btnAdminBypass = document.getElementById('btn-admin-bypass');
const btnMyAccount = document.getElementById('btn-my-account');

// Barra Multijugador
const mpActiveUserName = document.getElementById('mp-active-user-name');
const mpTimerContainer = document.getElementById('mp-timer-box');
const mpTimerDisplay = document.getElementById('mp-timer-display');
const mpQueuePill = document.getElementById('mp-queue-pill');
const mpQueueBtn = document.getElementById('mp-queue-btn');
const mpSpectatorPill = document.getElementById('mp-spectator-pill');

// Jackpots DOM
const jpMegaEl = document.getElementById('jp-mega');
const jpSuperEl = document.getElementById('jp-super');
const jpGrandEl = document.getElementById('jp-grand');
const jpMajorEl = document.getElementById('jp-major');
const jpMinorEl = document.getElementById('jp-minor');

const pyramidRowsDOM = {
    minor: document.getElementById('row-minor'),
    major: document.getElementById('row-major'),
    grand: document.getElementById('row-grand'),
    super: document.getElementById('row-super'),
    mega0: document.getElementById('row-mega-0'),
    mega1: document.getElementById('row-mega-1'),
    mega2: document.getElementById('row-mega-2')
};

// Rodillos (5 columnas x 4 filas)
const numReels = 5;
const numRows = 4;
const strips = [
    document.getElementById('strip0'),
    document.getElementById('strip1'),
    document.getElementById('strip2'),
    document.getElementById('strip3'),
    document.getElementById('strip4')
];

// 20 Líneas de Pago Oficiales de Máquinas 5x4
const PAYLINES_5x4 = [
    // 1-4: Horizontales
    [{r:0,c:0},{r:0,c:1},{r:0,c:2},{r:0,c:3},{r:0,c:4}],
    [{r:1,c:0},{r:1,c:1},{r:1,c:2},{r:1,c:3},{r:1,c:4}],
    [{r:2,c:0},{r:2,c:1},{r:2,c:2},{r:2,c:3},{r:2,c:4}],
    [{r:3,c:0},{r:3,c:1},{r:3,c:2},{r:3,c:3},{r:3,c:4}],
    // 5-6: Diagonales principales (bajan o suben y rebotan al final)
    [{r:0,c:0},{r:1,c:1},{r:2,c:2},{r:3,c:3},{r:2,c:4}],
    [{r:3,c:0},{r:2,c:1},{r:1,c:2},{r:0,c:3},{r:1,c:4}],
    // 7-8: V profundas
    [{r:0,c:0},{r:1,c:1},{r:2,c:2},{r:1,c:3},{r:0,c:4}],
    [{r:3,c:0},{r:2,c:1},{r:1,c:2},{r:2,c:3},{r:3,c:4}],
    // 9-10: V cortas
    [{r:1,c:0},{r:2,c:1},{r:3,c:2},{r:2,c:3},{r:1,c:4}],
    [{r:2,c:0},{r:1,c:1},{r:0,c:2},{r:1,c:3},{r:2,c:4}],
    // 11-12: Zigzags superiores e inferiores
    [{r:0,c:0},{r:1,c:1},{r:0,c:2},{r:1,c:3},{r:0,c:4}],
    [{r:3,c:0},{r:2,c:1},{r:3,c:2},{r:2,c:3},{r:3,c:4}],
    // 13-14: Zigzags centrales
    [{r:1,c:0},{r:2,c:1},{r:1,c:2},{r:2,c:3},{r:1,c:4}],
    [{r:2,c:0},{r:1,c:1},{r:2,c:2},{r:1,c:3},{r:2,c:4}],
    // 15-16: Ondas invertidas
    [{r:1,c:0},{r:0,c:1},{r:1,c:2},{r:2,c:3},{r:3,c:4}],
    [{r:2,c:0},{r:3,c:1},{r:2,c:2},{r:1,c:3},{r:0,c:4}],
    // 17-18: Sombreros y valles truncados
    [{r:1,c:0},{r:1,c:1},{r:0,c:2},{r:1,c:3},{r:1,c:4}],
    [{r:2,c:0},{r:2,c:1},{r:3,c:2},{r:2,c:3},{r:2,c:4}],
    // 19-20: Escaleras asimétricas
    [{r:0,c:0},{r:0,c:1},{r:1,c:2},{r:2,c:3},{r:3,c:4}],
    [{r:3,c:0},{r:3,c:1},{r:2,c:2},{r:1,c:3},{r:0,c:4}]
];

// -------------------------------------------------------------
// INICIALIZACIÓN
async function init() { console.log("INIT CALLED");
    buildReels(true);
    updateJackpots();
    updateDisplays();
    setupEventListeners();
    buildPaytable();

    // Validar usuario guardado contra la base de datos real
    await validateCurrentUser();

    // Iniciar sondeo en tiempo real de la máquina
    startMachinePolling();

    // Si el usuario no está identificado o registrado, abrir inmediatamente la ventana de amigos/registro
    console.log('CALLING SHOW MODAL'); showRegisterModal();
}

async function validateCurrentUser() {
    try {
        const raw = localStorage.getItem(USER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.username && parsed.username.toUpperCase() !== 'ADMIN' && parsed.username.toUpperCase() !== 'INVITADO') {
                const res = await fetch(`/api/user-info?username=${encodeURIComponent(parsed.username)}`);
                const data = await res.json();
                if (data.ok && data.user) {
                    currentUser = data.user;
                    balance = currentUser.credits || 0;
                    updateDisplays();
                    renderMultiplayerBar(currentMachineState);
                    return;
                }
            }
        }
    } catch(e) {}
    // Si no es un usuario registrado en la base de datos, limpiar
    currentUser = null;
    localStorage.removeItem(USER_STORAGE_KEY);
    balance = 0;
    updateDisplays();
    renderMultiplayerBar(currentMachineState);
}

function saveUserToStorage() {
    if (currentUser && currentUser.username && currentUser.username.toUpperCase() !== 'ADMIN') {
        currentUser.credits = balance;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
    }
}

async function showRegisterModal() {
    registerModal.classList.remove('hidden');
    await window.loadRegisteredUsersDropdown();
}

// -------------------------------------------------------------
// ACTUALIZACIÓN DE PANTALLA Y JACKPOTS (EN CRÉDITOS)
// -------------------------------------------------------------
function updateJackpots() {
    const multi = currentBet / 20;
    if (jpMegaEl) jpMegaEl.textContent = Math.round(50000 * multi).toLocaleString('es-ES');
    if (jpSuperEl) jpSuperEl.textContent = Math.round(superJackpotAccum * multi).toLocaleString('es-ES');
    if (jpGrandEl) jpGrandEl.textContent = Math.round(2500 * multi).toLocaleString('es-ES');
    if (jpMajorEl) jpMajorEl.textContent = Math.round(1250 * multi).toLocaleString('es-ES');
    if (jpMinorEl) jpMinorEl.textContent = Math.round(500 * multi).toLocaleString('es-ES');
}

function updateDisplays() {
    if (balanceEl) balanceEl.textContent = Math.round(balance).toLocaleString('es-ES') + " CR";
    if (bankEl) bankEl.textContent = Math.round(bankAmount).toLocaleString('es-ES') + " CR";
    if (pointsEl) pointsEl.textContent = Math.round(pointsAmount).toLocaleString('es-ES');
    if (betDisplay) betDisplay.textContent = Math.round(currentBet).toString();
    if (physBetVal) physBetVal.textContent = Math.round(currentBet) + " CR";
    if (totalBetsDisplay) totalBetsDisplay.textContent = Math.round(totalBetsSession).toLocaleString('es-ES') + " CR";
    if (winEl) winEl.textContent = Math.round(currentWonAmount).toLocaleString('es-ES') + " CR";

    if (tickerEl && !isSpinning && !tickerEl.textContent.includes("GIRANDO") && !tickerEl.textContent.includes("¡¡¡") && !tickerEl.textContent.includes("PREMIO:") && !tickerEl.textContent.includes("PAUSA")) {
        tickerEl.textContent = `RESERVA: ${Math.round(reservaAmount)} CR | APUESTA: ${Math.round(currentBet)} CR | PREMIO MÁXIMO 50.000 CR`;
    }

    saveUserToStorage();
}

// -------------------------------------------------------------
// POLING MULTIJUGADOR Y ESTADO EN TIEMPO REAL
// -------------------------------------------------------------
function startMachinePolling() {
    syncMachineStatus();
    if (statusPollingInterval) clearInterval(statusPollingInterval);
    statusPollingInterval = setInterval(syncMachineStatus, 1500);
}

async function syncMachineStatus() {
    try {
        const res = await fetch('/api/machine-status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok) return;

        currentMachineState = data;
        renderMultiplayerBar(data);

        // Control de pitidos en los últimos 15 segundos
        if (data.isExpiringSoon && isMyTurn()) {
            if (!warningBeepInterval) {
                playWarningBeep();
                warningBeepInterval = setInterval(playWarningBeep, 1400);
            }
        } else {
            if (warningBeepInterval) {
                clearInterval(warningBeepInterval);
                warningBeepInterval = null;
            }
        }

        // Si la máquina está en pausa y soy el jugador activo
        if (data.isPaused && isMyTurn()) {
            pauseModal.classList.remove('hidden');
            const mins = Math.floor(data.remainingSeconds / 60);
            const secs = data.remainingSeconds % 60;
            pauseTimerVal.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            btnPhysPausa.classList.add('pausa-active');
            pausaSubTxt.textContent = "ACTIVA";
        } else {
            pauseModal.classList.add('hidden');
            btnPhysPausa.classList.remove('pausa-active');
            pausaSubTxt.textContent = "ESPERA";
        }

        // Si la partida es privada y soy espectador
        if (data.activeUser && !isMyTurn() && !data.allowSpectators) {
            spectatorBlockedModal.classList.remove('hidden');
            privatePlayerName.textContent = data.activeUser;
        } else {
            spectatorBlockedModal.classList.add('hidden');
        }

        // Modo espectador en vivo: reproducir la tirada del jugador activo si es nueva
        if (data.activeUser && !isMyTurn() && data.allowSpectators && data.lastSpin) {
            if (data.lastSpin.timestamp > lastRenderedSpinTime) {
                lastRenderedSpinTime = data.lastSpin.timestamp;
                renderSpectatorSpin(data.lastSpin);
            }
        }

        // Sincronizar saldo de la máquina si tengo el turno
                // Sincronizar saldo de la máquina si tengo el turno
        if (isMyTurn() && typeof data.currentBalance === 'number' && !isSpinning) {
            const timeSinceLastSync = Date.now() - (window.lastSyncAction || 0);
            if (timeSinceLastSync > 4000) {
                const myTotal = balance + pointsAmount + currentWonAmount + bankAmount;
                if (data.currentBalance !== myTotal) {
                    balance += (data.currentBalance - myTotal);
                    if (balance < 0) {
                        balance = Math.max(0, data.currentBalance);
                        pointsAmount = 0;
                        currentWonAmount = 0;
                        bankAmount = 0;
                    }
                    updateDisplays();
                }
            }
        }

    } catch (e) {
        // Red local / desconexión temporal
    }
}

function isMyTurn() {
    return currentUser && currentMachineState.activeUser && 
           currentMachineState.activeUser.toLowerCase() === currentUser.username.toLowerCase();
}

function renderMultiplayerBar(data) {
    const myNameEl = document.getElementById('mp-my-name');
    if (myNameEl) {
        myNameEl.textContent = (currentUser && currentUser.username && currentUser.username.trim() !== '') ? currentUser.username.toUpperCase() : "IDENTIFICARME";
    }

    if (!data.activeUser) {
        mpActiveUserName.textContent = "LIBRE";
        mpActiveUserName.style.color = "#00ff88";
        mpTimerDisplay.textContent = "--:--";
        mpTimerContainer.classList.remove('timer-warning');
        mpSpectatorPill.classList.add('hidden');
        mpQueueBtn.textContent = "JUGAR AHORA";
        mpQueueBtn.classList.remove('hidden');
    } else {
        mpActiveUserName.textContent = data.activeUser.toUpperCase();
        mpActiveUserName.style.color = isMyTurn() ? "#ffea75" : "#00e5ff";

        const mins = Math.floor(data.remainingSeconds / 60);
        const secs = data.remainingSeconds % 60;
        mpTimerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (data.isExpiringSoon) {
            mpTimerContainer.classList.add('timer-warning');
        } else {
            mpTimerContainer.classList.remove('timer-warning');
        }

        if (isMyTurn()) {
            mpSpectatorPill.classList.add('hidden');
            mpQueueBtn.classList.add('hidden');
        } else {
            if (data.allowSpectators) {
                mpSpectatorPill.classList.remove('hidden');
            } else {
                mpSpectatorPill.classList.add('hidden');
            }

            // Comprobar si estoy en cola
            const userInQueue = currentUser && Array.isArray(data.queue) && data.queue.some(u => u.toLowerCase() === currentUser.username.toLowerCase());
            mpQueueBtn.classList.remove('hidden');
            mpQueueBtn.textContent = userInQueue ? "SALIR COLA" : "PEDIR TURNO";
        }
    }

    mpQueuePill.textContent = `COLA: ${data.queue ? data.queue.length : 0}`;
}

// -------------------------------------------------------------
// REPRODUCCIÓN EN MODO ESPECTADOR (EN VIVO)
// -------------------------------------------------------------
function renderSpectatorSpin(spinData) {
    if (isSpinning) return;
    tickerEl.textContent = `👁️ ${currentMachineState.activeUser} ESTÁ TIRANDO...`;
    playSpinSound();

    // Rellenar visualmente los símbolos del giro
    if (spinData.grid && Array.isArray(spinData.grid)) {
        for (let c = 0; c < numReels; c++) {
            strips[c].innerHTML = '';
            for (let r = 0; r < numRows; r++) {
                const sId = spinData.grid[r] && spinData.grid[r][c] ? spinData.grid[r][c] : 'MARY';
                const sData = SYMBOLS.find(s => s.id === sId) || SYMBOLS[0];
                strips[c].appendChild(createSymbolElement(sData));
            }
        }
    }

    if (spinData.winAmount > 0) {
        playWinSound();
        winEl.textContent = Math.round(spinData.winAmount) + " CR";
        tickerEl.textContent = `🎉 ¡${currentMachineState.activeUser} HA GANADO +${Math.round(spinData.winAmount)} CR!`;
    }
}

// -------------------------------------------------------------
// SÍMBOLOS Y RODILLOS 5x4
// -------------------------------------------------------------
function getRandomSymbol() {
    let mayteProb = isFreeSpinsMode ? 1 : 5;
    const dynamicSymbols = SYMBOLS.map(s => {
        if (s.id === 'MAYTE') return { ...s, prob: mayteProb };
        return s;
    });
    const totalWeight = dynamicSymbols.reduce((acc, s) => acc + s.prob, 0);
    let rand = Math.random() * totalWeight;
    for (let s of dynamicSymbols) {
        if (rand < s.prob) return s;
        rand -= s.prob;
    }
    return dynamicSymbols[dynamicSymbols.length - 1];
}

function createSymbolElement(symbolData) {
    const el = document.createElement('div');
    el.className = `reel-symbol sym-${symbolData.id.toLowerCase()}`;
    el.dataset.symbolId = symbolData.id;

    if (symbolData.id === 'MARY') {
        el.innerHTML = `
            <div class="sym-badge-mary">
                <div class="mary-crown">👑</div>
                <div class="mary-name">MARY</div>
            </div>
        `;
    } else if (symbolData.id === 'MAYTE') {
        el.innerHTML = `
            <div class="sym-badge-mayte">
                <div class="mayte-flowers">🌸 🌸 🌸</div>
                <div class="mayte-name">MAYTE</div>
            </div>
        `;
    } else if (symbolData.id === 'RAFAEL') {
        // Bola de fuego animada con Rafael y premio en créditos (activa el juego de pirámide)
        const multiBall = currentBet / 200;
        const weightedBalls = [
            {v: 100 * multiBall, p: 50}, 
            {v: 200 * multiBall, p: 25}, 
            {v: 400 * multiBall, p: 12}, 
            {v: 600 * multiBall, p: 8},
            {v: 1000 * multiBall, p: 3},
            {v: 1200 * multiBall, p: 1.5},
            {v: 2000 * multiBall, p: 0.4},
            {v: 4000 * multiBall, p: 0.1}
        ];
        let rand = Math.random() * 100;
        let val = 100 * multiBall;
        for(let w of weightedBalls) {
            if(rand < w.p) { val = Math.round(w.v); break; }
            rand -= w.p;
        }
        el.dataset.ballValue = val;
        el.innerHTML = `
            <div class="sym-fireshot-rafael">
                <div class="fire-ball-sphere">
                    <span class="fire-ball-rafael-text${val >= 1000 ? ' sm' : ''}">RAFAEL</span>
                </div>
                <div class="fire-ball-prize">${val} CR</div>
            </div>
        `;
    } else {
        // Nombres estándar: cada uno usa su badge de neón específico con su color propio
        const id = symbolData.id.toLowerCase();
        const label = symbolData.label;
        const extraClass = (id === 'fran') ? 'name-FRAN' : (id === 'antonio') ? 'name-antonio' : '';
        el.innerHTML = `
            <div class="sym-badge-${id}">
                <span class="badge-name-std ${extraClass}">${label}</span>
            </div>
        `;
    }

    return el;
}

function buildReels(initial = false) {
    let luckySymbol = null;
    if (!initial && isFreeSpinsMode) {
        // En cada tirada gratis, elegimos un Símbolo de la Suerte global para todos los rodillos.
        // Se ignoran MAYTE y RAFAEL porque no dan premio en línea.
        do {
            luckySymbol = getRandomSymbol();
        } while (luckySymbol.id === 'MAYTE' || luckySymbol.id === 'RAFAEL');
    }

    strips.forEach((strip, reelIndex) => {
        if (initial) {
            strip.innerHTML = '';
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            for (let i = 0; i < 4; i++) {
                const symData = getRandomSymbol();
                const el = createSymbolElement(symData);
                el.style.filter = 'none';
                strip.appendChild(el);
            }
            return;
        }

        const prevVisible = Array.from(strip.children).slice(0, 4);
        strip.innerHTML = '';
        strip.style.transition = 'none';

        const numSymbols = initial ? 4 : 20 + (reelIndex * 15);
        const newSymbols = [];
        let i = 0;
        while (i < numSymbols) {
            // Probabilidad del 45% de insertar un Súper Bloque del Símbolo de la Suerte
            let isLuckyStack = (isFreeSpinsMode && Math.random() < 0.2);
            let symData = isLuckyStack ? luckySymbol : getRandomSymbol();
            
            // Si es luckyStack, el tamaño será de 3 a 5 casillas (para llenar la pantalla visualmente)
            const stackSize = isLuckyStack ? (Math.floor(Math.random() * 3) + 3) : 1;
            
            for (let j = 0; j < stackSize && i < numSymbols; j++) {
                newSymbols.push(symData);
                i++;
            }
        }

        // Sobrescribir si el admin fuerza bonus
        for (let i = 0; i < 4; i++) {
            const isRafaelBonusSlot = forceRafaelBonusNextSpin && (
                (reelIndex === 0 && i === 1) ||
                (reelIndex === 1 && (i === 0 || i === 2)) ||
                (reelIndex === 2 && i === 1) ||
                (reelIndex === 3 && i === 2) ||
                (reelIndex === 4 && (i === 0 || i === 3))
            );
            const isMayteBonusSlot = forceMayteBonusNextSpin && (
                (reelIndex === 0 && i === 1) ||
                (reelIndex === 2 && i === 1) ||
                (reelIndex === 4 && i === 1)
            );
            if (isRafaelBonusSlot) {
                newSymbols[i] = SYMBOLS.find(s => s.id === 'RAFAEL');
            } else if (isMayteBonusSlot) {
                newSymbols[i] = SYMBOLS.find(s => s.id === 'MAYTE');
            }
        }

        // Símbolos nuevos que quedarán al final (posiciones 0 a 3, arriba)
        for (let i = 0; i < 4; i++) {
            const el = createSymbolElement(newSymbols[i]);
            strip.appendChild(el);
        }

        // Símbolos intermedios de rodadura rápida
        for (let i = 4; i < numSymbols; i++) {
            const el = createSymbolElement(newSymbols[i]);
            el.style.filter = 'blur(1.5px)';
            strip.appendChild(el);
        }

        // Símbolos anteriores (posiciones 20 a 23, abajo)
        prevVisible.forEach(el => {
            strip.appendChild(el.cloneNode(true));
        });

        // Corregido el problema de las comillas (backticks requeridos para iterpolación)
        strip.style.transform = 'translateY(-' + (85 * numSymbols) + 'px)';
        void strip.offsetHeight;
    });

    if (!initial && forceRafaelBonusNextSpin) forceRafaelBonusNextSpin = false;
    if (!initial && forceMayteBonusNextSpin) forceMayteBonusNextSpin = false;
}

function getVisibleScreen() {
    const grid = [];
    for (let r = 0; r < numRows; r++) {
        const row = [];
        for (let c = 0; c < numReels; c++) {
            row.push(strips[c].children[r]);
        }
        grid.push(row);
    }
    return grid;
}

// -------------------------------------------------------------
// CONTROL DE JUEGO Y GIRO
// -------------------------------------------------------------
function handleMainSpinOrAcumular() {
    initAudio();

    if (!currentUser || !currentUser.username || currentUser.username.toUpperCase() === 'ADMIN' || currentUser.username.toUpperCase() === 'INVITADO') {
        showRegisterModal();
        return;
    }

    // Si la máquina está libre, preguntar si permite espectadores al reclamarla
    if (!currentMachineState.activeUser) {
        turnPromptModal.classList.remove('hidden');
        return;
    }

    // Si no es mi turno, ofrecer ponerse en cola
    if (!isMyTurn()) {
        tickerEl.textContent = `MÁQUINA OCUPADA POR ${currentMachineState.activeUser}. PULSA 'PEDIR TURNO'.`;
        return;
    }

    // Minijuego pirámide de Rafael
    if (isBonusMode) {
        if (bonusSpinBtn && !bonusSpinBtn.disabled) {
            bonusSpinBtn.click();
        }
        return;
    }

    // Acumular premio ganado a saldo
    if (currentWonAmount > 0 && !isFreeSpinsMode && !isBonusMode) {
        acumularGanadoACreditos();
        return;
    }

    spin();
}

function acumularGanadoACreditos() {
    playAccumulateSound();
    pointsAmount += currentWonAmount;
    currentWonAmount = 0;

    btnPhysSpin.classList.remove('mode-acumular');
    mainSpinTitle.textContent = "JUEGO";
    mainSpinSub.textContent = "ACUMULAR";

    updateDisplays();
    tickerEl.textContent = "★ PREMIO ACUMULADO A PUNTOS. PULSA 'JUEGO' PARA TIRAR ★";
}

async function spin() {
    if (isSpinning) return;
    if (isBonusMode) {
        bonusSpinBtn.click();
        return;
    }

    initAudio();

    // Comprobación de saldo
    if (!isFreeSpinsMode) {
        transferBalanceToPointsIfNeeded();
        if (pointsAmount < currentBet) {
            tickerEl.textContent = "¡SIN SALDO! PIDE RECARGA AL ADMINISTRADOR DESDE EL CONTROL DE CAJA 🔐";
            playTone(150, 'sawtooth', 0.2, 0.2);
            return;
        }
        pointsAmount -= currentBet;
        totalBetsSession += currentBet;
        if (!window.superJackpotSpins) window.superJackpotSpins = 0;
        window.superJackpotSpins++;
        if (window.superJackpotSpins >= 4 && superJackpotAccum < 40000) {
            superJackpotAccum += 1;
            window.superJackpotSpins = 0;
        }
        updateDisplays();
        updateJackpots();
    }

    isSpinning = true;
    playSpinSound();
    lineWinAnnouncement.classList.add('hidden');
    document.getElementById('win-lines-svg').innerHTML = '';
    btnPhysSpin.classList.remove('pulsing-btn');
    btnPhysSpin.classList.remove('mode-acumular');
    tickerEl.textContent = "★ GIRANDO RODILLOS... ¡BUENA SUERTE! ★";

    buildReels(false);

    const spinPromises = strips.map((strip, index) => {
        return new Promise(resolve => {
            const stopDelay = 1500 + (index * 1125); // 4.5s span from first to last
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    strip.style.transition = 'transform ' + (stopDelay / 1000) + 's linear';
                    strip.style.transform = 'translateY(0)';
                    setTimeout(() => {
                        playReelStopSound(index);
                        resolve();
                    }, stopDelay);
                });
            });
        });
    });

    await Promise.all(spinPromises);

    strips.forEach(strip => {
        const finalSymbols = Array.from(strip.children).slice(0, 4);
        strip.innerHTML = '';
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0)';
        finalSymbols.forEach(el => {
            el.style.filter = 'none';
            strip.appendChild(el);
        });
    });

    isSpinning = false;
    btnPhysSpin.classList.add('pulsing-btn');

    await checkResults();

    // Free Spins de Mayte
    if (isFreeSpinsMode) {
        freeSpinsCurrent++;
        if (freeSpinsCurrent >= freeSpinsTotal) {
            fsLeftEl.textContent = `${freeSpinsTotal} DE ${freeSpinsTotal}`;
            endFreeSpins();
        } else {
            fsLeftEl.textContent = `${freeSpinsCurrent + 1} DE ${freeSpinsTotal}`;
            mainSpinTitle.textContent = "JUEGO";
            mainSpinSub.textContent = `GRATIS ${freeSpinsCurrent + 1}/${freeSpinsTotal}`;
            btnPhysSpin.classList.add('pulsing-btn');
            tickerEl.textContent = `★ JUEGO DE MAYTE (TIRADA ${freeSpinsCurrent + 1}/${freeSpinsTotal}). PULSA 'JUEGO' ★`;
        }
    }
}

// Traspaso automático de créditos a puntos para poder apostar (estilo bar: 100 puntos = 1€)
function transferBalanceToPointsIfNeeded() {
    if (pointsAmount < currentBet) {
        const needed = currentBet - pointsAmount;
        if (balance >= needed) {
            // Pasa en bloques de 100 créditos (o lo que quede)
            const transferBlock = Math.min(balance, Math.max(100, needed));
            balance -= transferBlock;
            pointsAmount += transferBlock;
            playCoinSound();
        }
    }
}

// -------------------------------------------------------------
// EVALUACIÓN DE PREMIOS Y MINIJUEGOS
// -------------------------------------------------------------
async function checkResults() {
    const screen = getVisibleScreen();
    let fireBallsCount = 0;
    const fireBallElements = [];
    let mayteCount = 0;

    screen.forEach(row => {
        row.forEach(cell => {
            const symId = cell.dataset.symbolId;
            if (symId === 'RAFAEL') {
                fireBallsCount++;
                fireBallElements.push(cell);
            } else if (symId === 'MAYTE') {
                mayteCount++;
            }
        });
    });

    // 1. Minijuego Bolas de Fuego Rafael (6 o más)
    if (fireBallsCount >= 6) {
        playFireShotJingle();
        tickerEl.textContent = "¡¡¡6x RAFAEL - BOLAS DE FUEGO ACTIVADAS!!!";
        await startFireShotPyramidBonus(fireBallElements);
        syncSpinToServer({ grid: getGridIds(screen), winAmount: 0, isBonus: true });
        return;
    }

    // 2. Minijuego Flores de Mayte (3 o más)
    if (mayteCount >= 3) {
        playFireShotJingle();
        

        if (isFreeSpinsMode) {
            freeSpinsTotal += 10;
            fsLeftEl.textContent = `${freeSpinsCurrent + 1} DE ${freeSpinsTotal}`;
            setTimeout(() => { tickerEl.textContent = "¡+10 JUEGOS GRATIS DE MAYTE ADICIONALES!"; }, 1500);
        } else {
            setTimeout(() => { startFreeSpins(); }, 1500);
        }
    } 

    // 3. Evaluar Líneas de Pago (20 Líneas)
    let totalWinPts = 0;
    const winningLines = [];
    const multiplierBonus = isFreeSpinsMode ? 3 : 1; // x2 en giros gratis

    PAYLINES_5x4.forEach((line, lineIdx) => {
        const lineSymbols = line.map(pos => screen[pos.r][pos.c].dataset.symbolId);
        let targetSym = null;
        
        for (let i = 0; i < lineSymbols.length; i++) {
            let s = lineSymbols[i];
            if (s !== 'MARY') {
                if (s === 'MAYTE' || s === 'RAFAEL') {
                    // El comodín no puede sustituir a símbolos especiales
                    targetSym = 'MARY';
                } else {
                    targetSym = s;
                }
                break;
            }
        }
        
        // Si toda la línea es de comodines
        if (!targetSym) targetSym = 'CHARI'; // Paga como un nombre normal cualquiera

        let matchCount = 0;
        for (let s of lineSymbols) {
            if (s === targetSym || s === 'MARY') {
                matchCount++;
            } else {
                break;
            }
        }

        if (matchCount >= 3) {
            if (PAYTABLE[targetSym] && PAYTABLE[targetSym][matchCount] > 0) {
                let basePoints = PAYTABLE[targetSym][matchCount];
                let linePoints = Math.round(basePoints * (currentBet / 20));
                linePoints = linePoints * multiplierBonus; // Aplica el multiplicador x2 de Mayte

                totalWinPts += linePoints;

                winningLines.push({
                    line: line.slice(0, matchCount),
                    lineIdx,
                    targetSym,
                    linePoints,
                    matchCount,
                    color: getSymbolColor(targetSym)
                });
            }
        }
    });

    if (isFreeSpinsMode) freeSpinsTotalWon += totalWinPts;
    if (totalWinPts > 0) {
        playWinSound();
        currentWonAmount += totalWinPts;
        updateDisplays();

        mainSpinTitle.textContent = "ACUMULAR";
        mainSpinSub.textContent = "PREMIO";
        btnPhysSpin.classList.add('mode-acumular');
        btnPhysSpin.classList.remove('active-pressed');
        btnPhysSpin.classList.add('pulsing-btn');
        tickerEl.textContent = `¡PREMIO: ${totalWinPts} CR! PULSA 'ACUMULAR' O ESPERA.`;

        drawWinningLines(winningLines);
        cycleWinningLineAnnouncements(winningLines, totalWinPts);
    } else {
        if (!isFreeSpinsMode) {
            mainSpinTitle.textContent = "JUEGO";
            mainSpinSub.textContent = "ACUMULAR";
        }
    }

    // Sincronizar tirada al servidor para que los espectadores la vean en directo
    syncSpinToServer({
        grid: getGridIds(screen),
        winAmount: totalWinPts,
        winningLines: winningLines.map(l => l.lineIdx),
        isBonus: false,
        isFreeSpins: isFreeSpinsMode
    });
}

function getGridIds(screen) {
    return screen.map(row => row.map(cell => cell.dataset.symbolId));
}

async function syncSpinToServer(spinData) {
    if (!isMyTurn()) return;
    window.lastSyncAction = Date.now();
    try {
        await fetch('/api/machine/sync-spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                currentBalance: balance + pointsAmount + currentWonAmount + bankAmount,
                spinData
            })
        });
    } catch(e) {}
}

function drawWinningLines(winningLines) {
    const svg = document.getElementById('win-lines-svg');
    svg.innerHTML = '';
    if (!winningLines.length) return;

    winningLines.forEach(wl => {
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const points = wl.line.map(pos => {
            const x = (pos.c * 20) + 10;
            const y = (pos.r * 25) + 12.5;
            return `${x},${y}`;
        }).join(' ');

        polyline.setAttribute('points', points);
        polyline.setAttribute('stroke', wl.color);
        polyline.setAttribute('stroke-width', '1.5');
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke-linecap', 'round');
        polyline.setAttribute('stroke-linejoin', 'round');
        polyline.classList.add('win-line-pulse');
        svg.appendChild(polyline);
    });
}

let lineCycleTimer = null;
function cycleWinningLineAnnouncements(winningLines, totalWinPts) {
    if (lineCycleTimer) clearInterval(lineCycleTimer);
    lineWinAnnouncement.classList.remove('hidden');

    if (!winningLines.length) {
        lineWinText.textContent = `PREMIO TOTAL: +${totalWinPts} CR`;
        return;
    }

    let cycleIdx = 0;
    const showNext = () => {
        const current = winningLines[cycleIdx % winningLines.length];
        lineWinText.textContent = `LÍNEA ${current.lineIdx + 1} PAGA ${current.linePoints} CR (${current.matchCount}x ${current.targetSym})`;
        cycleIdx++;
    };

    showNext();
    lineCycleTimer = setInterval(showNext, 2200);
}

function getSymbolColor(symId) {
    if (symId === 'MAYTE') return '#ff66aa';
    if (symId === 'CHARI') return '#ff00aa';
    if (symId === 'SUSANA') return '#00ff88';
    if (symId === 'FRAN') return '#3399ff';
    if (symId === 'ROBER') return '#5588ff';
    if (symId === 'EVA') return '#ff6633';
    if (symId === 'AURORA') return '#ff4da6';
    if (symId === 'ANTONIO') return '#ffaa00';
    if (symId === 'ISABEL') return '#bf40bf';
    if (symId === 'CARMEN') return '#00e5ff';
    return '#ffaa00';
}

// -------------------------------------------------------------
// JUEGO DE LAS FLORES (MAYTE) - 10 JUEGOS GRATIS
// -------------------------------------------------------------
function startFreeSpins() {
    freeSpinsTotalWon = 0;
    isFreeSpinsMode = true;
    freeSpinsTotal = 10;
    freeSpinsCurrent = 0;
    fsLeftEl.textContent = `1 DE 10`;
    if (promoBadgesBar) promoBadgesBar.classList.add('hidden');
    if (freeSpinsOverlay) freeSpinsOverlay.classList.remove('hidden');
    if (reelFrameContainer) reelFrameContainer.classList.add('mayte-spins-active');
    mainSpinTitle.textContent = "JUEGO";
    mainSpinSub.textContent = "GRATIS 1/10";
    btnPhysSpin.classList.add('pulsing-btn');
    tickerEl.textContent = "★ ¡JUEGO DE MAYTE ACTIVADO! PULSA 'JUEGO' PARA CADA TIRADA GRATIS ★";
}

function endFreeSpins() {
    isFreeSpinsMode = false;
    freeSpinsCurrent = 0;
    freeSpinsTotal = 10;
    if (freeSpinsOverlay) freeSpinsOverlay.classList.add('hidden');
    if (promoBadgesBar) promoBadgesBar.classList.remove('hidden');
    if (reelFrameContainer) reelFrameContainer.classList.remove('mayte-spins-active');
    
    // Consolation prize
    if (freeSpinsTotalWon === 0) {
        const consolation = currentBet * 10;
        currentWonAmount += consolation;
        tickerEl.textContent = `¡PREMIO DE CONSOLACIÓN DE MAYTE: +${consolation} CR!`;
        playWinSound();
        updateDisplays();
    } else {
        tickerEl.textContent = "★ ¡FIN DE JUEGOS DE MAYTE! PULSA 'ACUMULAR' ★";
    }

    const screenWrapper = document.querySelector('.screen-wrapper');
    screenWrapper.classList.add('screen-flash-green');
    setTimeout(() => screenWrapper.classList.remove('screen-flash-green'), 900);
    playCoinSound();
}

// -------------------------------------------------------------
// JUEGO DE LAS BOLAS (RAFAEL) - PIRÁMIDE FIRE SHOT
// -------------------------------------------------------------
let bonusRespinsLeft = 3;
let pyramidRowsData = {
    minor: { target: 2, cells: [], jp: 500 },
    major: { target: 3, cells: [], jp: 1260 },
    grand: { target: 4, cells: [], jp: 2500 },
    super: { target: 5, cells: [], jp: 26940 },
    mega0: { target: 5, cells: [], jp: 0 },
    mega1: { target: 5, cells: [], jp: 0 },
    mega2: { target: 5, cells: [], jp: 0 }
};

async function startFireShotPyramidBonus(initialBalls) {
    isBonusMode = true;
    bonusModal.classList.remove('hidden');
    bonusRespinsLeft = 3;
    bonusSpinsLeftEl.textContent = bonusRespinsLeft;

    let totalBonusAccum = 0;
    initialBalls.forEach(ball => {
        const val = parseInt(ball.dataset.ballValue) || 200;
        totalBonusAccum += val;
    });

    bonusWinAmountEl.textContent = `${totalBonusAccum} CR`;

    Object.keys(pyramidRowsDOM).forEach(rowKey => {
        const container = pyramidRowsDOM[rowKey];
        if (!container) return;
        container.innerHTML = '';
        const targetCount = rowKey === 'minor' ? 2 : rowKey === 'major' ? 3 : rowKey === 'grand' ? 4 : 5;
        pyramidRowsData[rowKey].cells = [];
        for (let i = 0; i < targetCount; i++) {
            const cell = document.createElement('div');
            cell.className = 'p-cell pyramid-cell-slot';
            container.appendChild(cell);
            pyramidRowsData[rowKey].cells.push(cell);
        }
    });

    // Colocar bolas iniciales
    // Colocar bolas iniciales al azar
    initialBalls.forEach(b => {
        const val = parseInt(b.dataset.ballValue) || 200;
        const emptyCell = getRandomEmptyPyramidCell();
        if (emptyCell) {
            placeBallInCell(emptyCell, val);
        }
    });

    btnPhysSpin.disabled = false;
    mainSpinTitle.textContent = "TIRADA";
    mainSpinSub.textContent = "BONUS";
    btnPhysSpin.classList.add('pulsing-btn');
    tickerEl.textContent = "🔥 ¡MINIJUEGO DE BOLAS DE FUEGO DE RAFAEL! PULSA 'JUEGO' PARA CADA RESPIN 🔥";

    let isBonusSpinning = false;

    bonusSpinBtn.onclick = async () => {
        if (isBonusSpinning || bonusRespinsLeft <= 0) return;
        isBonusSpinning = true;
        initAudio();
        playBonusSpinSound();
        bonusSpinBtn.disabled = true;
        btnPhysSpin.disabled = true;

        bonusRespinsLeft--;
        bonusSpinsLeftEl.textContent = bonusRespinsLeft;

        const emptyCells = [];
        const order = ['minor', 'major', 'grand', 'super', 'mega0', 'mega1', 'mega2'];
        for (let k of order) {
            const row = pyramidRowsData[k];
            if (!row) continue;
            for (let cell of row.cells) {
                if (!cell.classList.contains('has-ball')) emptyCells.push(cell);
            }
        }

        const spinInterval = setInterval(() => {
            emptyCells.forEach(cell => {
                const tempVal = Math.floor(Math.random() * 10 + 1) * 100;
                cell.innerHTML = `
                    <div class="sym-fireshot-rafael" style="filter: blur(1.5px); opacity: 0.7; transform: translateY(${Math.random() > 0.5 ? '10px' : '-10px'});">
                        <div class="fire-ball-sphere">
                            <span class="fire-ball-rafael-text">RAFAEL</span>
                        </div>
                        <div class="fire-ball-prize">${tempVal} CR</div>
                    </div>
                `;
            });
        }, 80);

        await new Promise(r => setTimeout(r, 1200));

        clearInterval(spinInterval);
        emptyCells.forEach(cell => cell.innerHTML = '');

        let newBallAdded = Math.random() < 0.35;
        if (newBallAdded) {
            playCoinSound();
            bonusRespinsLeft = 3;
            bonusSpinsLeftEl.textContent = 3;
            const multiBall = currentBet / 200;
            const ballVals = [100, 200, 400, 600, 1000, 1200, 2000];
            const ballVal = Math.round(ballVals[Math.floor(Math.random() * ballVals.length)] * multiBall);
            totalBonusAccum += ballVal;
            bonusWinAmountEl.textContent = `${totalBonusAccum} CR`;

            const emptyCell = getRandomEmptyPyramidCell();
            if (emptyCell) {
                placeBallInCell(emptyCell, ballVal);
            }
        }

        if (bonusRespinsLeft <= 0) {
            let jackpotsWon = 0;
            ['minor', 'major', 'grand', 'super', 'mega0', 'mega1', 'mega2'].forEach(k => {
                const row = pyramidRowsData[k];
                if (row && row.cells.length > 0) {
                    const allFilled = row.cells.every(c => c.classList.contains('has-ball'));
                    if (allFilled) {
                        const multi = currentBet / 20;
                        const rowPrize = k.startsWith('mega') ? superJackpotAccum*multi : (row.jp * multi);
                        if (rowPrize > 0) {
                            jackpotsWon += rowPrize;
                        }
                    }
                }
            });
            totalBonusAccum += jackpotsWon;
            
            if (jackpotsWon > 0) {
                tickerEl.textContent = `¡FIN DEL BONUS! ¡JACKPOTS GANADOS: +${jackpotsWon} CR! TOTAL: +${totalBonusAccum} CR`;
                playBigWinSound();
            } else {
                tickerEl.textContent = `¡FIN DEL BONUS! PREMIO TOTAL GANADO: +${totalBonusAccum} CR`;
                playWinSound();
            }


            setTimeout(() => {
                isBonusMode = false;
                isBonusSpinning = false;
                bonusModal.classList.add('hidden');
                currentWonAmount += totalBonusAccum;
                updateDisplays();

                mainSpinTitle.textContent = "ACUMULAR";
                mainSpinSub.textContent = "A CRÉDITOS";
                btnPhysSpin.classList.add('mode-acumular');
                btnPhysSpin.classList.remove('pulsing-btn');
                btnPhysSpin.disabled = false;
                bonusSpinBtn.disabled = false;
                bonusSpinBtn.textContent = "TIRADA BONUS";

                tickerEl.textContent = `★ PREMIO RAFAEL: +${totalBonusAccum} CR ★ PULSA 'ACUMULAR'`;
            }, 1800);
        } else {
            isBonusSpinning = false;
            bonusSpinBtn.disabled = false;
            bonusSpinBtn.textContent = "TIRADA BONUS";
            btnPhysSpin.disabled = false;
            mainSpinTitle.textContent = "TIRADA";
            mainSpinSub.textContent = "BONUS";
        }
    };
}

function getRandomEmptyPyramidCell() {
    const order = ['minor', 'major', 'grand', 'super', 'mega0', 'mega1', 'mega2'];
    let emptyCells = [];
    for (let k of order) {
        const row = pyramidRowsData[k];
        if (!row) continue;
        for (let cell of row.cells) {
            if (!cell.classList.contains('has-ball')) emptyCells.push(cell);
        }
    }
    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function placeBallInCell(cell, value) {
    if (!cell) return;
    cell.classList.add('has-ball');
    cell.classList.add('locked-ball');
    cell.innerHTML = `
        <div class="sym-fireshot-rafael">
            <div class="fire-ball-sphere">
                <span class="fire-ball-rafael-text${value >= 1000 ? ' sm' : ''}">RAFAEL</span>
            </div>
            <div class="fire-ball-prize">${value} CR</div>
        </div>
    `;
}

// -------------------------------------------------------------
// TABLA DE PAGOS
// -------------------------------------------------------------
function buildPaytable() {
    let html = `
        <p style="color: #ffea75; font-weight: bold; margin-bottom: 8px;">★ TABLA DE PREMIOS (EN CRÉDITOS PARA APUESTA 20 CR) ★</p>
        <ul style="list-style: none; padding: 0; line-height: 1.8;">
            <li>🌸🌸🌸 <strong style="color:#ff80b3;">MAYTE</strong>: 3+ Símbolos activan 10 Juegos Gratis</li>
            <li>👑 <strong style="color:#ffd700;">MARY</strong>: COMODÍN (Sustituye a cualquier nombre)</li>
            <li><strong style="color:#a3ffcf;">SUSANA</strong>: 3x (40 CR) &nbsp;|&nbsp; 4x (100 CR) &nbsp;|&nbsp; 5x (250 CR)</li>
            <li><strong style="color:#ff33bb;">CHARI, FRAN, ROBER, EVA, AURORA, ANTONIO, ISABEL, CARMEN</strong>: 3x (10 CR) &nbsp;|&nbsp; 4x (30 CR) &nbsp;|&nbsp; 5x (100 CR)</li>
        </ul>
        <br>
        <p>👑 <strong style="color:#ffd700;">MARY (COMODÍN):</strong> Actúa como comodín y asume el premio del nombre al que sustituye.</p>
        <p>🌸 <strong style="color:#ff80b3;">3+ MAYTE:</strong> Otorgan 10 Juegos Gratis con rodillos apilados de flores.</p>
        <p>🔥 <strong style="color:#00ff66;">6x RAFAEL:</strong> Activa la Pirámide de Bolas de Fuego.</p>
    `;
    paytableContent.innerHTML = html;
}

// -------------------------------------------------------------
// EVENTOS Y CONTROLES FÍSICOS
// -------------------------------------------------------------
function setupEventListeners() {
    document.body.addEventListener('click', initAudio, { once: true });
    document.body.addEventListener('keydown', initAudio, { once: true });
    document.body.addEventListener('pointerdown', initAudio, { once: true });

    // 1. Botón Grande Principal: JUEGO / ACUMULAR
    btnPhysSpin.addEventListener('click', () => {
        playButtonClickSound();
        handleMainSpinOrAcumular();
    });

    if (btnJoinQueuePrivate) {
        btnJoinQueuePrivate.addEventListener('click', () => {
            playButtonClickSound();
            mpQueueBtn.click();
        });
    }

    if (btnAdminBypass) {
        btnAdminBypass.addEventListener('click', () => {
            playButtonClickSound();
            pinModal.classList.remove('hidden');
        });
    }

    // Tecla Espacio
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && pinModal.classList.contains('hidden') && registerModal.classList.contains('hidden') && turnPromptModal.classList.contains('hidden')) {
            e.preventDefault();
            btnPhysSpin.classList.add('active-pressed');
            setTimeout(() => btnPhysSpin.classList.remove('active-pressed'), 120);
            playButtonClickSound();
            handleMainSpinOrAcumular();
        }
    });

    // 2. Botón PASAR A BANCO
    btnPhysBanco.addEventListener('click', () => {
        playButtonClickSound();
        if (!isMyTurn()) return;
        if (balance > 0 || currentWonAmount > 0) {
            bankAmount += balance + currentWonAmount;
            balance = 0;
            currentWonAmount = 0;
            pointsAmount = 0;
            updateDisplays();

            btnPhysCobrar.classList.add('glow-green');
            cobrarSubTxt.textContent = "LISTO";
            playCoinSound();
            tickerEl.textContent = `★ SALDO PASADO A BANCO (${bankAmount} CR). BOTÓN 'COBRAR' EN VERDE ★`;
        } else {
            tickerEl.textContent = "NO HAY SALDO DISPONIBLE PARA PASAR A BANCO";
        }
    });

    // 3. Botón COBRAR (Guarda saldo a salvo en la cuenta y libera el turno)
    btnPhysCobrar.addEventListener('click', async () => {
        playButtonClickSound();
        if (!isMyTurn()) return;
        const totalCobro = bankAmount + balance + pointsAmount + currentWonAmount;
        if (totalCobro > 0) {
            playCoinSound();
            bankAmount = 0;
            balance = 0;
            currentWonAmount = 0;
            pointsAmount = 0;
            btnPhysCobrar.classList.remove('glow-green');
            cobrarSubTxt.textContent = "SALDO";
            updateDisplays();

            // Notificar al servidor para guardar en cuenta y pasar turno al siguiente
            try {
                await fetch('/api/machine/release-turn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: currentUser.username,
                        currentBalance: totalCobro
                    })
                });
            } catch(e) {}

            tickerEl.textContent = `¡SALDO DE ${totalCobro} CR GUARDADO A SALVO EN TU CUENTA! HASTA PRONTO.`;
            syncMachineStatus();
        } else {
            // Si tiene 0 créditos, liberar máquina voluntariamente
            try {
                await fetch('/api/machine/release-turn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: currentUser.username,
                        currentBalance: 0
                    })
                });
            } catch(e) {}
            tickerEl.textContent = "MÁQUINA LIBERADA. TURNO PASADO AL SIGUIENTE AMIGO.";
            syncMachineStatus();
        }
    });

    // 4. Botón AUTO AVANCE
    btnPhysAuto.addEventListener('click', () => {
        playButtonClickSound();
        if (!isMyTurn()) return;
        isAutoPlaying = !isAutoPlaying;
        if (isAutoPlaying) {
            btnPhysAuto.classList.add('btn-active-toggle');
            tickerEl.textContent = "★ AUTO AVANCE ACTIVADO ★";
            autoInterval = setInterval(() => {
                if (!isSpinning && isMyTurn()) {
                    if (currentWonAmount > 0 && !isFreeSpinsMode && !isBonusMode) {
                        acumularGanadoACreditos();
                    } else {
                        transferBalanceToPointsIfNeeded();
                        if (pointsAmount >= currentBet) {
                            spin();
                        } else {
                            clearInterval(autoInterval);
                            isAutoPlaying = false;
                            btnPhysAuto.classList.remove('btn-active-toggle');
                            tickerEl.textContent = "AUTO AVANCE DETENIDO: SIN SALDO SUFICIENTE";
                        }
                    }
                }
            }, 2600);
        } else {
            clearInterval(autoInterval);
            btnPhysAuto.classList.remove('btn-active-toggle');
            tickerEl.textContent = "AUTO AVANCE DETENIDO";
        }
    });

    // 5. Botón APUESTA (5, 10, 20, 50, 100, 200 CR)
    btnPhysApuesta.addEventListener('click', () => {
        playButtonClickSound();
        const currentIdx = BET_LEVELS.indexOf(currentBet);
        currentBet = BET_LEVELS[(currentIdx + 1) % BET_LEVELS.length];
        updateDisplays();
        updateJackpots();
    });

    document.querySelector('.bet-display-box').addEventListener('click', () => {
        playButtonClickSound();
        const currentIdx = BET_LEVELS.indexOf(currentBet);
        currentBet = BET_LEVELS[(currentIdx + 1) % BET_LEVELS.length];
        updateDisplays();
        updateJackpots();
    });

    btnMaxBet.addEventListener('click', () => {
        playButtonClickSound();
        currentBet = 200;
        updateDisplays();
        updateJackpots();
    });

    // 6. Botón DISCRETO PAUSA / ESPERA (5 min para ir al servicio)
    btnPhysPausa.addEventListener('click', async () => {
        playButtonClickSound();
        if (!isMyTurn()) return;
        try {
            const res = await fetch('/api/machine/pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser.username })
            });
            const d = await res.json();
            if (d.ok) {
                syncMachineStatus();
            }
        } catch(e) {}
    });

    btnResumeGame.addEventListener('click', () => {
        btnPhysPausa.click();
    });

    // 7. Botón TABLA PREMIOS
    btnPhysInfo.addEventListener('click', () => {
        playButtonClickSound();
        infoModal.classList.remove('hidden');
    });

    btnJuegosSaldo.addEventListener('click', () => {
        playCoinSound();
        if (bankAmount > 0) {
            balance += bankAmount;
            bankAmount = 0;
            btnPhysCobrar.classList.remove('glow-green');
            cobrarSubTxt.textContent = "SALDO";
            tickerEl.textContent = `BANCO TRANSFERIDO A SALDO DE JUEGO`;
            updateDisplays();
        } else if (pointsAmount > 0 || balance > 0) {
            btnPhysBanco.click();
        }
    });

    soundBtn.addEventListener('click', () => {
        isAudioMuted = !isAudioMuted;
        soundBtn.textContent = isAudioMuted ? '🔇' : '🔊';
    });

    if(btnMyAccount) { btnMyAccount.addEventListener('click', () => { playButtonClickSound(); showRegisterModal(); }); }
    infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
    infoClose.addEventListener('click', () => infoModal.classList.add('hidden'));

    // -------------------------------------------------------------
    // ACCIONES MULTIJUGADOR (SELECCIÓN DE AMIGO, REGISTRO, COLA, PERMISOS)
    // -------------------------------------------------------------
    window.loadRegisteredUsersDropdown = async function() {
        const grid = document.getElementById('friends-grid-selector');
        const hiddenInput = document.getElementById('selected-user-nick');
        const select = document.getElementById('login-user-select');
        if (!grid) return;

        // Mostrar indicador de carga
        grid.innerHTML = '<div style="text-align:center; padding: 12px; color:#ffea75; font-size:0.85rem;">Cargando amigos registrados...</div>';

        let data = null;
        let lastError = null;

        // Intentar hasta 3 veces con delay por si hay timing issues
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (attempt > 0) await new Promise(r => setTimeout(r, 400));
                const res = await fetch('/api/users/list');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                data = await res.json();
                if (data.ok && Array.isArray(data.users)) break;
                lastError = data.error || 'Respuesta incorrecta del servidor';
            } catch(e) {
                lastError = e.message || 'Error de red';
                console.warn(`Intento ${attempt + 1} fallido:`, e);
            }
        }

        if (!data || !data.ok || !Array.isArray(data.users)) {
            grid.innerHTML = `<div style="text-align:center; color:#ff6b6b; padding:10px; font-size:0.82rem;">⚠️ Error al cargar la lista. Revisa la conexión.<br><small>${lastError || ''}</small><br><button onclick="window.loadRegisteredUsersDropdown()" style="margin-top:8px; padding:6px 12px; background:#00e5ff; color:#000; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">↺ Reintentar</button></div>`;
            return;
        }

        grid.innerHTML = '';
        if (select) select.innerHTML = '';

        if (data.users.length === 0) {
            grid.innerHTML = '<div style="text-align:center; color:#ffea75; padding:10px;">No hay amigos registrados aún.<br>Regístrate en la pestaña de al lado.</div>';
            switchAuthTab('register');
            return;
        }

        data.users.forEach(u => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'friend-chip-btn';
            btn.dataset.username = u.username;
            btn.innerHTML = `
                <span class="friend-chip-name">👤 ${u.username}</span>
                <span class="friend-chip-city">${u.city ? u.city : ''}</span>
            `;

            btn.addEventListener('click', () => {
                document.querySelectorAll('.friend-chip-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if (hiddenInput) hiddenInput.value = u.username;
                if (select) select.value = u.username;
                const pinInp = document.getElementById('login-user-pin');
                if (pinInp) pinInp.focus();
            });

            grid.appendChild(btn);

            if (select) {
                const opt = document.createElement('option');
                opt.value = u.username;
                opt.textContent = u.username;
                select.appendChild(opt);
            }
        });

        // Preseleccionar: el usuario actual si está, o el primero de la lista
        const targetUser = currentUser ? currentUser.username : (data.users[0] ? data.users[0].username : null);
        if (targetUser) {
            const matchBtn = Array.from(grid.querySelectorAll('.friend-chip-btn')).find(b =>
                b.dataset.username && b.dataset.username.toLowerCase() === targetUser.toLowerCase()
            );
            if (matchBtn) {
                matchBtn.click();
            } else if (grid.querySelector('.friend-chip-btn')) {
                grid.querySelector('.friend-chip-btn').click();
            }
        }

        switchAuthTab('login');
    };

    function switchAuthTab(tab) {
        const tabLogin = document.getElementById('tab-btn-login');
        const tabRegister = document.getElementById('tab-btn-register');
        const panelLogin = document.getElementById('auth-panel-login');
        const panelRegister = document.getElementById('auth-panel-register');
        const loginErr = document.getElementById('login-error-msg');
        const regErr = document.getElementById('reg-error-msg');
        if (loginErr) loginErr.classList.add('hidden');
        if (regErr) regErr.classList.add('hidden');

        if (tab === 'login') {
            if (tabLogin) tabLogin.classList.add('active');
            if (tabRegister) tabRegister.classList.remove('active');
            if (panelLogin) panelLogin.classList.remove('hidden');
            if (panelRegister) panelRegister.classList.add('hidden');
            const pinInp = document.getElementById('login-user-pin');
            if (pinInp) setTimeout(() => pinInp.focus(), 150);
        } else {
            if (tabRegister) tabRegister.classList.add('active');
            if (tabLogin) tabLogin.classList.remove('active');
            if (panelRegister) panelRegister.classList.remove('hidden');
            if (panelLogin) panelLogin.classList.add('hidden');
            if (regUsernameInput) setTimeout(() => regUsernameInput.focus(), 150);
        }
    }

    let isLoginSubmitting = false;
    async function doLoginFromSelect() {
        if (isLoginSubmitting) return;
        const hiddenInput = document.getElementById('selected-user-nick');
        const select = document.getElementById('login-user-select');
        const pinInp = document.getElementById('login-user-pin');
        const errEl = document.getElementById('login-error-msg');
        const btn = document.getElementById('btn-submit-login');

        const username = (hiddenInput && hiddenInput.value ? hiddenInput.value : (select ? select.value : '')).trim();
        const pin = pinInp ? pinInp.value.trim() : '';

        if (!username) {
            if (errEl) {
                errEl.textContent = 'Por favor toca tu nombre en la lista de amigos.';
                errEl.classList.remove('hidden');
            }
            return;
        }

        if (!pin) {
            if (errEl) {
                errEl.textContent = `Introduce el PIN de ${username} para entrar.`;
                errEl.classList.remove('hidden');
            }
            if (pinInp) pinInp.focus();
            return;
        }

        if (errEl) errEl.classList.add('hidden');
        isLoginSubmitting = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'VERIFICANDO...';
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            const data = await res.json();
            if (data.ok && data.user) {
                currentUser = data.user;
                saveUserToStorage();
                balance = currentUser.credits || 0;
                updateDisplays();
                if (pinInp) pinInp.value = '';
                registerModal.classList.add('hidden');
                playCoinSound();

                const myNameEl = document.getElementById('mp-my-name');
                if (myNameEl) myNameEl.textContent = (currentUser && currentUser.username && currentUser.username.trim() !== '') ? currentUser.username.toUpperCase() : "IDENTIFICARME";

                // Si la máquina está libre, abrir pregunta de espectadores de inmediato
                if (!currentMachineState.activeUser) {
                    turnPromptModal.classList.remove('hidden');
                } else if (isMyTurn()) {
                    tickerEl.textContent = `★ ¡HOLA ${currentUser.username.toUpperCase()}! ES TU TURNO DE JUGAR ★`;
                } else {
                    tickerEl.textContent = `¡HOLA ${currentUser.username.toUpperCase()}! MÁQUINA OCUPADA POR ${currentMachineState.activeUser}.`;
                }
                syncMachineStatus();
            } else {
                if (errEl) {
                    errEl.textContent = data.error || 'PIN incorrecto. Pide tu PIN al administrador si no lo recuerdas.';
                    errEl.classList.remove('hidden');
                }
            }
        } catch(e) {
            if (errEl) {
                errEl.textContent = 'Error de conexión: ' + (e.message || 'No se pudo conectar.');
                errEl.classList.remove('hidden');
            }
        } finally {
            isLoginSubmitting = false;
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'ENTRAR A LA MÁQUINA';
            }
        }
    }

    let isRegSubmitting = false;
    async function doRegisterNewUser(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (isRegSubmitting) return;

        const rawNick = regUsernameInput.value.trim();
        const city = regCityInput.value.trim();
        const zip = regZipInput.value.trim();
        const pin = regPinInput.value.trim();
        const btnSubmitReg = document.getElementById('btn-submit-register');

        if (!rawNick || rawNick.length < 2) {
            regErrorMsg.textContent = 'Introduce tu nombre o apodo (mínimo 2 letras).';
            regErrorMsg.classList.remove('hidden');
            return;
        }
        if (!pin || pin.length < 1) {
            regErrorMsg.textContent = 'Introduce un PIN o clave personal libre (cualquier combinación de letras y números).';
            regErrorMsg.classList.remove('hidden');
            return;
        }

        regErrorMsg.classList.add('hidden');
        isRegSubmitting = true;
        if (btnSubmitReg) {
            btnSubmitReg.disabled = true;
            btnSubmitReg.textContent = 'REGISTRANDO...';
        }

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: rawNick, city, zip, pin })
            });
            const data = await res.json();
            if (data.ok && data.user) {
                currentUser = data.user;
                saveUserToStorage();
                balance = currentUser.credits || 0;
                updateDisplays();
                regUsernameInput.value = '';
                regCityInput.value = '';
                regZipInput.value = '';
                regPinInput.value = '';
                registerModal.classList.add('hidden');
                playCoinSound();

                const myNameEl = document.getElementById('mp-my-name');
                if (myNameEl) myNameEl.textContent = (currentUser && currentUser.username && currentUser.username.trim() !== '') ? currentUser.username.toUpperCase() : "IDENTIFICARME";

                await window.loadRegisteredUsersDropdown();

                // Si la máquina está libre, abrir pregunta de espectadores
                if (!currentMachineState.activeUser) {
                    turnPromptModal.classList.remove('hidden');
                } else {
                    tickerEl.textContent = `★ BIENVENIDO ${currentUser.username.toUpperCase()} ★`;
                }
                syncMachineStatus();
            } else {
                regErrorMsg.textContent = data.error || 'Error al registrar usuario.';
                regErrorMsg.classList.remove('hidden');
            }
        } catch(err) {
            regErrorMsg.textContent = 'Error: ' + (err.message || 'No se pudo conectar con el servidor.');
            regErrorMsg.classList.remove('hidden');
        } finally {
            isRegSubmitting = false;
            if (btnSubmitReg) {
                btnSubmitReg.disabled = false;
                btnSubmitReg.textContent = 'REGISTRARME Y ENTRAR';
            }
        }
    }

    // Wiring de Pestañas y Enlaces
    const tabBtnLogin = document.getElementById('tab-btn-login');
    const tabBtnRegister = document.getElementById('tab-btn-register');
    const linkGotoRegister = document.getElementById('link-goto-register');
    const linkGotoLogin = document.getElementById('link-goto-login');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const loginUserPin = document.getElementById('login-user-pin');
    const btnSubmitReg = document.getElementById('btn-submit-register');

    if (tabBtnLogin) tabBtnLogin.addEventListener('click', () => switchAuthTab('login'));
    if (tabBtnRegister) tabBtnRegister.addEventListener('click', () => switchAuthTab('register'));
    if (linkGotoRegister) linkGotoRegister.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('register'); });
    if (linkGotoLogin) linkGotoLogin.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('login'); });

    if (btnSubmitLogin) btnSubmitLogin.addEventListener('click', doLoginFromSelect);
    if (loginUserPin) {
        loginUserPin.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLoginFromSelect();
        });
    }

    if (btnSubmitReg) btnSubmitReg.addEventListener('click', doRegisterNewUser);
    [regUsernameInput, regCityInput, regZipInput, regPinInput].forEach(inp => {
        if (inp) inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doRegisterNewUser(e);
        });
    });



    const btnModalAdminLogin = document.getElementById('btn-modal-admin-login');
    const adminQuickLoginRow = document.getElementById('admin-quick-login-row');
    const modalAdminPassInput = document.getElementById('modal-admin-pass-input');
    const btnSubmitModalAdmin = document.getElementById('btn-submit-modal-admin');

    if (btnModalAdminLogin && adminQuickLoginRow) {
        btnModalAdminLogin.addEventListener('click', () => {
            adminQuickLoginRow.classList.toggle('hidden');
            if (!adminQuickLoginRow.classList.contains('hidden') && modalAdminPassInput) {
                setTimeout(() => modalAdminPassInput.focus(), 100);
            }
        });
    }

    async function doAdminQuickLogin() {
        if (!modalAdminPassInput) return;
        const pass = modalAdminPassInput.value.trim();
        if (isAnyAdminPassword(pass)) {
            // Clave maestra R22v03a1965
            registerModal.classList.add('hidden');
            tickerEl.textContent = '★ ACCESO ADMINISTRADOR AUTORIZADO ★';
            rechargeBtn.click();
            const cashierPassInput = document.getElementById('cashier-pass-input');
            const cashierPassBtn = document.getElementById('cashier-pass-btn');
            if (cashierPassInput && cashierPassBtn) {
                cashierPassInput.value = pass;
                cashierPassBtn.click();
            }
            modalAdminPassInput.value = '';
            syncMachineStatus();
        } else {
            alert('Contraseña de administrador incorrecta. Solo el Administrador tiene acceso.');
            modalAdminPassInput.focus();
        }
    }

    if (btnSubmitModalAdmin) {
        btnSubmitModalAdmin.addEventListener('click', doAdminQuickLogin);
    }
    if (modalAdminPassInput) {
        modalAdminPassInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdminQuickLogin();
        });
    }

    // Pregunta de permisos de espectador al tomar la máquina libre
    btnAllowSpectators.addEventListener('click', async () => {
        await claimMachineTurn(true);
    });

    btnDenySpectators.addEventListener('click', async () => {
        await claimMachineTurn(false);
    });

    async function claimMachineTurn(allowSpectators) {
        turnPromptModal.classList.add('hidden');
        if (!currentUser || !currentUser.username || currentUser.username.toUpperCase() === 'ADMIN' || currentUser.username.toUpperCase() === 'INVITADO') {
            showRegisterModal();
            return;
        }
        try {
            const res = await fetch('/api/machine/claim-turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser.username, allowSpectators })
            });
            const data = await res.json();
            if (data.ok) {
                balance = typeof data.balance === 'number' ? data.balance : (currentUser.credits || 0);
                currentMachineState.activeUser = currentUser.username;
                currentMachineState.allowSpectators = allowSpectators;
                
                // Si tiene créditos pero 0 puntos, preparar saldo para jugar
                if (pointsAmount < currentBet && balance >= currentBet) {
                    transferBalanceToPointsIfNeeded();
                }

                updateDisplays();
                playCoinSound();
                renderMultiplayerBar(currentMachineState);
                if (balance > 0 || pointsAmount > 0) {
                    tickerEl.textContent = `★ ¡TURNO INICIADO! BIENVENIDO ${currentUser.username.toUpperCase()} - PULSA 'JUEGO' ★`;
                } else {
                    tickerEl.textContent = `★ ¡TURNO ACTIVO DE ${currentUser.username.toUpperCase()}! SALDO: 0 CR. PIDE RECARGA AL ADMINISTRADOR 🔐 ★`;
                }
                syncMachineStatus();
            } else {
                tickerEl.textContent = data.error || 'No se pudo iniciar el turno.';
                syncMachineStatus();
            }
        } catch(e) {
            tickerEl.textContent = 'Error de conexión con la máquina.';
        }
    }

    // Botón de pedir turno / entrar en cola
    mpQueueBtn.addEventListener('click', async () => {
        playButtonClickSound();
        if (!currentUser || !currentUser.username || currentUser.username.toUpperCase() === 'ADMIN' || currentUser.username.toUpperCase() === 'INVITADO') {
            showRegisterModal();
            return;
        }

        // Si la máquina está libre
        if (!currentMachineState.activeUser) {
            turnPromptModal.classList.remove('hidden');
            return;
        }

        const userInQueue = currentMachineState.queue && 
            currentMachineState.queue.some(u => u.toLowerCase() === currentUser.username.toLowerCase());

        try {
            if (userInQueue) {
                await fetch('/api/machine/queue-leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser.username })
                });
                tickerEl.textContent = "HAS SALIDO DE LA COLA DE ESPERA.";
            } else {
                const res = await fetch('/api/machine/queue-join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser.username })
                });
                const d = await res.json();
                if (d.ok) {
                    tickerEl.textContent = `¡APUNTADO A LA COLA! TU PUESTO: Nº ${d.position}`;
                }
            }
            syncMachineStatus();
        } catch(e) {}
    });

    btnJoinQueuePrivate.addEventListener('click', () => {
        mpQueueBtn.click();
    });

    // -------------------------------------------------------------
    // PANEL DE ADMINISTRADOR Y CAJA (CLAVE ÚNICA: R22v03a1965)
    // -------------------------------------------------------------
    const cashierPassInput = document.getElementById('cashier-pass-input');
    const cashierPassBtn = document.getElementById('cashier-pass-btn');
    const cashierPassMsg = document.getElementById('cashier-pass-msg');
    const cashierOpsPanel = document.getElementById('cashier-ops-panel');

    const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    const adminUsersList = document.getElementById('admin-users-list');
    const adminSelectUser = document.getElementById('admin-select-user');
    const adminCustomAmount = document.getElementById('admin-custom-amount');
    const adminBtnRechargeSubmit = document.getElementById('admin-btn-recharge-submit');
    const adminBtnCashoutSubmit = document.getElementById('admin-btn-cashout-submit');
    const adminBtnDeleteUser = document.getElementById('admin-btn-delete-user');
    const adminLogsContainer = document.getElementById('admin-logs-container');

    const btnForceRafael = document.getElementById('btn-force-rafael');
    const btnForceMayte = document.getElementById('btn-force-mayte');
    const btnForceReleaseMachine = document.getElementById('btn-force-release-machine');

    function lockCashierPanel() {
        if (cashierPassInput) {
            cashierPassInput.value = '';
            cashierPassInput.className = '';
        }
        if (cashierPassMsg) {
            cashierPassMsg.className = 'auth-msg-warning';
            cashierPassMsg.textContent = '🔒 Clave maestra requerida para gestionar saldo y amigos';
        }
        if (cashierOpsPanel) {
            cashierOpsPanel.className = 'cashier-ops-panel locked-ops';
        }
    }

    async function verifyCashierPassword() {
        if (!cashierPassInput) return false;
        const entered = cashierPassInput.value.trim();

        // Verificación con el servidor
        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: entered })
            });
            const data = await res.json();

            if (data.ok && data.authorized) {
                cashierPassInput.classList.remove('invalid-pass');
                cashierPassInput.classList.add('valid-pass');
                cashierPassMsg.className = 'auth-msg-success';
                cashierPassMsg.textContent = '✅ Acceso de Administrador Autorizado';
                cashierOpsPanel.className = 'cashier-ops-panel unlocked-ops';
                playCoinSound();
                loadAdminData();
                return true;
            }
        } catch(e) {}

        cashierPassInput.classList.remove('valid-pass');
        cashierPassInput.classList.add('invalid-pass');
        cashierPassMsg.className = 'auth-msg-error';
        cashierPassMsg.textContent = '❌ Contraseña incorrecta. Acceso restringido a Administrador.';
        cashierOpsPanel.className = 'cashier-ops-panel locked-ops';
        return false;
    }

    async function loadAdminData() {
        try {
            const res = await fetch('/api/admin/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: ADMIN_PASSWORD })
            });
            const data = await res.json();
            if (!data.ok) return;

            // Renderizar Jugadores
            if (adminUsersList && adminSelectUser) {
                adminUsersList.innerHTML = '';
                adminSelectUser.innerHTML = '<option value="">-- Selecciona un amigo --</option>';

                data.users.forEach(u => {
                    const row = document.createElement('div');
                    row.className = 'admin-user-row';
                    row.innerHTML = `
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span class="admin-user-nick">${u.username}</span>
                            <span class="admin-user-loc">(${u.city}, ${u.zip})</span>
                            <span class="admin-user-pin-badge" title="PIN personal de este usuario">🔑 PIN: <strong>${u.pin || '1234'}</strong></span>
                            <button type="button" class="btn-mini-action btn-change-pin-btn" data-user="${u.username}" title="Cambiar PIN a este amigo">✏️ Cambiar</button>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span class="admin-user-cred">${Math.round(u.credits || 0).toLocaleString('es-ES')} CR</span>
                            <span style="font-size: 0.70rem; color: #ccc; margin-top: 4px; font-weight: normal; font-family: 'Inter', sans-serif;">Mete: <span style="color:#00ff00">${u.totalDeposited || 0}</span> | Saca: <span style="color:#ff3333">${u.totalCashedOut || 0}</span> | Neto: <span style="color:#ffea75">${(u.totalDeposited || 0) - (u.totalCashedOut || 0)}</span></span>
                        </div>
                    `;
                    const changeBtn = row.querySelector('.btn-change-pin-btn');
                    if (changeBtn) {
                        changeBtn.onclick = async (ev) => {
                            ev.stopPropagation();
                            const newPin = prompt(`Introduce el nuevo PIN personal para "${u.username}":`, u.pin || '1234');
                            if (!newPin || newPin.trim().length < 1) return;
                            try {
                                const res = await fetch('/api/admin/change-pin', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ password: ADMIN_PASSWORD, username: u.username, newPin: newPin.trim() })
                                });
                                const d = await res.json();
                                if (d.ok) {
                                    alert(`¡PIN de ${u.username} actualizado con éxito a: ${newPin.trim()}!`);
                                    loadAdminData();
                                } else {
                                    alert(d.error || 'Error cambiando el PIN');
                                }
                            } catch(e) { alert('Error de conexión con el servidor.'); }
                        };
                    }
                    row.onclick = () => {
                        adminSelectUser.value = u.username;
                        openPlayerHistoryModal(u);
                    };
                    adminUsersList.appendChild(row);

                    const opt = document.createElement('option');
                    opt.value = u.username;
                    opt.textContent = `${u.username} (${Math.round(u.credits || 0)} CR) - PIN: ${u.pin || '1234'}`;
                    adminSelectUser.appendChild(opt);
                });
            }

                        // Renderizar Estadísticas Globales
            const statIn = document.getElementById('global-stat-in');
            const statOut = document.getElementById('global-stat-out');
            const statNet = document.getElementById('global-stat-net');
            if (statIn && statOut && statNet) {
                let globalIn = 0;
                let globalOut = 0;
                data.users.forEach(u => {
                    globalIn += (u.totalDeposited || 0);
                    globalOut += (u.totalCashedOut || 0);
                });
                statIn.textContent = globalIn + ' CR';
                statOut.textContent = globalOut + ' CR';
                statNet.textContent = (globalIn - globalOut) + ' CR';
            }
        } catch(e) {}
    }

    // Pestañas Administrador
    adminTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            adminTabBtns.forEach(b => b.classList.remove('active'));
            adminTabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.dataset.tab;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Botones rápidos de recarga
    document.querySelectorAll('.modal-amount-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const amt = parseInt(btn.dataset.amount);
            if (adminCustomAmount) adminCustomAmount.value = amt;
        });
    });

    // Enviar recarga
    adminBtnRechargeSubmit.addEventListener('click', async () => {
        const targetUser = adminSelectUser.value;
        const amount = parseInt(adminCustomAmount.value) || 0;
        if (!targetUser) {
            alert('Por favor selecciona un amigo.');
            return;
        }
        if (amount <= 0) {
            alert('Introduce una cantidad válida de créditos.');
            return;
        }

        try {
            const res = await fetch('/api/admin/recharge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: ADMIN_PASSWORD, username: targetUser, amount })
            });
            const d = await res.json();
            if (d.ok) {
                playCoinSound();
                alert(`¡Se han añadido +${amount} Créditos a ${targetUser}!`);
                adminCustomAmount.value = '';
                loadAdminData();
                syncMachineStatus();
            }
        } catch(e) {}
    });

    // Cobrar a cero
    adminBtnCashoutSubmit.addEventListener('click', async () => {
        const targetUser = adminSelectUser.value;
        if (!targetUser) {
            alert('Por favor selecciona un amigo.');
            return;
        }
        if (!confirm(`¿Deseas cobrar todo y poner a 0 Créditos a ${targetUser}?`)) return;

        try {
            const res = await fetch('/api/admin/cashout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: ADMIN_PASSWORD, username: targetUser })
            });
            const d = await res.json();
            if (d.ok) {
                playCoinSound();
                alert(`¡Cobro realizado! Se han retirado ${d.cashedOut} Créditos a ${targetUser}.`);
                loadAdminData();
                syncMachineStatus();
            }
        } catch(e) {}
    });

    // Minijuegos exclusivos Administrador
    
    if (adminBtnDeleteUser) {
        adminBtnDeleteUser.addEventListener('click', async () => {
            const targetUser = adminSelectUser.value;
            if (!targetUser) {
                alert('Por favor selecciona un amigo.');
                return;
            }
            if (!confirm(`¿Estás SEGURO de que deseas ELIMINAR por completo al usuario ${targetUser} y todos sus datos?`)) return;

            try {
                const res = await fetch('/api/admin/delete-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: ADMIN_PASSWORD, username: targetUser })
                });
                const d = await res.json();
                if (d.ok) {
                    playCoinSound();
                    alert(`Usuario ${targetUser} eliminado correctamente.`);
                    loadAdminData();
                    syncMachineStatus();
                } else {
                    alert(d.error || 'Error al eliminar usuario');
                }
            } catch(e) {}
        });
    }

    btnForceRafael.addEventListener('click', () => {
        forceRafaelBonusNextSpin = true;
        tickerEl.textContent = "🔥 JUEGO DE RAFAEL PROGRAMADO POR ADMINISTRADOR PARA LA SIGUIENTE TIRADA 🔥";
        playCoinSound();
        pinModal.classList.add('hidden');
    });

    btnForceMayte.addEventListener('click', () => {
        forceMayteBonusNextSpin = true;
        tickerEl.textContent = "🌸 JUEGO DE MAYTE PROGRAMADO POR ADMINISTRADOR PARA LA SIGUIENTE TIRADA 🌸";
        playCoinSound();
        pinModal.classList.add('hidden');
    });

    btnForceReleaseMachine.addEventListener('click', async () => {
        if (!confirm('¿Forzar la liberación de la máquina? El saldo del jugador activo quedará guardado en su cuenta.')) return;
        try {
            const res = await fetch('/api/admin/force-release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: ADMIN_PASSWORD })
            });
            const d = await res.json();
            if (d.ok) {
                alert('Máquina liberada correctamente.');
                syncMachineStatus();
            }
        } catch(e) {}
    });

    // Abrir y cerrar modal admin (solo con clave maestra R22v03a1965)
    rechargeBtn.addEventListener('click', () => {
        pinModal.classList.remove('hidden');
        lockCashierPanel();
        setTimeout(() => cashierPassInput.focus(), 150);
    });

    cashierPassBtn.addEventListener('click', verifyCashierPassword);
    cashierPassInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCashierPassword();
    });

    pinCancel.addEventListener('click', () => {
        pinModal.classList.add('hidden');
        lockCashierPanel();
    });

    // Modal Premio Gordo Cobrar
    collectBtn.addEventListener('click', () => {
        playCoinSound();
        winModal.classList.add('hidden');
        acumularGanadoACreditos();
    });
}

// Arrancar al cargar la página
window.addEventListener('DOMContentLoaded', init);





// -------------------------------------------------------------
// BONO DIARIO LOGIC
// -------------------------------------------------------------
const btnDailyBonus = document.getElementById('btn-daily-bonus');
const dailyBonusModal = document.getElementById('daily-bonus-modal');
const dailyReelStrip = document.getElementById('daily-reel-strip');
const dailyWinAmount = document.getElementById('daily-win-amount');
const btnSpinDaily = document.getElementById('btn-spin-daily');
const btnCloseDaily = document.getElementById('btn-close-daily');

let dailyBonusClaimedToday = false;

function getTodayString() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function checkDailyBonusStatus() {
    if (!currentUser || !currentUser.username || currentUser.username.toUpperCase() === 'ADMIN') {
        if(btnDailyBonus) btnDailyBonus.classList.add('hidden');
        return;
    }
    
    const today = getTodayString();
    const storageKey = 'dailyClaimed_' + currentUser.username.toLowerCase() + '_' + today;
    const hasClaimed = localStorage.getItem(storageKey);
    
    if (hasClaimed) {
        dailyBonusClaimedToday = true;
        if(btnDailyBonus) btnDailyBonus.classList.add('hidden');
        return;
    }
    
    // Validar si jugó 200 CR
    // totalBetsSession tracks the session, but we want it across the day ideally.
    // If we only track in memory for this session:
    if (totalBetsSession >= 200) {
        if(btnDailyBonus) {
            btnDailyBonus.classList.remove('hidden');
            btnDailyBonus.classList.add('pulsing-btn');
        }
    } else {
        if(btnDailyBonus) btnDailyBonus.classList.add('hidden');
    }
}

// Hook checkDailyBonusStatus into updateDisplays
const oldUpdateDisplaysDaily = updateDisplays;
updateDisplays = function() {
    oldUpdateDisplaysDaily();
    checkDailyBonusStatus();
};

if (btnDailyBonus) {
    btnDailyBonus.addEventListener('click', () => {
        dailyBonusModal.classList.remove('hidden');
        dailyWinAmount.textContent = '-- CR';
        btnSpinDaily.classList.remove('hidden');
        btnCloseDaily.classList.add('hidden');
        dailyReelStrip.style.transition = 'none';
        dailyReelStrip.style.transform = 'translateY(0)';
        dailyReelStrip.innerHTML = '<div>??</div>';
    });
}

if (btnCloseDaily) {
    btnCloseDaily.addEventListener('click', () => {
        dailyBonusModal.classList.add('hidden');
    });
}

if (btnSpinDaily) {
    btnSpinDaily.addEventListener('click', async () => {
        btnSpinDaily.classList.add('hidden');
        
        // Determinar el premio (10 a 100 peso 2, 110 a 200 peso 1)
        const prizes = [];
        for(let i=10; i<=100; i+=10) { prizes.push({v: i, w: 2}); }
        for(let i=110; i<=200; i+=10) { prizes.push({v: i, w: 1}); }
        
        let totalWeight = prizes.reduce((sum, p) => sum + p.w, 0);
        let r = Math.random() * totalWeight;
        let wonPrize = 200;
        for(let p of prizes) {
            if (r < p.w) { wonPrize = p.v; break; }
            r -= p.w;
        }
        
        // Generar la tira de números (40 números de relleno + premio al final)
        let stripHtml = '';
        const numSymbols = 40;
        for(let i=0; i<numSymbols-1; i++) {
            let randVal = Math.floor(Math.random()*20)*10 + 10;
            stripHtml += '<div style="height: 100px;">' + randVal + '</div>';
        }
        stripHtml += '<div style="height: 100px; color: #ffea75;">' + wonPrize + '</div>';
        dailyReelStrip.innerHTML = stripHtml;
        
        // Iniciar sonido y giro
        if (!isAudioMuted && audioCtx) {
            initAudio();
            let audioInterval = setInterval(() => {
                playTone(500, 'square', 0.02, 0.05);
            }, 50);
            setTimeout(() => clearInterval(audioInterval), 2900);
        }
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                dailyReelStrip.style.transition = 'transform 3s cubic-bezier(0.1, 0.7, 0.1, 1)';
                dailyReelStrip.style.transform = 'translateY(-' + (100 * (numSymbols - 1)) + 'px)';
            });
        });
        
        // Esperar a que pare
        await new Promise(res => setTimeout(res, 3000));
        
        if (!isAudioMuted && audioCtx) {
            playTone(800, 'triangle', 0.1, 0.15);
            setTimeout(() => playTone(1200, 'triangle', 0.3, 0.2), 150);
        }
        
        dailyWinAmount.textContent = '¡+' + wonPrize + ' CR!';
        balance += wonPrize;
        updateDisplays();
        
        // Marcar como reclamado
        const today = getTodayString();
        const storageKey = 'dailyClaimed_' + currentUser.username.toLowerCase() + '_' + today;
        localStorage.setItem(storageKey, 'true');
        checkDailyBonusStatus();
        
        btnCloseDaily.classList.remove('hidden');
    });
}


function openPlayerHistoryModal(user) {
    const modal = document.getElementById('player-history-modal');
    if (!modal) return;
    
    document.getElementById('hist-player-name').textContent = user.username;
    if(document.getElementById('hist-current-balance')) document.getElementById('hist-current-balance').textContent = Math.round(user.credits || 0) + ' CR';
    document.getElementById('hist-total-in').textContent = (user.totalDeposited || 0) + ' CR';
    document.getElementById('hist-total-out').textContent = (user.totalCashedOut || 0) + ' CR';
    document.getElementById('hist-net').textContent = ((user.totalDeposited || 0) - (user.totalCashedOut || 0)) + ' CR';
    
    const tbody = document.getElementById('hist-table-body');
    tbody.innerHTML = '';
    
    const history = user.history || [];
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No hay actividad registrada aún.</td></tr>';
    } else {
        history.forEach(log => {
            if (!log) return;
            const tr = document.createElement('tr');
            
            // Format date
            const d = log.timestamp ? new Date(log.timestamp) : new Date();
            const dateStr = !isNaN(d.getTime()) ? (d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit', second:'2-digit' })) : '-';
            
            // Amount format
            let amountHtml = '-';
            const actionStr = log.action ? String(log.action).toLowerCase() : '';
            if (actionStr.includes('recarga') || actionStr.includes('deposita')) {
                amountHtml = `<span style="color: #00ff00;">+${log.amount || 0} CR</span>`;
            } else if (actionStr.includes('retiro') || actionStr.includes('cobra')) {
                amountHtml = `<span style="color: #ff3333;">-${log.amount || 0} CR</span>`;
            }
            
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${log.action || 'Desconocido'}</td>
                <td>${amountHtml}</td>
                <td>${log.balanceAfter || 0} CR</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    modal.classList.remove('hidden');
    
    const closeBtn = document.getElementById('btn-close-history');
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
    
    const closeBtnBottom = document.getElementById('btn-close-history-bottom');
    if (closeBtnBottom) closeBtnBottom.onclick = () => modal.classList.add('hidden');
}
