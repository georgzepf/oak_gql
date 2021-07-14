// deno-lint-ignore-file no-explicit-any
import {
  buildASTSchema,
  DocumentNode,
  extendSchema,
  GraphQLSchema,
} from "../../deps.ts";

import {
  GraphQLParseOptions,
  isDocumentNode,
  ITypeDefinitions,
  parseGraphQLSDL,
} from "../utils/mod.ts";

import { filterAndExtractExtensionDefinitions } from "./extension_definitions.ts";
import { concatenateTypeDefs } from "./concatenate_type_defs.ts";

export function buildSchemaFromTypeDefinitions(
  typeDefinitions: ITypeDefinitions,
  parseOptions?: GraphQLParseOptions,
  noExtensionExtraction?: boolean,
): typeof GraphQLSchema {
  const document = buildDocumentFromTypeDefinitions(
    typeDefinitions,
    parseOptions,
  );

  if (noExtensionExtraction) {
    return (buildASTSchema as any)(document);
  }

  const { typesAst, extensionsAst } = filterAndExtractExtensionDefinitions(
    document,
  );

  const backcompatOptions = { commentDescriptions: true };
  let schema: typeof GraphQLSchema =
    (buildASTSchema(typesAst, backcompatOptions) as any);

  if (extensionsAst.definitions.length > 0) {
    schema =
      (extendSchema((schema as any), extensionsAst, backcompatOptions) as any);
  }

  return schema;
}

export function buildDocumentFromTypeDefinitions(
  typeDefinitions: ITypeDefinitions,
  parseOptions?: GraphQLParseOptions,
): DocumentNode {
  let document: DocumentNode;
  if (typeof typeDefinitions === "string") {
    document = parseGraphQLSDL("", typeDefinitions, parseOptions).document;
  } else if (Array.isArray(typeDefinitions)) {
    document =
      parseGraphQLSDL("", concatenateTypeDefs(typeDefinitions), parseOptions)
        .document;
  } else if (isDocumentNode(typeDefinitions)) {
    document = typeDefinitions;
  } else {
    const type = typeof typeDefinitions;
    throw new Error(
      `typeDefs must be a string, array or schema AST, got ${type}`,
    );
  }

  return document;
}
