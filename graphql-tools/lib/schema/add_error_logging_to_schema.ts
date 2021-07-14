// deno-lint-ignore-file no-explicit-any
import { GraphQLSchema } from "../../deps.ts";
import { MapperKind, mapSchema } from "../utils/mod.ts";
import { decorateWithLogger } from "./decorate_with_logger.ts";
import { ILogger } from "./types.ts";

export function addErrorLoggingToSchema(
  schema: typeof GraphQLSchema,
  logger?: ILogger,
): typeof GraphQLSchema {
  if (!logger) {
    throw new Error("Must provide a logger");
  }
  if (typeof logger.log !== "function") {
    throw new Error("Logger.log must be a function");
  }
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => ({
      ...fieldConfig,
      resolve: decorateWithLogger(
        (fieldConfig.resolve as any),
        logger,
        `${typeName}.${fieldName}`,
      ),
    }),
  });
}
