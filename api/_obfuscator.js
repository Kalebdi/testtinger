// [[ OBFUSCATE BY SOLI V7.0 — EXECUTOR ENGINE ]]
// CFF + RC4 + STRING POOL + INTEGRITY CHECKS + ANTI-TAMPER + FAKE OPCODES
// + ARITHMETIC OBFUSCATION

const crypto = require('crypto');

// ---------- UTILS ----------
// FIX 1: fallback menggunakan globalThis.crypto, bukan crypto (Node module)
function randomBytes(n) {
  try { return crypto.randomBytes(n); }
  catch { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return Buffer.from(b); }
}
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// Lua-safe variable names
function v() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let name = '_';
  for (let i = 0; i < 6; i++) name += chars[Math.floor(Math.random() * chars.length)];
  return name;
}
function v2() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let name = '_';
  for (let i = 0; i < 8; i++) name += chars[Math.floor(Math.random() * chars.length)];
  return name;
}

// FIX 6: Arith case 7 sebelumnya: bit32.band(n|a, a) = a ≠ n
// Sekarang: bit32.band(n+a - a, 0xFFFFFFFF) = n & 0xFFFFFFFF = n ✓
function Arith(n) {
  const t = ri(0, 7);
  const a = ri(1, 99999);
  const b = ri(1, 99999);
  switch (t) {
    case 0: return `${n + a}-${a}`;
    case 1: return `${a}-(${a - n})`;
    case 2: return `bit32.bxor(${n ^ a},${a})`;
    case 3: return `(${n * a})/${a}`;
    case 4: return `(${n + a + b})-(${a + b})`;
    case 5: return `(function() return ${a + n}-${a} end)()`;
    case 6: return `${-a + (n + a)}`;
    // FIX 6: was bit32.band(${n|a},${a}) = a, not n. Now correct:
    case 7: return `bit32.band(${n + a}-${a},${0xFFFFFFFF})`;
    default: return `${n}`;
  }
}

function A(n) { return Arith(n); }

function toLuaEscape(s) {
  return '"' + [...s].map(c => '\\' + String(c.charCodeAt(0)).padStart(3, '0')).join('') + '"';
}

// ---------- DJB2 HASH ----------
function djb2(bytes) {
  let h = 5381;
  for (const b of bytes) h = (((h << 5) >>> 0) + h + b) >>> 0;
  return h >>> 0;
}
const luaDjb2 = (iv) => `(function()
  local _h=${Arith(5381)}
  for _i=1,#${iv} do
    local _b=${iv}:byte(_i)
    _h=bit32.band(bit32.lshift(_h,5)+_h+_b,${Arith(0xFFFFFFFF)})
  end
  return _h
end)()`;

// ---------- RC4 ----------
function rc4(data, key) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let ci = 0; j = 0;
  return data.map(b => {
    ci = (ci + 1) % 256;
    j = (j + s[ci]) % 256;
    [s[ci], s[j]] = [s[j], s[ci]];
    return b ^ s[(s[ci] + s[j]) % 256];
  });
}

// ---------- OPCODES ----------
function makeOpcodes(realCount, fakeCount) {
  const total = realCount + fakeCount;
  const nums = new Set();
  while (nums.size < total) nums.add(ri(1000000, 999999999));
  const all = [...nums].sort((a, b) => a - b);
  const realIdxs = new Set();
  while (realIdxs.size < realCount) realIdxs.add(ri(0, total - 1));
  return {
    reals: all.filter((_, i) => realIdxs.has(i)).sort((a, b) => a - b).map(val => ({ val, expr: Arith(val) })),
    fakes: all.filter((_, i) => !realIdxs.has(i)).map(val => ({ val }))
  };
}

// ---------- CFF ----------
function cffWrap(src) {
  const lines = src.split('\n');
  const chunks = [];
  let cur = [];
  for (const ln of lines) {
    cur.push(ln);
    if (cur.length >= ri(4, 10) || ln.trim() === '') {
      if (cur.some(l => l.trim())) chunks.push(cur.join('\n'));
      cur = [];
    }
  }
  if (cur.some(l => l.trim())) chunks.push(cur.join('\n'));
  if (!chunks.length) return src;
  const { reals } = makeOpcodes(chunks.length + 1, chunks.length);
  const sv = v();
  let out = `local ${sv}=${reals[0].expr}\nwhile ${sv} do\n`;
  for (let i = 0; i < chunks.length; i++) {
    const next = i < chunks.length - 1 ? reals[i + 1].expr : 'false';
    out += (i === 0 ? `  if ${sv}==${reals[i].expr} then\n` : `  elseif ${sv}==${reals[i].expr} then\n`);
    out += chunks[i].split('\n').map(l => '    ' + l).join('\n') + '\n';
    out += `    ${sv}=${next}\n`;
  }
  out += `  else\n    ${sv}=false\n  end\nend\n`;
  return out;
}

// ---------- STRING POOL ----------
// FIX 2: Pre-populate special strings at fixed indices G(0)..G(6)
// so anti-tamper and VM can reference them via G(index) reliably.
const SPECIAL_STRINGS = [
  'GetService',   // G(0)
  'Players',      // G(1)
  'LocalPlayer',  // G(2)
  'Kick',         // G(3)
  'Kicked.',      // G(4)  – kick message
  'Instance',     // G(5)
  'DataModel',    // G(6)
];

function buildStringPool(code) {
  // Start pool with special strings so their indices are fixed
  const pool = [...SPECIAL_STRINGS];

  const SP = (s) => {
    let i = pool.indexOf(s);
    if (i === -1) { i = pool.length; pool.push(s); }
    return i;
  };

  // Scan user code for string literals and add to pool
  let i = 0;
  while (i < code.length) {
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let str = '';
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === '\\') {
          j++;
          if      (code[j] === 'n')  str += '\n';
          else if (code[j] === 't')  str += '\t';
          else if (code[j] === 'r')  str += '\r';
          else if (code[j] === '\\') str += '\\';
          else if (code[j] === '"')  str += '"';
          else if (code[j] === "'")  str += "'";
          else                       str += code[j];
        } else {
          str += code[j];
        }
        j++;
      }
      SP(str);
      i = j + 1;
    } else {
      i++;
    }
  }

  const vTbl = v();
  const tbl = `local ${vTbl}={\n  ${pool.map(s => toLuaEscape(s)).join(',\n  ')}\n}`;

  // G(si) returns an obfuscated access to vTbl[si+1]
  const G = (si) => {
    const a = ri(10000, 999999);
    return `${vTbl}[${Arith(si + 1)}]`;
  };

  return { tbl, vTbl, G, pool };
}

// ---------- JUNK GENERATORS ----------
function opTrue() {
  const x = v(), y = v();
  const F = [
    () => { const n = ri(1, 999);     return `(function() local ${x}=${Arith(n)} return ${x}*${x}>=(${Arith(0)}-${Arith(0)}) end)()`; },
    () => { const n = ri(2, 998)*2+1; return `(function() local ${x}=${Arith(n)} local ${y}=${x}%2 return (${y}*(${y}-(${Arith(1)}-${Arith(0)})))==(${Arith(0)}-${Arith(0)}) end)()`; },
  ];
  return F[ri(0, F.length - 1)]();
}
function opFalse() {
  const x = v();
  const F = [
    () => { const n = ri(1, 999); return `(function() local ${x}=${Arith(n)} return ${x}*${x}<(${Arith(0)}-${Arith(0)}) end)()`; },
    () => { const n = ri(1, 999); return `(function() local ${x}=${Arith(n)} return ${x}~=${x} end)()`; },
  ];
  return F[ri(0, F.length - 1)]();
}
function junk(n) {
  const L = [];
  for (let i = 0; i < n; i++) {
    const a = v(), b = v();
    L.push(`local ${a}=${Arith(ri(100, 9999))} local ${b}=${a}*(${Arith(1)})-(${Arith(ri(1, 99))})`);
  }
  return L.join(' ');
}
function junkTbl() {
  const t = v(), k = v(), u = v(), n1 = ri(100000, 9999999);
  return `local ${t}={[${Arith(ri(1, 9))}]=${Arith(ri(10, 999))};[${Arith(ri(1, 9))}]=${Arith(ri(10, 999))}} local ${k}=${Arith(n1)} local ${u}=${t}[${Arith(1)}] or ${k}-(${Arith(n1 - ri(1, 99))}) if ${opFalse()} then ${u}=${u}+1 end`;
}
function bigJunk(n) {
  const p = [];
  for (let i = 0; i < n; i++) p.push(junk(ri(3, 6)));
  for (let i = 0; i < Math.ceil(n / 2); i++) p.push(junkTbl());
  return p.join(' ');
}

// ---------- ANTI-TAMPER ----------
function buildAntiTamper(G) {
  return `local function _kick()
  pcall(function()
    local _s=game[${G(0)}](game,${G(1)})
    local _p=_s[${G(2)}]
    _p[${G(3)}](_p,${G(4)})
  end)
end`;
}

// ---------- VM / EXECUTOR ----------
// FIX 3: vTbl added as parameter so TBLCHK can iterate the table directly
function buildVM(vmOps, fakeOps, stXorKey, G, vTbl, tableChecksum, payloadChecksum) {
  const [OP_INIT, OP_TBLCHK, OP_PAYCHK, OP_RC4INIT, OP_RC4LOOP, OP_LOADSTR, OP_EXEC] = vmOps;
  const stExpr = (op) => { const s = (op.val ^ stXorKey) >>> 0; return Arith(s); };

  const vSt       = v();
  const vS        = v2(), vDecStr = v2(), vRun = v2(), vEr = v2(), vParam = v2(), vByte = v2();
  const vI        = v(),  vJ      = v(),  vK   = v(),  vSI  = v(), vSJ = v();
  // FIX 4: vTmp declared as separate var — will use "local ${vTmp}=" in Lua
  const vTmp      = v(),  vOut    = v2();
  const vTblConcat = v2(), vHash  = v(),  vExpTbl = v(), vExpPay = v(), vOk = v(), vLd = v2();

  const cases = [
    {
      op: OP_INIT, body: [
        `local _tok=typeof~=nil and typeof(game)==${G(5)}`,
        `local _cok=_tok and game.ClassName==${G(6)}`,
        `if not(_tok and _cok) then ${vSt}=false return end`,
        `_kick()`,
        `${vSt}=${stExpr(OP_TBLCHK)}`,
      ]
    },
    {
      op: OP_TBLCHK, body: [
        // FIX 3: was G(7) which gives a table element — now uses vTbl directly
        `local ${vTblConcat}=""`,
        `for ${vI}=1,#${vTbl} do ${vTblConcat}=${vTblConcat}..${vTbl}[${vI}] end`,
        `local ${vExpTbl}=${Arith(tableChecksum)}`,
        `local ${vHash}=${luaDjb2(vTblConcat)}`,
        `if ${vHash}~=${vExpTbl} then _kick() ${vSt}=false return end`,
        `${vSt}=${stExpr(OP_PAYCHK)}`,
      ]
    },
    {
      op: OP_PAYCHK, body: [
        `local ${vExpPay}=${Arith(payloadChecksum)}`,
        `local _ph=${luaDjb2(vParam)}`,
        `if _ph~=${vExpPay} then _kick() ${vSt}=false return end`,
        `${vSt}=${stExpr(OP_RC4INIT)}`,
      ]
    },
    {
      op: OP_RC4INIT, body: [
        `${vS}={}`,
        `for ${vI}=0,255 do ${vS}[${vI}]=${vI} end`,
        `local ${vJ}=0`,
        `local _kl=#${vByte}`,
        `for ${vI}=0,255 do`,
        `  ${vJ}=(${vJ}+${vS}[${vI}]+${vByte}:byte((${vI}%_kl)+1))%256`,
        `  ${vS}[${vI}],${vS}[${vJ}]=${vS}[${vJ}],${vS}[${vI}]`,
        `end`,
        `${vSt}=${stExpr(OP_RC4LOOP)}`,
      ]
    },
    {
      op: OP_RC4LOOP, body: [
        `local ${vSI}=0`,
        `local ${vSJ}=0`,
        `local ${vOut}={}`,
        `for ${vK}=1,#${vParam} do`,
        `  ${vSI}=(${vSI}+1)%256`,
        `  ${vSJ}=(${vSJ}+${vS}[${vSI}])%256`,
        `  ${vS}[${vSI}],${vS}[${vSJ}]=${vS}[${vSJ}],${vS}[${vSI}]`,
        // FIX 4: was "${vTmp}=..." — missing local declaration in Lua
        `  local ${vTmp}=${vS}[(${vS}[${vSI}]+${vS}[${vSJ}])%256]`,
        `  ${vOut}[${vK}]=string.char(bit32.bxor(${vParam}:byte(${vK}),${vTmp}))`,
        `end`,
        `${vDecStr}=table.concat(${vOut})`,
        `${vS}=nil`,
        `${vSt}=${stExpr(OP_LOADSTR)}`,
      ]
    },
    {
      op: OP_LOADSTR, body: [
        `local ${vLd}=loadstring`,
        `if type(${vLd})~="function" then _kick() ${vSt}=false return end`,
        `${vRun},${vEr}=${vLd}(${vDecStr})`,
        `${vDecStr}=nil`,
        `if not ${vRun} then _kick() ${vSt}=false return end`,
        `${vSt}=${stExpr(OP_EXEC)}`,
      ]
    },
    {
      op: OP_EXEC, body: [
        `local ${vOk}=pcall(${vRun})`,
        `if not ${vOk} then _kick() end`,
        `${vSt}=false`,
      ]
    },
  ];

  const allOps = [
    ...vmOps.map(o => ({ ...o, fake: false })),
    ...fakeOps.map(f => ({ ...f, fake: true })),
  ].sort((a, b) => a.val - b.val);

  const caseStatements = allOps.map((op, idx) => {
    const found = cases.find(c => c.op.val === op.val);
    const kw = idx === 0 ? 'if' : 'elseif';
    if (!found || op.fake) {
      // FIX 5: was "${vSt}=false" which kills the VM on fake opcodes.
      // Now just a no-op local so execution continues normally.
      const _d = v();
      return `    ${kw} _op==${Arith(op.val)} then\n      local ${_d}=${Arith(0)}`;
    }
    return `    ${kw} _op==${Arith(op.val)} then\n` + found.body.map(l => '      ' + l).join('\n');
  });

  return `local function _exec(${vParam},${vByte})
  local ${vRun},${vEr},${vS},${vDecStr}
  local _stXor=${Arith(stXorKey)}
  local ${vSt}=${stExpr(OP_INIT)}
  while ${vSt} do
    local _op=bit32.bxor(${vSt},_stXor)
${caseStatements.join('\n')}
    else
      ${vSt}=false
    end
  end
end`;
}

// ---------- MAIN OBFUSCATION ----------
function obfuscateV2(code, options = {}) {
  const cffCode = cffWrap(code);

  // FIX 2: vTbl now returned and passed to buildVM
  const { tbl, vTbl, G, pool } = buildStringPool(code);

  const tableChecksum  = djb2([...pool.join('')].map(c => c.charCodeAt(0)));

  const keyLen = ri(12, 20);
  const key    = [...randomBytes(keyLen)];
  const cipher = rc4([...cffCode].map(c => c.charCodeAt(0)), key);
  const payloadChecksum = djb2(cipher);

  const { reals: vmOps, fakes: fakeOps } = makeOpcodes(7, 4);
  const stXorKey  = ri(0x1000, 0xFFFF);
  const antiTamper = buildAntiTamper(G);

  // FIX 3: pass vTbl so buildVM can use it in the checksum loop
  const vm = buildVM(vmOps, fakeOps, stXorKey, G, vTbl, tableChecksum, payloadChecksum);

  // Key chunks
  const ksz    = Math.ceil(key.length / 3);
  const kChunks = [], kvars = [];
  for (let i = 0; i < key.length; i += ksz) {
    kChunks.push(key.slice(i, i + ksz));
    kvars.push(v2());
  }
  const kDecl     = kChunks.map((c, i) => `local ${kvars[i]}=${toLuaEscape(c.map(b => String.fromCharCode(b)).join(''))}`).join('\n');
  const vKey      = v2();
  const kAssemble = `local ${vKey}=${kvars.join('..')}`;

  // Payload chunks
  const psz     = Math.ceil(cipher.length / 4);
  const pChunks = [], pvars = [];
  for (let i = 0; i < cipher.length; i += psz) {
    pChunks.push(cipher.slice(i, i + psz));
    pvars.push(v2());
  }
  const pDecl     = pChunks.map((c, i) => `local ${pvars[i]}=${toLuaEscape(c.map(b => String.fromCharCode(b)).join(''))}`).join('\n');
  const vPay      = v2();
  const pAssemble = `local ${vPay}=${pvars.join('..')}`;

  return `-- [[ OBFUSCATED BY SOLI V7.0 (EXECUTOR) ]] --
${tbl}
${bigJunk(6)}
${antiTamper}
${bigJunk(4)}
${vm}
${bigJunk(5)}
${kDecl}
${kAssemble}
${bigJunk(4)}
${pDecl}
${pAssemble}
${bigJunk(3)}
_exec(${vPay},${vKey})`;
}

// ---------- EXPORT ----------
module.exports = { obfuscateV2 };
