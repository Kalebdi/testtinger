'use strict';
const crypto = require('crypto');

function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function v() { let n='_'; for(let i=0;i<ri(5,9);i++) n+=CHARS[ri(0,CHARS.length-1)]; return n; }

function A(n) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return n + '';
  if (n < 0) return `(-${-n})`;
  const a = ri(1, 999);
  const t = ri(0, 10);
  switch(t) {
    case 0: return `(${n + a}-${a})`;
    case 1: return `(${a}-(${a - n}))`;
    case 2: return `(${n * a}/${a})`;
    case 3: return `(function() return ${n + a}-${a} end)()`;
    case 4: return `(math.floor((${n + a}-${a})/1))`;
    case 5: return `(select(2,false,${n + a}-${a}))`;
    case 6: return `(math.abs(${n + a})-${a})`;
    case 7: return `(true and (${n + a}-${a}) or ${n})`;
    case 8: return `(bit32.bxor(${n},${ri(1,999)}))`;
    default: return n + '';
  }
}

function strEnc(s) {
  return '"' + [...s].map(c => {
    const code = c.charCodeAt(0);
    return '\\' + String(code).padStart(3, '0');
  }).join('') + '"';
}

function xorStr(s) {
  const key = [...crypto.randomBytes(s.length)].map(b => (b & 0x7F) | 1);
  const enc = [...s].map((c, i) => c.charCodeAt(0) ^ key[i]);
  const vt=v(), vk=v(), vo=v(), vi=v();
  return `(function() local ${vt}={${enc.map(A).join(',')}} local ${vk}={${key.map(A).join(',')}} local ${vo}={} for ${vi}=1,#${vt} do ${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}]))end return table.concat(${vo})end)()`;
}

const KW = new Set(['and','break','do','else','elseif','end','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','until','while','goto']);

function lex(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src.slice(i,i+4) === '--[[') { i+=4; while(i<src.length && src.slice(i,i+2)!==']]') i++; i+=2; continue; }
    if (src.slice(i,i+2) === '--') { while(i<src.length && src[i]!=='\n') i++; continue; }
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let str = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { i++; str += src[i++] || ''; }
        else str += src[i++];
      }
      i++;
      tokens.push({t:'STRING', v:str});
      continue;
    }
    if (/[a-zA-Z_]/.test(src[i])) {
      let w = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) w += src[i++];
      tokens.push({t: KW.has(w) ? 'KW' : 'WORD', v:w});
      continue;
    }
    if (/[0-9]/.test(src[i])) {
      let n = '';
      while (i < src.length && /[0-9]/.test(src[i])) n += src[i++];
      tokens.push({t:'NUM', v:n});
      continue;
    }
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
    if (tok.t === 'WORD') {
      out.push(rn(tok.v));
    } else if (tok.t === 'STRING') {
      const r = ri(0, 3);
      if (r === 0) out.push(strEnc(tok.v));
      else out.push(xorStr(tok.v));
    } else if (tok.t === 'NUM') {
      out.push(A(parseInt(tok.v)));
    } else {
      out.push(tok.v);
    }
  }
  
  let result = '--[[ v1.0 obfuscated by soli ]]\n';
  result += 'return(function(...)\n';
  result += out.join(' ') + '\n';
  result += 'end)(...)';
  
  return result;
}

module.exports = { obfuscateV8 };
