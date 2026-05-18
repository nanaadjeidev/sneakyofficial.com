import { useState } from 'react';
import {
  Baby,
  Code2,
  BookOpen,
  GraduationCap,
  Award,
  Rocket,
  Cog,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type TimelineEvent = {
  id: number;
  year: string;
  title: string;
  location: string;
  description: string;
  image: string;
  details: string;
  Icon: LucideIcon;
};

const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: 1,
    year: '2004',
    title: 'Born',
    location: 'Plymouth, UK',
    description: 'Spawned into existence on the southwest coast of England.',
    image: '/plymouth.jpg',
    details: 'Born in Plymouth, UK. Where the journey began.',
    Icon: Baby,
  },
  {
    id: 2,
    year: '2015',
    title: 'Started Programming',
    location: 'Plymouth College',
    description: 'Broke out of Scratch and started real coding with Python.',
    image: '/plymouth college.jpg',
    details:
      'Started using Python in Computer Science at Plymouth College, where I quickly became one of the top-performing students.',
    Icon: Code2,
  },
  {
    id: 3,
    year: '2020',
    title: 'Sixth Form at DHSG',
    location: 'Devonport High School for Girls',
    description: "Enrolled in sixth form at DHSG (sixth form is mixed).",
    image: '/dhsg.jpg',
    details:
      'Took Computer Science (A*), Maths (B), and Physics (B). Also wrote an EPQ on whether quantum computers will replace classical ones.',
    Icon: BookOpen,
  },
  {
    id: 4,
    year: '2022',
    title: 'University Begins',
    location: 'University of Portsmouth',
    description: 'Started studying Software Engineering at university.',
    image: '/portsmouth.jpg',
    details:
      "In my first year, I earned the top project mark for 'Pet-Ascension'.",
    Icon: GraduationCap,
  },
  {
    id: 5,
    year: '2023',
    title: 'Another First-Class Project',
    location: 'University of Portsmouth',
    description: "Built You're Fat Stop That, earned a first-class grade.",
    image: '/programming.jpg',
    details:
      'Developed a web app that was cheeky in title but solid in execution. Earned another top mark.',
    Icon: Award,
  },
  {
    id: 6,
    year: '2024',
    title: 'Internship & OCE-4 Mans',
    location: 'MarineAI + Online',
    description: 'Started my placement year + built a Rocket League platform.',
    image: '/Marine AI.jpg',
    details:
      'Began an internship at MarineAI working on real-world software systems, while also launching OCE-4 Mans, a competitive matchmaking platform for Rocket League players.',
    Icon: Rocket,
  },
  {
    id: 7,
    year: '2025',
    title: 'Placement Complete',
    location: 'Marine AI',
    description: 'Finished my year-long placement and returned to university.',
    image: '/Marine AI title.jpg',
    details:
      'Wrapped up my placement year at Marine AI, having shipped production C++ and Python code on autonomous maritime systems deployed with Docker and Kubernetes. Returned to Portsmouth for final year.',
    Icon: Cog,
  },
  {
    id: 8,
    year: '2026',
    title: 'Final Year and FYP',
    location: 'University of Portsmouth',
    description: 'Building Esports Uni Hub as my final-year project.',
    image: '/portsmouth.jpg',
    details:
      'Completing my BSc Software Engineering degree. My final-year project is esportsunihub.com, a full-stack platform connecting UK university esports communities with teams, leagues, and structured competition.',
    Icon: GraduationCap,
  },
];

const LifeTimeline = () => {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  return (
    <section className="text-white py-12 md:py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 md:mb-20 tracking-tight">
          My <span className="text-blue-400">Journey</span>
        </h2>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-8 md:left-1/2 md:-translate-x-px w-px bg-gradient-to-b from-blue-400 via-purple-500 to-pink-500 h-full" />

          <div className="space-y-10 md:space-y-16">
            {TIMELINE_EVENTS.map((event, index) => {
              const { Icon } = event;
              return (
                <div key={event.id} className="relative">
                  {/* Dot */}
                  <div className="absolute left-8 md:left-1/2 -translate-x-1/2 w-5 h-5 bg-slate-900 rounded-full border-2 border-blue-400 z-10 shadow-lg ring-4 ring-blue-400/20" />

                  <div
                    className={`md:flex md:items-center ${
                      index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                    } md:gap-8`}
                  >
                    {/* Card */}
                    <div
                      className={`w-full md:w-1/2 pl-16 md:pl-0 ${
                        index % 2 === 0 ? 'md:pr-10 md:text-right' : 'md:pl-10'
                      }`}
                    >
                      <button
                        className={`w-full text-left glass-card p-5 md:p-6 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-blue-400/50 ${
                          selectedEvent?.id === event.id
                            ? 'ring-2 ring-blue-400 scale-[1.02]'
                            : ''
                        }`}
                        onClick={() =>
                          setSelectedEvent(
                            selectedEvent?.id === event.id ? null : event
                          )
                        }
                      >
                        <div
                          className={`flex items-center gap-3 mb-3 ${
                            index % 2 === 0 ? 'md:justify-end' : ''
                          }`}
                        >
                          <div className="p-1.5 rounded-lg bg-blue-400/20 text-blue-400">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-blue-400 font-bold text-sm">
                            {event.year}
                          </span>
                        </div>
                        <h3 className="text-base md:text-lg font-bold mb-1.5">
                          {event.title}
                        </h3>
                        <p className="text-slate-400 text-xs mb-1.5">
                          {event.location}
                        </p>
                        <p className="text-slate-300 text-sm">{event.description}</p>
                        <div className="mt-3 text-blue-400 text-xs font-medium">
                          Click for details
                        </div>
                      </button>
                    </div>

                    {/* Image */}
                    <div className="hidden md:block md:w-1/2">
                      <div className="relative rounded-xl overflow-hidden">
                        <img
                          src={event.image}
                          alt={event.title}
                          className="w-full h-44 object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal */}
        {selectedEvent && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="glass-card p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3 flex-1 pr-4">
                  <div className="p-2 rounded-lg bg-blue-400/20 text-blue-400 flex-shrink-0">
                    <selectedEvent.Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-bold truncate">
                      {selectedEvent.title}
                    </h3>
                    <p className="text-blue-400 text-sm">
                      {selectedEvent.year} · {selectedEvent.location}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <img
                src={selectedEvent.image}
                alt={selectedEvent.title}
                className="w-full h-44 md:h-56 object-cover rounded-xl mb-5"
              />

              <p className="text-slate-300 leading-relaxed text-sm md:text-base mb-4">
                {selectedEvent.details}
              </p>

              <div className="pt-4 border-t border-white/10">
                <p className="text-xs text-slate-400">{selectedEvent.description}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default LifeTimeline;
