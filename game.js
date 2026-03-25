const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// INPUT TRACKING
const keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false
};

window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowUp") keys.ArrowUp = true;
    if (e.code === "ArrowDown") keys.ArrowDown = true;
    if (e.code === "ArrowLeft") keys.ArrowLeft = true;
    if (e.code === "ArrowRight") keys.ArrowRight = true;
    if (e.code === "Space") {
        keys.Space = true;
        player.tryDash();
    }
});

window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowUp") keys.ArrowUp = false;
    if (e.code === "ArrowDown") keys.ArrowDown = false;
    if (e.code === "ArrowLeft") keys.ArrowLeft = false;
    if (e.code === "ArrowRight") keys.ArrowRight = false;
    if (e.code === "Space") keys.Space = false;
});

// MATH HELPER
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// 🌊 PLAYER (KARU)
const player = {
    x: 400, y: 300,
    radius: 16,
    dx: 0, dy: 0,
    
    // Configs
    gravity: 0.15, // Floaty physics!
    friction: 0.92, // Water slows horizontal speed
    speed: 0.5,
    maxFloatSpeed: 4,
    
    // Predator Boost Dash state
    isDashing: false,
    canDash: true,
    dashTimer: 0,
    dashSpeed: 12,
    dashDuration: 15, // Frames

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        // Cyan dot
        ctx.fillStyle = this.isDashing ? "#ffffff" : "#00ffff"; 
        ctx.fill();
        ctx.closePath();
    },

    update() {
        if (this.isDashing) {
            this.dashTimer--;
            if (this.dashTimer <= 0) {
                this.isDashing = false;
                this.dx *= 0.5; // lose some speed when dash ends
                this.dy *= 0.5;
            }
        } else {
            // Apply Floaty Gravity & Controls
            this.dy += this.gravity;
            
            if (keys.ArrowLeft) this.dx -= this.speed;
            if (keys.ArrowRight) this.dx += this.speed;

            // Apply water friction 
            this.dx *= this.friction;
        }

        // Apply velocities
        this.x += this.dx;
        this.y += this.dy;

        // Floor Collision (Bounce slightly, reset dash)
        if (this.y + this.radius > canvas.height) {
            this.y = canvas.height - this.radius;
            this.dy = 0;
            this.canDash = true; // Landing gives dash back
        }
        
        // Walls
        if (this.x - this.radius < 0) this.x = this.radius;
        if (this.x + this.radius > canvas.width) this.x = canvas.width - this.radius;
    },

    tryDash() {
        if (!this.canDash || this.isDashing) return;
        
        this.isDashing = true;
        this.canDash = false;
        this.dashTimer = this.dashDuration;

        // Omnidirectional Dash
        let dirX = 0;
        let dirY = 0;
        if (keys.ArrowLeft) dirX = -1;
        if (keys.ArrowRight) dirX = 1;
        if (keys.ArrowUp) dirY = -1;
        if (keys.ArrowDown) dirY = 1;

        if (dirX === 0 && dirY === 0) dirX = this.dx >= 0 ? 1 : -1; // Default dash forward

        const length = Math.sqrt(dirX*dirX + dirY*dirY);
        this.dx = (dirX / length) * this.dashSpeed;
        this.dy = (dirY / length) * this.dashSpeed;
    },

    // 💥 The Core Mechanic
    triggerPredatorBoost(launchStrength) {
        this.isDashing = false;
        this.dy = -launchStrength; // Launch Upward!
        this.canDash = true;       // Refresh dash instantly!
    }
};

// 💀 ENEMIES
const enemies = [
    { x: 300, y: 400, radius: 20, isAlive: true }
];

// 🌋 THERMAL VENT
const vents = [
    { x: 500, y: 500, radius: 30 }
];

function checkCollisions() {
    // Check Enemy Hits
    enemies.forEach(enemy => {
        if (!enemy.isAlive) return;
        if (distance(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius) {
            if (player.isDashing) {
                // Predator Boost Trigger!
                enemy.isAlive = false;
                player.triggerPredatorBoost(10); // Standard enemy bounce
                
                // Respawn enemy after 2 seconds for testing purposes
                setTimeout(() => { enemy.isAlive = true; }, 2000);
            }
        }
    });

    // Check Vent Hits
    vents.forEach(vent => {
        if (distance(player.x, player.y, vent.x, vent.y) < player.radius + vent.radius) {
            if (player.isDashing) {
                // Mega Vent Boost!
                player.triggerPredatorBoost(15); 
            }
        }
    });
}

function drawEnvironment() {
    // Draw Vents
    vents.forEach(vent => {
        ctx.beginPath();
        ctx.arc(vent.x, vent.y, vent.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 165, 0, 0.5)"; // Orange Ghost Vent
        ctx.fill();
        ctx.closePath();
    });

    // Draw Enemies
    enemies.forEach(enemy => {
        if (enemy.isAlive) {
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
            ctx.fillStyle = "#adff2f"; // Sickly green
            ctx.fill();
            ctx.closePath();
        }
    });
}

// ======================================
// 🎮 GAME LOOP
// ======================================
function gameLoop() {
    // Clear Screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Run Logic
    player.update();
    checkCollisions();

    // Draw Everything
    drawEnvironment();
    player.draw();

    requestAnimationFrame(gameLoop);
}

// Start Game
gameLoop();
