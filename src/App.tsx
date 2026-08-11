import { useState } from "react";
import DashboardView from "./components/DashboardView";
import LandingView from "./components/LandingView";
import PlaceFinderView from "./components/PlaceFinderView";

type View = "landing" | "dashboard" | "app";

export default function App() {
  const [view, setView] = useState<View>("landing");

  return (
    <>
      {view === "landing" && (
        <LandingView
          onExplore={() => setView("app")}
          onDashboard={() => setView("dashboard")}
        />
      )}
      {view === "dashboard" && (
        <DashboardView
          onHome={() => setView("landing")}
          onFinder={() => setView("app")}
        />
      )}
      {view === "app" && (
        <PlaceFinderView
          onHome={() => setView("landing")}
          onDashboard={() => setView("dashboard")}
        />
      )}
    </>
  );
}
