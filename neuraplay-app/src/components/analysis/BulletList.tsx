import React from "react";

interface Props {
  items: string[];
  bulletClass: string;
  textClass?: string;
}

const BulletList: React.FC<Props> = ({ items, bulletClass, textClass = "text-gray-200" }) => (
  <ul className="space-y-1 sm:space-y-2">
    {items.map((item, index) => (
      <li key={index} className={`flex items-start gap-1 sm:gap-3 text-xs sm:text-base break-words ${textClass}`}>
        <span className={`mt-0.5 sm:mt-1 flex-shrink-0 ${bulletClass}`}>•</span>
        <span className="flex-1">{item}</span>
      </li>
    ))}
  </ul>
);

export default BulletList;
