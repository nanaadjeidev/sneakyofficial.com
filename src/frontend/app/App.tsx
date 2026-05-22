import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import HomePage from "./pages/Home";
import Developer from "./pages/Developer";
import Entertainer from "./pages/Entertainer";
import Musician from "./pages/Musician";
import Background from "./components/Background";
import Splatdle from "./pages/Splatdle";
import AuthCallback from "./pages/Authorised";
import DevPortfolio from "./pages/DevPortfolio";
import Tournament from "./pages/Tournament";
import TournamentAdmin from "./pages/TournamentAdmin";
import Leaderboard from "./pages/Leaderboard";
import Players from "./pages/Players";
import OverlayMatch from "./pages/overlay/OverlayMatch";
import OverlayBracket from "./pages/overlay/OverlayBracket";
import OverlayLeaderboard from "./pages/overlay/OverlayLeaderboard";
import OverlayUpNext from "./pages/overlay/OverlayUpNext";
import OverlaySignups from "./pages/overlay/OverlaySignups";
import OverlayRibbon from "./pages/overlay/OverlayRibbon";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/developer" element={<Developer />} />
      <Route path="/entertainer" element={<Entertainer />} />
      <Route path="/socials" element={<Entertainer />} />
      <Route path="/musician" element={<Musician />} />
      <Route path="/background" element={<Background />} />
      <Route path="/splatdle" element={<Splatdle />} />
      <Route path="/authorised" element={<AuthCallback />} />
      <Route path="/portfolio" element={<DevPortfolio />} />
      <Route path="/tournament" element={<ErrorBoundary><Tournament /></ErrorBoundary>} />
      <Route path="/tournament/admin" element={<ErrorBoundary><TournamentAdmin /></ErrorBoundary>} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/players" element={<Players />} />
      <Route path="/overlay/match" element={<OverlayMatch />} />
      <Route path="/overlay/bracket" element={<OverlayBracket />} />
      <Route path="/overlay/leaderboard" element={<OverlayLeaderboard />} />
      <Route path="/overlay/upnext" element={<OverlayUpNext />} />
      <Route path="/overlay/signups" element={<OverlaySignups />} />
      <Route path="/overlay/ribbon" element={<OverlayRibbon />} />
    </Routes>
  );
}

export default App;
