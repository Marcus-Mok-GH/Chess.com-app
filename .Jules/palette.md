## 2026-03-02 - Bot Selection Accessibility with Toggle State
**Learning:** Interactive opponent selection cards rendered as `<button>` elements require `aria-pressed` toggle state and `aria-hidden="true"` on decorative emoji avatars to convey selected options clearly to screen readers without symbol noise.
**Action:** When adding selectable option cards or buttons, always specify `aria-pressed={selected}` and hide decorative avatar/emoji nodes with `aria-hidden="true"`.
