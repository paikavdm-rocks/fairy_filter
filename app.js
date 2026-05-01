import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp,
    limit,
    where,
    doc,
    setDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getDatabase, 
    ref, 
    onChildAdded, 
    onChildChanged, 
    onChildRemoved, 
    set, 
    update, 
    remove,
    off,
    onValue,
    push
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyBcnbOXvlC4Z30Y34BMShr8NaGozymIVLE",
  authDomain: "fairytopia.firebaseapp.com",
  projectId: "fairytopia",
  storageBucket: "fairytopia.firebasestorage.app",
  messagingSenderId: "531666119490",
  appId: "1:531666119490:web:329cedbdaf92247cdef6db",
  databaseURL: "https://fairytopia-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

let currentUser = null;
let currentRealm = 'initial'; // Default, will be set on login
let currentTheme = 'emerald'; // The visual style
let selectedType = 'fairy';

const themes = {
    emerald: { primary: '#50fa7b', secondary: '#f1fa8c', bg: '#1a2a22', title: 'The Emerald Kingdom', lore: 'Nature whispers.' },
    ruby: { primary: '#ff5555', secondary: '#ffb86c', bg: '#2a1a1a', title: 'The Ruby Kingdom', lore: 'Fire glows.' },
    jade: { primary: '#8be9fd', secondary: '#50fa7b', bg: '#1a262a', title: 'The Jade Kingdom', lore: 'Ice flows.' },
    amethyst: { primary: '#bd93f9', secondary: '#ff79c6', bg: '#1e1a2a', title: 'The Amethyst Kingdom', lore: 'Astral dust.' }
};

const getEl = (id) => document.getElementById(id);

function applyTheme(realm) {
    const theme = themes[realm];
    if (!theme) return;
    const root = document.documentElement;
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--background', theme.bg);
    if (getEl('main-title')) getEl('main-title').innerText = theme.title;
    if (getEl('sub-title')) getEl('sub-title').innerText = theme.lore;
    document.body.style.background = `radial-gradient(circle at center, ${theme.bg} 0%, #000 100%)`;
}

// --- P5.JS & ML5 ENGINE ---

window.makeTransparent = function(img) {
    img.loadPixels();
    for (let i = 0; i < img.pixels.length; i += 4) { if (img.pixels[i] > 240 && img.pixels[i+1] > 240 && img.pixels[i+2] > 240) img.pixels[i+3] = 0; }
    img.updatePixels();
};

let items = [];
let draggingItem = null;
let chargingItem = null;
let chargeStartTime = 0;
let capture;
let backgroundImgs = {};
let bodypix;
let cameraStarted = false;
let cameraReady = false;
let handpose;
let handCapture;
let fairyDustMode = false;
let fairyParticles = [];
let currentHand = null;
let elementOrbs = [];
let spellBursts = [];
let selectedSpell = null;
const spellInventory = { water: 0, fire: 0, air: 0 };
const elementSpells = {
    water: { name: 'Water', icon: '💧', color: [80, 190, 255], glow: '#50c8ff' },
    fire: { name: 'Fire', icon: '🔥', color: [255, 92, 45], glow: '#ff5c2d' },
    air: { name: 'Air', icon: '🌬️', color: [210, 245, 255], glow: '#d2f5ff' }
};

const generateId = () => Math.random().toString(36).substr(2, 9);
let unsubRealm = null;
let syncingFromServer = false;

function getIndexFingerPosition(p) {
    if (!currentHand || !handCapture || !currentHand.landmarks || !currentHand.landmarks[8]) return null;
    const tip = currentHand.landmarks[8];
    return {
        x: p.map(tip[0], 0, handCapture.width, p.width, 0),
        y: p.map(tip[1], 0, handCapture.height, 0, p.height)
    };
}

function addSpellToInventory(type) {
    spellInventory[type] += 1;
    selectedSpell = type;
    renderSpellInventory();
    const spell = elementSpells[type];
    const help = getEl('spell-help');
    if (help) help.innerText = `${spell.name} spell collected. Click it, then click a target box to cast.`;
}

function renderSpellInventory() {
    const inventory = getEl('spell-inventory');
    if (!inventory) return;
    inventory.innerHTML = '';
    Object.keys(elementSpells).forEach((type) => {
        const spell = elementSpells[type];
        const count = spellInventory[type];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.spell = type;
        btn.innerHTML = `<span style="font-size:1.25rem;">${spell.icon}</span><span>${spell.name}</span><strong>${count}</strong>`;
        btn.disabled = count <= 0;
        btn.style.cssText = [
            'height:44px',
            'min-width:92px',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'gap:6px',
            'border-radius:10px',
            `border:2px solid ${selectedSpell === type ? spell.glow : 'var(--border)'}`,
            `background:${selectedSpell === type ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`,
            `color:${count > 0 ? 'white' : 'rgba(255,255,255,0.35)'}`,
            'font-weight:bold',
            'cursor:pointer',
            `box-shadow:${selectedSpell === type ? `0 0 16px ${spell.glow}` : 'none'}`
        ].join(';');
        btn.onclick = () => {
            if (spellInventory[type] <= 0) return;
            selectedSpell = type;
            const help = getEl('spell-help');
            if (help) help.innerText = `${spell.name} spell selected. Click the canvas or a target box to cast it.`;
            renderSpellInventory();
        };
        inventory.appendChild(btn);
    });
    if (!Object.values(spellInventory).some(Boolean)) {
        const empty = document.createElement('span');
        empty.innerText = 'No spells collected yet.';
        empty.style.cssText = 'font-size:0.75rem; color:#aaa;';
        inventory.appendChild(empty);
    }
}

function consumeSelectedSpell() {
    if (!selectedSpell || spellInventory[selectedSpell] <= 0) return null;
    const castType = selectedSpell;
    spellInventory[castType] -= 1;
    if (spellInventory[castType] <= 0) selectedSpell = null;
    renderSpellInventory();
    return castType;
}

function castSpellAtCanvas(p, x, y) {
    const castType = consumeSelectedSpell();
    if (!castType) return false;
    const spell = elementSpells[castType];
    spellBursts.push({ x, y, type: castType, life: 1 });
    const help = getEl('spell-help');
    if (help) help.innerText = `${spell.name} spell cast.`;
    for (let i = 0; i < 28; i++) {
        fairyParticles.push({
            x,
            y,
            vx: p.random(-3.5, 3.5),
            vy: p.random(-3.5, 3.5),
            r: spell.color[0],
            g: spell.color[1],
            b: spell.color[2],
            size: p.random(8, 22),
            life: 1
        });
    }
    return true;
}

function castSpellAtElement(target) {
    const castType = consumeSelectedSpell();
    if (!castType || !target) return false;
    const spell = elementSpells[castType];
    const box = target.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.innerText = spell.icon;
    burst.style.cssText = [
        'position:fixed',
        `left:${box.left + box.width / 2}px`,
        `top:${box.top + box.height / 2}px`,
        'width:120px',
        'height:120px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-size:3.5rem',
        'border-radius:50%',
        `border:3px solid ${spell.glow}`,
        `box-shadow:0 0 35px ${spell.glow}`,
        'background:rgba(0,0,0,0.45)',
        'pointer-events:none',
        'z-index:2000',
        'animation:spellBurst 900ms ease-out forwards'
    ].join(';');
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 950);
    target.style.boxShadow = `0 0 35px ${spell.glow}`;
    setTimeout(() => { target.style.boxShadow = ''; }, 800);
    const help = getEl('spell-help');
    if (help) help.innerText = `${spell.name} spell cast at ${target.querySelector('h3')?.innerText || 'the target box'}.`;
    return true;
}

// --- GLOBAL REAL-TIME SYNC (RTDB LOGIC FROM SHAREDMINDS) ---
window.syncRealmItems = (item = null, isDeleted = false) => {
    if (!currentUser) return;
    const itemPath = `realms/${currentRealm}/items/${item.id}`;
    const itemRef = ref(rtdb, itemPath);

    if (isDeleted) {
        remove(itemRef).catch(e => console.error("RTDB Delete Error:", e));
        return;
    }

    const data = {
        id: item.id,
        x: item.x,
        y: item.y,
        type: item.type,
        scale: item.scale || 1
    };
    if (item.dataUrl) data.dataUrl = item.dataUrl;
    if (item.accessory) data.accessory = item.accessory;

    // Use update for granular changes
    update(itemRef, data).catch(e => console.error("RTDB Sync Error:", e));
};

window.listenToRealm = (realmName) => {
    // Clear old listeners if any
    const oldRef = ref(rtdb, `realms/${currentRealm}/items`);
    off(oldRef);
    
    // Reset local items (except what we are currently interacting with)
    items = items.filter(i => i === draggingItem || i === chargingItem);

    const itemsRef = ref(rtdb, `realms/${realmName}/items`);

    // 1. When a new item is added by anyone
    onChildAdded(itemsRef, (snapshot) => {
        const data = snapshot.val();
        if (!items.find(i => i.id === data.id)) {
            const newItem = { 
                ...data, 
                img: data.dataUrl && window.myP5 ? window.myP5.loadImage(data.dataUrl, (loaded) => window.makeTransparent(loaded)) : null 
            };
            items.push(newItem);
        }
    });

    // 2. When someone else moves an item
    onChildChanged(itemsRef, (snapshot) => {
        const data = snapshot.val();
        const local = items.find(i => i.id === data.id);
        if (local && local !== draggingItem) {
            local.x = data.x;
            local.y = data.y;
            local.scale = data.scale;
        }
    });

    // 3. When someone deletes an item
    onChildRemoved(itemsRef, (snapshot) => {
        const data = snapshot.val();
        items = items.filter(i => i.id !== data.id || i === draggingItem || i === chargingItem);
    });
};

const sketch = (p) => {
    p.preload = () => {
        backgroundImgs.emerald = p.loadImage('assets/emerald_bg.png');
        backgroundImgs.ruby = p.loadImage('assets/ruby_bg.png');
        backgroundImgs.jade = p.loadImage('assets/jade_bg.png');
        backgroundImgs.amethyst = p.loadImage('assets/amethyst_bg.png');
    };

    p.setup = () => {
        const container = getEl('canvas-container');
        const w = container ? container.offsetWidth : 800;
        const canvas = p.createCanvas(w > 0 ? w : 800, 550);
        canvas.parent('canvas-container');
        applyTheme(currentTheme);
        initUIListeners();
        renderSpellInventory();
    };

    p.draw = () => {
        let currentBg = backgroundImgs[currentTheme];
        p.background(themes[currentTheme].bg);
        if (currentBg && currentBg.width > 1) {
            // Show full image stretched to fill canvas
            p.image(currentBg, 0, 0, p.width, p.height);
        }
        const fingerPos = fairyDustMode ? getIndexFingerPosition(p) : null;

        if (fairyDustMode && p.frameCount % 65 === 0 && elementOrbs.length < 8) {
            const types = Object.keys(elementSpells);
            const type = types[Math.floor(p.random(types.length))];
            elementOrbs.push({
                type,
                x: p.random(55, p.width - 55),
                y: p.random(55, p.height - 55),
                size: p.random(34, 48),
                seed: p.random(1000),
                vx: p.random(-0.35, 0.35),
                vy: p.random(-0.25, 0.25)
            });
        }

        for (let i = elementOrbs.length - 1; i >= 0; i--) {
            const orb = elementOrbs[i];
            const spell = elementSpells[orb.type];
            const bob = p.sin(p.frameCount * 0.04 + orb.seed) * 7;
            orb.x += orb.vx;
            orb.y += orb.vy;
            if (orb.x < 35 || orb.x > p.width - 35) orb.vx *= -1;
            if (orb.y < 35 || orb.y > p.height - 35) orb.vy *= -1;

            p.push();
            p.noStroke();
            p.drawingContext.shadowBlur = 24;
            p.drawingContext.shadowColor = spell.glow;
            p.fill(spell.color[0], spell.color[1], spell.color[2], 160);
            p.ellipse(orb.x, orb.y + bob, orb.size);
            p.fill(255, 255, 255, 230);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(orb.size * 0.55);
            p.text(spell.icon, orb.x, orb.y + bob);
            p.pop();

            if (fingerPos && p.dist(fingerPos.x, fingerPos.y, orb.x, orb.y + bob) < orb.size * 0.75) {
                elementOrbs.splice(i, 1);
                addSpellToInventory(orb.type);
                for (let s = 0; s < 18; s++) {
                    fairyParticles.push({
                        x: orb.x,
                        y: orb.y + bob,
                        vx: p.random(-2, 2),
                        vy: p.random(-2.4, 1.2),
                        r: spell.color[0],
                        g: spell.color[1],
                        b: spell.color[2],
                        size: p.random(8, 18),
                        life: 1.0
                    });
                }
            }
        }

        if (fingerPos) {
            p.push();
            p.noFill();
            p.stroke(255, 255, 255, 210);
            p.strokeWeight(2);
            p.circle(fingerPos.x, fingerPos.y, 26);
            p.pop();
        }
        // Draw & age fairy dust orbs
        for (let i = fairyParticles.length - 1; i >= 0; i--) {
            const pt = fairyParticles[i];
            p.push(); p.noStroke();
            // Outer glow layers
            for (let layer = 4; layer >= 0; layer--) {
                const alpha = pt.life * 60 * (1 - layer / 5);
                const sz = pt.size * (1 + layer * 0.8);
                p.fill(pt.r, pt.g, pt.b, alpha);
                p.ellipse(pt.x, pt.y, sz, sz);
            }
            // Bright core
            p.fill(255, 255, 255, pt.life * 200);
            p.ellipse(pt.x, pt.y, pt.size * 0.4, pt.size * 0.4);
            p.pop();
            pt.x += pt.vx; pt.y += pt.vy;
            pt.life -= 0.018;
            if (pt.life <= 0) fairyParticles.splice(i, 1);
        }

        for (let i = spellBursts.length - 1; i >= 0; i--) {
            const burst = spellBursts[i];
            const spell = elementSpells[burst.type];
            p.push();
            p.noFill();
            p.stroke(spell.color[0], spell.color[1], spell.color[2], burst.life * 230);
            p.strokeWeight(5);
            p.circle(burst.x, burst.y, (1 - burst.life) * 180 + 30);
            p.fill(255, 255, 255, burst.life * 210);
            p.noStroke();
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(44 + (1 - burst.life) * 24);
            p.text(spell.icon, burst.x, burst.y);
            p.pop();
            burst.life -= 0.035;
            if (burst.life <= 0) spellBursts.splice(i, 1);
        }

        items.forEach(item => {
            p.push(); p.translate(item.x, item.y);
            if (p.dist(p.mouseX, p.mouseY, item.x, item.y) < 50) p.scale(1.1);
            if (item.type === 'selfie' || item.type === 'ai') {
                p.imageMode(p.CENTER);
                const s = 100 * (item.scale || 1);
                if (item.img) {
                    if (item.type === 'selfie' && item.accessory) {
                        p.push(); p.textAlign(p.CENTER, p.CENTER);
                        if (item.accessory === 'wings') { p.textSize(1.2 * s); p.text('🦋', 0, 0); }
                        p.image(item.img, 0, 0, s, s);
                        if (item.accessory === 'crown') { p.textSize(0.6 * s); p.text('👑', 0, -0.55 * s); }
                        if (item.accessory === 'necklace') { p.textSize(0.4 * s); p.text('📿', 0, 0.45 * s); }
                        if (item.accessory === 'ears') { p.textSize(0.4 * s); p.text('✨', -0.45 * s, -0.3 * s); p.text('✨', 0.45 * s, -0.3 * s); }
                        p.pop();
                    } else p.image(item.img, 0, 0, s, s);
                } else if (item.dataUrl) item.img = p.loadImage(item.dataUrl, (loaded) => window.makeTransparent(loaded));
            } else {
                p.textAlign(p.CENTER, p.CENTER); p.textSize(50 * (item.scale || 1));
                p.text(getEmoji(item.type), 0, 0);
            }
            p.pop();
        });

        // Draw charging ring
        if (chargingItem && !draggingItem) {
            const holdTime = p.millis() - chargeStartTime;
            const chargeScale = p.constrain(p.map(holdTime, 0, 2000, 0.5, 4), 0.5, 4);
            p.push();
            p.noFill();
            p.stroke(themes[currentTheme].primary);
            p.strokeWeight(4);
            p.translate(chargingItem.x, chargingItem.y);
            // Spin ring
            p.rotate(p.frameCount * 0.1);
            p.arc(0, 0, 60 * chargeScale, 60 * chargeScale, 0, p.PI * 1.5);
            p.pop();
        }
    };

    p.mousePressed = () => {
        if (p.mouseX < 0 || p.mouseX > p.width || p.mouseY < 0 || p.mouseY > p.height) return;
        if (selectedSpell && castSpellAtCanvas(p, p.mouseX, p.mouseY)) return;
        let f = false;
        // Check for dragging or erasing first
        for (let i = items.length - 1; i >= 0; i--) { 
            const s = items[i].scale || 1;
            if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 50 * s) { 
                f = true; 
                if (selectedType === 'eraser') {
                    const deleted = items.splice(i, 1)[0];
                    if (currentUser) window.syncRealmItems(deleted, true);
                    return; // deleted, do nothing else
                }
                draggingItem = items[i]; 
                break; 
            } 
        }
        if (!f && selectedType !== 'eraser') {
            // Start charging new item
            chargingItem = { x: p.mouseX, y: p.mouseY, type: selectedType };
            chargeStartTime = p.millis();
        }
    };
    p.mouseDragged = () => { 
        if (draggingItem) { 
            draggingItem.x = p.mouseX; 
            draggingItem.y = p.mouseY; 
        } 
    };
    p.mouseReleased = () => { 
        let changed = false;
        let lastItem = null;
        if (chargingItem && !draggingItem) {
            const holdTime = p.millis() - chargeStartTime;
            const finalScale = p.constrain(p.map(holdTime, 0, 2000, 0.5, 4), 0.5, 4);
            lastItem = { id: generateId(), x: chargingItem.x, y: chargingItem.y, type: chargingItem.type, scale: finalScale };
            items.push(lastItem);
            changed = true;
        } else if (draggingItem) {
            lastItem = draggingItem;
            changed = true;
        }
        chargingItem = null;
        draggingItem = null; 
        if (changed && currentUser) window.syncRealmItems(lastItem);
    };
    p.keyPressed = () => { 
        if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) {
            items = items.filter(i => {
                if (p.dist(p.mouseX, p.mouseY, i.x, i.y) < 50) {
                    if (currentUser) window.syncRealmItems(i, true);
                    return false;
                }
                return true;
            }); 
        }
    };

    window.addSticker = (url, type, acc = null) => {
        p.loadImage(url, (img) => { 
            window.makeTransparent(img); 
            const item = { id: generateId(), x: p.width / 2, y: p.height / 2, type: type, img: img, dataUrl: img.canvas?.toDataURL() || url, accessory: acc, scale: 1 };
            items.push(item); 
            if (currentUser) window.syncRealmItems(item);
        });
    };

    window.startCamera = () => {
        if (cameraStarted) { window.takeSelfie(); return; }
        const btn = getEl('selfie-btn');
        if (btn) { btn.innerText = "TURNING ON CAMERA..."; btn.style.opacity = "0.5"; }
        cameraStarted = true;
        capture = p.createCapture(p.VIDEO, () => {
            capture.size(320, 240);
            
            // Show preview underneath button
            const preview = getEl('webcam-preview');
            if (preview) {
                preview.classList.remove('hidden');
                capture.parent(preview); // Embeds <video> element
                capture.elt.style.width = '100%';
                capture.elt.style.display = 'block';
                capture.elt.style.transform = 'scaleX(-1)'; // Mirror feed
            } else {
                capture.hide();
            }

            cameraReady = true;
            if (btn) { btn.innerText = "📸 SNAP FACE STICKER!"; btn.style.opacity = "1"; }
        });
    };

    window.takeSelfie = () => {
        if (!cameraReady || !capture) { 
            console.log("Still warming up..."); 
            return; 
        }
        
        try {
            // Buffer the raw webcam frame
            let buff = p.createGraphics(320, 240); 
            buff.image(capture, 0, 0, 320, 240);
            
            // Extract a 200x200 square from the center of the 320x240 video
            let img = buff.get(60, 20, 200, 200); 
            
            // Create a perfect circle mask
            let msk = p.createGraphics(200, 200);
            msk.fill(255);
            msk.noStroke();
            msk.circle(100, 100, 180);
            
            img.mask(msk.get()); // Apply circle crop so it's a floating bubble!
            
            // Draw onto final transparent background, and mirror it horizontally
            let finalBuff = p.createGraphics(200, 200); 
            finalBuff.translate(200, 0); 
            finalBuff.scale(-1, 1); 
            finalBuff.imageMode(p.CENTER);
            finalBuff.image(img, 100, 100);
            
            const d = finalBuff.canvas.toDataURL();
            const item = { id: generateId(), x: p.width / 2, y: p.height / 2, type: 'selfie', img: finalBuff.get(), dataUrl: d, accessory: null, scale: 1 };
            items.push(item);
            
            if (currentUser) {
                window.syncRealmItems(item);
                // Save to shared bank in RTDB
                const bankRef = push(ref(rtdb, "spirit_bank"));
                set(bankRef, { 
                    creator: currentUser.email.split('@')[0], 
                    dataUrl: d, 
                    accessory: null 
                }).catch(e => console.warn("Bank save:", e));
            }
        } catch (e) {
            alert("Camera Capture Error: " + e.message);
            console.error(e);
        }
    };


    p.windowResized = () => { const container = getEl('canvas-container'); if (container && container.offsetWidth > 0) p.resizeCanvas(container.offsetWidth, 550); };

    window.toggleFairyDust = () => {
        fairyDustMode = !fairyDustMode;
        const btn = getEl('fairy-dust-btn');
        if (fairyDustMode) {
            btn.innerText = 'LOADING HAND TRACKER...'; btn.style.opacity = '0.5';
            if (!handCapture) {
                handCapture = p.createCapture(p.VIDEO, () => {
                    handCapture.size(320, 240); handCapture.hide();
                    handpose = ml5.handpose(handCapture, { flipHorizontal: true }, () => {
                        btn.innerText = '🖐️ SPELL ORBS ON — COLLECT!'; btn.style.opacity = '1';
                        btn.style.background = 'linear-gradient(135deg, #ff79c6, #50fa7b)';
                        handpose.on('predict', (results) => { currentHand = results.length > 0 ? results[0] : null; });
                    });
                });
            } else {
                btn.innerText = '🖐️ SPELL ORBS ON — COLLECT!'; btn.style.opacity = '1';
                btn.style.background = 'linear-gradient(135deg, #ff79c6, #50fa7b)';
            }
        } else {
            currentHand = null;
            btn.innerText = 'ACTIVATE SPELL ORBS ✨'; btn.style.opacity = '1';
            btn.style.background = 'linear-gradient(135deg, #bd93f9, #ff79c6)';
        }
    };
};
window.myP5 = new p5(sketch);

// --- UI LISTENERS ---
function initUIListeners() {
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'selfie-btn' || e.target.closest('#selfie-btn')) window.startCamera();
        if (e.target.id === 'fairy-dust-btn' || e.target.closest('#fairy-dust-btn')) window.toggleFairyDust();
    });

    const aiBtn = getEl('ai-btn');
    if (aiBtn) aiBtn.onclick = async () => {
        const aiPrompt = getEl('ai-prompt'); const aiCreationsBank = getEl('ai-creations');
        const pr = aiPrompt.value; if (!pr) return;
        const loader = document.createElement('div');
        loader.innerHTML = "🔮"; loader.style = "width:50px; height:50px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.1); border-radius:50%; animation: spin 2s linear infinite;";
        if (aiCreationsBank.children[0] && aiCreationsBank.children[0].tagName === 'SPAN') aiCreationsBank.innerHTML = "";
        aiCreationsBank.appendChild(loader);
        try {
            const res = await fetch("https://itp-ima-replicate-proxy.web.app/api/create_n_get", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: "google/nano-banana", input: { prompt: `Isolated magical item: ${pr}. White background.` } })
            });
            const d = await res.json();
            const url = Array.isArray(d.output) ? d.output[0] : d.output;
            if (url) { loader.remove(); const img = document.createElement('img'); img.src = url; img.style = "width:50px; height:50px; border-radius:10px; cursor:pointer; background:white;"; img.onclick = () => window.addSticker(url, 'ai'); aiCreationsBank.appendChild(img); }
        } catch (e) { loader.innerHTML = "❌"; setTimeout(() => loader.remove(), 2000); }
    };

    const suggestions = document.querySelectorAll('.suggestion-chip');
    suggestions.forEach(chip => {
        chip.onclick = () => {
            const aiPrompt = getEl('ai-prompt');
            if (aiPrompt) {
                aiPrompt.value = chip.innerText;
                aiPrompt.focus();
            }
        };
    });

    const itemPicker = getEl('item-picker');
    if (itemPicker) {
        itemPicker.onclick = (e) => {
            const btn = e.target.closest('.item-btn');
            if (btn) {
                document.querySelectorAll('.item-btn').forEach(b => b.style.background = 'rgba(255,255,255,0.1)');
                btn.style.background = 'var(--primary)';
                selectedType = btn.dataset.type;
            }
        };
    }

    const realmBtns = document.querySelectorAll('.realm-btn');
    const realmNames = { emerald: 'The Emerald Kingdom', ruby: 'The Ruby Kingdom', jade: 'The Jade Kingdom', amethyst: 'The Amethyst Kingdom' };
    realmBtns.forEach(btn => {
        btn.onclick = () => {
            realmBtns.forEach(b => b.style.border = '1px solid transparent');
            btn.style.border = '3px solid white';
            currentTheme = btn.dataset.realm;
            applyTheme(currentTheme);
            const nameEl = getEl('selected-realm-name');
            if (nameEl) { nameEl.innerText = realmNames[currentTheme]; nameEl.style.color = themes[currentTheme].primary; }
        };
    });

    const loginBtn = getEl('login-btn'); const signupBtn = getEl('signup-btn');
    if (loginBtn) loginBtn.onclick = async () => { 
        const email = getEl('email').value; const pass = getEl('password').value;
        try { 
            await signInWithEmailAndPassword(auth, email, pass); 
        } catch (e) { 
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found') {
                try { await createUserWithEmailAndPassword(auth, email, pass); } catch (err) { alert(err.message); }
            } else { alert(e.message); }
        } 
    };
    if (signupBtn) signupBtn.onclick = async () => { 
        const email = getEl('email').value; const pass = getEl('password').value;
        try { await createUserWithEmailAndPassword(auth, email, pass); } catch (e) { alert(e.message); } 
    };

    const saveBtn = getEl('save-btn');
    if (saveBtn) saveBtn.onclick = async () => {
        if (!currentUser) return alert("You must be logged in to commit lore!");
        saveBtn.innerText = "POSTING...";
        try {
            // Save to Public RTDB Exhibition for SharedMinds style visibility
            const galleryRef = ref(rtdb, 'public_exhibition');
            const newSceneRef = push(galleryRef);
            await set(newSceneRef, {
                uid: currentUser.uid, 
                creator: currentUser.email.split('@')[0], 
                realm: currentTheme,
                arrangement: items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null, accessory: i.accessory || null, scale: i.scale || 1 })),
                createdAt: serverTimestamp() // Note: RTDB serverTimestamp is slightly different but often handled by client SDK
            }); alert("Recorded to the Grand Exhibition!");
        } catch (e) { alert(e.message); }
        saveBtn.innerText = "POST TO THE EXHIBITION ✨";
    };
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; 
        getEl('auth-overlay').classList.add('hidden'); 
        getEl('user-info').classList.remove('hidden');
        getEl('user-display').innerText = `Elder ${user.email.split('@')[0]}`;
        
        // Start in OWN private realm
        currentRealm = user.uid;
        getEl('main-title').innerText = `${user.email.split('@')[0]}'s Kingdom`;
        window.listenToRealm(currentRealm);
        
        loadGallery(); 
        listenToSharedStickers();
    } else {
        currentUser = null; getEl('auth-overlay').classList.remove('hidden'); getEl('user-info').classList.add('hidden');
    }
});

function listenToSharedStickers() {
    const bankRef = ref(rtdb, "spirit_bank");
    onValue(bankRef, (snapshot) => {
        const shared = getEl('shared-stickers');
        if (shared && snapshot.exists()) {
            shared.innerHTML = "";
            snapshot.forEach(child => {
                const d = child.val(); 
                const img = document.createElement('img');
                img.src = d.dataUrl; img.style = "width:50px; height:50px; border-radius:50%; cursor:pointer; border:2px solid var(--primary); margin:5px; object-fit: cover;";
                img.onclick = () => window.addSticker(d.dataUrl, 'selfie', d.accessory);
                shared.insertBefore(img, shared.firstChild); // Newest first
            });
        }
    });
}

function loadGallery() {
    const galleryRef = ref(rtdb, "public_exhibition");
    onValue(galleryRef, (snapshot) => {
        const gal = getEl('scene-gallery');
        if (gal && snapshot.exists()) {
            gal.innerHTML = "";
            snapshot.forEach(child => {
                const d = child.val(); 
                const card = document.createElement('div');
                card.className = 'scene-card'; card.style.borderColor = themes[d.realm || 'emerald'].primary;
                card.innerHTML = `<h3>${d.creator}'s ${d.realm || 'emerald'} Realm</h3><p style="font-size:0.7rem; opacity:0.6;">Click to enter and edit together!</p>`;
                card.onclick = () => {
                    if (selectedSpell && castSpellAtElement(card)) return;
                    currentRealm = d.uid; 
                    currentTheme = d.realm || 'emerald';
                    if (getEl('main-title')) getEl('main-title').innerText = `${d.creator}'s Kingdom`;
                    applyTheme(currentTheme);
                    window.listenToRealm(currentRealm);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                };
                gal.insertBefore(card, gal.firstChild); // Newest first
            });
        }
    });
}

window.logout = () => signOut(auth).then(() => location.reload());
function getEmoji(t) { return { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' }[t] || '✨'; }
