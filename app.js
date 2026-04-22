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
    off
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

const generateId = () => Math.random().toString(36).substr(2, 9);
let unsubRealm = null;
let syncingFromServer = false;

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
    };

    p.draw = () => {
        let currentBg = backgroundImgs[currentRealm];
        p.background(themes[currentRealm].bg);
        if (currentBg && currentBg.width > 1) {
            // Show full image stretched to fill canvas
            p.image(currentBg, 0, 0, p.width, p.height);
        }
        // Fairy dust particles
        if (fairyDustMode && currentHand) {
            const kps = currentHand.landmarks;
            const tip = kps[8]; // index fingertip
            const hx = p.map(tip[0], 0, handCapture.width, p.width, 0); // mirrored
            const hy = p.map(tip[1], 0, handCapture.height, 0, p.height);
            // Spawn 4 orbs per frame for a dense, sensitive trail
            const colors = [
                [255, 100, 200], [180, 100, 255], [100, 220, 255],
                [255, 220, 80],  [100, 255, 180], [255, 140, 80]
            ];
            for (let s = 0; s < 4; s++) {
                const c = colors[Math.floor(p.random(colors.length))];
                fairyParticles.push({
                    x: hx + p.random(-10, 10),
                    y: hy + p.random(-10, 10),
                    vx: p.random(-1, 1),
                    vy: p.random(-1.2, -0.2),
                    r: c[0], g: c[1], b: c[2],
                    size: p.random(6, 16),
                    life: 1.0
                });
            }
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
            p.stroke(themes[currentRealm].primary);
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
            
            const accs = ['wings', 'crown', 'ears', 'necklace', null]; 
            const randomAcc = accs[Math.floor(Math.random() * accs.length)];
            const d = finalBuff.canvas.toDataURL();
            
            const item = { id: generateId(), x: p.width / 2, y: p.height / 2, type: 'selfie', img: finalBuff.get(), dataUrl: d, accessory: randomAcc, scale: 1 };
            items.push(item);
            
            if (currentUser) {
                window.syncRealmItems(item);
                addDoc(collection(db, "spirit_stickers"), { 
                    creator: currentUser.email.split('@')[0], 
                    dataUrl: d, 
                    createdAt: serverTimestamp(), 
                    accessory: randomAcc 
                }).catch(e => console.warn("Sticker save:", e));
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
                        btn.innerText = '🖐️ FAIRY DUST ON — WAVE!'; btn.style.opacity = '1';
                        btn.style.background = 'linear-gradient(135deg, #ff79c6, #50fa7b)';
                        handpose.on('predict', (results) => { currentHand = results.length > 0 ? results[0] : null; });
                    });
                });
            } else {
                btn.innerText = '🖐️ FAIRY DUST ON — WAVE!'; btn.style.opacity = '1';
                btn.style.background = 'linear-gradient(135deg, #ff79c6, #50fa7b)';
            }
        } else {
            currentHand = null;
            btn.innerText = 'ACTIVATE FAIRY DUST ✨'; btn.style.opacity = '1';
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
        saveBtn.innerText = "RECORDING...";
        try {
            await addDoc(collection(db, "scenes"), {
                uid: currentUser.uid, 
                creator: currentUser.email.split('@')[0], 
                realm: currentTheme, // The theme choice
                arrangement: items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null, accessory: i.accessory || null, scale: i.scale || 1 })),
                createdAt: serverTimestamp()
            }); alert("Recorded to the Grand Exhibition!");
        } catch (e) { alert(e.message); }
        saveBtn.innerText = "RECORD SCENE";
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
    onSnapshot(query(collection(db, "spirit_stickers"), orderBy("createdAt", "desc"), limit(30)), (sn) => {
        const shared = getEl('shared-stickers');
        if (shared) {
            shared.innerHTML = "";
            sn.forEach(doc => {
                const d = doc.data(); const img = document.createElement('img');
                img.src = d.dataUrl; img.style = "width:50px; height:50px; border-radius:50%; cursor:pointer; border:2px solid var(--primary); margin:5px; object-fit: cover;";
                img.onclick = () => window.addSticker(d.dataUrl, 'selfie', d.accessory);
                shared.appendChild(img);
            });
        }
    });
}

function loadGallery() {
    onSnapshot(query(collection(db, "scenes"), orderBy("createdAt", "desc"), limit(20)), (sn) => {
        const gal = getEl('scene-gallery');
        if (gal) {
            gal.innerHTML = "";
            sn.forEach(doc => {
                const d = doc.data(); 
                const card = document.createElement('div');
                card.className = 'scene-card'; card.style.borderColor = themes[d.realm || 'emerald'].primary;
                card.innerHTML = `<h3>${d.creator}'s ${d.realm || 'emerald'} Realm</h3><p style="font-size:0.7rem; opacity:0.6;">Click to enter and edit together!</p>`;
                card.onclick = () => {
                    currentRealm = d.uid; // Switch to their LIVE sync ID
                    currentTheme = d.realm || 'emerald';
                    if (getEl('main-title')) getEl('main-title').innerText = `${d.creator}'s Kingdom`;
                    applyTheme(currentTheme);
                    window.listenToRealm(currentRealm);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                };
                gal.appendChild(card);
            });
        }
    });
}
window.logout = () => signOut(auth).then(() => location.reload());
function getEmoji(t) { return { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' }[t] || '✨'; }
