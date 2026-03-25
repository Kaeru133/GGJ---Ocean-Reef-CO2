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
const controls = { up:"KeyW", left:"KeyA", down:"KeyS", right:"KeyD", dash:"Space" };

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
window.addEventListener("keydown", (e) => {
    if (screenGame.classList.contains("hidden")) return;
    keysDown.add(e.code);
    if (e.code === controls.dash) player.tryDash();
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

// =========================
// 🌍 WORLD CONFIG
// =========================
const FLOOR_Y      = 1200;
const CHUNK_WIDTH  = 800;

// =========================
// 🕐 GLOBAL GAME TIMER (seconds)
// Used for synchronized enemy shooting
// =========================
let gameTime       = 0;
let lastFrameTime  = null;

// Global shot cooldowns (all shooting enemies fire together)
const SHOOTER_COOLDOWN = 10; // seconds — flying shooters
let nextShooterShot    = 10; // fire first shot after 10s

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
let worldEnemies = [];
let worldVents   = [];

function getChunkIndex(worldX) { return Math.floor(worldX / CHUNK_WIDTH); }

function generateChunk(chunkIndex) {
    if (generatedChunks.has(chunkIndex)) return;
    generatedChunks.add(chunkIndex);
    const cx = chunkIndex * CHUNK_WIDTH;

    // Chunk 0 = tutorial space with just passive bouncers
    if (chunkIndex === 0) {
        worldEnemies.push(new PassiveBouncer(cx + 400, 900, chunkIndex));
        worldEnemies.push(new PassiveBouncer(cx + 650, 700, chunkIndex));
        return;
    }

    // Generate a mix of enemies per chunk
    const rand = () => cx + 80 + Math.random() * (CHUNK_WIDTH - 160);
    const randY = (min, max) => min + Math.random() * (max - min);

    // Passive Bouncer — always present, floats mid-air
    worldEnemies.push(new PassiveBouncer(rand(), randY(400, 900), chunkIndex));

    // Ground Fish — patrols the floor
    worldEnemies.push(new GroundFish(rand(), FLOOR_Y, chunkIndex));
    if (chunkIndex > 2) worldEnemies.push(new GroundFish(rand(), FLOOR_Y, chunkIndex));

    // Flyer — appears from chunk 2+
    if (chunkIndex >= 2) {
        worldEnemies.push(new Flyer(rand(), randY(300, 900), chunkIndex));
    }

    // Flying Shooter — appears from chunk 4+, rarer
    if (chunkIndex >= 4 && Math.random() > 0.4) {
        worldEnemies.push(new FlyingShooter(rand(), randY(300, 800), chunkIndex));
    }

    // Thermal Vent — every 3 chunks
    if (chunkIndex % 3 === 0) {
        worldVents.push({ x: cx + CHUNK_WIDTH / 2, y: FLOOR_Y - 30, radius: 34, chunk: chunkIndex });
    }
}

function cullOldChunks(currentChunk) {
    const cutoff = currentChunk - 5;
    worldEnemies = worldEnemies.filter(e => e.chunk >= cutoff);
    worldVents   = worldVents.filter(v => v.chunk >= cutoff);
    for (const c of generatedChunks) { if (c < cutoff) generatedChunks.delete(c); }
}

function updateChunks() {
    const cc = getChunkIndex(player.x);
    for (let i = cc; i <= cc + 3; i++) generateChunk(i);
    cullOldChunks(cc);
}

// =========================
// 🌊 PLAYER
// =========================
const player = {
    x: 200, y: FLOOR_Y - 60,
    radius: 16, dx: 0, dy: 0,
    gravity: 0.15, friction: 0.92, speed: 0.65,
    isDashing: false, canDash: true, dashTimer: 0,
    dashSpeed: 14, dashDuration: 15,
    // Health
    maxHP: 5, hp: 5,
    invincibilityFrames: 0,

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
            if (isHeld("left"))  this.dx -= this.speed;
            if (isHeld("right")) this.dx += this.speed;
            if (isHeld("up"))    this.dy -= 0.12;
            this.dx *= this.friction;
        }

        this.x += this.dx; this.y += this.dy;

        if (this.x - this.radius < 0)       { this.x = this.radius; this.dx = 0; }
        if (this.y + this.radius > FLOOR_Y)  { this.y = FLOOR_Y - this.radius; this.dy = 0; this.canDash = true; }
        if (this.y - this.radius < 0)        { this.y = this.radius; this.dy = 0; }
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

    // Enemy legend at bottom
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "13px Outfit, sans-serif";
    ctx.fillText(
        `[${keyCodeToLabel(controls.dash)}] Dash  ·  ⭕ Passive  🟢 Ground Fish  🟠 Flyer  🔴 Shooter`,
        16, canvas.height - 16
    );
}

function drawScene() {
    drawBackground();
    drawFloor();
    drawVents();
    worldEnemies.forEach(e => e.draw());
    drawProjectiles();
    player.draw();
    drawHUD();
}

// =========================
// 🎮 GAME LOOP
// =========================
function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const delta = (timestamp - lastFrameTime) / 1000; // seconds
    lastFrameTime = timestamp;
    gameTime += delta;

    // Update
    player.update();
    camera.follow(player);
    updateChunks();
    worldEnemies.forEach(e => e.update());
    updateProjectiles();

    // Collisions
    checkEnemyCollisions();
    checkVentCollisions();
    checkProjectileHits();

    // Global enemy shot timer
    handleGlobalShot();

    // Draw
    drawScene();

    requestAnimationFrame(gameLoop);
}

function startGame() {
    generateChunk(0);
    requestAnimationFrame(gameLoop);
}
