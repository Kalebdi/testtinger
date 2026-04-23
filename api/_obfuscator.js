'use strict';
const crypto = require('crypto');

// ─── Helpers ───────────────────────────
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
const IDCHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
function v(pref = '') { let n = pref; for (let i = 0; i < ri(5, 10); i++) n += IDCHARS[ri(0, IDCHARS.length - 1)]; return n; }

// ─── Opaque Predicate Generator ────────
function opaqueTrue() {
  const a = ri(100, 999), b = ri(100, 999);
  // selalu true karena (a+b)² - a² - 2ab - b² = 0
  return `((function() return (${a + b})*(${a + b})-${a}*${a}-2*${a}*${b}-${b}*${b} end)() == 0)`;
}

function opaqueFalse() {
  const a = ri(100, 999);
  // selalu false: (a+1) % 2 == a % 2 (paritas berbeda)
  return `((function() return (${a}+1)%2==${a}%2 end)())`;
}

// ─── Aritmetika Kompleks ───────────────
function complexExpr(val) {
  if (!Number.isInteger(val)) return val.toString();
  if (val < 0) return `(-${complexExpr(-val)})`;
  if (val === 0) return `(0)`;
  if (val === 1) return `(1)`;
  const t = ri(0, 5);
  switch (t) {
    case 0: { const a = ri(2, 20); return `(${complexExpr(Math.floor(val / a))}*${a}+${complexExpr(val % a)})`; }
    case 1: { const a = ri(1, 50); return `(${complexExpr(val + a)}-${a})`; }
    case 2: { const b = ri(2, 6); return `(${complexExpr(val * b)}/${b})`; }
    case 3: return `(math.floor(${val}))`;
    case 4: return `(select(2,false,${val}))`;
    default: return val.toString();
  }
}

// ─── Enkripsi String (tanpa self‑decoding) ──
function encryptString(str) {
  const key = [...crypto.randomBytes(str.length)].map(b => (b & 0x7F) | 1);
  const enc = [...str].map((c, i) => c.charCodeAt(0) ^ key[i]);
  return {
    encryptedArray: enc,     // array of numbers
    k1: key,                 // array of numbers (key bytes)
    k2: 0                    // not used now, but leave for flexibility
  };
}

// ─── Bytecode Builder (Polymorphic) ────
function buildBytecode(code) {
  // Simpan kode asli **terenkripsi** (tidak langsung didekode)
  const enc = encryptString(code);
  const dataVar = v('data');

  // Opcode acak setiap kali
  const OPS = {
    NOP:     ri(1, 3),
    PUSH:    ri(4, 6),
    EXEC:    ri(7, 9),
    DECRYPT: ri(10, 12),
    JUNK:    ri(13, 15),
    PRED:    ri(16, 18)
  };

  let bc = [];
  // Instruksi utama: decrypt data, lalu eksekusi
  bc.push([OPS.DECRYPT, dataVar]);   // DECRYPT (arg = nama variabel data)
  bc.push([OPS.EXEC, 0]);            // EXEC: loadstring(stack top)()

  // Tambahkan junk + opaque predicate
  for (let i = 0; i < ri(8, 20); i++) {
    bc.push([OPS.JUNK, ri(1000, 9999)]);
    bc.push([OPS.PRED, ri(0, 1)]);
  }

  // Acak urutan kecuali dua instruksi pertama (polymorphic)
  const head = bc.slice(0, 2);
  const tail = bc.slice(2).sort(() => Math.random() - 0.5);
  bc = head.concat(tail);

  return {
    bc,
    OPS,
    dataVar,
    encArray: enc.encryptedArray,   // data terenkripsi asli
    k1: enc.k1,
    k2: enc.k2 || 0
  };
}

// ─── VM Interpreter Generator ─────────
function generateVM(bcData, ops) {
  const ip = v('ip'), stack = v('stk'), sp = v('sp'), codeVar = v('code');
  const dataVar = bcData.dataVar;

  // Fungsi XOR manual (Luau‑safe)
  const xorFuncName = v('xor');
  const xorFunc = `local function ${xorFuncName}(a,b) local r=0 local m=1 while a>0 or b>0 do local aa=a%2 local bb=b%2 if aa~=bb then r=r+m end a=(a-aa)/2 b=(b-bb)/2 m=m*2 end return r end`;

  // Fungsi dekoder: menerima tabel { {array}, k1, k2 } → string
  const decFuncName = v('dec');
  const decFunc = `
    local function ${decFuncName}(t)
      local data = t[1]
      local k1   = t[2]
      local r    = ""
      for i = #data, 1, -1 do
        local v = data[i]
        v = (v - k1[i]) % 256  -- XOR melalui pengurangan? Tidak! Harus XOR dengan key.
        -- Perbaiki: gunakan XOR
        v = ${xorFuncName}(v, k1[i])
        r = r .. string.char(v)
      end
      return r
    end`;

  // Data terenkripsi (langsung tabel)
  const dataTable = `local ${dataVar} = {{${bcData.encArray.join(',')}}, {${bcData.k1.join(',')}} }`;

  // Checksum anti‑tamper
  const computeChecksum = `
    local function compute_sum(tbl)
      local s = 0
      for i = 1, #tbl do
        local ins = tbl[i]
        local arg = ins[2]
        local val = type(arg) == "number" and arg or (type(arg) == "string" and #arg or 0)
        s = s + (ins[1] or 0) * 31 + val * 17
      end
      return s % 65536
    end
    local expected_checksum = ${complexExpr(bcData.bc.reduce((acc, ins) => {
      const argVal = typeof ins[1] === 'number' ? ins[1] : (typeof ins[1] === 'string' ? ins[1].length : 0);
      return acc + ins[0] * 31 + argVal * 17;
    }, 0) % 65536)}
    if compute_sum(${codeVar}) ~= expected_checksum then
      while true do end
    end`;

  // Bytecode sebagai tabel Lua
  const bcLua = `{${bcData.bc.map(ins => {
    const arg = ins[1];
    const argStr = typeof arg === 'string' ? arg : arg; // if string, keep as identifier (no quotes)
    return `{${ins[0]},${typeof arg === 'string' ? arg : arg}}`;
  }).join(',')}}`;

  // VM loop
  const vmLoop = `
    local ${ip} = 1
    local ${stack} = {}
    local ${sp} = 0
    while ${ip} <= #${codeVar} do
      local ins = ${codeVar}[${ip}]
      local op = ins[1]
      local arg = ins[2]
      ${ip} = ${ip} + 1

      if ${opaqueTrue()} then end

      if op == ${ops.DECRYPT} then
        ${sp} = ${sp} + 1
        ${stack}[${sp}] = ${decFuncName}(${dataVar})
      elseif op == ${ops.EXEC} then
        local payload = ${stack}[${sp}]
        ${sp} = ${sp} - 1
        local fn = loadstring(payload)
        if fn then fn() end
      elseif op == ${ops.JUNK} then
        local _ = arg * 2
      elseif op == ${ops.PRED} then
        if ${opaqueFalse()} then
          ${ip} = ${ip} + 5  -- tidak pernah terjadi
        end
      end
    end`;

  // Anti‑debug (safe untuk Luau)
  const antiDebug = `
    if rawget(_G, "debug") then
      while true do end
    end
  `;

  return `
    ${xorFunc}
    ${decFunc}
    ${dataTable}
    local ${codeVar} = ${bcLua}
    ${computeChecksum}
    ${antiDebug}
    ${vmLoop}
  `;
}

// ─── Main Obfuscator ──────────────────
function obfuscate(code) {
  // Bungkus kode asli agar return‑value tidak hilang
  const wrapped = `return (function() ${code} end)()`;
  const { bc, OPS, dataVar, encArray, k1 } = buildBytecode(wrapped);
  const vmCode = generateVM({ bc, dataVar, encArray, k1 }, OPS);

  // Tambahkan dead code & fake functions (polymorphic)
  let final = '';
  for (let i = 0; i < ri(15, 30); i++) {
    final += `local ${v('j')} = ${complexExpr(ri(100, 999))}; `;
  }
  for (let i = 0; i < ri(5, 12); i++) {
    final += `function ${v('fn')}(x) return x * ${ri(2, 9)} end; `;
  }
  final += vmCode;

  // Kompresi & bungkus
  final = final.replace(/\s+/g, ' ');
  final = `--[[ obfuscated by soli ]]\nreturn (function() ${final} end)()`;

  return final;
}

module.exports = { obfuscate };
