'use strict';
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
//  LUAU VM OBFUSCATOR — SINGLE FILE (FIXED & MERGED)
//
//  Architecture:
//  1.  Utilities         — PRNG, var name pools, arithmetic obfuscation
//  2.  Junk Engine       — Dead code generator
//  3.  Lexer             — Full Luau tokenizer
//  4.  Parser            — Recursive descent AST builder
//  5.  IR Compiler       — AST → register-based IR
//  6.  Polymorphic       — Random opcode mapping per build
//  7.  VM Compiler       — IR → encrypted bytecode
//  8.  Encryption        — Multi-layer XOR + rolling key
//  9.  Anti-Tamper       — Hash verification + crash, executor check
//  10. VM Runtime        — Full interpreter code generator
//  11. Code Generator    — Final script assembly
//  12. Main Entry        — Public obfuscate() API
//
//  Fixes applied:
//  - Variable namespace isolation (junk/_V/_I/closure params never overlap)
//  - Safe # usage — only on string literals
//  - XOR decoder uses bit32.bxor correctly
//  - Full string escaping (backslash, quotes, null, control chars)
//  - Closure params reserved in all name pools
//  - Binary literals, hex escape, vararg in lexer
//  - Global/builtin identifiers never renamed
//  - Arithmetic overflow guards
//  - Token spacing (needsSpace) prevents parse errors
//  - Helper offset always produces positive _ST indices
//  - Division by zero guard in arithmetic obfuscation
// ═══════════════════════════════════════════════════════════════════════════════

// ── Random integer ────────────────────────────────────────────────────────────
function ri(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — VARIABLE NAME POOLS
// Three completely isolated namespaces:
//   _j* = junk code variables
//   _V* = user identifier renames (body)
//   _I* = internal obfuscator variables (decoder, anti-tamper, xorHidden)
// All 20 closure params + reserved names are blocked in every pool.
// ══════════════════════════════════════════════════════════════════════════════

const CLOSURE_PARAMS = new Set([
  'H','B','Q','q','I','T','g','i','A','J',
  'p','j','V','G','z','L','P','Z','u','r',
]);

const ALWAYS_RESERVED = new Set([
  '_ST','_h','_n',       // string table, helper fn, helper param
  '_u','_z','_j',        // shuffle loop vars
  ...CLOSURE_PARAMS,
]);

const _LOWER = 'abcdefghijklmnopqrstuvwxyz';

// ── Junk variable pool: _j<letter> ───────────────────────────────────────────
let _junkIdx = 0;
const _junkUsed = new Set();

function jv() {
  while (_junkIdx < _LOWER.length) {
    const c = '_j' + _LOWER[_junkIdx++];
    if (!_junkUsed.has(c)) { _junkUsed.add(c); return c; }
  }
  let n;
  do {
    n = '_j' + _LOWER[ri(0,25)] + _LOWER[ri(0,25)] + ri(0,99);
  } while (_junkUsed.has(n));
  _junkUsed.add(n);
  return n;
}

// ── Body variable pool: _V<letter> ───────────────────────────────────────────
const _BODY_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
let _bodyIdx = 0;
const _bodyUsed = new Set();

function bv() {
  while (_bodyIdx < _BODY_POOL.length) {
    const c = '_V' + _BODY_POOL[_bodyIdx++];
    if (!_bodyUsed.has(c)) { _bodyUsed.add(c); return c; }
  }
  let n;
  do {
    n = '_V' + _BODY_POOL[ri(0, _BODY_POOL.length - 1)] + '_' + ri(10,999);
  } while (_bodyUsed.has(n));
  _bodyUsed.add(n);
  return n;
}

// ── Internal variable pool: _I<letter> ───────────────────────────────────────
let _intIdx = 0;
const _intUsed = new Set();

function iv() {
  while (_intIdx < _LOWER.length) {
    const c = '_I' + _LOWER[_intIdx++];
    if (!_intUsed.has(c)) { _intUsed.add(c); return c; }
  }
  let n;
  do {
    n = '_I' + _LOWER[ri(0,25)] + _LOWER[ri(0,25)] + ri(0,99);
  } while (_intUsed.has(n));
  _intUsed.add(n);
  return n;
}

// ── Reset all pools (call once per obfuscation run) ──────────────────────────
function resetVars() {
  _junkIdx = 0; _junkUsed.clear();
  _bodyIdx = 0; _bodyUsed.clear();
  _intIdx  = 0; _intUsed.clear();

  // Block reserved names in every pool
  for (const r of ALWAYS_RESERVED) {
    _junkUsed.add(r);
    _bodyUsed.add(r);
    _intUsed.add(r);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ARITHMETIC OBFUSCATION
// Encodes an integer literal into a semantically equivalent Lua expression.
// Guards: non-integer, out-of-int32, division-by-zero, negative overflows.
// ══════════════════════════════════════════════════════════════════════════════

function A(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
  if (n < -2147483648 || n > 2147483647)           return String(n);

  const a = ri(1, 999);
  const b = ri(1, 99);

  // Negative — limited safe forms only
  if (n < 0) {
    switch (ri(0, 2)) {
      case 0: return `(${n + a}-${a})`;
      case 1: return `(${a}-(${a - n}))`;
      case 2: {
        const k = ri(1, 0x7FFF);
        return `(bit32.bxor(bit32.bxor(${n & 0xFFFFFFFF},${k}),${k}))`;
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
    case 7:  { const k = ri(1,0x7FFF); return `(bit32.bxor(bit32.bxor(${n},${k}),${k}))`; }
    case 8:  return `(bit32.band(${n + a}-${a},4294967295))`;
    case 9:  return `(${n + a + b}-(${a + b}))`;
    case 10: return `(true and(${n + a}-${a})or ${n})`;
    case 11: return (n >= 0 && n <= 30) ? `(#"${'x'.repeat(n)}")` : `(${n + a}-${a})`;
    default: return String(n);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — JUNK CODE ENGINE
// Generates dead Lua code using jv() vars. # only on string literals.
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
        const s = 'x'.repeat(ri(1,10));
        lines.push(`local ${va}=#"${s}" local ${vb}=${va}+${A(0)}`);
        break;
      }
    }
  }
  for (let i = lines.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return lines.join(' ');
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — LEXER
// Full Luau tokenizer: block strings/comments, all escape sequences,
// hex, binary, float, vararg, two-char operators.
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
    // Whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // Block comment --[[ ... ]]
    if (src[i]==='-' && src[i+1]==='-' && src[i+2]==='[' && src[i+3]==='[') {
      i += 4;
      while (i+1 < len && !(src[i]===']' && src[i+1]===']')) i++;
      if (i+1 < len) i += 2;
      continue;
    }

    // Line comment --
    if (src[i]==='-' && src[i+1]==='-') {
      i += 2;
      while (i < len && src[i]!=='\n') i++;
      continue;
    }

    // Long string [[ ... ]]
    if (src[i]==='[' && src[i+1]==='[') {
      let j = i + 2;
      while (j+1 < len && !(src[j]===']' && src[j+1]===']')) j++;
      tokens.push({ t:'STR', v:src.slice(i+2, j) });
      i = j + 2;
      continue;
    }

    // Quoted strings
    if (src[i]==='"' || src[i]==="'") {
      const q = src[i++];
      let s = '';
      while (i < len && src[i] !== q) {
        if (src[i] === '\\') {
          i++;
          if (i >= len) break;
          const c = src[i];
          if      (c==='n')  { s+='\n'; i++; }
          else if (c==='t')  { s+='\t'; i++; }
          else if (c==='r')  { s+='\r'; i++; }
          else if (c==='\\') { s+='\\'; i++; }
          else if (c===q)    { s+=q;   i++; }
          else if (c==='0')  { s+='\0'; i++; }
          else if (c==='a')  { s+='\x07'; i++; }
          else if (c==='b')  { s+='\b'; i++; }
          else if (c==='f')  { s+='\f'; i++; }
          else if (c==='v')  { s+='\v'; i++; }
          else if (c==='x' && i+2 < len) {
            const hex = src[i+1] + src[i+2];
            if (/^[0-9a-fA-F]{2}$/.test(hex)) {
              s += String.fromCharCode(parseInt(hex, 16)); i += 3;
            } else { s += c; i++; }
          }
          else if (/[0-9]/.test(c)) {
            let d = '';
            while (i < len && /[0-9]/.test(src[i]) && d.length < 3) d += src[i++];
            s += String.fromCharCode(parseInt(d, 10));
          }
          else { s += c; i++; }
        } else { s += src[i++]; }
      }
      if (i < len) i++;
      tokens.push({ t:'STR', v:s });
      continue;
    }

    // Hex number
    if (src[i]==='0' && (src[i+1]==='x' || src[i+1]==='X')) {
      let n = '0x'; i += 2;
      while (i < len && /[0-9a-fA-F_]/.test(src[i])) {
        if (src[i]!=='_') n += src[i]; i++;
      }
      tokens.push({ t:'NUM', v:Number(n) }); continue;
    }

    // Binary number
    if (src[i]==='0' && (src[i+1]==='b' || src[i+1]==='B')) {
      let n = ''; i += 2;
      while (i < len && /[01_]/.test(src[i])) {
        if (src[i]!=='_') n += src[i]; i++;
      }
      tokens.push({ t:'NUM', v:parseInt(n||'0', 2) }); continue;
    }

    // Decimal / float
    if (/[0-9]/.test(src[i]) || (src[i]==='.' && /[0-9]/.test(src[i+1]||''))) {
      let n = '';
      while (i < len && /[0-9_]/.test(src[i])) { if (src[i]!=='_') n+=src[i]; i++; }
      if (i < len && src[i]==='.' && src[i+1]!=='.') {
        n += src[i++];
        while (i < len && /[0-9_]/.test(src[i])) { if (src[i]!=='_') n+=src[i]; i++; }
      }
      if (i < len && (src[i]==='e' || src[i]==='E')) {
        n += src[i++];
        if (i < len && (src[i]==='+' || src[i]==='-')) n += src[i++];
        while (i < len && /[0-9]/.test(src[i])) n += src[i++];
      }
      tokens.push({ t:'NUM', v:Number(n) }); continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(src[i])) {
      let w = '';
      while (i < len && /[a-zA-Z0-9_]/.test(src[i])) w += src[i++];
      tokens.push({ t: KW.has(w) ? 'KW' : 'ID', v:w }); continue;
    }

    // Vararg
    if (src[i]==='.' && src[i+1]==='.' && src[i+2]==='.') {
      tokens.push({ t:'OP', v:'...' }); i += 3; continue;
    }

    // Two-char operator
    if (i+1 < len) {
      const op2 = src[i] + src[i+1];
      if (OP2.has(op2)) { tokens.push({ t:'OP', v:op2 }); i += 2; continue; }
    }

    // Single char
    tokens.push({ t:'OP', v:src[i] }); i++;
  }

  tokens.push({ t:'EOF', v:'' });
  return tokens;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — PARSER (Recursive Descent → AST)
// ══════════════════════════════════════════════════════════════════════════════

function parse(tokens) {
  let pos = 0;

  const cur  = () => tokens[pos]   || { t:'EOF', v:'' };
  const peek  = (n=0) => tokens[pos+n] || { t:'EOF', v:'' };
  const adv  = () => { const t = cur(); pos++; return t; };

  function expect(type, val) {
    const t = cur();
    if (t.t !== type || (val !== undefined && t.v !== val))
      throw new Error(`Parse error: expected ${type} '${val??'any'}' at pos ${pos}, got ${t.t} '${t.v}'`);
    return adv();
  }

  function match(type, val) {
    const t = cur();
    return t.t === type && (val === undefined || t.v === val);
  }

  function matchAdv(type, val) {
    if (match(type, val)) return adv();
    return null;
  }

  // ── Forward declarations ─────────────────────────────────────────────────
  let parseExpr, parseBlock, parseStatement, parseExprList, parsePrefixExpr;

  function parseNameList() {
    const names = [expect('ID').v];
    while (matchAdv('OP',',')) names.push(expect('ID').v);
    return names;
  }

  function parseParamList() {
    const params = []; let vararg = false;
    if (match('OP',')')) return [params, false];
    if (match('OP','...')) { adv(); return [[], true]; }
    params.push(expect('ID').v);
    while (matchAdv('OP',',')) {
      if (match('OP','...')) { adv(); vararg = true; break; }
      params.push(expect('ID').v);
    }
    return [params, vararg];
  }

  function parseTableConstructor() {
    expect('OP','{');
    const fields = [];
    while (!match('OP','}') && !match('EOF')) {
      let field;
      if (match('OP','[')) {
        adv(); const key = parseExpr(); expect('OP',']'); expect('OP','=');
        field = { kind:'IndexedField', key, value:parseExpr() };
      } else if (match('ID') && peek(1).v === '=') {
        const name = adv().v; expect('OP','=');
        field = { kind:'NamedField', name, value:parseExpr() };
      } else {
        field = { kind:'PositionalField', value:parseExpr() };
      }
      fields.push(field);
      if (!matchAdv('OP',',')) matchAdv('OP',';');
    }
    expect('OP','}');
    return { kind:'Table', fields };
  }

  function parseFuncBody() {
    expect('OP','(');
    const [params, vararg] = parseParamList();
    expect('OP',')');
    const body = parseBlock(['end']);
    expect('KW','end');
    return { kind:'Function', params, vararg, body };
  }

  function parsePrimary() {
    const t = cur();
    if (match('NUM'))  { adv(); return { kind:'Number',  value:t.v }; }
    if (match('STR'))  { adv(); return { kind:'String',  value:t.v }; }
    if (match('KW','true'))  { adv(); return { kind:'Boolean', value:true };  }
    if (match('KW','false')) { adv(); return { kind:'Boolean', value:false }; }
    if (match('KW','nil'))   { adv(); return { kind:'Nil' }; }
    if (match('OP','...'))   { adv(); return { kind:'Vararg' }; }
    if (match('KW','function')) { adv(); return parseFuncBody(); }
    if (match('OP','{'))  return parseTableConstructor();
    if (match('OP','(')) {
      adv(); const e = parseExpr(); expect('OP',')');
      return { kind:'Grouped', expr:e };
    }
    if (match('ID')) { adv(); return { kind:'Identifier', name:t.v }; }
    if (match('OP','-') || match('OP','#') || match('KW','not')) {
      const op = adv().v; const operand = parsePrimary();
      return { kind:'Unary', op, operand };
    }
    throw new Error(`Unexpected token: ${t.t} '${t.v}' at pos ${pos}`);
  }

  parsePrefixExpr = function() {
    let expr = parsePrimary();
    while (true) {
      if (match('OP','.')) {
        adv(); const name = expect('ID').v;
        expr = { kind:'MemberAccess', obj:expr, member:name };
      } else if (match('OP','[')) {
        adv(); const idx = parseExpr(); expect('OP',']');
        expr = { kind:'IndexAccess', obj:expr, index:idx };
      } else if (match('OP',':')) {
        adv(); const method = expect('ID').v; expect('OP','(');
        const args = match('OP',')') ? [] : parseExprList(); expect('OP',')');
        expr = { kind:'MethodCall', obj:expr, method, args };
      } else if (match('OP','(')) {
        adv(); const args = match('OP',')') ? [] : parseExprList(); expect('OP',')');
        expr = { kind:'Call', func:expr, args };
      } else if (match('STR')) {
        const s = adv();
        expr = { kind:'Call', func:expr, args:[{ kind:'String', value:s.v }] };
      } else if (match('OP','{')) {
        expr = { kind:'Call', func:expr, args:[parseTableConstructor()] };
      } else { break; }
    }
    return expr;
  };

  const PREC = {
    or:1, and:2,
    '<':3, '>':3, '<=':3, '>=':3, '==':3, '~=':3,
    '..':4, '+':5, '-':5, '*':6, '/':6, '%':6, '^':8,
  };
  const RIGHT = new Set(['..', '^']);

  function parseBinary(minP) {
    let left = parsePrefixExpr();
    while (true) {
      const t = cur(); const p = PREC[t.v];
      if (!p || p < minP) break;
      const op = adv().v;
      const right = parseBinary(RIGHT.has(op) ? p : p + 1);
      left = { kind:'Binary', op, left, right };
    }
    return left;
  }

  parseExpr = () => parseBinary(1);

  parseExprList = function() {
    const list = [parseExpr()];
    while (matchAdv('OP',',')) list.push(parseExpr());
    return list;
  };

  parseStatement = function() {
    const t = cur();

    if (match('KW','local')) {
      adv();
      if (match('KW','function')) {
        adv(); const name = expect('ID').v; const func = parseFuncBody();
        return { kind:'LocalFunction', name, func };
      }
      const names = parseNameList();
      const values = matchAdv('OP','=') ? parseExprList() : [];
      return { kind:'LocalAssign', names, values };
    }

    if (match('KW','function')) {
      adv(); const base = expect('ID').v; const path = [base]; let isMethod = false;
      while (matchAdv('OP','.')) path.push(expect('ID').v);
      if (matchAdv('OP',':')) { path.push(expect('ID').v); isMethod = true; }
      return { kind:'FunctionDecl', path, isMethod, func:parseFuncBody() };
    }

    if (match('KW','if')) {
      adv();
      const clauses = [];
      let cond = parseExpr(); expect('KW','then');
      let body = parseBlock(['elseif','else','end']);
      clauses.push({ cond, body });
      while (match('KW','elseif')) {
        adv(); cond = parseExpr(); expect('KW','then');
        body = parseBlock(['elseif','else','end']);
        clauses.push({ cond, body });
      }
      const elseBody = matchAdv('KW','else') ? parseBlock(['end']) : null;
      expect('KW','end');
      return { kind:'If', clauses, elseBody };
    }

    if (match('KW','while')) {
      adv(); const cond = parseExpr(); expect('KW','do');
      const body = parseBlock(['end']); expect('KW','end');
      return { kind:'While', cond, body };
    }

    if (match('KW','repeat')) {
      adv(); const body = parseBlock(['until']); expect('KW','until');
      return { kind:'Repeat', body, cond:parseExpr() };
    }

    if (match('KW','for')) {
      adv(); const firstName = expect('ID').v;
      if (matchAdv('OP','=')) {
        const start = parseExpr(); expect('OP',',');
        const stop  = parseExpr();
        const step  = matchAdv('OP',',') ? parseExpr() : null;
        expect('KW','do'); const body = parseBlock(['end']); expect('KW','end');
        return { kind:'NumericFor', var:firstName, start, stop, step, body };
      }
      const names = [firstName];
      while (matchAdv('OP',',')) names.push(expect('ID').v);
      expect('KW','in'); const iters = parseExprList();
      expect('KW','do'); const body = parseBlock(['end']); expect('KW','end');
      return { kind:'GenericFor', names, iters, body };
    }

    if (match('KW','return')) {
      adv();
      const nope = ['end','else','elseif','until','EOF'];
      const values = (!match('OP',';') && !nope.includes(cur().t==='KW'?cur().v:cur().t))
        ? parseExprList() : [];
      matchAdv('OP',';');
      return { kind:'Return', values };
    }

    if (match('KW','break'))    { adv(); return { kind:'Break' }; }
    if (match('KW','continue')) { adv(); return { kind:'Continue' }; }
    if (match('KW','do')) {
      adv(); const body = parseBlock(['end']); expect('KW','end');
      return { kind:'DoBlock', body };
    }

    // Assignment or call
    const expr = parsePrefixExpr();
    const COMPOUND = new Set(['+=','-=','*=','/=']);
    if (match('OP','=') || COMPOUND.has(cur().v)) {
      const targets = [expr];
      while (matchAdv('OP',',')) targets.push(parsePrefixExpr());
      const op = adv().v; const values = parseExprList();
      if (op !== '=') {
        const binOp = op[0];
        return { kind:'Assignment', targets, values:[{ kind:'Binary', op:binOp, left:targets[0], right:values[0] }] };
      }
      return { kind:'Assignment', targets, values };
    }
    if (expr.kind==='Call' || expr.kind==='MethodCall')
      return { kind:'ExprStmt', expr };

    throw new Error(`Unexpected expression statement at pos ${pos}`);
  };

  parseBlock = function(terminators=[]) {
    const stmts = []; const terms = new Set(terminators);
    while (!match('EOF')) {
      if (match('KW') && terms.has(cur().v)) break;
      matchAdv('OP',';');
      if (match('EOF') || (match('KW') && terms.has(cur().v))) break;
      stmts.push(parseStatement());
      matchAdv('OP',';');
    }
    return { kind:'Block', stmts };
  };

  return parseBlock();
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — IR COMPILER (AST → Register-Based IR)
// ══════════════════════════════════════════════════════════════════════════════

function compileIR(ast) {
  function createState() {
    return {
      instrs: [], consts: [], constMap: new Map(),
      regs: 0, maxRegs: 0,
      locals: new Map(), localStack: [],
      subChunks: [],
      breakLabels: [], continueLabels: [],
    };
  }

  function allocReg(s) {
    const r = s.regs++;
    if (s.regs > s.maxRegs) s.maxRegs = s.regs;
    return r;
  }

  function freeReg(s, n=1) { s.regs = Math.max(0, s.regs - n); }

  function addConst(s, v) {
    const key = typeof v + ':' + String(v);
    if (s.constMap.has(key)) return s.constMap.get(key);
    const idx = s.consts.length;
    s.consts.push(v); s.constMap.set(key, idx); return idx;
  }

  function emit(s, op, a=0, b=0, c=0) {
    const idx = s.instrs.length;
    s.instrs.push({ op, a, b, c }); return idx;
  }

  const pc = s => s.instrs.length;
  function patchJump(s, idx, target) { s.instrs[idx].b = target; }

  function pushScope(s) { s.localStack.push(new Map(s.locals)); }
  function popScope(s) { s.locals = s.localStack.pop(); }
  function findLocal(s, name) { return s.locals.get(name) ?? null; }
  function declareLocal(s, name) { const r = allocReg(s); s.locals.set(name, r); return r; }

  function compileExpr(s, node, target) {
    const reg = target ?? allocReg(s);

    switch (node.kind) {
      case 'Number': {
        emit(s, 'LOADK', reg, addConst(s, node.value)); break;
      }
      case 'String': {
        emit(s, 'LOADK', reg, addConst(s, node.value)); break;
      }
      case 'Boolean': {
        emit(s, 'LOADBOOL', reg, node.value ? 1 : 0); break;
      }
      case 'Nil': {
        emit(s, 'LOADNIL', reg); break;
      }
      case 'Identifier': {
        const lr = findLocal(s, node.name);
        if (lr !== null) { if (lr !== reg) emit(s, 'MOVE', reg, lr); }
        else emit(s, 'GETGLOBAL', reg, addConst(s, node.name));
        break;
      }
      case 'Binary': {
        const OPS = {
          '+':'ADD','-':'SUB','*':'MUL','/':'DIV','%':'MOD','^':'POW',
          '..':'CONCAT','==':'EQ','~=':'NE','<':'LT','<=':'LE','>':'GT','>=':'GE',
        };
        if (node.op === 'and') {
          compileExpr(s, node.left, reg);
          const j = emit(s, 'JMPIFFALSE', reg, 0);
          compileExpr(s, node.right, reg);
          patchJump(s, j, pc(s));
        } else if (node.op === 'or') {
          compileExpr(s, node.left, reg);
          const j = emit(s, 'JMPIFTRUE', reg, 0);
          compileExpr(s, node.right, reg);
          patchJump(s, j, pc(s));
        } else {
          const irOp = OPS[node.op];
          if (!irOp) throw new Error('Unknown binary op: ' + node.op);
          const lr = compileExpr(s, node.left);
          const rr = compileExpr(s, node.right);
          emit(s, irOp, reg, lr, rr);
          if (rr !== reg) freeReg(s);
          if (lr !== reg) freeReg(s);
        }
        break;
      }
      case 'Unary': {
        const OPS = { '-':'UNM', '#':'LEN', 'not':'NOT' };
        const or2 = compileExpr(s, node.operand);
        emit(s, OPS[node.op], reg, or2);
        if (or2 !== reg) freeReg(s);
        break;
      }
      case 'Call': {
        compileExpr(s, node.func, reg);
        const base = s.regs;
        for (let i = 0; i < node.args.length; i++)
          compileExpr(s, node.args[i], base + i);
        emit(s, 'CALL', reg, node.args.length, 1);
        s.regs = base;
        break;
      }
      case 'MethodCall': {
        compileExpr(s, node.obj, reg);
        const ni = addConst(s, node.method);
        emit(s, 'SELF', reg, reg, ni);
        const base = reg + 2; s.regs = Math.max(s.regs, base);
        for (let i = 0; i < node.args.length; i++)
          compileExpr(s, node.args[i], base + i);
        emit(s, 'CALL', reg, node.args.length + 1, 1);
        s.regs = base;
        break;
      }
      case 'MemberAccess': {
        const or2 = compileExpr(s, node.obj);
        emit(s, 'GETTABLE_S', reg, or2, addConst(s, node.member));
        if (or2 !== reg) freeReg(s);
        break;
      }
      case 'IndexAccess': {
        const or2 = compileExpr(s, node.obj);
        const ir2 = compileExpr(s, node.index);
        emit(s, 'GETTABLE', reg, or2, ir2);
        if (ir2 !== reg) freeReg(s);
        if (or2 !== reg) freeReg(s);
        break;
      }
      case 'Table': {
        emit(s, 'NEWTABLE', reg, node.fields.length);
        let ai = 1;
        for (const f of node.fields) {
          if (f.kind === 'PositionalField') {
            const vr = compileExpr(s, f.value);
            emit(s, 'SETTABLE_N', reg, addConst(s, ai++), vr);
            if (vr !== reg) freeReg(s);
          } else if (f.kind === 'NamedField') {
            const vr = compileExpr(s, f.value);
            emit(s, 'SETTABLE_S', reg, addConst(s, f.name), vr);
            if (vr !== reg) freeReg(s);
          } else if (f.kind === 'IndexedField') {
            const kr = compileExpr(s, f.key);
            const vr = compileExpr(s, f.value);
            emit(s, 'SETTABLE', reg, kr, vr);
            if (vr !== reg) freeReg(s);
            if (kr !== reg) freeReg(s);
          }
        }
        break;
      }
      case 'Function': {
        const sub = createState();
        for (const p of node.params) declareLocal(sub, p);
        compileBlock(sub, node.body);
        emit(sub, 'RETURN', 0, 0);
        const ci = s.subChunks.length;
        s.subChunks.push({
          instrs: sub.instrs, consts: sub.consts,
          maxRegs: sub.maxRegs, subChunks: sub.subChunks,
        });
        emit(s, 'CLOSURE', reg, ci);
        break;
      }
      case 'Grouped': { return compileExpr(s, node.expr, reg); }
      case 'Vararg':  { emit(s, 'VARARG', reg); break; }
      default: throw new Error('Unknown expr kind: ' + node.kind);
    }
    return reg;
  }

  function compileStmt(s, node) {
    switch (node.kind) {
      case 'LocalAssign': {
        const regs = node.names.map(n => declareLocal(s, n));
        for (let i = 0; i < regs.length; i++) {
          if (i < node.values.length) compileExpr(s, node.values[i], regs[i]);
          else emit(s, 'LOADNIL', regs[i]);
        }
        break;
      }
      case 'Assignment': {
        for (let i = 0; i < node.targets.length; i++) {
          const tgt = node.targets[i];
          if (i >= node.values.length) break;
          const vr = compileExpr(s, node.values[i]);
          if (tgt.kind === 'Identifier') {
            const lr = findLocal(s, tgt.name);
            if (lr !== null) { if (vr !== lr) emit(s, 'MOVE', lr, vr); }
            else emit(s, 'SETGLOBAL', vr, addConst(s, tgt.name));
          } else if (tgt.kind === 'MemberAccess') {
            const or2 = compileExpr(s, tgt.obj);
            emit(s, 'SETTABLE_S', or2, addConst(s, tgt.member), vr);
            freeReg(s);
          } else if (tgt.kind === 'IndexAccess') {
            const or2 = compileExpr(s, tgt.obj);
            const ir2 = compileExpr(s, tgt.index);
            emit(s, 'SETTABLE', or2, ir2, vr);
            freeReg(s, 2);
          }
          freeReg(s);
        }
        break;
      }
      case 'ExprStmt': {
        const r = compileExpr(s, node.expr); freeReg(s); break;
      }
      case 'If': {
        const exits = [];
        for (const cl of node.clauses) {
          const cr = compileExpr(s, cl.cond);
          const skip = emit(s, 'JMPIFFALSE', cr, 0); freeReg(s);
          pushScope(s); compileBlock(s, cl.body); popScope(s);
          exits.push(emit(s, 'JMP', 0, 0));
          patchJump(s, skip, pc(s));
        }
        if (node.elseBody) { pushScope(s); compileBlock(s, node.elseBody); popScope(s); }
        for (const j of exits) patchJump(s, j, pc(s));
        break;
      }
      case 'While': {
        const loopStart = pc(s);
        s.breakLabels.push([]); s.continueLabels.push([]);
        const cr = compileExpr(s, node.cond);
        const exit = emit(s, 'JMPIFFALSE', cr, 0); freeReg(s);
        pushScope(s); compileBlock(s, node.body); popScope(s);
        const conts = s.continueLabels.pop();
        for (const j of conts) patchJump(s, j, pc(s));
        emit(s, 'JMP', 0, loopStart);
        patchJump(s, exit, pc(s));
        const brks = s.breakLabels.pop();
        for (const j of brks) patchJump(s, j, pc(s));
        break;
      }
      case 'Repeat': {
        const loopStart = pc(s);
        s.breakLabels.push([]); s.continueLabels.push([]);
        pushScope(s); compileBlock(s, node.body); popScope(s);
        const conts = s.continueLabels.pop();
        for (const j of conts) patchJump(s, j, pc(s));
        const cr = compileExpr(s, node.cond);
        emit(s, 'JMPIFFALSE', cr, loopStart); freeReg(s);
        const brks = s.breakLabels.pop();
        for (const j of brks) patchJump(s, j, pc(s));
        break;
      }
      case 'NumericFor': {
        pushScope(s);
        const vr  = declareLocal(s, node.var);
        const sr2 = compileExpr(s, node.start);
        const er  = compileExpr(s, node.stop);
        const stp = node.step ? compileExpr(s, node.step) : allocReg(s);
        if (!node.step) emit(s, 'LOADK', stp, addConst(s, 1));
        emit(s, 'MOVE', vr, sr2);
        const loopStart = pc(s);
        s.breakLabels.push([]); s.continueLabels.push([]);
        const exit = emit(s, 'FORCHECK', vr, 0, er);
        compileBlock(s, node.body);
        const conts = s.continueLabels.pop();
        for (const j of conts) patchJump(s, j, pc(s));
        emit(s, 'ADD', vr, vr, stp);
        emit(s, 'JMP', 0, loopStart);
        patchJump(s, exit, pc(s));
        const brks = s.breakLabels.pop();
        for (const j of brks) patchJump(s, j, pc(s));
        popScope(s);
        break;
      }
      case 'GenericFor': {
        pushScope(s);
        const iterBase = s.regs;
        for (const it of node.iters) compileExpr(s, it);
        while (s.regs < iterBase + 3) emit(s, 'LOADNIL', allocReg(s));
        const vregs = node.names.map(n => declareLocal(s, n));
        const loopStart = pc(s);
        s.breakLabels.push([]); s.continueLabels.push([]);
        emit(s, 'TFORLOOP', iterBase, node.names.length);
        const exit = emit(s, 'JMPIFNIL', vregs[0], 0);
        compileBlock(s, node.body);
        const conts = s.continueLabels.pop();
        for (const j of conts) patchJump(s, j, pc(s));
        emit(s, 'JMP', 0, loopStart);
        patchJump(s, exit, pc(s));
        const brks = s.breakLabels.pop();
        for (const j of brks) patchJump(s, j, pc(s));
        popScope(s);
        break;
      }
      case 'Return': {
        if (node.values.length === 0) { emit(s, 'RETURN', 0, 0); break; }
        const base = s.regs;
        for (let i = 0; i < node.values.length; i++)
          compileExpr(s, node.values[i], base + i);
        emit(s, 'RETURN', base, node.values.length);
        s.regs = base;
        break;
      }
      case 'Break': {
        if (s.breakLabels.length > 0) {
          const j = emit(s, 'JMP', 0, 0);
          s.breakLabels[s.breakLabels.length - 1].push(j);
        }
        break;
      }
      case 'Continue': {
        if (s.continueLabels.length > 0) {
          const j = emit(s, 'JMP', 0, 0);
          s.continueLabels[s.continueLabels.length - 1].push(j);
        }
        break;
      }
      case 'DoBlock': {
        pushScope(s); compileBlock(s, node.body); popScope(s); break;
      }
      case 'LocalFunction': {
        const r = declareLocal(s, node.name); compileExpr(s, node.func, r); break;
      }
      case 'FunctionDecl': {
        const fr = compileExpr(s, node.func);
        if (node.path.length === 1) {
          emit(s, 'SETGLOBAL', fr, addConst(s, node.path[0]));
        } else {
          const or2 = allocReg(s);
          emit(s, 'GETGLOBAL', or2, addConst(s, node.path[0]));
          for (let i = 1; i < node.path.length - 1; i++)
            emit(s, 'GETTABLE_S', or2, or2, addConst(s, node.path[i]));
          emit(s, 'SETTABLE_S', or2, addConst(s, node.path[node.path.length-1]), fr);
          freeReg(s);
        }
        freeReg(s);
        break;
      }
      default: throw new Error('Unknown stmt kind: ' + node.kind);
    }
  }

  function compileBlock(s, node) {
    if (node.kind !== 'Block') throw new Error('Expected Block, got ' + node.kind);
    for (const stmt of node.stmts) compileStmt(s, stmt);
  }

  const root = createState();
  compileBlock(root, ast);
  emit(root, 'RETURN', 0, 0);
  return {
    instrs: root.instrs, consts: root.consts,
    maxRegs: root.maxRegs, subChunks: root.subChunks,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — POLYMORPHIC ENGINE
// Random opcode → number mapping. Every build gets unique opcodes.
// ══════════════════════════════════════════════════════════════════════════════

const ALL_OPCODES = [
  'LOADK','LOADBOOL','LOADNIL','MOVE',
  'GETGLOBAL','SETGLOBAL',
  'GETTABLE','SETTABLE','GETTABLE_S','SETTABLE_S','SETTABLE_N',
  'NEWTABLE','SELF',
  'ADD','SUB','MUL','DIV','MOD','POW','CONCAT',
  'UNM','LEN','NOT',
  'EQ','NE','LT','LE','GT','GE',
  'JMP','JMPIFFALSE','JMPIFTRUE','JMPIFNIL',
  'CALL','RETURN','VARARG','CLOSURE',
  'FORCHECK','TFORLOOP',
  'NOP','DUMMY1','DUMMY2','DUMMY3','DUMMY4',
];

function generateOpcodeMap() {
  const map = {}, used = new Set();
  for (const op of ALL_OPCODES) {
    let code;
    do { code = ri(10, 250); } while (used.has(code));
    used.add(code); map[op] = code;
  }
  return map;
}

function generateDummySeq(map, length) {
  const dummies = ['NOP','DUMMY1','DUMMY2','DUMMY3','DUMMY4'];
  const seq = [];
  for (let i = 0; i < length; i++) {
    seq.push(map[dummies[ri(0, dummies.length-1)]]);
    seq.push(ri(0,255)); seq.push(ri(0,127)); seq.push(ri(0,255)); seq.push(ri(0,255));
  }
  return seq;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — VM COMPILER (IR → Bytecode)
// 5 bytes per instruction: [opcode, A, B_hi, B_lo, C]
// B is signed 16-bit: value + 32768 → two bytes
// ══════════════════════════════════════════════════════════════════════════════

function encodeInstr(map, op, a, b, c) {
  const opcode = map[op];
  if (opcode === undefined) throw new Error('Unknown opcode: ' + op);
  const bShift = b + 32768;
  return [opcode, a & 0xFF, (bShift >> 8) & 0xFF, bShift & 0xFF, c & 0xFF];
}

function compileBytecode(irChunk, opcodeMap) {
  const code = [];

  for (const instr of irChunk.instrs) {
    // 25% chance to inject 1-2 dummy instructions before real one
    if (ri(1,100) <= 25) {
      const junk = generateDummySeq(opcodeMap, ri(1,2));
      for (const b of junk) code.push(b);
    }
    const enc = encodeInstr(opcodeMap, instr.op, instr.a||0, instr.b||0, instr.c||0);
    for (const b of enc) code.push(b);
  }

  const compiledSubs = irChunk.subChunks.map(sub => compileBytecode(sub, opcodeMap));

  return {
    code, constants: irChunk.consts,
    maxRegs: irChunk.maxRegs, subChunks: compiledSubs,
    opcodeMap,
  };
}

function vmCompile(irChunk) {
  const opcodeMap = generateOpcodeMap();
  return compileBytecode(irChunk, opcodeMap);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — ENCRYPTION ENGINE
// Multi-layer XOR with rolling key. Generates self-contained Lua decryptor.
// ══════════════════════════════════════════════════════════════════════════════

function generateEncConfig(layers) {
  const keyLen = ri(8, 32);
  const key = [];
  for (let i = 0; i < keyLen; i++) key.push(ri(1, 255));
  return {
    key, xorBase: ri(1, 254),
    rollingMul: ri(3, 17), rollingAdd: ri(1, 127),
    layers: layers || ri(2, 4),
  };
}

function encryptBytes(data, cfg) {
  let result = [...data];
  for (let layer = 1; layer <= cfg.layers; layer++) {
    let rk = cfg.xorBase + layer * 31;
    const enc = [];
    for (let i = 0; i < result.length; i++) {
      const kb = cfg.key[i % cfg.key.length];
      let b = result[i];
      b = (b ^ kb) & 0xFF;
      b = (b ^ (rk % 256)) & 0xFF;
      b = (b + layer * 7) % 256;
      enc.push(b);
      rk = (rk * cfg.rollingMul + cfg.rollingAdd) % 65536;
    }
    result = enc;
  }
  return result;
}

function encryptString(str, cfg) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  return encryptBytes(bytes, cfg);
}

function generateDecryptor(cfg) {
  const name = iv();
  const code = `local function ${name}(_d) ` +
    `local _r=_d ` +
    `local _k={${cfg.key.map(A).join(',')}} ` +
    `local _xb=${A(cfg.xorBase)} ` +
    `local _rm=${A(cfg.rollingMul)} ` +
    `local _ra=${A(cfg.rollingAdd)} ` +
    `local _nl=${A(cfg.layers)} ` +
    `for _layer=_nl,1,-1 do ` +
    `local _rk=_xb+_layer*31 ` +
    `local _rks={} ` +
    `local _rkv=_rk ` +
    `for _i=1,#_r do ` +
    `_rks[_i]=_rkv%256 ` +
    `_rkv=(_rkv*_rm+_ra)%65536 ` +
    `end ` +
    `local _dd={} ` +
    `for _i=1,#_r do ` +
    `local _b=_r[_i] ` +
    `_b=(_b-_layer*7)%256 ` +
    `_b=bit32.bxor(_b,_rks[_i]) ` +
    `_b=bit32.bxor(_b,_k[((_i-1)%#_k)+1]) ` +
    `_dd[_i]=_b ` +
    `end ` +
    `_r=_dd ` +
    `end ` +
    `return _r ` +
    `end`;
  return [code, name];
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — ANTI-TAMPER & ANTI-DEBUG
// Uses xorHidden() for all string literals → no raw strings visible in output.
// ══════════════════════════════════════════════════════════════════════════════

function luaEscapeStr(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c===92) r+='\\\\';
    else if (c===34) r+='\\"';
    else if (c===10) r+='\\n';
    else if (c===13) r+='\\r';
    else if (c===0)  r+='\\0';
    else if (c===9)  r+='\\t';
    else if (c<32||c>126) r+='\\'+String(c).padStart(3,'0');
    else r+=s[i];
  }
  return r;
}

function xorHidden(s) {
  const keyBytes = [...crypto.randomBytes(s.length)].map(b => (b & 0x7F) | 1);
  const encBytes = [];
  for (let i = 0; i < s.length; i++) encBytes.push(s.charCodeAt(i) ^ keyBytes[i]);

  const vt=iv(), vk=iv(), vo=iv(), vi2=iv();
  return `(function()` +
    `local ${vt}={${encBytes.map(A).join(',')}} ` +
    `local ${vk}={${keyBytes.map(A).join(',')}} ` +
    `local ${vo}={} ` +
    `for ${vi2}=1,#${vt} do ` +
    `${vo}[${vi2}]=string.char(bit32.bxor(${vt}[${vi2}],${vk}[${vi2}])) ` +
    `end ` +
    `return table.concat(${vo}) ` +
    `end)()`;
}

function generateAntiTamper() {
  const xRf   = xorHidden('readfile');
  const xWf   = xorHidden('writefile');
  const xSyn  = xorHidden('syn');
  const xFlux = xorHidden('fluxus');
  const xDex  = xorHidden('deltaexecute');
  const xInst = xorHidden('Instance');
  const xDM   = xorHidden('DataModel');

  const vEi=iv(), vEd=iv(), vGenv=iv(), vExec=iv(), vC1=iv(), vC2=iv();

  return (
    `local ${vEi}=${xInst} ` +
    `local ${vEd}=${xDM} ` +
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd})then ` +
    `local ${vC1}=nil ${vC1}()return ` +
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
    `if ${vExec}==nil then local ${vC2}=nil ${vC2}()return end ` +
    `${vGenv}=nil ${vExec}=nil`
  );
}

function computeHash(data) {
  let h = 5381;
  for (const b of data) { h = ((h * 33) ^ b) >>> 0; }
  return h >>> 0;
}

function generateHashCheck(arrayExpr, expected) {
  const fn=iv(), vr=iv();
  return (
    `local function ${fn}(_d) ` +
    `local _h=${A(5381)} ` +
    `for _i=1,#_d do ` +
    `_h=bit32.bxor(_h*${A(33)},_d[_i]) ` +
    `_h=_h%${A(2147483648)} ` +
    `end ` +
    `return _h ` +
    `end ` +
    `local ${vr}=${fn}(${arrayExpr}) ` +
    `if ${vr}~=${A(expected)} then ` +
    `while true do local _=${A(0)} end ` +
    `end`
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — VM RUNTIME GENERATOR
// Generates a unique, shuffled, obfuscated Lua VM interpreter per build.
// All internal variable names use iv(). Dispatch order is shuffled.
// ══════════════════════════════════════════════════════════════════════════════

function generateVMRuntime(opcodeMap) {
  const V = {
    vmFn : iv(), cdata: iv(), env  : iv(),
    code : iv(), consts: iv(), subs : iv(),
    ip   : iv(), regs : iv(), op   : iv(),
    a    : iv(), b    : iv(), c    : iv(),
    unp  : iv(),
  };

  const handlers = [];
  function add(opName, body) {
    const code = opcodeMap[opName];
    if (code !== undefined)
      handlers.push({ code, body: `elseif ${V.op}==${code} then\n      ${body}` });
  }

  // ── Instruction handlers ────────────────────────────────────────────────
  add('LOADK',      `${V.regs}[${V.a}]=${V.consts}[${V.b}+1]`);
  add('LOADBOOL',   `${V.regs}[${V.a}]=(${V.b}==1)`);
  add('LOADNIL',    `${V.regs}[${V.a}]=nil`);
  add('MOVE',       `${V.regs}[${V.a}]=${V.regs}[${V.b}]`);
  add('GETGLOBAL',  `${V.regs}[${V.a}]=${V.env}[${V.consts}[${V.b}+1]]`);
  add('SETGLOBAL',  `${V.env}[${V.consts}[${V.b}+1]]=${V.regs}[${V.a}]`);
  add('GETTABLE',   `${V.regs}[${V.a}]=${V.regs}[${V.b}][${V.regs}[${V.c}]]`);
  add('SETTABLE',   `${V.regs}[${V.a}][${V.regs}[${V.b}]]=${V.regs}[${V.c}]`);
  add('GETTABLE_S', `${V.regs}[${V.a}]=${V.regs}[${V.b}][${V.consts}[${V.c}+1]]`);
  add('SETTABLE_S', `${V.regs}[${V.a}][${V.consts}[${V.b}+1]]=${V.regs}[${V.c}]`);
  add('SETTABLE_N', `${V.regs}[${V.a}][${V.consts}[${V.b}+1]]=${V.regs}[${V.c}]`);
  add('NEWTABLE',   `${V.regs}[${V.a}]={}`);
  add('SELF',
    `local _o=${V.regs}[${V.b}] ` +
    `${V.regs}[${V.a}]=_o[${V.consts}[${V.c}+1]] ` +
    `${V.regs}[${V.a}+1]=_o`
  );

  // Arithmetic
  for (const [name, sym] of [
    ['ADD','+'   ], ['SUB','-'], ['MUL','*'],
    ['DIV','/'   ], ['MOD','%'], ['POW','^'],
  ]) add(name, `${V.regs}[${V.a}]=${V.regs}[${V.b}]${sym}${V.regs}[${V.c}]`);

  add('CONCAT', `${V.regs}[${V.a}]=tostring(${V.regs}[${V.b}])..tostring(${V.regs}[${V.c}])`);
  add('UNM',    `${V.regs}[${V.a}]=-${V.regs}[${V.b}]`);
  add('LEN',    `${V.regs}[${V.a}]=#${V.regs}[${V.b}]`);
  add('NOT',    `${V.regs}[${V.a}]=not ${V.regs}[${V.b}]`);

  // Comparison
  for (const [name, sym] of [
    ['EQ','=='], ['NE','~='], ['LT','<'],
    ['LE','<='], ['GT','>'], ['GE','>='],
  ]) add(name, `${V.regs}[${V.a}]=${V.regs}[${V.b}]${sym}${V.regs}[${V.c}]`);

  // Jumps
  add('JMP',        `${V.ip}=${V.b}*5+1 _sk=false`);
  add('JMPIFFALSE', `if not ${V.regs}[${V.a}] then ${V.ip}=${V.b}*5+1 _sk=false end`);
  add('JMPIFTRUE',  `if ${V.regs}[${V.a}] then ${V.ip}=${V.b}*5+1 _sk=false end`);
  add('JMPIFNIL',   `if ${V.regs}[${V.a}]==nil then ${V.ip}=${V.b}*5+1 _sk=false end`);

  // Call
  add('CALL',
    `local _f=${V.regs}[${V.a}] ` +
    `local _na=${V.b} local _nr=${V.c} ` +
    `local _ar={} ` +
    `for _i=1,_na do _ar[_i]=${V.regs}[${V.a}+_i] end ` +
    `local _re={_f(${V.unp}(_ar,1,_na))} ` +
    `for _i=1,_nr do ${V.regs}[${V.a}+_i-1]=_re[_i] end`
  );

  // Return
  add('RETURN',
    `if ${V.b}==0 then return end ` +
    `local _rt={} ` +
    `for _i=0,${V.b}-1 do _rt[_i+1]=${V.regs}[${V.a}+_i] end ` +
    `return ${V.unp}(_rt,1,${V.b})`
  );

  // Closure
  add('CLOSURE',
    `local _sc=${V.subs}[${V.b}+1] ` +
    `${V.regs}[${V.a}]=function(...) return ${V.vmFn}(_sc,${V.env},...) end`
  );

  add('VARARG', `${V.regs}[${V.a}]=...`);

  // Numeric for check
  add('FORCHECK',
    `local _cv=${V.regs}[${V.a}] ` +
    `local _lm=${V.regs}[${V.c}] ` +
    `local _st=${V.regs}[${V.a}+2] or 1 ` +
    `if _st>0 then if _cv>_lm then ${V.ip}=${V.b}*5+1 _sk=false end ` +
    `else if _cv<_lm then ${V.ip}=${V.b}*5+1 _sk=false end end`
  );

  // Generic for
  add('TFORLOOP',
    `local _it=${V.regs}[${V.a}] ` +
    `local _st=${V.regs}[${V.a}+1] ` +
    `local _ct=${V.regs}[${V.a}+2] ` +
    `local _re={_it(_st,_ct)} ` +
    `for _i=1,${V.b} do ${V.regs}[${V.a}+2+_i]=_re[_i] end ` +
    `${V.regs}[${V.a}+2]=_re[1]`
  );

  // NOPs
  for (const d of ['NOP','DUMMY1','DUMMY2','DUMMY3','DUMMY4']) add(d, '--nop');

  // ── Build dispatch (shuffled order) ─────────────────────────────────────
  const shuffled = [...handlers].sort(() => Math.random() - 0.5);
  const dispatch = shuffled.map((h, i) =>
    i === 0 ? h.body.replace('elseif','if') : h.body
  ).join('\n');

  // ── Assemble VM function ─────────────────────────────────────────────────
  return [
    `local ${V.unp}=table.unpack or unpack\n` +
    `local function ${V.vmFn}(${V.cdata},${V.env},...)\n` +
    `  local ${V.code}=${V.cdata}.code\n` +
    `  local ${V.consts}=${V.cdata}.constants\n` +
    `  local ${V.subs}=${V.cdata}.subChunks or {}\n` +
    `  local ${V.ip}=1\n` +
    `  local ${V.regs}={}\n` +
    `  while true do\n` +
    `    if ${V.ip}>#${V.code} then break end\n` +
    `    local ${V.op}=${V.code}[${V.ip}]\n` +
    `    local ${V.a}=${V.code}[${V.ip}+1]\n` +
    `    local ${V.b}=(${V.code}[${V.ip}+2]*256+${V.code}[${V.ip}+3])-32768\n` +
    `    local ${V.c}=${V.code}[${V.ip}+4]\n` +
    `    local _sk=true\n` +
    dispatch + `\n` +
    `    end\n` +
    `    if _sk then ${V.ip}=${V.ip}+5 end\n` +
    `  end\n` +
    `end`,
    V.vmFn,
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — CODE GENERATOR (Final Assembly)
// Serializes bytecode, applies encryption, inserts junk, builds final Lua.
// ══════════════════════════════════════════════════════════════════════════════

function serializeChunk(compiled, encCfg) {
  function serConsts(consts) {
    const parts = consts.map(c => {
      if (encCfg) {
        if (typeof c === 'string') {
          const enc = encryptString(c, encCfg);
          return `{t="s",d={${enc.map(A).join(',')}}}`;
        }
        if (typeof c === 'number')  return `{t="n",v=${c}}`;
        if (typeof c === 'boolean') return `{t="b",v=${c}}`;
        return 'nil';
      }
      if (typeof c === 'string')  return `"${luaEscapeStr(c)}"`;
      if (typeof c === 'number')  return String(c);
      if (typeof c === 'boolean') return String(c);
      return 'nil';
    });
    return '{' + parts.join(',') + '}';
  }

  function serChunk(ch) {
    const codeData = encCfg ? encryptBytes(ch.code, encCfg) : ch.code;
    const codeStr  = '{' + codeData.map(A).join(',') + '}';
    const constsStr = serConsts(ch.constants);
    const subsStr  = '{' + ch.subChunks.map(serChunk).join(',') + '}';
    return `{code=${codeStr},constants=${constsStr},subChunks=${subsStr},maxRegs=${A(ch.maxRegs)}}`;
  }

  return serChunk(compiled);
}

function codeGen(compiled, cfg) {
  const sections = [];

  // ── Anti-tamper ─────────────────────────────────────────────────────────
  if (cfg.antiTamper) sections.push(generateAntiTamper());

  // ── Leading junk ────────────────────────────────────────────────────────
  if (cfg.junkDensity > 0) sections.push(makeJunk(ri(8,12)));

  // ── Encryption setup ────────────────────────────────────────────────────
  let encCfg = null, decryptorName = '';
  if (cfg.encryptionLayers > 0) {
    encCfg = generateEncConfig(cfg.encryptionLayers);
    const [decCode, decName] = generateDecryptor(encCfg);
    decryptorName = decName;
    sections.push(decCode);
  }

  // ── VM Runtime ──────────────────────────────────────────────────────────
  const [vmCode, vmName] = generateVMRuntime(compiled.opcodeMap);
  sections.push(vmCode);

  // ── Middle junk ─────────────────────────────────────────────────────────
  if (cfg.junkDensity > 0) sections.push(makeJunk(ri(4,8)));

  // ── Bytecode ────────────────────────────────────────────────────────────
  const bcVar = iv();
  sections.push(`local ${bcVar}=${serializeChunk(compiled, encCfg)}`);

  // ── Decoder ─────────────────────────────────────────────────────────────
  if (encCfg) {
    const decFn = iv();
    sections.push(
      `local function ${decFn}(_ch) ` +
      `_ch.code=${decryptorName}(_ch.code) ` +
      `local _dc={} ` +
      `for _i,_c in(_ch.constants)do ` +
      `if type(_c)=="table"and _c.t=="s" then ` +
      `local _by=${decryptorName}(_c.d) ` +
      `local _s="" ` +
      `for _,_b in _by do _s=_s..string.char(_b) end ` +
      `_dc[_i]=_s ` +
      `elseif type(_c)=="table"and _c.t=="n" then _dc[_i]=_c.v ` +
      `elseif type(_c)=="table"and _c.t=="b" then _dc[_i]=_c.v ` +
      `else _dc[_i]=_c end ` +
      `end ` +
      `_ch.constants=_dc ` +
      `for _,_s in(_ch.subChunks or{})do ${decFn}(_s) end ` +
      `end ` +
      `${decFn}(${bcVar})`
    );
  }

  // ── Hash check ──────────────────────────────────────────────────────────
  if (cfg.antiTamper) {
    const hash = computeHash(compiled.code);
    sections.push(generateHashCheck(`${bcVar}.code`, hash));
  }

  // ── Trailing junk ───────────────────────────────────────────────────────
  if (cfg.junkDensity > 0) sections.push(makeJunk(ri(4,8)));

  // ── Execute ─────────────────────────────────────────────────────────────
  const envV = iv();
  sections.push(`local ${envV}=getfenv and getfenv()or _ENV or _G`);
  sections.push(`${vmName}(${bcVar},${envV})`);

  // ── Trailing junk ───────────────────────────────────────────────────────
  if (cfg.junkDensity > 0) sections.push(makeJunk(ri(3,6)));

  return sections.join('\n').replace(/[ \t]{2,}/g,' ').trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — STRING TABLE OBFUSCATION (Surface-Level Layer)
// Handles raw-source string obfuscation for simple scripts that don't
// go through the full VM pipeline (e.g. one-liner injection).
// Also used as a standalone fallback mode.
// ══════════════════════════════════════════════════════════════════════════════

function buildStringTable(tokens) {
  const strTable = [], strMap = new Map();
  function addStr(s) {
    if (!strMap.has(s)) { strMap.set(s, strTable.length); strTable.push(s); }
    return strMap.get(s);
  }
  [
    '','string','number','boolean','table','function','nil',
    'type','tostring','tonumber','pairs','ipairs','select','pcall',
    'rawget','rawset','next','error','assert','unpack',
    'math','bit32','coroutine',
    'game','workspace','script','Instance','DataModel',
    'Players','LocalPlayer','GetService',
  ].forEach(addStr);
  for (const tok of tokens) if (tok.t === 'STR') addStr(tok.v);
  return { strTable, strMap };
}

function needsSpace(prev, curr) {
  if (!prev || !curr) return false;
  if (/[a-zA-Z0-9_]$/.test(prev) && /^[a-zA-Z0-9_]/.test(curr)) return true;
  if (prev.endsWith('-') && curr.startsWith('-')) return true;
  if (prev.endsWith('.') && curr.startsWith('.')) return true;
  return false;
}

const GLOBAL_IDS = new Set([
  'print','warn','error','assert','type','typeof','tostring',
  'tonumber','pairs','ipairs','next','select','pcall','xpcall',
  'rawget','rawset','rawequal','rawlen',
  'unpack','table','string','math','bit32','coroutine',
  'setmetatable','getmetatable','require',
  'game','workspace','script','Instance','Enum',
  'wait','delay','spawn','tick','time','os','task',
  'getfenv','setfenv','getgenv','getrenv','getreg',
  'loadstring','newproxy',
  'true','false','nil',
  'self','_G','_ENV','_VERSION',
  'Vector3','Vector2','CFrame','Color3','BrickColor',
  'UDim','UDim2','Rect','Ray','Region3',
  'TweenInfo','NumberRange','NumberSequence',
  'ColorSequence','PhysicalProperties',
  'debug','utf8','buffer',
]);

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 14 — MAIN OBFUSCATE API
// Full pipeline: lex → parse → IR → VM bytecode → encrypt → assemble
// Plus string-table surface layer for simple token-level obfuscation.
// ══════════════════════════════════════════════════════════════════════════════

function obfuscate(code, options = {}) {
  resetVars();

  const cfg = {
    junkDensity      : options.junkDensity      ?? 40,
    encryptionLayers : options.encryptionLayers  ?? 3,
    antiTamper       : options.antiTamper        ?? true,
    stringEncryption : options.stringEncryption  ?? true,
    vmMode           : options.vmMode            ?? true,   // full VM pipeline
  };

  // ── Token-level pass (always runs) ──────────────────────────────────────
  const tokens = lex(code);
  const { strTable, strMap } = buildStringTable(tokens);

  const xorKey = ri(1, 254);
  const encTable = strTable.map(s => {
    if (s === '') return '""';
    let enc = '"';
    for (let i = 0; i < s.length; i++)
      enc += '\\' + String((s.charCodeAt(i) ^ xorKey) & 0xFF).padStart(3,'0');
    return enc + '"';
  });

  const tVar = '_ST';
  const tLen = encTable.length;

  const nShuf = Math.min(3, Math.floor(tLen / 5));
  const shufPairs = [], usedP = new Set();
  for (let si = 0; si < nShuf; si++) {
    let a, b, k;
    do { a = ri(1,tLen); b = ri(1,tLen); k = `${a}:${b}`; } while (a===b || usedP.has(k));
    usedP.add(k); shufPairs.push([a,b]);
  }

  const tableDecl = `local ${tVar}={${encTable.join(',')}}`;

  const shufCode = shufPairs.length === 0 ? '' :
    `for _u,_z in ipairs({${shufPairs.map(([a,b])=>`{${A(a)};${A(b)}}`).join(',')}}) do ` +
    `while _z[${A(1)}]<_z[${A(2)}] do ` +
    `${tVar}[_z[${A(1)}]],${tVar}[_z[${A(2)}]],_z[${A(1)}],_z[${A(2)}]=` +
    `${tVar}[_z[${A(2)}]],${tVar}[_z[${A(1)}]],_z[${A(1)}]+${A(1)},_z[${A(2)}]-${A(1)} ` +
    `end end`;

  const helperOffset = ri(10,50);
  const helperCode = `local function _h(_n)return ${tVar}[_n+(${A(helperOffset)})]end`;

  const dA=iv(), dB=iv(), dC=iv(), dD=iv(), dE=iv(), dF=iv();
  const decoderCode =
    `do local ${dA}=string.char local ${dB}=string.byte local ${dC}=table.concat ` +
    `for ${dD}=${A(1)},#${tVar},${A(1)} do ` +
    `local ${dE}=${tVar}[${dD}] ` +
    `if type(${dE})=="string" then ` +
    `local ${dF}={} ` +
    `for _j=${A(1)},#${dE} do ` +
    `${dF}[_j]=${dA}(bit32.bxor(${dB}(${dE},_j),${A(xorKey)})) ` +
    `end ` +
    `${tVar}[${dD}]=${dC}(${dF}) ` +
    `end end end`;

  // ── VM Pipeline ──────────────────────────────────────────────────────────
  if (cfg.vmMode) {
    let ast, irChunk, compiled;
    try {
      ast      = parse(tokens);
      irChunk  = compileIR(ast);
      compiled = vmCompile(irChunk);
    } catch (e) {
      console.warn('[obfuscator] VM pipeline failed, falling back to token mode:', e.message);
      cfg.vmMode = false;
    }

    if (cfg.vmMode) {
      const parts = [
        tableDecl,
        shufCode,
        decoderCode,
        helperCode,
        codeGen(compiled, cfg),
      ].filter(Boolean);

      return parts.join('\n').replace(/[ \t]{2,}/g,' ').replace(/[\r\n]+/g,' ').trim();
    }
  }

  // ── Token-only fallback mode ─────────────────────────────────────────────
  const idMap = new Map();
  function renameId(name) {
    if (GLOBAL_IDS.has(name)) return name;
    if (name.startsWith('_')) return name;
    if (!idMap.has(name)) idMap.set(name, bv());
    return idMap.get(name);
  }
  function strRef(s) {
    const idx = strMap.get(s);
    if (idx === undefined) return `"${luaEscapeStr(s)}"`;
    return `_h(${A(idx + 1 - helperOffset)})`;
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
        bodyParts.push(Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 ? A(n) : String(n));
        break;
      }
      case 'OP': bodyParts.push(tok.v); break;
      default:   bodyParts.push(tok.v || ''); break;
    }
  }

  const spaced = [];
  for (let i = 0; i < bodyParts.length; i++) {
    if (i > 0 && needsSpace(bodyParts[i-1], bodyParts[i])) spaced.push(' ');
    spaced.push(bodyParts[i]);
  }
  const bodyStr = spaced.join('');

  const junkBefore = makeJunk(ri(8,12));
  const junkAfter  = makeJunk(ri(6,10));
  const fullBody   = junkBefore + ' ' + bodyStr + ' ' + junkAfter;

  const antiTamper = cfg.antiTamper ? generateAntiTamper() : '';
  const paramNames = 'H,B,Q,q,I,T,g,i,A,J,p,j,V,G,z,L,P,Z,u,r';
  const envArg     = 'getfenv and getfenv()or _ENV';
  const unpackArg  = 'unpack or table.unpack';

  const parts = [
    tableDecl, shufCode, decoderCode, helperCode,
    `return(function(${paramNames})`,
    antiTamper,
    fullBody,
    `end)(${envArg},${unpackArg})`,
  ].filter(Boolean);

  return parts.join(' ').replace(/[\r\n]+/g,' ').replace(/[ \t]{2,}/g,' ').trim();
}

module.exports = { obfuscate };
