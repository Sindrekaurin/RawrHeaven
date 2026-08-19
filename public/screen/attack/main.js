const ATTACK_CONFIG = {
    cooldown: 500,
    duration: 250,

    damage: 20,

    hitboxWidth: 55,
    hitboxHeight: 45,

    hitboxOffsetX: 45,
    hitboxOffsetY: 0,

    knockbackX: 350,
    knockbackY: -250,

    hitStart: 75,
    hitEnd: 175
};


export function initAttackState(player) {
    player.attackRequested = false;
    player.attacking = false;

    player.attackStartTime = 0;
    player.lastAttackTime = -ATTACK_CONFIG.cooldown;

    player.attackHitTargets = new Set();
    player.attackCooldown = ATTACK_CONFIG.cooldown;

    player.attackDebugGraphics = null;
}


export function requestAttack(player) {
    player.attackRequested = true;
}


export function tryStartAttack(player, time, characterKey, scene) {
    if (!player.attackRequested) {
        return false;
    }

    player.attackRequested = false;

    if (player.attacking) {
        return false;
    }

    if (time - player.lastAttackTime < player.attackCooldown) {
        return false;
    }

    startAttack(
        player,
        time,
        characterKey,
        scene
    );

    return true;
}


function startAttack(player, time, characterKey, scene) {
    player.attacking = true;
    player.attackStartTime = time;
    player.lastAttackTime = time;

    player.attackHitTargets.clear();

    player.sprite.body.setVelocityX(0);

    playAttackAnimation(
        player,
        characterKey,
        scene
    );
}


function playAttackAnimation(player, characterKey, scene) {
    const animGroup = `attack_a_${player.facing}`;
    const animKey = `${characterKey}-${animGroup}`;

    if (scene.anims.exists(animKey)) {
        player.sprite.play(animKey, true);
    }
}


export function updateAttack(
    player,
    time,
    players,
    scene
) {
    if (!player.attacking) {
        return;
    }

    const elapsed =
        time - player.attackStartTime;

    if (elapsed >= ATTACK_CONFIG.duration) {
        endAttack(player);
        return;
    }

    if (
        elapsed >= ATTACK_CONFIG.hitStart &&
        elapsed <= ATTACK_CONFIG.hitEnd
    ) {
        processAttackHits(
            player,
            players
        );
    }
}


function endAttack(player) {
    player.attacking = false;

    if (player.attackDebugGraphics) {
        player.attackDebugGraphics.clear();
    }
}


function getAttackHitbox(player) {
    const direction =
        player.facing === 'left'
            ? -1
            : 1;

    const x =
        player.sprite.x +
        ATTACK_CONFIG.hitboxOffsetX *
        direction;

    const y =
        player.sprite.y +
        ATTACK_CONFIG.hitboxOffsetY;

    return new Phaser.Geom.Rectangle(
        x - ATTACK_CONFIG.hitboxWidth / 2,
        y - ATTACK_CONFIG.hitboxHeight / 2,
        ATTACK_CONFIG.hitboxWidth,
        ATTACK_CONFIG.hitboxHeight
    );
}


function processAttackHits(
    attacker,
    players
) {
    const hitbox =
        getAttackHitbox(attacker);

    for (const targetId in players) {
        const target = players[targetId];

        if (!target) {
            continue;
        }

        if (target === attacker) {
            continue;
        }

        if (!target.sprite || !target.sprite.body) {
            continue;
        }

        if (
            attacker.attackHitTargets.has(
                targetId
            )
        ) {
            continue;
        }

        const targetBounds =
            target.sprite.getBounds();

        if (
            !Phaser.Geom.Intersects.RectangleToRectangle(
                hitbox,
                targetBounds
            )
        ) {
            continue;
        }

        attacker.attackHitTargets.add(
            targetId
        );

        applyAttackHit(
            attacker,
            target
        );
    }
}


function applyAttackHit(
    attacker,
    target
) {
    target.lives--;

    const direction =
        attacker.sprite.x < target.sprite.x
            ? 1
            : -1;

    target.sprite.body.setVelocity(
        ATTACK_CONFIG.knockbackX *
            direction,
        ATTACK_CONFIG.knockbackY
    );

    console.log(
        `${attacker.username} hit ${target.username}`
    );

    if (target.lives <= 0) {
        target.lives = 0;
    }
}


export function drawAttackHitbox(
    player,
    scene,
    time
) {
    if (!player.attacking) {
        return;
    }

    const elapsed =
        time - player.attackStartTime;

    if (
        elapsed < ATTACK_CONFIG.hitStart ||
        elapsed > ATTACK_CONFIG.hitEnd
    ) {
        return;
    }

    const hitbox =
        getAttackHitbox(player);

    if (!player.attackDebugGraphics) {
        player.attackDebugGraphics =
            scene.add.graphics();
    }

    player.attackDebugGraphics.clear();

    player.attackDebugGraphics.lineStyle(
        2,
        0xff0000,
        1
    );

    player.attackDebugGraphics.strokeRect(
        hitbox.x,
        hitbox.y,
        hitbox.width,
        hitbox.height
    );
}