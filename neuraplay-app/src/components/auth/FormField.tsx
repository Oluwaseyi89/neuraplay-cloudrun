import React from "react";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
}

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none text-white placeholder-gray-500 transition-colors";

const FormField: React.FC<Props> = ({ id, label, hint, ...inputProps }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
    <input id={id} className={inputClass} {...inputProps} />
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

export default FormField;
