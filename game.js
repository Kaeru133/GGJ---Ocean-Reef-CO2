// ==========================================================
// 🌊 SEA OF BLEACH - Game Script
// State Machine: INTRO → SETTINGS → GAME
// ==========================================================

// --- DOM REFERENCES ---
const screenIntro    = document.getElementById("screen-intro");
const screenSettings = document.getElementById("screen-settings");
const screenGame     = document.getElementById("screen-game");
const trailerVideo   = document.getElementById("trailer-video");
const bindingHint    = document.getElementById("binding-hint");
const startGameBtn   = document.getElementById("start-game-btn");

// ===========================================================
// 🎬 SCREEN 1: INTRO VIDEO
// ===========================================================

const controls = {
    up:    "KeyW",
    left:  "KeyA",
    down:  "KeyS",
    right: "KeyD",
    dash:  "Space"
};

function goToSettings() {
    screenIntro.classList.add("hidden");
    screenSettings.classList.remove("hidden");
    renderKeyLabels();
}

window.addEventListener("keydown", (e) => {
    if (!screenIntro.classList.contains("hidden") && e.key === "0") {
        trailerVideo.pause();
        goToSettings();
    }
});

trailerVideo.addEventListener("ended", goToSettings);
trailerVideo.addEventListener("error", () => {
    console.warn("No trailer found. Skipping to settings.");
    setTimeout(goToSettings, 800);
});

// ===========================================================
// ⌨️ SCREEN 2: SETTINGS
// ===========================================================

function keyCodeToLabel(code) {
    if (code === "Space")         return "Space";
    if (code.startsWith("Key"))   return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Arrow")) return code.slice(5);
    if (code.startsWith("Numpad")) return "Num" + code.slice(6);
    return code;
}

function renderKeyLabels() {
    for (const [action, code] of Object.entries(controls)) {
        const btn = document.querySelector(`[data-action="${action}"]`);
        if (btn) btn.textContent = keyCodeToLabel(code);
    }
}

let listeningAction = null;
let listeningButton = null;

document.querySelectorAll(".key-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (listeningButton && listeningButton !== btn) {
            listeningButton.classList.remove("listening");
        }
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
        if (e.code === "Digit0") {
            bindingHint.textContent = '"0" is reserved for skipping the trailer. Try another key.';
            return;
        }
        controls[listeningAction] = e.code;
        listeningButton.classList.remove("listening");
        listeningButton.textContent = keyCodeToLabel(e.code);
        listeningAction = null;
        listeningButton = null;
        bindingHint.classList.add("hidden");
    }
});

startGameBtn.addEventListener("click", () => {
    screenSettings.classList.add("hidden");
    screenGame.classList.remove("hidden");
    startGame();
});

// ===========================================================
// 🎮 SCREEN 3: THE GAME
// ===========================================================

const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

// Input tracking
const keysDown = new Set();
window.addEventListener("keydown", (e) => {
    if (screenGame.classList.contains("hidden")) return;
    keysDown.add(e.code);
    if (e.code === controls.dash) player.tryDash();
});
window.addEventListener("keyup", (e) => keysDown.delete(e.code));

function isHeld(action) { return keysDown.has(controls[action]); }

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// =============================================================
// 📷 CAMERA — follows the player through the big world
// =============================================================
const camera = {
    x: 0, // Top-left corner of the visible area in world-space
    y: 0,
    width:  canvas.width,
    height: canvas.height,

    // Convert world coordinates to screen coordinates for drawing
    toScreen(wx, wy) {
        return { x: wx - this.x, y: wy - this.y };
    },

    follow(target) {
        // Center camera on the player
        this.x = target.x - this.width  / 2;
        this.y = target.y - this.height / 2;

        // Clamp so camera never shows past the world bounds
        this.x = Math.max(0, Math.min(this.x, WORLD_WIDTH  - this.width));
        this.y = Math.max(0, Math.min(this.y, WORLD_HEIGHT - this.height));
    }
};

// =============================================================
// 🌍 WORLD SIZE — big open ocean to explore
// =============================================================
const WORLD_WIDTH  = 3200; // 4× the canvas width
const WORLD_HEIGHT = 1600; // 2.67× the canvas height

// The floor lives at the bottom of the world
const FLOOR_Y = WORLD_HEIGHT - 10;

// =============================================================
// 🌊 PLAYER (KARU)
// =============================================================
const player = {
    x: 400, y: WORLD_HEIGHT - 80, // Place near the floor at start
    radius: 16,
    dx: 0, dy: 0,

    gravity: 0.15,
    friction: 0.92,
    speed: 0.6,

    isDashing: false,
    canDash: true,
    dashTimer: 0,
    dashSpeed: 14,
    dashDuration: 15,

    draw(cam) {
        const s = cam.toScreen(this.x, this.y);

        // Dash glow ring
        if (this.isDashing) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, this.radius + 10, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
            ctx.fill();
            ctx.closePath();
        }

        // Cyan body dot
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.isDashing ? "#ffffff" : "#00ffff";
        ctx.shadowColor = this.isDashing ? "#ffffff" : "#00ffff";
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    },

    update() {
        if (this.isDashing) {
            this.dashTimer--;
            if (this.dashTimer <= 0) {
                this.isDashing = false;
                this.dx *= 0.4;
                this.dy *= 0.4;
            }
        } else {
            this.dy += this.gravity;
            if (isHeld("left"))  this.dx -= this.speed;
            if (isHeld("right")) this.dx += this.speed;
            if (isHeld("up"))    this.dy -= 0.12; // Slight upward assist

            this.dx *= this.friction;
        }

        this.x += this.dx;
        this.y += this.dy;

        // World boundaries
        if (this.x - this.radius < 0)            { this.x = this.radius; this.dx = 0; }
        if (this.x + this.radius > WORLD_WIDTH)   { this.x = WORLD_WIDTH - this.radius; this.dx = 0; }
        if (this.y - this.radius < 0)             { this.y = this.radius; this.dy = 0; }
        if (this.y + this.radius > FLOOR_Y)       {
            this.y = FLOOR_Y - this.radius;
            this.dy = 0;
            this.canDash = true;
        }
    },

    tryDash() {
        if (!this.canDash || this.isDashing) return;
        this.isDashing = true;
        this.canDash   = false;
        this.dashTimer = this.dashDuration;

        let dirX = 0, dirY = 0;
        if (isHeld("left"))  dirX = -1;
        if (isHeld("right")) dirX =  1;
        if (isHeld("up"))    dirY = -1;
        if (isHeld("down"))  dirY =  1;
        if (dirX === 0 && dirY === 0) dirX = this.dx >= 0 ? 1 : -1;

        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        this.dx = (dirX / len) * this.dashSpeed;
        this.dy = (dirY / len) * this.dashSpeed;
    },

    triggerPredatorBoost(strength) {
        this.isDashing = false;
        this.dy        = -strength;
        this.canDash   = true;
    }
};

// =============================================================
// 💀 ENEMIES — scattered across the world
//    (Green = Gas Phantom. Dash into them → Predator Boost up!)
// =============================================================
const enemies = [
    { x: 500,  y: 1400, radius: 22, isAlive: true },
    { x: 850,  y: 1200, radius: 22, isAlive: true },
    { x: 1100, y: 1300, radius: 22, isAlive: true },
    { x: 1400, y: 1100, radius: 22, isAlive: true },
    { x: 1700, y: 900,  radius: 22, isAlive: true },
    { x: 2000, y: 1350, radius: 22, isAlive: true },
    { x: 2300, y: 1150, radius: 22, isAlive: true },
    { x: 2600, y: 1000, radius: 22, isAlive: true },
    { x: 2900, y: 1300, radius: 22, isAlive: true },
];

// =============================================================
// 🌋 THERMAL VENTS — scattered across the world
//    (Orange = Thermal Vent. Dash into them → MEGA launch up!)
// =============================================================
const vents = [
    { x: 1200, y: FLOOR_Y - 40, radius: 34 },
    { x: 2000, y: FLOOR_Y - 40, radius: 34 },
    { x: 2800, y: FLOOR_Y - 40, radius: 34 },
];

// =============================================================
// 🖼️ DRAW SCENE (all in world-space, converted via camera)
// =============================================================
function drawScene() {
    // Background gradient (sky of bleach / deep ocean)
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#050b14");
    bg.addColorStop(1, "#071e37");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ---- FLOOR ----
    const floorScreen = camera.toScreen(0, FLOOR_Y);
    ctx.fillStyle = "rgba(88, 166, 255, 0.08)";
    ctx.fillRect(0, floorScreen.y, canvas.width, canvas.height - floorScreen.y);

    ctx.beginPath();
    ctx.moveTo(0, floorScreen.y);
    ctx.lineTo(canvas.width, floorScreen.y);
    ctx.strokeStyle = "rgba(88, 166, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // ---- THERMAL VENTS ----
    vents.forEach(vent => {
        const s = camera.toScreen(vent.x, vent.y);

        // Draw vertical "steam" column to hint the upward launch
        const steamGrad = ctx.createLinearGradient(s.x, s.y - 200, s.x, s.y);
        steamGrad.addColorStop(0, "rgba(255, 130, 0, 0)");
        steamGrad.addColorStop(1, "rgba(255, 130, 0, 0.12)");
        ctx.fillStyle = steamGrad;
        ctx.fillRect(s.x - vent.radius / 2, s.y - 200, vent.radius, 200);

        // Orange dot body
        ctx.beginPath();
        ctx.arc(s.x, s.y, vent.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 130, 0, 0.5)";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    });

    // ---- ENEMIES ----
    enemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        const s = camera.toScreen(enemy.x, enemy.y);

        ctx.beginPath();
        ctx.arc(s.x, s.y, enemy.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#adff2f";
        ctx.shadowColor = "#adff2f";
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    });

    // ---- PLAYER ----
    player.draw(camera);

    // ---- HUD ----
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "13px Outfit, sans-serif";
    ctx.fillText(
        `[${keyCodeToLabel(controls.dash)}] Dash  ·  [${keyCodeToLabel(controls.left)}/${keyCodeToLabel(controls.right)}] Move  ·  🟢 Enemy (boost)  🟠 Vent (mega-launch)`,
        14, canvas.height - 14
    );

    // World position debug (top right corner)
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "11px monospace";
    ctx.fillText(`x:${Math.round(player.x)}  y:${Math.round(player.y)}`, canvas.width - 130, 20);
}

// =============================================================
// ✅ COLLISION DETECTION (in world-space)
// =============================================================
function checkCollisions() {
    enemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        if (distance(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
            if (player.isDashing) {
                enemy.isAlive = false;
                player.triggerPredatorBoost(10);
                setTimeout(() => { enemy.isAlive = true; }, 2000);
            }
        }
    });

    vents.forEach(vent => {
        if (distance(player.x, player.y, vent.x, vent.y) < player.radius + vent.radius) {
            if (player.isDashing) {
                player.triggerPredatorBoost(18);
            }
        }
    });
}

// =============================================================
// 🎮 GAME LOOP
// =============================================================
function gameLoop() {
    player.update();
    camera.follow(player);
    checkCollisions();
    drawScene();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    gameLoop();
}
