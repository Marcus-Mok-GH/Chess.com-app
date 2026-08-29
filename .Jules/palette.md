## 2026-03-31 - Popup Menus and User Badge Accessibility
**Learning:** Icon-only user profile badges and custom popup dropdown menus lack keyboard accessibility (Escape key closing) and ARIA attributes (`aria-expanded`, `aria-haspopup`, `role="menu"`, `role="menuitem"`) by default. Adding proper ARIA roles and an Escape key handler ensures screen reader compatibility and intuitive keyboard interaction.
**Action:** Always verify custom popover/dropdown elements have appropriate ARIA attributes, semantic roles, and global keydown handlers for Escape key dismissal.
