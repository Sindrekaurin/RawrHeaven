const pathParts = window.location.pathname.split('/').filter(Boolean);
const gameId = pathParts[1];
const username = decodeURIComponent(pathParts[2]);

const socket = io();

const statusEl = document.getElementById('status');
const joystickZone = document.getElementById('joystick-zone');
const fnSwitch = document.getElementById('function-switch');

const staminaFill = document.getElementById('stamina-bar-fill');
const damageValue = document.getElementById('damage-value');
const damageFill = document.getElementById('damage-bar-fill');

const heartElements = document.querySelectorAll('#hearts-container svg');

const stunOverlay = document.createElement('div');
stunOverlay.id = 'stun-overlay';
stunOverlay.textContent = 'STUNNED';
document.body.appendChild(stunOverlay);

const knockbackOverlay = document.createElement('div');
knockbackOverlay.id = 'knockback-overlay';
document.body.appendChild(knockbackOverlay);


// ============================================================
// SOCKET
// ============================================================

socket.on('connect', () => {
    socket.emit('join', {
        gameId,
        username
    });

    statusEl.textContent = `${username} — tilkoblet`;
});

socket.on('disconnect', () => {
    statusEl.textContent = 'Frakoblet';
});


// ============================================================
// PLAYER STATE
// ============================================================

socket.on('player-state', (playerState) => {
    updateStamina(playerState.stamina, playerState.maxStamina);
    updateDamage(playerState.accumulatedDamage);
    updateLives(playerState.lives, playerState.maxLives);

    updateStun(playerState.isStunned);
    updateKnockback(playerState.knockedBack);
});


// ============================================================
// STAMINA
// ============================================================

function updateStamina(stamina, maxStamina) {
    if (!maxStamina || maxStamina <= 0) {
        staminaFill.style.width = '0%';
        return;
    }

    const ratio = Math.max(
        0,
        Math.min(1, stamina / maxStamina)
    );

    staminaFill.style.width = `${ratio * 100}%`;

    if (ratio > 0.5) {
        staminaFill.style.backgroundColor = '#2ecc71';
    } else if (ratio > 0.25) {
        staminaFill.style.backgroundColor = '#f1c40f';
    } else {
        staminaFill.style.backgroundColor = '#e74c3c';
    }
}


// ============================================================
// DAMAGE
// ============================================================

function updateDamage(damage) {
    const currentDamage = Math.max(
        0,
        Number(damage) || 0
    );

    const damageRatio = Math.max(
        0,
        Math.min(1, 1 - currentDamage / 500)
    );

    damageFill.style.width = `${damageRatio * 100}%`;

    damageValue.textContent = 1000 - Math.round(currentDamage);

    if (currentDamage < 100) {
        damageFill.style.backgroundColor = '#2ecc71';
    } else if (currentDamage < 200) {
        damageFill.style.backgroundColor = '#a8d83f';
    } else if (currentDamage < 300) {
        damageFill.style.backgroundColor = '#f1c40f';
    } else if (currentDamage < 400) {
        damageFill.style.backgroundColor = '#e67e22';
    } else {
        damageFill.style.backgroundColor = '#e74c3c';
    }
}


// ============================================================
// LIVES
// ============================================================

function updateLives(lives, maxLives) {
    const currentLives = Number(lives) || 0;
    const totalLives = Number(maxLives) || heartElements.length;

    heartElements.forEach((heart, index) => {
        if (index >= totalLives) {
            heart.style.display = 'none';
            return;
        }

        heart.style.display = '';

        if (index < currentLives) {
            heart.setAttribute('fill', '#3e6db0');
            heart.style.opacity = '1';
        } else {
            heart.setAttribute('fill', '#333');
            heart.style.opacity = '0.3';
        }
    });
}


// ============================================================
// STUN
// ============================================================

function updateStun(isStunned) {
    stunOverlay.classList.toggle(
        'active',
        Boolean(isStunned)
    );
}


// ============================================================
// KNOCKBACK
// ============================================================

let previousKnockedBack = false;

function updateKnockback(knockedBack) {
    const currentKnockedBack = Boolean(knockedBack);

    if (currentKnockedBack && !previousKnockedBack) {
        knockbackOverlay.classList.remove('active');

        // Restart CSS animation
        void knockbackOverlay.offsetWidth;

        knockbackOverlay.classList.add('active');
    }

    previousKnockedBack = currentKnockedBack;
}


// ============================================================
// JOYSTICK
// ============================================================

const joystick = nipplejs.create({
    zone: joystickZone,
    mode: 'static',
    position: {
        left: '50%',
        top: '50%'
    },
    color: 'white',
    size: 120
});

let joystickX = 0;
let joystickY = 0;

joystick.on('move', (evt, data) => {
    const angle = data.angle.radian;
    const force = Math.min(data.force, 1);

    joystickX = Math.cos(angle) * force;
    joystickY = -Math.sin(angle) * force;

    socket.emit('joystick', {
        gameId,
        username,
        x: joystickX,
        y: joystickY
    });
});

joystick.on('end', () => {
    joystickX = 0;
    joystickY = 0;

    socket.emit('joystick', {
        gameId,
        username,
        x: 0,
        y: 0
    });
});


// Send joystick state periodically
setInterval(() => {
    if (joystickX !== 0 || joystickY !== 0) {
        socket.emit('joystick', {
            gameId,
            username,
            x: joystickX,
            y: joystickY
        });
    }
}, 100);


// ============================================================
// BUTTONS
// ============================================================

function setupButton(elementId, buttonName) {
    const element = document.getElementById(elementId);

    element.addEventListener('touchstart', (event) => {
        event.preventDefault();

        socket.emit('button', {
            button: buttonName,
            pressed: true
        });
    }, {
        passive: false
    });

    element.addEventListener('touchend', (event) => {
        event.preventDefault();

        socket.emit('button', {
            button: buttonName,
            pressed: false
        });
    }, {
        passive: false
    });

    element.addEventListener('touchcancel', (event) => {
        event.preventDefault();

        socket.emit('button', {
            button: buttonName,
            pressed: false
        });
    }, {
        passive: false
    });
}

setupButton('btn-a', 'A');
setupButton('btn-b', 'B');


// ============================================================
// FUNCTION / SPECIAL BUTTON
// ============================================================

fnSwitch.addEventListener('touchstart', (event) => {
    event.preventDefault();

    fnSwitch.classList.add('active');

    socket.emit('button', {
        button: 'SPECIAL',
        pressed: true
    });
}, {
    passive: false
});

fnSwitch.addEventListener('touchend', (event) => {
    event.preventDefault();

    fnSwitch.classList.remove('active');

    socket.emit('button', {
        button: 'SPECIAL',
        pressed: false
    });
}, {
    passive: false
});

fnSwitch.addEventListener('touchcancel', (event) => {
    event.preventDefault();

    fnSwitch.classList.remove('active');

    socket.emit('button', {
        button: 'SPECIAL',
        pressed: false
    });
}, {
    passive: false
});


// ============================================================
// WASD
// ============================================================

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

let wasdActive = false;

function updateWasdJoystick() {
    let x = 0;
    let y = 0;

    if (keys.a) {
        x -= 1;
    }

    if (keys.d) {
        x += 1;
    }

    if (keys.w) {
        y -= 1;
    }

    if (keys.s) {
        y += 1;
    }

    const magnitude = Math.sqrt(
        x * x + y * y
    );

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

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd'
    ) {
        event.preventDefault();

        keys[key] = true;

        updateWasdJoystick();
    }

    if (event.code === 'Space') {
        event.preventDefault();

        socket.emit('button', {
            button: 'A',
            pressed: true
        });
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();

    if (
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd'
    ) {
        event.preventDefault();

        keys[key] = false;

        updateWasdJoystick();
    }

    if (event.code === 'Space') {
        event.preventDefault();

        socket.emit('button', {
            button: 'A',
            pressed: false
        });
    }
});


// ============================================================
// IOS ZOOM PREVENTION
// ============================================================

document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
});

document.addEventListener('gesturechange', (event) => {
    event.preventDefault();
});

document.addEventListener('gestureend', (event) => {
    event.preventDefault();
});