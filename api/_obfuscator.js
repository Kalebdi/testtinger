'use strict';
const crypto = require('crypto');

function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// Short var names — closure params use different names than string table
// String table = _H (internal, before closure)
// Closure params use single letters that DON'T clash with _H
const _JUNK_CHARS = 'abcdefghijklmnopqrstuvwxyz';
let _junkIdx = 0;
const _junkUsed = new Set();
function jv() { // junk variable — uses lowercase only
  while(_junkIdx < _JUNK_CHARS.length){
    const c = _JUNK_CHARS[_junkIdx++];
    if(!_junkUsed.has(c)){_junkUsed.add(c);return c;}
  }
  const a=_JUNK_CHARS[ri(0,25)], b=_JUNK_CHARS[ri(0,25)];
  const n=a+b+ri(0,9);
  _junkUsed.add(n); return n;
}

// Body variable renaming — uses completely separate uppercase+number space
const _BODY_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
let _bodyIdx = 0;
const _bodyUsed = new Set();
function bv() {
  while(_bodyIdx < _BODY_POOL.length){
    const c = _BODY_POOL[_bodyIdx++];
    if(!_bodyUsed.has(c)){_bodyUsed.add(c);return c;}
  }
  let n;
  do { n = _BODY_POOL[ri(0,25)]+'_'+ri(10,99); } while(_bodyUsed.has(n));
  _bodyUsed.add(n); return n;
}

function resetVars() {
  _junkIdx=0; _junkUsed.clear();
  _bodyIdx=0; _bodyUsed.clear();
}

// ── Arithmetic (12 safe forms) ────────────────────────────────────────────────
function A(n) {
  if(!Number.isFinite(n)||!Number.isInteger(n)) return String(n);
  if(n<-2147483648||n>2147483647) return String(n);
  const a=ri(1,999),b=ri(1,99);
  if(n<0) return `(${n+a}-${a})`;
  const t=ri(0,11);
  switch(t){
    case 0:  return `(${n+a}-${a})`;
    case 1:  return `(${a}-(${a-n}))`;
    case 2:  return `(${n*a}/${a})`;
    case 3:  return `(function() return ${n+a}-${a} end)()`;
    case 4:  return `(math.floor((${n+a}-${a})/1))`;
    case 5:  return `(select(2,false,${n+a}-${a}))`;
    case 6:  return `(math.abs(${n+a})-${a})`;
    case 7:  {const k=ri(1,0x7FFF);return `(bit32.bxor(bit32.bxor(${n},${k}),${k}))`;}
    case 8:  return `(bit32.band(${n+a}-${a},4294967295))`;
    case 9:  return `(${n+a+b}-(${a+b}))`;
    case 10: return `(true and (${n+a}-${a}) or ${n})`;
    case 11: {if(n>=0&&n<=30)return `(#"${'x'.repeat(n)}")`;return `(${n+a}-${a})`;}
    default: return String(n);
  }
}

// ── Junk code — uses separate var names, NO # on non-strings ─────────────────
function makeJunk(count) {
  const lines=[];
  for(let i=0;i<count;i++){
    const a=jv(),b=jv(),c=jv(),t=ri(0,8);
    switch(t){
      // SAFE: only numeric operations, no # on unknown types
      case 0: lines.push(`local ${a}=${A(ri(1,999))} local ${b}=${a}+${A(0)}-${A(0)}`); break;
      case 1: lines.push(`local ${a}={} ${a}=nil`); break;
      case 2: lines.push(`do local ${a}=${A(ri(1,99))} local ${b}=${a}*${A(1)}-${A(0)} end`); break;
      case 3: lines.push(`if false then local ${a}=${A(ri(1,999))} local ${b}=${a}+${A(1)} end`); break;
      case 4: lines.push(`local ${a}=bit32.bxor(${A(ri(1,127))},${A(0)})`); break;
      case 5: lines.push(`local ${a}=${A(ri(10,999))} local ${b}=${a} local ${c}=${b}-${a}+${A(0)}`); break;
      case 6: lines.push(`do local ${a}=${A(ri(1,9))} local ${b}=${a}*${a} local ${c}=${b}-${a}*${a} end`); break;
      case 7: lines.push(`local ${a}=(function() return ${A(ri(1,999))} end)()`); break;
      // SAFE: # only on string literal, never on variable
      case 8: {const s='x'.repeat(ri(1,10));lines.push(`local ${a}=#"${s}" local ${b}=${a}+${A(0)}`);break;}
    }
  }
  for(let i=lines.length-1;i>0;i--){const j=ri(0,i);[lines[i],lines[j]]=[lines[j],lines[i]];}
  return lines.join(' ');
}

// ── Lexer ─────────────────────────────────────────────────────────────────────
const KW=new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while','goto']);

function lex(src){
  const tokens=[]; let i=0;
  while(i<src.length){
    if(/\s/.test(src[i])){i++;continue;}
    if(src.slice(i,i+4)==='--[['){i+=4;while(i<src.length&&src.slice(i,i+2)!==']]')i++;i+=2;continue;}
    if(src.slice(i,i+2)==='--'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(src.slice(i,i+2)==='[['){let j=i+2;while(j<src.length&&!(src[j]===']'&&src[j+1]===']'))j++;tokens.push({t:'STR',v:src.slice(i+2,j)});i=j+2;continue;}
    if(src[i]==='"'||src[i]==="'"){
      const q=src[i++];let s='';
      while(i<src.length&&src[i]!==q){
        if(src[i]==='\\'){i++;const c=src[i]||'';
          if(c==='n'){s+='\n';i++;}else if(c==='t'){s+='\t';i++;}else if(c==='r'){s+='\r';i++;}
          else if(/[0-9]/.test(c)){let d='';while(/[0-9]/.test(src[i]||'')&&d.length<3)d+=src[i++];s+=String.fromCharCode(parseInt(d,10));}
          else{s+=c;i++;}
        }else s+=src[i++];
      }
      i++;tokens.push({t:'STR',v:s});continue;
    }
    if(src.slice(i,i+2).toLowerCase()==='0x'){let n='0x';i+=2;while(/[0-9a-fA-F]/.test(src[i]||''))n+=src[i++];tokens.push({t:'NUM',v:Number(n)});continue;}
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&/[0-9]/.test(src[i+1]||''))){
      let n='';
      while(/[0-9.eE]/.test(src[i]||'')||((src[i]==='+'||src[i]==='-')&&/[eE]/.test(n.slice(-1))))n+=src[i++];
      tokens.push({t:'NUM',v:Number(n)});continue;
    }
    if(/[a-zA-Z_]/.test(src[i])){let w='';while(/[a-zA-Z0-9_]/.test(src[i]||''))w+=src[i++];tokens.push({t:KW.has(w)?'KW':'ID',v:w});continue;}
    const op2=src.slice(i,i+2);
    if(['==','~=','<=','>=','..','//'].includes(op2)){tokens.push({t:'OP',v:op2});i+=2;continue;}
    tokens.push({t:'OP',v:src[i]});i++;
  }
  tokens.push({t:'EOF',v:''});return tokens;
}

// ── XOR string (for anti-tamper hidden strings) ───────────────────────────────
function xorHidden(s) {
  const key=[...crypto.randomBytes(s.length)].map(b=>(b&0x7F)|1);
  const enc=[...s].map((c,i)=>c.charCodeAt(0)^key[i]);
  const vt=jv(),vk=jv(),vo=jv(),vi=jv();
  return `(function() local ${vt}={${enc.map(A).join(',')}} local ${vk}={${key.map(A).join(',')}} local ${vo}={} for ${vi}=${A(1)},#${vt} do ${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) end return table.concat(${vo}) end)()`;
}

// ── Main obfuscator ───────────────────────────────────────────────────────────
function obfuscate(code) {
  resetVars();
  const tokens=lex(code);

  // collect strings
  const strTable=[],strMap=new Map();
  function addStr(s){if(!strMap.has(s)){strMap.set(s,strTable.length);strTable.push(s);}return strMap.get(s);}

  ['','string','number','boolean','table','function','nil',
   'type','tostring','tonumber','pairs','ipairs','select','pcall',
   'rawget','rawset','next','error','assert','unpack',
   'math','bit32','coroutine',
   'game','workspace','script','Instance','DataModel',
   'Players','LocalPlayer','GetService',
  ].forEach(addStr);

  for(const tok of tokens) if(tok.t==='STR') addStr(tok.v);

  // XOR encode
  const xorKey=ri(1,127);
  const encTable=strTable.map(s=>{
    if(s==='') return '""';
    let enc='"';
    for(const c of s) enc+='\\'+String((c.charCodeAt(0)^xorKey)&0xFF).padStart(3,'0');
    return enc+'"';
  });

  // FIX: string table var is _ST (NOT H, to avoid clash with closure param H)
  const tVar='_ST';
  const tLen=encTable.length;

  // shuffle pairs
  const nShuf=Math.min(3,Math.floor(tLen/5));
  const shufPairs=[];const usedP=new Set();
  for(let i=0;i<nShuf;i++){
    let a,b,k;
    do{a=ri(1,tLen);b=ri(1,tLen);k=`${a}:${b}`;}while(a===b||usedP.has(k));
    usedP.add(k);shufPairs.push([a,b]);
  }

  const tableDecl=`local ${tVar}={${encTable.join(',')}}`;

  const shufCode=shufPairs.length===0?'':
    `for _u,_z in ipairs({${shufPairs.map(([a,b])=>`{${A(a)};${A(b)}}`).join(',')}}) do `+
    `while _z[${A(1)}]<_z[${A(2)}] do `+
    `${tVar}[_z[${A(1)}]],${tVar}[_z[${A(2)}]],_z[${A(1)}],_z[${A(2)}]=`+
    `${tVar}[_z[${A(2)}]],${tVar}[_z[${A(1)}]],_z[${A(1)}]+${A(1)},_z[${A(2)}]-${A(1)} `+
    `end end`;

  // helper: _h(n) = _ST[n+offset]
  const helperOffset=ri(10,50);
  const helperCode=`local function _h(_n) return ${tVar}[_n+(${A(helperOffset)})] end`;

  // decoder
  const dA=jv(),dB=jv(),dC=jv(),dD=jv(),dE=jv(),dF=jv();
  const decoderCode=
    `do local ${dA}=string.char local ${dB}=string.byte local ${dC}=table.concat `+
    `for ${dD}=${A(1)},#${tVar},${A(1)} do `+
    `local ${dE}=${tVar}[${dD}] `+
    `if type(${dE})=="string" then `+
    `local ${dF}={} `+
    `for _j=${A(1)},#${dE} do ${dF}[_j]=${dA}(bit32.bxor(${dB}(${dE},_j),${A(xorKey)})) end `+
    `${tVar}[${dD}]=${dC}(${dF}) `+
    `end end end`;

  // ── Anti-tamper: executor-only check ────────────────────────────────────────
  // Check inside closure, BEFORE running user code
  // Uses xorHidden so no raw strings visible
  const xRf   = xorHidden('readfile');
  const xWf   = xorHidden('writefile');
  const xSyn  = xorHidden('syn');
  const xFlux = xorHidden('fluxus');
  const xDex  = xorHidden('deltaexecute');
  const xGenv = xorHidden('getgenv');
  const xInst = xorHidden('Instance');
  const xDM   = xorHidden('DataModel');
  const vGenv=jv(), vExec=jv(), vEi=jv(), vEd=jv(), vCrash=jv();
  const antiTamperCode=
    // game check
    `local ${vEi}=${xInst} local ${vEd}=${xDM} `+
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd}) then `+
    `local ${vCrash}=nil ${vCrash}() return end `+
    `${vEi}=nil ${vEd}=nil `+
    // executor check
    `local ${vGenv}=(getgenv and getgenv()) or _G `+
    `local ${vExec}=`+
    `rawget(${vGenv},${xRf}) or rawget(${vGenv},${xWf}) or `+
    `rawget(${vGenv},${xSyn}) or rawget(${vGenv},${xFlux}) or `+
    `rawget(${vGenv},${xDex}) or rawget(_G,${xRf}) or rawget(_G,${xWf}) `+
    `if ${vExec}==nil then local ${vCrash}=nil ${vCrash}() return end `+
    `${vGenv}=nil ${vExec}=nil`;

  // ── Process body tokens ──────────────────────────────────────────────────────
  const idMap=new Map();
  function renameId(name){
    if(!idMap.has(name)) idMap.set(name,bv());
    return idMap.get(name);
  }
  function strRef(s){
    const idx=strMap.get(s);
    if(idx===undefined) return `"${s}"`;
    const arg=idx+1-helperOffset;
    return `_h(${A(arg)})`;
  }

  const bodyTokens=[];
  for(const tok of tokens){
    if(tok.t==='EOF') continue;
    switch(tok.t){
      case 'ID':  bodyTokens.push(renameId(tok.v)); break;
      case 'KW':  bodyTokens.push(tok.v); break;
      case 'STR': bodyTokens.push(strRef(tok.v)); break;
      case 'NUM': {
        const n=tok.v;
        if(Number.isInteger(n)&&n>=0&&n<=2147483647) bodyTokens.push(A(n));
        else bodyTokens.push(String(n));
        break;
      }
      case 'OP':  bodyTokens.push(tok.v); break;
      default:    bodyTokens.push(tok.v||'');
    }
  }

  // junk before and after body
  const junkBefore=makeJunk(ri(8,12));
  const junkAfter =makeJunk(ri(6,10));
  const body=junkBefore+' '+bodyTokens.join(' ')+' '+junkAfter;

  // ── Closure wrapper ──────────────────────────────────────────────────────────
  // WeAreDevs-style params — H is closure param (getfenv result), NOT string table
  const paramNames='H,B,Q,q,I,T,g,i,A,J,p,j,V,G,z,L,P,Z,u,r';
  const envArg='getfenv and getfenv()or _ENV';
  const unpackArg='unpack or table.unpack';

  const parts=[
    tableDecl,
    shufCode,
    helperCode,
    decoderCode,
    // anti-tamper lives OUTSIDE closure (before return) to use _ST directly
    // but executor check needs getgenv which is inside env
    // so we put it at top of closure body
    `return(function(${paramNames})`,
    antiTamperCode,
    body,
    `end)(${envArg},${unpackArg})`,
  ].filter(Boolean);

  return parts.join(' ').replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
}

module.exports = { obfuscate };
