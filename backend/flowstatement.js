// function.js imports nothing, so this direction is safe — no circular require.
const { ReturnSignal } = require('./function');
// errors.js imports nothing either.
const { ValueError } = require('./errors');

class Statement {
    evaluate() {}
}

class If extends Statement {
    // orelse holds the else statements. An elif chain reaches this class as a
    // single nested If inside orelse (see #25 in interpreter.js) — there is no
    // separate elif node, exactly as in Python's AST.
    constructor(test, body, orelse = []) {
        super();
        this.test = test;
        this.body = body;
        this.orelse = orelse ?? [];
    }
    evaluate(env) {
        if (this.test.evaluate(env)) {
            for (let i = 0; i < this.body.length; i++) {
                this.body[i].evaluate(env);
            }
        } else {
            for (let i = 0; i < this.orelse.length; i++) {
                this.orelse[i].evaluate(env);
            }
        }
    }
}

class Assign extends Statement {
    constructor(target, value) {
        super();
        this.target = target;
        this.value = value;
    }
    evaluate(env) {
        env[this.target] = this.value.evaluate(env);
    }
}

class ParallelAssign extends Statement {
    constructor(targets, values) {
        super();
        this.targets = targets;
        this.values = values;
    }
    evaluate(env) {
        if (this.targets.length !== this.values.length) {
            // Python's own wording, and a ValueError rather than a TypeError —
            // `a, b = 1, 2, 3` raises ValueError there too. errorType reaches the
            // frontend, so the category is worth getting right.
            throw new ValueError(
                this.values.length > this.targets.length
                    ? `too many values to unpack (expected ${this.targets.length})`
                    : `not enough values to unpack (expected ${this.targets.length}, got ${this.values.length})`
            );
        }
        // #20: no Object.prototype keys leaking into the staging object.
        // Staging also makes the assignment simultaneous: `a, b = b, a` swaps,
        // because every right-hand side is evaluated against the OLD env.
        const temp = Object.create(null);
        for (let i = 0; i < this.values.length; i++) {
            temp[this.targets[i]] = this.values[i].evaluate(env);
        }
        for (const key of Object.keys(temp)) {
            env[key] = temp[key];
        }
    }
}

// #16: Print writes into a per-run output array instead of monkey-patching
// the global console.log. If no array is supplied it falls back to console.log
// so the class still works standalone.
class Print extends Statement {
    constructor(value, output = null) {
        super();
        this.value = value;
        this.output = output;
    }
    evaluate(env) {
        const text = String(this.value.evaluate(env));
        if (this.output) this.output.push(text);
        else console.log(text);
    }
}

class ForRange extends Statement {
    constructor(target, start, stop, body) {
        super();
        this.target = target;
        this.start = start;
        this.stop = stop;
        this.body = body;
    }
    evaluate(env) {
        const startVal = this.start.evaluate(env);
        const stopVal = this.stop.evaluate(env);
        if (!Number.isInteger(startVal) || !Number.isInteger(stopVal)) {
            throw new TypeError("start and stop must be integers");
        }
        for (let i = startVal; i < stopVal; i++) {
            env[this.target] = i;
            for (const j of this.body) {
                j.evaluate(env);
            }
        }
    }
}

class For extends Statement {
    constructor(target, iter, body) {
        super();
        this.target = target;
        this.iter = iter;
        this.body = body;
    }
    evaluate(env) {
        const iterVal = this.iter.evaluate(env);
        if (!Array.isArray(iterVal)) {
            throw new TypeError("For loop requires an iterable array");
        }
        for (const item of iterVal) {
            env[this.target] = item;
            for (const stmt of this.body) {
                stmt.evaluate(env);
            }
        }
    }
}

const MAX_ITERATIONS = 10000;

class While extends Statement {
    constructor(test, body) {
        super();
        this.test = test;
        this.body = body;
    }
    evaluate(env) {
        let iterations = 0;
        while (this.test.evaluate(env)) {
            if (++iterations > MAX_ITERATIONS) {
                throw new Error(`While loop exceeded ${MAX_ITERATIONS} iterations — possible infinite loop`);
            }
            for (const stmt of this.body) {
                stmt.evaluate(env);
            }
        }
    }
}

class TaC extends Statement {
    constructor(body, error, handler) {
        super();
        this.body = body;
        this.error = error;
        this.handler = handler;
    }
    evaluate(env) {
        try {
            for (const stmt of this.body) {
                stmt.evaluate(env);
            }
        } catch (e) {
            // #15: a `return` inside try is a control-flow signal, not an error.
            // Without this the catch block swallows it and the function never returns.
            if (e instanceof ReturnSignal) throw e;

            // A3: an Error object serializes to {} through res.json(), so the
            // catch variable showed as an empty object in the variables panel.
            // Bind the message string — this also makes `print(error)` behave
            // like Python's `print(err)`.
            env[this.error] = e instanceof Error ? e.message : String(e);
            for (const stmt of this.handler) {
                stmt.evaluate(env);
            }
        }
    }
}

// #14: lets a bare calculation / logic / call sit in a statement slot.
// A user may call a function purely for its side effects.
class ExpressionStatement extends Statement {
    constructor(expression) {
        super();
        this.expression = expression;
    }
    evaluate(env) {
        this.expression.evaluate(env);
    }
}

module.exports = {
    Statement, If, Assign, ParallelAssign, Print,
    ForRange, For, While, TaC, ExpressionStatement
};