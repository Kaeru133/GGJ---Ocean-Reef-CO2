// ==========================================================
// 🌊 OCEAN REEF CO2 - Game Script
// State Machine: INTRO → SETTINGS → GAME
// ==========================================================

// --- DOM REFERENCES ---
const screenIntro    = document.getElementById("screen-intro");
const screenSettings = document.getElementById("screen-settings");
const screenGame     = document.getElementById("screen-game");
const trailerVideo   = document.getElementById("trailer-video");
const skipHint       = document.getElementById("skip-hint");
const bindingHint    = document.getElementById("binding-hint");
const startGameBtn   = document.getElementById("start-game-btn");

// ===========================================================
// 🎬 SCREEN 1: INTRO VIDEO
// ===========================================================

// Default keybindings
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

// Skip trailer on "0" key press
window.addEventListener("keydown", (e) => {
    if (!screenIntro.classList.contains("hidden") && e.key === "0") {
        trailerVideo.pause();
        goToSettings();
    }
});

// After trailer ends naturally → go to settings
trailerVideo.addEventListener("ended", goToSettings);

// If NO video file is found, automatically skip to settings after 1 second
trailerVideo.addEventListener("error", () => {
    console.warn("No trailer found at Assets/Videos/trailer.mp4. Skipping to settings.");
    setTimeout(goToSettings, 800);
});

// ===========================================================
// ⌨️ SCREEN 2: SETTINGS - KEY BINDING
// ===========================================================

// Map a key code to a short readable label for the button
function keyCodeToLabel(code) {
    if (code === "Space")       return "Space";
    if (code.startsWith("Key")) return code.slice(3); // "KeyW" → "W"
    if (code.startsWith("Digit")) return code.slice(5); // "Digit1" → "1"
    if (code.startsWith("Arrow")) return code.slice(5); // "ArrowUp" → "Up"
    if (code.startsWith("Numpad")) return "Num" + code.slice(6);
    return code;
}

function renderKeyLabels() {
    for (const [action, code] of Object.entries(controls)) {
        const btn = document.querySelector(`[data-action="${action}"]`);
        if (btn) btn.textContent = keyCodeToLabel(code);
    }
}

let listeningAction = null; // Which action are we currently rebinding?
let listeningButton = null;

document.querySelectorAll(".key-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        // If another button was already listening, reset it
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
    // If we are in keybinding mode
    if (listeningAction !== null && !screenSettings.classList.contains("hidden")) {
        e.preventDefault();

        // Don't allow binding the "0" key (reserved for skip)
        if (e.code === "Digit0") {
            bindingHint.textContent = '"0" is reserved for skipping the trailer. Press a different key.';
            bindingHint.classList.remove("hidden");
            return;
        }

        // Assign new keybinding
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

// Input live state — checked each frame using the controls map
const keysDown = new Set();

window.addEventListener("keydown", (e) => {
    if (!screenGame.classList.contains("hidden")) {
        keysDown.add(e.code);
        if (e.code === controls.dash) player.tryDash();
    }
});
window.addEventListener("keyup", (e) => keysDown.delete(e.code));

function isHeld(action) {
    return keysDown.has(controls[action]);
}

// MATH HELPER
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// 🌊 PLAYER (KARU) - Cyan Dot for now
const player = {
    x: 400, y: 480,
    radius: 16,
    dx: 0, dy: 0,

    // Physics configs
    gravity: 0.15,
    friction: 0.92,
    speed: 0.5,

    // Predator Dash System
    isDashing: false,
    canDash: true,
    dashTimer: 0,
    dashSpeed: 14,
    dashDuration: 15,

    draw() {
        // Outer glow ring when dashing
        if (this.isDashing) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            ctx.fill();
            ctx.closePath();
        }
        // Main body dot (Cyan = Karu)
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.isDashing ? "#ffffff" : "#00ffff";
        ctx.shadowColor = this.isDashing ? "#ffffff" : "#00ffff";
        ctx.shadowBlur = 16;
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
            // Floaty gravity
            this.dy += this.gravity;

            if (isHeld("left"))  this.dx -= this.speed;
            if (isHeld("right")) this.dx += this.speed;
            if (isHeld("up"))    this.dy -= 0.15; // slight upward assist (not full jump)

            this.dx *= this.friction;
        }

        this.x += this.dx;
        this.y += this.dy;

        // Floor
        if (this.y + this.radius > canvas.height) {
            this.y = canvas.height - this.radius;
            this.dy = 0;
            this.canDash = true;
        }
        // Walls
        if (this.x - this.radius < 0) { this.x = this.radius; this.dx = 0; }
        if (this.x + this.radius > canvas.width) { this.x = canvas.width - this.radius; this.dx = 0; }
        // Ceiling
        if (this.y - this.radius < 0) { this.y = this.radius; this.dy = 0; }
    },

    tryDash() {
        if (!this.canDash || this.isDashing) return;
        this.isDashing  = true;
        this.canDash    = false;
        this.dashTimer  = this.dashDuration;

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

    // 💥 Core Mechanic: Enemy kill → upward launch!
    triggerPredatorBoost(strength) {
        this.isDashing = false;
        this.dy        = -strength;
        this.canDash   = true;
    }
};

// 💀 ENEMIES — Sickly Green Dots
const enemies = [
    { x: 300, y: 400, radius: 22, isAlive: true },
    { x: 550, y: 310, radius: 22, isAlive: true },
];

// 🌋 THERMAL VENT — Orange Dot
const vents = [
    { x: 650, y: 480, radius: 32 }
];

function checkCollisions() {
    enemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        if (distance(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
            if (player.isDashing) {
                enemy.isAlive = false;
                player.triggerPredatorBoost(10);
                // Respawn enemy after 2s for testing
                setTimeout(() => { enemy.isAlive = true; }, 2000);
            }
        }
    });

    vents.forEach(vent => {
        if (distance(player.x, player.y, vent.x, vent.y) < player.radius + vent.radius) {
            if (player.isDashing) {
                player.triggerPredatorBoost(16);
            }
        }
    });
}

function drawScene() {
    // Ocean-like gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#050b14");
    bg.addColorStop(1, "#0a1f3a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Thermal Vent
    vents.forEach(vent => {
        // Glow
        const gradient = ctx.createRadialGradient(vent.x, vent.y, 0, vent.x, vent.y, vent.radius);
        gradient.addColorStop(0, "rgba(255, 165, 0, 0.5)");
        gradient.addColorStop(1, "rgba(255, 80, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(vent.x - vent.radius, vent.y - vent.radius, vent.radius * 2, vent.radius * 2);

        ctx.beginPath();
        ctx.arc(vent.x, vent.y, vent.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 130, 0, 0.4)";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    });

    // Draw Enemies
    enemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#adff2f";
        ctx.shadowColor = "#adff2f";
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    });

    // Draw Player
    player.draw();

    // HUD Hint
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "13px Outfit, sans-serif";
    ctx.fillText(`[${keyCodeToLabel(controls.dash)}] Dash · Arrow keys / WASD to move`, 14, canvas.height - 14);
}

function gameLoop() {
    player.update();
    checkCollisions();
    drawScene();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    gameLoop();
}
