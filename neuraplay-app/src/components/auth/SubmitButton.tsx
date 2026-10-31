import React from "react";

interface Props {
  submitting: boolean;
  label: string;
  submittingLabel: string;
}

const SubmitButton: React.FC<Props> = ({ submitting, label, submittingLabel }) => (
  <button
    type="submit"
    disabled={submitting}
    className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-purple-500/25"
  >
    {submitting ? submittingLabel : label}
  </button>
);

export default SubmitButton;
