'use strict';
const crypto = require('crypto');

// ── Utils ─────────────────────────────────────────────────────────
function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function rb(n){try{return[...crypto.randomBytes(n)];}catch{const b=new Uint8Array(n);globalThis.crypto.getRandomValues(b);return[...b];}}
function shuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=ri(0,i);[r[i],r[j]]=[r[j],r[i]];}return r;}

// ── Polymorphic short names ───────────────────────────────────────
const _alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function makeNames(){
  const used=new Set();
  return function(){
    let n;
    do{
      const len=ri(1,2);
      n='';for(let i=0;i<len;i++)n+=_alpha[ri(0,_alpha.length-1)];
    }while(used.has(n)||['do','if','or','in','end','for','nil','not','and','true','false','then','local','while','break','until','return','repeat','function','elseif','else'].includes(n));
    used.add(n);return n;
  };
}

// ── Arithmetic obfuscation ────────────────────────────────────────
function A(n){
  if(!Number.isFinite(n)||!Number.isInteger(n))return String(n);
  if(n<-2147483648||n>2147483647)return String(n);
  const a=ri(1,99999),b=ri(1,9999);
  if(n<0)return`(${n+a}-${a})`;
  const t=ri(0,9);
  switch(t){
    case 0:return`${n+a}-${a}`;
    case 1:return`${a}-(${a-n})`;
    case 2:return`${n*a}/${a}`;
    case 3:return`(function() return ${n+a}-${a} end)()`;
    case 4:return`(math.floor((${n+a}-${a})/1))`;
    case 5:return`(select(2,false,${n+a}-${a}))`;
    case 6:return`(math.abs(${n+a})-${a})`;
    case 7:{const k=ri(1,0x7FFF);return`bit32.bxor(bit32.bxor(${n},${k}),${k})`;}
    case 8:return`bit32.band(${n+a}-${a},4294967295)`;
    case 9:return`${n+a+b}-(${a+b})`;
    default:return String(n);
  }
}

// ── Custom base64 alphabet (random per build) ─────────────────────
function makeAlpha(){
  const base='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const arr=base.split('');
  for(let i=arr.length-1;i>0;i--){const j=ri(0,i);[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr.join('');
}

// Encode string to custom base64 (returns string of \ddd escapes)
function customB64(bytes,alpha){
  let bits='',out='';
  for(const b of bytes)bits+=b.toString(2).padStart(8,'0');
  // pad to multiple of 6
  while(bits.length%6!==0)bits+='0';
  for(let i=0;i<bits.length;i+=6){
    out+=alpha[parseInt(bits.slice(i,i+6),2)];
  }
  // add padding
  while(out.length%4!==0)out+='=';
  return out;
}

// Encode string to \ddd form
function toDdd(s){
  return '"'+[...s].map(c=>'\\'+String(c.charCodeAt(0)).padStart(3,'0')).join('')+'"';
}

// Build the decoder V table (like WeAreDevs)
// Maps each char in alpha to its index value for base64 decoding
function makeDecoderTable(alpha,vName){
  // V maps printable chars to their roles in the custom base64
  // Each char in alpha maps to its index (0-63)
  const entries=[];
  for(let i=0;i<alpha.length;i++){
    const c=alpha[i];
    const code=c.charCodeAt(0);
    // Use arithmetic obfuscation on both key and value
    // Key: quoted char or number key
    const keyStr=`[${toDdd(c)}]`;
    entries.push(`${keyStr}=${A(i)}`);
  }
  // Shuffle entries for visual variety
  return shuffle(entries).join(',');
}

// ── XOR string hider ──────────────────────────────────────────────
function xorHide(s,namer){
  const key=rb(s.length).map(b=>(b&0x7F)|1);
  const enc=[...s].map((c,i)=>c.charCodeAt(0)^key[i]);
  const vt=namer(),vk=namer(),vo=namer(),vi=namer();
  return `(function() local ${vt}={${enc.map(A).join(',')}} local ${vk}={${key.map(A).join(',')}} local ${vo}={} for ${vi}=${A(1)},#${vt} do ${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) end return table.concat(${vo}) end)()`;
}

// ── Opaque predicates ─────────────────────────────────────────────
function opTrue(){
  const x=ri(1,9999);
  const t=ri(0,4);
  switch(t){
    case 0:return`(${x}*${x}>=(${A(0)}-${A(0)}))`;
    case 1:return`(${x}==${x})`;
    case 2:return`(type(nil)==type(nil))`;
    case 3:return`(math.abs(${x})>=${A(0)})`;
    case 4:return`(${x}+${x}==(${A(1)}-${A(1)}+2)*${x})`;
    default:return`(1==1)`;
  }
}
function opFalse(){
  const x=ri(1,9999);
  const t=ri(0,3);
  switch(t){
    case 0:return`(${x}~=${x})`;
    case 1:return`(nil==true)`;
    case 2:return`(type(nil)=="number")`;
    case 3:return`(${ri(2,998)*2}%2~=0)`;
    default:return`(1==2)`;
  }
}

// ── Dead code ─────────────────────────────────────────────────────
function deadCode(namer,n=4){
  const lines=[];
  for(let i=0;i<n;i++){
    const a=namer(),b=namer(),t=ri(0,6);
    switch(t){
      case 0:lines.push(`local ${a}=${A(ri(1,999))} local ${b}=${a}+${A(0)}-${A(0)}`);break;
      case 1:lines.push(`if ${opFalse()} then local ${a}=${A(ri(1,999))} end`);break;
      case 2:lines.push(`if ${opTrue()} then local ${a}=${A(ri(1,99))} local ${b}=${a}-${A(0)} end`);break;
      case 3:lines.push(`local ${a}={} ${a}=nil`);break;
      case 4:lines.push(`local ${a}=(function() return ${A(ri(1,999))} end)()`);break;
      case 5:lines.push(`do local ${a}=${A(ri(1,9))} local ${b}=${a}*${a}-${a}*${a} end`);break;
      case 6:lines.push(`local ${a}=bit32.bxor(${A(ri(1,127))},${A(0)})`);break;
    }
  }
  return shuffle(lines).join(' ');
}

// ── Lexer ─────────────────────────────────────────────────────────
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
    if(['==','~=','<=','>=','..','//'].includes(op2)){tok.push({t:'O',v:op2});i+=2;continue;}
    tok.push({t:'O',v:src[i]});i++;
  }
  tok.push({t:'E',v:''});return tok;
}

// ── Main obfuscator ───────────────────────────────────────────────
function obfuscate(code){
  const namer=makeNames();
  const alpha=makeAlpha();    // random per build

  // ── 1. Build string table ────────────────────────────────────────
  const tokens=lex(code);
  const strTable=[],strMap=new Map();
  function addStr(s){if(!strMap.has(s)){strMap.set(s,strTable.length);strTable.push(s);}return strMap.get(s);}

  // common strings
  ['','string','number','boolean','table','function','nil',
   'type','tostring','tonumber','pairs','ipairs','pcall',
   'rawget','rawset','next','error','assert',
   'math','bit32','coroutine',
   'game','workspace','script',
  ].forEach(addStr);
  for(const tok of tokens)if(tok.t==='S')addStr(tok.v);

  // Encode strings using custom base64 → store as \ddd
  const encTable=strTable.map(s=>{
    if(s==='')return'""';
    const bytes=[...s].map(c=>c.charCodeAt(0));
    const b64=customB64(bytes,alpha);
    return toDdd(b64);
  });

  // table name = random single/double letter
  const tVar=namer();
  const tLen=encTable.length;

  // ── 2. Shuffle pairs (like WeAreDevs 3 pairs) ────────────────────
  const usedP=new Set();const shufPairs=[];
  const nShuf=Math.min(3,Math.floor(tLen/5));
  for(let i=0;i<nShuf;i++){
    let a,b,k;
    do{a=ri(1,tLen);b=ri(1,tLen);k=`${a}:${b}`;}while(a===b||usedP.has(k));
    usedP.add(k);shufPairs.push([a,b]);
  }

  // loop var names
  const loopV1=namer(),loopV2=namer();
  const shufCode=shufPairs.length===0?'':
    `for ${loopV1},${loopV2} in ipairs({${shufPairs.map(([a,b])=>`{${A(a)};${A(b)}}`).join(';')}}) do `+
    `while ${loopV2}[${A(1)}]<${loopV2}[${A(2)}] do `+
    `${tVar}[${loopV2}[${A(1)}]],${tVar}[${loopV2}[${A(2)}]],${loopV2}[${A(1)}],${loopV2}[${A(2)}]=`+
    `${tVar}[${loopV2}[${A(2)}]],${tVar}[${loopV2}[${A(1)}]],${loopV2}[${A(1)}]+${A(1)},${loopV2}[${A(2)}]-${A(1)} `+
    `end end`;

  // ── 3. Helper function (like WeAreDevs T(T) = c[T-offset]) ───────
  const helperName=namer();
  const helperOffset=ri(tLen+1,tLen+9999);
  const helperArg=namer();
  const helperCode=`local function ${helperName}(${helperArg}) return ${tVar}[${helperArg}-(${A(helperOffset-1)})] end`;
  // to get strTable[i] (1-based): helperName(i + helperOffset - 1)
  function strRef(idx){
    // strTable is 1-based in Lua, idx is 0-based in JS
    const luaIdx=idx+1;
    const arg=luaIdx+helperOffset-1;
    return `${helperName}(${A(arg)})`;
  }

  // ── 4. Decoder block (WeAreDevs style decode table + loop) ────────
  const decV=namer(),lenV=namer(),mathV=namer(),subV=namer();
  const locV=namer(),addV=namer(),iVar=namer();
  const innerV=namer(),gVar=namer(),cVar=namer();
  const pVar=namer(),wVar=namer(),bVar=namer();
  const concatV=namer();

  // Build the V decode table: maps each char of alpha to its index
  // Also maps '=' to special handling
  const decTableVar=namer();
  const decEntries=[];
  for(let i=0;i<alpha.length;i++){
    decEntries.push(`[${toDdd(alpha[i])}]=${A(i)}`);
  }
  // shuffle entries
  const shuffledEntries=shuffle(decEntries).join(',');

  // The decoder loop: decodes each string in the table in-place
  // Mimics WeAreDevs: while C<=m do ... base64 decode ... end
  const dI=namer(),dM=namer(),dG=namer(),dC=namer(),dP=namer(),dW=namer();
  const dT=namer(),dU=namer(),dQ=namer(),dB=namer(),dN=namer(),dA=namer();

  const decoderCode=
    `do `+
    `local ${dT}=table.concat `+
    `local ${dU}=string.len `+
    `local ${dB}=math.floor `+
    `local ${dA}=string.sub `+
    `local ${concatV}=${tVar} `+
    `local ${decTableVar}={${shuffledEntries}} `+
    `for ${dI}=${A(1)},#${concatV},${A(1)} do `+
      `local ${dN}=${concatV}[${dI}] `+
      `if type(${dN})=="string" then `+
        `local ${dM}=${dU}(${dN}) `+
        `local ${dG}={} `+
        `local ${dC}=${A(1)} `+
        `local ${dP}=${A(0)} `+
        `local ${dW}=${A(0)} `+
        `while ${dC}<=${dM} do `+
          `local ${dQ}=${dA}(${dN},${dC},${dC}) `+
          `local ${dT}=${decTableVar}[${dQ}] `+
          `if ${dT} then `+
            `${dP}=${dP}+${dT}*(${A(64)})^((${A(3)})-${dW}) `+
            `${dW}=${dW}+${A(1)} `+
            `if ${dW}==${A(4)} then `+
              `${dW}=${A(0)} `+
              `local ${dA}=${dB}(${dP}/${A(65536)}) `+
              `local ${dU}=${dB}((${dP}%(${A(65536)}))/${A(256)}) `+
              `local ${dM}=${dP}%${A(256)} `+
              `table.insert(${dG},string.char(${dA},${dU},${dM})) `+
              `${dP}=${A(0)} `+
            `end `+
          `elseif ${dQ}=="=" then `+
            `table.insert(${dG},string.char(${dB}(${dP}/${A(65536)}))) `+
            `if ${dC}>=${dM} or ${dA}(${dN},${dC}+${A(1)},${dC}+${A(1)})~="=" then `+
              `table.insert(${dG},string.char(${dB}((${dP}%${A(65536)})/${A(256)}))) `+
            `end `+
            `break `+
          `end `+
          `${dC}=${dC}+${A(1)} `+
        `end `+
        `${concatV}[${dI}]=table.concat(${dG}) `+
      `end `+
    `end end`;

  // ── 5. Process body tokens ────────────────────────────────────────
  const idMap=new Map();
  function renId(n){if(!idMap.has(n))idMap.set(n,namer());return idMap.get(n);}

  const bodyToks=[];
  for(const tok of tokens){
    if(tok.t==='E')continue;
    switch(tok.t){
      case 'I': bodyToks.push(renId(tok.v));break;
      case 'K': bodyToks.push(tok.v);break;
      case 'S': {
        const idx=strMap.get(tok.v);
        bodyToks.push(idx!==undefined?strRef(idx):`"${tok.v}"`);
        break;
      }
      case 'N':{
        const n=tok.v;
        if(Number.isInteger(n)&&n>=0&&n<=2147483647)bodyToks.push(A(n));
        else bodyToks.push(String(n));
        break;
      }
      case 'O': bodyToks.push(tok.v);break;
      default:  bodyToks.push(tok.v||'');
    }
  }

  // ── 6. Anti-tamper (game check + anti-hook → crash) ─────────────────
  const xInst=xorHide('Instance',namer);
  const xDM  =xorHide('DataModel',namer);
  // anti-hook: hidden strings for hook function names
  const xHkFn =xorHide('hookfunction',namer);
  const xHkFn2=xorHide('hookfunc',namer);
  const xRepCl=xorHide('replaceclosure',namer);
  const xNewCl=xorHide('newcclosure',namer);

  const vEi=namer(),vEd=namer(),vGenv=namer(),vHook=namer(),vCr=namer();
  const antiTamper=
    // game check
    `local ${vEi}=${xInst} local ${vEd}=${xDM} `+
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd}) then local ${vCr}=nil ${vCr}() return end `+
    `${vEi}=nil ${vEd}=nil `+
    // anti-hook: if hookfunction/replaceclosure exists → someone is hooking → crash
    `local ${vGenv}=(getgenv and getgenv()) or _G `+
    `local ${vHook}=rawget(${vGenv},${xHkFn}) or rawget(${vGenv},${xHkFn2}) or rawget(${vGenv},${xRepCl}) or rawget(${vGenv},${xNewCl}) `+
    `if ${vHook}~=nil then local ${vCr}=nil ${vCr}() return end `+
    `${vGenv}=nil ${vHook}=nil`;

  // ── 7. Closure params (22 like WeAreDevs) ─────────────────────────
  // Generate 22 unique param names
  // no unused params needed

  // ── 8. Dead code surrounding body ────────────────────────────────
  const dead1=deadCode(namer,ri(6,10));
  const dead2=deadCode(namer,ri(4,8));
  const body=dead1+' '+bodyToks.join(' ')+' '+dead2;

  // ── 9. Assemble final output ──────────────────────────────────────
  const tableDecl=`local ${tVar}={${encTable.join(',')}}`;
  const envArg='getfenv and getfenv()or _ENV';


  // WeAreDevs uses: --[[ v1.0.0 ... ]] at top
  const header=`--[[ SOLI v1.0.0 ]]`;

  const result=[
    header,
    `return(function(...)`,
    tableDecl,
    shufCode,
    helperCode,
    decoderCode,
    `return(function()`,
    antiTamper,
    body,
    `end)()`,
    `end)(...)`,
  ].filter(Boolean).join(' ');

  return result.replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
}

module.exports={obfuscate};
