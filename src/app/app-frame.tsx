"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingScreen } from "./loader";

/** The original feasibility app in a frame, with a loading screen until it has rendered. */
export default function AppFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // The frame may finish loading (e.g. from cache) before this script runs and misses onLoad.
    const doc = ref.current?.contentDocument;
    if (doc && doc.readyState === "complete" && doc.URL !== "about:blank") setLoaded(true);
  }, []);

  return (
    <div className="frame-wrap">
      <iframe ref={ref} className="frame" src="/feasibility" title="MCE Residential Feasibility" onLoad={() => setLoaded(true)} />
      {!loaded && <LoadingScreen label="Loading feasibility model…" overlay />}
    </div>
  );
}
