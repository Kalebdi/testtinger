'use strict';
const crypto = require('crypto');

// ── Utilities ─────────────────────────────────────────────────────────────────
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// Short variable names, WeAreDevs style
const _POOL = 'HBQqITgiAJpjVGzLPZurFXSDCwmRnEkxbYoKvftlWNeds';
let _idx = 0;
const _used = new Set();
function sv() {
  while (_idx < _POOL.length) {
    const c = _POOL[_idx++];
    if (!_used.has(c)) { _used.add(c); return c; }
  }
  // fallback: 2-char combo
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let name;
  do { name = alpha[ri(0,25)] + alpha[ri(0,51)]; } while (_used.has(name));
  _used.add(name); return name;
}
function resetVars() { _idx = 0; _used.clear(); }

// ── Arithmetic obfuscation ────────────────────────────────────────────────────
function A(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
  if (n < -2147483648 || n > 2147483647) return String(n);
  const a = ri(1, 999);
  if (n < 0) return `(${n + a}-${a})`;
  const t = ri(0, 8);
  switch(t) {
    case 0: return `${n+a}-${a}`;
    case 1: return `${a}-(${a-n})`;
    case 2: return `${n*a}/${a}`;
    case 3: return `(function() return ${n+a}-${a} end)()`;
    case 4: return `(math.floor((${n+a}-${a})/1))`;
    case 5: return `(select(2,false,${n+a}-${a}))`;
    case 6: return `(math.abs(${n+a})-${a})`;
    case 7: { const k=ri(1,0x7FFF); return `bit32.bxor(bit32.bxor(${n},${k}),${k})`; }
    case 8: return `bit32.band(${n+a}-${a},4294967295)`;
    default: return String(n);
  }
}

// ── Lexer ─────────────────────────────────────────────────────────────────────
const KW = new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while','goto']);

function lex(src) {
  const tokens = []; let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src.slice(i,i+4)==='--[['){i+=4;while(i<src.length&&src.slice(i,i+2)!==']]')i++;i+=2;continue;}
    if (src.slice(i,i+2)==='--'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if (src.slice(i,i+2)==='[['){
      let j=i+2;while(j<src.length&&!(src[j]===']'&&src[j+1]===']'))j++;
      tokens.push({t:'STR',v:src.slice(i+2,j)});i=j+2;continue;
    }
    if (src[i]==='"'||src[i]==="'"){
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

// ── WeAreDevs-style obfuscator ────────────────────────────────────────────────
function obfuscate(code) {
  resetVars();

  // 1. Lex the source
  const tokens = lex(code);

  // 2. Collect all string literals
  const strTable = [];
  const strMap   = new Map();

  function addStr(s) {
    if (!strMap.has(s)) { strMap.set(s, strTable.length); strTable.push(s); }
    return strMap.get(s);
  }

  // Pre-populate with common Lua/Roblox strings (like WeAreDevs)
  ['','string','number','boolean','table','function','nil',
   'type','tostring','tonumber','pairs','ipairs','select','pcall','xpcall',
   'rawget','rawset','next','unpack','error','assert',
   'math','bit32','table','string','coroutine',
   'game','workspace','script','Instance','DataModel',
   'Players','LocalPlayer','GetService','Kick','Security violation.',
  ].forEach(addStr);

  // 3. Scan tokens and collect user strings
  for (const tok of tokens) {
    if (tok.t === 'STR') addStr(tok.v);
  }

  // 4. XOR-encrypt the string table
  const xorKey = ri(1, 127);
  const encTable = strTable.map(s => {
    if (s === '') return '""';
    let enc = '"';
    for (const c of s) enc += '\\' + String((c.charCodeAt(0) ^ xorKey) & 0xFF).padStart(3,'0');
    enc += '"';
    return enc;
  });

  // 5. Build table and shuffle pairs (visual WeAreDevs effect)
  const tLen    = encTable.length;
  const nShuf   = Math.min(3, Math.floor(tLen / 4));
  const shufPairs = [];
  const usedPairs = new Set();
  for (let i = 0; i < nShuf; i++) {
    let a, b, key;
    do { a = ri(1, tLen); b = ri(1, tLen); key = `${a}:${b}`; } while (a === b || usedPairs.has(key));
    usedPairs.add(key); shufPairs.push([a, b]);
  }

  const tVar = 'H';
  const tableDecl = `local ${tVar}={${encTable.join(',')}}`;

  // shuffle init pairs like WeAreDevs
  const shufCode = shufPairs.length === 0 ? '' :
    `for U,Z in ipairs({${shufPairs.map(([a,b]) =>
      `{${A(a)};${A(b)}}`
    ).join(',')}}) do while Z[${A(1)}]<Z[${A(2)}] do ${tVar}[Z[${A(1)}]],${tVar}[Z[${A(2)}]],Z[${A(1)}],Z[${A(2)}]=${tVar}[Z[${A(2)}]],${tVar}[Z[${A(1)}]],Z[${A(1)}]+${A(1)},Z[${A(2)}]-${A(1)} end end`;

  // 6. Helper function: U(n) = H[n + offset]
  const helperName = sv();
  const helperOffset = ri(-99, -1); // negative offset, like WeAreDevs
  const helperCode = `local function ${helperName}(U) return ${tVar}[U+(${A(-helperOffset)})] end`;

  // 7. Decoder loop — XOR decode in-place (matches WeAreDevs decode style)
  const dV1=sv(), dV2=sv(), dV3=sv(), dV4=sv(), dV5=sv(), dV6=sv();
  const decoderCode =
    `do local ${dV1}=string.char local ${dV2}=string.byte local ${dV3}=table.concat ` +
    `for ${dV4}=${A(1)},#${tVar},${A(1)} do ` +
    `local ${dV5}=${tVar}[${dV4}] ` +
    `if type(${dV5})=="string" then ` +
    `local ${dV6}={} ` +
    `for _j=${A(1)},#${dV5} do ${dV6}[_j]=${dV1}(bit32.bxor(${dV2}(${dV5},_j),${A(xorKey)})) end ` +
    `${tVar}[${dV4}]=${dV3}(${dV6}) ` +
    `end end end`;

  // 8. Process tokens — rename identifiers, replace strings with table refs
  const idMap = new Map();
  function renameId(name) {
    if (!idMap.has(name)) idMap.set(name, sv());
    return idMap.get(name);
  }

  // string table index helper
  function strRef(s) {
    const idx = strMap.get(s);
    if (idx === undefined) return `"${s}"`;
    // H[idx+1] with arithmetic obfuscation on index
    const rawIdx = idx + 1;
    return `${tVar}[${A(rawIdx)}]`;
  }

  const out = [];
  for (const tok of tokens) {
    if (tok.t === 'EOF') continue;
    switch (tok.t) {
      case 'ID':  out.push(renameId(tok.v)); break;
      case 'KW':  out.push(tok.v); break;
      case 'STR': out.push(strRef(tok.v)); break;
      case 'NUM': {
        const n = tok.v;
        if (Number.isInteger(n) && n >= 0 && n <= 2147483647) out.push(A(n));
        else out.push(String(n));
        break;
      }
      case 'OP':  out.push(tok.v); break;
      default:    out.push(tok.v || '');
    }
  }

  // 9. Wrapper closure — WeAreDevs style params
  const paramNames = ['H','B','Q','q','I','T','g','i','A','J','p','j','V','G','z','L','P','Z','u','r'].join(',');
  // The args passed in: env, unpack
  const envArg    = 'getfenv and getfenv()or _ENV';
  const unpackIdx = strTable.indexOf('unpack');
  const unpackArg = unpackIdx >= 0
    ? `unpack or table[${tVar}[${A(unpackIdx+1)}]]`
    : 'unpack or table.unpack';

  // 10. Assemble
  const body = [
    tableDecl,
    shufCode,
    helperCode,
    decoderCode,
    `return(function(${paramNames})`,
    out.join(' '),
    `end)(${envArg},${unpackArg})`,
  ].filter(Boolean).join(' ');

  // compact to 1 line
  return body.replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
}

module.exports = { obfuscate };
