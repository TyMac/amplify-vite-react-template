import { useState, useMemo } from "react";

interface RoastDateMarker {
  color: string;
  coffeeName: string;
}

interface JournalCalendarProps {
  brewDates: string[];
  entryColorsByDate?: Record<string, string[]>;
  roastDatesByDate?: Record<string, RoastDateMarker[]>;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  size?: "default" | "large";
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function JournalCalendar({
  brewDates,
  entryColorsByDate = {},
  roastDatesByDate = {},
  selectedDate,
  onSelectDate,
  size = "default",
}: JournalCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const brewDateSet = useMemo(() => {
    const set = new Set<string>(Object.keys(entryColorsByDate));
    brewDates.forEach((dateStr) => {
      const d = new Date(dateStr);
      set.add(formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    });
    return set;
  }, [brewDates, entryColorsByDate]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const dateKey = formatDateKey(year, month, day);
    if (!brewDateSet.has(dateKey)) return;

    if (selectedDate === dateKey) {
      onSelectDate(null);
    } else {
      onSelectDate(dateKey);
    }
  };

  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const isLarge = size === "large";

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  while (weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1].push(null);
  }

  return (
    <div className={`card bg-base-100 shadow-sm border border-base-200 ${isLarge ? "h-full" : ""}`}>
      <div className={`card-body ${isLarge ? "p-4 sm:p-6 h-full min-h-0 flex flex-col" : "p-4"}`}>
        <div className={`flex items-center justify-between ${isLarge ? "mb-4 sm:mb-6 flex-shrink-0" : "mb-4"}`}>
          <button onClick={goToPreviousMonth} className={`btn btn-ghost ${isLarge ? "btn-md" : "btn-sm"}`}>
            ←
          </button>
          <h3 className={`font-semibold text-base-content ${isLarge ? "text-xl" : ""}`}>
            {monthName} {year}
          </h3>
          <button onClick={goToNextMonth} className={`btn btn-ghost ${isLarge ? "btn-md" : "btn-sm"}`}>
            →
          </button>
        </div>

        <div className={`grid grid-cols-7 gap-1 text-center font-medium text-base-content/50 mb-2 ${isLarge ? "text-sm flex-shrink-0" : "text-xs"}`}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className={`${isLarge ? "flex flex-1 min-h-0 flex-col gap-2" : "flex flex-col gap-1"}`}>
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className={`grid grid-cols-7 ${isLarge ? "flex-1 min-h-0 gap-2" : "gap-1"}`}>
              {week.map((day, dayIdx) => {
                if (day === null) {
                  return <div key={dayIdx} className={isLarge ? "min-h-20 h-full" : "h-10"} />;
                }

                const dateKey = formatDateKey(year, month, day);
                const hasEntry = brewDateSet.has(dateKey);
                const entryColors = entryColorsByDate[dateKey] ?? [];
                const visibleEntryColors = entryColors.slice(0, 4);
                const hiddenEntryColorCount = Math.max(entryColors.length - visibleEntryColors.length, 0);
                const roastMarkers = roastDatesByDate[dateKey] ?? [];
                const firstRoastMarker = roastMarkers[0];
                const hiddenRoastMarkerCount = Math.max(roastMarkers.length - 1, 0);
                const roastMarkerTitle = roastMarkers.length
                  ? roastMarkers.length === 1
                    ? `Roast date for ${firstRoastMarker.coffeeName}`
                    : `Roast date for ${roastMarkers.length} coffees: ${roastMarkers.map((marker) => marker.coffeeName).join(", ")}`
                  : undefined;
                const isSelected = selectedDate === dateKey;

                return (
                  <button
                    key={dayIdx}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    disabled={!hasEntry}
                    className={`${isLarge ? "min-h-20 h-full" : "h-10"} relative flex flex-col items-center justify-center rounded-lg transition-colors ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/10"
                        : hasEntry
                        ? "hover:bg-base-200 cursor-pointer"
                        : roastMarkers.length > 0
                        ? "opacity-80 cursor-default"
                        : "opacity-50 cursor-default"
                    }`}
                    title={roastMarkerTitle}
                  >
                    <span className={isLarge ? "text-base" : "text-sm"}>{day}</span>
                    {hasEntry && <span className={`${isLarge ? "text-xs" : "text-[10px]"} leading-none`}>☕</span>}
                    {firstRoastMarker && (
                      <span
                        className={`absolute right-1 top-1 inline-flex items-center rounded-full bg-base-100/85 px-0.5 leading-none shadow-sm ${isLarge ? "text-sm" : "text-[10px]"}`}
                        style={{ color: firstRoastMarker.color }}
                        role="img"
                        aria-label={roastMarkerTitle}
                      >
                        🔥{hiddenRoastMarkerCount > 0 && <span className="ml-0.5 text-[9px] text-base-content/60">+{hiddenRoastMarkerCount}</span>}
                      </span>
                    )}
                    {entryColors.length > 0 && (
                      <div className="flex max-w-full flex-wrap justify-center gap-0.5 mt-0.5" aria-hidden="true">
                        {visibleEntryColors.map((color, colorIdx) => (
                          <span
                            key={`${dateKey}-${color}-${colorIdx}`}
                            className={`${isLarge ? "h-2 w-2" : "h-1.5 w-1.5"} rounded-full border border-base-100 shadow-sm`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                        {hiddenEntryColorCount > 0 && (
                          <span className="text-[9px] leading-none text-base-content/45">+{hiddenEntryColorCount}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
