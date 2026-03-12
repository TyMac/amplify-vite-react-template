import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import JournalCalendar from "../components/JournalCalendar";
import JournalEntryCard from "../components/JournalEntryCard";

const client = generateClient<Schema>();

function formatDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function JournalPage() {
  const navigate = useNavigate();
  const { user } = useAuthenticator();
  const [entries, setEntries] = useState<Schema["BrewJournal"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadEntries();
  }, [user]);

  async function loadEntries() {
    if (!user?.userId) return;
    setLoading(true);
    try {
      const { data } = await client.models.BrewJournal.list({
        filter: { userId: { eq: user.userId } },
      });
      const sorted = [...(data ?? [])].sort((a, b) => {
        const dateA = a.brewDate ? new Date(a.brewDate).getTime() : 0;
        const dateB = b.brewDate ? new Date(b.brewDate).getTime() : 0;
        return dateB - dateA;
      });
      setEntries(sorted);
    } catch (err) {
      console.error("Failed to load journal entries:", err);
    } finally {
      setLoading(false);
    }
  }

  const brewDates = useMemo(() => {
    return entries
      .filter((e) => e.brewDate)
      .map((e) => e.brewDate as string);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!selectedDate) return entries;
    return entries.filter((e) => {
      if (!e.brewDate) return false;
      return formatDateKey(e.brewDate) === selectedDate;
    });
  }, [entries, selectedDate]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light tracking-wide text-base-content">
          Coffee Journal
        </h1>
        <Link to="/journal/new" className="btn btn-primary btn-sm gap-1">
          + New Entry
        </Link>
      </div>

      <div className="mb-6">
        <JournalCalendar
          brewDates={brewDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      {selectedDate && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-base-content/60">
            Showing brews from {selectedDate}
          </p>
          <button
            onClick={() => setSelectedDate(null)}
            className="btn btn-ghost btn-xs"
          >
            Clear filter
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="card bg-base-100">
          <div className="card-body items-center text-center py-12">
            <p className="text-base-content/50 font-light">
              {selectedDate
                ? "No brews logged on this date."
                : "No brews logged yet. Start your first entry."}
            </p>
            {!selectedDate && (
              <Link to="/journal/new" className="btn btn-primary btn-sm mt-4">
                Log First Brew
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredEntries.map((entry) => (
            <JournalEntryCard
              key={entry.id}
              entry={entry}
              onClick={() => navigate(`/journal/${entry.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
