'use strict';
const crypto = require('crypto');

// ── Crypto ────────────────────────────────────────────────────────────────────
function randomBytes(n) {
  try { return [...crypto.randomBytes(n)]; }
  catch { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return [...b]; }
}
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// ── Variable names ────────────────────────────────────────────────────────────
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function v()  { let n='_'; for(let i=0;i<6;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }
function v2() { let n='_'; for(let i=0;i<9;i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }

// ── Arithmetic obfuscation — 10 forms ─────────────────────────────────────────
function Arith(n) {
  const t=ri(0,9), a=ri(1,99999), b=ri(1,99999);
  switch(t){
    case 0: return `${n+a}-${a}`;
    case 1: return `${a}-(${a-n})`;
    case 2: return `bit32.bxor(${(n^a)>>>0},${a})`;
    case 3: return `(${n*a})/${a}`;
    case 4: return `(${n+a+b})-(${a+b})`;
    case 5: return `(function() return ${a+n}-${a} end)()`;
    case 6: return `${n+a}-${a}`;
    case 7: return `bit32.band(${n+a}-${a},${0xFFFFFFFF})`;
    case 8: return `(${n+a*b}-${a*b})`;
    case 9: return `bit32.rshift(bit32.lshift(${n+a}-${a},${ri(1,9999)+1}-${ri(1,9999)+1}),${ri(1,9999)+0}-${ri(1,9999)+0})`;
    default: return `${n}`;
  }
}
const A = Arith;

function toLuaEscape(s) {
  return '"'+[...s].map(c=>'\\'+String(c.charCodeAt(0)).padStart(3,'0')).join('')+'"';
}

// ── DJB2 ──────────────────────────────────────────────────────────────────────
function djb2(bytes) {
  let h=5381;
  for(const b of bytes) h=(((h<<5)>>>0)+h+b)>>>0;
  return h>>>0;
}
function luaDjb2(iv) {
  const vh=v(),vi=v(),vb=v();
  return `(function() local ${vh}=${A(5381)} for ${vi}=1,#${iv} do local ${vb}=${iv}:byte(${vi}) ${vh}=bit32.band(bit32.lshift(${vh},${A(5)})+${vh}+${vb},${A(0xFFFFFFFF)}) end return ${vh} end)()`;
}

// ── RC4 ───────────────────────────────────────────────────────────────────────
function rc4(data, key) {
  const s=Array.from({length:256},(_,i)=>i); let j=0;
  for(let i=0;i<256;i++){j=(j+s[i]+key[i%key.length])%256;[s[i],s[j]]=[s[j],s[i]];}
  let ci=0; j=0;
  return data.map(b=>{ci=(ci+1)%256;j=(j+s[ci])%256;[s[ci],s[j]]=[s[j],s[ci]];return b^s[(s[ci]+s[j])%256];});
}

// ── Layer 2: position-dependent XOR ──────────────────────────────────────────
function xorLayer(data, key) {
  return data.map((b,i)=>b^((key[i%key.length]^((i*0xA3)&0xFF))&0xFF));
}

// ── Layer 3: block shuffle (LCG) ─────────────────────────────────────────────
function lcg(s) { return ((s*1664525+1013904223)>>>0); }
function blockShuffle(data, nBlocks, seed) {
  const bSz=Math.ceil(data.length/nBlocks);
  const blocks=[];
  for(let i=0;i<nBlocks;i++){ const sl=data.slice(i*bSz,(i+1)*bSz); if(sl.length)blocks.push(sl); }
  const n=blocks.length, perm=Array.from({length:n},(_,i)=>i);
  let s=seed;
  for(let i=n-1;i>0;i--){s=lcg(s);const j=s%(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}
  return { shuffled:perm.map(idx=>blocks[idx]), perm, n, bSz };
}

// ── String XOR (no plaintext in output) ──────────────────────────────────────
function makeXorStr(s) {
  const key=randomBytes(s.length).map(b=>(b&0x7F)||1);
  const enc=[...s].map((c,i)=>(c.charCodeAt(0)^key[i])&0xFF);
  const vT=v(),vK=v(),vO=v(),vI=v();
  return `(function() local ${vT}={${enc.join(',')}} local ${vK}={${key.join(',')}} local ${vO}={} for ${vI}=1,#${vT} do ${vO}[${vI}]=string.char(bit32.bxor(${vT}[${vI}],${vK}[${vI}])) end return table.concat(${vO}) end)()`;
}

// ── Opcode table: real (1-120) + fake (130-253) ───────────────────────────────
function makeOpcodeTable() {
  const names=[
    'LOAD_CONST','LOAD_VAR','STORE_VAR','GET_GLOBAL','SET_GLOBAL',
    'CALL','CALL_METHOD','RETURN','LOAD_NIL','LOAD_TRUE','LOAD_FALSE','LOAD_NUMBER',
    'BINARY_ADD','BINARY_SUB','BINARY_MUL','BINARY_DIV','BINARY_MOD','BINARY_POW',
    'BINARY_CONCAT','BINARY_EQ','BINARY_NE','BINARY_LT','BINARY_LE',
    'BINARY_AND','BINARY_OR','UNARY_NOT','UNARY_NEG','UNARY_LEN',
    'JUMP','JUMP_IF_FALSE','JUMP_IF_TRUE','MAKE_TABLE','TABLE_GET','TABLE_SET',
    'FOR_PREP','FOR_STEP','PUSH_SCOPE','POP_SCOPE',
  ];
  const used=new Set(); const ids=[];
  while(ids.length<names.length){const x=ri(1,120);if(!used.has(x)){ids.push(x);used.add(x);}}
  const T={}; names.forEach((n,i)=>{T[n]=ids[i];});
  const fakes=[];
  while(fakes.length<20){const x=ri(130,253);if(!used.has(x)){fakes.push(x);used.add(x);}}
  T._fakes=fakes;
  return T;
}

// ── CFF ───────────────────────────────────────────────────────────────────────
function makeOpcodes(realCount, fakeCount) {
  const total=realCount+fakeCount; const nums=new Set();
  while(nums.size<total) nums.add(ri(1000000,999999999));
  const all=[...nums].sort((a,b)=>a-b); const ri2=new Set();
  while(ri2.size<realCount) ri2.add(ri(0,total-1));
  return {
    reals: all.filter((_,i)=>ri2.has(i)).sort((a,b)=>a-b).map(val=>({val,expr:A(val)})),
    fakes: all.filter((_,i)=>!ri2.has(i)).map(val=>({val})),
  };
}

function cffWrap(src) {
  const lines=src.split('\n'); const chunks=[]; let cur=[];
  for(const ln of lines){
    cur.push(ln);
    if(cur.length>=ri(4,9)||ln.trim()===''){if(cur.some(l=>l.trim()))chunks.push(cur.join('\n'));cur=[];}
  }
  if(cur.some(l=>l.trim())) chunks.push(cur.join('\n'));
  if(!chunks.length) return src;
  const{reals}=makeOpcodes(chunks.length+1,chunks.length);
  const sv=v();
  let out=`local ${sv}=${reals[0].expr}\nwhile ${sv} do\n`;
  for(let i=0;i<chunks.length;i++){
    const next=i<chunks.length-1?reals[i+1].expr:'false';
    out+=(i===0?`  if ${sv}==${reals[i].expr} then\n`:`  elseif ${sv}==${reals[i].expr} then\n`);
    out+=chunks[i].split('\n').map(l=>'    '+l).join('\n')+'\n';
    out+=`    ${sv}=${next}\n`;
  }
  out+=`  else\n    ${sv}=false\n  end\nend\n`;
  return out;
}

// ── Junk ──────────────────────────────────────────────────────────────────────
function opTrue() {
  const x=v(),y=v();
  const F=[
    ()=>`(function() local ${x}=${A(ri(1,999))} return ${x}*${x}>=(${A(0)}-${A(0)}) end)()`,
    ()=>`(function() local ${x}=${A(ri(1,9999))} return ${x}+${x}==(${A(1)}-${A(1)}+2)*${x} end)()`,
    ()=>`(function() local ${x}=${A(ri(1,9999))} return bit32.band(${x},${A(0)}-${A(0)})==(${A(0)}-${A(0)}) end)()`,
  ];
  return F[ri(0,F.length-1)]();
}
function opFalse() {
  const x=v(),y=v();
  const F=[
    ()=>`(function() local ${x}=${A(ri(1,999))} return ${x}*${x}<(${A(0)}-${A(0)}) end)()`,
    ()=>`(function() local ${x}=${A(ri(1,999))} return ${x}~=${x} end)()`,
    ()=>`(function() local ${x}=${A(ri(2,998)*2)} return ${x}%2~=0 end)()`,
    ()=>`(function() local ${x}=${A(ri(1,9999))} local ${y}=${x}+1 return ${y}==${x} end)()`,
  ];
  return F[ri(0,F.length-1)]();
}
function junkLine() {
  const a=v(),b=v(),c=v(),d=v(); const t=ri(0,9);
  switch(t){
    case 0: return `local ${a}=${A(ri(100,9999))} local ${b}=${a}*(${A(1)})-(${A(ri(1,99))})`;
    case 1: return `local ${a}={${A(ri(1,9))};${A(ri(10,99))}} local ${b}=${a}[${A(1)}-${A(0)}] or ${A(ri(1,999))}`;
    case 2: return `if ${opFalse()} then local ${a}=${A(ri(1,9999))} local ${b}=${a}+${A(ri(1,99))} end`;
    case 3: return `if ${opTrue()} then local ${a}=${A(ri(1,9999))} local ${b}=${a}-${A(0)} end`;
    case 4: return `local ${a}=tostring(${A(ri(1,9999))}) local ${b}=#${a}+${A(0)}-${A(0)}`;
    case 5: return `local ${a}=${A(ri(10,999))} local ${b}=${A(ri(10,999))} local ${c}=${a}*${b}-${b}*${a}+${A(0)}`;
    case 6: return `local ${a}=bit32.bxor(${A(ri(1,0xFFFF))},${A(ri(1,0xFFFF))}) local ${b}=bit32.band(${a},${A(0)})`;
    case 7: return `do local ${a}=${A(ri(1,99))} local ${b}=${a}*${a} local ${c}=${b}-${a}*${a} end`;
    case 8: return `local ${a}={} ${a}=nil`;
    case 9: return `local ${a}=type(nil) local ${b}=#${a}`;
    default: return `local ${a}=${A(0)}`;
  }
}
function junkTbl() {
  const t=v(),k=v(),u=v(),n1=ri(100000,9999999);
  return `local ${t}={[${A(ri(1,9))}]=${A(ri(10,999))};[${A(ri(1,9))}]=${A(ri(10,999))}} local ${k}=${A(n1)} local ${u}=${t}[${A(1)}] or ${k}-(${A(n1-ri(1,99))}) if ${opFalse()} then ${u}=${u}+1 end`;
}
function bigJunk(n) {
  const p=[];
  for(let i=0;i<n;i++) p.push(junkLine());
  for(let i=0;i<Math.ceil(n/2);i++) p.push(junkTbl());
  for(let i=p.length-1;i>0;i--){const j=ri(0,i);[p[i],p[j]]=[p[j],p[i]];}
  return p.join('\n');
}

// ── Lexer ─────────────────────────────────────────────────────────────────────
const KW=new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while']);
function lex(src) {
  const tokens=[]; let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){i++;continue;}
    if(src.slice(i,i+2)==='--'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(src.slice(i,i+2)==='[['){let j=i+2;while(j<src.length){if(src[j]===']'&&src[j+1]===']'){j+=2;break;}j++;}tokens.push({t:'STRING',v:src.slice(i+2,j-2)});i=j;continue;}
    if(src[i]==='"'||src[i]==="'"){const q=src[i];let s='';i++;while(i<src.length&&src[i]!==q){if(src[i]==='\\'){i++;s+=src[i]||'';}else s+=src[i];i++;}i++;tokens.push({t:'STRING',v:s});continue;}
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&/[0-9]/.test(src[i+1]||''))){let s='';if(src.slice(i,i+2).toLowerCase()==='0x'){s='0x';i+=2;while(/[0-9a-fA-F]/.test(src[i]||''))s+=src[i++];}else{while(/[0-9._e+\-]/.test(src[i]||''))s+=src[i++];}tokens.push({t:'NUMBER',v:Number(s)});continue;}
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
  const pk=()=>tokens[pos],nx=()=>tokens[pos++],ck=v=>tokens[pos].v===v,eof=()=>tokens[pos].t==='EOF';
  function eat(v){if(ck(v))nx();else nx();}
  function addC(val){let i=consts.indexOf(val);if(i===-1){i=consts.length;consts.push(val);}return i;}
  function emit(op,a,b,c){ins.push({op,a:a??0,b:b??0,c:c??0});return ins.length-1;}
  function patch(i,t){ins[i].a=t;}
  function resV(n){for(let i=scopes.length-1;i>=0;i--)if(scopes[i][n]!==undefined)return scopes[i][n];return null;}
  function decV(n){const s=nSlot++;scopes[scopes.length-1][n]=s;return s;}
  const gPrec=op=>{if(op==='or')return 1;if(op==='and')return 2;if(['<','>','<=','>=','==','~='].includes(op))return 3;if(op==='..')return 4;if(['+','-'].includes(op))return 5;if(['*','/','%','//'].includes(op))return 6;if(op==='^')return 7;return 0;};
  function pExpr(mp=0){pU();while(true){const op=pk().v,pr=gPrec(op);if(pr<=mp)break;nx();pExpr(op==='..'||op==='^'?pr-1:pr);const bop={'+':OPC.BINARY_ADD,'-':OPC.BINARY_SUB,'*':OPC.BINARY_MUL,'/':OPC.BINARY_DIV,'%':OPC.BINARY_MOD,'^':OPC.BINARY_POW,'..':OPC.BINARY_CONCAT,'==':OPC.BINARY_EQ,'~=':OPC.BINARY_NE,'<':OPC.BINARY_LT,'<=':OPC.BINARY_LE,'>':OPC.BINARY_LT,'>=':OPC.BINARY_LE,'and':OPC.BINARY_AND,'or':OPC.BINARY_OR}[op];if(bop)emit(bop);}}
  function pU(){const t=pk();if(t.v==='not'){nx();pU();emit(OPC.UNARY_NOT);}else if(t.v==='-'){nx();pU();emit(OPC.UNARY_NEG);}else if(t.v==='#'){nx();pU();emit(OPC.UNARY_LEN);}else pP();}
  function pArgs(){let c=0;if(ck('(')){eat('(');while(!ck(')')&&!eof()){pExpr();c++;if(ck(','))nx();}eat(')');}else if(pk().t==='STRING'){emit(OPC.LOAD_CONST,addC(nx().v));c=1;}else if(ck('{')){pTbl();c=1;}return c;}
  function pSfx(){while(true){const t=pk();if(t.v==='.'){nx();const f=nx();emit(OPC.LOAD_CONST,addC(f.v));emit(OPC.TABLE_GET);}else if(t.v==='['){nx();pExpr();eat(']');emit(OPC.TABLE_GET);}else if(t.v===':'){nx();const m=nx();emit(OPC.LOAD_CONST,addC(m.v));emit(OPC.CALL_METHOD,pArgs());}else if(t.v==='('||t.t==='STRING'||t.v==='{'){emit(OPC.CALL,pArgs());}else break;}}
  function pTbl(){eat('{');emit(OPC.MAKE_TABLE);while(!ck('}')&&!eof()){if(ck('[')){nx();pExpr();eat(']');eat('=');pExpr();emit(OPC.TABLE_SET);}else if(pk().t==='NAME'&&tokens[pos+1]?.v==='='){const k=nx().v;nx();emit(OPC.LOAD_CONST,addC(k));pExpr();emit(OPC.TABLE_SET);}else{pExpr();emit(OPC.TABLE_SET);}if(ck(',')||ck(';'))nx();}eat('}');}
  function pP(){const t=pk();if(t.t==='NUMBER'){nx();emit(OPC.LOAD_NUMBER,t.v);pSfx();}else if(t.t==='STRING'){nx();emit(OPC.LOAD_CONST,addC(t.v));pSfx();}else if(t.t==='KEYWORD'){if(t.v==='nil'){nx();emit(OPC.LOAD_NIL);}else if(t.v==='true'){nx();emit(OPC.LOAD_TRUE);}else if(t.v==='false'){nx();emit(OPC.LOAD_FALSE);}else if(t.v==='function'){nx();skFn();}else nx();}else if(t.t==='NAME'){nx();const sl=resV(t.v);sl!==null?emit(OPC.LOAD_VAR,sl):emit(OPC.GET_GLOBAL,addC(t.v));pSfx();}else if(t.v==='('){eat('(');pExpr();eat(')');pSfx();}else if(t.v==='{'){pTbl();}else nx();}
  function skFn(){eat('(');while(!ck(')')&&!eof())nx();eat(')');let d=1;while(!eof()&&d>0){const t=nx();if(t.t==='KEYWORD'&&['function','do','if','while','for','repeat'].includes(t.v))d++;if(t.t==='KEYWORD'&&(t.v==='end'||t.v==='until'))d--;}}
  function pBlk(){scopes.push({});while(!eof()){const t=pk();if(t.t==='EOF')break;if(t.t==='KEYWORD'&&['end','else','elseif','until'].includes(t.v))break;pStmt();}scopes.pop();}
  function pStmt(){const t=pk();if(t.t==='KEYWORD'){switch(t.v){case 'local':pLoc();return;case 'if':pIf();return;case 'while':pWhl();return;case 'for':pFor();return;case 'return':pRet();return;case 'function':pFnD();return;case 'do':nx();pBlk();eat('end');return;case 'repeat':pRep();return;case 'break':nx();emit(OPC.JUMP,0);return;case 'end':case 'else':case 'elseif':case 'until':return;default:nx();return;}}pES();}
  function pLoc(){eat('local');if(pk().t==='KEYWORD'&&pk().v==='function'){nx();const n=nx().v;skFn();emit(OPC.STORE_VAR,decV(n));return;}const ns=[];while(pk().t==='NAME'){ns.push(nx().v);if(!ck(','))break;nx();}if(ck('=')){nx();ns.forEach((_,i)=>{pExpr();if(ck(','))nx();});}else ns.forEach(()=>emit(OPC.LOAD_NIL));ns.forEach(n=>{emit(OPC.STORE_VAR,decV(n));});}
  function pIf(){eat('if');pExpr();eat('then');const jF=emit(OPC.JUMP_IF_FALSE,0);pBlk();const jE=[];while(ck('elseif')||ck('else')){jE.push(emit(OPC.JUMP,0));patch(jF,ins.length);if(ck('elseif')){nx();pExpr();eat('then');jE.push(emit(OPC.JUMP_IF_FALSE,0));pBlk();}else{nx();pBlk();break;}}if(ck('end'))nx();const ep=ins.length;jE.forEach(j=>patch(j,ep));if(!jE.length)patch(jF,ep);}
  function pWhl(){eat('while');const top=ins.length;pExpr();eat('do');const jF=emit(OPC.JUMP_IF_FALSE,0);pBlk();eat('end');emit(OPC.JUMP,top);patch(jF,ins.length);}
  function pFor(){eat('for');const n=nx().v;if(ck('=')){nx();pExpr();eat(',');pExpr();if(ck(',')){nx();pExpr();}eat('do');const sl=decV(n);emit(OPC.FOR_PREP,sl);const top=ins.length;pBlk();eat('end');emit(OPC.FOR_STEP,sl,top);}else{while(!eof()&&!(pk().t==='KEYWORD'&&pk().v==='end'))nx();if(ck('end'))nx();}}
  function pRet(){eat('return');let c=0;if(!eof()&&!(pk().t==='KEYWORD'&&['end','else','elseif','until'].includes(pk().v))){pExpr();c++;while(ck(',')){nx();pExpr();c++;}}emit(OPC.RETURN,c);}
  function pFnD(){eat('function');const n=nx().v;skFn();const sl=resV(n);if(sl!==null)emit(OPC.STORE_VAR,sl);else{emit(OPC.GET_GLOBAL,addC(n));emit(OPC.SET_GLOBAL);}}
  function pRep(){eat('repeat');const top=ins.length;pBlk();eat('until');pExpr();emit(OPC.JUMP_IF_FALSE,top);}
  function pES(){pP();if(ck('=')){nx();pExpr();emit(OPC.SET_GLOBAL);}}
  pBlk(); emit(OPC.RETURN,0);
  return {ins, consts};
}

// ── Inject fake opcodes (~30%) ────────────────────────────────────────────────
function injectFakes(ins, fakeIds) {
  const out=[];
  for(const i of ins){
    if(Math.random()<0.30){const nf=ri(1,2);for(let k=0;k<nf;k++) out.push({op:fakeIds[ri(0,fakeIds.length-1)],a:ri(0,200),b:ri(0,200),c:ri(0,200)});}
    out.push(i);
  }
  return out;
}

// ── Serializer ────────────────────────────────────────────────────────────────
function serialize(ins, consts) {
  const bytes=[];
  const u8=n=>bytes.push(n&0xFF);
  const i16=n=>{const x=n&0xFFFF;bytes.push(x&0xFF);bytes.push((x>>8)&0xFF);};
  const i32=n=>{const x=n>>>0;bytes.push(x&0xFF);bytes.push((x>>8)&0xFF);bytes.push((x>>16)&0xFF);bytes.push((x>>24)&0xFF);};
  const f64=f=>{const dv=new DataView(new ArrayBuffer(8));dv.setFloat64(0,f,false);for(let i=0;i<8;i++)bytes.push(dv.getUint8(i));};
  const str=s=>{const e=[...s].map(c=>c.charCodeAt(0)&0xFF);i16(e.length);for(const b of e)u8(b);};
  [0x53,0x4C,0x49,0x42].forEach(u8); u8(8); i16(consts.length);
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
    u8(inst.c&0xFF);
  }
  return bytes;
}

// ── VM Emitter ────────────────────────────────────────────────────────────────
function emitVM(shuffleResult, rc4Key, xorKey, rawChecksum, OPC) {
  const vEnv=v2(),vVars=v2(),vStk=v2(),vTop=v2(),vIns=v2(),vCons=v2();
  const vIp=v2(),vIpMask=v2(),vSip=v2(),vRun=v2(),vCur=v2(),vOp=v2(),vA=v2(),vB=v2();
  const vU8=v2(),vI16=v2(),vI32=v2(),vStr=v2(),vBytes=v2(),vIdx=v2();
  const vRc4S=v2(),vRc4I=v2(),vRc4J=v2(),vRc4KL=v2(),vRc4Key=v2();
  const vXorKey=v2(),vDec=v2(),vBlks=v2(),vPerm=v2(),vPay=v2();
  const vCs=v2(),vChk=v2();
  const vK1=v(),vK2=v(),vK3=v(),vX1=v(),vX2=v();

  const xI=makeXorStr('Instance'), xD=makeXorStr('DataModel');
  const xGS=makeXorStr('GetService'), xPl=makeXorStr('Players');
  const xLP=makeXorStr('LocalPlayer'), xKk=makeXorStr('Kick');
  const xKm=makeXorStr('Security violation.');

  const csExpr=`${rawChecksum+ri(1,99999)}-${ri(1,99999)}`;
  const kL=rc4Key.length, kM1=Math.floor(kL/3), kM2=Math.floor(kL*2/3);
  const xL=xorKey.length, xM=Math.floor(xL/2);
  const ipMask=ri(0x1000,0xFFFF);

  // Fragmented payload chunks
  const fragVars=[], fragDecls=[];
  for(let i=0;i<shuffleResult.n;i++){
    const vn=v2(); fragVars.push(vn);
    let s='"'; for(const b of shuffleResult.shuffled[i]) s+='\\'+String(b).padStart(3,'0');
    fragDecls.push(`local ${vn}=${s}"`);
  }

  // Fake dispatch branches
  const fakeBranches=OPC._fakes.slice(0,5).map(fop=>{
    const _d=v(); return `elseif ${vOp}==${A(fop)} then local ${_d}=${A(0)}`;
  });

  return `[[ obfuscated by soli v8.0 ]]
do
  ${bigJunk(4)}
  local _ei=${xI} local _ed=${xD}
  if not(typeof~=nil and typeof(game)==_ei and game.ClassName==_ed) then return end
  _ei=nil _ed=nil

  local function _kick()
    pcall(function()
      local _gs=${xGS} local _pl=${xPl} local _lp=${xLP} local _kk=${xKk} local _km=${xKm}
      local _s=game[_gs](game,_pl) local _p=_s[_lp] _p[_kk](_p,_km)
    end)
  end
  ${bigJunk(3)}

  ${fragDecls.join('\n  ')}
  local ${vPerm}={${shuffleResult.perm.join(',')}}
  local ${vBlks}={}
  local _fv={${fragVars.join(',')}}
  for ${vIdx}=1,#${vPerm} do ${vBlks}[${vPerm}[${vIdx}]+1]=_fv[${vIdx}] end
  local ${vPay}=table.concat(${vBlks})
  _fv=nil ${vBlks}=nil ${vPerm}=nil
  ${fragVars.map(n=>`${n}=nil`).join(' ')}
  ${bigJunk(2)}

  local ${vX1}=${toLuaEscape(xorKey.slice(0,xM).map(b=>String.fromCharCode(b)).join(''))}
  local ${vX2}=${toLuaEscape(xorKey.slice(xM).map(b=>String.fromCharCode(b)).join(''))}
  local ${vXorKey}=${vX1}..${vX2} ${vX1}=nil ${vX2}=nil
  local ${vDec}={}
  do
    local _xkl=#${vXorKey}
    for ${vIdx}=1,#${vPay} do
      local _xb=string.byte(${vXorKey},(${vIdx}-1)%_xkl+1)
      local _xm=bit32.band(bit32.bxor(_xb,bit32.band((${vIdx}-1)*${A(0xA3)},${A(0xFF)})),${A(0xFF)})
      ${vDec}[${vIdx}]=string.char(bit32.bxor(string.byte(${vPay},${vIdx}),_xm))
    end
  end
  ${vPay}=nil ${vXorKey}=nil
  local _xd=table.concat(${vDec}) ${vDec}=nil
  ${bigJunk(2)}

  local ${vK1}=${toLuaEscape(rc4Key.slice(0,kM1).map(b=>String.fromCharCode(b)).join(''))}
  local ${vK2}=${toLuaEscape(rc4Key.slice(kM1,kM2).map(b=>String.fromCharCode(b)).join(''))}
  local ${vK3}=${toLuaEscape(rc4Key.slice(kM2).map(b=>String.fromCharCode(b)).join(''))}
  local ${vRc4Key}=${vK1}..${vK2}..${vK3} ${vK1}=nil ${vK2}=nil ${vK3}=nil
  local ${vRc4S}={}
  for ${vIdx}=0,255 do ${vRc4S}[${vIdx}]=${vIdx} end
  local ${vRc4J}=0 local ${vRc4KL}=#${vRc4Key}
  for ${vIdx}=0,255 do
    ${vRc4J}=(${vRc4J}+${vRc4S}[${vIdx}]+string.byte(${vRc4Key},(${vIdx}%${vRc4KL})+1))%256
    ${vRc4S}[${vIdx}],${vRc4S}[${vRc4J}]=${vRc4S}[${vRc4J}],${vRc4S}[${vIdx}]
  end
  ${vRc4Key}=nil
  local ${vRc4I}=0 ${vRc4J}=0
  local _r2={}
  for ${vIdx}=1,#_xd do
    ${vRc4I}=(${vRc4I}+1)%256
    ${vRc4J}=(${vRc4J}+${vRc4S}[${vRc4I}])%256
    ${vRc4S}[${vRc4I}],${vRc4S}[${vRc4J}]=${vRc4S}[${vRc4J}],${vRc4S}[${vRc4I}]
    _r2[${vIdx}]=string.char(bit32.bxor(string.byte(_xd,${vIdx}),${vRc4S}[(${vRc4S}[${vRc4I}]+${vRc4S}[${vRc4J}])%256]))
  end
  _xd=nil ${vRc4S}=nil
  local ${vBytes}=table.concat(_r2) _r2=nil
  ${bigJunk(2)}

  local ${vCs}=${csExpr}
  local ${vChk}=${A(0x1337)}
  for ${vIdx}=1,#${vBytes} do
    ${vChk}=bit32.band(${vChk}*${A(31)}+string.byte(${vBytes},${vIdx}),${A(0xFFFFFFFF)})
  end
  if ${vChk}~=${vCs} then _kick() return end
  ${vChk}=nil ${vCs}=nil
  ${bigJunk(2)}

  local _ip=1
  local function ${vU8}() local b=string.byte(${vBytes},_ip) _ip=_ip+1 return b or 0 end
  local function ${vI16}() return ${vU8}()+${vU8}()*${A(256)} end
  local function ${vI32}() return ${vU8}()+${vU8}()*${A(256)}+${vU8}()*${A(65536)}+${vU8}()*${A(16777216)} end
  local function ${vStr}()
    local n=${vI16}() local t={}
    for ${vIdx}=1,n do t[${vIdx}]=string.char(${vU8}()) end
    return table.concat(t)
  end
  local _mg={${vU8}(),${vU8}(),${vU8}(),${vU8}()}
  if _mg[1]~=${A(0x53)} or _mg[2]~=${A(0x4C)} or _mg[3]~=${A(0x49)} or _mg[4]~=${A(0x42)} then _kick() return end
  ${vU8}()
  local ${vCons}={}
  for ${vIdx}=1,${vI16}() do
    local _ct=${vU8}()
    if _ct==${A(1)} then ${vCons}[${vIdx}]=${vStr}()
    elseif _ct==${A(2)} then
      local _fb={} for _k=1,${A(8)} do _fb[_k]=${vU8}() end
      local _ok,_fv=pcall(string.unpack,">d",string.char(table.unpack(_fb)))
      ${vCons}[${vIdx}]=_ok and _fv or 0
    elseif _ct==${A(3)} then ${vCons}[${vIdx}]=${vU8}()==${A(1)}
    else ${vCons}[${vIdx}]=nil end
  end
  local ${vIns}={}
  for ${vIdx}=1,${vI32}() do
    local _op=${vU8}() local _at=${vU8}() local _av=0
    if _at==${A(1)} then local lo=${vU8}() local hi=${vU8}() _av=lo+hi*${A(256)} if _av>=${A(32768)} then _av=_av-${A(65536)} end
    elseif _at==${A(2)} then _av=${vI32}()
    elseif _at==${A(3)} then local _fb={} for _k=1,${A(8)} do _fb[_k]=${vU8}() end local _ok,_fv=pcall(string.unpack,">d",string.char(table.unpack(_fb))) _av=_ok and _fv or 0 end
    local _bt=${vU8}() local _bv=0
    if _bt==${A(1)} then local lo=${vU8}() local hi=${vU8}() _bv=lo+hi*${A(256)} end
    ${vIns}[${vIdx}]={_op,_av,_bv}
  end
  ${vBytes}=nil
  ${bigJunk(2)}

  local ${vStk}={} local ${vTop}=0
  local ${vEnv}=(getfenv and getfenv(1)) or _G
  local ${vVars}={}
  local ${vIpMask}=${A(ipMask)}
  local ${vSip}=bit32.bxor(${A(1)},${vIpMask})
  local ${vRun}=true
  while ${vRun} do
    local _rip=bit32.bxor(${vSip},${vIpMask})
    if _rip>#${vIns} then break end
    local ${vCur}=${vIns}[_rip]
    local ${vOp}=${vCur}[1] local ${vA}=${vCur}[2] local ${vB}=${vCur}[3]
    ${vSip}=bit32.bxor(_rip+${A(1)},${vIpMask})
    if ${vOp}==${A(OPC.LOAD_CONST)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vCons}[${vA}+1]
    elseif ${vOp}==${A(OPC.LOAD_NUMBER)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vA}
    elseif ${vOp}==${A(OPC.LOAD_NIL)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil
    elseif ${vOp}==${A(OPC.LOAD_TRUE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=true
    elseif ${vOp}==${A(OPC.LOAD_FALSE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=false
    elseif ${vOp}==${A(OPC.LOAD_VAR)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vVars}[${vA}]
    elseif ${vOp}==${A(OPC.STORE_VAR)} then ${vVars}[${vA}]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
    elseif ${vOp}==${A(OPC.GET_GLOBAL)} then local _k=${vCons}[${vA}+1] ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vEnv}[_k]
    elseif ${vOp}==${A(OPC.SET_GLOBAL)} then
      local _v=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vEnv}[_k]=_v
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
    elseif ${vOp}==${A(OPC.JUMP)} then ${vSip}=bit32.bxor(${vA},${vIpMask})
    elseif ${vOp}==${A(OPC.JUMP_IF_FALSE)} then
      local _c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      if not _c then ${vSip}=bit32.bxor(${vA},${vIpMask}) end
    elseif ${vOp}==${A(OPC.JUMP_IF_TRUE)} then
      local _c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      if _c then ${vSip}=bit32.bxor(${vA},${vIpMask}) end
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
      local _lim=${vStk}[${vTop}]  ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      local _init=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      ${vVars}[${vA}]=_init ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_step
    elseif ${vOp}==${A(OPC.FOR_STEP)} then
      local _step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      local _lim=${vStk}[${vTop}]  ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
      local _cur=${vVars}[${vA}]+_step ${vVars}[${vA}]=_cur
      if (_step>${A(0)} and _cur>_lim) or (_step<${A(0)} and _cur<_lim) then ${vSip}=bit32.bxor(${vB},${vIpMask})
      else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_step end
    ${fakeBranches.join('\n    ')}
    else end
  end
end`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function obfuscateV8(code) {
  try {
    const OPC = makeOpcodeTable();

    // 1. Compile to bytecode
    let compiled;
    try { 
      compiled = compileBC(lex(code), OPC); 
    } catch (e) {
      compiled = {
        ins: [
          { op: OPC.LOAD_CONST, a: 0, b: 0, c: 0 },
          { op: OPC.CALL, a: 0, b: 0, c: 0 },
          { op: OPC.RETURN, a: 0, b: 0, c: 0 }
        ],
        consts: [code],
      };
    }

    // 2. Inject fake opcodes
    compiled.ins = injectFakes(compiled.ins, OPC._fakes);

    // 3. Serialize to bytes
    const rawBytes = serialize(compiled.ins, compiled.consts);

    // 4. Checksum BEFORE encryption
    let cs = 0x1337;
    for (const b of rawBytes) {
      cs = ((cs * 31 + b) & 0xFFFFFFFF) >>> 0;
    }
       const rawChecksum = cs >>> 0;

 
    // 5. Triple encrypt
    const rc4Key  = randomBytes(ri(16, 24));
    const xorKey  = randomBytes(ri(10, 16));
    const nBlocks = ri(12, 20);
    const seed    = ri(0x1000, 0xFFFFFFFF);

    const rc4Bytes = rc4(rawBytes, rc4Key);
    const xorBytes = xorLayer(rc4Bytes, xorKey);
    const shuffled = blockShuffle(xorBytes, nBlocks, seed);

    // 6. Emit Lua VM
    const vmLuaCode = emitVM(shuffled, rc4Key, xorKey, rawChecksum, OPC);

    // 7. Compact output
  const bodyCompact = vmLuaCode
  .replace(/--\[\[.*?\]\]/gs, '')
  .replace(/--.*$/gm, '')
  .replace(/[\r\n]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .replace(/^0+/, '')
  .trim();

    return + "\n" + bodyCompact;

  } catch (err) {
    throw new Error("Obfuscation Failed: " + err.message);
  }
}

module.exports = { obfuscateV8 };
