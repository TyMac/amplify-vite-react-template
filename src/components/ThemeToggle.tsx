import { useTheme, ThemeMode } from "../contexts/ThemeContext";

const icons: Record<ThemeMode, string> = {
  light: "☀️",
  dark: "🌙",
  auto: "💻",
};

const labels: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  auto: "System",
};

const cycle: ThemeMode[] = ["auto", "light", "dark"];

export default function ThemeToggle() {
  const { themeMode, setThemeMode } = useTheme();

  const next = () => {
    const idx = cycle.indexOf(themeMode);
    setThemeMode(cycle[(idx + 1) % cycle.length]);
  };

  return (
    <button
      onClick={next}
      className="btn btn-ghost btn-sm gap-1"
      title={`Theme: ${labels[themeMode]}`}
    >
      <span className="text-base">{icons[themeMode]}</span>
      <span className="hidden sm:inline text-xs">{labels[themeMode]}</span>
    </button>
  );
}
