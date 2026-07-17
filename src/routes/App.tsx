import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router";

import { BingoHome } from "@/features/bingo/BingoHome";
import { BingoRoomView } from "@/features/bingo/BingoRoomView";

function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  return <BingoRoomView code={(code ?? "").toUpperCase()} onLeave={() => navigate("/")} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BingoHome />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
