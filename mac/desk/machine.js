import { fingerCue } from "./engine.js";
import { createDeskAudio } from "./desk-audio.js";

const W = 1152;
const H = 720;
const media = name => new URL("./media/" + name, import.meta.url).href;
const fingerNames = ["left_little", "left_ring", "left_middle", "left_index", "left_thumb",
  "right_thumb", "right_index", "right_middle", "right_ring", "right_little"];

// Each row of the atlas contains the native leather shader at five pressures, first unlit,
// then lamplit. Each rectangle is registered in the 936 px-wide original glove pose.
const gloveRegions = [[62,40,97,164,0], [118,4,123,194,166], [181,0,134,209,362],
  [257,0,154,221,573], [327,61,156,177,796], [443,56,155,182,975],
  [505,0,168,209,1159], [602,0,136,211,1370], [693,11,110,186,1583], [769,47,107,159,1771]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function smooth(a, b, x) {
  const t = clamp((x-a)/(b-a), 0, 1);
  return t*t*(3-2*t);
}
function canvas(w, h) {
  const el = document.createElement("canvas");
  el.width = w; el.height = h;
  return el;
}
function loadImg(file, then) {
  const image = new Image();
  image.decoding = "async";
  image.onload = then;
  image.src = media(file + ".webp");
  return image;
}
const ready = image => image?.complete && image.naturalWidth > 0;

const keyPitch = W*.0445, rowPitch = H*.0568, diameter = Math.min(keyPitch*.90, rowPitch*1.03);
const keys = [];
function addKey(id, label, x, row, width = diameter, height = diameter) {
  keys.push({id, label, x:x*W, y:H*.559+row*rowPitch, width, height});
}
["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"].forEach((chars, row) => {
  [...chars].forEach((ch, i) => addKey(ch, ch.toUpperCase(), [.205,.226,.26,.288][row]+i*.0445, row));
});
addKey("⌫", "⌫", .803, 0, keyPitch*1.2);
addKey("left_little", "⇧", .219, 3, keyPitch*1.42);
addKey("right_little", "⇧", .772, 3, keyPitch*1.42);
addKey(" ", "", .505, 4, keyPitch*6.1, diameter*.84);

// Native typewriter_keycap.gdshader rendered at double scale for each physical key shape.
const capTiles=[[84,84,0],[123,84,84],[146,84,168],[625,71,252]];
function drawKey(ctx, key, lit, large, atlas) {
  const {x,y,width:w,height:h}=key;
  const variant=key.id===" " ? 3 : key.id==="⌫" ? 1 : key.label==="⇧" ? 2 : 0;
  const [sw,sh,sy]=capTiles[variant];
  ctx.drawImage(atlas,lit ? 625 : 0,sy,sw,sh,x-w/2,y-h/2,w,h);
  const label = key.id === "⌫" && lit ? "Delete" : key.label;
  const pts = Math.round(h*(large ? .61 : .54));
  ctx.fillStyle=lit ? "#2c1b0c" : "#f2e6c8";
  ctx.textAlign="center"; ctx.textBaseline="alphabetic";
  ctx.font=label==="Delete" ? "bold 12px sans-serif" : "bold "+pts+"px Courier, monospace";
  ctx.fillText(label,x,y+pts*.29);
  if (lit || key.id==="f" || key.id==="j") {
    const len=lit ? 9 : 5.5;
    ctx.fillStyle=lit ? "#43280e" : "#a59b82";
    ctx.fillRect(x-len/2,y+pts*.43,len,1.4);
  }
}
function rowsFor(text, max) {
  const rows=[];
  let rest=text;
  while (rest.length>max) {
    const stop=rest.lastIndexOf(" ",max-1);
    const count=stop < 0 ? max : stop+1;
    rows.push(rest.slice(0,count));
    rest=rest.slice(count);
  }
  rows.push(rest);
  return rows;
}
function pressAmount(age) {
  return smooth(-12,30,age)*(1-smooth(30,150,age));
}
function gloveAmount(age) {
  return smooth(0,57,age)*(1-smooth(80,235,age));
}
function normalizeKey(ch) {
  return ch==="Backspace" || ch==="Delete" ? "⌫" : ch;
}

export function mountMachine(stage) {
  const display=canvas(W,H), ctx=display.getContext("2d");
  display.className="desk-mechanism";
  display.setAttribute("aria-hidden","true");
  stage.append(display);
  const gloves=canvas(936,238), leather=gloves.getContext("2d");
  const keyboard=canvas(W,H), brightKeyboard=canvas(W,H);
  const audio=createDeskAudio();
  let mounted=true, frame=0, prevTime=0, layoutLarge;
  let view={line:"",typed:"",history:[],next:[],targets:[],selected:"",reducedMotion:false};
  let column=0, row=0, goalCol=0, goalRow=0, lastStroke=-1000, strikeKey="", feedAt=-1000;
  // Native machine coordinates are the lower middle 1152 × 720 of the larger office painting.
  // The drawing origin follows the case while the wood and paper continue up a tall viewport.
  let scene = {scale: 1, left: 0, top: 0, width: W, height: H};
  let latestField=[];
  let paperExit=false, paperEntry=-1000;
  const fingerPress=new Map(), keyPress=new Map();
  let litKeys=new Set(), litFingers=new Set();
  const art={};
  function wake() {
    if (mounted && !frame) frame=requestAnimationFrame(draw);
  }
  for (const name of ["paper","platen","gloves","finger-motion","cutouts","keycaps"]) art[name]=loadImg(name,wake);
  document.fonts?.load("46px 'Special Elite'").then(wake, () => {});
  const largeType=()=>!!view.large || scene.scale*W<530;
  function track() {
    const limit=largeType() ? 15 : 18;
    const lines=rowsFor(view.line,limit);
    goalRow=view.history.reduce((sum,s)=>sum+rowsFor(s,limit).length,0);
    goalCol=view.typed.length;
    for(const line of lines.slice(0,-1)) {
      if(goalCol<line.length) break;
      goalCol-=line.length;
      goalRow++;
    }
  }
  function resize() {
    const box=stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // A small overhang at phone widths preserves the entire keyboard with readable caps.
    // Pin the case to the lower edge as it sits in the original full office painting.
    const scale = Math.min(box.height / H, box.width / (W * .89));
    const width = Math.round(box.width * Math.min(window.devicePixelRatio || 1, 2, 2560 / box.width));
    const height = Math.max(1, Math.round(box.height * width / box.width));
    scene = {scale, left: (box.width - W * scale) / 2, top: box.height - H * scale,
      width: box.width, height: box.height};
    stage.style.setProperty("--surround-width", (W * 2 * scale) + "px");
    stage.style.setProperty("--surround-height", (H * 2 * scale) + "px");
    stage.style.setProperty("--wings-width", (H * 3.65 * scale) + "px");
    if (display.width !== width || display.height !== height) {
      display.width = width;
      display.height = height;
    }
    track();
    wake();
  }
  const observer=new ResizeObserver(resize);
  observer.observe(stage);

  function drawSheet(now) {
    const large=largeType(), reduced=view.reducedMotion;
    const pitch=large ? 23.6 : 19.5, lineStep=large ? 50 : 44, pts=large ? 39 : 32;
    const shift=reduced ? 0 : (3.5-column)*pitch;
    const x0=reduced ? W*.40 : W*.50-column*pitch-pitch*.5;
    const sheetX=W*.235+shift, sheetW=W*.53;
    const visibleTop = -scene.top / scene.scale;
    const feedDistance = H*.42 - visibleTop;
    const travel = reduced ? 0 : feedDistance * (paperExit ? -smooth(45,425,now-feedAt) : 1-smooth(0,280,now-paperEntry));
    const extraPaper = Math.min(-visibleTop * .78, H * 1.16);
    const top = H*.012 - extraPaper - row*lineStep + travel;
    const base = H*.304 + travel, bottom = H*.371 + Math.min(0,travel);
    const clipTop = Math.max(visibleTop, top);
    ctx.save();
    ctx.beginPath();ctx.rect(sheetX,clipTop,sheetW,Math.max(0,bottom-clipTop));ctx.clip();
    if(ready(art.paper) && bottom>top) {
      const paper=art.paper, sourceH=Math.min(paper.height,paper.height*(bottom-top)/(H*.44+(row+8)*lineStep));
      ctx.drawImage(paper,0,0,paper.width,sourceH,sheetX,top,sheetW,bottom-top);
    } else {
      ctx.fillStyle="#e8d5aa"; ctx.fillRect(sheetX,top,sheetW,bottom-top);
    }
    ctx.fillStyle="rgba(94,70,46,.23)";
    ctx.fillRect(sheetX+sheetW*.073,top+H*.05,sheetW*.854,1);
    ctx.fillStyle="rgba(94,70,46,.13)";
    ctx.fillRect(sheetX+sheetW*.073,top+H*.05+3,sheetW*.854,1);
    ctx.textBaseline="alphabetic";
    if (view.cover) {
      const center = sheetX + sheetW / 2;
      const titleY = top + (base - top) * .49;
      ctx.textAlign = "center";
      ctx.fillStyle = "#3c3025";
      ctx.font = (large ? 53 : 46) + "px 'Special Elite', Courier, monospace";
      ctx.fillText("The Scribe’s Desk", center, titleY, sheetW * .86);
      ctx.font = "bold " + (large ? 22 : 17) + "px Courier, monospace";
      ctx.fillStyle = "#73614c";
      ctx.fillText("ELIAS THORNE  ·  OAKHAVEN", center, titleY + (large ? 36 : 32), sheetW * .76);
    }
    if(view.correction) {
      ctx.fillStyle="#813b31";ctx.textAlign="left";ctx.font="bold 19px Courier, monospace";
      ctx.fillText("Lift the stray e with Delete.",sheetX+sheetW*.073,top+H*.168);
    }
    ctx.font="600 "+pts+"px Courier, Menlo, monospace";
    ctx.textAlign="center";
    let physicalRow=0;
    function paint(text,ink,cursor) {
      const y=base+(physicalRow-row)*lineStep;
      if(y>visibleTop && y<H*.322) for(let i=0;i<text.length;i++) {
        ctx.fillStyle=i<ink.length ? "#322921" : "#766850";
        const left=x0+i*pitch, glyph=i<ink.length ? ink[i] : text[i];
        ctx.fillText(glyph,left+pitch/2,y);
        if(cursor && physicalRow===goalRow && i===goalCol && !view.correction) {
          ctx.fillStyle="#795b38"; ctx.fillRect(left+pitch*.14,y+H*.007,pitch*.71,1.6);
          if(glyph===" ") {ctx.beginPath();ctx.arc(left+pitch*.5,y-pts*.22,1.8,0,Math.PI*2);ctx.fill();}
        }
        if(view.correction && cursor && i===0 && ink.length && physicalRow===goalRow) {
          ctx.strokeStyle="#823a30";ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(left+1,y+3);ctx.lineTo(left+pitch*.86,y-pts*.60);ctx.stroke();
        }
      }
      physicalRow++;
    }
    for(const old of view.history) for(const part of rowsFor(old,large?15:18)) paint(part,part,false);
    if(view.targets.length>1 && !view.selected) {
      [...view.targets].reverse().forEach((word,i,all)=>{
        const rightRow=physicalRow;
        physicalRow=goalRow-(all.length-i-1);paint(word,"",true);physicalRow=rightRow;
      });
    } else {
      let start=0;
      for(const part of rowsFor(view.line,large?15:18)) {
        paint(part,view.typed.slice(start,start+part.length),true);
        start+=part.length;
      }
    }
    ctx.restore();
    if (ready(art.platen)) ctx.drawImage(art.platen,W*.0625+shift,H*.258,W*.86875,H*.304);
    if (view.targets.length && ready(art.cutouts)) {
      const cw=art.cutouts.width/2,ch=art.cutouts.height;
      view.targets.forEach(word=>{
        const i=clamp(latestField.indexOf(word),0,1);
        const fraction=view.fieldLimit ? view.fieldTime/view.fieldLimit : 0;
        const swing=reduced ? 0 : Math.sin(fraction*Math.PI*2)*(i===0 ? .19 : -.16)*(view.selected===word ? .45 : 1);
        const ph=i===0 ? 77 : 67,pw=ph*cw/ch;
        ctx.save();ctx.translate(W*(i===0 ? .277 : .705)+shift,H*.390);ctx.rotate(swing);
        ctx.fillStyle="#b29153";ctx.fillRect(-.6,0,1.2,8+ph*.30);
        ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();
        ctx.drawImage(art.cutouts,cw*i,0,cw,ch,-pw/2,8,pw,ph);ctx.restore();
      });
    }
    if (strikeKey && strikeKey!==" " && strikeKey!=="⌫" && now-lastStroke<190 && !reduced) {
      const phase=(now-lastStroke)/190,reach=smooth(0,.23,phase)*(1-smooth(.28,1,phase));
      const fan=(strikeKey.codePointAt(0)%17-8)*4, hx=W*.5+fan,hy=H*.485;
      const tx=W*.5+fan*.6*(1-reach),ty=H*.461+(base-5-H*.461)*reach;
      ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(tx,ty);ctx.lineWidth=4.3;ctx.strokeStyle="#594a36";ctx.stroke();
      ctx.beginPath();ctx.moveTo(hx-1,hy);ctx.lineTo(tx-1,ty);ctx.lineWidth=1.3;ctx.strokeStyle="#c1ac85";ctx.stroke();
      ctx.fillStyle="#544530";ctx.fillRect(tx-4.5,ty-3.4,9,6.8);
    }
  }

  function drawGloves(now) {
    if(!ready(art.gloves)) return;
    leather.clearRect(0,0,gloves.width,gloves.height);
    leather.drawImage(art.gloves,0,0);
    if(ready(art["finger-motion"])) gloveRegions.forEach(([x,y,w,h,ay],i)=>{
      const name=fingerNames[i], lit=litFingers.has(name), age=now-(fingerPress.get(name) ?? -1000);
      if(!lit && age>=235) return;
      const pos=view.reducedMotion ? 0 : gloveAmount(age)*4;
      const frameA=Math.floor(pos), frameB=Math.min(4,frameA+1), offset=lit ? 5 : 0;
      leather.clearRect(x,y,w,h);
      leather.drawImage(art["finger-motion"],(offset+frameA)*w,ay,w,h,x,y,w,h);
      if(frameA!==frameB && pos>frameA) {
        leather.globalAlpha=pos-frameA;
        leather.drawImage(art["finger-motion"],(offset+frameB)*w,ay,w,h,x,y,w,h);
        leather.globalAlpha=1;
      }
    });
    const width=W*.64,scale=width/936;
    ctx.drawImage(gloves,W*.47-width/2,H*.808-(width*2/3)*.037,width,gloves.height*scale);
  }
  function paintKeys(now) {
    if(!ready(art.keycaps)) return;
    const large=largeType();
    if(layoutLarge!==large) {
      layoutLarge=large;
      for(const layer of [keyboard,brightKeyboard]) {
        const ink=layer.getContext("2d");
        ink.clearRect(0,0,W,H);
        for(const key of keys) drawKey(ink,key,layer===brightKeyboard,large,art.keycaps);
      }
    }
    const moving=now-lastStroke<150;
    if(!moving) ctx.drawImage(keyboard,0,0);
    for(const key of keys) {
      const age=now-(keyPress.get(key.id) ?? -1000),lit=litKeys.has(key.id);
      if(!moving && !lit) continue;
      const depression=age<150 ? pressAmount(age) : 0;
      const x=Math.floor(key.x-key.width/2),y=Math.floor(key.y-key.height/2);
      const w=Math.ceil(key.width)+2,h=Math.ceil(key.height)+2;
      const dw=w*(1-.035*depression), dh=h*(1-.035*depression);
      const travel=depression*(view.reducedMotion ? 1 : 4);
      ctx.drawImage(lit ? brightKeyboard : keyboard,x,y,w,h,x+(w-dw)/2,y+(h-dh)/2+travel,dw,dh);
    }
  }
  function draw(now) {
    frame=0;
    if(!mounted) return;
    const dt=Math.min(60,Math.max(0,now-(prevTime || now-16)))/1000;
    prevTime=now;
    const moving=Math.abs(goalCol-column)+Math.abs(goalRow-row)>.004;
    const t=view.reducedMotion ? 1 : (1-Math.exp(-dt*(Math.abs(goalRow-row)>.01?20:28)));
    if(now-lastStroke>42 || view.reducedMotion) {
      column+=t*(goalCol-column); row+=t*(goalRow-row);
      if(!moving) {column=goalCol;row=goalRow;}
    }
    const pixelX = display.width / scene.width, pixelY = display.height / scene.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.setTransform(pixelX * scene.scale, 0, 0, pixelY * scene.scale, pixelX * scene.left, pixelY * scene.top);
    drawSheet(now);paintKeys(now);drawGloves(now);
    if(moving || now-lastStroke<240 || (paperExit && now-feedAt<435) || now-paperEntry<290) wake();
  }
  resize();
  return {
    render(state) {
      const previousRow = goalRow, previousLine = view.line, previousLength = view.typed.length;
      if(paperExit && (state.correction || String(state.line ?? state.prompt ?? "")!==view.line)) {
        paperExit=false;paperEntry=performance.now();row=0;column=0;
      }
      view={...view,...state};
      view.line=String(state.line ?? state.prompt ?? view.line ?? "");
      view.history=Array.isArray(view.history) ? view.history : [];
      view.typed=String(view.typed ?? "");
      view.targets=Array.isArray(view.targets) ? view.targets : [];
      if(view.targets.length && (view.targets.some(x=>!latestField.includes(x)) || !latestField.length)) latestField=[...view.targets];
      if(!view.targets.length) latestField=[];
      const options=state.next ?? (state.expected ? [state.expected] : []);
      litKeys=new Set();litFingers=new Set();
      for(const value of options) {
        const cue=fingerCue(normalizeKey(value));
        if(cue.key) litKeys.add(cue.key);
        for(const f of cue.fingers) litFingers.add(f);
        if(cue.shift) {litKeys.add(cue.shift);litFingers.add(cue.shift);}
      }
      track();
      if (goalRow > previousRow && view.line === previousLine && view.typed.length === previousLength + 1) {
        audio.play("desk-line-feed");
      }
      wake();
    },
    strike(ch, {correct=true}={}) {
      const now=performance.now(), cue=fingerCue(normalizeKey(ch));
      lastStroke=now;strikeKey=cue.key;
      if(cue.key) keyPress.set(cue.key,now);
      for(const f of cue.fingers) if(!cue.eitherThumb || f==="right_thumb") fingerPress.set(f,now);
      if(cue.shift) {keyPress.set(cue.shift,now);fingerPress.set(cue.shift,now);}
      audio.play(correct ? "key" : "error");wake();
    },
    feed({sheet=false,filed=sheet}={}) {
      feedAt=performance.now();
      if(sheet && !view.reducedMotion) paperExit=true;
      audio.play(filed ? "desk-carriage" : "desk-line-feed");
      wake();
    },
    sound(enabled) {audio.toggle(enabled);},
    destroy() {mounted=false;observer.disconnect();cancelAnimationFrame(frame);audio.destroy();display.remove();},
  };
}
