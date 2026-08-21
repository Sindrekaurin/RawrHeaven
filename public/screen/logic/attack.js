const ATTACK_CONFIG = {
    cooldown: 500,
    duration: 250,

    damage: 20,

    hitboxWidth: 55,
    hitboxHeight: 45,

    hitboxOffsetX: 45,
    hitboxOffsetY: 0,

    hitStart: 75,
    hitEnd: 175
};

// Special move: slower cooldown, bigger hitbox, hits like a truck almost
// regardless of the target's current percent - a real "kill move".
const SPECIAL_CONFIG = {
    cooldown: 4000,
    duration: 350,

    damage: 12,

    hitboxWidth: 80,
    hitboxHeight: 65,

    hitboxOffsetX: 55,
    hitboxOffsetY: -10,

    hitStart: 100,
    hitEnd: 220,

    // Specials get a big flat knockback bonus on top of the normal formula,
    // and largely ignore percent scaling so they're threatening even at 0%.
    flatKnockbackBonus: 22,
    percentScalingMultiplier: 0.4
};

const KB_CONFIG = {
    baseKnockback: 8,       // flat KB every hit has, regardless of percent
    knockbackScaling: 0.18, // KB per percent point
    damagePerHit: 8,        // percent added per hit (kept for reference; use hitConfig.damage instead)
    weight: 100             // could vary per character later
};

const COMBO_WINDOW = 1500; // ms - if you hit them again within this, it's "the same combo"


export function initAttackState(player) {
    player.attackRequested = false;
    player.attacking = false;

    player.attackStartTime = 0;
    player.lastAttackTime = -ATTACK_CONFIG.cooldown;

    player.attackHitTargets = new Set();
    player.attackCooldown = ATTACK_CONFIG.cooldown;

    // Special move state
    player.specialRequested = false;
    player.specialActive = false;
    player.specialStartTime = 0;
    player.lastSpecialTime = -SPECIAL_CONFIG.cooldown;
    player.specialHitTargets = new Set();
    player.specialCooldown = SPECIAL_CONFIG.cooldown;
    player.specialDebugGraphics = null;

    // Damage / knockback / stun state
    player.damage = 0;          // percent, 0-999
    player.hitstunUntil = 0;    // timestamp, can't act until this passes
    player.inHitstun = false;
    player.knockedBack = false; // true while airborne from a hit, used for stun/DI logic

    // Combo tracking (per-victim state, set by whoever hits this player)
    player.comboHits = 0;
    player.lastHitBy = null;
    player.lastHitTime = 0;

    player.attackDebugGraphics = null;
}


export function requestAttack(player) {
    player.attackRequested = true;
}


export function requestSpecial(player) {
    player.specialRequested = true;
}


export function isStunned(player, time) {
    return time < player.hitstunUntil;
}


export function tryStartAttack(player, time, characterKey, scene) {
    if (!player.attackRequested) {
        return false;
    }

    player.attackRequested = false;

    if (isStunned(player, time)) {
        return false;
    }

    if (player.attacking || player.specialActive) {
        return false;
    }

    if (time - player.lastAttackTime < player.attackCooldown) {
        return false;
    }

    startAttack(player, time, characterKey, scene);

    return true;
}


export function tryStartSpecial(player, time, characterKey, scene) {
    if (!player.specialRequested) {
        return false;
    }

    player.specialRequested = false;

    if (isStunned(player, time)) {
        return false;
    }

    if (player.attacking || player.specialActive) {
        return false;
    }

    if (time - player.lastSpecialTime < player.specialCooldown) {
        return false;
    }

    startSpecial(player, time, characterKey, scene);

    return true;
}


function startAttack(player, time, characterKey, scene) {
    player.attacking = true;
    player.attackStartTime = time;
    player.lastAttackTime = time;

    player.attackHitTargets.clear();

    player.sprite.body.setVelocityX(0);

    playAttackAnimation(player, characterKey, scene, 'attack_a');
}


function startSpecial(player, time, characterKey, scene) {
    player.specialActive = true;
    player.specialStartTime = time;
    player.lastSpecialTime = time;

    player.specialHitTargets.clear();

    player.sprite.body.setVelocityX(0);

    // Falls back to the normal attack animation if there's no dedicated
    // "special" animation group in the atlas yet.
    playAttackAnimation(player, characterKey, scene, 'special', 'attack_a');
}


function playAttackAnimation(player, characterKey, scene, animGroup, fallbackGroup) {
    const animKey = `${characterKey}-${animGroup}_${player.facing}`;

    if (scene.anims.exists(animKey)) {
        player.sprite.play(animKey, true);
        return;
    }

    if (fallbackGroup) {
        const fallbackKey = `${characterKey}-${fallbackGroup}_${player.facing}`;
        if (scene.anims.exists(fallbackKey)) {
            player.sprite.play(fallbackKey, true);
        }
    }
}


export function updateAttack(player, time, players, scene) {
    if (player.attacking) {
        const elapsed = time - player.attackStartTime;

        if (elapsed >= ATTACK_CONFIG.duration) {
            endAttack(player);
        } else if (elapsed >= ATTACK_CONFIG.hitStart && elapsed <= ATTACK_CONFIG.hitEnd) {
            processAttackHits(player, players, ATTACK_CONFIG, player.attackHitTargets);
        }
    }

    if (player.specialActive) {
        const elapsed = time - player.specialStartTime;

        if (elapsed >= SPECIAL_CONFIG.duration) {
            endSpecial(player);
        } else if (elapsed >= SPECIAL_CONFIG.hitStart && elapsed <= SPECIAL_CONFIG.hitEnd) {
            processAttackHits(player, players, SPECIAL_CONFIG, player.specialHitTargets);
        }
    }
}


function endAttack(player) {
    player.attacking = false;

    if (player.attackDebugGraphics) {
        player.attackDebugGraphics.clear();
    }
}


function endSpecial(player) {
    player.specialActive = false;

    if (player.specialDebugGraphics) {
        player.specialDebugGraphics.clear();
    }
}


function getAttackHitbox(player, hitConfig) {
    const direction = player.facing === 'left' ? -1 : 1;

    const x = player.sprite.x + hitConfig.hitboxOffsetX * direction;
    const y = player.sprite.y + hitConfig.hitboxOffsetY;

    return new Phaser.Geom.Rectangle(
        x - hitConfig.hitboxWidth / 2,
        y - hitConfig.hitboxHeight / 2,
        hitConfig.hitboxWidth,
        hitConfig.hitboxHeight
    );
}


function processAttackHits(attacker, players, hitConfig, hitTargetsSet) {
    const hitbox = getAttackHitbox(attacker, hitConfig);

    for (const targetId in players) {
        const target = players[targetId];

        if (!target) continue;
        if (target === attacker) continue;
        if (!target.sprite || !target.sprite.body) continue;
        if (hitTargetsSet.has(targetId)) continue;

        const targetBounds = target.sprite.getBounds();

        if (!Phaser.Geom.Intersects.RectangleToRectangle(hitbox, targetBounds)) {
            continue;
        }

        hitTargetsSet.add(targetId);

        applyAttackHit(attacker, target, hitConfig);
    }
}


function getKnockbackAngle(attacker, target) {
    // Use the attacker's facing rather than raw x-position comparison, so a
    // hit thrown behind the attacker (e.g. turned mid-swing) still launches
    // the target in the direction the attack actually faced.
    const dir = attacker.facing === 'left' ? -1 : 1;
    const baseAngleDeg = 45; // 45° = classic "sakurai angle", diagonal up-and-away
    const rad = Phaser.Math.DegToRad(baseAngleDeg);
    return dir === 1 ? -rad : Math.PI + rad;
}


function computeKnockback(target, hitConfig) {
    const p = target.damage;
    const d = hitConfig.damage;

    // Smash-ish formula: knockback grows non-linearly with the target's
    // current percent, so late hits launch much further than early ones.
    let kb =
        (((p / 10) + (p * d / 20)) * (200 / (KB_CONFIG.weight + 100)) * 1.4 + 18)
        * KB_CONFIG.knockbackScaling;

    if (hitConfig.percentScalingMultiplier !== undefined) {
        // Specials mostly ignore percent scaling and instead lean on a big
        // flat bonus, so they're a real threat even against a fresh target.
        kb = kb * hitConfig.percentScalingMultiplier;
    }

    if (hitConfig.flatKnockbackBonus) {
        kb += hitConfig.flatKnockbackBonus;
    }

    return kb;
}


function applyHitstun(target, knockback) {
    const HITSTUN_PER_KB = 12; // ms of stun per unit of knockback, tune to taste
    const duration = knockback * HITSTUN_PER_KB;

    target.hitstunUntil = performance.now() + duration;
    target.inHitstun = true;
    target.knockedBack = true;
}


function trackCombo(attacker, target) {
    const now = performance.now();

    if (!target.lastHitBy || target.lastHitBy !== attacker || now - target.lastHitTime > COMBO_WINDOW) {
        target.comboHits = 0;
    }

    target.comboHits = (target.comboHits ?? 0) + 1;
    target.lastHitBy = attacker;
    target.lastHitTime = now;

    // Bonus knockback multiplier for consecutive hits in the same combo,
    // capped so combos don't snowball into an instant kill.
    if (target.comboHits >= 2) {
        const bonus = 1 + Math.min(target.comboHits - 1, 3) * 0.15;
        target.sprite.body.velocity.x *= bonus;
        target.sprite.body.velocity.y *= bonus;
    }
}


function applyAttackHit(attacker, target, hitConfig = ATTACK_CONFIG) {
    target.damage += hitConfig.damage;

    const kb = computeKnockback(target, hitConfig);
    const angle = getKnockbackAngle(attacker, target);

    target.sprite.body.setVelocity(
        Math.cos(angle) * kb,
        Math.sin(angle) * kb
    );

    applyHitstun(target, kb);
    trackCombo(attacker, target);

    console.log(`${attacker.username} hit ${target.username} for ${hitConfig.damage}% (now ${target.damage.toFixed(0)}%)`);
}


export function drawAttackHitbox(player, scene, time) {
    drawHitboxFor(player, scene, time, {
        active: player.attacking,
        startTime: player.attackStartTime,
        hitConfig: ATTACK_CONFIG,
        graphicsKey: 'attackDebugGraphics',
        color: 0xff0000
    });

    drawHitboxFor(player, scene, time, {
        active: player.specialActive,
        startTime: player.specialStartTime,
        hitConfig: SPECIAL_CONFIG,
        graphicsKey: 'specialDebugGraphics',
        color: 0x00d4ff
    });
}


function drawHitboxFor(player, scene, time, { active, startTime, hitConfig, graphicsKey, color }) {
    if (!active) {
        return;
    }

    const elapsed = time - startTime;

    if (elapsed < hitConfig.hitStart || elapsed > hitConfig.hitEnd) {
        return;
    }

    const hitbox = getAttackHitbox(player, hitConfig);

    if (!player[graphicsKey]) {
        player[graphicsKey] = scene.add.graphics();
    }

    const g = player[graphicsKey];
    g.clear();
    g.lineStyle(2, color, 1);
    g.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
}