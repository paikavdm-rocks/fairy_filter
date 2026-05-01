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
let currentStep = 1; // 1: Name, 2: Wand, 3: Gathering, 4: Duel, 5: Revelation
let spellContainer;
let myFairyColor; // Unique to each player
let spiritOrbs = [];
let fairyMana = 0;
let spiritHealth = 100;
let mySpellChoice = 'Fire';
let combatButtons = [];
let isMegaSpell = false;
let currentKingdom = 'Emerald';
let kingdomColor = '#ffbaff'; // Default

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
    for (let pID in remotePlayers) {
      if (pID === myPlayerID) continue; // Skip ourselves
      
      let remotePeerID = remotePlayers[pID].peerID;
      
      // Only invoke the phone call logic if we haven't already shaken hands
      // The tie-breaker mathematical standard string-comp avoids an infinite race collision!
      if (remotePeerID && myPeerID && !connectedPeers[remotePeerID]) {
        if (myPeerID > remotePeerID) {
          // Send them our live P5 canvas as a literal video stream at 20 FPS (more stable)
          let localStream = document.querySelector('canvas').captureStream(20);
          let call = peer.call(remotePeerID, localStream);
          connectedPeers[remotePeerID] = true;
          
          call.on('stream', (remoteStream) => {
            addRemoteVideo(remotePeerID, remoteStream);
          });
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

  // Only handpose needed — no body tracking
  video = createCapture(constraints, function () {
    // Handpose legacy
    handPose = ml5.handpose(video, { flipHorizontal: false }, () => {
      console.log("Hand tracker ready");
    });
    handPose.on('predict', (results) => {
      hands = Array.isArray(results) && results.length > 0 ? results.slice(0, 1) : [];
    });
  });

  video.elt.setAttribute('playsinline', ''); // Critical for iOS
  video.elt.setAttribute('autoplay', '');    // Critical for iOS
  video.elt.setAttribute('muted', '');       // Critical for iOS
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
    drawPlayerHud();
    return; // Stop the regular video logic from running!
  }

  // 1. We always show the live feed, but with a fairy transformation
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
      
      let fist = isFist(hand);

      if (wx !== null && prevHandX !== null && currentObjectTransformed && !fullFairyImage && !isTransformingSelf) {
        let speed = abs((width - wx) - prevHandX);
        handVelocity = lerp(handVelocity, speed, 0.4);
    
        // Close your fist to toggle the magic ON
        if (fist) {
          fairyFilterActive = true;
        }
        
        // Shake your hand vigorously to turn it OFF
        if (!fist && handVelocity > 20) {
          fairyFilterActive = false;
        }

        if (fist && currentStep === 5) {
          castBattleSpell();
        }
      }
      if (wx !== null) prevHandX = (width - wx);
    }
  }

  // Draw the live video feed (no color tint)
  image(video, 0, 0, width, height);

  pop(); // End flipped view

  // Spirit Orbs during Gathering and Duel (works solo — wand tip collects mana)
  if (currentStep >= 3 && currentStep <= 4) {
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
    textSize(30);
    text("🌟 AWAKENING FAIRY FORM 🌟", width / 2, height / 2);
    pop();
  }

  // HUD last so wand, particles, frame, and object layer don't paint over it
  drawPlayerHud();
}

// REAL-TIME VISUALS: This simulates turning you into a fairy in p5.
function applyFairyGlow() {
  fill(wingColor);
  noStroke();

  if (poses.length > 0) {
    let person = poses[0];
    let pose = person.pose || person; // Support both poseNet formats

    // Draw Wings on Shoulders
    let lShoulder = pose.leftShoulder || pose.keypoints.find(k => k.part === 'leftShoulder');
    let rShoulder = pose.rightShoulder || pose.keypoints.find(k => k.part === 'rightShoulder');

    if (lShoulder && (lShoulder.score || lShoulder.confidence) > 0.1) {
      let sx = width - map(lShoulder.x, 0, vidW(), 0, width);
      let sy = map(lShoulder.y, 0, vidH(), 0, height);
      drawWing(sx, sy, 1);
    }

    if (rShoulder && (rShoulder.score || rShoulder.confidence) > 0.1) {
      let sx = width - map(rShoulder.x, 0, vidW(), 0, width);
      let sy = map(rShoulder.y, 0, vidH(), 0, height);
      drawWing(sx, sy, -1);
    }

    // Draw Fairy Crown and Ears on the Head
    let leftEar = pose.leftEar || pose.keypoints.find(k => k.part === 'leftEar');
    let rightEar = pose.rightEar || pose.keypoints.find(k => k.part === 'rightEar');
    let nose = pose.nose || pose.keypoints.find(k => k.part === 'nose');

    if (nose && (nose.score || nose.confidence || 1) > 0.1) {
      // SCALE COORDINATES
      let noseX = nose.x || (nose.position ? nose.position.x : 0);
      let noseY = nose.y || (nose.position ? nose.position.y : 0);
      let nx = width - map(noseX, 0, vidW(), 0, width);
      let ny = map(noseY, 0, vidH(), 0, height);

      // Draw pointy ears
      if (leftEar && (leftEar.score || leftEar.confidence) > 0.1) {
        let ex = width - map(leftEar.x, 0, vidW(), 0, width);
        let ey = map(leftEar.y, 0, vidH(), 0, height);
        drawElfEar(ex, ey, 1);
      }
      if (rightEar && (rightEar.score || rightEar.confidence) > 0.1) {
        let ex = width - map(rightEar.x, 0, vidW(), 0, width);
        let ey = map(rightEar.y, 0, vidH(), 0, height);
        drawElfEar(ex, ey, -1);
      }

      // Draw intricate crown
      drawCrown(nx, ny - 90);
    }

    // Particles flowing down from wings
    if (frameCount % 3 === 0 && lShoulder && rShoulder) {
      let lsx = width - map(lShoulder.x, 0, vidW(), 0, width);
      let rsx = width - map(rShoulder.x, 0, vidW(), 0, width);
      particles.push(new Particle(lsx + random(-20, 20), map(lShoulder.y, 0, vidH(), 0, height)));
      particles.push(new Particle(rsx + random(-20, 20), map(rShoulder.y, 0, vidH(), 0, height)));
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
  feedback.html("Isolating the object... turning you into a Fairy...");

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
        currentObjectTransformed = incomingImage; // The whole transformed image
        isCasting = false;
        feedback.html("Spell successful! Look at your new magical item!");
        
        // Move to Step 4 (Round 1: Gathering)!
        if (currentStep === 2) {
          nextStep(3);
        }

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
  if (step <= currentStep) return;
  
  // Clean up old step UI
  if (step === 4) setupCombatUI(); // Prepare buttons for Round 2

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
      
      // Trigger special "explosion" effects
      for (let i = 0; i < 50; i++) {
          particles.push(new Particle(width / 2, height / 2));
      }
    }
  }, 500); 
}

function setupCombatUI() {
  let castBtn = createButton('⚡ CAST SPELL');
  castBtn.parent(spellContainer);
  castBtn.style('padding', '10px 24px');
  castBtn.style('border-radius', '20px');
  castBtn.style('background', 'rgba(255,0,100,0.5)');
  castBtn.style('color', 'white');
  castBtn.style('border', '1px solid rgba(255,255,255,0.4)');
  castBtn.style('cursor', 'pointer');
  castBtn.style('font-family', 'Quicksand');
  castBtn.style('font-size', '1rem');
  castBtn.mousePressed(() => {
    if (myPlayerID && spiritHealth > 0) {
      // Attack: costs 10 spirit from target
      let elements = document.elementsFromPoint(mouseX, mouseY);
      elements.forEach(el => {
        let frame = el.closest('.mirror-frame');
        if (frame && frame.id && frame.id !== 'local-mirror-container') {
          // Find the target player
          for (let pID in remotePlayers) {
            if (remotePlayers[pID].peerID === frame.id) {
              let newSpirit = max(0, (remotePlayers[pID].spirit || 100) - 10);
              db.ref('players/' + pID + '/spirit').set(newSpirit);
              feedback.html('Spell cast! 💥');
              for (let i = 0; i < 30; i++) particles.push(new Particle(mouseX, mouseY));
            }
          }
        }
      });
    }
  });
}

function updateInstructionSteps() {
  if (currentStep === 3 && fairyMana >= 50) {
    nextStep(4);
  }
}

function handleSpiritOrbs() {
  // Neon color palette
  let neonColors = ['#ff00ff', '#00ffff', '#39ff14', '#ff3131', '#fff01f', '#ff6ec7', '#7b68ee'];
  
  // Spawn more orbs, faster
  if (frameCount % 20 === 0 && spiritOrbs.length < 12) {
    let c = neonColors[floor(random(neonColors.length))];
    spiritOrbs.push({
      x: random(50, width - 50),
      y: random(50, height - 50),
      size: random(15, 35),
      seed: random(1000),
      neon: c
    });
  }

  // Draw & Check Collision
  let pos = getObjectPosition();
  for (let i = spiritOrbs.length - 1; i >= 0; i--) {
    let o = spiritOrbs[i];
    let wave = sin(frameCount * 0.05 + o.seed) * 5;
    
    push();
    drawingContext.shadowBlur = 20;
    drawingContext.shadowColor = o.neon;
    fill(o.neon);
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
              if (isMegaSpell) feedback.html("ANCIENT SPIRIT BLASTED!");
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

function isFist(hand) {
  let foldedFingers = 0;
  let wrist = hand.keypoints ? hand.keypoints[0] : (hand.landmarks ? hand.landmarks[0] : null); 
  if (!wrist && hand.annotations) wrist = hand.annotations.palmBase[0];
  if (!wrist) return false;

  let wx = wrist.x || wrist[0];
  let wy = wrist.y || wrist[1];

  if (hand.annotations) {
      let tips = [hand.annotations.indexFinger[3], hand.annotations.middleFinger[3], hand.annotations.ringFinger[3], hand.annotations.pinky[3]];
      let mcps = [hand.annotations.indexFinger[0], hand.annotations.middleFinger[0], hand.annotations.ringFinger[0], hand.annotations.pinky[0]];
      
      for (let i=0; i<4; i++) {
          if (dist(wx, wy, tips[i][0], tips[i][1]) < dist(wx, wy, mcps[i][0], mcps[i][1]) * 1.5) {
              foldedFingers++;
          }
      }
      return foldedFingers >= 3;
  }
  return false;
}

function drawPlayerHud() {
  if (!myPlayerID) return;
  const hp = constrain(Number(spiritHealth) || 0, 0, 100);
  const cx = width * 0.5;

  push();
  blendMode(BLEND);
  rectMode(CENTER);
  noStroke();
  fill(12, 8, 22, 165);
  rect(cx, 46, min(width - 20, 300), 90, 14);

  drawHealthHeartsRow(cx, 18, hp);

  drawingContext.shadowBlur = 0;
  drawingContext.shadowColor = 'transparent';
  textAlign(CENTER, CENTER);
  fill(255, 255, 255, 248);
  textSize(26);
  textFont('Caveat');
  text(myPlayerName || 'Fairy', cx, 42);

  textSize(13);
  textFont('sans-serif');
  fill(235, 235, 255, 240);
  text(`MANA: ${fairyMana} | HEALTH: ${hp}%`, cx, 64);

  rectMode(CORNER);
  const barW = 100;
  const barLeft = cx - barW * 0.5;
  const barY = 76;
  fill(28, 20, 36, 220);
  rect(barLeft, barY, barW, 8, 4);
  fill(255, 75, 115, 245);
  rect(barLeft, barY, map(hp, 0, 100, 0, barW), 8, 4);

  drawingContext.shadowBlur = 0;
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
    let wristRaw = null;
    if (hand.annotations && hand.annotations.palmBase) {
      wristRaw = hand.annotations.palmBase[0];
    } else if (hand.landmarks && hand.landmarks.length > 0) {
      wristRaw = hand.landmarks[0];
    }
    if (wristRaw) {
      let rawX = Array.isArray(wristRaw) ? wristRaw[0] : (wristRaw.x || 0);
      let rawY = Array.isArray(wristRaw) ? wristRaw[1] : (wristRaw.y || 0);
      let wx = map(rawX, 0, vidW(), 0, width);
      let wy = map(rawY, 0, vidH(), 0, height);
      let tx = width - wx;
      let ty = wy;
      let mcpRaw = null;
      if (hand.annotations && hand.annotations.middleFinger) {
        mcpRaw = hand.annotations.middleFinger[0];
      } else if (hand.landmarks && hand.landmarks.length > 9) {
        mcpRaw = hand.landmarks[9];
      }
      if (mcpRaw) {
        let mx = map(Array.isArray(mcpRaw) ? mcpRaw[0] : mcpRaw.x, 0, vidW(), 0, width);
        let my = map(Array.isArray(mcpRaw) ? mcpRaw[1] : mcpRaw.y, 0, vidH(), 0, height);
        tx = (width - wx + width - mx) / 2;
        ty = (wy + my) / 2;
      }

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
  return { x: cx, y: cy };
}
