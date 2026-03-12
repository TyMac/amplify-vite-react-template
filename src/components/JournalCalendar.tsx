import { useState, useMemo } from "react";

interface JournalCalendarProps {
  brewDates: string[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
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
  selectedDate,
  onSelectDate,
}: JournalCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const brewDateSet = useMemo(() => {
    const set = new Set<string>();
    brewDates.forEach((dateStr) => {
      const d = new Date(dateStr);
      set.add(formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    });
    return set;
  }, [brewDates]);

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
    <div className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={goToPreviousMonth} className="btn btn-ghost btn-sm">
            ←
          </button>
          <h3 className="font-semibold text-base-content">
            {monthName} {year}
          </h3>
          <button onClick={goToNextMonth} className="btn btn-ghost btn-sm">
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-base-content/50 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-1">
              {week.map((day, dayIdx) => {
                if (day === null) {
                  return <div key={dayIdx} className="h-10" />;
                }

                const dateKey = formatDateKey(year, month, day);
                const hasEntry = brewDateSet.has(dateKey);
                const isSelected = selectedDate === dateKey;

                return (
                  <button
                    key={dayIdx}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    disabled={!hasEntry}
                    className={`h-10 flex flex-col items-center justify-center rounded-lg transition-colors ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/10"
                        : hasEntry
                        ? "hover:bg-base-200 cursor-pointer"
                        : "opacity-50 cursor-default"
                    }`}
                  >
                    <span className="text-sm">{day}</span>
                    {hasEntry && <span className="text-[10px] leading-none">☕</span>}
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
