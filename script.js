const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const playBtn = document.getElementById("playBtn");
const configBtn = document.getElementById("configBtn");
const configPanel = document.getElementById("configPanel");
const musicToggle = document.getElementById("musicToggle");
const sfxToggle = document.getElementById("sfxToggle");
const resetBtn = document.getElementById("resetBtn");
const backBtn = document.getElementById("backBtn");
const scoreLabel = document.getElementById("scoreLabel");
const shotsLabel = document.getElementById("shotsLabel");
const targetsLabel = document.getElementById("targetsLabel");
const stateMsg = document.getElementById("stateMsg");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TOPBAR_H = 48;
const MSG_H = 32;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight - TOPBAR_H - MSG_H;

const W = canvas.width;
const H = canvas.height;
const BALL_RADIUS = 9;
const PEG_RADIUS = 14;
const MAX_SHOTS = 7;
const GRAVITY = 0.17;
const SHOOTER = { x: W / 2, y: 30 };

const settings = { music: true, sfx: true };

let gameState = "start";
let score = 0;
let shots = MAX_SHOTS;
let pegs = [];
let ball = null;
let bucket = null;
let aimAngle = Math.PI / 2;
let recoveredShotInCurrentTurn = false;
let isTouchAiming = false;
let blockInput = false;

// ── IMÁGENES ─────────────────────────────────────────────────
const images = {};
const imageFiles = {
    background: "./assets/images/background.png",
    ball: "./assets/images/ball.png",
    bucket: "./assets/images/bucket.png",
    launcher: "./assets/images/launcher.png",
    pegNormal: "./assets/images/peg_normal.png",
    pegTarget: "./assets/images/peg_target.png",
    pegSpecial: "./assets/images/peg_special.png",
};

let imagesLoaded = 0;
const totalImages = Object.keys(imageFiles).length;

function loadImages(callback) {
    for (const [key, src] of Object.entries(imageFiles)) {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) callback();
        };
        img.onerror = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) callback();
        };
        images[key] = img;
    }
}

// ── AUDIO ─────────────────────────────────────────────────────
const sounds = {};
const soundFiles = {
    music: "./assets/audio/music_gameplay.mp3",
    shoot: "./assets/audio/sfx_shoot.mp3",
    hit: "./assets/audio/sfx_hit.mp3",
    bucket: "./assets/audio/sfx_bucket.mp3",
    win: "./assets/audio/sfx_win.mp3",
    lose: "./assets/audio/sfx_lose.mp3",
};

function loadSounds() {
    for (const [key, src] of Object.entries(soundFiles)) {
        const audio = new Audio(src);
        if (key === "music") {
            audio.loop = true;
            audio.volume = 0.4;
        } else {
            audio.volume = 0.7;
        }
        sounds[key] = audio;
    }
}

function playSound(key) {
    if (!settings.sfx) return;
    if (!sounds[key]) return;
    sounds[key].currentTime = 0;
    sounds[key].play().catch(() => { });
}

function startMusic() {
    if (!settings.music) return;
    if (!sounds.music) return;
    sounds.music.play().catch(() => { });
}

function stopMusic() {
    if (!sounds.music) return;
    sounds.music.pause();
    sounds.music.currentTime = 0;
}

// ── PEGS ──────────────────────────────────────────────────────
function createPeg(x, y, type) {
    const points = type === "target" ? 100 : type === "special" ? 70 : 30;
    return { x, y, r: PEG_RADIUS, type, hit: false, points };
}

function resetLevel() {
    gameState = "playing";
    score = 0;
    shots = MAX_SHOTS;
    ball = null;
    isTouchAiming = false;
    recoveredShotInCurrentTurn = false;

    blockInput = true;
    setTimeout(() => { blockInput = false; }, 400);

    pegs = [
        createPeg(W * 0.2, H * 0.2, "target"),
        createPeg(W * 0.5, H * 0.27, "target"),
        createPeg(W * 0.8, H * 0.22, "target"),
        createPeg(W * 0.28, H * 0.39, "normal"),
        createPeg(W * 0.67, H * 0.41, "normal"),
        createPeg(W * 0.4, H * 0.54, "normal"),
        createPeg(W * 0.74, H * 0.58, "special"),
    ];

    bucket = {
        x: W / 2,
        y: H - 20,
        w: 140,
        h: 16,
        speed: 2.6,
        dir: 1,
    };

    startMusic();
    stateMsg.textContent = "Arrastrá para apuntar y soltá para disparar.";
    updateHud();
}

function updateHud() {
    scoreLabel.textContent = String(score);
    shotsLabel.textContent = String(Math.max(0, shots));
    targetsLabel.textContent = String(pegs.filter((p) => p.type === "target").length);
}

function showGame() {
    startScreen.classList.remove("active");
    gameScreen.classList.add("active");
    resetLevel();
}

function showMenu() {
    gameState = "start";
    stopMusic();
    startScreen.classList.add("active");
    gameScreen.classList.remove("active");
    updateHud();
}

function launchBall() {
    if (blockInput) return;
    if (gameState !== "playing" || ball || shots <= 0) return;
    ball = {
        x: SHOOTER.x,
        y: SHOOTER.y,
        r: BALL_RADIUS,
        vx: Math.cos(aimAngle) * 7.2,
        vy: Math.sin(aimAngle) * 7.2,
    };
    recoveredShotInCurrentTurn = false;
    playSound("shoot");
    stateMsg.textContent = "Turno en curso...";
}

function updateAimFromClientPosition(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    aimAngle = Math.atan2(y - SHOOTER.y, x - SHOOTER.x);
}

function circleCircleCollision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) <= a.r + b.r;
}

function circleRectCollision(circle, rect) {
    const nearestX = Math.max(rect.x - rect.w / 2, Math.min(circle.x, rect.x + rect.w / 2));
    const nearestY = Math.max(rect.y - rect.h / 2, Math.min(circle.y, rect.y + rect.h / 2));
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    return dx * dx + dy * dy <= circle.r * circle.r;
}

function reflectFromPeg(peg) {
    if (!ball) return;
    const nx = ball.x - peg.x;
    const ny = ball.y - peg.y;
    const nLength = Math.sqrt(nx * nx + ny * ny) || 1;
    const ux = nx / nLength;
    const uy = ny / nLength;
    const dot = ball.vx * ux + ball.vy * uy;
    ball.vx = ball.vx - 2 * dot * ux;
    ball.vy = ball.vy - 2 * dot * uy;
}

function updateBucket() {
    if (!bucket) return;
    bucket.x += bucket.speed * bucket.dir;
    if (bucket.x < bucket.w / 2 || bucket.x > W - bucket.w / 2) {
        bucket.dir *= -1;
    }
}

function checkPegsCollision() {
    if (!ball) return;
    for (const peg of pegs) {
        if (peg.hit) continue;
        if (circleCircleCollision(ball, peg)) {
            peg.hit = true;
            score += peg.points;
            playSound("hit");
            reflectFromPeg(peg);
        }
    }
}

function checkWallsBounce() {
    if (!ball) return;
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx *= -1; }
    if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx *= -1; }
    if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -1; }
}

function checkBucketCollision() {
    if (!ball || !bucket) return;
    if (circleRectCollision(ball, bucket) && ball.vy > 0) {
        if (!recoveredShotInCurrentTurn) {
            shots += 1;
            recoveredShotInCurrentTurn = true;
            playSound("bucket");
            stateMsg.textContent = "¡Recuperaste 1 tiro!";
        }
        ball.y = H + 50;
    }
}

function finishTurn() {
    pegs = pegs.filter((peg) => !peg.hit);
    shots -= 1;

    const targetsLeft = pegs.filter((peg) => peg.type === "target").length;
    if (targetsLeft === 0) {
        gameState = "win";
        stopMusic();
        playSound("win");
        stateMsg.textContent = "¡GOLAZO! Ganaste 🎉";
    } else if (shots <= 0) {
        gameState = "lose";
        stopMusic();
        playSound("lose");
        stateMsg.textContent = "🟥 Tarjeta roja. Sin tiros.";
    } else {
        stateMsg.textContent = "Turno terminado. Dispará de nuevo.";
    }

    ball = null;
    updateHud();
}

function updateBall() {
    if (!ball || gameState !== "playing") return;
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;

    checkWallsBounce();
    checkPegsCollision();
    checkBucketCollision();

    if (ball.y > H + 40) finishTurn();
}

// ── DIBUJO ────────────────────────────────────────────────────
function drawBackground() {
    if (images.background && images.background.complete) {
        ctx.drawImage(images.background, 0, 0, W, H);
    } else {
        ctx.fillStyle = "#1a6b2a";
        ctx.fillRect(0, 0, W, H);
    }
}

function drawShooterAndAim() {
    const minA = 0.04;
    const maxA = Math.PI - 0.04;
    const clampedAim = Math.max(minA, Math.min(maxA, aimAngle));
    const lineX = SHOOTER.x + Math.cos(clampedAim) * 120;
    const lineY = SHOOTER.y + Math.sin(clampedAim) * 120;

    const size = 40;
    if (images.launcher && images.launcher.complete) {
        ctx.save();
        ctx.translate(SHOOTER.x, SHOOTER.y);
        ctx.rotate(clampedAim - Math.PI / 2);
        ctx.drawImage(images.launcher, -size / 2, -size / 2, size, size);
        ctx.restore();
    } else {
        ctx.fillStyle = "#e67e00";
        ctx.beginPath();
        ctx.arc(SHOOTER.x, SHOOTER.y, 12, 0, Math.PI * 2);
        ctx.fill();
    }

    if (gameState === "playing" && !ball && !blockInput) {
        ctx.setLineDash([7, 7]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#80ed99";
        ctx.beginPath();
        ctx.moveTo(SHOOTER.x, SHOOTER.y);
        ctx.lineTo(lineX, lineY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawPegs() {
    for (const peg of pegs) {
        if (peg.hit) continue;
        let img;
        if (peg.type === "normal") img = images.pegNormal;
        if (peg.type === "target") img = images.pegTarget;
        if (peg.type === "special") img = images.pegSpecial;

        const size = peg.r * 2.5;
        if (img && img.complete) {
            ctx.drawImage(img, peg.x - size / 2, peg.y - size / 2, size, size);
        } else {
            if (peg.type === "normal") ctx.fillStyle = "#4cc9f0";
            if (peg.type === "target") ctx.fillStyle = "#ff9f1c";
            if (peg.type === "special") ctx.fillStyle = "#38b000";
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawBucket() {
    if (!bucket) return;
    const w = bucket.w + 20;
    const h = 40;
    if (images.bucket && images.bucket.complete) {
        ctx.drawImage(images.bucket, bucket.x - w / 2, bucket.y - h / 2, w, h);
    } else {
        ctx.fillStyle = "#ff595e";
        ctx.beginPath();
        ctx.roundRect(bucket.x - bucket.w / 2, bucket.y - bucket.h / 2, bucket.w, bucket.h, 6);
        ctx.fill();
    }
}

function drawBall() {
    if (!ball) return;
    const size = ball.r * 2.5;
    if (images.ball && images.ball.complete) {
        ctx.drawImage(images.ball, ball.x - size / 2, ball.y - size / 2, size, size);
    } else {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawOverlay() {
    if (gameState !== "win" && gameState !== "lose") return;

    ctx.fillStyle = gameState === "win"
        ? "rgba(39, 174, 96, 0.85)"
        : "rgba(192, 57, 43, 0.85)";
    ctx.fillRect(0, H * 0.3, W, H * 0.4);

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${W * 0.1}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText(
        gameState === "win" ? "¡GOLAZO! 🎉" : "🟥 TARJETA ROJA",
        W / 2, H * 0.47
    );

    ctx.font = `${W * 0.06}px Arial`;
    ctx.fillText("Puntaje: " + score, W / 2, H * 0.57);

    ctx.font = `${W * 0.05}px Arial`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Tocá para reiniciar", W / 2, H * 0.65);
}

function render() {
    drawBackground();
    drawShooterAndAim();
    drawPegs();
    drawBucket();
    drawBall();
    drawOverlay();
}

function loop() {
    updateBucket();
    updateBall();
    render();
    requestAnimationFrame(loop);
}

// ── CONTROLES ────────────────────────────────────────────────

canvas.addEventListener("mousemove", (e) => {
    if (isTouchAiming) return;
    updateAimFromClientPosition(e.clientX, e.clientY);
});

canvas.addEventListener("click", () => {
    if (isTouchAiming) return;
    if (gameState === "win" || gameState === "lose") { resetLevel(); return; }
    launchBall();
});

canvas.addEventListener("touchstart", (e) => {
    if (blockInput) { e.preventDefault(); return; }
    if (gameState === "win" || gameState === "lose") {
        resetLevel();
        e.preventDefault();
        return;
    }
    if (gameState !== "playing" || ball) return;
    const touch = e.touches[0];
    if (!touch) return;
    isTouchAiming = true;
    updateAimFromClientPosition(touch.clientX, touch.clientY);
    stateMsg.textContent = "Apuntando...";
    e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    if (!isTouchAiming || gameState !== "playing" || ball) return;
    const touch = e.touches[0];
    if (!touch) return;
    updateAimFromClientPosition(touch.clientX, touch.clientY);
    e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
    if (!isTouchAiming) return;
    isTouchAiming = false;
    launchBall();
    e.preventDefault();
}, { passive: false });

// ── BOTONES ──────────────────────────────────────────────────

playBtn.addEventListener("click", showGame);
configBtn.addEventListener("click", () => configPanel.classList.toggle("hidden"));
resetBtn.addEventListener("click", resetLevel);
backBtn.addEventListener("click", showMenu);

musicToggle.addEventListener("change", () => {
    settings.music = musicToggle.checked;
    if (settings.music && gameState === "playing") startMusic();
    else stopMusic();
});

sfxToggle.addEventListener("change", () => { settings.sfx = sfxToggle.checked; });

// ── INICIO ───────────────────────────────────────────────────
loadSounds();
loadImages(() => {
    updateHud();
    loop();
});