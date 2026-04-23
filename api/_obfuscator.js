'use strict';

function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a}

// ── NAME GEN ─────────────────────────
const CH='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function N(){
  let s=CH[ri(0,CH.length-1)];
  for(let i=0;i<ri(3,8);i++) s+=CH[ri(0,CH.length-1)];
  return s;
}

// ── TOKEN ────────────────────────────
function tok(s){
  return s.split(/(\W)/).filter(Boolean);
}

// ── STRING BLOAT ─────────────────────
function bloat(s){
  let r=s;
  for(let i=0;i<50;i++){
    r+=String.fromCharCode(ri(33,126));
  }
  return r;
}

// ── MAIN ─────────────────────────────
function obfuscate(code){

  const tokens = tok(code);

  // ── STRING TABLE ───────────────────
  const sm=new Map(), sa=[];
  function add(s){
    if(!sm.has(s)){
      sm.set(s,sa.length);
      sa.push(s);
    }
    return sm.get(s);
  }

  tokens.forEach(t=>{
    if(/^["'].*["']$/.test(t)){
      const b=bloat(t.slice(1,-1));
      add(b);
    }
  });

  const key=ri(1,255);

  const enc=sa.map(s=>{
    let r='"';
    for(const c of s){
      r+='\\'+((c.charCodeAt(0)^key)&255).toString().padStart(3,'0');
    }
    return r+'"';
  });

  const ST=N();

  // ── OPCODES ────────────────────────
  const OPS={
    PUSH:1,
    EXEC:2,
    COMBINE:3
  };

  let bc=[];

  // ── BUILD BYTECODE ─────────────────
  tokens.forEach(t=>{
    if(/^["']/.test(t)){
      const b=bloat(t.slice(1,-1));
      const idx=add(b);

      bc.push([OPS.PUSH,idx]);
      bc.push([OPS.PUSH,idx]);
      bc.push([OPS.COMBINE,0]);
    }else{
      if(/^[a-zA-Z_]/.test(t)){
        bc.push([OPS.EXEC,t]);
      }
    }

    // chaos spam
    for(let i=0;i<5;i++){
      bc.push([OPS.PUSH,ri(0,sa.length-1)]);
      bc.push([OPS.COMBINE,0]);
    }
  });

  // ── DUPLICATE BYTECODE (GIGA) ──────
  bc = Array(20).fill(bc).flat();

  const CODE=N(), IP=N(), STACK=N();

  // ── DECODER ───────────────────────
  const decode=`
  local function D(s)
    local r=""
    for i=1,#s do
      r=r..string.char((string.byte(s,i)~${key}))
    end
    return r
  end`;

  // ── VM ────────────────────────────
  const vm=`
  local ${IP}=1
  local ${STACK}={}
  while true do
    local ins=${CODE}[${IP}]
    if not ins then break end

    local op=ins[1]

    if op==1 then
      ${STACK}[#${STACK}+1]=D(${ST}[ins[2]+1] or "")
    elseif op==2 then
      local f=loadstring(ins[2])
      if f then pcall(f) end
    elseif op==3 then
      local a=${STACK}[#${STACK}] or ""
      ${STACK}[#${STACK}]=nil
      local b=${STACK}[#${STACK}] or ""
      ${STACK}[#${STACK}]=b..a
    end

    ${IP}=${IP}+1
  end`;

  // ── DEAD CODE (SUPER BANYAK) ──────
  const dead = Array.from({length:500}).map(_=>`
    local ${N()}=${ri(100000,999999)}
  `).join('');

  // ── FAKE FUNCTIONS ────────────────
  const fake = Array.from({length:100}).map(_=>`
    function ${N()}()
      local x=${ri(1,9999)}
      return x*${ri(2,9)}
    end
  `).join('');

  // ── REPEAT VM ─────────────────────
  const repeat=`
  for i=1,10 do
    ${vm}
  end`;

  const arr = bc.map(i=>{
    if(typeof i[1]==='number')
      return `{${i[0]},${i[1]}}`;
    return `{${i[0]},"${i[1].replace(/"/g,'\\"')}"}`;
  });

  let result = `
  local ${ST}={${enc.join(',')}}
  ${decode}
  ${fake}
  local ${CODE}={${arr.join(',')}}
  ${dead}
  ${repeat}
  `;

  // ── FINAL MULTIPLIER (GIGA BANGET) ─
  result = Array(10).fill(result).join(' ');

  return result.replace(/\s+/g,' ');
}

module.exports = { obfuscate };
