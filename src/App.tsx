import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import DotosPage from "./pages/DotosPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: "20px" }}>
        <nav style={{ marginBottom: "20px" }}>
          <Link to="/" style={{ marginRight: "20px" }}>
            Home
          </Link>
          <Link to="/dotos">Dotos</Link>
        </nav>
        <Routes>
          <Route
            path="/"
            element={
              <Authenticator socialProviders={['google', 'apple']}>
                {({ signOut, user }) => (
                  <main>
                    <h1>Hello {user?.username}</h1>
                    <button onClick={signOut}>Sign out</button>
                    <br />
                    <Link to="/dotos">Go to Dotos</Link>
                  </main>
                )}
              </Authenticator>
            }
          />
          <Route
            path="/dotos"
            element={
              <Authenticator>
                {({ signOut, user }) => (
                  <main>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <span>Logged in as: {user?.username}</span>
                      <button onClick={signOut}>Sign out</button>
                    </div>
                    <DotosPage />
                  </main>
                )}
              </Authenticator>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
