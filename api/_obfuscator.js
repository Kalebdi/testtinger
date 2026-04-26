'use strict';
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
//  LUAU OBFUSCATOR — SINGLE FILE (FULLY FIXED & MERGED)
//
//  Pipeline:
//  1.  Utilities         — PRNG, var name pools, arithmetic obfuscation
//  2.  Junk Engine       — Dead code generator
//  3.  Lexer             — Full Luau tokenizer
//  4.  String Table      — XOR-encoded string table + helper
//  5.  Anti-Tamper       — Executor/game checks (xorHidden)
//  6.  Body Processor    — Token rename + string refs
//  7.  Final Assembly    — Closure wrapper output
//
//  All fixes:
//  - Variable namespace isolation (_j* / _V* / _I* never collide)
//  - Closure params (H,B,Q,q,I,T...) reserved in ALL pools
//  - Global/builtin identifiers NEVER renamed
//  - # operator only used on string literals
//  - String escaping handles \0, control chars, backslash, quotes
//  - Lexer handles hex/binary/float, all escapes, vararg, block strings
//  - Anti-tamper uses xorHidden (no raw strings in output)
//  - Arithmetic overflow guards, division-by-zero protection
//  - Token spacing (needsSpace) prevents Lua parse errors
//  - Helper offset always produces valid positive _ST indices
//  - XOR decoder uses bit32.bxor correctly
//  - Body identifier check fixed: no bare `_VA` style orphan tokens
//  - Return check in parseStatement fixed for EOF/keyword detection
// ═══════════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — RANDOM + VARIABLE NAME POOLS
// ══════════════════════════════════════════════════════════════════════════════

function ri(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

// ── All 20 closure param names — MUST be reserved everywhere ──────────────
const CLOSURE_PARAMS = [
  'H','B','Q','q','I','T','g','i','A','J',
  'p','j','V','G','z','L','P','Z','u','r',
];

const ALWAYS_RESERVED = new Set([
  '_ST', '_h', '_n',        // string table var, helper fn, helper param
  '_u', '_z',               // shuffle loop vars
  '_j',                     // iterator in decoder
  ...CLOSURE_PARAMS,
]);

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER_LOWER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// ── Junk vars: _j<letter> prefix ──────────────────────────────────────────
let _junkIdx = 0;
const _junkUsed = new Set();

function jv() {
  while (_junkIdx < LOWER.length) {
    const c = '_j' + LOWER[_junkIdx++];
    if (!_junkUsed.has(c)) { _junkUsed.add(c); return c; }
  }
  let n;
  do {
    n = '_j' + LOWER[ri(0, 25)] + LOWER[ri(0, 25)] + ri(0, 99);
  } while (_junkUsed.has(n));
  _junkUsed.add(n);
  return n;
}

// ── Body rename vars: _V<letter> prefix ───────────────────────────────────
let _bodyIdx = 0;
const _bodyUsed = new Set();

function bv() {
  while (_bodyIdx < UPPER_LOWER.length) {
    const c = '_V' + UPPER_LOWER[_bodyIdx++];
    if (!_bodyUsed.has(c)) { _bodyUsed.add(c); return c; }
  }
  let n;
  do {
    n = '_V' + UPPER_LOWER[ri(0, UPPER_LOWER.length - 1)] + '_' + ri(10, 999);
  } while (_bodyUsed.has(n));
  _bodyUsed.add(n);
  return n;
}

// ── Internal obfuscator vars: _I<letter> prefix ──────────────────────────
let _intIdx = 0;
const _intUsed = new Set();

function iv() {
  while (_intIdx < LOWER.length) {
    const c = '_I' + LOWER[_intIdx++];
    if (!_intUsed.has(c)) { _intUsed.add(c); return c; }
  }
  let n;
  do {
    n = '_I' + LOWER[ri(0, 25)] + LOWER[ri(0, 25)] + ri(0, 99);
  } while (_intUsed.has(n));
  _intUsed.add(n);
  return n;
}

function resetVars() {
  _junkIdx = 0; _junkUsed.clear();
  _bodyIdx = 0; _bodyUsed.clear();
  _intIdx  = 0; _intUsed.clear();

  for (const r of ALWAYS_RESERVED) {
    _junkUsed.add(r);
    _bodyUsed.add(r);
    _intUsed.add(r);
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ARITHMETIC OBFUSCATION
// ══════════════════════════════════════════════════════════════════════════════

function A(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
  if (n < -2147483648 || n > 2147483647) return String(n);

  const a = ri(1, 999);
  const b = ri(1, 99);

  if (n < 0) {
    switch (ri(0, 2)) {
      case 0: return `(${n + a}-${a})`;
      case 1: return `(${a}-(${a - n}))`;
      case 2: {
        const k = ri(1, 0x7FFF);
        return `(bit32.bxor(bit32.bxor(${(n >>> 0)},${k}),${k}))`;
      }
    }
  }

  switch (ri(0, 11)) {
    case 0:  return `(${n + a}-${a})`;
    case 1:  return `(${a}-(${a - n}))`;
    case 2:  return a !== 0 ? `(${n * a}/${a})` : `(${n + 1}-1)`;
    case 3:  return `(function()return ${n + a}-${a} end)()`;
    case 4:  return `(math.floor((${n + a}-${a})/1))`;
    case 5:  return `(select(2,false,${n + a}-${a}))`;
    case 6:  return `(math.abs(${n + a})-${a})`;
    case 7:  { const k = ri(1, 0x7FFF); return `(bit32.bxor(bit32.bxor(${n},${k}),${k}))`; }
    case 8:  return `(bit32.band(${n + a}-${a},4294967295))`;
    case 9:  return `(${n + a + b}-(${a + b}))`;
    case 10: return `(true and(${n + a}-${a})or ${n})`;
    case 11: return (n >= 0 && n <= 30) ? `(#"${'x'.repeat(n)}")` : `(${n + a}-${a})`;
    default: return String(n);
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — JUNK CODE ENGINE
// # only on string literals. All vars from jv().
// ══════════════════════════════════════════════════════════════════════════════

function makeJunk(count) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const va = jv(), vb = jv(), vc = jv();
    switch (ri(0, 8)) {
      case 0: lines.push(`local ${va}=${A(ri(1,999))} local ${vb}=${va}+${A(0)}-${A(0)}`); break;
      case 1: lines.push(`local ${va}={} ${va}=nil`); break;
      case 2: lines.push(`do local ${va}=${A(ri(1,99))} local ${vb}=${va}*${A(1)}-${A(0)} end`); break;
      case 3: lines.push(`if false then local ${va}=${A(ri(1,999))} local ${vb}=${va}+${A(1)} end`); break;
      case 4: lines.push(`local ${va}=bit32.bxor(${A(ri(1,127))},${A(0)})`); break;
      case 5: lines.push(`local ${va}=${A(ri(10,999))} local ${vb}=${va} local ${vc}=${vb}-${va}+${A(0)}`); break;
      case 6: lines.push(`do local ${va}=${A(ri(1,9))} local ${vb}=${va}*${va} local ${vc}=${vb}-${va}*${va} end`); break;
      case 7: lines.push(`local ${va}=(function()return ${A(ri(1,999))} end)()`); break;
      case 8: {
        const s = 'x'.repeat(ri(1, 10));
        lines.push(`local ${va}=#"${s}" local ${vb}=${va}+${A(0)}`);
        break;
      }
    }
  }
  // Shuffle
  for (let i = lines.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return lines.join(' ');
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

    // Block comment --[[ ... ]]
    if (i + 3 < len && src[i] === '-' && src[i+1] === '-' && src[i+2] === '[' && src[i+3] === '[') {
      i += 4;
      while (i + 1 < len && !(src[i] === ']' && src[i+1] === ']')) i++;
      if (i + 1 < len) i += 2;
      continue;
    }

    // Line comment
    if (i + 1 < len && src[i] === '-' && src[i+1] === '-') {
      i += 2;
      while (i < len && src[i] !== '\n') i++;
      continue;
    }

    // Long string [[ ... ]]
    if (i + 1 < len && src[i] === '[' && src[i+1] === '[') {
      let j = i + 2;
      while (j + 1 < len && !(src[j] === ']' && src[j+1] === ']')) j++;
      tokens.push({ t: 'STR', v: src.slice(i + 2, j) });
      i = j + 2;
      continue;
    }

    // Quoted strings
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let s = '';
      while (i < len && src[i] !== q) {
        if (src[i] === '\\') {
          i++;
          if (i >= len) break;
          const c = src[i];
          switch (c) {
            case 'n': s += '\n'; i++; break;
            case 't': s += '\t'; i++; break;
            case 'r': s += '\r'; i++; break;
            case '\\': s += '\\'; i++; break;
            case '0': s += '\0'; i++; break;
            case 'a': s += '\x07'; i++; break;
            case 'b': s += '\b'; i++; break;
            case 'f': s += '\f'; i++; break;
            case 'v': s += '\v'; i++; break;
            default:
              if (c === q) { s += q; i++; }
              else if (c === 'x' && i + 2 < len && /^[0-9a-fA-F]{2}$/.test(src[i+1] + src[i+2])) {
                s += String.fromCharCode(parseInt(src[i+1] + src[i+2], 16));
                i += 3;
              }
              else if (/[0-9]/.test(c)) {
                let d = '';
                while (i < len && /[0-9]/.test(src[i]) && d.length < 3) d += src[i++];
                s += String.fromCharCode(parseInt(d, 10));
              }
              else { s += c; i++; }
              break;
          }
        } else {
          s += src[i++];
        }
      }
      if (i < len) i++; // closing quote
      tokens.push({ t: 'STR', v: s });
      continue;
    }

    // Hex number
    if (i + 1 < len && src[i] === '0' && (src[i+1] === 'x' || src[i+1] === 'X')) {
      let n = '0x'; i += 2;
      while (i < len && /[0-9a-fA-F_]/.test(src[i])) { if (src[i] !== '_') n += src[i]; i++; }
      tokens.push({ t: 'NUM', v: Number(n) }); continue;
    }

    // Binary number
    if (i + 1 < len && src[i] === '0' && (src[i+1] === 'b' || src[i+1] === 'B')) {
      let n = ''; i += 2;
      while (i < len && /[01_]/.test(src[i])) { if (src[i] !== '_') n += src[i]; i++; }
      tokens.push({ t: 'NUM', v: parseInt(n || '0', 2) }); continue;
    }

    // Decimal/float
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && i + 1 < len && /[0-9]/.test(src[i+1]))) {
      let n = '';
      while (i < len && /[0-9_]/.test(src[i])) { if (src[i] !== '_') n += src[i]; i++; }
      if (i < len && src[i] === '.' && (i + 1 >= len || src[i+1] !== '.')) {
        n += src[i++];
        while (i < len && /[0-9_]/.test(src[i])) { if (src[i] !== '_') n += src[i]; i++; }
      }
      if (i < len && (src[i] === 'e' || src[i] === 'E')) {
        n += src[i++];
        if (i < len && (src[i] === '+' || src[i] === '-')) n += src[i++];
        while (i < len && /[0-9]/.test(src[i])) n += src[i++];
      }
      tokens.push({ t: 'NUM', v: Number(n) }); continue;
    }

    // Identifier/keyword
    if (/[a-zA-Z_]/.test(src[i])) {
      let w = '';
      while (i < len && /[a-zA-Z0-9_]/.test(src[i])) w += src[i++];
      tokens.push({ t: KW.has(w) ? 'KW' : 'ID', v: w }); continue;
    }

    // Vararg
    if (i + 2 < len && src[i] === '.' && src[i+1] === '.' && src[i+2] === '.') {
      tokens.push({ t: 'OP', v: '...' }); i += 3; continue;
    }

    // Two-char operator
    if (i + 1 < len && OP2.has(src[i] + src[i+1])) {
      tokens.push({ t: 'OP', v: src[i] + src[i+1] }); i += 2; continue;
    }

    // Single char
    tokens.push({ t: 'OP', v: src[i] }); i++;
  }

  tokens.push({ t: 'EOF', v: '' });
  return tokens;
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — STRING ESCAPING + XOR HIDDEN
// ══════════════════════════════════════════════════════════════════════════════

function luaEsc(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 92) r += '\\\\';
    else if (c === 34) r += '\\"';
    else if (c === 10) r += '\\n';
    else if (c === 13) r += '\\r';
    else if (c === 0) r += '\\0';
    else if (c === 9) r += '\\t';
    else if (c < 32 || c > 126) r += '\\' + String(c).padStart(3, '0');
    else r += s[i];
  }
  return r;
}

function xorHidden(s) {
  const keyBytes = [...crypto.randomBytes(s.length)].map(b => (b & 0x7F) | 1);
  const encBytes = [];
  for (let i = 0; i < s.length; i++) encBytes.push(s.charCodeAt(i) ^ keyBytes[i]);

  const vt = iv(), vk = iv(), vo = iv(), vi = iv();
  return (
    `(function()` +
    `local ${vt}={${encBytes.map(A).join(',')}} ` +
    `local ${vk}={${keyBytes.map(A).join(',')}} ` +
    `local ${vo}={} ` +
    `for ${vi}=1,#${vt} do ` +
    `${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) ` +
    `end ` +
    `return table.concat(${vo}) ` +
    `end)()`
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — GLOBALS THAT MUST NEVER BE RENAMED
// ══════════════════════════════════════════════════════════════════════════════

const GLOBAL_IDS = new Set([
  // Lua builtins
  'print', 'warn', 'error', 'assert', 'type', 'typeof',
  'tostring', 'tonumber', 'pairs', 'ipairs', 'next',
  'select', 'pcall', 'xpcall',
  'rawget', 'rawset', 'rawequal', 'rawlen',
  'unpack', 'require', 'loadstring', 'newproxy',
  'setmetatable', 'getmetatable',
  'getfenv', 'setfenv',
  // Lua libraries
  'table', 'string', 'math', 'bit32', 'coroutine',
  'os', 'debug', 'utf8', 'buffer',
  // Roblox globals
  'game', 'workspace', 'script', 'Instance', 'Enum',
  'wait', 'delay', 'spawn', 'tick', 'time', 'task',
  'Vector3', 'Vector2', 'CFrame', 'Color3', 'BrickColor',
  'UDim', 'UDim2', 'Rect', 'Ray', 'Region3',
  'TweenInfo', 'NumberRange', 'NumberSequence',
  'ColorSequence', 'PhysicalProperties',
  // Exploit APIs
  'getgenv', 'getrenv', 'getreg',
  'readfile', 'writefile', 'syn', 'fluxus', 'deltaexecute',
  // Reserved literals
  'true', 'false', 'nil', 'self',
  '_G', '_ENV', '_VERSION',
]);


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — TOKEN SPACING
// ══════════════════════════════════════════════════════════════════════════════

function needsSpace(prev, curr) {
  if (!prev || !curr) return false;
  const aEnd = /[a-zA-Z0-9_]$/.test(prev);
  const aStart = /^[a-zA-Z0-9_]/.test(curr);
  if (aEnd && aStart) return true;
  if (prev.endsWith('-') && curr.startsWith('-')) return true;
  if (prev.endsWith('.') && curr.startsWith('.')) return true;
  // Prevent number followed by .. being ambiguous (e.g. 1..2)
  if (/[0-9]$/.test(prev) && curr.startsWith('.')) return true;
  return false;
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — MAIN OBFUSCATOR
// ══════════════════════════════════════════════════════════════════════════════

function obfuscate(code) {
  resetVars();

  const tokens = lex(code);

  // ── Collect strings ─────────────────────────────────────────────────────
  const strTable = [];
  const strMap = new Map();

  function addStr(s) {
    if (!strMap.has(s)) {
      strMap.set(s, strTable.length);
      strTable.push(s);
    }
    return strMap.get(s);
  }

  // Pre-populate common Roblox/Lua strings
  [
    '', 'string', 'number', 'boolean', 'table', 'function', 'nil',
    'type', 'tostring', 'tonumber', 'pairs', 'ipairs', 'select', 'pcall',
    'rawget', 'rawset', 'next', 'error', 'assert', 'unpack',
    'math', 'bit32', 'coroutine',
    'game', 'workspace', 'script', 'Instance', 'DataModel',
    'Players', 'LocalPlayer', 'GetService',
  ].forEach(addStr);

  // Add strings from source code
  for (const tok of tokens) {
    if (tok.t === 'STR') addStr(tok.v);
  }

  // ── XOR-encode string table ─────────────────────────────────────────────
  const xorKey = ri(1, 254);
  const encTable = strTable.map(s => {
    if (s === '') return '""';
    let enc = '"';
    for (let ci = 0; ci < s.length; ci++) {
      enc += '\\' + String((s.charCodeAt(ci) ^ xorKey) & 0xFF).padStart(3, '0');
    }
    return enc + '"';
  });

  const tVar = '_ST';
  const tLen = encTable.length;

  // ── Shuffle pairs ───────────────────────────────────────────────────────
  const nShuf = Math.min(3, Math.floor(tLen / 5));
  const shufPairs = [];
  const usedP = new Set();
  for (let si = 0; si < nShuf; si++) {
    let a, b, k;
    do {
      a = ri(1, tLen);
      b = ri(1, tLen);
      k = `${a}:${b}`;
    } while (a === b || usedP.has(k));
    usedP.add(k);
    shufPairs.push([a, b]);
  }

  const tableDecl = `local ${tVar}={${encTable.join(',')}}`;

  const shufCode = shufPairs.length === 0 ? '' : (
    `for _u,_z in ipairs({${shufPairs.map(([a, b]) => `{${A(a)};${A(b)}}`).join(',')}}) do ` +
    `while _z[${A(1)}]<_z[${A(2)}] do ` +
    `${tVar}[_z[${A(1)}]],${tVar}[_z[${A(2)}]],_z[${A(1)}],_z[${A(2)}]=` +
    `${tVar}[_z[${A(2)}]],${tVar}[_z[${A(1)}]],_z[${A(1)}]+${A(1)},_z[${A(2)}]-${A(1)} ` +
    `end end`
  );

  // ── Helper function ─────────────────────────────────────────────────────
  const helperOffset = ri(10, 50);
  const helperCode = `local function _h(_n)return ${tVar}[_n+(${A(helperOffset)})]end`;

  // ── XOR decoder ─────────────────────────────────────────────────────────
  const dA = iv(), dB = iv(), dC = iv(), dD = iv(), dE = iv(), dF = iv();
  const decoderCode = (
    `do ` +
    `local ${dA}=string.char ` +
    `local ${dB}=string.byte ` +
    `local ${dC}=table.concat ` +
    `for ${dD}=${A(1)},#${tVar},${A(1)} do ` +
    `local ${dE}=${tVar}[${dD}] ` +
    `if type(${dE})=="string" then ` +
    `local ${dF}={} ` +
    `for _j=${A(1)},#${dE} do ` +
    `${dF}[_j]=${dA}(bit32.bxor(${dB}(${dE},_j),${A(xorKey)})) ` +
    `end ` +
    `${tVar}[${dD}]=${dC}(${dF}) ` +
    `end end end`
  );

  // ── Anti-tamper (xorHidden, no raw strings) ─────────────────────────────
  const xRf   = xorHidden('readfile');
  const xWf   = xorHidden('writefile');
  const xSyn  = xorHidden('syn');
  const xFlux = xorHidden('fluxus');
  const xDex  = xorHidden('deltaexecute');
  const xInst = xorHidden('Instance');
  const xDM   = xorHidden('DataModel');

  const vEi = iv(), vEd = iv(), vGenv = iv(), vExec = iv();
  const vCrash1 = iv(), vCrash2 = iv();

  const antiTamperCode = (
    `local ${vEi}=${xInst} ` +
    `local ${vEd}=${xDM} ` +
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd})then ` +
    `local ${vCrash1}=nil ${vCrash1}()return ` +
    `end ` +
    `${vEi}=nil ${vEd}=nil ` +
    `local ${vGenv}=(getgenv and getgenv())or _G ` +
    `local ${vExec}=` +
    `rawget(${vGenv},${xRf})or ` +
    `rawget(${vGenv},${xWf})or ` +
    `rawget(${vGenv},${xSyn})or ` +
    `rawget(${vGenv},${xFlux})or ` +
    `rawget(${vGenv},${xDex})or ` +
    `rawget(_G,${xRf})or ` +
    `rawget(_G,${xWf}) ` +
    `if ${vExec}==nil then local ${vCrash2}=nil ${vCrash2}()return end ` +
    `${vGenv}=nil ${vExec}=nil`
  );

  // ── Process body tokens ─────────────────────────────────────────────────
  const idMap = new Map();

  function renameId(name) {
    // NEVER rename globals, builtins, Roblox APIs
    if (GLOBAL_IDS.has(name)) return name;
    // Don't rename our internal prefixed vars
    if (name.startsWith('_ST') || name.startsWith('_h') ||
        name.startsWith('_I') || name.startsWith('_j') ||
        name.startsWith('_V') || name.startsWith('_n')) {
      return name;
    }
    if (!idMap.has(name)) idMap.set(name, bv());
    return idMap.get(name);
  }

  function strRef(s) {
    const idx = strMap.get(s);
    if (idx === undefined) return `"${luaEsc(s)}"`;
    const arg = idx + 1 - helperOffset;
    return `_h(${A(arg)})`;
  }

  const bodyParts = [];
  for (const tok of tokens) {
    if (tok.t === 'EOF') continue;
    switch (tok.t) {
      case 'ID':  bodyParts.push(renameId(tok.v)); break;
      case 'KW':  bodyParts.push(tok.v); break;
      case 'STR': bodyParts.push(strRef(tok.v)); break;
      case 'NUM': {
        const n = tok.v;
        if (Number.isInteger(n) && n >= -2147483648 && n <= 2147483647) {
          bodyParts.push(A(n));
        } else {
          bodyParts.push(String(n));
        }
        break;
      }
      case 'OP': bodyParts.push(tok.v); break;
      default:   bodyParts.push(tok.v || ''); break;
    }
  }

  // Smart spacing
  const spacedParts = [];
  for (let i = 0; i < bodyParts.length; i++) {
    if (i > 0 && needsSpace(bodyParts[i - 1], bodyParts[i])) {
      spacedParts.push(' ');
    }
    spacedParts.push(bodyParts[i]);
  }
  const bodyStr = spacedParts.join('');

  // Junk code
  const junkBefore = makeJunk(ri(8, 12));
  const junkAfter  = makeJunk(ri(6, 10));
  const fullBody   = junkBefore + ' ' + bodyStr + ' ' + junkAfter;

  // ── Closure wrapper ─────────────────────────────────────────────────────
  const paramNames = CLOSURE_PARAMS.join(',');
  const envArg     = 'getfenv and getfenv()or _ENV';
  const unpackArg  = 'unpack or table.unpack';

  // ── Assemble ────────────────────────────────────────────────────────────
  const parts = [
    tableDecl,
    shufCode,
    decoderCode,
    helperCode,
    `return(function(${paramNames})`,
    antiTamperCode,
    fullBody,
    `end)(${envArg},${unpackArg})`,
  ].filter(Boolean);

  return parts
    .join(' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

module.exports = { obfuscate };
