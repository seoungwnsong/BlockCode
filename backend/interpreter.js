const {
    Assign, ParallelAssign, Print, If, ForRange, For, While, TaC, ExpressionStatement
} = require('./flowstatement');
const { BinaryOperator, Compare, BoolOp } = require('./operations');
const { num, Booleans, Strings } = require('./permitivedatatypes');
const { PyList, PySet, PyDict, PyTuple, PyFloat, serializeValue, pyBool, getItem, getSlice } = require('./object');   // composite types
const { isBuiltin, callBuiltin } = require('./builtins');        // len/type/int/id/…
const { createIdentityManager, isScalar, scalarKey } = require('./identity');   // runtime `is` / id()
const { parse } = require('./parser');
const { UserFunction, Return, Call } = require('./function');   // #11, #12, #13
const { NameError, ValueError } = require('./errors');          // B4

// ---------------------------------------------------------------------------
// Identifier rules
// ---------------------------------------------------------------------------
// #26: every name the program BINDS — assignment targets, parallel-assignment
// targets, loop variables, function names and their parameters — must be a
// legal identifier. Python decides this at compile time
// and raises SyntaxError before a single statement runs, so the check lives in
// the build phase (toStmt / def registration), not at evaluate time. Reads of a
// name are left alone: an undefined name is still a runtime NameError.
//
// The messages mirror CPython 3.10+ for each category. SyntaxError is used
// throughout — its `.name` already reads "SyntaxError", the same convention
// parser.js relies on, so it surfaces cleanly as `errorType` to the frontend.

// Python's reserved words (keyword.kwlist) plus this language's own literal
// words (its booleans are written lowercase, so `true`/`false` are literals
// here just as `True`/`False` are in Python). None may name a variable.
const RESERVED = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield',
    'true', 'false', 'none',
]);

// The subset that names a VALUE. Python words these apart from other keywords:
//   True = 1  ->  "cannot assign to True"   (a constant)
//   for  = 1  ->  "invalid syntax"          (a plain keyword)
const CONSTANT_WORDS = new Set(['True', 'False', 'None', 'true', 'false', 'none']);

// ASCII identifier, matching parser.js's own tokenizer ([A-Za-z_][A-Za-z0-9_]*).
const IDENTIFIER   = /^[A-Za-z_][A-Za-z0-9_]*$/;
// A name that is wholly a number: 5, 42, 3.14, .5
const NUMBER_NAME  = /^(\d+\.?\d*|\.\d+)$/;

// Throws SyntaxError if `name` is not a legal identifier; returns it otherwise.
// `what` only shapes the empty-name wording (e.g. "parameter", "variable").
function validateName(name, what = 'variable') {
    if (typeof name !== 'string' || name.trim() === '') {
        throw new SyntaxError(`${what} name cannot be empty`);
    }
    // A bare number is a literal:  5 = 1  ->  "cannot assign to literal"
    if (NUMBER_NAME.test(name)) {
        throw new SyntaxError('cannot assign to literal');
    }
    // Starts with a digit but isn't a clean number (e.g. 1st): CPython reads it
    // as a malformed number token.
    if (/^[0-9]/.test(name)) {
        throw new SyntaxError('invalid decimal literal');
    }
    // Constants get their own message; other keywords are just "invalid syntax".
    if (CONSTANT_WORDS.has(name)) {
        throw new SyntaxError(`cannot assign to ${name}`);
    }
    if (RESERVED.has(name)) {
        throw new SyntaxError('invalid syntax');
    }
    // Anything left over has a stray character or a space.
    if (!IDENTIFIER.test(name)) {
        throw new SyntaxError('invalid syntax');
    }
    return name;
}

// #27: the read-side counterpart. A name that APPEARS IN A VALUE SLOT (a
// variable read on the right of `=`, in a condition, an argument, a print, …)
// must also be a legal identifier. Python rejects `x = 1y` or `x = a-b` at
// compile time with a SyntaxError, before it ever asks whether the name exists;
// only a syntactically *valid* but undefined name is the runtime NameError that
// the read closures already raise. So this check runs at build time, when the
// reference node is constructed, not at evaluate time.
//
// Unlike a binding, a read has no "cannot assign to …" cases: a bare number or
// a constant like True is a legal expression in Python, not an error. In this
// language those never arrive as references (the frontend emits them as literal
// blocks), so a reserved word sitting in a reference slot is malformed and is
// reported as plain "invalid syntax", exactly as a keyword read would be.
function validateReference(name) {
    if (typeof name !== 'string' || name.trim() === '') {
        throw new SyntaxError('invalid syntax');
    }
    // 1y, 3abc — CPython reads a malformed number token, not a name.
    if (/^[0-9]/.test(name)) {
        throw new SyntaxError('invalid decimal literal');
    }
    if (RESERVED.has(name) || !IDENTIFIER.test(name)) {
        throw new SyntaxError('invalid syntax');
    }
    return name;
}

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

// #3 / #4: one place that turns a dataType + raw value into an Expr node.
// Accepts both the frontend's "string" and the older backend "str".
function literalExpr(dataType, value) {
    switch (dataType) {
        case 'int': {
            const n = Number(value);
            // B4: Python's int('abc') raises ValueError, not a bare Error.
            if (Number.isNaN(n)) throw new ValueError(`Invalid ${dataType} literal: ${value}`);
            return new num(n);
        }
        // A float literal is boxed so its type survives even when the value is
        // integral (3.0), which a bare JS number could not preserve.
        case 'float': {
            const n = Number(value);
            if (Number.isNaN(n)) throw new ValueError(`Invalid ${dataType} literal: ${value}`);
            return { evaluate: () => new PyFloat(n) };
        }
        case 'bool':
            return new Booleans(value === true || value === 'true');
        case 'string':
        case 'str':
            return new Strings(String(value));
        default:
            throw new Error(`Unknown literal data type: ${dataType}`);
    }
}

// #22 (continued): the frontend's operator palette is + - * / % — all
// left-associative, none right-associative, so a single precedence table and a
// left-to-right reduction reproduce Python exactly. `**` is deliberately absent:
// no block can emit it, and folding it left-associatively would be WRONG
// (2 ** 3 ** 2 is 512 in Python, not 64). If a power block is ever added, it
// needs its own right-associative branch rather than a row in this table.
const CHAIN_PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

// #7 / #8 / #10: the frontend names container arrays `children`,
// `tryChildren`, and (inside each catch) `children` again. Older payloads used
// `body` / `handler` / a single flat `catchChildren`. All are accepted so
// nothing in flight breaks.
function pick(...candidates) {
    for (const c of candidates) if (Array.isArray(c)) return c;
    return [];
}

// ---------------------------------------------------------------------------
// Tuple-literal interning
// ---------------------------------------------------------------------------
// Python's own tuples aren't interned like this — this is a deliberate
// Block Code teaching device, the same spirit as small-int interning: two
// tuple LITERALS with equal, fully-immutable contents are canonicalized to
// the same runtime object, so `x = (1, 2); y = (1, 2)` gives `x is y`. This
// only ever applies to the literal-evaluation path below (the `tuple` case
// in toExpr) — the tuple() builtin (builtins.js) always builds a fresh
// PyTuple and never consults the pool, so a dynamically-built tuple never
// collides with a literal's identity even when their values match.
//
// A value is safe to fold into the key only if it can never change out from
// under the cache: a scalar (isScalar — int/float/bool/str/None), or a
// PyTuple whose own items are (recursively) all safe. A list/set/dict inside
// the tuple disqualifies the whole literal, exactly like `([1, 2], 3)`
// staying un-interned because its list is mutable even though the outer
// tuple is not.
function isInternableTupleValue(value) {
    if (isScalar(value)) return true;
    if (value instanceof PyTuple) return value.items.every(isInternableTupleValue);
    return false;
}

// A structural key distinguishing both value AND type at every position —
// built from the same scalarKey identity.js uses for scalar interning, so
// (1,) and ("1",) and (True,) never collide. Nested tuples recurse into their
// own parenthesized key.
function tupleInternKey(items) {
    return items
        .map((value) => value instanceof PyTuple
            ? `(${tupleInternKey(value.items)})`
            : scalarKey(value))
        .join('|');
}

// ---------------------------------------------------------------------------
// Per-run builder
// ---------------------------------------------------------------------------
// #16: the block -> node converters are built per run so Print can be handed
// this run's `output` array, and so the `is` / id() nodes can close over this
// run's identity manager — instead of either being reached through global
// state. toExpr, foldCalculationChain, valueExpr and toStmt all live here and
// share those two captured values.
function makeBuilder(output, identity) {
    // Canonical-tuple cache for this run only — a fresh Map every call, so
    // interned identities never leak between separate program executions
    // (mirrors identity itself being minted fresh per run, see runProgram).
    const tupleLiteralPool = new Map();

    // Turns a block into an Expr node — works recursively for composed expressions
    function toExpr(block) {
        if (block === null || block === undefined) {
            throw new Error('Missing expression: expected a value block, got nothing');
        }
        if (typeof block === 'number')  return new num(block);
        if (typeof block === 'boolean') return new Booleans(block);
        // A bare string in an expression slot is parsed, not guessed.
        // Quoting convention: bare word -> variable, 'quoted' -> string literal,
        // bare number -> number. Supports and/or/not, comparisons, nesting.
        if (typeof block === 'string')  return parse(block);

        switch (block.type) {
            // #3: the frontend wraps every typed value as { type:'literal', dataType, value }
            case 'literal':
                return literalExpr(block.dataType, block.value);

            // Older backend shorthand, still accepted
            case 'int':
            case 'float':
            case 'bool':
            case 'str':
            case 'string':
                return literalExpr(block.type, block.value);

            // A list literal: { type:'array', items:[ <value block>, ... ] }.
            // Each item is any value block toExpr can build, so a list may hold
            // literals, variable reads, calculations or even nested lists. `items`
            // is optional — an absent or empty array is just [].
            case 'array':
            case 'list': {
                const items = Array.isArray(block.items) ? block.items : [];
                return new PyList(items.map(toExpr));
            }

            // A tuple literal: { type:'tuple', items:[ <value block>, ... ] }.
            // Canonicalized through tupleLiteralPool (see above) when every item
            // is safely immutable, so x = (1,2); y = (1,2) gives x is y — the
            // same educational identity model as int/str/bool interning. A
            // literal with any mutable content (a list, say) skips the pool and
            // always builds a fresh PyTuple, same as before.
            case 'tuple': {
                const items = Array.isArray(block.items) ? block.items : [];
                const exprs = items.map(toExpr);
                return {
                    evaluate: (env) => {
                        const values = exprs.map(e => e.evaluate(env));
                        if (!values.every(isInternableTupleValue)) {
                            return new PyTuple(values);
                        }
                        const key = tupleInternKey(values);
                        let tup = tupleLiteralPool.get(key);
                        if (!tup) {
                            tup = new PyTuple(values);
                            tupleLiteralPool.set(key, tup);
                        }
                        return tup;
                    },
                };
            }

            // A set literal: { type:'set', items:[ <value block>, ... ] }.
            // Duplicates collapse and elements must be hashable — see PySet.
            case 'set': {
                const items = Array.isArray(block.items) ? block.items : [];
                return new PySet(items.map(toExpr));
            }

            // A dict literal: { type:'dictionary', entries:[ { key, value }, ... ] }.
            // Each key and value is its own value block. Keys must be immutable —
            // see PyDict, which raises KeyError on a mutable key.
            case 'dictionary':
            case 'dict': {
                const entries = Array.isArray(block.entries) ? block.entries : [];
                return new PyDict(entries.map(entry => {
                    if (!entry || typeof entry !== 'object' || entry.key === undefined) {
                        throw new ValueError('dictionary entry requires a "key" and a "value"');
                    }
                    return { key: toExpr(entry.key), value: toExpr(entry.value) };
                }));
            }

            // Get Item: { type:'index', target, index } -> target[index]. Supports
            // List/String/Tuple; getItem (object.js) is where the type dispatch,
            // negative-index normalization and bounds checking actually live.
            case 'index': {
                const targetExpr = toExpr(block.target);
                const indexExpr = toExpr(block.index);
                return { evaluate: (env) => getItem(targetExpr.evaluate(env), indexExpr.evaluate(env)) };
            }

            // Slice: { type:'slice', target, start, stop, step } -> target[start:stop:step].
            // start/stop/step are each either a value block or null/undefined
            // (Python's None — "omitted"), matching the frontend's SliceExpression
            // exactly rather than standing in a fake empty-literal block for them.
            case 'slice': {
                const targetExpr = toExpr(block.target);
                const startExpr = (block.start === null || block.start === undefined) ? null : toExpr(block.start);
                const stopExpr = (block.stop === null || block.stop === undefined) ? null : toExpr(block.stop);
                const stepExpr = (block.step === null || block.step === undefined) ? null : toExpr(block.step);
                return {
                    evaluate: (env) => getSlice(
                        targetExpr.evaluate(env),
                        startExpr ? startExpr.evaluate(env) : null,
                        stopExpr ? stopExpr.evaluate(env) : null,
                        stepExpr ? stepExpr.evaluate(env) : null
                    ),
                };
            }

            // #5: the frontend reads a variable with { type:'variableReference', name }.
            // 'variable' is kept here only for older payloads; in a STATEMENT slot
            // 'variable' means assignment (see toStmt).
            case 'variableReference':
            case 'variable':
                // #27: reject a syntactically illegal name now (SyntaxError), so a
                // name that could never exist isn't misreported as "not defined".
                validateReference(block.name);
                return { evaluate: (env) => {
                    if (!Object.hasOwn(env, block.name)) throw new NameError(`name '${block.name}' is not defined`);   // #20, B4
                    return env[block.name];
                }};

            case 'expression':
                // Free-form string routed through parser.js.
                //   bare word  -> variable reference     ("A"    -> env.A)
                //   'quoted'   -> string literal         ("'hi'" -> "hi")
                //   bare number-> numeric literal        ("5"    -> 5)
                return parse(block.value);

            case 'calculation':
                return new BinaryOperator(toExpr(block.left), block.operator, toExpr(block.right));

            // #22: the frontend flattens a run of maths into ONE node when the user
            // adds a third operand: { first, operations:[{operator, value}, ...] }.
            // The row carries no grouping, so it is rebuilt with Python's precedence
            // — 2 + 3 * 4 is 14 here, exactly as the free-form parser would read it.
            case 'calculationChain':
                return foldCalculationChain(toExpr(block.first), block.operations);

            // #23: the comparison counterpart, { first, comparisons:[{operator, right}] }.
            // Compare already implements Python's chaining, so 1 < 2 < 3 is
            // (1 < 2) and (2 < 3) rather than (1 < 2) < 3.
            case 'comparisonChain': {
                if (!Array.isArray(block.comparisons) || block.comparisons.length === 0) {
                    throw new ValueError('comparisonChain requires a "comparisons" array');
                }
                return new Compare(
                    toExpr(block.first),
                    block.comparisons.map(c => [c.operator ?? c.op, toExpr(c.right)])
                );
            }

            // #6: the frontend collapses comparisons AND boolean ops into 'logic'
            case 'logic': {
                const op = block.operator;
                if (op === 'and' || op === 'or') {
                    return new BoolOp(op, [toExpr(block.left), toExpr(block.right)]);
                }
                // Identity, not value: `is` is true when both operands are the
                // SAME runtime object (same id from the identity manager), and
                // `is not` is its negation. == / != stay value comparisons and
                // fall through to Compare below. This must not be implemented by
                // comparing values — two equal lists are `==` but never `is`.
                if (op === 'is' || op === 'is not') {
                    const left  = toExpr(block.left);
                    const right = toExpr(block.right);
                    const negate = op === 'is not';
                    return { evaluate: (env) => {
                        const same = identity.sameIdentity(left.evaluate(env), right.evaluate(env));
                        return negate ? !same : same;
                    }};
                }
                return new Compare(toExpr(block.left), [[op, toExpr(block.right)]]);
            }

            case 'compare':
                // Chained: { left, comparisons: [{op, right}, ...] }
                // Simple:  { left, operator, right }
                return block.comparisons
                    ? new Compare(toExpr(block.left), block.comparisons.map(c => [c.op ?? c.operator, toExpr(c.right)]))
                    : new Compare(toExpr(block.left), [[block.operator, toExpr(block.right)]]);

            case 'boolop': {
                const op = block.operator;
                if (op !== 'and' && op !== 'or') {
                    throw new ValueError(`boolop operator must be "and" or "or", got: "${op}"`);
                }
                if (!Array.isArray(block.values) || block.values.length < 2) {
                    throw new ValueError('boolop requires a "values" array of at least 2 expressions');
                }
                return new BoolOp(op, block.values.map(toExpr));
            }

            case 'not': {
                if (block.value === undefined) throw new ValueError('not block requires a "value"');
                const operand = toExpr(block.value);
                // `not` DOES yield a boolean in Python, but its truthiness test
                // is Python's — `not []` is True, which raw JS `!` gets wrong.
                return { evaluate: (env) => !pyBool(operand.evaluate(env)) };
            }

            // #12: user-defined function call. functionId / paramNames are frontend
            // metadata; the runtime resolves by name.
            case 'call':
                return new Call(block.name, (block.args ?? []).map(toExpr));

            // Built-in call — every built-in (len, type, int, id, abs, min, …)
            // arrives under this one tag, distinguished by `name`. The args are
            // evaluated recursively here and the resulting VALUES handed to
            // builtins.js; an unknown name is a NameError, exactly as Python
            // treats an unbound name. `identity` is threaded through for id(),
            // which needs the runtime id of its argument; other builtins ignore it.
            case 'builtinCall': {
                const name = block.name;
                if (!isBuiltin(name)) {
                    throw new NameError(`name '${name}' is not defined`);
                }
                const argExprs = (block.args ?? []).map(toExpr);
                return { evaluate: (env) => callBuiltin(name, argExprs.map(e => e.evaluate(env)), identity) };
            }

            default:
                // Inline literal carrying dataType beside value
                if (block.dataType !== undefined) return literalExpr(block.dataType, block.value);
                throw new Error(`Unknown expression block: "${block.type}"`);
        }
    }

    function foldCalculationChain(firstExpr, operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new ValueError('calculationChain requires an "operations" array');
        }

        const operands  = [firstExpr];
        const operators = [];

        const reduceTop = () => {
            const op    = operators.pop();
            const right = operands.pop();
            const left  = operands.pop();
            operands.push(new BinaryOperator(left, op, right));
        };

        for (const operation of operations) {
            const op = operation?.operator;
            if (!Object.hasOwn(CHAIN_PRECEDENCE, op)) {
                throw new ValueError(`Unknown operator in calculation chain: "${op}"`);
            }
            // Left-associative: anything already stacked that binds at least as
            // tightly gets closed off before this operator is pushed.
            while (operators.length && CHAIN_PRECEDENCE[operators[operators.length - 1]] >= CHAIN_PRECEDENCE[op]) {
                reduceTop();
            }
            operators.push(op);
            operands.push(toExpr(operation.value));
        }

        while (operators.length) reduceTop();
        return operands[0];
    }

    // For statement slots where dataType may sit BESIDE value rather than wrapping it,
    // e.g. { type:'print', value:'hello', dataType:'str' }.
    function valueExpr(block) {
        const v = block.value;
        const isScalar = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
        if (block.dataType !== undefined && isScalar) {
            return literalExpr(block.dataType, v);
        }
        return toExpr(v);
    }

    // ---------------------------------------------------------------------------
    // Statements
    // ---------------------------------------------------------------------------
    function toStmt(block) {
        if (!block || typeof block !== 'object') {
            throw new Error('Invalid statement block');
        }

        switch (block.type) {
            // #2: the frontend nests the type inside value:
            //     { type:'variable', name:'x', value:{ type:'literal', dataType:'int', value:3 } }
            // valueExpr still handles the older flat { name, dataType, value } form.
            case 'variable':
                return new Assign(validateName(block.name), valueExpr(block));

            case 'assign':
                return new Assign(validateName(block.name), valueExpr(block));

            // #24: the frontend's field is `targets` — `names` was the older
            // backend spelling and is still accepted. Reading only `names` meant
            // every parallel assignment from the UI arrived with undefined
            // targets and died inside ParallelAssign.evaluate.
            case 'parallelAssign': {
                const targets = pick(block.targets, block.names);
                const values  = pick(block.values);

                if (targets.length === 0) {
                    throw new ValueError('Parallel assignment needs at least one target');
                }
                // #26: each unpack target follows the same identifier rules as a
                // plain assignment. An empty one still reports "cannot be empty".
                for (const target of targets) {
                    validateName(target);
                }
                // A target/value count mismatch is left to ParallelAssign.evaluate,
                // which reports it with Python's unpacking wording.
                return new ParallelAssign(targets, values.map(toExpr));
            }

            case 'print':
                return new Print(valueExpr(block), output);

            // #25: Python has no elif node — `elif c: B` is just an `if` sitting
            // alone in the previous branch's else. The frontend sends a FLAT
            // elifBranches array, so the chain is rebuilt from the tail backwards:
            // the real else is the innermost orelse, and each earlier branch wraps
            // everything that follows it.
            //
            //   if a / elif b / elif c / else d
            //     -> If(a, .., [If(b, .., [If(c, .., d)])])
            //
            // Only one branch can run, and a condition is evaluated only once the
            // ones above it have all been false — which is what makes
            // `if x != 0 / elif 10 / x > 2` safe.
            case 'if': {
                const branches = Array.isArray(block.elifBranches) ? block.elifBranches : [];

                // elseChildren is null when the user never opened an else block.
                // pick() reads that as "no statements", which is the same thing.
                let orelse = pick(block.elseChildren, block.elseBody).map(toStmt);

                for (let i = branches.length - 1; i >= 0; i--) {
                    const branch = branches[i];
                    if (!branch || typeof branch !== 'object') {
                        throw new Error('Invalid elif branch');
                    }
                    orelse = [new If(
                        toExpr(branch.condition),
                        pick(branch.children, branch.body).map(toStmt),
                        orelse
                    )];
                }

                return new If(
                    toExpr(block.condition),
                    pick(block.children, block.body).map(toStmt),
                    orelse
                );
            }

            case 'while':
                return new While(
                    toExpr(block.condition),
                    pick(block.children, block.body).map(toStmt)
                );

            // #9: the frontend's `for` is a RANGE loop (variable/start/end),
            // which maps to ForRange — not to For (iterate-an-array).
            case 'for':
            case 'forRange':
                return new ForRange(
                    validateName(block.variable ?? block.target),
                    toExpr(block.start),
                    toExpr(block.end ?? block.stop),
                    pick(block.children, block.body).map(toStmt)
                );

            // The iterate-an-array loop has no frontend producer yet; kept under
            // its own tag so the class stays reachable if one is agreed on.
            case 'forIn':
                return new For(
                    validateName(block.variable ?? block.target),
                    toExpr(block.iterable),
                    pick(block.children, block.body).map(toStmt)
                );

            case 'tryCatch':
            case 'tac': {
                // The frontend sends `catches: [{ errorType, children }, ...]`,
                // one entry per except clause. Older payloads sent a single
                // untyped catch (`catchChildren` / `handler`) that matched
                // anything — that's the same as one `Exception` clause today.
                const rawCatches = Array.isArray(block.catches) && block.catches.length
                    ? block.catches
                    : [{ errorType: 'Exception', children: pick(block.catchChildren, block.handler) }];

                return new TaC(
                    pick(block.tryChildren, block.body).map(toStmt),
                    rawCatches.map((c) => ({
                        errorType: typeof c.errorType === 'string' && c.errorType ? c.errorType : 'Exception',
                        body: pick(c.children, c.body).map(toStmt),
                    }))
                );
            }

            // #11
            case 'return':
                return new Return(toExpr(block.value));

            // #14: bare expressions used as statements (a call for its side effects).
            // The chain forms belong here too — serializeBlock in the frontend
            // drops an expression statement in verbatim, so a chain can arrive
            // in a statement slot just like a plain calculation.
            case 'calculation':
            case 'calculationChain':
            case 'logic':
            case 'comparisonChain':
            case 'call':
            case 'builtinCall':
            case 'index':
            case 'slice':
                return new ExpressionStatement(toExpr(block));

            default:
                throw new Error(`Unknown statement block: "${block.type}"`);
        }
    }

    return { toExpr, toStmt };
}

// ---------------------------------------------------------------------------
// Program execution
// ---------------------------------------------------------------------------

// #1: accepts the whole request body { functions, blocks }.
// A bare array is still accepted so older callers keep working.
function runProgram(program) {
    const source  = Array.isArray(program) ? { blocks: program } : (program ?? {});
    const rawFns  = Array.isArray(source.functions) ? source.functions : [];
    const rawBlks = Array.isArray(source.blocks)    ? source.blocks    : [];

    const env      = Object.create(null);   // #20
    const output   = [];
    const results  = [];
    // One identity manager per run: runtime ids start at 1 and never leak
    // between programs. It is captured by the builder's `is` / id() nodes.
    const identity = createIdentityManager();
    const { toStmt } = makeBuilder(output, identity);

    // A `def` normally arrives in `functions`, but tolerate one sitting in `blocks`.
    const defs   = [...rawFns, ...rawBlks.filter(b => b && b.type === 'def')];
    const blocks = rawBlks.filter(b => b && b.type !== 'def');

    // #13: register EVERY function before executing anything, so call order is
    // free and recursion / mutual recursion resolve.
    // B4: Python stops at the first uncaught error. `halted` is set as soon as
    // one is reported, and nothing after it runs — so `x = 1/0` followed by
    // `print(x)` yields ONE error, not two. Note this means results.length can
    // now be shorter than the number of blocks sent: a block with no entry was
    // never reached.
    let halted = false;

    for (const def of defs) {
        try {
            // #26: a function's own name and every parameter are bindings too,
            // so they follow the same identifier rules as a variable. Python
            // rejects `def 1f():` and `def f(1x):` at definition time; so do we.
            validateName(def.name, 'function');
            const params = def.params ?? [];
            for (const param of params) validateName(param, 'parameter');

            env[def.name] = new UserFunction(
                def.name,
                params,
                pick(def.children, def.body).map(toStmt)
            );
            results.push({ id: def.id, status: 'ok' });
        } catch (err) {
            // A def that won't even build is a definition-time failure —
            // Python would never reach the program body either.
            results.push({ id: def.id, status: 'error', errorType: err.name || 'Error', message: err.message });
            halted = true;
            break;
        }
    }
    for (const value of Object.values(env)) {
        if (value instanceof UserFunction) value.globalEnv = env;
    }

    if (!halted) {
        for (const block of blocks) {
            try {
                toStmt(block).evaluate(env);
                results.push({ id: block.id, status: 'ok' });
            } catch (err) {
                results.push({ id: block.id, status: 'error', errorType: err.name || 'Error', message: err.message });
                break;   // B4: stop the program, don't run the remaining blocks
            }
        }
    }

    // #21: env -> UserFunction -> globalEnv -> env is a cycle. Sending it to
    // res.json() throws "Converting circular structure to JSON".
    // serializeValue unwraps Set -> array and Map -> object so the response is
    // real JSON instead of the bare {} res.json() makes of a Set/Map. Scalars
    // and lists pass through unchanged.
    const variables = Object.fromEntries(
        Object.entries(env)
            .filter(([, value]) => !(value instanceof UserFunction))
            .map(([name, value]) => [name, serializeValue(value)])
    );

    return { variables, output, results };
}

module.exports = { runProgram, runBlocks: runProgram, validateName };
