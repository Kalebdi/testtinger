'use strict';

function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a}

// ── NAME GEN ─────────────────────────
const CH='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function N(){
  let s=CH[ri(0,CH.length-1)];
  for(let i=0;i<ri(2,6);i++) s+=CH[ri(0,CH.length-1)];
  return s;
}

// ── TOKEN ────────────────────────────
function tok(s){
  return s.split(/(\W)/).filter(Boolean);
}

// ── STRING BLOAT ─────────────────────
function bloat(s){
  let r=s;
  for(let i=0;i<ri(5,15);i++){
    r+=String.fromCharCode(ri(33,126));
  }
  return r;
}

// ── MAIN ─────────────────────────────
function obfuscate(code){

  const tokens = tok(code);

  const sm=new Map(),sa=[];
  function add(s){
    if(!sm.has(s)){sm.set(s,sa.length);sa.push(s)}
    return sm.get(s);
  }

  tokens.forEach(t=>{
    if(/^["'].*["']$/.test(t)) add(bloat(t.slice(1,-1)));
  });

  const key=ri(1,255);

  const enc=sa.map(s=>{
    let r='"';
    for(const c of s)
      r+='\\'+((c.charCodeAt(0)^key)&255).toString().padStart(3,'0');
    return r+'"';
  });

  const ST=N();

  const OPS={
    STR:1,
    EXEC:2,
    JMP:3,
    NOOP:4
  };

  let bc=[];

  // ── EXPAND TOKEN → MANY INSTR ──────
  tokens.forEach(t=>{
    let instr;

    if(/^["']/.test(t)){
      instr=[OPS.STR, sm.get(bloat(t.slice(1,-1)))||0];
    }else{
      instr=[OPS.EXEC, t];
    }

    // inject chaos
    bc.push([OPS.NOOP,0]);
    bc.push(instr);

    if(Math.random()<0.7) bc.push(instr);
    if(Math.random()<0.5) bc.push([OPS.NOOP,0]);

    if(Math.random()<0.4){
      bc.push([OPS.JMP, ri(1,50)]);
    }
  });

  // ── DUPLICATE MASSIVE ──────────────
  bc = bc.flatMap(x=>{
    const arr=[x];
    if(Math.random()<0.8) arr.push(x);
    if(Math.random()<0.5) arr.push([OPS.NOOP,0]);
    return arr;
  });

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
      pcall(function() loadstring(ins[2])() end)
    elseif op==3 then
      ${IP}=ins[2]
    end

    ${IP}=${IP}+1
  end`;

  // ── DEAD CODE HUGE ────────────────
  const dead = Array.from({length:100}).map(_=>`
    local ${N()}=${ri(100000,999999)}
  `).join('');

  // ── FAKE FUNCTIONS ────────────────
  const fake = Array.from({length:30}).map(_=>`
    function ${N()}()
      return ${ri(1,99999)}
    end
  `).join('');

  // ── REPEAT EXECUTION ──────────────
  const repeat=`
  for i=1,${ri(2,5)} do
    ${vm}
  end`;

  // ── BUILD BYTECODE ────────────────
  const arr = bc.map(i=>{
    if(typeof i[1]==='number')
      return `{${i[0]},${i[1]}}`;
    return `{${i[0]},"${i[1].replace(/"/g,'\\"')}"}`;
  });

  return `
  local ${ST}={${enc.join(',')}}
  ${decode}
  ${fake}
  local ${CODE}={${arr.join(',')}}
  ${dead}
  ${repeat}
  `.replace(/\s+/g,' ');
}

module.exports = { obfuscate };
