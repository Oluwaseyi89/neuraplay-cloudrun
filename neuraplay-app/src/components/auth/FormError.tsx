import React from "react";

const FormError: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null;

  return (
    <p role="alert" className="text-sm text-red-300 bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2 whitespace-pre-line">
      {message}
    </p>
  );
};

export default FormError;
