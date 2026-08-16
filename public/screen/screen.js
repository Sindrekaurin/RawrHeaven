// --- Hent gameId fra URL: /screen/{gameId} ---
const pathParts = window.location.pathname.split('/').filter(Boolean);
const gameId = pathParts[1] || 'default';

const socket = io();
socket.emit('join-screen', { gameId });

// --- Vis Game ID ---
document.getElementById('game-id').textContent = gameId.toUpperCase();

// --- QR-kode for å bli med ---
const joinUrl = `${window.location.origin}/join/${gameId}`;
if (typeof QRCode !== 'undefined') {
    QRCode.toCanvas(document.getElementById('qr-code'), joinUrl, { width: 160 }, (err) => {
        if (err) console.error(err);
    });
} else {
    console.warn('QRCode-biblioteket lastet ikke — hopper over QR-generering');
}

document.getElementById('join-url').textContent = joinUrl;

// --- Spillertilstand ---
const players = {};
const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22];
let colorIndex = 0;

function colorToHex(colorInt) {
    return '#' + colorInt.toString(16).padStart(6, '0');
}

function updatePlayerList() {
    const list = document.getElementById('player-list');
    list.innerHTML = Object.values(players)
        .map(p => `
            <div class="player-entry">
                <span class="player-color-dot" style="background:${colorToHex(p.color)}"></span>
                <span>${p.username}</span>
            </div>
        `)
        .join('');
}

// --- Phaser-oppsett ---
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1280,
    height: 720,
    backgroundColor: '#1a1a2e',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 900 }, debug: false }
    },
    scene: { create, update }
};

const game = new Phaser.Game(config);
let scene;
let platforms;

function create() {
    scene = this;

    platforms = this.physics.add.staticGroup();

    // Bakke
    const ground = this.add.rectangle(640, 700, 1280, 40, 0x333344);
    this.physics.add.existing(ground, true);
    platforms.add(ground);

    // En flytende plattform
    const plat = this.add.rectangle(300, 500, 300, 24, 0x333344);
    this.physics.add.existing(plat, true);
    platforms.add(plat);
}

function update() {
    for (const id in players) {
        const p = players[id];
        if (!p.sprite) continue;

        const speed = 300;
        p.sprite.body.setVelocityX((p.inputX || 0) * speed);

        if (p.attacking) {
            p.sprite.setFillStyle(0xffffff);
        } else {
            p.sprite.setFillStyle(p.color);
        }
    }
}

function spawnPlayer(id, username) {
    const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
    colorIndex++;

    const startX = 150 + Object.keys(players).length * 120;
    const sprite = scene.add.rectangle(startX, 100, 50, 70, color);
    scene.physics.add.existing(sprite);
    sprite.body.setCollideWorldBounds(true);
    sprite.body.setBounce(0.1);
    scene.physics.add.collider(sprite, platforms);

    players[id] = { username, color, sprite, inputX: 0, inputY: 0, attacking: false };
    updatePlayerList();
}

function removePlayer(id) {
    if (players[id]) {
        players[id].sprite.destroy();
        delete players[id];
        updatePlayerList();
    }
}

socket.on('player-joined', ({ id, username }) => {
    console.log('Spiller ble med:', id, username);
    if (!players[id]) spawnPlayer(id, username);
});

socket.on('player-left', ({ id }) => {
    removePlayer(id);
});

socket.on('joystick', ({ id, x, y }) => {
    const p = players[id];
    if (!p) return;
    p.inputX = x;
    p.inputY = y;
});

socket.on('existing-players', (existingPlayers) => {
    for (const [id, username] of Object.entries(existingPlayers)) {
        if (!players[id]) spawnPlayer(id, username);
    }
});

socket.on('button', ({ id, button, pressed }) => {
    const p = players[id];
    if (!p) return;
    if (button === 'A' && pressed) {
        if (p.sprite.body.blocked.down || p.sprite.body.touching.down) {
            p.sprite.body.setVelocityY(-500);
        }
    }
    if (button === 'B') {
        p.attacking = pressed;
    }
});