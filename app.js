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

const themes = {
    emerald: { primary: '#50fa7b', secondary: '#f1fa8c', bg: '#1a2a22', title: 'The Emerald Kingdom', lore: '"Whispers in the mossy glade."' },
    ruby: { primary: '#ff5555', secondary: '#ffb86c', bg: '#2a1a1a', title: 'The Ruby Kingdom', lore: '"Forged in the heart of a sun."' },
    jade: { primary: '#8be9fd', secondary: '#50fa7b', bg: '#1a262a', title: 'The Jade Kingdom', lore: '"Frozen serenity in the tides."' },
    amethyst: { primary: '#bd93f9', secondary: '#ff79c6', bg: '#1e1a2a', title: 'The Amethyst Kingdom', lore: '"Astral secrets in the void."' }
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

// Theme Switcher Logic
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
    document.body.style.background = `radial-gradient(circle at center, ${theme.bg} 0%, #000 100%)`;
    if (window.updateP5Colors) window.updateP5Colors(theme);
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
}

// Auth Logic
loginBtn.addEventListener('click', async () => {
    try { await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value); }
    catch (e) { alert(e.message); }
});
signupBtn.addEventListener('click', async () => {
    try { await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value); }
    catch (e) { alert(e.message); }
});
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userDisplay.innerText = `Elder ${user.email.split('@')[0]}`;
        loadGallery();
        listenToSharedStickers();
    } else {
        currentUser = null;
        authOverlay.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});
window.logout = () => signOut(auth);

// --- P5.JS ART ENGINE ---
let items = [];
let selectedType = 'fairy';
let draggingItem = null;
let capture;
let forestBg = [];
let bgPrimaryColors;

const sketch = (p) => {
    let maskGraphic;

    p.setup = () => {
        const container = document.getElementById('canvas-container');
        const canvas = p.createCanvas(container.offsetWidth, 500);
        canvas.parent(container);
        
        capture = p.createCapture(p.VIDEO);
        capture.size(320, 240);
        capture.hide();

        // Buffers for circular masking
        maskGraphic = p.createGraphics(200, 200);
        
        window.updateP5Colors = (theme) => {
            bgPrimaryColors = p.color(theme.primary);
            forestBg = [];
            for(let i=0; i<30; i++) {
                let c = p.color(theme.primary);
                c.setAlpha(80);
                forestBg.push({ x: p.random(p.width), y: p.random(p.height), size: p.random(20, 120), color: c });
            }
        };
        applyTheme(currentRealm);
    };

    p.draw = () => {
        p.background(themes[currentRealm].bg);
        
        // Generative Forest
        p.noStroke();
        forestBg.forEach(leaf => {
            p.fill(leaf.color);
            p.ellipse(leaf.x, leaf.y + p.sin(p.frameCount * 0.01 + leaf.x) * 10, leaf.size, leaf.size * 0.8);
        });

        // Fireflies
        for(let i=0; i<20; i++) {
            let x = p.noise(i, p.frameCount * 0.005) * p.width;
            let y = p.noise(i + 10, p.frameCount * 0.005) * p.height;
            p.fill(themes[currentRealm].secondary + 'aa');
            p.ellipse(x, y, 5, 5);
        }

        // Draw Items
        items.forEach(item => {
            p.push();
            p.translate(item.x, item.y);
            
            let hovered = p.dist(p.mouseX, p.mouseY, item.x, item.y) < 50;
            if (hovered) p.scale(1.1);

            if (item.type === 'selfie' || item.type === 'ai') {
                p.imageMode(p.CENTER);
                if (item.img) {
                    // Draw glow behind sticker
                    p.noStroke();
                    p.fill(themes[currentRealm].primary + '44');
                    p.ellipse(0, 0, 110, 110);
                    p.image(item.img, 0, 0, 100, 100);
                } else if (item.dataUrl) {
                    item.img = p.loadImage(item.dataUrl);
                }
            } else {
                p.textAlign(p.CENTER, p.CENTER);
                p.textSize(50);
                p.text(getEmoji(item.type), 0, 0);
            }
            p.pop();
        });

        // Visual feedback for placing
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height && !draggingItem) {
            p.push();
            p.translate(p.mouseX, p.mouseY);
            p.noStroke();
            p.fill(255, 100);
            p.ellipse(0, 0, 10, 10);
            p.pop();
        }
    };

    p.mousePressed = () => {
        let f = false;
        for (let i = items.length - 1; i >= 0; i--) {
            if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 50) {
                draggingItem = items[i]; f = true; break;
            }
        }
        if (!f && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
            items.push({ x: p.mouseX, y: p.mouseY, type: selectedType });
        }
    };

    p.mouseDragged = () => { if (draggingItem) { draggingItem.x = p.mouseX; draggingItem.y = p.mouseY; } };
    p.mouseReleased = () => { draggingItem = null; };
    p.keyPressed = () => { if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) items = items.filter(i => p.dist(p.mouseX, p.mouseY, i.x, i.y) > 50); };

    window.addSticker = (url, type) => {
        myP5.loadImage(url, (img) => {
            // Process image into a circle
            let buffer = p.createGraphics(200, 200);
            buffer.imageMode(p.CENTER);
            
            // Masking
            buffer.fill(255);
            buffer.ellipse(100, 100, 200, 200);
            buffer.drawingContext.globalCompositeOperation = 'source-in';
            buffer.image(img, 100, 100, 200, 200);
            
            let circularImg = buffer.get();
            items.push({ x: p.width / 2, y: p.height / 2, type: type, img: circularImg, dataUrl: buffer.canvas.toDataURL() });
        });
    };

    window.takeSelfie = () => {
        if (!capture) return;
        
        let buffer = p.createGraphics(200, 200);
        buffer.push();
        // FLIP AND CIRCLE
        buffer.translate(200, 0);
        buffer.scale(-1, 1);
        
        // Draw image into buffer
        buffer.image(capture, -100, 0, 400, 300); // Center the video
        buffer.pop();
        
        // Apply circle mask
        let mask = p.createGraphics(200, 200);
        mask.ellipse(100, 100, 200, 200);
        
        let finalImg = buffer.get();
        finalImg.mask(mask.get());
        
        const d = finalImg.canvas.toDataURL();
        items.push({ x: p.width / 2, y: p.height / 2, type: 'selfie', img: finalImg, dataUrl: d });
        
        if (currentUser) addDoc(collection(db, "spirit_stickers"), { creator: currentUser.email.split('@')[0], dataUrl: d, createdAt: serverTimestamp() });
    };
    
    p.windowResized = () => p.resizeCanvas(document.getElementById('canvas-container').offsetWidth, 500);
};

const myP5 = new p5(sketch);

// UI Event Listeners
selfieBtn.onclick = () => window.takeSelfie();

aiBtn.onclick = async () => {
    const pr = aiPrompt.value; 
    if (!pr) return alert("What do you wish to conjure?");
    aiBtn.innerText = "CONJURING...";
    
    try {
        const res = await fetch("https://itp-ima-replicate-proxy.web.app/api/create_n_get", {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                model: "google/nano-banana",
                input: {
                    prompt: `A standalone, glowing magical item: ${pr}. Detailed magical fantasy art, isolated on pure white background, digital illustration.`
                }
            })
        });
        const d = await res.json();
        
        // Handle result.output as a string or array
        const url = Array.isArray(d.output) ? d.output[0] : d.output;
        
        if (url) {
            window.addSticker(url, 'ai');
        } else {
            throw new Error("No image in response");
        }
    } catch (e) { alert("The void was silent: " + e.message); }
    finally { aiBtn.innerText = "✨ CONJURE ITEM"; }
};

function listenToSharedStickers() {
    onSnapshot(query(collection(db, "spirit_stickers"), orderBy("createdAt", "desc"), limit(30)), (sn) => {
        sharedStickerContainer.innerHTML = "";
        sn.forEach(doc => {
            const d = doc.data(); const img = document.createElement('img');
            img.src = d.dataUrl; img.className = 'shared-thumb';
            img.style = "width:50px; height:50px; border-radius:50%; cursor:pointer; border:2px solid var(--primary); margin:5px; object-fit: cover;";
            img.onclick = () => window.addSticker(d.dataUrl, 'selfie');
            sharedStickerContainer.appendChild(img);
        });
    });
}

saveBtn.onclick = async () => {
    if (!currentUser) return;
    saveBtn.innerText = "...RECORDING...";
    try {
        await addDoc(collection(db, "scenes"), {
            uid: currentUser.uid, creator: currentUser.email.split('@')[0], realm: currentRealm,
            description: descriptionInput.value || "", arrangement: items.map(i => ({ x: i.x, y: i.y, type: i.type, dataUrl: i.dataUrl || null })),
            createdAt: serverTimestamp()
        }); alert("Your memory is eternal.");
    } catch (e) { alert(e.message); }
    saveBtn.innerText = "COMMIT TO ETERNITY";
};

function loadGallery() {
    onSnapshot(query(collection(db, "scenes"), orderBy("createdAt", "desc"), limit(20)), (sn) => {
        sceneGallery.innerHTML = "";
        sn.forEach(doc => {
            const d = doc.data(); const card = document.createElement('div');
            card.className = 'scene-card'; card.style.borderColor = themes[d.realm || 'emerald'].primary;
            card.innerHTML = `<h3>${d.creator}'s ${d.realm || 'emerald'}</h3><p>"${d.description}"</p>`;
            card.onclick = () => {
                currentRealm = d.realm || 'emerald'; applyTheme(currentRealm);
                items = d.arrangement.map(i => ({ ...i, img: i.dataUrl ? myP5.loadImage(i.dataUrl) : null }));
                descriptionInput.value = d.description;
            };
            sceneGallery.appendChild(card);
        });
    });
}
function getEmoji(t) { return { 'fairy': '🧚', 'mushroom': '🍄', 'crystal': '💎', 'flower': '🌸', 'star': '⭐', 'wand': '🪄' }[t] || '✨'; }
