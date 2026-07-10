export type MediaModel = {
  id: string;
  label: string;
  hint: string;
  provider: string;
  caps: string[];
  default?: boolean;
};

export const IMAGE_MODELS: MediaModel[] = [
  {
    id: "gpt-image-2",
    label: "gpt-image-2",
    hint: "OpenAI image generation model",
    provider: "openai",
    caps: ["t2i", "i2i"],
    default: true,
  },
];

export const VIDEO_MODELS: MediaModel[] = [
  {
    id: "stub-video",
    label: "stub-video",
    hint: "Trace disables Open Design media generation by default",
    provider: "stub",
    caps: ["t2v"],
  },
];

export const AUDIO_MODELS_BY_KIND: Record<"music" | "speech" | "sfx", MediaModel[]> = {
  music: [
    {
      id: "stub-music",
      label: "stub-music",
      hint: "Trace disables Open Design media generation by default",
      provider: "stub",
      caps: ["text-to-music"],
    },
  ],
  speech: [
    {
      id: "stub-speech",
      label: "stub-speech",
      hint: "Trace disables Open Design media generation by default",
      provider: "stub",
      caps: ["tts"],
    },
  ],
  sfx: [
    {
      id: "stub-sfx",
      label: "stub-sfx",
      hint: "Trace disables Open Design media generation by default",
      provider: "stub",
      caps: ["text-to-sfx"],
    },
  ],
};
