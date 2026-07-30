import { colors } from "./theme";

export const TOAST_CSS = `
@keyframes commiq-toast-in {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .commiq-toast { animation: none !important; }
}
`;

export const PANEL_CSS = `
.commiq-devtools-scroll::-webkit-scrollbar,
.commiq-devtools-scroll *::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.commiq-devtools-scroll::-webkit-scrollbar-track,
.commiq-devtools-scroll *::-webkit-scrollbar-track {
  background: transparent;
}
.commiq-devtools-scroll::-webkit-scrollbar-thumb,
.commiq-devtools-scroll *::-webkit-scrollbar-thumb {
  background: ${colors.scrollThumb};
  border-radius: 3px;
}
.commiq-devtools-scroll::-webkit-scrollbar-thumb:hover,
.commiq-devtools-scroll *::-webkit-scrollbar-thumb:hover {
  background: ${colors.scrollThumbHover};
}
.commiq-resize-grip {
  background-color: ${colors.textMuted};
  opacity: 0.5;
  transition: opacity 0.15s, background-color 0.15s;
}
.commiq-resize-handle {
  border-top: 1px solid transparent;
  transition: border-color 0.15s;
}
.commiq-resize-handle:hover .commiq-resize-grip,
.commiq-resize-handle:focus-visible .commiq-resize-grip,
.commiq-resize-handle.dragging .commiq-resize-grip {
  opacity: 1;
  background-color: ${colors.accent};
}
.commiq-resize-handle:hover,
.commiq-resize-handle:focus-visible,
.commiq-resize-handle.dragging {
  border-color: ${colors.accent};
}
.commiq-resize-handle:focus-visible {
  outline: 2px solid ${colors.accentLight};
  outline-offset: 0;
}
.commiq-devtools-tabs::-webkit-scrollbar {
  display: none;
}

.commiq-row,
.commiq-pin,
.commiq-link,
.commiq-icon-btn,
.commiq-label-btn,
.commiq-tab,
.commiq-error-badge,
.commiq-error-pill,
.commiq-select,
.commiq-input,
.commiq-cmd-card,
.commiq-dispatch-btn,
.commiq-close-btn,
.commiq-toast,
.commiq-toast-close,
.commiq-imported,
.commiq-chain-header,
.commiq-check,
.commiq-expand,
.commiq-badge,
.commiq-json-toggle {
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, filter 0.15s, opacity 0.15s !important;
}

.commiq-row:hover { background-color: ${colors.bgHover} !important; }
.commiq-row.selected:hover { background-color: ${colors.bgSelected} !important; }
.commiq-pin:hover { color: ${colors.accentLight} !important; }
.commiq-link:hover, .commiq-link:focus-visible { text-decoration: underline !important; }
.commiq-icon-btn:hover { background-color: ${colors.bgHover} !important; color: ${colors.text} !important; }
.commiq-label-btn:hover { background-color: ${colors.bgActive} !important; color: ${colors.text} !important; }
.commiq-tab:hover:not(.active) { color: ${colors.tabHover} !important; background-color: ${colors.bgHover} !important; }
.commiq-tab:focus-visible, .commiq-icon-btn:focus-visible, .commiq-label-btn:focus-visible {
  outline: 2px solid ${colors.accentLight};
  outline-offset: 1px;
}
.commiq-error-badge:hover { background-color: rgba(248, 113, 113, 0.2) !important; }
.commiq-error-pill:hover { background-color: rgba(248, 113, 113, 0.2) !important; }
.commiq-select:hover, .commiq-input:hover { border-color: ${colors.textMuted} !important; }
.commiq-input:focus, .commiq-select:focus { border-color: ${colors.accent} !important; }
.commiq-cmd-card:hover { background-color: ${colors.bgHover} !important; }
.commiq-dispatch-btn:hover:not(:disabled) { background-color: ${colors.accentHover} !important; }
.commiq-close-btn:hover { background-color: ${colors.bgHover} !important; color: ${colors.text} !important; }
.commiq-toast:hover { border-color: ${colors.error} !important; background-color: ${colors.bgHover} !important; }
.commiq-toast-close:hover { color: ${colors.text} !important; }
.commiq-imported:hover { background-color: rgba(251, 191, 36, 0.2) !important; }
.commiq-chain-header:hover { background-color: ${colors.bgHover} !important; }
.commiq-check:hover { color: ${colors.text} !important; }
.commiq-expand:hover { color: ${colors.text} !important; }
.commiq-badge:hover { filter: brightness(1.2); }
.commiq-json-toggle:hover { color: ${colors.text} !important; }
${TOAST_CSS}
`;
