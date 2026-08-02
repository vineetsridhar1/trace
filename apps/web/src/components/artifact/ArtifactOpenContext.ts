import { createContext, useContext } from "react";

export type OpenArtifact = (artifactId: string) => void;

export const ArtifactOpenContext = createContext<OpenArtifact>(() => {});

export function useOpenArtifact(): OpenArtifact {
  return useContext(ArtifactOpenContext);
}
