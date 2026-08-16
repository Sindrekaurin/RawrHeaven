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
    socket.emit('joystick', { x: 0, y: 0 });
});

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