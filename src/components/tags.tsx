import { useState } from "react";

// Color palette for tags — assigned deterministically by tag name hash
export const TAG_PALETTE = [
  "bg-amber-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-teal-600",
  "bg-pink-600",
  "bg-indigo-500",
  "bg-cyan-600",
  "bg-emerald-600",
  "bg-orange-500",
  "bg-purple-600",
  "bg-sky-600",
  "bg-lime-600",
];

export function getTagColor(tag: string): string {
  const hash = tag.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

// Suggested tags grouped by category
export const TAG_SUGGESTIONS: Record<string, string[]> = {
  Roasters: ["Leuchtfeuer", "SEY", "Apollon's Gold", "Coffea Circulor", "Black & White Coffee Roasters", "Datura", "Kin Coffee", "Counter Culture", "Savage Coffees"],
  Producers: [
    "William Ortiz", "Jamison Savage", "Diego Parra", "Tamiru Tadesse Tesema",
    "Jhonatan Pito", "Bukeye", "Reinaldo Chilito",
  ],
  Farms: [
    "Finca Debora", "Gaharo Hill", "Dos Pinos", "La Hacienda",
    "Alo Village", "Finca Soledad", "Daterra",
  ],
  Countries: ["Ethiopia", "Colombia", "Panama", "Kenya", "Guatemala", "Costa Rica", "Peru", "Brazil", "Yemen", "Honduras", "Rwanda", "Burundi", "Uganda", "Bolivia"],
  Regions: [
    "Yirgacheffe", "Sidama", "Bensa", "Guji", "Gedeo",
    "Huila", "Antioquia", "Nariño", "Cauca", "Tolima",
    "Chiriqui", "Volcan", "Boquete",
    "Nyeri", "Kirinyaga", "Murang'a",
    "Cajamarca", "Cerrado",
    "Kigali", "Kayanza",
  ],
  Varietals: ["Gesha", "Pink Bourbon", "Bourbon", "Typica", "Caturra", "SL28", "Pacamara", "Castillo", "Sidra", "Sudan Rume", "Laurina", "74110", "74112"],
  Process: ["Washed", "Natural", "Honey", "White Honey", "Fermented Honey", "Anaerobic", "Natural Anaerobic", "Extended Fermentation", "Carbonic Maceration"],
  Roast: ["Light", "Medium", "Dark"],
};

export const ALL_SUGGESTIONS = Object.values(TAG_SUGGESTIONS).flat();

export function TagChip({
  tag,
  onRemove,
  onClick,
  active,
  size = "sm",
}: {
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  size?: "xs" | "sm";
}) {
  const color = getTagColor(tag);
  const sizeClass = size === "xs" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";

  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={[
        "inline-flex items-center gap-1 rounded-full font-medium select-none transition-all",
        "border border-white/30 text-white",
        color,
        sizeClass,
        onClick ? "cursor-pointer hover:brightness-110 hover:border-white/60" : "",
        active ? "ring-2 ring-white/70 brightness-110" : "opacity-90",
      ].join(" ")}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-70 hover:opacity-100 leading-none text-sm"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = input.trim()
    ? ALL_SUGGESTIONS.filter(
        (s) =>
          s.toLowerCase().includes(input.toLowerCase()) &&
          !tags.includes(s)
      )
    : [];

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <TagChip key={tag} tag={tag} onRemove={() => removeTag(tag)} />
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          className="input input-sm input-bordered flex-1"
          placeholder="Add tag (e.g. Gesha, Ethiopia)..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(input);
            }
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={!input.trim()}
          onClick={() => addTag(input)}
        >
          Add
        </button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (filtered.length > 0 || !input.trim()) && (
        <div className="absolute z-20 mt-1 w-full bg-base-100 border border-base-300 rounded-box shadow-lg max-h-48 overflow-y-auto">
          {!input.trim() &&
            Object.entries(TAG_SUGGESTIONS).map(([category, suggestions]) => {
              const available = suggestions.filter((s) => !tags.includes(s));
              if (!available.length) return null;
              return (
                <div key={category} className="px-3 py-2">
                  <div className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-1">
                    {category}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {available.map((s) => (
                      <TagChip key={s} tag={s} onClick={() => addTag(s)} size="xs" />
                    ))}
                  </div>
                </div>
              );
            })}
          {input.trim() &&
            filtered.map((s) => (
              <div
                key={s}
                className="px-3 py-2 hover:bg-base-200 cursor-pointer text-sm"
                onMouseDown={() => addTag(s)}
              >
                {s}
              </div>
            ))}
          {input.trim() && !filtered.length && (
            <div className="px-3 py-2 text-sm text-base-content/50">
              Press Enter to add "{input.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
