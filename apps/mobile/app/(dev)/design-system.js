"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DesignSystemScreen;
var react_1 = require("react");
var react_native_1 = require("react-native");
var expo_router_1 = require("expo-router");
var theme_1 = require("@/theme");
var design_system_1 = require("@/components/design-system");
function Section(_a) {
    var title = _a.title, children = _a.children;
    var theme = (0, theme_1.useTheme)();
    return (<react_native_1.View style={{ marginBottom: theme.spacing.xl }}>
      <design_system_1.Text variant="caption1" color="dimForeground" style={{ marginBottom: theme.spacing.sm, textTransform: "uppercase", letterSpacing: 1 }}>
        {title}
      </design_system_1.Text>
      {children}
    </react_native_1.View>);
}
function Row(_a) {
    var children = _a.children, style = _a.style;
    return (<react_native_1.View style={[
            { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
            style,
        ]}>
      {children}
    </react_native_1.View>);
}
var TYPOGRAPHY_VARIANTS = [
    "largeTitle", "title1", "title2", "headline", "body",
    "callout", "subheadline", "footnote", "caption1", "caption2", "mono",
];
var CHIP_VARIANTS = [
    "inProgress", "needsInput", "done", "failed", "merged", "inReview",
];
var STATUS_DOT_STATUSES = ["active", "done", "failed", "stopped"];
var AVATAR_SIZES = ["xs", "sm", "md", "lg"];
function DesignSystemScreen() {
    var theme = (0, theme_1.useTheme)();
    var router = (0, expo_router_1.useRouter)();
    var _a = (0, react_1.useState)(0), segmentIdx = _a[0], setSegmentIdx = _a[1];
    return (<react_native_1.ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 80 }}>
      <design_system_1.Text variant="title2" style={{ marginBottom: theme.spacing.xl }}>Design System</design_system_1.Text>

      <Section title="Typography">
        <react_native_1.View style={{ gap: 4 }}>
          {TYPOGRAPHY_VARIANTS.map(function (v) { return (<design_system_1.Text key={v} variant={v}>{v}</design_system_1.Text>); })}
        </react_native_1.View>
      </Section>

      <Section title="Buttons">
        <Row>
          <design_system_1.Button title="Primary" variant="primary"/>
          <design_system_1.Button title="Secondary" variant="secondary"/>
          <design_system_1.Button title="Ghost" variant="ghost"/>
          <design_system_1.Button title="Destructive" variant="destructive"/>
        </Row>
        <Row style={{ marginTop: 8 }}>
          <design_system_1.Button title="Small" size="sm"/>
          <design_system_1.Button title="Large" size="lg"/>
          <design_system_1.Button title="Loading" loading/>
          <design_system_1.Button title="Disabled" disabled/>
        </Row>
      </Section>

      <Section title="Icon Buttons">
        <Row>
          <design_system_1.IconButton symbol="plus" size="sm" onPress={function () { }} accessibilityLabel="add sm"/>
          <design_system_1.IconButton symbol="plus" size="md" onPress={function () { }} accessibilityLabel="add md"/>
          <design_system_1.IconButton symbol="plus" size="lg" onPress={function () { }} accessibilityLabel="add lg"/>
          <design_system_1.IconButton symbol="ellipsis" onPress={function () { }} accessibilityLabel="more"/>
          <design_system_1.IconButton symbol="trash" color="destructive" onPress={function () { }} accessibilityLabel="delete"/>
        </Row>
      </Section>

      <Section title="Cards">
        <react_native_1.View style={{ gap: 8 }}>
          <design_system_1.Card><design_system_1.Text variant="body">Static card</design_system_1.Text></design_system_1.Card>
          <design_system_1.Card onPress={function () { }}><design_system_1.Text variant="body">Pressable card (tap for scale + haptic)</design_system_1.Text></design_system_1.Card>
          <design_system_1.Card glass><design_system_1.Text variant="body">Glass card</design_system_1.Text></design_system_1.Card>
        </react_native_1.View>
      </Section>

      <Section title="Chips">
        <Row>
          {CHIP_VARIANTS.map(function (v) { return (<design_system_1.Chip key={v} label={v} variant={v}/>); })}
        </Row>
      </Section>

      <Section title="Status Dots">
        <Row>
          {STATUS_DOT_STATUSES.map(function (s) { return (<react_native_1.View key={s} style={{ alignItems: "center", gap: 4 }}>
              <design_system_1.StatusDot status={s} size="md"/>
              <design_system_1.Text variant="caption2" color="dimForeground">{s}</design_system_1.Text>
            </react_native_1.View>); })}
        </Row>
      </Section>

      <Section title="List Rows">
        <react_native_1.View style={{ borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.colors.surface }}>
          <design_system_1.ListRow title="Simple row"/>
          <design_system_1.ListRow title="With subtitle" subtitle="Supporting detail text"/>
          <design_system_1.ListRow title="Disclosure" disclosureIndicator/>
          <design_system_1.ListRow title="Pressable" onPress={function () { }} disclosureIndicator/>
          <design_system_1.ListRow title="Destructive" destructive separator={false}/>
        </react_native_1.View>
      </Section>

      <Section title="Avatars">
        <Row>
          {AVATAR_SIZES.map(function (size) { return (<design_system_1.Avatar key={size} name="Alice Johnson" size={size}/>); })}
          <design_system_1.Avatar name="Bob Smith" uri="https://example.invalid/404.jpg"/>
        </Row>
      </Section>

      <Section title="Skeletons">
        <react_native_1.View style={{ gap: 8 }}>
          <design_system_1.Skeleton height={16}/>
          <design_system_1.Skeleton height={16} width="60%"/>
          <design_system_1.Skeleton height={48} radius={theme.radius.lg}/>
          <Row>
            <design_system_1.Skeleton width={36} height={36} radius={18}/>
            <react_native_1.View style={{ flex: 1, gap: 6 }}>
              <design_system_1.Skeleton height={14}/>
              <design_system_1.Skeleton height={12} width="70%"/>
            </react_native_1.View>
          </Row>
        </react_native_1.View>
      </Section>

      <Section title="Segmented Control">
        <design_system_1.SegmentedControl segments={["One", "Two", "Three"]} selectedIndex={segmentIdx} onChange={setSegmentIdx}/>
      </Section>

      <Section title="Empty State">
        <design_system_1.EmptyState icon="tray" title="Nothing here" subtitle="Empty state with subtitle and action button" action={{ label: "Take action", onPress: function () { } }}/>
      </Section>

      <Section title="Sheet">
        <design_system_1.ListRow title="Sheet Preview" subtitle="Opens a form sheet with medium + large detents" disclosureIndicator onPress={function () { return router.push("/(dev)/sheet-preview"); }} separator={false} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg }}/>
      </Section>
    </react_native_1.ScrollView>);
}
