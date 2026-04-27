import type { Context as GqlContext } from "@trace/gql";

export interface Context extends GqlContext {
  clientSource: string | null;
}
