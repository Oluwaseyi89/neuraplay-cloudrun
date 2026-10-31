import React from "react";

const PageHeading: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="text-center w-full">
    <h2 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
      {title}
    </h2>
    <p className="text-gray-300 text-base sm:text-xl max-w-3xl mx-auto leading-relaxed px-2">{subtitle}</p>
  </div>
);

export default PageHeading;
