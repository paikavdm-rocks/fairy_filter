// ----- FIREBASE CONFIGURATION -----
// (Same credentials as your previous project)
const firebaseConfig = {
  apiKey: "AIzaSyBcnbOXvlC4Z30Y34BMShr8NaGozymIVLE",
  authDomain: "fairytopia.firebaseapp.com",
  databaseURL: "https://fairytopia-default-rtdb.firebaseio.com",
  projectId: "fairytopia",
  storageBucket: "fairytopia.firebasestorage.app",
  messagingSenderId: "531666119490",
  appId: "1:531666119490:web:329cedbdaf92247cdef6db"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- GLOBAL STATE ---
let currentUser = null;
let placedItems = [];
let selectedType = 'fairy';
let draggingItem = null;
let dragOffset = { x: 0, y: 0 };
let remoteScenes = [];

const EMOJI_MAP = {
    'fairy': '🧚',
    'mushroom': '🍄',
    'crystal': '💎',
    'flower': '🌸',
    'star': '⭐',
    'wand': '🪄'
};

// --- AUTH LOGIC ---
const authOverlay = document.getElementById('auth-overlay');
const loginBtn = document.getElementById('login-btn');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');

loginBtn.onclick = () => {
    const email = emailInput.value;
    const pass = passInput.value;
    if (!email || !pass) return alert("Enter your magic words!");

    signInWithEmailAndPassword(auth, email, pass).catch(err => {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            createUserWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
        } else {
            alert(err.message);
        }
    });
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.style.opacity = '0';
        setTimeout(() => authOverlay.classList.add('hidden'), 500);
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-display').innerText = `Fairy: ${user.email.split('@')[0]}`;
        loadGallery();
    } else {
        currentUser = null;
        authOverlay.classList.remove('hidden');
        authOverlay.style.opacity = '1';
        document.getElementById('user-info').classList.add('hidden');
    }
});

window.logout = () => signOut(auth);

// --- p5.js ENGINE ---
window.setup = () => {
    const container = document.getElementById('canvas-container');
    const canvas = createCanvas(container.offsetWidth, 500);
    canvas.parent('canvas-container');
    
    // UI Selectors
    document.querySelectorAll('.item-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
        };
    });

    document.getElementById('save-btn').onclick = saveScene;
    document.getElementById('clear-btn').onclick = () => { placedItems = []; };

    // Set initial active state
    document.querySelector('[data-type="fairy"]').classList.add('active');
};

window.draw = () => {
    background(20, 0, 40); // Dark mystical purple
    
    // Draw subtle ground
    fill(40, 20, 60);
    noStroke();
    rect(0, height - 100, width, 100);
    
    // Draw "Sparkles" in background
    if (frameCount % 20 === 0 && placedItems.length > 0) {
        push();
        noStroke();
        fill(255, 255, 200, 150);
        ellipse(random(width), random(height), 2);
        pop();
    }

    // Render Items
    textAlign(CENTER, CENTER);
    textSize(50);
    placedItems.forEach((item, index) => {
        // Subtle hover glow
        if (isMouseOver(item)) {
            push();
            drawingContext.shadowBlur = 20;
            drawingContext.shadowColor = '#00ffff';
            text(item.emoji, item.x, item.y);
            pop();
        } else {
            text(item.emoji, item.x, item.y);
        }
    });
};

window.mousePressed = () => {
    // Check if clicking an existing item to drag
    for (let i = placedItems.length - 1; i >= 0; i--) {
        if (isMouseOver(placedItems[i])) {
            draggingItem = placedItems[i];
            dragOffset.x = draggingItem.x - mouseX;
            dragOffset.y = draggingItem.y - mouseY;
            return;
        }
    }

    // Otherwise place a new item
    if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {
        placedItems.push({
            x: mouseX,
            y: mouseY,
            type: selectedType,
            emoji: EMOJI_MAP[selectedType]
        });
    }
};

window.mouseDragged = () => {
    if (draggingItem) {
        draggingItem.x = mouseX + dragOffset.x;
        draggingItem.y = mouseY + dragOffset.y;
    }
};

window.mouseReleased = () => {
    draggingItem = null;
};

window.keyPressed = () => {
    if (keyCode === DELETE || keyCode === BACKSPACE) {
        // Remove item under mouse
        for (let i = placedItems.length - 1; i >= 0; i--) {
            if (isMouseOver(placedItems[i])) {
                placedItems.splice(i, 1);
                break;
            }
        }
    }
};

function isMouseOver(item) {
    return dist(mouseX, mouseY, item.x, item.y) < 30;
}

// --- CLOUD LOGIC ---
async function saveScene() {
    if (!currentUser) return alert("Must be logged in to save magic!");
    const desc = document.getElementById('scene-description').value;
    
    const sceneData = {
        user: currentUser.email.split('@')[0],
        description: desc || "A mystical scene",
        items: placedItems,
        timestamp: Date.now()
    };

    try {
        const scenesRef = ref(db, 'dollhouse_scenes');
        const newSceneRef = push(scenesRef);
        await set(newSceneRef, sceneData);
        alert("✨ Scene saved to the Cloud Gallery! ✨");
    } catch (e) {
        console.error(e);
        alert("The magic failed to reach the database!");
    }
}

function loadGallery() {
    const gallery = document.getElementById('scene-gallery');
    const scenesRef = ref(db, 'dollhouse_scenes');
    
    onValue(scenesRef, (snapshot) => {
        const data = snapshot.val();
        gallery.innerHTML = "";
        if (!data) {
            gallery.innerHTML = "<p>No scenes yet. Be the first!</p>";
            return;
        }

        Object.values(data).reverse().forEach(scene => {
            const card = document.createElement('div');
            card.className = "scene-card";
            card.innerHTML = `
                <h3>${scene.user}'s Realm</h3>
                <p>${scene.description}</p>
                <div style="font-size: 1.5rem; margin-top: 10px;">
                    ${scene.items.slice(0, 5).map(i => i.emoji).join(' ')} ...
                </div>
            `;
            card.onclick = () => {
                placedItems = scene.items;
                document.getElementById('scene-description').value = scene.description;
            };
            gallery.appendChild(card);
        });
    });
}
