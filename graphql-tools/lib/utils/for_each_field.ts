// deno-lint-ignore-file no-explicit-any
import { getNamedType, GraphQLSchema, isObjectType } from "../../deps.ts";

import { IFieldIteratorFn } from "./interfaces.ts";

export function forEachField(
  schema: typeof GraphQLSchema,
  fn: IFieldIteratorFn,
): void {
  const typeMap = (schema as any).getTypeMap();
  Object.keys(typeMap).forEach((typeName) => {
    const type = typeMap[typeName];

    if (
      (!getNamedType(type) as any).name.startsWith("__") && isObjectType(type)
    ) {
      const fields = type.getFields();
      Object.keys(fields).forEach((fieldName) => {
        const field = fields[fieldName];
        fn(field, typeName, fieldName);
      });
    }
  });
}
