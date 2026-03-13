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
    florality?: number;
    spicy?: number;
    salty?: number;
    berryFruit?: number;
    citrusFruit?: number;
    stoneFruit?: number;
    chocolate?: number;
    caramel?: number;
    smoky?: number;
    bitterness?: number;
    savory?: number;
    body?: number;
    clarity?: number;
    finish?: number;
  };
}

export default function ScoreWheel({ scores }: ScoreWheelProps) {
  // 16 axes in clockwise order: Sweet, Acidic, Floral, Spicy, Salty, Berry Fruit,
  // Citrus Fruit, Stone Fruit, Chocolate, Caramel, Smoky, Bitter, Savory, Body, Clean, Linger/Finish
  const data = [
    { axis: "Sweet", value: scores.sweetness ?? 0 },
    { axis: "Acidic", value: scores.acidity ?? 0 },
    { axis: "Floral", value: scores.florality ?? 0 },
    { axis: "Spicy", value: scores.spicy ?? 0 },
    { axis: "Salty", value: scores.salty ?? 0 },
    { axis: "Berry Fruit", value: scores.berryFruit ?? 0 },
    { axis: "Citrus Fruit", value: scores.citrusFruit ?? 0 },
    { axis: "Stone Fruit", value: scores.stoneFruit ?? 0 },
    { axis: "Chocolate", value: scores.chocolate ?? 0 },
    { axis: "Caramel", value: scores.caramel ?? 0 },
    { axis: "Smoky", value: scores.smoky ?? 0 },
    { axis: "Bitter", value: scores.bitterness ?? 0 },
    { axis: "Savory", value: scores.savory ?? 0 },
    { axis: "Body", value: scores.body ?? 0 },
    { axis: "Clean", value: scores.clarity ?? 0 },
    { axis: "Linger/Finish", value: scores.finish ?? 0 },
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
    <ResponsiveContainer width="100%" height={420}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
        <defs>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.85} />
            <stop offset="60%" stopColor="#f97316" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} />
          </radialGradient>
        </defs>
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
          stroke="#f97316"
          fill="url(#radarFill)"
          fillOpacity={1}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
