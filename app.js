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
    emerald: { primary: '#50fa7b', secondary: '#f1fa8c', bg: '#1a2a22', title: 'The Emerald Kingdom', lore: 'Nature whispers in the moss.' },
    ruby: { primary: '#ff5555', secondary: '#ffb86c', bg: '#2a1a1a', title: 'The Ruby Kingdom', lore: 'Fire glows in the deep.' },
    jade: { primary: '#8be9fd', secondary: '#50fa7b', bg: '#1a262a', title: 'The Jade Kingdom', lore: 'Ice flows like liquid glass.' },
    amethyst: { primary: '#bd93f9', secondary: '#ff79c6', bg: '#1e1a2a', title: 'The Amethyst Kingdom', lore: 'Astral dust in the void.' }
};

// --- DOM ELEMENTS ---
const authOverlay = document.getElementById('auth-overlay');
const realmBtns = document.querySelectorAll('.realm-btn');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const userInfo = document.getElementById('user-info');
const userDisplay = document.getElementById('user-display');
const saveBtn = document.getElementById('save-btn');
const descriptionInput = document.getElementById('scene-description');
const sceneGallery = document.getElementById('scene-gallery');
const itemPicker = document.getElementById('item-picker');
const sharedStickerContainer = document.getElementById('shared-stickers');
const selfieBtn = document.getElementById('selfie-btn');
const aiBtn = document.getElementById('ai-btn');
const aiPrompt = document.getElementById('ai-prompt');

// Theme Switcher
realmBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        realmBtns.forEach(b => b.style.borderColor = 'transparent');
        btn.style.borderColor = 'white';
        currentRealm = btn.dataset.realm;
        applyTheme(currentRealm);
    });
});

function applyTheme(realm) {
    const theme = themes[realm];
    const root = document.documentElement;
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--background', theme.bg);
    document.getElementById('main-title').innerText = theme.title;
    document.getElementById('sub-title').innerText = theme.lore;
    document.body.style.background = `radial-gradient(circle at center, ${theme.bg} 0%, #000 100%)`;
}

// Item Picker Logic
const itemBtns = document.querySelectorAll('.item-btn');
itemPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.item-btn');
    if (!btn) return;
    itemBtns.forEach(b => {
        b.style.background = 'rgba(255,255,255,0.1)';
        b.classList.remove('active');
    });
    btn.style.background = 'var(--primary)';
    btn.classList.add('active');
    selectedType = btn.dataset.type;
});

// Auth Handlers
loginBtn.onclick = async () => { try { await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value); } catch (e) { alert(e.message); } };
signupBtn.onclick = async () => { try { await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value); } catch (e) { alert(e.message); } };
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user; authOverlay.classList.add('hidden'); userInfo.classList.remove('hidden');
        userDisplay.innerText = `Noble ${user.email.split('@')[0]}`;
        loadGallery(); listenToSharedStickers();
    } else {
        currentUser = null; authOverlay.classList.remove('hidden'); userInfo.classList.add('hidden');
    }
});
window.logout = () => signOut(auth);

// --- P5.JS REALISTIC ENGINE ---
let items = [];
let draggingItem = null;
let capture;
let backgroundImgs = {};

const sketch = (p) => {
    p.preload = () => {
        backgroundImgs.emerald = p.loadImage('assets/emerald_bg.png');
        backgroundImgs.ruby = p.loadImage('assets/ruby_bg.png');
        backgroundImgs.jade = p.loadImage('assets/jade_bg.png');
        backgroundImgs.amethyst = p.loadImage('assets/amethyst_bg.png');
    };

    p.setup = () => {
        const container = document.getElementById('canvas-container');
        const canvas = p.createCanvas(container.offsetWidth, 500); // TALLER CANVAS
        canvas.parent(container);
        capture = p.createCapture(p.VIDEO);
        capture.size(320, 240);
        capture.hide();
        applyTheme(currentRealm);
    };

    p.draw = () => {
        let currentBg = backgroundImgs[currentRealm];
        if (currentBg) {
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
                if (item.img) p.image(item.img, 0, 0, 100, 100);
                else if (item.dataUrl) item.img = p.loadImage(item.dataUrl, (loaded) => makeTransparent(loaded));
            } else {
                p.textAlign(p.CENTER, p.CENTER);
                p.textSize(50);
                p.text(getEmoji(item.type), 0, 0);
            }
            p.pop();
        });
    };

    p.mousePressed = () => {
        let f = false;
        for (let i = items.length - 1; i >= 0; i--) {
            if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 50) { draggingItem = items[i]; f = true; break; }
        }
        if (!f && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
            items.push({ x: p.mouseX, y: p.mouseY, type: selectedType });
        }
    };
    p.mouseDragged = () => { if (draggingItem) { draggingItem.x = p.mouseX; draggingItem.y = p.mouseY; } };
    p.mouseReleased = () => { draggingItem = null; };
    p.keyPressed = () => { if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) items = items.filter(i => p.dist(p.mouseX, p.mouseY, i.x, i.y) > 50); };

    window.addSticker = (url, type) => {
        p.loadImage(url, (img) => {
            makeTransparent(img);
            items.push({ x: p.width / 2, y: p.height / 2, type: type, img: img, dataUrl: img.canvas?.toDataURL() || url });
        });
    };

    window.takeSelfie = () => {
        let buff = p.createGraphics(200, 200);
        buff.translate(200, 0); buff.scale(-1, 1);
        buff.image(capture, 0, 0, 260, 200);
        let mask = p.createGraphics(200, 200);
        mask.ellipse(100, 100, 200, 200);
        let finalImg = buff.get();
        finalImg.mask(mask.get());
        const d = finalImg.canvas.toDataURL();
        items.push({ x: p.width / 2, y: p.height / 2, type: 'selfie', img: finalImg, dataUrl: d });
        if (currentUser) addDoc(collection(db, "spirit_stickers"), { creator: currentUser.email.split('@')[0], dataUrl: d, createdAt: serverTimestamp() });
    };

    function makeTransparent(img) {
        img.loadPixels();
        for (let i = 0; i < img.pixels.length; i += 4) {
            if (img.pixels[i] > 240 && img.pixels[i+1] > 240 && img.pixels[i+2] > 240) img.pixels[i+3] = 0;
        }
        img.updatePixels();
    }
    p.windowResized = () => p.resizeCanvas(document.getElementById('canvas-container').offsetWidth, 500);
};

const myP5 = new p5(sketch);

// UI Listeners
selfieBtn.onclick = () => window.takeSelfie();
aiBtn.onclick = async () => {
    const pr = aiPrompt.value; if (!pr) return alert("Prompt needed!");
    aiBtn.innerText = "CONJURING...";
    try {
        const res = await fetch("https://itp-ima-replicate-proxy.web.app/api/create_n_get", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "google/nano-banana", input: { prompt: `A standalone, isolated magical item: ${pr}. Detailed fantasy, cinematic, isolated on pure white background.` } })
        });
        const d = await res.json();
        const url = Array.isArray(d.output) ? d.output[0] : d.output;
        if (url) window.addSticker(url, 'ai'); else throw new Error("Silent void");
    } catch (e) { alert("Error: " + e.message); }
    finally { aiBtn.innerText = "✨ CONJURE ITEM"; }
};

function listenToSharedStickers() {
    onSnapshot(query(collection(db, "spirit_stickers"), orderBy("createdAt", "desc"), limit(30)), (sn) => {
        sharedStickerContainer.innerHTML = "";
        sn.forEach(doc => {
            const d = doc.data(); const img = document.createElement('img');
            img.src = d.dataUrl; img.style = "width:50px; height:50px; border-radius:50%; cursor:pointer; border:2px solid var(--primary); margin:5px; object-fit: cover;";
            img.onclick = () => window.addSticker(d.dataUrl, 'selfie');
            sharedStickerContainer.appendChild(img);
        });
    });
}

saveBtn.onclick = async () => {
    if (!currentUser) return;
    saveBtn.innerText = "RECORDING...";
    try {
        await addDoc(collection(db, "scenes"), {
            uid: currentUser.uid, creator: currentUser.email.split('@')[0], realm: currentRealm,
            description: descriptionInput.value || "", arrangement: items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null })),
            createdAt: serverTimestamp()
        }); alert("Lore committed.");
    } catch (e) { alert(e.message); }
    saveBtn.innerText = "COMMIT TO ETERNITY";
};

function loadGallery() {
    onSnapshot(query(collection(db, "scenes"), orderBy("createdAt", "desc"), limit(10)), (sn) => {
        sceneGallery.innerHTML = "";
        sn.forEach(doc => {
            const d = doc.data(); const card = document.createElement('div');
            card.className = 'scene-card'; card.style.borderColor = themes[d.realm || 'emerald'].primary;
            card.innerHTML = `<h3>${d.creator}'s ${d.realm || 'emerald'}</h3><p>"${d.description}"</p>`;
            card.onclick = () => {
                currentRealm = d.realm || 'emerald'; applyTheme(currentRealm);
                items = d.arrangement.map(i => ({ ...i, img: i.dataUrl ? myP5.loadImage(i.dataUrl) : null }));
            };
            sceneGallery.appendChild(card);
        });
    });
}
function getEmoji(t) { return { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' }[t] || '✨'; }
