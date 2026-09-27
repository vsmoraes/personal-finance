# Lume design system

The application uses one frosted design system for page surfaces, navigation, cards, tables, forms, popups, and buttons. Its visual direction combines the rounded, pale glass panels and green accent in `docs/mockups/` with the soft blur, layered depth, and clear form hierarchy of the [Dribbble reference](https://dribbble.com/shots/26137348-Sign-up-sing-in-login-registration-modal-screen).

For forms, the stacked labels, visible focus treatment, and mobile sheet layout also draw on [responsive glass form examples](https://www.codetap.org/project/glassmorphism-login-page-html-css-js) and [mobile glass guidance](https://superdesign.dev/styles/glassmorphism/app). The app uses its own controls and palette rather than copying either example.

## Source of truth

- `apps/web/src/shared/design-system.tsx` is the component entry point and Ant Design theme configuration. Application UI imports Ant Design components from this file.
- `apps/web/src/design-system.scss` owns visual tokens, component states, and glass treatments. `styles.scss` retains page layouts and feature geometry.
- `apps/web/src/shared/forms.tsx` owns form-field composition, validation presentation, and React Hook Form bindings.

## Foundations

| Element       | Small | Default | Large |
| ------------- | ----: | ------: | ----: |
| Input height  |  36px |    48px |  50px |
| Button height |  36px |    44px |  50px |
| Input radius  |  12px |    14px |  18px |
| Button radius |  12px |    16px |  18px |
| Panel radius  |     — |    28px |     — |

Panels use a translucent surface, a light edge, a soft shadow, and 28px blur. Modals use a lighter surface and 42px blur; mobile modals sit at the bottom of the viewport and scroll internally. Form labels sit above their controls at every viewport size. Labels use the main text color and helper text uses the muted token; errors use the danger token. Focus has a visible accent ring, and reduced-motion preferences disable button transitions.

On touch devices, editable controls and dropdown text use at least 16px type so mobile Safari does not zoom the page when a field receives focus. The viewport remains user-scalable for accessibility.

Buttons use the shared Ant Design `Button`: primary for the main action, default for secondary actions, text for navigation or icon controls, and `danger` for destructive actions. Each has the same height, corner radius, focus state, and theme colors. Transaction rows are text buttons with a full-width row layout.

Inputs, number and date fields, selects, switches, color pickers, search controls, and fields inside modals share the same control scale and translucent surface. Modal forms use the edit-transaction pattern: a flat single-column field stack, a 620px maximum width, and side-by-side primary and cancel actions. Forms on normal pages, including Settings and Imports, fill the page panel with descriptions or labels beside controls when space allows and stack responsively in narrow containers. Search and filter controls directly above a list or table belong inside its glass panel as a unified toolbar with consistent control heights. Tables, dropdowns, pagination, cards, and menus inherit the same theme tokens. The top bar itself expands to reveal centered sub-items in a second row; there is no detached submenu surface or overlay.

The Overview route uses the layout and layered-glass treatment of the [CodeFronts crypto-finance reference](https://codefronts.com/design-styles/css-frosted-glass-effect/glassmorphism-crypto-finance-dashboard/): an accent-lit backdrop, one large glass dashboard surface, an accent-colored trend line, recent transactions in the activity column, and three subdued financial stat cards. Its colors come from the same light, dark, or custom theme tokens as the other routes, and the layout stacks without horizontal scrolling on mobile.

Other pages use the same ambient backdrop and layered glass tokens. Category spending is a ranked list with budget progress. Monthly and Forecast reports use month cards and a distinct annual total instead of a dense data table; Forecast cards also identify actual and projected months.

Charts derive a twelve-shade palette from the active accent hue and page background. Category and monthly bars vary by item; savings and variance lines use separate shades of that same hue. The palette adapts to light, dark, and custom themes.

## Themes

Light and dark palettes are selected with `data-ds-tone` on the document root. The `system` setting follows the operating system. A custom theme uses its saved background, surface, primary and secondary accents, navigation accents, and light/dark mode. CSS variables reach custom layouts and portaled popups while the Ant Design theme supplies component tokens. Foreground text on primary buttons is calculated from the chosen accent for contrast.

When adding UI, import components from `shared/design-system.tsx`, compose forms with `shared/forms.tsx`, and use existing design tokens for any new layout-specific SCSS. Vite compiles `styles.scss` and `design-system.scss` with Dart Sass in local development and production. Do not introduce feature-local button, input, or surface styling.

# Authentication surface

The sign-in page uses the same frosted surface, theme tokens, blur, border, and responsive sizing as the rest of the design system. The Google sign-in control is rendered by Google Identity Services inside the design-system login card; it is intentionally not recreated with local button styles. The sign-out control uses the shared `Button` component.
