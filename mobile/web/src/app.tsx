import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PairRoute } from "./routes/pair";
import { SessionsRoute } from "./routes/sessions";
import { SessionRoute } from "./routes/session";
import { NewRoute } from "./routes/new";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/sessions" replace />} />
        <Route path="/pair" element={<PairRoute />} />
        <Route path="/sessions" element={<SessionsRoute />} />
        <Route path="/sessions/:id" element={<SessionRoute />} />
        <Route path="/new" element={<NewRoute />} />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
