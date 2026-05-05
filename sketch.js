// ----- FIREBASE MULTIPLAYER SETUP -----
const firebaseConfig = {
  apiKey: "AIzaSyBcnbOXvlC4Z30Y34BMShr8NaGozymIVLE",
  authDomain: "fairytopia.firebaseapp.com",
  databaseURL: "https://fairytopia-default-rtdb.firebaseio.com",
  projectId: "fairytopia",
  storageBucket: "fairytopia.firebasestorage.app",
  messagingSenderId: "531666119490",
  appId: "1:531666119490:web:329cedbdaf92247cdef6db"
};

// Global variables for Firebase
let db;
let auth;

// Helper: get actual video capture dimensions from the camera hardware
function vidW() { return video && video.elt && video.elt.videoWidth ? video.elt.videoWidth : 640; }
function vidH() { return video && video.elt && video.elt.videoHeight ? video.elt.videoHeight : 480; }

// Canvas2D shadowColor must be a CSS string — a raw p5.Color object can break text/shape rendering.
function fairyAccentRgba(a) {
  try {
    if (myFairyColor != null) {
      return 'rgba(' + Math.round(red(myFairyColor)) + ',' + Math.round(green(myFairyColor)) + ',' + Math.round(blue(myFairyColor)) + ',' + a + ')';
    }
  } catch (e) { /* ignore */ }
  return 'rgba(255, 0, 255, ' + a + ')';
}

let myPlayerID = null; // Bound securely via login
let myPlayerName = "Fairy";
let nameInput;
let remotePlayers = {};

// WebRTC Peer nodes
let myPeerID = null;
let peer = null;
let connectedPeers = {};
let currentStep = 1; // 1: Name, 2: Wand, 3: Gathering, 4: Battle
let spellContainer;
let myFairyColor; // Unique to each player
let spiritOrbs = [];
let fairyMana = 0;
let spiritHealth = 100;
let mySpellChoice = 'Fire';

// Ready system for orb release
let playerReady = false;
let allPlayersReady = false;
let selectedSpell = null;
let spellInventoryDiv;
let spellStatusText;
const spellInventory = { Ice: 0, Fire: 0, Air: 0 };
const elementalSpells = {
  Ice: { icon: '❄️', color: '#b2ebf2', rgb: [178, 235, 242] },
  Fire: { icon: '🔥', color: '#ff5a36', rgb: [255, 90, 54] },
  Air: { icon: '🌬️', color: '#d8fbff', rgb: [216, 251, 255] }
};
let combatButtons = [];
let isMegaSpell = false;
let currentKingdom = 'Fairytopia';
let kingdomColor = '#ff79c6'; // Magenta theme

let isCountdownStarted = false;
let isGameStarted = false;
let spellProjectiles = [];

class SpellProjectile {
  constructor(startX, startY, targetX, targetY, color) {
    this.x = startX;
    this.y = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.color = color;
    this.progress = 0;
    this.speed = 0.05;
    this.trail = [];
  }
  update() {
    this.progress += this.speed;
    this.x = lerp(this.x, this.targetX, this.progress);
    this.y = lerp(this.y, this.targetY, this.progress);
    
    // Add pulsing particles along the trail
    for (let i = 0; i < 3; i++) {
        let p = new Particle(this.x + random(-10, 10), this.y + random(-10, 10));
        p.color = this.color;
        particles.push(p);
    }
    return this.progress >= 1;
  }
}

function initFirebaseListeners() {
  // Cloud event listener for remote players
  db.ref('players').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      remotePlayers = data;

      // Sync our own stats from the cloud to ensure consistency across sessions
      if (myPlayerID && data[myPlayerID]) {
        fairyMana = data[myPlayerID].mana || 0;
        spiritHealth = data[myPlayerID].spirit || 100;
      }

      // Check if any remote players became ready
      for (let pID in remotePlayers) {
        if (pID !== myPlayerID && remotePlayers[pID].readyForOrbs) {
          checkAllPlayersReadyAndStartBattle();
        }
      }

      // Scan for new connections to form WebRTC peer tunnels
      for (let pID in remotePlayers) {
        if (pID === myPlayerID) continue; // Skip ourselves
        
        let remotePeerID = remotePlayers[pID].peerID;
        console.log("Checking remote player:", pID, "PeerID:", remotePeerID, "MyPeerID:", myPeerID);
        
        // Only invoke the phone call logic if we haven't already shaken hands
        // The tie-breaker mathematical standard string-comp avoids an infinite race collision!
        if (remotePeerID && myPeerID && !connectedPeers[remotePeerID]) {
          console.log("Comparing peer IDs:", myPeerID, "vs", remotePeerID, "Should call:", myPeerID > remotePeerID);
          if (myPeerID > remotePeerID) {
            // Send them our live P5 canvas as a literal video stream at 20 FPS (more stable)
            console.log("Initiating call to", remotePeerID);
            let localStream = document.querySelector('canvas').captureStream(20);
            let call = peer.call(remotePeerID, localStream);
            connectedPeers[remotePeerID] = true;
            
            call.on('stream', (remoteStream) => {
              console.log("Received stream from", remotePeerID);
              addRemoteVideo(remotePeerID, remoteStream);
            });
            
            call.on('error', (err) => {
              console.error("Call error to", remotePeerID, ":", err);
            });
          }
        }
      }
    } else {
      remotePlayers = {};
    }
  });

  // Authentication State Listener
  auth.onAuthStateChanged(user => {
    if (user) {
      // User is fully authenticated globally!
      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('game-container').style.display = 'flex';
      myPlayerID = user.uid;
      myPlayerName = user.email ? user.email.split('@')[0] : "Fairy"; 
      
      if (nameInput) nameInput.value(myPlayerName);
      
      myFairyColor = hashStringToColor(myPlayerID);
      
      document.getElementById('account-actions').style.display = 'flex';
      initWebRTC();
      
      db.ref('players/' + myPlayerID).onDisconnect().remove();
      
      // Update Firebase with ready status
      db.ref('players/' + myPlayerID + '/readyForOrbs').set(false);
    } else {
      document.getElementById('login-overlay').style.display = 'flex';
      myPlayerID = null;
    }
  });
}

// Authentication System Logic
function loginWithEmail() {
  let email = document.getElementById('auth-email').value;
  let pass = document.getElementById('auth-password').value;
  if (!email || !pass) {
    alert("Please provide the magic words!"); return;
  }
  
  auth.signInWithEmailAndPassword(email, pass).catch(err => {
    // If account missing/wrong, magically create it immediately for friction-free UX
    auth.createUserWithEmailAndPassword(email, pass).catch(e => alert("Login Failed: " + e.message));
  });
}

function loginWithGoogle() {
  let provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => alert("Google Login Failed: " + err.message));
}

window.loginWithEmail = loginWithEmail;
window.loginWithGoogle = loginWithGoogle;



// Start floating orbs for spell collection
function startOrbFloating() {
  // Create floating elemental orbs for players to collect
  for (let i = 0; i < 8; i++) {
    let orb = {
      x: random(50, width - 50),
      y: random(50, height - 50),
      vx: random(-2, 2),
      vy: random(-2, 2),
      type: ['fire', 'ice', 'air'][i % 3],
      size: random(15, 25),
      collected: false
    };
    spiritOrbs.push(orb);
  }
  
  // Show feedback
  if (feedback) {
    feedback.html("✨ Elemental orbs are floating! Collect them with your index finger!");
  }
}

// Authentication State Listener
function addRemoteVideo(remotePeerID, stream) {
  if (document.getElementById(remotePeerID)) return; // Don't duplicate rendering displays!
  
  let frame = createDiv();
  frame.class('mirror-frame fly-in');
  frame.id(remotePeerID);
  
  // Find player name from remotePlayers sync
  let remoteName = "Mysterious Fairy";
  for (let pID in remotePlayers) {
    if (remotePlayers[pID].peerID === remotePeerID) {
      remoteName = remotePlayers[pID].name || "Fairy";
      break;
    }
  }

  // Apply appropriate kingdom border if synchronized
  let clr = "#ff79c6";
  for (let pID in remotePlayers) {
    if (remotePlayers[pID].peerID === remotePeerID) {
      clr = remotePlayers[pID].kingdomColor || "#ff79c6";
      break;
    }
  }
  frame.style('border-color', clr);
  frame.style('--accent', clr); // Update CSS variable for consistent styling
  
  let vid = createElement('video');
  vid.elt.srcObject = stream;
  vid.elt.autoplay = true;
  vid.elt.playsInline = true;
  
  vid.style('width', '100%');
  vid.style('height', 'auto');
  vid.style('border-radius', '10px');
  vid.style('background-color', '#000');
  
  vid.parent(frame);
  frame.parent('videos-grid');
}

function initWebRTC() {
  peer = new Peer();
  peer.on('open', (id) => {
    myPeerID = id;
    // Tell Firebase that we are 100% authentically ready to receive FaceTime video calls!
    if (myPlayerID) {
      db.ref('players/' + myPlayerID).set({ 
        peerID: myPeerID, 
        name: myPlayerName, 
        mana: 0, 
        spirit: 100,
        choice: 'Fire'
      });
    }
  });

  peer.on('call', (call) => {
    // We are receiving a call from another Player's browser! Pass them our P5 element stream natively.
    let localStream = document.querySelector('canvas').captureStream(20);
    call.answer(localStream);
    call.on('stream', (remoteStream) => {
      addRemoteVideo(call.peer, remoteStream);
    });
  });
}

const replicateProxy = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
// Note: We use an offscreen graphics buffer for better segmentation logic.

let video;
let canvas;
let feedback;
let particles = [];
let isCasting = false;
let handPose;
let hands = [];
let lastWandX = null;
let lastWandY = null;
let wandSmoothFrame = -1;
const WAND_TRACK_SMOOTH = 0.22;
let bodyPose;
let poses = [];

let fairyFilterActive = false; // Activated after kingdom choice
let prevHandX = null;
let handVelocity = 0;
let fullFairyImage = null;

// Persistent face tracking for fairy filter
let lastFacePosition = null;
let faceLostFrames = 0;
let isTransformingSelf = false;

// Real-time Fairy Assets
let wingColor;
let fireflies = [];
let bgImage;

// State of the current spell
let currentObjectMask = null; // AI result for object
let currentObjectTransformed = null; // AI result for object style

function initFirebase() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
    auth = firebase.auth();
    console.log("Firebase Connected");
    initFirebaseListeners();
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

function setup() {
  initFirebase();
  // Responsive sizing for local user to maintain aspect ratio
  let cw = min(windowWidth * 0.95, 650); // Responsive width with max limit
  let ch = cw * 0.75; // Maintain 4:3 aspect ratio
  if (windowWidth < 768) {
    // Use video's native dimensions for mobile to prevent stretching
    let videoRatio = 4/3; // Standard webcam aspect ratio
    let maxWidth = min(windowWidth * 0.9, 640); // Responsive but not too wide
    cw = maxWidth;
    ch = cw / videoRatio; // Calculate height based on video ratio
  }

  canvas = createCanvas(cw, ch);
  canvas.parent('p5-container');
  
  // Remove loading screen
  let loader = document.getElementById('loading-screen');
  if (loader) loader.style.display = 'none';

  // Custom layout for UI underneath canvas
  let controls = createDiv();
  controls.parent('controls-container');
  controls.style('display', 'flex');
  controls.style('flex-direction', 'column');
  controls.style('align-items', 'center');
  controls.style('gap', '15px');
  controls.style('margin-top', '5px');

  let inputRow = createDiv();
  inputRow.style('display', 'flex');
  inputRow.style('flex-wrap', 'wrap');
  inputRow.style('justify-content', 'center');
  inputRow.style('gap', '10px');
  inputRow.parent(controls);

  // --- FAIRY NAME OPTION ---
  let nameContainer = createDiv();
  nameContainer.style('display', 'flex');
  nameContainer.style('align-items', 'center');
  nameContainer.style('gap', '10px');
  nameContainer.parent(inputRow);

  let nameLabel = createSpan("🧚 Your Fairy Name:");
  nameLabel.style('color', '#ffccff');
  nameLabel.style('font-family', 'Quicksand');
  nameLabel.style('font-size', '1.4rem');
  nameLabel.style('font-weight', 'bold');
  nameLabel.style('text-shadow', '0 0 10px rgba(255, 121, 198, 0.5)');
  nameLabel.parent(nameContainer);

  nameInput = createInput(myPlayerName);
  nameInput.style('padding', '10px 15px');
  nameInput.style('border-radius', '25px');
  nameInput.style('border', '2px solid #00ffff');
  nameInput.style('background', 'rgba(20,0,40,0.6)'); // Less opacity to prevent stretching
  nameInput.style('color', 'white');
  nameInput.style('font-family', 'Quicksand');
  nameInput.style('font-size', '1rem');
  nameInput.style('outline', 'none');
  nameInput.parent(nameContainer);
  nameInput.input(() => {
    myPlayerName = nameInput.value();
    if (myPlayerID) {
      db.ref('players/' + myPlayerID + '/name').set(myPlayerName);
    }
  });

  let nameBtn = createButton("✨ SET NAME ✨");
  nameBtn.style('padding', '10px 20px');
  nameBtn.style('border-radius', '30px');
  nameBtn.style('border', 'none');
  nameBtn.style('background', 'linear-gradient(90deg, #00ffff, #ff00ff)');
  nameBtn.style('color', 'black');
  nameBtn.style('font-family', 'Quicksand');
  nameBtn.style('font-weight', 'bold');
  nameBtn.style('cursor', 'pointer');
  nameBtn.parent(nameContainer);
  nameBtn.mousePressed(() => {
    if (currentStep === 1) {
      nextStep(2);
      nameContainer.hide();

      
      // Show kingdom choice after 2 seconds delay
      setTimeout(() => {
        document.getElementById('kingdom-selection').style.display = 'flex';
      }, 2000);

      // Reveal the gallery
      let gallery = document.getElementById('mirrors-gallery');
      gallery.style.opacity = '1';
      gallery.style.height = 'auto';
      gallery.style.overflow = 'visible';
      gallery.style.pointerEvents = 'all';
      gallery.classList.add('fly-in');
    }
  });

function selectKingdom(name, clr) {
  currentKingdom = name;
  kingdomColor = clr;
  myFairyColor = color(clr);
  fairyFilterActive = true; // Ensure visuals start immediately!
  
  if (myPlayerID) {
    db.ref('players/' + myPlayerID + '/kingdom').set(name);
    db.ref('players/' + myPlayerID + '/kingdomColor').set(clr);
  }
  
  document.getElementById('kingdom-selection').style.display = 'none';
  if (spellContainer) spellContainer.style('display', 'flex');
  nextStep(3);
}
window.selectKingdom = selectKingdom;
function changeUsername() {
  // Create a simple prompt for name change
  let newName = prompt("Enter your new fairy name:", myPlayerName);
  if (newName && newName.trim() !== "") {
    myPlayerName = newName.trim();
    if (nameInput) {
      nameInput.value(myPlayerName);
    }
    // Update Firebase with new name
    if (myPlayerID) {
      db.ref('players/' + myPlayerID + '/name').set(myPlayerName);
    }
    // Update any UI elements that show the name
    updateNameDisplays();
  }
}

function updateNameDisplays() {
  // Update any UI elements that display the player name
  let nameElements = document.querySelectorAll('.player-name');
  nameElements.forEach(el => {
    el.textContent = myPlayerName;
  });
}
window.changeUsername = changeUsername;

// Ready for battle button functionality
window.readyForBattle = function() {
  console.log("Ready for battle clicked!");
  
  // Update button state
  let readyButton = document.getElementById('ready-for-battle-button');
  if (readyButton) {
    readyButton.style.backgroundColor = '#FF1493'; // Dark pink
    readyButton.style.opacity = '0.7';
    readyButton.textContent = '✨ READY!';
    readyButton.style.pointerEvents = 'none'; // Disable further clicks
  }
  
  // Set player ready
  playerReady = true;
  
  // Update Firebase
  if (myPlayerID) {
    db.ref('players/' + myPlayerID + '/readyForOrbs').set(true);
  }
  
  // Check if all players are ready and start battle
  checkAllPlayersReadyAndStartBattle();
};

function checkAllPlayersReadyAndStartBattle() {
  console.log("Checking if all players are ready...");
  
  // Check remote players
  let allRemoteReady = true;
  for (let pID in remotePlayers) {
    if (pID !== myPlayerID && !remotePlayers[pID].readyForOrbs) {
      allRemoteReady = false;
      break;
    }
  }
  
  // If all players are ready, start battle
  if (playerReady && allRemoteReady) {
    console.log("All players ready, starting battle!");
    startBattleSequence();
  } else {
    console.log("Waiting for all players to be ready...");
  }
}

function startBattleSequence() {
  console.log("Starting battle sequence!");
  
  // Hide ready button
  let readyButton = document.getElementById('ready-for-battle-button');
  if (readyButton) {
    readyButton.style.display = 'none';
  }
  
  // Hide spell instructions
  let spellInstructions = document.getElementById('spell-instructions');
  if (spellInstructions) {
    spellInstructions.style.display = 'none';
  }
  
  // Start countdown
  startGlobalCountdown();
}

// Back button functionality
window.goBackStep = function() {
  if (currentStep > 1) {
    currentStep--;
    nextStep(currentStep);
  }
};

// Hide back button when battle starts
function hideBackButton() {
  let backButton = document.getElementById('back-button');
  if (backButton) {
    backButton.style.display = 'none';
  }
}


  spellContainer = createDiv();
  spellContainer.style('display', 'none'); // Hidden until named
  spellContainer.style('gap', '6px'); // Smaller gap
  spellContainer.style('padding', '6px'); // Smaller padding
  spellContainer.style('background', 'rgba(0,0,0,0.7)');
  spellContainer.style('border-radius', '12px'); // Smaller border radius
  spellContainer.style('border', '1px solid var(--accent)');
  spellContainer.parent(inputRow);

  let input_image_field = createInput("turn any object into a wand");
  input_image_field.style('width', '100%');
  input_image_field.style('max-width', '180px'); // Smaller to fit better
  input_image_field.id("input_image_prompt");
  input_image_field.style('padding', '6px 12px'); // Smaller padding
  input_image_field.style('border-radius', '15px'); // Smaller border radius
  input_image_field.style('border', '1px solid #ff00ff');
  input_image_field.style('background', 'rgba(20,0,40,0.8)');
  input_image_field.style('color', 'white');
  input_image_field.style('font-family', 'Quicksand');
  input_image_field.style('font-size', '0.9rem'); // Smaller font
  input_image_field.style('outline', 'none');
  input_image_field.parent(spellContainer);

  let castButton = createButton("✨ CREATE WAND ✨");
  castButton.style('padding', '6px 12px'); // Smaller padding
  castButton.style('border-radius', '15px'); // Smaller border radius
  castButton.style('border', 'none');
  castButton.style('background', 'linear-gradient(90deg, #ff00ff, #00ffff)');
  castButton.style('color', 'black');
  castButton.style('font-family', 'Quicksand');
  castButton.style('font-weight', 'bold');
  castButton.style('cursor', 'pointer');
  castButton.style('font-size', '0.8rem'); // Smaller font
  castButton.style('box-shadow', '0 0 8px rgba(255, 0, 255, 0.5)'); // Smaller shadow
  castButton.mousePressed(() => {
    castRegionalSpell(input_image_field.value());
  });
  castButton.parent(spellContainer);
  


  feedback = createP("");
  feedback.style('color', '#ffbaff');
  feedback.style('font-family', 'Quicksand');
  feedback.style('font-size', '1.2rem');
  feedback.style('margin', '0');
  feedback.parent(controls);

  spellStatusText = createP("");
  spellStatusText.style('color', '#d8fbff');
  spellStatusText.style('font-family', 'Quicksand');
  spellStatusText.style('font-size', '0.95rem');
  spellStatusText.style('margin', '0');
  spellStatusText.style('text-align', 'center');
  spellStatusText.parent(controls);

  spellInventoryDiv = createDiv();
  spellInventoryDiv.style('display', 'none');
  spellInventoryDiv.style('gap', '10px');
  spellInventoryDiv.style('flex-wrap', 'wrap');
  spellInventoryDiv.style('justify-content', 'center');
  spellInventoryDiv.style('max-width', '680px');
  spellInventoryDiv.parent(controls);
  renderSpellInventory();

  let constraints = { 
  audio: false, 
  video: { 
    facingMode: "user",
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30 }
  } 
};

  // Hand and Body tracking
  video = createCapture(constraints, function () {
    // Handpose with optimized configuration for reduced lag
    handPose = ml5.handPose(video, { 
      flipHorizontal: false,
      maxContinuousChecks: 3,
      detectionConfidence: 0.6,
      iouThreshold: 0.4,
      modelType: "lite"
    }, () => {
      console.log("Hand tracker ready");
      handPose.detectStart(video, (results) => {
        // Filter results by confidence
        hands = results.filter(hand => {
          return hand.confidence > 0.4;
        });
      });
    });

    // BodyPose for Wings/Crown/Ears
    bodyPose = ml5.bodyPose(video, { flipHorizontal: false }, () => {
      console.log("Body tracker ready");
      bodyPose.detectStart(video, (results) => {
        poses = results;
      });
    });
  });

  video.elt.setAttribute('playsinline', ''); // Critical for iOS
  video.elt.setAttribute('autoplay', '');    // Critical for iOS
  video.elt.setAttribute('muted', '');       // Critical for iOS
  video.hide();

  bgImage = loadImage('fairy_bg.png');

  // Create default fairy effect color
  myFairyColor = color(255, 121, 198);
  wingColor = myFairyColor;

  // Initialize fireflies
  for (let i = 0; i < 25; i++) {
    fireflies.push(new Firefly());
  }
}

function hashStringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Convert to high-saturation, bright fairy-tale color
  let h = abs(hash % 360);
  push();
  colorMode(HSL);
  let c = color(h, 80, 70, 0.5);
  pop();
  return c;
}

function draw() {
  drawMagicalBackground();

  // 1. Progress Step Logic
  updateInstructionSteps();

  if (fullFairyImage) {
    // 🌟 THE FINAL MASTERPIECE 🌟
    image(fullFairyImage, 0, 0, width, height);

    // Magic Frame
    noFill();
    strokeWeight(15);
    stroke(myFairyColor);
    rect(0, 0, width, height);

    // Ambient falling particles over the static image
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].y += 1; // gently fall
      particles[i].x += random(-1, 1);
      particles[i].update();
      particles[i].show();
      if (particles[i].finished()) particles.splice(i, 1);
    }
    if (frameCount % 10 === 0) {
      let p = new Particle(random(width), random(height));
      p.color = color(255, 255, 200);
      particles.push(p);
    }
    return; // Stop the regular video logic from running!
  }

  // 1. Show live feed only after name is set (Step > 1)
  if (currentStep > 1) {
    push();
    translate(width, 0); // Flipped view
    scale(-1, 1);

    // Hand Shake velocity and pose logic
    if (Array.isArray(hands) && hands.length > 0 && hands[0]) {
      let hand = hands[0];
      let landmarks = hand.landmarks || hand.keypoints || (hand.annotations ? hand.annotations.palmBase : null);
      
      if (landmarks && landmarks.length > 0) {
        let wristPoint = landmarks[0];
        let wx = wristPoint.x !== undefined ? wristPoint.x : (Array.isArray(wristPoint) ? wristPoint[0] : null);
        let wy = wristPoint.y !== undefined ? wristPoint.y : (Array.isArray(wristPoint) ? wristPoint[1] : null);
        
        if (wx !== null && prevHandX !== null && currentObjectTransformed && !fullFairyImage && !isTransformingSelf) {
          let speed = abs((width - wx) - prevHandX);
          handVelocity = lerp(handVelocity, speed, 0.4);
      
          if (handVelocity > 20 && !fairyFilterActive) fairyFilterActive = true;
        }
        if (wx !== null) prevHandX = (width - wx);
      }
    }

    // Draw the live video feed (no tint)
    image(video, 0, 0, width, height);
    
    // Add Fairy Visuals (Wings, Crown, Ears)
    if (fairyFilterActive) {
      applyFairyGlow();
    }
    
    pop(); // End flipped view
  } else {
    // Step 1: Branding/Background only
    push();
    // High transparency to show the beautiful background image
    background(0, 0, 0, 100); 
    textAlign(CENTER, CENTER);
    textFont('Cinzel Decorative');
    textSize(35);
    fill(255, 255, 255);
    drawingContext.shadowBlur = 20;
    drawingContext.shadowColor = '#ff79c6';
    pop();
  }


  // Elemental spell orbs during Gathering and Duel.
  // Elemental spell orbs during Gathering phase (Step 4)
  if (currentStep === 4) {
    handleSpiritOrbs();
  }


  // 3. We use AI to apply the object transformation (if the spell worked)
  if (currentObjectTransformed) {
    // If the AI identified the object segment, we can isolate it
    // Using simple masking here to demonstrate segmentation.
    // In a full implementation, the AI provides the mask itself.
    applyObjectTransformation();
  }

  // Magic Frame
  noFill();
  strokeWeight(15);
  stroke(myFairyColor);
  rect(0, 0, width, height);

  // Particle System
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].show();
    if (particles[i].finished()) particles.splice(i, 1);
  }

  // Draw Wand
  drawWand();

  // (The old multiplayer loop was removed because we now share a breathtaking WebRTC streaming gallery instead of a simulated coordinate ghost!)
  
  // Casting Overlay for Regional Spell
  if (isCasting) {
    fill(255, 255, 255, 200);
    rect(0, 0, width, height);
  }

  // Casting Overlay for Full Self Spell
  if (isTransformingSelf) {
    fill(255, 255, 255, map(sin(frameCount * 0.1), -1, 1, 100, 200));
    rect(0, 0, width, height);

    push();
    fill(255, 0, 255);
    textAlign(CENTER, CENTER);
    textFont('Cinzel Decorative');
    pop();
  }

  // Projectiles
  for (let i = spellProjectiles.length - 1; i >= 0; i--) {
    if (spellProjectiles[i].update()) {
      spellProjectiles.splice(i, 1);
    }
  }

  processLocalStatusEffects();
}

function processLocalStatusEffects() {
  if (!myPlayerID || !remotePlayers[myPlayerID]) return;
  let me = remotePlayers[myPlayerID];
  let now = Date.now();

  // 1. ICE FILTER
  if (me.frozenUntil && me.frozenUntil > now) {
    push();
    fill(178, 235, 242, 100);
    rect(0, 0, width, height);
    pop();
    renderSpellInventory(); // Keep bar frozen
  }

  // 2. FIRE BURN (Slow Health Drain)
  if (me.burnedUntil && me.burnedUntil > now) {
    push();
    fill(255, 50, 0, 80);
    rect(0, 0, width, height);
    pop();
    if (frameCount % 60 === 0) { // Once per second
       spiritHealth = max(0, spiritHealth - 3);
       db.ref('players/' + myPlayerID + '/spirit').set(spiritHealth);
    }
  }
}


/** FAIRY VISUALS **/

function drawMagicalBackground() {
  if (bgImage) {
    image(bgImage, 0, 0, width, height);
  } else {
    background(26, 42, 34); // Deep Emerald fallback
  }

  // Draw shifting misty shapes using noise
  push();
  noStroke();
  for (let i = 0; i < 3; i++) {
    fill(100, 200, 255, 30);
    beginShape();
    for (let x = 0; x <= width; x += 30) {
      let yOffset = noise(x * 0.005, frameCount * 0.01 + i * 100) * 150;
      vertex(x, height - yOffset - i * 50);
    }
    vertex(width, height);
    vertex(0, height);
    endShape(CLOSE);
  }
  pop();

  // Update and draw fireflies
  for (let f of fireflies) {
    f.update();
    f.show();
  }
}

class Firefly {
  constructor() {
    this.x = random(width);
    this.y = random(height);
    this.angle = random(TWO_PI);
    this.orbit = random(20, 50);
    this.speed = random(0.01, 0.03);
    this.size = random(3, 8);
    this.color = color(random(150, 255), 255, random(150, 255), 180);
  }
  update() {
    this.angle += this.speed;
    this.x += cos(this.angle) * 0.5;
    this.y += sin(this.angle * 0.5) * 0.5;
    if (this.x < 0) this.x = width;
    if (this.x > width) this.x = 0;
    if (this.y < 0) this.y = height;
    if (this.y > height) this.y = 0;
  }
  show() {
    push();
    let pulse = 150 + sin(frameCount * 0.1 + this.angle) * 100;
    noStroke();
    fill(red(this.color), green(this.color), blue(this.color), pulse);
    drawingContext.shadowBlur = pulse / 10;
    drawingContext.shadowColor = this.color;
    ellipse(this.x, this.y, this.size);
    pop();
  }
}

function applyFairyGlow() {
  let pose = null;
  
  // Check if face is detected
  if (poses.length > 0) {
    pose = poses[0];
    // Store current face position
    lastFacePosition = {
      leftEye: pose.left_eye,
      rightEye: pose.right_eye,
      leftEar: pose.left_ear,
      rightEar: pose.right_ear,
      nose: pose.nose
    };
    faceLostFrames = 0;
  } else if (lastFacePosition && faceLostFrames < 60) {
    // Use last known position for 60 frames (about 1 second)
    pose = lastFacePosition;
    faceLostFrames++;
  }
  
  if (pose) {
    // Draw Wings using face tracking but positioned on shoulders
    let nose = pose.nose;
    
    if (nose && nose.confidence > 0.1) {
      // Use face position to calculate shoulder positions
      let faceX = map(nose.x, 0, vidW(), 0, width);
      let faceY = map(nose.y, 0, vidH(), 0, height);
      
      // Position wings on shoulders (below and wider than face)
      let shoulderWidth = 120; // How far to extend wings from face center
      let shoulderDrop = 80;   // How far down from face to position shoulders
      
      // Left wing position
      let leftWingX = faceX - shoulderWidth;
      let leftWingY = faceY + shoulderDrop;
      drawWing(leftWingX, leftWingY, -1);
      
      // Right wing position  
      let rightWingX = faceX + shoulderWidth;
      let rightWingY = faceY + shoulderDrop;
      drawWing(rightWingX, rightWingY, 1);
    }
    
    // Draw Fairy Ears on the Head (no crown)
    let leftEar = pose.leftEar || pose.left_ear;
    let rightEar = pose.rightEar || pose.right_ear;
    
    if (nose && nose.confidence > 0.1) {
      let nx = map(nose.x, 0, vidW(), 0, width);
      let ny = map(nose.y, 0, vidH(), 0, height);
      
      // Draw pointy ears using face tracking like wings
      if (leftEar && leftEar.confidence > 0.1) {
        let ex = map(leftEar.x, 0, vidW(), 0, width);
        let ey = map(leftEar.y, 0, vidH(), 0, height);
        drawElfEar(ex, ey, 1);
      }
      if (rightEar && rightEar.confidence > 0.1) {
        let ex = map(rightEar.x, 0, vidW(), 0, width);
        let ey = map(rightEar.y, 0, vidH(), 0, height);
        drawElfEar(ex, ey, -1);
      }
      
      // Draw fairy name above health bar with mobile adjustment
      let nameOffset = windowWidth < 768 ? -80 : -140; // Less negative offset on mobile
      drawFairyName(nx, ny + nameOffset);
      
      // Draw health bar below fairy name (moved lower)
      drawHealthBar(nx, ny - 80);
      
      // NO CROWN - removed as requested
    } else if (lastFacePosition && lastFacePosition.nose) {
      // Fallback: show name and health bar using last known position
      let nx = map(lastFacePosition.nose.x, 0, vidW(), 0, width);
      let ny = map(lastFacePosition.nose.y, 0, vidH(), 0, height);
      drawFairyName(nx, ny - 140);
      drawHealthBar(nx, ny - 80);
    } else {
      // Ultimate fallback: show name and health bar at center top of screen
      drawFairyName(width / 2, 100);
      drawHealthBar(width / 2, 150);
    }
    
    // Particles flowing down from wings
    if (frameCount % 3 === 0 && nose) {
      let sx1 = map(nose.x, 0, vidW(), 0, width);
      let sy1 = map(nose.y, 0, vidH(), 0, height) + 80; // Position particles at shoulder level
      let p1 = new Particle(sx1 + random(-20, 20), sy1);
      p1.color = myFairyColor;
      particles.push(p1);
    }
  }
}

function drawFairyName(x, y) {
  push();
  
  // Flip text back to normal orientation (since video is flipped)
  scale(-1, 1);
  translate(-x, -y);
  
  // Set text properties
  textAlign(CENTER, CENTER);
  textSize(24); // Increased size for better visibility
  fill(255, 255, 255, 255); // Full opacity white text
  stroke(0, 0, 0, 255); // Full opacity black outline
  strokeWeight(4); // Thicker outline for better visibility
  
  // Display fairy name (now properly oriented)
  text(myPlayerName || "Fairy", 0, 0);
  
  pop();
}

function drawHealthBar(x, y) {
  push();
  
  // Health bar dimensions
  let barWidth = 120;
  let barHeight = 12;
  let healthPercent = spiritHealth / 100; // spiritHealth is 0-100
  
  // Background (dark red)
  fill(50, 0, 0, 200);
  noStroke();
  rect(x - barWidth/2, y, barWidth, barHeight, 4);
  
  // Health fill (green to yellow to red based on health)
  if (healthPercent > 0.6) {
    fill(0, 255, 0, 200); // Green
  } else if (healthPercent > 0.3) {
    fill(255, 255, 0, 200); // Yellow
  } else {
    fill(255, 0, 0, 200); // Red
  }
  
  rect(x - barWidth/2, y, barWidth * healthPercent, barHeight, 4);
  
  // Border
  noFill();
  stroke(255, 255, 255, 150);
  strokeWeight(1);
  rect(x - barWidth/2, y, barWidth, barHeight, 4);
  
  pop();
}

function drawWing(x, y, dir) {
  push();
  translate(x, y);
  
  rotate(dir * PI/8); 
  
  // Glowing effect
  blendMode(ADD);
  noStroke();
  
  let c = myFairyColor;
  
  // Insect wings (4 layers)
  fill(red(c), green(c), blue(c), 100);
  ellipse(dir * 50, -80, 100, 200); 
  
  fill(10, 40, 255, 120);
  ellipse(dir * 40, -60, 60, 150); 
  
  fill(255, 150, 100, 150);
  ellipse(dir * 30, -50, 30, 100); 
  
  fill(red(c), green(c), blue(c), 100);
  ellipse(dir * 35, 50, 70, 120); 
  
  blendMode(BLEND); 
  strokeWeight(2);
  noFill();
  
  // Intricate pulsing veins
  let pulse = map(sin(frameCount * 0.1), -1, 1, 100, 255);
  stroke(255, 255, 255, pulse);
  bezier(0, 0, dir * 25, -40, dir * 60, -90, dir * 50, -180);
  bezier(0, 0, dir * 15, -20, dir * 40, -60, dir * 70, -70);
  bezier(0, 0, dir * 10, -10, dir * 30, -30, dir * 50, -20);
  
  bezier(0, 0, dir * 15, 20, dir * 40, 60, dir * 30, 110);
  bezier(0, 0, dir * 10, 10, dir * 30, 40, dir * 60, 50);
  pop();
}

function drawCrown(x, y) {
  push();
  translate(x, y);
  
  // Floating magic halo rings
  noFill();
  strokeWeight(2);
  stroke(255, 215, 0, 150);
  push();
  rotate(frameCount * 0.02);
  ellipse(0, 5, 80, 20); 
  pop();
  
  push();
  rotate(-frameCount * 0.015);
  stroke(255, 150, 255, 150);
  ellipse(0, -10, 100, 30);
  pop();
  
  // Tiara lattice
  blendMode(ADD);
  noStroke();
  let c = myFairyColor;
  fill(red(c), green(c), blue(c), 255); 
  ellipse(0, 0, 25, 30);
  fill(255, 255, 255, 255); 
  ellipse(0, 0, 10, 15);
  
  blendMode(BLEND);
  fill(255, 215, 0, 220);
  triangle(-12, 0, 12, 0, 0, -50);
  
  // Side gems
  for (let d = -1; d <= 1; d += 2) {
    for (let j = 1; j <= 3; j++) {
      let offset = j * 25;
      let heightOff = j * 10; 
      let gemSize = 20 - j * 4;
      
      stroke(255, 215, 0, 200);
      strokeWeight(3);
      noFill();
      bezier(d * (offset - 25), heightOff - 10, d * (offset - 15), heightOff, d * offset, heightOff, d * offset, heightOff);
      
      noStroke();
      blendMode(ADD);
      if (j === 2) fill(50, 200, 255, 255); 
      else fill(255, 255, 100, 255); 
      
      ellipse(d * offset, heightOff, gemSize, gemSize + 5);
      
      blendMode(BLEND);
      fill(255, 215, 0, 220);
      triangle(d * offset - gemSize/2, heightOff, d * offset + gemSize/2, heightOff, d * offset, heightOff - (40 - j * 8));
    }
  }
  pop();
}

function drawElfEar(x, y, dir) {
  push();
  translate(x, y);
  
  noStroke();
  fill(255, 220, 220, 255); 
  
  beginShape();
  vertex(dir * -10, 20); 
  vertex(dir * -15, -10); 
  vertex(dir * 50, -50); 
  vertex(dir * 15, -5); 
  vertex(dir * 5, 25);
  endShape(CLOSE);
  
  fill(red(myFairyColor), green(myFairyColor), blue(myFairyColor), 100);
  beginShape();
  vertex(dir * -5, 10);
  vertex(dir * -5, -5);
  vertex(dir * 40, -40);
  vertex(dir * 5, 0);
  endShape(CLOSE);
  
  // Magical dangling earring!
  stroke(255, 215, 0, 255);
  strokeWeight(2);
  line(dir * 0, 20, dir * 0, 40); 
  noStroke();
  blendMode(ADD);
  fill(100, 255, 255, 255);
  ellipse(dir * 0, 45, 10, 20); 
  fill(255, 255, 255, 255);
  ellipse(dir * 0, 45, 4, 8); 
  
  blendMode(BLEND);
  pop();
}



// Legacy fairy glow removed for system simplification

// AI COMPOSITION: Apply the AI transformation only to the region of the object.
function applyObjectTransformation() {
  push();
  blendMode(SCREEN); // Makes the black background transparent!
  let objSize = width * 0.35;

  let pos = getObjectPosition();

  image(currentObjectTransformed, pos.x - objSize / 2, pos.y - objSize / 2, objSize, objSize);

  // Add glitter around the specific transformed object
  strokeWeight(2);
  stroke(255, 255, 0, 150);
  noFill();
  rect(pos.x - objSize / 2, pos.y - objSize / 2, objSize, objSize);
  pop();
}

function drawWand() {
  let pos = getObjectPosition();
  let x = pos.x;
  let y = pos.y;

  if (hands.length > 0) {
    // Glowing Fairy Dust Trail
    for (let i = 0; i < 3; i++) { // Increase density
      particles.push(new Particle(x + random(-10, 10), y + random(-10, 10)));
    }
    
    // Core glow at the wand tip
    push();
    drawingContext.shadowBlur = 30;
    drawingContext.shadowColor = fairyAccentRgba(0.75);
    noStroke();
    fill(255, 255, 255, 220); // White core within colored glow
    ellipse(x, y, 12, 12);
    pop();
  } else {
    // Ambient dust around mouse
    if (frameCount % 3 === 0) {
      particles.push(new Particle(mouseX, mouseY));
    }
  }
}

// This is the updated, complex AI function. It uses a model that supports
// segmentation or 'masking'.
async function castRegionalSpell(objectPrompt) {
  isCasting = true;
  feedback.html("Creating your wand...");

  // Capture flipped live feed for the AI
  let offscreen = createGraphics(width, height);
  offscreen.translate(width, 0);
  offscreen.scale(-1, 1);
  offscreen.image(video, 0, 0, width, height);
  let imgBase64 = offscreen.elt.toDataURL();

  // Updated Prompting for REGIONAL transformation. 
  // We use the chosen kingdom theme
  let fairyAesthetic = `ethereal lighting, cinematic, glittery ${currentKingdom} kingdom style, theme color ${kingdomColor}`;
  // We only want the wand/object to be generated, NOT the user.
  let targetModel = "google/nano-banana";

  // Prompt that ONLY asks for the standalone object
  let objectAesthetic = "A standalone, glowing magical item. " + fairyAesthetic + ", highly detailed 3D render, black background, isolated object.";
  let segmentedPrompt = objectPrompt + ". " + objectAesthetic;

  let postData = {
    model: targetModel,
    input: {
      prompt: segmentedPrompt,
      // We remove image_input so the AI doesn't try to redraw the whole human video feed
    },
  };

  try {
    const response = await fetch(replicateProxy, {
      headers: { "Content-Type": `application/json` },
      method: "POST",
      body: JSON.stringify(postData),
    });
    const result = await response.json();

    if (result.output) {
        loadImage(result.output, (incomingImage) => {
          currentObjectTransformed = incomingImage; 
          isCasting = false;
          
          // Clear the "creating your wand..." text
          feedback.html("");
          
          // Automatically progress to step 4 after wand conjuring
          setTimeout(() => { 
            nextStep(4);
          }, 3000); // Longer delay before step 4
          
          spellContainer.hide(); // Hide conjure UI
          
          if (myPlayerID) db.ref('players/' + myPlayerID + '/wandURL').set(result.output);
          for (let i = 0; i < 60; i++) particles.push(new Particle(random(width), random(height)));
        });

    }
  } catch (error) {
      isCasting = false;
      feedback.html("The transformation spell failed! Make sure you are holding the object clearly!");
    }
}

// Helper to manage step progression
function nextStep(step) {
  // Allow backward navigation for back button
  if (step === currentStep) return;
  
  // Clean up old step UI
  if (step === 4) setupCombatUI(); // Prepare buttons for Battle Phase

  // Hide current
  let prev = document.getElementById('instr-' + currentStep);
  if (prev) prev.style.display = 'none';

  // SMALL DELAY to prevent "mixing" together too fast
  setTimeout(() => {
    currentStep = step;

    // Show next with animation
    let next = document.getElementById('instr-' + currentStep);
    if (next) {
      next.style.display = 'block';
      next.classList.add('fly-in');
      
      // Show spell instructions and ready button for step 4
      if (currentStep === 4) {
        let spellInstructions = document.getElementById('spell-instructions');
        if (spellInstructions) {
          spellInstructions.style.display = 'block';
          spellInstructions.innerHTML = `
            <div style="text-align: center; color: white; font-family: 'Quicksand'; padding: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #00ffff;">✨ Spell Instructions ✨</h3>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 20px;">
                <div style="background: rgba(0,0,0,0.8); padding: 15px; border-radius: 10px; border: 1px solid #00ffff;">
                  <h4 style="margin: 0 0 10px; color: #ff00ff; font-size: 1.2rem;">🔥 Air-Steals</h4>
                  <p style="margin: 5px 0; color: white;">Steals 20 health and freezes opponent for 3 seconds</p>
                </div>
                <div style="background: rgba(0,0,0,0.8); padding: 15px; border-radius: 10px; border: 1px solid #00ffff;">
                  <h4 style="margin: 0 0 10px; color: #00ffff; font-size: 1.2rem;">❄️ Ice-Freeze</h4>
                  <p style="margin: 5px 0; color: white;">Freezes opponent for 5 seconds and prevents movement</p>
                </div>
                <div style="background: rgba(0,0,0,0.8); padding: 15px; border-radius: 10px; border: 1px solid #00ffff;">
                  <h4 style="margin: 0 0 10px; color: #ff6600; font-size: 1.2rem;">🔥 Fire-Burn</h4>
                  <p style="margin: 5px 0; color: white;">Burns 25 health and applies orange flame filter for 4 seconds</p>
                </div>
              </div>
          `;
        }
        
        // Show ready button
        let readyButton = document.getElementById('ready-for-battle-button');
        if (readyButton) {
          readyButton.style.display = 'block';
        }
        
        // Reset ready status for new game
        playerReady = false;
        allPlayersReady = false;
        if (myPlayerID) {
          db.ref('players/' + myPlayerID + '/readyForOrbs').set(false);
        }
      }
      
      // Trigger special "explosion" effects
      for (let i = 0; i < 50; i++) {
          particles.push(new Particle(width / 2, height / 2));
      }
    }
  }, 500); 
}

// Spell descriptions for different wand types
function getSpellDescription(spellType) {
  const descriptions = {
    'air-steals': '🔥 Air-Steals - Steals 10 health from clicked player',
    'ice-freeze': '❄️ Ice-Freeze - Freezes opponent and their orbs for 5 seconds',
    'fire-burn': '🔥 Fire-Burn - Burns opponent for 5 seconds with 20 health loss'
  };
  return descriptions[spellType] || 'Unknown spell';
}

// Air-steals spell effect
function applyAirSteals(targetPlayer) {
  if (targetPlayer && remotePlayers[targetPlayer]) {
    // Steal health only (no freeze)
    let currentHealth = remotePlayers[targetPlayer].health || 100;
    let newHealth = Math.max(0, currentHealth - 10);
    
    // Update health in database
    if (myPlayerID) {
      db.ref('players/' + targetPlayer + '/health').set(newHealth);
    }
    
    // Visual feedback
    feedback.html("🔥 Air-Steals cast on " + targetPlayer + "!");
    
    // Create stealth particles
    for (let i = 0; i < 20; i++) {
      particles.push(new Particle(random(width), random(height)));
    }
  }
}

// Ice-freeze spell effect
function applyIceFreeze(targetPlayer) {
  if (targetPlayer && remotePlayers[targetPlayer]) {
    // Apply freeze effect to opponent and their orbs
    remotePlayers[targetPlayer].frozenUntil = Date.now() + 5000; // 5 seconds
    remotePlayers[targetPlayer].frozen = true;
    
    // Freeze their orbs production and movement
    remotePlayers[targetPlayer].orbsFrozenUntil = Date.now() + 5000; // 5 seconds
    
    // Update in database
    if (myPlayerID) {
      db.ref('players/' + targetPlayer + '/frozenUntil').set(Date.now() + 5000);
      db.ref('players/' + targetPlayer + '/frozen').set(true);
      db.ref('players/' + targetPlayer + '/orbsFrozenUntil').set(Date.now() + 5000);
    }
    
    // Visual feedback
    feedback.html("❄️ Ice-Freeze cast on " + targetPlayer + "!");
    
    // Create ice particles
    for (let i = 0; i < 20; i++) {
      particles.push(new Particle(random(width), random(height)));
    }
  }
}

// Fire-burn spell effect
function applyFireBurn(targetPlayer) {
  if (targetPlayer && remotePlayers[targetPlayer]) {
    // Apply burn effect for 5 seconds
    remotePlayers[targetPlayer].burningUntil = Date.now() + 5000; // 5 seconds
    remotePlayers[targetPlayer].burning = true;
    
    // Burn 20 health over 5 seconds (4 health per second)
    let currentHealth = remotePlayers[targetPlayer].health || 100;
    let newHealth = Math.max(0, currentHealth - 20);
    
    // Update health in database
    if (myPlayerID) {
      db.ref('players/' + targetPlayer + '/health').set(newHealth);
      db.ref('players/' + targetPlayer + '/burningUntil').set(Date.now() + 5000);
      db.ref('players/' + targetPlayer + '/burning').set(true);
    }
    
    // Visual feedback
    feedback.html("🔥 Fire-Burn cast on " + targetPlayer + "!");
    
    // Create fire particles
    for (let i = 0; i < 40; i++) {
      particles.push(new Particle(random(width), random(height)));
    }
  }
}

function setupCombatUI() {
  const hud = document.getElementById('spell-inventory-hud');
  if (hud) hud.style.display = 'flex';
  if (spellInventoryDiv) spellInventoryDiv.style('display', 'flex');
  renderSpellInventory();
}

function updateInstructionSteps() {
  if (currentStep === 1) return; // Wait for name

  
  if (currentStep === 4 && totalCollectedSpells() >= 3) {
    setupCombatUI();
  }
}

function startGlobalCountdown() {
  console.log("Starting global countdown...");
  isCountdownStarted = true;
  let overlay = document.getElementById('countdown-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    console.log("Countdown overlay displayed");
  } else {
    console.error("Countdown overlay not found!");
    return;
  }
  
  let count = 3;
  let interval = setInterval(() => {
    overlay.innerText = count;
    overlay.classList.remove('count-pulse');
    void overlay.offsetWidth; // Trigger reflow
    overlay.classList.add('count-pulse');
    console.log("Countdown:", count);
    
    if (count === 0) {
      clearInterval(interval);
      overlay.style.display = 'none';
      isGameStarted = true;
      allPlayersReady = true; // Set this to true for simplified game
      console.log("Battle started! isGameStarted:", isGameStarted);
      hideBackButton(); // Hide back button when battle starts
      nextStep(4);
      
      // Start battle effects
      for (let i = 0; i < 100; i++) {
        particles.push(new Particle(random(width), random(height)));
      }
      
      // Start orb floating immediately
      startOrbFloating();
    }
    count--;
  }, 1000);
}

function handleSpiritOrbs() {
  if (!isGameStarted) return; // Orbs only after countdown
  
  // Start orbs when game begins (simplified for single player)
  if (spiritOrbs.length === 0) {
    startOrbFloating();
  }
  
  // AIR STASIS CHECK
  let me = remotePlayers[myPlayerID] || {};
  let isStasis = me.stasisUntil && me.stasisUntil > Date.now();
  if (isStasis) {
    spiritOrbs = [];
    return;
  }

  let spellTypes = Object.keys(elementalSpells);

  if (frameCount % 20 === 0 && spiritOrbs.length < 12) {
    let spellType = random(spellTypes);
    spiritOrbs.push({
      x: random(50, width - 50),
      y: random(50, height - 50),
      size: random(26, 42),
      seed: random(1000),
      spellType: spellType,
      vx: random(-0.5, 0.5),
      vy: random(-0.5, 0.5)
    });
  }

  let pos = getIndexFingerPosition();
  for (let i = spiritOrbs.length - 1; i >= 0; i--) {
    let o = spiritOrbs[i];
    let spell = elementalSpells[o.spellType] || elementalSpells.Water;
    let wave = sin(frameCount * 0.05 + o.seed) * 5;
    o.x += o.vx || 0;
    o.y += o.vy || 0;
    if (o.x < 35 || o.x > width - 35) o.vx *= -1;
    if (o.y < 35 || o.y > height - 35) o.vy *= -1;
    
    push();
    drawingContext.shadowBlur = 26;
    drawingContext.shadowColor = spell.color;
    fill(spell.rgb[0], spell.rgb[1], spell.rgb[2], 175);
    noStroke();
    ellipse(o.x, o.y + wave, o.size);
    fill(255, 255, 255, 235);
    textAlign(CENTER, CENTER);
    textSize(o.size * 0.6);
    text(spell.icon, o.x, o.y + wave);
    pop();

    if (pos && dist(pos.x, pos.y, o.x, o.y + wave) < o.size * 0.85) {
      spiritOrbs.splice(i, 1);
      collectSpell(o.spellType);
      for (let j = 0; j < 20; j++) {
        let burst = new Particle(o.x, o.y + wave);
        burst.color = color(spell.rgb[0], spell.rgb[1], spell.rgb[2]);
        particles.push(burst);
      }
    }
  }

  if (pos) {
    push();
    noFill();
    stroke(255, 255, 255, 220);
    strokeWeight(2);
    circle(pos.x, pos.y, 26);
    pop();
  }
}

let lastIndexPos = null;
let trackingStability = 0;
let lastValidPositions = []; // Store recent valid positions for averaging
const TRACKING_SMOOTH = 0.15; // Much lower value = very smooth tracking like original
const MIN_STABILITY = 5; // Higher threshold for more stable tracking
function getIndexFingerPosition() {
  if (!Array.isArray(hands) || hands.length === 0 || !hands[0]) {
    return null;
  }
  
  let hand = hands[0];
  
  // Get index finger tip using ML5 standard landmarks
  let tipRaw = null;
  if (hand.landmarks && hand.landmarks.length > 8) {
    tipRaw = hand.landmarks[8]; // Index finger tip landmark
  }
  
  if (!tipRaw) {
    return null;
  }
  
  let rawX = tipRaw.x;
  let rawY = tipRaw.y;
  
  if (rawX === undefined || rawY === undefined) {
    return null;
  }
  
  // Map coordinates directly without smoothing
  let newX = width - map(rawX, 0, 1, 0, width);
  let newY = map(rawY, 0, 1, 0, height);
  
  lastIndexPos = { x: newX, y: newY };
  
  return lastIndexPos;
}

function totalCollectedSpells() {
  return Object.values(spellInventory).reduce((sum, count) => sum + count, 0);
}

function collectSpell(spellType) {
  if (!spellInventory.hasOwnProperty(spellType)) return;
  spellInventory[spellType] += 1;
  selectedSpell = spellType;
  mySpellChoice = spellType;
  if (myPlayerID) db.ref('players/' + myPlayerID + '/choice').set(mySpellChoice);
  renderSpellInventory();
  if (spellStatusText) spellStatusText.html(`${elementalSpells[spellType].icon} ${spellType} spell collected. Select it below, then click someone's mirror box.`);
}

window.selectSpell = function(type) {
  if (spellInventory[type] <= 0) {
    if (spellStatusText) spellStatusText.html(`✨ You need more ${elementalSpells[type].icon} ${type} spirit to cast this!`);
    return;
  }
  selectedSpell = type;
  mySpellChoice = type;
  if (myPlayerID) db.ref('players/' + myPlayerID + '/choice').set(mySpellChoice);
  if (spellStatusText) spellStatusText.html(`✨ ${elementalSpells[type].icon} ${type} focus active! Click a target to cast.`);
  renderSpellInventory();
};

window.selectKingdom = function(kingdom, color) {
  if (spellInventory[kingdom] <= 0) {
    if (spellStatusText) spellStatusText.html(`✨ You need more ${elementalSpells[kingdom].icon} ${kingdom} spirit to cast this!`);
    return;
  }
  selectedSpell = kingdom;
  mySpellChoice = kingdom;
  if (myPlayerID) db.ref('players/' + myPlayerID + '/choice').set(mySpellChoice);
  if (spellStatusText) spellStatusText.html(`✨ ${elementalSpells[kingdom].icon} ${kingdom} focus active! Click a target to cast.`);
}

window.changeKingdomOnly = function(kingdom, color) {
  if (spellInventory[kingdom] <= 0) {
    if (spellStatusText) spellStatusText.html(`✨ You need more ${elementalSpells[kingdom].icon} ${kingdom} spirit to cast this!`);
    return;
  }
  selectedSpell = kingdom;
  mySpellChoice = kingdom;
  if (myPlayerID) db.ref('players/' + myPlayerID + '/choice').set(mySpellChoice);
  if (spellStatusText) spellStatusText.html(`✨ ${elementalSpells[kingdom].icon} ${kingdom} focus active! Click a target to cast.`);
  renderSpellInventory();
};

function renderSpellInventory() {
  let me = remotePlayers[myPlayerID] || {};
  let isFrozen = me.frozenUntil && me.frozenUntil > Date.now();

  const bar = document.querySelector('.spell-inventory-bar');
  if (bar) {
    if (isFrozen) {
      bar.style.opacity = '0.4';
      bar.style.pointerEvents = 'none';
      bar.style.filter = 'grayscale(1) brightness(1.5) blur(1px)';
    } else {
      bar.style.opacity = '1';
      bar.style.pointerEvents = 'all';
      bar.style.filter = 'none';
    }
  }

  // Update HTML overlay counts and selection state in the bottom bar
  Object.keys(spellInventory).forEach(type => {
    let el = document.getElementById('count-' + type);
    if (el) el.innerText = spellInventory[type];
    
    let itemEl = document.getElementById('item-' + type);
    if (itemEl) {
      if (selectedSpell === type) itemEl.classList.add('selected');
      else itemEl.classList.remove('selected');
    }
  });

  // Legacy p5 buttons hidden — we now use the sleek HTML bar below!
  if (spellInventoryDiv) spellInventoryDiv.style('display', 'none');
}

function mousePressed() {
  let costSpirit = 0;
  let damage = 20;

  if (isMegaSpell) {
    costSpirit = 20; // Slightly lower sacrifice
    damage = 35; // Slightly lower damage
  }

  if (currentStep === 4 && selectedSpell && spellInventory[selectedSpell] > 0 && spiritHealth >= costSpirit) {

    // Check if we aimed at a remote mirror (using absolute viewport coordinates)
    let elements = document.elementsFromPoint(winMouseX, winMouseY);
    elements.forEach(el => {
      let frame = el.closest('.mirror-frame');
      if (frame && frame.id !== 'local-mirror-container' && frame.id !== '') {
        let hitID = frame.id;
        for (let pID in remotePlayers) {
          if (remotePlayers[pID].peerID === hitID) {
            let targetChoice = remotePlayers[pID].choice || 'Fire';
            
            // Apply effect based on spell type
            let now = Date.now();
            let duration = 10000; // 10 seconds
            
            if (mySpellChoice === 'Ice') {
                db.ref('players/' + pID + '/frozenUntil').set(now + duration);
                feedback.html(`❄️ ICE CAST! ${remotePlayers[pID].name || 'the rival'} is FROZEN!`);
            } else if (mySpellChoice === 'Fire') {
                db.ref('players/' + pID + '/burnUntil').set(now + duration);
                feedback.html(`🔥 FIRE CAST! ${remotePlayers[pID].name || 'the rival'} is BURNING!`);
            } else if (mySpellChoice === 'Air') {
                db.ref('players/' + pID + '/stasisUntil').set(now + duration);
                feedback.html(`🌬️ AIR CAST! ${remotePlayers[pID].name || 'the rival'} is in STASIS!`);
            }

            // Trigger Visual Projectile
            let wandPos = getObjectPosition();
            let spellColor = color(255, 255, 255);
            if (elementalSpells[mySpellChoice]) {
                let rgb = elementalSpells[mySpellChoice].rgb;
                spellColor = color(rgb[0], rgb[1], rgb[2]);
            }
            spellProjectiles.push(new SpellProjectile(wandPos.x, wandPos.y, winMouseX, winMouseY, spellColor));

            spellInventory[mySpellChoice] = max(0, spellInventory[mySpellChoice] - 1);
            if (spellInventory[mySpellChoice] <= 0) selectedSpell = null;
            spiritHealth -= costSpirit;
            renderSpellInventory();

            if (myPlayerID) {
              db.ref('players/' + myPlayerID + '/spirit').set(spiritHealth);
            }
            break;

          }
        }
      }
    });

    // Visual blast burst
    let pos = getObjectPosition();
    for (let i = 0; i < (isMegaSpell ? 100 : 30); i++) {
        let p = new Particle(pos.x, pos.y);
        let spellColor = elementalSpells[mySpellChoice] ? elementalSpells[mySpellChoice].rgb : [255, 255, 255];
        p.color = isMegaSpell ? color(255, 0, 0) : color(spellColor[0], spellColor[1], spellColor[2]);
        p.vx = (mouseX - pos.x) * 0.15 + random(-4, 4);
        p.vy = (mouseY - pos.y) * 0.15 + random(-4, 4);
        particles.push(p);
    }
    
    if (isMegaSpell) isMegaSpell = false; // Reset after use
  }
}

async function castBattleSpell() {
  if (isTransformingSelf) return; // Flag re-used to prevent spam
  isTransformingSelf = true;
  feedback.html("✨ COMMENCING THE GREAT BATTLE ✨ - Gathering all Fairy magic...");

  // Capture ALL mirror feeds for a collective battle scene
  let videos = document.querySelectorAll('video');
  let participants = [];
  
  // 1. Snapshot ourselves
  let offscreen = createGraphics(width, height);
  offscreen.push();
  offscreen.translate(width, 0);
  offscreen.scale(-1, 1);
  offscreen.image(video, 0, 0, width, height);
  offscreen.pop();
  participants.push(offscreen.elt.toDataURL());

  // 2. Snapshot any remote friends currently in the gallery
  videos.forEach(v => {
    let g = createGraphics(v.videoWidth || 640, v.videoHeight || 480);
    g.image(v, 0, 0, g.width, g.height);
    participants.push(g.elt.toDataURL());
  });

  feedback.html("Merging dimensions... the Fairies are engaging in battle!");

  // Construct a prompt describing the multiplayer clash, emphasizing the winner
  let winner = myPlayerName;
  let winnerColor = (myFairyColor ? myFairyColor.toString() : "purple");
  let maxSpirit = spiritHealth;

  for (let pID in remotePlayers) {
    if ((remotePlayers[pID].spirit || 0) > maxSpirit) {
      maxSpirit = remotePlayers[pID].spirit;
      winner = remotePlayers[pID].name || "Fairy";
    }
  }

  let battlePrompt = `A high-action, masterpiece cinematic painting of several beautiful fairies engaged in an epic magical battle in the ${currentKingdom} Kingdom. ` +
                     `The winner, ${winner}, is at the center casting a massive blast of ${kingdomColor} magic. ` +
                     `They are flying through a dark, glowing enchanted ${currentKingdom} forest. ` +
                     `Glitter and fairy dust explosions everywhere. 8k, ethereal lighting, incredibly detailed, dominant colour is ${kingdomColor}.`;

  let postData = {
    model: "google/nano-banana",
    input: {
      prompt: battlePrompt,
      image_input: participants.slice(0, 3), // AI usually limited to few inputs, we pick top 3
    },
  };

  try {
    const response = await fetch(replicateProxy, {
      headers: { "Content-Type": `application/json` },
      method: "POST",
      body: JSON.stringify(postData),
    });
    const result = await response.json();

    if (result.output) {
      loadImage(result.output, (incomingImage) => {
        fullFairyImage = incomingImage;
        isTransformingSelf = false;
        feedback.html("The Battle is Complete! Behold the Great Fairytopia War!");
        for (let i = 0; i < 300; i++) particles.push(new Particle(width / 2, height / 2));
      });
    }
  } catch (error) {
    isTransformingSelf = false;
    feedback.html("The Battle Spell was interrupted! Please try again.");
  }
}

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = random(-3, 3);
    this.vy = random(-3, 3);
    this.alpha = 255;
    this.size = random(3, 8);
    
    // Inherit the fairy's specific magic color
    if (myFairyColor) {
      this.color = myFairyColor;
    } else {
      this.color = color(random(150, 255), random(150, 255), 255);
    }
  }
  finished() { return this.alpha < 0; }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 8;
  }
  show() {
    noStroke();
    // Optimized particle draw (assuming HSL or RGB depending on color object)
    let c = this.color;
    fill(red(c), green(c), blue(c), this.alpha);
    ellipse(this.x, this.y, this.size);
    
    // Sparkle core
    if (random(1) > 0.8) {
      fill(255, 255, 255, this.alpha);
      ellipse(this.x, this.y, this.size / 2);
    }
  }
}


function drawPlayerHud() {
  if (!myPlayerID || currentStep < 2) return;
  const hp = constrain(Number(spiritHealth) || 0, 0, 100);

  
  // Default to screen center top if no pose detected
  let hudX = width * 0.5;
  let hudY = 60;

  // Track the nose/top-of-head if poses are available
  if (poses && poses.length > 0 && poses[0].pose) {
     let nose = poses[0].pose.nose;
     // Map pose coords (mirrored potentially)
     let mx = map(nose.x, 0, vidW(), 0, width);
     let my = map(nose.y, 0, vidH(), 0, height);
     hudX = width - mx; // Horizontal flip match
     hudY = my - 100; // Position above the nose (forehead/crown area)
  }
  hudY = constrain(hudY, 40, height - 40); // Keep on screen

  push();
  blendMode(BLEND);
  rectMode(CENTER);
  noStroke();
  
  // Minimalist health panel above head
  fill(12, 8, 22, 160);
  rect(hudX, hudY, 240, 70, 35);

  drawHealthHeartsRow(hudX, hudY - 17, hp);

  textAlign(CENTER, CENTER);
  fill(255, 255, 255, 240);
  textSize(24);
  textFont('Caveat');
  text(myPlayerName || 'Fairy', hudX, hudY + 2);

  rectMode(CORNER);
  const barW = 160;
  const barLeft = hudX - barW * 0.5;
  const barY = hudY + 16;
  fill(28, 20, 36, 200);
  rect(barLeft, barY, barW, 8, 4);
  fill(255, 75, 115, 245);
  rect(barLeft, barY, map(hp, 0, 100, 0, barW), 8, 4);
 pop();
}

// Five hearts above the name / head; each heart represents 20% health.
function drawHealthHeartsRow(centerX, centerY, healthPct) {
  const segments = 5;
  const spacing = 21;
  textAlign(CENTER, CENTER);
  textSize(14);
  const chunk = 100 / segments;
  for (let i = 0; i < segments; i++) {
    const fillAmt = constrain((healthPct - i * chunk) / chunk, 0, 1);
    const hx = centerX + (i - (segments - 1) / 2) * spacing;
    if (fillAmt < 0.12) {
      fill(72, 72, 88, 175);
      noStroke();
    } else {
      drawingContext.shadowBlur = 6 + 6 * fillAmt;
      drawingContext.shadowColor = 'rgba(255, 70, 110, 0.55)';
      fill(255, 35 + 55 * fillAmt, 75 + 55 * fillAmt, 210);
      noStroke();
    }
    text('♥', hx, centerY);
    drawingContext.shadowBlur = 0;
  }
}

// Wand follows ml5's first detected hand only; gentle smoothing applied once per frame
// (getObjectPosition is called multiple times per draw — lerp must not run on every call).
function getObjectPosition() {
  let cx = width / 2;
  let cy = height / 2;

  if (Array.isArray(hands) && hands.length > 0 && hands[0]) {
    let hand = hands[0];
    let wristRaw = hand.wrist || (hand.keypoints ? hand.keypoints[0] : null);
    
    if (wristRaw) {
      let rawX = wristRaw.x;
      let rawY = wristRaw.y;
      
      let indexTipRaw = hand.index_finger_tip || (hand.keypoints ? hand.keypoints[8] : null);
      if (indexTipRaw) {
        rawX = indexTipRaw.x;
        rawY = indexTipRaw.y;
      }

      let tx = width - map(rawX, 0, vidW(), 0, width);
      let ty = map(rawY, 0, vidH(), 0, height);

      if (frameCount !== wandSmoothFrame) {
        wandSmoothFrame = frameCount;
        if (lastWandX === null || lastWandY === null) {
          lastWandX = tx;
          lastWandY = ty;
        } else {
          lastWandX = lerp(lastWandX, tx, WAND_TRACK_SMOOTH);
          lastWandY = lerp(lastWandY, ty, WAND_TRACK_SMOOTH);
        }
      }
      return { x: lastWandX, y: lastWandY };
    }
  }

  if (lastWandX !== null && lastWandY !== null) {
    return { x: lastWandX, y: lastWandY };
  }
  // Allow wand to exit video box when no hand is detected
  if (hands.length === 0 || !hands[0]) {
    return { x: cx, y: cy }; // Return center when no hand
  }
  return { x: cx, y: cy };
}
