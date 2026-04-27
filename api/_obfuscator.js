'use strict';
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════
function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function rb(n){try{return[...crypto.randomBytes(n)];}catch{const b=new Uint8Array(n);globalThis.crypto.getRandomValues(b);return[...b];}}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]];}return a;}

// Polymorphic variable name generator
function makeVarGen(){
  const used=new Set();
  const alpha='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return function vgen(prefix=''){
    let name;
    const len=ri(5,9);
    do{
      name=(prefix||'_')+[...Array(len)].map(()=>alpha[ri(0,alpha.length-1)]).join('');
    }while(used.has(name));
    used.add(name);return name;
  };
}

// ═══════════════════════════════════════════════════════════════════
//  CONSTANT OBFUSCATION (Luau-safe)
// ═══════════════════════════════════════════════════════════════════
function obfNum(n){
  if(!Number.isFinite(n)||!Number.isInteger(n))return String(n);
  if(n<-2147483648||n>2147483647)return String(n);
  const a=ri(1,999),b=ri(1,99);
  if(n<0)return`(${n+a}-${a})`;
  const t=ri(0,10);
  switch(t){
    case 0:return`(${n+a}-${a})`;
    case 1:return`(${a}-(${a-n}))`;
    case 2:return`(${n*a}/${a})`;
    case 3:return`(function()return ${n+a}-${a} end)()`;
    case 4:return`(math.floor((${n+a}-${a})/1))`;
    case 5:return`(select(2,false,${n+a}-${a}))`;
    case 6:return`(math.abs(${n+a})-${a})`;
    case 7:{const k=ri(1,0x7FFF);return`(bit32.bxor(bit32.bxor(${n},${k}),${k}))`;}
    case 8:return`(bit32.band(${n+a}-${a},4294967295))`;
    case 9:return`(${n+a+b}-(${a+b}))`;
    case 10:if(n>=0&&n<=20)return`(#"${'x'.repeat(n)}")`;return`(${n+a}-${a})`;
    default:return String(n);
  }
}
const N=obfNum;

// Constant string — ONLY \ddd (Luau 5.1 safe)
function luaStr(bytes){
  let s='"';for(const b of bytes)s+='\\'+String(b).padStart(3,'0');return s+'"';
}

// Opaque Predicates — always true/false but look complex
function opTrue(){
  const t=ri(0,5);
  const x=ri(1,9999),y=ri(1,9999);
  switch(t){
    case 0:return`(${x}*${x}>=(${N(0)}-${N(0)}))`;
    case 1:return`(${x}+${x}==(${N(1)}-${N(1)}+2)*${x})`;
    case 2:return`(bit32.band(${x},${N(0)}-${N(0)})==(${N(0)}-${N(0)}))`;
    case 3:return`(math.abs(${x})>=${N(0)})`;
    case 4:return`(${x}==${x})`;
    case 5:return`(type(nil)==type(nil))`;
    default:return`(1==1)`;
  }
}
function opFalse(){
  const t=ri(0,4);
  const x=ri(1,9999);
  switch(t){
    case 0:return`(${x}*${x}<(${N(0)}-${N(0)}))`;
    case 1:return`(${x}~=${x})`;
    case 2:return`(${ri(2,998)*2}%2~=0)`;
    case 3:return`(nil==true)`;
    case 4:return`(type(nil)=="number")`;
    default:return`(1==2)`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DEAD CODE / JUNK INJECTION
// ═══════════════════════════════════════════════════════════════════
function makeDeadCode(vgen,count=5){
  const lines=[];
  for(let i=0;i<count;i++){
    const a=vgen(),b=vgen(),c=vgen(),t=ri(0,9);
    switch(t){
      case 0:lines.push(`local ${a}=${N(ri(1,999))} local ${b}=${a}+${N(0)}-${N(0)}`);break;
      case 1:lines.push(`if ${opFalse()} then local ${a}=${N(ri(1,9999))} local ${b}=${a}+${N(1)} end`);break;
      case 2:lines.push(`if ${opTrue()} then local ${a}=${N(ri(1,999))} local ${b}=${a}-${N(0)} end`);break;
      case 3:lines.push(`local ${a}={} ${a}=nil`);break;
      case 4:lines.push(`do local ${a}=${N(ri(1,99))} local ${b}=${a}*${N(1)}-${N(0)} end`);break;
      case 5:lines.push(`local ${a}=(function()return ${N(ri(1,999))} end)()`);break;
      case 6:lines.push(`local ${a}=bit32.bxor(${N(ri(1,127))},${N(0)})`);break;
      case 7:lines.push(`local ${a}=${N(ri(10,999))} local ${b}=${a} local ${c}=${b}-${a}+${N(0)}`);break;
      case 8:lines.push(`do local ${a}=${N(ri(1,9))} local ${b}=${a}*${a} local ${c}=${b}-${a}*${a} end`);break;
      case 9:{const s='x'.repeat(ri(1,8));lines.push(`local ${a}=#"${s}"+${N(0)}-${N(0)}`);break;}
    }
  }
  return shuffle(lines).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
//  XOR STRING HIDER
// ═══════════════════════════════════════════════════════════════════
function hiddenStr(s,vgen){
  const key=rb(s.length).map(b=>(b&0x7F)|1);
  const enc=[...s].map((c,i)=>c.charCodeAt(0)^key[i]);
  const vt=vgen(),vk=vgen(),vo=vgen(),vi=vgen();
  return `(function()local ${vt}={${enc.map(N).join(',')}}local ${vk}={${key.map(N).join(',')}}local ${vo}={}for ${vi}=${N(1)},#${vt} do ${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}]))end return table.concat(${vo})end)()`;
}

// ═══════════════════════════════════════════════════════════════════
//  CONTROL FLOW FLATTENING
// ═══════════════════════════════════════════════════════════════════
function flattenCFF(chunks,vgen){
  if(!chunks||chunks.length===0)return'';
  if(chunks.length===1)return chunks[0];
  // assign random state IDs
  const stateVar=vgen();
  const ids=[];
  const usedIds=new Set();
  for(let i=0;i<chunks.length+1;i++){
    let id;do{id=ri(100000,9999999);}while(usedIds.has(id));
    usedIds.add(id);ids.push(id);
  }
  let out=`local ${stateVar}=${N(ids[0])} while ${stateVar} do `;
  for(let i=0;i<chunks.length;i++){
    const cond=i===0?'if':'elseif';
    const nextState=i<chunks.length-1?N(ids[i+1]):'false';
    out+=`${cond} ${stateVar}==${N(ids[i])} then `;
    out+=chunks[i]+' ';
    out+=`${stateVar}=${nextState} `;
  }
  out+=`else ${stateVar}=false end end `;
  return out;
}

// ═══════════════════════════════════════════════════════════════════
//  OPCODE TABLE (Polymorphic — random per build)
// ═══════════════════════════════════════════════════════════════════
function makeOpcodeTable(){
  const names=[
    'LOADK','LOADN','LOADNIL','LOADTRUE','LOADFALSE',
    'GETGLOBAL','SETGLOBAL','GETVAR','SETVAR',
    'CALL','CALLM','RETURN',
    'ADD','SUB','MUL','DIV','MOD','POW','CONCAT',
    'EQ','NE','LT','LE','AND','OR',
    'NOT','NEG','LEN',
    'JMP','JMPF','JMPT',
    'NEWTABLE','TGET','TSET',
    'FORPREP','FORSTEP',
  ];
  const used=new Set();const ids=[];
  while(ids.length<names.length){const x=ri(10,220);if(!used.has(x)){ids.push(x);used.add(x);}}
  const T={};names.forEach((n,i)=>{T[n]=ids[i];});
  // fake opcodes
  const fakes=[];
  while(fakes.length<15){const x=ri(221,253);if(!used.has(x)){fakes.push(x);used.add(x);}}
  T._fakes=fakes;
  return T;
}

// ═══════════════════════════════════════════════════════════════════
//  LEXER
// ═══════════════════════════════════════════════════════════════════
const KW=new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while','goto']);

function lex(src){
  const tok=[];let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){i++;continue;}
    if(src.slice(i,i+4)==='--[['){i+=4;while(i<src.length&&src.slice(i,i+2)!==']]')i++;i+=2;continue;}
    if(src.slice(i,i+2)==='--'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(src.slice(i,i+2)==='[['){let j=i+2;while(j<src.length&&!(src[j]===']'&&src[j+1]===']'))j++;tok.push({t:'S',v:src.slice(i+2,j)});i=j+2;continue;}
    if(src[i]==='"'||src[i]==="'"){
      const q=src[i++];let s='';
      while(i<src.length&&src[i]!==q){
        if(src[i]==='\\'){i++;const c=src[i]||'';
          if(c==='n'){s+='\n';i++;}else if(c==='t'){s+='\t';i++;}else if(c==='r'){s+='\r';i++;}
          else if(/[0-9]/.test(c)){let d='';while(/[0-9]/.test(src[i]||'')&&d.length<3)d+=src[i++];s+=String.fromCharCode(parseInt(d,10));}
          else{s+=c;i++;}
        }else s+=src[i++];
      }
      i++;tok.push({t:'S',v:s});continue;
    }
    if(src.slice(i,i+2).toLowerCase()==='0x'){let n='0x';i+=2;while(/[0-9a-fA-F]/.test(src[i]||''))n+=src[i++];tok.push({t:'N',v:Number(n)});continue;}
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&/[0-9]/.test(src[i+1]||''))){
      let n='';
      while(/[0-9.eE]/.test(src[i]||'')||((src[i]==='+'||src[i]==='-')&&/[eE]/.test(n.slice(-1))))n+=src[i++];
      tok.push({t:'N',v:Number(n)});continue;
    }
    if(/[a-zA-Z_]/.test(src[i])){let w='';while(/[a-zA-Z0-9_]/.test(src[i]||''))w+=src[i++];tok.push({t:KW.has(w)?'K':'I',v:w});continue;}
    const op2=src.slice(i,i+2);
    if(['==','~=','<=','>=','..','//','<<','>>'].includes(op2)){tok.push({t:'O',v:op2});i+=2;continue;}
    tok.push({t:'O',v:src[i]});i++;
  }
  tok.push({t:'E',v:''});return tok;
}

// ═══════════════════════════════════════════════════════════════════
//  COMPILER → BYTECODE
// ═══════════════════════════════════════════════════════════════════
function compile(tokens,OPC){
  let pos=0;
  const ins=[],consts=[],scopes=[{}];let nSlot=0;
  const pk=()=>tokens[pos],nx=()=>tokens[pos++];
  const ck=v=>tokens[pos]&&tokens[pos].v===v;
  const eof=()=>!tokens[pos]||tokens[pos].t==='E';
  function eat(v){if(ck(v))nx();else nx();}
  function addC(val){let i=consts.indexOf(val);if(i===-1){i=consts.length;consts.push(val);}return i;}
  function emit(op,a,b,c){ins.push({op,a:a??0,b:b??0,c:c??0});return ins.length-1;}
  function patch(i,t){ins[i].a=t;}
  function resV(n){for(let i=scopes.length-1;i>=0;i--)if(scopes[i][n]!==undefined)return scopes[i][n];return null;}
  function decV(n){const s=nSlot++;scopes[scopes.length-1][n]=s;return s;}
  const gP=op=>{if(op==='or')return 1;if(op==='and')return 2;if(['<','>','<=','>=','==','~='].includes(op))return 3;if(op==='..')return 4;if(['+','-'].includes(op))return 5;if(['*','/','%','//'].includes(op))return 6;if(op==='^')return 7;return 0;};
  function pE(mp=0){pU();while(true){const op=pk().v,pr=gP(op);if(pr<=mp)break;nx();pE(op==='..'||op==='^'?pr-1:pr);const m={'+':OPC.ADD,'-':OPC.SUB,'*':OPC.MUL,'/':OPC.DIV,'%':OPC.MOD,'^':OPC.POW,'..':OPC.CONCAT,'==':OPC.EQ,'~=':OPC.NE,'<':OPC.LT,'<=':OPC.LE,'>':OPC.LT,'>=':OPC.LE,'and':OPC.AND,'or':OPC.OR}[op];if(m!==undefined)emit(m);}}
  function pU(){const t=pk();if(t.v==='not'){nx();pU();emit(OPC.NOT);}else if(t.v==='-'){nx();pU();emit(OPC.NEG);}else if(t.v==='#'){nx();pU();emit(OPC.LEN);}else pP();}
  function pArgs(){let c=0;if(ck('(')){eat('(');while(!ck(')')&&!eof()){pE();c++;if(ck(','))nx();}eat(')');}else if(pk().t==='S'){emit(OPC.LOADK,addC(nx().v));c=1;}else if(ck('{')){pTbl();c=1;}return c;}
  function pSfx(){while(true){const t=pk();if(t.v==='.'){nx();const f=nx();emit(OPC.LOADK,addC(f.v));emit(OPC.TGET);}else if(t.v==='['){nx();pE();eat(']');emit(OPC.TGET);}else if(t.v===':'){nx();const m=nx();emit(OPC.LOADK,addC(m.v));emit(OPC.CALLM,pArgs());}else if(t.v==='('||t.t==='S'||t.v==='{'){emit(OPC.CALL,pArgs());}else break;}}
  function pTbl(){eat('{');emit(OPC.NEWTABLE);while(!ck('}')&&!eof()){if(ck('[')){nx();pE();eat(']');eat('=');pE();emit(OPC.TSET);}else if(pk().t==='I'&&tokens[pos+1]?.v==='='){const k=nx().v;nx();emit(OPC.LOADK,addC(k));pE();emit(OPC.TSET);}else{pE();emit(OPC.TSET);}if(ck(',')||ck(';'))nx();}eat('}');}
  function pP(){const t=pk();if(t.t==='N'){nx();emit(OPC.LOADN,t.v);pSfx();}else if(t.t==='S'){nx();emit(OPC.LOADK,addC(t.v));pSfx();}else if(t.t==='K'){if(t.v==='nil'){nx();emit(OPC.LOADNIL);}else if(t.v==='true'){nx();emit(OPC.LOADTRUE);}else if(t.v==='false'){nx();emit(OPC.LOADFALSE);}else if(t.v==='function'){nx();skFn();}else nx();}else if(t.t==='I'){nx();const sl=resV(t.v);sl!==null?emit(OPC.GETVAR,sl):emit(OPC.GETGLOBAL,addC(t.v));pSfx();}else if(t.v==='('){eat('(');pE();eat(')');pSfx();}else if(t.v==='{'){pTbl();}else nx();}
  function skFn(){eat('(');while(!ck(')')&&!eof())nx();eat(')');let d=1;while(!eof()&&d>0){const t=nx();if(t.t==='K'&&['function','do','if','while','for','repeat'].includes(t.v))d++;if(t.t==='K'&&(t.v==='end'||t.v==='until'))d--;}}
  function pBlk(){scopes.push({});while(!eof()){const t=pk();if(t.t==='E')break;if(t.t==='K'&&['end','else','elseif','until'].includes(t.v))break;pSt();}scopes.pop();}
  function pSt(){const t=pk();if(t.t==='K'){switch(t.v){case 'local':pLoc();return;case 'if':pIf();return;case 'while':pWh();return;case 'for':pFor();return;case 'return':pRet();return;case 'function':pFnD();return;case 'do':nx();pBlk();eat('end');return;case 'repeat':pRep();return;case 'break':nx();emit(OPC.JMP,0);return;case 'end':case 'else':case 'elseif':case 'until':return;default:nx();return;}}pES();}
  function pLoc(){eat('local');if(pk().t==='K'&&pk().v==='function'){nx();const n=nx().v;skFn();emit(OPC.SETVAR,decV(n));return;}const ns=[];while(pk().t==='I'){ns.push(nx().v);if(!ck(','))break;nx();}if(ck('=')){nx();ns.forEach((_,i)=>{pE();if(ck(','))nx();});}else ns.forEach(()=>emit(OPC.LOADNIL));ns.forEach(n=>{emit(OPC.SETVAR,decV(n));});}
  function pIf(){eat('if');pE();eat('then');const jF=emit(OPC.JMPF,0);pBlk();const jE=[];while(ck('elseif')||ck('else')){jE.push(emit(OPC.JMP,0));patch(jF,ins.length);if(ck('elseif')){nx();pE();eat('then');jE.push(emit(OPC.JMPF,0));pBlk();}else{nx();pBlk();break;}}if(ck('end'))nx();const ep=ins.length;jE.forEach(j=>patch(j,ep));if(!jE.length)patch(jF,ep);}
  function pWh(){eat('while');const top=ins.length;pE();eat('do');const jF=emit(OPC.JMPF,0);pBlk();eat('end');emit(OPC.JMP,top);patch(jF,ins.length);}
  function pFor(){eat('for');const n=nx().v;if(ck('=')){nx();pE();eat(',');pE();if(ck(',')){nx();pE();}eat('do');const sl=decV(n);emit(OPC.FORPREP,sl);const top=ins.length;pBlk();eat('end');emit(OPC.FORSTEP,sl,top);}else{while(!eof()&&!(pk().t==='K'&&pk().v==='end'))nx();if(ck('end'))nx();}}
  function pRet(){eat('return');let c=0;if(!eof()&&!(pk().t==='K'&&['end','else','elseif','until'].includes(pk().v))){pE();c++;while(ck(',')){nx();pE();c++;}}emit(OPC.RETURN,c);}
  function pFnD(){eat('function');const n=nx().v;skFn();const sl=resV(n);if(sl!==null)emit(OPC.SETVAR,sl);else{emit(OPC.GETGLOBAL,addC(n));emit(OPC.SETGLOBAL);}}
  function pRep(){eat('repeat');const top=ins.length;pBlk();eat('until');pE();emit(OPC.JMPF,top);}
  function pES(){pP();if(ck('=')){nx();pE();emit(OPC.SETGLOBAL);}}
  pBlk();emit(OPC.RETURN,0);
  return{ins,consts};
}

// ═══════════════════════════════════════════════════════════════════
//  FAKE OPCODE INJECTION (~20%)
// ═══════════════════════════════════════════════════════════════════
function injectFakes(ins,fakes){
  const out=[];
  for(const i of ins){
    if(Math.random()<0.2)out.push({op:fakes[ri(0,fakes.length-1)],a:ri(0,100),b:ri(0,100),c:0});
    out.push(i);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
//  SERIALIZER
// ═══════════════════════════════════════════════════════════════════
function serialize(ins,consts){
  const bytes=[];
  const u8=n=>bytes.push(n&0xFF);
  const i16=n=>{const x=n&0xFFFF;bytes.push(x&0xFF);bytes.push((x>>8)&0xFF);};
  const i32=n=>{const x=n>>>0;bytes.push(x&0xFF);bytes.push((x>>8)&0xFF);bytes.push((x>>16)&0xFF);bytes.push((x>>24)&0xFF);};
  const f64=f=>{const dv=new DataView(new ArrayBuffer(8));dv.setFloat64(0,f,false);for(let i=0;i<8;i++)bytes.push(dv.getUint8(i));};
  const str=s=>{const e=[...s].map(c=>c.charCodeAt(0)&0xFF);i16(e.length);for(const b of e)u8(b);};
  // magic PMRS
  [0x50,0x4D,0x52,0x53].forEach(u8);u8(1);i16(consts.length);
  for(const c of consts){
    if(typeof c==='string'){u8(1);str(c);}
    else if(typeof c==='number'){u8(2);f64(c);}
    else if(typeof c==='boolean'){u8(3);u8(c?1:0);}
    else u8(0);
  }
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

// ═══════════════════════════════════════════════════════════════════
//  MULTI-LAYER ENCRYPTION
// ═══════════════════════════════════════════════════════════════════
// Layer 1: RC4
function rc4(data,key){
  const s=Array.from({length:256},(_,i)=>i);let j=0;
  for(let i=0;i<256;i++){j=(j+s[i]+key[i%key.length])%256;[s[i],s[j]]=[s[j],s[i]];}
  let ci=0;j=0;
  return data.map(b=>{ci=(ci+1)%256;j=(j+s[ci])%256;[s[ci],s[j]]=[s[j],s[ci]];return b^s[(s[ci]+s[j])%256];});
}
// Layer 2: Rolling XOR
function rollingXor(data,key){
  let k=key;
  return data.map(b=>{const r=b^(k&0xFF);k=((k*1664525+1013904223)>>>0);return r;});
}
// Layer 3: Block shuffle
function lcg(s){return((s*1664525+1013904223)>>>0);}
function blockShuffle(data,nBlocks,seed){
  const bSz=Math.ceil(data.length/nBlocks),blocks=[];
  for(let i=0;i<nBlocks;i++){const sl=data.slice(i*bSz,(i+1)*bSz);if(sl.length)blocks.push(sl);}
  const n=blocks.length,perm=Array.from({length:n},(_,i)=>i);let s=seed;
  for(let i=n-1;i>0;i--){s=lcg(s);const j=s%(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}
  return{shuffled:perm.map(idx=>blocks[idx]),perm,n};
}

// ═══════════════════════════════════════════════════════════════════
//  VM RUNTIME EMITTER
// ═══════════════════════════════════════════════════════════════════
function emitVM(shuffleResult,rc4Key,rollKey,rawChecksum,OPC,vgen){
  // all variable names randomized
  const vEnv=vgen(),vVars=vgen(),vStk=vgen(),vTop=vgen();
  const vIns=vgen(),vCons=vgen(),vMask=vgen(),vSip=vgen();
  const vRun=vgen(),vCur=vgen(),vOp=vgen(),vA=vgen(),vB=vgen();
  const vU8=vgen(),vI16=vgen(),vI32=vgen(),vStr=vgen(),vData=vgen(),vIdx=vgen();
  const vS=vgen(),vRI=vgen(),vRJ=vgen(),vRKey=vgen();
  const vXKey=vgen(),vDec=vgen(),vBlks=vgen(),vPerm=vgen(),vPay=vgen();
  const vCs=vgen(),vChk=vgen();
  const vK1=vgen(),vK2=vgen(),vK3=vgen();
  const vGenv=vgen(),vExec=vgen(),vCrash=vgen(),vEi=vgen(),vEd=vgen();
  const vRoll=vgen(),vRollK=vgen();

  // hidden strings
  const xInst=hiddenStr('Instance',vgen);
  const xDM=hiddenStr('DataModel',vgen);
  const xGS=hiddenStr('GetService',vgen);
  const xRf=hiddenStr('readfile',vgen);
  const xWf=hiddenStr('writefile',vgen);
  const xSyn=hiddenStr('syn',vgen);
  const xFlux=hiddenStr('fluxus',vgen);
  const xDex=hiddenStr('deltaexecute',vgen);

  // checksum
  const csOff=ri(1,99999);
  const csExpr=`${rawChecksum+csOff}-${csOff}`;

  const kL=rc4Key.length,kM1=Math.floor(kL/3),kM2=Math.floor(kL*2/3);
  const ipMask=ri(0x1000,0xFFFF);

  // payload fragments — strictly \ddd
  const fragVars=[],fragDecls=[];
  for(let i=0;i<shuffleResult.n;i++){
    const vn=vgen();fragVars.push(vn);
    fragDecls.push(`local ${vn}=${luaStr(shuffleResult.shuffled[i])}`);
  }

  // fake VM branches (dead code in dispatch)
  const fakeBranches=OPC._fakes.slice(0,8).map(fop=>{
    const d=vgen(),e=vgen();
    return `elseif ${vOp}==${N(fop)} then local ${d}=${N(0)} local ${e}=${d}+${N(0)}`;
  }).join(' ');

  // CFF chunks for VM setup — splits setup into flattened states
  const setupChunks=[
    // chunk 0: reassemble payload
    `${fragDecls.join(' ')} local ${vPerm}={${shuffleResult.perm.join(',')}} local ${vBlks}={} local _fv={${fragVars.join(',')}} for ${vIdx}=${N(1)},#${vPerm} do ${vBlks}[${vPerm}[${vIdx}]+1]=_fv[${vIdx}] end local ${vPay}=table.concat(${vBlks}) _fv=nil ${vBlks}=nil ${vPerm}=nil ${fragVars.map(n=>`${n}=nil`).join(' ')}`,
    // chunk 1: rolling XOR decrypt
    `local ${vRollK}=${N(rollKey)} local ${vDec}={} for ${vIdx}=${N(1)},#${vPay} do local _b=string.byte(${vPay},${vIdx}) local _x=bit32.bxor(_b,bit32.band(${vRollK},${N(0xFF)})) ${vRollK}=bit32.band(${vRollK}*${N(1664525)}+${N(1013904223)},${N(4294967295)}) ${vDec}[${vIdx}]=string.char(_x) end local _xd=table.concat(${vDec}) ${vDec}=nil ${vPay}=nil`,
    // chunk 2: RC4 decrypt
    `local ${vK1}=${luaStr(rc4Key.slice(0,kM1))} local ${vK2}=${luaStr(rc4Key.slice(kM1,kM2))} local ${vK3}=${luaStr(rc4Key.slice(kM2))} local ${vRKey}=${vK1}..${vK2}..${vK3} ${vK1}=nil ${vK2}=nil ${vK3}=nil local ${vS}={} for ${vIdx}=${N(0)},${N(255)} do ${vS}[${vIdx}]=${vIdx} end local ${vRJ}=${N(0)} local _rkl=#${vRKey} for ${vIdx}=${N(0)},${N(255)} do ${vRJ}=(${vRJ}+${vS}[${vIdx}]+string.byte(${vRKey},(${vIdx}%_rkl)+1))%${N(256)} ${vS}[${vIdx}],${vS}[${vRJ}]=${vS}[${vRJ}],${vS}[${vIdx}] end ${vRKey}=nil local ${vRI}=${N(0)} ${vRJ}=${N(0)} local _r2={} for ${vIdx}=${N(1)},#_xd do ${vRI}=(${vRI}+1)%${N(256)} ${vRJ}=(${vRJ}+${vS}[${vRI}])%${N(256)} ${vS}[${vRI}],${vS}[${vRJ}]=${vS}[${vRJ}],${vS}[${vRI}] _r2[${vIdx}]=string.char(bit32.bxor(string.byte(_xd,${vIdx}),${vS}[(${vS}[${vRI}]+${vS}[${vRJ}])%${N(256)}])) end _xd=nil ${vS}=nil local ${vData}=table.concat(_r2) _r2=nil`,
    // chunk 3: checksum verify
    `local ${vCs}=${csExpr} local ${vChk}=${N(0x1337)} for ${vIdx}=${N(1)},#${vData} do ${vChk}=bit32.band(${vChk}*${N(31)}+string.byte(${vData},${vIdx}),${N(4294967295)}) end if ${vChk}~=${vCs} then local ${vCrash}=nil ${vCrash}() return end ${vChk}=nil ${vCs}=nil`,
    // chunk 4: parse bytecode header
    `local _ip=${N(1)} local function ${vU8}() local _b=string.byte(${vData},_ip) _ip=_ip+${N(1)} return _b or ${N(0)} end local function ${vI16}() return ${vU8}()+${vU8}()*${N(256)} end local function ${vI32}() return ${vU8}()+${vU8}()*${N(256)}+${vU8}()*${N(65536)}+${vU8}()*${N(16777216)} end local function ${vStr}() local _n=${vI16}() local _t={} for ${vIdx}=${N(1)},_n do _t[${vIdx}]=string.char(${vU8}()) end return table.concat(_t) end local _mg={${vU8}(),${vU8}(),${vU8}(),${vU8}()} if _mg[1]~=${N(0x50)} or _mg[2]~=${N(0x4D)} or _mg[3]~=${N(0x52)} or _mg[4]~=${N(0x53)} then local ${vCrash}=nil ${vCrash}() return end ${vU8}()`,
    // chunk 5: load constants
    `local ${vCons}={} for ${vIdx}=${N(1)},${vI16}() do local _ct=${vU8}() if _ct==${N(1)} then ${vCons}[${vIdx}]=${vStr}() elseif _ct==${N(2)} then local _fb={} for _k=${N(1)},${N(8)} do _fb[_k]=${vU8}() end local _ok,_fv=pcall(string.unpack,">d",string.char(table.unpack(_fb))) ${vCons}[${vIdx}]=_ok and _fv or ${N(0)} elseif _ct==${N(3)} then ${vCons}[${vIdx}]=${vU8}()==${N(1)} else ${vCons}[${vIdx}]=nil end end`,
    // chunk 6: load instructions
    `local ${vIns}={} for ${vIdx}=${N(1)},${vI32}() do local _op=${vU8}() local _at=${vU8}() local _av=${N(0)} if _at==${N(1)} then local _lo=${vU8}() local _hi=${vU8}() _av=_lo+_hi*${N(256)} if _av>=${N(32768)} then _av=_av-${N(65536)} end elseif _at==${N(2)} then _av=${vI32}() elseif _at==${N(3)} then local _fb={} for _k=${N(1)},${N(8)} do _fb[_k]=${vU8}() end local _ok,_fv=pcall(string.unpack,">d",string.char(table.unpack(_fb))) _av=_ok and _fv or ${N(0)} end local _bt=${vU8}() local _bv=${N(0)} if _bt==${N(1)} then local _lo=${vU8}() local _hi=${vU8}() _bv=_lo+_hi*${N(256)} end ${vIns}[${vIdx}]={_op,_av,_bv} end ${vData}=nil`,
  ];

  // Apply CFF to setup chunks
  const setupCode=flattenCFF(setupChunks,vgen);

  // VM dispatch — wrap in CFF state machine for the main loop
  const vmBody=`local ${vStk}={} local ${vTop}=${N(0)} local ${vEnv}=(getfenv and getfenv(${N(1)})) or _ENV or _G local ${vVars}={} local ${vMask}=${N(ipMask)} local ${vSip}=bit32.bxor(${N(1)},${vMask}) local ${vRun}=true
while ${vRun} do
  local _rip=bit32.bxor(${vSip},${vMask})
  if _rip>#${vIns} then break end
  local ${vCur}=${vIns}[_rip]
  local ${vOp}=${vCur}[1] local ${vA}=${vCur}[2] local ${vB}=${vCur}[3]
  ${vSip}=bit32.bxor(_rip+${N(1)},${vMask})
  if ${vOp}==${N(OPC.LOADK)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vCons}[${vA}+1]
  elseif ${vOp}==${N(OPC.LOADN)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vA}
  elseif ${vOp}==${N(OPC.LOADNIL)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil
  elseif ${vOp}==${N(OPC.LOADTRUE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=true
  elseif ${vOp}==${N(OPC.LOADFALSE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=false
  elseif ${vOp}==${N(OPC.GETVAR)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]=${vVars}[${vA}]
  elseif ${vOp}==${N(OPC.SETVAR)} then ${vVars}[${vA}]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1
  elseif ${vOp}==${N(OPC.GETGLOBAL)} then local _k=${vCons}[${vA}+1] local _gv=${vEnv}[_k] if _gv==nil then _gv=_G[_k] end ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_gv
  elseif ${vOp}==${N(OPC.SETGLOBAL)} then local _v=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vEnv}[_k]=_v
  elseif ${vOp}==${N(OPC.CALL)} then local _args={} for _k=${vA},1,-1 do _args[_k]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 end local _fn=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 if type(_fn)=="function" then local _ok,_r=pcall(_fn,table.unpack(_args)) ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_ok and _r or nil else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil end
  elseif ${vOp}==${N(OPC.CALLM)} then local _args={} for _k=${vA},1,-1 do _args[_k]=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 end local _m=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _obj=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 if type(_obj)=="table" and type(_obj[_m])=="function" then local _ok,_r=pcall(_obj[_m],_obj,table.unpack(_args)) ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_ok and _r or nil else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=nil end
  elseif ${vOp}==${N(OPC.RETURN)} then ${vRun}=false
  elseif ${vOp}==${N(OPC.JMP)} then ${vSip}=bit32.bxor(${vA},${vMask})
  elseif ${vOp}==${N(OPC.JMPF)} then local _c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 if not _c then ${vSip}=bit32.bxor(${vA},${vMask}) end
  elseif ${vOp}==${N(OPC.JMPT)} then local _c=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 if _c then ${vSip}=bit32.bxor(${vA},${vMask}) end
  elseif ${vOp}==${N(OPC.ADD)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]+_b
  elseif ${vOp}==${N(OPC.SUB)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]-_b
  elseif ${vOp}==${N(OPC.MUL)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]*_b
  elseif ${vOp}==${N(OPC.DIV)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]/_b
  elseif ${vOp}==${N(OPC.MOD)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]%_b
  elseif ${vOp}==${N(OPC.POW)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]^_b
  elseif ${vOp}==${N(OPC.CONCAT)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=tostring(${vStk}[${vTop}])..tostring(_b)
  elseif ${vOp}==${N(OPC.EQ)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]==_b
  elseif ${vOp}==${N(OPC.NE)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]~=_b
  elseif ${vOp}==${N(OPC.LT)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]<_b
  elseif ${vOp}==${N(OPC.LE)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}]<=_b
  elseif ${vOp}==${N(OPC.AND)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}] and _b
  elseif ${vOp}==${N(OPC.OR)} then local _b=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vStk}[${vTop}]=${vStk}[${vTop}] or _b
  elseif ${vOp}==${N(OPC.NOT)} then ${vStk}[${vTop}]=not ${vStk}[${vTop}]
  elseif ${vOp}==${N(OPC.NEG)} then ${vStk}[${vTop}]=-${vStk}[${vTop}]
  elseif ${vOp}==${N(OPC.LEN)} then ${vStk}[${vTop}]=#${vStk}[${vTop}]
  elseif ${vOp}==${N(OPC.NEWTABLE)} then ${vTop}=${vTop}+1 ${vStk}[${vTop}]={}
  elseif ${vOp}==${N(OPC.TGET)} then local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _t=${vStk}[${vTop}] ${vStk}[${vTop}]=type(_t)=="table" and _t[_k] or nil
  elseif ${vOp}==${N(OPC.TSET)} then local _v=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _k=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 if type(${vStk}[${vTop}])=="table" then ${vStk}[${vTop}][_k]=_v end
  elseif ${vOp}==${N(OPC.FORPREP)} then local _step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _lim=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _init=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 ${vVars}[${vA}]=_init ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_step
  elseif ${vOp}==${N(OPC.FORSTEP)} then local _step=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _lim=${vStk}[${vTop}] ${vStk}[${vTop}]=nil ${vTop}=${vTop}-1 local _cur=${vVars}[${vA}]+_step ${vVars}[${vA}]=_cur if(_step>0 and _cur>_lim)or(_step<0 and _cur<_lim)then ${vSip}=bit32.bxor(${vB},${vMask}) else ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_lim ${vTop}=${vTop}+1 ${vStk}[${vTop}]=_step end
  ${fakeBranches}
  else end
end`;

  // Anti-tamper block (executor + game check)
  const antiTamper=
    `local ${vEi}=${xInst} local ${vEd}=${xDM} `+
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd}) then local ${vCrash}=nil ${vCrash}() return end `+
    `${vEi}=nil ${vEd}=nil `+
    `local ${vGenv}=(getgenv and getgenv()) or _G `+
    `local ${vExec}=rawget(${vGenv},${xRf}) or rawget(${vGenv},${xWf}) or rawget(${vGenv},${xSyn}) or rawget(${vGenv},${xFlux}) or rawget(${vGenv},${xDex}) or rawget(_G,${xRf}) or rawget(_G,${xWf}) `+
    `if ${vExec}==nil then local ${vCrash}=nil ${vCrash}() return end `+
    `${vGenv}=nil ${vExec}=nil`;

  return `do\n${antiTamper}\n${setupCode}\n${vmBody}\nend`;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN OBFUSCATOR
// ═══════════════════════════════════════════════════════════════════
function obfuscate(code){
  const vgen=makeVarGen();
  const OPC=makeOpcodeTable();

  // 1. Compile
  let compiled;
  try{compiled=compile(lex(code),OPC);}
  catch(e){
    compiled={
      ins:[{op:OPC.LOADK,a:0,b:0,c:0},{op:OPC.CALL,a:0,b:0,c:0},{op:OPC.RETURN,a:0,b:0,c:0}],
      consts:[code]
    };
  }

  // 2. Inject fakes
  compiled.ins=injectFakes(compiled.ins,OPC._fakes);

  // 3. Serialize
  const rawBytes=serialize(compiled.ins,compiled.consts);

  // 4. Checksum
  let cs=0x1337;
  for(const b of rawBytes)cs=((cs*31+b)&0xFFFFFFFF)>>>0;
  const rawChecksum=cs>>>0;

  // 5. Triple encrypt
  const rc4Key=rb(ri(16,24));
  const rollKey=ri(0x1000,0xFFFFFF);
  const nBlocks=ri(12,20);
  const seed=ri(0x1000,0xFFFFFFFF);

  const e1=rc4(rawBytes,rc4Key);          // RC4
  const e2=rollingXor(e1,rollKey);        // Rolling XOR
  const shuffled=blockShuffle(e2,nBlocks,seed); // Block shuffle

  // 6. Emit VM
  const vmCode=emitVM(shuffled,rc4Key,rollKey,rawChecksum,OPC,vgen);

  // 7. Dead code wrapping
  const deadBefore=makeDeadCode(vgen,ri(8,14));
  const deadAfter=makeDeadCode(vgen,ri(6,10));

  // 8. Assemble + compact
  const full=[deadBefore,vmCode,deadAfter].join('\n');
  return full.replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
}

module.exports={obfuscate};
