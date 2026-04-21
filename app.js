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
    ruby: { primary: '#ff5555', secondary: '#ffb86c', bg: '#2a1a1a', title: 'The Ruby Empire', lore: '"Fire and blood, tempered in the heart of a star."' },
    jade: { primary: '#8be9fd', secondary: '#50fa7b', bg: '#1a262a', title: 'The Jade Coast', lore: '"Serenity flowing like a river of liquid light."' },
    amethyst: { primary: '#bd93f9', secondary: '#ff79c6', bg: '#1e1a2a', title: 'The Amethyst Void', lore: '"Secrets whispered in the silence between dimensions."' }
};

// --- DOM ELEMENTS ---
const authOverlay = document.getElementById('auth-overlay');
const realmBtns = document.querySelectorAll('.realm-btn');
const loginBtn = document.getElementById('login-btn');
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
    
    // Update p5 background if it exists
    if (window.updateP5Colors) window.updateP5Colors(theme);
}

// Helpers for color manipulation
function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
}
function lighten(col, amt) {
    return col; // Simpler for now
}

// --- AUTH LOGIC ---
loginBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return alert("Identify yourself!");

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (err) { alert(err.message); }
        } else { alert(error.message); }
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
            // Re-generate forest
            forestBg = [];
            for(let i=0; i<30; i++) {
                let c = p.color(theme.primary);
                c.setAlpha(p.random(50, 150));
                forestBg.push({
                    x: p.random(p.width),
                    y: p.random(p.height),
                    size: p.random(20, 100),
                    color: c
                });
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
            let hovered = p.dist(p.mouseX, p.mouseY, item.x, item.y) < 40;
            if (hovered) p.scale(1.15 + p.sin(p.frameCount * 0.1) * 0.05);

            if (item.type === 'selfie' || item.type === 'ai') {
                p.push();
                p.drawingContext.shadowBlur = 15;
                p.drawingContext.shadowColor = themes[currentRealm].primary;
                p.fill(bgPrimary);
                p.ellipse(0, 0, 85, 85);
                if (item.img) {
                    p.imageMode(p.CENTER);
                    p.image(item.img, 0, 0, 80, 80);
                } else if (item.dataUrl) {
                    item.img = p.loadImage(item.dataUrl);
                }
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
        let found = false;
        for (let i = items.length - 1; i >= 0; i--) {
            if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 40) {
                draggingItem = items[i];
                found = true;
                break;
            }
        }

        if (!found && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
            items.push({ x: p.mouseX, y: p.mouseY, type: selectedType });
        }
    };

    p.mouseDragged = () => {
        if (draggingItem) {
            draggingItem.x = p.mouseX;
            draggingItem.y = p.mouseY;
        }
    };

    p.mouseReleased = () => { draggingItem = null; };

    p.keyPressed = () => {
        if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) {
            items = items.filter(item => p.dist(p.mouseX, p.mouseY, item.x, item.y) > 40);
        }
    };

    window.addSticker = (dataUrl, type = 'selfie') => {
        let img = p.loadImage(dataUrl);
        items.push({ x: p.width / 2, y: p.height / 2, type: type, img: img, dataUrl: dataUrl });
    };

    window.takeSelfie = async () => {
        if (!capture) return;
        let img = capture.get();
        img.resize(150, 0);
        const dataUrl = img.canvas.toDataURL();
        addSticker(dataUrl, 'selfie');
        
        // Share with others
        if (currentUser) {
            await addDoc(collection(db, "spirit_stickers"), {
                creator: currentUser.email.split('@')[0],
                dataUrl: dataUrl,
                createdAt: serverTimestamp()
            });
        }
    };
    
    p.windowResized = () => {
        const container = document.getElementById('canvas-container');
        p.resizeCanvas(container.offsetWidth, 500);
    };
};

const myP5 = new p5(sketch);

// --- UI LISTENERS ---
selfieBtn.addEventListener('click', () => window.takeSelfie());

aiBtn.addEventListener('click', async () => {
    const prompt = aiPrompt.value;
    if (!prompt) return alert("What do you wish to conjure?");
    
    aiBtn.disabled = true;
    aiBtn.innerText = "CONJURING...";
    
    try {
        const replicateProxy = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
        const response = await fetch(replicateProxy, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: `sticker of ${prompt}, magical fairy tale style, isolated white background`,
                model: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1d712de74a5ee2486673d4d4d557599c537"
            })
        });
        const data = await response.json();
        if (data.output && data.output.length > 0) {
            window.addSticker(data.output[0], 'ai');
        }
    } catch (e) {
        alert("The void did not answer: " + e.message);
    } finally {
        aiBtn.disabled = false;
        aiBtn.innerText = "✨ CONJURE ITEM";
    }
});

// --- GLOBAL STICKERS ---
function listenToSharedStickers() {
    const q = query(collection(db, "spirit_stickers"), orderBy("createdAt", "desc"), limit(20));
    onSnapshot(q, (snapshot) => {
        sharedStickerContainer.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const img = document.createElement('img');
            img.src = data.dataUrl;
            img.style.width = '40px';
            img.style.height = '40px';
            img.style.borderRadius = '50%';
            img.style.cursor = 'pointer';
            img.style.border = '2px solid var(--primary)';
            img.title = `Spirit of ${data.creator}`;
            img.onclick = () => window.addSticker(data.dataUrl, 'selfie');
            sharedStickerContainer.appendChild(img);
        });
    });
}

// --- GALLERY & SAVING ---
saveBtn.addEventListener('click', async () => {
    if (!currentUser) return alert("Log in to record your lore!");
    saveBtn.innerText = "RECORDING...";
    try {
        const storageItems = items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null }));
        await addDoc(collection(db, "scenes"), {
            uid: currentUser.uid,
            creator: currentUser.email.split('@')[0],
            realm: currentRealm,
            description: descriptionInput.value || "A silent realm.",
            arrangement: storageItems,
            createdAt: serverTimestamp()
        });
        alert("Realm recorded!");
    } catch (e) { alert(e.message); }
    saveBtn.innerText = "COMMIT TO ETERNITY";
});

function loadGallery() {
    const q = query(collection(db, "scenes"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        sceneGallery.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.style.borderColor = themes[data.realm || 'emerald'].primary;
            card.innerHTML = `
                <h3>${data.creator}'s ${data.realm || 'emerald'}</h3>
                <p>"${data.description}"</p>
            `;
            card.onclick = () => {
                currentRealm = data.realm || 'emerald';
                applyTheme(currentRealm);
                items = data.arrangement.map(i => ({ ...i, img: i.dataUrl ? myP5.loadImage(i.dataUrl) : null }));
                descriptionInput.value = data.description;
            };
            sceneGallery.appendChild(card);
        });
    });
}

function getEmoji(type) {
    const emojis = { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' };
    return emojis[type] || '✨';
}
