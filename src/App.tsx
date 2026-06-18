import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Feed from "./pages/Feed";
import MarketPage from "./pages/MarketPage";
import Create from "./pages/Create";
import Credits from "./pages/Credits";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Feed />} />
        <Route path="market/:id" element={<MarketPage />} />
        <Route path="create" element={<Create />} />
        <Route path="credits" element={<Credits />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="me" element={<Profile />} />
      </Route>
    </Routes>
  );
}
