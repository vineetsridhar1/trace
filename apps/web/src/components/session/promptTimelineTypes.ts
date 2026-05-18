export interface PromptTimelineItem {
  id: string;
  text: string;
  actorName: string;
  timestamp: string;
  imageCount: number;
  widthPercent: number;
  nodeIndex: number | null;
}
