import { useState, useEffect } from "react";
import "./Titlebar.css";
import { Chip } from "./Chip";

export function Titlebar() {
  const [workspace, setWorkspace] = useState("");

  useEffect(() => {
    window.api?.workspace.getRoot().then((root: string) => {
      if (root) setWorkspace(root);
    });
  }, []);

  return (
    <div className="titlebar">
      <div className="traffic-lights">
        <button
          className="tl-dot tl-close"
          onClick={() => window.api?.window.close()}
          aria-label="Close"
        />
        <button
          className="tl-dot tl-min"
          onClick={() => window.api?.window.minimize()}
          aria-label="Minimize"
        />
        <button
          className="tl-dot tl-max"
          onClick={() => window.api?.window.maximize()}
          aria-label="Maximize"
        />
      </div>

      <div className="titlebar-center">
        {workspace ? (
          <span className="titlebar-workspace mono">{workspace}</span>
        ) : (
          <span className="titlebar-brand">shmakk</span>
        )}
      </div>

      <div className="titlebar-right">
        <Chip>
          <span className="endpoint-dot" />
          localhost:3917
        </Chip>
      </div>
    </div>
  );
}
