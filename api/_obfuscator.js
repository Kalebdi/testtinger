'use strict';

function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a}

// ── RANDOM NAME ─────────────────────────────────────
const C='Il1O0o';
const USED=new Set();
function R(){
  let s='';
  do{
    s='';
    for(let i=0;i<ri(2,6);i++) s+=C[ri(0,C.length-1)];
  }while(USED.has(s));
  USED.add(s);
  return s;
}

// ── BASIC TOKENIZER ─────────────────────────────────
function tok(s){
  return s.split(/(\W)/).filter(Boolean);
}

// ── ENCODERS ────────────────────────────────────────
function encXOR(str,key){
  let r=[];
  for(const c of str) r.push(c.charCodeAt(0)^key);
  return r;
}

function encADD(arr,k){
  return arr.map(x=>x+k);
}

function encREV(arr){
  return arr.reverse();
}

// ── MAIN ────────────────────────────────────────────
function obfuscate(code){

  const tokens = tok(code);

  // ── STRING PROCESS ───────────────────────────────
  const sm=new Map(), sa=[];
  function add(s){
    if(!sm.has(s)){sm.set(s,sa.length);sa.push(s)}
    return sm.get(s);
  }

  tokens.forEach(t=>{
    if(/^["'].*["']$/.test(t)) add(t.slice(1,-1));
  });

  const key1=ri(1,255);
  const key2=ri(1,50);

  const encStrings = sa.map(s=>{
    let a=encXOR(s,key1);
    a=encADD(a,key2);
    a=encREV(a);
    return `{${a.join(',')}}`;
  });

  const ST=R();

  // ── BYTECODE BUILD ───────────────────────────────
  const OPS={
    STR:1,
    EXEC:2,
    JMP:3,
    NOOP:4
  };

  let bc=[];

  tokens.forEach(t=>{
    if(/^["']/.test(t)){
      bc.push([OPS.STR, sm.get(t.slice(1,-1))]);
    }else{
      bc.push([OPS.EXEC, t]);
    }
  });

  // polymorphic mutation
  bc = bc.flatMap(x=>{
    if(Math.random()<0.3){
      return [[OPS.NOOP,0],x];
    }
    return [x];
  });

  // random jumps
  for(let i=0;i<bc.length;i++){
    if(Math.random()<0.15){
      bc.splice(i,0,[OPS.JMP, ri(1,bc.length)]);
    }
  }

  // shuffle structure
  bc = bc.sort(()=>Math.random()-0.5);

  const CODE=R(), IP=R(), STACK=R();

  // ── DECODER ─────────────────────────────────────
  const decode=`
  local function D(t)
    local r=""
    for i=#t,1,-1 do
      r=r..string.char((t[i]-${key2})~${key1})
    end
    return r
  end`;

  // ── FAKE ENV ─────────────────────────────────────
  const fakeEnv=`
  local _ENV = setmetatable({},{
    __index=function(_,k)
      return _G[k]
    end
  })
  `;

  // ── VM EXECUTION ─────────────────────────────────
  const vm=`
  local ${IP}=1
  local ${STACK}={}
  while true do
    local ins=${CODE}[${IP}]
    if not ins then break end

    local op=ins[1]

    if op==${OPS.STR} then
      ${STACK}[#${STACK}+1]=D(${ST}[ins[2]+1])

    elseif op==${OPS.EXEC} then
      loadstring(ins[2])()

    elseif op==${OPS.JMP} then
      ${IP}=ins[2]

    end

    ${IP}=${IP}+1
  end
  `;

  // ── BUILD BYTECODE ARRAY ─────────────────────────
  const arr = bc.map(i=>{
    if(typeof i[1]==='number')
      return `{${i[0]},${i[1]}}`;
    return `{${i[0]},"${i[1].replace(/"/g,'\\"')}"}`;
  });

  // ── ANTI ANALYSIS ────────────────────────────────
  const anti=`
  if hookfunction or getgc or debug then return end
  `;

  // ── DEAD CODE GENERATOR ──────────────────────────
  const dead=Array.from({length:8}).map(_=>`
    local ${R()}=${ri(10000,99999)}
  `).join('');

  return `
  local ${ST}={${encStrings.join(',')}}
  ${decode}
  ${fakeEnv}
  ${anti}
  local ${CODE}={${arr.join(',')}}
  ${dead}
  ${vm}
  `.replace(/\s+/g,' ');
}

module.exports = { obfuscate };
