// deno-lint-ignore-file no-explicit-any
import {
  defaultFieldResolver,
  GraphQLFieldResolver,
  GraphQLSchema,
} from "../../deps.ts";
import { MapperKind, mapSchema } from "../utils/mod.ts";

function decorateToCatchUndefined(
  fn: GraphQLFieldResolver<any, any>,
  hint: string,
): GraphQLFieldResolver<any, any> {
  const resolve = fn == null ? defaultFieldResolver : fn;
  return (root: any, args: any, ctx: any, info: any) => {
    const result = resolve(root, args, ctx, info);
    if (typeof result === "undefined") {
      throw new Error(`Resolver for "${hint}" returned undefined`);
    }
    return result;
  };
}

export function addCatchUndefinedToSchema(
  schema: typeof GraphQLSchema,
): typeof GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => ({
      ...fieldConfig,
      resolve: decorateToCatchUndefined(
        (fieldConfig.resolve as any),
        `${typeName}.${fieldName}`,
      ),
    }),
  });
}
