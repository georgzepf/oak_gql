// deno-lint-ignore-file no-explicit-any
import {
  GraphQLEnumType,
  GraphQLEnumValue,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  isEnumType,
  isInputObjectType,
  isInputType,
  isInterfaceType,
  isNamedType,
  isObjectType,
  isScalarType,
  isSchema,
  isUnionType,
} from "../../deps.ts";

import {
  NamedTypeVisitor,
  SchemaVisitorMap,
  VisitableSchemaType,
  VisitorSelector,
  VisitSchemaKind,
} from "./interfaces.ts";

import { healSchema } from "./heal.ts";
import { SchemaVisitor } from "./schema_visitor.ts";

function isSchemaVisitor(obj: any): obj is SchemaVisitor {
  if ("schema" in obj && isSchema(obj.schema)) {
    if ("visitSchema" in obj && typeof obj.visitSchema === "function") {
      return true;
    }
  }
  return false;
}

// Generic function for visiting GraphQLSchema objects.
export function visitSchema(
  schema: typeof GraphQLSchema,
  // To accommodate as many different visitor patterns as possible, the
  // visitSchema function does not simply accept a single instance of the
  // SchemaVisitor class, but instead accepts a function that takes the
  // current VisitableSchemaType object and the name of a visitor method and
  // returns an array of SchemaVisitor instances that implement the visitor
  // method and have an interest in handling the given VisitableSchemaType
  // object. In the simplest case, this function can always return an array
  // containing a single visitor object, without even looking at the type or
  // methodName parameters. In other cases, this function might sometimes
  // return an empty array to indicate there are no visitors that should be
  // applied to the given VisitableSchemaType object. For an example of a
  // visitor pattern that benefits from this abstraction, see the
  // SchemaDirectiveVisitor class below.
  visitorOrVisitorSelector:
    | VisitorSelector
    | Array<SchemaVisitor | SchemaVisitorMap>
    | SchemaVisitor
    | SchemaVisitorMap,
): typeof GraphQLSchema {
  const visitorSelector = typeof visitorOrVisitorSelector === "function"
    ? visitorOrVisitorSelector
    : () => visitorOrVisitorSelector;

  // Helper function that calls visitorSelector and applies the resulting
  // visitors to the given type, with arguments [type, ...args].
  function callMethod<T extends VisitableSchemaType>(
    methodName: string,
    type: T,
    ...args: Array<any>
  ): T | null {
    let visitors = visitorSelector(type, methodName);
    visitors = Array.isArray(visitors) ? visitors : [visitors];

    let finalType: T | null = type;
    visitors.every((visitorOrVisitorDef) => {
      let newType;
      if (isSchemaVisitor(visitorOrVisitorDef)) {
        newType = (visitorOrVisitorDef as any)[methodName](finalType, ...args);
      } else if (
        isNamedType(finalType) &&
        (methodName === "visitScalar" ||
          methodName === "visitEnum" ||
          methodName === "visitObject" ||
          methodName === "visitInputObject" ||
          methodName === "visitUnion" ||
          methodName === "visitInterface")
      ) {
        const specifiers = getTypeSpecifiers(finalType, schema);
        const typeVisitor = getVisitor(visitorOrVisitorDef, specifiers);
        newType = typeVisitor != null
          ? typeVisitor(finalType, schema)
          : undefined;
      }

      if (typeof newType === "undefined") {
        // Keep going without modifying type.
        return true;
      }

      if (methodName === "visitSchema" || isSchema(finalType)) {
        throw new Error(
          `Method ${methodName} cannot replace schema with ${newType as string}`,
        );
      }

      if (newType === null) {
        // Stop the loop and return null form callMethod, which will cause
        // the type to be removed from the schema.
        finalType = null;
        return false;
      }

      // Update type to the new type returned by the visitor method, so that
      // later directives will see the new type, and callMethod will return
      // the final type.
      finalType = newType;
      return true;
    });

    // If there were no directives for this type object, or if all visitor
    // methods returned nothing, type will be returned unmodified.
    return finalType;
  }

  // Recursive helper function that calls any appropriate visitor methods for
  // each object in the schema, then traverses the object's children (if any).
  function visit<T extends VisitableSchemaType>(type: T): T | null {
    if (isSchema(type)) {
      // Unlike the other types, the root GraphQLSchema object cannot be
      // replaced by visitor methods, because that would make life very hard
      // for SchemaVisitor subclasses that rely on the original schema object.
      callMethod("visitSchema", type);

      const typeMap: Record<string, GraphQLNamedType | null> = (type as any)
        .getTypeMap();
      Object.entries(typeMap).forEach(([typeName, namedType]) => {
        if (!typeName.startsWith("__") && namedType != null) {
          // Call visit recursively to let it determine which concrete
          // subclass of GraphQLNamedType we found in the type map.
          // We do not use updateEachKey because we want to preserve
          // deleted types in the typeMap so that other types that reference
          // the deleted types can be healed.
          typeMap[typeName] = visit(namedType);
        }
      });

      return type;
    }

    if (isObjectType(type)) {
      // Note that callMethod('visitObject', type) may not actually call any
      // methods, if there are no @directive annotations associated with this
      // type, or if this SchemaDirectiveVisitor subclass does not override
      // the visitObject method.
      const newObject = callMethod("visitObject", type);
      if (newObject != null) {
        (visitFields as any)(newObject);
      }
      return newObject;
    }

    if (isInterfaceType(type)) {
      const newInterface = callMethod("visitInterface", type);
      if (newInterface != null) {
        (visitFields as any)(newInterface);
      }
      return newInterface;
    }

    if (isInputObjectType(type)) {
      const newInputObject = callMethod("visitInputObject", type);

      if (newInputObject != null) {
        const fieldMap = (newInputObject as any).getFields() as Record<
          string,
          any
        >;
        for (const key of Object.keys(fieldMap)) {
          fieldMap[key] = callMethod(
            "visitInputFieldDefinition",
            fieldMap[key],
            {
              // Since we call a different method for input object fields, we
              // can't reuse the visitFields function here.
              objectType: newInputObject,
            },
          );
          if (!fieldMap[key]) {
            delete fieldMap[key];
          }
        }
      }

      return newInputObject;
    }

    if (isScalarType(type)) {
      return callMethod("visitScalar", type);
    }

    if (isUnionType(type)) {
      return callMethod("visitUnion", type);
    }

    if (isEnumType(type)) {
      let newEnum = callMethod("visitEnum", type);

      if (newEnum != null) {
        const newValues: Array<GraphQLEnumValue> = (newEnum as any)
          .getValues()
          .map((value: any) =>
            callMethod("visitEnumValue", value, {
              enumType: newEnum,
            })
          )
          .filter(Boolean);

        // Recreate the enum type if any of the values changed
        const valuesUpdated = newValues.some((value, index) =>
          value !== (newEnum as any).getValues()[index]
        );
        if (valuesUpdated) {
          newEnum = new (GraphQLEnumType as any)({
            ...(newEnum as any).toConfig(),
            values: newValues.reduce(
              (prev, value) => ({
                ...prev,
                [value.name]: {
                  value: value.value,
                  deprecationReason: value.deprecationReason,
                  description: value.description,
                  astNode: value.astNode,
                },
              }),
              {},
            ),
          }) as any;
        }
      }

      return newEnum;
    }

    throw new Error(`Unexpected schema type: ${(type as unknown) as string}`);
  }

  function visitFields(
    type: typeof GraphQLObjectType | typeof GraphQLInterfaceType,
  ) {
    const fieldMap = (type as any).getFields();
    for (const [key, field] of Object.entries(fieldMap)) {
      // It would be nice if we could call visit(field) recursively here, but
      // GraphQLField is merely a type, not a value that can be detected using
      // an instanceof check, so we have to visit the fields in this lexical
      // context, so that TypeScript can validate the call to
      // visitFieldDefinition.
      const newField = callMethod("visitFieldDefinition", (field as any), {
        // While any field visitor needs a reference to the field object, some
        // field visitors may also need to know the enclosing (parent) type,
        // perhaps to determine if the parent is a GraphQLObjectType or a
        // GraphQLInterfaceType. To obtain a reference to the parent, a
        // visitor method can have a second parameter, which will be an object
        // with an .objectType property referring to the parent.
        objectType: type,
      });

      if ((newField as any)?.args != null) {
        (newField as any).args = (newField as any).args
          .map((arg: any) =>
            callMethod("visitArgumentDefinition", arg, {
              // Like visitFieldDefinition, visitArgumentDefinition takes a
              // second parameter that provides additional context, namely the
              // parent .field and grandparent .objectType. Remember that the
              // current GraphQLSchema is always available via this.schema.
              field: newField,
              objectType: type,
            })
          )
          .filter(Boolean);
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (newField) {
        fieldMap[key] = newField;
      } else {
        delete fieldMap[key];
      }
    }
  }

  visit(schema);

  // Automatically update any references to named schema types replaced
  // during the traversal, so implementers don't have to worry about that.
  healSchema(schema);

  // Return schema for convenience, even though schema parameter has all updated types.
  return schema;
}

function getTypeSpecifiers(
  type: GraphQLType,
  schema: typeof GraphQLSchema,
): Array<VisitSchemaKind> {
  const specifiers = [VisitSchemaKind.TYPE];
  if (isObjectType(type)) {
    specifiers.push(
      VisitSchemaKind.COMPOSITE_TYPE,
      VisitSchemaKind.OBJECT_TYPE,
    );
    const query = (schema as any).getQueryType();
    const mutation = (schema as any).getMutationType();
    const subscription = (schema as any).getSubscriptionType();
    if (type === query) {
      specifiers.push(VisitSchemaKind.ROOT_OBJECT, VisitSchemaKind.QUERY);
    } else if (type === mutation) {
      specifiers.push(VisitSchemaKind.ROOT_OBJECT, VisitSchemaKind.MUTATION);
    } else if (type === subscription) {
      specifiers.push(
        VisitSchemaKind.ROOT_OBJECT,
        VisitSchemaKind.SUBSCRIPTION,
      );
    }
  } else if (isInputType(type)) {
    specifiers.push(VisitSchemaKind.INPUT_OBJECT_TYPE);
  } else if (isInterfaceType(type)) {
    specifiers.push(
      VisitSchemaKind.COMPOSITE_TYPE,
      VisitSchemaKind.ABSTRACT_TYPE,
      VisitSchemaKind.INTERFACE_TYPE,
    );
  } else if (isUnionType(type)) {
    specifiers.push(
      VisitSchemaKind.COMPOSITE_TYPE,
      VisitSchemaKind.ABSTRACT_TYPE,
      VisitSchemaKind.UNION_TYPE,
    );
  } else if (isEnumType(type)) {
    specifiers.push(VisitSchemaKind.ENUM_TYPE);
  } else if (isScalarType(type)) {
    specifiers.push(VisitSchemaKind.SCALAR_TYPE);
  }

  return specifiers;
}

function getVisitor(
  visitorDef: SchemaVisitorMap,
  specifiers: Array<VisitSchemaKind>,
): NamedTypeVisitor | null {
  let typeVisitor: NamedTypeVisitor | undefined;
  const stack = [...specifiers];
  while (!typeVisitor && stack.length > 0) {
    const next = stack.pop();
    typeVisitor = visitorDef[next!] as NamedTypeVisitor;
  }

  return typeVisitor != null ? typeVisitor : null;
}
