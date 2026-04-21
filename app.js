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
    limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyBcnbOXvlC4Z30Y34BMShr8NaGozymIVLE",
  authDomain: "fairytopia.firebaseapp.com",
  projectId: "fairytopia",
  storageBucket: "fairytopia.firebasestorage.app",
  messagingSenderId: "531666119490",
  appId: "1:531666119490:web:329cedbdaf92247cdef6db"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentRealm = 'emerald';
let selectedType = 'fairy';

const themes = {
    emerald: { primary: '#50fa7b', secondary: '#f1fa8c', bg: '#1a2a22', title: 'The Emerald Kingdom', lore: 'Nature whispers.' },
    ruby: { primary: '#ff5555', secondary: '#ffb86c', bg: '#2a1a1a', title: 'The Ruby Kingdom', lore: 'Fire glows.' },
    jade: { primary: '#8be9fd', secondary: '#50fa7b', bg: '#1a262a', title: 'The Jade Kingdom', lore: 'Ice flows.' },
    amethyst: { primary: '#bd93f9', secondary: '#ff79c6', bg: '#1e1a2a', title: 'The Amethyst Kingdom', lore: 'Astral dust.' }
};

// --- DOM SELECTION (LAZY) ---
const getEl = (id) => document.getElementById(id);

function applyTheme(realm) {
    const theme = themes[realm];
    const root = document.documentElement;
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--background', theme.bg);
    const title = getEl('main-title');
    const sub = getEl('sub-title');
    if (title) title.innerText = theme.title;
    if (sub) sub.innerText = theme.lore;
    document.body.style.background = `radial-gradient(circle at center, ${theme.bg} 0%, #000 100%)`;
}

// --- P5.JS & ML5 ENGINE ---
let items = [];
let draggingItem = null;
let capture;
let backgroundImgs = {};
let bodypix;

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
        const canvas = p.createCanvas(w, 550);
        canvas.parent('canvas-container');
        
        capture = p.createCapture(p.VIDEO);
        capture.size(320, 240);
        capture.hide();
        
        bodypix = ml5.bodyPix(capture, { multiplier: 0.75, outputStride: 16, segmentationThreshold: 0.5 }, () => console.log('BodyPix ready'));
        
        applyTheme(currentRealm);
        initUIListeners();
    };

    p.draw = () => {
        let currentBg = backgroundImgs[currentRealm];
        if (currentBg && currentBg.width > 1) {
            let canvasRatio = p.width / p.height;
            let imgRatio = currentBg.width / currentBg.height;
            let sw, sh, sx, sy;
            if (imgRatio > canvasRatio) { sh = currentBg.height; sw = currentBg.height * canvasRatio; sx = (currentBg.width - sw) / 2; sy = 0; }
            else { sw = currentBg.width; sh = currentBg.width / canvasRatio; sx = 0; sy = (currentBg.height - sh) / 2; }
            p.image(currentBg, 0, 0, p.width, p.height, sx, sy, sw, sh);
        } else {
            p.background(themes[currentRealm].bg);
        }
        
        items.forEach(item => {
            p.push();
            p.translate(item.x, item.y);
            if (p.dist(p.mouseX, p.mouseY, item.x, item.y) < 50) p.scale(1.1);
            if (item.type === 'selfie' || item.type === 'ai') {
                p.imageMode(p.CENTER);
                if (item.img) {
                    if (item.type === 'selfie' && item.accessory) {
                        p.push(); p.textAlign(p.CENTER, p.CENTER);
                        if (item.accessory === 'wings') { p.textSize(120); p.text('🦋', 0, 0); }
                        p.image(item.img, 0, 0, 100, 100);
                        if (item.accessory === 'crown') { p.textSize(60); p.text('👑', 0, -55); }
                        if (item.accessory === 'necklace') { p.textSize(40); p.text('📿', 0, 45); }
                        if (item.accessory === 'ears') { p.textSize(40); p.text('✨', -45, -30); p.text('✨', 45, -30); }
                        p.pop();
                    } else p.image(item.img, 0, 0, 100, 100);
                } else if (item.dataUrl) item.img = p.loadImage(item.dataUrl, (loaded) => makeTransparent(loaded));
            } else {
                p.textAlign(p.CENTER, p.CENTER); p.textSize(50);
                p.text(getEmoji(item.type), 0, 0);
            }
            p.pop();
        });
    };

    p.mousePressed = () => {
        let f = false;
        for (let i = items.length - 1; i >= 0; i--) { if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 50) { draggingItem = items[i]; f = true; break; } }
        if (!f && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) items.push({ x: p.mouseX, y: p.mouseY, type: selectedType });
    };
    p.mouseDragged = () => { if (draggingItem) { draggingItem.x = p.mouseX; draggingItem.y = p.mouseY; } };
    p.mouseReleased = () => { draggingItem = null; };
    p.keyPressed = () => { if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) items = items.filter(i => p.dist(p.mouseX, p.mouseY, i.x, i.y) > 50); };

    window.addSticker = (url, type, acc = null) => {
        p.loadImage(url, (img) => {
            makeTransparent(img);
            items.push({ x: p.width / 2, y: p.height / 2, type: type, img: img, dataUrl: img.canvas?.toDataURL() || url, accessory: acc });
        });
    };

    window.takeSelfie = () => {
        if (!bodypix) return alert("Mirror warming up...");
        bodypix.segment(capture, (error, result) => {
            if (error) return;
            let buff = p.createGraphics(320, 240);
            buff.image(capture, 0, 0); buff.loadPixels();
            for (let i = 0; i < buff.pixels.length; i += 4) { if (result.mask.data[i/4] === 0) buff.pixels[i+3] = 0; }
            buff.updatePixels();
            let finalBuff = p.createGraphics(200, 200);
            finalBuff.translate(200, 0); finalBuff.scale(-1, 1);
            finalBuff.image(buff, -60, 0, 320, 240);
            const accs = ['wings', 'crown', 'ears', 'necklace', null];
            const randomAcc = accs[Math.floor(Math.random() * accs.length)];
            const d = finalBuff.canvas.toDataURL();
            items.push({ x: p.width / 2, y: p.height / 2, type: 'selfie', img: finalBuff.get(), dataUrl: d, accessory: randomAcc });
            if (currentUser) addDoc(collection(db, "spirit_stickers"), { creator: currentUser.email.split('@')[0], dataUrl: d, createdAt: serverTimestamp(), accessory: randomAcc });
        });
    };

    function makeTransparent(img) {
        img.loadPixels();
        for (let i = 0; i < img.pixels.length; i += 4) { if (img.pixels[i] > 240 && img.pixels[i+1] > 240 && img.pixels[i+2] > 240) img.pixels[i+3] = 0; }
        img.updatePixels();
    }
    p.windowResized = () => {
        const container = getEl('canvas-container');
        if (container) p.resizeCanvas(container.offsetWidth, 550);
    };
};

const myP5 = new p5(sketch);

// --- UI INITIALIZATION ---
function initUIListeners() {
    const selfieBtn = getEl('selfie-btn');
    if (selfieBtn) selfieBtn.onclick = () => window.takeSelfie();

    const aiBtn = getEl('ai-btn');
    const aiPrompt = getEl('ai-prompt');
    const aiCreationsBank = getEl('ai-creations');
    if (aiBtn) aiBtn.onclick = async () => {
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
        const itemBtns = document.querySelectorAll('.item-btn');
        itemPicker.onclick = (e) => {
            const btn = e.target.closest('.item-btn');
            if (btn) {
                itemBtns.forEach(b => b.style.background = 'rgba(255,255,255,0.1)');
                btn.style.background = 'var(--primary)';
                selectedType = btn.dataset.type;
            }
        };
    }

    const realmBtns = document.querySelectorAll('.realm-btn');
    realmBtns.forEach(btn => {
        btn.onclick = () => {
            realmBtns.forEach(b => b.style.borderColor = 'transparent');
            btn.style.borderColor = 'white';
            currentRealm = btn.dataset.realm;
            applyTheme(currentRealm);
        };
    });

    const loginBtn = getEl('login-btn');
    const signupBtn = getEl('signup-btn');
    const emailInput = getEl('email');
    const passwordInput = getEl('password');
    if (loginBtn) loginBtn.onclick = async () => { try { await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value); } catch (e) { alert(e.message); } };
    if (signupBtn) signupBtn.onclick = async () => { try { await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value); } catch (e) { alert(e.message); } };

    const saveBtn = getEl('save-btn');
    if (saveBtn) saveBtn.onclick = async () => {
        if (!currentUser) return;
        saveBtn.innerText = "RECORDING...";
        try {
            await addDoc(collection(db, "scenes"), {
                uid: currentUser.uid, realm: currentRealm,
                arrangement: items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null, accessory: i.accessory || null })),
                createdAt: serverTimestamp()
            }); alert("Recorded!");
        } catch (e) { alert(e.message); }
        saveBtn.innerText = "RECORD SCENE";
    };
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user; getEl('auth-overlay').classList.add('hidden'); getEl('user-info').classList.remove('hidden');
        getEl('user-display').innerText = `Elder ${user.email.split('@')[0]}`;
        loadGallery(); listenToSharedStickers();
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
    onSnapshot(query(collection(db, "scenes"), orderBy("createdAt", "desc"), limit(5)), (sn) => {
        const gal = getEl('scene-gallery');
        if (gal) {
            gal.innerHTML = "";
            sn.forEach(doc => {
                const d = doc.data(); const card = document.createElement('div');
                card.className = 'scene-card'; card.style.borderColor = themes[d.realm || 'emerald'].primary;
                card.innerHTML = `<h3>${d.realm || 'emerald'} Realm</h3>`;
                card.onclick = () => {
                    currentRealm = d.realm || 'emerald'; applyTheme(currentRealm);
                    items = d.arrangement.map(i => ({ ...i, img: i.dataUrl ? myP5.loadImage(i.dataUrl) : null }));
                };
                gal.appendChild(card);
            });
        }
    });
}
function getEmoji(t) { return { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' }[t] || '✨'; }
