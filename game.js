// ==========================================================
// 🌊 SEA OF BLEACH - Game Script
// State Machine: INTRO → SETTINGS → GAME
// ==========================================================

const screenIntro    = document.getElementById("screen-intro");
const screenSettings = document.getElementById("screen-settings");
const screenGame     = document.getElementById("screen-game");
const trailerVideo   = document.getElementById("trailer-video");
const bindingHint    = document.getElementById("binding-hint");
const startGameBtn   = document.getElementById("start-game-btn");

// =========================
// 🎬 INTRO
// =========================
const controls = { up:"KeyW", left:"KeyA", down:"KeyS", right:"KeyD", dash:"Space", tentacle:"KeyE" };

function goToSettings() {
    screenIntro.classList.add("hidden");
    screenSettings.classList.remove("hidden");
    renderKeyLabels();
}
window.addEventListener("keydown", (e) => {
    if (!screenIntro.classList.contains("hidden") && e.key === "0") {
        trailerVideo.pause(); goToSettings();
    }
});
trailerVideo.addEventListener("ended", goToSettings);
trailerVideo.addEventListener("error", () => setTimeout(goToSettings, 800));

// =========================
// ⌨️ SETTINGS
// =========================
function keyCodeToLabel(code) {
    if (code === "Space")          return "Space";
    if (code.startsWith("Key"))    return code.slice(3);
    if (code.startsWith("Digit"))  return code.slice(5);
    if (code.startsWith("Arrow"))  return code.slice(5);
    if (code.startsWith("Numpad")) return "Num" + code.slice(6);
    return code;
}
function renderKeyLabels() {
    for (const [action, code] of Object.entries(controls)) {
        const btn = document.querySelector(`[data-action="${action}"]`);
        if (btn) btn.textContent = keyCodeToLabel(code);
    }
}

let listeningAction = null, listeningButton = null;
document.querySelectorAll(".key-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (listeningButton && listeningButton !== btn)
            listeningButton.classList.remove("listening");
        listeningAction = btn.dataset.action;
        listeningButton = btn;
        btn.classList.add("listening");
        btn.textContent = "...";
        bindingHint.classList.remove("hidden");
    });
});
window.addEventListener("keydown", (e) => {
    if (listeningAction !== null && !screenSettings.classList.contains("hidden")) {
        e.preventDefault();
        if (e.code === "Digit0") { bindingHint.textContent = '"0" is reserved.'; return; }
        controls[listeningAction] = e.code;
        listeningButton.classList.remove("listening");
        listeningButton.textContent = keyCodeToLabel(e.code);
        listeningAction = null; listeningButton = null;
        bindingHint.classList.add("hidden");
    }
});
startGameBtn.addEventListener("click", () => {
    screenSettings.classList.add("hidden");
    screenGame.classList.remove("hidden");
    startGame();
});

// =========================
// 🎮 GAME
// =========================
const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const keysDown = new Set();
let isPaused = false;

window.addEventListener("keydown", (e) => {
    if (screenGame.classList.contains("hidden")) return;
    if (e.code === "Escape") { isPaused = !isPaused; return; }
    if (isPaused) return;
    keysDown.add(e.code);
    if (e.code === controls.dash)     player.tryDash();
    if (e.code === controls.tentacle) fireTentacle();
});
window.addEventListener("keyup", (e) => keysDown.delete(e.code));
function isHeld(action) { return keysDown.has(controls[action]); }
function dist(x1,y1,x2,y2) { return Math.sqrt((x1-x2)**2+(y1-y2)**2); }

// =========================
// 🖼️ BACKGROUND
// =========================
const bgImage = new Image();
let bgLoaded = false;
bgImage.src = "Assets/Backgrounds/background.png";
bgImage.onload  = () => { bgLoaded = true; };
bgImage.onerror = () => { bgLoaded = false; };

// =========================
// 📷 CAMERA
// =========================
const camera = {
    x: 0, y: 0,
    follow(target) {
        this.x = target.x - canvas.width / 2;
        this.y = target.y - canvas.height / 2;
        if (this.x < 0) this.x = 0;
        if (this.y < 0) this.y = 0;
    },
    toScreen(wx, wy) { return { x: wx - this.x, y: wy - this.y }; }
};

// Slow, random horizontal air drift — changes every ~3s
let windDrift  = 0;  // current push per frame
let windTarget = 0;  // slowly moves toward this
let windTimer  = 0;  // countdown to next wind direction change

// =========================
// 🌍 WORLD CONFIG
// =========================
const FLOOR_Y      = 1200;
const CHUNK_WIDTH  = 800;

// =========================
// 🕐 GLOBAL GAME TIMER (seconds)
// Used for synchronized enemy shooting
// =========================
let gameTime           = 0;
let lastFrameTime      = null;
let timeSinceGrounded  = 0; // seconds since player last touched the actual floor

// Global shot cooldowns (all shooting enemies fire together)
const SHOOTER_COOLDOWN = 10; // seconds — flying shooters
let nextShooterShot    = 10; // fire first shot after 10s

// =========================
// 🪸 PLATFORM CONFIG
// =========================
const PLATFORM_HEIGHT  = 16;
const BLINK_START_TIME = 6;   // seconds airborne before blinking begins
const BLINK_DURATION   = 3;   // seconds of blinking before platform vanishes

// =========================
// 🔴 LASER SYSTEM CONFIG
// =========================
const LASER_GRACE    = 5;    // seconds of airborne grace before lasers arm
const LASER_LAG      = 2;    // seconds behind player the laser targets
const LASER_INTERVAL = 2.2;  // seconds between laser shots
const LASER_VIS      = 0.8;  // seconds a laser beam stays visible

let airPosHistory    = [];       // { t, y } sampled every frame while airborne
let airborneDuration = 0;        // seconds since player last touched the floor
let activeLasers     = [];       // { worldY, elapsed, maxDuration }
let nextLaserTime    = Infinity; // armed after grace period, Infinity = disabled

// 🔴 PLATFORM DECAY BURST LASERS (6-beam converging cage)
const DECAY_BURST_INTERVAL = 3.5;
let decayBursts    = [];
let nextDecayBurst = Infinity;

// =========================
// 🌊 UPPER ZONE & CEILING GAP
// =========================
const CEILING_GAP_X   = 1450;  // World X where ceiling opens
const CEILING_GAP_W   = 180;   // Width of the gap
const UPPER_CEILING_Y = -900;  // Hard ceiling of the upper room

let hasUnlockedTentacle = false;
let abilityAlertTimer   = 0;    // shows ability banner for 3s
let inUpperZone         = false;
let upperWaveTimer      = 0;    // controls enemy waves in upper zone

// =========================
// 💥 PROJECTILES
// =========================
let projectiles = [];

function spawnProjectile(x, y, targetX, targetY, large = false) {
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const speed = large ? 2.5 : 4;
    projectiles.push({
        x, y,
        dx: (dx / len) * speed,
        dy: (dy / len) * speed,
        radius: large ? 14 : 7,
        large
    });
}

function updateProjectiles() {
    projectiles.forEach(p => { p.x += p.dx; p.y += p.dy; });
    // Remove if too far from player or off-world
    projectiles = projectiles.filter(p =>
        dist(p.x, p.y, player.x, player.y) < 2000
    );
}

function checkProjectileHits() {
    projectiles = projectiles.filter(p => {
        if (dist(p.x, p.y, player.x, player.y) < player.radius + p.radius) {
            player.takeDamage(1);
            return false; // Remove projectile
        }
        return true;
    });
}

// =========================
// ♟️ ENEMY TYPES
// =========================

/**
 * TYPE 1: PASSIVE BOUNCER
 * Floats mid-air, bobs gently. No attack.
 * You MUST dash into it to get the upward boost.
 * Color: Ghost white/soft blue
 */
class PassiveBouncer {
    constructor(x, y, chunk) {
        this.x = x; this.y = y; this.chunk = chunk;
        this.radius = 20;
        this.isAlive = true;
        this.type = "passive";
        this.bobOffset = Math.random() * Math.PI * 2;
        this.baseY = y;
    }
    update() {
        // Gentle up/down bob
        this.y = this.baseY + Math.sin(gameTime * 1.5 + this.bobOffset) * 20;
    }
    draw() {
        if (!this.isAlive) return;
        const s = camera.toScreen(this.x, this.y);
        // Ghost glow
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(180,220,255,0.1)";
        ctx.fill();
        ctx.closePath();
        // Body
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle   = "rgba(200,230,255,0.85)";
        ctx.shadowColor = "#aaddff";
        ctx.shadowBlur  = 20;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.closePath();
    }
    onHit(p) {
        this.isAlive = false;
        p.triggerPredatorBoost(10);
        setTimeout(() => { this.isAlive = true; }, 3000);
    }
}

/**
 * TYPE 2: GROUND FISH
 * Walks left/right on the floor. Cannot fly.
 * Patrols a range around its spawn point.
 * Color: Yellow-green
 */
class GroundFish {
    constructor(x, y, chunk) {
        this.x = x; this.y = FLOOR_Y - 20; this.chunk = chunk;
        this.radius  = 18;
        this.isAlive = true;
        this.type    = "groundfish";
        this.speed   = 0.8 + Math.random() * 0.5;
        this.dir     = Math.random() > 0.5 ? 1 : -1;
        this.spawnX  = x;
        this.patrolRange = 200 + Math.random() * 150;
    }
    update() {
        if (!this.isAlive) return;
        this.x += this.speed * this.dir;
        // Reverse at patrol ends
        if (Math.abs(this.x - this.spawnX) > this.patrolRange) this.dir *= -1;
        this.y = FLOOR_Y - this.radius; // Always on the floor
    }
    draw() {
        if (!this.isAlive) return;
        const s = camera.toScreen(this.x, this.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle   = "#b5e853";
        ctx.shadowColor = "#b5e853";
        ctx.shadowBlur  = 12;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.closePath();
        // Direction indicator (tail)
        ctx.beginPath();
        ctx.arc(s.x - this.dir * (this.radius - 4), s.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(80,120,20,0.7)";
        ctx.fill();
        ctx.closePath();
    }
    onHit(p) {
        this.isAlive = false;
        p.triggerPredatorBoost(9);
        setTimeout(() => { this.isAlive = true; }, 2500);
    }
}

/**
 * TYPE 3: FLYER
 * Flies through the air, drifts toward the player slowly.
 * No projectiles.
 * Color: Red-orange
 */
class Flyer {
    constructor(x, y, chunk) {
        this.x = x; this.y = y; this.chunk = chunk;
        this.radius  = 20;
        this.isAlive = true;
        this.type    = "flyer";
        this.speed   = 0.6 + Math.random() * 0.4;
        this.dx = 0; this.dy = 0;
    }
    update() {
        if (!this.isAlive) return;
        // Slowly drift toward player
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.dx += Math.cos(angle) * 0.03;
        this.dy += Math.sin(angle) * 0.03;
        // Cap speed
        const spd = Math.sqrt(this.dx**2 + this.dy**2);
        if (spd > this.speed) { this.dx = (this.dx/spd)*this.speed; this.dy = (this.dy/spd)*this.speed; }
        this.x += this.dx;
        this.y += this.dy;
        // Stay above floor
        if (this.y + this.radius > FLOOR_Y) this.y = FLOOR_Y - this.radius;
    }
    draw() {
        if (!this.isAlive) return;
        const s = camera.toScreen(this.x, this.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle   = "#ff6030";
        ctx.shadowColor = "#ff6030";
        ctx.shadowBlur  = 16;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.closePath();
    }
    onHit(p) {
        this.isAlive = false;
        p.triggerPredatorBoost(11);
        setTimeout(() => { this.isAlive = true; }, 2500);
    }
}

/**
 * TYPE 4: FLYING SHOOTER
 * Flies through the air toward the player AND shoots a projectile
 * at the player every 10 seconds (synchronized global timer).
 * Color: Deep crimson / magenta
 */
class FlyingShooter {
    constructor(x, y, chunk) {
        this.x = x; this.y = y; this.chunk = chunk;
        this.radius  = 22;
        this.isAlive = true;
        this.type    = "flyingshooter";
        this.speed   = 0.5 + Math.random() * 0.3;
        this.dx = 0; this.dy = 0;
    }
    update() {
        if (!this.isAlive) return;
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.dx += Math.cos(angle) * 0.025;
        this.dy += Math.sin(angle) * 0.025;
        const spd = Math.sqrt(this.dx**2 + this.dy**2);
        if (spd > this.speed) { this.dx = (this.dx/spd)*this.speed; this.dy = (this.dy/spd)*this.speed; }
        this.x += this.dx;
        this.y += this.dy;
        if (this.y + this.radius > FLOOR_Y) this.y = FLOOR_Y - this.radius;
    }
    shoot() {
        if (!this.isAlive) return;
        // Only shoot if visible on screen (within ~1000px of player)
        if (dist(this.x, this.y, player.x, player.y) < 1000) {
            spawnProjectile(this.x, this.y, player.x, player.y, false);
        }
    }
    draw() {
        if (!this.isAlive) return;
        const s = camera.toScreen(this.x, this.y);
        // Warning ring
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(220,50,100,0.3)";
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.closePath();
        // Body
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle   = "#cc2255";
        ctx.shadowColor = "#ff3377";
        ctx.shadowBlur  = 20;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.closePath();
    }
    onHit(p) {
        this.isAlive = false;
        p.triggerPredatorBoost(12);
        setTimeout(() => { this.isAlive = true; }, 2500);
    }
}

// =========================
// 🌍 CHUNK / WORLD SYSTEM
// =========================
const generatedChunks = new Set();
let worldEnemies  = [];
let worldVents    = [];
let worldPlatforms = [];

function getChunkIndex(worldX) { return Math.floor(worldX / CHUNK_WIDTH); }

function generateChunk(chunkIndex) {
    if (generatedChunks.has(chunkIndex)) return;
    generatedChunks.add(chunkIndex);
    const cx = chunkIndex * CHUNK_WIDTH;

    // ── PLATFORM DENSITY ───────────────────────────────────────────
    // Chunk 0 = densely packed (20 platforms), reduces to 8 later.
    // Extra gate-pairs + vertical stacks create a reverse-dropper feel.
    const baseCount  = Math.max(8, 20 - chunkIndex);
    const platWidth  = () => Math.max(50, 200 - chunkIndex * 12) + Math.random() * 40;
    const minSpacing = Math.max(70, 40 + chunkIndex * 18); // Gaps grow with chunks

    // --- Pass 1: Regular scattered platforms ---
    let px = cx + 40;
    let placed = 0;
    while (placed < baseCount && px < cx + CHUNK_WIDTH - 40) {
        const pw = platWidth();
        const minY = Math.max(120, 680 - chunkIndex * 70);
        const maxY = FLOOR_Y - 60;
        const py   = minY + Math.random() * (maxY - minY);
        const isSolid = Math.random() < 0.4; // 40% chance to be a hard blocking platform

        worldPlatforms.push({
            x: px, y: py, width: pw, height: PLATFORM_HEIGHT,
            type: isSolid ? 'solidBlock' : 'oneway',
            chunk: chunkIndex, state: 'solid', blinkTimer: 0,
            blinkOffset: Math.random() * 2.5
        });
        px += pw + minSpacing + Math.random() * 60;
        placed++;
    }

    // --- Pass 2: GATE PAIRS (reverse-dropper obstacles) ---
    // Two wide platforms side-by-side at the same height with a narrow gap.
    // You must thread through the gap when shooting upward.
    const gateCount = Math.max(1, 4 - Math.floor(chunkIndex / 3));
    for (let g = 0; g < gateCount; g++) {
        const gateY    = 150 + Math.random() * (FLOOR_Y - 400);
        const gateCX   = cx + 120 + Math.random() * (CHUNK_WIDTH - 250);
        const gapW     = 110 + Math.random() * 60; // gap to thread through
        const armW     = Math.max(80, 160 - chunkIndex * 10);
        // Left arm (gates are ALWAYS solid blockers)
        worldPlatforms.push({ x: gateCX - gapW / 2 - armW, y: gateY,
            width: armW, height: PLATFORM_HEIGHT, chunk: chunkIndex, type: 'solidBlock',
            state: 'solid', blinkTimer: 0, blinkOffset: Math.random() * 2.5 });
        // Right arm
        worldPlatforms.push({ x: gateCX + gapW / 2, y: gateY,
            width: armW, height: PLATFORM_HEIGHT, chunk: chunkIndex, type: 'solidBlock',
            state: 'solid', blinkTimer: 0, blinkOffset: Math.random() * 2.5 });
    }

    // --- Pass 3: VERTICAL STACKS (tight column clusters) ---
    // 2-3 platforms stacked with a vertical gap, forcing upward navigation.
    const stackCount = Math.max(1, 3 - Math.floor(chunkIndex / 4));
    for (let s = 0; s < stackCount; s++) {
        const stackX   = cx + 80 + Math.random() * (CHUNK_WIDTH - 180);
        const stackBot = 600 + Math.random() * (FLOOR_Y - 700);
        const vGap     = 130 + Math.random() * 80;
        for (let v = 0; v < 3; v++) {
            const sy = stackBot - v * vGap;
            if (sy > 100) {
                const sw = Math.max(55, 140 - chunkIndex * 8);
                const isSolid = Math.random() < 0.6; // 60% chance for stacks
                worldPlatforms.push({ x: stackX, y: sy, width: sw,
                    height: PLATFORM_HEIGHT, chunk: chunkIndex, type: isSolid ? 'solidBlock' : 'oneway',
                    state: 'solid', blinkTimer: 0,
                    blinkOffset: Math.random() * 2.5 });
            }
        }
    }

    // ── ENEMY SPAWNS ────────────────────────────────────────────────
    // Chunk 0 = safe tutorial space
    if (chunkIndex === 0) {
        worldEnemies.push(new PassiveBouncer(cx + 320, 950, chunkIndex));
        worldEnemies.push(new PassiveBouncer(cx + 580, 150, chunkIndex));
        worldEnemies.push(new GroundFish(cx + 500, FLOOR_Y, chunkIndex));
        return;
    }

    const rand = () => cx + 80 + Math.random() * (CHUNK_WIDTH - 160);
    const topY = () => 80  + Math.random() * 200;
    const midY = () => 380 + Math.random() * 370;
    const lowY = () => 880 + Math.random() * 220;

    worldEnemies.push(new PassiveBouncer(rand(), topY(), chunkIndex));
    worldEnemies.push(new PassiveBouncer(rand(), topY(), chunkIndex));
    if (Math.random() > 0.4)
        worldEnemies.push(new PassiveBouncer(rand(), topY(), chunkIndex));

    if (chunkIndex >= 2) worldEnemies.push(new Flyer(rand(), midY(), chunkIndex));
    if (chunkIndex >= 4 && Math.random() > 0.5)
        worldEnemies.push(new FlyingShooter(rand(), midY(), chunkIndex));

    worldEnemies.push(new GroundFish(rand(), FLOOR_Y, chunkIndex));
    worldEnemies.push(new GroundFish(rand(), FLOOR_Y, chunkIndex));
    if (chunkIndex >= 2) worldEnemies.push(new PassiveBouncer(rand(), lowY(), chunkIndex));
    if (chunkIndex >= 3 && Math.random() > 0.4)
        worldEnemies.push(new Flyer(rand(), lowY(), chunkIndex));

    if (chunkIndex % 3 === 0)
        worldVents.push({ x: cx + CHUNK_WIDTH / 2, y: FLOOR_Y - 30, radius: 34, chunk: chunkIndex });
}

function cullOldChunks(currentChunk) {
    const cutoff = currentChunk - 5;
    // Preserve chunk = -1 (upper zone enemies)
    worldEnemies   = worldEnemies.filter(e => e.chunk < 0 || e.chunk >= cutoff);
    worldVents     = worldVents.filter(v => v.chunk >= cutoff);
    worldPlatforms = worldPlatforms.filter(p => p.chunk >= cutoff);
    for (const c of generatedChunks) { if (c < cutoff) generatedChunks.delete(c); }
}

function updateChunks() {
    const cc = getChunkIndex(player.x);
    for (let i = cc; i <= cc + 3; i++) generateChunk(i);
    cullOldChunks(cc);
}

// =========================
// 🪸 PLATFORM SYSTEM
// =========================
function reviveAllPlatforms() {
    worldPlatforms.forEach(p => {
        p.state      = 'solid';
        p.blinkTimer = 0;
    });
}

function updatePlatforms(delta) {
    // If player is touching the actual floor this frame, reset everything
    if (player.onFloor) {
        if (timeSinceGrounded > 0) reviveAllPlatforms();
        timeSinceGrounded = 0;
        return;
    }
    timeSinceGrounded += delta;

    worldPlatforms.forEach(plat => {
        if (plat.state === 'gone') return;
        const blinkStart = BLINK_START_TIME + plat.blinkOffset;
        if (timeSinceGrounded >= blinkStart + BLINK_DURATION) {
            plat.state = 'gone';
        } else if (timeSinceGrounded >= blinkStart) {
            plat.state = 'blinking';
            plat.blinkTimer += delta;
        } else {
            plat.state = 'solid';
        }
    });
}

function checkPlatformCollisions() {
    worldPlatforms.forEach(plat => {
        if (plat.state === 'gone') return;

        const pLeft   = plat.x;
        const pRight  = plat.x + plat.width;
        const pTop    = plat.y;
        const pBottom = plat.y + plat.height;

        // Horizontal overlap (use 75% of radius so edge-landing feels fair)
        const hitW = player.radius * 0.75;
        if (player.x + hitW < pLeft)  return;
        if (player.x - hitW > pRight) return;

        // One-way landing (standing on top)
        const playerBottom  = player.y + player.radius;
        const playerTop     = player.y - player.radius;
        const prevBottom    = playerBottom - player.dy;
        const prevTop       = playerTop - player.dy;

        // Landing from above (works for both oneway and solidBlock)
        if (player.dy >= 0 && prevBottom <= pTop && playerBottom >= pTop) {
            player.y       = pTop - player.radius;
            player.dy      = 0;
            player.canDash = true;
            return; // handled
        }

        // Hitting head from below (ONLY for solidBlock platforms)
        if (plat.type === 'solidBlock') {
            if (player.dy < 0 && prevTop >= pBottom && playerTop <= pBottom) {
                player.y  = pBottom + player.radius;
                player.dy = 1; // Bonk downward
                return;
            }
        }

        // Push player out if somehow inside platform (safety)
        if (playerBottom > pTop && playerTop < pBottom) {
            if (player.dy > 0) {
                player.y  = pTop - player.radius;
                player.dy = 0;
                player.canDash = true;
            } else if (plat.type === 'solidBlock' && player.dy < 0) {
                player.y = pBottom + player.radius;
                player.dy = 1;
            }
        }
    });
}

function drawPlatforms() {
    worldPlatforms.forEach(plat => {
        if (plat.state === 'gone') return;

        // Blinking: flicker faster as time runs out
        if (plat.state === 'blinking') {
            const progress  = plat.blinkTimer / BLINK_DURATION; // 0→1
            const blinkRate = 4 + progress * 12; // 4Hz → 16Hz
            const visible   = Math.floor(gameTime * blinkRate) % 2 === 0;
            if (!visible) return;
        }

        const s = camera.toScreen(plat.x, plat.y);

        // Visual styling depends on platform behavior
        const isSolid     = plat.state === 'solid';
        const isHardBlock = plat.type === 'solidBlock';

        let fillColor, glowColor, topShine, botShine;

        if (!isSolid) {
            fillColor = 'rgba(255, 140, 40, 0.9)'; // Warning blink
            glowColor = '#ff9900';
            topShine  = 'rgba(255,220,120,0.4)';
            botShine  = 'rgba(0,0,0,0)';
        } else if (isHardBlock) {
            fillColor = 'rgba(20, 100, 70, 0.9)';  // Dark, dense green
            glowColor = '#105030';
            topShine  = 'rgba(100,200,150,0.2)';
            botShine  = 'rgba(100,200,150,0.2)';   // Has a bottom rim as well to show it has physical depth from beneath
        } else {
            fillColor = 'rgba(64, 210, 160, 0.88)'; // Bright neon teal (one-way)
            glowColor = '#28c898';
            topShine  = 'rgba(180,255,230,0.35)';   // Highlight on top indicates you can land here
            botShine  = 'rgba(0,0,0,0)';
        }

        // Platform body
        ctx.fillStyle   = fillColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur  = isSolid ? (isHardBlock ? 4 : 10) : 20; // Hard blocks don't glow much, they look dense
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, plat.width, plat.height, 4);
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Top highlight
        if (topShine !== 'rgba(0,0,0,0)') {
            ctx.fillStyle = topShine;
            ctx.beginPath();
            ctx.roundRect(s.x + 2, s.y + 1, plat.width - 4, 3, 2);
            ctx.fill();
        }

        // Bottom highlight for hard blocks
        if (botShine !== 'rgba(0,0,0,0)') {
            ctx.fillStyle = botShine;
            ctx.beginPath();
            ctx.roundRect(s.x + 2, s.y + plat.height - 4, plat.width - 4, 3, 2);
            ctx.fill();
        }
    });
}

// =========================
// 🔴 AIR-TRAIL LASER SYSTEM
// =========================
function recordAirTrail(delta) {
    if (player.onFloor) {
        airPosHistory    = [];
        airborneDuration = 0;
        nextLaserTime    = Infinity;
        // Disarm decay bursts on landing
        nextDecayBurst   = Infinity;
        decayBursts      = [];
        return;
    }

    airborneDuration += delta;
    airPosHistory.push({ t: airborneDuration, y: player.y });
    if (airPosHistory.length > 720) airPosHistory.shift();

    if (airborneDuration > LASER_GRACE && nextLaserTime === Infinity)
        nextLaserTime = gameTime + LASER_INTERVAL;
    if (gameTime >= nextLaserTime) {
        nextLaserTime = gameTime + LASER_INTERVAL;
        const targetT = airborneDuration - LASER_LAG;
        if (targetT > 0) {
            for (let i = 0; i < airPosHistory.length; i++) {
                if (airPosHistory[i].t >= targetT) {
                    activeLasers.push({ worldY: airPosHistory[i].y, elapsed: 0, maxDuration: LASER_VIS });
                    break;
                }
            }
        }
    }
}

function updateLasers(delta) {
    activeLasers.forEach(l => l.elapsed += delta);
    activeLasers = activeLasers.filter(l => l.elapsed < l.maxDuration);
}

// =========================
// 🔴 PLATFORM DECAY BURST LASERS
// 6 beams close in on the player's position each burst.
// Arms when platforms start blinking; resets when player hits the floor.
// =========================
function spawnDecayBurst() {
    const tx = player.x, ty = player.y;
    const arms = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const srcDist = 550;
        arms.push({
            fromX: tx + Math.cos(angle) * srcDist,
            fromY: ty + Math.sin(angle) * srcDist,
            toX: tx, toY: ty
        });
    }
    decayBursts.push({
        arms,
        targetX: tx, targetY: ty,
        elapsed: 0,
        telegraphDur: 0.5,  // Yellow warning phase
        fireDur:      0.75, // Red damage phase
        hasDamaged: false
    });
}

function updateDecayBursts(delta) {
    // Handle decay burst arming / disarming
    if (timeSinceGrounded >= BLINK_START_TIME && nextDecayBurst === Infinity && !player.onFloor) {
        nextDecayBurst = gameTime + 1.0; // 1s after blinking starts, first burst
    }
    if (nextDecayBurst !== Infinity && gameTime >= nextDecayBurst && !player.onFloor) {
        spawnDecayBurst();
        nextDecayBurst = gameTime + DECAY_BURST_INTERVAL;
    }

    decayBursts.forEach(b => b.elapsed += delta);
    decayBursts = decayBursts.filter(b => b.elapsed < b.telegraphDur + b.fireDur);
}

function checkDecayBurstHits() {
    decayBursts.forEach(burst => {
        if (burst.hasDamaged) return;
        if (burst.elapsed < burst.telegraphDur) return; // No damage during telegraph
        // Damage if player is still near the original target point
        if (dist(player.x, player.y, burst.targetX, burst.targetY) < player.radius + 28) {
            player.takeDamage(1);
            burst.hasDamaged = true;
        }
    });
}

function drawDecayBursts() {
    decayBursts.forEach(burst => {
        const isTelegraph = burst.elapsed < burst.telegraphDur;
        const phase = isTelegraph
            ? burst.elapsed / burst.telegraphDur          // 0→1 during warning
            : (burst.elapsed - burst.telegraphDur) / burst.fireDur; // 0→1 during fire

        burst.arms.forEach(arm => {
            const srcS = camera.toScreen(arm.fromX, arm.fromY);
            const tgtS = camera.toScreen(arm.toX,   arm.toY);
            // Tip moves from source toward target as phase progresses
            const tipX = srcS.x + (tgtS.x - srcS.x) * phase;
            const tipY = srcS.y + (tgtS.y - srcS.y) * phase;

            ctx.save();
            if (isTelegraph) {
                ctx.strokeStyle = `rgba(255,220,50,${0.3 + phase * 0.6})`;
                ctx.lineWidth   = 2;
                ctx.shadowColor = '#ffdd33';
                ctx.shadowBlur  = 10;
            } else {
                const a = phase > 0.8 ? (1 - phase) * 5 : 1;
                ctx.globalAlpha = a;
                ctx.strokeStyle = '#ff3355';
                ctx.lineWidth   = 3.5;
                ctx.shadowColor = '#ff2244';
                ctx.shadowBlur  = 18;
            }
            ctx.beginPath();
            ctx.moveTo(srcS.x, srcS.y);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
        });

        // Convergence point indicator
        if (!isTelegraph) {
            const tgt = camera.toScreen(burst.targetX, burst.targetY);
            const a   = phase > 0.8 ? (1 - phase) * 5 : 1;
            ctx.save();
            ctx.globalAlpha = a * 0.5;
            ctx.beginPath();
            ctx.arc(tgt.x, tgt.y, 30 * (1 - phase), 0, Math.PI * 2);
            ctx.strokeStyle = '#ff4466';
            ctx.lineWidth   = 2;
            ctx.shadowColor = '#ff3355';
            ctx.shadowBlur  = 12;
            ctx.stroke();
            ctx.shadowBlur  = 0;
            ctx.restore();
        }
    });
}

function drawLasers() {
    activeLasers.forEach(laser => {
        const s       = camera.toScreen(0, laser.worldY);
        const progress = laser.elapsed / laser.maxDuration; // 0→1
        // Fade out in last 20% of duration
        const alpha   = progress > 0.8 ? (1 - progress) * 5 : 1;
        if (alpha <= 0) return;

        // Core beam
        ctx.save();
        ctx.globalAlpha = alpha;

        // Glow halo (wide, soft)
        ctx.strokeStyle = 'rgba(255, 30, 80, 0.3)';
        ctx.lineWidth   = 14;
        ctx.shadowColor = '#ff2255';
        ctx.shadowBlur  = 20;
        ctx.beginPath();
        ctx.moveTo(0, s.y);
        ctx.lineTo(canvas.width, s.y);
        ctx.stroke();

        // Core line (thin, bright)
        ctx.strokeStyle = '#ff5588';
        ctx.lineWidth   = 2.5;
        ctx.shadowBlur  = 10;
        ctx.beginPath();
        ctx.moveTo(0, s.y);
        ctx.lineTo(canvas.width, s.y);
        ctx.stroke();

        // Emitter nodes on both edges
        ctx.fillStyle   = '#ff2055';
        ctx.shadowBlur  = 18;
        [-6, canvas.width + 6].forEach(ex => {
            ctx.beginPath();
            ctx.arc(ex, s.y, 7, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.shadowBlur  = 0;
        ctx.restore();
    });
}

function checkLaserHits() {
    activeLasers.forEach(laser => {
        // Thin hitbox: 8px tolerance (not too punishing)
        if (Math.abs(player.y - laser.worldY) < player.radius * 0.5 + 4) {
            player.takeDamage(1);
        }
    });
}

// =========================
const player = {
    x: 200, y: FLOOR_Y - 60,
    radius: 16, dx: 0, dy: 0,
    gravity: 0.15, friction: 0.92, speed: 0.65,
    isDashing: false, canDash: true, dashTimer: 0,
    dashSpeed: 14, dashDuration: 15,
    maxHP: 5, hp: 5,
    invincibilityFrames: 0,
    onFloor: false,
    // 🐙 Tentacle Ability
    tentacleCooldown: 0, TENTACLE_CD: 10,
    isTentacleActive: false, tentacleTimer: 0,
    TENTACLE_DURATION: 0.65, TENTACLE_RADIUS: 300,

    draw() {
        const s = camera.toScreen(this.x, this.y);
        if (this.isDashing) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, this.radius + 10, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fill();
            ctx.closePath();
        }
        // Flash when hit
        const isFlashing = this.invincibilityFrames > 0 && Math.floor(this.invincibilityFrames / 5) % 2 === 0;
        if (!isFlashing) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle   = this.isDashing ? "#ffffff" : "#00ffff";
            ctx.shadowColor = this.isDashing ? "#ffffff" : "#00ffff";
            ctx.shadowBlur  = 18;
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.closePath();
        }
    },

    update() {
        if (this.invincibilityFrames > 0) this.invincibilityFrames--;

        if (this.isDashing) {
            this.dashTimer--;
            if (this.dashTimer <= 0) {
                this.isDashing = false; this.dx *= 0.4; this.dy *= 0.4;
            }
        } else {
            this.dy += this.gravity;

            if (this.onFloor) {
                // —— GROUND: slippery! High momentum, less precision control ——
                if (isHeld("left"))  this.dx -= this.speed * 0.75;
                if (isHeld("right")) this.dx += this.speed * 0.75;
                this.dx *= 0.975; // Slippery ground — you slide a lot
            } else {
                // —— AIR: reduced control + inertia + wind drift ——
                const airMult = 0.32;
                if (isHeld("left"))  this.dx -= this.speed * airMult;
                if (isHeld("right")) this.dx += this.speed * airMult;
                if (isHeld("up"))    this.dy -= 0.08;
                this.dx *= 0.988;     // Floaty inertia in air
                this.dx += windDrift; // Wind drift
            }
        }

        this.x += this.dx; this.y += this.dy;

        // ---- Floor (the actual ocean floor — resets platform timers) ----
        this.onFloor = false;
        if (this.x - this.radius < 0) { this.x = this.radius; this.dx = 0; }
        if (this.y + this.radius > FLOOR_Y) {
            // Landing slide: transfer downward momentum into horizontal skid
            if (!this.onFloor && this.dy > 3) {
                this.dx += (this.dx >= 0 ? 1 : -1) * this.dy * 0.35;
            }
            this.y       = FLOOR_Y - this.radius;
            this.dy      = 0;
            this.canDash = true;
            this.onFloor = true;
        }
        if (this.y - this.radius < 0) {
            // Allow passage through the ceiling gap
            const inGap = this.x > CEILING_GAP_X && this.x < CEILING_GAP_X + CEILING_GAP_W;
            if (!inGap) {
                this.y  = this.radius;
                this.dy = 0;
            } else {
                // ✨ Entering the upper zone!
                inUpperZone = true;
                if (!hasUnlockedTentacle) {
                    hasUnlockedTentacle = true;
                    abilityAlertTimer   = 4.5;
                }
            }
            // Hard ceiling of upper zone
            if (this.y - this.radius < UPPER_CEILING_Y) {
                this.y  = UPPER_CEILING_Y + this.radius;
                this.dy = 0;
            }
        }
        // Track leaving upper zone
        if (this.y > 60) inUpperZone = false;
    },

    tryDash() {
        if (!this.canDash || this.isDashing) return;
        this.isDashing = true; this.canDash = false; this.dashTimer = this.dashDuration;
        let dirX = 0, dirY = 0;
        if (isHeld("left"))  dirX = -1;
        if (isHeld("right")) dirX =  1;
        if (isHeld("up"))    dirY = -1;
        if (isHeld("down"))  dirY =  1;
        if (dirX === 0 && dirY === 0) dirX = this.dx >= 0 ? 1 : -1;
        const len = Math.sqrt(dirX*dirX + dirY*dirY);
        this.dx = (dirX/len) * this.dashSpeed;
        this.dy = (dirY/len) * this.dashSpeed;
    },

    triggerPredatorBoost(strength) {
        this.isDashing = false; this.dy = -strength; this.canDash = true;
    },

    takeDamage(amount) {
        if (this.invincibilityFrames > 0) return;
        this.hp = Math.max(0, this.hp - amount);
        this.invincibilityFrames = 90; // ~1.5 seconds of invincibility
        if (this.hp <= 0) this.die();
    },

    die() {
        // Reset for now — full death screen can come later
        this.hp = this.maxHP;
        this.x  = 200;
        this.y  = FLOOR_Y - 60;
        this.dx = 0; this.dy = 0;
    }
};

// =========================
// ✅ COLLISIONS
// =========================
function checkEnemyCollisions() {
    worldEnemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        if (dist(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
            if (player.isDashing) {
                enemy.onHit(player); // Predator Boost (defined per enemy type)
            } else {
                player.takeDamage(1); // Walking into an enemy hurts
            }
        }
    });
}

function checkVentCollisions() {
    worldVents.forEach(vent => {
        if (dist(player.x, player.y, vent.x, vent.y) < player.radius + vent.radius) {
            if (player.isDashing) player.triggerPredatorBoost(18);
        }
    });
}

// =========================
// 🔫 GLOBAL SHOOT TIMER
// All FlyingShooters fire at the same moment every 10s
// =========================
function handleGlobalShot() {
    if (gameTime < nextShooterShot) return;
    nextShooterShot = gameTime + SHOOTER_COOLDOWN;
    worldEnemies.forEach(e => {
        if (e.type === "flyingshooter") e.shoot();
    });
}

// =========================
// 🎨 DRAW
// =========================
function drawBackground() {
    if (bgLoaded) {
        const bw = bgImage.naturalWidth  || canvas.width;
        const bh = bgImage.naturalHeight || canvas.height;
        const px = (camera.x * 0.6) % bw;
        const py = (camera.y * 0.3) % bh;
        ctx.save();
        ctx.translate(-px, -py);
        for (let x = -bw; x < canvas.width + bw; x += bw)
            for (let y = -bh; y < canvas.height + bh; y += bh)
                ctx.drawImage(bgImage, x, y, bw, bh);
        ctx.restore();
    } else {
        const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bg.addColorStop(0, "#050b14");
        bg.addColorStop(1, "#071e37");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawProjectiles() {
    projectiles.forEach(p => {
        const s = camera.toScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle   = p.large ? "#ff9900" : "#ff4488";
        ctx.shadowColor = p.large ? "#ff9900" : "#ff4488";
        ctx.shadowBlur  = p.large ? 20 : 12;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.closePath();
    });
}

function drawFloor() {
    const floorScreen = camera.toScreen(0, FLOOR_Y);
    const floorGrad = ctx.createLinearGradient(0, floorScreen.y, 0, canvas.height);
    floorGrad.addColorStop(0, "rgba(88, 166, 255, 0.15)");
    floorGrad.addColorStop(1, "rgba(10, 30, 60, 0.5)");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorScreen.y, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(0, floorScreen.y);
    ctx.lineTo(canvas.width, floorScreen.y);
    ctx.strokeStyle = "rgba(88,166,255,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawVents() {
    worldVents.forEach(vent => {
        const s = camera.toScreen(vent.x, vent.y);
        const steamH = 250;
        const steam = ctx.createLinearGradient(s.x, s.y - steamH, s.x, s.y);
        steam.addColorStop(0, "rgba(255,120,0,0)");
        steam.addColorStop(1, "rgba(255,120,0,0.15)");
        ctx.fillStyle = steam;
        ctx.fillRect(s.x - vent.radius * 0.4, s.y - steamH, vent.radius * 0.8, steamH);
        ctx.beginPath();
        ctx.arc(s.x, s.y, vent.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,110,0,0.6)";
        ctx.shadowColor = "#ff8800"; ctx.shadowBlur = 24;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.closePath();
    });
}

// =========================
// 🌊 UPPER ZONE FUNCTIONS
// =========================
function updateUpperZone(delta) {
    if (!inUpperZone) { upperWaveTimer = 3; return; }
    upperWaveTimer -= delta;
    if (upperWaveTimer > 0) return;
    upperWaveTimer = 4.0; // Spawn wave every 4s
    // Spawn 3-4 hard enemies spread around the player
    const count = 3 + (Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const d = 380 + Math.random() * 200;
        const ex = player.x + Math.cos(angle) * d;
        const ey = Math.max(UPPER_CEILING_Y + 60, Math.min(-60, player.y + Math.sin(angle) * d));
        worldEnemies.push(new FlyingShooter(ex, ey, -1));
    }
}

function drawCeiling() {
    const cY = camera.toScreen(0, 0).y;
    const gL = camera.toScreen(CEILING_GAP_X, 0).x;
    const gR = camera.toScreen(CEILING_GAP_X + CEILING_GAP_W, 0).x;
    ctx.strokeStyle = 'rgba(88,166,255,0.35)';
    ctx.lineWidth   = 2;
    // Left side of ceiling line
    ctx.beginPath(); ctx.moveTo(0, cY); ctx.lineTo(Math.max(0, gL), cY); ctx.stroke();
    // Right side
    ctx.beginPath(); ctx.moveTo(Math.min(canvas.width, gR), cY); ctx.lineTo(canvas.width, cY); ctx.stroke();
    // Gap pulsing highlight — calls the player to explore upward
    if (gR > 0 && gL < canvas.width) {
        ctx.strokeStyle = `rgba(0,255,190,${0.35 + Math.sin(gameTime * 3) * 0.25})`;
        ctx.lineWidth   = 3;
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur  = 12;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, gL), cY);
        ctx.lineTo(Math.min(canvas.width, gR), cY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw a massive glowing beam downwards so they can see it from the floor
        const beamGrad = ctx.createLinearGradient(0, cY, 0, cY + 1200);
        beamGrad.addColorStop(0, 'rgba(0,255,190,0.25)');
        beamGrad.addColorStop(1, 'rgba(0,255,190,0)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(Math.max(0, gL), cY, Math.min(canvas.width, gR) - Math.max(0, gL), 1200);
    }
    // Upper zone background tint when player is there
    if (inUpperZone) {
        const tintGrad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.4);
        tintGrad.addColorStop(0, 'rgba(60,0,80,0.35)');
        tintGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = tintGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height * 0.5);
    }
}

// =========================
// 🐙 TENTACLE ABILITY
// =========================
function fireTentacle() {
    if (!hasUnlockedTentacle)          return;
    if (player.tentacleCooldown > 0)   return;
    if (player.isTentacleActive)       return;
    player.isTentacleActive  = true;
    player.tentacleTimer     = player.TENTACLE_DURATION;
    player.tentacleCooldown  = player.TENTACLE_CD;
    // Instant hit: kill all enemies within radius
    worldEnemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        if (dist(player.x, player.y, enemy.x, enemy.y) < player.TENTACLE_RADIUS) {
            enemy.onHit(player);
        }
    });
}

function updateTentacle(delta) {
    if (player.tentacleCooldown > 0) player.tentacleCooldown = Math.max(0, player.tentacleCooldown - delta);
    if (player.isTentacleActive) {
        player.tentacleTimer -= delta;
        if (player.tentacleTimer <= 0) player.isTentacleActive = false;
    }
    if (abilityAlertTimer > 0) abilityAlertTimer -= delta;
}

function drawTentacle() {
    if (!player.isTentacleActive) return;
    const s        = camera.toScreen(player.x, player.y);
    const progress = 1 - (player.tentacleTimer / player.TENTACLE_DURATION); // 0→1
    const extend   = Math.min(1, progress * 1.8);
    const alpha    = progress > 0.7 ? (1 - progress) / 0.3 : 1;
    for (let i = 0; i < 6; i++) {
        const angle  = (i / 6) * Math.PI * 2;
        const len    = player.TENTACLE_RADIUS * extend;
        const wave   = Math.sin(progress * Math.PI * 5 + i * 1.2) * 22;
        const midX   = s.x + Math.cos(angle + 0.5) * len * 0.55 + Math.cos(angle + Math.PI/2) * wave;
        const midY   = s.y + Math.sin(angle + 0.5) * len * 0.55 + Math.sin(angle + Math.PI/2) * wave;
        const endX   = s.x + Math.cos(angle) * len;
        const endY   = s.y + Math.sin(angle) * len;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth   = Math.max(1, 5 - progress * 3);
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur  = 20;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(midX, midY, endX, endY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }
    // Center burst
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, player.TENTACLE_RADIUS * extend, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,255,180,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function drawAbilityAlert() {
    if (abilityAlertTimer <= 0) return;
    const a = Math.min(1, abilityAlertTimer);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign   = 'center';
    const cw = canvas.width, ch = canvas.height;
    // Panel
    ctx.fillStyle = 'rgba(0,140,100,0.18)';
    ctx.beginPath();
    ctx.roundRect(cw/2 - 230, ch * 0.38, 460, 110, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,180,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Icon + title
    ctx.fillStyle   = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 18;
    ctx.font = 'bold 24px Outfit, sans-serif';
    ctx.fillText('✨ New Ability Unlocked!', cw/2, ch * 0.38 + 42);
    ctx.shadowBlur = 0;
    // Description
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '15px Outfit, sans-serif';
    ctx.fillText(`🐙 Tentacle Strike  [ ${keyCodeToLabel(controls.tentacle)} ]  ·  10s cooldown`, cw/2, ch * 0.38 + 76);
    ctx.textAlign = 'left';
    ctx.restore();
}

function drawHUD() {
    // ---- HP BAR ----
    const barX = 20, barY = 20;
    const barW = 160, barH = 14;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 6);
    ctx.fill();

    const hpFill = (player.hp / player.maxHP) * barW;
    const hpColor = player.hp > 2 ? "#00ffcc" : player.hp > 1 ? "#ffaa00" : "#ff3344";
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(barX, barY, hpFill, barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px Outfit, sans-serif";
    ctx.fillText("HP", barX + barW + 8, barY + 11);

    // ---- TENTACLE COOLDOWN BAR ----
    if (hasUnlockedTentacle) {
        const tBarY  = barY + barH + 10;
        const cdFrac = player.tentacleCooldown > 0
            ? (1 - player.tentacleCooldown / player.TENTACLE_CD) * barW : barW;
        const tColor = player.tentacleCooldown > 0 ? '#8855ff' : '#00ffcc';
        const label  = player.tentacleCooldown > 0
            ? `${keyCodeToLabel(controls.tentacle)} ${Math.ceil(player.tentacleCooldown)}s`
            : `${keyCodeToLabel(controls.tentacle)} READY`;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.roundRect(barX - 2, tBarY - 2, barW + 4, barH + 4, 6); ctx.fill();
        ctx.fillStyle   = tColor;
        ctx.shadowColor = tColor; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.roundRect(barX, tBarY, cdFrac, barH, 4); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle  = 'rgba(255,255,255,0.5)';
        ctx.font = '11px Outfit, sans-serif';
        ctx.fillText(label, barX + barW + 8, tBarY + 11);
    }

    // Enemy legend at bottom
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "13px Outfit, sans-serif";
    ctx.fillText(
        `[${keyCodeToLabel(controls.dash)}] Dash  ·  ⭕ Passive  🟢 Ground Fish  🟠 Flyer  🔴 Shooter`,
        16, canvas.height - 16
    );

    // ---- DEBUG COORDINATES ----
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "14px Outfit, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`X: ${Math.floor(player.x)}   Y: ${Math.floor(player.y)}`, canvas.width - 20, 30);
    ctx.textAlign = "left"; // Reset
}

function drawScene() {
    drawBackground();
    drawFloor();
    drawCeiling();        // Ceiling line with glowing gap
    drawLasers();
    drawDecayBursts();
    drawPlatforms();
    drawVents();
    worldEnemies.forEach(e => e.draw());
    drawProjectiles();
    drawTentacle();       // Tentacle overlay above enemies
    player.draw();
    drawHUD();
    drawAbilityAlert();   // Ability unlock banner (top layer)
}

// =========================
// ⏸️ PAUSE OVERLAY
// =========================
function drawPauseOverlay() {
    // Dim the scene
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Panel
    const pw = 340, ph = 180;
    const px = (canvas.width  - pw) / 2;
    const py = (canvas.height - ph) / 2;
    ctx.fillStyle = "rgba(8, 20, 40, 0.92)";
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(88, 196, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Title
    ctx.textAlign = "center";
    ctx.font = "bold 32px Outfit, sans-serif";
    ctx.fillStyle = "#58c4ff";
    ctx.shadowColor = "#58c4ff";
    ctx.shadowBlur  = 16;
    ctx.fillText("PAUSED", canvas.width / 2, py + 68);
    ctx.shadowBlur  = 0;

    // Subtitle
    ctx.font = "15px Outfit, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("Press  ESC  to resume", canvas.width / 2, py + 108);

    ctx.textAlign = "left"; // Reset alignment
}

// =========================
// 🎮 GAME LOOP
// =========================
function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const delta = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    if (!isPaused) {
        gameTime += delta;

        // Wind: slowly drift toward a random target, change direction every ~3s
        windTimer -= delta;
        if (windTimer <= 0) {
            windTarget = (Math.random() - 0.5) * 0.07;
            windTimer  = 2.5 + Math.random() * 2;
        }
        windDrift += (windTarget - windDrift) * 0.01; // smooth interpolation

        // Update
        player.update();
        camera.follow(player);
        updateChunks();
        recordAirTrail(delta);
        updatePlatforms(delta);
        updateLasers(delta);
        updateDecayBursts(delta);
        updateTentacle(delta);        // Tentacle cooldown + animation
        updateUpperZone(delta);       // Enemy waves in upper zone
        worldEnemies.forEach(e => e.update());
        updateProjectiles();

        checkPlatformCollisions();
        checkEnemyCollisions();
        checkVentCollisions();
        checkProjectileHits();
        checkLaserHits();
        checkDecayBurstHits();
        handleGlobalShot();
    }

    // Always draw (so pause overlay appears over frozen frame)
    drawScene();
    if (isPaused) drawPauseOverlay();

    requestAnimationFrame(gameLoop);
}

function startGame() {
    generateChunk(0);
    requestAnimationFrame(gameLoop);
}
