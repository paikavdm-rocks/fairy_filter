const replicateProxy = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";

let video;
let canvas;
let feedback;
let particles = [];
let isCasting = false;
let handPose, bodyPose;
let hands = [], poses = [];

let currentStep = 1; 
let myPlayerName = "Fairy";
let myFairyColor;
let wingColor;

let spellContainer, nameContainer;
let fairyFilterActive = false;
let prevHandX = null;
let handVelocity = 0;
let currentObjectTransformed = null;
let fullFairyImage = null;
let isTransformingSelf = false;
let myPlayerID = "solo"; // Placeholder to prevent reference errors

function setup() {
  let cw = min(windowWidth - 40, 640);
  let ch = cw * 0.75;
  canvas = createCanvas(cw, ch);
  canvas.parent('p5-container');

  let controls = createDiv();
  controls.parent('controls-container');
  controls.style('display', 'flex');
  controls.style('flex-direction', 'column');
  controls.style('align-items', 'center');
  controls.style('gap', '20px');

  let inputRow = createDiv();
  inputRow.style('display', 'flex');
  inputRow.style('flex-wrap', 'wrap');
  inputRow.style('justify-content', 'center');
  inputRow.style('gap', '10px');
  inputRow.parent(controls);

  // --- PHASE 1: NAMING ---
  nameContainer = createDiv();
  nameContainer.style('display', 'flex');
  nameContainer.style('align-items', 'center');
  nameContainer.style('gap', '10px');
  nameContainer.parent(inputRow);

  let nameInput = createInput("Your Fairy Name");
  nameInput.style('padding', '10px 15px');
  nameInput.style('border-radius', '25px');
  nameInput.style('border', '2px solid #00ffff');
  nameInput.style('background', 'rgba(20,0,40,0.8)');
  nameInput.style('color', 'white');
  nameInput.parent(nameContainer);

  let nameBtn = createButton("✨ SET NAME ✨");
  nameBtn.style('padding', '12px 24px');
  nameBtn.style('border-radius', '30px');
  nameBtn.style('background', 'linear-gradient(90deg, #00ffff, #ff00ff)');
  nameBtn.style('font-weight', 'bold');
  nameBtn.style('cursor', 'pointer');
  nameBtn.parent(nameContainer);
  nameBtn.mousePressed(() => {
    if (currentStep === 1) {
      myPlayerName = nameInput.value();
      myFairyColor = hashStringToColor(myPlayerName);
      wingColor = myFairyColor;
      nextStep(2);
      nameContainer.style('display', 'none');
      spellContainer.style('display', 'flex');
    }
  });

  // --- PHASE 2: WAND ---
  spellContainer = createDiv();
  spellContainer.style('display', 'none');
  spellContainer.style('gap', '10px');
  spellContainer.parent(inputRow);

  let itemInput = createInput("A crystal flower wand");
  itemInput.style('padding', '10px 15px');
  itemInput.style('border-radius', '25px');
  itemInput.parent(spellContainer);

  let castBtn = createButton("✨ CREATE WAND ✨");
  castBtn.style('padding', '12px 24px');
  castBtn.style('border-radius', '30px');
  castBtn.style('background', 'linear-gradient(90deg, #ff00ff, #00ffff)');
  castBtn.style('font-weight', 'bold');
  castBtn.parent(spellContainer);
  castBtn.mousePressed(() => {
    castRegionalSpell(itemInput.value());
  });

  feedback = createP("Look into the Mirror! The spirits are waiting.");
  feedback.style('color', '#ffbaff');
  feedback.style('font-family', 'Quicksand');
  feedback.parent(controls);

  video = createCapture(VIDEO, () => {
    video.size(width, height);
    if (typeof ml5 !== 'undefined') {
      handPose = ml5.handPose({ maxHands: 1 }, () => {
        handPose.detectStart(video.elt, (results) => { hands = results; });
      });
      bodyPose = ml5.bodyPose(() => {
        bodyPose.detectStart(video.elt, (results) => { poses = results; });
      });
    }
  });

  video.parent('controls-container');
  video.elt.setAttribute('playsinline', '');
  video.elt.style.position = 'absolute';
  video.elt.style.top = '-9999px';
  video.elt.play().catch(e => console.log("Mirror failed:", e));

  myFairyColor = color(255, 0, 255);
  wingColor = myFairyColor;
}

function hashStringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  let h = abs(hash % 360);
  push(); colorMode(HSL); let c = color(h, 80, 70, 0.8); pop();
  return c;
}

function nextStep(step) {
  if (step <= currentStep) return;
  let prev = document.getElementById('instr-' + currentStep);
  if (prev) prev.style.display = 'none';
  currentStep = step;
  let next = document.getElementById('instr-' + currentStep);
  if (next) { next.style.display = 'block'; next.classList.add('fly-in'); }
}

function draw() {
  background(0);
  if (!video || !video.elt || video.elt.readyState < 2) {
    fill(255); textAlign(CENTER); textSize(24); text("✨ AWAKENING THE MIRROR ✨", width/2, height/2);
    return;
  }

  if (fullFairyImage) {
    image(fullFairyImage, 0, 0, width, height);
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(); particles[i].show();
        if (particles[i].finished()) particles.splice(i, 1);
    }
    if (frameCount % 10 === 0) particles.push(new Particle(random(width), random(height)));
    return;
  }

  push();
  translate(width, 0); scale(-1, 1);

  if (hands.length > 0) {
    let hand = hands[0];
    let wrist = hand.keypoints[0];
    if (prevHandX !== null && currentObjectTransformed && !isTransformingSelf) {
      let speed = abs(wrist.x - prevHandX);
      handVelocity = lerp(handVelocity, speed, 0.4);
      if (handVelocity > 10) fairyFilterActive = true;
      
      // TRIGGER FULL TRANSFORMATION WITH FIST
      if (isFist(hand) && fairyFilterActive) {
          castFullSelfSpell();
      }
    }
    prevHandX = wrist.x;
  }

  image(video, 0, 0, width, height);

  if (currentObjectTransformed && fairyFilterActive) {
    // Advanced Filter Overlay
    blendMode(SCREEN);
    fill(red(myFairyColor), green(myFairyColor), blue(myFairyColor), 40);
    rect(0, 0, width, height);
    blendMode(BLEND);
    applyFairyGlow();
  }
  pop();

  if (currentObjectTransformed) applyObjectTransformation();
  
  // Name Tag
  if (currentStep > 1) { // Show name as soon as it's set
    let nx = width/2, ny = height/2;
    if (poses.length > 0 && poses[0].keypoints) {
      // ml5 v1 format: nose index is 0
      let nose = poses[0].keypoints[0]; 
      if (nose && nose.confidence > 0.1) {
        nx = width - nose.x; 
        ny = nose.y;
      }
    }
    push();
    drawingContext.shadowBlur = 10;
    drawingContext.shadowColor = myFairyColor;
    fill(255); textAlign(CENTER); textSize(36); textFont('Caveat');
    text(myPlayerName, nx, ny - 140);
    fill(myFairyColor); ellipse(nx, ny - 110, 10, 10);
    pop();
  }

  // Particle System
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update(); particles[i].show();
    if (particles[i].finished()) particles.splice(i, 1);
  }

  drawWand();

  // Casting Overlays
  if (isCasting || isTransformingSelf) {
    push();
    fill(255, 255, 255, 100);
    rect(0, 0, width, height);
    translate(width/2, height/2); rotate(frameCount*0.1);
    noFill(); stroke(myFairyColor || color(255, 0, 255)); strokeWeight(12);
    arc(0,0,120,120,0,PI);
    pop();
    
    fill(255); textAlign(CENTER); textSize(28); textFont('Cinzel Decorative');
    text("MAGICAL REALITY CRAFTING...", width/2, height/2 + 100);
  }
}

function solveFist(hand) {
  let wrist = hand.keypoints[0];
  let folded = 0;
  let fingers = [{t:8,k:6},{t:12,k:10},{t:16,k:14},{t:20,k:18}];
  for(let f of fingers) {
    if (dist(wrist.x, wrist.y, hand.keypoints[f.t].x, hand.keypoints[f.t].y) < dist(wrist.x, wrist.y, hand.keypoints[f.k].x, hand.keypoints[f.k].y) * 1.5) folded++;
  }
  return folded >= 3;
}
function isFist(hand) { return solveFist(hand); }

async function castRegionalSpell(prompt) {
  isCasting = true; feedback.html("Forging your wand...");
  let offscreen = createGraphics(width, height);
  offscreen.translate(width, 0); offscreen.scale(-1, 1);
  offscreen.image(video, 0, 0, width, height);
  
  let postData = {
    model: "google/nano-banana",
    input: { prompt: prompt + ". highly detailed 3D magical artifact, ethereal glow, black background, center composition." }
  };

  try {
    const response = await fetch(replicateProxy, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postData) });
    const result = await response.json();
    if (result.output) {
      loadImage(result.output, (img) => {
        currentObjectTransformed = img;
        isCasting = false; feedback.html("Success! Now SHAKE your wand and then CLENCH YOUR FIST!");
        spellContainer.style('display', 'none');
        nextStep(3);
      });
    }
  } catch (e) { isCasting = false; feedback.html("Magic failed! Try a new incantation."); }
}

async function castFullSelfSpell() {
  if (isTransformingSelf) return;
  isTransformingSelf = true;
  feedback.html("THE FINAL REVELATION IS COMMENCING...");

  let offscreen = createGraphics(width, height);
  offscreen.translate(width, 0); offscreen.scale(-1, 1);
  offscreen.image(video, 0, 0, width, height);
  let imgBase = offscreen.elt.toDataURL();

  let postData = {
    model: "google/nano-banana",
    input: {
      image: imgBase,
      prompt: "A breathtaking high-fantasy portrait of a High Fairy in an enchanted forest. Wings of light, glowing crown, mystical aura, masterpieces, cinematic lighting, ethereal colors."
    }
  };

  try {
    const response = await fetch(replicateProxy, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postData) });
    const result = await response.json();
    if (result.output) {
      loadImage(result.output, (img) => {
        fullFairyImage = img;
        isTransformingSelf = false;
        feedback.html("YOU HAVE ASCENDED, HIGH FAIRY " + myPlayerName.toUpperCase() + "!");
      });
    }
  } catch (e) { isTransformingSelf = false; feedback.html("The portal closed! Try again!"); }
}

function applyObjectTransformation() {
  push(); blendMode(SCREEN); 
  let pos = {x: width/2, y: height/2};
  if (hands.length > 0) {
    let wrist = hands[0].keypoints[0];
    pos.x = width - wrist.x; pos.y = wrist.y;
  }
  image(currentObjectTransformed, pos.x - 120, pos.y - 120, 240, 240);
  pop();
}

function drawWand() {
  if (hands.length > 0) {
    let tip = hands[0].keypoints[8];
    let x = width - tip.x, y = tip.y;
    fill(255, 255, 200, 200); ellipse(x, y, 15, 15);
    if (frameCount % 2 === 0) particles.push(new Particle(x, y));
  }
}

function applyFairyGlow() {
  if (poses.length > 0) {
    let p = poses[0];
    if (p.left_shoulder && p.right_shoulder) {
      push();
      blendMode(ADD);
      fill(red(wingColor), green(wingColor), blue(wingColor), 100);
      noStroke();
      drawWing(width - p.left_shoulder.x, p.left_shoulder.y, 1);
      drawWing(width - p.right_shoulder.x, p.right_shoulder.y, -1);
      pop();
    }
  }
}

function drawWing(x, y, dir) {
  push();
  translate(x, y);
  rotate(dir * PI/6 + sin(frameCount*0.1)*0.2);
  ellipse(dir * 60, -40, 120, 250);
  ellipse(dir * 40, 40, 80, 150);
  pop();
}

class Particle {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = random(-2, 2); this.vy = random(-2, 2);
    this.alpha = 255; this.color = wingColor || color(255);
  }
  finished() { return this.alpha < 0; }
  update() { this.x += this.vx; this.y += this.vy; this.alpha -= 5; }
  show() { noStroke(); fill(red(this.color), green(this.color), blue(this.color), this.alpha); ellipse(this.x, this.y, random(2, 6)); }
}
