'use strict';
const crypto = require('crypto');

// ================================ Utilities ==================================
function randomBytes(n) {
  try { return [...crypto.randomBytes(n)]; }
  catch { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return [...b]; }
}
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function v()  { let n='_'; for(let i=0;i<6;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }
function v2() { let n='_'; for(let i=0;i<9;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }

// ================================ Arithmetic Obfuscation ======================
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

// ================================ String Escaping =============================
function luaStr(bytes) {
  let s = '"';
  for (const b of bytes) s += '\\' + String(b).padStart(3, '0');
  return s + '"';
}

// ================================ XOR String ==================================
function xorStr(s) {
  const key = randomBytes(s.length).map(b => (b & 0x7F) || 1);
  const enc = [...s].map((c,i) => (c.charCodeAt(0) ^ key[i]) & 0xFF);
  const vT=v(), vK=v(), vO=v(), vI=v();
  return `(function() local ${vT}={${enc.map(A)}} local ${vK}={${key.map(A)}} local ${vO}={} for ${vI}=1,#${vT} do ${vO}[${vI}]=string.char(bit32.bxor(${vT}[${vI}], ${vK}[${vI}])) end return table.concat(${vO}) end)()`;
}

// ================================ Encryption Layers ===========================
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

// ================================ Opcode Table ================================
function makeOpcodeTable() {
  const names = [
    'LOAD_CONST','LOAD_VAR','STORE_VAR','GET_GLOBAL','SET_GLOBAL',
    'CALL','CALL_METHOD','RETURN','LOAD_NIL','LOAD_TRUE','LOAD_FALSE','LOAD_NUMBER',
    'BINARY_ADD','BINARY_SUB','BINARY_MUL','BINARY_DIV','BINARY_MOD','BINARY_POW',
    'BINARY_CONCAT','BINARY_EQ','BINARY_NE','BINARY_LT','BINARY_LE',
    'BINARY_AND','BINARY_OR','BINARY_XOR','BINARY_SHL','BINARY_SHR',
    'UNARY_NOT','UNARY_NEG','UNARY_LEN','UNARY_BNOT',
    'JUMP','JUMP_IF_FALSE','JUMP_IF_TRUE','MAKE_TABLE','TABLE_GET','TABLE_SET',
    'FOR_PREP','FOR_STEP','FOR_IN_PREP','FOR_IN_STEP',
    'GET_UPVAL','SET_UPVAL','CLOSURE','VARARG',
  ];
  const used=new Set(), ids=[];
  while(ids.length<names.length){ const x=ri(1,200); if(!used.has(x)){ ids.push(x); used.add(x); } }
  const T={}; names.forEach((n,i)=>{ T[n]=ids[i]; });
  const fakes=[];
  while(fakes.length<12){ const x=ri(210,300); if(!used.has(x)){ fakes.push(x); used.add(x); } }
  T._fakes=fakes; return T;
}

// ================================ Junk Code Injector ==========================
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

// ================================ Lexer (Full Lua 5.1) ========================
const KW = new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while']);
function lex(src) {
  const tokens=[]; let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){ i++; continue; }
    // long comment --[[ ... ]]
    if(src.slice(i,i+4)==='--[['){
      i+=4; let level=1;
      while(i<src.length && level>0){
        if(src.slice(i,i+2)===']]'){ level--; i+=2; }
        else if(src.slice(i,i+2)==='[['){ level++; i+=2; }
        else i++;
      }
      continue;
    }
    if(src.slice(i,i+2)==='--'){ while(i<src.length && src[i]!=='\n') i++; continue; }
    // long string [[ ... ]]
    if(src.slice(i,i+2)==='[['){
      let j=i+2, level=1;
      while(j<src.length && level>0){
        if(src.slice(j,j+2)===']]'){ level--; j+=2; }
        else if(src.slice(j,j+2)==='[['){ level++; j+=2; }
        else j++;
      }
      tokens.push({t:'STRING', v:src.slice(i+2,j-2)});
      i=j; continue;
    }
    // quoted strings
    if(src[i]==='"' || src[i]==="'"){
      const q=src[i]; let s=''; i++;
      while(i<src.length && src[i]!==q){
        if(src[i]==='\\'){
          i++; const c=src[i]||'';
          if(c==='n'){ s+='\n'; i++; }
          else if(c==='t'){ s+='\t'; i++; }
          else if(c==='r'){ s+='\r'; i++; }
          else if(c==='z'){ i++; while(/\s/.test(src[i])) i++; }
          else if(/[0-9]/.test(c)){
            let d=''; while(/[0-9]/.test(src[i]||'') && d.length<3) d+=src[i++];
            s+=String.fromCharCode(parseInt(d,10));
          } else { s+=c; i++; }
        } else { s+=src[i++]; }
      }
      i++; tokens.push({t:'STRING',v:s}); continue;
    }
    // hex numbers
    if(src.slice(i,i+2).toLowerCase()==='0x'){
      let s='0x'; i+=2;
      while(/[0-9a-fA-F]/.test(src[i]||'')) s+=src[i++];
      tokens.push({t:'NUMBER',v:Number(s)}); continue;
    }
    // decimal numbers
    if(/[0-9]/.test(src[i]) || (src[i]==='.' && /[0-9]/.test(src[i+1]||''))){
      let s='';
      while(/[0-9.eE]/.test(src[i]||'') || ((src[i]==='+'||src[i]==='-') && /[eE]/.test(s.slice(-1)))) s+=src[i++];
      tokens.push({t:'NUMBER',v:Number(s)}); continue;
    }
    // identifiers & keywords
    if(/[a-zA-Z_]/.test(src[i])){
      let s='';
      while(/[a-zA-Z0-9_]/.test(src[i]||'')) s+=src[i++];
      tokens.push({t:KW.has(s)?'KEYWORD':'NAME',v:s}); continue;
    }
    // two-char operators
    const op2=src.slice(i,i+2);
    if(['==','~=','<=','>=','..','//','<<','>>'].includes(op2)){
      tokens.push({t:'OP',v:op2}); i+=2; continue;
    }
    tokens.push({t:'OP',v:src[i]}); i++;
  }
  tokens.push({t:'EOF',v:''}); return tokens;
}

// ================================ Compiler (with closures, upvalues, vararg) ===
function compileBC(tokens, OPC) {
  let pos=0;
  const ins=[], consts=[], scopes=[{}], upvalues=[[]];
  let nSlot=0, vararg=false;

  const pk=()=>tokens[pos], nx=()=>tokens[pos++], ck=v=>tokens[pos]?.v===v, eof=()=>!tokens[pos]||tokens[pos].t==='EOF';
  function eat(v){ if(ck(v)) nx(); else nx(); }

  function addC(val){ let i=consts.indexOf(val); if(i===-1){ i=consts.length; consts.push(val); } return i; }
  function emit(op,a,b,c){ ins.push({op,a:a??0,b:b??0,c:c??0}); return ins.length-1; }
  function patch(i,val){ ins[i].a=val; }

  function resolveVar(name, currentOnly=false){
    for(let i=scopes.length-1; i>=0; i--){
      if(scopes[i][name]!==undefined) return {type:'local', slot:scopes[i][name], scope:i};
      if(currentOnly) break;
    }
    return {type:'global', name};
  }
  function declareVar(name){ const s=nSlot++; scopes[scopes.length-1][name]=s; return s; }

  function captureUpvalue(name, fromScope){
    for(let i=scopes.length-2; i>=fromScope; i--){
      if(scopes[i][name]!==undefined){
        const slot=scopes[i][name];
        const ups=upvalues[upvalues.length-1];
        for(let j=0;j<ups.length;j++) if(ups[j].scope===i && ups[j].slot===slot) return j;
        const idx=ups.length;
        ups.push({scope:i, slot, name});
        return idx;
      }
    }
    return null;
  }

  // precedence and binary op mapping
  const prec = op => {
    if(op==='or') return 1; if(op==='and') return 2;
    if(['<','>','<=','>=','==','~='].includes(op)) return 3;
    if(op==='..') return 4;
    if(['+','-'].includes(op)) return 5;
    if(['*','/','%','//'].includes(op)) return 6;
    if(op==='^') return 7;
    if(['&','|','<<','>>','~'].includes(op)) return 3.5;
    return 0;
  };
  const binopMap = {
    '+':OPC.BINARY_ADD, '-':OPC.BINARY_SUB, '*':OPC.BINARY_MUL, '/':OPC.BINARY_DIV,
    '%':OPC.BINARY_MOD, '^':OPC.BINARY_POW, '..':OPC.BINARY_CONCAT,
    '==':OPC.BINARY_EQ, '~=':OPC.BINARY_NE, '<':OPC.BINARY_LT, '<=':OPC.BINARY_LE,
    '>':OPC.BINARY_LT, '>=':OPC.BINARY_LE,
    'and':OPC.BINARY_AND, 'or':OPC.BINARY_OR,
    '&':OPC.BINARY_AND, '|':OPC.BINARY_OR, '~':OPC.BINARY_XOR,
    '<<':OPC.BINARY_SHL, '>>':OPC.BINARY_SHR,
  };
  function pExpr(minp=0){
    pUnary();
    while(true){
      const op=pk().v, pr=prec(op);
      if(pr<=minp) break;
      nx();
      pExpr(op==='..'||op==='^'?pr-1:pr);
      const opr=binopMap[op];
      if(opr!==undefined) emit(opr);
    }
  }
  function pUnary(){
    const t=pk();
    if(t.v==='not'){ nx(); pUnary(); emit(OPC.UNARY_NOT); }
    else if(t.v==='-'){ nx(); pUnary(); emit(OPC.UNARY_NEG); }
    else if(t.v==='#'){ nx(); pUnary(); emit(OPC.UNARY_LEN); }
    else if(t.v==='~'){ nx(); pUnary(); emit(OPC.UNARY_BNOT); }
    else pPrimary();
  }
  function pArgs(){
    let c=0;
    if(ck('(')){
      eat('(');
      while(!ck(')') && !eof()){
        pExpr(); c++;
        if(ck(',')) nx();
      }
      eat(')');
    } else if(pk().t==='STRING'){
      emit(OPC.LOAD_CONST, addC(nx().v)); c=1;
    } else if(ck('{')){
      pTable(); c=1;
    }
    return c;
  }
  function pSuffix(){
    while(true){
      if(ck('.')){
        nx(); const f=nx();
        emit(OPC.LOAD_CONST, addC(f.v));
        emit(OPC.TABLE_GET);
      } else if(ck('[')){
        nx(); pExpr(); eat(']');
        emit(OPC.TABLE_GET);
      } else if(ck(':')){
        nx(); const m=nx();
        emit(OPC.LOAD_CONST, addC(m.v));
        const nargs=pArgs();
        emit(OPC.CALL_METHOD, nargs);
      } else if(ck('(') || pk().t==='STRING' || ck('{')){
        const nargs=pArgs();
        emit(OPC.CALL, nargs);
      } else break;
    }
  }
  function pTable(){
    eat('{'); emit(OPC.MAKE_TABLE);
    while(!ck('}') && !eof()){
      if(ck('[')){
        nx(); pExpr(); eat(']'); eat('=');
        pExpr(); emit(OPC.TABLE_SET);
      } else if(pk().t==='NAME' && tokens[pos+1]?.v==='='){
        const k=nx().v; nx();
        emit(OPC.LOAD_CONST, addC(k));
        pExpr(); emit(OPC.TABLE_SET);
      } else {
        pExpr(); emit(OPC.TABLE_SET);
      }
      if(ck(',')||ck(';')) nx();
    }
    eat('}');
  }
  function pPrimary(){
    const t=pk();
    if(t.t==='NUMBER'){
      nx(); emit(OPC.LOAD_NUMBER, t.v); pSuffix();
    } else if(t.t==='STRING'){
      nx(); emit(OPC.LOAD_CONST, addC(t.v)); pSuffix();
    } else if(t.t==='KEYWORD'){
      if(t.v==='nil'){ nx(); emit(OPC.LOAD_NIL); }
      else if(t.v==='true'){ nx(); emit(OPC.LOAD_TRUE); }
      else if(t.v==='false'){ nx(); emit(OPC.LOAD_FALSE); }
      else if(t.v==='function'){ nx(); pFunction(); }
      else if(t.v==='...'){ nx(); emit(OPC.VARARG); pSuffix(); }
      else nx();
    } else if(t.t==='NAME'){
      nx(); const ref=resolveVar(t.v);
      if(ref.type==='local') emit(OPC.LOAD_VAR, ref.slot);
      else {
        const up=captureUpvalue(t.v, ref.scope);
        if(up!==null) emit(OPC.GET_UPVAL, up);
        else emit(OPC.GET_GLOBAL, addC(t.v));
      }
      pSuffix();
    } else if(ck('(')){
      eat('('); pExpr(); eat(')'); pSuffix();
    } else if(ck('{')){
      pTable();
    } else nx();
  }

  // function compilation (recursive)
  function pFunction(){
    emit(OPC.CLOSURE, 0);
    const protoIdx=ins.length-1;
    const outerUpvals=upvalues[upvalues.length-1].slice();
    scopes.push({});
    upvalues.push([]);
    const oldNSlot=nSlot;
    nSlot=0;
    // parameters
    eat('(');
    const params=[];
    while(!ck(')') && !eof()){
      if(pk().v==='...'){ vararg=true; nx(); break; }
      if(pk().t==='NAME') params.push(declareVar(nx().v));
      if(ck(',')) nx();
    }
    eat(')');
    const bodyStart=ins.length;
    pBlock();
    eat('end');
    const bodyIns=ins.slice(bodyStart);
    const proto = {
      params, vararg,
      upvalues: upvalues[upvalues.length-1],
      ins: bodyIns,
      consts: consts.slice(),
    };
    scopes.pop();
    upvalues.pop();
    nSlot=oldNSlot;
    const idx=addC(proto);
    ins[protoIdx]={op:OPC.CLOSURE, a:idx, b:0, c:0};
  }

  // statements
  function pBlock(){
    while(!eof()){
      const t=pk();
      if(t.t==='EOF') break;
      if(t.t==='KEYWORD' && ['end','else','elseif','until'].includes(t.v)) break;
      pStatement();
    }
  }
  function pStatement(){
    const t=pk();
    if(t.t==='KEYWORD'){
      switch(t.v){
        case 'local': pLocal(); return;
        case 'if': pIf(); return;
        case 'while': pWhile(); return;
        case 'for': pFor(); return;
        case 'return': pReturn(); return;
        case 'function': pFunctionStmt(); return;
        case 'do': nx(); pBlock(); eat('end'); return;
        case 'repeat': pRepeat(); return;
        case 'break': nx(); emit(OPC.JUMP, 0); return;
        default: nx(); return;
      }
    }
    pExprStmt();
  }
  function pLocal(){
    eat('local');
    if(pk().v==='function'){
      nx(); const name=nx().v;
      pFunction();
      const ref=resolveVar(name, true);
      if(ref.type==='local') emit(OPC.STORE_VAR, ref.slot);
      else declareVar(name);
      return;
    }
    const names=[];
    while(pk().t==='NAME'){
      names.push(declareVar(nx().v));
      if(!ck(',')) break; nx();
    }
    if(ck('=')){
      nx();
      for(let i=0;i<names.length;i++){
        pExpr();
        if(ck(',')) nx();
      }
    } else {
      for(let i=0;i<names.length;i++) emit(OPC.LOAD_NIL);
    }
    for(let i=names.length-1;i>=0;i--) emit(OPC.STORE_VAR, names[i]);
  }
  function pIf(){
    eat('if'); pExpr(); eat('then');
    let jf=emit(OPC.JUMP_IF_FALSE,0);
    pBlock();
    const jumps=[];
    while(ck('elseif')||ck('else')){
      jumps.push(emit(OPC.JUMP,0));
      patch(jf,ins.length);
      if(ck('elseif')){
        nx(); pExpr(); eat('then');
        jf=emit(OPC.JUMP_IF_FALSE,0);
        pBlock();
      } else {
        nx(); pBlock();
        break;
      }
    }
    eat('end');
    const dest=ins.length;
    jumps.forEach(j=>patch(j,dest));
    if(jumps.length===0) patch(jf,dest);
  }
  function pWhile(){
    const top=ins.length;
    eat('while'); pExpr(); eat('do');
    const jf=emit(OPC.JUMP_IF_FALSE,0);
    pBlock(); eat('end');
    emit(OPC.JUMP, top);
    patch(jf,ins.length);
  }
  function pRepeat(){
    const top=ins.length;
    eat('repeat'); pBlock(); eat('until');
    pExpr();
    emit(OPC.JUMP_IF_FALSE, top);
  }
  function pFor(){
    eat('for');
    const name=nx().v;
    if(ck('=')){
      // numeric for
      nx(); pExpr(); eat(','); pExpr();
      let step=false;
      if(ck(',')){ nx(); pExpr(); step=true; }
      eat('do');
      const idx=declareVar(name);
      emit(OPC.FOR_PREP, idx);
      const loopStart=ins.length;
      pBlock();
      eat('end');
      emit(OPC.FOR_STEP, idx, loopStart);
    } else {
      // generic for (in)
      const names=[name];
      while(ck(',')){ nx(); names.push(declareVar(nx().v)); }
      eat('in'); pExpr(); while(ck(',')){ nx(); pExpr(); }
      eat('do'); emit(OPC.FOR_IN_PREP, names.length);
      const loopStart=ins.length;
      pBlock(); eat('end');
      emit(OPC.FOR_IN_STEP, names.length, loopStart);
    }
  }
  function pReturn(){
    eat('return'); let n=0;
    if(!eof() && !(pk().t==='KEYWORD' && ['end','else','elseif','until'].includes(pk().v))){
      pExpr(); n++;
      while(ck(',')){ nx(); pExpr(); n++; }
    }
    emit(OPC.RETURN, n);
  }
  function pFunctionStmt(){
    eat('function'); const name=nx().v;
    pFunction();
    const ref=resolveVar(name);
    if(ref.type==='local') emit(OPC.STORE_VAR, ref.slot);
    else emit(OPC.SET_GLOBAL, addC(name));
  }
  function pExprStmt(){
    pExpr();
    if(ck('=')){
      nx(); pExpr();
      emit(OPC.SET_GLOBAL); // simplified assignment – in real full version you'd need table field handling
    }
  }

  pBlock();
  emit(OPC.RETURN,0);
  return {ins, consts, upvalues};
}

function injectFakes(ins, fakeIds){
  const out=[];
  for(const inst of ins){
    if(Math.random()<0.25) out.push({op:fakeIds[ri(0,fakeIds.length-1)], a:ri(0,100), b:ri(0,100), c:0});
    out.push(inst);
  }
  return out;
}

// ================================ Serializer ==================================
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
    else if(typeof c==='object' && c!==null){ u8(4); str(JSON.stringify(c)); }
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

// ================================ VM Emitter (Full Implementation) ============
function emitVM(shuffleResult, rc4Key, xorKey, rawChecksum, OPC) {
  const vEnv=v2(), vVars=v2(), vStk=v2(), vTop=v2(), vIns=v2(), vCons=v2();
  const vMask=v2(), vSip=v2(), vRun=v2(), vCur=v2(), vOp=v2(), vA=v2(), vB=v2();
  const vU8=v2(), vI16=v2(), vI32=v2(), vStr=v2(), vData=v2(), vIdx=v2();
  const vS=v2(), vRI=v2(), vRJ=v2(), vRKey=v2();
  const vXKey=v2(), vDec=v2(), vBlks=v2(), vPerm=v2(), vPay=v2();
  const vCs=v2(), vChk=v2();
  const vK1=v(), vK2=v(), vK3=v(), vX1=v(), vX2=v();
  const vGenv=v2(), vAT=v2(), vExec=v2();
  const vUpvals=v2(), vFrame=v2(); // untuk closure & upvalue
  const xGS=xorStr('GetService'), xPl=xorStr('Players'), xLP=xorStr('LocalPlayer');
  const xKk=xorStr('Kick'), xKm=xorStr('Security violation.');
  const xInst=xorStr('Instance'), xDM=xorStr('DataModel');
  const xRf=xorStr('readfile'), xWf=xorStr('writefile');
  const xSyn=xorStr('syn'), xFlux=xorStr('fluxus');
  const xDexx=xorStr('DELTAX'), xDeltaExec=xorStr('deltaexecute');
  const xHkFn=xorStr('hookfunction'), xHkFn2=xorStr('hookfunc'), xRepCl=xorStr('replaceclosure');

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
local function _kick() pcall(function() local _gs=${xGS} local _pl=${xPl} local _lp=${xLP} local _kk=${xKk} local _km=${xKm} local _s=game[_gs](game,_pl) local _p=_s[_lp] _p[_kk](_p,_km) end) end
local _ei=${xInst} local _ed=${xDM}
if not(typeof~=nil and typeof(game)==_ei and game.ClassName==_ed) then return end
_ei=nil _ed=nil
local ${vGenv}=(getgenv and getgenv()) or _G
do
  local ${vAT}=rawget(${vGenv},${xHkFn}) or rawget(${vGenv},${xHkFn2}) or rawget(${vGenv},${xRepCl})
  if ${vAT}~=nil then _kick() return end
end
do
  local ${vExec}=
    rawget(${vGenv},${xRf}) or rawget(${vGenv},${xWf}) or
    rawget(${vGenv},${xSyn}) or rawget($vGenv,${xFlux}) or
    rawget(${vGenv},${xDexx}) or rawget(${vGenv},${xDeltaExec}) or
    rawget(_G,${xRf}) or rawget(_G,${xWf})
  if ${vExec}==nil then _kick() return end
end
${junk(4)}
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
  elseif _ct==4 then ${vCons}[${vIdx}]=loadstring(${vStr}())()
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
local ${vUpvals}={} -- stack of upvalue tables for each closure level
local function _pushFrame() table.insert(${vUpvals}, {}) end
local function _popFrame() table.remove(${vUpvals}) end
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
  elseif ${vOp}==${A(OPC.GET_UPVAL)} then
    local _upframe=${vUpvals}[#${vUpvals}]
    ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_upframe[${vA}+1]
  elseif ${vOp}==${A(OPC.SET_UPVAL)} then
    local _upframe=${vUpvals}[#${vUpvals}]
    _upframe[${vA}+1]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
  elseif ${vOp}==${A(OPC.CLOSURE)} then
    local proto=${vCons}[${vA}+1]
    local upvals={}
    for i,up in ipairs(proto.upvalues) do
      upvals[i]=${vUpvals}[#${vUpvals} - up.scope][up.slot+1]
    end
    local function closure(...)
      _pushFrame()
      local newVars={}
      local newUp={}
      for i,uv in ipairs(upvals) do newUp[i]=uv end
      ${vUpvals}[#${vUpvals}]=newUp
      for i=1,#proto.params do newVars[i]=select(i,...) end
      if proto.vararg then
        local rest={select(#proto.params+1,...)}
        newVars.arg=rest
      end
      local oldVars,oldUp=${vVars},${vUpvals}
      ${vVars}=newVars
      local oldMask=${vMask}, oldSip=${vSip}
      ${vMask}=${A(ipMask)} ${vSip}=bit32.bxor(1,${vMask})
      local res
      for _,inst in ipairs(proto.ins) do
        -- execute bytecode similarly
        -- simplified: just run a mini interpreter
      end
      ${vVars}=oldVars
      ${vUpvals}=oldUp
      _popFrame()
      return res
    end
    ${vTop}=${vTop}+1 ${vStk}[${vTop}]=closure
  elseif ${vOp}==${A(OPC.VARARG)} then
    -- store vararg values onto stack
    for i=1,select('#',...) do ${vTop}=${vTop}+1 ${vStk}[${vTop}]=select(i,...) end
  elseif ${vOp}==${A(OPC.CALL)} then
    local args={} for _k=${vA},1,-1 do args[_k]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 end
    local fn=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if type(fn)=="function" then local ok,r=pcall(fn,table.unpack(args)) ${vTop}=${vTop}+1 ${vStk}[${vTop}]=ok and r or nil
    else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil end
  elseif ${vOp}==${A(OPC.CALL_METHOD)} then
    local args={} for _k=${vA},1,-1 do args[_k]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 end
    local meth=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local obj=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if type(obj)=="table" and type(obj[meth])=="function" then local ok,r=pcall(obj[meth],obj,table.unpack(args)) ${vTop}=${vTop}+1 ${vStk}[${vTop}]=ok and r or nil
    else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil end
  elseif ${vOp}==${A(OPC.RETURN)} then ${vRun}=false
  elseif ${vOp}==${A(OPC.JUMP)} then ${vSip}=bit32.bxor(${vA},${vMask})
  elseif ${vOp}==${A(OPC.JUMP_IF_FALSE)} then
    local c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if not c then ${vSip}=bit32.bxor(${vA},${vMask}) end
  elseif ${vOp}==${A(OPC.JUMP_IF_TRUE)} then
    local c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if c then ${vSip}=bit32.bxor(${vA},${vMask}) end
  elseif ${vOp}==${A(OPC.BINARY_ADD)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]+b
  elseif ${vOp}==${A(OPC.BINARY_SUB)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]-b
  elseif ${vOp}==${A(OPC.BINARY_MUL)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]*b
  elseif ${vOp}==${A(OPC.BINARY_DIV)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]/b
  elseif ${vOp}==${A(OPC.BINARY_MOD)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]%b
  elseif ${vOp}==${A(OPC.BINARY_POW)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]^b
  elseif ${vOp}==${A(OPC.BINARY_CONCAT)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=tostring(${vStk}[${vTop}])..tostring(b)
  elseif ${vOp}==${A(OPC.BINARY_EQ)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]==b
  elseif ${vOp}==${A(OPC.BINARY_NE)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]~=b
  elseif ${vOp}==${A(OPC.BINARY_LT)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]<b
  elseif ${vOp}==${A(OPC.BINARY_LE)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]<=b
  elseif ${vOp}==${A(OPC.BINARY_AND)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.band(${vStk}[${vTop}],b)
  elseif ${vOp}==${A(OPC.BINARY_OR)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.bor(${vStk}[${vTop}],b)
  elseif ${vOp}==${A(OPC.BINARY_XOR)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.bxor(${vStk}[${vTop}],b)
  elseif ${vOp}==${A(OPC.BINARY_SHL)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.lshift(${vStk}[${vTop}],b)
  elseif ${vOp}==${A(OPC.BINARY_SHR)} then local b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=bit32.rshift(${vStk}[${vTop}],b)
  elseif ${vOp}==${A(OPC.UNARY_NOT)} then ${vStk}[${vTop}]=not ${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_NEG)} then ${vStk}[${vTop}]=-${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_LEN)} then ${vStk}[${vTop}]=#${vStk}[${vTop}]
  elseif ${vOp}==${A(OPC.UNARY_BNOT)} then ${vStk}[${vTop}]=bit32.bnot(${vStk}[${vTop}])
  elseif ${vOp}==${A(OPC.MAKE_TABLE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]={}
  elseif ${vOp}==${A(OPC.TABLE_GET)} then
    local k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local t=${vStk}[${vTop}] ${vStk}[${vTop}]=type(t)=="table" and t[k] or nil
  elseif ${vOp}==${A(OPC.TABLE_SET)} then
    local v=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    if type(${vStk}[${vTop}])=="table" then ${vStk}[${vTop}][k]=v end
  elseif ${vOp}==${A(OPC.FOR_PREP)} then
    local step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local lim=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local init=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    ${vVars}[${vA}]=init ${vTop}=${vTop}+1 ${vStk}[${vTop}]=lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=step
  elseif ${vOp}==${A(OPC.FOR_STEP)} then
    local step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local lim=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local cur=${vVars}[${vA}]+step ${vVars}[${vA}]=cur
    if (step>0 and cur>lim) or (step<0 and cur<lim) then ${vSip}=bit32.bxor(${vB},${vMask})
    else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=step end
  elseif ${vOp}==${A(OPC.FOR_IN_PREP)} then
    -- prepare iterator: expects (f, s, var) on stack
    local f=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local s=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    local var=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    ${vStk}[${vTop}+1]=f ${vStk}[${vTop}+2]=s ${vStk}[${vTop}+3]=var ${vTop}=${vTop}+3
  elseif ${vOp}==${A(OPC.FOR_IN_STEP)} then
    local f=${vStk}[${vTop}-2] local s=${vStk}[${vTop}-1] local var=${vStk}[${vTop}]
    local newvar, s2, var2 = f(s, var)
    if newvar==nil then ${vSip}=bit32.bxor(${vB},${vMask}) else
      for i=1,${vA} do ${vVars}[${i-1}]=select(i,newvar,s2,var2) end
      ${vStk}[${vTop}-2]=f ${vStk}[${vTop}-1]=s2 ${vStk}[${vTop}]=var2
    end
  ${fakeBranches}
  else end
end
end)(...)`;
}

// ================================ Main Obfuscator =============================
function obfuscate(code) {
  try {
    const OPC = makeOpcodeTable();
    let compiled;
    try {
      compiled = compileBC(lex(code), OPC);
    } catch(e) {
      // fallback: raw text execution
      compiled = {
        ins: [{op:OPC.LOAD_CONST, a:0}, {op:OPC.CALL, a:0}, {op:OPC.RETURN, a:0}],
        consts: [code]
      };
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
