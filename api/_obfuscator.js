'use strict';
const crypto = require('crypto');

function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function v() { let n='_'; for(let i=0;i<ri(5,9);i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }

function A(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return n + '';
  // FIX: handle negative properly without using bit32
  if (n < -2147483648 || n > 2147483647) return n + '';
  if (n < 0) return `(${n + 999}-${999})`; // simple offset for negatives
  const a = ri(1, 999);
  const t = ri(0, 9);
  switch(t) {
    case 0: return `(${n + a}-${a})`;
    case 1: return `(${a}-(${a - n}))`;
    case 2: return `(${n * a}/${a})`; // safe: a<=999, n>=0
    case 3: return `(function() return ${n + a}-${a} end)()`;
    case 4: return `(math.floor((${n + a}-${a})/1))`;
    case 5: return `(select(2,false,${n + a}-${a}))`;
    case 6: return `(math.abs(${n + a})-${a})`;
    case 7: return `(true and (${n + a}-${a}) or ${n})`;
    // FIX case 8: double-bxor cancel, bxor(bxor(n,k),k)==n, safe for n>=0
    case 8: {
      const k = ri(1, 0x7FFF);
      return `(bit32.bxor(bit32.bxor(${n},${k}),${k}))`;
    }
    // case 9: bit32.band identity
    case 9: return `(bit32.band(${n + a}-${a},4294967295))`;
    default: return n + '';
  }
}

// ONLY \ddd escapes — \x NOT supported in Luau 5.1!
function strEnc(s) {
  return '"' + [...s].map(c => '\\' + String(c.charCodeAt(0)).padStart(3,'0')).join('') + '"';
}

function xorStr(s) {
  const key = [...crypto.randomBytes(s.length)].map(b => (b & 0x7F) | 1);
  const enc = [...s].map((c, i) => c.charCodeAt(0) ^ key[i]);
  const vt=v(), vk=v(), vo=v(), vi=v();
  return `(function() local ${vt}={${enc.map(A).join(',')}} local ${vk}={${key.map(A).join(',')}} local ${vo}={} for ${vi}=1,#${vt} do ${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) end return table.concat(${vo}) end)()`;
}

const KW = new Set(['and','break','do','else','elseif','end','false','for','function',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while','goto']);

function lex(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    // block comment
    if (src.slice(i,i+4) === '--[[') { i+=4; while(i<src.length && src.slice(i,i+2)!==']]') i++; i+=2; continue; }
    // line comment
    if (src.slice(i,i+2) === '--') { while(i<src.length && src[i]!=='\n') i++; continue; }
    // long string
    if (src.slice(i,i+2) === '[[') {
      let j=i+2; while(j<src.length && !(src[j]===']' && src[j+1]===']')) j++;
      tokens.push({t:'STRING', v:src.slice(i+2,j)}); i=j+2; continue;
    }
    // quoted string
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++]; let str = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') {
          i++;
          const c = src[i] || '';
          if (c==='n'){str+='\n';i++;}
          else if(c==='t'){str+='\t';i++;}
          else if(c==='r'){str+='\r';i++;}
          else if(/[0-9]/.test(c)){let d='';while(/[0-9]/.test(src[i]||'')&&d.length<3)d+=src[i++];str+=String.fromCharCode(parseInt(d,10));}
          else{str+=c;i++;}
        } else str += src[i++];
      }
      i++;
      tokens.push({t:'STRING', v:str});
      continue;
    }
    // identifier / keyword
    if (/[a-zA-Z_]/.test(src[i])) {
      let w = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) w += src[i++];
      tokens.push({t: KW.has(w) ? 'KW' : 'WORD', v:w});
      continue;
    }
    // FIX: hex number
    if (src.slice(i,i+2).toLowerCase() === '0x') {
      let n='0x'; i+=2;
      while(i<src.length && /[0-9a-fA-F]/.test(src[i])) n+=src[i++];
      tokens.push({t:'NUM', v:String(Number(n))}); continue;
    }
    // FIX: decimal / float number
    if (/[0-9]/.test(src[i]) || (src[i]==='.' && /[0-9]/.test(src[i+1]||''))) {
      let n = '';
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      // handle scientific notation
      if ((src[i]==='e'||src[i]==='E') && i<src.length) {
        n+=src[i++];
        if(src[i]==='+'||src[i]==='-') n+=src[i++];
        while(i<src.length&&/[0-9]/.test(src[i])) n+=src[i++];
      }
      tokens.push({t:'NUM', v:n});
      continue;
    }
    // 2-char operators
    const op2 = src.slice(i,i+2);
    if(['==','~=','<=','>=','..','//'].includes(op2)){tokens.push({t:'OP',v:op2});i+=2;continue;}
    tokens.push({t:'OP', v:src[i]});
    i++;
  }
  tokens.push({t:'EOF'});
  return tokens;
}

function obfuscate(code) {
  const tokens = lex(code);
  const map = new Map();

  function rn(w) {
    if (KW.has(w)) return w;
    if (!map.has(w)) map.set(w, v());
    return map.get(w);
  }

  let out = [];

  for (const tok of tokens) {
    if (tok.t === 'EOF') continue;
    if (tok.t === 'WORD') {
      out.push(rn(tok.v));
    } else if (tok.t === 'STRING') {
      // randomly use strEnc or xorStr
      out.push(ri(0,1)===0 ? strEnc(tok.v) : xorStr(tok.v));
    } else if (tok.t === 'NUM') {
      const num = Number(tok.v);
      // only obfuscate integers, leave floats as-is
      if (Number.isInteger(num) && num >= 0 && num <= 2147483647) {
        out.push(A(num));
      } else {
        out.push(tok.v);
      }
    } else {
      out.push(tok.v);
    }
  }

  // FIX: no 'return' before the wrapper, just a do..end block
  let result = 'do\n';
  result += out.join(' ') + '\n';
  result += 'end';

  return result;
}

// FIX: export correct function name
module.exports = { obfuscate };
