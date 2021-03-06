// deno-lint-ignore-file no-explicit-any
import {
  GraphQLArgument,
  GraphQLEnumType,
  GraphQLEnumValue,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
} from "../../deps.ts";

// Abstract base class of any visitor implementation, defining the available
// visitor methods along with their parameter types, and providing a static
// helper function for determining whether a subclass implements a given
// visitor method, as opposed to inheriting one of the stubs defined here.
export abstract class SchemaVisitor {
  // All SchemaVisitor instances are created while visiting a specific
  // GraphQLSchema object, so this property holds a reference to that object,
  // in case a visitor method needs to refer to this.schema.
  public schema!: typeof GraphQLSchema;

  // Determine if this SchemaVisitor (sub)class implements a particular
  // visitor method.
  public static implementsVisitorMethod(methodName: string): boolean {
    if (!methodName.startsWith("visit")) {
      return false;
    }

    const method = (this.prototype as any)[methodName];
    if (typeof method !== "function") {
      return false;
    }

    if (this.name === "SchemaVisitor") {
      // The SchemaVisitor class implements every visitor method.
      return true;
    }

    const stub = (SchemaVisitor.prototype as any)[methodName];
    if (method === stub) {
      // If this.prototype[methodName] was just inherited from SchemaVisitor,
      // then this class does not really implement the method.
      return false;
    }

    return true;
  }

  // Concrete subclasses of SchemaVisitor should override one or more of these
  // visitor methods, in order to express their interest in handling certain
  // schema types/locations. Each method may return null to remove the given
  // type from the schema, a non-null value of the same type to update the
  // type in the schema, or nothing to leave the type as it was.

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public visitSchema(_schema: typeof GraphQLSchema): void {}

  public visitScalar(
    _scalar: typeof GraphQLScalarType,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): typeof GraphQLScalarType | void | null {}

  public visitObject(
    _object: typeof GraphQLObjectType,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): typeof GraphQLObjectType | void | null {}

  public visitFieldDefinition(
    _field: GraphQLField<any, any>,
    _details: {
      objectType: typeof GraphQLObjectType | typeof GraphQLInterfaceType;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): GraphQLField<any, any> | void | null {}

  public visitArgumentDefinition(
    _argument: GraphQLArgument,
    _details: {
      field: GraphQLField<any, any>;
      objectType: typeof GraphQLObjectType | typeof GraphQLInterfaceType;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): GraphQLArgument | void | null {}

  public visitInterface(
    _iface: typeof GraphQLInterfaceType,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): typeof GraphQLInterfaceType | void | null {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public visitUnion(
    _union: typeof GraphQLUnionType,
  ): typeof GraphQLUnionType | void | null {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public visitEnum(
    _type: typeof GraphQLEnumType,
  ): typeof GraphQLEnumType | void | null {}

  public visitEnumValue(
    _value: GraphQLEnumValue,
    _details: {
      enumType: typeof GraphQLEnumType;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): GraphQLEnumValue | void | null {}

  public visitInputObject(
    _object: typeof GraphQLInputObjectType,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): typeof GraphQLInputObjectType | void | null {}

  public visitInputFieldDefinition(
    _field: GraphQLInputField,
    _details: {
      objectType: typeof GraphQLInputObjectType;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): GraphQLInputField | void | null {}
}
