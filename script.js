// Layout Lens — Drag + Delete + Soft Blue Dot + Glow Selected Line
// + Small, safe slanted-line feature: create a slanted line by double-click / double-tap

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const dotBtn = document.getElementById('dotBtn');
const vertBtn = document.getElementById('vertBtn');
const horiBtn = document.getElementById('horiBtn');
const ratioBtns = Array.from(document.querySelectorAll('.ratioBtn'));

const deleteBtn = document.getElementById('deleteBtn');
const captureBtn = document.getElementById('captureBtn');
const switchBtn = document.getElementById('switchBtn');

const currentRatioLabel = document.getElementById('currentRatio');

let mode = 'dot';
let dots = [];
let lines = []; // supports {orientation: 'vertical'|'horizontal'|'slanted', ...}
let selected = null;

let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

let devices = [];
let currentDeviceIndex = 0;
let stream = null;

// FRAME STATE
let frame = { x:0, y:0, w:0, h:0, ratio:1 };

// --------------------------- CAMERA --------------------------------------

async function enumerateDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all.filter(d => d.kind === 'videoinput');
  } catch (e) { devices = []; }
}

async function startCameraPreferRear() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ ideal:'environment' } }
    });
    attachStream(s);
    await enumerateDevices();
    return;
  } catch (e){}

  try {
    const s2 = await navigator.mediaDevices.getUserMedia({ video:true });
    attachStream(s2);
    await enumerateDevices();
  } catch(e2) {
    alert("Camera error");
  }
}

function attachStream(s){
  if (stream) stream.getTracks().forEach(t=>t.stop());
  stream = s;
  video.srcObject = s;
}

async function switchCamera(){
  await enumerateDevices();
  if (!devices.length) return;

  currentDeviceIndex = (currentDeviceIndex+1)%devices.length;
  const id = devices[currentDeviceIndex].deviceId;

  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video:{ deviceId:{ exact:id } }
    });
    attachStream(s);
  } catch(e){
    await startCameraPreferRear();
  }
}

// --------------------------- FRAME ---------------------------------------

function computeFrame(ratio){
  const W = canvas.width, H = canvas.height;
  const margin = 0.92;
  let boxW, boxH;

  if (W/H > ratio){
    boxH = H * margin;
    boxW = boxH * ratio;
  } else {
    boxW = W * margin;
    boxH = boxW / ratio;
  }

  const x = (W-boxW)/2;
  const y = (H-boxH)/2;
  frame = { x, y, w:boxW, h:boxH, ratio };

  currentRatioLabel.textContent = ratio===1.618 ? "Golden" : (Math.round(ratio*1000)/1000);
}

// --------------------------- DRAWING -------------------------------------

function drawMaskAndBorder(){
  ctx.fillStyle = 'rgba(0,0,0,0.45)';

  // top
  ctx.fillRect(0,0,canvas.width, frame.y);
  // bottom
  ctx.fillRect(0,frame.y+frame.h, canvas.width, canvas.height-(frame.y+frame.h));
  // left
  ctx.fillRect(0,frame.y, frame.x, frame.h);
  // right
  ctx.fillRect(frame.x+frame.w,frame.y, canvas.width-(frame.x+frame.w), frame.h);

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.strokeRect(frame.x+1.5, frame.y+1.5, frame.w-3, frame.h-3);
}

function redraw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw camera feed under everything by letting video element be visible underneath canvas
  // (canvas overlays lines/dots/mask) — we only redraw overlays here.

  drawMaskAndBorder();

  // dots (soft blue)
  for (const d of dots){
    ctx.fillStyle = "#4da3ff";
    ctx.beginPath();
    ctx.arc(d.x,d.y,8,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // lines
  for (let i=0;i<lines.length;i++){
    const l = lines[i];
    const sel = (i===selected);

    if (sel){
      ctx.shadowColor = "cyan";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "cyan";
      ctx.lineWidth = 4;
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "lime";
      ctx.lineWidth = 3;
    }

    ctx.beginPath();
    if (l.orientation==='vertical'){
      ctx.moveTo(l.x, frame.y);
      ctx.lineTo(l.x, frame.y+frame.h);
    } else if (l.orientation==='horizontal'){
      ctx.moveTo(frame.x, l.y);
      ctx.lineTo(frame.x+frame.w, l.y);
    } else if (l.orientation==='slanted'){
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
    }
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

// ------------------------- UTILITIES ------------------------------------

function insideFrame(x,y){
  return (x>=frame.x && x<=frame.x+frame.w &&
          y>=frame.y && y<=frame.y+frame.h);
}

function pointToSegmentDistance(px,py,x1,y1,x2,y2){
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq ? dot / lenSq : -1;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function findLineAt(x,y){
  const threshold = 18;
  // check slanted segments and full-length vertical/horizontal lines
  for (let i=0;i<lines.length;i++){
    const l = lines[i];
    if (l.orientation==='vertical'){
      if (Math.abs(x - l.x) < threshold &&
          y >= frame.y && y <= frame.y+frame.h){
        return i;
      }
    } else if (l.orientation==='horizontal'){
      if (Math.abs(y - l.y) < threshold &&
          x >= frame.x && x <= frame.x+frame.w){
        return i;
      }
    } else if (l.orientation==='slanted'){
      const d = pointToSegmentDistance(x,y,l.x1,l.y1,l.x2,l.y2);
      if (d < threshold) return i;
    }
  }
  return null;
}

// ------------------------- INPUT HANDLERS --------------------------------

let lastTap = 0;
let pointerDownWasOnLine = false;

canvas.addEventListener('pointerdown',(e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  // tapping a line selects it
  const hit = findLineAt(e.clientX, e.clientY);
  if (hit!==null){
    selected = hit;
    deleteBtn.style.display = "inline-block";
    redraw();

    isDragging = true; // start drag on pointermove
    pointerDownWasOnLine = true;
    return;
  }

  pointerDownWasOnLine = false;
  selected = null;
  deleteBtn.style.display = "none";

  if (!insideFrame(e.clientX, e.clientY)) return;

  // detect double-tap / double-click for slanted line creation
  const now = Date.now();
  if (now - lastTap < 300){
    // double-tap detected -> create slanted line centered at tap
    const length = 160; // default length
    const angle = -Math.PI/4; // -45 degrees (diagonal up-left to down-right)
    const cx = e.clientX;
    const cy = e.clientY;
    const x1 = cx - Math.cos(angle) * length/2;
    const y1 = cy - Math.sin(angle) * length/2;
    const x2 = cx + Math.cos(angle) * length/2;
    const y2 = cy + Math.sin(angle) * length/2;

    // clamp points to frame (if outside, clamp to nearest point within frame)
    function clampToFrameX(x){ return Math.max(frame.x, Math.min(frame.x+frame.w, x)); }
    function clampToFrameY(y){ return Math.max(frame.y, Math.min(frame.y+frame.h, y)); }

    lines.push({
      orientation: 'slanted',
      x1: clampToFrameX(x1), y1: clampToFrameY(y1),
      x2: clampToFrameX(x2), y2: clampToFrameY(y2)
    });
    selected = lines.length-1;
    deleteBtn.style.display = "inline-block";
    redraw();

    lastTap = 0;
    return;
  }
  lastTap = now;

  // normal single-tap behaviour
  if (mode==='dot'){
    dots.push({x:e.clientX, y:e.clientY});
    redraw();
    return;
  }

  if (mode==='vertical'){
    const cx = Math.max(frame.x, Math.min(frame.x+frame.w, e.clientX));
    lines.push({orientation:'vertical', x:cx});
    selected = lines.length-1;
    deleteBtn.style.display = "inline-block";
    redraw();
    return;
  }

  if (mode==='horizontal'){
    const cy = Math.max(frame.y, Math.min(frame.y+frame.h, e.clientY));
    lines.push({orientation:'horizontal', y:cy});
    selected = lines.length-1;
    deleteBtn.style.display = "inline-block";
    redraw();
    return;
  }
});

canvas.addEventListener('pointermove',(e)=>{
  if (!isDragging) return;
  if (selected===null) return;

  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;

  const l = lines[selected];

  if (l.orientation==='vertical'){
    l.x = Math.max(frame.x, Math.min(frame.x+frame.w, l.x + dx));
  } else if (l.orientation==='horizontal'){
    l.y = Math.max(frame.y, Math.min(frame.y+frame.h, l.y + dy));
  } else if (l.orientation==='slanted'){
    // move the whole slanted segment by dx,dy but keep it inside frame loosely
    l.x1 += dx; l.y1 += dy;
    l.x2 += dx; l.y2 += dy;

    // if points go outside frame, clamp them (keeps the orientation/length)
    function clampX(val){ return Math.max(frame.x, Math.min(frame.x+frame.w, val)); }
    function clampY(val){ return Math.max(frame.y, Math.min(frame.y+frame.h, val)); }

    // compute translation needed to bring both points inside if either is out
    const nx1 = clampX(l.x1), ny1 = clampY(l.y1);
    const nx2 = clampX(l.x2), ny2 = clampY(l.y2);

    // If either changed, apply a small correction translation so segment remains coherent.
    const corrX = Math.min(nx1 - l.x1, nx2 - l.x2);
    const corrY = Math.min(ny1 - l.y1, ny2 - l.y2);

    if (corrX !== 0 || corrY !== 0){
      l.x1 += corrX; l.y1 += corrY;
      l.x2 += corrX; l.y2 += corrY;
    }
  }

  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  redraw();
});

canvas.addEventListener('pointerup',()=>{
  isDragging = false;
  pointerDownWasOnLine = false;
});

// ----------------------------- MODES -------------------------------------

function setMode(m,id){
  mode = m;
  [dotBtn,vertBtn,horiBtn].forEach(b=>b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

dotBtn.onclick = ()=> setMode('dot','dotBtn');
vertBtn.onclick = ()=> setMode('vertical','vertBtn');
horiBtn.onclick = ()=> setMode('horizontal','horiBtn');

ratioBtns.forEach(btn=>{
  btn.onclick = ()=>{
    ratioBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');

    const v = btn.dataset.r;
    const ratio = v.includes("/") ? eval(v) : parseFloat(v);

    computeFrame(ratio);
    redraw();
  };
});

// -------------------------- DELETE LINE ---------------------------------

deleteBtn.onclick = ()=>{
  if (selected!==null){
    lines.splice(selected,1);
    selected = null;
    deleteBtn.style.display = "none";
    redraw();
  }
};

// --------------------------- CAPTURE ------------------------------------

captureBtn.onclick = ()=>{
  const tmp=document.createElement('canvas');
  tmp.width=canvas.width;
  tmp.height=canvas.height;
  const tctx=tmp.getContext('2d');

  // draw camera feed
  tctx.drawImage(video,0,0,tmp.width,tmp.height);

  // masks
  tctx.fillStyle='rgba(0,0,0,0.45)';

  tctx.fillRect(0,0,tmp.width, frame.y);
  tctx.fillRect(0,frame.y+frame.h, tmp.width, tmp.height-(frame.y+frame.h));
  tctx.fillRect(0,frame.y, frame.x, frame.h);
  tctx.fillRect(frame.x+frame.w,frame.y, tmp.width-(frame.x+frame.w), frame.h);

  // frame border
  tctx.strokeStyle='rgba(255,255,255,0.95)';
  tctx.lineWidth=3;
  tctx.strokeRect(frame.x+1.5,frame.y+1.5,frame.w-3,frame.h-3);

  // dots
  dots.forEach(d=>{
    tctx.fillStyle="#4da3ff";
    tctx.beginPath(); tctx.arc(d.x,d.y,8,0,Math.PI*2);
    tctx.fill();
    tctx.strokeStyle="#fff";
    tctx.lineWidth=2;
    tctx.stroke();
  });

  // lines
  lines.forEach(l=>{
    tctx.strokeStyle="lime";
    tctx.lineWidth=4;
    tctx.beginPath();
    if (l.orientation==='vertical'){
      tctx.moveTo(l.x,frame.y);
      tctx.lineTo(l.x,frame.y+frame.h);
    } else if (l.orientation==='horizontal'){
      tctx.moveTo(frame.x,l.y);
      tctx.lineTo(frame.x+frame.w,l.y);
    } else if (l.orientation==='slanted'){
      tctx.moveTo(l.x1,l.y1);
      tctx.lineTo(l.x2,l.y2);
    }
    tctx.stroke();
  });

  const url=tmp.toDataURL("image/png");
  const win=window.open();
  if (win){
    win.document.write(`<img src="${url}" style="width:100%;">`);
  } else {
    // fallback: trigger download without forcing popup when window blocked
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viewfinder.png';
    link.click();
  }
};

// ----------------------------- INIT -------------------------------------

function resize(){
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
  computeFrame(frame.ratio || 1);
  redraw();
}
window.addEventListener('resize',resize);

(async function init(){
  await startCameraPreferRear();
  await enumerateDevices();
  computeFrame(1);
  resize();

  function loop(){
    redraw();
    requestAnimationFrame(loop);
  }
  loop();
})();
