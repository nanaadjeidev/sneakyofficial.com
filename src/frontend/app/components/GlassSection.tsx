import React from 'react';

interface GlassSectionProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  imgSrc?: string;
  imgAlt?: string;
}

const GlassSection: React.FC<GlassSectionProps> = ({
  children,
  className = '',
  title,
  imgSrc,
  imgAlt,
}) => {
  return (
    <section
      className={`relative w-full py-16 px-4 sm:px-6 lg:px-8 glass border-y border-white/12 ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/4 via-transparent to-white/4 pointer-events-none rounded-none" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row items-start gap-12">
          <div className="flex-1 order-2 lg:order-1">
            {title && (
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-8 tracking-tight">
                {title}
              </h2>
            )}
            <div className="text-white/85 space-y-5 text-base leading-relaxed">
              {children}
            </div>
          </div>

          {imgSrc && (
            <div className="flex-shrink-0 order-1 lg:order-2">
              <div className="p-1 rounded-full bg-gradient-to-br from-white/20 to-white/5">
                <img
                  src={imgSrc}
                  alt={imgAlt ?? ''}
                  className="w-48 h-48 lg:w-64 lg:h-64 rounded-full object-cover shadow-2xl"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default GlassSection;
