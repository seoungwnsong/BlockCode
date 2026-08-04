// Built-in functions.
//
// The frontend emits EVERY built-in through one block shape:
//   { id, type:'builtinCall', name, args:[ <value block>, ... ] }
// interpreter.js turns that into a node that evaluates the arg expressions and
// hands the resulting VALUES to the function named here. So each entry below is
// a plain (values) => result — it never sees Expr nodes, only runtime values.
//
// Grouping mirrors the spec chart:
//   introspection : len, type
//   conversions   : int, float, str, bool, list, tuple, set, dict
//   numeric       : abs, round
//   aggregate     : min, max, sum, sorted
//
// Errors follow Python's taxonomy and wording so `errorType` reaches the
// frontend correctly: a wrong TYPE is a TypeError, a bad string→number is a
// ValueError, an empty min()/max() is a ValueError, a mutable dict key is this
// language's KeyError.

const { typeName, ValueError, KeyError } = require('./errors');
const {
    PyTuple, lengthOf, iterate, pyBool, pyStr, isMutable,
} = require('./object');

// ---------------------------------------------------------------------------
// Ordering — Python 3's rich comparison, the part min/max/sorted rely on.
// ---------------------------------------------------------------------------
// Returns -1 / 0 / 1, or throws TypeError when the two values are not orderable
// (Python forbids, e.g., number < str). The one subtlety the spec calls out is
// SEQUENCE comparison: two lists (or two tuples) compare element-by-element, and
// the first differing pair decides — so [20, 10] > [10, 100] because 20 > 10,
// which is why max([20, 10], [10, 100]) is [20, 10]. If every shared position is
// equal, the shorter sequence is the smaller one ([1, 2] < [1, 2, 3]).

const isNum = (v) => typeof v === 'number' || typeof v === 'boolean';

// The array of elements for a sequence, tagged by kind — a list and a tuple are
// each orderable with their own kind but NOT with each other, exactly as Python
// refuses [1, 2] < (1, 2).
function sequence(value) {
    if (Array.isArray(value))     return { kind: 'list',  items: value };
    if (value instanceof PyTuple) return { kind: 'tuple', items: value.items };
    return null;
}

function pyCompare(a, b) {
    if (isNum(a) && isNum(b)) {
        const x = Number(a), y = Number(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }
    if (typeof a === 'string' && typeof b === 'string') {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    const sa = sequence(a), sb = sequence(b);
    if (sa && sb && sa.kind === sb.kind) {
        const n = Math.min(sa.items.length, sb.items.length);
        for (let i = 0; i < n; i++) {
            const c = pyCompare(sa.items[i], sb.items[i]);
            if (c !== 0) return c;
        }
        return sa.items.length < sb.items.length ? -1
             : sa.items.length > sb.items.length ? 1 : 0;
    }
    throw new TypeError(
        `'<' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`
    );
}

// ---------------------------------------------------------------------------
// Argument-count guards, with Python-shaped messages.
// ---------------------------------------------------------------------------
function exactly(name, args, n) {
    if (args.length !== n) {
        const word = n === 1 ? 'argument' : 'arguments';
        throw new TypeError(`${name}() takes exactly ${n} ${word} (${args.length} given)`);
    }
}
function between(name, args, lo, hi) {
    if (args.length < lo || args.length > hi) {
        throw new TypeError(`${name}() takes from ${lo} to ${hi} arguments but ${args.length} were given`);
    }
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

// int(x): truncate a real number toward zero, or parse a base-10 integer string.
// A bool is a number (True -> 1). A float STRING ("3.5") is rejected, matching
// Python's int('3.5'); only a numeric float VALUE is truncated.
function toInt(x) {
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'number')  return Math.trunc(x);
    if (typeof x === 'string') {
        const s = x.trim();
        if (!/^[+-]?\d+$/.test(s)) {
            throw new ValueError(`invalid literal for int() with base 10: '${x}'`);
        }
        return parseInt(s, 10);
    }
    throw new TypeError(`int() argument must be a string or a number, not '${typeName(x)}'`);
}

// float(x): a number passes through, a bool becomes 0/1, a string is parsed.
// (JS has one number type, so float(3) cannot be told apart from int 3 — a known
// limitation noted where lists print.)
function toFloat(x) {
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'number')  return x;
    if (typeof x === 'string') {
        const s = x.trim();
        const n = Number(s);
        if (s === '' || Number.isNaN(n)) {
            throw new ValueError(`could not convert string to float: '${x}'`);
        }
        return n;
    }
    throw new TypeError(`float() argument must be a string or a number, not '${typeName(x)}'`);
}

// set(x): build a set from an iterable, enforcing the same hashability rule the
// set LITERAL does — a mutable element is un-hashable.
function toSet(x) {
    const result = new Set();
    for (const v of iterate(x)) {
        if (isMutable(v)) throw new TypeError(`unhashable type: '${typeName(v)}'`);
        result.add(v);
    }
    return result;
}

// dict(x): from another dict (a copy) or from an iterable of key/value PAIRS —
// each element must itself be a two-item sequence, as in dict([['a', 1]]). A
// mutable key is rejected with KeyError, matching the dict literal's rule.
function toDict(x) {
    const result = new Map();
    if (x instanceof Map) {
        for (const [k, v] of x) result.set(k, v);
        return result;
    }
    let i = 0;
    for (const pair of iterate(x)) {
        const seq = sequence(pair) || (typeof pair === 'string' ? { items: [...pair] } : null);
        if (!seq || seq.items.length !== 2) {
            const got = seq ? seq.items.length : lengthOfSafe(pair);
            throw new ValueError(
                `dictionary update sequence element #${i} has length ${got}; 2 is required`
            );
        }
        const [k, v] = seq.items;
        if (isMutable(k)) throw new KeyError(`unhashable type: '${typeName(k)}'`);
        result.set(k, v);
        i++;
    }
    return result;
}
// length for the dict()-pair error message, tolerating a non-sized element.
function lengthOfSafe(v) {
    try { return lengthOf(v); } catch { return 1; }
}

// ---------------------------------------------------------------------------
// Numeric
// ---------------------------------------------------------------------------

function requireNumber(name, x) {
    if (!isNum(x)) throw new TypeError(`bad operand type for ${name}(): '${typeName(x)}'`);
    return Number(x);
}

// Python's round: round-half-to-EVEN (round(0.5) == 0, round(2.5) == 2). With no
// ndigits it returns the nearest integer; with ndigits it scales, rounds, and
// unscales. Float artifacts at a given precision are inherited from the IEEE
// representation, exactly as CPython's own round() inherits them.
function roundHalfEven(v) {
    const floor = Math.floor(v);
    const diff = v - floor;
    if (diff < 0.5) return floor;
    if (diff > 0.5) return floor + 1;
    return floor % 2 === 0 ? floor : floor + 1;   // exact .5 -> nearest even
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

// Shared by min and max. With a single argument it is treated as an iterable
// (min([3, 1, 2])); with several it ranges over the arguments (min(3, 1, 2)).
// keep = -1 selects the smaller on each step (min), +1 the larger (max).
function extreme(name, args, keep) {
    if (args.length === 0) {
        throw new TypeError(`${name} expected at least 1 argument, got 0`);
    }
    const values = args.length === 1 ? iterate(args[0]) : args;
    if (values.length === 0) {
        throw new ValueError(`${name}() arg is an empty sequence`);
    }
    let best = values[0];
    for (let i = 1; i < values.length; i++) {
        if (Math.sign(pyCompare(values[i], best)) === keep) best = values[i];
    }
    return best;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
const BUILTINS = {
    // introspection
    len:  (a) => { exactly('len', a, 1);  return lengthOf(a[0]); },
    type: (a) => { exactly('type', a, 1); return typeName(a[0]); },
    // id() returns the backend runtime id of its one (already-evaluated)
    // argument. Aliases (y = x) share an object and so share an id; separately
    // built mutable objects get different ids. The identity manager is threaded
    // in from the interpreter as the second argument.
    id:   (a, identity) => { exactly('id', a, 1); return identity.idOf(a[0]); },

    // conversions
    int:   (a) => { exactly('int', a, 1);   return toInt(a[0]); },
    float: (a) => { exactly('float', a, 1); return toFloat(a[0]); },
    str:   (a) => { exactly('str', a, 1);   return pyStr(a[0]); },
    bool:  (a) => { exactly('bool', a, 1);  return pyBool(a[0]); },
    list:  (a) => { exactly('list', a, 1);  return iterate(a[0]); },
    tuple: (a) => {
        exactly('tuple', a, 1);
        const x = a[0];
        // tuple() of an existing tuple returns that SAME object, so identity is
        // preserved (x is tuple(x)); of any other iterable it builds a new one.
        // Tuples are never cached by value — a fresh iterable always yields a
        // fresh tuple, even when the contents are equal.
        return x instanceof PyTuple ? x : new PyTuple(iterate(x));
    },
    set:   (a) => { exactly('set', a, 1);   return toSet(a[0]); },
    dict:  (a) => { exactly('dict', a, 1);  return toDict(a[0]); },

    // numeric
    abs:   (a) => { exactly('abs', a, 1); return Math.abs(requireNumber('abs', a[0])); },
    round: (a) => {
        between('round', a, 1, 2);
        const x = requireNumber('round', a[0]);
        if (a.length === 1) return roundHalfEven(x);
        const nd = a[1];
        if (!Number.isInteger(nd)) {
            throw new TypeError(`'${typeName(nd)}' object cannot be interpreted as an integer`);
        }
        const f = 10 ** nd;
        return roundHalfEven(x * f) / f;
    },

    // aggregate
    min: (a) => extreme('min', a, -1),
    max: (a) => extreme('max', a, 1),
    sum: (a) => {
        exactly('sum', a, 1);
        let total = 0;
        for (const v of iterate(a[0])) {
            if (!isNum(v)) {
                throw new TypeError(`unsupported operand type(s) for +: 'int' and '${typeName(v)}'`);
            }
            total += Number(v);
        }
        return total;
    },
    sorted: (a) => {
        exactly('sorted', a, 1);
        return iterate(a[0]).sort(pyCompare);
    },
};

function isBuiltin(name) {
    return Object.hasOwn(BUILTINS, name);
}

// Dispatch a builtin by name over already-evaluated argument values. `identity`
// is the per-run identity manager, needed only by id() — every other builtin
// ignores the extra argument.
function callBuiltin(name, values, identity) {
    return BUILTINS[name](values, identity);
}

module.exports = { isBuiltin, callBuiltin, pyCompare };
