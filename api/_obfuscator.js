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

// ── STEALTH ENCODER ──────────────────
function encodeString(str){
  const k1 = ri(1,255);
  const k2 = ri(1,50);

  let arr = [];

  for(const c of str){
    let v = c.charCodeAt(0);
    v = (v ^ k1);
    v = (v + k2) % 256;
    arr.push(v);
  }

  arr.reverse();

  return {
    data: `{${arr.join(',')}}`,
    k1,
    k2
  };
}

// ── MAIN ─────────────────────────────
function obfuscate(code){

  const tokens = tok(code);

  const sm=new Map(), sa=[];
  function add(s){
    if(!sm.has(s)){
      sm.set(s,sa.length);
      sa.push(s);
    }
    return sm.get(s);
  }

  // collect strings
  tokens.forEach(t=>{
    if(/^["'].*["']$/.test(t)){
      add(t.slice(1,-1));
    }
  });

  // encode all strings
  const encodedStrings = sa.map(s=>{
    const e = encodeString(s);
    return `{{${e.data.slice(1,-1)}},${e.k1},${e.k2}}`;
  });

  const ST=N();
  const BX=N();

  // ── OPCODES ────────────────────────
  const OPS={
    PUSH:1,
    EXEC:2,
    COMBINE:3
  };

  let bc=[];

  tokens.forEach(t=>{
    if(/^["']/.test(t)){
      const idx = sm.get(t.slice(1,-1));
      bc.push([OPS.PUSH,idx]);
    }else{
      if(/^[a-zA-Z_]/.test(t)){
        bc.push([OPS.EXEC,t]);
      }
    }

    // chaos spam
    for(let i=0;i<3;i++){
      bc.push([OPS.PUSH,ri(0,sa.length-1)]);
      bc.push([OPS.COMBINE,0]);
    }
  });

  // ── DUPLICATE BYTECODE ─────────────
  bc = Array(10).fill(bc).flat();

  const CODE=N(), IP=N(), STACK=N();

  // ── BXOR SAFE ──────────────────────
  const bxor=`
  local function ${BX}(a,b)
    local r=0
    local bit=1
    while a>0 or b>0 do
      local aa=a%2
      local bb=b%2
      if aa~=bb then r=r+bit end
      a=(a-aa)/2
      b=(b-bb)/2
      bit=bit*2
    end
    return r
  end`;

  // ── DECODER STEALTH ───────────────
  const decode=`
  local function D(t)
    local data=t[1]
    local k1=t[2]
    local k2=t[3]
    local r=""
    for i=#data,1,-1 do
      local v=data[i]
      v=(v-k2)%256
      v=${BX}(v,k1)
      r=r..string.char(v)
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
      ${STACK}[#${STACK}+1]=D(${ST}[ins[2]+1] or {{} ,0,0})
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

  // ── DEAD CODE ─────────────────────
  const dead = Array.from({length:150}).map(_=>`
    local ${N()}=${ri(100000,999999)}
  `).join('');

  // ── FAKE FUNCTIONS ────────────────
  const fake = Array.from({length:40}).map(_=>`
    function ${N()}(x)
      if x then return x*${ri(2,9)} end
      return ${ri(100,999)}
    end
  `).join('');

  // ── REPEAT VM ─────────────────────
  const repeat=`
  for i=1,4 do
    ${vm}
  end`;

  const arr = bc.map(i=>{
    if(typeof i[1]==='number')
      return `{${i[0]},${i[1]}}`;
    return `{${i[0]},"${i[1].replace(/"/g,'\\"')}"}`;
  });

  let result = `
  local ${ST}={${encodedStrings.join(',')}}
  ${bxor}
  ${decode}
  ${fake}
  local ${CODE}={${arr.join(',')}}
  ${dead}
  ${repeat}
  `;

  // ── FINAL GIGA MULTIPLIER ─────────
  result = Array(6).fill(result).join(' ');

  return result.replace(/\s+/g,' ');
}

module.exports = { obfuscate };
