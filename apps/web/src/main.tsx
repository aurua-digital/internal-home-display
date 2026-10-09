import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import DisplayPage from "./DisplayPage";
import KioskPage from "./KioskPage";
import { AdminShell } from "./admin/Shell";
import Designer from "./admin/Designer";
import ListsPage from "./admin/Lists";
import SettingsPage from "./admin/Settings";
import DevicePage from "./admin/Device";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/d/:token" element={<DisplayPage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route element={<AdminShell />}>
          <Route path="/" element={<Navigate to="/designer" replace />} />
          <Route path="/designer" element={<Designer />} />
          <Route path="/lists" element={<ListsPage />} />
          <Route path="/device" element={<DevicePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
