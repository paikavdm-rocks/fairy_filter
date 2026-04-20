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
let currentStep = 1; // 1: Name, 2: Wand, 3: Grasp, 4: Aura, 5: Finale
let spellContainer;

// Cloud event listener for remote players
db.ref('players').on('value', (snapshot) => {
  const data = snapshot.val();
  if (data) {
    remotePlayers = data;
    // Scan for new connections to form WebRTC peer tunnels
    for (let pID in remotePlayers) {
      if (pID === myPlayerID) continue; // Skip ourselves
      
      let remotePeerID = remotePlayers[pID].peerID;
      
      // Only invoke the phone call logic if we haven't already shaken hands
      // The tie-breaker mathematical standard string-comp avoids an infinite race collision!
      if (remotePeerID && myPeerID && !connectedPeers[remotePeerID]) {
        if (myPeerID > remotePeerID) {
          // Send them our live P5 canvas as a literal video stream at 30 FPS completely invisibly!
          let localStream = document.querySelector('canvas').captureStream(30);
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
      db.ref('players/' + myPlayerID).set({ peerID: myPeerID, name: myPlayerName });
    }
  });

  peer.on('call', (call) => {
    // We are receiving a call from another Player's browser! Pass them our P5 element stream natively.
    let localStream = document.querySelector('canvas').captureStream(30);
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

  // Wait for the strict mobile camera permissions to be approved AND the 
  // media stream to safely exist before booting up the intensive ML5 trackers. 
  // This explicitly prevents iOS/mobile from silently dropping the AI detection completely!
  video = createCapture(constraints, function () {
    handPose = ml5.handPose(() => {
      handPose.detectStart(video, (results) => {
        hands = results;
      });
    });

    bodyPose = ml5.bodyPose(() => {
      bodyPose.detectStart(video, (results) => {
        poses = results;
      });
    });
  });

  video.elt.setAttribute('playsinline', ''); // Critical for iOS
  video.elt.setAttribute('autoplay', '');    // Critical for iOS
  video.elt.setAttribute('muted', '');       // Critical for iOS
  video.size(width, height);
  video.hide();

  // Create real-time fairy effect colors
  wingColor = color(200, 100, 255, 120); // Pink/Purple glow
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

      // Closing your hand into a fist triggers the final API call!
      if (fist && fairyFilterActive) {
        castSelfSpell();
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
      drawingContext.shadowBlur = 10;
      drawingContext.shadowColor = 'rgba(255, 0, 255, 0.8)';
      
      text(myPlayerName, nx, ny - 140);
      
      // Magical pinpoint anchoring the tag
      fill(255, 215, 0, 200);
      ellipse(nx, ny - 110, 10, 10);
      pop();
    }
  }

  // 2. We use AI to apply the object transformation (if the spell worked)
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
    // Subtle indicator sparkle
    noStroke();
    fill(255, 255, 200, 150);
    ellipse(x, y, 10, 10);

    if (frameCount % 2 === 0) {
      particles.push(new Particle(x, y));
    }
  } else {
    // Ambient dust around mouse
    if (frameCount % 5 === 0) {
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
        currentObjectTransformed = incomingImage; // The whole transformed image
        isCasting = false;
        feedback.html("Spell successful! Look at your new magical item!");
        
        // Move to Step 3!
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
  
  // Hide current
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

function updateInstructionSteps() {
  if (currentStep === 3 && hands.length > 0) {
    nextStep(4);
  } else if (currentStep === 4 && fairyFilterActive) {
    nextStep(5);
  }
}

async function castSelfSpell() {
  if (isTransformingSelf) return;
  isTransformingSelf = true;
  feedback.html("Fairy Awakening... Please hold still and wait for the magic to finish!");

  // Capture the full composite (video + the drawn wand proxy object)
  let offscreen = createGraphics(width, height);

  // 1. Draw video flipped
  offscreen.push();
  offscreen.translate(width, 0);
  offscreen.scale(-1, 1);
  offscreen.image(video, 0, 0, width, height);
  offscreen.pop();

  // 2. Composite the Wand over the hand/hands!
  if (currentObjectTransformed && hands.length > 0) {
    let pos = getObjectPosition();
    let objSize = width * 0.35;
    offscreen.blendMode(SCREEN);
    offscreen.image(currentObjectTransformed, pos.x - objSize / 2, pos.y - objSize / 2, objSize, objSize);
    offscreen.blendMode(BLEND);
  }

  let imgBase64 = offscreen.elt.toDataURL();

  let fairyAesthetic = "ethereal lighting, cinematic, glittery fairy kingdom style, incredibly beautiful fairy magic.";
  let targetModel = "google/nano-banana";

  // Image-To-Image prompt asking for a full transformation
  let prompt = "High quality masterpiece photo of an ethereal human transformed into a gorgeous magical fairy inside a glowing fairy forest. They are holding " + document.getElementById('input_image_prompt').value + " which is glowing powerfully. " + fairyAesthetic;

  let postData = {
    model: targetModel,
    input: {
      prompt: prompt,
      image_input: [imgBase64],
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
        feedback.html("You are now a Fairy!");

        // Spawn ultimate particle blast
        for (let i = 0; i < 200; i++) particles.push(new Particle(width / 2, height / 2));
      });
    }
  } catch (error) {
    isTransformingSelf = false;
    fairyFilterActive = false; // Reset to let them try again
    feedback.html("The fairy transformation failed! Try shaking your hand again.");
  }
}

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = random(-2, 2);
    this.vy = random(-2, 2);
    this.alpha = 255;
    this.color = color(random(180, 255), random(100, 255), 255);
  }
  finished() { return this.alpha < 0; }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 8;
  }
  show() {
    noStroke();
    fill(red(this.color), green(this.color), blue(this.color), this.alpha);
    ellipse(this.x, this.y, random(2, 5));
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
