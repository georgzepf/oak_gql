// deno-lint-ignore-file no-explicit-any
import {
  getNamedType,
  GraphQLSchema,
  isInputObjectType,
  isObjectType,
} from "../../deps.ts";

import { IDefaultValueIteratorFn } from "./interfaces.ts";

export function forEachDefaultValue(
  schema: typeof GraphQLSchema,
  fn: IDefaultValueIteratorFn,
): void {
  const typeMap = (schema as any).getTypeMap();
  Object.keys(typeMap).forEach((typeName) => {
    const type = typeMap[typeName];

    if ((!getNamedType(type) as any).name.startsWith("__")) {
      if (isObjectType(type)) {
        const fields = type.getFields();
        Object.keys(fields).forEach((fieldName) => {
          const field = fields[fieldName];

          field.args.forEach((arg: any) => {
            arg.defaultValue = fn(arg.type, arg.defaultValue);
          });
        });
      } else if (isInputObjectType(type)) {
        const fields = type.getFields();
        Object.keys(fields).forEach((fieldName) => {
          const field = fields[fieldName];
          field.defaultValue = fn(field.type, field.defaultValue);
        });
      }
    }
  });
}
