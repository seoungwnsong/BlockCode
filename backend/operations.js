///just for testing
const { Expr } = require('./permitivedatatypes');
const { ZeroDivisionError, typeName } = require('./errors');
const { PyTuple, PyFloat, pyBool, isFloat, isNumber, numberValue } = require('./object');

// Python VALUE equality, the meaning of == / != (identity `is` lives in
// identity.js and is a different question). Scalars fall through to JS ===, so
// scalar behaviour is unchanged — but containers compare by CONTENTS: two
// separately built lists with equal elements are ==, exactly as Python says,
// even though they are not the same object. A list and a tuple are never equal
// (Python agrees: [1,2] != (1,2)); sets compare as unordered members; dicts
// compare key-by-key. Nested containers recurse.
function seqKind(v) {
    if (Array.isArray(v))     return 'list';
    if (v instanceof PyTuple) return 'tuple';
    return null;
}
function seqItems(v) { return Array.isArray(v) ? v : v.items; }

function pyEquals(a, b) {
    // Numbers compare by VALUE across int/float/bool: 1 == 1.0, True == 1.
    // This must run before the `a === b` reference check, since two PyFloat
    // boxes with equal values are different objects.
    if (isNumber(a) && isNumber(b)) return numberValue(a) === numberValue(b);
    if (a === b) return true;                 // primitives, and same reference
    const ka = seqKind(a), kb = seqKind(b);
    if (ka && kb) {
        if (ka !== kb) return false;          // list vs tuple: never equal
        const ai = seqItems(a), bi = seqItems(b);
        if (ai.length !== bi.length) return false;
        for (let i = 0; i < ai.length; i++) if (!pyEquals(ai[i], bi[i])) return false;
        return true;
    }
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        for (const x of a) if (!b.has(x)) return false;
        return true;
    }
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [k, v] of a) if (!b.has(k) || !pyEquals(b.get(k), v)) return false;
        return true;
    }
    return false;
}

// B4: arithmetic on mismatched types used to fall through to JS coercion and
// produce NaN, which then poisons every downstream calculation without ever
// surfacing an error. Python raises TypeError instead — so do these.
// bool counts as a number here because Python's bool subclasses int; a boxed
// PyFloat counts too. (isNumber lives in object.js and covers all three.)
const isNumeric = isNumber;

function requireNumeric(op, left, right) {
    if (!isNumeric(left) || !isNumeric(right)) {
        throw new TypeError(
            `unsupported operand type(s) for ${op}: '${typeName(left)}' and '${typeName(right)}'`
        );
    }
}

// The numeric result of an arithmetic op, boxed as a float when Python would
// produce one: whenever either operand is a float, OR the op is one that always
// yields a float. True division (`/`) is always float in Python 3 — 4 / 2 is
// 2.0 — so callers pass forceFloat for it.
function numericResult(left, right, value, forceFloat = false) {
    return (forceFloat || isFloat(left) || isFloat(right)) ? new PyFloat(value) : value;
}

// The comparable form of a value: the underlying number for any numeric, the
// value itself otherwise (strings, sequences).
const orderValue = (v) => (isNumber(v) ? numberValue(v) : v);

// Python refuses to order a str against a number, but == and != across types
// are legal and simply return False. Only the ordering operators are guarded.
function requireOrderable(op, left, right) {
    if ((typeof left === 'string') !== (typeof right === 'string')) {
        throw new TypeError(
            `'${op}' not supported between instances of '${typeName(left)}' and '${typeName(right)}'`
        );
    }
}

class BinaryOperator extends Expr {
    constructor(left, op, right) {
        super();
        this.left = left;
        this.op = op;
        this.right = right;
    }
    evaluate(env) {
        const left = this.left.evaluate(env);

        // #19: short-circuit BEFORE touching the right side, so
        // `false and (1 / 0)` no longer throws.
        // Python's `and`/`or` return one of the OPERANDS, not a boolean:
        //   `0 and 1` -> 0,  `0 or 1` -> 1,  `2 and 3` -> 3.
        // And they decide with PYTHON truthiness (pyBool), so an empty
        // container is falsy — `[] and 1` -> [] — which raw JS && would get
        // wrong ([] is truthy in JS).
        if (this.op === "and") return pyBool(left) ? this.right.evaluate(env) : left;
        if (this.op === "or")  return pyBool(left) ? left : this.right.evaluate(env);

        const right = this.right.evaluate(env);

        const isString = (v) => typeof v === 'string';

        switch (this.op) {
            case "+": {
                const leftIsStr  = isString(left);
                const rightIsStr = isString(right);
                if (leftIsStr && rightIsStr)   return left + right;  // string concat
                if (!leftIsStr && !rightIsStr) {                     // numeric add
                    requireNumeric("+", left, right);
                    return numericResult(left, right, numberValue(left) + numberValue(right));
                }
                // mismatch
                throw new TypeError(
                    `Unsupported operand types for +: '${leftIsStr ? 'str' : 'num'}' and '${rightIsStr ? 'str' : 'num'}'`
                );
            }
            case "-":
                requireNumeric("-", left, right);
                return numericResult(left, right, numberValue(left) - numberValue(right));

            case "*": {
                // Python multiplies a str by an INT to repeat it (a bool counts,
                // True == 1). A float multiplier is a TypeError, as is any other
                // str combination.
                const strRepeat = (s, count) => {
                    if (!isNumber(count) || isFloat(count)) return null;
                    const n = numberValue(count);
                    return Number.isInteger(n) ? s.repeat(Math.max(0, n)) : null;
                };
                if (typeof left === 'string' || typeof right === 'string') {
                    const repeated = typeof left === 'string'
                        ? strRepeat(left, right)
                        : strRepeat(right, left);
                    if (repeated === null) {
                        throw new TypeError(
                            `can't multiply sequence by non-int of type '${typeName(typeof left === 'string' ? right : left)}'`
                        );
                    }
                    return repeated;
                }
                requireNumeric("*", left, right);
                return numericResult(left, right, numberValue(left) * numberValue(right));
            }

            case "/": {
                // Python 3 true division ALWAYS yields a float: 4 / 2 is 2.0.
                requireNumeric("/", left, right);
                const rv = numberValue(right);
                if (rv === 0) {
                    throw new ZeroDivisionError(
                        (isFloat(left) || isFloat(right)) ? "float division by zero" : "division by zero"
                    );
                }
                return numericResult(left, right, numberValue(left) / rv, true);
            }

            case "%": {
                requireNumeric("%", left, right);
                const rv = numberValue(right);
                // A2: Python's exact wording is "integer modulo by zero".
                if (rv === 0) throw new ZeroDivisionError("integer modulo by zero");
                return numericResult(left, right, numberValue(left) % rv);
            }

            case "**": {
                requireNumeric("**", left, right);
                const rv = numberValue(right);
                // A negative exponent produces a float even from two ints
                // (2 ** -1 is 0.5), matching Python.
                return numericResult(left, right, numberValue(left) ** rv, rv < 0);
            }

            // == and != are valid across types in Python (they just yield False).
            // pyEquals compares containers by value and numbers across int/float.
            case "==":  return pyEquals(left, right);
            case "!=":  return !pyEquals(left, right);

            case "<":   requireOrderable("<",  left, right); return orderValue(left) <  orderValue(right);
            case ">":   requireOrderable(">",  left, right); return orderValue(left) >  orderValue(right);
            case "<=":  requireOrderable("<=", left, right); return orderValue(left) <= orderValue(right);
            case ">=":  requireOrderable(">=", left, right); return orderValue(left) >= orderValue(right);
            default:    throw new Error(`Unknown operator: ${this.op}`);
        }
    }
}

class Compare extends Expr {
    // comparisons: array of [op, rightExpr] pairs
    // e.g. Compare(x, [["<", y], ["<", z]])  means x < y < z
    constructor(left, comparisons) {
        super();
        this.left = left;
        this.comparisons = comparisons;
    }
    evaluate(env) {
        let current = this.left.evaluate(env);
        for (const [op, rightExpr] of this.comparisons) {
            const right = rightExpr.evaluate(env);
            const ops = {
                "==": (a, b) => pyEquals(a, b),
                "!=": (a, b) => !pyEquals(a, b),
                "<":  (a, b) => orderValue(a) <  orderValue(b),
                ">":  (a, b) => orderValue(a) >  orderValue(b),
                "<=": (a, b) => orderValue(a) <= orderValue(b),
                ">=": (a, b) => orderValue(a) >= orderValue(b),
            };
            if (!(op in ops)) throw new Error(`Unknown operator: ${op}`);
            // B4: same str-vs-number guard as BinaryOperator, so the structured
            // path and the parser path agree on what raises.
            if (op !== '==' && op !== '!=') requireOrderable(op, current, right);
            if (!ops[op](current, right)) return false;
            current = right;
        }
        return true;
    }
}

class Bool extends Expr {
    constructor(b) {
        super();
        this.b = b;
    }
    evaluate() { return this.b; }
    toString() { return String(this.b); }
}

class BoolOp extends Expr {
    constructor(op, values) {
        super();
        this.op = op;
        this.values = values;
    }
    evaluate(env) {
        // Python semantics, matching BinaryOperator above: return the operand
        // that decides the result, not a boolean, using pyBool for truthiness.
        //   `and` -> the first falsy operand, else the last operand
        //   `or`  -> the first truthy operand, else the last operand
        // Evaluation short-circuits: operands past the deciding one are never
        // touched (`x or 1 / 0` is safe when x is truthy).
        let result;
        for (const value of this.values) {
            result = value.evaluate(env);
            if (this.op === "and" && !pyBool(result)) return result;
            if (this.op === "or"  &&  pyBool(result)) return result;
        }
        return result;
    }
}

module.exports = { BinaryOperator, Compare, Bool, BoolOp, pyEquals };