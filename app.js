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
    serverTimestamp 
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

// --- DOM ELEMENTS ---
const authOverlay = document.getElementById('auth-overlay');
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
const selfieBtn = document.getElementById('selfie-btn');

// --- AUTH LOGIC ---
loginBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return alert("Please enter magical credentials!");

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (err) {
                alert(err.message);
            }
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
        userDisplay.innerText = `Elder ${user.email.split('@')[0]}`;
        loadGallery();
    } else {
        currentUser = null;
        authOverlay.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

window.logout = () => signOut(auth);

// --- P5.JS ENCHANTED DOLLHOUSE ---
let items = [];
let selectedType = 'fairy';
let draggingItem = null;
let capture;
let forestBg = [];

const sketch = (p) => {
    p.setup = () => {
        const container = document.getElementById('canvas-container');
        const canvas = p.createCanvas(container.offsetWidth, 500);
        canvas.parent(container);
        
        // Initialize Webcam for stickers
        capture = p.createCapture(p.VIDEO);
        capture.size(160, 120);
        capture.hide();

        // Generate Forest Background Elements
        for(let i=0; i<30; i++) {
            forestBg.push({
                x: p.random(p.width),
                y: p.random(p.height),
                size: p.random(20, 100),
                color: p.color(20, p.random(40, 80), 40, p.random(50, 150))
            });
        }
    };

    p.draw = () => {
        // Enchanted Forest Background
        p.background(15, 35, 25); // Deep moss green
        
        // Draw hazy forest shapes
        p.noStroke();
        forestBg.forEach(leaf => {
            p.fill(leaf.color);
            p.ellipse(leaf.x, leaf.y + p.sin(p.frameCount * 0.01 + leaf.x) * 10, leaf.size, leaf.size * 1.5);
        });

        // Fireflies
        for(let i=0; i<15; i++) {
            let x = p.noise(i, p.frameCount * 0.005) * p.width;
            let y = p.noise(i + 10, p.frameCount * 0.005) * p.height;
            p.fill(241, 250, 140, p.noise(i, p.frameCount * 0.02) * 255);
            p.ellipse(x, y, 4, 4);
        }

        // Draw items
        items.forEach(item => {
            p.push();
            p.translate(item.x, item.y);
            
            // Hover scale effect
            let hovered = p.dist(p.mouseX, p.mouseY, item.x, item.y) < 40;
            if (hovered) p.scale(1.15 + p.sin(p.frameCount * 0.1) * 0.05);

            if (item.type === 'selfie') {
                // Draw camera sticker
                p.push();
                p.drawingContext.shadowBlur = 15;
                p.drawingContext.shadowColor = '#50fa7b';
                
                // Circular mask effect for selfie
                p.fill(80, 250, 123);
                p.ellipse(0, 0, 85, 85); // Frame
                
                if (item.img) {
                    p.imageMode(p.CENTER);
                    // Use the pre-loaded p5.Image or create it from base64
                    p.image(item.img, 0, 0, 80, 80);
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
            items.push({
                x: p.mouseX,
                y: p.mouseY,
                type: selectedType
            });
        }
    };

    p.mouseDragged = () => {
        if (draggingItem) {
            draggingItem.x = p.mouseX;
            draggingItem.y = p.mouseY;
        }
    };

    p.mouseReleased = () => {
        draggingItem = null;
    };

    p.keyPressed = () => {
        if (p.keyCode === p.DELETE || p.keyCode === p.BACKSPACE) {
            items = items.filter(item => p.dist(p.mouseX, p.mouseY, item.x, item.y) > 40);
        }
    };

    p.windowResized = () => {
        const container = document.getElementById('canvas-container');
        p.resizeCanvas(container.offsetWidth, 500);
    };

    // Public helper to take selfie
    window.takeSelfie = () => {
        if (!capture) return;
        
        // Grab current frame
        let img = capture.get();
        // Create a circular crop or just store it
        img.resize(200, 0);
        
        items.push({
            x: p.width / 2,
            y: p.height / 2,
            type: 'selfie',
            img: img,
            // Convert to base64 for Firebase storage
            dataUrl: img.canvas.toDataURL()
        });
    };
};

const myP5 = new p5(sketch);

// --- UI INTERACTIONS ---
itemPicker.addEventListener('click', (e) => {
    if (e.target.dataset.type) {
        selectedType = e.target.dataset.type;
        document.querySelectorAll('.item-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
    }
});

selfieBtn.addEventListener('click', () => {
    window.takeSelfie();
});

clearBtn.addEventListener('click', () => {
    if (confirm("Purge all magic from this realm?")) {
        items = [];
    }
});

// --- FIRESTORE PERSISTENCE ---

saveBtn.addEventListener('click', async () => {
    if (!currentUser) return alert("The Ancient Ones require you to log in first!");
    if (items.length === 0) return alert("This realm is empty...");

    const description = descriptionInput.value || "A whispered secret in the dark woods.";
    
    try {
        saveBtn.disabled = true;
        saveBtn.innerText = "WEAVING MAGIC...";
        
        // Prepare items for storage (stripping p5 objects)
        const storageItems = items.map(item => ({
            x: item.x,
            y: item.y,
            type: item.type,
            dataUrl: item.dataUrl || null // For selfies
        }));

        await addDoc(collection(db, "scenes"), {
            uid: currentUser.uid,
            creator: currentUser.email.split('@')[0],
            description: description,
            arrangement: storageItems,
            createdAt: serverTimestamp()
        });

        alert("Lore recorded in the Emerald Chronicles! 🌿");
    } catch (e) {
        alert("The magic failed: " + e.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "COMMIT TO ETERNITY";
    }
});

function loadGallery() {
    const q = query(collection(db, "scenes"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        sceneGallery.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.style.borderColor = 'var(--primary)';
            card.innerHTML = `
                <h3 style="font-family: 'Playfair Display';">${data.creator}'s Realm</h3>
                <p style="font-style: italic; opacity: 0.8;">"${data.description}"</p>
                <div style="font-size: 1.2rem; margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px;">
                    ${data.arrangement.slice(0, 8).map(i => i.type === 'selfie' ? '👤' : getEmoji(i.type)).join(' ')}
                </div>
            `;
            card.addEventListener('click', () => {
                if (confirm(`Enter ${data.creator}'s realm?`)) {
                    // Reconstruct items
                    items = data.arrangement.map(item => {
                        let newItem = { ...item };
                        if (item.type === 'selfie' && item.dataUrl) {
                            // High-performance: Load image from dataUrl for p5
                            newItem.img = myP5.loadImage(item.dataUrl);
                        }
                        return newItem;
                    });
                    descriptionInput.value = data.description;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            sceneGallery.appendChild(card);
        });
    });
}

function getEmoji(type) {
    const emojis = {
        'fairy': '🧚',
        'mushroom': '🍄',
        'crystal': '💎',
        'flower': '🌸',
        'star': '⭐',
        'wand': '🪄'
    };
    return emojis[type] || '✨';
}
