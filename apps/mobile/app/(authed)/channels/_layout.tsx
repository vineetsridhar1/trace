import { Stack } from "expo-router";

export default function ChannelsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Channels",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerSearchBarOptions: {
            placeholder: "Search channels",
          },
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Channel",
          headerBackTitle: "Channels",
        }}
      />
    </Stack>
  );
}
