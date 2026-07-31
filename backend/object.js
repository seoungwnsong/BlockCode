// Composite ("object") data types.
//
// permitivedatatypes.js holds the SCALAR values — int, float, bool, str — each
// a leaf that evaluates to itself. This file holds the values built OUT of other
// values: the ones whose block carries child expression blocks rather than a
// single raw literal. Lists land here first; dict/tuple/set are the natural next
// tenants, which is why the file is named for the general category rather than
// for the list alone.
//
// The shared shape: a composite node keeps its children as UN-evaluated Expr
// nodes and evaluates them lazily inside evaluate(env). That is what lets a list
// hold not just literals but variable reads and full calculations —
//   numbers = [a, b + 1, len(xs)]
// each element is any expression toExpr() can build.

const { Expr } = require('./permitivedatatypes');

// A Python list. `items` is an array of Expr nodes; evaluating the list
// evaluates each element against the current env and returns a plain JS array.
// Returning a bare array (rather than a wrapper) matches how the scalars behave
// — env holds raw JS values — and errors.js's typeName() already reports a JS
// array as Python's 'list', so indexing errors etc. read correctly downstream.
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

// Python's repr for a runtime value, used when a list is printed or nested in
// another list. Python shows a list as `[1, 'a', True]`: elements use repr (so
// strings are quoted), but a top-level string printed on its own is not — that
// distinction is why Print asks for pyStr, not pyRepr, at the outermost level.
function pyRepr(value) {
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
    return String(value);
}

// Python's str() for a runtime value — what print() shows. Identical to pyRepr
// except a bare string prints without quotes (print('hi') -> hi, not 'hi').
// A list is the same either way: print([1, 'a']) -> [1, 'a'].
function pyStr(value) {
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return pyRepr(value);
    return String(value);
}

module.exports = { PyList, pyRepr, pyStr };
