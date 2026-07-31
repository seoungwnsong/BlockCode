// Composite ("object") data types.
//
// permitivedatatypes.js holds the SCALAR values — int, float, bool, str — each
// a leaf that evaluates to itself. This file holds the values built OUT of other
// values: the ones whose block carries child expression blocks rather than a
// single raw literal. List, set and dict live here; tuple is the natural next
// tenant, which is why the file is named for the general category.
//
// The shared shape: a composite node keeps its children as UN-evaluated Expr
// nodes and evaluates them lazily inside evaluate(env). That is what lets these
// containers hold not just literals but variable reads and full calculations —
//   numbers = [a, b + 1, len(xs)]
// each element is any expression toExpr() can build.
//
// Runtime representation mirrors Python's own value model:
//   list -> JS Array,  set -> JS Set,  dict -> JS Map.
// Set and Map are chosen over plainer structures because they hash primitives
// by VALUE — and int/float/bool/str (the only hashable types this language has)
// are all JS primitives, so {1, 1} collapses to {1} and a duplicate dict key
// overwrites, exactly as in Python. The moment a tuple type is added it will
// need explicit value-hashing, since JS hashes arrays by reference.

const { Expr } = require('./permitivedatatypes');
const { KeyError, typeName } = require('./errors');

// The mutable (therefore un-hashable) runtime values: a list, a set, a dict.
// Everything else this language can produce — numbers, strings, booleans, None,
// and function objects — is immutable and so may key a dict or join a set.
// Python hashability is exactly this immutability line, which is why the check
// is shared by both the set and the dict constructors below.
function isMutable(value) {
    return Array.isArray(value) || value instanceof Set || value instanceof Map;
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

// A Python set: unordered, no duplicates, elements must be hashable. `items` is
// an array of Expr nodes. Evaluating returns a JS Set, whose value-equality on
// primitives gives Python's de-duplication for free. A mutable element is
// un-hashable and raises TypeError with Python's own wording — a set has
// elements, not keys, so KeyError (the dict rule) would not read correctly here.
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
// value (and a function object is a valid, hashable key), but if the key
// evaluates to a mutable value — a list, set or dict — that is rejected. Per the
// language's rule this raises KeyError (Python itself raises TypeError:
// unhashable type here; KeyError is this language's chosen wording). The key is
// checked before its value is evaluated, so a bad key fails fast. A repeated key
// overwrites, last-wins, as Map.set and Python both do.
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

// Python's repr for a runtime value, used when a container is printed or nested
// in another. Strings are quoted; a list is [..], a set {..} (but the empty set
// is set(), since {} is the empty dict), a dict {k: v, ..}. Elements and both
// halves of a dict entry use repr, so nested strings stay quoted.
function pyRepr(value) {
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
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
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value) || value instanceof Set || value instanceof Map) {
        return pyRepr(value);
    }
    return String(value);
}

// Make a runtime value JSON-safe for the variables panel in the API response.
// res.json() would turn a Set or Map into a bare {}, so they are unwrapped:
// a set becomes an array of its members, a dict an object keyed by pyStr(key)
// (string keys are the common case; a non-string key is stringified the way
// print would show it). Scalars and lists pass through unchanged, so the
// existing list output is untouched.
function serializeValue(value) {
    if (Array.isArray(value)) return value.map(serializeValue);
    if (value instanceof Set)  return [...value].map(serializeValue);
    if (value instanceof Map) {
        const obj = {};
        for (const [k, v] of value) obj[pyStr(k)] = serializeValue(v);
        return obj;
    }
    return value;
}

module.exports = { PyList, PySet, PyDict, pyRepr, pyStr, serializeValue, isMutable };
