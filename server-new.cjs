const http = require('http');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const PORT = 8085;
const ADMIN_PASSWORD = "R22v03a1965";
function isValidAdminPassword(pass) {
    if (!pass) return false;
    return String(pass).trim() === ADMIN_PASSWORD;
}
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos estándar
const PAUSE_TIMEOUT_MS = 5 * 60 * 1000;      // 5 minutos modo espera/servicio

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const STATE_FILE = path.join(DATA_DIR, 'machine_state.json');

// Crear directorio data si no existe
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helpers para lectura/escritura segura de JSON
function readJSON(file, defaultVal) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf-8');
            return defaultVal;
        }
        const data = fs.readFileSync(file, 'utf-8');
        return JSON.parse(data || '{}');
    } catch (e) {
        console.error(`Error leyendo ${file}:`, e);
        return defaultVal;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error(`Error escribiendo ${file}:`, e);
    }
}

// Inicializar archivos
let users = {};
let logs = [];
let machineState = {
    activeUser: null,
    allowSpectators: false,
    turnStartedAt: null,
    lastActivityAt: null,
    isPaused: false,
    pauseStartedAt: null,
    queue: [],
    currentMachineBalance: 0,
    lastSpin: null
};

function addLog(user, action, amount, balanceAfter, note) {
    const entry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        timestamp: new Date().toISOString(),
        user: user || 'Sistema',
        action,
        amount: Number(amount) || 0,
        balanceAfter: Number(balanceAfter) || 0,
        note: note || ''
    };
    logs.unshift(entry);
    if (logs.length > 500) logs = logs.slice(0, 500);
    writeJSON(LOGS_FILE, logs);
}

// Comprobación de inactividad / timeout periódico
function checkTurnTimeout() {
    if (!machineState.activeUser) return;

    const now = Date.now();
    const timeoutLimit = machineState.isPaused ? PAUSE_TIMEOUT_MS : INACTIVITY_TIMEOUT_MS;
    const baseTime = machineState.isPaused ? machineState.pauseStartedAt : machineState.lastActivityAt;
    const elapsed = now - (baseTime || now);

    if (elapsed >= timeoutLimit) {
        // Guardar saldo automáticamente en el usuario para que no se pierda NADA
        const userKey = machineState.activeUser.toLowerCase();
        if (users[userKey]) {
            users[userKey].credits = Number(machineState.currentMachineBalance) || 0;
            users[userKey].lastSeen = new Date().toISOString();
            writeJSON(USERS_FILE, users);
            addLog(
                machineState.activeUser,
                machineState.isPaused ? 'FIN PAUSA - SALDO GUARDADO' : 'INACTIVIDAD - SALDO GUARDADO',
                users[userKey].credits,
                users[userKey].credits,
                `Turno finalizado por ${machineState.isPaused ? '5 min de pausa' : '2 min sin tiradas'}. Saldo protegido en cuenta.`
            );
        }

        console.log(`[TIMEOUT] Liberando turno de ${machineState.activeUser}. Saldo guardado.`);
        
        // Pasar al siguiente de la cola si existe
        if (machineState.queue && machineState.queue.length > 0) {
            const nextUser = machineState.queue.shift();
            const nextKey = nextUser.toLowerCase();
            machineState.activeUser = nextUser;
            machineState.allowSpectators = false; // El nuevo elegirá si permite o no
            machineState.turnStartedAt = now;
            machineState.lastActivityAt = now;
            machineState.isPaused = false;
            machineState.pauseStartedAt = null;
            machineState.currentMachineBalance = users[nextKey] ? (users[nextKey].credits || 0) : 0;
            addLog(nextUser, 'TURNO ASIGNADO (COLA)', machineState.currentMachineBalance, machineState.currentMachineBalance, 'Turno pasado al siguiente en cola');
        } else {
            machineState.activeUser = null;
            machineState.allowSpectators = false;
            machineState.turnStartedAt = null;
            machineState.lastActivityAt = null;
            machineState.isPaused = false;
            machineState.pauseStartedAt = null;
            machineState.currentMachineBalance = 0;
        }

        writeJSON(STATE_FILE, machineState);
    }
}

// Revisar timeout cada 3 segundos
setInterval(checkTurnTimeout, 3000);

// MIME types para estáticos
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4'
};

// Parser de cuerpo JSON
function parseRequestBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch (e) {
                resolve({});
            }
        });
    });
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    const urlParts = req.url.split('?');
    const pathname = urlParts[0];

    // ==========================================
    // RUTAS DE LA API
    // ==========================================

    // 0. LISTA DE AMIGOS REGISTRADOS (Para el desplegable de entrar)
    if (pathname === '/api/users/list' && req.method === 'GET') {
        const list = Object.values(users).map(u => ({
            username: u.username,
            city: u.city || ''
        }));
        return sendJSON(res, 200, { ok: true, users: list });
    }

    // 0.1 VALIDAR USUARIO Y OBTENER DATOS
    if (pathname === '/api/user-info' && req.method === 'GET') {
        const u = (urlParts[1] ? new URLSearchParams(urlParts[1]).get('username') : '') || '';
        const userKey = u.toLowerCase().trim();
        if (users[userKey]) {
            return sendJSON(res, 200, { ok: true, user: users[userKey] });
        }
        return sendJSON(res, 404, { ok: false, error: 'Usuario no encontrado' });
    }

    // 1. REGISTRO DE USUARIO (Nombre único, Ciudad, Código Postal, PIN opcional)
    if (pathname === '/api/register' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        let rawNick = (body.username || '').trim();
        let city = (body.city || '').trim();
        let zip = (body.zip || '').trim();
        let pin = (body.pin || '').trim();

        if (!rawNick || rawNick.length < 2) {
            return sendJSON(res, 400, { ok: false, error: 'El nombre debe tener al menos 2 caracteres.' });
        }
        if (!pin || pin.length < 1) {
            return sendJSON(res, 400, { ok: false, error: 'Por favor introduce un PIN o clave personal.' });
        }

        const userKey = rawNick.toLowerCase();
        if (users[userKey]) {
            return sendJSON(res, 400, { ok: false, error: `El nombre "${rawNick}" ya está registrado. Si eres tú, pulsa en "Ya estoy registrado" e introduce tu PIN.` });
        }

        users[userKey] = {
            username: rawNick,
            city: city || 'No especificada',
            zip: zip || '00000',
            pin: pin,
            credits: 0,
            bank: 0,
            points: 0,
            registeredAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        };
        writeJSON(USERS_FILE, users);
        addLog(rawNick, 'REGISTRO', 0, 0, `Nuevo amigo registrado desde ${city} (${zip})`);

        return sendJSON(res, 200, { ok: true, user: users[userKey] });
    }

    // 2. LOGIN / VERIFICACIÓN DE USUARIO
    if (pathname === '/api/login' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const rawNick = (body.username || '').trim();
        const pin = (body.pin || '').trim();
        const userKey = rawNick.toLowerCase();

        // 2.1 Acceso especial con nombre "ADMIN" o "ADMINISTRADOR"
        if (userKey === 'admin' || userKey === 'administrador') {
            if (isValidAdminPassword(pin)) {
                return sendJSON(res, 200, {
                    ok: true,
                    user: {
                        username: 'ADMIN',
                        city: 'Central',
                        zip: '00000',
                        pin: ADMIN_PASSWORD,
                        credits: 50000,
                        bank: 0,
                        points: 0,
                        isAdmin: true
                    }
                });
            } else {
                return sendJSON(res, 401, { ok: false, error: 'Contraseña maestra de Administrador incorrecta.' });
            }
        }

        if (!users[userKey]) {
            return sendJSON(res, 404, { ok: false, error: 'Usuario no encontrado. Por favor regístrate primero.' });
        }

        // Si introduce contraseña de administrador autorizada, acceso universal garantizado
        const isMasterAdmin = isValidAdminPassword(pin);

        // Si tiene PIN configurado y no coincide
        if (!isMasterAdmin && users[userKey].pin && pin && users[userKey].pin.trim() !== pin) {
            return sendJSON(res, 401, {
                ok: false,
                error: `PIN incorrecto para "${users[userKey].username}". Pide tu PIN al administrador si no lo recuerdas.`
            });
        }

        users[userKey].lastSeen = new Date().toISOString();
        writeJSON(USERS_FILE, users);

        return sendJSON(res, 200, { ok: true, user: users[userKey] });
    }

    // 3. ESTADO GENERAL DE LA MÁQUINA
    if (pathname === '/api/machine-status' && req.method === 'GET') {
        checkTurnTimeout();

        const now = Date.now();
        let remainingSeconds = 0;
        let isExpiringSoon = false;

        if (machineState.activeUser) {
            const timeoutLimit = machineState.isPaused ? PAUSE_TIMEOUT_MS : INACTIVITY_TIMEOUT_MS;
            const baseTime = machineState.isPaused ? machineState.pauseStartedAt : machineState.lastActivityAt;
            const elapsed = now - (baseTime || now);
            remainingSeconds = Math.max(0, Math.ceil((timeoutLimit - elapsed) / 1000));
            // Si faltan 15 segundos o menos
            if (remainingSeconds <= 15) {
                isExpiringSoon = true;
            }
        }

        return sendJSON(res, 200, {
            ok: true,
            activeUser: machineState.activeUser,
            allowSpectators: machineState.allowSpectators,
            isPaused: machineState.isPaused,
            remainingSeconds,
            isExpiringSoon,
            queue: machineState.queue,
            currentBalance: machineState.currentMachineBalance,
            lastSpin: machineState.lastSpin,
            totalUsersCount: Object.keys(users).length
        });
    }

    // 4. RECLAMAR TURNO (Cuando la máquina está libre)
    if (pathname === '/api/machine/claim-turn' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const username = (body.username || '').trim();
        const allowSpectators = body.allowSpectators === true;
        const userKey = username.toLowerCase();

        if (!users[userKey]) {
            return sendJSON(res, 400, { ok: false, error: 'Usuario no válido.' });
        }

        if (machineState.activeUser && machineState.activeUser.toLowerCase() !== userKey) {
            return sendJSON(res, 400, { 
                ok: false, 
                error: `La máquina está ocupada por ${machineState.activeUser}. Puedes ponerte en la cola o mirar.` 
            });
        }

        const now = Date.now();
        machineState.activeUser = username;
        machineState.allowSpectators = allowSpectators;
        machineState.turnStartedAt = now;
        machineState.lastActivityAt = now;
        machineState.isPaused = false;
        machineState.pauseStartedAt = null;
        machineState.currentMachineBalance = users[userKey].credits || 0;
        
        // Si estaba en cola, quitarlo
        machineState.queue = machineState.queue.filter(u => u.toLowerCase() !== userKey);
        writeJSON(STATE_FILE, machineState);

        addLog(username, 'INICIO TURNO', machineState.currentMachineBalance, machineState.currentMachineBalance, `Inicia partida (${allowSpectators ? 'Permite espectadores' : 'Partida privada'})`);

        return sendJSON(res, 200, { 
            ok: true, 
            activeUser: username, 
            allowSpectators, 
            balance: machineState.currentMachineBalance 
        });
    }

    // 5. APUNTARSE O SALIR DE LA COLA
    if (pathname === '/api/machine/queue-join' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const username = (body.username || '').trim();
        const userKey = username.toLowerCase();

        if (!users[userKey]) {
            return sendJSON(res, 400, { ok: false, error: 'Usuario no válido.' });
        }

        if (machineState.activeUser && machineState.activeUser.toLowerCase() === userKey) {
            return sendJSON(res, 400, { ok: false, error: 'Ya estás jugando en la máquina.' });
        }

        if (!machineState.queue.some(u => u.toLowerCase() === userKey)) {
            machineState.queue.push(username);
            writeJSON(STATE_FILE, machineState);
        }

        const position = machineState.queue.findIndex(u => u.toLowerCase() === userKey) + 1;
        return sendJSON(res, 200, { ok: true, queue: machineState.queue, position });
    }

    if (pathname === '/api/machine/queue-leave' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const username = (body.username || '').trim();
        const userKey = username.toLowerCase();

        machineState.queue = machineState.queue.filter(u => u.toLowerCase() !== userKey);
        writeJSON(STATE_FILE, machineState);

        return sendJSON(res, 200, { ok: true, queue: machineState.queue });
    }

    // 6. PAUSA DE 5 MINUTOS (ESPERA / IR AL SERVICIO)
    if (pathname === '/api/machine/pause' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const username = (body.username || '').trim();
        const userKey = username.toLowerCase();

        if (!machineState.activeUser || machineState.activeUser.toLowerCase() !== userKey) {
            return sendJSON(res, 403, { ok: false, error: 'Solo el jugador activo puede pausar la máquina.' });
        }

        const now = Date.now();
        // Alternar pausa
        if (machineState.isPaused) {
            machineState.isPaused = false;
            machineState.pauseStartedAt = null;
            machineState.lastActivityAt = now;
            addLog(username, 'REANUDAR', machineState.currentMachineBalance, machineState.currentMachineBalance, 'Reanuda juego tras la pausa');
        } else {
            machineState.isPaused = true;
            machineState.pauseStartedAt = now;
            addLog(username, 'PAUSA (SERVICIO)', machineState.currentMachineBalance, machineState.currentMachineBalance, 'Pausa de hasta 5 min para ausentarse');
        }

        writeJSON(STATE_FILE, machineState);
        return sendJSON(res, 200, { ok: true, isPaused: machineState.isPaused });
    }

    // 7. RETIRAR / COBRAR / LIBERAR TURNO VOLUNTARIAMENTE (Guarda saldo en cuenta)
    if (pathname === '/api/machine/release-turn' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const username = (body.username || '').trim();
        const finalBalance = Number(body.currentBalance) || 0;
        const userKey = username.toLowerCase();

        if (machineState.activeUser && machineState.activeUser.toLowerCase() === userKey) {
            if (users[userKey]) {
                users[userKey].credits = finalBalance;
                users[userKey].lastSeen = new Date().toISOString();
                writeJSON(USERS_FILE, users);
            }

            addLog(username, 'DEJAR MÁQUINA', finalBalance, finalBalance, 'El jugador deja la máquina voluntariamente. Saldo guardado.');

            // Pasar al siguiente si hay cola
            const now = Date.now();
            if (machineState.queue && machineState.queue.length > 0) {
                const nextUser = machineState.queue.shift();
                const nextKey = nextUser.toLowerCase();
                machineState.activeUser = nextUser;
                machineState.allowSpectators = false;
                machineState.turnStartedAt = now;
                machineState.lastActivityAt = now;
                machineState.isPaused = false;
                machineState.pauseStartedAt = null;
                machineState.currentMachineBalance = users[nextKey] ? (users[nextKey].credits || 0) : 0;
            } else {
                machineState.activeUser = null;
                machineState.allowSpectators = false;
                machineState.turnStartedAt = null;
                machineState.lastActivityAt = null;
                machineState.isPaused = false;
                machineState.pauseStartedAt = null;
                machineState.currentMachineBalance = 0;
            }

            writeJSON(STATE_FILE, machineState);
        }

        return sendJSON(res, 200, { ok: true, message: 'Saldo guardado y máquina liberada.' });
    }

    // 8. SINCRONIZAR TIRADA / HEARTBEAT DEL JUGADOR ACTIVO
    if (pathname === '/api/machine/sync-spin' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const username = (body.username || '').trim();
        const userKey = username.toLowerCase();

        if (machineState.activeUser && machineState.activeUser.toLowerCase() === userKey) {
            machineState.lastActivityAt = Date.now();
            machineState.isPaused = false; // Tirar cancela cualquier pausa
            machineState.pauseStartedAt = null;
            if (typeof body.currentBalance === 'number') {
                machineState.currentMachineBalance = body.currentBalance;
                if (users[userKey]) {
                    users[userKey].credits = body.currentBalance;
                    writeJSON(USERS_FILE, users);
                }
            }
            if (body.spinData) {
                machineState.lastSpin = {
                    timestamp: Date.now(),
                    grid: body.spinData.grid,
                    winAmount: body.spinData.winAmount,
                    winningLines: body.spinData.winningLines,
                    isBonus: body.spinData.isBonus,
                    isFreeSpins: body.spinData.isFreeSpins
                };
            }
            writeJSON(STATE_FILE, machineState);
        }

        return sendJSON(res, 200, { ok: true });
    }

    // 9. PANEL DE ADMINISTRADOR: AUTENTICACIÓN
    if (pathname === '/api/admin/auth' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (isValidAdminPassword(body.password)) {
            return sendJSON(res, 200, { ok: true, authorized: true });
        }
        return sendJSON(res, 401, { ok: false, error: 'Contraseña de administrador incorrecta.' });
    }

    // 10. PANEL DE ADMINISTRADOR: OBTENER DATOS (Usuarios, Logs, Máquina)
    if (pathname === '/api/admin/data' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!isValidAdminPassword(body.password)) {
            return sendJSON(res, 401, { ok: false, error: 'No autorizado.' });
        }

        return sendJSON(res, 200, {
            ok: true,
            users: Object.values(users),
            logs: logs.slice(0, 150),
            machineState
        });
    }

    // 11. PANEL DE ADMINISTRADOR: RECARGAR CRÉDITOS A UN AMIGO
    if (pathname === '/api/admin/recharge' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!isValidAdminPassword(body.password)) {
            return sendJSON(res, 401, { ok: false, error: 'No autorizado.' });
        }

        const username = (body.username || '').trim();
        const amount = Number(body.amount) || 0;
        const userKey = username.toLowerCase();

        if (!users[userKey]) {
            return sendJSON(res, 404, { ok: false, error: 'Usuario no encontrado.' });
        }
        if (amount <= 0) {
            return sendJSON(res, 400, { ok: false, error: 'El importe debe ser mayor a 0.' });
        }

        users[userKey].credits = (users[userKey].credits || 0) + amount;
        writeJSON(USERS_FILE, users);

        // Si es el usuario que está jugando ahora mismo, actualizar saldo de la máquina
        if (machineState.activeUser && machineState.activeUser.toLowerCase() === userKey) {
            machineState.currentMachineBalance = users[userKey].credits;
            writeJSON(STATE_FILE, machineState);
        }

        addLog(users[userKey].username, 'RECARGA ADMIN', amount, users[userKey].credits, `Recarga autorizada de +${amount} Créditos`);

        return sendJSON(res, 200, { ok: true, user: users[userKey] });
    }

    // 12. PANEL DE ADMINISTRADOR: COBRAR Y PONER A CERO A UN AMIGO
    if (pathname === '/api/admin/cashout' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!isValidAdminPassword(body.password)) {
            return sendJSON(res, 401, { ok: false, error: 'No autorizado.' });
        }

        const username = (body.username || '').trim();
        const userKey = username.toLowerCase();

        if (!users[userKey]) {
            return sendJSON(res, 404, { ok: false, error: 'Usuario no encontrado.' });
        }

        const prevCredits = users[userKey].credits || 0;
        users[userKey].credits = 0;
        users[userKey].bank = 0;
        users[userKey].points = 0;
        writeJSON(USERS_FILE, users);

        if (machineState.activeUser && machineState.activeUser.toLowerCase() === userKey) {
            machineState.currentMachineBalance = 0;
            writeJSON(STATE_FILE, machineState);
        }

        addLog(users[userKey].username, 'COBRO ADMIN', prevCredits, 0, `Cobro / Puesta a cero de ${prevCredits} Créditos`);

        return sendJSON(res, 200, { ok: true, user: users[userKey], cashedOut: prevCredits });
    }

    // 13. PANEL DE ADMINISTRADOR: FORZAR LIBERACIÓN DE MÁQUINA
    if (pathname === '/api/admin/force-release' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!isValidAdminPassword(body.password)) {
            return sendJSON(res, 401, { ok: false, error: 'No autorizado.' });
        }

        const prevActive = machineState.activeUser;
        if (prevActive) {
            const uKey = prevActive.toLowerCase();
            if (users[uKey]) {
                users[uKey].credits = Number(machineState.currentMachineBalance) || 0;
                writeJSON(USERS_FILE, users);
            }
            addLog(prevActive, 'LIBERACIÓN FORZOSA', machineState.currentMachineBalance, machineState.currentMachineBalance, 'Liberación forzosa por Administrador');
        }

        machineState.activeUser = null;
        machineState.allowSpectators = false;
        machineState.turnStartedAt = null;
        machineState.lastActivityAt = null;
        machineState.isPaused = false;
        machineState.pauseStartedAt = null;
        machineState.currentMachineBalance = 0;
        writeJSON(STATE_FILE, machineState);

        return sendJSON(res, 200, { ok: true, message: 'Máquina liberada correctamente.' });
    }

    // 14. PANEL DE ADMINISTRADOR: CAMBIAR / RESETEAR PIN DE CUALQUIER AMIGO
    if (pathname === '/api/admin/change-pin' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!isValidAdminPassword(body.password)) {
            return sendJSON(res, 401, { ok: false, error: 'No autorizado.' });
        }

        const username = (body.username || '').trim();
        const newPin = (body.newPin || '').trim();
        const userKey = username.toLowerCase();

        if (!users[userKey]) {
            return sendJSON(res, 404, { ok: false, error: 'Usuario no encontrado.' });
        }
        if (!newPin || newPin.length < 1) {
            return sendJSON(res, 400, { ok: false, error: 'El PIN no puede estar vacío.' });
        }

        users[userKey].pin = newPin;
        writeJSON(USERS_FILE, users);
        addLog(users[userKey].username, 'CAMBIO PIN ADMIN', 0, users[userKey].credits, `PIN de ${users[userKey].username} actualizado a ${newPin} por Administrador`);

        return sendJSON(res, 200, { ok: true, message: `PIN de ${users[userKey].username} actualizado a ${newPin}`, pin: newPin });
    }

    // ==========================================
    // SERVIDO DE ARCHIVOS ESTÁTICOS
    // ==========================================
    let reqUrl = pathname;
    if (reqUrl === '/') reqUrl = '/index.html';
    const filePath = path.join(__dirname, reqUrl);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Archivo no encontrado');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
});

async function startServer() {
  const MONGODB_URI = "mongodb+srv://rvacarmo_db_user:utJH79FOYsvsFo2t@recreativa.fukrjf6.mongodb.net/?appName=Recreativa";
  let db = null;
  if (MONGODB_URI) {
    try {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      db = client.db('recreativa_db');
      console.log('Conectado a MongoDB');
      
      const remoteState = await db.collection('state').findOne({ _id: 'state' });
      if (remoteState) machineState = remoteState; else machineState = readJSON(STATE_FILE, machineState);
      
      const remoteUsers = await db.collection('users').findOne({ _id: 'users' });
      if (remoteUsers) users = remoteUsers; else users = readJSON(USERS_FILE, users);
      
      const remoteLogs = await db.collection('logs').findOne({ _id: 'logs' });
      if (remoteLogs) logs = remoteLogs.data || []; else logs = readJSON(LOGS_FILE, logs);
      
      // Sobrescribir writeJSON para que sincronice tambin con Mongo en segundo plano
      const originalWrite = writeJSON;
      writeJSON = function(file, data) {
        originalWrite(file, data);
        if (db) {
           if (file === STATE_FILE) db.collection('state').updateOne({ _id: 'state' }, { $set: data }, { upsert: true }).catch(console.error);
           if (file === USERS_FILE) db.collection('users').updateOne({ _id: 'users' }, { $set: data }, { upsert: true }).catch(console.error);
           if (file === LOGS_FILE) db.collection('logs').updateOne({ _id: 'logs' }, { $set: { data } }, { upsert: true }).catch(console.error);
        }
      };
    } catch(e) { console.error('Error MongoDB:', e); }
  } else {
    machineState = readJSON(STATE_FILE, machineState);
    users = readJSON(USERS_FILE, users);
    logs = readJSON(LOGS_FILE, logs);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`RECREATIVA ENTRE AMIGOS - SERVIDOR RECREATIVO ONLINE`);
    console.log(`Puerto: ${PORT} | Clave Admin: ${ADMIN_PASSWORD}`);
    console.log(`Acceso Local: http://localhost:${PORT}/`);
    console.log(`=======================================================`);
});

} startServer();
