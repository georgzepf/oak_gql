// deno-lint-ignore-file no-explicit-any
import {
  GraphQLDirective,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLSchema,
  GraphQLType,
  GraphQLUnionType,
  isInputObjectType,
  isInterfaceType,
  isLeafType,
  isListType,
  isNamedType,
  isNonNullType,
  isObjectType,
  isUnionType,
} from "../../deps.ts";

import { TypeMap } from "./interfaces.ts";

// Update any references to named schema types that disagree with the named
// types found in schema.getTypeMap().
//
// healSchema and its callers (visitSchema/visitSchemaDirectives) all modify the schema in place.
// Therefore, private variables (such as the stored implementation map and the proper root types)
// are not updated.
//
// If this causes issues, the schema could be more aggressively healed as follows:
//
// healSchema(schema);
// const config = schema.toConfig()
// const healedSchema = new GraphQLSchema({
//   ...config,
//   query: schema.getType('<desired new root query type name>'),
//   mutation: schema.getType('<desired new root mutation type name>'),
//   subscription: schema.getType('<desired new root subscription type name>'),
// });
//
// One can then also -- if necessary --  assign the correct private variables to the initial schema
// as follows:
// Object.assign(schema, healedSchema);
//
// These steps are not taken automatically to preserve backwards compatibility with graphql-tools v4.
// See https://github.com/ardatan/graphql-tools/issues/1462
//
// They were briefly taken in v5, but can now be phased out as they were only required when other
// areas of the codebase were using healSchema and visitSchema more extensively.
//
export function healSchema(schema: typeof GraphQLSchema): typeof GraphQLSchema {
  healTypes((schema as any).getTypeMap(), (schema as any).getDirectives());
  return schema;
}

export function healTypes(
  originalTypeMap: Record<string, GraphQLNamedType | null>,
  directives: ReadonlyArray<typeof GraphQLDirective>,
) {
  const actualNamedTypeMap: TypeMap = Object.create(null);

  // If any of the .name properties of the GraphQLNamedType objects in
  // schema.getTypeMap() have changed, the keys of the type map need to
  // be updated accordingly.

  Object.entries(originalTypeMap).forEach(([typeName, namedType]) => {
    if (namedType == null || typeName.startsWith("__")) {
      return;
    }

    const actualName = namedType.name;
    if (actualName.startsWith("__")) {
      return;
    }

    if (actualName in actualNamedTypeMap) {
      throw new Error(`Duplicate schema type name ${actualName}`);
    }

    actualNamedTypeMap[actualName] = namedType;

    // Note: we are deliberately leaving namedType in the schema by its
    // original name (which might be different from actualName), so that
    // references by that name can be healed.
  });

  // Now add back every named type by its actual name.
  Object.entries(actualNamedTypeMap).forEach(([typeName, namedType]) => {
    originalTypeMap[typeName] = namedType;
  });

  // Directive declaration argument types can refer to named types.
  directives.forEach((decl: typeof GraphQLDirective) => {
    (decl as any).args = (decl as any).args.filter((arg: any) => {
      arg.type = healType(arg.type) as GraphQLInputType;
      return arg.type !== null;
    });
  });

  Object.entries(originalTypeMap).forEach(([typeName, namedType]) => {
    // Heal all named types, except for dangling references, kept only to redirect.
    if (!typeName.startsWith("__") && typeName in actualNamedTypeMap) {
      if (namedType != null) {
        healNamedType(namedType);
      }
    }
  });

  for (const typeName of Object.keys(originalTypeMap)) {
    if (!typeName.startsWith("__") && !(typeName in actualNamedTypeMap)) {
      delete originalTypeMap[typeName];
    }
  }

  function healNamedType(type: GraphQLNamedType) {
    if (isObjectType(type)) {
      healFields((type as any));
      healInterfaces((type as any));
      return;
    } else if (isInterfaceType(type)) {
      healFields((type as any));
      if ("getInterfaces" in type) {
        healInterfaces((type as any));
      }
      return;
    } else if (isUnionType(type)) {
      healUnderlyingTypes((type as any));
      return;
    } else if (isInputObjectType(type)) {
      healInputFields((type as any));
      return;
    } else if (isLeafType(type)) {
      return;
    }

    throw new Error(`Unexpected schema type: ${type as string}`);
  }

  function healFields(
    type: typeof GraphQLObjectType | typeof GraphQLInterfaceType,
  ) {
    const fieldMap = (type as any).getFields();
    for (const [key, field] of Object.entries(fieldMap)) {
      (field as any).args
        .map((arg: any) => {
          arg.type = healType(arg.type) as GraphQLInputType;
          return arg.type === null ? null : arg;
        })
        .filter(Boolean);
      (field as any).type = healType((field as any).type) as GraphQLOutputType;
      if ((field as any).type === null) {
        delete fieldMap[key];
      }
    }
  }

  function healInterfaces(
    type: typeof GraphQLObjectType | typeof GraphQLInterfaceType,
  ) {
    if ("getInterfaces" in type) {
      const interfaces = (type as any).getInterfaces();
      interfaces.push(
        ...interfaces
          .splice(0)
          .map((iface: any) => healType(iface) as any)
          .filter(Boolean),
      );
    }
  }

  function healInputFields(type: typeof GraphQLInputObjectType) {
    const fieldMap = (type as any).getFields();
    for (const [key, field] of Object.entries(fieldMap)) {
      (field as any).type = healType((field as any).type) as GraphQLInputType;
      if ((field as any).type === null) {
        delete fieldMap[key];
      }
    }
  }

  function healUnderlyingTypes(type: typeof GraphQLUnionType) {
    const types = (type as any).getTypes();
    types.push(
      ...types
        .splice(0)
        .map((t: any) => healType(t) as any)
        .filter(Boolean),
    );
  }

  function healType<T extends GraphQLType>(type: T): GraphQLType | null {
    // Unwrap the two known wrapper types
    if (isListType(type)) {
      const healedType = healType(type.ofType);
      return healedType != null ? new (GraphQLList as any)(healedType) : null;
    } else if (isNonNullType(type)) {
      const healedType = healType(type.ofType);
      return healedType != null
        ? new (GraphQLNonNull as any)(healedType)
        : null;
    } else if (isNamedType(type)) {
      // If a type annotation on a field or an argument or a union member is
      // any `GraphQLNamedType` with a `name`, then it must end up identical
      // to `schema.getType(name)`, since `schema.getTypeMap()` is the source
      // of truth for all named schema types.
      // Note that new types can still be simply added by adding a field, as
      // the official type will be undefined, not null.
      const officialType = originalTypeMap[type.name];
      if (officialType && type !== officialType) {
        return officialType as T;
      }
    }
    return type;
  }
}
