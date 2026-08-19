import {
    initAttackState,
    requestAttack,
    tryStartAttack,
    updateAttack,
    drawAttackHitbox
} from './attack/main.js';

// --- Hent gameId fra URL: /screen/{gameId} ---
const pathParts = window.location.pathname.split('/').filter(Boolean);
const gameId = pathParts[1] || 'default';

const socket = io();
socket.emit('join-screen', { gameId });

document.getElementById('game-id').textContent = gameId.toUpperCase();

const joinUrl = `${window.location.origin}/join/${gameId}`;
if (typeof QRCode !== 'undefined') {
    QRCode.toCanvas(document.getElementById('qr-code'), joinUrl, { width: 160 }, (err) => {
        if (err) console.error(err);
    });
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


// x = 0 for første hopp, 1 for andre (dobbelthopp), 2 for tredje, osv.
function getJumpForce(x) {
    const multiplier = Math.max(
        JUMP_MIN_MULTIPLIER,
        1 - JUMP_DECAY_STRENGTH * Math.pow(x, JUMP_DECAY_EXPONENT)
    );
    return JUMP_FORCE * multiplier;
}

function updateCamera() {
    const sprites = Object.values(players).map(p => p.sprite).filter(Boolean);
    if (sprites.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    sprites.forEach(s => {
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);
    });

    const PADDING = 250;
    const MIN_ZOOM = 0.6;
    const MAX_ZOOM = 1.4;

    const width = Math.max(maxX - minX + PADDING * 2, 200);
    const height = Math.max(maxY - minY + PADDING * 2, 200);

    const canvasWidth = scene.sys.game.config.width;
    const canvasHeight = scene.sys.game.config.height;

    let zoom = Math.min(canvasWidth / width, canvasHeight / height);
    zoom = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);

    const camera = scene.cameras.main;
    const targetZoom = Phaser.Math.Clamp(
        Math.min(canvasWidth / mapData.width, canvasHeight / mapData.height, zoom),
        MIN_ZOOM, MAX_ZOOM
    );

    //camera.zoom = Math.round(Phaser.Math.Linear(camera.zoom, targetZoom, 0.05) * 100) / 100;
    camera.zoom = Phaser.Math.Linear(camera.zoom, targetZoom, 0.05);
    

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newX = Phaser.Math.Linear(camera.midPoint.x, centerX, 0.08);
    const newY = Phaser.Math.Linear(camera.midPoint.y, centerY, 0.08);
    //camera.centerOn(Math.round(newX), Math.round(newY));
    camera.centerOn(newX, newY);
}

function checkVoidDeath(p) {
    const { x, y } = p.sprite;
    const outOfBounds =
        y > mapData.height + DEATH_ZONE_PADDING ||
        x < -DEATH_ZONE_PADDING ||
        x > mapData.width + DEATH_ZONE_PADDING;

    if (outOfBounds) {
        p.lives = Math.max(0, p.lives - 1);

        if (p.lives <= 0) {
            // valgfritt: håndter game over / eliminert
            respawnPlayer(p, true);
        } else {
            respawnPlayer(p, false);
        }
    }
}

function respawnPlayer(p, eliminated) {
    const spawnIndex = Object.values(players).indexOf(p) % scene.spawnPoints.length;
    const spawn = scene.spawnPoints[spawnIndex];

    p.sprite.setPosition(spawn.x, spawn.y);
    p.sprite.body.setVelocity(0, 0);
    p.jumpsUsed = 0;
    p.stamina = STAMINA_MAX;

    // sync med kontroller umiddelbart
    socket.emit('player-state', {
        targetId: Object.keys(players).find(id => players[id] === p),
        stamina: p.stamina,
        maxStamina: STAMINA_MAX,
        lives: p.lives,
        maxLives: MAX_LIVES
    });

    if (eliminated) {
        // f.eks. deaktiver spilleren, vis "eliminated" på skjerm, osv.
        console.log(`${p.username} er eliminert`);
    }
}

// --- Stall/usynlig-vegg-detektor ---
function detectStall(p, id) {
    const vx = p.sprite.body.velocity.x;
    const wantsToMove = Math.abs(p.inputX || 0) > 0.1;
    const expectedVx = (p.inputX || 0) * 300;

    // Stort avvik mellom det vi BER om og det som faktisk skjer
    const stalled = wantsToMove && Math.abs(vx - expectedVx) > 50;

    if (stalled) {
        if (!p.stallStart) {
            p.stallStart = performance.now();
            console.warn(`[STALL START] ${p.username}`, {
                x: p.sprite.x.toFixed(1),
                y: p.sprite.y.toFixed(1),
                inputX: p.inputX,
                velocityX: vx.toFixed(1),
                expectedVx,
                blocked: { ...p.sprite.body.blocked },
                touching: { ...p.sprite.body.touching },
                grounded: p.sprite.body.blocked.down || p.sprite.body.touching.down,
                embedded: p.sprite.body.embedded,
                overlapX: p.sprite.body.overlapX,
                overlapY: p.sprite.body.overlapY
            });
        }
    } else if (p.stallStart) {
        const duration = performance.now() - p.stallStart;
        console.warn(`[STALL END] ${p.username} varte i ${duration.toFixed(0)}ms`);
        p.stallStart = null;
    }
}

function findOverlappingPlatforms(platformsData) {
    for (let i = 0; i < platformsData.length; i++) {
        for (let j = i + 1; j < platformsData.length; j++) {
            const a = platformsData[i];
            const b = platformsData[j];

            const aTop = a.y - a.height / 2;
            const aBottom = a.y + a.height / 2;
            const aLeft = a.x - a.width / 2;
            const aRight = a.x + a.width / 2;

            const bTop = b.y - b.height / 2;
            const bBottom = b.y + b.height / 2;
            const bLeft = b.x - b.width / 2;
            const bRight = b.x + b.width / 2;

            const overlapX = aLeft < bRight && aRight > bLeft;
            const overlapY = aTop < bBottom && aBottom > bTop;

            if (overlapX && overlapY) {
                console.warn('Overlappende plattformer funnet:', a, b);
            }
        }
    }
}

// --- Karakter- og kart-valg ---
// Nå: hardkodede konstanter. Senere: byttes ut med URL search params, f.eks.
// const params = new URLSearchParams(window.location.search);
// const CHARACTER_KEY = params.get('character') || 'kriger';
// const MAP_KEY = params.get('map') || 'arena_01';
const CHARACTER_KEY = 'kriger';

const MAP_KEY = 'arena_01';
const VOID_MARGIN  = 500

const JUMP_DECAY_STRENGTH = 0.35; // hvor mye kraften reduseres per hopp (k)
const JUMP_DECAY_EXPONENT = 2;    // graden på polynomet (n) — høyere = brattere fall etter hvert
const JUMP_MIN_MULTIPLIER = 0.4;  // gulv, så kraften aldri blir null/negativ
const JUMP_FORCE = -500; // negativ verdi for å hoppe oppover (Phaser bruker y-akse nedover)
const MAX_JUMPS = 999; // maks antall hopp (inkludert første hopp)
const STAMINA_MAX = 100; // maks stamina, som brukes til ekstra hopp
const DOUBLE_JUMP_COST = 35;       // kun ekstra hopp koster - første hopp er alltid gratis
const STAMINA_REGEN_GROUNDED = 40; // per sekund, mens spilleren står på bakken
const STAMINA_REGEN_AIRBORNE = 10; // per sekund, mens i luften (litt regen selv da)
const PLAYER_BODY_SPEED = 300; // Hastighet for karakter bevegelse

const MAX_LIVES = 3;
const STATE_SYNC_INTERVAL = 150; // ms mellom hver oppdatering sendt til kontrollere
const DEATH_ZONE_PADDING = 200; // hvor langt utenfor kartet man må være for å "dø"



// --- Phaser-oppsett ---
const DEV_MODE = true; // sett til false før du deler/publiserer

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1280,
    height: 720,
    backgroundColor: '#1a1a2e',

    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 700 },
            debug: DEV_MODE, // viser hitboxes, velocity-vektorer, kollisjonsbokser
            overlapBias: 8,
        }
    },

    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },

    render: {
        pixelArt: true,
        roundPixels: true,
        antialias: false
    },

    // Skjuler Phaser sin konsoll-banner ("Phaser v3.x...")
    banner: DEV_MODE,

    // Viser FPS-teller og annen diagnostikk i canvas (nyttig for perf-sjekk)
    fps: {
        min: 10,
        target: 60,
        forceSetTimeOut: false
    },

    // Logger advarsler hvis noe går feil med assets/webgl
    disableContextMenu: true, // høyreklikk blir ikke nettleser-menyen (nyttig for touch-kontroller)

    scene: { preload, create, update }
};

const game = new Phaser.Game(config);
let scene;
let platforms;
let mapData;

function preload() {
    this.load.atlas(CHARACTER_KEY, `/screen/sprites/${CHARACTER_KEY}.png`, `/screen/sprites/${CHARACTER_KEY}.json`);
    this.load.json('map', `/screen/maps/${MAP_KEY}.json`);
}


async function generateQrCode() {
    const gameId = window.location.pathname.split('/').pop();
    const siteLink = DEV_MODE ? `http://192.168.0.198:3000/join/${gameId}` : `https://game.grefur.com/join/${gameId}`

    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(siteLink)}`;

    try {
        const resp = await fetch(apiUrl);

        if (!resp.ok) {
            throw new Error(`QR code request failed: ${resp.status}`);
        }

        const blob = await resp.blob();
        return URL.createObjectURL(blob);

    } catch (error) {
        console.error('Failed to generate QR code:', error);
        return null;
    }
}


// --- Bygg alle animasjoner automatisk fra rammenavn ---
function buildAnimationsFromAtlas(key) {
    const frameNames = scene.textures.get(key).getFrameNames();
    const groups = {};

    frameNames.forEach(name => {
        const match = name.match(/^(.+)_(\d+)$/);
        if (!match) {
            console.warn(`Rammenavn "${name}" matcher ikke mønsteret {tilstand}_{retning}_{nummer} — hoppes over`);
            return;
        }
        const groupKey = match[1];
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(name);
    });

    Object.entries(groups).forEach(([groupKey, frames]) => {
        frames.sort();
        const animKey = `${key}-${groupKey}`;
        if (scene.anims.exists(animKey)) return;

        scene.anims.create({
            key: animKey,
            frames: frames.map(frame => ({ key, frame })),
            frameRate:  groupKey.startsWith('idle') ? 3 :
                        groupKey.startsWith('walk') ? 10 :
                        8,
            repeat: -1
        });
    });

    return Object.keys(groups);
}

let availableAnimGroups = [];

function create() {
    scene = this;

    availableAnimGroups = buildAnimationsFromAtlas(CHARACTER_KEY);

    // --- Bygg banen fra det kompilerte kartet ---
    mapData = this.cache.json.get('map');
    findOverlappingPlatforms(mapData.platforms);
    console.log("FindOverLappingPlatforms ran..")

    if (!mapData) {
        console.error(`Kunne ikke laste kart "${MAP_KEY}" — sjekk at /screen/maps/${MAP_KEY}.json finnes`);
        return;
    }

    platforms = this.physics.add.staticGroup();

    mapData.platforms.forEach(p => {
        const colorInt = p.color && p.color !== 'transparent'
            ? Phaser.Display.Color.HexStringToColor(p.color).color
            : 0x333344;

        const rect = this.add.rectangle(p.x, p.y, p.width, p.height, colorInt);
        this.physics.add.existing(rect, true);
        rect.body.checkCollision.left = false;
        rect.body.checkCollision.right = false;
        // behold bare top/bottom kollisjon - unngår at spilleren "fanges" på vertikale sømmer
        platforms.add(rect);
    });

    scene.spawnPoints = mapData.spawnPoints && mapData.spawnPoints.length > 0
        ? mapData.spawnPoints
        : [{ x: 150, y: 100 }]; // fallback hvis kartet mangler spawn-punkter

    // --- Tilpass kamera til faktisk kartstørrelse ---
    const canvasWidth = this.sys.game.config.width;
    const canvasHeight = this.sys.game.config.height;

    const zoomX = canvasWidth / mapData.width;
    const zoomY = canvasHeight / mapData.height;
    const zoom = Math.min(zoomX, zoomY); // bevar proporsjoner, ingen forvrengning

    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(mapData.width / 2, mapData.height / 2);

    this.physics.world.setBounds(0, -VOID_MARGIN, mapData.width, mapData.height + VOID_MARGIN);

    if (DEV_MODE) {
        scene.add.text(10, 10, '', { fontSize: '16px', fill: '#0f0' })
            .setDepth(9999)
            .setScrollFactor(0)
            .name = 'fpsText';
    }
}

// --- Avgjør hvilken animasjon en spiller skal spille akkurat nå ---
function resolveAnimState(p) {
    const airborne =
        !p.sprite.body.blocked.down &&
        !p.sprite.body.touching.down;

    const walking = Math.abs(p.inputX || 0) > 0.1;

    let state;

    if (p.attacking) state = 'attack_a';
    else if (airborne) state = 'jump';
    else if (p.crouching) state = 'crouch';
    else if (walking) state = 'walk';
    else state = 'idle';

    return `${state}_${p.facing}`;
}



function update(time, delta) {
    const dt = delta / 1000; // sekunder siden forrige frame

    for (const id in players) {
        const p = players[id];

        if (!p.sprite) continue;

        tryStartAttack(
            p, time, CHARACTER_KEY, scene
        );

        updateAttack(
            p, time, players, scene
        );

        drawAttackHitbox(
            p, scene, time
        );

        
        p.sprite.body.setVelocityX((p.inputX) * PLAYER_BODY_SPEED);

        detectStall(p, id);

        const grounded = p.sprite.body.blocked.down || p.sprite.body.touching.down;
        if (grounded) {
            p.jumpsUsed = 0;
        }

        // --- Stamina-regenerering ---
        const regenRate = grounded ? STAMINA_REGEN_GROUNDED : STAMINA_REGEN_AIRBORNE;
        p.stamina = Math.min(STAMINA_MAX, p.stamina + regenRate * dt);

        // --- Oppdater stamina-bar posisjon og fyllingsgrad ---
        p.barBg.setPosition(p.sprite.x, p.sprite.y - 50);
        p.barFill.setPosition(p.sprite.x, p.sprite.y - 50);
        const fillRatio = p.stamina / STAMINA_MAX;
        p.barFill.width = 50 * fillRatio;
        p.barFill.x = p.sprite.x - (50 * (1 - fillRatio)) / 2; // krymp fra høyre side

        // Fargekode: gul normalt, rødt når lavt
        p.barFill.setFillStyle(fillRatio < 0.3 ? 0xe74c3c : 0xf1c40f);

        if (p.inputX < -0.1) p.facing = 'left';
        else if (p.inputX > 0.1) p.facing = 'right';

        p.crouching = p.inputY < -0.5;

        const animGroup = resolveAnimState(p);
        const animKey = `${CHARACTER_KEY}-${animGroup}`;

        if (scene.anims.exists(animKey)) {
            if (p.sprite.anims.currentAnim?.key !== animKey) {
                p.sprite.play(animKey);
            }
        } else if (availableAnimGroups.length > 0) {
            const fallbackKey = `${CHARACTER_KEY}-idle_${p.facing}`;
            if (scene.anims.exists(fallbackKey) && p.sprite.anims.currentAnim?.key !== fallbackKey) {
                p.sprite.play(fallbackKey);
            }
        }

        // --- Send stamina/liv til kontrolleren (throttlet, ikke hver frame) ---
        p.lastStateSync = (p.lastStateSync || 0) + delta;
        if (p.lastStateSync >= STATE_SYNC_INTERVAL) {
            p.lastStateSync = 0;
            //console.log(`Sender state til ${p.username}: stamina=${p.stamina.toFixed(1)}, lives=${p.lives}`);
            socket.emit('player-state', {
                targetId: id,
                stamina: p.stamina,
                maxStamina: STAMINA_MAX,
                lives: p.lives,
                maxLives: MAX_LIVES
            });
        }
        checkVoidDeath(p);

        if (p.inputX !== 0) {
            //console.log('inputX:', p.inputX, 'velocityX:', p.sprite.body.velocity.x);
        }

        const angleDeg = Phaser.Math.RadToDeg(p.sprite.body.velocity.angle());
    
        if (p.lastAngle !== undefined) {
            let diff = Math.abs(angleDeg - p.lastAngle);
            if (diff > 180) diff = 360 - diff; // handle wraparound
            if (diff > 45) {
                console.warn(`[ANGLE JUMP] ${p.username} ${p.lastAngle.toFixed(1)}° -> ${angleDeg.toFixed(1)}°`, {
                    vx: p.sprite.body.velocity.x.toFixed(1),
                    vy: p.sprite.body.velocity.y.toFixed(1),
                    x: p.sprite.x.toFixed(1),
                    y: p.sprite.y.toFixed(1),
                    embedded: p.sprite.body.embedded,
                    overlapY: p.sprite.body.overlapY,
                    blocked: { ...p.sprite.body.blocked },
                    touching: { ...p.sprite.body.touching }
                });
            }
        }
        p.lastAngle = angleDeg;
    }

    if (DEV_MODE) {
        const fpsText = scene.children.getByName('fpsText');
        if (fpsText) fpsText.setText(`FPS: ${Math.round(game.loop.actualFps)}`);
    }

    updateCamera()

    
    
    
}

function spawnPlayer(id, username) {
    const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
    colorIndex++;

    const spawnIndex = Object.keys(players).length % scene.spawnPoints.length;
    const spawn = scene.spawnPoints[spawnIndex];

    const sprite = scene.add.sprite(spawn.x, spawn.y, CHARACTER_KEY);

    scene.physics.add.existing(sprite);
    sprite.body.setCollideWorldBounds(false);
    sprite.body.setBounce(0.1);
    sprite.body.setSize(sprite.width * 0.6, sprite.height * 0.9);
    scene.physics.add.collider(sprite, platforms);
    sprite.body.setMaxVelocity(600, 1000);

    // Stamina-bar: bakgrunn (mørk) + fyll (lys), tegnet over spilleren
    const barBg = scene.add.rectangle(spawn.x, spawn.y - 50, 50, 6, 0x1a1a1a).setOrigin(0.5);
    const barFill = scene.add.rectangle(spawn.x, spawn.y - 50, 50, 6, 0xf1c40f).setOrigin(0.5);

    // Spllerdata lagres i players-objektet, med socket.id som nøkkel
    players[id] = {
        username,
        color,
        sprite,

        inputX: pendingInput[id]?.x ?? 0,
        inputY: pendingInput[id]?.y ?? 0,

        facing: 'right',
        crouching: false,

        jumpsUsed: 0,
        stamina: STAMINA_MAX,

        barBg,
        barFill,

        lives: MAX_LIVES,

        attackRequested: false,
        attacking: false,
        lastAttackTime: 0,
        attackCooldown: 500,

        lastStateSync: 0
    };

    //initAttackState(players[id]);

    const initialAnim = `${CHARACTER_KEY}-idle_right`;
    if (scene.anims.exists(initialAnim)) {
        sprite.play(initialAnim);
    }

    updatePlayerList();
}

function removePlayer(id) {
    if (players[id]) {
        players[id].sprite.destroy();
        players[id].barBg.destroy();
        players[id].barFill.destroy();
        delete players[id];
        updatePlayerList();
    }
}
socket.on('player-joined', ({ id, username }) => {
    if (!players[id]) spawnPlayer(id, username);
});

socket.on('player-left', ({ id }) => {
    removePlayer(id);
});

// Skjermen sender oppdatert state for én spiller, serveren videresender kun til den spilleren
socket.on('player-state', ({ targetId, stamina, lives, maxStamina, maxLives }) => {
    //console.log(`Mottok player-state for ${targetId}: stamina=${stamina}, lives=${lives}`);
    io.to(targetId).emit('player-state', { stamina, lives, maxStamina, maxLives });
});

const pendingInput = {}; // lagrer siste input for id-er som ikke er spawnet ennå
socket.on('joystick', ({ id, x, y }) => {
    const p = players[id];
    if (!p) {
        pendingInput[id] = { x, y };
        return;
    }
    p.inputX = x;
    p.inputY = y;
    p.lastInputTime = Date.now();
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
        const isExtraJump = p.jumpsUsed >= 1;

        if (p.jumpsUsed < MAX_JUMPS) {
            if (
                isExtraJump &&
                p.stamina < DOUBLE_JUMP_COST
            ) {
                return;
            }

            const force = getJumpForce(p.jumpsUsed);

            p.sprite.body.setVelocityY(force);
            p.jumpsUsed++;

            if (isExtraJump) {
                p.stamina -= DOUBLE_JUMP_COST;
            }
        }
    }

    if (button === 'B' && pressed) {
        //requestAttack(p);
    }
});

const qrCode = document.getElementById('qr-code');

const qrUrl = await generateQrCode();

if (qrUrl) {
    qrCode.innerHTML = `<img src="${qrUrl}" alt="QR code">`;
}