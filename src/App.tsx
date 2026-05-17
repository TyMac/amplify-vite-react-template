import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useEffect, useState } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TimezoneProvider } from "./contexts/TimezoneContext";
import ThemeToggle from "./components/ThemeToggle";
import ChatHistoryPage from "./pages/ChatHistoryPage";
import ChatPage from "./pages/ChatPage";
import JournalPage from "./pages/JournalPage";
import JournalEntryForm from "./pages/JournalEntryForm";
import JournalEntryDetail from "./pages/JournalEntryDetail";
import FavoritesPage from "./pages/FavoritesPage";
import ProfilePage from "./pages/ProfilePage";
import CoffeeBatchPage from "./pages/CoffeeBatchPage";
import "./App.css";

function NavBar({ user, signOut }: { user?: { username?: string }; signOut?: () => void }) {
  const location = useLocation();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchUserAttributes()
      .then((attrs) => setEmail(attrs.email ?? null))
      .catch(() => setEmail(null));
  }, [user]);

  const displayName = email ?? user?.username ?? "";
  const initial = displayName.charAt(0).toUpperCase();

  const navLinks = [
    { to: "/", label: "Home", active: location.pathname === "/" },
    { to: "/journal", label: "Journal", active: location.pathname.startsWith("/journal") },
    { to: "/chat", label: "Coffee Talk", active: location.pathname.startsWith("/chat") && !location.pathname.startsWith("/chats") },
    { to: "/favorites", label: "Favorites", active: location.pathname === "/favorites" },
    { to: "/chats", label: "History", active: location.pathname === "/chats" },
  ];

  return (
    <div className="navbar bg-base-100 border-b border-base-200 px-4 sticky top-0 z-50">
      {/* Brand */}
      <div className="flex-1">
        <Link to="/" className="flex items-center gap-2 text-coffee font-light text-xl tracking-widest">
          <span className="text-2xl">☕</span>
          Barizta.AI
        </Link>
      </div>

      {/* Desktop nav */}
      <div className="hidden sm:flex flex-none">
        <nav className="flex items-center gap-1">
          {navLinks.map(({ to, label, active }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1.5 text-sm transition-colors ${active ? "text-coffee font-medium" : "text-base-content/70"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Desktop right side */}
      <div className="hidden sm:flex flex-1 justify-end items-center gap-2">
        <ThemeToggle />
        {user && (
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar placeholder">
              <div className="bg-coffee text-white rounded-full w-8">
                <span className="text-xs font-semibold">{initial}</span>
              </div>
            </div>
            <ul tabIndex={0} className="dropdown-content bg-base-100 rounded-box z-10 w-64 p-2 shadow-lg border border-base-200 mt-1">
              <li className="px-3 py-2 border-b border-base-200 mb-1">
                <p className="text-xs text-base-content/50 leading-none mb-0.5">Signed in as</p>
                <p className="text-sm font-medium truncate">{displayName}</p>
              </li>
              <li>
                <Link
                  to="/profile"
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-base-200 rounded-lg transition-colors"
                >
                  Profile &amp; Preferences
                </Link>
              </li>
              <li>
                <button
                  onClick={signOut}
                  className="w-full text-left px-3 py-2 text-sm text-error hover:bg-base-200 rounded-lg transition-colors"
                >
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Mobile right side: theme toggle + hamburger */}
      <div className="flex sm:hidden items-center gap-1">
        <ThemeToggle />
        <div className="dropdown dropdown-end">
          <div tabIndex={0} role="button" className="btn btn-ghost btn-sm px-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
          <ul tabIndex={0} className="dropdown-content bg-base-100 rounded-box z-10 w-56 p-2 shadow-lg border border-base-200 mt-1">
            {navLinks.map(({ to, label, active }) => (
              <li key={to}>
                <Link to={to} className={`block px-3 py-2 text-sm rounded-lg hover:bg-base-200 transition-colors ${active ? "text-coffee font-medium" : ""}`}>{label}</Link>
              </li>
            ))}
            {user && (
              <>
                <li className="border-t border-base-200 mt-1 pt-1">
                  <div className="px-3 py-2">
                    <p className="text-xs text-base-content/50 leading-none mb-0.5">Signed in as</p>
                    <p className="text-sm font-medium truncate">{displayName}</p>
                  </div>
                </li>
                <li>
                  <Link
                    to="/profile"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-base-200 rounded-lg transition-colors"
                  >
                    Profile &amp; Preferences
                  </Link>
                </li>
                <li>
                  <button
                    onClick={signOut}
                    className="w-full text-left px-3 py-2 text-sm text-error hover:bg-base-200 rounded-lg transition-colors"
                  >
                    Sign out
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  return (
    <Authenticator socialProviders={["google", "apple"]}>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <div className="flex flex-col items-center px-6 pt-16 pb-10">
            {/* Hero */}
            <div className="text-center mb-12">
              <span className="text-5xl mb-4 block">☕</span>
              <h1 className="text-3xl font-light tracking-[0.2em] text-coffee mb-3">
                Barizta.AI
              </h1>
              <p className="text-base-content/60 text-sm italic font-light max-w-md">
                Your personal coffee companion — crafting the perfect cup, one conversation at a time.
              </p>
            </div>

            {/* Action Cards */}
            <div className="w-full max-w-md flex flex-col gap-5">
              <Link
                to="/journal"
                className="card bg-base-100 border border-base-200 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                <div className="card-body items-center text-center py-6">
                  <span className="text-2xl mb-2">📓</span>
                  <h2 className="card-title text-lg font-medium text-coffee">
                    Coffee Journal
                  </h2>
                  <p className="text-base-content/50 text-sm font-light">
                    Log your brews, track flavor notes, and see your palate evolve.
                  </p>
                </div>
              </Link>

              <Link
                to="/chat"
                className="card bg-coffee text-white shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
              >
                <div className="card-body items-center text-center py-8">
                  <span className="text-3xl mb-2">☕</span>
                  <h2 className="card-title text-xl font-semibold">Coffee Talk</h2>
                  <p className="text-white/80 text-sm font-light">
                    Get personalized brew recipes and coffee advice
                  </p>
                </div>
              </Link>

              <Link
                to="/chats"
                className="card bg-base-100 border border-base-200 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                <div className="card-body items-center text-center py-6">
                  <span className="text-2xl mb-2">💬</span>
                  <h2 className="card-title text-lg font-medium text-coffee">
                    Chat History
                  </h2>
                  <p className="text-base-content/50 text-sm font-light">
                    View and continue past conversations
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </Authenticator>
  );
}

function LiveChatPage() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="h-screen flex flex-col bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <ChatPage />
        </div>
      )}
    </Authenticator>
  );
}

function ChatsPage() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <ChatHistoryPage />
        </div>
      )}
    </Authenticator>
  );
}

function FavoritesPageWrapper() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <FavoritesPage />
        </div>
      )}
    </Authenticator>
  );
}

function JournalPageWrapper() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <JournalPage />
        </div>
      )}
    </Authenticator>
  );
}

function JournalEntryFormWrapper() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <JournalEntryForm />
        </div>
      )}
    </Authenticator>
  );
}

function JournalEntryDetailWrapper() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <JournalEntryDetail />
        </div>
      )}
    </Authenticator>
  );
}

function ProfilePageWrapper() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="min-h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <ProfilePage />
        </div>
      )}
    </Authenticator>
  );
}

function CoffeeBatchWrapper() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="flex flex-col h-screen bg-base-300">
          <NavBar user={user} signOut={signOut} />
          <div className="flex-1 overflow-hidden bg-base-100">
            <CoffeeBatchPage />
          </div>
        </div>
      )}
    </Authenticator>
  );
}

function App() {
  return (
    <ThemeProvider>
      <TimezoneProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<LiveChatPage />} />
            <Route path="/chat/:sessionId" element={<LiveChatPage />} />
            <Route path="/journal" element={<JournalPageWrapper />} />
            <Route path="/journal/new" element={<JournalEntryFormWrapper />} />
            <Route path="/journal/:id" element={<JournalEntryDetailWrapper />} />
            <Route path="/journal/:id/edit" element={<JournalEntryFormWrapper />} />
            <Route path="/favorites" element={<FavoritesPageWrapper />} />
            <Route path="/chats" element={<ChatsPage />} />
            <Route path="/profile" element={<ProfilePageWrapper />} />
            <Route path="/batches" element={<CoffeeBatchWrapper />} />
            <Route path="/batches/:batchId" element={<CoffeeBatchWrapper />} />
          </Routes>
        </BrowserRouter>
      </TimezoneProvider>
    </ThemeProvider>
  );
}

export default App;
