import { useState, useMemo } from "react";

interface RoastDateMarker {
  color: string;
  coffeeName: string;
  entryId: string;
}

interface EntryDateMarker {
  color: string;
  coffeeName: string;
}

interface CalendarMarker {
  color: string;
  icon: string;
  label: string;
  type: "brew" | "roast";
  entryId?: string;
}

interface JournalCalendarProps {
  brewDates: string[];
  entryColorsByDate?: Record<string, string[]>;
  entryMarkersByDate?: Record<string, EntryDateMarker[]>;
  roastDatesByDate?: Record<string, RoastDateMarker[]>;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onSelectRoastDate?: (entryId: string) => void;
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
  entryMarkersByDate = {},
  roastDatesByDate = {},
  selectedDate,
  onSelectDate,
  onSelectRoastDate,
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
                const entryMarkers = entryMarkersByDate[dateKey] ?? [];
                const entryColors = entryMarkers.length > 0
                  ? entryMarkers.map((marker) => marker.color)
                  : entryColorsByDate[dateKey] ?? [];
                const roastMarkers = roastDatesByDate[dateKey] ?? [];
                const dayMarkers: CalendarMarker[] = [
                  ...(entryMarkers.length > 0
                    ? entryMarkers.map((marker) => ({
                        color: marker.color,
                        icon: "☕",
                        label: `Journal entry for ${marker.coffeeName}`,
                        type: "brew" as const,
                      }))
                    : entryColors.map((color, index) => ({
                        color,
                        icon: "☕",
                        label: `Journal entry${entryColors.length > 1 ? ` ${index + 1}` : ""}`,
                        type: "brew" as const,
                      }))),
                  ...roastMarkers.map((marker) => ({
                    color: marker.color,
                    icon: "🔥",
                    label: `Roast date for ${marker.coffeeName}`,
                    type: "roast" as const,
                    entryId: marker.entryId,
                  })),
                ];
                const visibleMarkers = dayMarkers.slice(0, isLarge ? 8 : 4);
                const hiddenMarkerCount = Math.max(dayMarkers.length - visibleMarkers.length, 0);
                const dayMarkerTitle = dayMarkers.length
                  ? dayMarkers.map((marker) => marker.label).join("; ")
                  : undefined;
                const isSelected = selectedDate === dateKey;

                return (
                  <div
                    key={dayIdx}
                    onClick={() => handleDayClick(day)}
                    onKeyDown={(event) => {
                      if (!hasEntry) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleDayClick(day);
                      }
                    }}
                    role={hasEntry ? "button" : undefined}
                    tabIndex={hasEntry ? 0 : undefined}
                    className={`${isLarge ? "min-h-20 h-full" : "h-10"} relative flex flex-col items-center justify-center rounded-lg transition-colors ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/10"
                        : hasEntry
                        ? "hover:bg-base-200 cursor-pointer"
                        : roastMarkers.length > 0
                        ? "opacity-80 cursor-default"
                        : "opacity-50 cursor-default"
                    }`}
                    title={dayMarkerTitle}
                  >
                    <span className={isLarge ? "text-base" : "text-sm"}>{day}</span>
                    {dayMarkers.length > 0 && (
                      <div
                        className={`flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0.5 ${isLarge ? "mt-1" : "mt-0.5"}`}
                        aria-label={dayMarkerTitle}
                      >
                        {visibleMarkers.map((marker, markerIdx) => (
                          <span
                            key={`${dateKey}-${marker.type}-${marker.color}-${markerIdx}`}
                            className={`inline-flex items-center gap-0.5 leading-none ${
                              marker.type === "roast" && marker.entryId && onSelectRoastDate
                                ? "cursor-pointer rounded-sm hover:bg-base-200/70 focus:outline-none focus:ring-1 focus:ring-primary"
                                : ""
                            }`}
                            title={marker.label}
                            role={marker.type === "roast" && marker.entryId && onSelectRoastDate ? "button" : undefined}
                            tabIndex={marker.type === "roast" && marker.entryId && onSelectRoastDate ? 0 : undefined}
                            onClick={(event) => {
                              if (marker.type !== "roast" || !marker.entryId || !onSelectRoastDate) return;
                              event.stopPropagation();
                              onSelectRoastDate(marker.entryId);
                            }}
                            onKeyDown={(event) => {
                              if (marker.type !== "roast" || !marker.entryId || !onSelectRoastDate) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectRoastDate(marker.entryId);
                              }
                            }}
                          >
                            <span className={isLarge ? "text-xs" : "text-[9px]"} aria-hidden="true">
                              {marker.icon}
                            </span>
                            <span
                              className={`${isLarge ? "h-2 w-2" : "h-1.5 w-1.5"} rounded-full border border-base-100 shadow-sm`}
                              style={{ backgroundColor: marker.color }}
                              aria-hidden="true"
                            />
                          </span>
                        ))}
                        {hiddenMarkerCount > 0 && (
                          <span className="text-[9px] leading-none text-base-content/45">+{hiddenMarkerCount}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
