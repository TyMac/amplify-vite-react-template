import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import TodosPage from "./pages/TodosPage";
import DotosPage from "./pages/DotosPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: "20px" }}>
        <nav style={{ marginBottom: "20px" }}>
          <Link to="/" style={{ marginRight: "20px" }}>
            Todos
          </Link>
          <Link to="/dotos">Dotos</Link>
        </nav>
        <Routes>
          <Route path="/" element={<TodosPage />} />
          <Route path="/dotos" element={<DotosPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
