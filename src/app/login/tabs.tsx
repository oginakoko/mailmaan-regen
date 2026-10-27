"use client";

import { useRef, useState, type ReactNode } from "react";

type AuthTabsProps = {
  signInForm: ReactNode;
  signUpForm: ReactNode;
  initialTab?: "signin" | "signup";
};

/** Sign in / Create account tabs (WAI-ARIA tab pattern with arrow-key support). */
export function AuthTabs({ signInForm, signUpForm, initialTab = "signin" }: AuthTabsProps) {
  const [tab, setTab] = useState<"signin" | "signup">(initialTab);
  const signInRef = useRef<HTMLButtonElement>(null);
  const signUpRef = useRef<HTMLButtonElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "signin" ? "signup" : "signin";
    setTab(next);
    (next === "signin" ? signInRef : signUpRef).current?.focus();
  };

  const tabClass = (selected: boolean) =>
    `flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3402a] ${
      selected ? "bg-[#1c1917] text-[#f7f2e7]" : "text-[#1c1917]/60 hover:text-[#1c1917]"
    }`;

  return (
    <div>
      <div role="tablist" aria-label="Sign in or create account" onKeyDown={onKeyDown} className="flex rounded-full border border-[#1c1917]/15 bg-white p-1">
        <button
          ref={signInRef}
          type="button"
          role="tab"
          id="tab-signin"
          aria-selected={tab === "signin"}
          aria-controls="panel-signin"
          tabIndex={tab === "signin" ? 0 : -1}
          onClick={() => setTab("signin")}
          className={tabClass(tab === "signin")}
        >
          Sign in
        </button>
        <button
          ref={signUpRef}
          type="button"
          role="tab"
          id="tab-signup"
          aria-selected={tab === "signup"}
          aria-controls="panel-signup"
          tabIndex={tab === "signup" ? 0 : -1}
          onClick={() => setTab("signup")}
          className={tabClass(tab === "signup")}
        >
          Create account
        </button>
      </div>
      <div
        role="tabpanel"
        id="panel-signin"
        aria-labelledby="tab-signin"
        hidden={tab !== "signin"}
        className="pt-6"
      >
        {signInForm}
      </div>
      <div
        role="tabpanel"
        id="panel-signup"
        aria-labelledby="tab-signup"
        hidden={tab !== "signup"}
        className="pt-6"
      >
        {signUpForm}
      </div>
    </div>
  );
}
