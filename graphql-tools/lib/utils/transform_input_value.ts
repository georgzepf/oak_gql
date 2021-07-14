// deno-lint-ignore-file no-explicit-any
import {
  getNullableType,
  GraphQLInputType,
  isInputObjectType,
  isLeafType,
  isListType,
} from "../../deps.ts";

import {
  InputLeafValueTransformer,
  InputObjectValueTransformer,
} from "./types.ts";

export function transformInputValue(
  type: GraphQLInputType,
  value: any,
  inputLeafValueTransformer: InputLeafValueTransformer = (null as any),
  inputObjectValueTransformer: InputObjectValueTransformer = (null as any),
): any {
  if (value == null) {
    return value;
  }

  const nullableType = getNullableType(type);

  if (isLeafType(nullableType)) {
    return inputLeafValueTransformer != null
      ? inputLeafValueTransformer((nullableType as any), value)
      : value;
  } else if (isListType(nullableType)) {
    return value.map((listMember: any) =>
      transformInputValue(
        nullableType.ofType,
        listMember,
        inputLeafValueTransformer,
        inputObjectValueTransformer,
      )
    );
  } else if (isInputObjectType(nullableType)) {
    const fields = nullableType.getFields();
    const newValue = {};
    Object.keys(value).forEach((key) => {
      const field = fields[key];
      if (field != null) {
        (newValue as any)[key] = transformInputValue(
          field.type,
          value[key],
          inputLeafValueTransformer,
          inputObjectValueTransformer,
        );
      }
    });
    return inputObjectValueTransformer != null
      ? inputObjectValueTransformer((nullableType as any), newValue)
      : newValue;
  }

  // unreachable, no other possible return value
}

export function serializeInputValue(type: GraphQLInputType, value: any) {
  return transformInputValue(type, value, (t, v) => (t as any).serialize(v));
}

export function parseInputValue(type: GraphQLInputType, value: any) {
  return transformInputValue(type, value, (t, v) => (t as any).parseValue(v));
}

export function parseInputValueLiteral(type: GraphQLInputType, value: any) {
  return transformInputValue(
    type,
    value,
    (t, v) => (t as any).parseLiteral(v, {}),
  );
}
