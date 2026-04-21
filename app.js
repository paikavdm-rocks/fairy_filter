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

// --- REALM THEMES ---
const themes = {
    emerald: { primary: '#50fa7b', secondary: '#f1fa8c', bg: '#1a2a22', title: 'The Emerald Kingdom', lore: '"Where every fairy leaves a footprint in the stars..."'},
    ruby: { primary: '#ff5555', secondary: '#ffb86c', bg: '#2a1a1a', title: 'The Ruby Kingdom', lore: '"Fire and blood, tempered in the heart of a star."' },
    jade: { primary: '#8be9fd', secondary: '#50fa7b', bg: '#1a262a', title: 'The Jade Kingdom', lore: '"Serenity flowing like a river of liquid light."' },
    amethyst: { primary: '#bd93f9', secondary: '#ff79c6', bg: '#1e1a2a', title: 'The Amethyst Kingdom', lore: '"Secrets whispered in the silence between dimensions."' }
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
const clearBtn = document.getElementById('clear-btn');
const descriptionInput = document.getElementById('scene-description');
const sceneGallery = document.getElementById('scene-gallery');
const itemPicker = document.getElementById('item-picker');
const sharedStickerContainer = document.getElementById('shared-stickers');
const selfieBtn = document.getElementById('selfie-btn');
const aiBtn = document.getElementById('ai-btn');
const aiPrompt = document.getElementById('ai-prompt');

// --- REALM SELECTION ---
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
    root.style.setProperty('--border', `rgba(${hexToRgb(theme.primary)}, 0.2)`);
    
    document.getElementById('main-title').innerText = theme.title;
    document.getElementById('sub-title').innerText = theme.lore;
    document.body.style.background = `radial-gradient(circle at center, ${lighten(theme.bg, 10)} 0%, ${theme.bg} 100%)`;
    
    if (window.updateP5Colors) window.updateP5Colors(theme);
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
}
function lighten(col, amt) { return col; }

// --- AUTH LOGIC ---
loginBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return alert("Magical credentials required!");

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            alert("Wrong Magic Words! Please try again.");
        } else if (error.code === 'auth/user-not-found') {
            alert("No fairy found with this email. Click 'SIGN UP' to create your account!");
        } else {
            alert(error.message);
        }
    }
});

signupBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return alert("Credentials required for sign up!");

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account created successfully! Welcome to the realm.");
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            alert("This email is already in use! Please use LOGIN instead.");
        } else {
            alert(error.message);
        }
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userDisplay.innerText = `Noble ${user.email.split('@')[0]}`;
        loadGallery();
        listenToSharedStickers();
    } else {
        currentUser = null;
        authOverlay.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

window.logout = () => signOut(auth);

// --- P5.JS REALM ENGINE ---
let items = [];
let selectedType = 'fairy';
let draggingItem = null;
let capture;
let forestBg = [];
let bgPrimary, bgSecondary;

const sketch = (p) => {
    p.setup = () => {
        const container = document.getElementById('canvas-container');
        const canvas = p.createCanvas(container.offsetWidth, 500);
        canvas.parent(container);
        
        capture = p.createCapture(p.VIDEO);
        capture.size(160, 120);
        capture.hide();

        window.updateP5Colors = (theme) => {
            bgPrimary = p.color(theme.primary);
            bgSecondary = p.color(theme.secondary);
            forestBg = [];
            for(let i=0; i<30; i++) {
                let c = p.color(theme.primary);
                c.setAlpha(p.random(50, 150));
                forestBg.push({ x: p.random(p.width), y: p.random(p.height), size: p.random(20, 100), color: c });
            }
        };
        applyTheme(currentRealm);
    };

    p.draw = () => {
        p.background(themes[currentRealm].bg);
        p.noStroke();
        forestBg.forEach(leaf => {
            p.fill(leaf.color);
            p.ellipse(leaf.x, leaf.y + p.sin(p.frameCount * 0.01 + leaf.x) * 10, leaf.size, leaf.size * 1.5);
        });
        for(let i=0; i<15; i++) {
            let x = p.noise(i, p.frameCount * 0.005) * p.width;
            let y = p.noise(i + 10, p.frameCount * 0.005) * p.height;
            p.fill(bgSecondary || 255, p.noise(i, p.frameCount * 0.02) * 255);
            p.ellipse(x, y, 4, 4);
        }
        items.forEach(item => {
            p.push();
            p.translate(item.x, item.y);
            if (p.dist(p.mouseX, p.mouseY, item.x, item.y) < 40) p.scale(1.15);
            if (item.type === 'selfie' || item.type === 'ai') {
                p.push();
                p.drawingContext.shadowBlur = 15;
                p.drawingContext.shadowColor = themes[currentRealm].primary;
                p.fill(bgPrimary);
                p.ellipse(0, 0, 85, 85);
                if (item.img) p.image(item.img, -40, -40, 80, 80);
                else if (item.dataUrl) item.img = p.loadImage(item.dataUrl);
                p.pop();
            } else {
                p.textAlign(p.CENTER, p.CENTER);
                p.textSize(40);
                p.text(getEmoji(item.type), 0, 0);
            }
            p.pop();
        });
    };

    p.mousePressed = () => {
        let f = false;
        for (let i = items.length - 1; i >= 0; i--) {
            if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 40) { draggingItem = items[i]; f = true; break; }
        }
        if (!f && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
            items.push({ x: p.mouseX, y: p.mouseY, type: selectedType });
        }
    };
    p.mouseDragged = () => { if (draggingItem) { draggingItem.x = p.mouseX; draggingItem.y = p.mouseY; } };
    p.mouseReleased = () => { draggingItem = null; };
    p.keyPressed = () => { if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) items = items.filter(i => p.dist(p.mouseX, p.mouseY, i.x, i.y) > 40); };
    window.addSticker = (d, t = 'selfie') => items.push({ x: p.width / 2, y: p.height / 2, type: t, img: p.loadImage(d), dataUrl: d });
    window.takeSelfie = async () => {
        let img = capture.get(); img.resize(150, 0); const d = img.canvas.toDataURL();
        addSticker(d, 'selfie');
        if (currentUser) await addDoc(collection(db, "spirit_stickers"), { creator: currentUser.email.split('@')[0], dataUrl: d, createdAt: serverTimestamp() });
    };
    p.windowResized = () => p.resizeCanvas(document.getElementById('canvas-container').offsetWidth, 500);
};
new p5(sketch);

// --- UI LISTENERS ---
selfieBtn.addEventListener('click', () => window.takeSelfie());
aiBtn.addEventListener('click', async () => {
    const pr = aiPrompt.value; if (!pr) return alert("Prompt needed!");
    aiBtn.innerText = "CONJURING...";
    try {
        const res = await fetch("https://itp-ima-replicate-proxy.web.app/api/create_n_get", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: `sticker of ${pr}, magical style, white background`, model: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1d712de74a5ee2486673d4d4d557599c537" })
        });
        const d = await res.json();
        if (d.output) window.addSticker(d.output[0], 'ai');
    } catch (e) { alert(e.message); }
    aiBtn.innerText = "✨ CONJURE ITEM";
});

function listenToSharedStickers() {
    onSnapshot(query(collection(db, "spirit_stickers"), orderBy("createdAt", "desc"), limit(20)), (sn) => {
        sharedStickerContainer.innerHTML = "";
        sn.forEach(doc => {
            const data = doc.data(); const img = document.createElement('img');
            img.src = data.dataUrl; img.className = 'shared-thumb';
            img.style = "width:40px; height:40px; border-radius:50%; cursor:pointer; border:2px solid var(--primary); margin:2px;";
            img.onclick = () => window.addSticker(data.dataUrl, 'selfie');
            sharedStickerContainer.appendChild(img);
        });
    });
}

saveBtn.addEventListener('click', async () => {
    if (!currentUser) return alert("Login first!");
    saveBtn.innerText = "RECORDING...";
    try {
        await addDoc(collection(db, "scenes"), {
            uid: currentUser.uid, creator: currentUser.email.split('@')[0], realm: currentRealm,
            description: descriptionInput.value || "", arrangement: items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null })),
            createdAt: serverTimestamp()
        }); alert("Recorded!");
    } catch (e) { alert(e.message); }
    saveBtn.innerText = "COMMIT TO ETERNITY";
});

function loadGallery() {
    onSnapshot(query(collection(db, "scenes"), orderBy("createdAt", "desc")), (sn) => {
        sceneGallery.innerHTML = "";
        sn.forEach(doc => {
            const d = doc.data(); const card = document.createElement('div');
            card.className = 'scene-card'; card.style.borderColor = themes[d.realm || 'emerald'].primary;
            card.innerHTML = `<h3>${d.creator}'s ${d.realm || 'emerald'}</h3><p>"${d.description}"</p>`;
            card.onclick = () => { currentRealm = d.realm || 'emerald'; applyTheme(currentRealm); items = d.arrangement.map(i => ({ ...i, img: i.dataUrl ? myP5.loadImage(i.dataUrl) : null })); descriptionInput.value = d.description; };
            sceneGallery.appendChild(card);
        });
    });
}
function getEmoji(t) { const e = { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' }; return e[t] || '✨'; }
