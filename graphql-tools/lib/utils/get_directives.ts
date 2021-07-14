// deno-lint-ignore-file no-explicit-any
import {
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  GraphQLDirective,
  GraphQLEnumTypeConfig,
  GraphQLEnumValue,
  GraphQLEnumValueConfig,
  GraphQLField,
  GraphQLFieldConfig,
  GraphQLInputField,
  GraphQLInputFieldConfig,
  GraphQLInputObjectTypeConfig,
  GraphQLInterfaceTypeConfig,
  GraphQLNamedType,
  GraphQLObjectTypeConfig,
  GraphQLScalarTypeConfig,
  GraphQLSchema,
  GraphQLSchemaConfig,
  GraphQLUnionTypeConfig,
  InputValueDefinitionNode,
  SchemaDefinitionNode,
  SchemaExtensionNode,
  TypeDefinitionNode,
  TypeExtensionNode,
} from "../../deps.ts";

import { getArgumentValues } from "./get_argument_values.ts";

export type DirectiveUseMap = { [key: string]: any };

type SchemaOrTypeNode =
  | SchemaDefinitionNode
  | SchemaExtensionNode
  | TypeDefinitionNode
  | TypeExtensionNode
  | EnumValueDefinitionNode
  | FieldDefinitionNode
  | InputValueDefinitionNode;

type DirectableGraphQLObject =
  | typeof GraphQLSchema
  | GraphQLSchemaConfig
  | GraphQLNamedType
  | GraphQLObjectTypeConfig<any, any>
  | GraphQLInterfaceTypeConfig<any, any>
  | GraphQLUnionTypeConfig<any, any>
  | GraphQLScalarTypeConfig<any, any>
  | GraphQLEnumTypeConfig
  | GraphQLEnumValue
  | GraphQLEnumValueConfig
  | GraphQLInputObjectTypeConfig
  | GraphQLField<any, any>
  | GraphQLInputField
  | GraphQLFieldConfig<any, any>
  | GraphQLInputFieldConfig;

export function getDirectivesInExtensions(
  node: DirectableGraphQLObject,
  pathToDirectivesInExtensions = ["directives"],
): DirectiveUseMap {
  const directivesInExtensions = pathToDirectivesInExtensions.reduce(
    (acc, pathSegment) => (acc == null ? acc : acc[pathSegment]),
    (node as any)?.extensions,
  );

  return directivesInExtensions;
}

export function getDirectives(
  schema: typeof GraphQLSchema,
  node: DirectableGraphQLObject,
  pathToDirectivesInExtensions = ["directives"],
): DirectiveUseMap {
  const directivesInExtensions = getDirectivesInExtensions(
    node,
    pathToDirectivesInExtensions,
  );

  if (directivesInExtensions != null) {
    return directivesInExtensions;
  }

  const schemaDirectives: ReadonlyArray<typeof GraphQLDirective> =
    schema && (schema as any).getDirectives
      ? (schema as any).getDirectives()
      : [];

  const schemaDirectiveMap = schemaDirectives.reduce(
    (schemaDirectiveMap, schemaDirective) => {
      (schemaDirectiveMap as any)[schemaDirective.name] = schemaDirective;
      return schemaDirectiveMap;
    },
    {},
  );

  let astNodes: Array<SchemaOrTypeNode> = [];
  if ((node as any).astNode) {
    astNodes.push((node as any).astNode);
  }
  if ("extensionASTNodes" in node && node.extensionASTNodes) {
    astNodes = [...astNodes, ...node.extensionASTNodes];
  }

  const result: DirectiveUseMap = {};

  astNodes.forEach((astNode) => {
    if (astNode.directives) {
      astNode.directives.forEach((directiveNode: any) => {
        const schemaDirective =
          (schemaDirectiveMap as any)[directiveNode.name.value];
        if (schemaDirective) {
          if (schemaDirective.isRepeatable) {
            result[schemaDirective.name] = result[schemaDirective.name] ?? [];
            result[schemaDirective.name].push(
              getArgumentValues(schemaDirective, directiveNode),
            );
          } else {
            result[schemaDirective.name] = getArgumentValues(
              schemaDirective,
              directiveNode,
            );
          }
        }
      });
    }
  });

  return result;
}
