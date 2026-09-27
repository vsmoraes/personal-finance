import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Avatar, Button, Select } from "./design-system.tsx";

export type AuthUser = { id: string; displayName: string; pictureUrl: string };

type CredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback(response: CredentialResponse): void;
        ux_mode: "popup";
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          theme: "outline";
          size: "large";
          width: number;
          text: "signin_with";
          locale: string;
        },
      ): void;
      disableAutoSelect(): void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

async function authFetch(path: string, init?: RequestInit) {
  const response = await fetch(`/api/v1/auth/${path}`, {
    credentials: "same-origin",
    ...init,
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Sign-in required"
        : "Authentication failed. Please try again.",
    );
  return response.json() as Promise<Record<string, unknown>>;
}

export async function currentSession(): Promise<{ user: AuthUser }> {
  const data = await authFetch("session");
  const user = data["user"];
  if (
    !user ||
    typeof user !== "object" ||
    !("id" in user) ||
    typeof user.id !== "string"
  )
    throw new Error("Invalid session");
  return { user: user as AuthUser };
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mount = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const script = document.createElement("script");
    script.src = `https://accounts.google.com/gsi/client?hl=${encodeURIComponent(i18n.language)}`;
    script.async = true;
    script.onload = () => {
      void (async () => {
        try {
          const config = await authFetch("config");
          if (!live || !window.google || !mount.current) return;
          const clientId = config["clientId"];
          if (typeof clientId !== "string" || !clientId)
            throw new Error("GOOGLE_CLIENT_ID_MISSING");
          window.google.accounts.id.initialize({
            client_id: clientId,
            ux_mode: "popup",
            callback(response) {
              void (async () => {
                if (!response.credential) {
                  setError("loginNoCredential");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const csrf = await authFetch("csrf");
                  const csrfToken = csrf["csrfToken"];
                  if (typeof csrfToken !== "string")
                    throw new Error("CSRF_TOKEN_MISSING");
                  await authFetch("google", {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      "x-csrf-token": csrfToken,
                    },
                    body: JSON.stringify({ credential: response.credential }),
                  });
                  void navigate("/", { replace: true });
                  await client.invalidateQueries();
                } catch {
                  setError("loginFailed");
                } finally {
                  setBusy(false);
                }
              })();
            },
          });
          mount.current.replaceChildren();
          window.google.accounts.id.renderButton(mount.current, {
            theme: "outline",
            size: "large",
            width: Math.min(340, Math.max(240, window.innerWidth - 80)),
            text: "signin_with",
            locale: i18n.language,
          });
        } catch {
          if (live) setError("loginLoadError");
        }
      })();
    };
    script.onerror = () => {
      if (live) setError("loginConnectionError");
    };
    document.head.appendChild(script);
    return () => {
      live = false;
      script.remove();
    };
  }, [client, navigate, i18n.language]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  return (
    <main className="finance-login-layout">
      <section className="finance-login-card finance-glass">
        <div className="finance-login-language">
          <Select
            id="login-language-select"
            aria-label={t("language")}
            value={i18n.language}
            options={[
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
              { value: "pt-BR", label: "Português (Brasil)" },
            ]}
            getPopupContainer={(trigger: HTMLElement) =>
              trigger.parentElement ?? document.body
            }
            onChange={(language) => {
              try {
                window.localStorage.setItem("finance-login-language", language);
              } catch {
                // A private browser session can disable local storage.
              }
              void i18n.changeLanguage(language);
            }}
          />
        </div>
        <div className="finance-login-mark" aria-hidden="true">
          ◈
        </div>
        <p className="finance-login-eyebrow">{t("appName")}</p>
        <h1>{t("loginTitle")}</h1>
        <p className="finance-login-copy">{t("loginDescription")}</p>
        <div
          id="google-sign-in-button"
          className="finance-login-google"
          ref={mount}
          aria-busy={busy}
        />
        {busy && <p role="status">{t("loginSigningIn")}</p>}
        {error && (
          <p className="finance-login-error" role="alert">
            {t(error)}
          </p>
        )}
        <p className="finance-login-note">{t("loginNote")}</p>
      </section>
    </main>
  );
}

export function SignOutButton({ id = "sign-out-button" }: { id?: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [error, setError] = useState("");
  return (
    <>
      <Button
        id={id}
        type="text"
        onClick={() => {
          void (async () => {
            try {
              await authFetch("logout", { method: "POST" });
              window.google?.accounts.id.disableAutoSelect();
              client.clear();
              await client.invalidateQueries();
              window.location.assign("/login");
            } catch {
              setError("signOutError");
            }
          })();
        }}
      >
        {t("signOut")}
      </Button>
      {error && <span role="alert">{t(error)}</span>}
    </>
  );
}

export function UserPhoto({
  user,
  compact = false,
  expanded = false,
  onOpen,
}: {
  user: AuthUser;
  compact?: boolean;
  expanded?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const avatar = (
    <Avatar src={user.pictureUrl || undefined} size={36}>
      {user.displayName.charAt(0).toUpperCase()}
    </Avatar>
  );
  if (compact)
    return (
      <div className="finance-user-menu" onMouseEnter={onOpen} onFocus={onOpen}>
        <div className="finance-user-menu-panel">
          <Button
            id="user-profile-button"
            type="text"
            htmlType="button"
            aria-label={t("accountMenu")}
            aria-expanded={expanded}
            aria-controls="account-actions"
            title={user.displayName}
            onClick={onOpen}
          >
            {avatar}
          </Button>
        </div>
        <div
          id="account-actions"
          className={`finance-drop finance-user-menu-details ${expanded ? "is-open" : ""}`}
        >
          <span title={user.displayName}>{user.displayName}</span>
          <SignOutButton />
        </div>
      </div>
    );
  return (
    <div className="finance-user-profile" title={user.displayName}>
      {avatar}
      <span>{user.displayName}</span>
    </div>
  );
}
