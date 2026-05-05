import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

type TraceLogoProps = {
  size?: number;
};

export function TraceLogo({ size = 80 }: TraceLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 657 670" fill="none">
      <Path stroke="url(#a)" strokeLinecap="round" strokeWidth={104} d="M65 69h524" />
      <Path
        stroke="url(#b)"
        strokeLinecap="round"
        strokeWidth={104}
        d="M311 328.955v-148.5C311 124.455 347.496 69 420.998 69h144.997"
      />
      <Path
        stroke="url(#c)"
        strokeLinecap="round"
        strokeWidth={104}
        d="M311 328.955v-148.5C311 124.455 347.496 69 420.998 69h144.997"
      />
      <Path
        fill="url(#d)"
        d="M259 282c0 28.719 23.281 52 52 52s52-23.281 52-52H259m52 0 52-.001V180H259v101.999z"
      />
      <Path
        fill="url(#e)"
        d="M363 568c0 28.719-23.281 52-52 52s-52-23.281-52-52h104m-52 0c-52 0-52-.001-52-.002V340h104v227.998c0 .001 0 .002-52 .002"
      />
      <Circle cx={310.5} cy={339.5} r={56.5} fill="#fdfcfd" stroke="url(#f)" strokeWidth={24} />
      <Circle cx={310.5} cy={601.5} r={56.5} fill="#fdfcfd" stroke="#7123f9" strokeWidth={24} />
      <Circle cx={588.5} cy={68.5} r={56.5} fill="#fdfcfd" stroke="#0264f6" strokeWidth={24} />
      <Circle cx={68.5} cy={68.5} r={56.5} fill="#fdfcfd" stroke="#016afc" strokeWidth={24} />
      <Defs>
        <LinearGradient id="a" x1={247} x2={425.5} y1={69.5} y2={69.5} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#016afa" />
          <Stop offset={1} stopColor="#004eef" />
        </LinearGradient>
        <LinearGradient id="b" x1={311} x2={311} y1={211.5} y2={329} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#0189fd" />
          <Stop offset={1} stopColor="#6e2ef9" />
        </LinearGradient>
        <LinearGradient id="c" x1={438} x2={569.5} y1={69} y2={69} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#0186fd" />
          <Stop offset={1} stopColor="#014ef2" />
        </LinearGradient>
        <LinearGradient id="d" x1={311} x2={311} y1={201.324} y2={282.031} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#0189fd" />
          <Stop offset={1} stopColor="#6e2ef9" />
        </LinearGradient>
        <LinearGradient id="e" x1={311} x2={311} y1={387.664} y2={568.069} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#7223fb" />
          <Stop offset={1} stopColor="#6e2ef9" />
        </LinearGradient>
        <LinearGradient id="f" x1={310.5} x2={310.5} y1={295} y2={384} gradientUnits="userSpaceOnUse">
          <Stop stopColor="#5b3bfa" />
          <Stop offset={1} stopColor="#6d2ff9" />
        </LinearGradient>
      </Defs>
    </Svg>
  );
}
