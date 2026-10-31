import React from "react";

interface Props {
  open: boolean;
  onClick: () => void;
}

const MenuToggleButton: React.FC<Props> = ({ open, onClick }) => (
  <button
    onClick={onClick}
    aria-label={open ? "Close menu" : "Open menu"}
    aria-expanded={open}
    className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600 transition-colors"
  >
    <div className="w-5 h-5 flex flex-col justify-between">
      <div className={`h-0.5 bg-white transition-all ${open ? "rotate-45 translate-y-1.5" : ""}`}></div>
      <div className={`h-0.5 bg-white transition-all ${open ? "opacity-0" : ""}`}></div>
      <div className={`h-0.5 bg-white transition-all ${open ? "-rotate-45 -translate-y-1.5" : ""}`}></div>
    </div>
  </button>
);

export default MenuToggleButton;
