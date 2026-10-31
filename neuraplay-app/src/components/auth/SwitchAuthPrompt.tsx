import React from "react";

interface Props {
  question: string;
  actionLabel: string;
  onClick: () => void;
}

const SwitchAuthPrompt: React.FC<Props> = ({ question, actionLabel, onClick }) => (
  <p className="text-center text-sm text-gray-400">
    {question}{" "}
    <button type="button" onClick={onClick} className="text-purple-400 hover:text-purple-300 font-semibold">
      {actionLabel}
    </button>
  </p>
);

export default SwitchAuthPrompt;
