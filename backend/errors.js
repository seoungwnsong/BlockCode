// B4 (continued): Python-style exception types.
//
// JS already ships TypeError and SyntaxError with the exact `.name` Python
// uses, so operations.js / parser.js keep throwing those natively — there is
// nothing to gain by shadowing them. This file defines only the Python
// exception categories JS has no equivalent for.
//
// Each class sets `this.name` so `err.name` reads as the Python exception
// class name. runProgram() surfaces that as `errorType` on every result entry,
// which lets the frontend branch on the kind of error instead of pattern-
// matching the message text.

class NameError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NameError';
    }
}

class ZeroDivisionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ZeroDivisionError';
    }
}

class ValueError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValueError';
    }
}

// AttributeError / IndexError are defined but not yet raised anywhere: the
// language has no attribute access and no indexing yet. KeyError, by contrast,
// IS now raised — a dict rejects a mutable (unhashable) key with it (object.js).
class AttributeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AttributeError';
    }
}

class IndexError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IndexError';
    }
}

class KeyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'KeyError';
    }
}

// Python's type name for a runtime value, used to build error messages that
// read like Python's ("unsupported operand type(s) for -: 'str' and 'int'").
function typeName(v) {
    if (v === null || v === undefined) return 'NoneType';
    if (typeof v === 'string')  return 'str';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number')  return Number.isInteger(v) ? 'int' : 'float';
    if (Array.isArray(v))       return 'list';
    if (v instanceof Set)       return 'set';
    if (v instanceof Map)       return 'dict';
    // PyTuple lives in object.js, which imports THIS file — so it is detected by
    // a duck-typed marker rather than an instanceof, to avoid a require cycle.
    if (v && v.isPyTuple)       return 'tuple';
    return 'object';
}

module.exports = {
    NameError, ZeroDivisionError, ValueError,
    AttributeError, IndexError, KeyError,
    typeName
};
