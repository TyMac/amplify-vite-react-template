import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

interface ScoreWheelProps {
  scores: {
    sweetness?: number;
    acidity?: number;
    body?: number;
    florality?: number;
    finish?: number;
    bitterness?: number;
  };
}

export default function ScoreWheel({ scores }: ScoreWheelProps) {
  const data = [
    { axis: "Sweetness", value: scores.sweetness ?? 0 },
    { axis: "Acidity", value: scores.acidity ?? 0 },
    { axis: "Body", value: scores.body ?? 0 },
    { axis: "Florality", value: scores.florality ?? 0 },
    { axis: "Finish", value: scores.finish ?? 0 },
    { axis: "Bitterness", value: scores.bitterness ?? 0 },
  ];

  const hasAnyScore = Object.values(scores).some((v) => v !== undefined && v > 0);

  if (!hasAnyScore) {
    return (
      <div className="flex items-center justify-center h-48 text-base-content/40 text-sm">
        No scores yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="currentColor" className="text-base-content/20" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: "currentColor", fontSize: 11 }}
          className="text-base-content/70"
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 5]}
          tickCount={6}
          tick={{ fill: "currentColor", fontSize: 9 }}
          className="text-base-content/50"
        />
        <Radar
          name="Scores"
          dataKey="value"
          stroke="oklch(var(--p))"
          fill="oklch(var(--p))"
          fillOpacity={0.4}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
