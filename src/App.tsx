import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import DotosPage from "./pages/DotosPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: "20px" }}>
        <nav style={{ marginBottom: "20px" }}>
          <Link to="/dotos">Dotos</Link>
        </nav>
        <Routes>
          <Route path="/dotos" element={<DotosPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
