// deno-lint-ignore-file no-explicit-any
import {
  getNamedType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isUnionType,
} from "../../deps.ts";

import { PruneSchemaOptions } from "./types.ts";

import { mapSchema } from "./map_schema.ts";
import { MapperKind } from "./interfaces.ts";

type NamedOutputType =
  | typeof GraphQLObjectType
  | typeof GraphQLInterfaceType
  | typeof GraphQLUnionType
  | typeof GraphQLEnumType
  | typeof GraphQLScalarType;
type NamedInputType =
  | typeof GraphQLInputObjectType
  | typeof GraphQLEnumType
  | typeof GraphQLScalarType;

interface PruningContext {
  schema: typeof GraphQLSchema;
  unusedTypes: Record<string, boolean>;
  implementations: Record<string, Record<string, boolean>>;
}

/**
 * Prunes the provided schema, removing unused and empty types
 * @param schema The schema to prune
 * @param options Additional options for removing unused types from the schema
 */
export function pruneSchema(
  schema: typeof GraphQLSchema,
  options: PruneSchemaOptions = {},
): typeof GraphQLSchema {
  const pruningContext: PruningContext = {
    schema,
    unusedTypes: Object.create(null),
    implementations: Object.create(null),
  };

  Object.keys((schema as any).getTypeMap()).forEach((typeName) => {
    const type = (schema as any).getType(typeName);
    if ("getInterfaces" in type) {
      type.getInterfaces().forEach((iface: any) => {
        const implementations = getImplementations(pruningContext, iface);
        if (implementations == null) {
          pruningContext.implementations[iface.name] = Object.create(null);
        }
        pruningContext.implementations[iface.name][type.name] = true;
      });
    }
  });

  visitTypes(pruningContext, schema);

  return mapSchema(schema, {
    [MapperKind.TYPE]: (type: GraphQLNamedType) => {
      // If we should NOT prune the type, return it immediately as unmodified
      if (options.skipPruning && options.skipPruning(type)) {
        return type;
      }

      if (isObjectType(type) || isInputObjectType(type)) {
        if (
          (!Object.keys(type.getFields()).length &&
            !options.skipEmptyCompositeTypePruning) ||
          (pruningContext.unusedTypes[type.name] &&
            !options.skipUnusedTypesPruning)
        ) {
          return null;
        }
      } else if (isUnionType(type)) {
        if (
          (!type.getTypes().length && !options.skipEmptyUnionPruning) ||
          (pruningContext.unusedTypes[type.name] &&
            !options.skipUnusedTypesPruning)
        ) {
          return null;
        }
      } else if (isInterfaceType(type)) {
        const implementations = getImplementations(pruningContext, type);

        if (
          (!Object.keys(type.getFields()).length &&
            !options.skipEmptyCompositeTypePruning) ||
          (implementations && !Object.keys(implementations).length &&
            !options.skipUnimplementedInterfacesPruning) ||
          (pruningContext.unusedTypes[type.name] &&
            !options.skipUnusedTypesPruning)
        ) {
          return null;
        }
      } else {
        if (
          pruningContext.unusedTypes[type.name] &&
          !options.skipUnusedTypesPruning
        ) {
          return null;
        }
      }
    },
  });
}

function visitOutputType(
  visitedTypes: Record<string, boolean>,
  pruningContext: PruningContext,
  type: NamedOutputType,
): void {
  if (visitedTypes[type.name]) {
    return;
  }

  visitedTypes[type.name] = true;
  pruningContext.unusedTypes[type.name] = false;

  if (isObjectType(type) || isInterfaceType(type)) {
    const fields = (type as any).getFields();
    Object.keys(fields).forEach((fieldName) => {
      const field = fields[fieldName];
      const namedType = (getNamedType(field.type) as any) as NamedOutputType;
      visitOutputType(visitedTypes, pruningContext, namedType);

      const args = field.args;
      args.forEach((arg: any) => {
        const type = (getNamedType(arg.type) as any) as NamedInputType;
        visitInputType(visitedTypes, pruningContext, type);
      });
    });

    if (isInterfaceType(type)) {
      const implementations = getImplementations(pruningContext, type);
      if (implementations) {
        Object.keys(implementations).forEach((typeName) => {
          visitOutputType(
            visitedTypes,
            pruningContext,
            (pruningContext.schema as any).getType(typeName) as NamedOutputType,
          );
        });
      }
    }

    if ("getInterfaces" in type) {
      (type as any).getInterfaces().forEach((type: any) => {
        visitOutputType(visitedTypes, pruningContext, type);
      });
    }
  } else if (isUnionType(type)) {
    const types = (type as any).getTypes();
    types.forEach((type: any) =>
      visitOutputType(visitedTypes, pruningContext, type)
    );
  }
}

/**
 * Get the implementations of an interface. May return undefined.
 */
function getImplementations(
  pruningContext: PruningContext,
  type: GraphQLNamedType,
): Record<string, boolean> | undefined {
  return pruningContext.implementations[type.name];
}

function visitInputType(
  visitedTypes: Record<string, boolean>,
  pruningContext: PruningContext,
  type: NamedInputType,
): void {
  if (visitedTypes[type.name]) {
    return;
  }

  pruningContext.unusedTypes[type.name] = false;
  visitedTypes[type.name] = true;

  if (isInputObjectType(type)) {
    const fields = (type as any).getFields();
    Object.keys(fields).forEach((fieldName) => {
      const field = fields[fieldName];
      const namedType = (getNamedType(field.type) as any) as NamedInputType;
      visitInputType(visitedTypes, pruningContext, namedType);
    });
  }
}

function visitTypes(
  pruningContext: PruningContext,
  schema: typeof GraphQLSchema,
): void {
  Object.keys((schema as any).getTypeMap()).forEach((typeName) => {
    if (!typeName.startsWith("__")) {
      pruningContext.unusedTypes[typeName] = true;
    }
  });

  const visitedTypes: Record<string, boolean> = Object.create(null);

  const rootTypes = [
    (schema as any).getQueryType(),
    (schema as any).getMutationType(),
    (schema as any).getSubscriptionType(),
  ].filter(
    (type) => type != null,
  );

  rootTypes.forEach((rootType) =>
    visitOutputType(visitedTypes, pruningContext, rootType)
  );

  (schema as any).getDirectives().forEach((directive: any) => {
    directive.args.forEach((arg: any) => {
      const type = (getNamedType(arg.type) as any) as NamedInputType;
      visitInputType(visitedTypes, pruningContext, type);
    });
  });
}
