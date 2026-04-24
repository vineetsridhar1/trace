import { StyleSheet } from "react-native";
import {
  ACTION_SIZE,
  INPUT_ACTION_GAP,
  MODEL_CHIP_SIZE,
  MODE_CONTENT_GAP,
  MODE_PILL_HEIGHT,
  MODE_PILL_HORIZONTAL_PADDING,
} from "./constants";

export const styles = StyleSheet.create({
  composerStack: { gap: 8 },
  inputActionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  inputCardSlot: {
    flex: 1,
    position: "relative",
  },
  leadingChipsContainer: {
    position: "relative",
    marginRight: INPUT_ACTION_GAP,
  },
  leadingChipsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: INPUT_ACTION_GAP,
  },
  inputCard: {
    width: "100%",
    minHeight: 46,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  slashMenuOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "100%",
    marginBottom: 10,
    zIndex: 40,
  },
  modeChipSlot: {
    height: ACTION_SIZE,
    overflow: "hidden",
  },
  modeChipPressable: {
    width: "100%",
    height: ACTION_SIZE,
  },
  modeChip: {
    width: "100%",
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    paddingHorizontal: MODE_PILL_HORIZONTAL_PADDING,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  modeChipContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: MODE_CONTENT_GAP,
  },
  modeChipIcon: { width: 16, height: 16 },
  inputWrapper: { overflow: "hidden" },
  input: {
    height: "100%",
    fontSize: 16,
    lineHeight: 21,
    paddingHorizontal: 0,
    paddingVertical: 2,
    textAlignVertical: "top",
  },
  attachButtonSlot: {
    marginLeft: INPUT_ACTION_GAP,
  },
  singleActionSlot: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    marginLeft: INPUT_ACTION_GAP,
  },
  singleActionGlass: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  actionPressable: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  bridgeRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  modelChipSlot: {
    minWidth: MODEL_CHIP_SIZE,
    justifyContent: "center",
  },
  modeMeasureRoot: {
    position: "absolute",
    left: -1000,
    top: 0,
    opacity: 0,
  },
  modeMeasurePill: {
    height: MODE_PILL_HEIGHT,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: MODE_CONTENT_GAP,
    paddingHorizontal: MODE_PILL_HORIZONTAL_PADDING,
  },
  modeIcon: { width: 14, height: 14 },
  modeText: { fontSize: 13, fontWeight: "700" },
  retryRow: { paddingBottom: 4 },
});
