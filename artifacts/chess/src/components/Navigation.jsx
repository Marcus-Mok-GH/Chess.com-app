import { useNavigate } from "react-router-dom";
import { LogoIcon } from "./ChessPieceIcon";
import "./Navigation.css";
import { useT } from '../i18n/I18nContext';

export default function Navigation({ title }) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <nav className="main-nav">
      <div className="nav-content">
        <button
          type="button"
          className="logo"
          onClick={() => navigate("/")}
          aria-label={t("Go to home")}
        >
          <LogoIcon size={24} /> {' '}{t("Chess")}</button>
        {title && <h1 className="page-title">{title}</h1>}
        <div className="nav-links">
          <button className="nav-link" onClick={() => navigate("/play")}>
            {t("vs Computer")}</button>
          <button className="nav-link" onClick={() => navigate("/online")}>
            {t("Online")}</button>
        </div>
      </div>
    </nav>
  );
}
