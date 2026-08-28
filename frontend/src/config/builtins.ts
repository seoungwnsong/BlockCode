import type {
  BuiltinDefinition,
  BuiltinFunctionName,
  BuiltinGroup,
  BuiltinGroupId,
  PythonErrorType,
} from "../types/blocks";

export const ERROR_TYPES: { value: PythonErrorType; label: string }[] = [
  { value: "Exception", label: "Any Error" },
  { value: "TypeError", label: "Type Error" },
  { value: "ValueError", label: "Value Error" },
  { value: "NameError", label: "Name Error" },
  { value: "ZeroDivisionError", label: "Zero Division Error" },
  { value: "IndexError", label: "Index Error" },
  { value: "KeyError", label: "Key Error" },
  { value: "AttributeError", label: "Attribute Error" },
  { value: "FileNotFoundError", label: "File Not Found Error" },
  { value: "AssertionError", label: "Assertion Error" },
];
export const BUILTIN_GROUPS: BuiltinGroup[] = [
  {
    id: "general",
    title: "General",
    functions: [
      { name: "len", argLabels: ["value"] },
      { name: "type", argLabels: ["value"] },
      { name: "id", argLabels: ["value"] },
    ],
  },
  {
    id: "convert",
    title: "Convert",
    functions: [
      { name: "int", argLabels: ["value"] },
      { name: "float", argLabels: ["value"] },
      { name: "str", argLabels: ["value"] },
      { name: "bool", argLabels: ["value"] },
      { name: "list", argLabels: ["value"] },
      { name: "tuple", argLabels: ["value"] },
      { name: "set", argLabels: ["value"] },
      { name: "dict", argLabels: ["value"] },
    ],
  },
  {
    id: "numbers",
    title: "Numbers",
    functions: [
      { name: "abs", argLabels: ["number"] },
      { name: "round", argLabels: ["number", "digits"] },
      {
        name: "min",
        argLabels: ["value 1", "value 2"],
        variadic: true,
        minimumArgs: 1,
      },
      {
        name: "max",
        argLabels: ["value 1", "value 2"],
        variadic: true,
        minimumArgs: 1,
      },
      { name: "sum", argLabels: ["values"] },
    ],
  },
  {
    id: "collections",
    title: "Collections",
    functions: [
      { name: "sorted", argLabels: ["values"] },
      { name: "reversed", argLabels: ["values"] },
      { name: "all", argLabels: ["values"] },
      { name: "any", argLabels: ["values"] },
    ],
  },
];

export const METHOD_GROUPS: BuiltinGroup[] = [
  {
    id: "list",
    title: "List",
    functions: [
      { name: "list.append", argLabels: ["list", "value"] },
      { name: "list.pop", argLabels: ["list"] },
      { name: "list.insert", argLabels: ["list", "index", "value"] },
      { name: "list.remove", argLabels: ["list", "value"] },
      { name: "list.extend", argLabels: ["list", "values"] },
      { name: "list.index", argLabels: ["list", "value"] },
      { name: "list.count", argLabels: ["list", "value"] },
      { name: "list.sort", argLabels: ["list"] },
      { name: "list.reverse", argLabels: ["list"] },
    ],
  },
  {
    id: "string",
    title: "String",
    functions: [
      { name: "string.upper", argLabels: ["text"] },
      { name: "string.lower", argLabels: ["text"] },
      { name: "string.strip", argLabels: ["text"] },
      { name: "string.split", argLabels: ["text", "separator"] },
      { name: "string.join", argLabels: ["separator", "values"] },
      { name: "string.replace", argLabels: ["text", "old", "new"] },
      { name: "string.find", argLabels: ["text", "value"] },
    ],
  },
  {
    id: "dict",
    title: "Dict",
    functions: [
      { name: "dict.keys", argLabels: ["dict"] },
      { name: "dict.values", argLabels: ["dict"] },
      { name: "dict.items", argLabels: ["dict"] },
      { name: "dict.get", argLabels: ["dict", "key"] },
      { name: "dict.update", argLabels: ["dict", "other"] },
      { name: "dict.pop", argLabels: ["dict", "key"] },
    ],
  },
  {
    id: "set",
    title: "Set",
    functions: [
      { name: "set.add", argLabels: ["set", "value"] },
      { name: "set.remove", argLabels: ["set", "value"] },
      { name: "set.discard", argLabels: ["set", "value"] },
      { name: "set.union", argLabels: ["set", "other"] },
      { name: "set.intersection", argLabels: ["set", "other"] },
      { name: "set.difference", argLabels: ["set", "other"] },
    ],
  },
  {
    id: "tuple",
    title: "Tuple",
    functions: [
      { name: "tuple.count", argLabels: ["tuple", "value"] },
      { name: "tuple.index", argLabels: ["tuple", "value"] },
    ],
  },
];

export function getBuiltinDefinition(name: BuiltinFunctionName): BuiltinDefinition {
  for (const group of [...BUILTIN_GROUPS, ...METHOD_GROUPS]) {
    const definition = group.functions.find((item) => item.name === name);
    if (definition) return definition;
  }

  return { name, argLabels: ["value"] };
}

export function getBuiltinGroupId(name: BuiltinFunctionName): BuiltinGroupId {
  for (const group of [...BUILTIN_GROUPS, ...METHOD_GROUPS]) {
    if (group.functions.some((item) => item.name === name)) {
      return group.id;
    }
  }

  return "general";
}

export function isVariadicBuiltin(name: BuiltinFunctionName) {
  return getBuiltinDefinition(name).variadic === true;
}

export function getBuiltinMinimumArgs(name: BuiltinFunctionName) {
  return getBuiltinDefinition(name).minimumArgs ?? 0;
}

export function getBuiltinArgumentLabel(
  name: BuiltinFunctionName,
  index: number
) {
  if (name === "min" || name === "max") {
    return `value ${index + 1}`;
  }

  return (
    getBuiltinDefinition(name).argLabels[index] ??
    `arg ${index + 1}`
  );
}
