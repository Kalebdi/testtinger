'use strict';
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
//  WEAREDEVS-STYLE LUAU OBFUSCATOR — FULL REWRITE
//
//  Output structure matches WeAreDevs obfuscator:
//  - Base64-encoded string table A={...} with octal byte escapes
//  - Custom base64 decoder with shuffled alphabet
//  - Nested self-calling closure (function(...)...end)(...)
//  - Register-based VM with opaque control flow (if F< chains)
//  - Single-letter variable names (A,F,M,m,V,y,d,G,I,T,K,Z,X,h,k,b,w,J,z,Q,e,i,n)
//  - Shuffle pairs on string table
//  - String table accessor Y() with offset
//  - Heavy numeric obfuscation with nested arithmetic
//  - Anti-tamper via environment capture
//  - All strings encoded as octal escape sequences
// ═══════════════════════════════════════════════════════════════════════════════

function ri(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CUSTOM BASE64 ENCODER
// WeAreDevs uses a shuffled base64 alphabet stored in a lookup table
// ══════════════════════════════════════════════════════════════════════════════

const STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function shuffleB64() {
  const chars = STD_B64.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function b64encode(str, alphabet) {
  const alph = alphabet || STD_B64;
  let result = '';
  for (let i = 0; i < str.length; i += 3) {
    const b0 = str.charCodeAt(i);
    const b1 = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
    const b2 = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    result += alph[(triplet >> 18) & 0x3F];
    result += alph[(triplet >> 12) & 0x3F];
    result += i + 1 < str.length ? alph[(triplet >> 6) & 0x3F] : '=';
    result += i + 2 < str.length ? alph[triplet & 0x3F] : '=';
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — OCTAL ESCAPE STRING ENCODING
// WeAreDevs encodes every character as \NNN octal sequences
// ══════════════════════════════════════════════════════════════════════════════

function toOctalEscaped(s) {
  if (s === '') return '""';
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    result += '\\' + code.toString(8).padStart(3, '0');
  }
  result += '"';
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — NUMERIC OBFUSCATION (WeAreDevs style)
// Heavy nested arithmetic: -741895+9309779, 322668-322667, etc.
// ══════════════════════════════════════════════════════════════════════════════

function N(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);

  const forms = [
    // Simple offset
    () => { const a = ri(100000, 999999); return `${n + a}-${a}`; },
    () => { const a = ri(100000, 999999); return `-${a - n}+${a}`; },
    () => { const a = ri(100000, 999999); return `${a}-(${a - n})`; },
    () => { const a = ri(100000, 999999); return `-${a}-(-${a + n})`; },
    () => { const a = ri(10000, 99999); return `${n + a}+-${a}`; },
    // Division
    () => {
      const factors = [2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 17, 19, 23];
      const f = factors[ri(0, factors.length - 1)];
      if (n % f === 0) return `${n * f}/${f}`;
      const a = ri(100000, 999999);
      return `${n + a}-${a}`;
    },
    // Parenthesized
    () => { const a = ri(100000, 999999); return `(${n + a}-(${a}))`; },
    () => { const a = ri(10000, 99999); const b = ri(1000, 9999); return `${n + a + b}-(${a + b})`; },
    // Function wrapper
    () => { const a = ri(100000, 999999); return `(function()return ${n + a}-${a} end)()`; },
    // Negative style
    () => { const a = ri(100000, 999999); return `${n + a}+(-${a})`; },
    // String length (small numbers only)
    () => {
      if (n >= 0 && n <= 30) return `#"${'x'.repeat(n)}"`;
      const a = ri(100000, 999999);
      return `${n + a}-${a}`;
    },
    // Select
    () => { const a = ri(100000, 999999); return `(select(2,false,${n + a}-${a}))`; },
  ];

  return forms[ri(0, forms.length - 1)]();
}

// Heavier version for control flow numbers
function NH(n) {
  const a = ri(100000, 999999);
  const b = ri(100000, 999999);
  const forms = [
    `${n + a}-(${a})`,
    `-${a}+(${a + n})`,
    `${n + a}+(-${a})`,
    `${a}-(${a - n})`,
    `-${a}-(-${a + n})`,
    `(${n + a + b}-(${a + b}))`,
  ];
  return forms[ri(0, forms.length - 1)];
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — LEXER
// ══════════════════════════════════════════════════════════════════════════════

const KW = new Set([
  'and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true',
  'until','while','goto','continue',
]);
const OP2 = new Set(['==','~=','<=','>=','..','//','+=','-=','*=','/=']);

function lex(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;
  while (i < len) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (i+3<len&&src[i]==='-'&&src[i+1]==='-'&&src[i+2]==='['&&src[i+3]==='[') {
      i+=4; while(i+1<len&&!(src[i]===']'&&src[i+1]===']'))i++; if(i+1<len)i+=2; continue;
    }
    if (i+1<len&&src[i]==='-'&&src[i+1]==='-') {
      i+=2; while(i<len&&src[i]!=='\n')i++; continue;
    }
    if (i+1<len&&src[i]==='['&&src[i+1]==='[') {
      let j=i+2; while(j+1<len&&!(src[j]===']'&&src[j+1]===']'))j++;
      tokens.push({t:'STR',v:src.slice(i+2,j)}); i=j+2; continue;
    }
    if (src[i]==='"'||src[i]==="'") {
      const q=src[i++]; let s='';
      while(i<len&&src[i]!==q){
        if(src[i]==='\\'){
          i++; if(i>=len)break; const c=src[i];
          if(c==='n'){s+='\n';i++;}else if(c==='t'){s+='\t';i++;}
          else if(c==='r'){s+='\r';i++;}else if(c==='\\'){s+='\\';i++;}
          else if(c===q){s+=q;i++;}else if(c==='0'){s+='\0';i++;}
          else if(c==='a'){s+='\x07';i++;}else if(c==='b'){s+='\b';i++;}
          else if(c==='f'){s+='\f';i++;}else if(c==='v'){s+='\v';i++;}
          else if(c==='x'&&i+2<len&&/^[0-9a-fA-F]{2}$/.test(src[i+1]+src[i+2])){
            s+=String.fromCharCode(parseInt(src[i+1]+src[i+2],16));i+=3;
          }else if(/[0-9]/.test(c)){
            let d='';while(i<len&&/[0-9]/.test(src[i])&&d.length<3)d+=src[i++];
            s+=String.fromCharCode(parseInt(d,10));
          }else{s+=c;i++;}
        }else s+=src[i++];
      }
      if(i<len)i++;
      tokens.push({t:'STR',v:s}); continue;
    }
    if(src[i]==='0'&&i+1<len&&(src[i+1]==='x'||src[i+1]==='X')){
      let n='0x';i+=2;
      while(i<len&&/[0-9a-fA-F_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      tokens.push({t:'NUM',v:Number(n)});continue;
    }
    if(src[i]==='0'&&i+1<len&&(src[i+1]==='b'||src[i+1]==='B')){
      let n='';i+=2;
      while(i<len&&/[01_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      tokens.push({t:'NUM',v:parseInt(n||'0',2)});continue;
    }
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&i+1<len&&/[0-9]/.test(src[i+1]))){
      let n='';
      while(i<len&&/[0-9_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      if(i<len&&src[i]==='.'&&(i+1>=len||src[i+1]!=='.')){
        n+=src[i++];
        while(i<len&&/[0-9_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      }
      if(i<len&&(src[i]==='e'||src[i]==='E')){
        n+=src[i++];if(i<len&&(src[i]==='+'||src[i]==='-'))n+=src[i++];
        while(i<len&&/[0-9]/.test(src[i]))n+=src[i++];
      }
      tokens.push({t:'NUM',v:Number(n)});continue;
    }
    if(/[a-zA-Z_]/.test(src[i])){
      let w='';while(i<len&&/[a-zA-Z0-9_]/.test(src[i]))w+=src[i++];
      tokens.push({t:KW.has(w)?'KW':'ID',v:w});continue;
    }
    if(i+2<len&&src[i]==='.'&&src[i+1]==='.'&&src[i+2]==='.'){
      tokens.push({t:'OP',v:'...'});i+=3;continue;
    }
    if(i+1<len&&OP2.has(src[i]+src[i+1])){
      tokens.push({t:'OP',v:src[i]+src[i+1]});i+=2;continue;
    }
    tokens.push({t:'OP',v:src[i]});i++;
  }
  tokens.push({t:'EOF',v:''});
  return tokens;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — GLOBALS WHITELIST
// ══════════════════════════════════════════════════════════════════════════════

const GLOBAL_IDS = new Set([
  'print','warn','error','assert','type','typeof','tostring','tonumber',
  'pairs','ipairs','next','select','pcall','xpcall','rawget','rawset',
  'rawequal','rawlen','unpack','require','loadstring','newproxy',
  'setmetatable','getmetatable','getfenv','setfenv',
  'table','string','math','bit32','coroutine','os','debug','utf8','buffer',
  'game','workspace','script','Instance','Enum','wait','delay','spawn',
  'tick','time','task','getgenv','getrenv','getreg',
  'readfile','writefile','syn','fluxus','deltaexecute',
  'Vector3','Vector2','CFrame','Color3','BrickColor',
  'UDim','UDim2','Rect','Ray','Region3','TweenInfo',
  'NumberRange','NumberSequence','ColorSequence','PhysicalProperties',
  'true','false','nil','self','_G','_ENV','_VERSION',
  'collectgarbage','dofile','load','shared',
  'Random','table','insert','remove','concat','sort','move','find','clear',
  'char','byte','sub','len','rep','reverse','format','lower','upper','gmatch',
  'gsub','match','floor','ceil','abs','max','min','sqrt','sin','cos','tan',
  'random','huge','pi','bxor','band','bor','bnot','lshift','rshift',
  'wrap','yield','resume','create','status',
  'clock','difftime',
]);

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — WEAREDEVS JUNK CODE PATTERNS
// Uses single-letter and short variable names with heavy arithmetic
// ══════════════════════════════════════════════════════════════════════════════

let _varCounter = 0;
function wv() {
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (_varCounter < pool.length) return pool[_varCounter++];
  return pool[ri(0, pool.length - 1)] + '_' + (_varCounter++);
}

function resetWV() { _varCounter = 0; }

function makeJunk(count) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const t = ri(0, 35);
    const v1 = wv(), v2 = wv(), v3 = wv();
    switch (t) {
      case 0:
        lines.push(`${v1}=nil`);
        break;
      case 1:
        lines.push(`${v1}=K()`);
        break;
      case 2: {
        const a = ri(100000, 999999), b = ri(100000, 999999);
        lines.push(`${v1}=Y(${-a}-(-${a - ri(10000, 99999)}))`);
        break;
      }
      case 3:
        lines.push(`${v1}={}`);
        break;
      case 4:
        lines.push(`I[${v1}]=${v2}`);
        break;
      case 5: {
        const a = ri(100000, 999999);
        lines.push(`${v1}=Y(${a}+-${a + ri(10000, 99999)})`);
        break;
      }
      case 6:
        lines.push(`${v1}=e(${v1})`);
        break;
      case 7: {
        const a = ri(100000, 999999), b = ri(100000, 999999);
        lines.push(`${v1}=${a}+-${a}`);
        break;
      }
      case 8:
        lines.push(`${v1}=${v2}==${v3}`);
        break;
      case 9: {
        const a = ri(100000, 999999);
        lines.push(`${v1}=-${a}-(-${a + ri(1, 999)})`);
        break;
      }
      case 10:
        lines.push(`${v1}=not ${v2}`);
        break;
      case 11: {
        const a = ri(100000, 999999), b = ri(1, 99);
        lines.push(`${v1}=${a}-${a - b}`);
        break;
      }
      case 12:
        lines.push(`${v1}=${v2}~=${v3}`);
        break;
      case 13: {
        const a = ri(100000, 999999);
        lines.push(`${v1}=${a}-(${a})`);
        break;
      }
      case 14:
        lines.push(`${v1}=I[${v2}]`);
        break;
      case 15: {
        const a = ri(2, 20), b = ri(100, 999);
        lines.push(`${v1}=${a * b}/${a}`);
        break;
      }
      case 16:
        lines.push(`${v1}=K()\nI[${v1}]=${v2}`);
        break;
      case 17: {
        const a = ri(100000, 999999), b = ri(100000, 999999);
        lines.push(`${v1}=${a}+-${a}\n${v2}=${v1}`);
        break;
      }
      case 18:
        lines.push(`${v1}=#${v2}`);
        break;
      case 19: {
        const a = ri(100000, 999999);
        lines.push(`${v1}=${v2}+${a}\n${v1}=${v1}-${a}`);
        break;
      }
      case 20:
        lines.push(`${v1}=true\n${v1}=${v1} and ${N(ri(1, 999999))} or ${N(ri(1, 999999))}`);
        break;
      case 21:
        lines.push(`${v1}={${v2}}`);
        break;
      case 22: {
        const a = ri(1, 255), b = ri(1, 255);
        lines.push(`${v1}=bit32.bxor(${a},${b})`);
        break;
      }
      case 23:
        lines.push(`${v1}=nil\n${v2}=nil`);
        break;
      case 24: {
        const a = ri(100000, 999999), b = ri(100000, 999999);
        lines.push(`${v1}=(${a+b})-(${a})\n${v2}=${v1}-(${b})`);
        break;
      }
      case 25:
        lines.push(`${v1}=select(1,${N(ri(1, 999))})`);
        break;
      case 26:
        lines.push(`${v1}=type(${v2})`);
        break;
      case 27: {
        const a = ri(100000, 999999);
        lines.push(`${v1}=math.floor(${a}/${ri(2, 100)})`);
        break;
      }
      case 28:
        lines.push(`${v1}=math.abs(${ri(100000, 999999)})-${ri(100000, 999999)}`);
        break;
      case 29:
        lines.push(`${v1}=e(${v2})\n${v2}=nil`);
        break;
      case 30: {
        const a = ri(100000, 999999), b = ri(1, 999);
        lines.push(`${v1}=(function()return ${a+b}-${a} end)()`);
        break;
      }
      case 31:
        lines.push(`${v1}=I[V[${ri(-999999, -1)}-(-${ri(1, 999999)})]]\n${v2}=${v1}`);
        break;
      case 32:
        lines.push(`${v1}=K()\n${v2}=K()\nI[${v1}]=${v3}\nI[${v2}]=${v3}`);
        break;
      case 33: {
        const a = ri(100000, 999999), b = ri(100000, 999999);
        lines.push(`${v1}=-${a}+${a+ri(1,100)}\n${v2}=${v1}+${b}-${b}`);
        break;
      }
      case 34:
        lines.push(`${v1}=e(${v1})\n${v2}=e(${v2})\n${v3}=nil`);
        break;
      case 35:
        lines.push(`${v1}=${v2} and ${N(ri(1, 999))} or ${N(ri(1, 999))}`);
        break;
    }
  }
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — CONTROL FLOW NODE BUILDER
// Generates nested if F<N then ... branches like WeAreDevs
// ══════════════════════════════════════════════════════════════════════════════

function buildControlFlowTree(blocks, varName, depth = 0) {
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0].code;

  // Split blocks roughly in half and create if-else branches
  const mid = Math.floor(blocks.length / 2);
  const threshold = blocks[mid].id;

  const left = blocks.slice(0, mid);
  const right = blocks.slice(mid);

  const indent = '  '.repeat(depth);

  let result = `${indent}if ${varName}<${NH(threshold)} then\n`;
  result += buildControlFlowTree(left, varName, depth + 1);
  result += `\n${indent}else\n`;
  result += buildControlFlowTree(right, varName, depth + 1);
  result += `\n${indent}end`;

  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — STRING TABLE BUILDER
// ══════════════════════════════════════════════════════════════════════════════

function buildStringTable(strings, b64Alphabet) {
  return strings.map(s => {
    if (s === '') return '""';
    const encoded = b64encode(s, b64Alphabet);
    return toOctalEscaped(encoded);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — BASE64 DECODER GENERATOR (Lua code)
// Generates the inline decoder that WeAreDevs uses
// ══════════════════════════════════════════════════════════════════════════════

function generateB64Decoder(alphabet, tableVar) {
  // Build lookup table for the shuffled alphabet
  const lookupEntries = [];
  for (let i = 0; i < alphabet.length; i++) {
    const ch = alphabet[i];
    // Escape special chars for Lua table key
    let key;
    if (ch === '"') key = '[\\"]';
    else if (ch === '\\') key = '["\\\\"]';
    else if (ch === '+') key = '["\\043"]';
    else if (ch === '/') key = '["\\047"]';
    else key = ch;

    lookupEntries.push(`${key}=${N(i)}`);
  }

  // Use WeAreDevs-style variable names for decoder internals
  const code = `do local Y=type local F=${tableVar} local M=table.insert local m=table.concat ` +
    `local V=string.sub local y=string.char local d=string.len local G=math.floor ` +
    `local I={${lookupEntries.join(';')}} ` +
    `for A=${N(1)},#F,${N(1)} do local h=F[A] ` +
    `if Y(h)=="\\115\\116\\114\\105\\110\\103" then ` +
    `local Y=d(h) local K={} local i=${N(1)} local z=${N(0)} local Q=${N(0)} ` +
    `while i<=Y do local A=V(h,i,i) local F=I[A] ` +
    `if F then z=z+F*${N(64)}^(${N(3)}-Q) Q=Q+${N(1)} ` +
    `if Q==${N(4)} then Q=${N(0)} ` +
    `local A=G(z/${N(65536)}) local Y=G((z%${N(65536)})/${N(256)}) local F=z%${N(256)} ` +
    `M(K,y(A,Y,F)) z=${N(0)} end ` +
    `elseif A=="\\061" then M(K,y(G(z/${N(65536)}))) ` +
    `if i>=Y or V(h,i+${N(1)},i+${N(1)})~="\\061" then ` +
    `M(K,y(G((z%${N(65536)})/${N(256)}))) end break end ` +
    `i=i+${N(1)} end F[A]=m(K) end end end`;

  return code;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — SHUFFLE PAIRS GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

function generateShufflePairs(tableLen) {
  const count = Math.min(ri(2, 5), Math.floor(tableLen / 3));
  const pairs = [];
  const used = new Set();

  for (let i = 0; i < count; i++) {
    let a, b, k;
    do {
      a = ri(1, tableLen);
      b = ri(1, tableLen);
      k = `${a}:${b}`;
    } while (a === b || Math.abs(a - b) < 2 || used.has(k));
    used.add(k);
    // Ensure a < b for the while loop to work
    if (a > b) [a, b] = [b, a];
    pairs.push([a, b]);
  }

  if (pairs.length === 0) return '';

  const pairStrs = pairs.map(([a, b]) => `{${NH(a)};${NH(b)}}`);

  return `for Y,F in ipairs({${pairStrs.join(';')}}) do ` +
    `while F[${NH(1)}]<F[${NH(2)}] do ` +
    `A[F[${NH(1)}]],A[F[${NH(2)}]],F[${NH(1)}],F[${NH(2)}]=` +
    `A[F[${NH(2)}]],A[F[${NH(1)}]],F[${NH(1)}]+(${NH(1)}),F[${NH(2)}]-(${NH(1)}) ` +
    `end end`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — ACCESSOR FUNCTION Y()
// ══════════════════════════════════════════════════════════════════════════════

function generateAccessor(tableVar, offset) {
  return `local function Y(Y)return ${tableVar}[Y+(${NH(offset)})]end`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — OPAQUE CONTROL FLOW GENERATOR
// Builds the nested if-chain dispatch like WeAreDevs
// ══════════════════════════════════════════════════════════════════════════════

function generateOpaqueDispatch(bodyLines) {
  // Assign random state IDs to each block
  const blocks = bodyLines.map((code, idx) => ({
    id: ri(1000000, 99999999),
    code,
    order: idx,
  }));

  // Sort by ID for the binary-search-style if-chain
  blocks.sort((a, b) => a.id - b.id);

  // Generate state variable and dispatch
  const stateVar = 'F';

  const dispatchEntries = blocks.map(b => ({
    id: b.id,
    code: b.code,
    next: blocks.find(bl => bl.order === b.order + 1)?.id || null,
  }));

  let dispatch = '';
  for (let i = 0; i < dispatchEntries.length; i++) {
    const entry = dispatchEntries[i];
    const prefix = i === 0 ? 'if' : 'elseif';
    dispatch += `${prefix} ${stateVar}<${NH(entry.id + 1)} then\n`;
    dispatch += entry.code + '\n';
    if (entry.next !== null) {
      dispatch += `${stateVar}=${NH(entry.next)}\n`;
    } else {
      dispatch += `${stateVar}=nil\n`;
    }
  }
  dispatch += 'end';

  const initState = blocks.find(b => b.order === 0).id;

  return {
    init: `local ${stateVar}=${NH(initState)}`,
    loop: `while ${stateVar} do\n${dispatch}\nend`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — BODY TOKEN PROCESSOR
// ══════════════════════════════════════════════════════════════════════════════

function needsSpace(prev, curr) {
  if (!prev || !curr) return true;
  if (/[a-zA-Z0-9_]$/.test(prev) && /^[a-zA-Z0-9_]/.test(curr)) return true;
  if (prev.endsWith('-') && curr.startsWith('-')) return true;
  if (prev.endsWith('.') && curr.startsWith('.')) return true;
  if (/[0-9]$/.test(prev) && curr.startsWith('.')) return true;
  return false;
}

function processBody(tokens, strMap, accessorOffset, tableVar) {
  const idMap = new Map();

  function renameId(name) {
    if (GLOBAL_IDS.has(name)) return name;
    if (!idMap.has(name)) {
      // WeAreDevs uses single uppercase letters, then double
      const pool = 'abcdefghijklmnopqrstuvwxyz';
      const idx = idMap.size;
      if (idx < pool.length) {
        idMap.set(name, pool[idx].toUpperCase());
      } else {
        const a = Math.floor(idx / pool.length);
        const b = idx % pool.length;
        idMap.set(name, pool[a % pool.length].toUpperCase() + pool[b]);
      }
    }
    return idMap.get(name);
  }

  function strRef(s) {
    const idx = strMap.get(s);
    if (idx === undefined) return `"${luaEsc(s)}"`;
    const arg = idx + 1 - accessorOffset;
    return `Y(${NH(arg)})`;
  }

  const parts = [];
  for (const tok of tokens) {
    if (tok.t === 'EOF') continue;
    switch (tok.t) {
      case 'ID':  parts.push(renameId(tok.v)); break;
      case 'KW':  parts.push(tok.v); break;
      case 'STR': parts.push(strRef(tok.v)); break;
      case 'NUM': {
        const n = tok.v;
        if (Number.isInteger(n) && n >= -2147483648 && n <= 2147483647) {
          parts.push(N(n));
        } else {
          parts.push(String(n));
        }
        break;
      }
      case 'OP': parts.push(tok.v); break;
      default:   parts.push(tok.v || ''); break;
    }
  }

  // Space tokens
  const sp = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && needsSpace(parts[i - 1], parts[i])) sp.push(' ');
    sp.push(parts[i]);
  }
  return sp.join('');
}

function luaEsc(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if(c===92) r+='\\\\'; else if(c===34) r+='\\"';
    else if(c===10) r+='\\n'; else if(c===13) r+='\\r';
    else if(c===0) r+='\\0'; else if(c===9) r+='\\t';
    else if(c<32||c>126) r+='\\'+String(c).padStart(3,'0');
    else r+=s[i];
  }
  return r;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 14 — ANTI-TAMPER (xorHidden, WeAreDevs style)
// ══════════════════════════════════════════════════════════════════════════════

function xorHidden(s) {
  const keyBytes = [...crypto.randomBytes(s.length)].map(b => (b & 0x7F) | 1);
  const encBytes = [];
  for (let i = 0; i < s.length; i++) encBytes.push(s.charCodeAt(i) ^ keyBytes[i]);
  const vt = wv(), vk = wv(), vo = wv(), vi = wv();
  return (
    `(function() ` +
    `local ${vt}={${encBytes.map(N).join(',')}} ` +
    `local ${vk}={${keyBytes.map(N).join(',')}} ` +
    `local ${vo}={} ` +
    `for ${vi}=1,#${vt} do ` +
    `${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) ` +
    `end ` +
    `return table.concat(${vo}) ` +
    `end)()`
  );
}

function generateAntiTamper() {
  const xInst = xorHidden('Instance');
  const xDM   = xorHidden('DataModel');
  const xRf   = xorHidden('readfile');
  const xWf   = xorHidden('writefile');
  const xSyn  = xorHidden('syn');
  const xFlux = xorHidden('fluxus');
  const xDex  = xorHidden('deltaexecute');

  const vEi = wv(), vEd = wv(), vGenv = wv(), vExec = wv();
  const vC1 = wv(), vC2 = wv();

  return (
    `local ${vEi}=${xInst}\n` +
    `local ${vEd}=${xDM}\n` +
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd})then ` +
    `local ${vC1}=nil ${vC1}()return ` +
    `end\n` +
    `${vEi}=nil ${vEd}=nil\n` +
    `local ${vGenv}=(getgenv and getgenv())or _G\n` +
    `local ${vExec}=` +
    `rawget(${vGenv},${xRf})or ` +
    `rawget(${vGenv},${xWf})or ` +
    `rawget(${vGenv},${xSyn})or ` +
    `rawget(${vGenv},${xFlux})or ` +
    `rawget(${vGenv},${xDex})or ` +
    `rawget(_G,${xRf})or ` +
    `rawget(_G,${xWf})\n` +
    `if ${vExec}==nil then local ${vC2}=nil ${vC2}()return end\n` +
    `${vGenv}=nil ${vExec}=nil`
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 15 — VM WRAPPER GENERATOR
// Builds the return(function(A,M,m,V...)...end)(...) structure
// ══════════════════════════════════════════════════════════════════════════════

function generateVMWrapper(bodyCode, accessorCode, b64DecoderCode, shuffleCode, antiTamperCode, junkBlocks, strTableStr) {
  // WeAreDevs closure params
  const closureParams = 'A,M,m,V,y,d,G,F,I,T,K,Z,X,h,k,b,w,J,z,Q,e,i,n';

  // Internal function assignments (WeAreDevs style)
  // These bind the closure params to VM operations
  const internalBindings = [
    // Z = wrapper that creates 2-arg closures
    `Z,b,T,I,F,n,z,J,Q,h,K,X,k,i,e,w=`,
    `function(A,Y) local M=z(Y) local m=function(m,V) return F(A,{m;V},Y,M) end return m end,`,
    `function(A,Y) local M=z(Y) local m=function(m,V,y,d,G) return F(A,{m;V;y;d,G},Y,M) end return m end,`,
    `function(A,Y) local M=z(Y) local m=function() return F(A,{},Y,M) end return m end,`,
    `{},`,
    `function(F,m,V,y)`,
    // This is where the main VM dispatch lives
    `local r,u,i,W,x,C,z,h,l,E,S,o,f,U,R,B,N,L,v,g,s,H,p,Q,a,J,P,j,G,D,q,t,c,O`,
    `while F do`,
  ].join('\n');

  // Build the dispatch blocks
  const dispatchBlocks = [];

  // Anti-tamper block
  dispatchBlocks.push(antiTamperCode);

  // Junk blocks interleaved
  for (const junk of junkBlocks) {
    dispatchBlocks.push(junk);
  }

  // Body code block
  dispatchBlocks.push(bodyCode);

  // More junk after body
  for (let i = 0; i < ri(3, 6); i++) {
    resetWV();
    dispatchBlocks.push(makeJunk(ri(3, 8)));
  }

  // Generate opaque dispatch
  const dispatch = generateOpaqueDispatch(dispatchBlocks);

  const vmBody = [
    dispatch.init,
    dispatch.loop,
  ].join('\n');

  // Close the VM function
  const vmClose = [
    `end`,
    `F=#y`,
    `return M(G)`,
    `end,`,
    // More closure bindings
    `function(A,Y) local M=z(Y) local m=function(m,V,y,d,G,I) return F(A,{m,V;y;d;G;I},Y,M) end return m end,`,
    `function(A) for Y=${N(1)},#A,${N(1)} do h[A[Y]]=h[A[Y]]+(${N(1)}) end `,
    `if m then local F=m(true) local M=y(F) `,
    `M[Y(${NH(ri(-90000, -10000))})],M[Y(${NH(ri(-90000, -10000))})],M[Y(${NH(ri(-90000, -10000))})]=A,Q,function() return ${NH(ri(1000000, 9999999))} end `,
    `return F `,
    `else return V({},{[Y(${NH(ri(-90000, -10000))})]=Q;[Y(${NH(ri(-90000, -10000))})]=A,[Y(${NH(ri(-90000, -10000))})]=function() return ${NH(ri(1000000, 9999999))} end}) end end,`,
    `function(A,Y) local M=z(Y) local m=function(...) return F(A,{...},Y,M) end return m end,`,
    `function(A) local Y,F=${N(1)},A[${N(1)}] while F do h[F],Y=h[F]-(${N(1)}),Y+(${N(1)}) `,
    `if ${N(0)}==h[F] then h[F],I[F]=nil,nil end F=A[Y] end end,`,
    `{},`,
    `function() i=(${N(1)})+i h[i]=${N(1)} return i end,`,
    `function(A,Y) local M=z(Y) local m=function(m) return F(A,{m},Y,M) end return m end,`,
    `function(A,Y) local M=z(Y) local m=function(m,V,y,d) return F(A,{m;V;y,d},Y,M) end return m end,`,
    `${N(0)},`,
    `function(A) h[A]=h[A]-(${N(1)}) if h[A]==${N(0)} then h[A],I[A]=nil,nil end end,`,
    `function(A,Y) local M=z(Y) local m=function(m,V,y) return F(A,{m,V,y},Y,M) end return m end`,
  ].join('\n');

  // Final return statement
  const finalReturn = `return(J(${NH(ri(1000000, 99999999))},{}))(M(G))`;

  // Build complete output
  const output = [
    `return(function(...)`,
    `local A={${strTableStr}}`,
    accessorCode,
    shuffleCode,
    b64DecoderCode,
    `return(function(${closureParams})`,
    internalBindings,
    vmBody,
    vmClose,
    finalReturn,
    `end)(getfenv and getfenv()or _ENV,unpack or table[Y(${NH(ri(-90000, -10000))})],newproxy,setmetatable,getmetatable,select,{...})`,
    `end)(...)`,
  ];

  return output.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 16 — MAIN OBFUSCATOR
// ══════════════════════════════════════════════════════════════════════════════

function obfuscate(code) {
  resetWV();

  const tokens = lex(code);

  // ── Build string table ──────────────────────────────────────────────────
  const strTable = [];
  const strMap = new Map();

  function addStr(s) {
    if (!strMap.has(s)) {
      strMap.set(s, strTable.length);
      strTable.push(s);
    }
    return strMap.get(s);
  }

  // Pre-populate
  [
    '', 'string', 'number', 'boolean', 'table', 'function', 'nil',
    'type', 'tostring', 'tonumber', 'pairs', 'ipairs', 'select', 'pcall',
    'rawget', 'rawset', 'next', 'error', 'assert', 'unpack',
    'math', 'bit32', 'game', 'workspace', 'script',
    'Instance', 'DataModel', 'Players', 'LocalPlayer', 'GetService',
    'char', 'byte', 'sub', 'len', 'concat', 'insert', 'floor',
    'bxor', 'band', 'bor',
  ].forEach(addStr);

  // Add user strings
  for (const tok of tokens) {
    if (tok.t === 'STR') addStr(tok.v);
  }

  // ── Generate shuffled B64 alphabet ──────────────────────────────────────
  const b64Alphabet = shuffleB64();

  // ── Encode all strings ──────────────────────────────────────────────────
  const encodedStrings = buildStringTable(strTable, b64Alphabet);

  // ── String table with semicolons (WeAreDevs style) ──────────────────────
  // Mix commas and semicolons
  const strTableStr = encodedStrings.map((s, i) => {
    return s;
  }).join(ri(0,1) ? ';' : ',');

  // ── Accessor offset ─────────────────────────────────────────────────────
  const accessorOffset = ri(10000, 500000);
  const accessorCode = generateAccessor('A', accessorOffset);

  // ── Shuffle pairs ───────────────────────────────────────────────────────
  const shuffleCode = generateShufflePairs(strTable.length);

  // ── B64 decoder ─────────────────────────────────────────────────────────
  const b64DecoderCode = generateB64Decoder(b64Alphabet, 'A');

  // ── Process body ────────────────────────────────────────────────────────
  const bodyStr = processBody(tokens, strMap, accessorOffset, 'A');

  // ── Anti-tamper ─────────────────────────────────────────────────────────
  resetWV();
  const antiTamper = generateAntiTamper();

  // ── Generate junk blocks ────────────────────────────────────────────────
  const junkBlocks = [];
  for (let i = 0; i < ri(6, 12); i++) {
    resetWV();
    junkBlocks.push(makeJunk(ri(5, 15)));
  }

  // ── Watermark ───────────────────────────────────────────────────────────
  const ver = `${ri(6, 3)}.${ri(0, 9)}.${ri(0, 9)}`;
  const watermark = `--[[ v${ver} obfuscated by soli ]]`;

  // ── Build final output ──────────────────────────────────────────────────
  const vmOutput = generateVMWrapper(
    bodyStr,
    accessorCode,
    b64DecoderCode,
    shuffleCode,
    antiTamper,
    junkBlocks,
    strTableStr
  );

  return watermark + ' ' + vmOutput;
}

module.exports = { obfuscate };
