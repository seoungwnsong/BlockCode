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

const { typeName, ValueError, KeyError, IndexError } = require('./errors');
const {
    PyTuple, PyFloat, lengthOf, iterate, pyBool, pyStr, pyRepr, isMutable,
    isFloat, isNumber, numberValue,
} = require('./object');
const { pyEquals } = require('./operations');

// ---------------------------------------------------------------------------
// Ordering — Python 3's rich comparison, the part min/max/sorted rely on.
// ---------------------------------------------------------------------------
// Returns -1 / 0 / 1, or throws TypeError when the two values are not orderable
// (Python forbids, e.g., number < str). The one subtlety the spec calls out is
// SEQUENCE comparison: two lists (or two tuples) compare element-by-element, and
// the first differing pair decides — so [20, 10] > [10, 100] because 20 > 10,
// which is why max([20, 10], [10, 100]) is [20, 10]. If every shared position is
// equal, the shorter sequence is the smaller one ([1, 2] < [1, 2, 3]).

const isNum = isNumber;   // number | bool | PyFloat (from object.js)

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
        const x = numberValue(a), y = numberValue(b);
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
    if (isFloat(x))             return Math.trunc(x.value);
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
    // float() ALWAYS produces a boxed float, so float(3) is 3.0, not 3.
    if (typeof x === 'boolean') return new PyFloat(x ? 1 : 0);
    if (isFloat(x))             return x;
    if (typeof x === 'number')  return new PyFloat(x);
    if (typeof x === 'string') {
        const s = x.trim();
        const n = Number(s);
        if (s === '' || Number.isNaN(n)) {
            throw new ValueError(`could not convert string to float: '${x}'`);
        }
        return new PyFloat(n);
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
    return numberValue(x);
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
        // pyCompare already returns exactly -1 / 0 / 1, so it can be matched
        // against `keep` directly — no Math.sign needed.
        if (pyCompare(values[i], best) === keep) best = values[i];
    }
    return best;
}

// ---------------------------------------------------------------------------
// Method-style built-ins: list.* / string.* / dict.* / set.*
// ---------------------------------------------------------------------------
// The frontend advertises these under a `builtinCall` whose `name` carries the
// dotted method (e.g. "list.append"). Our calling convention is function-style:
// the RECEIVER arrives as the first already-evaluated value, so `list.append`
// gets [theList, value]. Because a list is a JS Array, a set a JS Set and a dict
// a JS Map — all reference types shared with `env` — the mutating methods mutate
// the receiver IN PLACE, exactly as Python does, and return None (represented as
// `null`). The non-mutating ones (string.*, set.union, dict.keys, …) build and
// return fresh values; strings are immutable, so every string.* returns a new
// string rather than editing its receiver.

const NONE = null;   // Python None

const isList  = (v) => Array.isArray(v);
const isStr   = (v) => typeof v === 'string';
const isDict  = (v) => v instanceof Map;
const isSet   = (v) => v instanceof Set;
const isTuple = (v) => v instanceof PyTuple;

// Guard the receiver's type with a Python-shaped message. `fn` is the dotted
// method name so the error reads e.g. "list.append() requires a list, not int".
function receiver(fn, value, predicate, typeLabel) {
    if (!predicate(value)) {
        throw new TypeError(`${fn}() requires a ${typeLabel}, not '${typeName(value)}'`);
    }
    return value;
}

// A set/dict element or key must be hashable — the same rule the literals use.
function requireHashable(value) {
    if (isMutable(value)) throw new TypeError(`unhashable type: '${typeName(value)}'`);
    return value;
}

// A whole-number index for list.pop / list.insert.
function requireIndex(fn, value) {
    if (!Number.isInteger(value) && typeof value !== 'boolean') {
        throw new TypeError(`'${typeName(value)}' object cannot be interpreted as an integer`);
    }
    return Number(value);
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
        // This never consults interpreter.js's tuple-LITERAL pool — that
        // canonicalization is deliberately literal-only, so two runtime
        // conversions of equal-valued iterables stay distinct objects even
        // though their values are still == (see interpreter.js's tuple case).
        return x instanceof PyTuple ? x : new PyTuple(iterate(x));
    },
    set:   (a) => { exactly('set', a, 1);   return toSet(a[0]); },
    dict:  (a) => { exactly('dict', a, 1);  return toDict(a[0]); },

    // numeric — abs preserves the argument's type (abs(-3) -> 3, abs(-3.0) -> 3.0)
    abs:   (a) => {
        exactly('abs', a, 1);
        const r = Math.abs(requireNumber('abs', a[0]));
        return isFloat(a[0]) ? new PyFloat(r) : r;
    },
    round: (a) => {
        between('round', a, 1, 2);
        const x = requireNumber('round', a[0]);
        // round(x) with no ndigits returns an INT; round(x, n) keeps the
        // argument's type (round(3.14159, 2) -> 3.14 float, round(3, 2) -> 3 int).
        if (a.length === 1) return roundHalfEven(x);
        const nd = numberValue(a[1]);
        if (!Number.isInteger(nd) || isFloat(a[1])) {
            throw new TypeError(`'${typeName(a[1])}' object cannot be interpreted as an integer`);
        }
        const f = 10 ** nd;
        const val = roundHalfEven(x * f) / f;
        return isFloat(a[0]) ? new PyFloat(val) : val;
    },

    // aggregate
    min: (a) => extreme('min', a, -1),
    max: (a) => extreme('max', a, 1),
    sum: (a) => {
        exactly('sum', a, 1);
        let total = 0;
        let anyFloat = false;
        for (const v of iterate(a[0])) {
            if (!isNum(v)) {
                throw new TypeError(`unsupported operand type(s) for +: 'int' and '${typeName(v)}'`);
            }
            total += numberValue(v);
            if (isFloat(v)) anyFloat = true;
        }
        // sum([1, 2]) -> 3 (int); sum([1.0, 2]) -> 3.0 (float).
        return anyFloat ? new PyFloat(total) : total;
    },
    sorted: (a) => {
        exactly('sorted', a, 1);
        return iterate(a[0]).sort(pyCompare);
    },
    // reversed(x): Python yields a reverse iterator; we return a reversed list,
    // mirroring sorted() which also materialises a list.
    reversed: (a) => { exactly('reversed', a, 1); return iterate(a[0]).reverse(); },
    // all/any over an iterable, using Python truthiness. all([]) is True, any([])
    // is False — the standard empty-iterable identities.
    all: (a) => { exactly('all', a, 1); return iterate(a[0]).every(pyBool); },
    any: (a) => { exactly('any', a, 1); return iterate(a[0]).some(pyBool); },

    // -----------------------------------------------------------------------
    // list.* — mutate the receiver array in place (shared with env), return None
    // unless the method is defined to hand a value back (pop/index/count).
    // -----------------------------------------------------------------------
    'list.append': (a) => {
        exactly('list.append', a, 2);
        receiver('list.append', a[0], isList, 'list').push(a[1]);
        return NONE;
    },
    'list.pop': (a) => {
        between('list.pop', a, 1, 2);
        const lst = receiver('list.pop', a[0], isList, 'list');
        if (lst.length === 0) throw new IndexError('pop from empty list');
        let i = a.length === 2 ? requireIndex('list.pop', a[1]) : -1;
        if (i < 0) i += lst.length;
        if (i < 0 || i >= lst.length) throw new IndexError('pop index out of range');
        return lst.splice(i, 1)[0];
    },
    'list.insert': (a) => {
        exactly('list.insert', a, 3);
        const lst = receiver('list.insert', a[0], isList, 'list');
        let i = requireIndex('list.insert', a[1]);
        // Python clamps rather than raising: a huge index appends, a very
        // negative one prepends.
        if (i < 0) i = Math.max(0, i + lst.length);
        else       i = Math.min(i, lst.length);
        lst.splice(i, 0, a[2]);
        return NONE;
    },
    'list.remove': (a) => {
        exactly('list.remove', a, 2);
        const lst = receiver('list.remove', a[0], isList, 'list');
        const i = lst.findIndex((el) => pyEquals(el, a[1]));
        if (i === -1) throw new ValueError('list.remove(x): x not in list');
        lst.splice(i, 1);
        return NONE;
    },
    'list.extend': (a) => {
        exactly('list.extend', a, 2);
        const lst = receiver('list.extend', a[0], isList, 'list');
        for (const v of iterate(a[1])) lst.push(v);
        return NONE;
    },
    'list.index': (a) => {
        exactly('list.index', a, 2);
        const lst = receiver('list.index', a[0], isList, 'list');
        const i = lst.findIndex((el) => pyEquals(el, a[1]));
        if (i === -1) throw new ValueError(`${pyRepr(a[1])} is not in list`);
        return i;
    },
    'list.count': (a) => {
        exactly('list.count', a, 2);
        const lst = receiver('list.count', a[0], isList, 'list');
        return lst.reduce((n, el) => n + (pyEquals(el, a[1]) ? 1 : 0), 0);
    },
    'list.sort': (a) => {
        exactly('list.sort', a, 1);
        receiver('list.sort', a[0], isList, 'list').sort(pyCompare);
        return NONE;
    },
    'list.reverse': (a) => {
        exactly('list.reverse', a, 1);
        receiver('list.reverse', a[0], isList, 'list').reverse();
        return NONE;
    },

    // -----------------------------------------------------------------------
    // string.* — strings are immutable, so each returns a NEW value.
    // -----------------------------------------------------------------------
    'string.upper': (a) => { exactly('string.upper', a, 1); return receiver('string.upper', a[0], isStr, 'str').toUpperCase(); },
    'string.lower': (a) => { exactly('string.lower', a, 1); return receiver('string.lower', a[0], isStr, 'str').toLowerCase(); },
    // strip() with no argument removes leading/trailing WHITESPACE.
    'string.strip': (a) => { exactly('string.strip', a, 1); return receiver('string.strip', a[0], isStr, 'str').trim(); },
    'string.split': (a) => {
        between('string.split', a, 1, 2);
        const s = receiver('string.split', a[0], isStr, 'str');
        // No separator -> split on runs of whitespace, dropping empty pieces
        // (Python's default). A given separator splits literally.
        if (a.length === 1 || a[1] === null || a[1] === undefined) {
            return s.split(/\s+/).filter((piece) => piece.length > 0);
        }
        const sep = receiver('string.split', a[1], isStr, 'str');
        if (sep === '') throw new ValueError('empty separator');
        return s.split(sep);
    },
    'string.join': (a) => {
        exactly('string.join', a, 2);
        const sep = receiver('string.join', a[0], isStr, 'str');
        const parts = iterate(a[1]);
        parts.forEach((v, i) => {
            if (!isStr(v)) {
                throw new TypeError(`sequence item ${i}: expected str instance, ${typeName(v)} found`);
            }
        });
        return parts.join(sep);
    },
    'string.replace': (a) => {
        exactly('string.replace', a, 3);
        const s   = receiver('string.replace', a[0], isStr, 'str');
        const old = receiver('string.replace', a[1], isStr, 'str');
        const neu = receiver('string.replace', a[2], isStr, 'str');
        return s.split(old).join(neu);   // replace ALL, like Python
    },
    'string.find': (a) => {
        exactly('string.find', a, 2);
        const s   = receiver('string.find', a[0], isStr, 'str');
        const sub = receiver('string.find', a[1], isStr, 'str');
        return s.indexOf(sub);   // -1 when absent, matching str.find
    },

    // -----------------------------------------------------------------------
    // dict.* — the receiver is a JS Map. keys/values/items return fresh lists.
    // -----------------------------------------------------------------------
    'dict.keys':   (a) => { exactly('dict.keys', a, 1);   return [...receiver('dict.keys', a[0], isDict, 'dict').keys()]; },
    'dict.values': (a) => { exactly('dict.values', a, 1); return [...receiver('dict.values', a[0], isDict, 'dict').values()]; },
    'dict.items':  (a) => {
        exactly('dict.items', a, 1);
        // Each (key, value) pair is a tuple, as Python's dict.items() yields.
        return [...receiver('dict.items', a[0], isDict, 'dict')].map(([k, v]) => new PyTuple([k, v]));
    },
    'dict.get': (a) => {
        between('dict.get', a, 2, 3);
        const d = receiver('dict.get', a[0], isDict, 'dict');
        // Missing key returns the default (None when none is supplied) — never
        // a KeyError, which is what makes get different from indexing.
        return d.has(a[1]) ? d.get(a[1]) : (a.length === 3 ? a[2] : NONE);
    },
    'dict.update': (a) => {
        exactly('dict.update', a, 2);
        const d = receiver('dict.update', a[0], isDict, 'dict');
        const other = a[1];
        if (isDict(other)) {
            for (const [k, v] of other) d.set(k, v);
        } else {
            // Also accept an iterable of key/value pairs, as dict.update does.
            let i = 0;
            for (const pair of iterate(other)) {
                const items = isList(pair) ? pair : pair instanceof PyTuple ? pair.items : null;
                if (!items || items.length !== 2) {
                    throw new ValueError(`dictionary update sequence element #${i} has length ${items ? items.length : 1}; 2 is required`);
                }
                d.set(requireHashable(items[0]), items[1]);
                i++;
            }
        }
        return NONE;
    },
    'dict.pop': (a) => {
        between('dict.pop', a, 2, 3);
        const d = receiver('dict.pop', a[0], isDict, 'dict');
        if (d.has(a[1])) { const v = d.get(a[1]); d.delete(a[1]); return v; }
        if (a.length === 3) return a[2];
        throw new KeyError(pyRepr(a[1]));
    },

    // -----------------------------------------------------------------------
    // set.* — the receiver is a JS Set. add/remove/discard mutate; the algebra
    // operations (union/intersection/difference) return a NEW set.
    // -----------------------------------------------------------------------
    'set.add': (a) => {
        exactly('set.add', a, 2);
        receiver('set.add', a[0], isSet, 'set').add(requireHashable(a[1]));
        return NONE;
    },
    'set.remove': (a) => {
        exactly('set.remove', a, 2);
        const s = receiver('set.remove', a[0], isSet, 'set');
        if (!s.has(a[1])) throw new KeyError(pyRepr(a[1]));
        s.delete(a[1]);
        return NONE;
    },
    'set.discard': (a) => {
        exactly('set.discard', a, 2);
        receiver('set.discard', a[0], isSet, 'set').delete(a[1]);   // no error when absent
        return NONE;
    },
    'set.union': (a) => {
        exactly('set.union', a, 2);
        const s = receiver('set.union', a[0], isSet, 'set');
        const other = receiver('set.union', a[1], isSet, 'set');
        return new Set([...s, ...other]);
    },
    'set.intersection': (a) => {
        exactly('set.intersection', a, 2);
        const s = receiver('set.intersection', a[0], isSet, 'set');
        const other = receiver('set.intersection', a[1], isSet, 'set');
        return new Set([...s].filter((v) => other.has(v)));
    },
    'set.difference': (a) => {
        exactly('set.difference', a, 2);
        const s = receiver('set.difference', a[0], isSet, 'set');
        const other = receiver('set.difference', a[1], isSet, 'set');
        return new Set([...s].filter((v) => !other.has(v)));
    },

    // -----------------------------------------------------------------------
    // tuple.* — the receiver is a PyTuple. Read-only: no append/pop/insert/
    // remove/extend/sort/reverse exist here, so a tuple can never be mutated
    // through the method system, mirroring Python's own immutable tuple.
    // -----------------------------------------------------------------------
    'tuple.index': (a) => {
        exactly('tuple.index', a, 2);
        const tup = receiver('tuple.index', a[0], isTuple, 'tuple');
        const i = tup.items.findIndex((el) => pyEquals(el, a[1]));
        if (i === -1) throw new ValueError(`${pyRepr(a[1])} is not in tuple`);
        return i;
    },
    'tuple.count': (a) => {
        exactly('tuple.count', a, 2);
        const tup = receiver('tuple.count', a[0], isTuple, 'tuple');
        return tup.items.reduce((n, el) => n + (pyEquals(el, a[1]) ? 1 : 0), 0);
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
