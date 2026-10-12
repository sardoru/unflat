"use client";

import * as React from "react";

/** Dev preview only: `?theme=light|dark` sets the page theme (default dark); `?theme=system` leaves it unset. */
export function DevTheme() {
  React.useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("theme");
    const root = document.documentElement;
    if (asked === "system") delete root.dataset.theme;
    else root.dataset.theme = asked === "light" ? "light" : "dark";
  }, []);
  return null;
}
