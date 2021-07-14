// deno-lint-ignore-file no-explicit-any
import { GraphQLSchema } from "../../deps.ts";

import { IObjectTypeResolver, IResolvers } from "../utils/mod.ts";

export function extendResolversFromInterfaces(
  schema: typeof GraphQLSchema,
  resolvers: IResolvers,
): IResolvers {
  const typeNames = Object.keys({
    ...(schema as any).getTypeMap(),
    ...resolvers,
  });

  const extendedResolvers = {};
  typeNames.forEach((typeName) => {
    const type = (schema as any).getType(typeName);
    if (type && "getInterfaces" in type) {
      const allInterfaceResolvers = type
        .getInterfaces()
        .map((iFace: any) => resolvers[iFace.name])
        .filter((interfaceResolvers: any) => interfaceResolvers != null);

      (extendedResolvers as any)[typeName] = {};
      allInterfaceResolvers.forEach((interfaceResolvers: any) => {
        Object.keys(interfaceResolvers).forEach((fieldName) => {
          if (fieldName === "__isTypeOf" || !fieldName.startsWith("__")) {
            (extendedResolvers as any)[typeName][fieldName] =
              interfaceResolvers[fieldName];
          }
        });
      });

      const typeResolvers = resolvers[typeName] as Record<
        string,
        IObjectTypeResolver
      >;
      (extendedResolvers as any)[typeName] = {
        ...(extendedResolvers as any)[typeName],
        ...typeResolvers,
      };
    } else {
      const typeResolvers = resolvers[typeName];
      if (typeResolvers != null) {
        (extendedResolvers as any)[typeName] = typeResolvers;
      }
    }
  });

  return extendedResolvers;
}
