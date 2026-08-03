import { createContext, useContext } from "react";

export type OpenArtifact = (artifactId: string) => void;

export const ArtifactOpenContext = createContext<OpenArtifact | null>(null);

export function useOpenArtifact(): OpenArtifact {
  const openArtifact = useContext(ArtifactOpenContext);
  if (!openArtifact) {
    throw new Error("useOpenArtifact must be used inside ArtifactOpenContext.Provider");
  }
  return openArtifact;
}
