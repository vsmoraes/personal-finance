import { theme, type ThemeConfig } from "antd";

import type { Settings } from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";

/** The single component entry point for application UI. */
export * from "antd";

export type DesignMode = "light" | "dark" | "custom";

function onAccent(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(value)) return "#ffffff";
  const rgb = [0, 2, 4].map(
    (offset) => parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const luminance = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return luminance[0]! * 0.2126 +
    luminance[1]! * 0.7152 +
    luminance[2]! * 0.0722 >
    0.18
    ? "#092018"
    : "#ffffff";
}

export function designSystemTheme(
  settings: Settings | undefined,
  dark: boolean,
): ThemeConfig {
  const custom = settings?.theme === "custom";
  const accent = custom
    ? settings.customAccent || "#1d7658"
    : dark
      ? "#67d6a5"
      : "#1d7658";
  const canvas = custom
    ? settings.customBackground || (dark ? "#080a0d" : "#f3f5f7")
    : dark
      ? "#080a0d"
      : "#f3f5f7";
  const surface = custom
    ? settings.customSurface || (dark ? "#181b20" : "#ffffff")
    : dark
      ? "#181b20"
      : "#ffffff";
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
      fontSize: 14,
      controlHeight: 44,
      controlHeightSM: 36,
      controlHeightLG: 50,
      borderRadius: 16,
      borderRadiusSM: 12,
      borderRadiusLG: 28,
      colorPrimary: accent,
      colorTextLightSolid: onAccent(accent),
      colorInfo: accent,
      colorSuccess: accent,
      colorLink: accent,
      colorBgLayout: canvas,
      colorBgContainer: surface,
      colorBgElevated: surface,
      colorTextBase: dark ? "#f4f6f7" : "#111318",
      colorTextSecondary: dark ? "#aeb9c3" : "#737b86",
      colorBorder: dark ? "#394148" : "#dfe4e8",
      colorBorderSecondary: dark ? "#30373e" : "#e8ecef",
    },
    components: {
      Button: {
        borderRadius: 16,
        primaryShadow: "none",
        defaultShadow: "none",
        dangerShadow: "none",
      },
      Card: { borderRadiusLG: 28 },
      Modal: { borderRadiusLG: 28 },
      Input: { activeShadow: `0 0 0 3px ${accent}24` },
      InputNumber: { activeShadow: `0 0 0 3px ${accent}24` },
      Select: { activeOutlineColor: `${accent}35` },
      ...(custom
        ? {
            Menu: {
              itemSelectedBg:
                settings.customSidebarAccentSecondary || "#e6f4ed",
              itemSelectedColor: settings.customSidebarAccent || accent,
              itemHoverBg: settings.customSidebarAccentSecondary || "#e6f4ed",
            },
          }
        : {}),
    },
  };
}

/** CSS variables also theme native surfaces, charts, and Ant Design portals. */
export function applyDesignSystemTheme(
  settings: Settings | undefined,
  dark: boolean,
) {
  const root = document.documentElement;
  const custom = settings?.theme === "custom";
  root.dataset["dsTheme"] = custom ? "custom" : dark ? "dark" : "light";
  root.dataset["dsTone"] = dark ? "dark" : "light";
  const values: Record<string, string> = custom
    ? {
        "--ds-canvas":
          settings.customBackground || (dark ? "#080a0d" : "#f3f5f7"),
        "--ds-surface-base":
          settings.customSurface || (dark ? "#181b20" : "#ffffff"),
        "--ds-accent": settings.customAccent || "#1d7658",
        "--ds-accent-soft": settings.customAccentSecondary || "#e6f4ed",
        "--ds-nav-accent":
          settings.customSidebarAccent || settings.customAccent || "#1d7658",
        "--ds-nav-accent-soft":
          settings.customSidebarAccentSecondary ||
          settings.customAccentSecondary ||
          "#e6f4ed",
        "--ds-on-accent": onAccent(settings.customAccent || "#1d7658"),
      }
    : {};
  for (const name of [
    "--ds-canvas",
    "--ds-surface-base",
    "--ds-accent",
    "--ds-accent-soft",
    "--ds-nav-accent",
    "--ds-nav-accent-soft",
    "--ds-on-accent",
  ]) {
    if (values[name]) root.style.setProperty(name, values[name]);
    else root.style.removeProperty(name);
  }
}
