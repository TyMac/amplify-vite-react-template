import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { generateClient } from "aws-amplify/api";
import { getCurrentUser } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>();

interface TimezoneContextValue {
  timezone: string;
  setTimezone: (tz: string) => void;
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  setTimezone: () => {},
});

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  useEffect(() => {
    async function loadTimezone() {
      try {
        const { userId } = await getCurrentUser();
        const result = await client.models.UserPreference.list({
          filter: { userId: { eq: userId } },
        });
        const pref = result.data?.[0];
        if (pref?.timezone) {
          setTimezoneState(pref.timezone);
        }
      } catch {
        // Not signed in or no pref — use browser default
      }
    }
    loadTimezone();
  }, []);

  const setTimezone = (tz: string) => setTimezoneState(tz);

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}

/** Format a date string using the user's preferred timezone */
export function formatInTimezone(
  dateStr: string | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }
): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { ...options, timeZone: timezone });
  } catch {
    return new Date(dateStr).toLocaleDateString("en-US", options);
  }
}
