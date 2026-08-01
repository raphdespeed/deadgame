/**
 * RAGE ENGINE v15.0 - DEADGAME / TRAP ADVENTURE: ABSOLUTE CHAOS
 * Feature-complete Masocore Platformer Engine
 */

// --- CONFIGURATION CONSTANTS ---
const WIDTH = 800;
const HEIGHT = 576;
const TILE_SIZE = 32;

const PHYSICS = {
    GRAVITY: 0.48,
    TERMINAL_VELOCITY: 11,
    MOVE_SPEED: 2.4,
    JUMP_FORCE: -11.5,
    CUT_JUMP_FORCE: -3.5,
    COYOTE_TIME: 8, // frames (~133ms à 60fps)
    JUMP_BUFFER: 8 // frames
};

const INSULTS = [
    "NUL", "TRASH", "DOMMAGE", "LOL", "UNINSTALL?", 
    "REKT", "ENCORE ?", "SKILL ISSUE", "NOOB", "EXCELLENT!",
    "PATIENCE...", "TROP LENT", "FAIL", "C'ETAIT UN PIEGE ;)"
];

const COLORS = {
    GAME_BG: '#381910',      // Fond marron foncé rétro (remplace le noir total)
    PLAYER: '#000000',       // Silhouette noire avec contour blanc haute visibilité
    BRICK: '#e07a38',       // Terracotta orange
    BRICK_BORDER: '#a8501d',// Bordure terracotta foncée
    SPIKE: '#1a0904',       // Spikes sombre/noir
    GOAL: '#f0f0f0',        // Porte voûtée blanche/grise
    BLOOD: '#cc2b19',       // Sang rouge terracotta
    CRUMBLE: '#8c441b',
    LASER: '#e63928',
    STALKER: '#6e2719'
};

// --- AUDIO SYNTHESIZER ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.bgmTimer = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    play(freq, type, duration, volume = 0.1, startFreq = null) {
        if (this.muted || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            
            const now = this.ctx.currentTime;
            osc.frequency.setValueAtTime(startFreq || freq, now);
            if (startFreq) {
                osc.frequency.exponentialRampToValueAtTime(freq, now + duration);
            }
            
            gain.gain.setValueAtTime(volume, now);
            gain.gain.linearRampToValueAtTime(0.001, now + duration);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + duration);
        } catch(e) {}
    }

    jump() { this.play(500, 'square', 0.1, 0.08, 250); }
    land() { this.play(80, 'sine', 0.06, 0.08, 140); }
    death() { this.play(50, 'sawtooth', 0.5, 0.2, 350); }
    fire() { this.play(900, 'triangle', 0.12, 0.04, 300); }
    crumble() { this.play(120, 'square', 0.15, 0.05, 80); }
    laser() { this.play(1200, 'sawtooth', 0.2, 0.06, 800); }
    victory() {
        if (this.muted || !this.ctx) return;
        const notes = [261, 329, 392, 523];
        notes.forEach((note, i) => {
            setTimeout(() => this.play(note, 'triangle', 0.2, 0.1), i * 120);
        });
    }
}

const audio = new AudioEngine();

// --- VISUAL EFFECTS & PARTICLES ---
class VisualFX {
    constructor(x, y, text, color = "#fff") {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.0;
        this.vy = -1.5;
    }
    update() {
        this.y += this.vy;
        this.life -= 0.025;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, isBlood = false) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * (isBlood ? 14 : 6);
        this.vy = (Math.random() - 0.5) * (isBlood ? 14 : 6) - (isBlood ? 2 : 0);
        this.life = 1.0;
        this.color = color;
        this.isBlood = isBlood;
        this.size = isBlood ? Math.random() * 4 + 2 : Math.random() * 3 + 1;
    }
    update(bCtx) {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.35; // Gravity
        this.life -= 0.02;

        // Splatter on blood canvas when touching bottom/walls
        if (this.isBlood && Math.random() < 0.25 && bCtx) {
            bCtx.fillStyle = this.color;
            bCtx.fillRect(Math.floor(this.x), Math.floor(this.y), Math.random() > 0.5 ? 3 : 2, Math.random() > 0.5 ? 3 : 2);
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

// --- TRAPS & INTERACTIVES ---
class Spike {
    constructor(x, y, dir = 'UP', triggerDist = 0) {
        this.x = x;
        this.y = y;
        this.w = 32;
        this.h = 32;
        this.dir = dir; // UP, DOWN, LEFT, RIGHT
        this.triggerDist = triggerDist;
        this.originY = y;
        this.active = triggerDist === 0;
        this.hitbox = { x: x + 6, y: y + 6, w: 20, h: 20 };
    }
    update(player) {
        if (this.triggerDist > 0 && !this.active) {
            if (Math.abs(player.x - this.x) < this.triggerDist && Math.abs(player.y - this.y) < 100) {
                this.active = true;
                audio.fire();
            }
        }
        if (this.active && this.triggerDist > 0) {
            if (this.dir === 'UP' && this.y > this.originY - 32) this.y -= 8;
            if (this.dir === 'DOWN' && this.y < this.originY + 32) this.y += 8;
        }
        this.hitbox.x = this.x + 6;
        this.hitbox.y = this.y + 6;
    }
    draw(ctx) {
        if (!this.active && this.triggerDist > 0) return;
        ctx.save();
        ctx.fillStyle = COLORS.SPIKE;
        ctx.beginPath();
        const x = this.x, y = this.y;
        if (this.dir === 'UP') {
            ctx.moveTo(x, y + 32); ctx.lineTo(x + 16, y); ctx.lineTo(x + 32, y + 32);
        } else if (this.dir === 'DOWN') {
            ctx.moveTo(x, y); ctx.lineTo(x + 16, y + 32); ctx.lineTo(x + 32, y);
        } else if (this.dir === 'LEFT') {
            ctx.moveTo(x + 32, y); ctx.lineTo(x, y + 16); ctx.lineTo(x + 32, y + 32);
        } else if (this.dir === 'RIGHT') {
            ctx.moveTo(x, y); ctx.lineTo(x + 32, y + 16); ctx.lineTo(x, y + 32);
        }
        ctx.fill();
        ctx.restore();
    }
}

class SurpriseSpike {
    constructor(x, y, triggerDist = 90, speed = 16) {
        this.originX = x;
        this.originY = y;
        this.x = x;
        this.y = y + 32; // Caché sous le sol au début
        this.w = 32;
        this.h = 32;
        this.triggerDist = triggerDist;
        this.speed = speed;
        this.triggered = false;
        this.hitbox = { x: x + 4, y: y + 4, w: 24, h: 24 };
    }
    update(player) {
        if (!this.triggered && Math.abs(player.x - this.originX) < this.triggerDist) {
            this.triggered = true;
            audio.fire();
        }
        if (this.triggered && this.y > this.originY) {
            this.y -= this.speed;
            if (this.y < this.originY) this.y = this.originY;
        }
        this.hitbox.x = this.x + 4;
        this.hitbox.y = this.y + 4;
    }
    draw(ctx) {
        if (!this.triggered && this.y >= this.originY + 32) return;
        ctx.save();
        ctx.fillStyle = COLORS.SPIKE;
        ctx.beginPath();
        const x = this.x, y = this.y;
        ctx.moveTo(x, y + 32); ctx.lineTo(x + 16, y); ctx.lineTo(x + 32, y + 32);
        ctx.fill();
        ctx.restore();
    }
}

class SlidingStepTrap {
    constructor(x, y, slideDist = 96, triggerDist = 80) {
        this.originX = x;
        this.originY = y;
        this.x = x;
        this.y = y;
        this.w = 32;
        this.h = 32;
        this.slideDist = slideDist;
        this.triggerDist = triggerDist;
        this.active = false;
        this.hitbox = { x: x, y: y, w: 32, h: 32 };
    }
    update(player, game) {
        if (!this.active && Math.abs(player.x - this.x) < this.triggerDist && Math.abs(player.y - this.y) < 80) {
            this.active = true;
            audio.fire();
            game.screenShake = 10;
        }
        if (this.active && this.x > this.originX - this.slideDist) {
            this.x -= 12; // Glissement rapide pour éjecter le joueur
        }
        this.hitbox.x = this.x;
        this.hitbox.y = this.y;
    }
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = COLORS.BRICK;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = COLORS.BRICK_BORDER;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        ctx.restore();
    }
}
class FleeingGoalTrap {
    constructor(x, y, jumpX = 120, jumpY = -96, triggerDist = 90) {
        this.originX = x;
        this.originY = y;
        this.x = x;
        this.y = y;
        this.w = 32;
        this.h = 32;
        this.jumpX = jumpX;
        this.jumpY = jumpY;
        this.triggerDist = triggerDist;
        this.fled = false;
        this.isFake = false;
    }
    update(player, game) {
        if (!this.fled && Math.abs(player.x - this.x) < this.triggerDist && Math.abs(player.y - this.y) < 100) {
            this.fled = true;
            this.x += this.jumpX;
            this.y += this.jumpY;
            audio.fire();
            game.fxList.push(new VisualFX(player.x, player.y - 20, "NOPE!", COLORS.SPIKE));
            // Fait jaillir un pic sous l'ancienne position de la porte!
            game.levelManager.spikes.push(new Spike(this.originX, this.originY, 'UP'));
        }
    }
}

class HorizontalWallSpike {
    constructor(x, y, dir = 'RIGHT', triggerY = 80, speed = 18) {
        this.originX = x;
        this.originY = y;
        this.x = dir === 'RIGHT' ? x - 32 : x + 32;
        this.y = y;
        this.w = 32;
        this.h = 32;
        this.dir = dir;
        this.triggerY = triggerY;
        this.speed = speed;
        this.triggered = false;
        this.hitbox = { x: x + 4, y: y + 4, w: 24, h: 24 };
    }
    update(player) {
        if (!this.triggered && Math.abs(player.y - this.originY) < this.triggerY && Math.abs(player.x - this.originX) < 220) {
            this.triggered = true;
            audio.fire();
        }
        if (this.triggered) {
            if (this.dir === 'RIGHT' && this.x < this.originX) this.x += this.speed;
            if (this.dir === 'LEFT' && this.x > this.originX) this.x -= this.speed;
        }
        this.hitbox.x = this.x + 4;
        this.hitbox.y = this.y + 4;
    }
    draw(ctx) {
        if (!this.triggered) return;
        ctx.save();
        ctx.fillStyle = COLORS.SPIKE;
        ctx.beginPath();
        const x = this.x, y = this.y;
        if (this.dir === 'RIGHT') {
            ctx.moveTo(x, y); ctx.lineTo(x + 32, y + 16); ctx.lineTo(x, y + 32);
        } else {
            ctx.moveTo(x + 32, y); ctx.lineTo(x, y + 16); ctx.lineTo(x + 32, y + 32);
        }
        ctx.fill();
        ctx.restore();
    }
}

class Piston {
    constructor(x, y, triggerDist = 60, dropHeight = 200) {
        this.originX = x;
        this.originY = y;
        this.x = x;
        this.y = y;
        this.w = 64;
        this.h = 32;
        this.triggerDist = triggerDist;
        this.dropHeight = dropHeight;
        this.active = false;
        this.timer = 0;
        this.hitbox = { x: x, y: y, w: 64, h: 32 };
    }
    update(player, game) {
        if (!this.active && Math.abs(player.x - (this.x + 32)) < this.triggerDist) {
            this.active = true;
            audio.fire();
        }
        if (this.active) {
            if (this.timer < 6) {
                this.y += 28;
                if (this.y >= this.originY + this.dropHeight) {
                    this.y = this.originY + this.dropHeight;
                    game.screenShake = 12;
                }
            } else if (this.timer > 35) {
                this.y -= 3;
                if (this.y <= this.originY) {
                    this.y = this.originY;
                    this.active = false;
                    this.timer = 0;
                }
            }
            this.timer++;
        }
        this.hitbox.x = this.x;
        this.hitbox.y = this.y;
    }
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = COLORS.SPIKE;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "#555";
        ctx.fillRect(this.x, this.originY, this.w, Math.max(0, this.y - this.originY));
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        ctx.restore();
    }
}

class CrumblingPlatform {
    constructor(x, y, w = 64, h = 16) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.stepped = false;
        this.timer = 0;
        this.destroyed = false;
        this.hitbox = { x: x, y: y, w: w, h: h };
    }
    update(player) {
        if (this.destroyed) return;
        if (this.stepped) {
            this.timer++;
            if (this.timer % 3 === 0) {
                audio.crumble();
            }
            if (this.timer > 15) {
                this.destroyed = true;
            }
        }
    }
    draw(ctx) {
        if (this.destroyed) return;
        ctx.save();
        ctx.fillStyle = COLORS.CRUMBLE;
        const shakeX = this.stepped ? (Math.random() - 0.5) * 4 : 0;
        ctx.fillRect(this.x + shakeX, this.y, this.w, this.h);
        ctx.strokeStyle = "#3e3226";
        ctx.strokeRect(this.x + shakeX, this.y, this.w, this.h);
        ctx.restore();
    }
}

class LaserBeam {
    constructor(x, y, length, dir = 'VERTICAL', cycleTime = 120, onTime = 60) {
        this.x = x;
        this.y = y;
        this.length = length;
        this.dir = dir;
        this.cycleTime = cycleTime;
        this.onTime = onTime;
        this.timer = 0;
        this.active = false;
    }
    update() {
        this.timer = (this.timer + 1) % this.cycleTime;
        const wasActive = this.active;
        this.active = this.timer < this.onTime;
        if (this.active && !wasActive) audio.laser();
    }
    getHitbox() {
        if (!this.active) return { x: -999, y: -999, w: 0, h: 0 };
        return this.dir === 'VERTICAL' 
            ? { x: this.x + 12, y: this.y, w: 8, h: this.length }
            : { x: this.x, y: this.y + 12, w: this.length, h: 8 };
    }
    draw(ctx) {
        ctx.save();
        // Emitter box
        ctx.fillStyle = '#ff9900';
        ctx.fillRect(this.x, this.y, 32, 32);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(this.x, this.y, 32, 32);

        if (this.active) {
            ctx.fillStyle = COLORS.LASER;
            ctx.shadowColor = COLORS.LASER;
            ctx.shadowBlur = 15;
            if (this.dir === 'VERTICAL') {
                ctx.fillRect(this.x + 12, this.y + 32, 8, this.length);
            } else {
                ctx.fillRect(this.x + 32, this.y + 12, this.length, 8);
            }
        }
        ctx.restore();
    }
}

class StalkerOrb {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 32;
        this.h = 32;
        this.timer = 0;
        this.hitbox = { x: x, y: y, w: 32, h: 32 };
        this.projectiles = [];
    }
    update(player) {
        this.x += (player.x - this.x) * 0.015;
        this.y += (player.y - this.y) * 0.015;
        this.hitbox.x = this.x;
        this.hitbox.y = this.y;

        this.timer++;
        if (this.timer % 110 === 0) {
            audio.fire();
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI * 2 / 4) * i;
                this.projectiles.push({
                    x: this.x + 12,
                    y: this.y + 12,
                    vx: Math.cos(angle) * 5,
                    vy: Math.sin(angle) * 5
                });
            }
        }

        this.projectiles.forEach((p, index) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > WIDTH || p.y < 0 || p.y > HEIGHT) {
                this.projectiles.splice(index, 1);
            }
        });
    }
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = COLORS.STALKER;
        ctx.shadowColor = COLORS.STALKER;
        ctx.shadowBlur = 10;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "#fff";
        ctx.fillRect(this.x + 8, this.y + 8, 6, 6);
        ctx.fillRect(this.x + 18, this.y + 8, 6, 6);

        ctx.fillStyle = COLORS.SPIKE;
        this.projectiles.forEach(p => {
            ctx.fillRect(p.x, p.y, 8, 8);
        });
        ctx.restore();
    }
}

// --- PLAYER CLASS ---
class Player {
    constructor() {
        this.w = 20;
        this.h = 28;
        this.reset(64, 450);
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.isDead = false;
        this.lookDir = 1;
        this.stretchX = 1;
        this.stretchY = 1;
        this.walkTimer = 0;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.particles = [];
    }

    die(game) {
        if (this.isDead || game.gameBeaten) return;
        this.isDead = true;
        game.deaths++;
        game.screenShake = 25;
        audio.death();

        localStorage.setItem('rageDeaths', game.deaths);
        document.getElementById('death-count').innerText = game.deaths;

        const insult = INSULTS[Math.floor(Math.random() * INSULTS.length)];
        const insultBanner = document.getElementById('insult-banner');
        insultBanner.innerText = insult;
        insultBanner.style.opacity = '1';

        const flash = document.getElementById('death-flash');
        flash.style.opacity = '0.6';
        setTimeout(() => flash.style.opacity = '0', 100);

        game.fxList.push(new VisualFX(this.x, this.y, insult, COLORS.SPIKE));

        for (let i = 0; i < 45; i++) {
            this.particles.push(new Particle(
                this.x + 10, 
                this.y + 14, 
                (i % 2 === 0) ? COLORS.PLAYER : COLORS.BLOOD, 
                true
            ));
        }

        setTimeout(() => {
            game.levelManager.reload();
            setTimeout(() => insultBanner.style.opacity = '0', 300);
        }, 150);
    }

    update(keys, game) {
        if (this.isDead || game.gameBeaten) {
            this.particles.forEach(p => p.update(game.bCtx));
            return;
        }

        // Horizontal input (Arrow keys primary)
        this.vx = 0;
        if (keys['ArrowLeft']) { this.vx = -PHYSICS.MOVE_SPEED; this.lookDir = -1; }
        if (keys['ArrowRight']) { this.vx = PHYSICS.MOVE_SPEED; this.lookDir = 1; }

        if (this.vx !== 0) this.walkTimer += 0.25;

        // Coyote Time & Jump Buffering
        if (this.onGround) {
            this.coyoteTimer = PHYSICS.COYOTE_TIME;
        } else {
            if (this.coyoteTimer > 0) this.coyoteTimer--;
        }

        if (keys['ArrowUp'] || keys['KeyZ'] || keys['Space']) {
            this.jumpBufferTimer = PHYSICS.JUMP_BUFFER;
        } else {
            if (this.jumpBufferTimer > 0) this.jumpBufferTimer--;
        }

        // Jump Execution
        if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
            this.vy = PHYSICS.JUMP_FORCE;
            this.onGround = false;
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
            this.stretchX = 0.6;
            this.stretchY = 1.4;
            audio.jump();
            game.fxList.push(new VisualFX(this.x, this.y, "UP!", COLORS.PLAYER));
        }

        // Variable Jump Height (Cut jump on key release)
        if (!keys['ArrowUp'] && !keys['KeyZ'] && !keys['Space'] && this.vy < PHYSICS.CUT_JUMP_FORCE) {
            this.vy = PHYSICS.CUT_JUMP_FORCE;
        }

        // Gravity
        this.vy += PHYSICS.GRAVITY;
        if (this.vy > PHYSICS.TERMINAL_VELOCITY) this.vy = PHYSICS.TERMINAL_VELOCITY;

        // Horizontal Movement & Collisions
        this.x += this.vx;
        this.resolveCollisions(game.levelManager.walls, game.levelManager.crumbling, 'x');

        // Vertical Movement & Collisions
        this.y += this.vy;
        this.resolveCollisions(game.levelManager.walls, game.levelManager.crumbling, 'y');

        // Squash & Stretch Recovery
        this.stretchX += (1 - this.stretchX) * 0.2;
        this.stretchY += (1 - this.stretchY) * 0.2;

        // Trap Collisions
        this.checkTrapCollisions(game);

        // Goal Check
        const goal = game.levelManager.fleeingGoal || game.levelManager.goal;
        if (goal && this.intersect(this.x, this.y, this.w, this.h, goal.x, goal.y, 32, 32)) {
            if (goal.isFake) {
                game.fxList.push(new VisualFX(goal.x, goal.y, "TRAP!", COLORS.SPIKE));
                audio.fire();
                game.levelManager.triggerFakeGoalTrap();
            } else {
                audio.victory();
                game.levelManager.next();
            }
        }

        // Out of bounds
        if (this.y > HEIGHT || this.y < -150 || this.x < -50 || this.x > WIDTH + 50) {
            this.die(game);
        }
    }

    resolveCollisions(walls, crumbling, axis) {
        if (axis === 'y') this.onGround = false;

        const checkBlock = (b) => {
            if (b.destroyed) return;
            if (this.intersect(this.x, this.y, this.w, this.h, b.x, b.y, b.w || 32, b.h || 32)) {
                if (axis === 'x') {
                    if (this.vx > 0) this.x = b.x - this.w;
                    else if (this.vx < 0) this.x = b.x + (b.w || 32);
                    this.vx = 0;
                } else {
                    if (this.vy > 0) {
                        if (!this.onGround) audio.land();
                        this.y = b.y - this.h;
                        this.onGround = true;
                        if (b instanceof CrumblingPlatform) b.stepped = true;
                    } else if (this.vy < 0) {
                        this.y = b.y + (b.h || 32);
                    }
                    this.vy = 0;
                }
            }
        };

        walls.forEach(checkBlock);
        crumbling.forEach(checkBlock);
    }

    checkTrapCollisions(game) {
        const checkHit = (hb) => {
            if (this.intersect(this.x, this.y, this.w, this.h, hb.x, hb.y, hb.w, hb.h)) {
                this.die(game);
            }
        };

        game.levelManager.spikes.forEach(s => {
            s.update(this);
            if (s.active) checkHit(s.hitbox);
        });

        game.levelManager.surpriseSpikes.forEach(s => {
            s.update(this);
            if (s.triggered) checkHit(s.hitbox);
        });

        game.levelManager.horizontalSpikes.forEach(hs => {
            hs.update(this);
            if (hs.triggered) checkHit(hs.hitbox);
        });

        if (game.levelManager.fleeingGoal) {
            game.levelManager.fleeingGoal.update(this, game);
        }

        game.levelManager.slidingSteps.forEach(st => {
            st.update(this, game);
            checkHit(st.hitbox);
        });

        game.levelManager.pistons.forEach(p => {
            p.update(this, game);
            checkHit(p.hitbox);
        });

        game.levelManager.lasers.forEach(l => {
            l.update();
            checkHit(l.getHitbox());
        });

        game.levelManager.stalkers.forEach(st => {
            st.update(this);
            checkHit(st.hitbox);
            st.projectiles.forEach(pr => checkHit({ x: pr.x, y: pr.y, w: 8, h: 8 }));
        });
    }

    intersect(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
    }

    draw(ctx) {
        if (this.isDead) {
            this.particles.forEach(p => p.draw(ctx));
            return;
        }
        ctx.save();
        ctx.translate(Math.floor(this.x + 10), Math.floor(this.y + 14));
        ctx.scale(this.stretchX, this.stretchY);

        let legOffset = Math.sin(this.walkTimer) * 5;

        // 1. Remplissage bleu cyan néon brillant (ultra lumineux et visible)
        ctx.fillStyle = '#00f2ff';
        ctx.shadowColor = '#00f2ff';
        ctx.shadowBlur = 12;

        // Tête
        ctx.beginPath();
        ctx.arc(0, -14, 7, 0, Math.PI * 2);
        ctx.fill();

        // Buste
        ctx.fillRect(-6, -8, 12, 14);

        // Jambes
        ctx.fillRect(-5, 6 + (this.vx !== 0 ? legOffset : 0), 4, 10);
        ctx.fillRect(1, 6 + (this.vx !== 0 ? -legOffset : 0), 4, 10);

        // Bras
        ctx.fillRect(this.lookDir * 4 - 2, -5, 4, 8);

        // 2. Contour noir net sur les formes
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.arc(0, -14, 7, 0, Math.PI * 2);
        ctx.rect(-6, -8, 12, 14);
        ctx.rect(-5, 6 + (this.vx !== 0 ? legOffset : 0), 4, 10);
        ctx.rect(1, 6 + (this.vx !== 0 ? -legOffset : 0), 4, 10);
        ctx.rect(this.lookDir * 4 - 2, -5, 4, 8);
        ctx.stroke();

        // 3. Yeux noirs expressifs
        ctx.fillStyle = '#000000';
        ctx.fillRect(this.lookDir * 3 - 2, -16, 3, 4);

        ctx.restore();
    }
}

// --- LEVEL MANAGER & 8 MASOCORE ROOMS ---
class LevelManager {
    constructor(game) {
        this.game = game;
        this.idx = 0;
        this.spikes = [];
        this.surpriseSpikes = [];
        this.slidingSteps = [];
        this.horizontalSpikes = [];
        this.pistons = [];
        this.crumbling = [];
        this.lasers = [];
        this.stalkers = [];
        this.goal = null;
        this.fleeingGoal = null;
        this.unlocked = parseInt(localStorage.getItem('rageUnlocked')) || 1;
    }

    loadLevel(idx) {
        this.idx = idx;
        this.walls = [];
        this.spikes = [];
        this.surpriseSpikes = [];
        this.slidingSteps = [];
        this.horizontalSpikes = [];
        this.pistons = [];
        this.crumbling = [];
        this.lasers = [];
        this.stalkers = [];
        this.goal = null;
        this.fleeingGoal = null;

        // Update Level Boxes HUD (■ □ □ □ □ □ □ □)
        const boxesContainer = document.getElementById('level-boxes');
        if (boxesContainer) {
            boxesContainer.innerHTML = '';
            for (let b = 0; b < 8; b++) {
                const box = document.createElement('div');
                box.className = `level-box ${b < idx ? 'filled' : ''} ${b === idx ? 'current' : ''}`;
                boxesContainer.appendChild(box);
            }
        }

        // Border walls (Floor + Sides + Ceiling)
        for (let i = 0; i < 25; i++) {
            if (this.idx !== 7 || i < 20) { // Open gap in floor on level 8
                this.walls.push({ x: i * 32, y: 544, w: 32, h: 32 });
            }
        }
        for (let j = 0; j < 18; j++) {
            this.walls.push({ x: 0, y: j * 32, w: 32, h: 32 });
            this.walls.push({ x: 768, y: j * 32, w: 32, h: 32 });
        }

        // Handcrafted Level Designs
        switch(idx) {
            case 0: // LEVEL 1: Escalier & Pics Surprise au Sol
                this.game.player.reset(64, 516);
                this.goal = { x: 720, y: 512 };
                this.walls.push({ x: 656, y: 512, w: 32, h: 32 });
                this.slidingSteps.push(new SlidingStepTrap(688, 512, 110, 90));
                this.surpriseSpikes.push(new SurpriseSpike(320, 512, 110, 18));
                this.spikes.push(new Spike(720, 32, 'DOWN', 80));
                break;

            case 1: // LEVEL 2: La Porte S'enfuit au Sol & Tir Mural
                this.game.player.reset(64, 516);
                // La porte est au sol à droite (720, 512). Quand on s'approche, elle glisse en bas au milieu (320, 512) !
                this.fleeingGoal = new FleeingGoalTrap(720, 512, -400, 0, 120);
                this.surpriseSpikes.push(new SurpriseSpike(250, 512, 100));
                this.surpriseSpikes.push(new SurpriseSpike(520, 512, 100));
                this.horizontalSpikes.push(new HorizontalWallSpike(736, 512, 'LEFT', 110));
                this.spikes.push(new Spike(320, 32, 'DOWN', 60));
                break;

            case 2: // LEVEL 3: Double Piston & Sol Piégé
                this.game.player.reset(64, 516);
                this.goal = { x: 720, y: 512 };
                this.pistons.push(new Piston(250, 100, 60, 384));
                this.pistons.push(new Piston(480, 100, 60, 384));
                this.slidingSteps.push(new SlidingStepTrap(360, 512, 120, 80));
                this.surpriseSpikes.push(new SurpriseSpike(200, 512, 90));
                break;

            case 3: // LEVEL 4: Le Stalker & Tir Mural Droit
                this.game.player.reset(64, 516);
                this.goal = { x: 720, y: 512 };
                this.stalkers.push(new StalkerOrb(200, 300));
                this.surpriseSpikes.push(new SurpriseSpike(300, 512, 100));
                this.surpriseSpikes.push(new SurpriseSpike(500, 512, 100));
                this.horizontalSpikes.push(new HorizontalWallSpike(32, 512, 'RIGHT', 90));
                break;

            case 4: // LEVEL 5: Lasers Verticaux au Sol
                this.game.player.reset(64, 516);
                this.goal = { x: 720, y: 512 };
                this.lasers.push(new LaserBeam(250, 150, 394, 'VERTICAL', 120, 70));
                this.lasers.push(new LaserBeam(500, 150, 394, 'VERTICAL', 120, 70));
                this.horizontalSpikes.push(new HorizontalWallSpike(736, 512, 'LEFT', 90));
                this.surpriseSpikes.push(new SurpriseSpike(380, 512, 100));
                break;

            case 5: // LEVEL 6: La Porte S'enfuit vers la Gauche du Sol
                this.game.player.reset(64, 516);
                // La porte est au sol à (720, 512). Elle glisse vers (200, 512) au sol !
                this.fleeingGoal = new FleeingGoalTrap(720, 512, -520, 0, 120);
                this.surpriseSpikes.push(new SurpriseSpike(300, 512, 100));
                this.surpriseSpikes.push(new SurpriseSpike(500, 512, 100));
                this.slidingSteps.push(new SlidingStepTrap(400, 512, 100, 80));
                break;

            case 6: // LEVEL 7: Le Stalker & Pièges Glissants au Sol
                this.game.player.reset(64, 516);
                this.goal = { x: 720, y: 512 };
                this.stalkers.push(new StalkerOrb(500, 300));
                this.slidingSteps.push(new SlidingStepTrap(250, 512, 100, 80));
                this.slidingSteps.push(new SlidingStepTrap(450, 512, 100, 80));
                this.spikes.push(new Spike(420, 32, 'DOWN', 60));
                this.surpriseSpikes.push(new SurpriseSpike(350, 512, 90));
                break;

            case 7: // LEVEL 8: Le Gauntlet Ultime au Sol Trap Adventure
                this.game.player.reset(64, 516);
                // La porte s'enfuit du sol à (720, 512) vers (300, 512) !
                this.fleeingGoal = new FleeingGoalTrap(720, 512, -420, 0, 120);
                this.slidingSteps.push(new SlidingStepTrap(250, 512, 120, 80));
                this.surpriseSpikes.push(new SurpriseSpike(450, 512, 100));
                this.horizontalSpikes.push(new HorizontalWallSpike(736, 512, 'LEFT', 90));
                this.spikes.push(new Spike(300, 32, 'DOWN', 50));
                break;
        }
    }

    triggerFakeGoalTrap() {
        // Trigger massive falling spikes ceiling when player touches fake goal
        for (let i = 2; i < 22; i++) {
            this.spikes.push(new Spike(i * 32, 0, 'DOWN', 1));
        }
    }

    addWallRange(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.walls.push({ x: x + i * 32, y: y, w: 32, h: 32 });
        }
    }

    reload() {
        this.loadLevel(this.idx);
    }

    next() {
        this.idx++;
        if (this.idx > this.unlocked && this.idx < 8) {
            this.unlocked = this.idx + 1;
            localStorage.setItem('rageUnlocked', this.unlocked);
        }
        if (this.idx >= 8) {
            this.game.triggerVictory();
        } else {
            this.reload();
        }
    }

    draw(ctx) {
        // Walls
        ctx.fillStyle = COLORS.BRICK;
        this.walls.forEach(w => {
            ctx.fillRect(w.x, w.y, w.w, w.h);
            ctx.strokeStyle = COLORS.BRICK_BORDER;
            ctx.strokeRect(w.x, w.y, w.w, w.h);
        });

        // Crumbling Platforms
        this.crumbling.forEach(c => c.draw(ctx));

        // Spikes, Pistons, Lasers, Stalkers & Surprise Traps
        this.spikes.forEach(s => s.draw(ctx));
        this.surpriseSpikes.forEach(s => s.draw(ctx));
        this.slidingSteps.forEach(st => st.draw(ctx));
        this.horizontalSpikes.forEach(hs => hs.draw(ctx));
        this.pistons.forEach(p => p.draw(ctx));
        this.lasers.forEach(l => l.draw(ctx));
        this.stalkers.forEach(st => st.draw(ctx));

        // Goal - Porte voûtée blanche (Style Trap Adventure)
        const currentGoal = this.fleeingGoal || this.goal;
        if (currentGoal) {
            ctx.save();
            const gx = currentGoal.x;
            const gy = currentGoal.y;
            
            ctx.fillStyle = COLORS.GOAL; // #f0f0f0
            ctx.strokeStyle = "#1a0b07";
            ctx.lineWidth = 3;
            
            ctx.beginPath();
            ctx.arc(gx + 16, gy + 12, 12, Math.PI, 0); // Arche arrondie
            ctx.lineTo(gx + 28, gy + 32);
            ctx.lineTo(gx + 4, gy + 32);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Poignée de porte
            ctx.fillStyle = "#333";
            ctx.fillRect(gx + 20, gy + 18, 3, 5);
            ctx.restore();
        }
    }
}

// --- MAIN GAME APPLICATION ---
class GameApp {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = WIDTH;
        this.canvas.height = HEIGHT;

        // Persistent blood layer
        this.bloodCanvas = document.createElement('canvas');
        this.bloodCanvas.width = WIDTH;
        this.bloodCanvas.height = HEIGHT;
        this.bCtx = this.bloodCanvas.getContext('2d');

        this.deaths = parseInt(localStorage.getItem('rageDeaths')) || 0;
        this.startTime = Date.now();
        this.gameActive = true; // Actif immédiatement sans écran bloquant
        this.gameBeaten = false;
        this.screenShake = 0;

        this.keys = {};
        this.fxList = [];

        this.player = new Player();
        this.levelManager = new LevelManager(this);
        this.levelManager.loadLevel(0); // Charge le niveau 1 dès le démarrage

        this.setupInput();
        this.setupUI();
    }

    setupInput() {
        window.addEventListener('keydown', e => {
            if (!this.gameActive && !this.gameBeaten && e.code.includes('Arrow')) {
                this.startGame();
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
    }

    setupUI() {
        document.getElementById('death-count').innerText = this.deaths;

        document.getElementById('btn-play').addEventListener('click', () => {
            audio.init();
            this.startGame();
        });

        document.getElementById('btn-levels').addEventListener('click', () => {
            audio.init();
            this.showLevelSelect();
        });

        document.getElementById('btn-back-menu').addEventListener('click', () => {
            this.showMenu();
        });

        document.getElementById('btn-restart-game').addEventListener('click', () => {
            this.gameBeaten = false;
            this.deaths = 0;
            localStorage.setItem('rageDeaths', 0);
            document.getElementById('death-count').innerText = 0;
            this.levelManager.loadLevel(0);
            this.startGame();
        });

        document.getElementById('btn-toggle-crt').addEventListener('click', () => {
            const crt = document.getElementById('crt-overlay');
            crt.classList.toggle('disabled');
        });

        document.getElementById('btn-toggle-audio').addEventListener('click', (e) => {
            audio.init();
            audio.muted = !audio.muted;
            e.currentTarget.innerText = audio.muted ? '🔇 SON: OFF' : '🔊 SON: ON';
        });
    }

    showMenu() {
        document.getElementById('modal-menu').classList.remove('hidden');
        document.getElementById('modal-level-select').classList.add('hidden');
        document.getElementById('modal-victory').classList.add('hidden');
        this.gameActive = false;
    }

    showLevelSelect() {
        document.getElementById('modal-menu').classList.add('hidden');
        document.getElementById('modal-level-select').classList.remove('hidden');

        const grid = document.getElementById('level-grid');
        grid.innerHTML = '';

        for (let i = 0; i < 8; i++) {
            const card = document.createElement('div');
            const unlocked = i < this.levelManager.unlocked;
            card.className = `level-card ${unlocked ? 'unlocked' : ''} ${i < this.levelManager.idx ? 'completed' : ''}`;
            card.innerHTML = `<span>NIV ${i + 1}</span>`;
            if (unlocked) {
                card.addEventListener('click', () => {
                    this.levelManager.loadLevel(i);
                    this.startGame();
                });
            }
            grid.appendChild(card);
        }
    }

    startGame() {
        audio.init();
        document.getElementById('modal-menu').classList.add('hidden');
        document.getElementById('modal-level-select').classList.add('hidden');
        document.getElementById('modal-victory').classList.add('hidden');

        if (!this.gameActive) {
            this.startTime = Date.now();
            this.gameActive = true;
            if (this.levelManager.idx === 0 && !this.gameBeaten) {
                this.levelManager.loadLevel(0);
            }
        }
    }

    triggerVictory() {
        this.gameBeaten = true;
        this.gameActive = false;
        document.getElementById('modal-victory').classList.remove('hidden');
        document.getElementById('final-salt').innerText = this.deaths;
        document.getElementById('final-time').innerText = ((Date.now() - this.startTime) / 1000).toFixed(2);
    }

    run() {
        const loop = () => {
            if (this.gameActive) {
                document.getElementById('timer').innerText = ((Date.now() - this.startTime) / 1000).toFixed(2);
            }

            this.ctx.save();
            if (this.screenShake > 0) {
                this.ctx.translate(
                    (Math.random() - 0.5) * this.screenShake, 
                    (Math.random() - 0.5) * this.screenShake
                );
                this.screenShake *= 0.88;
            }

            // Clear screen & fill background with warm chocolate brown
            this.ctx.clearRect(-50, -50, WIDTH + 100, HEIGHT + 100);
            this.ctx.fillStyle = COLORS.GAME_BG;
            this.ctx.fillRect(-50, -50, WIDTH + 100, HEIGHT + 100);

            // Draw blood splatters
            this.ctx.drawImage(this.bloodCanvas, 0, 0);

            // Draw Level & Traps
            this.levelManager.draw(this.ctx);

            // Update & Draw Player
            this.player.update(this.keys, this);
            this.player.draw(this.ctx);

            // Update & Draw Visual FX
            this.fxList.forEach((fx, index) => {
                fx.update();
                fx.draw(this.ctx);
                if (fx.life <= 0) this.fxList.splice(index, 1);
            });

            this.ctx.restore();
            requestAnimationFrame(loop);
        };
        loop();
    }
}

// Launch app on load
window.addEventListener('DOMContentLoaded', () => {
    const app = new GameApp();
    app.run();
});
