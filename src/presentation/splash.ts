import { useEffect } from "react";

let isFinishing = false;

/** Lets the splash from index.html complete its logo, then fades it out and removes it. Safe to call more than once. */
export function finishSplash(): void {
  const splash = document.getElementById("splash");
  if (!splash || isFinishing) return;
  isFinishing = true;
  const loader = splash.querySelector("logo-splash-loader");
  // Not yet upgraded when its script is slower than the app: nothing to wait for.
  const finished = typeof loader?.finish === "function" ? loader.finish() : Promise.resolve();
  finished.then(() => {
    splash.classList.add("is-done");
    window.setTimeout(() => splash.remove(), 300);
  });
}

/** Rendered by the first real screen (the app, sign-in, setup) to end the splash. */
export function SplashDone(): null {
  useEffect(() => finishSplash(), []);
  return null;
}
