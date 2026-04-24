'use strict';
const crypto = require('crypto');

function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// Short var names like WeAreDevs
const _POOL = 'HBQqITgiAJpjVGzLPZurFXSDCwmRnEkxbYoKvftlWNeds';
let _idx = 0; const _used = new Set();
function sv() {
  while (_idx < _POOL.length) { const c=_POOL[_idx++]; if(!_used.has(c)){_used.add(c);return c;} }
  const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let n; do{n=alpha[ri(0,25)]+alpha[ri(0,51)];}while(_used.has(n));
  _used.add(n); return n;
}
function resetVars() { _idx=0; _used.clear(); }

// ── Arithmetic (heavy, 12 forms) ──────────────────────────────────────────────
function A(n) {
  if (!Number.isFinite(n)||!Number.isInteger(n)) return String(n);
  if (n<-2147483648||n>2147483647) return String(n);
  const a=ri(1,999), b=ri(1,99);
  if (n<0) return `(${n+a}-${a})`;
  const t=ri(0,11);
  switch(t){
    case 0:  return `(${n+a}-${a})`;
    case 1:  return `(${a}-(${a-n}))`;
    case 2:  return `(${n*a}/${a})`;
    case 3:  return `(function() return ${n+a}-${a} end)()`;
    case 4:  return `(math.floor((${n+a}-${a})/1))`;
    case 5:  return `(select(2,false,${n+a}-${a}))`;
    case 6:  return `(math.abs(${n+a})-${a})`;
    case 7:  { const k=ri(1,0x7FFF); return `(bit32.bxor(bit32.bxor(${n},${k}),${k}))`; }
    case 8:  return `(bit32.band(${n+a}-${a},4294967295))`;
    case 9:  return `(${n+a+b}-(${a+b}))`;
    case 10: return `(true and (${n+a}-${a}) or ${n})`;
    case 11: { if(n>=0&&n<=30) return `(#"${'x'.repeat(n)}")`; return `(${n+a}-${a})`; }
    default: return String(n);
  }
}

// ── Junk code generator ───────────────────────────────────────────────────────
function makeJunk(count) {
  const lines = [];
  for (let i=0;i<count;i++) {
    const a=sv(), b=sv(), c=sv(), t=ri(0,9);
    switch(t){
      case 0: lines.push(`local ${a}=${A(ri(1,999))} local ${b}=${a}+${A(0)}-${A(0)}`); break;
      case 1: lines.push(`local ${a}={} ${a}=nil`); break;
      case 2: lines.push(`local ${a}=type(nil) local ${b}=#${a}`); break;
      case 3: lines.push(`do local ${a}=${A(ri(1,99))} local ${b}=${a}*${A(1)}-${A(0)} end`); break;
      case 4: lines.push(`if false then local ${a}=${A(ri(1,999))} local ${b}=${a}+${A(1)} end`); break;
      case 5: lines.push(`local ${a}=bit32.bxor(${A(ri(1,127))},${A(0)})`); break;
      case 6: lines.push(`local ${a}=tostring(${A(ri(1,999))}) local ${b}=#${a}+${A(0)}`); break;
      case 7: lines.push(`local ${a}=${A(ri(10,999))} local ${b}=${a} local ${c}=${b}-${a}+${A(0)}`); break;
      case 8: lines.push(`do local ${a}=${A(ri(1,9))} local ${b}=${a}*${a} local ${c}=${b}-${a}*${a} end`); break;
      case 9: lines.push(`local ${a}=(function() return ${A(ri(1,999))} end)()`); break;
    }
  }
  // shuffle
  for(let i=lines.length-1;i>0;i--){const j=ri(0,i);[lines[i],lines[j]]=[lines[j],lines[i]];}
  return lines.join(' ');
}

// ── Lexer ─────────────────────────────────────────────────────────────────────
const KW=new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while','goto']);

function lex(src) {
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

// ── Main obfuscator ───────────────────────────────────────────────────────────
function obfuscate(code) {
  resetVars();
  const tokens = lex(code);

  // collect strings
  const strTable=[], strMap=new Map();
  function addStr(s){
    if(!strMap.has(s)){strMap.set(s,strTable.length);strTable.push(s);}
    return strMap.get(s);
  }

  // common strings pre-populated
  ['','string','number','boolean','table','function','nil',
   'type','tostring','tonumber','pairs','ipairs','select','pcall',
   'rawget','rawset','next','error','assert','unpack',
   'math','bit32','coroutine',
   'game','workspace','script','Instance','DataModel',
   'Players','LocalPlayer','GetService','Kick','Security violation.',
  ].forEach(addStr);

  for(const tok of tokens) if(tok.t==='STR') addStr(tok.v);

  // XOR encode string table
  const xorKey=ri(1,127);
  const encTable=strTable.map(s=>{
    if(s==='') return '""';
    let enc='"';
    for(const c of s) enc+='\\'+String((c.charCodeAt(0)^xorKey)&0xFF).padStart(3,'0');
    return enc+'"';
  });

  const tLen=encTable.length;
  const tVar='H';

  // shuffle pairs (visual effect)
  const nShuf=Math.min(3,Math.floor(tLen/5));
  const shufPairs=[]; const usedP=new Set();
  for(let i=0;i<nShuf;i++){
    let a,b,k;
    do{a=ri(1,tLen);b=ri(1,tLen);k=`${a}:${b}`;}while(a===b||usedP.has(k));
    usedP.add(k);shufPairs.push([a,b]);
  }

  // --- build pieces ---

  // 1. String table
  const tableDecl=`local ${tVar}={${encTable.join(',')}}`;

  // 2. Shuffle init
  const shufCode=shufPairs.length===0?'':
    `for U,Z in ipairs({${shufPairs.map(([a,b])=>`{${A(a)};${A(b)}}`).join(',')}}) do `+
    `while Z[${A(1)}]<Z[${A(2)}] do `+
    `${tVar}[Z[${A(1)}]],${tVar}[Z[${A(2)}]],Z[${A(1)}],Z[${A(2)}]=`+
    `${tVar}[Z[${A(2)}]],${tVar}[Z[${A(1)}]],Z[${A(1)}]+${A(1)},Z[${A(2)}]-${A(1)} `+
    `end end`;

  // 3. Helper function U(n) = H[n+offset]
  const helperName=sv();
  const helperOffset=ri(1,50);
  // offset so H[idx+1] = H[U(idx+1-offset)] → U(x) = H[x+helperOffset]
  const helperCode=`local function ${helperName}(U) return ${tVar}[U+(${A(helperOffset)})] end`;

  // 4. Decoder loop
  const dA=sv(),dB=sv(),dC=sv(),dD=sv(),dE=sv(),dF=sv();
  const decoderCode=
    `do local ${dA}=string.char local ${dB}=string.byte local ${dC}=table.concat `+
    `for ${dD}=${A(1)},#${tVar},${A(1)} do `+
    `local ${dE}=${tVar}[${dD}] `+
    `if type(${dE})=="string" then `+
    `local ${dF}={} `+
    `for _j=${A(1)},#${dE} do ${dF}[_j]=${dA}(bit32.bxor(${dB}(${dE},_j),${A(xorKey)})) end `+
    `${tVar}[${dD}]=${dC}(${dF}) `+
    `end end end`;

  // 5. Rename identifiers, replace strings/numbers
  const idMap=new Map();
  function renameId(name){
    if(!idMap.has(name)) idMap.set(name,sv());
    return idMap.get(name);
  }
  function strRef(s){
    const idx=strMap.get(s);
    if(idx===undefined) return `"${s}"`;
    // H[idx+1] accessed via helper: helperName(idx+1-helperOffset)
    const arg=idx+1-helperOffset;
    return `${helperName}(${A(arg)})`;
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

  // 6. Junk injection — sprinkle junk before and after body
  const junkBefore = makeJunk(ri(6,10));
  const junkAfter  = makeJunk(ri(4,8));
  const body = junkBefore + ' ' + bodyTokens.join(' ') + ' ' + junkAfter;

  // 7. Closure wrapper — WeAreDevs style, fixed ending
  const paramNames='H,B,Q,q,I,T,g,i,A,J,p,j,V,G,z,L,P,Z,u,r';
  // FIX: unpack arg uses direct table key, not helper (avoids broken ref)
  const unpackArg='unpack or table.unpack';
  const envArg='getfenv and getfenv()or _ENV';

  // assemble final output
  const parts=[
    tableDecl,
    shufCode,
    helperCode,
    decoderCode,
    `return(function(${paramNames})`,
    body,
    `end)(${envArg},${unpackArg})`,
  ].filter(Boolean);

  return parts.join(' ').replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
}

module.exports = { obfuscate };
