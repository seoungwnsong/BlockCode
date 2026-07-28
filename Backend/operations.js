const { Expr } = require('./permitivedatatypes');
const { ZeroDivisionError, typeName } = require('./errors');

// B4: arithmetic on mismatched types used to fall through to JS coercion and
// produce NaN, which then poisons every downstream calculation without ever
// surfacing an error. Python raises TypeError instead — so do these.
// bool counts as a number here because Python's bool subclasses int.
const isNumeric = (v) => typeof v === 'number' || typeof v === 'boolean';

function requireNumeric(op, left, right) {
    if (!isNumeric(left) || !isNumeric(right)) {
        throw new TypeError(
            `unsupported operand type(s) for ${op}: '${typeName(left)}' and '${typeName(right)}'`
        );
    }
}

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
        // `false and (1 / 0)` no longer throws. (BoolOp already
        // short-circuits via .every/.some — this is the parser path.)
        if (this.op === "and") return left && this.right.evaluate(env);
        if (this.op === "or")  return left || this.right.evaluate(env);

        const right = this.right.evaluate(env);

        const isString = (v) => typeof v === 'string';

        switch (this.op) {
            case "+": {
                const leftIsStr  = isString(left);
                const rightIsStr = isString(right);
                if (leftIsStr && rightIsStr)   return left + right;  // string concat
                if (!leftIsStr && !rightIsStr) return left + right;  // numeric add
                // mismatch
                throw new TypeError(
                    `Unsupported operand types for +: '${leftIsStr ? 'str' : 'num'}' and '${rightIsStr ? 'str' : 'num'}'`
                );
            }
            case "-":
                requireNumeric("-", left, right);
                return left - right;

            case "*": {
                // Python multiplies a str by an int to repeat it. Anything else
                // involving a str is a TypeError.
                const strRepeat = (s, n) =>
                    Number.isInteger(n) ? s.repeat(Math.max(0, n)) : null;
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
                return left * right;
            }

            case "/":
                requireNumeric("/", left, right);
                if (right === 0) throw new ZeroDivisionError("division by zero");
                return left / right;

            case "%":
                // A2: was returning NaN, which silently poisons every
                // downstream calculation. Match the behaviour of "/".
                requireNumeric("%", left, right);
                if (right === 0) throw new ZeroDivisionError("modulo by zero");
                return left % right;

            case "**":
                requireNumeric("**", left, right);
                return left ** right;

            // == and != are valid across types in Python (they just yield False)
            case "==":  return left === right;
            case "!=":  return left !== right;

            case "<":   requireOrderable("<",  left, right); return left <  right;
            case ">":   requireOrderable(">",  left, right); return left >  right;
            case "<=":  requireOrderable("<=", left, right); return left <= right;
            case ">=":  requireOrderable(">=", left, right); return left >= right;
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
                "==": (a, b) => a === b,
                "!=": (a, b) => a !== b,
                "<":  (a, b) => a < b,
                ">":  (a, b) => a > b,
                "<=": (a, b) => a <= b,
                ">=": (a, b) => a >= b,
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
        if (this.op === "and") return this.values.every(v => v.evaluate(env));
        if (this.op === "or")  return this.values.some(v  => v.evaluate(env));
        return false;
    }
}

module.exports = { BinaryOperator, Compare, Bool, BoolOp };