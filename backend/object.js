// Composite ("object") data types.
//
// permitivedatatypes.js holds the SCALAR values — int, float, bool, str — each
// a leaf that evaluates to itself. This file holds the values built OUT of other
// values: the ones whose block carries child expression blocks rather than a
// single raw literal. List, set, dict and tuple live here.
//
// The shared shape for the LITERAL nodes (PyList/PySet/PyDict): a composite node
// keeps its children as UN-evaluated Expr nodes and evaluates them lazily inside
// evaluate(env). That is what lets these containers hold not just literals but
// variable reads and full calculations —
//   numbers = [a, b + 1, len(xs)]
// each element is any expression toExpr() can build.
//
// Runtime representation mirrors Python's own value model:
//   list -> JS Array,  set -> JS Set,  dict -> JS Map,  tuple -> PyTuple.
// Set and Map are chosen because they hash primitives by VALUE — and
// int/float/bool/str (the only hashable scalars) are all JS primitives, so
// {1, 1} collapses to {1} and a duplicate dict key overwrites, exactly as in
// Python. A tuple has no native JS equivalent, so PyTuple is a thin immutable
// wrapper — produced by the tuple() builtin, or directly by a tuple literal
// block ({ type: 'tuple', items: [...] }), which interpreter.js's toExpr
// evaluates the same lazy way as a list/set literal.

const { Expr } = require('./permitivedatatypes');
const { KeyError, IndexError, ValueError, typeName } = require('./errors');

// The mutable (therefore un-hashable) runtime values: a list, a set, a dict.
// Everything else this language can produce — numbers, strings, booleans, None,
// tuples and function objects — is immutable and so may key a dict or join a
// set. (A tuple of mutable elements is technically un-hashable in Python; that
// edge is not modelled — a PyTuple is treated as immutable throughout.)
function isMutable(value) {
    return Array.isArray(value) || value instanceof Set || value instanceof Map;
}

// An immutable tuple value. `items` are already-EVALUATED runtime values (unlike
// the literal nodes above, which hold Expr nodes) — both producers, the tuple()
// builtin and the tuple literal block, evaluate their source values before
// building this. isPyTuple is a prototype getter, not an own property, so it
// tags the value for typeName() without ever appearing in JSON output.
class PyTuple {
    constructor(items = []) {
        this.items = items;
    }
    get isPyTuple() { return true; }
    toString() { return pyRepr(this); }
}

// A Python float. JS has one number type, so an integer-valued float (3.0)
// cannot be told apart from an int (3) when both are stored as a bare JS number.
// PyFloat is the box that keeps that distinction: an int stays a bare JS number,
// a float is wrapped here. That is what lets `3.0` print as "3.0", `type(3.0)`
// report "float", and Python 3 true division (`4 / 2` -> 2.0) carry a float
// result. Like PyTuple it is a runtime VALUE (already evaluated), tagged by a
// prototype getter so errors.js can name it without an instanceof import cycle.
//
// KNOWN LIMITATION: a float is a boxed object, and a JS Set/Map (which back this
// language's set and dict) key objects by REFERENCE. So two equal floats do NOT
// collapse inside a set/dict — {2.0, 2.0} stays two members, and 2 vs 2.0 never
// merge — whereas Python would dedupe them by value. Ints/strings/bools are
// primitives and still dedupe correctly; only floats-as-members are affected.
class PyFloat {
    constructor(value = 0) {
        this.value = Number(value);
    }
    get isPyFloat() { return true; }
    toString() { return pyNumberStr(this.value); }
}

// Render a numeric value the way Python (and the frontend's pyLiteral) does:
// an integer-valued float keeps a trailing ".0" so it stays visibly a float.
function pyNumberStr(value) {
    return Number.isInteger(value) ? `${value}.0` : String(value);
}

// A value that participates in arithmetic: a bare number (int), a bool (Python's
// bool is an int subclass, True == 1) or a boxed PyFloat.
const isFloat  = (v) => v instanceof PyFloat;
const isNumber = (v) => typeof v === 'number' || typeof v === 'boolean' || v instanceof PyFloat;
// The underlying JS number for arithmetic/comparison, unboxing a PyFloat and
// mapping bool -> 0/1.
function numberValue(v) {
    if (v instanceof PyFloat) return v.value;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
}

// A Python list. `items` is an array of Expr nodes; evaluating the list
// evaluates each element against the current env and returns a plain JS array.
class PyList extends Expr {
    constructor(items = []) {
        super();
        this.items = items;
    }
    evaluate(env) {
        return this.items.map(item => item.evaluate(env));
    }
    toString() { return pyRepr(this.evaluate()); }
}

// A Python set: unordered, no duplicates, elements must be hashable. Evaluating
// returns a JS Set, whose value-equality on primitives gives Python's
// de-duplication for free. A mutable element is un-hashable and raises TypeError
// with Python's own wording — a set has elements, not keys, so KeyError (the
// dict rule) would not read correctly here.
class PySet extends Expr {
    constructor(items = []) {
        super();
        this.items = items;
    }
    evaluate(env) {
        const result = new Set();
        for (const item of this.items) {
            const value = item.evaluate(env);
            if (isMutable(value)) {
                throw new TypeError(`unhashable type: '${typeName(value)}'`);
            }
            result.add(value);
        }
        return result;
    }
    toString() { return pyRepr(this.evaluate()); }
}

// A Python dict. `entries` is an array of { key: Expr, value: Expr }. Evaluating
// returns a JS Map. A KEY must be immutable: an expression may compute to any
// value (and a function object is a valid, hashable key), but a mutable key — a
// list, set or dict — is rejected. Per the language's rule this raises KeyError
// (Python itself raises TypeError: unhashable type here; KeyError is this
// language's chosen wording). The key is checked before its value is evaluated.
// A repeated key overwrites, last-wins, as Map.set and Python both do.
class PyDict extends Expr {
    constructor(entries = []) {
        super();
        this.entries = entries;
    }
    evaluate(env) {
        const result = new Map();
        for (const entry of this.entries) {
            const key = entry.key.evaluate(env);
            if (isMutable(key)) {
                throw new KeyError(`unhashable type: '${typeName(key)}'`);
            }
            result.set(key, entry.value.evaluate(env));
        }
        return result;
    }
    toString() { return pyRepr(this.evaluate()); }
}

// ---------------------------------------------------------------------------
// Value-level helpers shared by the builtins (len/list/set/bool/…). They speak
// the runtime value model — string, list, tuple, set, dict — not Expr nodes.
// ---------------------------------------------------------------------------

// len(x): the number of elements. Only the SIZED types have one; anything else
// (int, float, bool, None, function) raises Python's "has no len()" TypeError.
function lengthOf(value) {
    if (typeof value === 'string') return value.length;
    if (Array.isArray(value))      return value.length;
    if (value instanceof PyTuple)  return value.items.length;
    if (value instanceof Set)      return value.size;
    if (value instanceof Map)      return value.size;
    throw new TypeError(`object of type '${typeName(value)}' has no len()`);
}

// Iterate a value into a fresh JS array of its elements — what list()/set()/
// tuple()/sorted()/sum()/min()/max() consume. A string yields its characters, a
// dict yields its KEYS (as Python does), and a non-iterable raises TypeError.
function iterate(value) {
    if (typeof value === 'string') return [...value];
    if (Array.isArray(value))      return value.slice();
    if (value instanceof PyTuple)  return value.items.slice();
    if (value instanceof Set)      return [...value];
    if (value instanceof Map)      return [...value.keys()];
    throw new TypeError(`'${typeName(value)}' object is not iterable`);
}

// ---------------------------------------------------------------------------
// Indexing / slicing — target[index] and target[start:stop:step], for List,
// String and Tuple only. A dict has no positional subscript here (dict.get()
// is the sanctioned way to read one by key); indexing anything else raises
// the same "not subscriptable" TypeError Python gives for e.g. an int.
// ---------------------------------------------------------------------------

// Python's bool is an int subclass, so True/False are legal indices (True
// means 1). A boxed PyFloat — even an integer-valued one like 2.0 — is not.
const isIntLike = (v) => typeof v === 'boolean' || (typeof v === 'number' && Number.isInteger(v));

function requireIntLike(value, message) {
    if (!isIntLike(value)) throw new TypeError(message);
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function subscriptKind(target) {
    if (Array.isArray(target)) return 'list';
    if (typeof target === 'string') return 'string';
    if (target instanceof PyTuple) return 'tuple';
    return null;
}

function subscriptLength(target, kind) {
    return kind === 'tuple' ? target.items.length : target.length;
}

// list/tuple share one wording ("indices must be integers or slices"); string
// has its own, and — unlike the other two — quotes the offending type name.
// Both are CPython's exact messages.
function requireIndexValue(value, kind) {
    const message = kind === 'string'
        ? `string indices must be integers, not '${typeName(value)}'`
        : `${kind} indices must be integers or slices, not ${typeName(value)}`;
    return requireIntLike(value, message);
}

function requireSliceComponent(value) {
    return requireIntLike(value, 'slice indices must be integers or None or have an __index__ method');
}

// target[index]
function getItem(target, indexValue) {
    // dict[key] is a KEY lookup, not a positional index — Python's primary way
    // to read a dict, so it belongs here rather than only in dict.get(). A
    // mutable (unhashable) key is a TypeError; a key that is simply absent is a
    // KeyError repr'd the way CPython prints it — never the positional
    // IndexError the sequence path below would raise.
    if (target instanceof Map) {
        if (isMutable(indexValue)) throw new TypeError(`unhashable type: '${typeName(indexValue)}'`);
        if (target.has(indexValue)) return target.get(indexValue);
        throw new KeyError(pyRepr(indexValue));
    }

    const kind = subscriptKind(target);
    if (!kind) throw new TypeError(`'${typeName(target)}' object is not subscriptable`);

    const i = requireIndexValue(indexValue, kind);
    const length = subscriptLength(target, kind);
    const normalized = i < 0 ? i + length : i;
    if (normalized < 0 || normalized >= length) {
        throw new IndexError(`${kind} index out of range`);
    }
    return kind === 'tuple' ? target.items[normalized] : target[normalized];
}

// Python's slice.indices(length): normalizes start/stop (adding length for a
// negative value, then clamping) according to the sign of step, and returns
// the source indices to collect. Mirrors CPython's own algorithm exactly,
// including the negative-step case that makes x[::-1] a reversal.
function resolveSliceIndices(length, start, stop, step) {
    step = (step === null || step === undefined) ? 1 : requireSliceComponent(step);
    if (step === 0) throw new ValueError('slice step cannot be zero');

    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const normalize = (v) => {
        v = requireSliceComponent(v);
        if (v < 0) v += length;
        return step > 0 ? clamp(v, 0, length) : clamp(v, -1, length - 1);
    };

    const s = (start === null || start === undefined) ? (step > 0 ? 0 : length - 1) : normalize(start);
    const e = (stop === null || stop === undefined) ? (step > 0 ? length : -1) : normalize(stop);

    const indices = [];
    if (step > 0) {
        for (let i = s; i < e; i += step) indices.push(i);
    } else {
        for (let i = s; i > e; i += step) indices.push(i);
    }
    return indices;
}

// target[start:stop:step] — start/stop/step are each a value or null (Python
// None, meaning "omitted"). Returns the same type as the target: a list slice
// is a new list, a string slice a new string, a tuple slice a new (never
// interned — see interpreter.js's tuple case) PyTuple. Never mutates target.
function getSlice(target, start, stop, step) {
    // A dict cannot be sliced: CPython reports the slice object itself as an
    // unhashable key ("unhashable type: 'slice'"), not "not subscriptable".
    if (target instanceof Map) throw new TypeError(`unhashable type: 'slice'`);

    const kind = subscriptKind(target);
    if (!kind) throw new TypeError(`'${typeName(target)}' object is not subscriptable`);

    const length = subscriptLength(target, kind);
    const indices = resolveSliceIndices(length, start, stop, step);

    if (kind === 'string') return indices.map((i) => target[i]).join('');
    if (kind === 'tuple') {
        // CPython returns the SAME tuple object for a full forward slice
        // (t[:], t[0:len], t[::1]): a tuple is immutable, so copying is
        // pointless and `t[:] is t` holds. A partial or reversed slice still
        // builds a fresh tuple. The identity test (indices are 0,1,…,len-1)
        // captures exactly the whole-in-order cases CPython optimizes — a
        // list, by contrast, always copies, so `x[:] is x` stays False there.
        if (indices.length === length && indices.every((i, k) => i === k)) return target;
        return new PyTuple(indices.map((i) => target.items[i]));
    }
    return indices.map((i) => target[i]);
}

// target[index] = value — in-place item assignment. Only the MUTABLE
// subscriptables accept it: a list by position, a dict by key. A tuple and a
// string are immutable, so Python raises "does not support item assignment"
// for them (a distinct message from "not subscriptable", which is reserved for
// values you can't index at all). The target is the live runtime object — a
// variable read hands back the same array/Map stored in env — so mutating it
// here persists, and nested targets (x[0][1] = v) work because getItem returns
// the real inner reference.
function setItem(target, indexValue, value) {
    if (Array.isArray(target)) {
        // Same index rules as a read: bool ok, float rejected, non-int TypeError.
        const i = requireIndexValue(indexValue, 'list');
        const normalized = i < 0 ? i + target.length : i;
        if (normalized < 0 || normalized >= target.length) {
            // Python's wording for the assignment case differs from the read's
            // "list index out of range".
            throw new IndexError('list assignment index out of range');
        }
        target[normalized] = value;
        return;
    }
    if (target instanceof Map) {
        // dict[key] = value: adds a new key or overwrites an existing one. The
        // key must be hashable, exactly as a dict literal or dict.update require.
        if (isMutable(indexValue)) throw new TypeError(`unhashable type: '${typeName(indexValue)}'`);
        target.set(indexValue, value);
        return;
    }
    if (typeof target === 'string') {
        throw new TypeError("'str' object does not support item assignment");
    }
    if (target instanceof PyTuple) {
        throw new TypeError("'tuple' object does not support item assignment");
    }
    throw new TypeError(`'${typeName(target)}' object does not support item assignment`);
}

// Python truthiness — what bool(x) and any condition uses. Zero, empty string,
// empty container and None are false; everything else (including a function) is
// true.
function pyBool(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number')  return value !== 0;
    if (value instanceof PyFloat)   return value.value !== 0;
    if (typeof value === 'string')  return value.length > 0;
    if (value === null || value === undefined) return false;
    if (Array.isArray(value))       return value.length > 0;
    if (value instanceof PyTuple)   return value.items.length > 0;
    if (value instanceof Set || value instanceof Map) return value.size > 0;
    return true;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Python's repr for a runtime value, used when a container is printed or nested
// in another. Strings are quoted; a list is [..], a tuple (..) (with the
// one-element (x,) special case and the empty ()), a set {..} (but the empty set
// is set(), since {} is the empty dict), a dict {k: v, ..}. Elements and both
// halves of a dict entry use repr, so nested strings stay quoted.
function pyRepr(value) {
    // Strings render double-quoted, matching the frontend's JSON.stringify-based
    // pyLiteral (Python's own repr prefers single quotes; the editor's preview
    // is the chosen convention here). JSON.stringify also escapes correctly.
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value instanceof PyFloat) return pyNumberStr(value.value);
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
    if (value instanceof PyTuple) {
        const items = value.items;
        if (items.length === 1) return `(${pyRepr(items[0])},)`;
        return `(${items.map(pyRepr).join(', ')})`;
    }
    if (value instanceof Set) {
        return value.size === 0 ? 'set()' : `{${[...value].map(pyRepr).join(', ')}}`;
    }
    if (value instanceof Map) {
        return `{${[...value].map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(', ')}}`;
    }
    return String(value);
}

// Python's str() for a runtime value — what print() shows. Identical to pyRepr
// except a bare string prints without quotes (print('hi') -> hi). Containers are
// the same either way: their contents always use repr.
function pyStr(value) {
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value instanceof PyFloat) return pyNumberStr(value.value);
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value) || value instanceof PyTuple ||
        value instanceof Set || value instanceof Map) {
        return pyRepr(value);
    }
    return String(value);
}

// Make a runtime value JSON-safe for the variables panel in the API response.
// res.json() would turn a Set/Map/PyTuple into a bare {}, so they are unwrapped:
// a set or tuple becomes an array of its members, a dict an object keyed by
// pyStr(key) (string keys are the common case; a non-string key is stringified
// the way print would show it). Scalars and lists pass through unchanged.
function serializeValue(value) {
    // A float carries no distinct JSON form, so it unwraps to its number; the
    // printed `output` (via pyStr) is where the ".0" distinction is preserved.
    if (value instanceof PyFloat) return value.value;
    if (Array.isArray(value))     return value.map(serializeValue);
    if (value instanceof PyTuple) return value.items.map(serializeValue);
    if (value instanceof Set)     return [...value].map(serializeValue);
    if (value instanceof Map) {
        const obj = {};
        for (const [k, v] of value) obj[pyStr(k)] = serializeValue(v);
        return obj;
    }
    return value;
}

module.exports = {
    PyList, PySet, PyDict, PyTuple, PyFloat,
    pyRepr, pyStr, pyNumberStr, serializeValue, isMutable,
    lengthOf, iterate, pyBool,
    isFloat, isNumber, numberValue,
    getItem, getSlice, setItem,
};
