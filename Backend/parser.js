const { BinaryOperator, Compare } = require('./operations');
const { num, Booleans, Strings } = require('./permitivedatatypes');
// function.js requires nothing, so this direction adds no cycle.
const { Call } = require('./function');
const { NameError, typeName } = require('./errors');
// B4: structural parse failures below use JS's native SyntaxError, whose
// `.name` already matches Python's exception name.

function tokenize(input) {
    const s = String(input);
    const tokens = [];
    let i = 0;
    const isDigit = c => c >= '0' && c <= '9';
    const isIdentStart = c => /[A-Za-z_]/.test(c);
    const isIdent = c => /[A-Za-z0-9_]/.test(c);

    while (i < s.length) {
        const c = s[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

        if (c === "'" || c === '"') {
            const quote = c;
            i++;
            let str = '';
            while (i < s.length && s[i] !== quote) str += s[i++];
            if (i >= s.length) throw new SyntaxError(`Unterminated string in expression: ${s}`);
            i++;
            tokens.push({ type: 'string', value: str });
            continue;
        }

        if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
            let n = '';
            while (i < s.length && (isDigit(s[i]) || s[i] === '.')) n += s[i++];
            tokens.push({ type: 'number', value: Number(n) });
            continue;
        }

        if (isIdentStart(c)) {
            let id = '';
            while (i < s.length && isIdent(s[i])) id += s[i++];
            if (id === 'and' || id === 'or' || id === 'not') tokens.push({ type: 'op', value: id });
            else if (id === 'true' || id === 'false') tokens.push({ type: 'bool', value: id === 'true' });
            else tokens.push({ type: 'ident', value: id });
            continue;
        }

        const two = s.slice(i, i + 2);
        if (['**', '==', '!=', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }

        // A1: needed to separate function-call arguments
        if (c === ',') { tokens.push({ type: 'comma' }); i++; continue; }
        if (c === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
        if (c === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
        if ('+-*/%<>'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }

        throw new SyntaxError(`Unexpected character '${c}' in expression: ${s}`);
    }

    tokens.push({ type: 'eof' });
    return tokens;
}

function parse(input) {
    const tokens = tokenize(input);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = type => { const t = next(); if (t.type !== type) throw new SyntaxError(`Expected ${type} in expression: ${input}`); return t; };

    function parseExpr() { return parseOr(); }

    function parseOr() {
        let left = parseAnd();
        while (peek().type === 'op' && peek().value === 'or') { next(); left = new BinaryOperator(left, 'or', parseAnd()); }
        return left;
    }
    function parseAnd() {
        let left = parseNot();
        while (peek().type === 'op' && peek().value === 'and') { next(); left = new BinaryOperator(left, 'and', parseNot()); }
        return left;
    }
    function parseNot() {
        if (peek().type === 'op' && peek().value === 'not') { next(); const operand = parseNot(); return { evaluate: env => !operand.evaluate(env) }; }
        return parseComparison();
    }
    // #18: collect the whole chain into ONE Compare node.
    // Nesting BinaryOperators made `3 < 2 < 1` evaluate as `(3 < 2) < 1`
    // -> `false < 1` -> `0 < 1` -> true. Compare handles it Python-style.
    function parseComparison() {
        const left = parseAddSub();
        const cmp = ['==', '!=', '<', '>', '<=', '>='];
        if (!(peek().type === 'op' && cmp.includes(peek().value))) return left;

        const pairs = [];
        while (peek().type === 'op' && cmp.includes(peek().value)) {
            const op = next().value;
            pairs.push([op, parseAddSub()]);
        }
        return new Compare(left, pairs);
    }
    function parseAddSub() {
        let left = parseMulDiv();
        while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) { const op = next().value; left = new BinaryOperator(left, op, parseMulDiv()); }
        return left;
    }
    function parseMulDiv() {
        let left = parseUnary();
        while (peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) { const op = next().value; left = new BinaryOperator(left, op, parseUnary()); }
        return left;
    }
    // Python binds ** tighter than unary minus: -2 ** 2 is -4, not 4.
    // So parseUnary sits ABOVE parsePower, and parsePower takes parseUnary on
    // its right (keeps 2 ** -1 working) which also gives right-associativity.
    function parseUnary() {
        if (peek().type === 'op' && peek().value === '-') {
            next();
            const operand = parseUnary();
            // B4: -'abc' used to evaluate to NaN instead of raising.
            return { evaluate: env => {
                const v = operand.evaluate(env);
                if (typeof v !== 'number' && typeof v !== 'boolean') {
                    throw new TypeError(`bad operand type for unary -: '${typeName(v)}'`);
                }
                return -v;
            } };
        }
        if (peek().type === 'op' && peek().value === '+') { next(); return parseUnary(); }
        return parsePower();
    }
    function parsePower() {
        const left = parseAtom();
        if (peek().type === 'op' && peek().value === '**') { next(); return new BinaryOperator(left, '**', parseUnary()); }
        return left;
    }
    function parseAtom() {
        const t = peek();
        if (t.type === 'number') { next(); return new num(t.value); }
        if (t.type === 'string') { next(); return new Strings(t.value); }
        if (t.type === 'bool') { next(); return new Booleans(t.value); }
        if (t.type === 'ident') {
            next();
            const name = t.value;

            // A1: an identifier followed by '(' is a CALL, not a variable read.
            // Without this, `add(2, 3)` failed at the tokenizer on the comma.
            if (peek().type === 'lparen') {
                next();
                const args = [];
                if (peek().type !== 'rparen') {
                    args.push(parseExpr());
                    while (peek().type === 'comma') { next(); args.push(parseExpr()); }
                }
                expect('rparen');
                return new Call(name, args);
            }

            // #20: hasOwn, not `in` — `in` walks the prototype chain, so a bare
            // `constructor` or `toString` would resolve as a defined variable.
            return { evaluate: env => { if (!Object.hasOwn(env, name)) throw new NameError(`name '${name}' is not defined`); return env[name]; } };
        }
        if (t.type === 'lparen') { next(); const e = parseExpr(); expect('rparen'); return e; }
        throw new SyntaxError(`Unexpected token in expression: ${input}`);
    }

    const result = parseExpr();
    if (peek().type !== 'eof') throw new SyntaxError(`Unexpected trailing input in expression: ${input}`);
    return result;
}

module.exports = { parse };