// Layout Lens — Drag + Delete + Dot + Lines + Slanted Line + Select Mode

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const dotBtn = document.getElementById('dotBtn');
const vertBtn = document.getElementById('vertBtn');
const horiBtn = document.getElementById('horiBtn');
const slantBtn = document.getElementById('slantBtn');
const selectBtn = document.getElementById('selectBtn');  // NEW

const ratioBtns = Array.from(document.querySelectorAll('.ratioBtn'));

const deleteBtn = document.getElementById('deleteBtn');
const captureBtn = document.getElementById('captureBtn');
const switchBtn = document.getElementById('switchBtn');

const currentRatioLabel = document.getElementById('currentRatio');

let mode = 'dot';
let dots = [];
let lines = [];
let selected = null;

let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

let devices = [];
let currentDeviceIndex = 0;
let stream = null;

let frame = { x:0, y:0, w:0, h:0, ratio:1 };


// ---------------- CAMERA ----------------

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
    const s = await navigator.mediaDevices.getUserMedia({ video:true });
    attachStream(s);
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


// ---------------- FRAME ----------------

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

  currentRatioLabel.textContent =
    ratio===1.618 ? "Golden" : (Math.round(ratio*1000)/1000);
}


// ---------------- DRAWING ----------------

function drawMaskAndBorder(){
  ctx.fillStyle = 'rgba(0,0,0,0.45)';

  ctx.fillRect(0,0,canvas.width, frame.y);
  ctx.fillRect(0,frame.y+frame.h, canvas.width, canvas.height-(frame.y+frame.h));
  ctx.fillRect(0,frame.y, frame.x, frame.h);
  ctx.fillRect(frame.x+frame.w,frame.y, canvas.width-(frame.x+frame.w), frame.h);

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.strokeRect(frame.x+1.5, frame.y+1.5, frame.w-3, frame.h-3);
}

function redraw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawMaskAndBorder();

  // dots
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
    }

    else if (l.orientation==='horizontal'){
      ctx.moveTo(frame.x, l.y);
      ctx.lineTo(frame.x+frame.w, l.y);
    }

    else if (l.orientation==='slanted'){
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
    }

    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}


// ---------------- HIT TEST ----------------

function pointToSegmentDistance(px,py,x1,y1,x2,y2){
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq ? dot / lenSq : -1;

  let xx, yy;

  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }

  return Math.hypot(px - xx, py - yy);
}

function findLineAt(x,y){
  const threshold = 18;
  for (let i=0;i<lines.length;i++){
    const l = lines[i];

    if (l.orientation==='vertical'){
      if (Math.abs(x - l.x) < threshold &&
          y >= frame.y && y <= frame.y+frame.h){
        return i;
      }
    }

    else if (l.orientation==='horizontal'){
      if (Math.abs(y - l.y) < threshold &&
          x >= frame.x && x <= frame.x+frame.w){
        return i;
      }
    }

    else if (l.orientation==='slanted'){
      if (pointToSegmentDistance(x,y,l.x1,l.y1,l.x2,l.y2) < threshold){
        return i;
      }
    }
  }
  return null;
}


// ---------------- INPUT ----------------

canvas.addEventListener('pointerdown',(e)=>{
  const x = e.clientX;
  const y = e.clientY;

  lastPointerX = x;
  lastPointerY = y;

  // SELECT MODE
  if (mode === 'select'){
    const hit = findLineAt(x,y);
    if (hit !== null){
      selected = hit;
      deleteBtn.style.display = "inline-block";
      isDragging = true;
      redraw();
    } else {
      selected = null;
      deleteBtn.style.display = "none";
      redraw();
    }
    return;
  }

  // check normal selection (other modes)
  const hit = findLineAt(x,y);
  if (hit!==null){
    selected = hit;
    deleteBtn.style.display = "inline-block";
    isDragging = true;
    redraw();
    return;
  }

  selected = null;
  deleteBtn.style.display = "none";

  if (!(x>=frame.x && x<=frame.x+frame.w && y>=frame.y && y<=frame.y+frame.h))
    return;

  // --- Dot Mode ---
  if (mode==='dot'){
    dots.push({x,y});
    redraw();
    return;
  }

  // --- Vertical Mode ---
  if (mode==='vertical'){
    const cx = Math.max(frame.x, Math.min(frame.x+frame.w, x));
    lines.push({orientation:'vertical', x:cx});
    selected = lines.length-1;
    deleteBtn.style.display = "inline-block";
    redraw();
    return;
  }

  // --- Horizontal Mode ---
  if (mode==='horizontal'){
    const cy = Math.max(frame.y, Math.min(frame.y+frame.h, y));
    lines.push({orientation:'horizontal', y:cy});
    selected = lines.length-1;
    deleteBtn.style.display = "inline-block";
    redraw();
    return;
  }

  // --- SLANTED Mode ---
  if (mode==='slant'){
    const cx = Math.max(frame.x, Math.min(frame.x+frame.w, x));
    const cy = Math.max(frame.y, Math.min(frame.y+frame.h, y));

    const length = frame.w * 0.75;
    const angle = -Math.PI/4;

    const dx = Math.cos(angle) * length/2;
    const dy = Math.sin(angle) * length/2;

    lines.push({
      orientation:'slanted',
      x1: cx - dx,
      y1: cy - dy,
      x2: cx + dx,
      y2: cy + dy
    });

    selected = lines.length - 1;
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
  }
  else if (l.orientation==='horizontal'){
    l.y = Math.max(frame.y, Math.min(frame.y+frame.h, l.y + dy));
  }
  else if (l.orientation==='slanted'){
    l.x1 += dx; l.y1 += dy;
    l.x2 += dx; l.y2 += dy;
  }

  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  redraw();
});

canvas.addEventListener('pointerup',()=>{
  isDragging = false;
});


// ---------------- MODES ----------------

function setMode(m,id){
  mode = m;
  [dotBtn,vertBtn,horiBtn,slantBtn,selectBtn]
    .forEach(b=>b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

dotBtn.onclick = ()=> setMode('dot','dotBtn');
vertBtn.onclick = ()=> setMode('vertical','vertBtn');
horiBtn.onclick = ()=> setMode('horizontal','horiBtn');
slantBtn.onclick = ()=> setMode('slant','slantBtn');
selectBtn.onclick = ()=> setMode('select','selectBtn');


// ---------------- DELETE LINE ----------------

deleteBtn.onclick = ()=>{
  if (selected!==null){
    lines.splice(selected,1);
    selected = null;
    deleteBtn.style.display = "none";
    redraw();
  }
};


// ---------------- CAPTURE ----------------

captureBtn.onclick = ()=>{
  const tmp=document.createElement('canvas');
  tmp.width=canvas.width;
  tmp.height=canvas.height;
  const tctx=tmp.getContext('2d');

  tctx.drawImage(video,0,0,tmp.width,tmp.height);

  tctx.fillStyle='rgba(0,0,0,0.45)';
  tctx.fillRect(0,0,tmp.width, frame.y);
  tctx.fillRect(0,frame.y+frame.h, tmp.width, tmp.height-(frame.y+frame.h));
  tctx.fillRect(0,frame.y, frame.x, frame.h);
  tctx.fillRect(frame.x+frame.w,frame.y, tmp.width-(frame.x+frame.w), frame.h);

  tctx.strokeStyle='rgba(255,255,255,0.95)';
  tctx.lineWidth=3;
  tctx.strokeRect(frame.x+1.5,frame.y+1.5,frame.w-3,frame.h-3);

  dots.forEach(d=>{
    tctx.fillStyle="#4da3ff";
    tctx.beginPath(); tctx.arc(d.x,d.y,8,0,Math.PI*2);
    tctx.fill();
    tctx.strokeStyle="#fff";
    tctx.lineWidth=2;
    tctx.stroke();
  });

  lines.forEach(l=>{
    tctx.strokeStyle="lime";
    tctx.lineWidth=4;
    tctx.beginPath();

    if (l.orientation==='vertical'){
      tctx.moveTo(l.x,frame.y);
      tctx.lineTo(l.x,frame.y+frame.h);
    }
    else if (l.orientation==='horizontal'){
      tctx.moveTo(frame.x,l.y);
      tctx.lineTo(frame.x+frame.w,l.y);
    }
    else if (l.orientation==='slanted'){
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
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viewfinder.png';
    link.click();
  }
};


// ---------------- INIT ----------------

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
