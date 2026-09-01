// Regression suite for the frontend-integration fixes.
// Run with:  node test.js
// Exits non-zero if anything fails, so it can gate a commit.

const { runProgram, validateName } = require('./interpreter');
const { parse } = require('./parser');

let pass = 0, fail = 0;

const lit = (dataType, value) => ({ type: 'literal', dataType, value });
const ref = (name) => ({ type: 'variableReference', name });
const calc = (left, operator, right) => ({ type: 'calculation', left, operator, right });
const logic = (left, operator, right) => ({ type: 'logic', left, operator, right });
const call = (name, args = []) => ({ type: 'call', name, args });

function eq(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    }
}
function noErr(errs) {
    if (errs.length) throw new Error('unexpected errors: ' + JSON.stringify(errs));
}

function t(label, program, check) {
    let r;
    try {
        r = runProgram(program);
    } catch (e) {
        console.log(`FAIL  ${label} — runProgram threw: ${e.message}`);
        fail++;
        return;
    }
    const errs = r.results.filter(x => x.status === 'error');
    try {
        check(r, errs);
        console.log(`PASS  ${label}`);
        pass++;
    } catch (e) {
        console.log(`FAIL  ${label} — ${e.message}`);
        console.log('        ', JSON.stringify({ variables: r.variables, output: r.output, errs }));
        fail++;
    }
}

function raw(label, fn) {
    try {
        fn();
        console.log(`PASS  ${label}`);
        pass++;
    } catch (e) {
        console.log(`FAIL  ${label} — ${e.message}`);
        fail++;
    }
}

// ===========================================================================
// #1  runProgram accepts the whole request body
// ===========================================================================
t('#1  accepts { functions, blocks }',
  { functions: [], blocks: [{ id: 1, type: 'variable', name: 'x', value: lit('int', 3) }] },
  (r, e) => { noErr(e); eq(r.variables.x, 3, 'x'); });

t('#1  still accepts a bare array (back-compat)',
  [{ id: 1, type: 'variable', name: 'x', value: lit('int', 7) }],
  (r, e) => { noErr(e); eq(r.variables.x, 7, 'x'); });

// ===========================================================================
// #2 / #3 / #4  literals
// ===========================================================================
t('#2  variable value is a nested literal block',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: lit('int', 3) }] },
  (r, e) => { noErr(e); eq(r.variables.x, 3, 'x'); });

t('#3  bool and float literals',
  { blocks: [
      { id: 1, type: 'variable', name: 'b', value: lit('bool', true) },
      { id: 2, type: 'variable', name: 'f', value: lit('float', 2.5) }] },
  (r, e) => { noErr(e); eq(r.variables.b, true, 'b'); eq(r.variables.f, 2.5, 'f'); });

t('#4  dataType "string" (frontend spelling)',
  { blocks: [
      { id: 1, type: 'variable', name: 's', value: lit('string', 'hi') },
      { id: 2, type: 'print', value: ref('s') }] },
  (r, e) => { noErr(e); eq(r.output, ['hi'], 'output'); });

t('#4  dataType "str" still accepted (back-compat)',
  { blocks: [{ id: 1, type: 'variable', name: 's', value: lit('str', 'hi') }] },
  (r, e) => { noErr(e); eq(r.variables.s, 'hi', 's'); });

// ===========================================================================
// #5  variableReference
// ===========================================================================
t('#5  variableReference reads from env',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 4) },
      { id: 2, type: 'variable', name: 'y', value: ref('x') }] },
  (r, e) => { noErr(e); eq(r.variables.y, 4, 'y'); });

t('#5  undefined variable is reported',
  { blocks: [{ id: 1, type: 'print', value: ref('nope') }] },
  (r, e) => { if (!e.length) throw new Error('expected an error'); });

// ===========================================================================
// #6  logic
// ===========================================================================
t('#6  logic as comparison',
  { blocks: [{ id: 1, type: 'variable', name: 'c', value: logic(lit('int', 2), '==', lit('int', 2)) }] },
  (r, e) => { noErr(e); eq(r.variables.c, true, 'c'); });

t('#6  logic as and/or',
  { blocks: [{ id: 1, type: 'variable', name: 'c', value: logic(lit('bool', true), 'and', lit('bool', false)) }] },
  (r, e) => { noErr(e); eq(r.variables.c, false, 'c'); });

// ===========================================================================
// #7 / #8  container field names
// ===========================================================================
t('#7  if reads children',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 1) },
      { id: 2, type: 'if', condition: logic(ref('x'), '==', lit('int', 1)),
        children: [{ id: 3, type: 'print', value: lit('string', 'yes') }] }] },
  (r, e) => { noErr(e); eq(r.output, ['yes'], 'output'); });

t('#7  if reads body (back-compat)',
  { blocks: [
      { id: 1, type: 'if', condition: lit('bool', true),
        body: [{ id: 2, type: 'print', value: lit('string', 'old') }] }] },
  (r, e) => { noErr(e); eq(r.output, ['old'], 'output'); });

t('#8  while reads children',
  { blocks: [
      { id: 1, type: 'variable', name: 'i', value: lit('int', 0) },
      { id: 2, type: 'while', condition: logic(ref('i'), '<', lit('int', 3)),
        children: [{ id: 3, type: 'variable', name: 'i', value: calc(ref('i'), '+', lit('int', 1)) }] }] },
  (r, e) => { noErr(e); eq(r.variables.i, 3, 'i'); });

t('#8  while iteration cap fires',
  { blocks: [{ id: 1, type: 'while', condition: lit('bool', true), children: [] }] },
  (r, e) => { if (!e.length || !/iterations/.test(e[0].message)) throw new Error('expected cap error'); });

// ===========================================================================
// #9  for is a range loop
// ===========================================================================
t('#9  for maps to ForRange via start/end',
  { blocks: [
      { id: 1, type: 'variable', name: 'sum', value: lit('int', 0) },
      { id: 2, type: 'for', variable: 'i', start: lit('int', 0), end: lit('int', 4),
        children: [{ id: 3, type: 'variable', name: 'sum', value: calc(ref('sum'), '+', ref('i')) }] }] },
  (r, e) => { noErr(e); eq(r.variables.sum, 6, 'sum of 0..3'); });

// ===========================================================================
// #10  tryCatch
// ===========================================================================
t('#10  tryCatch field names',
  { blocks: [{ id: 1, type: 'tryCatch', catchErrorName: 'error',
      tryChildren: [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 1), '/', lit('int', 0)) }],
      catchChildren: [{ id: 3, type: 'print', value: lit('string', 'caught') }] }] },
  (r, e) => { noErr(e); eq(r.output, ['caught'], 'output'); });

// ===========================================================================
// #11 / #12 / #13  user-defined functions
// ===========================================================================
t('#11/#12  def + call + return',
  { functions: [{ id: 99, type: 'def', name: 'add', params: ['a', 'b'],
      children: [{ id: 100, type: 'return', value: calc(ref('a'), '+', ref('b')) }] }],
    blocks: [{ id: 1, type: 'variable', name: 'r',
      value: { type: 'call', functionId: 99, name: 'add', paramNames: ['a', 'b'],
               args: [lit('int', 2), lit('int', 3)] } }] },
  (r, e) => { noErr(e); eq(r.variables.r, 5, 'r'); });

t('#12  arity mismatch is reported',
  { functions: [{ id: 99, type: 'def', name: 'add', params: ['a', 'b'], children: [] }],
    blocks: [{ id: 1, type: 'variable', name: 'r', value: call('add', [lit('int', 1)]) }] },
  (r, e) => { if (!e.length || !/missing 1 required positional argument: 'b'/.test(e[0].message)) throw new Error('expected arity error'); });

t('#13  mutual recursion (registration precedes execution)',
  { functions: [
      { id: 1, type: 'def', name: 'isEven', params: ['n'], children: [
          { id: 2, type: 'if', condition: logic(ref('n'), '==', lit('int', 0)),
            children: [{ id: 3, type: 'return', value: lit('bool', true) }] },
          { id: 4, type: 'return', value: call('isOdd', [calc(ref('n'), '-', lit('int', 1))]) }] },
      { id: 5, type: 'def', name: 'isOdd', params: ['n'], children: [
          { id: 6, type: 'if', condition: logic(ref('n'), '==', lit('int', 0)),
            children: [{ id: 7, type: 'return', value: lit('bool', false) }] },
          { id: 8, type: 'return', value: call('isEven', [calc(ref('n'), '-', lit('int', 1))]) }] }],
    blocks: [{ id: 9, type: 'variable', name: 'out', value: call('isEven', [lit('int', 6)]) }] },
  (r, e) => { noErr(e); eq(r.variables.out, true, 'isEven(6)'); });

// ===========================================================================
// #14  expression statements
// ===========================================================================
t('#14  standalone call runs for its side effect',
  { functions: [{ id: 99, type: 'def', name: 'shout', params: [],
      children: [{ id: 100, type: 'print', value: lit('string', 'side effect') }] }],
    blocks: [{ id: 1, type: 'call', name: 'shout', args: [] }] },
  (r, e) => { noErr(e); eq(r.output, ['side effect'], 'output'); });

t('#14  standalone calculation is legal',
  { blocks: [{ id: 1, type: 'calculation', left: lit('int', 1), operator: '+', right: lit('int', 2) }] },
  (r, e) => noErr(e));

// ===========================================================================
// #15  ReturnSignal survives try/catch
// ===========================================================================
t('#15  return inside try is not swallowed',
  { functions: [{ id: 99, type: 'def', name: 'f', params: [], children: [
      { id: 100, type: 'tryCatch', catchErrorName: 'err',
        tryChildren: [{ id: 101, type: 'return', value: lit('int', 5) }],
        catchChildren: [{ id: 102, type: 'return', value: lit('int', -1) }] },
      { id: 103, type: 'return', value: lit('int', 999) }] }],
    blocks: [{ id: 1, type: 'variable', name: 'v', value: call('f') }] },
  (r, e) => { noErr(e); eq(r.variables.v, 5, 'v (999 would mean the signal was swallowed)'); });

// ===========================================================================
// #16  console.log is never hijacked
// ===========================================================================
raw('#16  console.log survives a crashing run', () => {
    const before = console.log;
    try { runProgram({ blocks: [{ type: 'bogus' }] }); } catch (_) { /* ignore */ }
    if (console.log !== before) throw new Error('console.log left patched');
});

raw('#16  two runs do not share output', () => {
    const a = runProgram({ blocks: [{ id: 1, type: 'print', value: lit('string', 'A') }] });
    const b = runProgram({ blocks: [{ id: 1, type: 'print', value: lit('string', 'B') }] });
    eq(a.output, ['A'], 'run A');
    eq(b.output, ['B'], 'run B');
});

// ===========================================================================
// #18 / #19  parser-path correctness
// ===========================================================================
raw('#18  chained comparison is Python-style', () => {
    const env = Object.create(null);
    eq(parse('3 < 2 < 1').evaluate(env), false, '3 < 2 < 1');
    eq(parse('1 < 2 < 3').evaluate(env), true, '1 < 2 < 3');
});

raw('#19  and/or short-circuit', () => {
    const env = Object.create(null);
    eq(parse('false and 1 / 0').evaluate(env), false, 'and short-circuits');
    eq(parse('true or 1 / 0').evaluate(env), true, 'or short-circuits');
});

// ===========================================================================
// #20  prototype pollution
// ===========================================================================
t('#20  prototype keys are not defined variables',
  { blocks: [{ id: 1, type: 'print', value: ref('constructor') }] },
  (r, e) => { if (!e.length) throw new Error('"constructor" resolved as a variable'); });

raw('#20  parser rejects prototype keys too', () => {
    const env = Object.create(null);
    let threw = false;
    try { parse('toString').evaluate(env); } catch (_) { threw = true; }
    if (!threw) throw new Error('"toString" resolved as a variable');
});

// ===========================================================================
// #21  no circular JSON
// ===========================================================================
t('#21  result is JSON-serializable and functions are filtered out',
  { functions: [{ id: 99, type: 'def', name: 'f', params: [], children: [] }],
    blocks: [{ id: 1, type: 'variable', name: 'x', value: lit('int', 1) }] },
  (r) => {
      JSON.stringify(r);
      if ('f' in r.variables) throw new Error('UserFunction leaked into variables');
  });

// ===========================================================================
// A1  parser can call functions
// ===========================================================================
t('A1  free-form call with arguments',
  { functions: [{ id: 99, type: 'def', name: 'add', params: ['a', 'b'],
      children: [{ id: 100, type: 'return', value: calc(ref('a'), '+', ref('b')) }] }],
    blocks: [{ id: 1, type: 'variable', name: 'r', value: { type: 'expression', value: 'add(2, 3)' } }] },
  (r, e) => { noErr(e); eq(r.variables.r, 5, 'add(2, 3)'); });

t('A1  call inside a free-form condition',
  { functions: [{ id: 99, type: 'def', name: 'add', params: ['a', 'b'],
      children: [{ id: 100, type: 'return', value: calc(ref('a'), '+', ref('b')) }] }],
    blocks: [
      { id: 1, type: 'if', condition: 'add(2, 3) > 4',
        children: [{ id: 2, type: 'print', value: lit('string', 'bigger') }] }] },
  (r, e) => { noErr(e); eq(r.output, ['bigger'], 'output'); });

t('A1  zero-argument call',
  { functions: [{ id: 99, type: 'def', name: 'five', params: [],
      children: [{ id: 100, type: 'return', value: lit('int', 5) }] }],
    blocks: [{ id: 1, type: 'variable', name: 'r', value: { type: 'expression', value: 'five()' } }] },
  (r, e) => { noErr(e); eq(r.variables.r, 5, 'five()'); });

t('A1  nested and recursive calls in a free-form string',
  { functions: [{ id: 99, type: 'def', name: 'fact', params: ['n'], children: [
      { id: 100, type: 'if', condition: logic(ref('n'), '<=', lit('int', 1)),
        children: [{ id: 101, type: 'return', value: lit('int', 1) }] },
      { id: 102, type: 'return', value: 'n * fact(n - 1)' }] }],
    blocks: [{ id: 1, type: 'variable', name: 'r', value: { type: 'expression', value: 'fact(5) + fact(3)' } }] },
  (r, e) => { noErr(e); eq(r.variables.r, 126, '120 + 6'); });

raw('A1  call to an unknown function reports clearly', () => {
    const env = Object.create(null);
    let msg = '';
    try { parse('nope(1)').evaluate(env); } catch (e) { msg = e.message; }
    if (!/Undefined function/.test(msg)) throw new Error(`unclear message: ${msg}`);
});

raw('A1  parentheses still group expressions', () => {
    const env = Object.create(null);
    eq(parse('(2 + 3) * 4').evaluate(env), 20, 'grouping');
});

// ===========================================================================
// A2  modulo by zero
// ===========================================================================
t('A2  modulo by zero throws instead of yielding NaN',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: calc(lit('int', 5), '%', lit('int', 0)) }] },
  (r, e) => {
      if (!e.length) throw new Error('expected an error');
      if (e[0].errorType !== 'ZeroDivisionError') throw new Error(`errorType ${e[0].errorType}`);
      // Python's exact wording, lowercase, for `5 % 0`.
      if (!/integer modulo by zero/.test(e[0].message)) throw new Error(`message ${e[0].message}`);
  });

t('A2  normal modulo still works',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: calc(lit('int', 7), '%', lit('int', 3)) }] },
  (r, e) => { noErr(e); eq(r.variables.x, 1, '7 % 3'); });

// ===========================================================================
// A3  a typed catch matches its own error, not a generic one listed first
// ===========================================================================
t('A3  ZeroDivisionError is caught by its own clause, not a NameError clause ahead of it',
  { blocks: [{ id: 1, type: 'tryCatch',
      tryChildren: [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 1), '/', lit('int', 0)) }],
      catches: [
          { id: 10, errorType: 'NameError', children: [{ id: 3, type: 'print', value: lit('string', 'name') }] },
          { id: 11, errorType: 'ZeroDivisionError', children: [{ id: 4, type: 'print', value: lit('string', 'zero') }] },
      ] }] },
  (r, e) => { noErr(e); eq(r.output, ['zero'], 'printed message'); });

// ===========================================================================
// #22 / #23  chained calculation and comparison expressions
// ===========================================================================
const chain = (first, ...pairs) => ({
    type: 'calculationChain', first,
    operations: pairs.map(([operator, value]) => ({ operator, value })),
});
const cmpChain = (first, ...pairs) => ({
    type: 'comparisonChain', first,
    comparisons: pairs.map(([operator, right]) => ({ operator, right })),
});

t('#22  calculation chain uses Python precedence, not left-to-right',
  { blocks: [{ id: 1, type: 'variable', name: 'x',
      value: chain(lit('int', 2), ['+', lit('int', 3)], ['*', lit('int', 4)]) }] },
  (r, e) => { noErr(e); eq(r.variables.x, 14, '2 + 3 * 4 (left-to-right would be 20)'); });

t('#22  calculation chain agrees with the free-form parser',
  { blocks: [
      { id: 1, type: 'variable', name: 'a',
        value: chain(lit('int', 10), ['-', lit('int', 2)], ['*', lit('int', 3)], ['+', lit('int', 1)]) },
      { id: 2, type: 'variable', name: 'b', value: { type: 'expression', value: '10 - 2 * 3 + 1' } }] },
  (r, e) => { noErr(e); eq(r.variables.a, r.variables.b, 'block form vs parsed form'); eq(r.variables.a, 5, 'value'); });

t('#22  same-precedence operators stay left-associative',
  { blocks: [{ id: 1, type: 'variable', name: 'x',
      value: chain(lit('int', 20), ['/', lit('int', 2)], ['/', lit('int', 5)]) }] },
  (r, e) => { noErr(e); eq(r.variables.x, 2, '(20 / 2) / 5, not 20 / (2 / 5)'); });

t('#23  comparison chain is Python-style',
  { blocks: [
      { id: 1, type: 'variable', name: 'lo', value: cmpChain(lit('int', 3), ['<', lit('int', 2)], ['<', lit('int', 1)]) },
      { id: 2, type: 'variable', name: 'hi', value: cmpChain(lit('int', 1), ['<', lit('int', 2)], ['<', lit('int', 3)]) }] },
  (r, e) => { noErr(e); eq(r.variables.lo, false, '3 < 2 < 1'); eq(r.variables.hi, true, '1 < 2 < 3'); });

t('#23  a chain works as an if condition',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 5) },
      { id: 2, type: 'if', condition: cmpChain(lit('int', 0), ['<', ref('n')], ['<', lit('int', 10)]),
        children: [{ id: 3, type: 'print', value: lit('string', 'in range') }], elifBranches: [], elseChildren: null }] },
  (r, e) => { noErr(e); eq(r.output, ['in range'], 'output'); });

t('#23  a chain is legal as a bare statement',
  { blocks: [{ id: 1, ...chain(lit('int', 1), ['+', lit('int', 2)], ['+', lit('int', 3)]) }] },
  (r, e) => noErr(e));

// ===========================================================================
// #24  parallel assignment
// ===========================================================================
t('#24  parallelAssign reads the frontend field name `targets`',
  { blocks: [{ id: 1, type: 'parallelAssign', targets: ['a', 'b'], values: [lit('int', 1), lit('int', 2)] }] },
  (r, e) => { noErr(e); eq(r.variables.a, 1, 'a'); eq(r.variables.b, 2, 'b'); });

t('#24  parallelAssign still reads `names` (back-compat)',
  { blocks: [{ id: 1, type: 'parallelAssign', names: ['a', 'b'], values: [lit('int', 1), lit('int', 2)] }] },
  (r, e) => { noErr(e); eq(r.variables.a, 1, 'a'); eq(r.variables.b, 2, 'b'); });

t('#24  assignment is simultaneous, so a swap works',
  { blocks: [
      { id: 1, type: 'variable', name: 'a', value: lit('int', 1) },
      { id: 2, type: 'variable', name: 'b', value: lit('int', 2) },
      { id: 3, type: 'parallelAssign', targets: ['a', 'b'], values: [ref('b'), ref('a')] }] },
  (r, e) => { noErr(e); eq(r.variables.a, 2, 'a'); eq(r.variables.b, 1, 'b'); });

t('#24  count mismatch reports Python-style',
  { blocks: [{ id: 1, type: 'parallelAssign', targets: ['a', 'b'], values: [lit('int', 1)] }] },
  (r, e) => {
      if (!e.length) throw new Error('expected an error');
      eq(e[0].errorType, 'ValueError', 'errorType');
      if (!/not enough values to unpack/.test(e[0].message)) throw new Error(`message: ${e[0].message}`);
  });

t('#24  too many values reports Python-style',
  { blocks: [{ id: 1, type: 'parallelAssign', targets: ['a'], values: [lit('int', 1), lit('int', 2)] }] },
  (r, e) => {
      if (!e.length || !/too many values to unpack/.test(e[0].message)) throw new Error('expected unpack error');
  });

t('#24  an empty target name is rejected',
  { blocks: [{ id: 1, type: 'parallelAssign', targets: ['a', ''], values: [lit('int', 1), lit('int', 2)] }] },
  (r, e) => { if (!e.length || !/cannot be empty/.test(e[0].message)) throw new Error('expected empty-name error'); });

t('#24  values are full expressions, not just literals',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 4) },
      { id: 2, type: 'parallelAssign', targets: ['double', 'isBig'],
        values: [calc(ref('n'), '*', lit('int', 2)), logic(ref('n'), '>', lit('int', 3))] }] },
  (r, e) => { noErr(e); eq(r.variables.double, 8, 'double'); eq(r.variables.isBig, true, 'isBig'); });

// ===========================================================================
// #25  elif / else
// ===========================================================================
const ifBlock = (id, condition, children, elifBranches = [], elseChildren = null) =>
    ({ id, type: 'if', condition, children, elifBranches, elseChildren });
const say = (id, text) => ({ id, type: 'print', value: lit('string', text) });

function grade(n) {
    return {
        blocks: [
            { id: 1, type: 'variable', name: 'n', value: lit('int', n) },
            ifBlock(2, logic(ref('n'), '>=', lit('int', 90)), [say(3, 'A')], [
                { id: 4, condition: logic(ref('n'), '>=', lit('int', 80)), children: [say(5, 'B')] },
                { id: 6, condition: logic(ref('n'), '>=', lit('int', 70)), children: [say(7, 'C')] },
            ], [say(8, 'F')]),
        ],
    };
}

t('#25  first branch wins',      grade(95), (r, e) => { noErr(e); eq(r.output, ['A'], 'output'); });
t('#25  first elif wins',        grade(85), (r, e) => { noErr(e); eq(r.output, ['B'], 'output'); });
t('#25  second elif wins',       grade(75), (r, e) => { noErr(e); eq(r.output, ['C'], 'output'); });
t('#25  else is the fallback',   grade(20), (r, e) => { noErr(e); eq(r.output, ['F'], 'output'); });

t('#25  exactly one branch runs when several conditions are true',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 100) },
      ifBlock(2, logic(ref('n'), '>', lit('int', 10)), [say(3, 'first')], [
          { id: 4, condition: logic(ref('n'), '>', lit('int', 20)), children: [say(5, 'second')] },
      ], [say(6, 'else')])] },
  (r, e) => { noErr(e); eq(r.output, ['first'], 'only the first true branch'); });

t('#25  elif with no else falls through to nothing',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 0) },
      ifBlock(2, logic(ref('n'), '==', lit('int', 1)), [say(3, 'one')], [
          { id: 4, condition: logic(ref('n'), '==', lit('int', 2)), children: [say(5, 'two')] },
      ])] },
  (r, e) => { noErr(e); eq(r.output, [], 'nothing printed'); });

t('#25  a later elif condition is not evaluated once one matches',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 0) },
      ifBlock(2, logic(ref('n'), '==', lit('int', 0)), [say(3, 'zero')], [
          // 10 / n would be a ZeroDivisionError if this condition were reached
          { id: 4, condition: logic(calc(lit('int', 10), '/', ref('n')), '>', lit('int', 1)),
            children: [say(5, 'unreachable')] },
      ], [say(6, 'else')])] },
  (r, e) => { noErr(e); eq(r.output, ['zero'], 'output'); });

t('#25  elseChildren: null is the same as no else',
  { blocks: [ifBlock(1, lit('bool', false), [say(2, 'body')], [], null)] },
  (r, e) => { noErr(e); eq(r.output, [], 'nothing printed'); });

t('#25  free-form string conditions work in elif branches',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 5) },
      ifBlock(2, 'n > 100', [say(3, 'huge')], [
          { id: 4, condition: 'n > 3 and n < 10', children: [say(5, 'medium')] },
      ], [say(6, 'small')])] },
  (r, e) => { noErr(e); eq(r.output, ['medium'], 'output'); });

t('#25  branches nest and see the same env',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 4) },
      ifBlock(2, logic(ref('n'), '<', lit('int', 0)), [say(3, 'negative')], [
          { id: 4, condition: logic(ref('n'), '>', lit('int', 0)), children: [
              ifBlock(5, logic(calc(ref('n'), '%', lit('int', 2)), '==', lit('int', 0)),
                  [{ id: 6, type: 'variable', name: 'kind', value: lit('string', 'even') }],
                  [], [{ id: 7, type: 'variable', name: 'kind', value: lit('string', 'odd') }]),
          ] },
      ], [say(8, 'zero')])] },
  (r, e) => { noErr(e); eq(r.variables.kind, 'even', 'kind'); });

t('#25  an error inside an elif branch is reported against the if block',
  { blocks: [
      { id: 1, type: 'variable', name: 'n', value: lit('int', 2) },
      ifBlock(2, logic(ref('n'), '==', lit('int', 1)), [say(3, 'one')], [
          { id: 4, condition: logic(ref('n'), '==', lit('int', 2)),
            children: [{ id: 5, type: 'print', value: ref('missing') }] },
      ])] },
  (r, e) => {
      if (!e.length) throw new Error('expected an error');
      eq(e[0].id, 2, 'reported id');
      eq(e[0].errorType, 'NameError', 'errorType');
  });

t('#25  elif works the same inside a function body',
  { functions: [{ id: 99, type: 'def', name: 'sign', params: ['n'], children: [
      ifBlock(100, logic(ref('n'), '>', lit('int', 0)), [{ id: 101, type: 'return', value: lit('int', 1) }], [
          { id: 102, condition: logic(ref('n'), '<', lit('int', 0)),
            children: [{ id: 103, type: 'return', value: lit('int', -1) }] },
      ], [{ id: 104, type: 'return', value: lit('int', 0) }])] }],
    blocks: [
      { id: 1, type: 'variable', name: 'a', value: call('sign', [lit('int', 7)]) },
      { id: 2, type: 'variable', name: 'b', value: call('sign', [lit('int', -7)]) },
      { id: 3, type: 'variable', name: 'c', value: call('sign', [lit('int', 0)]) }] },
  (r, e) => { noErr(e); eq(r.variables.a, 1, 'a'); eq(r.variables.b, -1, 'b'); eq(r.variables.c, 0, 'c'); });

// ===========================================================================
// Global scope: a function body can READ global variables, like Python.
// ===========================================================================
t('G1  a function can read a global variable',
  { functions: [{ id: 99, type: 'def', name: 'showX', params: [],
      children: [{ id: 100, type: 'print', value: ref('x') }] }],
    blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 42) },
      { id: 2, type: 'call', name: 'showX', args: [] }] },
  (r, e) => { noErr(e); eq(r.output[0], '42', 'printed global x'); });

t('G1  a global read works even in a returned expression',
  { functions: [{ id: 99, type: 'def', name: 'plusX', params: ['n'],
      children: [{ id: 100, type: 'return', value: calc(ref('n'), '+', ref('x')) }] }],
    blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 10) },
      { id: 2, type: 'variable', name: 'r', value: call('plusX', [lit('int', 5)]) }] },
  (r, e) => { noErr(e); eq(r.variables.r, 15, 'n + x'); });

t('G1  assigning inside a function shadows, does not mutate the global',
  { functions: [{ id: 99, type: 'def', name: 'setX', params: [],
      children: [{ id: 100, type: 'assign', name: 'x', value: lit('int', 99) }] }],
    blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 42) },
      { id: 2, type: 'call', name: 'setX', args: [] }] },
  (r, e) => { noErr(e); eq(r.variables.x, 42, 'global x unchanged'); });

t('G1  a parameter wins over a same-named global inside the body',
  { functions: [{ id: 99, type: 'def', name: 'echo', params: ['x'],
      children: [{ id: 100, type: 'print', value: ref('x') }] }],
    blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 42) },
      { id: 2, type: 'call', name: 'echo', args: [lit('int', 7)] }] },
  (r, e) => { noErr(e); eq(r.output[0], '7', 'param shadows global'); });

// ===========================================================================
// #26  Variable naming rules — illegal identifiers are a build-time SyntaxError,
//      with Python's wording, exactly as CPython rejects them at compile time.
// ===========================================================================

// The validator in isolation, one case per rule.
raw('#26  validator: a bare number is a literal', () => {
    let m = ''; try { validateName('5'); } catch (e) { m = e.name + ':' + e.message; }
    if (m !== 'SyntaxError:cannot assign to literal') throw new Error(`got ${m}`);
});
raw('#26  validator: a name cannot start with a digit', () => {
    let m = ''; try { validateName('1x'); } catch (e) { m = e.name + ':' + e.message; }
    if (m !== 'SyntaxError:invalid decimal literal') throw new Error(`got ${m}`);
});
raw('#26  validator: a reserved keyword is invalid syntax', () => {
    let m = ''; try { validateName('for'); } catch (e) { m = e.name + ':' + e.message; }
    if (m !== 'SyntaxError:invalid syntax') throw new Error(`got ${m}`);
});
raw('#26  validator: a constant reports "cannot assign to X"', () => {
    let m = ''; try { validateName('True'); } catch (e) { m = e.name + ':' + e.message; }
    if (m !== 'SyntaxError:cannot assign to True') throw new Error(`got ${m}`);
});
raw('#26  validator: the language\'s lowercase booleans are literals too', () => {
    let m = ''; try { validateName('true'); } catch (e) { m = e.name + ':' + e.message; }
    if (m !== 'SyntaxError:cannot assign to true') throw new Error(`got ${m}`);
});
raw('#26  validator: a stray character is invalid syntax', () => {
    for (const bad of ['a-b', 'my var', 'x!']) {
        let m = ''; try { validateName(bad); } catch (e) { m = e.name + ':' + e.message; }
        if (m !== 'SyntaxError:invalid syntax') throw new Error(`${bad} -> ${m}`);
    }
});
raw('#26  validator: legal identifiers pass', () => {
    for (const ok of ['x', '_x', 'x9', 'myVar', '__dunder__', 'For', 'TRUE']) {
        validateName(ok); // must not throw (keywords are case-sensitive)
    }
});

t('#26  an illegal assignment target halts with SyntaxError',
  { blocks: [{ id: 1, type: 'variable', name: '1x', value: lit('int', 5) }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.status !== 'error') throw new Error('expected an error result');
      if (e.errorType !== 'SyntaxError') throw new Error(`errorType ${e.errorType}`);
      if (!/invalid decimal literal/.test(e.message)) throw new Error(`message ${e.message}`);
  });

t('#26  assigning to a keyword is rejected',
  { blocks: [{ id: 1, type: 'assign', name: 'while', value: lit('int', 1) }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'SyntaxError' || !/invalid syntax/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

t('#26  a parallel-assignment target follows the same rules',
  { blocks: [{ id: 1, type: 'parallelAssign', targets: ['ok', '2bad'], values: [lit('int', 1), lit('int', 2)] }] },
  (r, e) => { if (!e.length || !/invalid decimal literal/.test(e[0].message)) throw new Error('expected name error'); });

t('#26  a for-loop variable follows the same rules',
  { blocks: [{ id: 1, type: 'for', variable: 'True', start: lit('int', 0), end: lit('int', 3), children: [] }] },
  (r, e) => { if (!e.length || !/cannot assign to True/.test(e[0].message)) throw new Error('expected name error'); });

t('#26  an illegal function name fails at definition time',
  { functions: [{ id: 99, type: 'def', name: 'def', params: [], children: [] }], blocks: [] },
  (r) => {
      const e = r.results.find(x => x.id === 99);
      if (!e || e.errorType !== 'SyntaxError' || !/invalid syntax/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

t('#26  an illegal parameter name fails at definition time',
  { functions: [{ id: 99, type: 'def', name: 'ok', params: ['1st'], children: [] }], blocks: [] },
  (r, e) => { if (!e.length || !/invalid decimal literal/.test(e[0].message)) throw new Error('expected param error'); });

t('#26  a legal name still works end-to-end',
  { blocks: [{ id: 1, type: 'variable', name: '_total9', value: lit('int', 5) }] },
  (r, e) => { noErr(e); eq(r.variables._total9, 5, '_total9'); });

// ===========================================================================
// #27  Invalid references in a value slot — Python splits these two ways:
//      a syntactically illegal name is a build-time SyntaxError; a valid but
//      undefined name is a runtime NameError.
// ===========================================================================

t('#27  assigning from an undefined variable is a NameError',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: ref('y') }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'NameError' || !/name 'y' is not defined/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

t('#27  a digit-start reference name is a SyntaxError',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: ref('1y') }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'SyntaxError' || !/invalid decimal literal/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

t('#27  a reference with a stray character is a SyntaxError',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: ref('a-b') }] },
  (r, e) => { if (!e.length || e[0].errorType !== 'SyntaxError' || !/invalid syntax/.test(e[0].message)) throw new Error('expected syntax error'); });

t('#27  a keyword used as a reference is a SyntaxError',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: ref('for') }] },
  (r, e) => { if (!e.length || e[0].errorType !== 'SyntaxError' || !/invalid syntax/.test(e[0].message)) throw new Error('expected syntax error'); });

t('#27  an invalid reference in a condition is caught too',
  { blocks: [{ id: 1, type: 'if', condition: ref('1x'), children: [], elseChildren: [] }] },
  (r, e) => { if (!e.length || e[0].errorType !== 'SyntaxError' || !/invalid decimal literal/.test(e[0].message)) throw new Error('expected syntax error'); });

t('#27  a bad reference inside a print is caught',
  { blocks: [{ id: 1, type: 'print', value: ref('my var') }] },
  (r, e) => { if (!e.length || e[0].errorType !== 'SyntaxError') throw new Error('expected syntax error'); });

t('#27  a syntactically broken expression string is a SyntaxError',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: { type: 'expression', value: 'a b c' } }] },
  (r, e) => { if (!e.length || e[0].errorType !== 'SyntaxError') throw new Error('expected syntax error'); });

t('#27  a valid reference to a defined variable still works',
  { blocks: [
      { id: 1, type: 'variable', name: 'y', value: lit('int', 9) },
      { id: 2, type: 'variable', name: 'x', value: ref('y') }] },
  (r, e) => { noErr(e); eq(r.variables.x, 9, 'x = y'); });

// ===========================================================================
// #28  List / array literals — { type:'array', items:[ <value block>, ... ] }.
//      Each item is any value block, so a list may hold literals, variable
//      reads, calculations or nested lists. Printing a list uses Python's repr.
// ===========================================================================

const arr = (...items) => ({ type: 'array', items });

t('#28  a list of int literals assigns as a JS array',
  { blocks: [{ id: 99, type: 'variable', name: 'numbers',
      value: arr(lit('int', 1), lit('int', 2), lit('int', 3)) }] },
  (r, e) => { noErr(e); eq(r.variables.numbers, [1, 2, 3], 'numbers'); });

t('#28  an empty list is []',
  { blocks: [{ id: 1, type: 'variable', name: 'xs', value: { type: 'array' } }] },
  (r, e) => { noErr(e); eq(r.variables.xs, [], 'empty list'); });

t('#28  list elements can be variable reads and calculations',
  { blocks: [
      { id: 1, type: 'variable', name: 'a', value: lit('int', 10) },
      { id: 2, type: 'variable', name: 'ys',
        value: arr(ref('a'), calc(lit('int', 2), '+', lit('int', 3))) }] },
  (r, e) => { noErr(e); eq(r.variables.ys, [10, 5], 'ys'); });

t('#28  lists nest',
  { blocks: [{ id: 1, type: 'variable', name: 'grid',
      value: arr(arr(lit('int', 1), lit('int', 2)), arr(lit('int', 3))) }] },
  (r, e) => { noErr(e); eq(r.variables.grid, [[1, 2], [3]], 'grid'); });

t('#28  printing a list uses Python repr, strings double-quoted',
  { blocks: [{ id: 1, type: 'print',
      value: arr(lit('int', 1), lit('string', 'a'), lit('bool', true)) }] },
  (r, e) => { noErr(e); eq(r.output, ['[1, "a", True]'], 'repr'); });

t('#28  a bad element halts the list with its own error',
  { blocks: [{ id: 1, type: 'variable', name: 'z', value: arr(ref('missing')) }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'NameError' || !/name 'missing' is not defined/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

t('#28  a list drives a for-in loop',
  { blocks: [
      { id: 1, type: 'variable', name: 'items', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'forIn', variable: 'n', iterable: ref('items'),
        children: [{ id: 3, type: 'print', value: ref('n') }] }] },
  (r, e) => { noErr(e); eq(r.output, ['1', '2'], 'iterated'); });

// ===========================================================================
// #29  Set literals — { type:'set', items:[...] }. Duplicates collapse and
//      elements must be hashable; a mutable element is a TypeError.
// ===========================================================================

const set = (...items) => ({ type: 'set', items });

t('#29  a set assigns and serializes to its members',
  { blocks: [{ id: 200, type: 'variable', name: 'numbers',
      value: set(lit('int', 1), lit('int', 2), lit('int', 3)) }] },
  (r, e) => { noErr(e); eq(r.variables.numbers, [1, 2, 3], 'numbers'); });

t('#29  duplicate elements collapse',
  { blocks: [{ id: 1, type: 'variable', name: 's',
      value: set(lit('int', 1), lit('int', 2), lit('int', 2), lit('int', 1)) }] },
  (r, e) => { noErr(e); eq(r.variables.s, [1, 2], 'deduped'); });

t('#29  an empty set prints as set()',
  { blocks: [{ id: 1, type: 'print', value: { type: 'set' } }] },
  (r, e) => { noErr(e); eq(r.output, ['set()'], 'empty set repr'); });

t('#29  a set prints with braces',
  { blocks: [{ id: 1, type: 'print', value: set(lit('int', 1), lit('int', 2)) }] },
  (r, e) => { noErr(e); eq(r.output, ['{1, 2}'], 'set repr'); });

t('#29  a mutable (list) element is an unhashable TypeError',
  { blocks: [{ id: 1, type: 'variable', name: 'bad',
      value: set({ type: 'array', items: [lit('int', 1)] }) }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'TypeError' || !/unhashable type: 'list'/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

// ===========================================================================
// #30  Dict literals — { type:'dictionary', entries:[{ key, value }, ...] }.
//      Keys must be immutable; a mutable key raises KeyError (this language's
//      chosen wording). A repeated key is last-wins.
// ===========================================================================

const entry = (key, value) => ({ key, value });
const dict = (...entries) => ({ type: 'dictionary', entries });

t('#30  a dict assigns and serializes to an object',
  { blocks: [{ id: 300, type: 'variable', name: 'person', value: dict(
      entry(lit('string', 'name'), lit('string', 'Alex')),
      entry(lit('string', 'age'), lit('int', 20))) }] },
  (r, e) => { noErr(e); eq(r.variables.person, { name: 'Alex', age: 20 }, 'person'); });

t('#30  an empty dict prints as {}',
  { blocks: [{ id: 1, type: 'print', value: { type: 'dictionary' } }] },
  (r, e) => { noErr(e); eq(r.output, ['{}'], 'empty dict repr'); });

t('#30  a dict prints Python-style with double-quoted string keys/values',
  { blocks: [{ id: 1, type: 'print', value: dict(
      entry(lit('string', 'name'), lit('string', 'Alex')),
      entry(lit('string', 'age'), lit('int', 20))) }] },
  (r, e) => { noErr(e); eq(r.output, ['{"name": "Alex", "age": 20}'], 'dict repr'); });

t('#30  values may be computed expressions and variable reads',
  { blocks: [
      { id: 1, type: 'variable', name: 'base', value: lit('int', 10) },
      { id: 2, type: 'variable', name: 'd', value: dict(
          entry(lit('string', 'x'), ref('base')),
          entry(lit('string', 'y'), calc(lit('int', 2), '+', lit('int', 3)))) }] },
  (r, e) => { noErr(e); eq(r.variables.d, { x: 10, y: 5 }, 'computed dict'); });

t('#30  a repeated key is last-wins',
  { blocks: [{ id: 1, type: 'variable', name: 'd', value: dict(
      entry(lit('string', 'k'), lit('int', 1)),
      entry(lit('string', 'k'), lit('int', 2))) }] },
  (r, e) => { noErr(e); eq(r.variables.d, { k: 2 }, 'last wins'); });

t('#30  a non-string (int) key is allowed and serialized by its str',
  { blocks: [{ id: 1, type: 'variable', name: 'd', value: dict(
      entry(lit('int', 1), lit('string', 'one'))) }] },
  (r, e) => { noErr(e); eq(r.variables.d, { '1': 'one' }, 'int key'); });

t('#30  a mutable (list) key raises KeyError',
  { blocks: [{ id: 1, type: 'variable', name: 'bad', value: dict(
      entry({ type: 'array', items: [lit('int', 1)] }, lit('string', 'v'))) }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'KeyError' || !/unhashable type: 'list'/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

t('#30  a dict as a key is also rejected with KeyError',
  { blocks: [{ id: 1, type: 'variable', name: 'bad', value: dict(
      entry(dict(entry(lit('string', 'a'), lit('int', 1))), lit('int', 9))) }] },
  (r) => {
      const e = r.results.find(x => x.id === 1);
      if (!e || e.errorType !== 'KeyError' || !/unhashable type: 'dict'/.test(e.message)) {
          throw new Error(`unexpected: ${JSON.stringify(e)}`);
      }
  });

// ===========================================================================
// #31  Built-in functions — one block shape for all:
//      { type:'builtinCall', name, args:[ <value block>, ... ] }.
// ===========================================================================

const bi = (name, ...args) => ({ type: 'builtinCall', name, args });
// evaluate a single builtin expression by assigning it and reading the variable
const evalBI = (valueBlock) => ({ blocks: [{ id: 1, type: 'variable', name: 'r', value: valueBlock }] });
const printBI = (valueBlock) => ({ blocks: [{ id: 1, type: 'print', value: valueBlock }] });

// --- len / type -----------------------------------------------------------
t('#31  len of a list',   evalBI(bi('len', arr(lit('int', 1), lit('int', 2), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r, 3, 'len'); });
t('#31  len of a string', evalBI(bi('len', lit('string', 'hello'))),
  (r, e) => { noErr(e); eq(r.variables.r, 5, 'len str'); });
t('#31  len of a dict',   evalBI(bi('len', dict(entry(lit('string', 'a'), lit('int', 1))))),
  (r, e) => { noErr(e); eq(r.variables.r, 1, 'len dict'); });
t('#31  len of an int is a TypeError', evalBI(bi('len', lit('int', 5))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/has no len\(\)/.test(e[0].message)) throw new Error('expected len TypeError'); });
t('#31  type reports the type name', evalBI(bi('type', arr(lit('int', 1)))),
  (r, e) => { noErr(e); eq(r.variables.r, 'list', 'type'); });

// --- conversions ----------------------------------------------------------
t('#31  int truncates a float',        evalBI(bi('int', lit('float', 3.9))),  (r, e) => { noErr(e); eq(r.variables.r, 3, 'int'); });
t('#31  int parses a string',          evalBI(bi('int', lit('string', '42'))), (r, e) => { noErr(e); eq(r.variables.r, 42, 'int str'); });
t('#31  int of a bad string is ValueError', evalBI(bi('int', lit('string', 'abc'))),
  (r, e) => { if (!e.length || e[0].errorType !== 'ValueError' || !/invalid literal for int/.test(e[0].message)) throw new Error('expected ValueError'); });
t('#31  float of a string',            evalBI(bi('float', lit('string', '3.5'))), (r, e) => { noErr(e); eq(r.variables.r, 3.5, 'float'); });
t('#31  str of a list is its repr',    printBI(bi('str', arr(lit('int', 1), lit('int', 2)))), (r, e) => { noErr(e); eq(r.output, ['[1, 2]'], 'str'); });
t('#31  bool of an empty list is False', evalBI(bi('bool', { type: 'array' })), (r, e) => { noErr(e); eq(r.variables.r, false, 'bool'); });
t('#31  bool of a non-empty string is True', evalBI(bi('bool', lit('string', 'x'))), (r, e) => { noErr(e); eq(r.variables.r, true, 'bool'); });
t('#31  list of a string splits chars', evalBI(bi('list', lit('string', 'abc'))), (r, e) => { noErr(e); eq(r.variables.r, ['a', 'b', 'c'], 'list'); });
t('#31  tuple prints with parens',      printBI(bi('tuple', arr(lit('int', 1), lit('int', 2)))), (r, e) => { noErr(e); eq(r.output, ['(1, 2)'], 'tuple'); });
t('#31  a one-element tuple keeps the trailing comma', printBI(bi('tuple', arr(lit('int', 1)))), (r, e) => { noErr(e); eq(r.output, ['(1,)'], 'singleton tuple'); });
t('#31  type of a tuple is tuple',      evalBI(bi('type', bi('tuple', arr(lit('int', 1))))), (r, e) => { noErr(e); eq(r.variables.r, 'tuple', 'tuple type'); });
t('#31  set drops duplicates',          evalBI(bi('set', arr(lit('int', 1), lit('int', 1), lit('int', 2)))), (r, e) => { noErr(e); eq(r.variables.r, [1, 2], 'set'); });
t('#31  dict from a list of pairs',     evalBI(bi('dict', arr(arr(lit('string', 'a'), lit('int', 1)), arr(lit('string', 'b'), lit('int', 2))))),
  (r, e) => { noErr(e); eq(r.variables.r, { a: 1, b: 2 }, 'dict'); });

// --- numeric --------------------------------------------------------------
t('#31  abs of a negative',   evalBI(bi('abs', calc(lit('int', 0), '-', lit('int', 7)))), (r, e) => { noErr(e); eq(r.variables.r, 7, 'abs'); });
t('#31  abs of a string is a TypeError', evalBI(bi('abs', lit('string', 'x'))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected abs TypeError'); });
t('#31  round to nearest int',       evalBI(bi('round', lit('float', 3.4))),  (r, e) => { noErr(e); eq(r.variables.r, 3, 'round'); });
t('#31  round is half-to-even',      evalBI(bi('round', lit('float', 2.5))),  (r, e) => { noErr(e); eq(r.variables.r, 2, 'banker'); });
t('#31  round with digits',          evalBI(bi('round', lit('float', 3.14159), lit('int', 2))), (r, e) => { noErr(e); eq(r.variables.r, 3.14, 'round 2'); });

// --- aggregate ------------------------------------------------------------
t('#31  min of several values',  evalBI(bi('min', lit('int', 3), lit('int', 1), lit('int', 2))), (r, e) => { noErr(e); eq(r.variables.r, 1, 'min'); });
t('#31  max of a list',          evalBI(bi('max', arr(lit('int', 3), lit('int', 9), lit('int', 2)))), (r, e) => { noErr(e); eq(r.variables.r, 9, 'max'); });
t('#31  max compares lists lexicographically',
  evalBI(bi('max', arr(lit('int', 20), lit('int', 10)), arr(lit('int', 10), lit('int', 100)))),
  (r, e) => { noErr(e); eq(r.variables.r, [20, 10], 'list max'); });
t('#31  min of an empty sequence is a ValueError', evalBI(bi('min', { type: 'array' })),
  (r, e) => { if (!e.length || e[0].errorType !== 'ValueError' || !/empty sequence/.test(e[0].message)) throw new Error('expected empty ValueError'); });
t('#31  min of incomparable types is a TypeError', evalBI(bi('min', lit('int', 1), lit('string', 'a'))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected order TypeError'); });
t('#31  sum of a list',          evalBI(bi('sum', arr(lit('int', 1), lit('int', 2), lit('int', 3)))), (r, e) => { noErr(e); eq(r.variables.r, 6, 'sum'); });
t('#31  sum of an empty list is 0', evalBI(bi('sum', { type: 'array' })), (r, e) => { noErr(e); eq(r.variables.r, 0, 'sum empty'); });
t('#31  sorted returns a new sorted list', evalBI(bi('sorted', arr(lit('int', 3), lit('int', 1), lit('int', 2)))),
  (r, e) => { noErr(e); eq(r.variables.r, [1, 2, 3], 'sorted'); });
t('#31  sorted of a string sorts its chars', evalBI(bi('sorted', lit('string', 'cba'))),
  (r, e) => { noErr(e); eq(r.variables.r, ['a', 'b', 'c'], 'sorted str'); });

// --- misc -----------------------------------------------------------------
t('#31  builtins nest and compose', evalBI(bi('sum', bi('sorted', arr(lit('int', 3), lit('int', 1))))),
  (r, e) => { noErr(e); eq(r.variables.r, 4, 'nested'); });
t('#31  an unknown builtin is a NameError', evalBI(bi('frobnicate', lit('int', 1))),
  (r, e) => { if (!e.length || e[0].errorType !== 'NameError') throw new Error('expected NameError'); });
t('#31  wrong argument count is a TypeError', evalBI(bi('len', lit('int', 1), lit('int', 2))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/takes exactly 1 argument/.test(e[0].message)) throw new Error('expected argc TypeError'); });
t('#31  the len(numbers) example from the spec',
  { blocks: [
      { id: 1, type: 'variable', name: 'numbers', value: arr(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 100, type: 'variable', name: 'n', value: { id: 100, type: 'builtinCall', name: 'len',
          args: [{ id: 101, type: 'variableReference', name: 'numbers' }] } }] },
  (r, e) => { noErr(e); eq(r.variables.n, 3, 'len(numbers)'); });

// ===========================================================================
// #32  Runtime identity — id(), `is` / `is not`. The `id` fields in the block
//      JSON are editor ids; runtime identity is minted separately by the
//      interpreter. Equal immutable scalars share identity; separately built
//      lists/sets/dicts do not; assignment (and tuple() of a tuple) preserves
//      it. Tuple LITERALS with fully-immutable contents are the one exception
//      that intern like scalars (see interpreter.js's tuple case) — a tuple
//      built at runtime via tuple() is not.
// ===========================================================================

const isOp    = (left, right) => ({ type: 'logic', left, operator: 'is', right });
const isNotOp = (left, right) => ({ type: 'logic', left, operator: 'is not', right });
const tup     = (...items) => ({ type: 'tuple', items });

// (1) Equal scalar immutable values have the same identity.
t('#32  equal ints are the same object',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 2) },
      { id: 2, type: 'variable', name: 'y', value: lit('int', 2) },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 'x is y'); });

t('#32  equal strings are the same object',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('string', 'hello') },
      { id: 2, type: 'variable', name: 'y', value: lit('string', 'hello') },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 'str is'); });

t('#32  int, bool and string that look alike are distinct objects',
  { blocks: [
      { id: 1, type: 'variable', name: 'a', value: lit('int', 1) },
      { id: 2, type: 'variable', name: 'b', value: lit('bool', true) },
      { id: 3, type: 'variable', name: 'c', value: lit('string', '1') },
      { id: 4, type: 'print', value: isOp(ref('a'), ref('b')) },
      { id: 5, type: 'print', value: isOp(ref('a'), ref('c')) }] },
  (r, e) => { noErr(e); eq(r.output, ['False', 'False'], 'type keeps them apart'); });

// (2) Separately created equal lists have different identities;
// (8) == can be true while is is false.
t('#32  equal lists: == true but is false',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 3, type: 'print', value: { type: 'logic', left: ref('x'), operator: '==', right: ref('y') } },
      { id: 4, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True', 'False'], '== vs is'); });

// (3) Assignment preserves identity.
t('#32  y = x makes them the same list',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: ref('x') },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 'alias is'); });

// (4) Equal tuple LITERALS are canonicalized (interned), same educational
// model as int/str/bool — see interpreter.js's tuple case. == and is both
// hold here, deliberately unlike lists.
t('#32  equal tuple literals share identity (interned)',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: tup(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: tup(lit('int', 1), lit('int', 2)) },
      { id: 3, type: 'print', value: { type: 'logic', left: ref('x'), operator: '==', right: ref('y') } },
      { id: 4, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True', 'True'], 'tuple literal == and is'); });

// (4b) A tuple built at runtime via tuple() is NOT pooled with literals —
// two separate conversions of equal-valued lists stay distinct objects,
// exactly like the old list behavior above, even though their values are ==.
t('#32  tuple() of separately built lists: == true but is false',
  { blocks: [
      { id: 1, type: 'variable', name: 'a', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'b', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 3, type: 'variable', name: 'x', value: bi('tuple', ref('a')) },
      { id: 4, type: 'variable', name: 'y', value: bi('tuple', ref('b')) },
      { id: 5, type: 'print', value: { type: 'logic', left: ref('x'), operator: '==', right: ref('y') } },
      { id: 6, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True', 'False'], 'tuple() == but not is'); });

// (4c) A tuple literal is not pooled with a value-equal tuple() conversion
// either — interning is strictly literal-to-literal.
t('#32  a tuple literal and an == tuple() conversion are still distinct objects',
  { blocks: [
      { id: 1, type: 'variable', name: 'a', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'x', value: tup(lit('int', 1), lit('int', 2)) },
      { id: 3, type: 'variable', name: 'y', value: bi('tuple', ref('a')) },
      { id: 4, type: 'print', value: { type: 'logic', left: ref('x'), operator: '==', right: ref('y') } },
      { id: 5, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True', 'False'], 'literal vs conversion'); });

// (4d) A tuple literal containing a mutable list is never pooled, even
// though the outer tuple is immutable — the list inside is not.
t('#32  a tuple literal containing a list is not interned',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: tup(arr(lit('int', 1), lit('int', 2)), lit('int', 3)) },
      { id: 2, type: 'variable', name: 'y', value: tup(arr(lit('int', 1), lit('int', 2)), lit('int', 3)) },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['False'], 'mutable content disqualifies interning'); });

// (4e) Nested tuple literals intern recursively.
t('#32  nested tuple literals share identity too',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: tup(tup(lit('int', 1), lit('int', 2)), tup(lit('int', 3), lit('int', 4))) },
      { id: 2, type: 'variable', name: 'y', value: tup(tup(lit('int', 1), lit('int', 2)), tup(lit('int', 3), lit('int', 4))) },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 'nested literal tuples intern'); });

t('#32  a tuple assigned to another name keeps its identity',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: tup(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: ref('x') },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 'tuple alias is'); });

// (5) tuple(existingTuple) preserves identity; tuple(otherIterable) does not.
t('#32  tuple() of a tuple returns the same object',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: tup(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: bi('tuple', ref('x')) },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 'tuple(tuple) is'); });

t('#32  tuple() of a list builds a new tuple',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: tup(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: bi('tuple', arr(lit('int', 1), lit('int', 2))) },
      { id: 3, type: 'print', value: { type: 'logic', left: ref('x'), operator: '==', right: ref('y') } },
      { id: 4, type: 'print', value: isOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True', 'False'], 'tuple(list) not is'); });

// (6) id() returns the same ID for aliases, and is stable across calls.
t('#32  id() is equal for aliases and stable',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: ref('x') },
      { id: 3, type: 'variable', name: 'ix1', value: bi('id', ref('x')) },
      { id: 4, type: 'variable', name: 'ix2', value: bi('id', ref('x')) },
      { id: 5, type: 'variable', name: 'iy',  value: bi('id', ref('y')) }] },
  (r, e) => {
      noErr(e);
      if (typeof r.variables.ix1 !== 'number') throw new Error('id() should return a number');
      eq(r.variables.ix1, r.variables.ix2, 'stable across calls');
      eq(r.variables.ix1, r.variables.iy,  'equal for aliases');
  });

t('#32  id() differs for separately built mutable objects',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1)) },
      { id: 2, type: 'variable', name: 'y', value: arr(lit('int', 1)) },
      { id: 3, type: 'variable', name: 'same',
        value: { type: 'logic', left: bi('id', ref('x')), operator: '==', right: bi('id', ref('y')) } }] },
  (r, e) => { noErr(e); eq(r.variables.same, false, 'different ids'); });

t('#32  id() requires exactly one argument',
  { blocks: [{ id: 1, type: 'variable', name: 'r', value: bi('id') }] },
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/takes exactly 1 argument/.test(e[0].message)) throw new Error('expected argc TypeError'); });

// (7) is and is not return opposite Boolean results.
t('#32  is and is not are opposites (same object)',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: lit('int', 5) },
      { id: 2, type: 'variable', name: 'y', value: lit('int', 5) },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) },
      { id: 4, type: 'print', value: isNotOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['True', 'False'], 'is / is not'); });

t('#32  is and is not are opposites (distinct objects)',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1)) },
      { id: 2, type: 'variable', name: 'y', value: arr(lit('int', 1)) },
      { id: 3, type: 'print', value: isOp(ref('x'), ref('y')) },
      { id: 4, type: 'print', value: isNotOp(ref('x'), ref('y')) }] },
  (r, e) => { noErr(e); eq(r.output, ['False', 'True'], 'is / is not'); });

// ===========================================================================
// #33  min() / max() with one iterable or several arguments (already supported;
//      locked in here against regression, plus the required error cases).
// ===========================================================================

// (9) one iterable argument.
t('#33  max of one list argument',  evalBI(bi('max', arr(lit('int', 1), lit('int', 5), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r, 5, 'max([...])'); });
t('#33  min of one list argument',  evalBI(bi('min', arr(lit('int', 1), lit('int', 5), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r, 1, 'min([...])'); });

// (10) several arguments.
t('#33  max of several arguments',  evalBI(bi('max', lit('int', 1), lit('int', 5), lit('int', 3))),
  (r, e) => { noErr(e); eq(r.variables.r, 5, 'max(a,b,c)'); });
t('#33  min of several arguments',  evalBI(bi('min', lit('int', 4), lit('int', 2), lit('int', 9))),
  (r, e) => { noErr(e); eq(r.variables.r, 2, 'min(a,b,c)'); });

// (11) zero arguments.
t('#33  max of zero arguments is a TypeError', evalBI(bi('max')),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/at least 1 argument/.test(e[0].message)) throw new Error('expected zero-arg TypeError'); });
t('#33  min of zero arguments is a TypeError', evalBI(bi('min')),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/at least 1 argument/.test(e[0].message)) throw new Error('expected zero-arg TypeError'); });

// (12) empty iterable.
t('#33  max of an empty list is a ValueError', evalBI(bi('max', { type: 'array' })),
  (r, e) => { if (!e.length || e[0].errorType !== 'ValueError' || !/empty sequence/.test(e[0].message)) throw new Error('expected empty ValueError'); });
t('#33  min of an empty list is a ValueError', evalBI(bi('min', { type: 'array' })),
  (r, e) => { if (!e.length || e[0].errorType !== 'ValueError' || !/empty sequence/.test(e[0].message)) throw new Error('expected empty ValueError'); });

// non-iterable single argument.
t('#33  max of a single non-iterable is a TypeError', evalBI(bi('max', lit('int', 5))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/not iterable/.test(e[0].message)) throw new Error('expected not-iterable TypeError'); });

// ===========================================================================
// #34  collection helpers: reversed / all / any
// ===========================================================================
t('#34  reversed of a list', evalBI(bi('reversed', arr(lit('int', 1), lit('int', 2), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r, [3, 2, 1], 'reversed'); });
t('#34  all is true when every element is truthy', evalBI(bi('all', arr(lit('int', 1), lit('bool', true)))),
  (r, e) => { noErr(e); eq(r.variables.r, true, 'all true'); });
t('#34  all is false with a falsy element', evalBI(bi('all', arr(lit('int', 1), lit('int', 0)))),
  (r, e) => { noErr(e); eq(r.variables.r, false, 'all false'); });
t('#34  all of an empty list is true', evalBI(bi('all', { type: 'array' })),
  (r, e) => { noErr(e); eq(r.variables.r, true, 'all empty'); });
t('#34  any is true when one element is truthy', evalBI(bi('any', arr(lit('int', 0), lit('int', 5)))),
  (r, e) => { noErr(e); eq(r.variables.r, true, 'any true'); });
t('#34  any of an empty list is false', evalBI(bi('any', { type: 'array' })),
  (r, e) => { noErr(e); eq(r.variables.r, false, 'any empty'); });

// ===========================================================================
// #35  list.* methods — mutate the bound variable in place
// ===========================================================================
// A method statement runs for its side effect on the list variable `x`.
const withList = (methodBlock, items = [lit('int', 1), lit('int', 2), lit('int', 3)]) => ({
    blocks: [
        { id: 1, type: 'variable', name: 'x', value: { type: 'array', items } },
        { id: 2, ...methodBlock },
    ],
});

t('#35  list.append mutates in place', withList(bi('list.append', ref('x'), lit('int', 4))),
  (r, e) => { noErr(e); eq(r.variables.x, [1, 2, 3, 4], 'append'); });
t('#35  list.pop returns and removes the last element',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 2, type: 'variable', name: 'r', value: bi('list.pop', ref('x')) },
  ] },
  (r, e) => { noErr(e); eq(r.variables.r, 3, 'pop val'); eq(r.variables.x, [1, 2], 'pop rest'); });
t('#35  list.pop from an empty list is IndexError',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: { type: 'array' } },
      { id: 2, type: 'variable', name: 'r', value: bi('list.pop', ref('x')) },
  ] },
  (r, e) => { if (!e.length || e[0].errorType !== 'IndexError' || !/empty list/.test(e[0].message)) throw new Error('expected pop IndexError'); });
t('#35  list.insert places at an index', withList(bi('list.insert', ref('x'), lit('int', 1), lit('int', 9))),
  (r, e) => { noErr(e); eq(r.variables.x, [1, 9, 2, 3], 'insert'); });
t('#35  list.remove drops the first matching value', withList(bi('list.remove', ref('x'), lit('int', 2))),
  (r, e) => { noErr(e); eq(r.variables.x, [1, 3], 'remove'); });
t('#35  list.remove of an absent value is ValueError', withList(bi('list.remove', ref('x'), lit('int', 99))),
  (r, e) => { if (!e.length || e[0].errorType !== 'ValueError' || !/not in list/.test(e[0].message)) throw new Error('expected remove ValueError'); });
t('#35  list.extend appends every element',
  withList(bi('list.extend', ref('x'), arr(lit('int', 4), lit('int', 5)))),
  (r, e) => { noErr(e); eq(r.variables.x, [1, 2, 3, 4, 5], 'extend'); });
t('#35  list.index reports the position',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 7), lit('int', 8), lit('int', 9)) },
      { id: 2, type: 'variable', name: 'r', value: bi('list.index', ref('x'), lit('int', 8)) },
  ] },
  (r, e) => { noErr(e); eq(r.variables.r, 1, 'index'); });
t('#35  list.count tallies matches',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'r', value: bi('list.count', ref('x'), lit('int', 2)) },
  ] },
  (r, e) => { noErr(e); eq(r.variables.r, 2, 'count'); });
t('#35  list.sort orders in place',
  withList(bi('list.sort', ref('x')), [lit('int', 3), lit('int', 1), lit('int', 2)]),
  (r, e) => { noErr(e); eq(r.variables.x, [1, 2, 3], 'sort'); });
t('#35  list.reverse flips in place', withList(bi('list.reverse', ref('x'))),
  (r, e) => { noErr(e); eq(r.variables.x, [3, 2, 1], 'reverse'); });
t('#35  a list method on a non-list is a TypeError', evalBI(bi('list.append', lit('int', 5), lit('int', 1))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/requires a list/.test(e[0].message)) throw new Error('expected list TypeError'); });

// ===========================================================================
// #36  string.* methods — return new strings/lists, never mutate
// ===========================================================================
t('#36  string.upper', evalBI(bi('string.upper', lit('string', 'abc'))),
  (r, e) => { noErr(e); eq(r.variables.r, 'ABC', 'upper'); });
t('#36  string.lower', evalBI(bi('string.lower', lit('string', 'AbC'))),
  (r, e) => { noErr(e); eq(r.variables.r, 'abc', 'lower'); });
t('#36  string.strip trims whitespace', evalBI(bi('string.strip', lit('string', '  hi  '))),
  (r, e) => { noErr(e); eq(r.variables.r, 'hi', 'strip'); });
t('#36  string.split on whitespace by default', evalBI(bi('string.split', lit('string', 'a b  c'))),
  (r, e) => { noErr(e); eq(r.variables.r, ['a', 'b', 'c'], 'split ws'); });
t('#36  string.split on a separator', evalBI(bi('string.split', lit('string', 'a,b,c'), lit('string', ','))),
  (r, e) => { noErr(e); eq(r.variables.r, ['a', 'b', 'c'], 'split sep'); });
t('#36  string.join', evalBI(bi('string.join', lit('string', '-'), arr(lit('string', 'a'), lit('string', 'b')))),
  (r, e) => { noErr(e); eq(r.variables.r, 'a-b', 'join'); });
t('#36  string.join of a non-string element is a TypeError',
  evalBI(bi('string.join', lit('string', '-'), arr(lit('string', 'a'), lit('int', 2)))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError' || !/expected str instance/.test(e[0].message)) throw new Error('expected join TypeError'); });
t('#36  string.replace swaps all occurrences',
  evalBI(bi('string.replace', lit('string', 'aXaXa'), lit('string', 'X'), lit('string', '-'))),
  (r, e) => { noErr(e); eq(r.variables.r, 'a-a-a', 'replace'); });
t('#36  string.find returns the index', evalBI(bi('string.find', lit('string', 'hello'), lit('string', 'l'))),
  (r, e) => { noErr(e); eq(r.variables.r, 2, 'find'); });
t('#36  string.find returns -1 when absent', evalBI(bi('string.find', lit('string', 'hello'), lit('string', 'z'))),
  (r, e) => { noErr(e); eq(r.variables.r, -1, 'find absent'); });

// ===========================================================================
// #37  dict.* methods
// ===========================================================================
const d2 = () => dict(entry(lit('string', 'a'), lit('int', 1)), entry(lit('string', 'b'), lit('int', 2)));
t('#37  dict.keys', evalBI(bi('dict.keys', d2())),
  (r, e) => { noErr(e); eq(r.variables.r, ['a', 'b'], 'keys'); });
t('#37  dict.values', evalBI(bi('dict.values', d2())),
  (r, e) => { noErr(e); eq(r.variables.r, [1, 2], 'values'); });
t('#37  dict.items yields pairs', evalBI(bi('dict.items', d2())),
  (r, e) => { noErr(e); eq(r.variables.r, [['a', 1], ['b', 2]], 'items'); });
t('#37  dict.get returns the value', evalBI(bi('dict.get', d2(), lit('string', 'a'))),
  (r, e) => { noErr(e); eq(r.variables.r, 1, 'get hit'); });
t('#37  dict.get of a missing key returns None', evalBI(bi('dict.get', d2(), lit('string', 'z'))),
  (r, e) => { noErr(e); eq(r.variables.r, null, 'get miss'); });
t('#37  dict.update merges in place',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: dict(entry(lit('string', 'a'), lit('int', 1))) },
      { id: 2, type: 'builtinCall', name: 'dict.update', args: [ref('x'), dict(entry(lit('string', 'b'), lit('int', 2)))] },
  ] },
  (r, e) => { noErr(e); eq(r.variables.x, { a: 1, b: 2 }, 'update'); });
t('#37  dict.pop returns and removes',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: dict(entry(lit('string', 'a'), lit('int', 1)), entry(lit('string', 'b'), lit('int', 2))) },
      { id: 2, type: 'variable', name: 'r', value: bi('dict.pop', ref('x'), lit('string', 'a')) },
  ] },
  (r, e) => { noErr(e); eq(r.variables.r, 1, 'pop val'); eq(r.variables.x, { b: 2 }, 'pop rest'); });
t('#37  dict.pop of a missing key is KeyError', evalBI(bi('dict.pop', d2(), lit('string', 'z'))),
  (r, e) => { if (!e.length || e[0].errorType !== 'KeyError') throw new Error('expected pop KeyError'); });

// ===========================================================================
// #38  set.* methods
// ===========================================================================
const s3 = () => set(lit('int', 1), lit('int', 2), lit('int', 3));
t('#38  set.add mutates in place',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: set(lit('int', 1)) },
      { id: 2, type: 'builtinCall', name: 'set.add', args: [ref('x'), lit('int', 2)] },
  ] },
  (r, e) => { noErr(e); eq(r.variables.x.sort(), [1, 2], 'add'); });
t('#38  set.remove of a missing element is KeyError', evalBI(bi('set.remove', s3(), lit('int', 9))),
  (r, e) => { if (!e.length || e[0].errorType !== 'KeyError') throw new Error('expected remove KeyError'); });
t('#38  set.discard of a missing element is silent',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: set(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'builtinCall', name: 'set.discard', args: [ref('x'), lit('int', 9)] },
  ] },
  (r, e) => { noErr(e); eq(r.variables.x.sort(), [1, 2], 'discard'); });
t('#38  set.union', evalBI(bi('set.union', set(lit('int', 1), lit('int', 2)), set(lit('int', 2), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r.sort(), [1, 2, 3], 'union'); });
t('#38  set.intersection', evalBI(bi('set.intersection', set(lit('int', 1), lit('int', 2)), set(lit('int', 2), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r, [2], 'intersection'); });
t('#38  set.difference', evalBI(bi('set.difference', set(lit('int', 1), lit('int', 2)), set(lit('int', 2), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.variables.r, [1], 'difference'); });

// ===========================================================================
// #39  and / or return an OPERAND (Python), not a boolean
// ===========================================================================
// print(x and y) with x,y = 0,1 must show 0, not False.
t('#39  print(0 and 1) shows 0', printBI(logic(lit('int', 0), 'and', lit('int', 1))),
  (r, e) => { noErr(e); eq(r.output, ['0'], 'and value'); });
t('#39  print(0 or 1) shows 1', printBI(logic(lit('int', 0), 'or', lit('int', 1))),
  (r, e) => { noErr(e); eq(r.output, ['1'], 'or value'); });
t('#39  print(2 and 3) shows 3 (last when both truthy)', printBI(logic(lit('int', 2), 'and', lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['3'], 'and last'); });
t('#39  print(2 or 3) shows 2 (first truthy)', printBI(logic(lit('int', 2), 'or', lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['2'], 'or first'); });
// The reported flow: x,y = 0,1 ; z = x and y  -> z is 0, not False.
t('#39  z = x and y keeps the operand value',
  { blocks: [
      { id: 1, type: 'parallelAssign', targets: ['x', 'y'], values: [lit('int', 0), lit('int', 1)] },
      { id: 2, type: 'variable', name: 'z', value: logic(ref('x'), 'and', ref('y')) },
  ] },
  (r, e) => { noErr(e); eq(r.variables.z, 0, 'z'); });
// Python truthiness for containers: [] is falsy, so [] and 1 -> [].
t('#39  [] and 1 returns the empty list', printBI(logic({ type: 'array' }, 'and', lit('int', 1))),
  (r, e) => { noErr(e); eq(r.output, ['[]'], 'empty-list and'); });
// Free-form (parser) path agrees with the structured path.
t('#39  free-form "0 and 1" shows 0', printBI({ type: 'expression', value: '0 and 1' }),
  (r, e) => { noErr(e); eq(r.output, ['0'], 'parser and'); });
t('#39  free-form "0 or 1" shows 1', printBI({ type: 'expression', value: '0 or 1' }),
  (r, e) => { noErr(e); eq(r.output, ['1'], 'parser or'); });
// `not` still yields a boolean, but with Python truthiness: not [] is True.
t('#39  not [] is True', printBI({ type: 'not', value: { type: 'array' } }),
  (r, e) => { noErr(e); eq(r.output, ['True'], 'not empty list'); });
t('#39  not 0 is True', printBI({ type: 'not', value: lit('int', 0) }),
  (r, e) => { noErr(e); eq(r.output, ['True'], 'not zero'); });

// ===========================================================================
// #40  Float type — integer-valued floats keep ".0", type is "float",
//      arithmetic contaminates, and Python 3 division always yields a float.
// ===========================================================================
t('#40  a float literal prints with .0', printBI(lit('float', 3)),
  (r, e) => { noErr(e); eq(r.output, ['3.0'], 'float literal'); });
t('#40  a non-integer float prints normally', printBI(lit('float', 3.5)),
  (r, e) => { noErr(e); eq(r.output, ['3.5'], 'float 3.5'); });
t('#40  type(3.0) is float', printBI(bi('type', lit('float', 3))),
  (r, e) => { noErr(e); eq(r.output, ['float'], 'type float'); });
t('#40  type(3) is int', printBI(bi('type', lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['int'], 'type int'); });
t('#40  float(3) is 3.0', printBI(bi('float', lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['3.0'], 'float()'); });
t('#40  int(3.0) is 3', printBI(bi('int', lit('float', 3))),
  (r, e) => { noErr(e); eq(r.output, ['3'], 'int()'); });
t('#40  int + float is a float', printBI(calc(lit('int', 1), '+', lit('float', 2))),
  (r, e) => { noErr(e); eq(r.output, ['3.0'], 'int+float'); });
t('#40  float * int is a float', printBI(calc(lit('float', 2.5), '*', lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['5.0'], 'float*int'); });
t('#40  int + int stays an int', printBI(calc(lit('int', 1), '+', lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['3'], 'int+int'); });
t('#40  true division of ints is a float (4 / 2 -> 2.0)',
  printBI(calc(lit('int', 4), '/', lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['2.0'], 'true div'); });
t('#40  1 == 1.0 is True', printBI(logic(lit('int', 1), '==', lit('float', 1))),
  (r, e) => { noErr(e); eq(r.output, ['True'], 'cross-type eq'); });
t('#40  2.0 < 3 is True', printBI(logic(lit('float', 2), '<', lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['True'], 'cross-type order'); });
t('#40  a float inside a list keeps .0 in the repr',
  printBI(arr(lit('int', 1), lit('float', 2))),
  (r, e) => { noErr(e); eq(r.output, ['[1, 2.0]'], 'list float repr'); });
t('#40  sum of ints is an int', printBI(bi('sum', arr(lit('int', 1), lit('int', 2)))),
  (r, e) => { noErr(e); eq(r.output, ['3'], 'sum int'); });
t('#40  sum with a float is a float', printBI(bi('sum', arr(lit('float', 1), lit('int', 2)))),
  (r, e) => { noErr(e); eq(r.output, ['3.0'], 'sum float'); });
t('#40  abs(-3.0) is 3.0', printBI(bi('abs', lit('float', -3))),
  (r, e) => { noErr(e); eq(r.output, ['3.0'], 'abs float'); });
t('#40  round(3.14159, 2) is a float 3.14', printBI(bi('round', lit('float', 3.14159), lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['3.14'], 'round float'); });
t('#40  round(3.4) is an int', printBI(bi('round', lit('float', 3.4))),
  (r, e) => { noErr(e); eq(r.output, ['3'], 'round int'); });
t('#40  a float variable serializes to its number',
  { blocks: [{ id: 1, type: 'variable', name: 'x', value: lit('float', 3) }] },
  (r, e) => { noErr(e); eq(r.variables.x, 3, 'serialized float'); });
t('#40  1 is 1.0 is False (distinct types)', printBI(logic(lit('int', 1), 'is', lit('float', 1))),
  (r, e) => { noErr(e); eq(r.output, ['False'], 'is across types'); });

// ===========================================================================
// #41  String repr uses double quotes (matches the frontend pyLiteral preview)
// ===========================================================================
t('#41  a bare printed string has no quotes', printBI(lit('string', 'hi')),
  (r, e) => { noErr(e); eq(r.output, ['hi'], 'bare string'); });
t('#41  str() of a list double-quotes its strings',
  printBI(bi('str', arr(lit('string', 'a'), lit('string', 'b')))),
  (r, e) => { noErr(e); eq(r.output, ['["a", "b"]'], 'list str repr'); });

// ===========================================================================
// #42  tryCatch: multiple typed catch branches
// ===========================================================================
const tacCatches = (tryChildren, catches) =>
  ({ blocks: [{ id: 1, type: 'tryCatch', tryChildren, catches }] });

t('#42  first matching catch runs; later ones (even Exception) are skipped',
  tacCatches(
      [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 10), '/', lit('int', 0)) }],
      [
          { id: 10, errorType: 'TypeError', children: [{ id: 3, type: 'print', value: lit('string', 'type') }] },
          { id: 11, errorType: 'ZeroDivisionError', children: [{ id: 4, type: 'print', value: lit('string', 'zero') }] },
          { id: 12, errorType: 'Exception', children: [{ id: 5, type: 'print', value: lit('string', 'other') }] },
      ]
  ),
  (r, e) => { noErr(e); eq(r.output, ['zero'], 'only the ZeroDivisionError branch runs'); });

t('#42  an unmatched specific error still reaches a trailing Exception branch',
  tacCatches(
      [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 10), '/', lit('int', 0)) }],
      [
          { id: 10, errorType: 'NameError', children: [{ id: 3, type: 'print', value: lit('string', 'name') }] },
          { id: 11, errorType: 'Exception', children: [{ id: 4, type: 'print', value: lit('string', 'other') }] },
      ]
  ),
  (r, e) => { noErr(e); eq(r.output, ['other'], 'falls through to Exception'); });

t('#42  no catch runs when the try body succeeds',
  tacCatches(
      [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 10), '/', lit('int', 2)) }],
      [{ id: 10, errorType: 'Exception', children: [{ id: 3, type: 'print', value: lit('string', 'unreached') }] }]
  ),
  (r, e) => { noErr(e); eq(r.output, [], 'no output'); eq(r.variables.z, 5, 'z'); });

t('#42  an error with no matching catch propagates (Python behavior)',
  tacCatches(
      [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 10), '/', lit('int', 0)) }],
      [{ id: 10, errorType: 'TypeError', children: [{ id: 3, type: 'print', value: lit('string', 'type') }] }]
  ),
  (r, e) => {
      if (!e.length || e[0].errorType !== 'ZeroDivisionError') {
          throw new Error('expected an uncaught ZeroDivisionError to propagate');
      }
  });

t('#42  old single-catch payloads (no `catches` array) still behave as a catch-all',
  { blocks: [{ id: 1, type: 'tryCatch', catchErrorName: 'error',
      tryChildren: [{ id: 2, type: 'variable', name: 'z', value: calc(lit('int', 1), '/', lit('int', 0)) }],
      catchChildren: [{ id: 3, type: 'print', value: lit('string', 'caught') }] }] },
  (r, e) => { noErr(e); eq(r.output, ['caught'], 'legacy shape still matches anything'); });

// ===========================================================================
// #43  Get Item / Slice — target[index] and target[start:stop:step] for
// List, String, Tuple. See backend/object.js: getItem, getSlice.
// ===========================================================================
const idx = (target, index) => ({ type: 'index', target, index });
const slc = (target, start = null, stop = null, step = null) => ({ type: 'slice', target, start, stop, step });

t('#43  list positive index', printBI(idx(arr(lit('int', 10), lit('int', 20), lit('int', 30)), lit('int', 1))),
  (r, e) => { noErr(e); eq(r.output, ['20'], 'x[1]'); });

t('#43  list negative index', printBI(idx(arr(lit('int', 10), lit('int', 20), lit('int', 30)), lit('int', -1))),
  (r, e) => { noErr(e); eq(r.output, ['30'], 'x[-1]'); });

t('#43  string index', printBI(idx(lit('string', 'hello'), lit('int', 1))),
  (r, e) => { noErr(e); eq(r.output, ['e'], 'x[1]'); });

t('#43  tuple index', printBI(idx(tup(lit('int', 10), lit('int', 20), lit('int', 30)), lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['30'], 'x[2]'); });

t('#43  out-of-range positive index is IndexError', printBI(idx(arr(lit('int', 1), lit('int', 2)), lit('int', 5))),
  (r, e) => { if (!e.length || e[0].errorType !== 'IndexError') throw new Error('expected IndexError'); });

t('#43  out-of-range negative index is IndexError', printBI(idx(arr(lit('int', 1), lit('int', 2)), lit('int', -5))),
  (r, e) => { if (!e.length || e[0].errorType !== 'IndexError') throw new Error('expected IndexError'); });

t('#43  non-integer index is TypeError', printBI(idx(arr(lit('int', 1), lit('int', 2)), lit('string', 'a'))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#43  indexing a non-subscriptable value is TypeError', printBI(idx(lit('int', 5), lit('int', 0))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#43  list[start:stop]', printBI(slc(arr(lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4)), lit('int', 1), lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['[2, 3]'], 'x[1:3]'); });

t('#43  string[start:stop]', printBI(slc(lit('string', 'hello'), lit('int', 1), lit('int', 4))),
  (r, e) => { noErr(e); eq(r.output, ['ell'], 'x[1:4]'); });

t('#43  tuple[start:stop] stays a tuple', printBI(slc(tup(lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4)), lit('int', 1), lit('int', 3))),
  (r, e) => { noErr(e); eq(r.output, ['(2, 3)'], 'x[1:3] is a tuple, not a list'); });

t('#43  [:stop]', printBI(slc(arr(lit('int', 1), lit('int', 2), lit('int', 3)), null, lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['[1, 2]'], 'x[:2]'); });

t('#43  [start:]', printBI(slc(arr(lit('int', 1), lit('int', 2), lit('int', 3)), lit('int', 1), null)),
  (r, e) => { noErr(e); eq(r.output, ['[2, 3]'], 'x[1:]'); });

t('#43  [:] is a full copy', printBI(slc(arr(lit('int', 1), lit('int', 2), lit('int', 3)))),
  (r, e) => { noErr(e); eq(r.output, ['[1, 2, 3]'], 'x[:]'); });

t('#43  [start:stop:step]', printBI(slc(arr(lit('int', 0), lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4), lit('int', 5)), lit('int', 1), lit('int', 8), lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['[1, 3, 5]'], 'x[1:8:2]'); });

t('#43  [::2]', printBI(slc(arr(lit('int', 0), lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4), lit('int', 5)), null, null, lit('int', 2))),
  (r, e) => { noErr(e); eq(r.output, ['[0, 2, 4]'], 'x[::2]'); });

t('#43  [::-1] reverses', printBI(slc(arr(lit('int', 0), lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4), lit('int', 5)), null, null, lit('int', -1))),
  (r, e) => { noErr(e); eq(r.output, ['[5, 4, 3, 2, 1, 0]'], 'x[::-1]'); });

t('#43  zero step is ValueError', printBI(slc(arr(lit('int', 1), lit('int', 2)), null, null, lit('int', 0))),
  (r, e) => { if (!e.length || e[0].errorType !== 'ValueError') throw new Error('expected ValueError'); });

t('#43  empty list slice', printBI(slc(arr())),
  (r, e) => { noErr(e); eq(r.output, ['[]'], 'x[:] of []'); });

t('#43  empty string slice', printBI(slc(lit('string', ''))),
  (r, e) => { noErr(e); eq(r.output, [''], 'x[:] of ""'); });

t('#43  slicing does not mutate the original',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 2, type: 'variable', name: 'y', value: slc(ref('x'), lit('int', 0), lit('int', 2)) },
      { id: 3, type: 'print', value: ref('x') },
      { id: 4, type: 'print', value: ref('y') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['[1, 2, 3]', '[1, 2]'], 'x unchanged, y is the slice'); });

t('#43  indexing a slice result', printBI(idx(slc(arr(lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4)), lit('int', 1)), lit('int', 0))),
  (r, e) => { noErr(e); eq(r.output, ['2'], 'x[1:][0]'); });

t('#43  slicing an already-sliced result', printBI(slc(slc(arr(lit('int', 1), lit('int', 2), lit('int', 3), lit('int', 4), lit('int', 5)), lit('int', 1)), lit('int', 1))),
  (r, e) => { noErr(e); eq(r.output, ['[3, 4, 5]'], 'x[1:][1:]'); });

t('#43  len(x[1:4])', printBI(bi('len', slc(lit('string', ' hello '), lit('int', 1), lit('int', 7)))),
  (r, e) => { noErr(e); eq(r.output, ['6'], 'len of a string slice'); });

t('#43  .index() and Get Item are unrelated: x.index(2) vs x[2]',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 10), lit('int', 20), lit('int', 30)) },
      { id: 2, type: 'print', value: bi('list.index', ref('x'), lit('int', 20)) },
      { id: 3, type: 'print', value: idx(ref('x'), lit('int', 2)) },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['1', '30'], 'index() finds position 1; x[2] reads value 30 — different operations'); });

// --- F-02: dict[key] is a KEY lookup, matching Python (getItem, object.js) ---
t('#43  dict[key] returns the value',
  printBI(idx(dict(entry(lit('string', 'a'), lit('int', 1)), entry(lit('string', 'b'), lit('int', 2))), lit('string', 'b'))),
  (r, e) => { noErr(e); eq(r.output, ['2'], 'd["b"]'); });

t('#43  dict[key] with an integer key',
  printBI(idx(dict(entry(lit('int', 7), lit('string', 'seven'))), lit('int', 7))),
  (r, e) => { noErr(e); eq(r.output, ['seven'], 'd[7]'); });

t('#43  dict[missing] is KeyError, not IndexError',
  printBI(idx(dict(entry(lit('string', 'a'), lit('int', 1))), lit('string', 'z'))),
  (r, e) => { if (!e.length || e[0].errorType !== 'KeyError') throw new Error('expected KeyError'); });

t('#43  dict[mutable key] is unhashable TypeError',
  printBI(idx(dict(entry(lit('string', 'a'), lit('int', 1))), arr(lit('int', 1)))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#43  slicing a dict is a TypeError (unhashable slice)',
  printBI(slc(dict(entry(lit('string', 'a'), lit('int', 1))), lit('int', 0), lit('int', 1))),
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

// --- F-04: a full tuple slice returns the SAME object, as CPython does ------
t('#43  tuple full slice t[:] is t (same object)',
  { blocks: [
      { id: 1, type: 'variable', name: 't', value: tup(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 2, type: 'print', value: isOp(ref('t'), slc(ref('t'))) },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 't[:] is t'); });

t('#43  tuple whole-range slice t[0:3] is t',
  { blocks: [
      { id: 1, type: 'variable', name: 't', value: tup(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 2, type: 'print', value: isOp(ref('t'), slc(ref('t'), lit('int', 0), lit('int', 3))) },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['True'], 't[0:3] is t'); });

t('#43  partial tuple slice is a new object (t[0:2] is not t)',
  { blocks: [
      { id: 1, type: 'variable', name: 't', value: tup(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 2, type: 'print', value: isOp(ref('t'), slc(ref('t'), lit('int', 0), lit('int', 2))) },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['False'], 't[0:2] is not t'); });

t('#43  reversed tuple slice is a new object (t[::-1] is not t)',
  { blocks: [
      { id: 1, type: 'variable', name: 't', value: tup(lit('int', 1), lit('int', 2), lit('int', 3)) },
      { id: 2, type: 'print', value: isOp(ref('t'), slc(ref('t'), null, null, lit('int', -1))) },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['False'], 't[::-1] is not t'); });

t('#43  a list full slice x[:] is still a copy (not the same object)',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'print', value: isOp(ref('x'), slc(ref('x'))) },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['False'], 'lists always copy on slice'); });

// ===========================================================================
// #44  Item assignment — target[index] = value for list (by position) and
// dict (by key). See backend/object.js: setItem.
// ===========================================================================
const setItem = (target, index, value) => ({ type: 'setItem', target, index, value });

t('#44  list item assignment by position',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2), lit('int', 3)) },
      setItem(ref('x'), lit('int', 1), lit('int', 99)),
      { id: 3, type: 'print', value: ref('x') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['[1, 99, 3]'], 'x[1] = 99'); });

t('#44  list item assignment with a negative index',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2), lit('int', 3)) },
      setItem(ref('x'), lit('int', -1), lit('int', 99)),
      { id: 3, type: 'print', value: ref('x') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['[1, 2, 99]'], 'x[-1] = 99'); });

t('#44  out-of-range list assignment is IndexError',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1)) },
      setItem(ref('x'), lit('int', 5), lit('int', 9)),
    ] },
  (r, e) => { if (!e.length || e[0].errorType !== 'IndexError') throw new Error('expected IndexError'); });

t('#44  non-integer list index is TypeError',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1)) },
      setItem(ref('x'), lit('float', 0), lit('int', 9)),
    ] },
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#44  dict item assignment adds a new key',
  { blocks: [
      { id: 1, type: 'variable', name: 'd', value: dict(entry(lit('string', 'a'), lit('int', 1))) },
      setItem(ref('d'), lit('string', 'b'), lit('int', 2)),
      { id: 3, type: 'print', value: ref('d') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['{"a": 1, "b": 2}'], 'd["b"] = 2'); });

t('#44  dict item assignment overwrites an existing key',
  { blocks: [
      { id: 1, type: 'variable', name: 'd', value: dict(entry(lit('string', 'a'), lit('int', 1))) },
      setItem(ref('d'), lit('string', 'a'), lit('int', 9)),
      { id: 3, type: 'print', value: ref('d') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['{"a": 9}'], 'd["a"] = 9'); });

t('#44  dict assignment with a mutable key is unhashable TypeError',
  { blocks: [
      { id: 1, type: 'variable', name: 'd', value: dict(entry(lit('string', 'a'), lit('int', 1))) },
      setItem(ref('d'), arr(lit('int', 1)), lit('int', 9)),
    ] },
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#44  tuple does not support item assignment',
  { blocks: [
      { id: 1, type: 'variable', name: 't', value: tup(lit('int', 1), lit('int', 2)) },
      setItem(ref('t'), lit('int', 0), lit('int', 9)),
    ] },
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#44  string does not support item assignment',
  { blocks: [ setItem(lit('string', 'abc'), lit('int', 0), lit('string', 'z')) ] },
  (r, e) => { if (!e.length || e[0].errorType !== 'TypeError') throw new Error('expected TypeError'); });

t('#44  nested list item assignment x[0][1] = 99',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(arr(lit('int', 1), lit('int', 2)), arr(lit('int', 3), lit('int', 4))) },
      setItem(idx(ref('x'), lit('int', 0)), lit('int', 1), lit('int', 99)),
      { id: 3, type: 'print', value: ref('x') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['[[1, 99], [3, 4]]'], 'x[0][1] = 99'); });

t('#44  assignment through an alias mutates the shared list',
  { blocks: [
      { id: 1, type: 'variable', name: 'x', value: arr(lit('int', 1), lit('int', 2)) },
      { id: 2, type: 'variable', name: 'y', value: ref('x') },
      setItem(ref('y'), lit('int', 0), lit('int', 9)),
      { id: 4, type: 'print', value: ref('x') },
    ] },
  (r, e) => { noErr(e); eq(r.output, ['[9, 2]'], 'y[0] = 9 also changes x'); });

// ===========================================================================
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
