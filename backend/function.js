// B4: NameError / typeName come from errors.js, which imports nothing —
// function.js stays dependency-light and free of circular requires.
const { NameError, typeName } = require('./errors');

// Signal thrown to unwind out of a function body when `return` runs.
// It is NOT an Error, so try/catch blocks must re-throw it (see flowstatement TaC).
class ReturnSignal {
    constructor(value) {
        this.value = value;
    }
}

// A registered, callable user-defined function.
// `body` is an array of already-built Statement nodes (converted in interpreter.js).
class UserFunction {
    constructor(name, params, body) {
        this.name = name;
        this.params = params;
        this.body = body;
        this.globalEnv = null;   // set at registration so functions can call each other
    }

    call(argValues) {
        if (argValues.length !== this.params.length) {
            // B4: Python raises TypeError for an arity mismatch, not a bare Error,
            // and words the two directions differently — see arityError.
            throw new TypeError(this.arityError(argValues.length));
        }

        // Fresh local scope, seeded with a snapshot of the global environment.
        // This gives the body READ access to globals — both other registered
        // functions (so nested / recursive / mutually recursive calls resolve)
        // and global variables, exactly like Python:
        //     x = 42
        //     def f(): print(x)   # sees the global x
        //
        // Because it's a copy (own properties on a flat env, not a prototype
        // chain — Call/variableReference test with Object.hasOwn), any assignment
        // inside the body writes to localEnv and merely SHADOWS the global for the
        // rest of the call, never mutating it. That matches Python's default:
        // a plain `x = ...` in a function is local unless declared `global x`
        // (which this language has no block for). Params bind last, so an argument
        // named like a global wins inside the body.
        // Object.assign copies the globals' own enumerable keys straight across
        // (both envs are null-proto, so there is nothing else to copy) without
        // the intermediate key array Object.keys(...) would allocate on every
        // call — which matters under recursion, where this runs per stack frame.
        const localEnv = Object.create(null);   // #20
        if (this.globalEnv) Object.assign(localEnv, this.globalEnv);
        for (let i = 0; i < this.params.length; i++) {
            localEnv[this.params[i]] = argValues[i];
        }

        try {
            for (const stmt of this.body) stmt.evaluate(localEnv);
        } catch (e) {
            if (e instanceof ReturnSignal) return e.value;
            throw e;
        }
        return undefined;   // function with no explicit return
    }

    // Reproduces CPython's two distinct arity messages for a call to this
    // function with `nArgs` positional arguments (which is known NOT to equal
    // the parameter count). Python distinguishes:
    //   too few  ->  f() missing 1 required positional argument: 'x'
    //                f() missing 2 required positional arguments: 'x' and 'y'
    //   too many ->  f() takes 1 positional argument but 2 were given
    //                f() takes 0 positional arguments but 1 was given
    // Note the singular/plural on "argument(s)" and the was/were on the given
    // count — CPython gets both right, so we do too.
    arityError(nArgs) {
        const nParams = this.params.length;

        if (nArgs < nParams) {
            // The unfilled parameters are the trailing ones the call never reached.
            const missing = this.params.slice(nArgs);
            const noun = missing.length === 1 ? 'argument' : 'arguments';
            return `${this.name}() missing ${missing.length} required positional ${noun}: ${quotedNameList(missing)}`;
        }

        const noun = nParams === 1 ? 'argument' : 'arguments';
        const verb = nArgs === 1 ? 'was' : 'were';
        return `${this.name}() takes ${nParams} positional ${noun} but ${nArgs} ${verb} given`;
    }
}

// Joins parameter names the way CPython lists them in a "missing argument"
// message: 'x'  |  'x' and 'y'  |  'a', 'b', and 'c' (Oxford comma at 3+).
function quotedNameList(names) {
    const quoted = names.map((n) => `'${n}'`);
    if (quoted.length === 1) return quoted[0];
    if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
    return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
}

// `return <expr>` — evaluates its value, then unwinds via ReturnSignal.
class Return {
    constructor(value) {
        this.value = value;   // an Expr
    }
    evaluate(env) {
        throw new ReturnSignal(this.value.evaluate(env));
    }
}

// `call` in an expression position — looks up the function by name,
// evaluates its arguments in the caller's env, then runs it.
class Call {
    constructor(name, args) {
        this.name = name;
        this.args = args;     // array of Expr
    }
    evaluate(env) {
        const fn = Object.hasOwn(env, this.name) ? env[this.name] : undefined;   // #20
        // B4: Python separates these two failures. An unknown name is a
        // NameError; a name that exists but isn't callable is a TypeError.
        if (fn === undefined) {
            throw new NameError(`Undefined function: name '${this.name}' is not defined`);
        }
        if (!(fn instanceof UserFunction)) {
            throw new TypeError(`'${typeName(fn)}' object is not callable`);
        }
        const argValues = this.args.map(a => a.evaluate(env));
        return fn.call(argValues);
    }
}

module.exports = { ReturnSignal, UserFunction, Return, Call };