interface FlavorWheelPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

const FLAVOR_FAMILIES: Record<string, { color: string; tags: string[] }> = {
  Fruity: {
    color: "text-pink-500",
    tags: [
      "apple",
      "green apple",
      "cherry",
      "blueberry",
      "strawberry",
      "peach",
      "mango",
      "citrus",
      "lemon",
      "orange",
      "grapefruit",
      "apricot",
      "raisin",
      "plum",
    ],
  },
  Floral: {
    color: "text-purple-500",
    tags: ["jasmine", "rose", "hibiscus", "lavender", "honeysuckle", "herbal"],
  },
  Sweet: {
    color: "text-amber-500",
    tags: ["honey", "caramel", "brown sugar", "vanilla", "molasses", "maple syrup"],
  },
  "Nutty/Cocoa": {
    color: "text-amber-700",
    tags: ["chocolate", "dark chocolate", "milk chocolate", "hazelnut", "almond", "walnut"],
  },
  Spices: {
    color: "text-red-600",
    tags: ["cinnamon", "clove", "cardamom", "black pepper"],
  },
  Roasted: {
    color: "text-stone-600",
    tags: ["smoky", "tobacco", "cedar", "woody"],
  },
  Other: {
    color: "text-teal-600",
    tags: ["earthy", "buttery", "wine-like", "fermented"],
  },
};

export default function FlavorWheelPicker({ value, onChange }: FlavorWheelPickerProps) {
  const toggleTag = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(FLAVOR_FAMILIES).map(([family, { color, tags }]) => (
        <div key={family}>
          <h4 className={`text-xs font-semibold tracking-widest uppercase mb-2 ${color}`}>
            {family}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const isActive = value.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`badge transition-colors cursor-pointer ${
                    isActive ? "badge-primary" : "badge-outline hover:border-primary/50"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
