import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/api";
import { getCurrentUser, fetchUserAttributes } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import { useTimezone } from "../contexts/TimezoneContext";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>();

// Equipment options (shared with barista-mobile)
const GRINDERS = ["None","Baratza Encore","Baratza Virtuoso+","1Zpresso JX-Pro","Comandante C40","Fellow Ode","Timemore Chestnut","Other"];
const DRIPPERS = ["None","Hario V60 01","Hario V60 02","Hario V60 03","Kalita Wave 155","Kalita Wave 185","Chemex 6-cup","Chemex 8-cup","Fellow Stagg [X]","AeroPress","Other"];
const KETTLES = ["None","Fellow Stagg EKG","Hario Buono","Bonavita Variable Temp","Brewista Artisan","Timemore Fish","Other"];
const SCALES = ["None","Acaia Pearl","Acaia Lunar","Timemore Black Mirror","Hario Drip Scale","Brewista Smart Scale","Other"];

// Common IANA timezones grouped by region
const TIMEZONE_OPTIONS = [
  { label: "US & Canada", zones: [
    { value: "America/New_York",    label: "Eastern Time (ET)" },
    { value: "America/Chicago",     label: "Central Time (CT)" },
    { value: "America/Denver",      label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "America/Anchorage",   label: "Alaska Time (AKT)" },
    { value: "Pacific/Honolulu",    label: "Hawaii Time (HT)" },
  ]},
  { label: "Europe", zones: [
    { value: "Europe/London",   label: "London (GMT/BST)" },
    { value: "Europe/Paris",    label: "Central European (CET)" },
    { value: "Europe/Helsinki", label: "Eastern European (EET)" },
  ]},
  { label: "Asia / Pacific", zones: [
    { value: "Asia/Tokyo",      label: "Japan (JST)" },
    { value: "Asia/Shanghai",   label: "China (CST)" },
    { value: "Asia/Kolkata",    label: "India (IST)" },
    { value: "Asia/Dubai",      label: "Gulf (GST)" },
    { value: "Australia/Sydney",label: "Sydney (AEST)" },
  ]},
  { label: "UTC", zones: [
    { value: "UTC", label: "UTC" },
  ]},
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { timezone, setTimezone } = useTimezone();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [prefId, setPrefId] = useState<string | null>(null);
  const [selectedTz, setSelectedTz] = useState(timezone);
  const [grinder, setGrinder] = useState("None");
  const [dripper, setDripper] = useState("None");
  const [kettle, setKettle] = useState("None");
  const [scale, setScale] = useState("None");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { userId: uid } = await getCurrentUser();
        setUserId(uid);
        const attrs = await fetchUserAttributes();
        setEmail(attrs.email ?? "");

        const result = await client.models.UserPreference.list({
          filter: { userId: { eq: uid } },
        });
        const pref = result.data?.[0];
        if (pref) {
          setPrefId(pref.id);
          if (pref.timezone) setSelectedTz(pref.timezone);
          if (pref.grinder) setGrinder(pref.grinder);
          if (pref.dripper) setDripper(pref.dripper);
          if (pref.kettle) setKettle(pref.kettle);
          if (pref.scale) setScale(pref.scale);
        }
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const prefData = {
        timezone: selectedTz,
        grinder: grinder !== "None" ? grinder : null,
        dripper: dripper !== "None" ? dripper : null,
        kettle: kettle !== "None" ? kettle : null,
        scale: scale !== "None" ? scale : null,
      };
      if (prefId) {
        await client.models.UserPreference.update({ id: prefId, ...prefData });
      } else {
        const result = await client.models.UserPreference.create({ userId, ...prefData });
        setPrefId(result.data?.id ?? null);
      }
      setTimezone(selectedTz);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save timezone", err);
      alert("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const now = new Date();
  const previewDate = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: selectedTz,
  });
  const previewTime = now.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    timeZone: selectedTz,
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button
        onClick={() => navigate(-1)}
        className="btn btn-ghost btn-sm mb-6 gap-1"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-light tracking-wide mb-6">Profile</h1>

      {/* Account info */}
      <section className="card bg-base-100 shadow-sm border border-base-200 mb-4">
        <div className="card-body p-4 space-y-3">
          <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase">Account</h2>
          <div>
            <p className="text-xs text-base-content/50 mb-0.5">Email</p>
            <p className="text-sm font-medium">{email || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-base-content/50 mb-0.5">User ID</p>
            <p className="text-xs font-mono text-base-content/60 break-all">{userId || "—"}</p>
          </div>
        </div>
      </section>

      {/* Timezone */}
      <section className="card bg-base-100 shadow-sm border border-base-200 mb-6">
        <div className="card-body p-4 space-y-3">
          <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase">Display Timezone</h2>
          <p className="text-sm text-base-content/60">
            Brew journal entries and timestamps will display in this timezone.
          </p>

          <select
            value={selectedTz}
            onChange={(e) => setSelectedTz(e.target.value)}
            className="select select-bordered w-full"
          >
            {TIMEZONE_OPTIONS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.zones.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Live preview */}
          <div className="bg-base-200 rounded-lg px-4 py-3">
            <p className="text-xs text-base-content/50 mb-1">Preview — current time in selected timezone</p>
            <p className="text-sm font-medium">{previewDate}</p>
            <p className="text-sm text-base-content/60">{previewTime}</p>
          </div>

        </div>
      </section>

      {/* Equipment */}
      <section className="card bg-base-100 shadow-sm border border-base-200 mb-6">
        <div className="card-body p-4 space-y-3">
          <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase">Equipment</h2>
          <p className="text-sm text-base-content/60">
            Your equipment is used to personalize brew advice in Coffee Talk. Shared across web and mobile.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label py-1"><span className="label-text text-sm">Grinder</span></label>
              <select value={grinder} onChange={(e) => setGrinder(e.target.value)} className="select select-bordered w-full select-sm">
                {GRINDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label py-1"><span className="label-text text-sm">Dripper</span></label>
              <select value={dripper} onChange={(e) => setDripper(e.target.value)} className="select select-bordered w-full select-sm">
                {DRIPPERS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label py-1"><span className="label-text text-sm">Kettle</span></label>
              <select value={kettle} onChange={(e) => setKettle(e.target.value)} className="select select-bordered w-full select-sm">
                {KETTLES.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="label py-1"><span className="label-text text-sm">Scale</span></label>
              <select value={scale} onChange={(e) => setScale(e.target.value)} className="select select-bordered w-full select-sm">
                {SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`btn btn-primary btn-sm w-full mb-6 ${saving ? "loading" : ""}`}
      >
        {saving ? "Saving..." : saved ? "✓ Saved" : "Save Preferences"}
      </button>
    </div>
  );
}
