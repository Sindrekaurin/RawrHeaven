const pathParts = window.location.pathname.split('/').filter(Boolean);
const gameId = pathParts[1];
const username = decodeURIComponent(pathParts[2]);

const socket = io();
const statusEl = document.getElementById('status');

socket.on('connect', () => {
    socket.emit('join', { gameId, username });
    statusEl.textContent = `${username} — tilkoblet`;
});

socket.on('disconnect', () => {
    statusEl.textContent = 'Frakoblet';
});

// --- Joystick (venstre halvdel) ---
const joystickZone = document.getElementById('joystick-zone');

const joystick = nipplejs.create({
    zone: joystickZone,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 120
});

joystick.on('move', (evt, data) => {
    const angle = data.angle.radian;
    const force = Math.min(data.force, 1);
    socket.emit('joystick', {
        gameId, username,
        x: Math.cos(angle) * force,
        y: -Math.sin(angle) * force
    });
});

joystick.on('end', () => {
    socket.emit('joystick', {
        gameId,
        username,
        x: 0,
        y: 0
    });
});

setInterval(() => {
    if (joystick.get(0)) { // hvis joystick er aktiv
        const data = joystick.get(0).frontPosition; // eller lagre siste data fra 'move'
        // re-emit siste kjente verdi
    }
}, 300);

// --- Knapper A og B (høyre halvdel) ---
function setupButton(elementId, buttonName) {
    const el = document.getElementById(elementId);

    el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        socket.emit('button', { button: buttonName, pressed: true });
    });

    el.addEventListener('touchend', (e) => {
        e.preventDefault();
        socket.emit('button', { button: buttonName, pressed: false });
    });
}

setupButton('btn-a', 'A');
setupButton('btn-b', 'B');

// --- Funksjonsbryter (placeholder for volumknapp) ---
const fnSwitch = document.getElementById('function-switch');
let fnActive = false;

fnSwitch.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fnActive = !fnActive;
    fnSwitch.classList.toggle('active', fnActive);
    socket.emit('function-switch', { active: fnActive });
});

// Blokker double-tap-zoom
let lastTouchEnd = 0;
/*document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });*/

// Blokker gesture-basert zoom (pinch) på iOS Safari spesifikt
document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

socket.on('player-state', ({ stamina, maxStamina, lives, maxLives }) => {
    //console.log('Mottok player-state:', stamina, lives);

    // Stamina-bar
    const staminaFill = document.getElementById('stamina-bar-fill');
    const staminaRatio = stamina / maxStamina;
    staminaFill.style.width = `${staminaRatio * 100}%`;
    staminaFill.style.background = staminaRatio < 0.3 ? '#e74c3c' : '#f1c40f';

    // Hjerter
    const heartsContainer = document.getElementById('hearts-container');
    heartsContainer.innerHTML = '';
    for (let i = 0; i < maxLives; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i < lives ? ' filled' : '');
        heart.textContent = '♥';
        heartsContainer.appendChild(heart);
    }
});

// --- WASD keyboard controls ---
const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
};

let wasdActive = false;

function updateWasdJoystick() {
    let x = 0;
    let y = 0;

    if (keys.a) x -= 1;
    if (keys.d) x += 1;
    if (keys.w) y -= 1;
    if (keys.s) y += 1;

    const magnitude = Math.sqrt(x * x + y * y);

    if (magnitude > 0) {
        x /= magnitude;
        y /= magnitude;
        wasdActive = true;

        socket.emit('joystick', {
            gameId,
            username,
            x,
            y
        });
    } else if (wasdActive) {
        wasdActive = false;

        socket.emit('joystick', {
            gameId,
            username,
            x: 0,
            y: 0
        });
    }
}

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        e.preventDefault();

        keys[key] = true;
        updateWasdJoystick();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        e.preventDefault();

        keys[key] = false;
        updateWasdJoystick();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();

        socket.emit('button', {
            button: 'A',
            pressed: true
        });
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();

        socket.emit('button', {
            button: 'A',
            pressed: false
        });
    }
});