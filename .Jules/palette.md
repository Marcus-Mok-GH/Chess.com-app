## 2026-03-02 - Modal Dialog Accessibility & Form Validation Association
**Learning:** Modal components in this React application should explicitly declare `role="dialog"`, `aria-modal="true"`, and associate titles via `aria-labelledby` and input errors via `aria-describedby` + `role="alert"` so screen readers properly announce dialog context and live validation errors.
**Action:** Always verify overlay modals in `src/components` have dialog ARIA attributes and dynamically link form input validation errors with `aria-describedby` and `aria-invalid`.
