// deno-lint-ignore-file no-explicit-any
import {
  GraphQLEnumType,
  GraphQLField,
  GraphQLFieldConfig,
  GraphQLFieldResolver,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  isEnumType,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isSchema,
  isSpecifiedScalarType,
  isUnionType,
} from "../../deps.ts";

import {
  forEachDefaultValue,
  forEachField,
  healSchema,
  IAddResolversToSchemaOptions,
  IResolvers,
  IResolverValidationOptions,
  MapperKind,
  mapSchema,
  parseInputValue,
  serializeInputValue,
} from "../utils/mod.ts";

import { checkForResolveTypeResolver } from "./check_for_resolve_type_resolver.ts";
import { extendResolversFromInterfaces } from "./extend_resolvers_from_interfaces.ts";

export function addResolversToSchema(
  schemaOrOptions: typeof GraphQLSchema | IAddResolversToSchemaOptions,
  legacyInputResolvers?: IResolvers,
  legacyInputValidationOptions?: IResolverValidationOptions,
): typeof GraphQLSchema {
  const options: IAddResolversToSchemaOptions = isSchema(schemaOrOptions)
    ? ({
      schema: schemaOrOptions,
      resolvers: legacyInputResolvers,
      resolverValidationOptions: legacyInputValidationOptions,
    } as any)
    : schemaOrOptions;

  let {
    schema,
    resolvers: inputResolvers,
    defaultFieldResolver,
    resolverValidationOptions = {},
    inheritResolversFromInterfaces = false,
    updateResolversInPlace = false,
  } = options;

  const {
    requireResolversToMatchSchema = "error",
    requireResolversForResolveType,
  } = resolverValidationOptions;

  const resolvers = inheritResolversFromInterfaces
    ? extendResolversFromInterfaces(schema, inputResolvers)
    : inputResolvers;

  Object.keys(resolvers).forEach((typeName) => {
    const resolverValue = resolvers[typeName];
    const resolverType = typeof resolverValue;

    if (typeName === "__schema") {
      if (resolverType !== "function") {
        throw new Error(
          `"${typeName}" defined in resolvers, but has invalid value "${(resolverValue as unknown) as string}". A schema resolver's value must be of type object or function.`,
        );
      }
    } else {
      if (resolverType !== "object") {
        throw new Error(
          `"${typeName}" defined in resolvers, but has invalid value "${(resolverValue as unknown) as string}". The resolver's value must be of type object.`,
        );
      }

      const type = (schema as any).getType(typeName);

      if (type == null) {
        if (requireResolversToMatchSchema === "ignore") {
          return;
        }

        throw new Error(
          `"${typeName}" defined in resolvers, but not in schema`,
        );
      } else if (isSpecifiedScalarType(type)) {
        // allow -- without recommending -- overriding of specified scalar types
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            type[fieldName.substring(2)] = (resolverValue as any)[fieldName];
          } else {
            type[fieldName] = (resolverValue as any)[fieldName];
          }
        });
      } else if (isEnumType(type)) {
        const values = type.getValues();

        Object.keys(resolverValue).forEach((fieldName) => {
          if (
            !fieldName.startsWith("__") &&
            !values.some((value: any) => value.name === fieldName) &&
            requireResolversToMatchSchema &&
            requireResolversToMatchSchema !== "ignore"
          ) {
            throw new Error(
              `${type.name}.${fieldName} was defined in resolvers, but not present within ${type.name}`,
            );
          }
        });
      } else if (isUnionType(type)) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (
            !fieldName.startsWith("__") &&
            requireResolversToMatchSchema &&
            requireResolversToMatchSchema !== "ignore"
          ) {
            throw new Error(
              `${type.name}.${fieldName} was defined in resolvers, but ${type.name} is not an object or interface type`,
            );
          }
        });
      } else if (isObjectType(type) || isInterfaceType(type)) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (!fieldName.startsWith("__")) {
            const fields = type.getFields();
            const field = fields[fieldName];

            if (
              field == null && requireResolversToMatchSchema &&
              requireResolversToMatchSchema !== "ignore"
            ) {
              throw new Error(
                `${typeName}.${fieldName} defined in resolvers, but not in schema`,
              );
            }

            const fieldResolve = (resolverValue as any)[fieldName];
            if (
              typeof fieldResolve !== "function" &&
              typeof fieldResolve !== "object"
            ) {
              throw new Error(
                `Resolver ${typeName}.${fieldName} must be object or function`,
              );
            }
          }
        });
      }
    }
  });

  schema = updateResolversInPlace
    ? addResolversToExistingSchema(
      schema,
      resolvers,
      (defaultFieldResolver as any),
    )
    : createNewSchemaWithResolvers(
      schema,
      resolvers,
      (defaultFieldResolver as any),
    );

  if (
    requireResolversForResolveType ||
    requireResolversForResolveType !== "ignore"
  ) {
    checkForResolveTypeResolver(
      schema,
      (requireResolversForResolveType as any),
    );
  }

  return schema;
}

function addResolversToExistingSchema(
  schema: typeof GraphQLSchema,
  resolvers: IResolvers,
  defaultFieldResolver: GraphQLFieldResolver<any, any>,
): typeof GraphQLSchema {
  const typeMap = (schema as any).getTypeMap();
  Object.keys(resolvers).forEach((typeName) => {
    if (typeName !== "__schema") {
      const type = (schema as any).getType(typeName);
      const resolverValue = resolvers[typeName];

      if (isScalarType(type)) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            (type as any)[fieldName.substring(2)] =
              (resolverValue as any)[fieldName];
          } else if (fieldName === "astNode" && type.astNode != null) {
            type.astNode = {
              ...type.astNode,
              description: (resolverValue as any)?.astNode?.description ??
                type.astNode.description,
              directives: (type.astNode.directives ?? []).concat(
                (resolverValue as any)?.astNode?.directives ?? [],
              ),
            };
          } else if (
            fieldName === "extensionASTNodes" && type.extensionASTNodes != null
          ) {
            type.extensionASTNodes = ([] ?? type.extensionASTNodes).concat(
              (resolverValue as any)?.extensionASTNodes ?? [],
            );
          } else if (
            fieldName === "extensions" &&
            type.extensions != null &&
            (resolverValue as any).extensions != null
          ) {
            type.extensions = Object.assign(
              {},
              type.extensions,
              (resolverValue as any).extensions,
            );
          } else {
            (type as any)[fieldName] = (resolverValue as any)[fieldName];
          }
        });
      } else if (isEnumType(type)) {
        const config = type.toConfig();
        const enumValueConfigMap = config.values;

        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            (config as any)[fieldName.substring(2)] =
              (resolverValue as any)[fieldName];
          } else if (fieldName === "astNode" && config.astNode != null) {
            config.astNode = {
              ...config.astNode,
              description: (resolverValue as any)?.astNode?.description ??
                config.astNode.description,
              directives: (config.astNode.directives ?? []).concat(
                (resolverValue as any)?.astNode?.directives ?? [],
              ),
            };
          } else if (
            fieldName === "extensionASTNodes" &&
            config.extensionASTNodes != null
          ) {
            config.extensionASTNodes = config.extensionASTNodes.concat(
              (resolverValue as any)?.extensionASTNodes ?? [],
            );
          } else if (
            fieldName === "extensions" &&
            type.extensions != null &&
            (resolverValue as any).extensions != null
          ) {
            type.extensions = Object.assign(
              {},
              type.extensions,
              (resolverValue as any).extensions,
            );
          } else if (enumValueConfigMap[fieldName]) {
            enumValueConfigMap[fieldName].value =
              (resolverValue as any)[fieldName];
          }
        });

        typeMap[typeName] = new (GraphQLEnumType as any)(config);
      } else if (isUnionType(type)) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            (type as any)[fieldName.substring(2)] =
              (resolverValue as any)[fieldName];
          }
        });
      } else if (isObjectType(type) || isInterfaceType(type)) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            // this is for isTypeOf and resolveType and all the other stuff.
            (type as any)[fieldName.substring(2)] =
              (resolverValue as any)[fieldName];
            return;
          }

          const fields = type.getFields();
          const field = fields[fieldName];

          if (field != null) {
            const fieldResolve = (resolverValue as any)[fieldName];
            if (typeof fieldResolve === "function") {
              // for convenience. Allows shorter syntax in resolver definition file
              field.resolve = fieldResolve;
            } else {
              setFieldProperties(field, fieldResolve);
            }
          }
        });
      }
    }
  });

  // serialize all default values prior to healing fields with new scalar/enum types.
  forEachDefaultValue(schema, serializeInputValue);
  // schema may have new scalar/enum types that require healing
  healSchema(schema);
  // reparse all default values with new parsing functions.
  forEachDefaultValue(schema, parseInputValue);

  if (defaultFieldResolver != null) {
    forEachField(schema, (field) => {
      if (!field.resolve) {
        field.resolve = defaultFieldResolver;
      }
    });
  }

  return schema;
}

function createNewSchemaWithResolvers(
  schema: typeof GraphQLSchema,
  resolvers: IResolvers,
  defaultFieldResolver: GraphQLFieldResolver<any, any>,
): typeof GraphQLSchema {
  schema = mapSchema(schema, {
    [MapperKind.SCALAR_TYPE]: (type) => {
      const config = (type as any).toConfig();
      const resolverValue = resolvers[type.name];
      if (!isSpecifiedScalarType((type as any)) && resolverValue != null) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            config[fieldName.substring(2)] = (resolverValue as any)[fieldName];
          } else if (fieldName === "astNode" && config.astNode != null) {
            config.astNode = {
              ...config.astNode,
              description: (resolverValue as any)?.astNode?.description ??
                config.astNode.description,
              directives: (config.astNode.directives ?? []).concat(
                (resolverValue as any)?.astNode?.directives ?? [],
              ),
            };
          } else if (
            fieldName === "extensionASTNodes" &&
            config.extensionASTNodes != null
          ) {
            config.extensionASTNodes = config.extensionASTNodes.concat(
              (resolverValue as any)?.extensionASTNodes ?? [],
            );
          } else if (
            fieldName === "extensions" &&
            config.extensions != null &&
            (resolverValue as any).extensions != null
          ) {
            config.extensions = Object.assign(
              {},
              (type as any).extensions,
              (resolverValue as any).extensions,
            );
          } else {
            config[fieldName] = (resolverValue as any)[fieldName];
          }
        });

        return new (GraphQLScalarType as any)(config);
      }
    },
    [MapperKind.ENUM_TYPE]: (type) => {
      const resolverValue = resolvers[type.name];

      const config = (type as any).toConfig();
      const enumValueConfigMap = config.values;

      if (resolverValue != null) {
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            config[fieldName.substring(2)] = (resolverValue as any)[fieldName];
          } else if (fieldName === "astNode" && config.astNode != null) {
            config.astNode = {
              ...config.astNode,
              description: (resolverValue as any)?.astNode?.description ??
                config.astNode.description,
              directives: (config.astNode.directives ?? []).concat(
                (resolverValue as any)?.astNode?.directives ?? [],
              ),
            };
          } else if (
            fieldName === "extensionASTNodes" &&
            config.extensionASTNodes != null
          ) {
            config.extensionASTNodes = config.extensionASTNodes.concat(
              (resolverValue as any)?.extensionASTNodes ?? [],
            );
          } else if (
            fieldName === "extensions" &&
            config.extensions != null &&
            (resolverValue as any).extensions != null
          ) {
            config.extensions = Object.assign(
              {},
              (type as any).extensions,
              (resolverValue as any).extensions,
            );
          } else if (enumValueConfigMap[fieldName]) {
            enumValueConfigMap[fieldName].value =
              (resolverValue as any)[fieldName];
          }
        });

        return new (GraphQLEnumType as any)(config);
      }
    },
    [MapperKind.UNION_TYPE]: (type) => {
      const resolverValue = resolvers[type.name];

      if (resolverValue != null) {
        const config = (type as any).toConfig();
        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            config[fieldName.substring(2)] = (resolverValue as any)[fieldName];
          }
        });

        return new (GraphQLUnionType as any)(config);
      }
    },
    [MapperKind.OBJECT_TYPE]: (type) => {
      const resolverValue = resolvers[type.name];
      if (resolverValue != null) {
        const config = (type as any).toConfig();

        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            config[fieldName.substring(2)] = (resolverValue as any)[fieldName];
          }
        });

        return new (GraphQLObjectType as any)(config);
      }
    },
    [MapperKind.INTERFACE_TYPE]: (type) => {
      const resolverValue = resolvers[type.name];
      if (resolverValue != null) {
        const config = (type as any).toConfig();

        Object.keys(resolverValue).forEach((fieldName) => {
          if (fieldName.startsWith("__")) {
            config[fieldName.substring(2)] = (resolverValue as any)[fieldName];
          }
        });

        return new (GraphQLInterfaceType as any)(config);
      }
    },
    [MapperKind.COMPOSITE_FIELD]: (fieldConfig, fieldName, typeName) => {
      const resolverValue = resolvers[typeName];

      if (resolverValue != null) {
        const fieldResolve = (resolverValue as any)[fieldName];
        if (fieldResolve != null) {
          const newFieldConfig = { ...fieldConfig };
          if (typeof fieldResolve === "function") {
            // for convenience. Allows shorter syntax in resolver definition file
            newFieldConfig.resolve = fieldResolve;
          } else {
            setFieldProperties(newFieldConfig, fieldResolve);
          }
          return newFieldConfig;
        }
      }
    },
  });

  if (defaultFieldResolver != null) {
    schema = mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => ({
        ...fieldConfig,
        resolve: fieldConfig.resolve != null
          ? fieldConfig.resolve
          : defaultFieldResolver,
      }),
    });
  }

  return schema;
}

function setFieldProperties(
  field: GraphQLField<any, any> | GraphQLFieldConfig<any, any>,
  propertiesObj: Record<string, any>,
) {
  Object.keys(propertiesObj).forEach((propertyName) => {
    (field as any)[propertyName] = propertiesObj[propertyName];
  });
}
