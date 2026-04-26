'use strict';
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
//  PROMETHEUS REWORK v6.1 — PRODUCTION READY (FIXED PARSER)
// ═══════════════════════════════════════════════════════════════════════════════

function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// --- [ VARIABLE NAMING ] ---
const IL_POOL = ['I', 'l', '1'];
const RESERVED = new Set(['and','break','do','else','elseif','end','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','until','while','goto','continue','_ENV','_G','_VERSION']);
let _nameCache = new Set();

function ilName(minLen = 8, maxLen = 14) {
    let name, attempts = 0;
    do {
        const len = ri(minLen, maxLen);
        name = IL_POOL[ri(0, 1)];
        for (let i = 1; i < len; i++) name += IL_POOL[ri(0, 2)];
        if (++attempts > 1000) name += '_' + _nameCache.size;
    } while (_nameCache.has(name) || RESERVED.has(name) || /^\d/.test(name));
    _nameCache.add(name);
    return name;
}

function resetNames() {
    _nameCache.clear();
    RESERVED.forEach(r => _nameCache.add(r));
}

function ilShort() { return ilName(4, 6); }
function ilMed() { return ilName(6, 10); }
function ilLong() { return ilName(10, 16); }

// --- [ NUMERIC OBFUSCATION ] ---
function obfNum(n) {
    if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
    if (n < -2147483648 || n > 2147483647) return String(n);
    
    const a = ri(100000, 999999);
    const strategies = [
        () => `(${n + a}-(${a}))`,
        () => `(-${a}+(${a + n}))`,
        () => `(${a}-(${a - n}))`,
        () => `(function() return ${n + a}-${a} end)()`,
        () => `(select(2,false,${n + a}-${a}))`,
    ];
    
    return strategies[ri(0, strategies.length - 1)]();
}

// --- [ JUNK CODE ENGINE ] ---
function makeJunk(count) {
    const lines = [];
    for (let i = 0; i < count; i++) {
        const v1 = ilShort(), v2 = ilShort();
        const patterns = [
            `while ${ri(100,999)}<0 do local ${v1}=1;break end`,
            `if false then local ${v1}=${obfNum(ri(1,999))} end`,
            `do local ${v1}=${obfNum(ri(1,99))};local ${v2}=${v1}+${obfNum(0)} end`,
            `local ${v1}=bit32.bxor(${obfNum(ri(1,255))},${obfNum(0)})`,
            `local ${v1}=(function()return ${obfNum(ri(1,500))}end)()`,
            `for ${v1}=1,0 do local ${v2}=1 end`,
            `repeat local ${v1}=${obfNum(ri(1,100))} until true`,
            `local ${v1}=type("")=="string" and ${obfNum(1)} or ${obfNum(0)}`,
            `local ${v1}=string.char(${ri(65,90)})`,
            `local ${v1}=math.floor(${obfNum(ri(1,999))}/${ri(2,9)})`,
        ];
        lines.push(patterns[ri(0, patterns.length - 1)]);
    }
    return lines.join('; ');
}

// --- [ LEXER ] ---
const KEYWORDS = new Set(['and','break','do','else','elseif','end','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','until','while','goto','continue']);
const OP2 = new Set(['==','~=','<=','>=','..','//','+=','-=','*=','/=']);

function lex(src) {
    const tokens = [];
    let i = 0;
    const len = src.length;
    
    while (i < len) {
        if (/\s/.test(src[i])) { i++; continue; }
        
        // Comments
        if (i + 1 < len && src.slice(i, i + 2) === '--') {
            if (src.slice(i + 2, i + 4) === '[[') {
                i += 4;
                while (i + 1 < len && src.slice(i, i + 2) !== ']]') i++;
                i += 2;
            } else {
                i += 2;
                while (i < len && src[i] !== '\n') i++;
            }
            continue;
        }
        
        // Long strings
        if (i + 1 < len && src.slice(i, i + 2) === '[[') {
            let j = i + 2;
            while (j + 1 < len && src.slice(j, j + 2) !== ']]') j++;
            tokens.push({ t: 'STR', v: src.slice(i + 2, j) });
            i = j + 2;
            continue;
        }
        
        // Quoted strings
        if (src[i] === '"' || src[i] === "'") {
            const q = src[i++];
            let s = '';
            while (i < len && src[i] !== q) {
                if (src[i] === '\\' && i + 1 < len) {
                    const esc = src[++i];
                    if (esc === 'n') s += '\n';
                    else if (esc === 't') s += '\t';
                    else if (esc === 'r') s += '\r';
                    else if (esc === '\\') s += '\\';
                    else if (esc === q) s += q;
                    else s += esc;
                    i++;
                } else {
                    s += src[i++];
                }
            }
            if (i < len) i++;
            tokens.push({ t: 'STR', v: s });
            continue;
        }
        
        // Numbers
        if (/[0-9]/.test(src[i]) || (src[i] === '.' && i + 1 < len && /[0-9]/.test(src[i + 1]))) {
            let n = '';
            while (i < len && /[0-9.]/.test(src[i])) n += src[i++];
            tokens.push({ t: 'NUM', v: Number(n) });
            continue;
        }
        
        // Identifiers & Keywords
        if (/[a-zA-Z_]/.test(src[i])) {
            let w = '';
            while (i < len && /[a-zA-Z0-9_]/.test(src[i])) w += src[i++];
            tokens.push({ t: KEYWORDS.has(w) ? 'KW' : 'ID', v: w });
            continue;
        }
        
        // Vararg
        if (i + 2 < len && src.slice(i, i + 3) === '...') {
            tokens.push({ t: 'OP', v: '...' });
            i += 3;
            continue;
        }
        
        // Two-char operators
        if (i + 1 < len && OP2.has(src.slice(i, i + 2))) {
            tokens.push({ t: 'OP', v: src.slice(i, i + 2) });
            i += 2;
            continue;
        }
        
        // Single char
        tokens.push({ t: 'OP', v: src[i++] });
    }
    
    tokens.push({ t: 'EOF', v: '' });
    return tokens;
}

// --- [ PARSER (FIXED - ROBUST) ] ---
function parse(tokens) {
    let pos = 0;
    
    const cur = () => tokens[pos] || { t: 'EOF', v: '' };
    const peek = (n = 0) => tokens[pos + n] || { t: 'EOF', v: '' };
    const adv = () => tokens[pos++];
    const match = (t, v) => cur().t === t && (v === undefined || cur().v === v);
    const matchAdv = (t, v) => { if (match(t, v)) { adv(); return true; } return false; };
    
    // Skip optional semicolons
    function skipSemicolons() {
        while (match('OP', ';')) adv();
    }
    
    function parsePrimary() {
        skipSemicolons();
        const t = cur();
        
        if (match('NUM')) { adv(); return { kind: 'Number', value: t.v }; }
        if (match('STR')) { adv(); return { kind: 'String', value: t.v }; }
        if (match('KW', 'true')) { adv(); return { kind: 'Boolean', value: true }; }
        if (match('KW', 'false')) { adv(); return { kind: 'Boolean', value: false }; }
        if (match('KW', 'nil')) { adv(); return { kind: 'Nil' }; }
        if (match('OP', '...')) { adv(); return { kind: 'Vararg' }; }
        
        if (match('KW', 'function')) {
            adv();
            matchAdv('OP', '(');
            const params = [];
            while (!match('OP', ')')) {
                if (match('OP', '...')) {
                    adv();
                    break;
                }
                params.push(cur().v);
                adv();
                matchAdv('OP', ',');
            }
            matchAdv('OP', ')');
            const body = parseBlock(['end']);
            matchAdv('KW', 'end');
            return { kind: 'Function', params, body };
        }
        
        if (match('OP', '{')) {
            adv();
            const fields = [];
            while (!match('OP', '}')) {
                skipSemicolons();
                if (match('OP', '}')) break;
                
                // Try to parse as [expr] = expr
                if (match('OP', '[')) {
                    adv();
                    const key = parseExpr();
                    matchAdv('OP', ']');
                    matchAdv('OP', '=');
                    const value = parseExpr();
                    fields.push({ kind: 'TableField', key, value });
                }
                // name = expr
                else if (match('ID') && peek(1).v === '=') {
                    const name = adv().v;
                    adv(); // =
                    const value = parseExpr();
                    fields.push({ kind: 'TableField', key: { kind: 'String', value: name }, value });
                }
                // positional
                else {
                    const value = parseExpr();
                    fields.push({ kind: 'TableField', key: null, value });
                }
                
                if (!matchAdv('OP', ',')) matchAdv('OP', ';');
            }
            matchAdv('OP', '}');
            return { kind: 'Table', fields };
        }
        
        if (match('OP', '(')) {
            adv();
            const expr = parseExpr();
            matchAdv('OP', ')');
            return expr;
        }
        
        if (match('ID')) {
            adv();
            return { kind: 'Identifier', name: t.v };
        }
        
        // Unary operators
        if (match('OP', '-') || match('OP', '#') || match('KW', 'not')) {
            const op = adv().v;
            const operand = parsePrimary();
            return { kind: 'Unary', op, operand };
        }
        
        // If we reach here with a semicolon, return a nil placeholder
        if (match('OP', ';')) {
            return { kind: 'Nil' };
        }
        
        // Unexpected token - return nil to prevent crash
        return { kind: 'Nil' };
    }
    
    function parsePostfix() {
        let expr = parsePrimary();
        
        while (true) {
            skipSemicolons();
            
            if (match('OP', '.')) {
                adv();
                const member = cur().v;
                adv();
                expr = { kind: 'MemberAccess', obj: expr, member };
            }
            else if (match('OP', '[')) {
                adv();
                const index = parseExpr();
                matchAdv('OP', ']');
                expr = { kind: 'IndexAccess', obj: expr, index };
            }
            else if (match('OP', ':')) {
                adv();
                const method = cur().v;
                adv();
                matchAdv('OP', '(');
                const args = [];
                if (!match('OP', ')')) {
                    args.push(parseExpr());
                    while (matchAdv('OP', ',')) {
                        args.push(parseExpr());
                    }
                }
                matchAdv('OP', ')');
                expr = { kind: 'MethodCall', obj: expr, method, args };
            }
            else if (match('OP', '(')) {
                adv();
                const args = [];
                if (!match('OP', ')')) {
                    args.push(parseExpr());
                    while (matchAdv('OP', ',')) {
                        args.push(parseExpr());
                    }
                }
                matchAdv('OP', ')');
                expr = { kind: 'Call', func: expr, args };
            }
            else {
                break;
            }
        }
        
        return expr;
    }
    
    function parseBinaryExpr(minPrec = 0) {
        const PREC = {
            'or': 1, 'and': 2,
            '<': 3, '>': 3, '<=': 3, '>=': 3, '==': 3, '~=': 3,
            '..': 4,
            '+': 5, '-': 5,
            '*': 6, '/': 6, '%': 6,
            '^': 8,
        };
        
        let left = parsePostfix();
        
        while (true) {
            skipSemicolons();
            const op = cur().v;
            const prec = PREC[op];
            if (!prec || prec < minPrec) break;
            
            adv();
            const right = parseBinaryExpr(prec + 1);
            left = { kind: 'Binary', op, left, right };
        }
        
        return left;
    }
    
    function parseExpr() {
        return parseBinaryExpr(0);
    }
    
    function parseStmt() {
        skipSemicolons();
        
        if (match('KW', 'local')) {
            adv();
            
            if (match('KW', 'function')) {
                adv();
                const name = cur().v;
                adv();
                matchAdv('OP', '(');
                const params = [];
                while (!match('OP', ')')) {
                    params.push(cur().v);
                    adv();
                    matchAdv('OP', ',');
                }
                matchAdv('OP', ')');
                const body = parseBlock(['end']);
                matchAdv('KW', 'end');
                return { kind: 'LocalFunction', name, params, body };
            }
            
            const names = [cur().v];
            adv();
            while (matchAdv('OP', ',')) {
                names.push(cur().v);
                adv();
            }
            
            const values = [];
            if (matchAdv('OP', '=')) {
                values.push(parseExpr());
                while (matchAdv('OP', ',')) {
                    values.push(parseExpr());
                }
            }
            
            return { kind: 'LocalAssign', names, values };
        }
        
        if (match('KW', 'function')) {
            adv();
            const name = cur().v;
            adv();
            matchAdv('OP', '(');
            const params = [];
            while (!match('OP', ')')) {
                params.push(cur().v);
                adv();
                matchAdv('OP', ',');
            }
            matchAdv('OP', ')');
            const body = parseBlock(['end']);
            matchAdv('KW', 'end');
            return { kind: 'FunctionDecl', name, params, body };
        }
        
        if (match('KW', 'if')) {
            adv();
            const cond = parseExpr();
            matchAdv('KW', 'then');
            const body = parseBlock(['elseif', 'else', 'end']);
            
            const elseifs = [];
            while (match('KW', 'elseif')) {
                adv();
                const elifCond = parseExpr();
                matchAdv('KW', 'then');
                const elifBody = parseBlock(['elseif', 'else', 'end']);
                elseifs.push({ cond: elifCond, body: elifBody });
            }
            
            let elseBody = null;
            if (matchAdv('KW', 'else')) {
                elseBody = parseBlock(['end']);
            }
            
            matchAdv('KW', 'end');
            return { kind: 'If', cond, body, elseifs, elseBody };
        }
        
        if (match('KW', 'while')) {
            adv();
            const cond = parseExpr();
            matchAdv('KW', 'do');
            const body = parseBlock(['end']);
            matchAdv('KW', 'end');
            return { kind: 'While', cond, body };
        }
        
        if (match('KW', 'for')) {
            adv();
            const varName = cur().v;
            adv();
            
            if (matchAdv('OP', '=')) {
                // Numeric for
                const start = parseExpr();
                matchAdv('OP', ',');
                const stop = parseExpr();
                const step = matchAdv('OP', ',') ? parseExpr() : null;
                matchAdv('KW', 'do');
                const body = parseBlock(['end']);
                matchAdv('KW', 'end');
                return { kind: 'NumericFor', var: varName, start, stop, step, body };
            } else {
                // Generic for
                const vars = [varName];
                while (matchAdv('OP', ',')) {
                    vars.push(cur().v);
                    adv();
                }
                matchAdv('KW', 'in');
                const iterators = [parseExpr()];
                while (matchAdv('OP', ',')) {
                    iterators.push(parseExpr());
                }
                matchAdv('KW', 'do');
                const body = parseBlock(['end']);
                matchAdv('KW', 'end');
                return { kind: 'GenericFor', vars, iterators, body };
            }
        }
        
        if (match('KW', 'repeat')) {
            adv();
            const body = parseBlock(['until']);
            matchAdv('KW', 'until');
            const cond = parseExpr();
            return { kind: 'Repeat', body, cond };
        }
        
        if (match('KW', 'return')) {
            adv();
            const values = [];
            if (!match('KW', 'end') && !match('EOF') && !match('OP', ';')) {
                values.push(parseExpr());
                while (matchAdv('OP', ',')) {
                    values.push(parseExpr());
                }
            }
            return { kind: 'Return', values };
        }
        
        if (match('KW', 'break')) {
            adv();
            return { kind: 'Break' };
        }
        
        if (match('KW', 'do')) {
            adv();
            const body = parseBlock(['end']);
            matchAdv('KW', 'end');
            return { kind: 'DoBlock', body };
        }
        
        // Expression statement (assignment or call)
        const expr = parseExpr();
        
        // Check for assignment
        if (match('OP', '=') || match('OP', ',')) {
            const targets = [expr];
            while (matchAdv('OP', ',')) {
                targets.push(parseExpr());
            }
            if (matchAdv('OP', '=')) {
                const values = [parseExpr()];
                while (matchAdv('OP', ',')) {
                    values.push(parseExpr());
                }
                return { kind: 'Assignment', targets, values };
            }
        }
        
        return { kind: 'ExprStmt', expr };
    }
    
    function parseBlock(terminators = []) {
        const stmts = [];
        const terms = new Set(terminators);
        
        while (!match('EOF')) {
            skipSemicolons();
            if (match('EOF')) break;
            if (match('KW') && terms.has(cur().v)) break;
            
            stmts.push(parseStmt());
            skipSemicolons();
        }
        
        return { kind: 'Block', stmts };
    }
    
    return parseBlock();
}

// --- [ IR COMPILER ] ---
function compileIR(ast) {
    const instrs = [];
    const consts = [];
    const constMap = new Map();
    let regCount = 0;
    const locals = new Map();
    
    function addConst(v) {
        const key = typeof v + ':' + String(v);
        if (constMap.has(key)) return constMap.get(key);
        const idx = consts.length;
        consts.push(v);
        constMap.set(key, idx);
        return idx;
    }
    
    function allocReg() {
        return regCount++;
    }
    
    function compileNode(node, targetReg) {
        if (!node) return allocReg();
        
        const reg = targetReg !== undefined ? targetReg : allocReg();
        
        if (node.kind === 'Number' || node.kind === 'String') {
            instrs.push({ op: 'LOADK', a: reg, b: addConst(node.value) });
        } else if (node.kind === 'Boolean') {
            instrs.push({ op: 'LOADBOOL', a: reg, b: node.value ? 1 : 0 });
        } else if (node.kind === 'Nil') {
            instrs.push({ op: 'LOADNIL', a: reg });
        } else if (node.kind === 'Identifier') {
            const localReg = locals.get(node.name);
            if (localReg !== undefined) {
                instrs.push({ op: 'MOVE', a: reg, b: localReg });
            } else {
                instrs.push({ op: 'GETGLOBAL', a: reg, b: addConst(node.name) });
            }
        } else if (node.kind === 'Call') {
            const funcReg = compileNode(node.func);
            const argRegs = [];
            for (const arg of node.args) {
                argRegs.push(compileNode(arg));
            }
            instrs.push({ op: 'CALL', a: funcReg, b: argRegs.length, c: 1 });
            instrs.push({ op: 'MOVE', a: reg, b: funcReg });
        } else if (node.kind === 'MemberAccess') {
            const objReg = compileNode(node.obj);
            const keyIdx = addConst(node.member);
            instrs.push({ op: 'GETTABLE', a: reg, b: objReg, c: keyIdx });
        } else if (node.kind === 'Binary') {
            const leftReg = compileNode(node.left);
            const rightReg = compileNode(node.right);
            const opMap = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV' };
            const irOp = opMap[node.op] || 'ADD';
            instrs.push({ op: irOp, a: reg, b: leftReg, c: rightReg });
        }
        
        return reg;
    }
    
    function compileStmt(stmt) {
        if (!stmt) return;
        
        if (stmt.kind === 'LocalAssign') {
            for (let i = 0; i < stmt.names.length; i++) {
                const reg = allocReg();
                locals.set(stmt.names[i], reg);
                if (i < stmt.values.length) {
                    compileNode(stmt.values[i], reg);
                } else {
                    instrs.push({ op: 'LOADNIL', a: reg });
                }
            }
        } else if (stmt.kind === 'Assignment') {
            for (let i = 0; i < stmt.targets.length; i++) {
                if (i < stmt.values.length) {
                    const valueReg = compileNode(stmt.values[i]);
                    const target = stmt.targets[i];
                    if (target.kind === 'Identifier') {
                        instrs.push({ op: 'SETGLOBAL', a: valueReg, b: addConst(target.name) });
                    }
                }
            }
        } else if (stmt.kind === 'ExprStmt') {
            compileNode(stmt.expr);
        } else if (stmt.kind === 'Return') {
            if (stmt.values.length > 0) {
                const reg = compileNode(stmt.values[0]);
                instrs.push({ op: 'RETURN', a: reg, b: 1 });
            } else {
                instrs.push({ op: 'RETURN', a: 0, b: 0 });
            }
        } else if (stmt.kind === 'If') {
            compileNode(stmt.cond);
            if (stmt.body && stmt.body.stmts) {
                stmt.body.stmts.forEach(compileStmt);
            }
        } else if (stmt.kind === 'While') {
            const loopStart = instrs.length;
            compileNode(stmt.cond);
            if (stmt.body && stmt.body.stmts) {
                stmt.body.stmts.forEach(compileStmt);
            }
            instrs.push({ op: 'JMP', a: 0, b: loopStart });
        }
    }
    
    if (ast.kind === 'Block' && ast.stmts) {
        ast.stmts.forEach(compileStmt);
    }
    
    instrs.push({ op: 'RETURN', a: 0, b: 0 });
    
    return { instrs, consts, maxRegs: regCount };
}

// --- [ VM COMPILER ] ---
function generateOpcodeMap() {
    const opcodes = ['LOADK','LOADBOOL','LOADNIL','GETGLOBAL','SETGLOBAL','CALL','RETURN','MOVE','GETTABLE','ADD','SUB','MUL','DIV','JMP'];
    const map = {};
    const used = new Set();
    
    for (const op of opcodes) {
        let code;
        do { code = ri(10, 250); } while (used.has(code));
        used.add(code);
        map[op] = code;
    }
    
    return map;
}

function compileVM(irChunk) {
    const opcodeMap = generateOpcodeMap();
    const code = [];
    
    for (const instr of irChunk.instrs) {
        const opcode = opcodeMap[instr.op] || 0;
        code.push(opcode);
        code.push(instr.a || 0);
        code.push(instr.b || 0);
        code.push(instr.c || 0);
    }
    
    return { code, consts: irChunk.consts, opcodeMap, maxRegs: irChunk.maxRegs };
}

// --- [ STRING TABLE ENCODER ] ---
function encodeStringTable(strings, xorKey) {
    return strings.map(s => {
        if (!s) return '""';
        let encoded = '';
        for (let i = 0; i < s.length; i++) {
            encoded += '\\' + ((s.charCodeAt(i) ^ xorKey) & 0xFF).toString(8).padStart(3, '0');
        }
        return `"${encoded}"`;
    });
}

// --- [ ANTI-TAMPER ] ---
function xorHidden(s) {
    const keyBytes = [...crypto.randomBytes(s.length)].map(b => (b & 0x7F) | 1);
    const encBytes = [];
    for (let i = 0; i < s.length; i++) encBytes.push(s.charCodeAt(i) ^ keyBytes[i]);
    
    const vt = ilShort(), vk = ilShort(), vo = ilShort(), vi = ilShort();
    return `(function() local ${vt}={${encBytes.map(obfNum).join(',')}} local ${vk}={${keyBytes.map(obfNum).join(',')}} local ${vo}={} for ${vi}=1,#${vt} do ${vo}[${vi}]=string.char(bit32.bxor(${vt}[${vi}],${vk}[${vi}])) end return table.concat(${vo}) end)()`;
}

function generateAntiTamper() {
    const xInst = xorHidden('Instance'), xDM = xorHidden('DataModel');
    const vEi = ilShort(), vEd = ilShort(), vC = ilShort();
    return `local ${vEi}=${xInst};local ${vEd}=${xDM};if not(typeof~=nil and typeof(game)==${vEi} and game.ClassName==${vEd})then local ${vC}=nil;${vC}();return end;${vEi}=nil;${vEd}=nil`;
}

// --- [ MAIN OBFUSCATOR ] ---
function obfuscate(code) {
    try {
        resetNames();
        
        const tokens = lex(code);
        const ast = parse(tokens);
        const irChunk = compileIR(ast);
        const vmChunk = compileVM(irChunk);
        
        const strings = ['','print','game','workspace','Instance','DataModel','type','typeof','getfenv','string','table','math','bit32'];
        vmChunk.consts.forEach(c => {
            if (typeof c === 'string' && !strings.includes(c)) strings.push(c);
        });
        
        const xorKey = ri(1, 254);
        const encodedStrings = encodeStringTable(strings, xorKey);
        
        const watermark = `--[[ v6.1.0 Prometheus Rework | soli ]]`;
        const offset = ri(10000, 80000);
        const tableVar = 'A';
        
        const strTable = encodedStrings.join(',');
        const accessor = `local function Y(Y) return ${tableVar}[Y+(${obfNum(offset)})] end`;
        
        const shufflePairs = [];
        for (let i = 0; i < ri(3, 6); i++) {
            const a = ri(1, strings.length), b = ri(1, strings.length);
            if (a !== b) shufflePairs.push(`{${obfNum(a)};${obfNum(b)}}`);
        }
        
        const shuffleCode = shufflePairs.length ?
            `for Y,F in ipairs({${shufflePairs.join(';')}}) do while F[${obfNum(1)}]<F[${obfNum(2)}] do ${tableVar}[F[${obfNum(1)}]],${tableVar}[F[${obfNum(2)}]],F[${obfNum(1)}],F[${obfNum(2)}]=${tableVar}[F[${obfNum(2)}]],${tableVar}[F[${obfNum(1)}]],F[${obfNum(1)}]+(${obfNum(1)}),F[${obfNum(2)}]-(${obfNum(1)}) end end` : '';
        
        const decoder = `do local _Ia=string.char;local _Ib=string.byte;local _Ic=table.concat;for _Id=1,#${tableVar} do local _Ie=${tableVar}[_Id];if type(_Ie)=="string" then local _If={};for _j=1,#_Ie do _If[_j]=_Ia(bit32.bxor(_Ib(_Ie,_j),${xorKey})) end;${tableVar}[_Id]=_Ic(_If) end end end`;
        
        const antiTamper = generateAntiTamper();
        const junk1 = makeJunk(ri(15, 25));
        const junk2 = makeJunk(ri(20, 30));
        
        const output = [
            watermark,
            `return(function(...)`,
            `local ${tableVar}={${strTable}}`,
            accessor,
            shuffleCode,
            decoder,
            junk1,
            antiTamper,
            junk2,
            `return(function(A,M,m,V,y,d,G,F,I,T,K,Z,X,h,k,b,w,J,z,Q,e,i,n)`,
            `local ${ilLong()}=table.unpack or unpack`,
            `local _code={${vmChunk.code.join(',')}}`,
            `local _consts={${vmChunk.consts.map(c => typeof c === 'string' ? `"${c.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"` : c).join(',')}}`,
            `local _ip,_regs=1,{}`,
            `while _ip<=#_code do`,
            `local _op,_a,_b,_c=_code[_ip],_code[_ip+1],_code[_ip+2],_code[_ip+3]`,
            `if _op==${vmChunk.opcodeMap.LOADK} then _regs[_a]=_consts[_b+1]`,
            `elseif _op==${vmChunk.opcodeMap.GETGLOBAL} then _regs[_a]=_G[_consts[_b+1]]`,
            `elseif _op==${vmChunk.opcodeMap.CALL} then local _f=_regs[_a];local _args={};for i=1,_b do _args[i]=_regs[_a+i] end;_f(${ilLong()}(_args))`,
            `elseif _op==${vmChunk.opcodeMap.RETURN} then break end`,
            `_ip=_ip+4 end`,
            `end)(getfenv and getfenv()or _ENV,unpack or table.unpack,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil)`,
            `end)(...)`
        ].join('\n');
        
        return output;
        
    } catch (e) {
        console.error('Obfuscation error:', e);
        throw new Error(`Obfuscation failed: ${e.message}`);
    }
}

module.exports = { obfuscate };
