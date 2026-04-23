'use strict';
const crypto = require('crypto');

// ── Utilities ─────────────────────────────────────────────────────────────────
function randomBytes(n) {
  try { return [...crypto.randomBytes(n)]; }
  catch { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return [...b]; }
}
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function v()  { let n='_'; for(let i=0;i<6;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }
function v2() { let n='_'; for(let i=0;i<9;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }

// ── Arith (16 safe forms, all verified for Lua 5.1/Luau) ─────────────────────
// Rules:
//   - No bit32.* with negative n (Lua bit32 is unsigned)
//   - No n*a where result > 2^53 (double precision)
//   - No \x escapes anywhere (not supported in Luau 5.1)
//   - Only \ddd decimal escapes in ALL string output
function Arith(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return `${n}`;
  if (n < -2147483648 || n > 2147483647) return `${n}`;
  const a = ri(1, 999);   // keep small to avoid overflow
  const b = ri(1, 99);
  const t = ri(0, 15);
  switch (t) {
    case 0:  return `(${n + a}-${a})`;
    case 1:  return `(${a}-(${a - n}))`;
    case 2:  return `(${n + a + b}-(${a + b}))`;
    // mul/div safe: n*a where a<=999, n<=2^31 → max ~2e12 < 2^53 OK
    case 3:  return `(${n * a}/${a})`;
    case 4:  return `(function() return ${n + a}-${a} end)()`;
    case 5:  return `(function() local _v=${n + a} return _v-${a} end)()`;
    // bit32 ops — ONLY for n >= 0
    case 6: {
      if (n >= 0) { const k=ri(1,0x7FFF); return `bit32.bxor(bit32.bxor(${n},${k}),${k})`; }
      return `(${n + a}-${a})`;
    }
    case 7: {
      if (n >= 0) return `bit32.band(${n + a}-${a},4294967295)`;
      return `(${n + a}-${a})`;
    }
    case 8: {
      if (n >= 0) return `bit32.bxor(${n + a}-${a},0)`;
      return `(${n + a}-${a})`;
    }
    case 9:  return `(${n + a + b}-(${b + a}))`;
    case 10: return `(select(2,false,${n + a}-${a}))`;
    // math.abs: only for n >= 0 to keep formula simple
    case 11: {
      if (n >= 0) return `(math.abs(${n + a})-${a})`;
      return `(${n + a}-${a})`;
    }
    case 12: return `(true and (${n + a}-${a}) or ${n})`;
    // lshift/rshift: only for small n >= 0
    case 13: {
      if (n >= 0 && n <= 0xFFFF) { const sh=ri(1,8); return `bit32.rshift(bit32.lshift(${n},${sh}),${sh})`; }
      return `(${n + a}-${a})`;
    }
    // string len: only small n >= 0
    case 14: {
      if (n >= 0 && n <= 30) return `(#"${'x'.repeat(n)}")`;
      return `(${n + a}-${a})`;
    }
    case 15: return `(math.floor((${n + a}-${a})/1))`;
    default: return `${n}`;
  }
}
const A = Arith;

// ── String escaping — ONLY \ddd, never \x ────────────────────────────────────
function luaStr(bytes) {
  let s = '"';
  for (const b of bytes) s += '\\' + String(b).padStart(3, '0');
  return s + '"';
}

// ── XOR string — hides plaintext, Arith on all numbers ───────────────────────
function xorStr(s) {
  const key = randomBytes(s.length).map(b => (b & 0x7F) || 1);
  const enc = [...s].map((c, i) => (c.charCodeAt(0) ^ key[i]) & 0xFF);
  const vT=v(), vK=v(), vO=v(), vI=v();
  return `(function() local ${vT}={${enc.map(A)}} local ${vK}={${key.map(A)}} local ${vO}={} for ${vI}=1,#${vT} do ${vO}[${vI}]=string.char(bit32.bxor(${vT}[${vI}],${vK}[${vI}])) end return table.concat(${vO}) end)()`;
}

// ── Encryption ────────────────────────────────────────────────────────────────
function rc4(data, key) {
  const s = Array.from({length:256},(_,i)=>i); let j=0;
  for(let i=0;i<256;i++){j=(j+s[i]+key[i%key.length])%256;[s[i],s[j]]=[s[j],s[i]];}
  let ci=0; j=0;
  return data.map(b=>{ci=(ci+1)%256;j=(j+s[ci])%256;[s[ci],s[j]]=[s[j],s[ci]];return b^s[(s[ci]+s[j])%256];});
}

function xorLayer(data, key) {
  // 163 = 0xA3, hardcoded same value used in Lua side
  return data.map((b,i) => b ^ ((key[i%key.length] ^ ((i*163)&0xFF)) & 0xFF));
}

function lcg(s) { return ((s*1664525+1013904223)>>>0); }
function blockShuffle(data, nBlocks, seed) {
  const bSz=Math.ceil(data.length/nBlocks), blocks=[];
  for(let i=0;i<nBlocks;i++){const sl=data.slice(i*bSz,(i+1)*bSz);if(sl.length)blocks.push(sl);}
  const n=blocks.length, perm=Array.from({length:n},(_,i)=>i); let s=seed;
  for(let i=n-1;i>0;i--){s=lcg(s);const j=s%(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}
  return {shuffled:perm.map(idx=>blocks[idx]),perm,n};
}

// ── Opcodes ───────────────────────────────────────────────────────────────────
function makeOpcodeTable() {
  const names=[
    'LOAD_CONST','LOAD_VAR','STORE_VAR','GET_GLOBAL','SET_GLOBAL',
    'CALL','CALL_METHOD','RETURN','LOAD_NIL','LOAD_TRUE','LOAD_FALSE','LOAD_NUMBER',
    'BINARY_ADD','BINARY_SUB','BINARY_MUL','BINARY_DIV','BINARY_MOD','BINARY_POW',
    'BINARY_CONCAT','BINARY_EQ','BINARY_NE','BINARY_LT','BINARY_LE',
    'BINARY_AND','BINARY_OR','UNARY_NOT','UNARY_NEG','UNARY_LEN',
    'JUMP','JUMP_IF_FALSE','JUMP_IF_TRUE','MAKE_TABLE','TABLE_GET','TABLE_SET',
    'FOR_PREP','FOR_STEP',
  ];
  const used=new Set(),ids=[];
  while(ids.length<names.length){const x=ri(1,120);if(!used.has(x)){ids.push(x);used.add(x);}}
  const T={}; names.forEach((n,i)=>{T[n]=ids[i];});
  const fakes=[];
  while(fakes.length<12){const x=ri(130,210);if(!used.has(x)){fakes.push(x);used.add(x);}}
  T._fakes=fakes; return T;
}

// ── Junk ──────────────────────────────────────────────────────────────────────
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
  for(let i=lines.length-1;i>0;i--){const j=ri(0,i);[lines[i],lines[j]]=[lines[j],lines[i]];}
  return lines.join(' ');
}

// ── Lexer ─────────────────────────────────────────────────────────────────────
const KW=new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while']);
function lex(src) {
  const tokens=[]; let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){i++;continue;}
    if(src.slice(i,i+4)==='--[['){i+=4;while(i<src.length&&src.slice(i,i+2)!==']]')i++;i+=2;continue;}
    if(src.slice(i,i+2)==='--'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(src.slice(i,i+2)==='[['){let j=i+2;while(j<src.length&&!(src[j]===']'&&src[j+1]===']'))j++;tokens.push({t:'STRING',v:src.slice(i+2,j)});i=j+2;continue;}
    if(src[i]==='"'||src[i]==="'"){
      const q=src[i];let s='';i++;
      while(i<src.length&&src[i]!==q){
        if(src[i]==='\\'){i++;const c=src[i]||'';
          if(c==='n'){s+='\n';i++;}else if(c==='t'){s+='\t';i++;}else if(c==='r'){s+='\r';i++;}
          else if(/[0-9]/.test(c)){let d='';while(/[0-9]/.test(src[i]||'')&&d.length<3)d+=src[i++];s+=String.fromCharCode(parseInt(d,10));}
          else{s+=c;i++;}
        }else{s+=src[i++];}
      }
      i++;tokens.push({t:'STRING',v:s});continue;
    }
    if(src.slice(i,i+2).toLowerCase()==='0x'){let s='0x';i+=2;while(/[0-9a-fA-F]/.test(src[i]||''))s+=src[i++];tokens.push({t:'NUMBER',v:Number(s)});continue;}
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&/[0-9]/.test(src[i+1]||''))){
      let s='';
      while(/[0-9.eE]/.test(src[i]||'')||((src[i]==='+'||src[i]==='-')&&/[eE]/.test(s.slice(-1))))s+=src[i++];
      tokens.push({t:'NUMBER',v:Number(s)});continue;
    }
    if(/[a-zA-Z_]/.test(src[i])){let s='';while(/[a-zA-Z0-9_]/.test(src[i]||''))s+=src[i++];tokens.push({t:KW.has(s)?'KEYWORD':'NAME',v:s});continue;}
    const op2=src.slice(i,i+2);
    if(['==','~=','<=','>=','..','//','<<','>>'].includes(op2)){tokens.push({t:'OP',v:op2});i+=2;continue;}
    tokens.push({t:'OP',v:src[i]});i++;
  }
  tokens.push({t:'EOF',v:''});return tokens;
}

// ── Compiler ──────────────────────────────────────────────────────────────────
function compileBC(tokens, OPC) {
  let pos=0;
  const ins=[],consts=[],scopes=[{}];let nSlot=0;
  const pk=()=>tokens[pos],nx=()=>tokens[pos++],ck=v=>tokens[pos]&&tokens[pos].v===v,eof=()=>!tokens[pos]||tokens[pos].t==='EOF';
  function eat(v){if(ck(v))nx();else nx();}
  function addC(val){let i=consts.indexOf(val);if(i===-1){i=consts.length;consts.push(val);}return i;}
  function emit(op,a,b,c){ins.push({op,a:a??0,b:b??0,c:c??0});return ins.length-1;}
  // patch sets 1-indexed Lua target; targets must be passed as ins.length+1 style
  function patch(i,t){ins[i].a=t;}
  // returns current 1-indexed Lua position for use as a jump target
  function here(){return ins.length+1;}
  function resV(n){for(let i=scopes.length-1;i>=0;i--)if(scopes[i][n]!==undefined)return scopes[i][n];return null;}
  function decV(n){const s=nSlot++;scopes[scopes.length-1][n]=s;return s;}
  const gPrec=op=>{if(op==='or')return 1;if(op==='and')return 2;if(['<','>','<=','>=','==','~='].includes(op))return 3;if(op==='..')return 4;if(['+','-'].includes(op))return 5;if(['*','/','%','//'].includes(op))return 6;if(op==='^')return 7;return 0;};
  function pExpr(mp=0){pU();while(true){const op=pk().v,pr=gPrec(op);if(pr<=mp)break;nx();pExpr(op==='..'||op==='^'?pr-1:pr);const bop={'+':OPC.BINARY_ADD,'-':OPC.BINARY_SUB,'*':OPC.BINARY_MUL,'/':OPC.BINARY_DIV,'%':OPC.BINARY_MOD,'^':OPC.BINARY_POW,'..':OPC.BINARY_CONCAT,'==':OPC.BINARY_EQ,'~=':OPC.BINARY_NE,'<':OPC.BINARY_LT,'<=':OPC.BINARY_LE,'>':OPC.BINARY_LT,'>=':OPC.BINARY_LE,'and':OPC.BINARY_AND,'or':OPC.BINARY_OR}[op];if(bop!==undefined)emit(bop);}}
  function pU(){const t=pk();if(t.v==='not'){nx();pU();emit(OPC.UNARY_NOT);}else if(t.v==='-'){nx();pU();emit(OPC.UNARY_NEG);}else if(t.v==='#'){nx();pU();emit(OPC.UNARY_LEN);}else pP();}
  function pArgs(){let c=0;if(ck('(')){eat('(');while(!ck(')')&&!eof()){pExpr();c++;if(ck(','))nx();}eat(')');}else if(pk().t==='STRING'){emit(OPC.LOAD_CONST,addC(nx().v));c=1;}else if(ck('{')){pTbl();c=1;}return c;}
  function pSfx(){while(true){const t=pk();if(t.v==='.'){nx();const f=nx();emit(OPC.LOAD_CONST,addC(f.v));emit(OPC.TABLE_GET);}else if(t.v==='['){nx();pExpr();eat(']');emit(OPC.TABLE_GET);}else if(t.v===':'){nx();const m=nx();emit(OPC.LOAD_CONST,addC(m.v));emit(OPC.CALL_METHOD,pArgs());}else if(t.v==='('||t.t==='STRING'||t.v==='{'){emit(OPC.CALL,pArgs());}else break;}}
  function pTbl(){eat('{');emit(OPC.MAKE_TABLE);while(!ck('}')&&!eof()){if(ck('[')){nx();pExpr();eat(']');eat('=');pExpr();emit(OPC.TABLE_SET);}else if(pk().t==='NAME'&&tokens[pos+1]?.v==='='){const k=nx().v;nx();emit(OPC.LOAD_CONST,addC(k));pExpr();emit(OPC.TABLE_SET);}else{pExpr();emit(OPC.TABLE_SET);}if(ck(',')||ck(';'))nx();}eat('}');}
  function pP(){const t=pk();if(t.t==='NUMBER'){nx();emit(OPC.LOAD_NUMBER,t.v);pSfx();}else if(t.t==='STRING'){nx();emit(OPC.LOAD_CONST,addC(t.v));pSfx();}else if(t.t==='KEYWORD'){if(t.v==='nil'){nx();emit(OPC.LOAD_NIL);}else if(t.v==='true'){nx();emit(OPC.LOAD_TRUE);}else if(t.v==='false'){nx();emit(OPC.LOAD_FALSE);}else if(t.v==='function'){nx();skFn();}else nx();}else if(t.t==='NAME'){nx();const sl=resV(t.v);sl!==null?emit(OPC.LOAD_VAR,sl):emit(OPC.GET_GLOBAL,addC(t.v));pSfx();}else if(t.v==='('){eat('(');pExpr();eat(')');pSfx();}else if(t.v==='{'){pTbl();}else nx();}
  function skFn(){eat('(');while(!ck(')')&&!eof())nx();eat(')');let d=1;while(!eof()&&d>0){const t=nx();if(t.t==='KEYWORD'&&['function','do','if','while','for','repeat'].includes(t.v))d++;if(t.t==='KEYWORD'&&(t.v==='end'||t.v==='until'))d--;}}
  function pBlk(){scopes.push({});while(!eof()){const t=pk();if(t.t==='EOF')break;if(t.t==='KEYWORD'&&['end','else','elseif','until'].includes(t.v))break;pStmt();}scopes.pop();}
  function pStmt(){const t=pk();if(t.t==='KEYWORD'){switch(t.v){case 'local':pLoc();return;case 'if':pIf();return;case 'while':pWhl();return;case 'for':pFor();return;case 'return':pRet();return;case 'function':pFnD();return;case 'do':nx();pBlk();eat('end');return;case 'repeat':pRep();return;case 'break':nx();emit(OPC.JUMP,0);return;case 'end':case 'else':case 'elseif':case 'until':return;default:nx();return;}}pES();}
  function pLoc(){eat('local');if(pk().t==='KEYWORD'&&pk().v==='function'){nx();const n=nx().v;skFn();// function body not compiled; store nil as placeholder
    emit(OPC.LOAD_NIL);emit(OPC.STORE_VAR,decV(n));return;}const ns=[];while(pk().t==='NAME'){ns.push(nx().v);if(!ck(','))break;nx();}if(ck('=')){nx();ns.forEach((_,i)=>{pExpr();if(ck(','))nx();});}else ns.forEach(()=>emit(OPC.LOAD_NIL));// allocate slots in forward order, then store in reverse (stack is LIFO)
    const slots=ns.map(n=>decV(n));for(let i=slots.length-1;i>=0;i--)emit(OPC.STORE_VAR,slots[i]);}
  function pIf(){eat('if');pExpr();eat('then');let jF=emit(OPC.JUMP_IF_FALSE,0);pBlk();const jE=[];while(ck('elseif')||ck('else')){jE.push(emit(OPC.JUMP,0));patch(jF,here());jF=-1;if(ck('elseif')){nx();pExpr();eat('then');jF=emit(OPC.JUMP_IF_FALSE,0);pBlk();}else{nx();pBlk();break;}}if(ck('end'))nx();const ep=here();jE.forEach(j=>patch(j,ep));if(jF!==-1)patch(jF,ep);}
  function pWhl(){eat('while');const top=here();pExpr();eat('do');const jF=emit(OPC.JUMP_IF_FALSE,0);pBlk();eat('end');emit(OPC.JUMP,top);patch(jF,here());}
  function pFor(){eat('for');const n=nx().v;if(ck('=')){nx();pExpr();eat(',');pExpr();if(ck(',')){ nx();pExpr();}else{emit(OPC.LOAD_NUMBER,1);}// default step = 1
    eat('do');const sl=decV(n);emit(OPC.FOR_PREP,sl);const top=here();pBlk();eat('end');emit(OPC.FOR_STEP,sl,top);}else{while(!eof()&&!(pk().t==='KEYWORD'&&pk().v==='end'))nx();if(ck('end'))nx();}}
  function pRet(){eat('return');let c=0;if(!eof()&&!(pk().t==='KEYWORD'&&['end','else','elseif','until'].includes(pk().v))){pExpr();c++;while(ck(',')){nx();pExpr();c++;}}emit(OPC.RETURN,c);}
  function pFnD(){eat('function');const n=nx().v;skFn();// function body not compiled; store nil as placeholder
    emit(OPC.LOAD_NIL);const sl=resV(n);if(sl!==null){emit(OPC.STORE_VAR,sl);}else{emit(OPC.LOAD_CONST,addC(n));emit(OPC.SET_GLOBAL);}}
  function pRep(){eat('repeat');const top=here();pBlk();eat('until');pExpr();emit(OPC.JUMP_IF_FALSE,top);}
  // Fix: push key string first, then value, then SET_GLOBAL
  function pES(){const t=pk();if(t.t==='NAME'){const name=t.v;nx();if(ck('=')){nx();const sl=resV(name);if(sl!==null){pExpr();emit(OPC.STORE_VAR,sl);}else{emit(OPC.LOAD_CONST,addC(name));pExpr();emit(OPC.SET_GLOBAL);}return;}const sl=resV(name);sl!==null?emit(OPC.LOAD_VAR,sl):emit(OPC.GET_GLOBAL,addC(name));pSfx();return;}pP();}
  pBlk();emit(OPC.RETURN,0);
  return {ins,consts};
}

// Fix: remap absolute jump targets in real instructions after fake insertion
function injectFakes(ins, fakeIds, OPC) {
  const jumpOpsA=new Set([OPC.JUMP,OPC.JUMP_IF_FALSE,OPC.JUMP_IF_TRUE]);
  const jumpOpsB=new Set([OPC.FOR_STEP]);
  const out=[];
  // oldToNew[i] = new 1-indexed Lua position of old instruction i (0-indexed JS)
  const oldToNew=new Array(ins.length);
  for(let i=0;i<ins.length;i++){
    oldToNew[i]=out.length+1;// 1-indexed Lua position
    if(Math.random()<0.25)out.push({op:fakeIds[ri(0,fakeIds.length-1)],a:ri(0,100),b:ri(0,100),c:0});
    out.push(ins[i]);
  }
  // sentinel for "one past the end"
  const endPos=out.length+1;
  function remap(t){
    // t is a 1-indexed Lua target; find which old JS instruction it referred to
    // old JS index = t-1, remap using oldToNew
    const jsIdx=t-1;
    if(jsIdx>=0&&jsIdx<oldToNew.length)return oldToNew[jsIdx];
    if(jsIdx>=ins.length)return endPos;
    return t;
  }
  for(const inst of out){
    if(jumpOpsA.has(inst.op))inst.a=remap(inst.a);
    if(jumpOpsB.has(inst.op))inst.b=remap(inst.b);
  }
  return out;
}

function serialize(ins, consts) {
  const bytes=[];
  const u8=n=>bytes.push(n&0xFF);
  const i16=n=>{const x=n&0xFFFF;bytes.push(x&0xFF);bytes.push((x>>8)&0xFF);};
  const i32=n=>{const x=n>>>0;bytes.push(x&0xFF);bytes.push((x>>8)&0xFF);bytes.push((x>>16)&0xFF);bytes.push((x>>24)&0xFF);};
  const f64=f=>{const dv=new DataView(new ArrayBuffer(8));dv.setFloat64(0,f,false);for(let i=0;i<8;i++)bytes.push(dv.getUint8(i));};
  const str=s=>{const e=[...s].map(c=>c.charCodeAt(0)&0xFF);i16(e.length);for(const b of e)u8(b);};
  [0x53,0x4C,0x49,0x42].forEach(u8);u8(1);i16(consts.length);
  for(const c of consts){if(typeof c==='string'){u8(1);str(c);}else if(typeof c==='number'){u8(2);f64(c);}else if(typeof c==='boolean'){u8(3);u8(c?1:0);}else u8(0);}
  i32(ins.length);
  for(const inst of ins){
    u8(inst.op);
    if(inst.a===0)u8(0);
    else if(Number.isInteger(inst.a)&&inst.a>=-32768&&inst.a<=32767){u8(1);i16(inst.a);}
    else if(Number.isInteger(inst.a)){u8(2);i32(inst.a);}
    else if(typeof inst.a==='number'){u8(3);f64(inst.a);}
    else u8(0);
    if(inst.b===0)u8(0);
    else if(Number.isInteger(inst.b)&&inst.b>=0&&inst.b<=65535){u8(1);i16(inst.b);}
    else u8(0);
  }
  return bytes;
}

// ── VM Emitter ────────────────────────────────────────────────────────────────
function emitVM(shuffleResult, rc4Key, xorKey, rawChecksum, OPC) {
  const vEnv=v2(),vVars=v2(),vStk=v2(),vTop=v2(),vIns=v2(),vCons=v2();
  const vMask=v2(),vSip=v2(),vRun=v2(),vCur=v2(),vOp=v2(),vA=v2(),vB=v2();
  const vU8=v2(),vI16=v2(),vI32=v2(),vStr=v2(),vData=v2(),vIdx=v2();
  const vS=v2(),vRI=v2(),vRJ=v2(),vRKey=v2();
  const vXKey=v2(),vDec=v2(),vBlks=v2(),vPerm=v2(),vPay=v2();
  const vCs=v2(),vChk=v2();
  const vK1=v(),vK2=v(),vK3=v(),vX1=v(),vX2=v();
  const vGenv=v2(),vAT=v2(),vExec=v2();
  const vAA=v2(),vBB=v2(),vCC=v2(); // extra noise variables

  const xGS=xorStr('GetService'),xPl=xorStr('Players'),xLP=xorStr('LocalPlayer');
  const xKk=xorStr('Kick'),xKm=xorStr('Security violation.');
  const xInst=xorStr('Instance'),xDM=xorStr('DataModel');
  // executor detection strings — hidden
  const xRf=xorStr('readfile'),xWf=xorStr('writefile');
  const xSyn=xorStr('syn'),xFlux=xorStr('fluxus');
  const xDexx=xorStr('DELTAX'),xDeltaExec=xorStr('deltaexecute');
  // anti-hook strings
  const xHkFn=xorStr('hookfunction'),xHkFn2=xorStr('hookfunc'),xRepCl=xorStr('replaceclosure');

  const csOff = ri(1,99999);
  const csExpr = `${rawChecksum+csOff}-${csOff}`;
  const kL=rc4Key.length,kM1=Math.floor(kL/3),kM2=Math.floor(kL*2/3);
  const xL=xorKey.length,xM=Math.floor(xL/2);
  const ipMask=ri(0x1000,0xFFFF);

  // payload fragments — STRICTLY \ddd only
  const fragVars=[],fragDecls=[];
  for(let i=0;i<shuffleResult.n;i++){
    const vn=v2();fragVars.push(vn);
    fragDecls.push(`local ${vn}=${luaStr(shuffleResult.shuffled[i])}`);
  }

  const fakeBranches=OPC._fakes.slice(0,6).map(fop=>{
    const d=v(),e=v();
    return `elseif ${vOp}==${A(fop)} then local ${d}=${A(0)} local ${e}=${d}`;
  }).join(' ');

  // Anti-debug checks
  const xDbg=xorStr('debug'),xGt=xorStr('getinfo'),xBp=xorStr('sethook');
  const xMt=xorStr('metatable'),xRm=xorStr('rawget'),xSm=xorStr('setmetatable');

  return `return (function(...)
local ${vEnv}=(getfenv and getfenv(1)) or _ENV or _G
local function _kick() pcall(function() local _gs=${xGS} local _pl=${xPl} local _lp=${xLP} local _kk=${xKk} local _km=${xKm} local _s=game[_gs](game,_pl) local _p=_s[_lp] _p[_kk](_p,_km) end) end
local _ei=${xInst} local _ed=${xDM}
if not(typeof~=nil and typeof(game)==_ei and game.ClassName==_ed) then return end
_ei=nil _ed=nil
local ${vGenv}=(getgenv and getgenv()) or _G
do
  local ${vAT}=rawget(${vGenv},${xHkFn}) or rawget(${vGenv},${xHkFn2}) or rawget(${vGenv},${xRepCl})
  if ${vAT}~=nil then return end
end
do
  local ${vExec}=
    rawget(${vGenv},${xRf}) or rawget(${vGenv},${xWf}) or
    rawget(${vGenv},${xSyn}) or rawget(${vGenv},${xFlux}) or
    rawget(${vGenv},${xDexx}) or rawget(${vGenv},${xDeltaExec}) or
    rawget(_G,${xRf}) or rawget(_G,${xWf})
  if ${vExec}==nil then return end
end
do
  local _dbg=rawget(${vGenv},${xDbg}) if _dbg and _dbg[${xGt}] and _dbg[${xBp}] then return end
end
${junk(8)}
do local ${vAA}=${A(ri(100,999))} local ${vBB}=${A(ri(100,999))} local ${vCC}=${vAA}+${vBB} end
${fragDecls.join(' ')}
local ${vPerm}={${shuffleResult.perm.join(',')}}
local ${vBlks}={} local _fv={${fragVars.join(',')}}
for ${vIdx}=1,#${vPerm} do ${vBlks}[${vPerm}[${vIdx}]+1]=_fv[${vIdx}] end
local ${vPay}=table.concat(${vBlks})
_fv=nil ${vBlks}=nil ${vPerm}=nil ${fragVars.map(n=>`${n}=nil`).join(' ')}
${junk(3)}
local ${vAA}=${A(ri(1,50))} local ${vBB}=${A(ri(1,50))} local ${vCC}=bit32.band(${vAA}*${vBB},255)
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
${junk(4)}
do local _t={${A(ri(1,100))},${A(ri(1,100))},${A(ri(1,100))}} local _s=#_t end
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
if ${vChk}~=${vCs} then return end
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
  elseif ${vOp}==${A(OPC.BINARY_AND)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}] and _b
  elseif ${vOp}==${A(OPC.BINARY_OR)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}] or _b
  elseif ${vOp}==${A(OPC.UNARY_NOT)} then ${vStk}[${vTop}]=not ${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_NEG)} then ${vStk}[${vTop}]=-${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_LEN)} then ${vStk}[${vTop}]=#${vStk}[${vTop}]
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

// ── Control Flow Flattening ──────────────────────────────────────────────────
function flattenControlFlow(ins, OPC) {
  const states={}, stateMap=new Map(), nextStateId=1, dispatchTable=[];
  let stateId=nextStateId;
  const jumpOpsA=new Set([OPC.JUMP,OPC.JUMP_IF_FALSE,OPC.JUMP_IF_TRUE]);
  const jumpOpsB=new Set([OPC.FOR_STEP]);

  for(let i=0;i<ins.length;i++){
    const st={id:stateId,ins:ins[i],next:stateId+1};
    stateMap.set(i,stateId);
    dispatchTable.push(st);
    stateId++;
  }

  // remap jump targets to state IDs
  for(let i=0;i<dispatchTable.length;i++){
    const inst=dispatchTable[i].ins;
    if(jumpOpsA.has(inst.op)){
      const oldTarget=inst.a;
      const jsIdx=oldTarget-1;
      if(stateMap.has(jsIdx))inst.a=stateMap.get(jsIdx);
    }
    if(jumpOpsB.has(inst.op)){
      const oldTarget=inst.b;
      const jsIdx=oldTarget-1;
      if(stateMap.has(jsIdx))inst.b=stateMap.get(jsIdx);
    }
  }

  return dispatchTable;
}

// ── Constant Encoding Variants ────────────────────────────────────────────────
function encodeConstant(val) {
  const t=ri(0,3);
  switch(t){
    case 0: // decimal
      return `${A(val)}`;
    case 1: // octal
      if(typeof val==='number'&&val>=0&&val<=255)return `0o${val.toString(8)}`;
      return `${A(val)}`;
    case 2: // binary (for small values)
      if(typeof val==='number'&&val>=0&&val<=255)return `0b${val.toString(2)}`;
      return `${A(val)}`;
    case 3: // hex
      if(typeof val==='number'&&val>=0&&val<=255)return `0x${val.toString(16)}`;
      return `${A(val)}`;
    default: return `${A(val)}`;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
function obfuscateV8(code) {
  try {
    const OPC=makeOpcodeTable();
    let compiled;
    try { compiled=compileBC(lex(code),OPC); }
    catch(e) { compiled={ins:[{op:OPC.LOAD_CONST,a:0,b:0,c:0},{op:OPC.CALL,a:0,b:0,c:0},{op:OPC.RETURN,a:0,b:0,c:0}],consts:[code]}; }

    // apply multiple obfuscation passes
    compiled.ins=injectFakes(compiled.ins,OPC._fakes,OPC);
    compiled.ins=injectFakes(compiled.ins,OPC._fakes,OPC); // double fake injection

    const rawBytes=serialize(compiled.ins,compiled.consts);
    let cs=0x1337;
    for(const b of rawBytes) cs=((cs*31+b)&0xFFFFFFFF)>>>0;
    const rawChecksum=cs>>>0;

    // enhanced encryption with longer keys
    const rc4Key=randomBytes(ri(24,32)),xorKey=randomBytes(ri(16,24));
    const nBlocks=ri(16,28),seed=ri(0x1000,0xFFFFFFFF);
    const rc4Bytes=rc4(rawBytes,rc4Key);
    const xorBytes=xorLayer(rc4Bytes,xorKey);
    const shuffled=blockShuffle(xorBytes,nBlocks,seed);

    const vmCode=emitVM(shuffled,rc4Key,xorKey,rawChecksum,OPC);

    // aggressively minify with more whitespace removal
    return vmCode.replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').replace(/; /g,';').trim();
  } catch(err) { throw new Error('Obfuscation failed: '+err.message); }
}

module.exports = { obfuscateV8 };
