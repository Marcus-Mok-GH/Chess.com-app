import { useNavigate } from "react-router-dom";
import { LogoIcon } from "./ChessPieceIcon";
import "./Navigation.css";

export default function Navigation({ title }) {
  const navigate = useNavigate();

  return (
    <nav className="main-nav">
      <div className="nav-content">
        <button
          type="button"
          className="logo"
          onClick={() => navigate("/")}
          aria-label="Go to home"
        >
          <LogoIcon size={24} /> Chess
        </button>
        {title && <h1 className="page-title">{title}</h1>}
        <div className="nav-links">
          <button className="nav-link" onClick={() => navigate("/play")}>
            vs Computer
          </button>
          <button className="nav-link" onClick={() => navigate("/online")}>
            Online
          </button>
        </div>
      </div>
    </nav>
  );
}
