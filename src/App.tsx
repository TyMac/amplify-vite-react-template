import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";
import ChatHistoryPage from "./pages/ChatHistoryPage";
import ChatPage from "./pages/ChatPage";
import "./App.css";

function NavBar({ user, signOut }: { user?: { username?: string }; signOut?: () => void }) {
  const location = useLocation();

  return (
    <div className="navbar bg-base-100 border-b border-base-200 px-4 sticky top-0 z-50">
      <div className="flex-1 gap-2">
        <Link to="/" className="flex items-center gap-2 text-primary font-light text-xl tracking-widest">
          <span className="text-2xl">☕</span>
          AI Barista
        </Link>
      </div>
      <div className="flex-none gap-2">
        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className={`btn btn-ghost btn-sm ${location.pathname === "/" ? "text-primary" : ""}`}
          >
            Home
          </Link>
          <Link
            to="/chat"
            className={`btn btn-ghost btn-sm ${location.pathname.startsWith("/chat") && !location.pathname.startsWith("/chats") ? "text-primary" : ""}`}
          >
            Chat
          </Link>
          <Link
            to="/chats"
            className={`btn btn-ghost btn-sm ${location.pathname === "/chats" ? "text-primary" : ""}`}
          >
            History
          </Link>
        </nav>
        <ThemeToggle />
        {user && (
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar placeholder">
              <div className="bg-primary text-primary-content rounded-full w-8">
                <span className="text-xs">{user.username?.charAt(0).toUpperCase()}</span>
              </div>
            </div>
            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-10 w-52 p-2 shadow-lg border border-base-200">
              <li className="menu-title text-xs opacity-60 px-2">{user.username}</li>
              <li>
                <button onClick={signOut} className="text-error">Sign out</button>
              </li>
            </ul>
          </div>
        )}
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
              <h1 className="text-3xl font-light tracking-[0.2em] text-base-content mb-3">
                AI Barista
              </h1>
              <p className="text-base-content/60 text-sm italic font-light max-w-md">
                Your personal coffee companion — crafting the perfect cup, one conversation at a time.
              </p>
            </div>

            {/* Action Cards */}
            <div className="w-full max-w-md flex flex-col gap-5">
              <Link
                to="/chat"
                className="card bg-primary text-primary-content shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
              >
                <div className="card-body items-center text-center py-8">
                  <span className="text-3xl mb-2">☕</span>
                  <h2 className="card-title text-xl font-semibold">Start Chatting</h2>
                  <p className="text-primary-content/80 text-sm font-light">
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
                  <h2 className="card-title text-lg font-medium text-primary">
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

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<LiveChatPage />} />
          <Route path="/chat/:sessionId" element={<LiveChatPage />} />
          <Route path="/chats" element={<ChatsPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
