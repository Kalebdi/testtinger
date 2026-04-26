'use strict';
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
//  LURAPH-STYLE LUAU OBFUSCATOR — HEAVY JUNK EDITION
// ═══════════════════════════════════════════════════════════════════════════════

function ri(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — IL VARIABLE NAMING
// ══════════════════════════════════════════════════════════════════════════════

const _usedNames = new Set();

function ilName(minLen = 4, maxLen = 8) {
  let name, attempts = 0;
  do {
    const len = ri(minLen, maxLen);
    name = '';
    name += ri(0,1) ? 'I' : 'l';
    for (let i = 1; i < len; i++) {
      const r = ri(0, 9);
      if (r < 4) name += 'I';
      else if (r < 8) name += 'l';
      else name += '1';
    }
    attempts++;
    if (attempts > 500) name += '_' + _usedNames.size;
  } while (_usedNames.has(name) || /^\d/.test(name));
  _usedNames.add(name);
  return name;
}

function ilLong() { return ilName(8, 14); }
function ilMed()  { return ilName(5, 8); }
function ilShort(){ return ilName(3, 5); }

function resetNames() {
  _usedNames.clear();
  ['and','break','do','else','elseif','end','false','for','function',
   'if','in','local','nil','not','or','repeat','return','then','true',
   'until','while','I','l','Il','lI','II','ll'].forEach(n => _usedNames.add(n));
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ARITHMETIC OBFUSCATION
// ══════════════════════════════════════════════════════════════════════════════

function L(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
  if (n < -2147483648 || n > 2147483647) return String(n);

  const a = ri(1, 999);
  const b = ri(1, 99);

  if (n < 0) {
    switch (ri(0,2)) {
      case 0: return `(${n+a} - ${a})`;
      case 1: return `(${a} - ${a-n})`;
      case 2: { const k=ri(1,0xFF); return `bit32.bxor(${(n>>>0)^k}, ${k})`; }
    }
  }

  switch (ri(0, 13)) {
    case 0:  return String(n);
    case 1:  return `(${n+a} - ${a})`;
    case 2:  return `(${a} - ${a-n})`;
    case 3:  return `(${n+a} + ${-a})`;
    case 4:  return `(-${-n+a} + ${a})`;
    case 5:  { const k=ri(1,0xFF); return `bit32.bxor(${n^k}, ${k})`; }
    case 6:  return n>=0&&n<=50 ? `(#("${'_'.repeat(n)}"))` : String(n);
    case 7:  return `(${n+a} -${a})`;
    case 8:  return `(${n+a+b} - ${a+b})`;
    case 9:  return `(select(1, ${n+a} - ${a}))`;
    case 10: return `(true and ${n+a} - ${a} or 0)`;
    case 11: return `math.floor(${n+a} - ${a})`;
    case 12: return `(function() return ${n+a} - ${a} end)()`;
    case 13: return `bit32.band(${n+a} - ${a}, 4294967295)`;
    default: return String(n);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — LEXER
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
      let n='0x';i+=2;while(i<len&&/[0-9a-fA-F_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      tokens.push({t:'NUM',v:Number(n)});continue;
    }
    if(src[i]==='0'&&i+1<len&&(src[i+1]==='b'||src[i+1]==='B')){
      let n='';i+=2;while(i<len&&/[01_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      tokens.push({t:'NUM',v:parseInt(n||'0',2)});continue;
    }
    if(/[0-9]/.test(src[i])||(src[i]==='.'&&i+1<len&&/[0-9]/.test(src[i+1]))){
      let n='';
      while(i<len&&/[0-9_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
      if(i<len&&src[i]==='.'&&(i+1>=len||src[i+1]!=='.')){
        n+=src[i++];while(i<len&&/[0-9_]/.test(src[i])){if(src[i]!=='_')n+=src[i];i++;}
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
// SECTION 4 — STRING ENCODING + ESCAPE
// ══════════════════════════════════════════════════════════════════════════════

function encodeStringBytes(s, xorKey) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) bytes.push((s.charCodeAt(i) ^ xorKey) & 0xFF);
  return bytes;
}

function luaEsc(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if(c===92)r+='\\\\';else if(c===34)r+='\\"';
    else if(c===10)r+='\\n';else if(c===13)r+='\\r';
    else if(c===0)r+='\\0';else if(c===9)r+='\\t';
    else if(c<32||c>126)r+='\\'+String(c).padStart(3,'0');
    else r+=s[i];
  }
  return r;
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
  'collectgarbage','dofile','load','shared','newproxy',
  'setfenv','getfenv','Random',
]);

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — HEAVY JUNK CODE ENGINE (40+ patterns)
// ══════════════════════════════════════════════════════════════════════════════

function opaqueTrue() {
  const forms = [
    ()=>`(${ri(100,999)} > ${ri(1,99)})`,
    ()=>`(type("") == "string")`,
    ()=>`(not false)`,
    ()=>`(${ri(1,50)} ~= ${ri(51,100)})`,
    ()=>`(true)`,
    ()=>`(not not true)`,
    ()=>`(1 == 1)`,
    ()=>`("" == "")`,
    ()=>`(type(nil) == "nil")`,
    ()=>`(type(0) == "number")`,
    ()=>`(${ri(1,99)} < ${ri(100,999)})`,
    ()=>`(#{} == 0)`,
    ()=>`(select(1, true))`,
    ()=>`(not (${ri(100,999)} < ${ri(1,50)}))`,
    ()=>`(type({}) == "table")`,
    ()=>`(tostring(${ri(1,9)}) ~= "")`,
  ];
  return forms[ri(0, forms.length-1)]();
}

function opaqueFalse() {
  const forms = [
    ()=>`(${ri(100,999)} < ${ri(1,99)})`,
    ()=>`(false)`,
    ()=>`(not true)`,
    ()=>`(nil)`,
    ()=>`(${ri(1,50)} == ${ri(51,100)})`,
    ()=>`(type("") == "number")`,
    ()=>`(type(0) == "string")`,
    ()=>`(1 == 0)`,
    ()=>`("a" == "b")`,
    ()=>`(#{1} == 0)`,
  ];
  return forms[ri(0, forms.length-1)]();
}

function randomStr(minL=3, maxL=10) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  const len = ri(minL, maxL);
  for (let i = 0; i < len; i++) s += chars[ri(0, chars.length-1)];
  return s;
}

function makeJunk(count) {
  const lines = [];

  const generators = [
    // 0: while true break (luraph signature)
    () => {
      const v1=ilMed(),v2=ilMed();
      return `while ${opaqueTrue()} do local ${v1} = ${L(ri(1,999))}; local ${v2} = ${v1} + ${L(0)}; break end`;
    },
    // 1: dead if-then
    () => {
      const v1=ilMed(),v2=ilMed();
      return `if ${opaqueFalse()} then local ${v1} = ${L(ri(1,999))}; ${v1} = ${v1} + ${L(ri(1,50))}; local ${v2} = ${v1} * ${L(2)} end`;
    },
    // 2: do-end block
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `do local ${v1} = ${L(ri(1,500))}; local ${v2} = ${v1}; local ${v3} = ${v2} - ${v1} end`;
    },
    // 3: table create + nil
    () => {
      const v1=ilMed();
      return `local ${v1} = {}; ${v1} = nil`;
    },
    // 4: bit32 xor chain
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = bit32.bxor(${L(ri(1,255))}, ${L(ri(1,255))}); local ${v2} = bit32.bxor(${v1}, ${L(ri(1,255))}); ${v1} = nil; ${v2} = nil`;
    },
    // 5: opaque ternary
    () => {
      const v1=ilMed();
      return `local ${v1} = ${opaqueTrue()} and ${L(ri(1,999))} or ${L(ri(1,999))}`;
    },
    // 6: select junk
    () => {
      const v1=ilMed();
      return `local ${v1} = select(${L(1)}, ${L(ri(1,100))}, ${L(ri(1,100))}, ${L(ri(1,100))})`;
    },
    // 7: string length (# on literal only)
    () => {
      const v1=ilMed();
      return `local ${v1} = #("${'_'.repeat(ri(1,20))}") + ${L(0)}`;
    },
    // 8: while true with opaque exit
    () => {
      const v1=ilMed();
      return `while true do if ${opaqueTrue()} then break end; local ${v1} = ${L(ri(1,999))} end`;
    },
    // 9: IIFE (immediately invoked function)
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = (function() local ${v2} = ${L(ri(1,500))}; return ${v2} end)()`;
    },
    // 10: math.floor
    () => {
      const v1=ilMed();
      return `local ${v1} = math.floor(${L(ri(1,999))} / ${L(ri(1,10)+1)})`;
    },
    // 11: repeat-until
    () => {
      const v1=ilMed();
      return `repeat local ${v1} = ${L(ri(1,100))} until ${opaqueTrue()}`;
    },
    // 12: nested while-break with computation
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `while ${opaqueTrue()} do local ${v1} = ${L(ri(1,99))}; local ${v2} = ${v1} * ${L(ri(2,10))}; local ${v3} = ${v2} - ${v1}; break end`;
    },
    // 13: pcall wrapper junk
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1}, ${v2} = pcall(function() return ${L(ri(1,999))} end)`;
    },
    // 14: coroutine.wrap junk
    () => {
      const v1=ilMed();
      return `local ${v1} = coroutine.wrap(function() return ${L(ri(1,100))} end); ${v1} = nil`;
    },
    // 15: multi-assignment
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `local ${v1}, ${v2}, ${v3} = ${L(ri(1,99))}, ${L(ri(100,999))}, ${L(ri(1,50))}; ${v1} = nil; ${v2} = nil; ${v3} = nil`;
    },
    // 16: table.concat on empty
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = {}; local ${v2} = table.concat(${v1}); ${v1} = nil; ${v2} = nil`;
    },
    // 17: nested if dead
    () => {
      const v1=ilMed(),v2=ilMed();
      return `if ${opaqueFalse()} then if ${opaqueTrue()} then local ${v1} = ${L(ri(1,999))} else local ${v2} = ${L(ri(1,999))} end end`;
    },
    // 18: for loop zero iterations
    () => {
      const v1=ilMed(),v2=ilMed();
      return `for ${v1} = 1, 0 do local ${v2} = ${v1} + ${L(ri(1,50))} end`;
    },
    // 19: for loop that breaks immediately
    () => {
      const v1=ilMed(),v2=ilMed();
      return `for ${v1} = 1, ${L(ri(1,5))} do local ${v2} = ${v1}; break end`;
    },
    // 20: string.rep junk
    () => {
      const v1=ilMed();
      return `local ${v1} = string.rep("${randomStr(1,3)}", ${L(ri(1,5))}); ${v1} = nil`;
    },
    // 21: math.random simulation
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = math.floor(${L(ri(1,1000))} / ${L(ri(1,10)+1)}); local ${v2} = ${v1} * ${L(ri(1,5))}; ${v1} = nil; ${v2} = nil`;
    },
    // 22: tostring chain
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = tostring(${L(ri(1,999))}); local ${v2} = tostring(${v1}); ${v1} = nil; ${v2} = nil`;
    },
    // 23: type check chain
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `local ${v1} = type(${L(ri(1,99))}); local ${v2} = type("${randomStr(2,5)}"); local ${v3} = type({}); ${v1} = nil; ${v2} = nil; ${v3} = nil`;
    },
    // 24: table with values then nil
    () => {
      const v1=ilMed();
      return `local ${v1} = {${L(ri(1,99))}, ${L(ri(100,999))}, ${L(ri(1,50))}, "${randomStr(3,8)}"}; ${v1} = nil`;
    },
    // 25: nested IIFE
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = (function() return (function() local ${v2} = ${L(ri(1,999))}; return ${v2} + ${L(0)} end)() end)()`;
    },
    // 26: boolean flip chain
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `local ${v1} = true; local ${v2} = not ${v1}; local ${v3} = not ${v2}; ${v1} = nil; ${v2} = nil; ${v3} = nil`;
    },
    // 27: while-true nested break
    () => {
      const v1=ilMed(),v2=ilMed();
      return `while true do local ${v1} = ${L(ri(1,500))}; while true do local ${v2} = ${v1} + ${L(ri(1,50))}; break end; break end`;
    },
    // 28: do-end with bit32 operations
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `do local ${v1} = ${L(ri(1,255))}; local ${v2} = bit32.band(${v1}, ${L(0xFF)}); local ${v3} = bit32.bor(${v2}, ${L(0)}); end`;
    },
    // 29: multiple dead conditions
    () => {
      const v1=ilMed();
      return `if ${opaqueFalse()} then local ${v1}=${L(1)} elseif ${opaqueFalse()} then local ${v1}=${L(2)} elseif ${opaqueFalse()} then local ${v1}=${L(3)} end`;
    },
    // 30: string.byte junk
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = string.byte("${randomStr(1,1)}", 1); local ${v2} = ${v1} + ${L(0)}; ${v1} = nil; ${v2} = nil`;
    },
    // 31: empty function definition + nil
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local function ${v1}(${v2}) return ${v2} end; ${v1} = nil`;
    },
    // 32: math.abs + math.max
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = math.abs(${L(ri(-500,-1))}); local ${v2} = math.max(${v1}, ${L(0)}); ${v1} = nil; ${v2} = nil`;
    },
    // 33: deeply nested do-end
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `do do do local ${v1}=${L(ri(1,99))}; local ${v2}=${v1}+${L(ri(1,10))}; local ${v3}=${v2}-${v1} end end end`;
    },
    // 34: table.insert + table.remove
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = {}; table.insert(${v1}, ${L(ri(1,100))}); table.insert(${v1}, ${L(ri(1,100))}); local ${v2} = table.remove(${v1}); ${v1} = nil`;
    },
    // 35: string.sub junk
    () => {
      const v1=ilMed(),str=randomStr(5,10);
      return `local ${v1} = string.sub("${str}", ${L(1)}, ${L(ri(1,3))}); ${v1} = nil`;
    },
    // 36: xpcall junk
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1}, ${v2} = xpcall(function() return ${L(ri(1,500))} end, function() end); ${v1} = nil; ${v2} = nil`;
    },
    // 37: while with counter that breaks fast
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1} = 0; while ${v1} < ${L(1)} do ${v1} = ${v1} + 1; local ${v2} = ${v1} end`;
    },
    // 38: math operations chain
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed(),v4=ilMed();
      return `local ${v1}=${L(ri(1,100))}; local ${v2}=${v1}*${L(ri(2,5))}; local ${v3}=${v2}-${v1}; local ${v4}=math.floor(${v3}/${L(ri(1,3)+1)}); ${v1}=nil; ${v2}=nil; ${v3}=nil; ${v4}=nil`;
    },
    // 39: bit32 rotation junk
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1}=bit32.lshift(${L(ri(1,255))}, ${L(ri(1,8))}); local ${v2}=bit32.rshift(${v1}, ${L(ri(1,8))}); ${v1}=nil; ${v2}=nil`;
    },
    // 40: pcall with error catch
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1},${v2}=pcall(function() local ${ilShort()}=${L(ri(1,99))}; return ${ilShort()}+${L(0)} end); ${v1}=nil; ${v2}=nil`;
    },
    // 41: string.format junk
    () => {
      const v1=ilMed();
      return `local ${v1}=string.format("%d", ${L(ri(1,999))}); ${v1}=nil`;
    },
    // 42: multiple while-break stacked
    () => {
      const v1=ilMed(),v2=ilMed();
      return `while true do local ${v1}=${L(ri(1,100))}; break end; while true do local ${v2}=${L(ri(1,100))}; break end`;
    },
    // 43: repeat with complex condition
    () => {
      const v1=ilMed(),v2=ilMed();
      return `local ${v1}=${L(0)}; repeat ${v1}=${v1}+${L(1)}; local ${v2}=${v1} until ${v1}>=${L(1)}`;
    },
    // 44: generic for with ipairs on empty
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `for ${v1},${v2} in ipairs({}) do local ${v3}=${v2} end`;
    },
    // 45: table.unpack junk
    () => {
      const v1=ilMed(),v2=ilMed(),v3=ilMed();
      return `local ${v1}={${L(ri(1,10))},${L(ri(11,20))},${L(ri(21,30))}}; local ${v2},${v3}=(unpack or table.unpack)(${v1}); ${v1}=nil; ${v2}=nil; ${v3}=nil`;
    },
  ];

  for (let i = 0; i < count; i++) {
    const gen = generators[ri(0, generators.length - 1)];
    try { lines.push(gen()); } catch(e) { lines.push(`local ${ilMed()} = ${L(ri(1,999))}`); }
  }

  // Shuffle
  for (let i = lines.length-1; i > 0; i--) {
    const j = ri(0, i);
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return lines.join('; ');
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — ANTI-TAMPER (xorHidden)
// ══════════════════════════════════════════════════════════════════════════════

function xorHidden(s) {
  const keyBytes = [...crypto.randomBytes(s.length)].map(b=>(b&0x7F)|1);
  const encBytes = [];
  for (let i=0;i<s.length;i++) encBytes.push(s.charCodeAt(i)^keyBytes[i]);
  const vt=ilShort(),vk=ilShort(),vo=ilShort(),vi=ilShort();
  return (
    `(function() `+
    `local ${vt}={${encBytes.join(',')}}; `+
    `local ${vk}={${keyBytes.join(',')}}; `+
    `local ${vo}={}; `+
    `for ${vi}=1,#${vt} do `+
    `${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) `+
    `end; `+
    `return table.concat(${vo}) `+
    `end)()`
  );
}

function generateAntiTamper() {
  const xInst=xorHidden('Instance'), xDM=xorHidden('DataModel');
  const xRf=xorHidden('readfile'), xWf=xorHidden('writefile');
  const xSyn=xorHidden('syn'), xFlux=xorHidden('fluxus');
  const xDex=xorHidden('deltaexecute');

  const vEi=ilShort(),vEd=ilShort(),vGenv=ilShort(),vExec=ilShort();
  const vC1=ilShort(),vC2=ilShort();

  return (
    `local ${vEi}=${xInst}; `+
    `local ${vEd}=${xDM}; `+
    `if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd})then `+
    `local ${vC1}=nil; ${vC1}(); return `+
    `end; `+
    `${vEi}=nil; ${vEd}=nil; `+
    `local ${vGenv}=(getgenv and getgenv())or _G; `+
    `local ${vExec}=`+
    `rawget(${vGenv},${xRf})or `+
    `rawget(${vGenv},${xWf})or `+
    `rawget(${vGenv},${xSyn})or `+
    `rawget(${vGenv},${xFlux})or `+
    `rawget(${vGenv},${xDex})or `+
    `rawget(_G,${xRf})or `+
    `rawget(_G,${xWf}); `+
    `if ${vExec}==nil then `+
    `local ${vC2}=nil; ${vC2}(); return `+
    `end; `+
    `${vGenv}=nil; ${vExec}=nil`
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — TOKEN SPACING
// ══════════════════════════════════════════════════════════════════════════════

function needsSpace(prev, curr) {
  if (!prev || !curr) return true;
  const aEnd=/[a-zA-Z0-9_]$/.test(prev);
  const aStart=/^[a-zA-Z0-9_]/.test(curr);
  if (aEnd && aStart) return true;
  if (prev.endsWith('-')&&curr.startsWith('-')) return true;
  if (prev.endsWith('.')&&curr.startsWith('.')) return true;
  if (/[0-9]$/.test(prev)&&curr.startsWith('.')) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — MAIN OBFUSCATOR
// ══════════════════════════════════════════════════════════════════════════════

function obfuscate(code) {
  resetNames();

  const tokens = lex(code);

  // ── Build constant pool ─────────────────────────────────────────────────
  const pool = [];
  const poolMap = new Map();
  function addPool(val, type) {
    const key = type+':'+String(val);
    if (!poolMap.has(key)) { poolMap.set(key, pool.length); pool.push({val, type}); }
    return poolMap.get(key);
  }

  ['string','number','boolean','table','function','nil',
   'type','tostring','tonumber','pairs','ipairs','select','pcall',
   'rawget','rawset','next','error','assert','unpack',
   'math','bit32','game','workspace','script',
   'Instance','DataModel','Players','LocalPlayer','GetService',
  ].forEach(s=>addPool(s,'str'));

  for (const tok of tokens) {
    if (tok.t==='STR') addPool(tok.v,'str');
    if (tok.t==='NUM') addPool(tok.v,'num');
  }

  const xorKey = ri(1, 254);

  // Encode pool entries
  const encEntries = pool.map(e => {
    if (e.type==='str') {
      if (e.val==='') return '""';
      return `{${encodeStringBytes(e.val,xorKey).join(',')}}`;
    }
    return L(e.val);
  });

  // ── Name everything ─────────────────────────────────────────────────────
  const N = {
    env:      ilLong(), strChar:  ilLong(), strByte:  ilLong(),
    strSub:   ilLong(), strLen:   ilLong(), tblConcat:ilLong(),
    tblInsert:ilLong(), select:   ilLong(), type:     ilLong(),
    tostring: ilLong(), tonumber: ilLong(), pcall:    ilLong(),
    bit32Bxor:ilLong(), bit32Band:ilLong(), bit32Bor: ilLong(),
    mathFloor:ilLong(), mathAbs:  ilLong(),
    pool:     ilLong(), getter:   ilLong(),
    decI:     ilShort(), decV:    ilShort(), decB:    ilShort(), decR: ilShort(),
    mainFn:   ilLong(), outerFn:  ilLong(), innerFn:  ilLong(),
    guardFn:  ilLong(),
  };
  const getterParam = ilShort();

  // ── Environment capture ─────────────────────────────────────────────────
  const envCapture = [
    `local ${N.env}=getfenv and getfenv()or _ENV or _G`,
    `local ${N.strChar}=string.char`,
    `local ${N.strByte}=string.byte`,
    `local ${N.strSub}=string.sub`,
    `local ${N.strLen}=string.len`,
    `local ${N.tblConcat}=table.concat`,
    `local ${N.tblInsert}=table.insert`,
    `local ${N.select}=select`,
    `local ${N.type}=type`,
    `local ${N.tostring}=tostring`,
    `local ${N.tonumber}=tonumber`,
    `local ${N.pcall}=pcall`,
    `local ${N.bit32Bxor}=bit32.bxor`,
    `local ${N.bit32Band}=bit32.band`,
    `local ${N.bit32Bor}=bit32.bor`,
    `local ${N.mathFloor}=math.floor`,
    `local ${N.mathAbs}=math.abs`,
  ].join('; ');

  // ── Pool + decoder ──────────────────────────────────────────────────────
  const poolDecl = `local ${N.pool}={${encEntries.join(',')}}`;
  const decoder = (
    `do for ${N.decI}=1,#${N.pool} do `+
    `local ${N.decV}=${N.pool}[${N.decI}]; `+
    `if ${N.type}(${N.decV})=="table" then `+
    `local ${N.decR}={}; `+
    `for ${N.decB}=1,#${N.decV} do `+
    `${N.decR}[${N.decB}]=${N.strChar}(${N.bit32Bxor}(${N.decV}[${N.decB}],${L(xorKey)})) `+
    `end; `+
    `${N.pool}[${N.decI}]=${N.tblConcat}(${N.decR}) `+
    `end end end`
  );
  const getter = `local function ${N.getter}(${getterParam}) return ${N.pool}[${getterParam}] end`;

  // ── Integrity guard function ────────────────────────────────────────────
  const guardBody = (() => {
    const v1=ilMed(),v2=ilMed(),v3=ilMed(),v4=ilMed();
    return (
      `local function ${N.guardFn}() `+
      `local ${v1}=${L(5381)}; `+
      `for ${v2}=1,#${N.pool} do `+
      `local ${v3}=${N.pool}[${v2}]; `+
      `if ${N.type}(${v3})=="string" then `+
      `for ${v4}=1,#${v3} do `+
      `${v1}=${N.bit32Bxor}(${v1}*${L(33)},${N.strByte}(${v3},${v4})) `+
      `end end end; `+
      `return ${v1} `+
      `end`
    );
  })();

  // ── Process body tokens ─────────────────────────────────────────────────
  const idMap = new Map();
  function renameId(name) {
    if (GLOBAL_IDS.has(name)) return name;
    if (!idMap.has(name)) idMap.set(name, ilName(5,10));
    return idMap.get(name);
  }

  function constRef(val, type) {
    const key=type+':'+String(val);
    const idx=poolMap.get(key);
    if (idx===undefined) {
      if (type==='str') return `"${luaEsc(val)}"`;
      return String(val);
    }
    return `${N.getter}(${L(idx+1)})`;
  }

  const bodyParts = [];
  for (const tok of tokens) {
    if (tok.t==='EOF') continue;
    switch (tok.t) {
      case 'ID':  bodyParts.push(renameId(tok.v)); break;
      case 'KW':  bodyParts.push(tok.v); break;
      case 'STR': bodyParts.push(constRef(tok.v,'str')); break;
      case 'NUM': {
        const n=tok.v;
        if (Number.isInteger(n)&&n>=-2147483648&&n<=2147483647) {
          if (ri(0,2)===0 && poolMap.has('num:'+n)) bodyParts.push(constRef(n,'num'));
          else bodyParts.push(L(n));
        } else bodyParts.push(String(n));
        break;
      }
      case 'OP': bodyParts.push(tok.v); break;
      default:   bodyParts.push(tok.v||''); break;
    }
  }

  // Space
  const sp = [];
  for (let i=0;i<bodyParts.length;i++){
    if(i>0&&needsSpace(bodyParts[i-1],bodyParts[i]))sp.push(' ');
    sp.push(bodyParts[i]);
  }
  const bodyStr = sp.join('');

  // ── Anti-tamper ─────────────────────────────────────────────────────────
  const antiTamper = generateAntiTamper();

  // ── HEAVY JUNK ──────────────────────────────────────────────────────────
  const junkTop     = makeJunk(ri(10, 18));
  const junkPreBody = makeJunk(ri(8, 15));
  const junkMid     = makeJunk(ri(6, 12));
  const junkPost    = makeJunk(ri(8, 15));
  const junkBottom  = makeJunk(ri(10, 18));
  const junkTail    = makeJunk(ri(5, 10));

  // ── Closure params ──────────────────────────────────────────────────────
  const closureParams = [];
  for (let i=0;i<ri(10,20);i++) closureParams.push(ilName(3,6));

  // ── Watermark ───────────────────────────────────────────────────────────
  const wid = crypto.randomBytes(8).toString('hex').toUpperCase();
  const ver = `${ri(6,4)}.${ri(0,1)}.${ri(0,1)}`;

  // ── Final assembly ──────────────────────────────────────────────────────
  const sections = [
    `--[[ obfuscated with soli v${ver} | ${wid} ]]`,
    ``,
    `return (function(...)`,
    ``,
    `  ${envCapture}`,
    ``,
    `  ${poolDecl}`,
    ``,
    `  ${decoder}`,
    ``,
    `  ${getter}`,
    ``,
    `  ${guardBody}`,
    ``,
    `  -- [[ integrity ]]`,
    `  ${antiTamper}`,
    ``,
    `  -- [[ init.1 ]]`,
    `  ${junkTop}`,
    ``,
    `  -- [[ init.2 ]]`,
    `  ${junkPreBody}`,
    ``,
    `  local function ${N.mainFn}(${closureParams.join(', ')})`,
    ``,
    `    -- [[ pre ]]`,
    `    ${junkMid}`,
    ``,
    `    -- [[ exec ]]`,
    `    ${bodyStr}`,
    ``,
    `    -- [[ post ]]`,
    `    ${junkPost}`,
    ``,
    `  end`,
    ``,
    `  -- [[ tail.1 ]]`,
    `  ${junkBottom}`,
    ``,
    `  -- [[ verify ]]`,
    `  while ${opaqueTrue()} do`,
    `    if ${N.type}(${N.mainFn}) == "function" then`,
    `      break`,
    `    end`,
    `  end`,
    ``,
    `  -- [[ tail.2 ]]`,
    `  ${junkTail}`,
    ``,
    `  return ${N.mainFn}`,
    ``,
    `end)()(${closureParams.map(()=>'nil').join(', ')})`,
  ];

  return sections.join('\n');
}

module.exports = { obfuscate };
