'use strict';
const crypto = require('crypto');

// Utilities
function randomBytes(n) {
  try { return [...crypto.randomBytes(n)]; }
  catch { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return [...b]; }
}
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function v()  { let n='_'; for(let i=0;i<6;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }
function v2() { let n='_'; for(let i=0;i<9;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }

// Arith
function Arith(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return `${n}`;
  if (n < -2147483648 || n > 2147483647) return `${n}`;
  const a = ri(1, 999), b = ri(1, 99), t = ri(0, 15);
  switch (t) {
    case 0: return `(${n + a} - ${a})`;
    case 1: return `(${a} - (${a - n}))`;
    case 2: return `(${n + a + b} - (${a + b}))`;
    case 3: return `(${n * a} / ${a})`;
    case 4: return `(function() return ${n + a} - ${a} end)()`;
    case 5: return `(function() local _v = ${n + a} return _v - ${a} end)()`;
    case 6: if (n>=0) { const k=ri(1,0x7FFF); return `bit32.bxor(bit32.bxor(${n}, ${k}), ${k})`; } return `(${n + a} - ${a})`;
    case 7: if (n>=0) return `bit32.band(${n + a} - ${a}, 4294967295)`; return `(${n + a} - ${a})`;
    case 8: if (n>=0) return `bit32.bxor(${n + a} - ${a}, 0)`; return `(${n + a} - ${a})`;
    case 9: return `(${n + a + b} - (${b + a}))`;
    case 10: return `(select(2, false, ${n + a} - ${a}))`;
    case 11: if (n>=0) return `(math.abs(${n + a}) - ${a})`; return `(${n + a} - ${a})`;
    case 12: return `(true and (${n + a} - ${a}) or ${n})`;
    case 13: if (n>=0 && n<=0xFFFF) { const sh=ri(1,8); return `bit32.rshift(bit32.lshift(${n}, ${sh}), ${sh})`; } return `(${n + a} - ${a})`;
    case 14: if (n>=0 && n<=30) return `(#"${'x'.repeat(n)}")`; return `(${n + a} - ${a})`;
    case 15: return `(math.floor((${n + a} - ${a}) / 1))`;
    default: return `${n}`;
  }
}
const A = Arith;

function luaStr(bytes) {
  let s = '"';
  for (const b of bytes) s += '\\' + String(b).padStart(3, '0');
  return s + '"';
}

function xorStr(s) {
  const key = randomBytes(s.length).map(b => (b & 0x7F) || 1);
  const enc = [...s].map((c,i) => (c.charCodeAt(0) ^ key[i]) & 0xFF);
  const vT=v(), vK=v(), vO=v(), vI=v();
  return `(function() local ${vT}={${enc.map(A)}} local ${vK}={${key.map(A)}} local ${vO}={} for ${vI}=1,#${vT} do ${vO}[${vI}]=string.char(bit32.bxor(${vT}[${vI}], ${vK}[${vI}])) end return table.concat(${vO}) end)()`;
}

function rc4(data, key) {
  const s = Array.from({length:256},(_,i)=>i); let j=0;
  for(let i=0;i<256;i++){ j=(j+s[i]+key[i%key.length])%256; [s[i],s[j]]=[s[j],s[i]]; }
  let ci=0; j=0;
  return data.map(b=>{ ci=(ci+1)%256; j=(j+s[ci])%256; [s[ci],s[j]]=[s[j],s[ci]]; return b^s[(s[ci]+s[j])%256]; });
}
function xorLayer(data, key) {
  return data.map((b,i) => b ^ ((key[i%key.length] ^ ((i*163)&0xFF)) & 0xFF));
}
function lcg(s) { return ((s*1664525+1013904223)>>>0); }
function blockShuffle(data, nBlocks, seed) {
  const bSz=Math.ceil(data.length/nBlocks), blocks=[];
  for(let i=0;i<nBlocks;i++){ const sl=data.slice(i*bSz,(i+1)*bSz); if(sl.length) blocks.push(sl); }
  const n=blocks.length, perm=Array.from({length:n},(_,i)=>i); let s=seed;
  for(let i=n-1;i>0;i--){ s=lcg(s); const j=s%(i+1); [perm[i],perm[j]]=[perm[j],perm[i]]; }
  return { shuffled:perm.map(idx=>blocks[idx]), perm, n };
}

function makeOpcodeTable() {
  const names = [
    'LOAD_CONST','LOAD_VAR','STORE_VAR','GET_GLOBAL','SET_GLOBAL',
    'CALL','CALL_METHOD','RETURN','LOAD_NIL','LOAD_TRUE','LOAD_FALSE','LOAD_NUMBER',
    'BINARY_ADD','BINARY_SUB','BINARY_MUL','BINARY_DIV','BINARY_MOD','BINARY_POW',
    'BINARY_CONCAT','BINARY_EQ','BINARY_NE','BINARY_LT','BINARY_LE',
    'BINARY_AND','BINARY_OR','BINARY_XOR','BINARY_SHL','BINARY_SHR',
    'UNARY_NOT','UNARY_NEG','UNARY_LEN','UNARY_BNOT',
    'JUMP','JUMP_IF_FALSE','JUMP_IF_TRUE','MAKE_TABLE','TABLE_GET','TABLE_SET',
    'FOR_PREP','FOR_STEP'
  ];
  const used=new Set(), ids=[];
  while(ids.length<names.length){ const x=ri(1,200); if(!used.has(x)){ ids.push(x); used.add(x); } }
  const T={}; names.forEach((n,i)=>{ T[n]=ids[i]; });
  const fakes=[];
  while(fakes.length<12){ const x=ri(210,300); if(!used.has(x)){ fakes.push(x); used.add(x); } }
  T._fakes=fakes; return T;
}

function junk(n) {
  const lines=[];
  for(let i=0;i<n;i++){
    const a=v(),b=v(),t=ri(0,5);
    switch(t){
      case 0: lines.push(`local ${a}=${A(ri(1,999))} local ${b}=${a}+${A(0)}-${A(0)}`); break;
      case 1: lines.push(`local ${a}={} ${a}=nil`); break;
      case 2: lines.push(`local ${a}=type(nil) local ${b}=#${a}`); break;
      case 3: lines.push(`do local ${a}=${A(ri(1,99))} local ${b}=${a}*${A(1)} end`); break;
      case 4: lines.push(`if false then local ${a}=${A(ri(1,99))} end`); break;
      case 5: lines.push(`local ${a}=bit32.bxor(${A(ri(1,127))},${A(0)})`); break;
    }
  }
  for(let i=lines.length-1;i>0;i--){ const j=ri(0,i); [lines[i],lines[j]]=[lines[j],lines[i]]; }
  return lines.join(' ');
}

// Lexer (sederhana)
function lex(src) {
  const tokens=[]; let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){ i++; continue; }
    if(src.slice(i,i+2)==='--'){ while(i<src.length && src[i]!=='\n') i++; continue; }
    if(src[i]==='"' || src[i]==="'"){
      const q=src[i]; let s=''; i++;
      while(i<src.length && src[i]!==q){
        if(src[i]==='\\'){ i++; s+=src[i]||''; i++; }
        else { s+=src[i++]; }
      }
      i++; tokens.push({t:'STRING',v:s}); continue;
    }
    if(/[0-9]/.test(src[i])){
      let s='';
      while(/[0-9.]/.test(src[i]||'')) s+=src[i++];
      tokens.push({t:'NUMBER',v:parseFloat(s)}); continue;
    }
    if(/[a-zA-Z_]/.test(src[i])){
      let s='';
      while(/[a-zA-Z0-9_]/.test(src[i]||'')) s+=src[i++];
      tokens.push({t:'NAME',v:s}); continue;
    }
    tokens.push({t:'OP',v:src[i]}); i++;
  }
  tokens.push({t:'EOF',v:''}); return tokens;
}

// Compiler sederhana (hanya LOAD_CONST, CALL, RETURN)
function compileBC(tokens, OPC) {
  let pos=0;
  const ins=[], consts=[], scopes=[{}];
  let nSlot=0;
  const pk=()=>tokens[pos], nx=()=>tokens[pos++], ck=v=>tokens[pos]?.v===v, eof=()=>!tokens[pos]||tokens[pos].t==='EOF';
  function eat(v){ if(ck(v)) nx(); else nx(); }
  function addC(val){ let i=consts.indexOf(val); if(i===-1){ i=consts.length; consts.push(val); } return i; }
  function emit(op,a,b){ ins.push({op,a:a??0,b:b??0}); return ins.length-1; }
  function patch(i,val){ ins[i].a=val; }
  function declareVar(name){ const s=nSlot++; scopes[scopes.length-1][name]=s; return s; }
  function resolveVar(name){
    for(let i=scopes.length-1;i>=0;i--) if(scopes[i][name]!==undefined) return scopes[i][name];
    return null;
  }
  function pExpr(){
    const t=pk();
    if(t.t==='NUMBER'){ nx(); emit(OPC.LOAD_NUMBER, t.v); }
    else if(t.t==='STRING'){ nx(); emit(OPC.LOAD_CONST, addC(t.v)); }
    else if(t.t==='NAME'){
      nx(); const slot=resolveVar(t.v);
      if(slot!==null) emit(OPC.LOAD_VAR, slot);
      else emit(OPC.GET_GLOBAL, addC(t.v));
    }
    else if(ck('(')){ nx(); pExpr(); eat(')'); }
    else nx();
  }
  function pBlock(){
    while(!eof()){
      if(pk().t==='EOF') break;
      const t=pk();
      if(t.t==='NAME' && t.v==='local'){ nx(); const name=nx().v; declareVar(name); if(ck('=')){ nx(); pExpr(); emit(OPC.STORE_VAR, resolveVar(name)); } }
      else { pExpr(); }
      if(ck(';')) nx();
    }
  }
  pBlock();
  emit(OPC.RETURN,0);
  return {ins, consts};
}

function injectFakes(ins, fakeIds){
  const out=[];
  for(const inst of ins){
    if(Math.random()<0.25) out.push({op:fakeIds[ri(0,fakeIds.length-1)], a:ri(0,100), b:0});
    out.push(inst);
  }
  return out;
}

function serialize(ins, consts){
  const bytes=[];
  const u8=n=>bytes.push(n&0xFF);
  const i16=n=>{ const x=n&0xFFFF; bytes.push(x&0xFF, (x>>8)&0xFF); };
  const i32=n=>{ const x=n>>>0; bytes.push(x&0xFF, (x>>8)&0xFF, (x>>16)&0xFF, (x>>24)&0xFF); };
  const f64=f=>{ const dv=new DataView(new ArrayBuffer(8)); dv.setFloat64(0,f,false); for(let i=0;i<8;i++) bytes.push(dv.getUint8(i)); };
  const str=s=>{ const e=[...s].map(c=>c.charCodeAt(0)&0xFF); i16(e.length); for(const b of e) u8(b); };
  [0x53,0x4C,0x49,0x42].forEach(u8); u8(1); i16(consts.length);
  for(const c of consts){
    if(typeof c==='string'){ u8(1); str(c); }
    else if(typeof c==='number'){ u8(2); f64(c); }
    else if(typeof c==='boolean'){ u8(3); u8(c?1:0); }
    else u8(0);
  }
  i32(ins.length);
  for(const inst of ins){
    u8(inst.op);
    if(inst.a===0) u8(0);
    else if(Number.isInteger(inst.a) && inst.a>=-32768 && inst.a<=32767){ u8(1); i16(inst.a); }
    else if(Number.isInteger(inst.a)){ u8(2); i32(inst.a); }
    else if(typeof inst.a==='number'){ u8(3); f64(inst.a); }
    else u8(0);
    if(inst.b===0) u8(0);
    else if(Number.isInteger(inst.b) && inst.b>=0 && inst.b<=65535){ u8(1); i16(inst.b); }
    else u8(0);
  }
  return bytes;
}

// ----------------------------------------------------------------------
// EMIT VM YANG SUDAH BERSIH (tanpa pengecekan executor berlebih)
// ----------------------------------------------------------------------
function emitVM(shuffleResult, rc4Key, xorKey, rawChecksum, OPC) {
  const vEnv=v2(), vVars=v2(), vStk=v2(), vTop=v2(), vIns=v2(), vCons=v2();
  const vMask=v2(), vSip=v2(), vRun=v2(), vCur=v2(), vOp=v2(), vA=v2(), vB=v2();
  const vU8=v2(), vI16=v2(), vI32=v2(), vStr=v2(), vData=v2(), vIdx=v2();
  const vS=v2(), vRI=v2(), vRJ=v2(), vRKey=v2();
  const vXKey=v2(), vDec=v2(), vBlks=v2(), vPerm=v2(), vPay=v2();
  const vCs=v2(), vChk=v2();
  const vK1=v(), vK2=v(), vK3=v(), vX1=v(), vX2=v();
  const vGenv=v2();

  const xGS=xorStr('GetService'), xPl=xorStr('Players'), xLP=xorStr('LocalPlayer');
  const xKk=xorStr('Kick'), xKm=xorStr('Security violation.');
  const xInst=xorStr('Instance'), xDM=xorStr('DataModel');

  const csOff = ri(1,99999);
  const csExpr = `${rawChecksum+csOff}-${csOff}`;
  const kL=rc4Key.length, kM1=Math.floor(kL/3), kM2=Math.floor(kL*2/3);
  const xL=xorKey.length, xM=Math.floor(xL/2);
  const ipMask=ri(0x1000,0xFFFF);

  const fragVars=[], fragDecls=[];
  for(let i=0;i<shuffleResult.n;i++){
    const vn=v2(); fragVars.push(vn);
    fragDecls.push(`local ${vn}=${luaStr(shuffleResult.shuffled[i])}`);
  }

  const fakeBranches=OPC._fakes.slice(0,6).map(fop=>{
    const d=v(), e=v();
    return `elseif ${vOp}==${A(fop)} then local ${d}=${A(0)} local ${e}=${d}`;
  }).join(' ');

  return `return (function(...)
local ${vEnv}=(getfenv and getfenv(1)) or _ENV or _G
local function _kick() while true do end end
local _ei=${xInst} local _ed=${xDM}
if not(typeof~=nil and typeof(game)==_ei and game.ClassName==_ed) then return end
_ei=nil _ed=nil
local ${vGenv}=(getgenv and getgenv()) or _G
${junk(3)}
${fragDecls.join(' ')}
local ${vPerm}={${shuffleResult.perm.join(',')}}
local ${vBlks}={} local _fv={${fragVars.join(',')}}
for ${vIdx}=1,#${vPerm} do ${vBlks}[${vPerm}[${vIdx}]+1]=_fv[${vIdx}] end
local ${vPay}=table.concat(${vBlks})
_fv=nil ${vBlks}=nil ${vPerm}=nil ${fragVars.map(n=>`${n}=nil`).join(' ')}
${junk(2)}
local ${vX1}=${luaStr(xorKey.slice(0,xM))}
local ${vX2}=${luaStr(xorKey.slice(xM))}
local ${vXKey}=${vX1}..${vX2} ${vX1}=nil ${vX2}=nil
local ${vDec}={} do
  local _kl=#${vXKey}
  for ${vIdx}=1,#${vPay} do
    local _xb=string.byte(${vXKey},(${vIdx}-1)%_kl+1)
    local _xm=bit32.band(bit32.bxor(_xb,bit32.band((${vIdx}-1)*163,255)),255)
    ${vDec}[${vIdx}]=string.char(bit32.bxor(string.byte(${vPay},${vIdx}),_xm))
  end
end
${vPay}=nil ${vXKey}=nil
local _xd=table.concat(${vDec}) ${vDec}=nil
${junk(2)}
local ${vK1}=${luaStr(rc4Key.slice(0,kM1))}
local ${vK2}=${luaStr(rc4Key.slice(kM1,kM2))}
local ${vK3}=${luaStr(rc4Key.slice(kM2))}
local ${vRKey}=${vK1}..${vK2}..${vK3} ${vK1}=nil ${vK2}=nil ${vK3}=nil
local ${vS}={} for ${vIdx}=0,255 do ${vS}[${vIdx}]=${vIdx} end
local ${vRJ}=0 local _rkl=#${vRKey}
for ${vIdx}=0,255 do
  ${vRJ}=(${vRJ}+${vS}[${vIdx}]+string.byte(${vRKey},(${vIdx}%_rkl)+1))%256
  ${vS}[${vIdx}],${vS}[${vRJ}]=${vS}[${vRJ}],${vS}[${vIdx}]
end
${vRKey}=nil
local ${vRI}=0 ${vRJ}=0 local _r2={}
for ${vIdx}=1,#_xd do
  ${vRI}=(${vRI}+1)%256 ${vRJ}=(${vRJ}+${vS}[${vRI}])%256
  ${vS}[${vRI}],${vS}[${vRJ}]=${vS}[${vRJ}],${vS}[${vRI}]
  _r2[${vIdx}]=string.char(bit32.bxor(string.byte(_xd,${vIdx}),${vS}[(${vS}[${vRI}]+${vS}[${vRJ}])%256]))
end
_xd=nil ${vS}=nil
local ${vData}=table.concat(_r2) _r2=nil
${junk(2)}
local ${vCs}=${csExpr}
local ${vChk}=0x1337
for ${vIdx}=1,#${vData} do
  ${vChk}=bit32.band(${vChk}*31+string.byte(${vData},${vIdx}),4294967295)
end
if ${vChk}~=${vCs} then _kick() return end
${vChk}=nil ${vCs}=nil
local _ip=1
local function ${vU8}() local _b=string.byte(${vData},_ip) _ip=_ip+1 return _b or 0 end
local function ${vI16}() return ${vU8}()+${vU8}()*256 end
local function ${vI32}() return ${vU8}()+${vU8}()*256+${vU8}()*65536+${vU8}()*16777216 end
local function ${vStr}() local _n=${vI16}() local _t={} for ${vIdx}=1,_n do _t[${vIdx}]=string.char(${vU8}()) end return table.concat(_t) end
local _mg={${vU8}(),${vU8}(),${vU8}(),${vU8}()}
if _mg[1]~=83 or _mg[2]~=76 or _mg[3]~=73 or _mg[4]~=66 then _kick() return end
${vU8}()
local ${vCons}={} for ${vIdx}=1,${vI16}() do
  local _ct=${vU8}()
  if _ct==1 then ${vCons}[${vIdx}]=${vStr}()
  elseif _ct==2 then local _fb={} for _k=1,8 do _fb[_k]=${vU8}() end local _ok,_fv=pcall(string.unpack,">d",string.char(table.unpack(_fb))) ${vCons}[${vIdx}]=_ok and _fv or 0
  elseif _ct==3 then ${vCons}[${vIdx}]=${vU8}()==1
  else ${vCons}[${vIdx}]=nil end
end
local ${vIns}={} for ${vIdx}=1,${vI32}() do
  local _op=${vU8}() local _at=${vU8}() local _av=0
  if _at==1 then local _lo=${vU8}() local _hi=${vU8}() _av=_lo+_hi*256 if _av>=32768 then _av=_av-65536 end
  elseif _at==2 then _av=${vI32}()
  elseif _at==3 then local _fb={} for _k=1,8 do _fb[_k]=${vU8}() end local _ok,_fv=pcall(string.unpack,">d",string.char(table.unpack(_fb))) _av=_ok and _fv or 0 end
  local _bt=${vU8}() local _bv=0
  if _bt==1 then local _lo=${vU8}() local _hi=${vU8}() _bv=_lo+_hi*256 end
  ${vIns}[${vIdx}]={_op,_av,_bv}
end
${vData}=nil
${junk(3)}
local ${vStk}={} local ${vTop}=0
local ${vVars}={}
local ${vMask}=${A(ipMask)}
local ${vSip}=bit32.bxor(1,${vMask})
local ${vRun}=true
while ${vRun} do
  local _rip=bit32.bxor(${vSip},${vMask})
  if _rip>#${vIns} then break end
  local ${vCur}=${vIns}[_rip]
  local ${vOp}=${vCur}[1] local ${vA}=${vCur}[2] local ${vB}=${vCur}[3]
  ${vSip}=bit32.bxor(_rip+1,${vMask})
  if ${vOp}==${A(OPC.LOAD_CONST)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vCons}[${vA}+1]
  elseif ${vOp}==${A(OPC.LOAD_NUMBER)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vA}
  elseif ${vOp}==${A(OPC.LOAD_NIL)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil
  elseif ${vOp}==${A(OPC.LOAD_TRUE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=true
  elseif ${vOp}==${A(OPC.LOAD_FALSE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=false
  elseif ${vOp}==${A(OPC.LOAD_VAR)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vVars}[${vA}]
  elseif ${vOp}==${A(OPC.STORE_VAR)} then ${vVars}[${vA}]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
  elseif ${vOp}==${A(OPC.GET_GLOBAL)} then
    local _k=${vCons}[${vA}+1] local _gv=${vEnv}[_k] if _gv==nil then _gv=_G[_k] end
    ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_gv
  elseif ${vOp}==${A(OPC.SET_GLOBAL)} then
    local _v=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    ${vEnv}[_k]=_v
  elseif ${vOp}==${A(OPC.CALL)} then
    local _args={} for _k=${vA},1,-1 do _args[_k]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 end
    local _fn=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if type(_fn)=="function" then local _ok,_r=pcall(_fn,table.unpack(_args)) ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_ok and _r or nil
    else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil end
  elseif ${vOp}==${A(OPC.CALL_METHOD)} then
    local _args={} for _k=${vA},1,-1 do _args[_k]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 end
    local _m=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _obj=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if type(_obj)=="table" and type(_obj[_m])=="function" then local _ok,_r=pcall(_obj[_m],_obj,table.unpack(_args)) ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_ok and _r or nil
    else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil end
  elseif ${vOp}==${A(OPC.RETURN)} then ${vRun}=false
  elseif ${vOp}==${A(OPC.JUMP)} then ${vSip}=bit32.bxor(${vA},${vMask})
  elseif ${vOp}==${A(OPC.JUMP_IF_FALSE)} then
    local _c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if not _c then ${vSip}=bit32.bxor(${vA},${vMask}) end
  elseif ${vOp}==${A(OPC.JUMP_IF_TRUE)} then
    local _c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if _c then ${vSip}=bit32.bxor(${vA},${vMask}) end
  elseif ${vOp}==${A(OPC.BINARY_ADD)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]+_b
  elseif ${vOp}==${A(OPC.BINARY_SUB)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]-_b
  elseif ${vOp}==${A(OPC.BINARY_MUL)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]*_b
  elseif ${vOp}==${A(OPC.BINARY_DIV)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]/_b
  elseif ${vOp}==${A(OPC.BINARY_MOD)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]%_b
  elseif ${vOp}==${A(OPC.BINARY_POW)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]^_b
  elseif ${vOp}==${A(OPC.BINARY_CONCAT)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=tostring(${vStk}[${vTop}])..tostring(_b)
  elseif ${vOp}==${A(OPC.BINARY_EQ)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]==_b
  elseif ${vOp}==${A(OPC.BINARY_NE)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]~=_b
  elseif ${vOp}==${A(OPC.BINARY_LT)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]<_b
  elseif ${vOp}==${A(OPC.BINARY_LE)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]<=_b
  elseif ${vOp}==${A(OPC.BINARY_AND)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.band(${vStk}[${vTop}],_b)
  elseif ${vOp}==${A(OPC.BINARY_OR)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.bor(${vStk}[${vTop}],_b)
  elseif ${vOp}==${A(OPC.BINARY_XOR)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.bxor(${vStk}[${vTop}],_b)
  elseif ${vOp}==${A(OPC.BINARY_SHL)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.lshift(${vStk}[${vTop}],_b)
  elseif ${vOp}==${A(OPC.BINARY_SHR)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.rshift(${vStk}[${vTop}],_b)
  elseif ${vOp}==${A(OPC.UNARY_NOT)} then ${vStk}[${vTop}]=not ${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_NEG)} then ${vStk}[${vTop}]=-${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_LEN)} then ${vStk}[${vTop}]=#${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_BNOT)} then ${vStk}[${vTop}]=bit32.bnot(${vStk}[${vTop}])
  elseif ${vOp}==${A(OPC.MAKE_TABLE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]={}
  elseif ${vOp}==${A(OPC.TABLE_GET)} then
    local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _t=${vStk}[${vTop}] ${vStk}[${vTop}]=type(_t)=="table" and _t[_k] or nil
  elseif ${vOp}==${A(OPC.TABLE_SET)} then
    local _v=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if type(${vStk}[${vTop}])=="table" then ${vStk}[${vTop}][_k]=_v end
  elseif ${vOp}==${A(OPC.FOR_PREP)} then
    local _step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _lim=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _init=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    ${vVars}[${vA}]=_init ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_step
  elseif ${vOp}==${A(OPC.FOR_STEP)} then
    local _step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _lim=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local _cur=${vVars}[${vA}]+_step ${vVars}[${vA}]=_cur
    if (_step>0 and _cur>_lim) or (_step<0 and _cur<_lim) then ${vSip}=bit32.bxor(${vB},${vMask})
    else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_step end
  ${fakeBranches}
  else end
end
end)(...)`;
}

// ----------------------------------------------------------------------
// Main obfuscator
// ----------------------------------------------------------------------
function obfuscate(code) {
  try {
    const OPC = makeOpcodeTable();
    let compiled;
    try {
      compiled = compileBC(lex(code), OPC);
    } catch(e) {
      compiled = { ins: [{op:OPC.LOAD_CONST, a:0}, {op:OPC.CALL, a:0}, {op:OPC.RETURN, a:0}], consts: [code] };
    }
    compiled.ins = injectFakes(compiled.ins, OPC._fakes);
    const rawBytes = serialize(compiled.ins, compiled.consts);
    let cs = 0x1337;
    for (const b of rawBytes) cs = ((cs * 31 + b) & 0xFFFFFFFF) >>> 0;
    const rawChecksum = cs >>> 0;
    const rc4Key = randomBytes(ri(16,24));
    const xorKey = randomBytes(ri(10,16));
    const nBlocks = ri(12,20);
    const seed = ri(0x1000, 0xFFFFFFFF);
    const rc4Bytes = rc4(rawBytes, rc4Key);
    const xorBytes = xorLayer(rc4Bytes, xorKey);
    const shuffled = blockShuffle(xorBytes, nBlocks, seed);
    const vmCode = emitVM(shuffled, rc4Key, xorKey, rawChecksum, OPC);
    return vmCode.replace(/[\r\n]+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  } catch(err) {
    throw new Error('Obfuscation failed: ' + err.message);
  }
}

module.exports = { obfuscate };
