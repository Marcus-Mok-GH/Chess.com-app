## 2025-05-18 - Header Profile Dropdown Accessibility
**Learning:** Header profile dropdown components often lack proper ARIA expanded/popup attributes, menu semantics, keyboard Escape handlers, and aria-hidden wrappers for ambient emojis.
**Action:** When adding dropdown user menus, ensure `aria-expanded`, `aria-haspopup="menu"`, `role="menu"`/`role="menuitem"`, window `Escape` event listener, and `aria-hidden` on ambient emojis are implemented.
