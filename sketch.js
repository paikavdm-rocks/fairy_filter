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

// Initialize Firebase Realtime Cloud & Auth
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

let myPlayerID = null; // Bound securely via login
let myPlayerName = "Fairy";
let nameInput;
let remotePlayers = {};

// WebRTC Peer nodes
let myPeerID = null;
let peer = null;
let connectedPeers = {};
let currentStep = 1; // 1: Name, 2: Wand, 3: Round 1 Gathering, 4: Round 2 Duel, 5: Round 3 Revelation
let spellContainer;
let myFairyColor; // Unique to each player
let myCanvasStream = null;
let spiritOrbs = [];
let fairyMana = 0;
let spiritHealth = 100;
let mySpellChoice = 'Fire';
let combatButtons = [];

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

    // Scan for new connections to form WebRTC peer tunnels
    const now = Date.now();
    for (let pID in remotePlayers) {
      if (pID === myPlayerID) continue; // Skip ourselves
      
      let pData = remotePlayers[pID];
      let remotePeerID = pData.peerID;
      
      // ONLY connect if the player has been "Active" in the last 40 seconds
      // This prevents the browser from freezing by trying to call 100 dead players!
      let isAlive = pData.lastSeen && (now - pData.lastSeen < 40000);
      
      if (isAlive && remotePeerID && myPeerID && !connectedPeers[remotePeerID]) {
        if (myPeerID > remotePeerID) {
          if (!myCanvasStream) {
            let c = document.querySelector('canvas');
            if (c) myCanvasStream = c.captureStream(30);
          }
          if (myCanvasStream) {
            let call = peer.call(remotePeerID, myCanvasStream);
            connectedPeers[remotePeerID] = true;
            
            call.on('stream', (remoteStream) => {
              addRemoteVideo(remotePeerID, remoteStream);
            });
            call.on('error', (err) => {
              console.log("Call error", err);
              delete connectedPeers[remotePeerID];
            });
          }
        }
      }
    }
  } else {
    remotePlayers = {};
  }
});

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

// Authentication State Listener
auth.onAuthStateChanged(user => {
  if (user) {
    // User is fully authenticated globally!
    document.getElementById('login-overlay').style.display = 'none';
    myPlayerID = user.uid;
    myPlayerName = user.email ? user.email.split('@')[0] : "Fairy"; // Base the name completely off the custom verified email
    if (nameInput) nameInput.value(myPlayerName);
    
    // Assign a unique magical color to this user based on their ID
    myFairyColor = hashStringToColor(myPlayerID);
    wingColor = myFairyColor;
    
    // Boot the Peer-to-Peer visual grid!
    initWebRTC();
    
    // Auto-delete securely deletes our fairy footprint from the world upon window exit
    db.ref('players/' + myPlayerID).onDisconnect().remove();
  } else {
    // Forced Logout
    document.getElementById('login-overlay').style.display = 'flex';
    myPlayerID = null;
  }
});
// --------------------------------------

// Inject the physical WebRTC HTML elements into the gallery!
function addRemoteVideo(remotePeerID, stream) {
  if (document.getElementById(remotePeerID)) return; // Don't duplicate rendering displays!
  
  let frame = createDiv();
  frame.class('mirror-frame');
  frame.id(remotePeerID);
  
  let vid = createElement('video');
  vid.elt.srcObject = stream;
  vid.elt.autoplay = true;
  vid.elt.playsInline = true;
  
  // Automatically inherit the exact physical pixel proportions dictated by the local phone screen setup!
  vid.style('width', canvas.width + 'px');
  vid.style('height', canvas.height + 'px');
  vid.style('border-radius', '10px');
  vid.style('background-color', '#000');
  
  vid.parent(frame);
  frame.parent('mirrors-gallery');
}

function initWebRTC() {
  peer = new Peer();
  peer.on('open', (id) => {
    myPeerID = id;
    if (myPlayerID) {
      db.ref('players/' + myPlayerID).set({ 
        peerID: myPeerID, 
        name: myPlayerName, 
        mana: 0, 
        spirit: 100,
        choice: 'Fire',
        lastSeen: Date.now()
      });
    }
  });

  peer.on('call', (call) => {
    if (!myCanvasStream) {
      let c = document.querySelector('canvas');
      if (c) myCanvasStream = c.captureStream(30);
    }
    if (myCanvasStream) {
      call.answer(myCanvasStream);
      call.on('stream', (remoteStream) => {
        addRemoteVideo(call.peer, remoteStream);
      });
    }
  });

  setInterval(() => {
    if (myPlayerID) {
      db.ref('players/' + myPlayerID + '/lastSeen').set(Date.now());
    }
  }, 10000); 
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
let bodyPose;
let poses = [];

let fairyFilterActive = false;
let prevHandX = null;
let handVelocity = 0;
let fullFairyImage = null;
let isTransformingSelf = false;

// Models will be loaded asynchronously in setup()

// Real-time Fairy Assets (Generated placeholders)
let fairyOverlay;
let wingColor;

// State of the current spell
let currentObjectMask = null; // AI result for object
let currentObjectTransformed = null; // AI result for object style

function setup() {
  // Mobile responsive sizing
  let cw = min(windowWidth - 40, 640);
  let ch = cw * 0.75; // Standard 4:3
  if (windowWidth < windowHeight) {
    ch = cw * 1.33; // Portrait 3:4 for phones
  }

  canvas = createCanvas(cw, ch);
  canvas.parent('p5-container');

  // Check for secure origin (Camera requirement)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    alert("⚠️ MAGICAL WARNING: Cameras only work on Secure Connections (HTTPS or localhost). Your mirror may remain dark!");
  }

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

  let nameLabel = createSpan("Your Fairy Name:");
  nameLabel.style('color', '#ffbaff');
  nameLabel.style('font-family', 'Caveat');
  nameLabel.style('font-size', '1.4rem');
  nameLabel.parent(nameContainer);

  nameInput = createInput(myPlayerName);
  nameInput.style('padding', '10px 15px');
  nameInput.style('border-radius', '25px');
  nameInput.style('border', '2px solid #00ffff');
  nameInput.style('background', 'rgba(20,0,40,0.8)');
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
      nameBtn.hide();
      spellContainer.style('display', 'flex');
      
      // Reveal the gallery
      let gallery = document.getElementById('mirrors-gallery');
      gallery.style.opacity = '1';
      gallery.style.height = 'auto';
      gallery.style.overflow = 'visible';
      gallery.style.pointerEvents = 'all';
      gallery.classList.add('fly-in');
    }
  });
  // -------------------------

  spellContainer = createDiv();
  spellContainer.style('display', 'none'); // Hidden until named
  spellContainer.style('gap', '10px');
  spellContainer.parent(inputRow);

  let input_image_field = createInput("A crystal water flower");
  input_image_field.style('width', '100%');
  input_image_field.style('max-width', '250px');
  input_image_field.id("input_image_prompt");
  input_image_field.style('padding', '12px 20px');
  input_image_field.style('border-radius', '30px');
  input_image_field.style('border', '2px solid #ff00ff');
  input_image_field.style('background', 'rgba(20,0,40,0.8)');
  input_image_field.style('color', 'white');
  input_image_field.style('font-family', 'Quicksand');
  input_image_field.style('font-size', '1rem');
  input_image_field.style('outline', 'none');
  input_image_field.parent(spellContainer);

  let castButton = createButton("✨ CREATE WAND ✨");
  castButton.style('padding', '12px 24px');
  castButton.style('border-radius', '30px');
  castButton.style('border', 'none');
  castButton.style('background', 'linear-gradient(90deg, #ff00ff, #00ffff)');
  castButton.style('color', 'black');
  castButton.style('font-family', 'Quicksand');
  castButton.style('font-weight', 'bold');
  castButton.style('cursor', 'pointer');
  castButton.style('font-size', '1rem');
  castButton.style('box-shadow', '0 0 15px rgba(255, 0, 255, 0.5)');
  castButton.mousePressed(() => {
    castRegionalSpell(input_image_field.value());
  });
  castButton.parent(spellContainer);
  
  let logoutBtn = createButton("🚪 SIGN OUT");
  logoutBtn.style('padding', '12px 24px');
  logoutBtn.style('border-radius', '30px');
  logoutBtn.style('border', '2px solid #ffbaff');
  logoutBtn.style('background', 'rgba(20,0,40,0.8)');
  logoutBtn.style('color', '#ffbaff');
  logoutBtn.style('font-family', 'Quicksand');
  logoutBtn.style('font-weight', 'bold');
  logoutBtn.style('cursor', 'pointer');
  logoutBtn.mousePressed(() => {
    auth.signOut();
  });
  logoutBtn.parent(spellContainer);

  feedback = createP("Look into the Mirror! Conjure your item first.");
  feedback.style('color', '#ffbaff');
  feedback.style('font-family', 'Quicksand');
  feedback.style('font-size', '1.2rem');
  feedback.style('margin', '0');
  feedback.parent(controls);

  let constraints = { audio: false, video: { facingMode: "user" } };

  // Wait for the strict mobile camera permissions to be approved AND the 
  // media stream to safely exist before booting up the intensive ML5 trackers. 
  // This explicitly prevents iOS/mobile from silently dropping the AI detection completely!
  // Start capture with explicit constraints
  video = createCapture(VIDEO, () => {
    // Ensure the stream dimensions match our canvas exactly for processing
    video.size(width, height);
    
    // Start tracking ONLY once the video is reliably flowing
    if (typeof ml5 !== 'undefined') {
      handPose = ml5.handPose(() => {
        handPose.detectStart(video, (results) => { hands = results; });
      });
      bodyPose = ml5.bodyPose(() => {
        bodyPose.detectStart(video, (results) => { poses = results; });
      });
    }
  });

  video.elt.setAttribute('playsinline', ''); 
  video.elt.setAttribute('autoplay', 'autoplay'); 
  video.elt.setAttribute('muted', 'muted');
  video.hide();

  // Create default fairy effect color (will be set properly after login)
  wingColor = color(200, 100, 255, 120); 
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
  background(0);

  // Safety: Prevent drawing/logic if camera isn't flowing yet
  if (!video || !video.elt || video.elt.readyState < 2) {
    fill(255);
    textAlign(CENTER);
    text("✨ AWAKENING THE MIRROR ✨", width / 2, height / 2);
    return;
  }

  // 1. Progress Step Logic
  updateInstructionSteps();

  if (fullFairyImage) {
    // 🌟 THE FINAL MASTERPIECE 🌟
    image(fullFairyImage, 0, 0, width, height);

    // Magic Frame
    noFill();
    strokeWeight(20);
    stroke(wingColor);
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

  // 1. We always show the live feed, but with a fairy transformation
  push();
  translate(width, 0); // Flipped view
  scale(-1, 1);

  // Hand Shake velocity and pose logic
  if (hands.length > 0) {
    let hand = hands[0];
    let wrist = hand.wrist || hand.keypoints[0];
    let fist = isFist(hand);

    if (prevHandX !== null && currentObjectTransformed && !fullFairyImage && !isTransformingSelf) {
      let speed = abs(wrist.x - prevHandX);
      handVelocity = lerp(handVelocity, speed, 0.4); // Reacts faster
  
      // Shaking an open hand activates the real-time filter aura!
      if (!fist && handVelocity > 8) {
        fairyFilterActive = true;
      }
  
      // Closing your hand into a fist triggers the collective Battle Spell!
      if (fist && currentStep === 5) {
        castBattleSpell();
      }
    }
    prevHandX = wrist.x;
  }

  // REAL-TIME FAIRY TRANSFORMATION (on the live video)
  if (currentObjectTransformed && fairyFilterActive) {
    tint(255, 180, 255); // Shift all live color slightly purple/fairy-like
  }
  image(video, 0, 0, width, height);
  noTint();

  // Basic real-time glowing particles around your "fairy form"
  if (currentObjectTransformed && fairyFilterActive) {
    applyFairyGlow();
  }
  
  pop(); // End flipped view
  
  // DRAW AUTHENTICATED NAME TAG OVER OUR OWN HEAD 🌟
  // Because it's drawn directly to the canvas, PeerJS will accurately livestream this name tag 
  // embedded into the video so everyone else can see it without Firebase database checks!
  if (myPlayerID !== null && poses.length > 0) {
    let pose = poses[0];
    let nose = pose.nose;
    if (nose && nose.confidence > 0.1) {
      let nx = width - nose.x; // Translate raw coordinate to flipped canvas geometry
      let ny = nose.y;
      
      push();
      fill(255, 255, 255, 240);
      noStroke();
      textAlign(CENTER);
      textSize(36);
      textFont('Caveat'); // Ensures elegant Fairy-tale UI parsing
      
      // Floating glowing nametag dropshadow geometry
      drawingContext.shadowBlur = 8; // Reduced for performance
      drawingContext.shadowColor = myFairyColor || 'rgba(255, 0, 255, 0.8)';
      
      text(myPlayerName, nx, ny - 140);
      
      // Magical pinpoint anchoring the tag
      fill(myFairyColor || color(255, 215, 0, 200));
      ellipse(nx, ny - 110, 10, 10);
      pop();
      
      // DISPLAY MANA/HEALTH INDICATORS
      push();
      translate(nx, ny - 180);
      noStroke();
      textAlign(CENTER);
      textSize(14);
      fill(255, 255, 255, 200);
      text(`SPELL: ${fairyMana} | HEALTH: ${spiritHealth}%`, 0, 0);
      
      // Health Bar
      fill(50, 0, 50, 150);
      rect(-50, 5, 100, 8, 4);
      fill(myFairyColor || color(255, 0, 255));
      rect(-50, 5, map(spiritHealth, 0, 100, 0, 100), 8, 4);
      pop();
      
      // Spell Choice Icon
      push();
      translate(nx + 60, ny - 135);
      stroke(255, 255, 255, 100);
      fill(0, 0, 0, 150);
      ellipse(0, 0, 30, 30);
      textAlign(CENTER, CENTER);
      textSize(10);
      fill(255);
      let choice = data && data[pID] ? data[pID].choice : 'Fire';
      text(choice.charAt(0), 0, 0);
      pop();
    }
  }

  // 2. Round Specific Overlay Logic
  if (currentStep === 3) {
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
  strokeWeight(20);
  stroke(wingColor);
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
    // Elegant Magic Spinner instead of a full freeze
    push();
    translate(width/2, height/2);
    rotate(frameCount * 0.1);
    noFill();
    strokeWeight(10);
    stroke(255, 255, 255, 100);
    ellipse(0, 0, 100, 100);
    stroke(myFairyColor || color(0, 255, 255));
    arc(0, 0, 100, 100, 0, PI);
    pop();
    
    fill(255);
    textAlign(CENTER);
    textSize(24);
    text("MAGIC IS CRAFTING...", width/2, height/2 + 80);
  }

  // Casting Overlay for Full Self Spell
  if (isTransformingSelf) {
    fill(255, 255, 255, map(sin(frameCount * 0.1), -1, 1, 100, 200));
    rect(0, 0, width, height);

    push();
    fill(255, 0, 255);
    textAlign(CENTER, CENTER);
    textFont('Cinzel Decorative');
    textSize(30);
    text("🌟 AWAKENING FAIRY FORM 🌟", width / 2, height / 2);
    pop();
  }
}

// REAL-TIME VISUALS: This simulates turning you into a fairy in p5.
function applyFairyGlow() {
  fill(wingColor);
  noStroke();

  if (poses.length > 0) {
    let pose = poses[0];

    // We are INSIDE the push/pop flipped canvas, so x already maps to width-x on screen!
    let getFx = (kp) => kp.x;

    // Draw Wings on Shoulders
    let lShoulder = pose.left_shoulder;
    let rShoulder = pose.right_shoulder;

    if (lShoulder && lShoulder.confidence > 0.1) {
      drawWing(getFx(lShoulder), lShoulder.y, 1); // 1 = Left Shoulder (Flaring rightwards visually)
    }

    if (rShoulder && rShoulder.confidence > 0.1) {
      drawWing(getFx(rShoulder), rShoulder.y, -1); // -1 = Right Shoulder (Flaring leftwards visually)
    }

    // Draw Fairy Crown and Ears on the Head
    let leftEar = pose.left_ear;
    let rightEar = pose.right_ear;
    let nose = pose.nose;

    if (nose && nose.confidence > 0.1) {
      let nx = getFx(nose);
      let ny = nose.y;

      // Draw pointy ears
      if (leftEar && leftEar.confidence > 0.1) {
        drawElfEar(getFx(leftEar), leftEar.y, 1);
      }
      if (rightEar && rightEar.confidence > 0.1) {
        drawElfEar(getFx(rightEar), rightEar.y, -1);
      }

      // Draw intricate crown
      drawCrown(nx, ny - 90);
    }

    // Particles flowing down from wings
    if (frameCount % 3 === 0 && lShoulder && rShoulder) {
      particles.push(new Particle(getFx(lShoulder) + random(-20, 20), lShoulder.y));
      particles.push(new Particle(getFx(rShoulder) + random(-20, 20), rShoulder.y));
    }
  } else {
    // Fallback if no person found
    drawWing(width * 0.4, height * 0.4, 1);
    drawWing(width * 0.6, height * 0.4, -1);
    for (let i = 0; i < 3; i++) {
      particles.push(new Particle(random(width * 0.2, width * 0.8), random(height * 0.2, height * 0.6)));
    }
  }
}

function drawWing(x, y, dir) {
  push();
  translate(x, y);

  let flutter = sin(frameCount * 0.2) * 0.1;
  rotate(dir * PI / 8 + flutter);

  // Glowing effect
  blendMode(ADD);
  noStroke();

  // Insect wings (4 layers)
  fill(150, 50, 255, 100);
  ellipse(dir * 50, -80, 100, 200);

  fill(50, 200, 255, 120);
  ellipse(dir * 40, -60, 60, 150);

  fill(255, 150, 100, 150);
  ellipse(dir * 30, -50, 30, 100);

  fill(200, 50, 150, 100);
  ellipse(dir * 35, 50, 70, 120);

  fill(100, 100, 255, 150);
  ellipse(dir * 25, 40, 40, 80);

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
  fill(255, 100, 255, 255);
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
      triangle(d * offset - gemSize / 2, heightOff, d * offset + gemSize / 2, heightOff, d * offset, heightOff - (40 - j * 8));
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
  vertex(dir * 50, -50); // longer tip!
  vertex(dir * 15, -5);
  vertex(dir * 5, 25);
  endShape(CLOSE);

  fill(255, 120, 120, 200);
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
    drawingContext.shadowBlur = 15; // Reduced from 30
    drawingContext.shadowColor = myFairyColor || 'rgba(0, 255, 255, 0.8)';
    noStroke();
    fill(255, 255, 255, 220); 
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
  feedback.html("Isolating the object... turning you into a Fairy...");

  // Re-use or Create a dedicated offscreen capture to prevent memory spikes
  let offscreen = createGraphics(width, height);
  offscreen.translate(width, 0);
  offscreen.scale(-1, 1);
  offscreen.image(video, 0, 0, width, height);
  let imgBase64 = offscreen.elt.toDataURL();
  offscreen.remove(); // Dispose immediately after use to free memory

  // Updated Prompting for REGIONAL transformation. 
  // We use Stable Diffusion XL in-painting/segmentation.
  let fairyAesthetic = "ethereal lighting, cinematic, glittery fairy kingdom style";
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
        feedback.html("Spell successful! Look at your new magical item!");
        
        // Hide the Wand UI
        if (spellContainer) spellContainer.style('display', 'none');
        
        // Move to Step 3 (Round 1: Gathering)!
        if (currentStep === 2) {
          nextStep(3);
        }

        for (let i = 0; i < 60; i++) particles.push(new Particle(random(width), random(height)));
      });
    } else {
      isCasting = false;
      feedback.html("The spirits are busy... try creating your wand again!");
    }
  } catch (error) {
    console.error("AI Error:", error);
    isCasting = false;
    feedback.html("Magical interference detected! Try your wand creation again.");
  }
}

// Helper to manage step progression
function nextStep(step) {
  if (step <= currentStep) return;
  
  // Clean up old step UI
  if (step === 3) {
    if (spellContainer) spellContainer.style('display', 'none');
  }
  if (step === 4) {
    setupCombatUI(); // Prepare buttons for Round 2
  }
  if (step === 5) {
    // Hide combat buttons
    combatButtons.forEach(b => b.hide());
  }

  // Hide current instruction
  let prev = document.getElementById('instr-' + currentStep);
  if (prev) prev.style.display = 'none';

  currentStep = step;

  // Show next with animation
  let next = document.getElementById('instr-' + currentStep);
  if (next) {
    next.style.display = 'block';
    next.classList.add('fly-in');
    
    // Trigger special "explosion" effects
    for (let i = 0; i < 50; i++) {
        particles.push(new Particle(width / 2, height / 2));
    }
  }
}

function setupCombatUI() {
  let types = ['Fire', 'Water', 'Earth'];
  types.forEach(type => {
    let btn = createButton(type);
    btn.parent(spellContainer);
    btn.style('padding', '12px 20px');
    btn.style('border-radius', '30px');
    btn.style('background', 'rgba(255,255,255,0.1)');
    btn.style('color', 'white');
    btn.style('border', '2px solid white');
    btn.style('cursor', 'pointer');
    btn.style('font-family', 'Quicksand');
    btn.mousePressed(() => {
      mySpellChoice = type;
      if (myPlayerID) db.ref('players/' + myPlayerID + '/choice').set(mySpellChoice);
      combatButtons.forEach(b => b.style('background', 'rgba(255,255,255,0.1)'));
      btn.style('background', 'rgba(255, 100, 255, 0.5)');
    });
    combatButtons.push(btn);
  });

  let megaBtn = createButton("🌟 MEGA SPELL (20 HEALTH) 🌟");
  megaBtn.parent(spellContainer);
  megaBtn.style('padding', '12px 24px');
  megaBtn.style('border-radius', '30px');
  megaBtn.style('border', 'none');
  megaBtn.style('background', 'linear-gradient(90deg, #ff0000, #ff00ff)');
  megaBtn.style('color', 'white');
  megaBtn.style('font-family', 'Quicksand');
  megaBtn.style('font-weight', 'bold');
  megaBtn.style('cursor', 'pointer');
  megaBtn.mousePressed(() => {
    isMegaSpell = !isMegaSpell;
    megaBtn.style('transform', isMegaSpell ? 'scale(1.1)' : 'scale(1)');
    megaBtn.style('box-shadow', isMegaSpell ? '0 0 20px #ff0000' : 'none');
  });
}

function updateInstructionSteps() {
  if (currentStep === 3 && fairyMana >= 50) {
    nextStep(4);
  } else if (currentStep === 4 && (spiritHealth <= 50 || fairyMana <= 5)) {
    // Move to Finale if health is low or mana is spent
    nextStep(5);
  }
}

function handleSpiritOrbs() {
  // Spawn Orbs
  if (frameCount % 60 === 0 && spiritOrbs.length < 5) {
    spiritOrbs.push({
      x: random(50, width - 50),
      y: random(50, height - 50),
      size: random(20, 40),
      seed: random(1000)
    });
  }

  // Draw & Check Collision
  let pos = getObjectPosition();
  for (let i = spiritOrbs.length - 1; i >= 0; i--) {
    let o = spiritOrbs[i];
    let wave = sin(frameCount * 0.05 + o.seed) * 5;
    
    push();
    drawingContext.shadowBlur = 15;
    drawingContext.shadowColor = 'rgba(255, 255, 255, 0.8)';
    fill(255, 255, 255, 180);
    noStroke();
    ellipse(o.x, o.y + wave, o.size);
    pop();

    if (dist(pos.x, pos.y, o.x, o.y + wave) < o.size) {
      spiritOrbs.splice(i, 1);
      fairyMana += 10;
      if (myPlayerID) db.ref('players/' + myPlayerID + '/mana').set(fairyMana);
      for (let j = 0; j < 20; j++) particles.push(new Particle(o.x, o.y));
    }
  }
}

function mousePressed() {
  let costMana = 5;
  let costSpirit = 0;
  let damage = 20;

  if (isMegaSpell) {
    costMana = 0;
    costSpirit = 20; // Slightly lower sacrifice
    damage = 35; // Slightly lower damage
  }

  if (currentStep === 4 && fairyMana >= costMana && spiritHealth >= costSpirit) {
    // Check if we aimed at a remote mirror
    let elements = document.elementsFromPoint(mouseX, mouseY);
    elements.forEach(el => {
      let frame = el.closest('.mirror-frame');
      if (frame && frame.id !== 'local-mirror-container' && frame.id !== '') {
        let hitID = frame.id;
        for (let pID in remotePlayers) {
          if (remotePlayers[pID].peerID === hitID) {
            let targetChoice = remotePlayers[pID].choice || 'Fire';
            
            // RPS RESOLUTION
            let win = false;
            let draw = false;
            
            if (isMegaSpell) {
              win = true; // Mega Spell bypasses RPS!
            } else {
              if (mySpellChoice === targetChoice) draw = true;
              else if (mySpellChoice === 'Fire' && targetChoice === 'Earth') win = true;
              else if (mySpellChoice === 'Earth' && targetChoice === 'Water') win = true;
              else if (mySpellChoice === 'Water' && targetChoice === 'Fire') win = true;
            }

            if (win) {
              db.ref('players/' + pID + '/spirit').set(max(0, (remotePlayers[pID].spirit || 100) - damage));
              if (isMegaSpell) feedback.html("ANCIENT POWER BLASTED!");
            } else if (draw) {
              db.ref('players/' + pID + '/spirit').set(max(0, (remotePlayers[pID].spirit || 100) - 5));
              spiritHealth = max(0, spiritHealth - 5);
            } else {
              spiritHealth = max(0, spiritHealth - damage);
              feedback.html("You were countered! Energy backfire!");
            }

            fairyMana -= costMana;
            spiritHealth -= costSpirit;

            if (myPlayerID) {
              db.ref('players/' + myPlayerID + '/mana').set(fairyMana);
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
        p.color = isMegaSpell ? color(255, 0, 0) : myFairyColor;
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

  let battlePrompt = `A high-action, masterpiece cinematic painting of several beautiful fairies engaged in an epic magical battle. ` +
                     `The winner, ${winner}, is at the center casting a massive blast of ${winnerColor} magic. ` +
                     `They are flying through a dark, glowing enchanted forest. ` +
                     `Glitter and fairy dust explosions everywhere. 8k, ethereal lighting, incredibly detailed, dominant colour is ${winnerColor}.`;

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
    feedback.html("The Battle Spell was interrupted! Try your fist gesture again.");
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
    // Glowing effect
    fill(red(this.color), green(this.color), blue(this.color), this.alpha);
    ellipse(this.x, this.y, this.size);
    
    // Sparkle core
    if (random(1) > 0.8) {
      fill(255, 255, 255, this.alpha);
      ellipse(this.x, this.y, this.size / 2);
    }
  }
}

// Heuristic to detect a closed fist
function isFist(hand) {
  let foldedFingers = 0;
  let wrist = hand.keypoints[0];

  let fingers = [
    { tip: 8, mcp: 5 },   // Index
    { tip: 12, mcp: 9 },  // Middle
    { tip: 16, mcp: 13 }, // Ring
    { tip: 20, mcp: 17 }  // Pinky
  ];

  for (let f of fingers) {
    let tip = hand.keypoints[f.tip];
    let mcp = hand.keypoints[f.mcp];

    let dTip = dist(wrist.x, wrist.y, tip.x, tip.y);
    let dMcp = dist(wrist.x, wrist.y, mcp.x, mcp.y);

    // Mathematical heuristic:
    // A fully extended finger tip is generally > 2.0x further from the wrist than the knuckle.
    // A folded finger (closed fist) brings the tip essentially to the same distance as the knuckle (~1.0x to ~1.3x).
    if (dTip < dMcp * 1.5) {
      foldedFingers++;
    }
  }

  return foldedFingers >= 3;
}

// Find the perfect centroid for the magical object
function getObjectPosition() {
  let tx = width / 2;
  let ty = height / 2;

  if (hands.length > 0) {
    let sumX = 0;
    let sumY = 0;
    let count = min(hands.length, 2); // Max 2 hands supported

    for (let i = 0; i < count; i++) {
      let wrist = hands[i].wrist || hands[i].keypoints[0];

      if (count === 1) {
        // If holding with 1 hand, place the item squarely in the center of the palm!
        let mcp = hands[i].keypoints[9]; // Middle finger knuckle
        if (mcp) {
          // Midpoint between wrist and middle knuckle
          sumX += (width - wrist.x + width - mcp.x) / 2;
          sumY += (wrist.y + mcp.y) / 2;
        } else {
          sumX += (width - wrist.x);
          sumY += wrist.y;
        }
      } else {
        // If holding with 2 hands, float it perfectly between both of your hands!
        sumX += (width - wrist.x);
        sumY += wrist.y;
      }
    }

    tx = sumX / count;
    ty = sumY / count;
  }

  return { x: tx, y: ty };
}
