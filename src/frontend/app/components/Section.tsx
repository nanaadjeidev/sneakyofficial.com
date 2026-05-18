import React from 'react';

type SectionProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
  imgSrc?: string;
  imgAlt?: string;
};

const Section = ({ title, children, className = '', imgSrc, imgAlt = 'Section Image' }: SectionProps) => {
  return (
    <section className={`w-full ${className}`}>
      <div className="max-w-6xl py-14 px-6 mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold mb-6 pb-3 border-b border-white/15 text-white tracking-tight">
          {title}
        </h2>
        <div className="text-slate-300 space-y-6">
          {imgSrc && (
            <img src={imgSrc} alt={imgAlt} className="w-full h-auto rounded-xl shadow-lg" />
          )}
          {children}
        </div>
      </div>
    </section>
  );
};

export default Section;
