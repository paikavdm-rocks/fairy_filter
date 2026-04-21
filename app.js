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
                alert("New Fairy Account Created! ✨");
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
        userDisplay.innerText = `Welcome, ${user.email.split('@')[0]}!`;
        loadGallery();
    } else {
        currentUser = null;
        authOverlay.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

window.logout = () => signOut(auth);

// --- P5.JS DOLLHOUSE LOGIC ---
let items = [];
let selectedType = 'fairy';
let draggingItem = null;

const sketch = (p) => {
    p.setup = () => {
        const container = document.getElementById('canvas-container');
        const canvas = p.createCanvas(container.offsetWidth, 500);
        canvas.parent(container);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(30);
    };

    p.draw = () => {
        // Magical background
        p.background(20, 0, 40);
        
        // Draw some sparkles in bg
        p.noStroke();
        for(let i=0; i<10; i++) {
            p.fill(255, 255, 255, 50);
            p.ellipse(p.noise(i, p.frameCount*0.01)*p.width, p.noise(i+10, p.frameCount*0.01)*p.height, 2, 2);
        }

        // Draw items
        items.forEach(item => {
            p.push();
            p.translate(item.x, item.y);
            // Handle hover effect
            if (p.dist(p.mouseX, p.mouseY, item.x, item.y) < 25) {
                p.scale(1.2 + p.sin(p.frameCount * 0.1) * 0.1);
                p.fill(255, 255, 255, 30);
                p.ellipse(0, 0, 50, 50);
            }
            p.text(getEmoji(item.type), 0, 0);
            p.pop();
        });

        // Instructions if empty
        if (items.length === 0) {
            p.fill(255, 100);
            p.textSize(18);
            p.text("Click to place items in your dollhouse 🧚", p.width/2, p.height/2);
        }
    };

    p.mousePressed = () => {
        // Check if clicking an existing item to drag
        let found = false;
        for (let i = items.length - 1; i >= 0; i--) {
            if (p.dist(p.mouseX, p.mouseY, items[i].x, items[i].y) < 30) {
                draggingItem = items[i];
                found = true;
                break;
            }
        }

        // If not dragging, place new item
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
            // Remove item closest to mouse
            let closest = -1;
            let minDist = 30;
            items.forEach((item, index) => {
                let d = p.dist(p.mouseX, p.mouseY, item.x, item.y);
                if (d < minDist) {
                    minDist = d;
                    closest = index;
                }
            });
            if (closest !== -1) items.splice(closest, 1);
        }
    };

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
    
    p.windowResized = () => {
        const container = document.getElementById('canvas-container');
        p.resizeCanvas(container.offsetWidth, 500);
    };
};

new p5(sketch);

// --- UI INTERACTIONS ---
itemPicker.addEventListener('click', (e) => {
    if (e.target.dataset.type) {
        selectedType = e.target.dataset.type;
        // Update UI active state
        document.querySelectorAll('.item-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
    }
});

clearBtn.addEventListener('click', () => {
    if (confirm("Clear your magical arrangement?")) {
        items = [];
    }
});

// --- FIRESTORE PERSISTENCE ---

saveBtn.addEventListener('click', async () => {
    if (!currentUser) return alert("Log in to save your magic!");
    if (items.length === 0) return alert("Your dollhouse is empty! Place some items first.");

    const description = descriptionInput.value || "A beautiful fairy scene.";
    
    try {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saving Magic...";
        
        await addDoc(collection(db, "scenes"), {
            uid: currentUser.uid,
            creator: currentUser.email.split('@')[0],
            description: description,
            arrangement: items,
            createdAt: serverTimestamp()
        });

        alert("Scene saved to the Fairy Cloud! 🌟");
        descriptionInput.value = "";
    } catch (e) {
        console.error("Error saving: ", e);
        alert("The magic failed: " + e.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "Save Scene to Firebase";
    }
});

function loadGallery() {
    const q = query(collection(db, "scenes"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        sceneGallery.innerHTML = "";
        if (snapshot.empty) {
            sceneGallery.innerHTML = "<p>No magical scenes yet. Be the first!</p>";
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.innerHTML = `
                <h3>${data.creator}'s World</h3>
                <p>${data.description}</p>
                <div style="font-size: 1.2rem; margin-top: 10px;">
                    ${data.arrangement.map(i => getEmoji(i.type)).join(' ')}
                </div>
            `;
            card.addEventListener('click', () => {
                if (confirm(`Load ${data.creator}'s scene? Current work will be lost.`)) {
                    items = JSON.parse(JSON.stringify(data.arrangement));
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
