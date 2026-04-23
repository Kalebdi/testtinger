'use strict';
const crypto = require('crypto');

// ─── Helpers ───────────────────────────
function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
const IDCHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
function v(pref='') { let n = pref; for (let i=0; i<ri(5,10); i++) n += IDCHARS[ri(0, IDCHARS.length-1)]; return n; }

// ─── Opaque Predicate Generator ────────
function opaqueTrue() {
  const a = ri(100,999), b = ri(100,999);
  // selalu true karena (a+b)² - a² - 2ab - b² = 0
  return `( (function() return (${a+b})*(${a+b})-${a}*${a}-2*${a}*${b}-${b}*${b} end)() == 0 )`;
}

function opaqueFalse() {
  const a = ri(100,999);
  // selalu false: (a+1) % 2 == a % 2
  return `( (function() return (${a}+1)%2==${a}%2 end)() )`;
}

// ─── Aritmetika Kompleks ───────────────
function complexExpr(val) {
  if (val < 0) return `(-${complexExpr(-val)})`;
  if (val === 0) return `(function() return 0 end)()`;
  if (val === 1) return `(function() return 1 end)()`;
  const t = ri(0, 7);
  switch(t) {
    case 0: { const a=ri(2,99); return `(${complexExpr(Math.floor(val/a))}*${a}+${complexExpr(val%a)})`; }
    case 1: { const a=ri(2,99); return `(${complexExpr(val+a)}-${complexExpr(a)})`; }
    case 2: { const b=ri(2,10); return `(${complexExpr(val*b)}/${complexExpr(b)})`; }
    case 3: { const a=ri(1,255); return `(function() return ${val+a}-${a} end)()`; }
    case 4: return `(math.floor(${val}))`;
    case 5: return `(select(2,false,${val}))`;
    case 6: return `((true and ${val}) or 0)`;
    default: return val.toString();
  }
}

// ─── String Encryption (XOR manual) ───
function encryptString(str) {
  const key = [...crypto.randomBytes(str.length)].map(b => (b & 0x7F) | 1);
  const enc = [...str].map((c,i) => c.charCodeAt(0) ^ key[i]);
  const vt = v('t'), vk = v('k'), vr = v('r'), vi = v('i'), vxor = v('xor');
  const outerVars = [vt, vk, vr, vi, vxor];
  const decodeFunc = `(function() local ${vt}={${enc.join(',')}} local ${vk}={${key.join(',')}} local function ${vxor}(a,b) local r=0 local m=1 while a>0 or b>0 do local aa=a%2 local bb=b%2 if aa~=bb then r=r+m end a=(a-aa)/2 b=(b-bb)/2 m=m*2 end return r end local ${vr}="" for ${vi}=1,#${vt} do ${vr}=${vr}..string.char(${vxor}(${vt}[${vi}],${vk}[${vi}])) end return ${vr} end)()`;
  return { code: decodeFunc, vars: outerVars };
}

// ─── Bytecode Builder (Polymorphic) ────
function buildBytecode(code) {
  // Simpan kode asli sebagai satu string terenkripsi
  const enc = encryptString(code);
  const dataVar = v('data');

  // Definisikan opcode palsu yang selalu berbeda setiap kali
  const OPS = {
    NOP:      ri(1,3),
    PUSH:     ri(4,6),
    EXEC:     ri(7,9),
    CHECK:    ri(10,12),
    DECRYPT:  ri(13,15),
    JUNK:     ri(16,18),
    PRED:     ri(19,21)
  };

  // Bangun bytecode utama + sampah
  let bc = [];
  // Decrypt & push ke stack
  bc.push([OPS.DECRYPT, dataVar]);           // DECRYPT dataVar -> push hasil ke stack
  bc.push([OPS.EXEC, 0]);                    // EXEC: loadstring(stack top)()

  // Tambahkan banyak junk + opaque predicates
  for (let i=0; i<ri(5,15); i++) {
    bc.push([OPS.JUNK, ri(1000,9999)]);
    bc.push([OPS.PRED, ri(0,1)]);            // predikat true/false
    bc.push([OPS.CHECK, ri(10000,99999)]);
  }

  // Kocok urutan (polymorphic) tapi pastikan DECRYPT dan EXEC tetap di awal
  const head = bc.slice(0,2);
  const tail = bc.slice(2).sort(() => Math.random() - 0.5);
  bc = head.concat(tail);

  // Tambahkan anti‑tamper: checksum bytecode yang dihitung saat runtime
  const checksumVar = v('csum');
  bc.unshift([OPS.CHECK, checksumVar]);      // akan diverifikasi di VM

  return { bc, OPS, dataVar, checksumVar, encFunc: enc.code, encVars: enc.vars };
}

// ─── VM Interpreter Generator ───────────
function generateVM(bcData, ops) {
  const ip = v('ip'), stack = v('stk'), sp = v('sp'), codeVar = v('code');
  const dataVar = bcData.dataVar;
  const checksumVar = bcData.checksumVar;

  // Fungsi XOR internal VM
  const xorFuncName = v('xor');
  const xorFunc = `local function ${xorFuncName}(a,b) local r=0 local m=1 while a>0 or b>0 do local aa=a%2 local bb=b%2 if aa~=bb then r=r+m end a=(a-aa)/2 b=(b-bb)/2 m=m*2 end return r end`;

  // Decoder string terenkripsi (sama seperti di encryptString, tapi pakai nama acak)
  const decFuncName = v('dec');
  const decFunc = `local function ${decFuncName}(t) local data=t[1]; local k1=t[2]; local k2=t[3]; local r=""; for i=#data,1,-1 do local v=data[i]; v=(v-k2)%256; v=${xorFuncName}(v,k1); r=r..string.char(v); end return r end`;

  // Anti‑tamper: checksum bytecode
  const computeChecksum = `
    local function compute_sum(tbl)
      local s = 0
      for i=1,#tbl do
        local ins = tbl[i]
        s = s + (ins[1] or 0) * 31 + (ins[2] or 0) * 17
      end
      return s % 65536
    end
    local expected_checksum = ${complexExpr(bcData.bc.reduce((acc,ins)=>acc+ins[0]*31+ins[1]*17,0) % 65536)}
    if compute_sum(${codeVar}) ~= expected_checksum then
      while true do end  -- freeze, anti-tamper
    end
  `;

  // Loop VM
  const vmLoop = `
    local ${ip} = 1
    local ${stack} = {}
    local ${sp} = 0
    while ${ip} <= #${codeVar} do
      local ins = ${codeVar}[${ip}]
      local op = ins[1]
      local arg = ins[2]
      ${ip} = ${ip} + 1

      -- opaque predicate untuk menyamarkan flow (selalu bypass)
      if ${opaqueTrue()} then
        -- do nothing
      end

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
        -- predikat untuk mengecoh, bisa digunakan untuk lompatan palsu
        if ${opaqueFalse()} then
          ${ip} = ${ip} + ri(1,5)  -- tidak pernah terjadi
        end
      elseif op == ${ops.CHECK} then
        -- tidak ada efek, hanya menyulitkan
      end
    end
  `;

  // Anti‑debug: cek environment mencurigakan
  const antiDebug = `
    if (getfenv and type(getfenv) == "function") then
      local env = getfenv()
      if env.debug or env.hook then
        while true do end
      end
    end
  `;

  return `
    ${xorFunc}
    ${decFunc}
    ${bcData.encFunc}  -- definisi data terenkripsi (string kode asli)
    local ${codeVar} = {${bcData.bc.map(ins => `{${ins[0]},${typeof ins[1]==='string' ? '"'+ins[1]+'"' : ins[1]}}`).join(',')}}
    ${computeChecksum}
    ${antiDebug}
    ${vmLoop}
  `;
}

// ─── Main Obfuscator ──────────────────
function obfuscate(code) {
  // Bungkus kode asli agar bisa dijalankan di environment aman
  const wrappedCode = `return (function() ${code} end)()`;

  const { bc, OPS, dataVar, checksumVar, encFunc, encVars } = buildBytecode(wrappedCode);
  const vmCode = generateVM({ bc, dataVar, checksumVar, encFunc, encVars }, OPS);

  // Polymorphic: duplikasi beberapa bagian (misal fungsi dekoder) untuk menambah variasi
  let final = vmCode;
  // Tambahkan kode sampah: fungsi-fungsi palsu, variabel sampah
  const junkCount = ri(10, 25);
  for (let i=0; i<junkCount; i++) {
    const name = v('j');
    final = `local ${name} = ${complexExpr(ri(100,999))}; ` + final;
  }
  const fakeFuncs = ri(5,15);
  for (let i=0; i<fakeFuncs; i++) {
    const name = v('fn');
    final = `local function ${name}(x) return x * ${ri(2,9)} end; ` + final;
  }

  // Obfuscate whitespace dan kompresi
  final = final.replace(/\s+/g, ' ');

  // Bungkus dalam closure untuk isolasi
  final = `return (function() ${final} end)()`;

  // Tambahkan header
  final = `--[[ obfuscated by soli ]] ${final}`;
  return final;
}

module.exports = { obfuscate };
